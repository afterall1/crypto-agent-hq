/**
 * CryptoAgentHQ - Memory Reload Command
 * @module lib/memory/commands/reload-command
 * 
 * CLI/API interface for memory reload operations.
 * Konsey Değerlendirmesi: Michael Chen (API Design) ⭐⭐⭐⭐⭐
 */

import type { MemoryEntry, MemoryTier } from '../core/types';
import { memoryLogger } from '../core/config';
import { ReloadEngine, type ReloadOptions, type ReloadResult, type ReloadEngineConfig } from '../reload';
import type { FileStore } from '../persistence/file-store';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Reload command options (user-facing).
 */
export interface ReloadCommandOptions {
    /** Reload mode: full, selective, rollback, or merge */
    mode?: 'full' | 'selective' | 'rollback' | 'merge';
    /** Specific snapshot ID to reload from */
    snapshotId?: string;
    /** Specific tiers to reload (for selective mode) */
    tiers?: MemoryTier[];
    /** Point in time to rollback to */
    fromTimestamp?: Date;
    /** Preserve current entries during merge */
    preserveCurrent?: boolean;
    /** Validate after reload */
    validate?: boolean;
    /** Create backup before reload */
    backup?: boolean;
}

/**
 * Snapshot info for listing.
 */
export interface SnapshotInfo {
    id: string;
    timestamp: string;
    messageCount: number;
    entityCount: number;
}

/**
 * Reload command result (user-facing).
 */
export interface ReloadCommandResult {
    success: boolean;
    message: string;
    details: {
        reloadId: string;
        reloadedEntries: number;
        discardedEntries: number;
        sourceSnapshot?: string;
        validationPassed?: boolean;
        validationErrors?: number;
        duration: string;
    };
    /** The reloaded entries (for applying to memory) */
    entries?: MemoryEntry[];
    error?: string;
}

// ============================================================================
// RELOAD COMMAND CLASS
// ============================================================================

/**
 * User-facing reload command interface.
 */
export class ReloadCommand {
    private reloadEngine: ReloadEngine | null = null;
    private config: ReloadEngineConfig | null = null;

    /**
     * Initialize the reload command with configuration.
     */
    initialize(config: ReloadEngineConfig): void {
        this.config = config;
        this.reloadEngine = new ReloadEngine(config);
        memoryLogger.debug('ReloadCommand initialized');
    }

    /**
     * Check if initialized.
     */
    isInitialized(): boolean {
        return this.reloadEngine !== null;
    }

    /**
     * Execute reload command.
     */
    async execute(
        currentEntries: Map<string, MemoryEntry>,
        options: ReloadCommandOptions = {}
    ): Promise<ReloadCommandResult> {
        if (!this.reloadEngine) {
            return {
                success: false,
                message: 'Reload command not initialized',
                details: this.emptyDetails(),
                error: 'Call initialize() before executing reload',
            };
        }

        try {
            // Convert user-facing options to engine options
            const engineOptions: Partial<ReloadOptions> = {
                mode: options.mode ?? 'full',
                snapshotId: options.snapshotId,
                tiers: options.tiers,
                fromTimestamp: options.fromTimestamp,
                preserveCurrent: options.preserveCurrent,
                validateAfter: options.validate,
                createBackup: options.backup,
            };

            // Execute reload
            const result = await this.reloadEngine.reload(currentEntries, engineOptions);

            return this.formatResult(result);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            memoryLogger.error('Reload command failed', error);

            return {
                success: false,
                message: `Reload failed: ${errorMessage}`,
                details: this.emptyDetails(),
                error: errorMessage,
            };
        }
    }

    /**
     * Reload from latest snapshot.
     */
    async reloadLatest(currentEntries: Map<string, MemoryEntry>): Promise<ReloadCommandResult> {
        return this.execute(currentEntries, { mode: 'full' });
    }

    /**
     * Reload from specific snapshot.
     */
    async reloadFromSnapshot(
        snapshotId: string,
        currentEntries: Map<string, MemoryEntry>
    ): Promise<ReloadCommandResult> {
        return this.execute(currentEntries, { mode: 'full', snapshotId });
    }

    /**
     * Reload specific tier.
     */
    async reloadTier(
        tier: MemoryTier,
        currentEntries: Map<string, MemoryEntry>
    ): Promise<ReloadCommandResult> {
        return this.execute(currentEntries, { mode: 'selective', tiers: [tier] });
    }

    /**
     * Rollback to previous state.
     */
    async rollback(currentEntries: Map<string, MemoryEntry>): Promise<ReloadCommandResult> {
        if (!this.reloadEngine) {
            return {
                success: false,
                message: 'Reload command not initialized',
                details: this.emptyDetails(),
                error: 'Call initialize() before executing rollback',
            };
        }

        try {
            const result = await this.reloadEngine.rollbackLastReload(currentEntries);
            return this.formatResult(result);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                message: `Rollback failed: ${errorMessage}`,
                details: this.emptyDetails(),
                error: errorMessage,
            };
        }
    }

    /**
     * Merge snapshot with current state.
     */
    async merge(
        currentEntries: Map<string, MemoryEntry>,
        options?: { snapshotId?: string; preserveCurrent?: boolean }
    ): Promise<ReloadCommandResult> {
        return this.execute(currentEntries, {
            mode: 'merge',
            snapshotId: options?.snapshotId,
            preserveCurrent: options?.preserveCurrent ?? true,
        });
    }

    /**
     * List available snapshots.
     */
    async listSnapshots(): Promise<SnapshotInfo[]> {
        if (!this.reloadEngine) {
            return [];
        }

        const ids = await this.reloadEngine.listSnapshots();
        const snapshots: SnapshotInfo[] = [];

        for (const id of ids) {
            const details = await this.reloadEngine.getSnapshotDetails(id);
            if (details) {
                snapshots.push({
                    id: details.id,
                    timestamp: details.timestamp.toISOString(),
                    messageCount: details.messageCount,
                    entityCount: details.entityCount,
                });
            }
        }

        return snapshots;
    }

    /**
     * Check if rollback is available.
     */
    canRollback(): boolean {
        return this.reloadEngine?.canRollback() ?? false;
    }

    /**
     * Validate current memory state.
     */
    validate(entries: Map<string, MemoryEntry>): {
        valid: boolean;
        errors: number;
        warnings: number;
        summary: string;
    } {
        if (!this.reloadEngine) {
            return {
                valid: false,
                errors: 1,
                warnings: 0,
                summary: 'Reload command not initialized',
            };
        }

        const result = this.reloadEngine.validate(entries);
        return {
            valid: result.valid,
            errors: result.errors.length,
            warnings: result.warnings.length,
            summary: result.summary,
        };
    }

    /**
     * Shutdown.
     */
    async shutdown(): Promise<void> {
        if (this.reloadEngine) {
            await this.reloadEngine.shutdown();
            this.reloadEngine = null;
        }
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    private formatResult(result: ReloadResult): ReloadCommandResult {
        const durationStr = result.duration < 1000
            ? `${result.duration}ms`
            : `${(result.duration / 1000).toFixed(2)}s`;

        let message: string;
        if (result.success) {
            if (result.reloadedEntries === 0) {
                message = 'No entries to reload';
            } else {
                message = `Reloaded ${result.reloadedEntries} entries`;
                if (result.discardedEntries > 0) {
                    message += `, discarded ${result.discardedEntries}`;
                }
            }
        } else {
            message = `Reload failed: ${result.error}`;
        }

        return {
            success: result.success,
            message,
            details: {
                reloadId: result.reloadId,
                reloadedEntries: result.reloadedEntries,
                discardedEntries: result.discardedEntries,
                sourceSnapshot: result.sourceSnapshotId,
                validationPassed: result.validation?.valid,
                validationErrors: result.validation?.errors.length,
                duration: durationStr,
            },
            error: result.error,
        };
    }

    private emptyDetails() {
        return {
            reloadId: '',
            reloadedEntries: 0,
            discardedEntries: 0,
            duration: '0ms',
        };
    }
}

// ============================================================================
// FACTORY & SINGLETON
// ============================================================================

let globalReloadCommand: ReloadCommand | null = null;

/**
 * Get the global reload command instance.
 */
export function getReloadCommand(): ReloadCommand {
    if (!globalReloadCommand) {
        globalReloadCommand = new ReloadCommand();
    }
    return globalReloadCommand;
}

/**
 * Create a new reload command instance.
 */
export function createReloadCommand(): ReloadCommand {
    return new ReloadCommand();
}
