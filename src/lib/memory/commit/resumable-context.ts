/**
 * CryptoAgentHQ - Resumable Context Generator
 * @module lib/memory/commit/resumable-context
 * 
 * 3-tier resumable context generation for optimal session resume.
 * Konsey Değerlendirmesi: Dr. Yuki Tanaka (Context Engineering Lead) ⭐⭐⭐⭐⭐
 */

import type { SessionData } from './data-collector';
import type {
    ConversationMessage,
    ExtractedEntity,
    KeyDecision,
    LearnedFact,
} from '../core/types';
import { memoryLogger } from '../core/config';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Hot context - immediate resume (minimal tokens).
 */
export interface HotContext {
    lastUserMessage: string;
    lastAssistantMessage: string;
    currentTask?: string;
    taskStatus?: string;
    immediateContext: string[];
    activeFilesPaths: string[];
    lastTurnNumber: number;
}

/**
 * Warm context - session summary (moderate tokens).
 */
export interface WarmContext {
    sessionSummary: string;
    recentDecisions: KeyDecision[];
    activeEntities: ExtractedEntity[];
    keyFacts: LearnedFact[];
    conversationTopics: string[];
    errorsEncountered: string[];
    filesModified: string[];
}

/**
 * Cold context - references only (minimal tokens, max data).
 */
export interface ColdContext {
    commitId: string;
    snapshotPath: string;
    archivePath: string;
    entityIndexPath: string;
    decisionLogPath: string;
    totalMessages: number;
    totalEntities: number;
    sessionDuration: number;
}

/**
 * Complete resumable context.
 */
export interface ResumableContext {
    version: string;
    generatedAt: Date;
    conversationId: string;
    sessionId: string;

    hot: HotContext;
    warm: WarmContext;
    cold: ColdContext;

    // Pre-formatted for prompt injection
    formatted: {
        hotPrompt: string;
        warmPrompt: string;
        fullPrompt: string;
    };

    // Token estimates
    tokenEstimates: {
        hot: number;
        warm: number;
        cold: number;
        total: number;
    };
}

/**
 * Generator configuration.
 */
export interface ResumableContextConfig {
    hotContextTokens?: number;
    warmContextTokens?: number;
    basePath: string;
    commitId: string;
}

// ============================================================================
// RESUMABLE CONTEXT GENERATOR CLASS
// ============================================================================

/**
 * Generates 3-tier resumable context for session resume.
 */
export class ResumableContextGenerator {
    private readonly config: Required<ResumableContextConfig>;

    constructor(config: ResumableContextConfig) {
        this.config = {
            hotContextTokens: config.hotContextTokens ?? 2000,
            warmContextTokens: config.warmContextTokens ?? 8000,
            basePath: config.basePath,
            commitId: config.commitId,
        };
    }

    // ============================================================================
    // MAIN GENERATION
    // ============================================================================

    /**
     * Generate complete resumable context.
     */
    generate(data: SessionData): ResumableContext {
        memoryLogger.info('Generating resumable context...');

        const hot = this.generateHotContext(data);
        const warm = this.generateWarmContext(data);
        const cold = this.generateColdContext(data);

        // Format for prompt injection
        const hotPrompt = this.formatHotContext(hot);
        const warmPrompt = this.formatWarmContext(warm);
        const fullPrompt = this.formatFullContext(hot, warm);

        // Estimate tokens
        const tokenEstimates = {
            hot: this.estimateTokens(hotPrompt),
            warm: this.estimateTokens(warmPrompt),
            cold: 50, // Cold context is just references
            total: this.estimateTokens(fullPrompt),
        };

        const context: ResumableContext = {
            version: '1.0.0',
            generatedAt: new Date(),
            conversationId: data.conversationId,
            sessionId: data.sessionId,
            hot,
            warm,
            cold,
            formatted: {
                hotPrompt,
                warmPrompt,
                fullPrompt,
            },
            tokenEstimates,
        };

        memoryLogger.info('Resumable context generated', {
            hotTokens: tokenEstimates.hot,
            warmTokens: tokenEstimates.warm,
            totalTokens: tokenEstimates.total,
        });

        return context;
    }

    // ============================================================================
    // HOT CONTEXT GENERATION
    // ============================================================================

    /**
     * Generate hot context (immediate resume).
     */
    generateHotContext(data: SessionData): HotContext {
        const messages = data.messages;

        // Find last user and assistant messages
        const lastUserMsg = this.findLastMessageByRole(messages, 'user');
        const lastAssistantMsg = this.findLastMessageByRole(messages, 'assistant');

        // Extract immediate context from recent messages
        const recentMessages = messages.slice(-5);
        const immediateContext = recentMessages.map(m =>
            `[${m.role.toUpperCase()}]: ${this.truncate(m.content, 200)}`
        );

        // Extract active files from recent messages
        const activeFilesPaths = this.extractFilePaths(recentMessages);

        return {
            lastUserMessage: lastUserMsg ? this.truncate(lastUserMsg.content, 500) : '',
            lastAssistantMessage: lastAssistantMsg ? this.truncate(lastAssistantMsg.content, 500) : '',
            currentTask: data.taskState.currentTask,
            taskStatus: data.taskState.taskStatus,
            immediateContext,
            activeFilesPaths: activeFilesPaths.slice(0, 10),
            lastTurnNumber: messages.length > 0 ? messages[messages.length - 1].turnNumber : 0,
        };
    }

    // ============================================================================
    // WARM CONTEXT GENERATION
    // ============================================================================

    /**
     * Generate warm context (session summary).
     */
    generateWarmContext(data: SessionData): WarmContext {
        // Generate session summary
        const sessionSummary = this.generateSessionSummary(data);

        // Get recent decisions (last 10)
        const recentDecisions = data.decisions.slice(-10);

        // Get active entities (most mentioned)
        const activeEntities = this.getActiveEntities(data.entities, 15);

        // Get key facts
        const keyFacts = data.facts.slice(0, 10);

        // Extract conversation topics
        const conversationTopics = this.extractTopics(data.messages);

        // Extract errors encountered
        const errorsEncountered = this.extractErrors(data.messages);

        // Get modified files from file changes
        const filesModified = data.fileChanges.map(fc => fc.path);

        return {
            sessionSummary,
            recentDecisions,
            activeEntities,
            keyFacts,
            conversationTopics: conversationTopics.slice(0, 10),
            errorsEncountered: errorsEncountered.slice(0, 5),
            filesModified: [...new Set(filesModified)].slice(0, 20),
        };
    }

    // ============================================================================
    // COLD CONTEXT GENERATION
    // ============================================================================

    /**
     * Generate cold context (references only).
     */
    generateColdContext(data: SessionData): ColdContext {
        const sessionDuration = this.calculateSessionDuration(data.messages);

        return {
            commitId: this.config.commitId,
            snapshotPath: `${this.config.basePath}/archives/snapshot-${this.config.commitId}.json`,
            archivePath: `${this.config.basePath}/archives`,
            entityIndexPath: `${this.config.basePath}/knowledge/entities.json`,
            decisionLogPath: `${this.config.basePath}/summaries/decisions.json`,
            totalMessages: data.messages.length,
            totalEntities: data.entities.length,
            sessionDuration,
        };
    }

    // ============================================================================
    // FORMATTING
    // ============================================================================

    /**
     * Format hot context for prompt injection.
     */
    formatHotContext(hot: HotContext): string {
        const lines: string[] = [
            '## Session Resume Context (Hot)',
            '',
        ];

        if (hot.currentTask) {
            lines.push(`**Current Task**: ${hot.currentTask}`);
            if (hot.taskStatus) {
                lines.push(`**Status**: ${hot.taskStatus}`);
            }
            lines.push('');
        }

        lines.push('**Last Exchange**:');
        if (hot.lastUserMessage) {
            lines.push(`- User: ${hot.lastUserMessage}`);
        }
        if (hot.lastAssistantMessage) {
            lines.push(`- Assistant: ${this.truncate(hot.lastAssistantMessage, 300)}`);
        }
        lines.push('');

        if (hot.activeFilesPaths.length > 0) {
            lines.push('**Active Files**:');
            hot.activeFilesPaths.forEach(f => lines.push(`- \`${f}\``));
            lines.push('');
        }

        return lines.join('\n');
    }

    /**
     * Format warm context for prompt injection.
     */
    formatWarmContext(warm: WarmContext): string {
        const lines: string[] = [
            '## Session Context (Warm)',
            '',
            '### Summary',
            warm.sessionSummary,
            '',
        ];

        if (warm.recentDecisions.length > 0) {
            lines.push('### Key Decisions');
            warm.recentDecisions.slice(0, 5).forEach(d => {
                lines.push(`- **${d.title}**: ${d.description}`);
            });
            lines.push('');
        }

        if (warm.conversationTopics.length > 0) {
            lines.push(`### Topics Covered: ${warm.conversationTopics.join(', ')}`);
            lines.push('');
        }

        if (warm.filesModified.length > 0) {
            lines.push('### Files Modified');
            warm.filesModified.slice(0, 10).forEach(f => lines.push(`- \`${f}\``));
            lines.push('');
        }

        if (warm.errorsEncountered.length > 0) {
            lines.push('### Errors Resolved');
            warm.errorsEncountered.forEach(e => lines.push(`- ${e}`));
            lines.push('');
        }

        return lines.join('\n');
    }

    /**
     * Format full context (hot + warm).
     */
    formatFullContext(hot: HotContext, warm: WarmContext): string {
        return [
            this.formatHotContext(hot),
            '---',
            this.formatWarmContext(warm),
        ].join('\n\n');
    }

    /**
     * Format for resume (optimized for LLM).
     */
    formatForResume(context: ResumableContext): string {
        return context.formatted.fullPrompt;
    }

    // ============================================================================
    // HELPERS
    // ============================================================================

    /**
     * Find last message by role.
     */
    private findLastMessageByRole(
        messages: ConversationMessage[],
        role: 'user' | 'assistant'
    ): ConversationMessage | null {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === role) {
                return messages[i];
            }
        }
        return null;
    }

    /**
     * Extract file paths from messages.
     */
    private extractFilePaths(messages: ConversationMessage[]): string[] {
        const paths = new Set<string>();

        messages.forEach(m => {
            const matches = m.content.match(/(?:\/[\w.-]+)+\.\w+/g);
            matches?.forEach(p => paths.add(p));
        });

        return Array.from(paths);
    }

    /**
     * Generate session summary.
     */
    private generateSessionSummary(data: SessionData): string {
        const userMsgCount = data.statistics.userMessageCount;
        const assistantMsgCount = data.statistics.assistantMessageCount;
        const entityCount = data.statistics.entityCount;
        const decisionCount = data.statistics.decisionCount;
        const fileChangeCount = data.statistics.fileChangeCount;

        const parts: string[] = [
            `This session included ${data.messages.length} messages (${userMsgCount} from user, ${assistantMsgCount} from assistant).`,
        ];

        if (entityCount > 0) {
            parts.push(`${entityCount} entities were identified.`);
        }
        if (decisionCount > 0) {
            parts.push(`${decisionCount} key decisions were made.`);
        }
        if (fileChangeCount > 0) {
            parts.push(`${fileChangeCount} files were modified.`);
        }

        return parts.join(' ');
    }

    /**
     * Get most active entities by mention count.
     */
    private getActiveEntities(entities: ExtractedEntity[], limit: number): ExtractedEntity[] {
        return [...entities]
            .sort((a, b) => (b.mentions?.length ?? 0) - (a.mentions?.length ?? 0))
            .slice(0, limit);
    }

    /**
     * Extract conversation topics from user messages.
     */
    private extractTopics(messages: ConversationMessage[]): string[] {
        const topics = new Set<string>();

        messages
            .filter(m => m.role === 'user')
            .forEach(m => {
                const firstLine = m.content.split('\n')[0].slice(0, 50);
                if (firstLine.length > 10) {
                    topics.add(firstLine.replace(/[?!.,]$/, ''));
                }
            });

        return Array.from(topics);
    }

    /**
     * Extract errors from messages.
     */
    private extractErrors(messages: ConversationMessage[]): string[] {
        const errors: string[] = [];

        messages.forEach(m => {
            if (m.content.toLowerCase().includes('error')) {
                const lines = m.content.split('\n');
                lines.forEach(line => {
                    if (line.toLowerCase().includes('error') && line.length < 200) {
                        errors.push(line.trim());
                    }
                });
            }
        });

        return [...new Set(errors)];
    }

    /**
     * Calculate session duration in milliseconds.
     */
    private calculateSessionDuration(messages: ConversationMessage[]): number {
        if (messages.length < 2) return 0;

        const timestamps = messages.map(m => m.timestamp.getTime());
        return Math.max(...timestamps) - Math.min(...timestamps);
    }

    /**
     * Truncate string to max length.
     */
    private truncate(str: string, maxLength: number): string {
        if (str.length <= maxLength) return str;
        return str.slice(0, maxLength - 3) + '...';
    }

    /**
     * Estimate token count (rough approximation).
     */
    private estimateTokens(text: string): number {
        return Math.ceil(text.length / 4);
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a resumable context generator instance.
 */
export function createResumableContextGenerator(
    config: ResumableContextConfig
): ResumableContextGenerator {
    return new ResumableContextGenerator(config);
}
