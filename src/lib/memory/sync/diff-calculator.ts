/**
 * CryptoAgentHQ - Diff Calculator
 * @module lib/memory/sync/diff-calculator
 * 
 * Calculates differences between memory states for incremental sync.
 * Konsey Değerlendirmesi: Marcus Hoffmann (CAP Theorem) + Dr. Ana Rodriguez ⭐⭐⭐⭐⭐
 */

import { createHash } from 'crypto';
import type { MemoryEntry, MemoryTier } from '../core/types';
import { memoryLogger } from '../core/config';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Represents differences between two memory states.
 */
export interface MemoryDiff {
    /** Newly added entries */
    added: MemoryEntry[];
    /** Modified entries */
    modified: ModifiedEntry[];
    /** Deleted entry IDs */
    deleted: string[];
    /** Count of unchanged entries */
    unchanged: number;
    /** Total number of changes */
    totalChanges: number;
    /** Estimated transfer size in bytes */
    estimatedTransferSize: number;
    /** Tier this diff applies to */
    tier?: MemoryTier;
    /** When the diff was calculated */
    calculatedAt: Date;
}

/**
 * Modified entry with both versions.
 */
export interface ModifiedEntry {
    id: string;
    previous: MemoryEntry;
    current: MemoryEntry;
    changeType: 'content' | 'importance' | 'metadata' | 'multiple';
}

/**
 * Memory state snapshot for comparison.
 */
export interface MemoryState {
    entries: Map<string, MemoryEntry>;
    checksum: string;
    timestamp: Date;
    tier?: MemoryTier;
}

/**
 * Entry checksum for quick comparison.
 */
interface EntryChecksum {
    id: string;
    hash: string;
    importance: number;
    updatedAt: number;
}

// ============================================================================
// DIFF CALCULATOR CLASS
// ============================================================================

/**
 * Calculates differences between memory states.
 */
export class DiffCalculator {
    private readonly checksumCache: Map<string, EntryChecksum> = new Map();

    /**
     * Calculate diff between current and previous states.
     */
    calculateDiff(current: MemoryState, previous: MemoryState): MemoryDiff {
        const startTime = Date.now();

        const added: MemoryEntry[] = [];
        const modified: ModifiedEntry[] = [];
        const deleted: string[] = [];
        let unchanged = 0;

        // Find added and modified entries
        current.entries.forEach((entry, id) => {
            const previousEntry = previous.entries.get(id);

            if (!previousEntry) {
                added.push(entry);
            } else if (!this.entriesEqual(entry, previousEntry)) {
                modified.push({
                    id,
                    previous: previousEntry,
                    current: entry,
                    changeType: this.detectChangeType(entry, previousEntry),
                });
            } else {
                unchanged++;
            }
        });

        // Find deleted entries
        previous.entries.forEach((_, id) => {
            if (!current.entries.has(id)) {
                deleted.push(id);
            }
        });

        const totalChanges = added.length + modified.length + deleted.length;
        const estimatedTransferSize = this.estimateTransferSize(added, modified);

        memoryLogger.debug('Diff calculated', {
            added: added.length,
            modified: modified.length,
            deleted: deleted.length,
            unchanged,
            duration: `${Date.now() - startTime}ms`,
        });

        return {
            added,
            modified,
            deleted,
            unchanged,
            totalChanges,
            estimatedTransferSize,
            tier: current.tier,
            calculatedAt: new Date(),
        };
    }

    /**
     * Calculate diff for a specific tier.
     */
    calculateTierDiff(
        currentEntries: MemoryEntry[],
        previousEntries: MemoryEntry[],
        tier: MemoryTier
    ): MemoryDiff {
        const current = this.createState(currentEntries, tier);
        const previous = this.createState(previousEntries, tier);
        return this.calculateDiff(current, previous);
    }

    /**
     * Check if there are any changes without computing full diff.
     */
    hasChanges(current: MemoryState, previous: MemoryState): boolean {
        // Quick check using checksums
        if (current.checksum !== previous.checksum) {
            return true;
        }

        // Size check
        if (current.entries.size !== previous.entries.size) {
            return true;
        }

        return false;
    }

    /**
     * Get IDs of changed entries (quick lookup).
     */
    getChangedEntryIds(current: MemoryState, previous: MemoryState): string[] {
        const changedIds: string[] = [];

        // Added entries
        current.entries.forEach((_, id) => {
            if (!previous.entries.has(id)) {
                changedIds.push(id);
            }
        });

        // Deleted entries
        previous.entries.forEach((_, id) => {
            if (!current.entries.has(id)) {
                changedIds.push(id);
            }
        });

        // Modified entries
        current.entries.forEach((entry, id) => {
            const prev = previous.entries.get(id);
            if (prev && !this.entriesEqual(entry, prev)) {
                if (!changedIds.includes(id)) {
                    changedIds.push(id);
                }
            }
        });

        return changedIds;
    }

    /**
     * Create a memory state from entries.
     */
    createState(entries: MemoryEntry[], tier?: MemoryTier): MemoryState {
        const entryMap = new Map<string, MemoryEntry>();
        entries.forEach(e => entryMap.set(e.id, e));

        return {
            entries: entryMap,
            checksum: this.calculateStateChecksum(entries),
            timestamp: new Date(),
            tier,
        };
    }

    /**
     * Create an empty state.
     */
    createEmptyState(tier?: MemoryTier): MemoryState {
        return this.createState([], tier);
    }

    /**
     * Calculate checksum for an entry.
     */
    calculateEntryChecksum(entry: MemoryEntry): string {
        const cached = this.checksumCache.get(entry.id);
        const updatedAt = entry.accessedAt?.getTime() ?? entry.createdAt.getTime();

        if (cached && cached.updatedAt === updatedAt) {
            return cached.hash;
        }

        const hash = createHash('sha256')
            .update(entry.content)
            .update(String(entry.importance))
            .update(entry.tier)
            .update(entry.type)
            .digest('hex')
            .slice(0, 16);

        this.checksumCache.set(entry.id, {
            id: entry.id,
            hash,
            importance: entry.importance,
            updatedAt,
        });

        return hash;
    }

    /**
     * Calculate checksum for entire state.
     */
    calculateStateChecksum(entries: MemoryEntry[]): string {
        const sortedIds = entries.map(e => e.id).sort();
        const checksums = sortedIds.map(id => {
            const entry = entries.find(e => e.id === id)!;
            return this.calculateEntryChecksum(entry);
        });

        return createHash('sha256')
            .update(checksums.join(''))
            .digest('hex');
    }

    /**
     * Clear checksum cache.
     */
    clearCache(): void {
        this.checksumCache.clear();
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    /**
     * Check if two entries are equal.
     */
    private entriesEqual(a: MemoryEntry, b: MemoryEntry): boolean {
        // Quick checks first
        if (a.importance !== b.importance) return false;
        if (a.tier !== b.tier) return false;
        if (a.type !== b.type) return false;

        // Content comparison (most expensive)
        if (a.content !== b.content) return false;

        return true;
    }

    /**
     * Detect what type of change occurred.
     */
    private detectChangeType(
        current: MemoryEntry,
        previous: MemoryEntry
    ): ModifiedEntry['changeType'] {
        const changes: string[] = [];

        if (current.content !== previous.content) {
            changes.push('content');
        }
        if (current.importance !== previous.importance) {
            changes.push('importance');
        }
        if (JSON.stringify(current.metadata) !== JSON.stringify(previous.metadata)) {
            changes.push('metadata');
        }

        if (changes.length > 1) return 'multiple';
        if (changes[0] === 'content') return 'content';
        if (changes[0] === 'importance') return 'importance';
        return 'metadata';
    }

    /**
     * Estimate transfer size for sync.
     */
    private estimateTransferSize(
        added: MemoryEntry[],
        modified: ModifiedEntry[]
    ): number {
        let size = 0;

        added.forEach(entry => {
            size += entry.content.length * 2; // UTF-16 estimate
            size += 200; // Metadata overhead
        });

        modified.forEach(mod => {
            size += mod.current.content.length * 2;
            size += 200;
        });

        return size;
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a diff calculator instance.
 */
export function createDiffCalculator(): DiffCalculator {
    return new DiffCalculator();
}
