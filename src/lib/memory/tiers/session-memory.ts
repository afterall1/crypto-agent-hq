/**
 * CryptoAgentHQ - Session Memory Tier
 * @module lib/memory/tiers/session-memory
 * 
 * Working memory for current session.
 * Konsey Değerlendirmesi: MemGPT Specialist + Persistence Engineer ⭐⭐⭐⭐⭐
 */

import type {
    MemoryEntry,
    MemoryEntryType,
    MemoryMetadata,
    RetrieveOptions,
    ConversationMessage,
    ToolCallRecord,
} from '../core/types';
import { TIER_CONFIG, IMPORTANCE_WEIGHTS, memoryLogger } from '../core/config';

// ============================================================================
// SESSION MEMORY CLASS
// ============================================================================

/**
 * Session memory tier - warm working memory.
 * Stores the full conversation history for the current session.
 * 
 * Characteristics:
 * - Persists for session duration
 * - Larger capacity than immediate
 * - Supports search and filtering
 * - Tracks conversation flow
 */
export class SessionMemory {
    private entries: Map<string, MemoryEntry> = new Map();
    private messages: ConversationMessage[] = [];
    private toolCalls: ToolCallRecord[] = [];
    private turnCounter: number = 0;

    private readonly sessionId: string;
    private readonly conversationId: string;
    private readonly maxEntries: number;
    private readonly startTime: Date;

    constructor(config: {
        sessionId: string;
        conversationId: string;
        maxEntries?: number;
    }) {
        this.sessionId = config.sessionId;
        this.conversationId = config.conversationId;
        this.maxEntries = config.maxEntries ?? TIER_CONFIG.session.maxEntries;
        this.startTime = new Date();
    }

    // ============================================================================
    // MESSAGE OPERATIONS
    // ============================================================================

    /**
     * Add a conversation message.
     */
    addMessage(message: Omit<ConversationMessage, 'turnNumber'>): ConversationMessage {
        this.turnCounter++;

        const fullMessage: ConversationMessage = {
            ...message,
            turnNumber: this.turnCounter,
        };

        this.messages.push(fullMessage);

        // Also create a memory entry
        this.add({
            id: message.id,
            tier: 'session',
            content: message.content,
            type: 'message',
            metadata: {
                conversationId: this.conversationId,
                sessionId: this.sessionId,
                turnNumber: this.turnCounter,
                source: message.role === 'user' ? 'user' : message.role === 'assistant' ? 'assistant' : 'system',
                tags: [],
                entities: [],
                references: [],
            },
            createdAt: message.timestamp,
            accessedAt: message.timestamp,
            importance: IMPORTANCE_WEIGHTS.message,
        });

        memoryLogger.debug(`Added message to session: ${message.id}`, {
            role: message.role,
            turn: this.turnCounter,
        });

        return fullMessage;
    }

    /**
     * Get all messages.
     */
    getMessages(): ConversationMessage[] {
        return [...this.messages];
    }

    /**
     * Get messages for a turn range.
     */
    getMessagesInRange(startTurn: number, endTurn?: number): ConversationMessage[] {
        return this.messages.filter(m => {
            if (m.turnNumber < startTurn) return false;
            if (endTurn !== undefined && m.turnNumber > endTurn) return false;
            return true;
        });
    }

    /**
     * Get the last N messages.
     */
    getLastMessages(count: number): ConversationMessage[] {
        return this.messages.slice(-count);
    }

    /**
     * Get message count.
     */
    getMessageCount(): number {
        return this.messages.length;
    }

    // ============================================================================
    // TOOL CALL OPERATIONS
    // ============================================================================

    /**
     * Record a tool call.
     */
    addToolCall(toolCall: ToolCallRecord): void {
        this.toolCalls.push(toolCall);

        // Create memory entry
        this.add({
            id: toolCall.id,
            tier: 'session',
            content: JSON.stringify({
                name: toolCall.name,
                arguments: toolCall.arguments,
                success: toolCall.success,
            }),
            type: toolCall.success ? 'tool_result' : 'error',
            metadata: {
                conversationId: this.conversationId,
                sessionId: this.sessionId,
                turnNumber: this.turnCounter,
                source: 'tool',
                tags: [toolCall.name],
                entities: [],
                references: [],
            },
            createdAt: new Date(),
            accessedAt: new Date(),
            importance: toolCall.success
                ? IMPORTANCE_WEIGHTS.tool_result
                : IMPORTANCE_WEIGHTS.error,
        });
    }

    /**
     * Get all tool calls.
     */
    getToolCalls(): ToolCallRecord[] {
        return [...this.toolCalls];
    }

    /**
     * Get tool calls by name.
     */
    getToolCallsByName(name: string): ToolCallRecord[] {
        return this.toolCalls.filter(tc => tc.name === name);
    }

    // ============================================================================
    // ENTRY OPERATIONS
    // ============================================================================

    /**
     * Add a memory entry.
     */
    add(entry: MemoryEntry): void {
        // Ensure capacity
        if (this.entries.size >= this.maxEntries) {
            this.evictOldest();
        }

        this.entries.set(entry.id, entry);
    }

    /**
     * Get an entry by ID.
     */
    get(id: string): MemoryEntry | undefined {
        const entry = this.entries.get(id);
        if (entry) {
            entry.accessedAt = new Date();
        }
        return entry;
    }

    /**
     * Get all entries.
     */
    getAll(): MemoryEntry[] {
        return Array.from(this.entries.values());
    }

    /**
     * Retrieve entries with options.
     */
    retrieve(options: RetrieveOptions = {}): MemoryEntry[] {
        let results = this.getAll();

        // Apply filters
        if (options.type) {
            const types = Array.isArray(options.type) ? options.type : [options.type];
            results = results.filter(e => types.includes(e.type));
        }

        if (options.minImportance !== undefined) {
            results = results.filter(e => e.importance >= options.minImportance!);
        }

        if (options.dateRange?.start) {
            results = results.filter(e => e.createdAt >= options.dateRange!.start!);
        }

        if (options.dateRange?.end) {
            results = results.filter(e => e.createdAt <= options.dateRange!.end!);
        }

        // Sort by importance then recency
        results.sort((a, b) => {
            const importanceDiff = b.importance - a.importance;
            if (Math.abs(importanceDiff) > 0.1) return importanceDiff;
            return b.createdAt.getTime() - a.createdAt.getTime();
        });

        // Apply limit
        if (options.limit) {
            results = results.slice(0, options.limit);
        }

        return results;
    }

    /**
     * Search entries by content.
     */
    search(query: string, limit: number = 10): MemoryEntry[] {
        const queryLower = query.toLowerCase();
        const terms = queryLower.split(/\s+/).filter(t => t.length > 2);

        const scored = this.getAll().map(entry => {
            const contentLower = entry.content.toLowerCase();
            let score = 0;

            terms.forEach(term => {
                if (contentLower.includes(term)) {
                    score += 1;
                }
            });

            // Boost for exact match
            if (contentLower.includes(queryLower)) {
                score += 2;
            }

            return { entry, score };
        });

        return scored
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(s => s.entry);
    }

    /**
     * Remove an entry.
     */
    remove(id: string): boolean {
        return this.entries.delete(id);
    }

    /**
     * Clear session memory.
     */
    clear(): void {
        this.entries.clear();
        this.messages = [];
        this.toolCalls = [];
        this.turnCounter = 0;
        memoryLogger.info('Session memory cleared');
    }

    // ============================================================================
    // SESSION INFO
    // ============================================================================

    /**
     * Get session metadata.
     */
    getSessionInfo(): {
        sessionId: string;
        conversationId: string;
        startTime: Date;
        duration: number;
        messageCount: number;
        entryCount: number;
        currentTurn: number;
    } {
        return {
            sessionId: this.sessionId,
            conversationId: this.conversationId,
            startTime: this.startTime,
            duration: Date.now() - this.startTime.getTime(),
            messageCount: this.messages.length,
            entryCount: this.entries.size,
            currentTurn: this.turnCounter,
        };
    }

    /**
     * Get current turn number.
     */
    getCurrentTurn(): number {
        return this.turnCounter;
    }

    /**
     * Export session data for persistence.
     */
    export(): {
        messages: ConversationMessage[];
        toolCalls: ToolCallRecord[];
        entries: MemoryEntry[];
        metadata: {
            sessionId: string;
            conversationId: string;
            startTime: Date;
            duration: number;
            messageCount: number;
            entryCount: number;
            currentTurn: number;
        };
    } {
        return {
            messages: this.getMessages(),
            toolCalls: this.getToolCalls(),
            entries: this.getAll(),
            metadata: this.getSessionInfo(),
        };
    }

    /**
     * Import session data.
     */
    import(data: {
        messages?: ConversationMessage[];
        toolCalls?: ToolCallRecord[];
        entries?: MemoryEntry[];
    }): void {
        if (data.messages) {
            this.messages = data.messages;
            this.turnCounter = Math.max(...data.messages.map(m => m.turnNumber), 0);
        }
        if (data.toolCalls) {
            this.toolCalls = data.toolCalls;
        }
        if (data.entries) {
            data.entries.forEach(e => this.entries.set(e.id, e));
        }
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    /**
     * Evict the oldest entry.
     */
    private evictOldest(): void {
        let oldestId: string | null = null;
        let oldestTime = Infinity;

        this.entries.forEach((entry, id) => {
            const time = entry.createdAt.getTime();
            if (time < oldestTime) {
                oldestId = id;
                oldestTime = time;
            }
        });

        if (oldestId !== null) {
            this.entries.delete(oldestId);
            memoryLogger.debug(`Evicted from session memory: ${oldestId}`);
        }
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a session memory instance.
 */
export function createSessionMemory(config: {
    sessionId?: string;
    conversationId: string;
    maxEntries?: number;
}): SessionMemory {
    return new SessionMemory({
        sessionId: config.sessionId ?? `session-${Date.now()}`,
        conversationId: config.conversationId,
        maxEntries: config.maxEntries,
    });
}
