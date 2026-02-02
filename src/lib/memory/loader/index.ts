/**
 * CryptoAgentHQ - Loader Module
 * @module lib/memory/loader
 * 
 * Context loading, compilation, and prompt building for session resume.
 * Expert Council Approved: All 8 Experts ⭐⭐⭐⭐⭐
 */

// ============================================================================
// INTEGRITY CHECKER
// ============================================================================

export {
    IntegrityChecker,
    createIntegrityChecker,
} from './integrity-checker';

export type {
    FileIntegrityResult,
    VersionCompatibility,
    IntegrityCheckResult,
    IntegrityWarning,
    IntegrityError,
    RecoveryOption,
    IntegrityCheckerConfig,
} from './integrity-checker';

// ============================================================================
// RELEVANCE SCORER
// ============================================================================

export {
    RelevanceScorer,
    createRelevanceScorer,
} from './relevance-scorer';

export type {
    ScoredEntity,
    ScoredDecision,
    ScoredFact,
    ScoringFactors,
    ScoringConfig,
    ScoringContext,
    ScoringResult,
    ScoringStatistics,
} from './relevance-scorer';

// ============================================================================
// CONTEXT LOADER
// ============================================================================

export {
    ContextLoader,
    ContextLoadError,
    createContextLoader,
} from './context-loader';

export type {
    HotContext,
    WarmContext,
    ColdContext,
    LoadedContext,
    LoadMetadata,
    TokenEstimate,
    ContextLoaderConfig,
} from './context-loader';

// ============================================================================
// CONTEXT COMPILER
// ============================================================================

export {
    ContextCompiler,
    createContextCompiler,
} from './context-compiler';

export type {
    CompiledContext,
    StructuredContextData,
    TokenBreakdown,
    CompressionQuality,
    ContextCompilerConfig,
} from './context-compiler';

// ============================================================================
// PROMPT BUILDER
// ============================================================================

export {
    PromptBuilder,
    createPromptBuilder,
} from './prompt-builder';

export type {
    BuiltPrompt,
    PromptSections,
    PromptMetadata,
    PromptBuilderConfig,
    ReloadStatus,
} from './prompt-builder';

// ============================================================================
// UNIFIED RELOAD INTERFACE
// ============================================================================

import { ContextLoader, type ContextLoaderConfig, type LoadedContext } from './context-loader';
import { ContextCompiler, type ContextCompilerConfig, type CompiledContext } from './context-compiler';
import { PromptBuilder, type PromptBuilderConfig, type BuiltPrompt, type ReloadStatus } from './prompt-builder';
import { IntegrityChecker, type IntegrityCheckResult } from './integrity-checker';
import { memoryLogger } from '../core/config';

/**
 * Unified reload configuration.
 */
export interface ReloadConfig {
    basePath: string;
    conversationId: string;
    maxTokenBudget?: number;
    useRelevanceScoring?: boolean;
    compressionLevel?: 'none' | 'light' | 'moderate' | 'aggressive';
}

/**
 * Complete reload result.
 */
export interface ReloadResult {
    success: boolean;
    context: LoadedContext | null;
    compiled: CompiledContext | null;
    prompt: BuiltPrompt | null;
    status: ReloadStatus;
    formattedStatus: string;
    integrity: IntegrityCheckResult | null;
    error?: string;
}

/**
 * Unified session reload function.
 * This is the main entry point for /memory-reload command.
 */
export async function reloadSession(config: ReloadConfig): Promise<ReloadResult> {
    const startTime = Date.now();
    memoryLogger.info('Starting session reload...', { basePath: config.basePath });

    try {
        // Step 1: Create loader
        const loaderConfig: ContextLoaderConfig = {
            basePath: config.basePath,
            conversationId: config.conversationId,
            maxTokenBudget: config.maxTokenBudget ?? 4000,
            useRelevanceScoring: config.useRelevanceScoring ?? true,
        };
        const loader = new ContextLoader(loaderConfig);

        // Step 2: Load context (includes integrity check)
        const context = await loader.load();

        // Step 3: Compile context
        const compilerConfig: ContextCompilerConfig = {
            maxTokenBudget: config.maxTokenBudget ?? 4000,
            compressionLevel: config.compressionLevel ?? 'moderate',
        };
        const compiler = new ContextCompiler(compilerConfig);
        const compiled = compiler.compile(context);

        // Step 4: Build prompt
        const promptBuilder = new PromptBuilder();
        const prompt = promptBuilder.build(context);

        // Step 5: Generate status
        const status = promptBuilder.generateStatus(context, compiled, prompt);
        const formattedStatus = promptBuilder.formatStatus(status);

        const duration = Date.now() - startTime;
        memoryLogger.info('Session reload complete', {
            tokens: compiled.tokenCount.total,
            quality: compiled.quality.score.toFixed(2),
            duration: `${duration}ms`,
        });

        return {
            success: true,
            context,
            compiled,
            prompt,
            status,
            formattedStatus,
            integrity: null, // Could add if needed
        };

    } catch (error) {
        const duration = Date.now() - startTime;
        memoryLogger.error('Session reload failed', { error, duration: `${duration}ms` });

        const errorMessage = error instanceof Error ? error.message : String(error);

        return {
            success: false,
            context: null,
            compiled: null,
            prompt: null,
            status: {
                success: false,
                source: 'error',
                tokenCount: 0,
                compressionRatio: 1,
                qualityScore: 0,
                warnings: [],
                errors: [errorMessage],
                sections: [],
            },
            formattedStatus: `## ❌ Session Reload Failed\n\n**Error**: ${errorMessage}`,
            integrity: null,
            error: errorMessage,
        };
    }
}

/**
 * Quick integrity check.
 */
export async function checkIntegrity(basePath: string, conversationId: string): Promise<IntegrityCheckResult> {
    const checker = new IntegrityChecker({ basePath, conversationId });
    return checker.check();
}
