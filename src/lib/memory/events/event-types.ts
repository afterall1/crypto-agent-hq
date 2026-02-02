/**
 * CryptoAgentHQ - Memory Event Types
 * @module lib/memory/events/event-types
 * 
 * Defines all memory-related events for event sourcing pattern.
 * Konsey Değerlendirmesi: Erik Johansson (Event Sourcing Architect) ⭐⭐⭐⭐⭐
 */

// ============================================================================
// EVENT BASE TYPES
// ============================================================================

/**
 * All possible memory event types.
 */
export type MemoryEventType =
    // Entry operations
    | 'entry.created'
    | 'entry.updated'
    | 'entry.deleted'
    | 'entry.promoted'
    | 'entry.demoted'
    // Message operations
    | 'message.added'
    | 'message.updated'
    | 'message.deleted'
    // Tier operations
    | 'tier.cleared'
    | 'tier.consolidated'
    | 'tier.synced'
    // Snapshot operations
    | 'snapshot.created'
    | 'snapshot.restored'
    | 'snapshot.deleted'
    // Sync operations
    | 'sync.started'
    | 'sync.completed'
    | 'sync.failed'
    | 'sync.conflict_detected'
    | 'sync.conflict_resolved'
    // Reload operations
    | 'reload.started'
    | 'reload.completed'
    | 'reload.failed'
    | 'reload.rollback'
    // System operations
    | 'system.initialized'
    | 'system.shutdown';

/**
 * Tier identifiers for events.
 */
export type EventTier = 'immediate' | 'session' | 'summarized' | 'archival' | 'all';

// ============================================================================
// EVENT PAYLOAD TYPES
// ============================================================================

/**
 * Payload for entry-related events.
 */
export interface EntryEventPayload {
    entryId: string;
    tier: EventTier;
    entryType?: string;
    importance?: number;
    previousTier?: EventTier;
    content?: string;
    contentHash?: string;
}

/**
 * Payload for message events.
 */
export interface MessageEventPayload {
    messageId: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    turnNumber: number;
    contentPreview?: string;
    contentLength: number;
}

/**
 * Payload for tier events.
 */
export interface TierEventPayload {
    tier: EventTier;
    entriesAffected: number;
    reason?: string;
}

/**
 * Payload for snapshot events.
 */
export interface SnapshotEventPayload {
    snapshotId: string;
    messageCount: number;
    entityCount: number;
    checksum?: string;
    archivePath?: string;
}

/**
 * Payload for sync events.
 */
export interface SyncEventPayload {
    syncId: string;
    mode: 'full' | 'incremental' | 'tier-specific';
    tiers?: EventTier[];
    entriesSynced?: number;
    conflictsDetected?: number;
    conflictsResolved?: number;
    duration?: number;
    error?: string;
}

/**
 * Payload for reload events.
 */
export interface ReloadEventPayload {
    reloadId: string;
    mode: 'full' | 'selective' | 'rollback' | 'merge';
    sourceSnapshotId?: string;
    tiers?: EventTier[];
    entriesReloaded?: number;
    entriesDiscarded?: number;
    duration?: number;
    error?: string;
}

/**
 * Payload for conflict events.
 */
export interface ConflictEventPayload {
    conflictId: string;
    entryId: string;
    tier: EventTier;
    resolution?: 'last-write-wins' | 'first-write-wins' | 'merge' | 'manual' | 'prefer-local' | 'prefer-remote';
    localVersion?: string;
    remoteVersion?: string;
}

/**
 * Payload for system events.
 */
export interface SystemEventPayload {
    conversationId: string;
    version?: string;
    reason?: string;
}

/**
 * Union type for all payloads.
 */
export type MemoryEventPayload =
    | EntryEventPayload
    | MessageEventPayload
    | TierEventPayload
    | SnapshotEventPayload
    | SyncEventPayload
    | ReloadEventPayload
    | ConflictEventPayload
    | SystemEventPayload;

// ============================================================================
// MEMORY EVENT
// ============================================================================

/**
 * A single memory event.
 */
export interface MemoryEvent<T extends MemoryEventPayload = MemoryEventPayload> {
    /** Unique event ID */
    id: string;
    /** Event type */
    type: MemoryEventType;
    /** Event payload */
    payload: T;
    /** Conversation ID */
    conversationId: string;
    /** Session ID */
    sessionId: string;
    /** Event timestamp */
    timestamp: Date;
    /** Sequence number for ordering */
    sequence: number;
    /** Optional correlation ID for related events */
    correlationId?: string;
    /** Optional causation ID (event that caused this event) */
    causationId?: string;
}

// ============================================================================
// EVENT FILTER & QUERY
// ============================================================================

/**
 * Filter options for querying events.
 */
export interface EventFilter {
    types?: MemoryEventType[];
    tiers?: EventTier[];
    startTime?: Date;
    endTime?: Date;
    startSequence?: number;
    endSequence?: number;
    correlationId?: string;
    limit?: number;
}

/**
 * Event stream cursor for pagination.
 */
export interface EventCursor {
    lastSequence: number;
    lastTimestamp: Date;
    hasMore: boolean;
}

// ============================================================================
// EVENT FACTORY
// ============================================================================

let sequenceCounter = 0;

/**
 * Create a new memory event.
 */
export function createMemoryEvent<T extends MemoryEventPayload>(
    type: MemoryEventType,
    payload: T,
    context: {
        conversationId: string;
        sessionId: string;
        correlationId?: string;
        causationId?: string;
    }
): MemoryEvent<T> {
    sequenceCounter++;

    return {
        id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        payload,
        conversationId: context.conversationId,
        sessionId: context.sessionId,
        timestamp: new Date(),
        sequence: sequenceCounter,
        correlationId: context.correlationId,
        causationId: context.causationId,
    };
}

/**
 * Reset sequence counter (for testing).
 */
export function resetSequenceCounter(): void {
    sequenceCounter = 0;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isEntryEvent(event: MemoryEvent): event is MemoryEvent<EntryEventPayload> {
    return event.type.startsWith('entry.');
}

export function isMessageEvent(event: MemoryEvent): event is MemoryEvent<MessageEventPayload> {
    return event.type.startsWith('message.');
}

export function isSyncEvent(event: MemoryEvent): event is MemoryEvent<SyncEventPayload> {
    return event.type.startsWith('sync.');
}

export function isReloadEvent(event: MemoryEvent): event is MemoryEvent<ReloadEventPayload> {
    return event.type.startsWith('reload.');
}

export function isSnapshotEvent(event: MemoryEvent): event is MemoryEvent<SnapshotEventPayload> {
    return event.type.startsWith('snapshot.');
}
