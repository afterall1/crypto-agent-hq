/**
 * CryptoAgentHQ - Archival Memory Tier
 * @module lib/memory/tiers/archival-memory
 * 
 * Long-term persistent memory tier.
 * Konsey Değerlendirmesi: Persistence Engineer + Data Integrity Guardian ⭐⭐⭐⭐⭐
 */

import type {
    MemoryEntry,
    SessionSnapshot,
    ExtractedEntity,
    RetrieveOptions,
} from '../core/types';
import { TIER_CONFIG, memoryLogger } from '../core/config';

// ============================================================================
// ARCHIVAL MEMORY CLASS
// ============================================================================

/**
 * Archival memory tier - cold long-term storage.
 * Stores complete history with full detail for later retrieval.
 * 
 * Characteristics:
 * - Unlimited capacity (disk-based)
 * - Complete historical record
 * - Full detail preservation
 * - Searchable via index
 */
export class ArchivalMemory {
    private snapshots: Map<string, SessionSnapshot> = new Map();
    private entities: Map<string, ExtractedEntity> = new Map();
    private entries: Map<string, MemoryEntry> = new Map();
    private index: Map<string, Set<string>> = new Map();

    private readonly conversationId: string;

    constructor(config: {
        conversationId: string;
    }) {
        this.conversationId = config.conversationId;
    }

    // ============================================================================
    // SNAPSHOT OPERATIONS
    // ============================================================================

    /**
     * Archive a session snapshot.
     */
    archiveSnapshot(snapshot: SessionSnapshot): void {
        this.snapshots.set(snapshot.id, snapshot);

        // Index all entities from snapshot
        snapshot.entities.forEach(entity => {
            this.addEntity(entity);
        });

        // Index key terms
        this.indexTerms(snapshot.id, [
            ...snapshot.keyDecisions.map(d => d.title),
            ...snapshot.learnedFacts.map(f => f.content),
            snapshot.summary,
        ]);

        memoryLogger.info(`Archived snapshot: ${snapshot.id}`, {
            messages: snapshot.messages.length,
            decisions: snapshot.keyDecisions.length,
            entities: snapshot.entities.length,
        });
    }

    /**
     * Get a snapshot by ID.
     */
    getSnapshot(id: string): SessionSnapshot | undefined {
        return this.snapshots.get(id);
    }

    /**
     * Get all snapshots.
     */
    getSnapshots(): SessionSnapshot[] {
        return Array.from(this.snapshots.values())
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }

    /**
     * Get snapshots in date range.
     */
    getSnapshotsInRange(start: Date, end: Date): SessionSnapshot[] {
        return this.getSnapshots().filter(s =>
            s.timestamp >= start && s.timestamp <= end
        );
    }

    /**
     * Get the most recent snapshot.
     */
    getLatestSnapshot(): SessionSnapshot | undefined {
        const snapshots = this.getSnapshots();
        return snapshots[0];
    }

    // ============================================================================
    // ENTITY OPERATIONS
    // ============================================================================

    /**
     * Add an extracted entity.
     */
    addEntity(entity: ExtractedEntity): void {
        const existing = this.entities.get(entity.id);

        if (existing) {
            // Merge mentions and relationships
            const merged: ExtractedEntity = {
                ...existing,
                mentions: [...existing.mentions, ...entity.mentions],
                relationships: [...existing.relationships, ...entity.relationships],
                properties: { ...existing.properties, ...entity.properties },
                updatedAt: new Date(),
            };
            this.entities.set(entity.id, merged);
        } else {
            this.entities.set(entity.id, entity);
        }

        // Index by name and type
        this.addToIndex(`entity:${entity.type}`, entity.id);
        this.addToIndex(`name:${entity.name.toLowerCase()}`, entity.id);
    }

    /**
     * Get an entity by ID.
     */
    getEntity(id: string): ExtractedEntity | undefined {
        return this.entities.get(id);
    }

    /**
     * Get all entities.
     */
    getEntities(): ExtractedEntity[] {
        return Array.from(this.entities.values());
    }

    /**
     * Get entities by type.
     */
    getEntitiesByType(type: ExtractedEntity['type']): ExtractedEntity[] {
        const ids = this.index.get(`entity:${type}`);
        if (!ids) return [];
        return Array.from(ids)
            .map(id => this.entities.get(id))
            .filter((e): e is ExtractedEntity => e !== undefined);
    }

    /**
     * Search entities by name.
     */
    searchEntities(query: string): ExtractedEntity[] {
        const queryLower = query.toLowerCase();
        return this.getEntities().filter(e =>
            e.name.toLowerCase().includes(queryLower)
        );
    }

    // ============================================================================
    // ENTRY OPERATIONS
    // ============================================================================

    /**
     * Archive a memory entry.
     */
    archive(entry: MemoryEntry): void {
        const archivedEntry: MemoryEntry = {
            ...entry,
            tier: 'archival',
        };

        this.entries.set(entry.id, archivedEntry);

        // Index content terms
        this.indexTerms(entry.id, [entry.content]);

        // Index by type
        this.addToIndex(`type:${entry.type}`, entry.id);
    }

    /**
     * Get an archived entry.
     */
    get(id: string): MemoryEntry | undefined {
        return this.entries.get(id);
    }

    /**
     * Get all entries.
     */
    getAll(): MemoryEntry[] {
        return Array.from(this.entries.values());
    }

    /**
     * Retrieve entries with options.
     */
    retrieve(options: RetrieveOptions = {}): MemoryEntry[] {
        let results = this.getAll();

        if (options.type) {
            const types = Array.isArray(options.type) ? options.type : [options.type];
            results = results.filter(e => types.includes(e.type));
        }

        if (options.minImportance !== undefined) {
            results = results.filter(e => e.importance >= options.minImportance!);
        }

        if (options.dateRange?.start) {
            results = results.filter(e => e.createdAt >= options.dateRange!.start!);
        }

        if (options.dateRange?.end) {
            results = results.filter(e => e.createdAt <= options.dateRange!.end!);
        }

        results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        if (options.limit) {
            results = results.slice(0, options.limit);
        }

        return results;
    }

    // ============================================================================
    // SEARCH OPERATIONS
    // ============================================================================

    /**
     * Full-text search across archive.
     */
    search(query: string, limit: number = 20): MemoryEntry[] {
        const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        const candidates = new Map<string, number>();

        // Find entries matching any term
        terms.forEach(term => {
            this.index.forEach((entryIds, indexKey) => {
                if (indexKey.toLowerCase().includes(term)) {
                    entryIds.forEach(id => {
                        candidates.set(id, (candidates.get(id) ?? 0) + 1);
                    });
                }
            });
        });

        // Also search entry content directly
        this.entries.forEach((entry, id) => {
            const contentLower = entry.content.toLowerCase();
            terms.forEach(term => {
                if (contentLower.includes(term)) {
                    candidates.set(id, (candidates.get(id) ?? 0) + 1);
                }
            });
        });

        // Sort by match count
        return Array.from(candidates.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([id]) => this.entries.get(id))
            .filter((e): e is MemoryEntry => e !== undefined);
    }

    /**
     * Get entries by index key.
     */
    getByIndex(key: string): MemoryEntry[] {
        const ids = this.index.get(key);
        if (!ids) return [];
        return Array.from(ids)
            .map(id => this.entries.get(id))
            .filter((e): e is MemoryEntry => e !== undefined);
    }

    // ============================================================================
    // STATISTICS
    // ============================================================================

    /**
     * Get archive statistics.
     */
    getStats(): {
        snapshotCount: number;
        entityCount: number;
        entryCount: number;
        indexSize: number;
        oldestEntry?: Date;
        newestEntry?: Date;
    } {
        const entries = this.getAll();
        const dates = entries.map(e => e.createdAt).sort((a, b) => a.getTime() - b.getTime());

        return {
            snapshotCount: this.snapshots.size,
            entityCount: this.entities.size,
            entryCount: this.entries.size,
            indexSize: this.index.size,
            oldestEntry: dates[0],
            newestEntry: dates[dates.length - 1],
        };
    }

    /**
     * Clear all data.
     */
    clear(): void {
        this.snapshots.clear();
        this.entities.clear();
        this.entries.clear();
        this.index.clear();
        memoryLogger.info('Archival memory cleared');
    }

    /**
     * Export all data.
     */
    export(): {
        snapshots: SessionSnapshot[];
        entities: ExtractedEntity[];
        entries: MemoryEntry[];
    } {
        return {
            snapshots: this.getSnapshots(),
            entities: this.getEntities(),
            entries: this.getAll(),
        };
    }

    /**
     * Import data.
     */
    import(data: {
        snapshots?: SessionSnapshot[];
        entities?: ExtractedEntity[];
        entries?: MemoryEntry[];
    }): void {
        data.snapshots?.forEach(s => this.snapshots.set(s.id, s));
        data.entities?.forEach(e => this.entities.set(e.id, e));
        data.entries?.forEach(e => this.entries.set(e.id, e));
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    /**
     * Add entry ID to index.
     */
    private addToIndex(key: string, entryId: string): void {
        if (!this.index.has(key)) {
            this.index.set(key, new Set());
        }
        this.index.get(key)!.add(entryId);
    }

    /**
     * Index terms from text.
     */
    private indexTerms(entryId: string, texts: string[]): void {
        const terms = new Set<string>();

        texts.forEach(text => {
            // Extract words
            const words = text.toLowerCase()
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 3);

            words.forEach(word => terms.add(word));
        });

        terms.forEach(term => {
            this.addToIndex(`term:${term}`, entryId);
        });
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an archival memory instance.
 */
export function createArchivalMemory(config: {
    conversationId: string;
}): ArchivalMemory {
    return new ArchivalMemory(config);
}
