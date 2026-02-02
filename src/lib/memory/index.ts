/**
 * CryptoAgentHQ - Memory System
 * @module lib/memory
 * 
 * Hierarchical memory system for session context persistence.
 * MemGPT-inspired 4-tier architecture: Immediate → Session → Summarized → Archival
 */

// Core
export {
    // Types
    type MemoryTier,
    type MemoryEntryType,
    type MemorySource,
    type EntityType,
    type MentionLocation,
    type ExtractedEntity,
    type EntityRelationship,
    type MemoryMetadata,
    type MemoryEntry,
    type RetrieveOptions,
    type ConversationRole,
    type ConversationMessage,
    type ToolCallRecord,
    type ArtifactReference,
    type BuildStatus,
    type FileNode,
    type DependencyInfo,
    type TechStackInfo,
    type ProjectState,
    type TaskState,
    type AgentState,
    type KeyDecision,
    type LearnedFact,
    type SessionStatistics,
    type SessionSnapshot,
    type MemoryConfig,
    type SnapshotResult,
    type RestoreResult,
    type Summary,
    type SummarizationOptions,
    type SearchQuery,
    type SearchFilters,
    type SearchResult,
    type SearchResponse,

    // Config
    createMemoryConfig,
    getMemoryBasePath,
    MEMORY_DIRS,
    MEMORY_FILES,
    TIER_CONFIG,
    IMPORTANCE_WEIGHTS,
    SUMMARIZATION_CONFIG,
    RETRIEVAL_CONFIG,
    PERSISTENCE_CONFIG,
    memoryLogger,

    // Manager
    MemoryManager,
    createMemoryManager,
    getMemoryManager,
} from './core';

// Tiers
export {
    ImmediateMemory,
    createImmediateMemory,
    createImmediateEntry,
    SessionMemory,
    createSessionMemory,
    SummarizedMemory,
    createSummarizedMemory,
    ArchivalMemory,
    createArchivalMemory,
} from './tiers';

// Persistence
export {
    FileStore,
    createFileStore,
} from './persistence';

// Operations
export {
    Summarizer,
    createSummarizer,
    KnowledgeExtractor,
    createKnowledgeExtractor,
    SnapshotCreator,
    createSnapshotCreator,
    SessionRestorer,
    createSessionRestorer,
} from './operations';

// Events
export * from './events';

// Sync
export * from './sync';

// Reload
export * from './reload';

// Commands
export * from './commands';

// Commit
export * from './commit';

// Loader (Session Reload)
// Using explicit exports to avoid conflicts with commit module
export {
    // Classes
    IntegrityChecker,
    createIntegrityChecker,
    RelevanceScorer,
    createRelevanceScorer,
    ContextLoader,
    ContextLoadError,
    createContextLoader,
    ContextCompiler,
    createContextCompiler,
    PromptBuilder,
    createPromptBuilder,
    // Unified functions
    reloadSession,
    checkIntegrity,
} from './loader';

// Re-export types with explicit names to avoid conflicts
export type {
    FileIntegrityResult,
    VersionCompatibility,
    IntegrityCheckResult,
    IntegrityWarning,
    IntegrityError,
    RecoveryOption,
    IntegrityCheckerConfig,
    ScoredEntity,
    ScoredDecision,
    ScoredFact,
    ScoringFactors,
    ScoringConfig,
    ScoringContext,
    ScoringResult,
    ScoringStatistics,
    LoadMetadata,
    TokenEstimate,
    ContextLoaderConfig,
    CompiledContext,
    StructuredContextData,
    TokenBreakdown,
    CompressionQuality,
    ContextCompilerConfig,
    BuiltPrompt,
    PromptSections,
    PromptMetadata,
    PromptBuilderConfig,
    ReloadConfig,
} from './loader';

// Re-export with renamed types to avoid conflicts
export type {
    HotContext as LoaderHotContext,
    WarmContext as LoaderWarmContext,
    ColdContext as LoaderColdContext,
    LoadedContext,
    ReloadResult as LoaderReloadResult,
    ReloadStatus,
} from './loader';
