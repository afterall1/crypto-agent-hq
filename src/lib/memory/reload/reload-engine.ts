/**
 * CryptoAgentHQ - Reload Engine
 * @module lib/memory/reload/reload-engine
 * 
 * Core reload orchestration.
 * Konsey Değerlendirmesi: Robert Williams + Dr. Yuki Tanaka ⭐⭐⭐⭐⭐
 */

import type { MemoryEntry, MemoryTier, SessionSnapshot } from '../core/types';
import { memoryLogger } from '../core/config';
import { ReloadValidator, type ValidationResult } from './validation';
import { createReloadStrategy, type ReloadMode, type ReloadStrategyOptions, type ReloadStrategyResult } from './reload-strategy';
import { EventLog, type ReloadEventPayload } from '../events';
import type { FileStore } from '../persistence/file-store';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Reload options.
 */
export interface ReloadOptions {
    mode: ReloadMode;
    tiers?: MemoryTier[];
    snapshotId?: string;
    fromTimestamp?: Date;
    preserveCurrent?: boolean;
    validateAfter?: boolean;
    createBackup?: boolean;
}

/**
 * Reload result.
 */
export interface ReloadResult {
    success: boolean;
    reloadId: string;
    mode: ReloadMode;
    reloadedEntries: number;
    discardedEntries: number;
    validation: ValidationResult | null;
    duration: number;
    previousState?: Map<string, MemoryEntry>;
    sourceSnapshotId?: string;
    error?: string;
}

/**
 * Reload engine configuration.
 */
export interface ReloadEngineConfig {
    conversationId: string;
    sessionId: string;
    basePath: string;
    fileStore: FileStore;
    validateByDefault?: boolean;
    createBackupByDefault?: boolean;
}

// ============================================================================
// RELOAD ENGINE CLASS
// ============================================================================

/**
 * Core reload orchestration engine.
 */
export class ReloadEngine {
    private readonly config: Required<Omit<ReloadEngineConfig, 'fileStore'>> & { fileStore: FileStore };
    private readonly validator: ReloadValidator;
    private readonly eventLog: EventLog;

    // State for rollback
    private previousStates: Map<string, Map<string, MemoryEntry>> = new Map();
    private maxPreviousStates = 5;

    constructor(config: ReloadEngineConfig) {
        this.config = {
            ...config,
            validateByDefault: config.validateByDefault ?? true,
            createBackupByDefault: config.createBackupByDefault ?? true,
        };

        this.validator = new ReloadValidator();
        this.eventLog = new EventLog({
            basePath: config.basePath,
            conversationId: config.conversationId,
            sessionId: config.sessionId,
        });
    }

    // ============================================================================
    // MAIN RELOAD OPERATIONS
    // ============================================================================

    /**
     * Perform a reload operation.
     */
    async reload(
        currentEntries: Map<string, MemoryEntry>,
        options: Partial<ReloadOptions> = {}
    ): Promise<ReloadResult> {
        const reloadId = `reload-${Date.now()}`;
        const mode = options.mode ?? 'full';
        const startTime = Date.now();

        try {
            memoryLogger.info(`Starting ${mode} reload`, { reloadId });

            // Log reload start event
            await this.eventLog.append<ReloadEventPayload>('reload.started', {
                reloadId,
                mode,
                tiers: options.tiers,
            });

            // Get snapshot to reload from
            let snapshot: SessionSnapshot | null = null;
            let snapshotId = options.snapshotId;

            if (snapshotId) {
                snapshot = await this.config.fileStore.loadSnapshot(snapshotId);
            } else {
                // Get latest snapshot
                const snapshotIds = await this.config.fileStore.listSnapshots();
                if (snapshotIds.length > 0) {
                    snapshotId = snapshotIds.sort().reverse()[0];
                    snapshot = await this.config.fileStore.loadSnapshot(snapshotId);
                }
            }

            if (!snapshot) {
                throw new Error('No snapshot available for reload');
            }

            // Create backup of current state if requested
            const shouldBackup = options.createBackup ?? this.config.createBackupByDefault;
            if (shouldBackup) {
                this.savePreviousState(reloadId, currentEntries);
            }

            // Apply reload strategy
            const strategy = createReloadStrategy(mode);
            const strategyOptions: ReloadStrategyOptions = {
                mode,
                tiers: options.tiers,
                preserveLocal: options.preserveCurrent,
                fromTimestamp: options.fromTimestamp,
                snapshotId,
            };

            const strategyResult = await strategy.apply(
                snapshot,
                currentEntries,
                strategyOptions
            );

            // Create result map for validation
            const resultEntries = new Map<string, MemoryEntry>();
            strategyResult.reloadedEntries.forEach(e => resultEntries.set(e.id, e));

            // Validate if requested
            let validation: ValidationResult | null = null;
            const shouldValidate = options.validateAfter ?? this.config.validateByDefault;

            if (shouldValidate) {
                validation = this.validator.validate(resultEntries, snapshot);

                if (!validation.valid) {
                    memoryLogger.warn('Reload validation failed', {
                        errors: validation.errors.length,
                    });
                }
            }

            // Log reload complete event
            await this.eventLog.append<ReloadEventPayload>('reload.completed', {
                reloadId,
                mode,
                sourceSnapshotId: snapshotId,
                entriesReloaded: strategyResult.reloadedEntries.length,
                entriesDiscarded: strategyResult.discardedEntries.length,
                duration: Date.now() - startTime,
            });

            const duration = Date.now() - startTime;
            memoryLogger.info('Reload complete', {
                reloadId,
                reloaded: strategyResult.reloadedEntries.length,
                discarded: strategyResult.discardedEntries.length,
                duration: `${duration}ms`,
            });

            return {
                success: true,
                reloadId,
                mode,
                reloadedEntries: strategyResult.reloadedEntries.length,
                discardedEntries: strategyResult.discardedEntries.length,
                validation,
                duration,
                previousState: shouldBackup ? currentEntries : undefined,
                sourceSnapshotId: snapshotId,
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Log reload failed event
            await this.eventLog.append<ReloadEventPayload>('reload.failed', {
                reloadId,
                mode,
                error: errorMessage,
            });

            memoryLogger.error('Reload failed', error);

            return {
                success: false,
                reloadId,
                mode,
                reloadedEntries: 0,
                discardedEntries: 0,
                validation: null,
                duration: Date.now() - startTime,
                error: errorMessage,
            };
        }
    }

    /**
     * Reload from a specific snapshot.
     */
    async reloadFromSnapshot(
        snapshotId: string,
        currentEntries: Map<string, MemoryEntry>,
        options?: Partial<Omit<ReloadOptions, 'snapshotId'>>
    ): Promise<ReloadResult> {
        return this.reload(currentEntries, { ...options, snapshotId });
    }

    /**
     * Reload a specific tier.
     */
    async reloadTier(
        tier: MemoryTier,
        currentEntries: Map<string, MemoryEntry>,
        options?: Partial<Omit<ReloadOptions, 'tiers'>>
    ): Promise<ReloadResult> {
        return this.reload(currentEntries, {
            ...options,
            mode: 'selective',
            tiers: [tier],
        });
    }

    // ============================================================================
    // ROLLBACK OPERATIONS
    // ============================================================================

    /**
     * Rollback to a specific point in time.
     */
    async rollbackTo(
        timestamp: Date,
        currentEntries: Map<string, MemoryEntry>
    ): Promise<ReloadResult> {
        return this.reload(currentEntries, {
            mode: 'rollback',
            fromTimestamp: timestamp,
        });
    }

    /**
     * Rollback the last reload operation.
     */
    async rollbackLastReload(currentEntries: Map<string, MemoryEntry>): Promise<ReloadResult> {
        const reloadId = `rollback-${Date.now()}`;
        const startTime = Date.now();

        // Get most recent previous state
        const previousStateKeys = Array.from(this.previousStates.keys());
        if (previousStateKeys.length === 0) {
            return {
                success: false,
                reloadId,
                mode: 'rollback',
                reloadedEntries: 0,
                discardedEntries: 0,
                validation: null,
                duration: Date.now() - startTime,
                error: 'No previous state available for rollback',
            };
        }

        const latestKey = previousStateKeys[previousStateKeys.length - 1];
        const previousState = this.previousStates.get(latestKey)!;

        // Log rollback event
        await this.eventLog.append<ReloadEventPayload>('reload.rollback', {
            reloadId,
            mode: 'rollback',
            entriesReloaded: previousState.size,
            entriesDiscarded: currentEntries.size,
        });

        // Remove used state
        this.previousStates.delete(latestKey);

        memoryLogger.info('Rollback complete', {
            reloadId,
            restoredEntries: previousState.size,
        });

        return {
            success: true,
            reloadId,
            mode: 'rollback',
            reloadedEntries: previousState.size,
            discardedEntries: currentEntries.size,
            validation: null,
            duration: Date.now() - startTime,
            previousState,
        };
    }

    /**
     * Check if rollback is available.
     */
    canRollback(): boolean {
        return this.previousStates.size > 0;
    }

    /**
     * Get available rollback points.
     */
    getRollbackPoints(): string[] {
        return Array.from(this.previousStates.keys());
    }

    // ============================================================================
    // VALIDATION
    // ============================================================================

    /**
     * Validate current memory state.
     */
    validate(entries: Map<string, MemoryEntry>): ValidationResult {
        return this.validator.validate(entries);
    }

    /**
     * Quick validation check.
     */
    quickValidate(entries: Map<string, MemoryEntry>): boolean {
        return this.validator.quickValidate(entries);
    }

    // ============================================================================
    // LIST SNAPSHOTS
    // ============================================================================

    /**
     * List available snapshots.
     */
    async listSnapshots(): Promise<string[]> {
        return this.config.fileStore.listSnapshots();
    }

    /**
     * Get snapshot details.
     */
    async getSnapshotDetails(snapshotId: string): Promise<{
        id: string;
        timestamp: Date;
        messageCount: number;
        entityCount: number;
    } | null> {
        const snapshot = await this.config.fileStore.loadSnapshot(snapshotId);
        if (!snapshot) return null;

        return {
            id: snapshot.id,
            timestamp: snapshot.timestamp,
            messageCount: snapshot.messages.length,
            entityCount: snapshot.entities.length,
        };
    }

    // ============================================================================
    // CLEANUP
    // ============================================================================

    /**
     * Shutdown reload engine.
     */
    async shutdown(): Promise<void> {
        await this.eventLog.shutdown();
        this.previousStates.clear();
        memoryLogger.info('Reload engine shutdown');
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    private savePreviousState(reloadId: string, entries: Map<string, MemoryEntry>): void {
        // Clone entries
        const clone = new Map<string, MemoryEntry>();
        entries.forEach((entry, id) => {
            clone.set(id, { ...entry });
        });

        this.previousStates.set(reloadId, clone);

        // Trim if too many
        if (this.previousStates.size > this.maxPreviousStates) {
            const oldestKey = this.previousStates.keys().next().value;
            if (oldestKey) {
                this.previousStates.delete(oldestKey);
            }
        }
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a reload engine instance.
 */
export function createReloadEngine(config: ReloadEngineConfig): ReloadEngine {
    return new ReloadEngine(config);
}
