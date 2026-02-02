/**
 * CryptoAgentHQ - Session Data Collector
 * @module lib/memory/commit/data-collector
 * 
 * Collects ALL session data for comprehensive commit.
 * Konsey Değerlendirmesi: Dr. Marcus Wei (Cognitive Memory Architect) ⭐⭐⭐⭐⭐
 */

import { createHash } from 'crypto';
import type {
    ConversationMessage,
    ToolCallRecord,
    ArtifactReference,
    ExtractedEntity,
    LearnedFact,
    KeyDecision,
    ProjectState,
    TaskState,
    MemoryEntry,
} from '../core/types';
import { memoryLogger } from '../core/config';
import type { SessionMemory } from '../tiers/session-memory';
import type { SummarizedMemory } from '../tiers/summarized-memory';
import type { ArchivalMemory } from '../tiers/archival-memory';
import type { Summarizer } from '../operations/summarizer';
import type { KnowledgeExtractor } from '../operations/extractor';
import type { FileStore } from '../persistence/file-store';

// ============================================================================
// TYPES
// ============================================================================

/**
 * File change tracking.
 */
export interface FileChange {
    id: string;
    path: string;
    operation: 'created' | 'modified' | 'deleted';
    previousChecksum?: string;
    newChecksum?: string;
    sizeDelta: number;
    timestamp: Date;
    turnNumber: number;
}

/**
 * Tool output with full data.
 */
export interface ToolOutput {
    toolCallId: string;
    name: string;
    output: unknown;
    outputSize: number;
    success: boolean;
    timestamp: Date;
}

/**
 * Complete session data for commit.
 */
export interface SessionData {
    // Metadata
    conversationId: string;
    sessionId: string;
    collectedAt: Date;

    // Core data
    messages: ConversationMessage[];
    toolCalls: ToolCallRecord[];
    toolOutputs: ToolOutput[];

    // Extracted knowledge
    entities: ExtractedEntity[];
    decisions: KeyDecision[];
    facts: LearnedFact[];

    // Artifacts & files
    artifacts: ArtifactReference[];
    fileChanges: FileChange[];

    // State
    projectState: ProjectState;
    taskState: TaskState;

    // Memory entries by tier
    memoryEntries: {
        session: MemoryEntry[];
        summarized: MemoryEntry[];
        archival: MemoryEntry[];
    };

    // Statistics
    statistics: CollectionStatistics;
}

/**
 * Collection statistics.
 */
export interface CollectionStatistics {
    messageCount: number;
    userMessageCount: number;
    assistantMessageCount: number;
    toolCallCount: number;
    toolOutputCount: number;
    entityCount: number;
    decisionCount: number;
    factCount: number;
    artifactCount: number;
    fileChangeCount: number;
    totalContentSize: number;
    collectionDuration: number;
}

/**
 * Data collector configuration.
 */
export interface DataCollectorConfig {
    conversationId: string;
    sessionId: string;
    sessionMemory: SessionMemory;
    summarizedMemory: SummarizedMemory;
    archivalMemory: ArchivalMemory;
    summarizer: Summarizer;
    extractor: KnowledgeExtractor;
    fileStore: FileStore;
}

// ============================================================================
// DATA COLLECTOR CLASS
// ============================================================================

/**
 * Collects all session data for comprehensive commit.
 */
export class DataCollector {
    private readonly config: DataCollectorConfig;
    private fileChanges: FileChange[] = [];
    private toolOutputs: Map<string, ToolOutput> = new Map();

    constructor(config: DataCollectorConfig) {
        this.config = config;
    }

    // ============================================================================
    // MAIN COLLECTION
    // ============================================================================

    /**
     * Collect ALL session data.
     */
    async collectAll(): Promise<SessionData> {
        const startTime = Date.now();
        memoryLogger.info('Starting comprehensive data collection...');

        try {
            // Collect from all sources in parallel where possible
            const [
                messages,
                toolCalls,
                artifacts,
            ] = await Promise.all([
                Promise.resolve(this.collectMessages()),
                Promise.resolve(this.collectToolCalls()),
                this.collectArtifacts(),
            ]);

            // Extract knowledge from messages
            const knowledge = this.config.extractor.extract(messages);
            const decisions = this.config.summarizer.extractDecisions(messages);

            // Collect state
            const projectState = await this.captureProjectState();
            const taskState = await this.captureTaskState();

            // Collect memory entries
            const memoryEntries = this.collectMemoryEntries();

            // Calculate statistics
            const collectionDuration = Date.now() - startTime;
            const statistics = this.calculateStatistics({
                messages,
                toolCalls,
                toolOutputs: Array.from(this.toolOutputs.values()),
                entities: knowledge.entities,
                decisions,
                facts: knowledge.facts,
                artifacts,
                fileChanges: this.fileChanges,
                collectionDuration,
            });

            const sessionData: SessionData = {
                conversationId: this.config.conversationId,
                sessionId: this.config.sessionId,
                collectedAt: new Date(),
                messages,
                toolCalls,
                toolOutputs: Array.from(this.toolOutputs.values()),
                entities: knowledge.entities,
                decisions,
                facts: knowledge.facts,
                artifacts,
                fileChanges: [...this.fileChanges],
                projectState,
                taskState,
                memoryEntries,
                statistics,
            };

            memoryLogger.info('Data collection complete', {
                messages: messages.length,
                entities: knowledge.entities.length,
                duration: `${collectionDuration}ms`,
            });

            return sessionData;

        } catch (error) {
            memoryLogger.error('Data collection failed', error);
            throw error;
        }
    }

    // ============================================================================
    // INDIVIDUAL COLLECTORS
    // ============================================================================

    /**
     * Collect all conversation messages.
     */
    collectMessages(): ConversationMessage[] {
        return this.config.sessionMemory.getMessages();
    }

    /**
     * Collect all tool calls with their records.
     */
    collectToolCalls(): ToolCallRecord[] {
        return this.config.sessionMemory.getToolCalls();
    }

    /**
     * Record a tool output for later commit.
     */
    recordToolOutput(toolCallId: string, name: string, output: unknown, success: boolean): void {
        const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

        this.toolOutputs.set(toolCallId, {
            toolCallId,
            name,
            output,
            outputSize: outputStr.length,
            success,
            timestamp: new Date(),
        });
    }

    /**
     * Record a file change for later commit.
     */
    recordFileChange(
        path: string,
        operation: FileChange['operation'],
        turnNumber: number,
        options?: { previousChecksum?: string; newChecksum?: string; sizeDelta?: number }
    ): void {
        this.fileChanges.push({
            id: `fc-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            path,
            operation,
            previousChecksum: options?.previousChecksum,
            newChecksum: options?.newChecksum,
            sizeDelta: options?.sizeDelta ?? 0,
            timestamp: new Date(),
            turnNumber,
        });
    }

    /**
     * Collect artifact references.
     */
    async collectArtifacts(): Promise<ArtifactReference[]> {
        // In a full implementation, this would scan the artifact directory
        // For now, return empty array - artifacts are tracked separately
        return [];
    }

    /**
     * Capture current project state.
     */
    async captureProjectState(): Promise<ProjectState> {
        const existing = await this.config.fileStore.loadProjectState();

        if (existing) {
            return existing;
        }

        // Create default project state
        return {
            name: 'CryptoAgentHQ',
            rootPath: process.cwd(),
            techStack: {
                framework: 'Next.js',
                language: 'TypeScript',
                runtime: 'Node.js',
                packageManager: 'npm',
                other: {},
            },
            currentPhase: 'development',
            completedTasks: [],
            pendingTasks: [],
            fileStructure: [],
            dependencies: [],
            customState: {},
        };
    }

    /**
     * Capture current task state.
     */
    async captureTaskState(): Promise<TaskState> {
        // Try to load task state from file store
        const existingTaskState = await this.config.fileStore.loadTaskState();

        if (existingTaskState) {
            return existingTaskState;
        }

        // Return empty task state if none exists
        return {
            currentTask: undefined,
            taskMode: undefined,
            taskStatus: undefined,
            taskSummary: undefined,
            checklistItems: [],
        };
    }

    /**
     * Collect memory entries from all tiers.
     */
    collectMemoryEntries(): SessionData['memoryEntries'] {
        return {
            session: this.config.sessionMemory.retrieve({}),
            summarized: this.config.summarizedMemory.retrieve({}),
            archival: this.config.archivalMemory.retrieve({}),
        };
    }

    // ============================================================================
    // STATISTICS
    // ============================================================================

    /**
     * Calculate collection statistics.
     */
    private calculateStatistics(data: {
        messages: ConversationMessage[];
        toolCalls: ToolCallRecord[];
        toolOutputs: ToolOutput[];
        entities: ExtractedEntity[];
        decisions: KeyDecision[];
        facts: LearnedFact[];
        artifacts: ArtifactReference[];
        fileChanges: FileChange[];
        collectionDuration: number;
    }): CollectionStatistics {
        const userMessages = data.messages.filter(m => m.role === 'user');
        const assistantMessages = data.messages.filter(m => m.role === 'assistant');

        // Calculate total content size
        let totalContentSize = 0;
        data.messages.forEach(m => totalContentSize += m.content.length);
        data.toolOutputs.forEach(t => totalContentSize += t.outputSize);

        return {
            messageCount: data.messages.length,
            userMessageCount: userMessages.length,
            assistantMessageCount: assistantMessages.length,
            toolCallCount: data.toolCalls.length,
            toolOutputCount: data.toolOutputs.length,
            entityCount: data.entities.length,
            decisionCount: data.decisions.length,
            factCount: data.facts.length,
            artifactCount: data.artifacts.length,
            fileChangeCount: data.fileChanges.length,
            totalContentSize,
            collectionDuration: data.collectionDuration,
        };
    }

    // ============================================================================
    // UTILITIES
    // ============================================================================

    /**
     * Calculate checksum for content.
     */
    calculateChecksum(content: string): string {
        return createHash('sha256').update(content).digest('hex');
    }

    /**
     * Clear recorded data (for new session).
     */
    clear(): void {
        this.fileChanges = [];
        this.toolOutputs.clear();
    }

    /**
     * Get current file changes count.
     */
    getFileChangesCount(): number {
        return this.fileChanges.length;
    }

    /**
     * Get current tool outputs count.
     */
    getToolOutputsCount(): number {
        return this.toolOutputs.size;
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a data collector instance.
 */
export function createDataCollector(config: DataCollectorConfig): DataCollector {
    return new DataCollector(config);
}
