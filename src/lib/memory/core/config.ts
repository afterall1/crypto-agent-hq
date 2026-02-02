/**
 * CryptoAgentHQ - Memory Configuration
 * @module lib/memory/core/config
 * 
 * Memory system configuration and defaults.
 * Konsey Değerlendirmesi: Production DevOps ⭐⭐⭐⭐⭐
 */

import type { MemoryConfig } from './types';

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================

const isServer = typeof window === 'undefined';
const isDevelopment = process.env.NODE_ENV === 'development';

// ============================================================================
// DEFAULT PATHS
// ============================================================================

/**
 * Get the base path for memory storage.
 */
export function getMemoryBasePath(conversationId: string): string {
    if (isServer) {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
        return `${homeDir}/.gemini/antigravity/brain/${conversationId}`;
    }
    return `/memory/${conversationId}`;
}

/**
 * Memory subdirectory structure.
 */
export const MEMORY_DIRS = {
    session: 'session',
    summaries: 'summaries',
    knowledge: 'knowledge',
    context: 'context',
    archives: 'archives',
    events: 'events',
} as const;

/**
 * Memory file names.
 */
export const MEMORY_FILES = {
    messages: 'messages.json',
    state: 'state.json',
    metadata: 'metadata.json',
    sessionSummary: 'session-summary.md',
    keyDecisions: 'key-decisions.json',
    entities: 'entities.json',
    relationships: 'relationships.json',
    concepts: 'concepts.json',
    projectState: 'project-state.json',
    activeTasks: 'active-tasks.json',
} as const;

// ============================================================================
// CONFIGURATION FACTORY
// ============================================================================

/**
 * Create a memory configuration.
 */
export function createMemoryConfig(
    conversationId: string,
    overrides?: Partial<MemoryConfig>
): MemoryConfig {
    const basePath = getMemoryBasePath(conversationId);

    return {
        conversationId,
        basePath,
        maxImmediateTokens: overrides?.maxImmediateTokens ?? 4000,
        maxSessionEntries: overrides?.maxSessionEntries ?? 100,
        autoSaveInterval: overrides?.autoSaveInterval ?? 5,
        summarizationThreshold: overrides?.summarizationThreshold ?? 50,
        importanceThreshold: overrides?.importanceThreshold ?? 0.3,
        enableEmbeddings: overrides?.enableEmbeddings ?? false,
    };
}

// ============================================================================
// TIER CONFIGURATION
// ============================================================================

/**
 * Configuration for each memory tier.
 */
export const TIER_CONFIG = {
    immediate: {
        maxTokens: 4000,
        maxEntries: 20,
        ttlMinutes: 60,
        compressAfter: 10,
    },
    session: {
        maxTokens: 50000,
        maxEntries: 200,
        ttlMinutes: 1440, // 24 hours
        compressAfter: 100,
    },
    summarized: {
        maxTokens: 10000,
        maxEntries: 50,
        ttlDays: 30,
        mergeThreshold: 5,
    },
    archival: {
        maxTokens: Infinity,
        maxEntries: Infinity,
        retentionDays: 365,
        compressionLevel: 'high' as const,
    },
} as const;

// ============================================================================
// IMPORTANCE SCORING
// ============================================================================

/**
 * Importance weights for different entry types.
 */
export const IMPORTANCE_WEIGHTS = {
    decision: 1.0,
    error: 0.9,
    artifact: 0.8,
    tool_result: 0.6,
    tool_call: 0.5,
    message: 0.4,
    summary: 0.7,
    fact: 0.6,
    entity: 0.5,
} as const;

/**
 * Importance adjustments based on content.
 */
export const IMPORTANCE_ADJUSTMENTS = {
    mentionsFile: 0.1,
    mentionsError: 0.15,
    mentionsDecision: 0.2,
    containsCode: 0.1,
    isQuestion: 0.05,
    hasEntities: 0.1,
    referencedLater: 0.2,
} as const;

// ============================================================================
// SUMMARIZATION CONFIG
// ============================================================================

/**
 * Summarization configuration.
 */
export const SUMMARIZATION_CONFIG = {
    chunkSize: 50000, // tokens per chunk
    maxSummaryTokens: 2000,
    preserveLastN: 5, // Always keep last N messages verbatim
    minMessagesForSummary: 10,
    summaryRefreshInterval: 20, // messages

    // Prompt configuration
    style: 'structured' as const,
    includeKeyDecisions: true,
    includeErrors: true,
    includeFileChanges: true,
} as const;

// ============================================================================
// RETRIEVAL CONFIG
// ============================================================================

/**
 * Retrieval configuration.
 */
export const RETRIEVAL_CONFIG = {
    defaultLimit: 10,
    maxLimit: 50,
    semanticWeight: 0.7,
    keywordWeight: 0.3,
    recencyBoost: 0.1,
    importanceBoost: 0.2,
    minSimilarityScore: 0.5,
} as const;

// ============================================================================
// PERSISTENCE CONFIG
// ============================================================================

/**
 * Persistence configuration.
 */
export const PERSISTENCE_CONFIG = {
    writeDebounceMs: 500,
    maxRetries: 3,
    backupOnWrite: isDevelopment,
    prettyPrint: isDevelopment,
    checksumAlgorithm: 'sha256' as const,
    compressionEnabled: !isDevelopment,
} as const;

// ============================================================================
// LOGGING
// ============================================================================

/**
 * Memory system logger.
 */
export const memoryLogger = {
    debug: (message: string, data?: unknown) => {
        if (isDevelopment) {
            console.log(`[Memory:DEBUG] ${message}`, data ?? '');
        }
    },
    info: (message: string, data?: unknown) => {
        console.log(`[Memory:INFO] ${message}`, data ?? '');
    },
    warn: (message: string, data?: unknown) => {
        console.warn(`[Memory:WARN] ${message}`, data ?? '');
    },
    error: (message: string, error?: unknown) => {
        console.error(`[Memory:ERROR] ${message}`, error ?? '');
    },
};
