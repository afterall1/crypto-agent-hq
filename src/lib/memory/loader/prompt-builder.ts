/**
 * CryptoAgentHQ - Prompt Builder
 * @module lib/memory/loader/prompt-builder
 * 
 * Assemble final context prompt for LLM injection.
 * Expert Council Approved: Dr. Yuki Tanaka (Resumable Context) ⭐⭐⭐⭐⭐
 */

import { memoryLogger } from '../core/config';
import type { LoadedContext } from './context-loader';
import { ContextCompiler, type CompiledContext, type ContextCompilerConfig } from './context-compiler';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Built prompt result.
 */
export interface BuiltPrompt {
    fullPrompt: string;
    sections: PromptSections;
    tokenBreakdown: Record<string, number>;
    metadata: PromptMetadata;
}

/**
 * Individual prompt sections.
 */
export interface PromptSections {
    tldr: string;
    currentTask: string;
    recentDecisions: string;
    activeEntities: string;
    pendingActions: string;
    knownIssues: string;
    references: string;
}

/**
 * Prompt metadata.
 */
export interface PromptMetadata {
    generatedAt: Date;
    source: string;
    version: string;
    tokenTotal: number;
    compressionApplied: boolean;
    qualityScore: number;
}

/**
 * Prompt builder configuration.
 */
export interface PromptBuilderConfig {
    format?: 'markdown' | 'plain' | 'structured';
    includeTldr?: boolean;
    includeReferences?: boolean;
    maxSectionLength?: number;
    compilerConfig?: ContextCompilerConfig;
}

/**
 * Reload status for display.
 */
export interface ReloadStatus {
    success: boolean;
    source: string;
    tokenCount: number;
    compressionRatio: number;
    qualityScore: number;
    warnings: string[];
    errors: string[];
    sections: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: Required<Omit<PromptBuilderConfig, 'compilerConfig'>> & { compilerConfig?: ContextCompilerConfig } = {
    format: 'markdown',
    includeTldr: true,
    includeReferences: true,
    maxSectionLength: 500,
    compilerConfig: undefined,
};

const CHARS_PER_TOKEN = 4;

// ============================================================================
// PROMPT BUILDER CLASS
// ============================================================================

/**
 * Build final context prompts for LLM injection.
 */
export class PromptBuilder {
    private readonly config: typeof DEFAULT_CONFIG;
    private readonly compiler: ContextCompiler;

    constructor(config: PromptBuilderConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.compiler = new ContextCompiler(this.config.compilerConfig);
    }

    // ============================================================================
    // MAIN BUILD
    // ============================================================================

    /**
     * Build complete prompt from loaded context.
     */
    build(context: LoadedContext): BuiltPrompt {
        const startTime = Date.now();
        memoryLogger.info('Building prompt...');

        // Compile context first
        const compiled = this.compiler.compile(context);

        // Build individual sections
        const sections = this.buildSections(context, compiled);

        // Assemble full prompt
        const fullPrompt = this.assemblePrompt(sections);

        // Calculate token breakdown
        const tokenBreakdown = this.calculateTokenBreakdown(sections);

        const duration = Date.now() - startTime;
        const sectionKeys = ['tldr', 'currentTask', 'recentDecisions', 'activeEntities', 'pendingActions', 'knownIssues', 'references'] as const;
        const includedSections = sectionKeys.filter(k => sections[k].length > 0);
        memoryLogger.info('Prompt build complete', {
            tokens: compiled.tokenCount.total,
            sections: includedSections.length,
            duration: `${duration}ms`,
        });

        return {
            fullPrompt,
            sections,
            tokenBreakdown,
            metadata: {
                generatedAt: new Date(),
                source: context.metadata.source,
                version: context.metadata.version,
                tokenTotal: compiled.tokenCount.total,
                compressionApplied: compiled.compressionRatio < 0.9,
                qualityScore: compiled.quality.score,
            },
        };
    }

    // ============================================================================
    // SECTION BUILDING
    // ============================================================================

    /**
     * Build all prompt sections.
     */
    private buildSections(context: LoadedContext, compiled: CompiledContext): PromptSections {
        return {
            tldr: this.buildTldrSection(context),
            currentTask: this.buildCurrentTaskSection(context),
            recentDecisions: this.buildDecisionsSection(context),
            activeEntities: this.buildEntitiesSection(context),
            pendingActions: this.buildPendingActionsSection(context),
            knownIssues: this.buildKnownIssuesSection(context),
            references: this.buildReferencesSection(context, compiled),
        };
    }

    /**
     * Build TL;DR section.
     */
    private buildTldrSection(context: LoadedContext): string {
        if (!this.config.includeTldr) return '';

        const summary = context.warm.sessionSummary;
        if (!summary) {
            return '> 📋 New session - no previous context available.';
        }

        // Extract first sentence or truncate
        const firstSentence = summary.split('.')[0] + '.';
        const tldr = firstSentence.length > 150
            ? summary.slice(0, 150) + '...'
            : firstSentence;

        return `> 📋 **TL;DR**: ${tldr}`;
    }

    /**
     * Build current task section.
     */
    private buildCurrentTaskSection(context: LoadedContext): string {
        const { currentTask, taskStatus, activeFilesPaths } = context.hot;

        if (!currentTask) {
            return '';
        }

        const lines: string[] = [
            '### 🎯 Current Task',
            '',
            `**Name**: ${currentTask}`,
        ];

        if (taskStatus) {
            lines.push(`**Status**: ${taskStatus}`);
        }

        if (activeFilesPaths.length > 0) {
            lines.push('**Active Files**:');
            activeFilesPaths.slice(0, 5).forEach(f => {
                lines.push(`- \`${this.basename(f)}\``);
            });
        }

        return lines.join('\n');
    }

    /**
     * Build decisions section.
     */
    private buildDecisionsSection(context: LoadedContext): string {
        const decisions = context.warm.recentDecisions;

        if (decisions.length === 0) {
            return '';
        }

        const lines: string[] = [
            '### 📌 Recent Decisions',
            '',
        ];

        decisions.slice(0, 5).forEach((d, i) => {
            lines.push(`${i + 1}. **${d.title}**`);
            lines.push(`   ${d.description}`);
        });

        return lines.join('\n');
    }

    /**
     * Build entities section.
     */
    private buildEntitiesSection(context: LoadedContext): string {
        const entities = context.warm.activeEntities;

        if (entities.length === 0) {
            return '';
        }

        const lines: string[] = [
            '### 🔧 Key Entities',
            '',
        ];

        entities.slice(0, 8).forEach(e => {
            lines.push(`- **${e.name}** (${e.type}): ${e.description}`);
        });

        return lines.join('\n');
    }

    /**
     * Build pending actions section.
     */
    private buildPendingActionsSection(context: LoadedContext): string {
        // Extract pending actions from task status and context
        const actions: string[] = [];

        // Infer from task status
        if (context.hot.taskStatus) {
            actions.push(context.hot.taskStatus);
        }

        // Check for incomplete items in immediate context
        context.hot.immediateContext.forEach(msg => {
            if (msg.toLowerCase().includes('todo') ||
                msg.toLowerCase().includes('next') ||
                msg.toLowerCase().includes('pending')) {
                actions.push(msg.slice(0, 100));
            }
        });

        if (actions.length === 0) {
            return '';
        }

        const lines: string[] = [
            '### ⏳ Pending Actions',
            '',
        ];

        actions.slice(0, 3).forEach(a => {
            lines.push(`- [ ] ${a}`);
        });

        return lines.join('\n');
    }

    /**
     * Build known issues section.
     */
    private buildKnownIssuesSection(context: LoadedContext): string {
        const errors = context.warm.errorsEncountered;

        if (errors.length === 0) {
            return '';
        }

        const lines: string[] = [
            '### ⚠️ Resolved Issues',
            '',
            '> These issues were encountered and resolved in the previous session:',
            '',
        ];

        errors.slice(0, 3).forEach(e => {
            lines.push(`- ${e}`);
        });

        return lines.join('\n');
    }

    /**
     * Build references section.
     */
    private buildReferencesSection(context: LoadedContext, compiled: CompiledContext): string {
        if (!this.config.includeReferences) return '';

        const lines: string[] = [
            '### 📁 References',
            '',
        ];

        // Source info
        lines.push(`- **Source**: ${context.metadata.source} (${context.metadata.sourceId})`);
        lines.push(`- **Version**: ${context.metadata.version}`);

        // Token info
        lines.push(`- **Context Tokens**: ${compiled.tokenCount.total}/${compiled.tokenCount.budget}`);

        // Quality info
        if (compiled.quality.score < 1) {
            lines.push(`- **Quality**: ${(compiled.quality.score * 100).toFixed(0)}% (${compiled.quality.lossLevel} loss)`);
        }

        // Cold references
        if (context.cold.snapshotPath) {
            lines.push(`- **Snapshot**: ${context.cold.snapshotPath}`);
        }

        if (context.cold.totalMessages > 0) {
            lines.push(`- **History**: ${context.cold.totalMessages} messages, ${context.cold.totalEntities} entities`);
        }

        return lines.join('\n');
    }

    // ============================================================================
    // PROMPT ASSEMBLY
    // ============================================================================

    /**
     * Assemble full prompt from sections.
     */
    private assemblePrompt(sections: PromptSections): string {
        const parts: string[] = [
            '# 🔄 Session Context Restored',
            '',
        ];

        // Add TL;DR at top
        if (sections.tldr) {
            parts.push(sections.tldr);
            parts.push('');
        }

        // Add task info
        if (sections.currentTask) {
            parts.push(sections.currentTask);
            parts.push('');
        }

        // Add decisions
        if (sections.recentDecisions) {
            parts.push(sections.recentDecisions);
            parts.push('');
        }

        // Add entities
        if (sections.activeEntities) {
            parts.push(sections.activeEntities);
            parts.push('');
        }

        // Add pending actions
        if (sections.pendingActions) {
            parts.push(sections.pendingActions);
            parts.push('');
        }

        // Add known issues
        if (sections.knownIssues) {
            parts.push(sections.knownIssues);
            parts.push('');
        }

        // Add references at bottom
        if (sections.references) {
            parts.push('---');
            parts.push('');
            parts.push(sections.references);
        }

        return parts.join('\n');
    }

    // ============================================================================
    // TOKEN CALCULATION
    // ============================================================================

    /**
     * Calculate token breakdown by section.
     */
    private calculateTokenBreakdown(sections: PromptSections): Record<string, number> {
        const breakdown: Record<string, number> = {};

        for (const [key, value] of Object.entries(sections)) {
            breakdown[key] = this.estimateTokens(value);
        }

        breakdown['total'] = Object.values(breakdown).reduce((a, b) => a + b, 0);

        return breakdown;
    }

    /**
     * Estimate tokens from text.
     */
    private estimateTokens(text: string): number {
        return Math.ceil(text.length / CHARS_PER_TOKEN);
    }

    // ============================================================================
    // STATUS GENERATION
    // ============================================================================

    /**
     * Generate reload status report.
     */
    generateStatus(
        context: LoadedContext,
        compiled: CompiledContext,
        prompt: BuiltPrompt
    ): ReloadStatus {
        const includedSections = Object.entries(prompt.sections)
            .filter(([, value]) => value.length > 0)
            .map(([key]) => key);

        return {
            success: true,
            source: context.metadata.source,
            tokenCount: compiled.tokenCount.total,
            compressionRatio: compiled.compressionRatio,
            qualityScore: compiled.quality.score,
            warnings: compiled.quality.warnings,
            errors: [],
            sections: includedSections,
        };
    }

    /**
     * Format status for display.
     */
    formatStatus(status: ReloadStatus): string {
        const lines: string[] = [
            '## ✅ Session Context Reloaded',
            '',
        ];

        // Summary table
        lines.push('| Metric | Value |');
        lines.push('|--------|-------|');
        lines.push(`| Source | ${status.source} |`);
        lines.push(`| Tokens | ${status.tokenCount} |`);
        lines.push(`| Quality | ${(status.qualityScore * 100).toFixed(0)}% |`);
        if (status.compressionRatio < 0.9) {
            lines.push(`| Compression | ${((1 - status.compressionRatio) * 100).toFixed(0)}% reduced |`);
        }

        // Sections loaded
        lines.push('');
        lines.push(`**Sections Loaded**: ${status.sections.join(', ')}`);

        // Warnings
        if (status.warnings.length > 0) {
            lines.push('');
            lines.push('**Warnings**:');
            status.warnings.forEach(w => lines.push(`- ⚠️ ${w}`));
        }

        return lines.join('\n');
    }

    // ============================================================================
    // UTILITIES
    // ============================================================================

    /**
     * Get basename from path.
     */
    private basename(filePath: string): string {
        const parts = filePath.split('/');
        return parts[parts.length - 1] || filePath;
    }

    // ============================================================================
    // QUICK BUILD
    // ============================================================================

    /**
     * Quick build using pre-formatted prompts.
     */
    quickBuild(context: LoadedContext): string {
        // Use pre-formatted if available
        if (context.formatted.hotPrompt && context.formatted.warmPrompt) {
            return [
                '# 🔄 Session Context Restored',
                '',
                context.formatted.hotPrompt,
                '',
                context.formatted.warmPrompt,
            ].join('\n');
        }

        // Fallback to full build
        return this.build(context).fullPrompt;
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a prompt builder instance.
 */
export function createPromptBuilder(config?: PromptBuilderConfig): PromptBuilder {
    return new PromptBuilder(config);
}
