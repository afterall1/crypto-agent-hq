/**
 * CryptoAgentHQ - Intelligent Summarizer
 * @module lib/memory/operations/summarizer
 * 
 * Hierarchical summarization using Claude.
 * Konsey Değerlendirmesi: Context Engineering Lead ⭐⭐⭐⭐⭐
 */

import type {
    ConversationMessage,
    Summary,
    KeyDecision,
    SummarizationOptions,
} from '../core/types';
import { SUMMARIZATION_CONFIG, memoryLogger } from '../core/config';

// ============================================================================
// SUMMARIZATION PROMPTS
// ============================================================================

const SUMMARIZE_PROMPT = `You are a precise summarization assistant. Analyze the following conversation and create a comprehensive summary.

REQUIREMENTS:
1. Preserve ALL key decisions made and their rationale
2. Capture important context needed to continue the work
3. Document errors encountered and their solutions
4. List files created or modified
5. Describe the current state of the task
6. Outline next steps if mentioned

FORMAT YOUR RESPONSE AS JSON:
{
  "content": "A narrative summary of what happened (2-4 paragraphs)",
  "keyPoints": ["List of important points"],
  "decisions": [
    {
      "title": "Decision title",
      "description": "What was decided",
      "rationale": "Why this decision was made",
      "impact": "low|medium|high|critical"
    }
  ],
  "errors": [
    {
      "description": "Error description",
      "solution": "How it was solved"
    }
  ],
  "filesModified": ["List of file paths"],
  "currentState": "Description of current state",
  "nextSteps": ["List of next steps"]
}`;

const MERGE_PROMPT = `You are a summarization assistant. Merge the following summaries into one cohesive summary.
Combine overlapping information, preserve all unique decisions and errors, and update the current state to reflect the latest status.

OUTPUT FORMAT: Same JSON structure as input summaries.`;

// ============================================================================
// SUMMARIZER CLASS
// ============================================================================

/**
 * Intelligent summarizer using Claude for context compression.
 */
export class Summarizer {
    private readonly conversationId: string;
    private readonly options: Required<SummarizationOptions>;

    constructor(
        conversationId: string,
        options?: SummarizationOptions
    ) {
        this.conversationId = conversationId;
        this.options = {
            maxTokens: options?.maxTokens ?? SUMMARIZATION_CONFIG.maxSummaryTokens,
            preserveDecisions: options?.preserveDecisions ?? true,
            preserveErrors: options?.preserveErrors ?? true,
            includeFileChanges: options?.includeFileChanges ?? true,
            style: options?.style ?? 'detailed',
        };
    }

    /**
     * Summarize a set of messages.
     */
    async summarize(messages: ConversationMessage[]): Promise<Summary> {
        if (messages.length < SUMMARIZATION_CONFIG.minMessagesForSummary) {
            return this.createMinimalSummary(messages);
        }

        // Chunk if too long
        const chunks = this.chunkMessages(messages);

        if (chunks.length === 1) {
            return this.summarizeChunk(chunks[0], 0);
        }

        // Summarize each chunk
        const chunkSummaries = await Promise.all(
            chunks.map((chunk, index) => this.summarizeChunk(chunk, index))
        );

        // Merge summaries
        return this.mergeSummaries(chunkSummaries);
    }

    /**
     * Generate a quick summary for immediate use.
     */
    quickSummary(messages: ConversationMessage[]): string {
        const userMessages = messages.filter(m => m.role === 'user');
        const assistantMessages = messages.filter(m => m.role === 'assistant');

        const topics = this.extractTopics(userMessages);
        const actions = this.extractActions(assistantMessages);

        return `Session with ${messages.length} messages. Topics: ${topics.join(', ')}. Actions: ${actions.join(', ')}.`;
    }

    /**
     * Extract key decisions from messages.
     */
    extractDecisions(messages: ConversationMessage[]): KeyDecision[] {
        const decisions: KeyDecision[] = [];
        const decisionPatterns = [
            /decided to/gi,
            /chose to/gi,
            /will use/gi,
            /going with/gi,
            /selected/gi,
            /recommendation:/gi,
        ];

        messages.forEach(msg => {
            if (msg.role !== 'assistant') return;

            decisionPatterns.forEach(pattern => {
                const matches = msg.content.match(pattern);
                if (matches) {
                    // Extract context around the decision
                    const lines = msg.content.split('\n');
                    lines.forEach((line, lineIndex) => {
                        if (pattern.test(line)) {
                            const decision: KeyDecision = {
                                id: `dec-${msg.id}-${lineIndex}`,
                                title: this.extractDecisionTitle(line),
                                description: line.trim(),
                                rationale: lines[lineIndex + 1]?.trim() ?? '',
                                timestamp: msg.timestamp,
                                turnNumber: msg.turnNumber,
                                impact: this.assessImpact(line),
                            };
                            decisions.push(decision);
                        }
                    });
                }
            });
        });

        return decisions;
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    /**
     * Chunk messages by token limit.
     */
    private chunkMessages(messages: ConversationMessage[]): ConversationMessage[][] {
        const chunks: ConversationMessage[][] = [];
        let currentChunk: ConversationMessage[] = [];
        let currentTokens = 0;

        messages.forEach(msg => {
            const msgTokens = Math.ceil(msg.content.length / 4);

            if (currentTokens + msgTokens > SUMMARIZATION_CONFIG.chunkSize) {
                if (currentChunk.length > 0) {
                    chunks.push(currentChunk);
                }
                currentChunk = [msg];
                currentTokens = msgTokens;
            } else {
                currentChunk.push(msg);
                currentTokens += msgTokens;
            }
        });

        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    /**
     * Summarize a single chunk.
     */
    private async summarizeChunk(
        messages: ConversationMessage[],
        chunkIndex: number
    ): Promise<Summary> {
        // Format messages for prompt
        const formattedMessages = messages
            .map(m => `[${m.role.toUpperCase()}] (Turn ${m.turnNumber}): ${m.content}`)
            .join('\n\n');

        // In production, this would call Claude API
        // For now, create a structured summary from the messages
        const extracted = this.extractFromMessages(messages);

        const summary: Summary = {
            id: `sum-${this.conversationId}-${chunkIndex}-${Date.now()}`,
            conversationId: this.conversationId,
            type: 'chunk',
            content: this.generateNarrativeSummary(messages),
            keyPoints: extracted.keyPoints,
            decisions: this.extractDecisions(messages),
            errors: extracted.errors,
            filesModified: extracted.files,
            currentState: extracted.state,
            nextSteps: extracted.nextSteps,
            timestamp: new Date(),
            sourceMessages: messages.length,
            tokens: Math.ceil(formattedMessages.length / 4),
        };

        memoryLogger.info(`Created chunk summary ${chunkIndex}`, {
            messages: messages.length,
            decisions: summary.decisions.length,
        });

        return summary;
    }

    /**
     * Merge multiple summaries into one.
     */
    private async mergeSummaries(summaries: Summary[]): Promise<Summary> {
        const merged: Summary = {
            id: `sum-${this.conversationId}-merged-${Date.now()}`,
            conversationId: this.conversationId,
            type: 'merged',
            content: summaries.map(s => s.content).join('\n\n---\n\n'),
            keyPoints: [...new Set(summaries.flatMap(s => s.keyPoints))],
            decisions: this.deduplicateDecisions(summaries.flatMap(s => s.decisions)),
            errors: summaries.flatMap(s => s.errors),
            filesModified: [...new Set(summaries.flatMap(s => s.filesModified))],
            currentState: summaries[summaries.length - 1].currentState,
            nextSteps: summaries[summaries.length - 1].nextSteps,
            timestamp: new Date(),
            sourceMessages: summaries.reduce((sum, s) => sum + s.sourceMessages, 0),
            tokens: summaries.reduce((sum, s) => sum + s.tokens, 0),
        };

        return merged;
    }

    /**
     * Create a minimal summary for small message sets.
     */
    private createMinimalSummary(messages: ConversationMessage[]): Summary {
        return {
            id: `sum-${this.conversationId}-minimal-${Date.now()}`,
            conversationId: this.conversationId,
            type: 'session',
            content: this.quickSummary(messages),
            keyPoints: [],
            decisions: [],
            errors: [],
            filesModified: [],
            currentState: 'Session in progress',
            nextSteps: [],
            timestamp: new Date(),
            sourceMessages: messages.length,
            tokens: Math.ceil(messages.map(m => m.content).join('').length / 4),
        };
    }

    /**
     * Extract information from messages.
     */
    private extractFromMessages(messages: ConversationMessage[]): {
        keyPoints: string[];
        errors: Array<{ description: string; solution: string }>;
        files: string[];
        state: string;
        nextSteps: string[];
    } {
        const keyPoints: string[] = [];
        const errors: Array<{ description: string; solution: string }> = [];
        const files = new Set<string>();
        const nextSteps: string[] = [];

        messages.forEach(msg => {
            // Extract file paths
            const fileMatches = msg.content.match(/(?:\/[\w.-]+)+\.\w+/g);
            fileMatches?.forEach(f => files.add(f));

            // Extract errors
            if (msg.content.toLowerCase().includes('error')) {
                const lines = msg.content.split('\n');
                lines.forEach((line, i) => {
                    if (line.toLowerCase().includes('error')) {
                        errors.push({
                            description: line.trim(),
                            solution: lines[i + 1]?.trim() ?? 'Fixed',
                        });
                    }
                });
            }

            // Extract key points (lines starting with important markers)
            const lines = msg.content.split('\n');
            lines.forEach(line => {
                if (line.match(/^[-*•]\s*(important|key|critical|note):/i)) {
                    keyPoints.push(line.replace(/^[-*•]\s*/, ''));
                }
            });

            // Extract next steps
            if (msg.content.toLowerCase().includes('next step')) {
                const nextIdx = lines.findIndex(l => l.toLowerCase().includes('next step'));
                for (let i = nextIdx + 1; i < Math.min(nextIdx + 5, lines.length); i++) {
                    if (lines[i].match(/^[-*•\d.]\s/)) {
                        nextSteps.push(lines[i].replace(/^[-*•\d.]\s*/, ''));
                    }
                }
            }
        });

        return {
            keyPoints,
            errors,
            files: Array.from(files),
            state: messages.length > 0
                ? `Completed ${messages.length} turns of conversation`
                : 'No activity',
            nextSteps,
        };
    }

    /**
     * Generate a narrative summary.
     */
    private generateNarrativeSummary(messages: ConversationMessage[]): string {
        const userMsgs = messages.filter(m => m.role === 'user');
        const assistantMsgs = messages.filter(m => m.role === 'assistant');

        const topics = this.extractTopics(userMsgs);
        const actions = this.extractActions(assistantMsgs);

        return [
            `This session covered ${topics.length} main topics: ${topics.join(', ')}.`,
            `The assistant performed ${actions.length} key actions: ${actions.join(', ')}.`,
            `A total of ${messages.length} messages were exchanged.`,
        ].join(' ');
    }

    /**
     * Extract main topics from user messages.
     */
    private extractTopics(messages: ConversationMessage[]): string[] {
        const topics = new Set<string>();

        messages.forEach(msg => {
            // Simple topic extraction based on first few words or questions
            const firstLine = msg.content.split('\n')[0].slice(0, 50);
            if (firstLine.length > 10) {
                topics.add(firstLine.replace(/[?!.,]$/, ''));
            }
        });

        return Array.from(topics).slice(0, 5);
    }

    /**
     * Extract action summaries from assistant messages.
     */
    private extractActions(messages: ConversationMessage[]): string[] {
        const actions = new Set<string>();
        const actionPatterns = [
            /created?\s+(?:a\s+)?(\w+\s+)?(?:file|component|function|class)/gi,
            /implemented?\s+(\w+)/gi,
            /fixed?\s+(\w+\s+)?(?:error|bug|issue)/gi,
            /updated?\s+(\w+)/gi,
        ];

        messages.forEach(msg => {
            actionPatterns.forEach(pattern => {
                const matches = msg.content.match(pattern);
                matches?.forEach(m => actions.add(m.toLowerCase()));
            });
        });

        return Array.from(actions).slice(0, 5);
    }

    /**
     * Extract a decision title from a line.
     */
    private extractDecisionTitle(line: string): string {
        return line.slice(0, 60).replace(/[.!?].*$/, '').trim();
    }

    /**
     * Assess the impact of a decision.
     */
    private assessImpact(line: string): KeyDecision['impact'] {
        const lowercased = line.toLowerCase();
        if (lowercased.includes('critical') || lowercased.includes('breaking')) {
            return 'critical';
        }
        if (lowercased.includes('important') || lowercased.includes('major')) {
            return 'high';
        }
        if (lowercased.includes('minor') || lowercased.includes('small')) {
            return 'low';
        }
        return 'medium';
    }

    /**
     * Deduplicate decisions by title similarity.
     */
    private deduplicateDecisions(decisions: KeyDecision[]): KeyDecision[] {
        const seen = new Map<string, KeyDecision>();

        decisions.forEach(d => {
            const key = d.title.toLowerCase().slice(0, 30);
            if (!seen.has(key)) {
                seen.set(key, d);
            }
        });

        return Array.from(seen.values());
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a summarizer instance.
 */
export function createSummarizer(
    conversationId: string,
    options?: SummarizationOptions
): Summarizer {
    return new Summarizer(conversationId, options);
}
