/**
 * CryptoAgentHQ - Central Memory Manager
 * @module lib/memory/core/memory-manager
 * 
 * Coordinates all memory tiers and operations.
 * Konsey Değerlendirmesi: Konsey Başkanı ⭐⭐⭐⭐⭐
 */

import type {
    MemoryEntry,
    MemoryTier,
    MemoryConfig,
    RetrieveOptions,
    SessionSnapshot,
    SnapshotResult,
    RestoreResult,
    ProjectState,
    TaskState,
    AgentState,
    ArtifactReference,
    ConversationMessage,
} from './types';
import { createMemoryConfig, memoryLogger } from './config';
import {
    ImmediateMemory,
    SessionMemory,
    SummarizedMemory,
    ArchivalMemory,
    createImmediateMemory,
    createSessionMemory,
    createSummarizedMemory,
    createArchivalMemory,
} from '../tiers';
import { FileStore, createFileStore } from '../persistence';
import {
    Summarizer,
    KnowledgeExtractor,
    SnapshotCreator,
    SessionRestorer,
    createSummarizer,
    createKnowledgeExtractor,
    createSnapshotCreator,
    createSessionRestorer,
} from '../operations';

// ============================================================================
// MEMORY MANAGER CLASS
// ============================================================================

/**
 * Central memory management system.
 * Coordinates all memory tiers and provides unified interface.
 */
export class MemoryManager {
    // Configuration
    private readonly config: MemoryConfig;

    // Memory Tiers
    private readonly immediate: ImmediateMemory;
    private readonly session: SessionMemory;
    private readonly summarized: SummarizedMemory;
    private readonly archival: ArchivalMemory;

    // Operations
    private readonly summarizer: Summarizer;
    private readonly extractor: KnowledgeExtractor;
    private readonly snapshotCreator: SnapshotCreator;
    private readonly restorer: SessionRestorer;

    // Persistence
    private readonly fileStore: FileStore;

    // State
    private messageCounter: number = 0;
    private lastSaveMessageCount: number = 0;
    private initialized: boolean = false;

    constructor(config: MemoryConfig) {
        this.config = config;

        // Initialize memory tiers
        this.immediate = createImmediateMemory({
            maxTokens: config.maxImmediateTokens,
        });

        this.session = createSessionMemory({
            conversationId: config.conversationId,
            maxEntries: config.maxSessionEntries,
        });

        this.summarized = createSummarizedMemory({
            conversationId: config.conversationId,
        });

        this.archival = createArchivalMemory({
            conversationId: config.conversationId,
        });

        // Initialize persistence
        this.fileStore = createFileStore(config.basePath, config.conversationId);

        // Initialize operations
        this.summarizer = createSummarizer(config.conversationId);
        this.extractor = createKnowledgeExtractor(config.conversationId);

        this.snapshotCreator = createSnapshotCreator({
            sessionMemory: this.session,
            summarizedMemory: this.summarized,
            summarizer: this.summarizer,
            extractor: this.extractor,
            fileStore: this.fileStore,
            conversationId: config.conversationId,
        });

        this.restorer = createSessionRestorer({
            sessionMemory: this.session,
            summarizedMemory: this.summarized,
            archivalMemory: this.archival,
            fileStore: this.fileStore,
        });

        memoryLogger.info('Memory Manager initialized', {
            conversationId: config.conversationId,
        });
    }

    // ============================================================================
    // INITIALIZATION
    // ============================================================================

    /**
     * Initialize the memory manager.
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        await this.fileStore.ensureDirectories();
        this.initialized = true;

        memoryLogger.info('Memory Manager ready');
    }

    /**
     * Initialize and restore from latest snapshot.
     */
    async initializeWithRestore(): Promise<RestoreResult> {
        await this.initialize();
        return this.restorer.restoreLatest();
    }

    // ============================================================================
    // MESSAGE OPERATIONS
    // ============================================================================

    /**
     * Add a conversation message.
     */
    addMessage(message: Omit<ConversationMessage, 'turnNumber'>): ConversationMessage {
        this.messageCounter++;

        // Add to session memory
        const fullMessage = this.session.addMessage(message);

        // Check if auto-save needed
        if (this.shouldAutoSave()) {
            this.autoSave().catch(err => {
                memoryLogger.error('Auto-save failed', err);
            });
        }

        return fullMessage;
    }

    /**
     * Get all messages from current session.
     */
    getMessages(): ConversationMessage[] {
        return this.session.getMessages();
    }

    /**
     * Get the last N messages.
     */
    getLastMessages(count: number): ConversationMessage[] {
        return this.session.getLastMessages(count);
    }

    // ============================================================================
    // ENTRY OPERATIONS
    // ============================================================================

    /**
     * Store a memory entry.
     */
    store(entry: MemoryEntry): void {
        switch (entry.tier) {
            case 'immediate':
                this.immediate.add(entry);
                break;
            case 'session':
                this.session.add(entry);
                break;
            case 'summarized':
                this.summarized.add(entry);
                break;
            case 'archival':
                this.archival.archive(entry);
                break;
        }
    }

    /**
     * Retrieve entries based on options.
     */
    retrieve(options: RetrieveOptions = {}): MemoryEntry[] {
        const tiers = options.tier
            ? (Array.isArray(options.tier) ? options.tier : [options.tier])
            : ['immediate', 'session', 'summarized', 'archival'] as MemoryTier[];

        const results: MemoryEntry[] = [];

        if (tiers.includes('immediate')) {
            results.push(...this.immediate.retrieve(options));
        }
        if (tiers.includes('session')) {
            results.push(...this.session.retrieve(options));
        }
        if (tiers.includes('summarized')) {
            results.push(...this.summarized.retrieve(options));
        }
        if (tiers.includes('archival')) {
            results.push(...this.archival.retrieve(options));
        }

        // Sort by importance then recency
        results.sort((a, b) => {
            const importanceDiff = b.importance - a.importance;
            if (Math.abs(importanceDiff) > 0.1) return importanceDiff;
            return b.createdAt.getTime() - a.createdAt.getTime();
        });

        // Apply limit
        if (options.limit) {
            return results.slice(0, options.limit);
        }

        return results;
    }

    /**
     * Search across all tiers.
     */
    search(query: string, limit: number = 20): MemoryEntry[] {
        const sessionResults = this.session.search(query, limit);
        const archivalResults = this.archival.search(query, limit);

        // Combine and deduplicate
        const seen = new Set<string>();
        const combined: MemoryEntry[] = [];

        [...sessionResults, ...archivalResults].forEach(entry => {
            if (!seen.has(entry.id)) {
                seen.add(entry.id);
                combined.push(entry);
            }
        });

        return combined.slice(0, limit);
    }

    // ============================================================================
    // TIER MANAGEMENT
    // ============================================================================

    /**
     * Promote entries from one tier to another.
     */
    async promote(entryIds: string[], targetTier: MemoryTier): Promise<void> {
        entryIds.forEach(id => {
            // Find entry in any tier
            const entry =
                this.immediate.get(id) ||
                this.session.get(id) ||
                this.summarized.get(id) ||
                this.archival.get(id);

            if (entry) {
                const promotedEntry: MemoryEntry = { ...entry, tier: targetTier };
                this.store(promotedEntry);
            }
        });
    }

    /**
     * Consolidate memory tiers.
     */
    async consolidate(): Promise<void> {
        // Check if immediate memory is near capacity
        if (this.immediate.isNearCapacity()) {
            const candidates = this.immediate.getPromotionCandidates();

            candidates.forEach(entry => {
                // Promote to session
                this.session.add({ ...entry, tier: 'session' });
                this.immediate.remove(entry.id);
            });

            memoryLogger.info('Consolidated immediate memory', {
                promoted: candidates.length,
            });
        }

        // Check if summarization is needed
        const messages = this.session.getMessages();
        if (messages.length > this.config.summarizationThreshold) {
            await this.summarizeSession();
        }
    }

    /**
     * Summarize current session.
     */
    async summarizeSession(): Promise<void> {
        const messages = this.session.getMessages();
        const summary = await this.summarizer.summarize(messages);
        this.summarized.addSummary(summary);

        memoryLogger.info('Session summarized', {
            messages: messages.length,
            decisions: summary.decisions.length,
        });
    }

    // ============================================================================
    // SNAPSHOT OPERATIONS
    // ============================================================================

    /**
     * Create a session snapshot.
     */
    async createSnapshot(options?: {
        projectState?: ProjectState;
        taskState?: TaskState;
        agentState?: AgentState;
        artifacts?: ArtifactReference[];
    }): Promise<SnapshotResult> {
        await this.initialize();
        return this.snapshotCreator.createSnapshot(options);
    }

    /**
     * Restore from a snapshot.
     */
    async restoreFromSnapshot(snapshotId: string): Promise<RestoreResult> {
        await this.initialize();
        return this.restorer.restoreFromSnapshot(snapshotId);
    }

    /**
     * Get a context summary for prompts.
     */
    async getContextSummary(maxTokens?: number): Promise<string> {
        return this.restorer.buildContextSummary({ maxTokens });
    }

    // ============================================================================
    // STATISTICS
    // ============================================================================

    /**
     * Get memory statistics.
     */
    getStats(): {
        immediate: { tokens: number; entries: number };
        session: { messages: number; entries: number; duration: number };
        summarized: { summaries: number; decisions: number; facts: number };
        archival: { snapshots: number; entities: number; entries: number };
    } {
        const immTokens = this.immediate.getTokenUsage();
        const immEntries = this.immediate.getEntryCount();
        const sessInfo = this.session.getSessionInfo();
        const archStats = this.archival.getStats();
        const summaries = this.summarized.getSummaries();
        const decisions = this.summarized.getDecisions();
        const facts = this.summarized.getFacts();

        return {
            immediate: {
                tokens: immTokens.current,
                entries: immEntries.current,
            },
            session: {
                messages: sessInfo.messageCount,
                entries: sessInfo.entryCount,
                duration: sessInfo.duration,
            },
            summarized: {
                summaries: summaries.length,
                decisions: decisions.length,
                facts: facts.length,
            },
            archival: {
                snapshots: archStats.snapshotCount,
                entities: archStats.entityCount,
                entries: archStats.entryCount,
            },
        };
    }

    // ============================================================================
    // CLEANUP
    // ============================================================================

    /**
     * Clear all memory.
     */
    clear(): void {
        this.immediate.clear();
        this.session.clear();
        this.summarized.clear();
        this.archival.clear();
        this.messageCounter = 0;
        this.lastSaveMessageCount = 0;

        memoryLogger.info('All memory cleared');
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    /**
     * Check if auto-save should trigger.
     */
    private shouldAutoSave(): boolean {
        return (
            this.messageCounter - this.lastSaveMessageCount >=
            this.config.autoSaveInterval
        );
    }

    /**
     * Auto-save current state.
     */
    private async autoSave(): Promise<void> {
        try {
            await this.fileStore.saveMessages(this.session.getMessages());
            this.lastSaveMessageCount = this.messageCounter;
            memoryLogger.debug('Auto-save complete');
        } catch (error) {
            memoryLogger.error('Auto-save failed', error);
        }
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a memory manager instance.
 */
export function createMemoryManager(
    conversationId: string,
    overrides?: Partial<MemoryConfig>
): MemoryManager {
    const config = createMemoryConfig(conversationId, overrides);
    return new MemoryManager(config);
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let globalMemoryManager: MemoryManager | null = null;

/**
 * Get or create the global memory manager.
 */
export function getMemoryManager(conversationId?: string): MemoryManager {
    if (!globalMemoryManager && conversationId) {
        globalMemoryManager = createMemoryManager(conversationId);
    }

    if (!globalMemoryManager) {
        throw new Error('Memory manager not initialized. Provide conversationId.');
    }

    return globalMemoryManager;
}
