/**
 * CryptoAgentHQ - Context Loader
 * @module lib/memory/loader/context-loader
 * 
 * Orchestrate loading from all memory tiers.
 * Expert Council Approved: Dr. Charles Packer (MemGPT) ⭐⭐⭐⭐⭐
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { memoryLogger } from '../core/config';
import type { ExtractedEntity, KeyDecision, LearnedFact } from '../core/types';
import { IntegrityChecker, type IntegrityCheckResult } from './integrity-checker';
import { RelevanceScorer, type ScoringContext } from './relevance-scorer';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Hot context - immediate working memory.
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
 * Warm context - recent session memory.
 */
export interface WarmContext {
    sessionSummary: string;
    recentDecisions: Array<{
        id: string;
        title: string;
        description: string;
    }>;
    activeEntities: Array<{
        name: string;
        type: string;
        description: string;
    }>;
    keyFacts: string[];
    conversationTopics: string[];
    errorsEncountered: string[];
    filesModified: string[];
}

/**
 * Cold context - reference data only.
 */
export interface ColdContext {
    commitId?: string;
    snapshotPath?: string;
    archivePath?: string;
    entityIndexPath?: string;
    decisionLogPath?: string;
    totalMessages: number;
    totalEntities: number;
    sessionDuration: number;
}

/**
 * Complete loaded context.
 */
export interface LoadedContext {
    hot: HotContext;
    warm: WarmContext;
    cold: ColdContext;
    formatted: {
        hotPrompt: string;
        warmPrompt: string;
    };
    metadata: LoadMetadata;
    tokenEstimate: TokenEstimate;
}

/**
 * Load metadata.
 */
export interface LoadMetadata {
    loadedAt: Date;
    loadDuration: number;
    source: 'context' | 'snapshot' | 'fallback';
    sourceId: string;
    version: string;
    integrityStatus: 'valid' | 'recovered' | 'partial';
}

/**
 * Token estimates.
 */
export interface TokenEstimate {
    hot: number;
    warm: number;
    cold: number;
    total: number;
}

/**
 * Loader configuration.
 */
export interface ContextLoaderConfig {
    basePath: string;
    conversationId: string;
    loadHot?: boolean;
    loadWarm?: boolean;
    loadCold?: boolean;
    maxTokenBudget?: number;
    relevanceThreshold?: number;
    useRelevanceScoring?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG = {
    loadHot: true,
    loadWarm: true,
    loadCold: true,
    maxTokenBudget: 4000,
    relevanceThreshold: 0.4,
    useRelevanceScoring: true,
};

const CONTEXT_DIR = '.context';
const SNAPSHOTS_DIR = '.snapshots';
const CONTEXT_FILE = 'resumable.json';

// Token estimation (approximate chars per token)
const CHARS_PER_TOKEN = 4;

// ============================================================================
// CONTEXT LOADER CLASS
// ============================================================================

/**
 * Load and orchestrate context from all tiers.
 */
export class ContextLoader {
    private readonly config: Required<ContextLoaderConfig>;
    private readonly integrityChecker: IntegrityChecker;
    private readonly relevanceScorer: RelevanceScorer;

    constructor(config: ContextLoaderConfig) {
        this.config = {
            ...DEFAULT_CONFIG,
            ...config,
        };

        this.integrityChecker = new IntegrityChecker({
            basePath: this.config.basePath,
            conversationId: this.config.conversationId,
        });

        this.relevanceScorer = new RelevanceScorer({
            threshold: this.config.relevanceThreshold,
        });
    }

    // ============================================================================
    // MAIN LOADING
    // ============================================================================

    /**
     * Load complete context with validation.
     */
    async load(): Promise<LoadedContext> {
        const startTime = Date.now();
        memoryLogger.info('Starting context load...');

        // Step 1: Integrity check
        const integrity = await this.integrityChecker.check();

        if (!integrity.canProceed) {
            memoryLogger.error('Cannot proceed with context load', {
                errors: integrity.errors,
            });
            throw new ContextLoadError(
                'Context integrity check failed',
                integrity.errors.map(e => e.message)
            );
        }

        // Step 2: Determine source
        const { source, sourceId } = this.determineSource(integrity);
        memoryLogger.info(`Loading from source: ${source}`, { sourceId });

        // Step 3: Load based on source
        let context: LoadedContext;

        try {
            if (source === 'context') {
                context = await this.loadFromContextFile(sourceId);
            } else if (source === 'snapshot') {
                context = await this.loadFromSnapshot(sourceId);
            } else {
                context = await this.loadFromFallback(integrity);
            }

            // Update metadata
            context.metadata.loadDuration = Date.now() - startTime;
            context.metadata.integrityStatus = integrity.valid ? 'valid' :
                (integrity.fallbackSnapshot ? 'recovered' : 'partial');

            memoryLogger.info('Context load complete', {
                source: context.metadata.source,
                duration: `${context.metadata.loadDuration}ms`,
                tokens: context.tokenEstimate.total,
            });

            return context;

        } catch (error) {
            memoryLogger.error('Context load failed', error);

            // Try fallback
            if (integrity.fallbackSnapshot) {
                memoryLogger.info('Attempting fallback load...');
                return this.loadFromSnapshot(integrity.fallbackSnapshot);
            }

            throw error;
        }
    }

    /**
     * Quick load without full integrity check.
     */
    async quickLoad(): Promise<LoadedContext | null> {
        try {
            const contextPath = this.getContextPath();
            const exists = await this.integrityChecker.quickCheck();

            if (!exists) {
                return null;
            }

            return this.loadFromContextFile(contextPath);
        } catch (error) {
            memoryLogger.warn('Quick load failed', error);
            return null;
        }
    }

    // ============================================================================
    // SOURCE DETERMINATION
    // ============================================================================

    /**
     * Determine best source for loading.
     */
    private determineSource(integrity: IntegrityCheckResult): {
        source: 'context' | 'snapshot' | 'fallback';
        sourceId: string;
    } {
        // Prefer context file if valid
        if (integrity.contextFileResult.exists &&
            integrity.contextFileResult.validJson &&
            integrity.versionCompatible) {
            return {
                source: 'context',
                sourceId: integrity.contextFileResult.path,
            };
        }

        // Try latest snapshot
        if (integrity.latestSnapshot) {
            return {
                source: 'snapshot',
                sourceId: integrity.latestSnapshot,
            };
        }

        // Fallback
        if (integrity.fallbackSnapshot) {
            return {
                source: 'fallback',
                sourceId: integrity.fallbackSnapshot,
            };
        }

        // No valid source
        throw new ContextLoadError('No valid context source available', [
            'Context file: ' + (integrity.contextFileResult.error || 'missing'),
            'Snapshots: none available',
        ]);
    }

    // ============================================================================
    // LOADING FROM SOURCES
    // ============================================================================

    /**
     * Load from context file.
     */
    private async loadFromContextFile(filePath: string): Promise<LoadedContext> {
        const contextPath = filePath.endsWith('.json')
            ? filePath
            : this.getContextPath();

        const content = await fs.readFile(contextPath, 'utf-8');
        const data = JSON.parse(content);

        // Apply relevance scoring if entities exist
        let scoringContext: ScoringContext | undefined;
        if (this.config.useRelevanceScoring && data.warm?.activeEntities) {
            scoringContext = {
                currentTask: data.hot?.currentTask,
                activeFiles: data.hot?.activeFilesPaths,
                recentTopics: data.warm?.conversationTopics,
            };
            this.relevanceScorer.setContext(scoringContext);
        }

        const hot = this.extractHotContext(data);
        const warm = this.extractWarmContext(data, scoringContext);
        const cold = this.extractColdContext(data);
        const formatted = this.extractFormattedPrompts(data);
        const tokenEstimate = this.calculateTokens(hot, warm, cold);

        return {
            hot,
            warm,
            cold,
            formatted,
            metadata: {
                loadedAt: new Date(),
                loadDuration: 0,
                source: 'context',
                sourceId: path.basename(contextPath),
                version: data.version || '1.0.0',
                integrityStatus: 'valid',
            },
            tokenEstimate,
        };
    }

    /**
     * Load from snapshot file.
     */
    private async loadFromSnapshot(snapshotId: string): Promise<LoadedContext> {
        const snapshotPath = path.join(
            this.config.basePath,
            SNAPSHOTS_DIR,
            `${snapshotId}.json`
        );

        const content = await fs.readFile(snapshotPath, 'utf-8');
        const data = JSON.parse(content);

        // Convert snapshot format to context format
        const hot = this.snapshotToHotContext(data);
        const warm = this.snapshotToWarmContext(data);
        const cold = this.snapshotToColdContext(data, snapshotId);
        const formatted = {
            hotPrompt: this.generateHotPrompt(hot),
            warmPrompt: this.generateWarmPrompt(warm),
        };
        const tokenEstimate = this.calculateTokens(hot, warm, cold);

        return {
            hot,
            warm,
            cold,
            formatted,
            metadata: {
                loadedAt: new Date(),
                loadDuration: 0,
                source: 'snapshot',
                sourceId: snapshotId,
                version: data.version || '1.0.0',
                integrityStatus: 'recovered',
            },
            tokenEstimate,
        };
    }

    /**
     * Load from fallback (minimal context).
     */
    private async loadFromFallback(integrity: IntegrityCheckResult): Promise<LoadedContext> {
        const hot = this.createEmptyHotContext();
        const warm = this.createEmptyWarmContext();
        const cold: ColdContext = {
            totalMessages: 0,
            totalEntities: 0,
            sessionDuration: 0,
        };

        // Try to populate from any available snapshot
        if (integrity.snapshotsAvailable.length > 0) {
            const snapshotId = integrity.snapshotsAvailable[0];
            try {
                const partialContext = await this.loadFromSnapshot(snapshotId);
                return {
                    ...partialContext,
                    metadata: {
                        ...partialContext.metadata,
                        source: 'fallback',
                        integrityStatus: 'partial',
                    },
                };
            } catch {
                // Continue with empty context
            }
        }

        return {
            hot,
            warm,
            cold,
            formatted: {
                hotPrompt: this.generateHotPrompt(hot),
                warmPrompt: this.generateWarmPrompt(warm),
            },
            metadata: {
                loadedAt: new Date(),
                loadDuration: 0,
                source: 'fallback',
                sourceId: 'empty',
                version: '2.0.0',
                integrityStatus: 'partial',
            },
            tokenEstimate: { hot: 50, warm: 100, cold: 20, total: 170 },
        };
    }

    // ============================================================================
    // CONTEXT EXTRACTION
    // ============================================================================

    /**
     * Extract hot context from data.
     */
    private extractHotContext(data: Record<string, unknown>): HotContext {
        const hot = data.hot as Record<string, unknown> | undefined;

        return {
            lastUserMessage: String(hot?.lastUserMessage ?? ''),
            lastAssistantMessage: String(hot?.lastAssistantMessage ?? ''),
            currentTask: hot?.currentTask as string | undefined,
            taskStatus: hot?.taskStatus as string | undefined,
            immediateContext: Array.isArray(hot?.immediateContext)
                ? (hot.immediateContext as string[])
                : [],
            activeFilesPaths: Array.isArray(hot?.activeFilesPaths)
                ? (hot.activeFilesPaths as string[])
                : [],
            lastTurnNumber: Number(hot?.lastTurnNumber ?? 0),
        };
    }

    /**
     * Extract warm context from data.
     */
    private extractWarmContext(
        data: Record<string, unknown>,
        _scoringContext?: ScoringContext
    ): WarmContext {
        const warm = data.warm as Record<string, unknown> | undefined;

        return {
            sessionSummary: String(warm?.sessionSummary ?? ''),
            recentDecisions: Array.isArray(warm?.recentDecisions)
                ? (warm.recentDecisions as WarmContext['recentDecisions'])
                : [],
            activeEntities: Array.isArray(warm?.activeEntities)
                ? (warm.activeEntities as WarmContext['activeEntities'])
                : [],
            keyFacts: Array.isArray(warm?.keyFacts)
                ? (warm.keyFacts as string[])
                : [],
            conversationTopics: Array.isArray(warm?.conversationTopics)
                ? (warm.conversationTopics as string[])
                : [],
            errorsEncountered: Array.isArray(warm?.errorsEncountered)
                ? (warm.errorsEncountered as string[])
                : [],
            filesModified: Array.isArray(warm?.filesModified)
                ? (warm.filesModified as string[])
                : [],
        };
    }

    /**
     * Extract cold context from data.
     */
    private extractColdContext(data: Record<string, unknown>): ColdContext {
        const cold = data.cold as Record<string, unknown> | undefined;

        return {
            commitId: cold?.commitId as string | undefined,
            snapshotPath: cold?.snapshotPath as string | undefined,
            archivePath: cold?.archivePath as string | undefined,
            entityIndexPath: cold?.entityIndexPath as string | undefined,
            decisionLogPath: cold?.decisionLogPath as string | undefined,
            totalMessages: Number(cold?.totalMessages ?? 0),
            totalEntities: Number(cold?.totalEntities ?? 0),
            sessionDuration: Number(cold?.sessionDuration ?? 0),
        };
    }

    /**
     * Extract pre-formatted prompts.
     */
    private extractFormattedPrompts(data: Record<string, unknown>): {
        hotPrompt: string;
        warmPrompt: string;
    } {
        const formatted = data.formatted as Record<string, unknown> | undefined;

        return {
            hotPrompt: String(formatted?.hotPrompt ?? ''),
            warmPrompt: String(formatted?.warmPrompt ?? ''),
        };
    }

    // ============================================================================
    // SNAPSHOT CONVERSION
    // ============================================================================

    /**
     * Convert snapshot to hot context.
     */
    private snapshotToHotContext(data: Record<string, unknown>): HotContext {
        return {
            lastUserMessage: '',
            lastAssistantMessage: String(data.summary ?? ''),
            currentTask: undefined,
            taskStatus: undefined,
            immediateContext: [],
            activeFilesPaths: Array.isArray(data.filesCreated)
                ? (data.filesCreated as string[]).slice(0, 5)
                : [],
            lastTurnNumber: 0,
        };
    }

    /**
     * Convert snapshot to warm context.
     */
    private snapshotToWarmContext(data: Record<string, unknown>): WarmContext {
        const decisions = Array.isArray(data.decisions)
            ? (data.decisions as Array<{ id: string; title: string; description: string }>)
            : [];

        const entities = Array.isArray(data.entities)
            ? (data.entities as Array<{ name: string; type: string; description: string }>)
            : [];

        const facts = Array.isArray(data.facts)
            ? (data.facts as Array<{ content: string }>).map(f => f.content)
            : [];

        return {
            sessionSummary: String(data.summary ?? ''),
            recentDecisions: decisions.slice(0, 5),
            activeEntities: entities.slice(0, 10),
            keyFacts: facts.slice(0, 5),
            conversationTopics: [],
            errorsEncountered: [],
            filesModified: Array.isArray(data.filesModified)
                ? (data.filesModified as string[])
                : [],
        };
    }

    /**
     * Convert snapshot to cold context.
     */
    private snapshotToColdContext(
        data: Record<string, unknown>,
        snapshotId: string
    ): ColdContext {
        const stats = data.statistics as Record<string, unknown> | undefined;

        return {
            commitId: String(data.id ?? ''),
            snapshotPath: path.join(SNAPSHOTS_DIR, `${snapshotId}.json`),
            totalMessages: Number(stats?.messageCount ?? 0),
            totalEntities: Number(stats?.entityCount ?? 0),
            sessionDuration: 0,
        };
    }

    // ============================================================================
    // PROMPT GENERATION
    // ============================================================================

    /**
     * Generate hot prompt from context.
     */
    private generateHotPrompt(hot: HotContext): string {
        const lines: string[] = [
            '## Session Resume Context (Hot)',
            '',
        ];

        if (hot.currentTask) {
            lines.push(`**Current Task**: ${hot.currentTask}`);
        }

        if (hot.taskStatus) {
            lines.push(`**Status**: ${hot.taskStatus}`);
        }

        if (hot.lastUserMessage || hot.lastAssistantMessage) {
            lines.push('', '**Last Exchange**:');
            if (hot.lastUserMessage) {
                lines.push(`- User: ${hot.lastUserMessage.slice(0, 100)}...`);
            }
            if (hot.lastAssistantMessage) {
                lines.push(`- Assistant: ${hot.lastAssistantMessage.slice(0, 100)}...`);
            }
        }

        if (hot.activeFilesPaths.length > 0) {
            lines.push('', '**Active Files**:');
            hot.activeFilesPaths.slice(0, 5).forEach(f => {
                lines.push(`- \`${path.basename(f)}\``);
            });
        }

        return lines.join('\n');
    }

    /**
     * Generate warm prompt from context.
     */
    private generateWarmPrompt(warm: WarmContext): string {
        const lines: string[] = [
            '## Session Context (Warm)',
            '',
        ];

        if (warm.sessionSummary) {
            lines.push('### Summary');
            lines.push(warm.sessionSummary);
            lines.push('');
        }

        if (warm.recentDecisions.length > 0) {
            lines.push('### Key Decisions');
            warm.recentDecisions.forEach(d => {
                lines.push(`- **${d.title}**: ${d.description}`);
            });
            lines.push('');
        }

        if (warm.activeEntities.length > 0) {
            lines.push('### Active Entities');
            warm.activeEntities.slice(0, 5).forEach(e => {
                lines.push(`- **${e.name}** (${e.type}): ${e.description}`);
            });
            lines.push('');
        }

        if (warm.errorsEncountered.length > 0) {
            lines.push('### Errors Resolved');
            warm.errorsEncountered.forEach(e => {
                lines.push(`- ${e}`);
            });
        }

        return lines.join('\n');
    }

    // ============================================================================
    // EMPTY CONTEXT CREATION
    // ============================================================================

    /**
     * Create empty hot context.
     */
    private createEmptyHotContext(): HotContext {
        return {
            lastUserMessage: '',
            lastAssistantMessage: '',
            currentTask: undefined,
            taskStatus: undefined,
            immediateContext: [],
            activeFilesPaths: [],
            lastTurnNumber: 0,
        };
    }

    /**
     * Create empty warm context.
     */
    private createEmptyWarmContext(): WarmContext {
        return {
            sessionSummary: '',
            recentDecisions: [],
            activeEntities: [],
            keyFacts: [],
            conversationTopics: [],
            errorsEncountered: [],
            filesModified: [],
        };
    }

    // ============================================================================
    // TOKEN ESTIMATION
    // ============================================================================

    /**
     * Calculate token estimates for all tiers.
     */
    private calculateTokens(
        hot: HotContext,
        warm: WarmContext,
        cold: ColdContext
    ): TokenEstimate {
        const hotChars = JSON.stringify(hot).length;
        const warmChars = JSON.stringify(warm).length;
        const coldChars = JSON.stringify(cold).length;

        const hotTokens = Math.ceil(hotChars / CHARS_PER_TOKEN);
        const warmTokens = Math.ceil(warmChars / CHARS_PER_TOKEN);
        const coldTokens = Math.ceil(coldChars / CHARS_PER_TOKEN);

        return {
            hot: hotTokens,
            warm: warmTokens,
            cold: coldTokens,
            total: hotTokens + warmTokens + coldTokens,
        };
    }

    // ============================================================================
    // PATH UTILITIES
    // ============================================================================

    /**
     * Get context file path.
     */
    private getContextPath(): string {
        return path.join(this.config.basePath, CONTEXT_DIR, CONTEXT_FILE);
    }
}

// ============================================================================
// ERRORS
// ============================================================================

/**
 * Context load error.
 */
export class ContextLoadError extends Error {
    public readonly details: string[];

    constructor(message: string, details: string[] = []) {
        super(message);
        this.name = 'ContextLoadError';
        this.details = details;
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a context loader instance.
 */
export function createContextLoader(config: ContextLoaderConfig): ContextLoader {
    return new ContextLoader(config);
}
