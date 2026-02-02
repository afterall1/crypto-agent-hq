/**
 * CryptoAgentHQ - Agent Memory
 * @module lib/agents/core/agent-memory
 * 
 * Memory management for agent context and history.
 * Konsey Değerlendirmesi: RAG/Memory Uzmanı ⭐⭐⭐⭐⭐
 */

import type { MemoryEntry, AgentMemory, AgentMessage } from './types';

// ============================================================================
// MEMORY CONFIG
// ============================================================================

export interface MemoryConfig {
    shortTermLimit: number;      // Max items in short-term memory
    longTermLimit: number;       // Max items in long-term memory
    contextMaxTokens: number;    // Approximate token limit for context
    summarizeThreshold: number;  // When to summarize short-term to long-term
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
    shortTermLimit: 20,
    longTermLimit: 100,
    contextMaxTokens: 8000,
    summarizeThreshold: 15,
};

// ============================================================================
// MEMORY MANAGER CLASS
// ============================================================================

export class MemoryManager {
    private memory: AgentMemory;
    private config: MemoryConfig;

    constructor(config: Partial<MemoryConfig> = {}) {
        this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
        this.memory = {
            shortTerm: [],
            longTerm: [],
            context: {},
        };
    }

    // ============================================================================
    // SHORT-TERM MEMORY
    // ============================================================================

    /**
     * Add a message to short-term memory.
     */
    addMessage(message: AgentMessage): void {
        const entry: MemoryEntry = {
            id: message.id,
            type: 'message',
            content: message.content,
            metadata: {
                role: message.role,
                timestamp: message.timestamp,
                toolCalls: message.toolCalls,
            },
            timestamp: message.timestamp,
        };

        this.memory.shortTerm.push(entry);

        // Check if we need to summarize
        if (this.memory.shortTerm.length >= this.config.summarizeThreshold) {
            this.consolidateMemory();
        }

        // Enforce limit
        if (this.memory.shortTerm.length > this.config.shortTermLimit) {
            this.memory.shortTerm = this.memory.shortTerm.slice(-this.config.shortTermLimit);
        }
    }

    /**
     * Add a fact or summary to memory.
     */
    addFact(content: string, metadata: Record<string, unknown> = {}): void {
        const entry: MemoryEntry = {
            id: `fact-${Date.now()}`,
            type: 'fact',
            content,
            metadata,
            timestamp: new Date(),
        };

        this.memory.longTerm.push(entry);
        this.enforceLongTermLimit();
    }

    /**
     * Get recent messages from short-term memory.
     */
    getRecentMessages(limit?: number): MemoryEntry[] {
        const entries = this.memory.shortTerm.filter(e => e.type === 'message');
        return limit ? entries.slice(-limit) : entries;
    }

    /**
     * Get all short-term entries.
     */
    getShortTerm(): MemoryEntry[] {
        return [...this.memory.shortTerm];
    }

    // ============================================================================
    // LONG-TERM MEMORY
    // ============================================================================

    /**
     * Search long-term memory for relevant entries.
     */
    searchLongTerm(query: string, limit: number = 5): MemoryEntry[] {
        // Simple keyword-based search (can be enhanced with embeddings)
        const queryTerms = query.toLowerCase().split(/\s+/);

        const scored = this.memory.longTerm.map(entry => {
            const content = entry.content.toLowerCase();
            const matches = queryTerms.filter(term => content.includes(term)).length;
            return {
                entry,
                score: matches / queryTerms.length,
            };
        });

        return scored
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(s => s.entry);
    }

    /**
     * Get all long-term entries.
     */
    getLongTerm(): MemoryEntry[] {
        return [...this.memory.longTerm];
    }

    // ============================================================================
    // CONTEXT MANAGEMENT
    // ============================================================================

    /**
     * Set a context value.
     */
    setContext(key: string, value: unknown): void {
        this.memory.context[key] = value;
    }

    /**
     * Get a context value.
     */
    getContext<T = unknown>(key: string): T | undefined {
        return this.memory.context[key] as T | undefined;
    }

    /**
     * Get all context.
     */
    getAllContext(): Record<string, unknown> {
        return { ...this.memory.context };
    }

    /**
     * Clear specific context.
     */
    clearContext(key: string): void {
        delete this.memory.context[key];
    }

    // ============================================================================
    // MEMORY EXPORT/IMPORT
    // ============================================================================

    /**
     * Export entire memory state.
     */
    export(): AgentMemory {
        return {
            shortTerm: [...this.memory.shortTerm],
            longTerm: [...this.memory.longTerm],
            context: { ...this.memory.context },
        };
    }

    /**
     * Import memory state.
     */
    import(memory: AgentMemory): void {
        this.memory = {
            shortTerm: [...memory.shortTerm],
            longTerm: [...memory.longTerm],
            context: { ...memory.context },
        };
    }

    /**
     * Clear all memory.
     */
    clear(): void {
        this.memory = {
            shortTerm: [],
            longTerm: [],
            context: {},
        };
    }

    /**
     * Clear only short-term memory.
     */
    clearShortTerm(): void {
        this.memory.shortTerm = [];
    }

    // ============================================================================
    // CONTEXT BUILDING
    // ============================================================================

    /**
     * Build context string for LLM prompt.
     */
    buildContextString(options: {
        includeShortTerm?: boolean;
        includeLongTerm?: boolean;
        includeContext?: boolean;
        relevantQuery?: string;
    } = {}): string {
        const parts: string[] = [];

        // Add context variables
        if (options.includeContext !== false && Object.keys(this.memory.context).length > 0) {
            parts.push('## Current Context');
            for (const [key, value] of Object.entries(this.memory.context)) {
                parts.push(`- ${key}: ${JSON.stringify(value)}`);
            }
        }

        // Add relevant long-term memories
        if (options.includeLongTerm !== false && options.relevantQuery) {
            const relevant = this.searchLongTerm(options.relevantQuery, 3);
            if (relevant.length > 0) {
                parts.push('\n## Relevant Knowledge');
                relevant.forEach(entry => {
                    parts.push(`- ${entry.content}`);
                });
            }
        }

        // Add recent conversation
        if (options.includeShortTerm !== false) {
            const recent = this.getRecentMessages(5);
            if (recent.length > 0) {
                parts.push('\n## Recent Conversation');
                recent.forEach(entry => {
                    const role = entry.metadata.role as string;
                    parts.push(`[${role}]: ${entry.content.slice(0, 200)}${entry.content.length > 200 ? '...' : ''}`);
                });
            }
        }

        return parts.join('\n');
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    /**
     * Consolidate short-term memory into summaries.
     */
    private consolidateMemory(): void {
        // Take oldest entries and create summary
        const toConsolidate = this.memory.shortTerm.slice(0, 5);

        if (toConsolidate.length === 0) return;

        // Create a simple summary (can be enhanced with LLM summarization)
        const summary: MemoryEntry = {
            id: `summary-${Date.now()}`,
            type: 'summary',
            content: this.createSimpleSummary(toConsolidate),
            metadata: {
                sourceIds: toConsolidate.map(e => e.id),
                consolidatedAt: new Date(),
            },
            timestamp: new Date(),
        };

        // Add to long-term and remove from short-term
        this.memory.longTerm.push(summary);
        this.memory.shortTerm = this.memory.shortTerm.slice(5);

        this.enforceLongTermLimit();
    }

    /**
     * Create a simple summary of entries.
     */
    private createSimpleSummary(entries: MemoryEntry[]): string {
        const messages = entries.filter(e => e.type === 'message');

        if (messages.length === 0) {
            return 'No messages to summarize.';
        }

        const roles = new Set(messages.map(m => m.metadata.role as string));
        const topics = this.extractTopics(messages.map(m => m.content).join(' '));

        return `Conversation summary (${messages.length} messages, participants: ${[...roles].join(', ')}). Topics: ${topics.slice(0, 5).join(', ')}.`;
    }

    /**
     * Extract simple topics from text.
     */
    private extractTopics(text: string): string[] {
        // Simple word frequency extraction
        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 4);

        const frequency = new Map<string, number>();
        words.forEach(word => {
            frequency.set(word, (frequency.get(word) || 0) + 1);
        });

        return [...frequency.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word]) => word);
    }

    /**
     * Enforce long-term memory limit.
     */
    private enforceLongTermLimit(): void {
        if (this.memory.longTerm.length > this.config.longTermLimit) {
            // Keep more recent entries
            this.memory.longTerm = this.memory.longTerm.slice(-this.config.longTermLimit);
        }
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createMemoryManager(config?: Partial<MemoryConfig>): MemoryManager {
    return new MemoryManager(config);
}
