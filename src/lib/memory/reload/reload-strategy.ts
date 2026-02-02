/**
 * CryptoAgentHQ - Reload Strategy
 * @module lib/memory/reload/reload-strategy
 * 
 * Strategy implementations for different reload modes.
 * Konsey Değerlendirmesi: Robert Williams (Backup & Recovery Lead) ⭐⭐⭐⭐⭐
 */

import type { MemoryEntry, MemoryTier, SessionSnapshot } from '../core/types';
import { memoryLogger } from '../core/config';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Reload mode.
 */
export type ReloadMode = 'full' | 'selective' | 'rollback' | 'merge';

/**
 * Reload strategy options.
 */
export interface ReloadStrategyOptions {
    mode: ReloadMode;
    tiers?: MemoryTier[];
    preserveLocal?: boolean;
    snapshotId?: string;
    fromTimestamp?: Date;
    maxEntries?: number;
    priorityTiers?: MemoryTier[];
}

/**
 * Reload strategy result.
 */
export interface ReloadStrategyResult {
    reloadedEntries: MemoryEntry[];
    discardedEntries: string[];
    preservedEntries: string[];
    mergedEntries: string[];
    duration: number;
}

/**
 * Interface for reload strategies.
 */
export interface IReloadStrategy {
    readonly mode: ReloadMode;
    apply(
        snapshot: SessionSnapshot,
        currentEntries: Map<string, MemoryEntry>,
        options: ReloadStrategyOptions
    ): Promise<ReloadStrategyResult>;
}

// ============================================================================
// BASE RELOAD STRATEGY
// ============================================================================

/**
 * Abstract base class for reload strategies.
 */
export abstract class BaseReloadStrategy implements IReloadStrategy {
    abstract readonly mode: ReloadMode;

    abstract apply(
        snapshot: SessionSnapshot,
        currentEntries: Map<string, MemoryEntry>,
        options: ReloadStrategyOptions
    ): Promise<ReloadStrategyResult>;

    /**
     * Extract entries from snapshot.
     */
    protected extractEntriesFromSnapshot(snapshot: SessionSnapshot): MemoryEntry[] {
        const entries: MemoryEntry[] = [];
        const conversationId = snapshot.conversationId;
        const sessionId = snapshot.sessionId;

        // Convert messages to entries
        snapshot.messages.forEach(msg => {
            const importance = (msg.metadata as Record<string, unknown> | undefined)?.importance as number ?? 0.5;
            entries.push({
                id: msg.id,
                type: 'message',
                content: msg.content,
                tier: 'session',
                importance,
                createdAt: msg.timestamp,
                accessedAt: msg.timestamp,
                metadata: {
                    conversationId,
                    sessionId,
                    turnNumber: msg.turnNumber,
                    source: msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'assistant' : 'system',
                    tags: [],
                    entities: [],
                    references: [],
                },
            });
        });

        // Add entities
        snapshot.entities.forEach(entity => {
            const description = entity.properties?.description as string ?? '';
            const importance = entity.properties?.importance as number ?? 0.7;
            entries.push({
                id: entity.id,
                type: 'entity',
                content: `${entity.name}: ${description}`,
                tier: 'archival',
                importance,
                createdAt: entity.createdAt,
                accessedAt: entity.updatedAt,
                metadata: {
                    conversationId,
                    sessionId,
                    turnNumber: entity.mentions[0]?.turnNumber ?? 0,
                    source: 'system',
                    tags: [entity.type],
                    entities: [entity],
                    references: [],
                },
            });
        });

        // Add decisions
        snapshot.keyDecisions.forEach(decision => {
            entries.push({
                id: decision.id,
                type: 'decision',
                content: `${decision.title}: ${decision.description}`,
                tier: 'summarized',
                importance: decision.impact === 'critical' ? 1.0 :
                    decision.impact === 'high' ? 0.8 : 0.5,
                createdAt: decision.timestamp,
                accessedAt: decision.timestamp,
                metadata: {
                    conversationId,
                    sessionId,
                    turnNumber: decision.turnNumber,
                    source: 'assistant',
                    tags: ['decision', decision.impact],
                    entities: [],
                    references: [],
                },
            });
        });

        // Add facts
        snapshot.learnedFacts.forEach(fact => {
            const source = (fact.source === 'user' || fact.source === 'assistant' || fact.source === 'system' || fact.source === 'tool')
                ? fact.source
                : 'system';
            entries.push({
                id: fact.id,
                type: 'fact',
                content: fact.content,
                tier: 'summarized',
                importance: fact.confidence,
                createdAt: fact.timestamp,
                accessedAt: fact.timestamp,
                metadata: {
                    conversationId,
                    sessionId,
                    turnNumber: 0,
                    source,
                    tags: [fact.category],
                    entities: [],
                    references: [],
                },
            });
        });

        return entries;
    }
}

// ============================================================================
// FULL RELOAD STRATEGY
// ============================================================================

/**
 * Full reload - replaces all current state with snapshot state.
 */
export class FullReloadStrategy extends BaseReloadStrategy {
    readonly mode: ReloadMode = 'full';

    async apply(
        snapshot: SessionSnapshot,
        currentEntries: Map<string, MemoryEntry>,
        options: ReloadStrategyOptions
    ): Promise<ReloadStrategyResult> {
        const startTime = Date.now();

        const snapshotEntries = this.extractEntriesFromSnapshot(snapshot);
        const discardedEntries = Array.from(currentEntries.keys());

        memoryLogger.info('Full reload', {
            reloading: snapshotEntries.length,
            discarding: discardedEntries.length,
        });

        return {
            reloadedEntries: snapshotEntries,
            discardedEntries,
            preservedEntries: [],
            mergedEntries: [],
            duration: Date.now() - startTime,
        };
    }
}

// ============================================================================
// SELECTIVE RELOAD STRATEGY
// ============================================================================

/**
 * Selective reload - only reload specific tiers or entries.
 */
export class SelectiveReloadStrategy extends BaseReloadStrategy {
    readonly mode: ReloadMode = 'selective';

    async apply(
        snapshot: SessionSnapshot,
        currentEntries: Map<string, MemoryEntry>,
        options: ReloadStrategyOptions
    ): Promise<ReloadStrategyResult> {
        const startTime = Date.now();

        const targetTiers = options.tiers ?? ['session'];
        const snapshotEntries = this.extractEntriesFromSnapshot(snapshot);

        const reloadedEntries: MemoryEntry[] = [];
        const preservedEntries: string[] = [];
        const discardedEntries: string[] = [];

        // Filter snapshot entries by tier
        const tierFilteredEntries = snapshotEntries.filter(e =>
            targetTiers.includes(e.tier)
        );

        // Process current entries
        for (const [id, entry] of currentEntries) {
            if (targetTiers.includes(entry.tier)) {
                // This tier will be reloaded
                discardedEntries.push(id);
            } else {
                // This tier is preserved
                preservedEntries.push(id);
            }
        }

        // Add filtered entries from snapshot
        reloadedEntries.push(...tierFilteredEntries);

        // Preserve entries from non-target tiers
        for (const id of preservedEntries) {
            const entry = currentEntries.get(id);
            if (entry) {
                reloadedEntries.push(entry);
            }
        }

        memoryLogger.info('Selective reload', {
            tiers: targetTiers,
            reloaded: tierFilteredEntries.length,
            preserved: preservedEntries.length,
        });

        return {
            reloadedEntries,
            discardedEntries,
            preservedEntries,
            mergedEntries: [],
            duration: Date.now() - startTime,
        };
    }
}

// ============================================================================
// ROLLBACK STRATEGY
// ============================================================================

/**
 * Rollback - restore to a previous point in time.
 */
export class RollbackStrategy extends BaseReloadStrategy {
    readonly mode: ReloadMode = 'rollback';

    async apply(
        snapshot: SessionSnapshot,
        currentEntries: Map<string, MemoryEntry>,
        options: ReloadStrategyOptions
    ): Promise<ReloadStrategyResult> {
        const startTime = Date.now();

        const snapshotEntries = this.extractEntriesFromSnapshot(snapshot);
        const cutoffTime = options.fromTimestamp ?? snapshot.timestamp;

        // Filter entries that existed at the cutoff time
        const entriesAtCutoff = snapshotEntries.filter(e =>
            e.createdAt <= cutoffTime
        );

        const discardedEntries = Array.from(currentEntries.keys());

        memoryLogger.info('Rollback', {
            cutoff: cutoffTime.toISOString(),
            entriesAtCutoff: entriesAtCutoff.length,
            discarding: discardedEntries.length,
        });

        return {
            reloadedEntries: entriesAtCutoff,
            discardedEntries,
            preservedEntries: [],
            mergedEntries: [],
            duration: Date.now() - startTime,
        };
    }
}

// ============================================================================
// MERGE STRATEGY
// ============================================================================

/**
 * Merge - combine snapshot state with current state.
 */
export class MergeReloadStrategy extends BaseReloadStrategy {
    readonly mode: ReloadMode = 'merge';

    async apply(
        snapshot: SessionSnapshot,
        currentEntries: Map<string, MemoryEntry>,
        options: ReloadStrategyOptions
    ): Promise<ReloadStrategyResult> {
        const startTime = Date.now();

        const snapshotEntries = this.extractEntriesFromSnapshot(snapshot);
        const snapshotEntriesMap = new Map<string, MemoryEntry>();
        snapshotEntries.forEach(e => snapshotEntriesMap.set(e.id, e));

        const reloadedEntries: MemoryEntry[] = [];
        const mergedEntries: string[] = [];
        const preservedEntries: string[] = [];

        // Merge: prefer local for conflicts if preserveLocal is true
        const preferLocal = options.preserveLocal ?? true;

        // Add all current entries
        for (const [id, currentEntry] of currentEntries) {
            const snapshotEntry = snapshotEntriesMap.get(id);

            if (!snapshotEntry) {
                // Only in current - preserve
                reloadedEntries.push(currentEntry);
                preservedEntries.push(id);
            } else if (preferLocal) {
                // Both exist, prefer local
                reloadedEntries.push(currentEntry);
                preservedEntries.push(id);
                mergedEntries.push(id);
            } else {
                // Both exist, prefer snapshot
                reloadedEntries.push(snapshotEntry);
                mergedEntries.push(id);
            }
        }

        // Add entries only in snapshot
        for (const [id, snapshotEntry] of snapshotEntriesMap) {
            if (!currentEntries.has(id)) {
                reloadedEntries.push(snapshotEntry);
            }
        }

        memoryLogger.info('Merge reload', {
            fromSnapshot: snapshotEntries.length,
            fromCurrent: currentEntries.size,
            merged: mergedEntries.length,
            final: reloadedEntries.length,
        });

        return {
            reloadedEntries,
            discardedEntries: [],
            preservedEntries,
            mergedEntries,
            duration: Date.now() - startTime,
        };
    }
}

// ============================================================================
// STRATEGY FACTORY
// ============================================================================

/**
 * Create a reload strategy for the given mode.
 */
export function createReloadStrategy(mode: ReloadMode): IReloadStrategy {
    switch (mode) {
        case 'full':
            return new FullReloadStrategy();
        case 'selective':
            return new SelectiveReloadStrategy();
        case 'rollback':
            return new RollbackStrategy();
        case 'merge':
            return new MergeReloadStrategy();
        default:
            throw new Error(`Unknown reload mode: ${mode}`);
    }
}
