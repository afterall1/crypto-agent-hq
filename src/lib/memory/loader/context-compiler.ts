/**
 * CryptoAgentHQ - Context Compiler
 * @module lib/memory/loader/context-compiler
 * 
 * Transform loaded JSON into optimized LLM prompt.
 * Expert Council Approved: Dr. Sarah Chen (Anthropic Context Engineering) ⭐⭐⭐⭐⭐
 */

import { memoryLogger } from '../core/config';
import type { HotContext, WarmContext, ColdContext, LoadedContext } from './context-loader';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Compiled context output.
 */
export interface CompiledContext {
    systemPrompt: string;
    userPrompt: string;
    structuredData: StructuredContextData;
    tokenCount: TokenBreakdown;
    compressionRatio: number;
    quality: CompressionQuality;
}

/**
 * Structured data for programmatic use.
 */
export interface StructuredContextData {
    currentTask: string | null;
    taskStatus: string | null;
    activeFiles: string[];
    recentDecisions: string[];
    keyEntities: string[];
    pendingActions: string[];
    knownIssues: string[];
}

/**
 * Token breakdown by section.
 */
export interface TokenBreakdown {
    systemPrompt: number;
    userPrompt: number;
    total: number;
    budget: number;
    remaining: number;
}

/**
 * Compression quality assessment.
 */
export interface CompressionQuality {
    score: number;           // 0-1
    lossLevel: 'none' | 'minimal' | 'moderate' | 'significant';
    warnings: string[];
}

/**
 * Compiler configuration.
 */
export interface ContextCompilerConfig {
    maxTokenBudget?: number;
    hotBudget?: number;
    warmBudget?: number;
    coldBudget?: number;
    enableCompression?: boolean;
    compressionLevel?: 'none' | 'light' | 'moderate' | 'aggressive';
    includeTimestamps?: boolean;
    includeMetadata?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: Required<ContextCompilerConfig> = {
    maxTokenBudget: 4000,
    hotBudget: 500,
    warmBudget: 2000,
    coldBudget: 200,
    enableCompression: true,
    compressionLevel: 'moderate',
    includeTimestamps: false,
    includeMetadata: true,
};

const CHARS_PER_TOKEN = 4;

// Compression thresholds
const SUMMARY_MAX_LENGTH = 300;
const DECISION_MAX_LENGTH = 100;
const ENTITY_MAX_LENGTH = 80;
const FACT_MAX_LENGTH = 100;

// ============================================================================
// CONTEXT COMPILER CLASS
// ============================================================================

/**
 * Compile loaded context into LLM-optimized prompts.
 */
export class ContextCompiler {
    private readonly config: Required<ContextCompilerConfig>;

    constructor(config: ContextCompilerConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    // ============================================================================
    // MAIN COMPILATION
    // ============================================================================

    /**
     * Compile loaded context into optimized prompts.
     */
    compile(context: LoadedContext): CompiledContext {
        const startTime = Date.now();
        memoryLogger.info('Compiling context...');

        const warnings: string[] = [];

        // Step 1: Extract and compress each tier
        const hotContent = this.compileHotTier(context.hot);
        const warmContent = this.compileWarmTier(context.warm);
        const coldContent = this.compileColdTier(context.cold);

        // Step 2: Check budget constraints
        const hotTokens = this.estimateTokens(hotContent);
        const warmTokens = this.estimateTokens(warmContent);
        const coldTokens = this.estimateTokens(coldContent);
        const totalTokens = hotTokens + warmTokens + coldTokens;

        // Step 3: Apply compression if needed
        let finalHot = hotContent;
        let finalWarm = warmContent;
        let finalCold = coldContent;

        if (totalTokens > this.config.maxTokenBudget && this.config.enableCompression) {
            const compressed = this.applyCompression(
                hotContent, warmContent, coldContent,
                { hot: hotTokens, warm: warmTokens, cold: coldTokens }
            );
            finalHot = compressed.hot;
            finalWarm = compressed.warm;
            finalCold = compressed.cold;
            warnings.push(`Applied ${this.config.compressionLevel} compression to fit budget`);
        }

        // Step 4: Build final prompts
        const systemPrompt = this.buildSystemPrompt(finalHot, finalWarm, finalCold);
        const userPrompt = this.buildUserPrompt(context);

        // Step 5: Extract structured data
        const structuredData = this.extractStructuredData(context);

        // Step 6: Calculate final metrics
        const systemTokens = this.estimateTokens(systemPrompt);
        const userTokens = this.estimateTokens(userPrompt);
        const finalTotalTokens = systemTokens + userTokens;

        const originalSize = JSON.stringify(context).length;
        const compressedSize = systemPrompt.length + userPrompt.length;
        const compressionRatio = originalSize > 0 ? compressedSize / originalSize : 1;

        // Step 7: Assess quality
        const quality = this.assessQuality(context, finalTotalTokens, warnings);

        const duration = Date.now() - startTime;
        memoryLogger.info('Context compilation complete', {
            tokens: finalTotalTokens,
            compressionRatio: compressionRatio.toFixed(2),
            quality: quality.score.toFixed(2),
            duration: `${duration}ms`,
        });

        return {
            systemPrompt,
            userPrompt,
            structuredData,
            tokenCount: {
                systemPrompt: systemTokens,
                userPrompt: userTokens,
                total: finalTotalTokens,
                budget: this.config.maxTokenBudget,
                remaining: this.config.maxTokenBudget - finalTotalTokens,
            },
            compressionRatio,
            quality,
        };
    }

    // ============================================================================
    // TIER COMPILATION
    // ============================================================================

    /**
     * Compile hot tier content.
     */
    private compileHotTier(hot: HotContext): string {
        const lines: string[] = [];

        // Current task (highest priority)
        if (hot.currentTask) {
            lines.push(`**Task**: ${hot.currentTask}`);
            if (hot.taskStatus) {
                lines.push(`**Status**: ${hot.taskStatus}`);
            }
        }

        // Last exchange (compressed)
        if (hot.lastUserMessage) {
            const msg = this.truncate(hot.lastUserMessage, 80);
            lines.push(`**Last User**: ${msg}`);
        }

        if (hot.lastAssistantMessage) {
            const msg = this.truncate(hot.lastAssistantMessage, 120);
            lines.push(`**Last Response**: ${msg}`);
        }

        // Active files (most important only)
        if (hot.activeFilesPaths.length > 0) {
            const files = hot.activeFilesPaths.slice(0, 3).map(f => `\`${this.basename(f)}\``);
            lines.push(`**Active**: ${files.join(', ')}`);
        }

        return lines.join('\n');
    }

    /**
     * Compile warm tier content.
     */
    private compileWarmTier(warm: WarmContext): string {
        const sections: string[] = [];

        // Session summary
        if (warm.sessionSummary) {
            const summary = this.truncate(warm.sessionSummary, SUMMARY_MAX_LENGTH);
            sections.push(`### Summary\n${summary}`);
        }

        // Recent decisions (compressed)
        if (warm.recentDecisions.length > 0) {
            const decisions = warm.recentDecisions
                .slice(0, 3)
                .map(d => `- ${d.title}: ${this.truncate(d.description, DECISION_MAX_LENGTH)}`);
            sections.push(`### Decisions\n${decisions.join('\n')}`);
        }

        // Active entities (most relevant only)
        if (warm.activeEntities.length > 0) {
            const entities = warm.activeEntities
                .slice(0, 5)
                .map(e => `- **${e.name}** (${e.type})`);
            sections.push(`### Entities\n${entities.join('\n')}`);
        }

        // Key facts (if space allows)
        if (warm.keyFacts.length > 0 && sections.length < 4) {
            const facts = warm.keyFacts
                .slice(0, 3)
                .map(f => `- ${this.truncate(f, FACT_MAX_LENGTH)}`);
            sections.push(`### Facts\n${facts.join('\n')}`);
        }

        // Errors (important for context)
        if (warm.errorsEncountered.length > 0) {
            const errors = warm.errorsEncountered
                .slice(0, 2)
                .map(e => `- ⚠️ ${this.truncate(e, 80)}`);
            sections.push(`### Resolved Issues\n${errors.join('\n')}`);
        }

        return sections.join('\n\n');
    }

    /**
     * Compile cold tier content (references only).
     */
    private compileColdTier(cold: ColdContext): string {
        const refs: string[] = [];

        if (cold.snapshotPath) {
            refs.push(`📁 Snapshot: ${cold.snapshotPath}`);
        }

        if (cold.totalMessages > 0) {
            refs.push(`📊 History: ${cold.totalMessages} messages, ${cold.totalEntities} entities`);
        }

        return refs.length > 0 ? `### References\n${refs.join('\n')}` : '';
    }

    // ============================================================================
    // PROMPT BUILDING
    // ============================================================================

    /**
     * Build system prompt with all context.
     */
    private buildSystemPrompt(
        hotContent: string,
        warmContent: string,
        coldContent: string
    ): string {
        const sections: string[] = [
            '# Session Context',
            '',
            '## Immediate Context',
            hotContent,
            '',
            '## Session History',
            warmContent,
        ];

        if (coldContent) {
            sections.push('', coldContent);
        }

        return sections.join('\n');
    }

    /**
     * Build user prompt prefix (for task continuation).
     */
    private buildUserPrompt(context: LoadedContext): string {
        if (!context.hot.currentTask) {
            return '';
        }

        return `*[Continuing from previous session: ${context.hot.currentTask}]*\n\n`;
    }

    // ============================================================================
    // COMPRESSION
    // ============================================================================

    /**
     * Apply compression to fit within budget.
     */
    private applyCompression(
        hot: string,
        warm: string,
        cold: string,
        tokens: { hot: number; warm: number; cold: number }
    ): { hot: string; warm: string; cold: string } {
        const budget = this.config.maxTokenBudget;
        const overage = (tokens.hot + tokens.warm + tokens.cold) - budget;

        if (overage <= 0) {
            return { hot, warm, cold };
        }

        // Compression strategy: trim warm first, then cold, preserve hot
        let newWarm = warm;
        let newCold = cold;

        // Level 1: Remove cold entirely
        if (this.config.compressionLevel !== 'none') {
            newCold = '';
        }

        // Level 2: Shorten warm
        if (this.config.compressionLevel === 'moderate' || this.config.compressionLevel === 'aggressive') {
            const warmLines = warm.split('\n');
            const targetLines = Math.ceil(warmLines.length * 0.6);
            newWarm = warmLines.slice(0, targetLines).join('\n');
        }

        // Level 3: Aggressive warm truncation
        if (this.config.compressionLevel === 'aggressive') {
            const maxWarmChars = this.config.warmBudget * CHARS_PER_TOKEN;
            if (newWarm.length > maxWarmChars) {
                newWarm = newWarm.slice(0, maxWarmChars) + '...';
            }
        }

        return { hot, warm: newWarm, cold: newCold };
    }

    // ============================================================================
    // STRUCTURED DATA EXTRACTION
    // ============================================================================

    /**
     * Extract structured data for programmatic use.
     */
    private extractStructuredData(context: LoadedContext): StructuredContextData {
        return {
            currentTask: context.hot.currentTask ?? null,
            taskStatus: context.hot.taskStatus ?? null,
            activeFiles: context.hot.activeFilesPaths.slice(0, 10),
            recentDecisions: context.warm.recentDecisions.map(d => d.title),
            keyEntities: context.warm.activeEntities.map(e => e.name),
            pendingActions: [], // Would be extracted from task state
            knownIssues: context.warm.errorsEncountered.slice(0, 5),
        };
    }

    // ============================================================================
    // QUALITY ASSESSMENT
    // ============================================================================

    /**
     * Assess compression quality.
     */
    private assessQuality(
        context: LoadedContext,
        totalTokens: number,
        warnings: string[]
    ): CompressionQuality {
        const originalEntities = context.warm.activeEntities.length;
        const originalDecisions = context.warm.recentDecisions.length;
        const originalFacts = context.warm.keyFacts.length;

        // Calculate information retention score
        let retentionScore = 1.0;

        // Check if we're using full hot context
        if (!context.hot.currentTask) {
            retentionScore -= 0.2;
            warnings.push('No current task in context');
        }

        // Check entity coverage
        if (originalEntities > 10) {
            const includedRatio = Math.min(10 / originalEntities, 1);
            retentionScore -= (1 - includedRatio) * 0.15;
        }

        // Check decision coverage
        if (originalDecisions > 5) {
            const includedRatio = Math.min(5 / originalDecisions, 1);
            retentionScore -= (1 - includedRatio) * 0.1;
        }

        // Check facts coverage
        if (originalFacts > 5) {
            const includedRatio = Math.min(5 / originalFacts, 1);
            retentionScore -= (1 - includedRatio) * 0.1;
        }

        // Token budget utilization
        const utilization = totalTokens / this.config.maxTokenBudget;
        if (utilization > 0.95) {
            retentionScore -= 0.1;
            warnings.push('Near token budget limit');
        }

        // Determine loss level
        let lossLevel: CompressionQuality['lossLevel'] = 'none';
        if (retentionScore < 0.95) lossLevel = 'minimal';
        if (retentionScore < 0.85) lossLevel = 'moderate';
        if (retentionScore < 0.70) lossLevel = 'significant';

        return {
            score: Math.max(retentionScore, 0),
            lossLevel,
            warnings,
        };
    }

    // ============================================================================
    // UTILITIES
    // ============================================================================

    /**
     * Estimate token count from string.
     */
    private estimateTokens(text: string): number {
        return Math.ceil(text.length / CHARS_PER_TOKEN);
    }

    /**
     * Truncate text with ellipsis.
     */
    private truncate(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return text.slice(0, maxLength - 3) + '...';
    }

    /**
     * Get basename from path.
     */
    private basename(filePath: string): string {
        const parts = filePath.split('/');
        return parts[parts.length - 1] || filePath;
    }

    // ============================================================================
    // PUBLIC UTILITIES
    // ============================================================================

    /**
     * Quick compile with minimal processing.
     */
    quickCompile(context: LoadedContext): string {
        // Use pre-formatted prompts if available
        if (context.formatted.hotPrompt && context.formatted.warmPrompt) {
            return `${context.formatted.hotPrompt}\n\n${context.formatted.warmPrompt}`;
        }

        // Otherwise do basic compilation
        const hot = this.compileHotTier(context.hot);
        const warm = this.compileWarmTier(context.warm);
        return `${hot}\n\n${warm}`;
    }

    /**
     * Get token budget status.
     */
    getBudgetStatus(): {
        total: number;
        hot: number;
        warm: number;
        cold: number;
    } {
        return {
            total: this.config.maxTokenBudget,
            hot: this.config.hotBudget,
            warm: this.config.warmBudget,
            cold: this.config.coldBudget,
        };
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a context compiler instance.
 */
export function createContextCompiler(config?: ContextCompilerConfig): ContextCompiler {
    return new ContextCompiler(config);
}
