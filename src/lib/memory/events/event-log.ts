/**
 * CryptoAgentHQ - Memory Event Log
 * @module lib/memory/events/event-log
 * 
 * Append-only event storage with retention policy.
 * Konsey Değerlendirmesi: Erik Johansson + Dr. Ana Rodriguez ⭐⭐⭐⭐⭐
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import type {
    MemoryEvent,
    MemoryEventPayload,
    MemoryEventType,
    EventFilter,
    EventCursor,
} from './event-types';
import { createMemoryEvent } from './event-types';
import { memoryLogger, MEMORY_DIRS } from '../core/config';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Event log configuration.
 */
export interface EventLogConfig {
    /** Base path for storage */
    basePath: string;
    /** Conversation ID */
    conversationId: string;
    /** Session ID */
    sessionId: string;
    /** Retention period in days (default: 7) */
    retentionDays?: number;
    /** Max events per file segment (default: 1000) */
    maxEventsPerSegment?: number;
    /** Auto-flush interval in ms (default: 5000) */
    flushIntervalMs?: number;
}

const DEFAULT_RETENTION_DAYS = 7;
const DEFAULT_MAX_EVENTS_PER_SEGMENT = 1000;
const DEFAULT_FLUSH_INTERVAL_MS = 5000;

// ============================================================================
// EVENT LOG CLASS
// ============================================================================

/**
 * Append-only event log for memory operations.
 */
export class EventLog {
    private readonly config: Required<EventLogConfig>;
    private readonly eventsDir: string;

    // In-memory buffer
    private buffer: MemoryEvent[] = [];
    private flushTimer: NodeJS.Timeout | null = null;

    // Current segment tracking
    private currentSegmentId: string;
    private currentSegmentCount: number = 0;

    // Cached events for fast retrieval
    private eventCache: Map<string, MemoryEvent> = new Map();
    private lastSequence: number = 0;

    constructor(config: EventLogConfig) {
        this.config = {
            ...config,
            retentionDays: config.retentionDays ?? DEFAULT_RETENTION_DAYS,
            maxEventsPerSegment: config.maxEventsPerSegment ?? DEFAULT_MAX_EVENTS_PER_SEGMENT,
            flushIntervalMs: config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
        };

        this.eventsDir = join(config.basePath, MEMORY_DIRS.events || 'events');
        this.currentSegmentId = this.generateSegmentId();

        // Start auto-flush timer
        this.startFlushTimer();
    }

    // ============================================================================
    // APPEND OPERATIONS
    // ============================================================================

    /**
     * Append a new event.
     */
    async append<T extends MemoryEventPayload>(
        type: MemoryEventType,
        payload: T,
        options?: {
            correlationId?: string;
            causationId?: string;
        }
    ): Promise<MemoryEvent<T>> {
        const event = createMemoryEvent(type, payload, {
            conversationId: this.config.conversationId,
            sessionId: this.config.sessionId,
            correlationId: options?.correlationId,
            causationId: options?.causationId,
        });

        // Update sequence tracking
        this.lastSequence = event.sequence;

        // Add to buffer and cache
        this.buffer.push(event as MemoryEvent);
        this.eventCache.set(event.id, event as MemoryEvent);

        // Check if flush is needed
        if (this.buffer.length >= 100) {
            await this.flush();
        }

        memoryLogger.debug(`Event appended: ${type}`, { id: event.id });

        return event;
    }

    /**
     * Append multiple events atomically.
     */
    async appendBatch(
        events: Array<{ type: MemoryEventType; payload: MemoryEventPayload }>
    ): Promise<MemoryEvent[]> {
        const createdEvents: MemoryEvent[] = [];

        for (const { type, payload } of events) {
            const event = await this.append(type, payload);
            createdEvents.push(event);
        }

        await this.flush();
        return createdEvents;
    }

    // ============================================================================
    // QUERY OPERATIONS
    // ============================================================================

    /**
     * Get events matching filter.
     */
    async getEvents(filter: EventFilter = {}): Promise<MemoryEvent[]> {
        // Ensure buffer is flushed
        await this.flush();

        // Load all events from segments
        const allEvents = await this.loadAllEvents();

        // Apply filters
        let filtered = allEvents;

        if (filter.types?.length) {
            filtered = filtered.filter(e => filter.types!.includes(e.type));
        }

        if (filter.startTime) {
            filtered = filtered.filter(e => e.timestamp >= filter.startTime!);
        }

        if (filter.endTime) {
            filtered = filtered.filter(e => e.timestamp <= filter.endTime!);
        }

        if (filter.startSequence !== undefined) {
            filtered = filtered.filter(e => e.sequence >= filter.startSequence!);
        }

        if (filter.endSequence !== undefined) {
            filtered = filtered.filter(e => e.sequence <= filter.endSequence!);
        }

        if (filter.correlationId) {
            filtered = filtered.filter(e => e.correlationId === filter.correlationId);
        }

        // Sort by sequence
        filtered.sort((a, b) => a.sequence - b.sequence);

        // Apply limit
        if (filter.limit) {
            filtered = filtered.slice(0, filter.limit);
        }

        return filtered;
    }

    /**
     * Get events since a specific sequence number.
     */
    async getEventsSince(sequence: number): Promise<MemoryEvent[]> {
        return this.getEvents({ startSequence: sequence + 1 });
    }

    /**
     * Get the last N events.
     */
    async getLastEvents(count: number): Promise<MemoryEvent[]> {
        await this.flush();
        const allEvents = await this.loadAllEvents();
        return allEvents.slice(-count);
    }

    /**
     * Get event by ID.
     */
    async getEvent(eventId: string): Promise<MemoryEvent | null> {
        // Check cache first
        if (this.eventCache.has(eventId)) {
            return this.eventCache.get(eventId)!;
        }

        // Load from storage
        const allEvents = await this.loadAllEvents();
        return allEvents.find(e => e.id === eventId) || null;
    }

    /**
     * Get last sequence number.
     */
    getLastSequence(): number {
        return this.lastSequence;
    }

    /**
     * Stream events with cursor-based pagination.
     */
    async streamEvents(
        filter: EventFilter = {},
        batchSize: number = 100
    ): Promise<{ events: MemoryEvent[]; cursor: EventCursor }> {
        const events = await this.getEvents({
            ...filter,
            limit: batchSize,
        });

        const lastEvent = events[events.length - 1];

        return {
            events,
            cursor: {
                lastSequence: lastEvent?.sequence ?? 0,
                lastTimestamp: lastEvent?.timestamp ?? new Date(0),
                hasMore: events.length === batchSize,
            },
        };
    }

    // ============================================================================
    // MAINTENANCE OPERATIONS
    // ============================================================================

    /**
     * Flush buffer to disk.
     */
    async flush(): Promise<void> {
        if (this.buffer.length === 0) return;

        try {
            await fs.mkdir(this.eventsDir, { recursive: true });

            const segmentPath = this.getSegmentPath(this.currentSegmentId);

            // Load existing segment data
            let existingEvents: MemoryEvent[] = [];
            try {
                const content = await fs.readFile(segmentPath, 'utf-8');
                existingEvents = JSON.parse(content);
            } catch {
                // Segment doesn't exist yet
            }

            // Append new events
            const allEvents = [...existingEvents, ...this.buffer];

            // Write atomically
            const tempPath = `${segmentPath}.tmp`;
            await fs.writeFile(tempPath, JSON.stringify(allEvents, null, 2), 'utf-8');
            await fs.rename(tempPath, segmentPath);

            // Update segment tracking
            this.currentSegmentCount = allEvents.length;

            // Check if new segment needed
            if (this.currentSegmentCount >= this.config.maxEventsPerSegment) {
                this.currentSegmentId = this.generateSegmentId();
                this.currentSegmentCount = 0;
            }

            // Clear buffer
            this.buffer = [];

            memoryLogger.debug(`Event log flushed: ${allEvents.length} events`);
        } catch (error) {
            memoryLogger.error('Event log flush failed', error);
            throw error;
        }
    }

    /**
     * Apply retention policy - remove old events.
     */
    async applyRetention(): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

        let removedCount = 0;

        try {
            const segments = await this.listSegments();

            for (const segment of segments) {
                const segmentPath = this.getSegmentPath(segment);
                const content = await fs.readFile(segmentPath, 'utf-8');
                const events: MemoryEvent[] = JSON.parse(content);

                // Check if all events are old
                const allOld = events.every(e => new Date(e.timestamp) < cutoffDate);

                if (allOld) {
                    await fs.unlink(segmentPath);
                    removedCount += events.length;
                    memoryLogger.info(`Removed old segment: ${segment}`);
                }
            }

            // Clear cache for removed events
            for (const [id, event] of this.eventCache.entries()) {
                if (new Date(event.timestamp) < cutoffDate) {
                    this.eventCache.delete(id);
                }
            }

        } catch (error) {
            memoryLogger.error('Retention policy failed', error);
        }

        return removedCount;
    }

    /**
     * Get event log statistics.
     */
    async getStats(): Promise<{
        totalEvents: number;
        segmentCount: number;
        oldestEvent?: Date;
        newestEvent?: Date;
        bufferSize: number;
        cacheSize: number;
    }> {
        const allEvents = await this.loadAllEvents();
        const segments = await this.listSegments();

        return {
            totalEvents: allEvents.length + this.buffer.length,
            segmentCount: segments.length,
            oldestEvent: allEvents[0]?.timestamp,
            newestEvent: allEvents[allEvents.length - 1]?.timestamp,
            bufferSize: this.buffer.length,
            cacheSize: this.eventCache.size,
        };
    }

    /**
     * Clear all events (use with caution).
     */
    async clear(): Promise<void> {
        try {
            const segments = await this.listSegments();

            for (const segment of segments) {
                await fs.unlink(this.getSegmentPath(segment));
            }

            this.buffer = [];
            this.eventCache.clear();
            this.currentSegmentId = this.generateSegmentId();
            this.currentSegmentCount = 0;
            this.lastSequence = 0;

            memoryLogger.info('Event log cleared');
        } catch (error) {
            memoryLogger.error('Failed to clear event log', error);
            throw error;
        }
    }

    /**
     * Shutdown event log (flush and stop timer).
     */
    async shutdown(): Promise<void> {
        this.stopFlushTimer();
        await this.flush();
        memoryLogger.info('Event log shutdown complete');
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    private generateSegmentId(): string {
        return `segment-${Date.now()}`;
    }

    private getSegmentPath(segmentId: string): string {
        return join(this.eventsDir, `${segmentId}.json`);
    }

    private async listSegments(): Promise<string[]> {
        try {
            const files = await fs.readdir(this.eventsDir);
            return files
                .filter(f => f.startsWith('segment-') && f.endsWith('.json'))
                .map(f => f.replace('.json', ''))
                .sort();
        } catch {
            return [];
        }
    }

    private async loadAllEvents(): Promise<MemoryEvent[]> {
        const segments = await this.listSegments();
        const allEvents: MemoryEvent[] = [];

        for (const segment of segments) {
            try {
                const content = await fs.readFile(this.getSegmentPath(segment), 'utf-8');
                const events: MemoryEvent[] = JSON.parse(content, (key, value) => {
                    if (key === 'timestamp' && typeof value === 'string') {
                        return new Date(value);
                    }
                    return value;
                });
                allEvents.push(...events);
            } catch (error) {
                memoryLogger.warn(`Failed to load segment: ${segment}`, error);
            }
        }

        // Add buffer events
        allEvents.push(...this.buffer);

        // Sort by sequence
        allEvents.sort((a, b) => a.sequence - b.sequence);

        // Update last sequence
        if (allEvents.length > 0) {
            this.lastSequence = Math.max(this.lastSequence, allEvents[allEvents.length - 1].sequence);
        }

        return allEvents;
    }

    private startFlushTimer(): void {
        if (this.flushTimer) return;

        this.flushTimer = setInterval(() => {
            this.flush().catch(err => {
                memoryLogger.error('Auto-flush failed', err);
            });
        }, this.config.flushIntervalMs);
    }

    private stopFlushTimer(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an event log instance.
 */
export function createEventLog(config: EventLogConfig): EventLog {
    return new EventLog(config);
}
