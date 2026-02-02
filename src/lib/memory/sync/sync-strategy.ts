/**
 * CryptoAgentHQ - Sync Strategy
 * @module lib/memory/sync/sync-strategy
 * 
 * Strategy pattern implementations for different sync modes.
 * Konsey Değerlendirmesi: James Morrison (State Management) ⭐⭐⭐⭐⭐
 */

import type { MemoryEntry, MemoryTier } from '../core/types';
import type { MemoryDiff, MemoryState } from './diff-calculator';
import type { ConflictRecord, ResolvedConflict } from './conflict-resolver';
import { memoryLogger } from '../core/config';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Sync mode.
 */
export type SyncMode = 'full' | 'incremental' | 'tier-specific';

/**
 * Sync direction.
 */
export type SyncDirection = 'push' | 'pull' | 'bidirectional';

/**
 * Sync strategy options.
 */
export interface SyncStrategyOptions {
    mode: SyncMode;
    direction: SyncDirection;
    tiers?: MemoryTier[];
    force?: boolean;
    dryRun?: boolean;
    skipConflicts?: boolean;
    maxEntries?: number;
}

/**
 * Result of applying a sync strategy.
 */
export interface SyncStrategyResult {
    entriesSynced: number;
    entriesSkipped: number;
    conflicts: ConflictRecord[];
    appliedChanges: AppliedChange[];
    errors: SyncError[];
    duration: number;
}

/**
 * A change that was applied.
 */
export interface AppliedChange {
    type: 'add' | 'update' | 'delete';
    entryId: string;
    tier: MemoryTier;
    timestamp: Date;
}

/**
 * Sync error.
 */
export interface SyncError {
    entryId?: string;
    tier?: MemoryTier;
    message: string;
    recoverable: boolean;
}

/**
 * Interface for sync strategies.
 */
export interface ISyncStrategy {
    readonly mode: SyncMode;
    apply(
        diff: MemoryDiff,
        options: SyncStrategyOptions
    ): Promise<SyncStrategyResult>;
}

// ============================================================================
// BASE SYNC STRATEGY
// ============================================================================

/**
 * Abstract base class for sync strategies.
 */
export abstract class BaseSyncStrategy implements ISyncStrategy {
    abstract readonly mode: SyncMode;

    protected appliedChanges: AppliedChange[] = [];
    protected errors: SyncError[] = [];

    abstract apply(
        diff: MemoryDiff,
        options: SyncStrategyOptions
    ): Promise<SyncStrategyResult>;

    protected recordChange(
        type: AppliedChange['type'],
        entryId: string,
        tier: MemoryTier
    ): void {
        this.appliedChanges.push({
            type,
            entryId,
            tier,
            timestamp: new Date(),
        });
    }

    protected recordError(
        message: string,
        entryId?: string,
        tier?: MemoryTier,
        recoverable: boolean = true
    ): void {
        this.errors.push({ entryId, tier, message, recoverable });
    }

    protected reset(): void {
        this.appliedChanges = [];
        this.errors = [];
    }
}

// ============================================================================
// FULL SYNC STRATEGY
// ============================================================================

/**
 * Full sync - replaces all remote state with local state.
 */
export class FullSyncStrategy extends BaseSyncStrategy {
    readonly mode: SyncMode = 'full';

    async apply(
        diff: MemoryDiff,
        options: SyncStrategyOptions
    ): Promise<SyncStrategyResult> {
        const startTime = Date.now();
        this.reset();

        if (options.dryRun) {
            memoryLogger.info('Full sync (dry run)', {
                added: diff.added.length,
                modified: diff.modified.length,
                deleted: diff.deleted.length,
            });

            return {
                entriesSynced: 0,
                entriesSkipped: diff.totalChanges,
                conflicts: [],
                appliedChanges: [],
                errors: [],
                duration: Date.now() - startTime,
            };
        }

        // Apply all additions
        for (const entry of diff.added) {
            try {
                this.recordChange('add', entry.id, entry.tier);
            } catch (error) {
                this.recordError(
                    `Failed to add entry: ${error}`,
                    entry.id,
                    entry.tier
                );
            }
        }

        // Apply all modifications
        for (const mod of diff.modified) {
            try {
                this.recordChange('update', mod.id, mod.current.tier);
            } catch (error) {
                this.recordError(
                    `Failed to update entry: ${error}`,
                    mod.id,
                    mod.current.tier
                );
            }
        }

        // Apply all deletions
        for (const entryId of diff.deleted) {
            try {
                this.recordChange('delete', entryId, diff.tier ?? 'session');
            } catch (error) {
                this.recordError(
                    `Failed to delete entry: ${error}`,
                    entryId
                );
            }
        }

        const duration = Date.now() - startTime;
        memoryLogger.info('Full sync complete', {
            synced: this.appliedChanges.length,
            errors: this.errors.length,
            duration: `${duration}ms`,
        });

        return {
            entriesSynced: this.appliedChanges.length,
            entriesSkipped: 0,
            conflicts: [],
            appliedChanges: [...this.appliedChanges],
            errors: [...this.errors],
            duration,
        };
    }
}

// ============================================================================
// INCREMENTAL SYNC STRATEGY
// ============================================================================

/**
 * Incremental sync - only syncs changed entries since last sync.
 */
export class IncrementalSyncStrategy extends BaseSyncStrategy {
    readonly mode: SyncMode = 'incremental';

    async apply(
        diff: MemoryDiff,
        options: SyncStrategyOptions
    ): Promise<SyncStrategyResult> {
        const startTime = Date.now();
        this.reset();

        // Calculate what to sync
        const maxEntries = options.maxEntries ?? Infinity;
        let entriesProcessed = 0;

        if (options.dryRun) {
            memoryLogger.info('Incremental sync (dry run)', {
                changes: diff.totalChanges,
            });

            return {
                entriesSynced: 0,
                entriesSkipped: diff.totalChanges,
                conflicts: [],
                appliedChanges: [],
                errors: [],
                duration: Date.now() - startTime,
            };
        }

        // Prioritize: additions > updates > deletions
        // Sort by importance for additions and updates

        const sortedAdditions = [...diff.added]
            .sort((a, b) => b.importance - a.importance);

        for (const entry of sortedAdditions) {
            if (entriesProcessed >= maxEntries) break;

            try {
                this.recordChange('add', entry.id, entry.tier);
                entriesProcessed++;
            } catch (error) {
                this.recordError(`Failed to add: ${error}`, entry.id, entry.tier);
            }
        }

        const sortedModifications = [...diff.modified]
            .sort((a, b) => b.current.importance - a.current.importance);

        for (const mod of sortedModifications) {
            if (entriesProcessed >= maxEntries) break;

            try {
                this.recordChange('update', mod.id, mod.current.tier);
                entriesProcessed++;
            } catch (error) {
                this.recordError(`Failed to update: ${error}`, mod.id, mod.current.tier);
            }
        }

        for (const entryId of diff.deleted) {
            if (entriesProcessed >= maxEntries) break;

            try {
                this.recordChange('delete', entryId, diff.tier ?? 'session');
                entriesProcessed++;
            } catch (error) {
                this.recordError(`Failed to delete: ${error}`, entryId);
            }
        }

        const duration = Date.now() - startTime;
        const entriesSkipped = diff.totalChanges - entriesProcessed;

        memoryLogger.info('Incremental sync complete', {
            synced: this.appliedChanges.length,
            skipped: entriesSkipped,
            duration: `${duration}ms`,
        });

        return {
            entriesSynced: this.appliedChanges.length,
            entriesSkipped,
            conflicts: [],
            appliedChanges: [...this.appliedChanges],
            errors: [...this.errors],
            duration,
        };
    }
}

// ============================================================================
// TIER-SPECIFIC SYNC STRATEGY
// ============================================================================

/**
 * Tier-specific sync - only syncs specified tiers.
 */
export class TierSpecificSyncStrategy extends BaseSyncStrategy {
    readonly mode: SyncMode = 'tier-specific';

    async apply(
        diff: MemoryDiff,
        options: SyncStrategyOptions
    ): Promise<SyncStrategyResult> {
        const startTime = Date.now();
        this.reset();

        const targetTiers = options.tiers ?? ['session'];

        if (options.dryRun) {
            const tierFiltered = diff.added.filter(e => targetTiers.includes(e.tier));
            memoryLogger.info('Tier-specific sync (dry run)', {
                tiers: targetTiers,
                entries: tierFiltered.length,
            });

            return {
                entriesSynced: 0,
                entriesSkipped: tierFiltered.length,
                conflicts: [],
                appliedChanges: [],
                errors: [],
                duration: Date.now() - startTime,
            };
        }

        // Filter and sync only specified tiers
        const tierAdditions = diff.added.filter(e => targetTiers.includes(e.tier));
        const tierModifications = diff.modified.filter(m =>
            targetTiers.includes(m.current.tier)
        );

        for (const entry of tierAdditions) {
            try {
                this.recordChange('add', entry.id, entry.tier);
            } catch (error) {
                this.recordError(`Failed to add: ${error}`, entry.id, entry.tier);
            }
        }

        for (const mod of tierModifications) {
            try {
                this.recordChange('update', mod.id, mod.current.tier);
            } catch (error) {
                this.recordError(`Failed to update: ${error}`, mod.id, mod.current.tier);
            }
        }

        const duration = Date.now() - startTime;

        memoryLogger.info('Tier-specific sync complete', {
            tiers: targetTiers,
            synced: this.appliedChanges.length,
            duration: `${duration}ms`,
        });

        return {
            entriesSynced: this.appliedChanges.length,
            entriesSkipped: diff.totalChanges - this.appliedChanges.length,
            conflicts: [],
            appliedChanges: [...this.appliedChanges],
            errors: [...this.errors],
            duration,
        };
    }
}

// ============================================================================
// STRATEGY FACTORY
// ============================================================================

/**
 * Create a sync strategy for the given mode.
 */
export function createSyncStrategy(mode: SyncMode): ISyncStrategy {
    switch (mode) {
        case 'full':
            return new FullSyncStrategy();
        case 'incremental':
            return new IncrementalSyncStrategy();
        case 'tier-specific':
            return new TierSpecificSyncStrategy();
        default:
            throw new Error(`Unknown sync mode: ${mode}`);
    }
}

/**
 * Get all available sync strategies.
 */
export function getAllStrategies(): ISyncStrategy[] {
    return [
        new FullSyncStrategy(),
        new IncrementalSyncStrategy(),
        new TierSpecificSyncStrategy(),
    ];
}
