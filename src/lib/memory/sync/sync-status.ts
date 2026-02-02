/**
 * CryptoAgentHQ - Sync Status Tracker
 * @module lib/memory/sync/sync-status
 * 
 * Tracks sync progress and state.
 * Konsey Değerlendirmesi: Dr. Fatima Al-Hassan (DevX) + Tom Anderson (DevOps) ⭐⭐⭐⭐⭐
 */

import type { MemoryTier } from '../core/types';
import { memoryLogger } from '../core/config';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Current sync state.
 */
export type SyncState =
    | 'idle'
    | 'syncing'
    | 'error'
    | 'conflict'
    | 'scheduled'
    | 'paused';

/**
 * Current sync phase.
 */
export type SyncPhase =
    | 'preparing'
    | 'calculating-diff'
    | 'resolving-conflicts'
    | 'applying-changes'
    | 'validating'
    | 'complete';

/**
 * Sync progress information.
 */
export interface SyncProgress {
    phase: SyncPhase;
    progress: number;  // 0-100
    currentTier?: MemoryTier;
    entriesProcessed: number;
    entriesTotal: number;
    elapsedMs: number;
    estimatedRemainingMs?: number;
    currentOperation?: string;
}

/**
 * Information about last sync.
 */
export interface SyncInfo {
    syncId: string;
    startTime: Date;
    endTime: Date;
    result: 'success' | 'partial' | 'failed';
    entriesSynced: number;
    conflictsResolved: number;
    duration: number;
    error?: string;
}

/**
 * State change event.
 */
export interface StateChangeEvent {
    previousState: SyncState;
    currentState: SyncState;
    timestamp: Date;
    reason?: string;
}

// ============================================================================
// SYNC STATUS TRACKER CLASS
// ============================================================================

/**
 * Tracks sync operation status and progress.
 */
export class SyncStatusTracker {
    private state: SyncState = 'idle';
    private progress: SyncProgress | null = null;
    private lastSyncInfo: SyncInfo | null = null;
    private nextScheduledSync: Date | null = null;

    // History
    private syncHistory: SyncInfo[] = [];
    private maxHistoryLength = 100;

    // Event handlers
    private stateChangeHandlers: Set<(event: StateChangeEvent) => void> = new Set();
    private progressHandlers: Set<(progress: SyncProgress) => void> = new Set();

    // Timing
    private syncStartTime: number | null = null;

    // ============================================================================
    // STATE MANAGEMENT
    // ============================================================================

    /**
     * Get current sync state.
     */
    getState(): SyncState {
        return this.state;
    }

    /**
     * Set sync state.
     */
    setState(newState: SyncState, reason?: string): void {
        const previousState = this.state;
        this.state = newState;

        const event: StateChangeEvent = {
            previousState,
            currentState: newState,
            timestamp: new Date(),
            reason,
        };

        memoryLogger.debug(`Sync state changed: ${previousState} → ${newState}`, { reason });

        this.stateChangeHandlers.forEach(handler => {
            try {
                handler(event);
            } catch (error) {
                memoryLogger.error('State change handler error', error);
            }
        });
    }

    /**
     * Check if currently syncing.
     */
    isSyncing(): boolean {
        return this.state === 'syncing';
    }

    /**
     * Check if has pending conflicts.
     */
    hasConflicts(): boolean {
        return this.state === 'conflict';
    }

    // ============================================================================
    // PROGRESS TRACKING
    // ============================================================================

    /**
     * Get current progress.
     */
    getProgress(): SyncProgress | null {
        return this.progress;
    }

    /**
     * Start tracking a sync operation.
     */
    startSync(syncId: string, totalEntries: number): void {
        this.syncStartTime = Date.now();
        this.progress = {
            phase: 'preparing',
            progress: 0,
            entriesProcessed: 0,
            entriesTotal: totalEntries,
            elapsedMs: 0,
        };
        this.setState('syncing');
    }

    /**
     * Update sync progress.
     */
    updateProgress(update: Partial<SyncProgress>): void {
        if (!this.progress) return;

        this.progress = {
            ...this.progress,
            ...update,
            elapsedMs: this.syncStartTime ? Date.now() - this.syncStartTime : 0,
        };

        // Calculate estimated remaining time
        if (this.progress.progress > 0 && this.progress.progress < 100) {
            const elapsed = this.progress.elapsedMs;
            const remaining = (elapsed / this.progress.progress) * (100 - this.progress.progress);
            this.progress.estimatedRemainingMs = Math.round(remaining);
        }

        this.progressHandlers.forEach(handler => {
            try {
                handler(this.progress!);
            } catch (error) {
                memoryLogger.error('Progress handler error', error);
            }
        });
    }

    /**
     * Set current phase.
     */
    setPhase(phase: SyncPhase, progress?: number): void {
        const phaseProgress: Record<SyncPhase, number> = {
            'preparing': 5,
            'calculating-diff': 20,
            'resolving-conflicts': 40,
            'applying-changes': 70,
            'validating': 90,
            'complete': 100,
        };

        this.updateProgress({
            phase,
            progress: progress ?? phaseProgress[phase],
        });
    }

    /**
     * Complete sync operation.
     */
    completeSync(
        syncId: string,
        result: SyncInfo['result'],
        stats: {
            entriesSynced: number;
            conflictsResolved: number;
            error?: string;
        }
    ): void {
        const endTime = new Date();
        const duration = this.syncStartTime ? Date.now() - this.syncStartTime : 0;

        const info: SyncInfo = {
            syncId,
            startTime: new Date(this.syncStartTime ?? Date.now()),
            endTime,
            result,
            entriesSynced: stats.entriesSynced,
            conflictsResolved: stats.conflictsResolved,
            duration,
            error: stats.error,
        };

        this.lastSyncInfo = info;
        this.syncHistory.unshift(info);

        // Trim history
        if (this.syncHistory.length > this.maxHistoryLength) {
            this.syncHistory = this.syncHistory.slice(0, this.maxHistoryLength);
        }

        this.progress = null;
        this.syncStartTime = null;

        this.setState(result === 'failed' ? 'error' : 'idle');
    }

    // ============================================================================
    // SCHEDULING
    // ============================================================================

    /**
     * Get next scheduled sync time.
     */
    getNextScheduledSync(): Date | null {
        return this.nextScheduledSync;
    }

    /**
     * Set next scheduled sync.
     */
    setNextScheduledSync(time: Date): void {
        this.nextScheduledSync = time;
        if (this.state === 'idle') {
            this.setState('scheduled');
        }
    }

    /**
     * Clear scheduled sync.
     */
    clearSchedule(): void {
        this.nextScheduledSync = null;
        if (this.state === 'scheduled') {
            this.setState('idle');
        }
    }

    // ============================================================================
    // HISTORY & STATS
    // ============================================================================

    /**
     * Get last sync info.
     */
    getLastSyncInfo(): SyncInfo | null {
        return this.lastSyncInfo;
    }

    /**
     * Get sync history.
     */
    getSyncHistory(limit?: number): SyncInfo[] {
        return limit ? this.syncHistory.slice(0, limit) : [...this.syncHistory];
    }

    /**
     * Get sync statistics.
     */
    getStats(): {
        totalSyncs: number;
        successfulSyncs: number;
        failedSyncs: number;
        averageDuration: number;
        lastSuccessfulSync?: Date;
    } {
        const successful = this.syncHistory.filter(s => s.result === 'success');
        const failed = this.syncHistory.filter(s => s.result === 'failed');

        const avgDuration = this.syncHistory.length > 0
            ? this.syncHistory.reduce((sum, s) => sum + s.duration, 0) / this.syncHistory.length
            : 0;

        return {
            totalSyncs: this.syncHistory.length,
            successfulSyncs: successful.length,
            failedSyncs: failed.length,
            averageDuration: Math.round(avgDuration),
            lastSuccessfulSync: successful[0]?.endTime,
        };
    }

    // ============================================================================
    // EVENT SUBSCRIPTIONS
    // ============================================================================

    /**
     * Subscribe to state changes.
     */
    onStateChange(handler: (event: StateChangeEvent) => void): () => void {
        this.stateChangeHandlers.add(handler);
        return () => this.stateChangeHandlers.delete(handler);
    }

    /**
     * Subscribe to progress updates.
     */
    onProgress(handler: (progress: SyncProgress) => void): () => void {
        this.progressHandlers.add(handler);
        return () => this.progressHandlers.delete(handler);
    }

    // ============================================================================
    // UTILITIES
    // ============================================================================

    /**
     * Create a status summary string.
     */
    getSummary(): string {
        switch (this.state) {
            case 'idle':
                if (this.lastSyncInfo) {
                    return `Last sync: ${this.formatDuration(Date.now() - this.lastSyncInfo.endTime.getTime())} ago`;
                }
                return 'No sync performed yet';

            case 'syncing':
                if (this.progress) {
                    return `Syncing: ${this.progress.phase} (${this.progress.progress}%)`;
                }
                return 'Syncing...';

            case 'scheduled':
                if (this.nextScheduledSync) {
                    const until = this.nextScheduledSync.getTime() - Date.now();
                    return `Next sync in ${this.formatDuration(until)}`;
                }
                return 'Sync scheduled';

            case 'error':
                return `Error: ${this.lastSyncInfo?.error ?? 'Unknown error'}`;

            case 'conflict':
                return 'Conflicts pending resolution';

            case 'paused':
                return 'Sync paused';

            default:
                return 'Unknown state';
        }
    }

    /**
     * Reset tracker state.
     */
    reset(): void {
        this.state = 'idle';
        this.progress = null;
        this.syncStartTime = null;
        this.nextScheduledSync = null;
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    private formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${Math.round(ms / 1000)}s`;
        if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
        return `${Math.round(ms / 3600000)}h`;
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a sync status tracker instance.
 */
export function createSyncStatusTracker(): SyncStatusTracker {
    return new SyncStatusTracker();
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let globalTracker: SyncStatusTracker | null = null;

/**
 * Get the global sync status tracker.
 */
export function getSyncStatusTracker(): SyncStatusTracker {
    if (!globalTracker) {
        globalTracker = createSyncStatusTracker();
    }
    return globalTracker;
}
