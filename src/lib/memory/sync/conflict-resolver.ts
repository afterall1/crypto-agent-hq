/**
 * CryptoAgentHQ - Conflict Resolver
 * @module lib/memory/sync/conflict-resolver
 * 
 * Handles memory conflicts during sync operations.
 * Konsey Değerlendirmesi: Dr. Sarah Chen (Distributed Systems) ⭐⭐⭐⭐⭐
 */

import type { MemoryEntry, MemoryTier } from '../core/types';
import { memoryLogger } from '../core/config';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Resolution strategy for conflicts.
 */
export type ResolutionStrategy =
    | 'last-write-wins'
    | 'first-write-wins'
    | 'merge'
    | 'manual'
    | 'prefer-local'
    | 'prefer-remote';

/**
 * A detected conflict record.
 */
export interface ConflictRecord {
    id: string;
    entryId: string;
    localVersion: MemoryEntry;
    remoteVersion: MemoryEntry;
    timestamp: Date;
    tier: MemoryTier;
    autoResolvable: boolean;
    suggestedResolution: ResolutionStrategy;
    diffDetails: ConflictDiff;
}

/**
 * Detailed diff between conflicting versions.
 */
export interface ConflictDiff {
    contentChanged: boolean;
    importanceChanged: boolean;
    metadataChanged: boolean;
    localNewer: boolean;
    timeDelta: number;
}

/**
 * Result of conflict resolution.
 */
export interface ResolvedConflict {
    conflictId: string;
    entryId: string;
    strategy: ResolutionStrategy;
    resolvedEntry: MemoryEntry;
    wasAutoResolved: boolean;
}

/**
 * Conflict resolver configuration.
 */
export interface ConflictResolverConfig {
    defaultStrategy: ResolutionStrategy;
    autoResolveThresholdMs: number;
    maxPendingConflicts: number;
}

// ============================================================================
// CONFLICT RESOLVER CLASS
// ============================================================================

/**
 * Resolves conflicts between local and remote memory states.
 */
export class ConflictResolver {
    private readonly config: ConflictResolverConfig;
    private pendingConflicts: Map<string, ConflictRecord> = new Map();
    private resolvedHistory: ResolvedConflict[] = [];

    constructor(config?: Partial<ConflictResolverConfig>) {
        this.config = {
            defaultStrategy: config?.defaultStrategy ?? 'last-write-wins',
            autoResolveThresholdMs: config?.autoResolveThresholdMs ?? 60000,
            maxPendingConflicts: config?.maxPendingConflicts ?? 100,
        };
    }

    // ============================================================================
    // CONFLICT DETECTION
    // ============================================================================

    /**
     * Detect conflicts between local and remote entries.
     */
    detectConflicts(
        local: Map<string, MemoryEntry>,
        remote: Map<string, MemoryEntry>
    ): ConflictRecord[] {
        const conflicts: ConflictRecord[] = [];

        local.forEach((localEntry, id) => {
            const remoteEntry = remote.get(id);

            if (!remoteEntry) {
                return; // Not a conflict, just a local addition
            }

            // Check if entries are different
            if (this.entriesConflict(localEntry, remoteEntry)) {
                const conflict = this.createConflictRecord(localEntry, remoteEntry);
                conflicts.push(conflict);
                this.pendingConflicts.set(conflict.id, conflict);
            }
        });

        memoryLogger.info(`Detected ${conflicts.length} conflicts`);
        return conflicts;
    }

    /**
     * Check if a specific entry has a conflict.
     */
    hasConflict(entryId: string): boolean {
        for (const conflict of this.pendingConflicts.values()) {
            if (conflict.entryId === entryId) {
                return true;
            }
        }
        return false;
    }

    // ============================================================================
    // CONFLICT RESOLUTION
    // ============================================================================

    /**
     * Resolve a single conflict using specified strategy.
     */
    resolve(conflict: ConflictRecord, strategy?: ResolutionStrategy): ResolvedConflict {
        const effectiveStrategy = strategy ?? conflict.suggestedResolution;
        let resolvedEntry: MemoryEntry;

        switch (effectiveStrategy) {
            case 'last-write-wins':
                resolvedEntry = conflict.diffDetails.localNewer
                    ? conflict.localVersion
                    : conflict.remoteVersion;
                break;

            case 'first-write-wins':
                resolvedEntry = conflict.diffDetails.localNewer
                    ? conflict.remoteVersion
                    : conflict.localVersion;
                break;

            case 'prefer-local':
                resolvedEntry = conflict.localVersion;
                break;

            case 'prefer-remote':
                resolvedEntry = conflict.remoteVersion;
                break;

            case 'merge':
                resolvedEntry = this.mergeEntries(
                    conflict.localVersion,
                    conflict.remoteVersion
                );
                break;

            case 'manual':
                throw new Error(`Conflict ${conflict.id} requires manual resolution`);

            default:
                resolvedEntry = conflict.localVersion;
        }

        const resolved: ResolvedConflict = {
            conflictId: conflict.id,
            entryId: conflict.entryId,
            strategy: effectiveStrategy,
            resolvedEntry,
            wasAutoResolved: true, // manual case throws above, so this is always auto-resolved
        };

        // Remove from pending
        this.pendingConflicts.delete(conflict.id);
        this.resolvedHistory.unshift(resolved);

        memoryLogger.debug(`Conflict resolved: ${conflict.id}`, { strategy: effectiveStrategy });

        return resolved;
    }

    /**
     * Resolve all pending conflicts using specified strategy.
     */
    resolveAll(strategy?: ResolutionStrategy): ResolvedConflict[] {
        const resolved: ResolvedConflict[] = [];
        const effectiveStrategy = strategy ?? this.config.defaultStrategy;

        for (const conflict of this.pendingConflicts.values()) {
            if (effectiveStrategy === 'manual' && !conflict.autoResolvable) {
                continue;
            }

            try {
                const result = this.resolve(conflict, effectiveStrategy);
                resolved.push(result);
            } catch (error) {
                memoryLogger.warn(`Could not resolve conflict ${conflict.id}`, error);
            }
        }

        memoryLogger.info(`Resolved ${resolved.length} conflicts`);
        return resolved;
    }

    /**
     * Auto-resolve conflicts that are safe to resolve automatically.
     */
    autoResolve(): ResolvedConflict[] {
        const resolved: ResolvedConflict[] = [];

        for (const conflict of this.pendingConflicts.values()) {
            if (!conflict.autoResolvable) {
                continue;
            }

            const result = this.resolve(conflict, conflict.suggestedResolution);
            resolved.push(result);
        }

        return resolved;
    }

    // ============================================================================
    // MANUAL RESOLUTION
    // ============================================================================

    /**
     * Get all pending conflicts.
     */
    getPendingConflicts(): ConflictRecord[] {
        return Array.from(this.pendingConflicts.values());
    }

    /**
     * Get pending conflict count.
     */
    getPendingCount(): number {
        return this.pendingConflicts.size;
    }

    /**
     * Get a specific conflict by ID.
     */
    getConflict(conflictId: string): ConflictRecord | undefined {
        return this.pendingConflicts.get(conflictId);
    }

    /**
     * Manually resolve a conflict with custom entry.
     */
    manualResolve(conflictId: string, resolvedEntry: MemoryEntry): ResolvedConflict {
        const conflict = this.pendingConflicts.get(conflictId);

        if (!conflict) {
            throw new Error(`Conflict not found: ${conflictId}`);
        }

        const resolved: ResolvedConflict = {
            conflictId,
            entryId: conflict.entryId,
            strategy: 'manual',
            resolvedEntry,
            wasAutoResolved: false,
        };

        this.pendingConflicts.delete(conflictId);
        this.resolvedHistory.unshift(resolved);

        memoryLogger.info(`Conflict manually resolved: ${conflictId}`);

        return resolved;
    }

    /**
     * Dismiss a conflict (keep local version).
     */
    dismiss(conflictId: string): void {
        const conflict = this.pendingConflicts.get(conflictId);

        if (conflict) {
            this.resolve(conflict, 'prefer-local');
        }
    }

    // ============================================================================
    // HISTORY & STATS
    // ============================================================================

    /**
     * Get resolution history.
     */
    getHistory(limit?: number): ResolvedConflict[] {
        return limit ? this.resolvedHistory.slice(0, limit) : [...this.resolvedHistory];
    }

    /**
     * Get resolution statistics.
     */
    getStats(): {
        pending: number;
        resolved: number;
        autoResolved: number;
        manualResolved: number;
        byStrategy: Record<ResolutionStrategy, number>;
    } {
        const byStrategy: Record<ResolutionStrategy, number> = {
            'last-write-wins': 0,
            'first-write-wins': 0,
            'merge': 0,
            'manual': 0,
            'prefer-local': 0,
            'prefer-remote': 0,
        };

        let autoResolved = 0;
        let manualResolved = 0;

        this.resolvedHistory.forEach(r => {
            byStrategy[r.strategy]++;
            if (r.wasAutoResolved) {
                autoResolved++;
            } else {
                manualResolved++;
            }
        });

        return {
            pending: this.pendingConflicts.size,
            resolved: this.resolvedHistory.length,
            autoResolved,
            manualResolved,
            byStrategy,
        };
    }

    /**
     * Clear all pending conflicts.
     */
    clearPending(): void {
        this.pendingConflicts.clear();
    }

    /**
     * Clear history.
     */
    clearHistory(): void {
        this.resolvedHistory = [];
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    /**
     * Check if two entries conflict.
     */
    private entriesConflict(local: MemoryEntry, remote: MemoryEntry): boolean {
        // Same content is not a conflict
        if (local.content === remote.content && local.importance === remote.importance) {
            return false;
        }

        // Different content = conflict
        return true;
    }

    /**
     * Create a conflict record.
     */
    private createConflictRecord(
        local: MemoryEntry,
        remote: MemoryEntry
    ): ConflictRecord {
        const localTime = local.accessedAt?.getTime() ?? local.createdAt.getTime();
        const remoteTime = remote.accessedAt?.getTime() ?? remote.createdAt.getTime();
        const timeDelta = localTime - remoteTime;

        const diffDetails: ConflictDiff = {
            contentChanged: local.content !== remote.content,
            importanceChanged: local.importance !== remote.importance,
            metadataChanged: JSON.stringify(local.metadata) !== JSON.stringify(remote.metadata),
            localNewer: timeDelta > 0,
            timeDelta,
        };

        // Determine if auto-resolvable
        const autoResolvable =
            Math.abs(timeDelta) > this.config.autoResolveThresholdMs ||
            (!diffDetails.contentChanged && !diffDetails.importanceChanged);

        // Suggest resolution strategy
        let suggestedResolution: ResolutionStrategy = this.config.defaultStrategy;

        if (autoResolvable) {
            suggestedResolution = diffDetails.localNewer ? 'prefer-local' : 'prefer-remote';
        } else if (diffDetails.contentChanged && diffDetails.importanceChanged) {
            suggestedResolution = 'manual';
        }

        return {
            id: `conflict-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            entryId: local.id,
            localVersion: local,
            remoteVersion: remote,
            timestamp: new Date(),
            tier: local.tier,
            autoResolvable,
            suggestedResolution,
            diffDetails,
        };
    }

    /**
     * Merge two entries together.
     */
    private mergeEntries(local: MemoryEntry, remote: MemoryEntry): MemoryEntry {
        // For merge strategy, combine metadata and take newer content
        const localTime = local.accessedAt?.getTime() ?? local.createdAt.getTime();
        const remoteTime = remote.accessedAt?.getTime() ?? remote.createdAt.getTime();
        const newerEntry = localTime > remoteTime ? local : remote;

        return {
            ...newerEntry,
            importance: Math.max(local.importance, remote.importance),
            metadata: {
                ...remote.metadata,
                ...local.metadata,
                tags: [...new Set([
                    ...(local.metadata.tags || []),
                    ...(remote.metadata.tags || []),
                ])],
            },
            accessedAt: new Date(),
        };
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a conflict resolver instance.
 */
export function createConflictResolver(
    config?: Partial<ConflictResolverConfig>
): ConflictResolver {
    return new ConflictResolver(config);
}
