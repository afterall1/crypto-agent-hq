/**
 * CryptoAgentHQ - Memory Sync Command
 * @module lib/memory/commands/sync-command
 * 
 * CLI/API interface for memory sync operations.
 * Konsey Değerlendirmesi: Michael Chen (API Design) ⭐⭐⭐⭐⭐
 */

import type { MemoryEntry, MemoryTier } from '../core/types';
import { memoryLogger } from '../core/config';
import { SyncEngine, type SyncOptions, type SyncResult, type SyncEngineConfig } from '../sync';
import type { ResolutionStrategy } from '../sync';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Sync command options (user-facing).
 */
export interface SyncCommandOptions {
    /** Sync mode: full, incremental, or tier-specific */
    mode?: 'full' | 'incremental' | 'tier-specific';
    /** Specific tiers to sync (for tier-specific mode) */
    tiers?: MemoryTier[];
    /** Force sync even if no changes detected */
    force?: boolean;
    /** Preview changes without applying */
    dryRun?: boolean;
    /** Timeout in milliseconds */
    timeout?: number;
    /** Conflict resolution strategy */
    conflictStrategy?: ResolutionStrategy;
    /** Progress callback */
    onProgress?: (progress: CommandSyncProgress) => void;
}

/**
 * Simplified progress for command users.
 */
export interface CommandSyncProgress {
    phase: string;
    percent: number;
    message: string;
}

/**
 * Sync command result (user-facing).
 */
export interface SyncCommandResult {
    success: boolean;
    message: string;
    details: {
        syncId: string;
        entriesSynced: number;
        conflictsResolved: number;
        conflictsPending: number;
        duration: string;
        checksum: string;
    };
    error?: string;
}

// ============================================================================
// SYNC COMMAND CLASS
// ============================================================================

/**
 * User-facing sync command interface.
 */
export class SyncCommand {
    private syncEngine: SyncEngine | null = null;
    private config: SyncEngineConfig | null = null;

    /**
     * Initialize the sync command with configuration.
     */
    initialize(config: SyncEngineConfig): void {
        this.config = config;
        this.syncEngine = new SyncEngine(config);
        memoryLogger.debug('SyncCommand initialized');
    }

    /**
     * Check if initialized.
     */
    isInitialized(): boolean {
        return this.syncEngine !== null;
    }

    /**
     * Execute sync command.
     */
    async execute(
        entries: MemoryEntry[],
        options: SyncCommandOptions = {}
    ): Promise<SyncCommandResult> {
        if (!this.syncEngine) {
            return {
                success: false,
                message: 'Sync command not initialized',
                details: this.emptyDetails(),
                error: 'Call initialize() before executing sync',
            };
        }

        try {
            // Convert user-facing options to engine options
            const engineOptions: Partial<SyncOptions> = {
                mode: options.mode ?? 'incremental',
                tiers: options.tiers,
                force: options.force,
                dryRun: options.dryRun,
                timeout: options.timeout,
                conflictStrategy: options.conflictStrategy,
            };

            // Wrap progress handler if provided
            if (options.onProgress) {
                engineOptions.onProgress = (progress) => {
                    options.onProgress!({
                        phase: progress.phase,
                        percent: progress.progress,
                        message: this.getProgressMessage(progress),
                    });
                };
            }

            // Execute sync
            const result = await this.syncEngine.sync(entries, engineOptions);

            return this.formatResult(result);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            memoryLogger.error('Sync command failed', error);

            return {
                success: false,
                message: `Sync failed: ${errorMessage}`,
                details: this.emptyDetails(),
                error: errorMessage,
            };
        }
    }

    /**
     * Quick sync (incremental with defaults).
     */
    async quickSync(entries: MemoryEntry[]): Promise<SyncCommandResult> {
        return this.execute(entries, { mode: 'incremental' });
    }

    /**
     * Force full sync.
     */
    async fullSync(entries: MemoryEntry[]): Promise<SyncCommandResult> {
        return this.execute(entries, { mode: 'full', force: true });
    }

    /**
     * Sync specific tier.
     */
    async syncTier(entries: MemoryEntry[], tier: MemoryTier): Promise<SyncCommandResult> {
        const tierEntries = entries.filter(e => e.tier === tier);
        return this.execute(tierEntries, { mode: 'tier-specific', tiers: [tier] });
    }

    /**
     * Preview sync (dry run).
     */
    async preview(entries: MemoryEntry[]): Promise<SyncCommandResult> {
        return this.execute(entries, { mode: 'incremental', dryRun: true });
    }

    /**
     * Get sync status.
     */
    getStatus(): {
        state: string;
        lastSync: string | null;
        pendingConflicts: number;
    } {
        if (!this.syncEngine) {
            return {
                state: 'not_initialized',
                lastSync: null,
                pendingConflicts: 0,
            };
        }

        const status = this.syncEngine.getSyncStatus();
        return {
            state: status.state,
            lastSync: status.lastSync?.endTime.toISOString() ?? null,
            pendingConflicts: status.pendingConflicts,
        };
    }

    /**
     * Get pending conflicts.
     */
    getPendingConflicts(): Array<{
        id: string;
        entryId: string;
        tier: MemoryTier;
        autoResolvable: boolean;
    }> {
        if (!this.syncEngine) return [];

        return this.syncEngine.getPendingConflicts().map(c => ({
            id: c.id,
            entryId: c.entryId,
            tier: c.tier,
            autoResolvable: c.autoResolvable,
        }));
    }

    /**
     * Resolve all conflicts.
     */
    resolveAllConflicts(strategy?: ResolutionStrategy): number {
        if (!this.syncEngine) return 0;

        const resolved = this.syncEngine.resolveAllConflicts(strategy);
        return resolved.length;
    }

    /**
     * Shutdown.
     */
    async shutdown(): Promise<void> {
        if (this.syncEngine) {
            await this.syncEngine.shutdown();
            this.syncEngine = null;
        }
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    private formatResult(result: SyncResult): SyncCommandResult {
        const durationStr = result.duration < 1000
            ? `${result.duration}ms`
            : `${(result.duration / 1000).toFixed(2)}s`;

        let message: string;
        if (result.success) {
            if (result.syncedEntries === 0) {
                message = 'No changes to sync';
            } else {
                message = `Synced ${result.syncedEntries} entries`;
                if (result.conflictsResolved > 0) {
                    message += `, resolved ${result.conflictsResolved} conflicts`;
                }
            }
        } else {
            message = `Sync failed: ${result.error}`;
        }

        return {
            success: result.success,
            message,
            details: {
                syncId: result.syncId,
                entriesSynced: result.syncedEntries,
                conflictsResolved: result.conflictsResolved,
                conflictsPending: result.conflictsPending.length,
                duration: durationStr,
                checksum: result.checksum,
            },
            error: result.error,
        };
    }

    private emptyDetails() {
        return {
            syncId: '',
            entriesSynced: 0,
            conflictsResolved: 0,
            conflictsPending: 0,
            duration: '0ms',
            checksum: '',
        };
    }

    private getProgressMessage(progress: { phase: string; progress: number }): string {
        const messages: Record<string, string> = {
            'preparing': 'Preparing sync...',
            'calculating-diff': 'Calculating changes...',
            'resolving-conflicts': 'Resolving conflicts...',
            'applying-changes': 'Applying changes...',
            'validating': 'Validating...',
            'complete': 'Sync complete!',
        };
        return messages[progress.phase] ?? 'Syncing...';
    }
}

// ============================================================================
// FACTORY & SINGLETON
// ============================================================================

let globalSyncCommand: SyncCommand | null = null;

/**
 * Get the global sync command instance.
 */
export function getSyncCommand(): SyncCommand {
    if (!globalSyncCommand) {
        globalSyncCommand = new SyncCommand();
    }
    return globalSyncCommand;
}

/**
 * Create a new sync command instance.
 */
export function createSyncCommand(): SyncCommand {
    return new SyncCommand();
}
