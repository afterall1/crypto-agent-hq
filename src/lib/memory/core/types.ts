/**
 * CryptoAgentHQ - Memory System Core Types
 * @module lib/memory/core/types
 * 
 * Comprehensive type definitions for the hierarchical memory system.
 * Konsey Değerlendirmesi: Cognitive Architect + TypeScript Expert ⭐⭐⭐⭐⭐
 */

// ============================================================================
// MEMORY TIER TYPES
// ============================================================================

/**
 * Memory hierarchy tiers (MemGPT-inspired).
 * - immediate: Current context window (hot)
 * - session: Working memory for current session (warm)
 * - summarized: Compressed episodic memory (cool)
 * - archival: Complete historical record (cold)
 */
export type MemoryTier = 'immediate' | 'session' | 'summarized' | 'archival';

/**
 * Types of memory entries.
 */
export type MemoryEntryType =
    | 'message'
    | 'tool_call'
    | 'tool_result'
    | 'decision'
    | 'error'
    | 'artifact'
    | 'summary'
    | 'fact'
    | 'entity';

/**
 * Source of memory content.
 */
export type MemorySource = 'user' | 'assistant' | 'system' | 'tool';

// ============================================================================
// EXTRACTED ENTITY TYPES
// ============================================================================

/**
 * Types of extracted entities.
 */
export type EntityType =
    | 'file'
    | 'function'
    | 'class'
    | 'concept'
    | 'decision'
    | 'bug'
    | 'feature'
    | 'person'
    | 'tool'
    | 'config'
    | 'dependency';

/**
 * A mention location within the conversation.
 */
export interface MentionLocation {
    turnNumber: number;
    startOffset: number;
    endOffset: number;
    context: string;
}

/**
 * An extracted entity from conversation.
 */
export interface ExtractedEntity {
    id: string;
    name: string;
    type: EntityType;
    properties: Record<string, unknown>;
    mentions: MentionLocation[];
    relationships: EntityRelationship[];
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Relationship between entities.
 */
export interface EntityRelationship {
    fromEntityId: string;
    toEntityId: string;
    type: string;
    weight: number;
}

// ============================================================================
// MEMORY ENTRY TYPES
// ============================================================================

/**
 * Metadata for a memory entry.
 */
export interface MemoryMetadata {
    conversationId: string;
    sessionId: string;
    turnNumber: number;
    source: MemorySource;
    tags: string[];
    entities: ExtractedEntity[];
    references: string[];
    processingTime?: number;
}

/**
 * A single memory entry.
 */
export interface MemoryEntry {
    id: string;
    tier: MemoryTier;
    content: string;
    type: MemoryEntryType;
    metadata: MemoryMetadata;
    embedding?: number[];
    createdAt: Date;
    accessedAt: Date;
    importance: number;
    tokens?: number;
}

/**
 * Options for memory retrieval.
 */
export interface RetrieveOptions {
    tier?: MemoryTier | MemoryTier[];
    type?: MemoryEntryType | MemoryEntryType[];
    limit?: number;
    minImportance?: number;
    includeEmbeddings?: boolean;
    dateRange?: {
        start?: Date;
        end?: Date;
    };
}

// ============================================================================
// CONVERSATION MESSAGE TYPES
// ============================================================================

/**
 * Role in conversation.
 */
export type ConversationRole = 'user' | 'assistant' | 'system';

/**
 * A conversation message.
 */
export interface ConversationMessage {
    id: string;
    role: ConversationRole;
    content: string;
    timestamp: Date;
    turnNumber: number;
    toolCalls?: ToolCallRecord[];
    metadata?: Record<string, unknown>;
}

/**
 * Record of a tool call.
 */
export interface ToolCallRecord {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    result?: unknown;
    success: boolean;
    duration?: number;
    error?: string;
}

// ============================================================================
// SESSION SNAPSHOT TYPES
// ============================================================================

/**
 * Reference to an artifact.
 */
export interface ArtifactReference {
    id: string;
    path: string;
    type: 'implementation_plan' | 'walkthrough' | 'task' | 'other';
    title: string;
    summary: string;
    createdAt: Date;
    updatedAt: Date;
    sizeBytes: number;
}

/**
 * Build status information.
 */
export interface BuildStatus {
    success: boolean;
    timestamp: Date;
    command: string;
    output?: string;
    errors?: string[];
    warnings?: string[];
}

/**
 * Information about a file in the project.
 */
export interface FileNode {
    path: string;
    name: string;
    type: 'file' | 'directory';
    sizeBytes?: number;
    modified?: Date;
    children?: FileNode[];
}

/**
 * Dependency information.
 */
export interface DependencyInfo {
    name: string;
    version: string;
    type: 'production' | 'development';
    description?: string;
}

/**
 * Technology stack information.
 */
export interface TechStackInfo {
    framework: string;
    language: string;
    runtime: string;
    packageManager: string;
    database?: string;
    styling?: string;
    testing?: string;
    other: Record<string, string>;
}

/**
 * Project state snapshot.
 */
export interface ProjectState {
    name: string;
    rootPath: string;
    techStack: TechStackInfo;
    currentPhase: string;
    completedTasks: string[];
    pendingTasks: string[];
    fileStructure: FileNode[];
    dependencies: DependencyInfo[];
    lastBuildStatus?: BuildStatus;
    customState: Record<string, unknown>;
}

/**
 * Task state snapshot.
 */
export interface TaskState {
    currentTask?: string;
    taskMode?: 'PLANNING' | 'EXECUTION' | 'VERIFICATION';
    taskStatus?: string;
    taskSummary?: string;
    checklistItems: Array<{
        text: string;
        completed: boolean;
        inProgress?: boolean;
    }>;
}

/**
 * Agent state snapshot.
 */
export interface AgentState {
    activeAgents: string[];
    pendingDelegations: number;
    workflowsInProgress: number;
    lastAgentActivity?: Date;
    tokenUsage: {
        input: number;
        output: number;
        total: number;
    };
}

/**
 * A key decision made during the session.
 */
export interface KeyDecision {
    id: string;
    title: string;
    description: string;
    rationale: string;
    alternatives?: string[];
    timestamp: Date;
    turnNumber: number;
    impact: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * A fact learned during the session.
 */
export interface LearnedFact {
    id: string;
    content: string;
    source: string;
    confidence: number;
    category: string;
    timestamp: Date;
}

/**
 * Session statistics.
 */
export interface SessionStatistics {
    messageCount: number;
    userMessageCount: number;
    assistantMessageCount: number;
    toolCallCount: number;
    artifactCount: number;
    totalTokens: number;
    duration: number;
    filesModified: number;
    filesCreated: number;
    errorsEncountered: number;
}

/**
 * Complete session snapshot.
 */
export interface SessionSnapshot {
    id: string;
    conversationId: string;
    sessionId: string;
    version: string;
    timestamp: Date;

    // Core Data
    messages: ConversationMessage[];
    toolCalls: ToolCallRecord[];
    artifacts: ArtifactReference[];

    // State
    projectState: ProjectState;
    taskState: TaskState;
    agentState?: AgentState;

    // Summaries
    summary: string;
    keyDecisions: KeyDecision[];
    learnedFacts: LearnedFact[];
    entities: ExtractedEntity[];

    // Metadata
    statistics: SessionStatistics;
    checksum: string;
}

// ============================================================================
// MEMORY MANAGER TYPES
// ============================================================================

/**
 * Configuration for memory manager.
 */
export interface MemoryConfig {
    conversationId: string;
    basePath: string;
    maxImmediateTokens: number;
    maxSessionEntries: number;
    autoSaveInterval: number;
    summarizationThreshold: number;
    importanceThreshold: number;
    enableEmbeddings: boolean;
}

/**
 * Default memory configuration.
 */
export const DEFAULT_MEMORY_CONFIG: Omit<MemoryConfig, 'conversationId' | 'basePath'> = {
    maxImmediateTokens: 4000,
    maxSessionEntries: 100,
    autoSaveInterval: 5,
    summarizationThreshold: 50,
    importanceThreshold: 0.3,
    enableEmbeddings: false,
};

/**
 * Result of a snapshot operation.
 */
export interface SnapshotResult {
    success: boolean;
    snapshot?: SessionSnapshot;
    archivePath?: string;
    summaryPath?: string;
    knowledgePath?: string;
    error?: string;
    duration: number;
}

/**
 * Result of a restore operation.
 */
export interface RestoreResult {
    success: boolean;
    messagesRestored: number;
    entitiesRestored: number;
    factsRestored: number;
    error?: string;
    duration: number;
}

// ============================================================================
// SUMMARY TYPES
// ============================================================================

/**
 * A generated summary.
 */
export interface Summary {
    id: string;
    conversationId: string;
    type: 'session' | 'chunk' | 'merged';
    content: string;
    keyPoints: string[];
    decisions: KeyDecision[];
    errors: Array<{ description: string; solution: string }>;
    filesModified: string[];
    currentState: string;
    nextSteps: string[];
    timestamp: Date;
    sourceMessages: number;
    tokens: number;
}

/**
 * Summarization options.
 */
export interface SummarizationOptions {
    maxTokens?: number;
    preserveDecisions?: boolean;
    preserveErrors?: boolean;
    includeFileChanges?: boolean;
    style?: 'concise' | 'detailed' | 'narrative';
}

// ============================================================================
// SEARCH & RETRIEVAL TYPES
// ============================================================================

/**
 * Search query options.
 */
export interface SearchQuery {
    text?: string;
    embedding?: number[];
    filters?: SearchFilters;
    limit?: number;
    offset?: number;
    sortBy?: 'relevance' | 'recency' | 'importance';
}

/**
 * Search filters.
 */
export interface SearchFilters {
    tier?: MemoryTier[];
    type?: MemoryEntryType[];
    tags?: string[];
    entityTypes?: EntityType[];
    dateRange?: { start?: Date; end?: Date };
    minImportance?: number;
}

/**
 * Search result item.
 */
export interface SearchResult {
    entry: MemoryEntry;
    score: number;
    matchedTerms?: string[];
    highlights?: string[];
}

/**
 * Search response.
 */
export interface SearchResponse {
    results: SearchResult[];
    totalCount: number;
    queryTime: number;
    hasMore: boolean;
}
