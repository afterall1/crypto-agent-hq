/**
 * CryptoAgentHQ - Sync Engine
 * @module lib/memory/sync/sync-engine
 * 
 * Core sync orchestration.
 * Konsey Değerlendirmesi: Dr. Sarah Chen (Konsey Başkanı) ⭐⭐⭐⭐⭐
 */

import type { MemoryEntry, MemoryTier } from '../core/types';
import { memoryLogger } from '../core/config';
import { DiffCalculator, type MemoryState, type MemoryDiff } from './diff-calculator';
import { SyncStatusTracker, type SyncProgress, type SyncInfo } from './sync-status';
import { ConflictResolver, type ConflictRecord, type ResolvedConflict, type ResolutionStrategy } from './conflict-resolver';
import { createSyncStrategy, type SyncMode, type SyncStrategyOptions, type SyncStrategyResult } from './sync-strategy';
import { EventLog, createMemoryEvent, type SyncEventPayload } from '../events';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Sync options.
 */
export interface SyncOptions {
    mode: SyncMode;
    tiers?: MemoryTier[];
    force?: boolean;
    dryRun?: boolean;
    timeout?: number;
    conflictStrategy?: ResolutionStrategy;
    onProgress?: (progress: SyncProgress) => void;
}

/**
 * Sync result.
 */
export interface SyncResult {
    success: boolean;
    syncId: string;
    mode: SyncMode;
    syncedEntries: number;
    conflictsResolved: number;
    conflictsPending: ConflictRecord[];
    duration: number;
    lastSyncTimestamp: Date;
    nextSyncRecommended?: Date;
    checksum: string;
    error?: string;
}

/**
 * Sync engine configuration.
 */
export interface SyncEngineConfig {
    conversationId: string;
    sessionId: string;
    basePath: string;
    autoSyncInterval?: number;
    autoSyncMessageThreshold?: number;
    defaultConflictStrategy?: ResolutionStrategy;
}

// ============================================================================
// SYNC ENGINE CLASS
// ============================================================================

/**
 * Core sync orchestration engine.
 */
export class SyncEngine {
    private readonly config: Required<SyncEngineConfig>;
    private readonly diffCalculator: DiffCalculator;
    private readonly statusTracker: SyncStatusTracker;
    private readonly conflictResolver: ConflictResolver;
    private readonly eventLog: EventLog;

    // State tracking
    private lastSyncState: MemoryState | null = null;
    private messagesSinceSync: number = 0;
    private scheduledSyncTimer: NodeJS.Timeout | null = null;

    // Callbacks
    private progressCallback?: (progress: SyncProgress) => void;

    constructor(config: SyncEngineConfig) {
        this.config = {
            ...config,
            autoSyncInterval: config.autoSyncInterval ?? 300000, // 5 minutes
            autoSyncMessageThreshold: config.autoSyncMessageThreshold ?? 10,
            defaultConflictStrategy: config.defaultConflictStrategy ?? 'last-write-wins',
        };

        this.diffCalculator = new DiffCalculator();
        this.statusTracker = new SyncStatusTracker();
        this.conflictResolver = new ConflictResolver({
            defaultStrategy: this.config.defaultConflictStrategy,
        });
        this.eventLog = new EventLog({
            basePath: config.basePath,
            conversationId: config.conversationId,
            sessionId: config.sessionId,
        });

        // Wire up progress updates
        this.statusTracker.onProgress(progress => {
            this.progressCallback?.(progress);
        });
    }

    // ============================================================================
    // MAIN SYNC OPERATIONS
    // ============================================================================

    /**
     * Perform a sync operation.
     */
    async sync(
        currentEntries: MemoryEntry[],
        options: Partial<SyncOptions> = {}
    ): Promise<SyncResult> {
        const syncId = `sync-${Date.now()}`;
        const mode = options.mode ?? 'incremental';
        const startTime = Date.now();

        try {
            // Check if already syncing
            if (this.statusTracker.isSyncing()) {
                throw new Error('Sync already in progress');
            }

            // Log sync start event
            await this.eventLog.append<SyncEventPayload>('sync.started', {
                syncId,
                mode,
                tiers: options.tiers,
            });

            // Set up progress callback
            this.progressCallback = options.onProgress;

            // Calculate total entries
            const totalEntries = currentEntries.length;
            this.statusTracker.startSync(syncId, totalEntries);

            memoryLogger.info(`Starting ${mode} sync`, { syncId, entries: totalEntries });

            // Phase 1: Calculate diff
            this.statusTracker.setPhase('calculating-diff');
            const currentState = this.diffCalculator.createState(currentEntries);
            const previousState = this.lastSyncState ?? this.diffCalculator.createEmptyState();

            let diff: MemoryDiff;
            if (options.force || !this.lastSyncState) {
                // Full diff if forced or first sync
                diff = this.diffCalculator.calculateDiff(currentState, previousState);
            } else {
                diff = this.diffCalculator.calculateDiff(currentState, previousState);
            }

            // Check if there are changes
            if (diff.totalChanges === 0) {
                memoryLogger.info('No changes to sync');
                this.statusTracker.completeSync(syncId, 'success', {
                    entriesSynced: 0,
                    conflictsResolved: 0,
                });

                return {
                    success: true,
                    syncId,
                    mode,
                    syncedEntries: 0,
                    conflictsResolved: 0,
                    conflictsPending: [],
                    duration: Date.now() - startTime,
                    lastSyncTimestamp: new Date(),
                    checksum: currentState.checksum,
                };
            }

            // Phase 2: Resolve conflicts
            this.statusTracker.setPhase('resolving-conflicts');
            const conflicts = this.conflictResolver.detectConflicts(
                currentState.entries,
                previousState.entries
            );

            let conflictsResolved = 0;
            const conflictStrategy = options.conflictStrategy ?? this.config.defaultConflictStrategy;

            if (conflicts.length > 0 && !options.dryRun) {
                const resolved = this.conflictResolver.resolveAll(conflictStrategy);
                conflictsResolved = resolved.length;

                // Log conflict events
                for (const r of resolved) {
                    await this.eventLog.append('sync.conflict_resolved', {
                        conflictId: r.conflictId,
                        entryId: r.entryId,
                        tier: 'session',
                        resolution: r.strategy,
                    });
                }
            }

            // Phase 3: Apply changes
            this.statusTracker.setPhase('applying-changes');
            const strategy = createSyncStrategy(mode);
            const strategyOptions: SyncStrategyOptions = {
                mode,
                direction: 'push',
                tiers: options.tiers,
                force: options.force,
                dryRun: options.dryRun,
            };

            const strategyResult = await strategy.apply(diff, strategyOptions);

            // Update progress as changes are applied
            let processed = 0;
            for (const change of strategyResult.appliedChanges) {
                processed++;
                this.statusTracker.updateProgress({
                    entriesProcessed: processed,
                    progress: 70 + Math.floor((processed / strategyResult.appliedChanges.length) * 20),
                });
            }

            // Phase 4: Validate
            this.statusTracker.setPhase('validating');
            // Validation logic would go here

            // Complete
            this.statusTracker.setPhase('complete');

            // Update last sync state
            if (!options.dryRun) {
                this.lastSyncState = currentState;
                this.messagesSinceSync = 0;
            }

            // Log sync complete event
            await this.eventLog.append<SyncEventPayload>('sync.completed', {
                syncId,
                mode,
                entriesSynced: strategyResult.entriesSynced,
                conflictsResolved,
                duration: Date.now() - startTime,
            });

            this.statusTracker.completeSync(syncId, 'success', {
                entriesSynced: strategyResult.entriesSynced,
                conflictsResolved,
            });

            const duration = Date.now() - startTime;
            memoryLogger.info(`Sync complete`, {
                syncId,
                synced: strategyResult.entriesSynced,
                conflicts: conflictsResolved,
                duration: `${duration}ms`,
            });

            return {
                success: true,
                syncId,
                mode,
                syncedEntries: strategyResult.entriesSynced,
                conflictsResolved,
                conflictsPending: this.conflictResolver.getPendingConflicts(),
                duration,
                lastSyncTimestamp: new Date(),
                nextSyncRecommended: this.calculateNextSync(),
                checksum: currentState.checksum,
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Log sync failed event
            await this.eventLog.append<SyncEventPayload>('sync.failed', {
                syncId,
                mode,
                error: errorMessage,
            });

            this.statusTracker.completeSync(syncId, 'failed', {
                entriesSynced: 0,
                conflictsResolved: 0,
                error: errorMessage,
            });

            memoryLogger.error('Sync failed', error);

            return {
                success: false,
                syncId,
                mode,
                syncedEntries: 0,
                conflictsResolved: 0,
                conflictsPending: [],
                duration: Date.now() - startTime,
                lastSyncTimestamp: new Date(),
                checksum: '',
                error: errorMessage,
            };
        }
    }

    /**
     * Perform incremental sync.
     */
    async syncIncremental(currentEntries: MemoryEntry[]): Promise<SyncResult> {
        return this.sync(currentEntries, { mode: 'incremental' });
    }

    /**
     * Perform tier-specific sync.
     */
    async syncTier(
        entries: MemoryEntry[],
        tier: MemoryTier
    ): Promise<SyncResult> {
        const tierEntries = entries.filter(e => e.tier === tier);
        return this.sync(tierEntries, { mode: 'tier-specific', tiers: [tier] });
    }

    // ============================================================================
    // STATUS & INFO
    // ============================================================================

    /**
     * Get current sync status.
     */
    getSyncStatus(): {
        state: string;
        progress: SyncProgress | null;
        lastSync: SyncInfo | null;
        pendingConflicts: number;
    } {
        return {
            state: this.statusTracker.getState(),
            progress: this.statusTracker.getProgress(),
            lastSync: this.statusTracker.getLastSyncInfo(),
            pendingConflicts: this.conflictResolver.getPendingCount(),
        };
    }

    /**
     * Get last sync info.
     */
    getLastSyncInfo(): SyncInfo | null {
        return this.statusTracker.getLastSyncInfo();
    }

    /**
     * Check if sync is needed.
     */
    needsSync(): boolean {
        // Check message threshold
        if (this.messagesSinceSync >= this.config.autoSyncMessageThreshold) {
            return true;
        }

        // Check time since last sync
        const lastSync = this.statusTracker.getLastSyncInfo();
        if (!lastSync) {
            return true;
        }

        const timeSinceSync = Date.now() - lastSync.endTime.getTime();
        return timeSinceSync >= this.config.autoSyncInterval;
    }

    /**
     * Record message for sync threshold tracking.
     */
    recordMessage(): void {
        this.messagesSinceSync++;

        if (this.needsSync() && this.scheduledSyncTimer === null) {
            memoryLogger.debug('Sync threshold reached');
        }
    }

    // ============================================================================
    // SCHEDULING
    // ============================================================================

    /**
     * Schedule periodic sync.
     */
    schedulePeriodic(intervalMs?: number): void {
        this.cancelScheduled();

        const interval = intervalMs ?? this.config.autoSyncInterval;
        const nextSync = new Date(Date.now() + interval);

        this.statusTracker.setNextScheduledSync(nextSync);

        this.scheduledSyncTimer = setInterval(() => {
            // Note: This would trigger a sync with current entries
            // In practice, the MemoryManager would handle this
            memoryLogger.debug('Scheduled sync trigger');
        }, interval);

        memoryLogger.info(`Scheduled periodic sync every ${interval}ms`);
    }

    /**
     * Cancel scheduled sync.
     */
    cancelScheduled(): void {
        if (this.scheduledSyncTimer) {
            clearInterval(this.scheduledSyncTimer);
            this.scheduledSyncTimer = null;
        }
        this.statusTracker.clearSchedule();
    }

    // ============================================================================
    // CONFLICT MANAGEMENT
    // ============================================================================

    /**
     * Get pending conflicts.
     */
    getPendingConflicts(): ConflictRecord[] {
        return this.conflictResolver.getPendingConflicts();
    }

    /**
     * Resolve a specific conflict manually.
     */
    resolveConflict(conflictId: string, resolvedEntry: MemoryEntry): ResolvedConflict {
        return this.conflictResolver.manualResolve(conflictId, resolvedEntry);
    }

    /**
     * Resolve all pending conflicts with strategy.
     */
    resolveAllConflicts(strategy?: ResolutionStrategy): ResolvedConflict[] {
        return this.conflictResolver.resolveAll(strategy);
    }

    // ============================================================================
    // CLEANUP
    // ============================================================================

    /**
     * Shutdown sync engine.
     */
    async shutdown(): Promise<void> {
        this.cancelScheduled();
        await this.eventLog.shutdown();
        memoryLogger.info('Sync engine shutdown');
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    private calculateNextSync(): Date {
        return new Date(Date.now() + this.config.autoSyncInterval);
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a sync engine instance.
 */
export function createSyncEngine(config: SyncEngineConfig): SyncEngine {
    return new SyncEngine(config);
}
