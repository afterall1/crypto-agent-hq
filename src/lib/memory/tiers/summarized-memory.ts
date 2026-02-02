/**
 * CryptoAgentHQ - Summarized Memory Tier
 * @module lib/memory/tiers/summarized-memory
 * 
 * Compressed episodic memory tier.
 * Konsey Değerlendirmesi: Context Engineering Lead + Cognitive Architect ⭐⭐⭐⭐⭐
 */

import type {
    MemoryEntry,
    Summary,
    KeyDecision,
    LearnedFact,
    RetrieveOptions,
} from '../core/types';
import { TIER_CONFIG, memoryLogger } from '../core/config';

// ============================================================================
// SUMMARIZED MEMORY CLASS
// ============================================================================

/**
 * Summarized memory tier - compressed knowledge.
 * Stores condensed summaries and key information extracted from sessions.
 * 
 * Characteristics:
 * - Compressed representation of session data
 * - Key decisions and learnings preserved
 * - Searchable by topic
 * - Longer retention than session memory
 */
export class SummarizedMemory {
    private summaries: Map<string, Summary> = new Map();
    private decisions: Map<string, KeyDecision> = new Map();
    private facts: Map<string, LearnedFact> = new Map();
    private entries: Map<string, MemoryEntry> = new Map();

    private readonly conversationId: string;
    private readonly maxEntries: number;

    constructor(config: {
        conversationId: string;
        maxEntries?: number;
    }) {
        this.conversationId = config.conversationId;
        this.maxEntries = config.maxEntries ?? TIER_CONFIG.summarized.maxEntries;
    }

    // ============================================================================
    // SUMMARY OPERATIONS
    // ============================================================================

    /**
     * Add a summary.
     */
    addSummary(summary: Summary): void {
        this.summaries.set(summary.id, summary);

        // Create memory entry for the summary
        this.add({
            id: `sum-${summary.id}`,
            tier: 'summarized',
            content: summary.content,
            type: 'summary',
            metadata: {
                conversationId: this.conversationId,
                sessionId: '',
                turnNumber: 0,
                source: 'system',
                tags: ['summary', summary.type],
                entities: [],
                references: summary.decisions.map(d => d.id),
            },
            createdAt: summary.timestamp,
            accessedAt: summary.timestamp,
            importance: 0.8,
            tokens: summary.tokens,
        });

        // Also add decisions from summary
        summary.decisions.forEach(decision => {
            this.addDecision(decision);
        });

        memoryLogger.info(`Added summary: ${summary.id}`, {
            type: summary.type,
            tokens: summary.tokens,
        });
    }

    /**
     * Get all summaries.
     */
    getSummaries(): Summary[] {
        return Array.from(this.summaries.values())
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }

    /**
     * Get the most recent summary.
     */
    getLatestSummary(): Summary | undefined {
        const summaries = this.getSummaries();
        return summaries[0];
    }

    /**
     * Get summaries by type.
     */
    getSummariesByType(type: Summary['type']): Summary[] {
        return this.getSummaries().filter(s => s.type === type);
    }

    /**
     * Merge multiple summaries.
     */
    mergeSummaries(summaryIds: string[]): Summary | null {
        const summariesToMerge = summaryIds
            .map(id => this.summaries.get(id))
            .filter((s): s is Summary => s !== undefined);

        if (summariesToMerge.length < 2) return null;

        const mergedContent = summariesToMerge
            .map(s => s.content)
            .join('\n\n---\n\n');

        const allDecisions = summariesToMerge.flatMap(s => s.decisions);
        const allErrors = summariesToMerge.flatMap(s => s.errors);
        const allFiles = [...new Set(summariesToMerge.flatMap(s => s.filesModified))];

        const merged: Summary = {
            id: `merged-${Date.now()}`,
            conversationId: this.conversationId,
            type: 'merged',
            content: mergedContent,
            keyPoints: summariesToMerge.flatMap(s => s.keyPoints),
            decisions: allDecisions,
            errors: allErrors,
            filesModified: allFiles,
            currentState: summariesToMerge[summariesToMerge.length - 1].currentState,
            nextSteps: summariesToMerge[summariesToMerge.length - 1].nextSteps,
            timestamp: new Date(),
            sourceMessages: summariesToMerge.reduce((sum, s) => sum + s.sourceMessages, 0),
            tokens: Math.ceil(mergedContent.length / 4),
        };

        // Remove old summaries and add merged
        summaryIds.forEach(id => this.summaries.delete(id));
        this.addSummary(merged);

        return merged;
    }

    // ============================================================================
    // DECISION OPERATIONS
    // ============================================================================

    /**
     * Add a key decision.
     */
    addDecision(decision: KeyDecision): void {
        this.decisions.set(decision.id, decision);

        this.add({
            id: decision.id,
            tier: 'summarized',
            content: `${decision.title}: ${decision.description}\nRationale: ${decision.rationale}`,
            type: 'decision',
            metadata: {
                conversationId: this.conversationId,
                sessionId: '',
                turnNumber: decision.turnNumber,
                source: 'assistant',
                tags: ['decision', decision.impact],
                entities: [],
                references: [],
            },
            createdAt: decision.timestamp,
            accessedAt: decision.timestamp,
            importance: 1.0,
        });
    }

    /**
     * Get all decisions.
     */
    getDecisions(): KeyDecision[] {
        return Array.from(this.decisions.values())
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }

    /**
     * Get decisions by impact level.
     */
    getDecisionsByImpact(impact: KeyDecision['impact']): KeyDecision[] {
        return this.getDecisions().filter(d => d.impact === impact);
    }

    /**
     * Search decisions.
     */
    searchDecisions(query: string): KeyDecision[] {
        const queryLower = query.toLowerCase();
        return this.getDecisions().filter(d =>
            d.title.toLowerCase().includes(queryLower) ||
            d.description.toLowerCase().includes(queryLower) ||
            d.rationale.toLowerCase().includes(queryLower)
        );
    }

    // ============================================================================
    // FACT OPERATIONS
    // ============================================================================

    /**
     * Add a learned fact.
     */
    addFact(fact: LearnedFact): void {
        this.facts.set(fact.id, fact);

        this.add({
            id: fact.id,
            tier: 'summarized',
            content: fact.content,
            type: 'fact',
            metadata: {
                conversationId: this.conversationId,
                sessionId: '',
                turnNumber: 0,
                source: 'system',
                tags: ['fact', fact.category],
                entities: [],
                references: [],
            },
            createdAt: fact.timestamp,
            accessedAt: fact.timestamp,
            importance: fact.confidence,
        });
    }

    /**
     * Get all facts.
     */
    getFacts(): LearnedFact[] {
        return Array.from(this.facts.values())
            .sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * Get facts by category.
     */
    getFactsByCategory(category: string): LearnedFact[] {
        return this.getFacts().filter(f => f.category === category);
    }

    // ============================================================================
    // ENTRY OPERATIONS
    // ============================================================================

    /**
     * Add a memory entry.
     */
    add(entry: MemoryEntry): void {
        // Ensure capacity
        if (this.entries.size >= this.maxEntries) {
            this.evictLowestImportance();
        }

        this.entries.set(entry.id, entry);
    }

    /**
     * Get an entry.
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

        results.sort((a, b) => b.importance - a.importance);

        if (options.limit) {
            results = results.slice(0, options.limit);
        }

        return results;
    }

    /**
     * Clear all data.
     */
    clear(): void {
        this.summaries.clear();
        this.decisions.clear();
        this.facts.clear();
        this.entries.clear();
        memoryLogger.info('Summarized memory cleared');
    }

    /**
     * Export data.
     */
    export(): {
        summaries: Summary[];
        decisions: KeyDecision[];
        facts: LearnedFact[];
        entries: MemoryEntry[];
    } {
        return {
            summaries: this.getSummaries(),
            decisions: this.getDecisions(),
            facts: this.getFacts(),
            entries: this.getAll(),
        };
    }

    /**
     * Import data.
     */
    import(data: {
        summaries?: Summary[];
        decisions?: KeyDecision[];
        facts?: LearnedFact[];
    }): void {
        data.summaries?.forEach(s => this.summaries.set(s.id, s));
        data.decisions?.forEach(d => this.decisions.set(d.id, d));
        data.facts?.forEach(f => this.facts.set(f.id, f));
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    /**
     * Evict the lowest importance entry.
     */
    private evictLowestImportance(): void {
        let lowestId: string | null = null;
        let lowestImportance = Infinity;

        this.entries.forEach((entry, id) => {
            if (entry.importance < lowestImportance) {
                lowestId = id;
                lowestImportance = entry.importance;
            }
        });

        if (lowestId !== null) {
            this.entries.delete(lowestId);
        }
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a summarized memory instance.
 */
export function createSummarizedMemory(config: {
    conversationId: string;
    maxEntries?: number;
}): SummarizedMemory {
    return new SummarizedMemory(config);
}
