/**
 * CryptoAgentHQ - Immediate Memory Tier
 * @module lib/memory/tiers/immediate-memory
 * 
 * Hot memory tier for current context window.
 * Konsey Değerlendirmesi: MemGPT Specialist + Performance Optimizer ⭐⭐⭐⭐⭐
 */

import type {
    MemoryEntry,
    MemoryEntryType,
    MemoryMetadata,
    RetrieveOptions,
} from '../core/types';
import { TIER_CONFIG, IMPORTANCE_WEIGHTS, memoryLogger } from '../core/config';

// ============================================================================
// IMMEDIATE MEMORY CLASS
// ============================================================================

/**
 * Immediate memory tier - the "hot" working memory.
 * Analogous to RAM in MemGPT architecture.
 * 
 * Characteristics:
 * - Fastest access
 * - Limited capacity (context window)
 * - Automatically evicts oldest entries when full
 * - No persistence (recreated each session)
 */
export class ImmediateMemory {
    private entries: Map<string, MemoryEntry> = new Map();
    private entryOrder: string[] = [];
    private totalTokens: number = 0;

    private readonly maxTokens: number;
    private readonly maxEntries: number;

    constructor(config?: { maxTokens?: number; maxEntries?: number }) {
        this.maxTokens = config?.maxTokens ?? TIER_CONFIG.immediate.maxTokens;
        this.maxEntries = config?.maxEntries ?? TIER_CONFIG.immediate.maxEntries;
    }

    // ============================================================================
    // CORE OPERATIONS
    // ============================================================================

    /**
     * Add an entry to immediate memory.
     */
    add(entry: MemoryEntry): void {
        // Remove if exists (for update)
        if (this.entries.has(entry.id)) {
            this.remove(entry.id);
        }

        // Ensure capacity
        const entryTokens = entry.tokens ?? this.estimateTokens(entry.content);
        while (
            this.totalTokens + entryTokens > this.maxTokens ||
            this.entries.size >= this.maxEntries
        ) {
            const evicted = this.evictLeastImportant();
            if (!evicted) break;
        }

        // Add entry
        const entryWithTokens = { ...entry, tokens: entryTokens };
        this.entries.set(entry.id, entryWithTokens);
        this.entryOrder.push(entry.id);
        this.totalTokens += entryTokens;

        memoryLogger.debug(`Added to immediate memory: ${entry.id}`, {
            tokens: entryTokens,
            totalTokens: this.totalTokens,
        });
    }

    /**
     * Get an entry by ID.
     */
    get(id: string): MemoryEntry | undefined {
        const entry = this.entries.get(id);
        if (entry) {
            // Update access time
            entry.accessedAt = new Date();
        }
        return entry;
    }

    /**
     * Get all entries.
     */
    getAll(): MemoryEntry[] {
        return this.entryOrder.map(id => this.entries.get(id)!).filter(Boolean);
    }

    /**
     * Retrieve entries based on options.
     */
    retrieve(options: RetrieveOptions = {}): MemoryEntry[] {
        let results = this.getAll();

        // Filter by type
        if (options.type) {
            const types = Array.isArray(options.type) ? options.type : [options.type];
            results = results.filter(e => types.includes(e.type));
        }

        // Filter by importance
        if (options.minImportance !== undefined) {
            results = results.filter(e => e.importance >= options.minImportance!);
        }

        // Filter by date range
        if (options.dateRange) {
            if (options.dateRange.start) {
                results = results.filter(e => e.createdAt >= options.dateRange!.start!);
            }
            if (options.dateRange.end) {
                results = results.filter(e => e.createdAt <= options.dateRange!.end!);
            }
        }

        // Apply limit
        if (options.limit) {
            results = results.slice(0, options.limit);
        }

        return results;
    }

    /**
     * Remove an entry.
     */
    remove(id: string): boolean {
        const entry = this.entries.get(id);
        if (!entry) return false;

        this.entries.delete(id);
        this.entryOrder = this.entryOrder.filter(eid => eid !== id);
        this.totalTokens -= entry.tokens ?? 0;

        memoryLogger.debug(`Removed from immediate memory: ${id}`);
        return true;
    }

    /**
     * Clear all entries.
     */
    clear(): void {
        this.entries.clear();
        this.entryOrder = [];
        this.totalTokens = 0;
        memoryLogger.info('Immediate memory cleared');
    }

    // ============================================================================
    // CAPACITY MANAGEMENT
    // ============================================================================

    /**
     * Get current token usage.
     */
    getTokenUsage(): { current: number; max: number; percentage: number } {
        return {
            current: this.totalTokens,
            max: this.maxTokens,
            percentage: (this.totalTokens / this.maxTokens) * 100,
        };
    }

    /**
     * Get current entry count.
     */
    getEntryCount(): { current: number; max: number } {
        return {
            current: this.entries.size,
            max: this.maxEntries,
        };
    }

    /**
     * Check if memory is near capacity.
     */
    isNearCapacity(threshold: number = 0.8): boolean {
        return this.totalTokens / this.maxTokens >= threshold;
    }

    /**
     * Get entries that should be promoted to session memory.
     */
    getPromotionCandidates(): MemoryEntry[] {
        if (!this.isNearCapacity()) return [];

        // Get oldest entries with importance above threshold
        const sorted = this.getAll().sort((a, b) => {
            // Score by importance and age
            const aScore = a.importance - (Date.now() - a.createdAt.getTime()) / 1000000;
            const bScore = b.importance - (Date.now() - b.createdAt.getTime()) / 1000000;
            return aScore - bScore;
        });

        // Return bottom half
        return sorted.slice(0, Math.floor(sorted.length / 2));
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    /**
     * Evict the least important entry.
     */
    private evictLeastImportant(): MemoryEntry | null {
        if (this.entries.size === 0) return null;

        // Find entry with lowest importance, preferring older entries
        let minScore = Infinity;
        let minId: string | null = null;

        this.entries.forEach((entry, id) => {
            const ageScore = (Date.now() - entry.createdAt.getTime()) / 1000000;
            const score = entry.importance - ageScore * 0.1;

            if (score < minScore) {
                minScore = score;
                minId = id;
            }
        });

        if (minId) {
            const evicted = this.entries.get(minId)!;
            this.remove(minId);
            memoryLogger.debug(`Evicted from immediate memory: ${minId}`, {
                importance: evicted.importance,
            });
            return evicted;
        }

        return null;
    }

    /**
     * Estimate token count for content.
     */
    private estimateTokens(content: string): number {
        // Rough estimation: ~4 chars per token
        return Math.ceil(content.length / 4);
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an immediate memory instance.
 */
export function createImmediateMemory(config?: {
    maxTokens?: number;
    maxEntries?: number;
}): ImmediateMemory {
    return new ImmediateMemory(config);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a memory entry for the immediate tier.
 */
export function createImmediateEntry(
    content: string,
    type: MemoryEntryType,
    metadata: Partial<MemoryMetadata>,
    importance?: number
): MemoryEntry {
    const now = new Date();

    return {
        id: `imm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        tier: 'immediate',
        content,
        type,
        metadata: {
            conversationId: metadata.conversationId ?? '',
            sessionId: metadata.sessionId ?? '',
            turnNumber: metadata.turnNumber ?? 0,
            source: metadata.source ?? 'system',
            tags: metadata.tags ?? [],
            entities: metadata.entities ?? [],
            references: metadata.references ?? [],
        },
        createdAt: now,
        accessedAt: now,
        importance: importance ?? IMPORTANCE_WEIGHTS[type] ?? 0.5,
    };
}
