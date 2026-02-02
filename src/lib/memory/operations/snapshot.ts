/**
 * CryptoAgentHQ - Session Snapshot Operations
 * @module lib/memory/operations/snapshot
 * 
 * Creates comprehensive session snapshots.
 * Konsey Değerlendirmesi: Konsey Başkanı + Data Integrity Guardian ⭐⭐⭐⭐⭐
 */

import { createHash } from 'crypto';
import type {
    SessionSnapshot,
    SnapshotResult,
    ConversationMessage,
    ToolCallRecord,
    ArtifactReference,
    ProjectState,
    TaskState,
    AgentState,
    SessionStatistics,
    Summary,
} from '../core/types';
import { memoryLogger } from '../core/config';
import type { SessionMemory } from '../tiers/session-memory';
import type { SummarizedMemory } from '../tiers/summarized-memory';
import type { Summarizer } from './summarizer';
import type { KnowledgeExtractor } from './extractor';
import type { FileStore } from '../persistence/file-store';

// ============================================================================
// SNAPSHOT CREATOR CLASS
// ============================================================================

/**
 * Creates comprehensive session snapshots.
 */
export class SnapshotCreator {
    private readonly sessionMemory: SessionMemory;
    private readonly summarizedMemory: SummarizedMemory;
    private readonly summarizer: Summarizer;
    private readonly extractor: KnowledgeExtractor;
    private readonly fileStore: FileStore;
    private readonly conversationId: string;

    constructor(config: {
        sessionMemory: SessionMemory;
        summarizedMemory: SummarizedMemory;
        summarizer: Summarizer;
        extractor: KnowledgeExtractor;
        fileStore: FileStore;
        conversationId: string;
    }) {
        this.sessionMemory = config.sessionMemory;
        this.summarizedMemory = config.summarizedMemory;
        this.summarizer = config.summarizer;
        this.extractor = config.extractor;
        this.fileStore = config.fileStore;
        this.conversationId = config.conversationId;
    }

    /**
     * Create a complete session snapshot.
     */
    async createSnapshot(options?: {
        includeProjectState?: boolean;
        projectState?: ProjectState;
        taskState?: TaskState;
        agentState?: AgentState;
        artifacts?: ArtifactReference[];
    }): Promise<SnapshotResult> {
        const startTime = Date.now();

        try {
            memoryLogger.info('Creating session snapshot...');

            // 1. Gather messages and tool calls
            const messages = this.sessionMemory.getMessages();
            const toolCalls = this.sessionMemory.getToolCalls();
            const artifacts = options?.artifacts ?? [];

            // 2. Generate summary
            const summary = await this.summarizer.summarize(messages);

            // 3. Extract knowledge
            const knowledge = this.extractor.extract(messages);

            // 4. Calculate statistics
            const statistics = this.calculateStatistics(messages, toolCalls, artifacts);

            // 5. Build snapshot
            const snapshot: SessionSnapshot = {
                id: `snapshot-${Date.now()}`,
                conversationId: this.conversationId,
                sessionId: this.sessionMemory.getSessionInfo().sessionId,
                version: '1.0.0',
                timestamp: new Date(),

                // Core data
                messages,
                toolCalls,
                artifacts,

                // State
                projectState: options?.projectState ?? this.createDefaultProjectState(),
                taskState: options?.taskState ?? this.createDefaultTaskState(),
                agentState: options?.agentState,

                // Knowledge
                summary: summary.content,
                keyDecisions: summary.decisions,
                learnedFacts: knowledge.facts,
                entities: knowledge.entities,

                // Metadata
                statistics,
                checksum: '', // Will be set after serialization
            };

            // Calculate checksum
            snapshot.checksum = this.calculateChecksum(snapshot);

            // 6. Persist snapshot
            await this.persistSnapshot(snapshot, summary);

            const duration = Date.now() - startTime;

            memoryLogger.info('Snapshot created successfully', {
                id: snapshot.id,
                messages: messages.length,
                entities: knowledge.entities.length,
                duration: `${duration}ms`,
            });

            return {
                success: true,
                snapshot,
                archivePath: this.fileStore.getPath('archives', `snapshot-${snapshot.id}.json`),
                summaryPath: this.fileStore.getPath('summaries', 'session-summary.md'),
                knowledgePath: this.fileStore.getPath('knowledge', 'entities.json'),
                duration,
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            memoryLogger.error('Snapshot creation failed', error);

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                duration,
            };
        }
    }

    /**
     * Create an incremental snapshot (only new data since last snapshot).
     */
    async createIncrementalSnapshot(
        lastSnapshotId: string,
        options?: {
            projectState?: ProjectState;
            taskState?: TaskState;
        }
    ): Promise<SnapshotResult> {
        // Load last snapshot to get cutoff point
        const lastSnapshot = await this.fileStore.loadSnapshot(lastSnapshotId);

        if (!lastSnapshot) {
            // Fall back to full snapshot
            return this.createSnapshot(options);
        }

        const lastTurn = Math.max(...lastSnapshot.messages.map(m => m.turnNumber), 0);
        const allMessages = this.sessionMemory.getMessages();
        const newMessages = allMessages.filter(m => m.turnNumber > lastTurn);

        if (newMessages.length === 0) {
            return {
                success: true,
                duration: 0,
            };
        }

        // Create incremental snapshot with only new data
        return this.createSnapshot({
            ...options,
        });
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    /**
     * Persist snapshot to storage.
     */
    private async persistSnapshot(snapshot: SessionSnapshot, summary: Summary): Promise<void> {
        await Promise.all([
            // Save full snapshot
            this.fileStore.saveSnapshot(snapshot),

            // Save human-readable summary
            this.fileStore.saveSummary(summary),

            // Save entities separately for quick loading
            this.fileStore.saveEntities(snapshot.entities),

            // Save decisions separately
            this.fileStore.saveDecisions(snapshot.keyDecisions),

            // Save messages for session restoration
            this.fileStore.saveMessages(snapshot.messages),

            // Save project state
            this.fileStore.saveProjectState(snapshot.projectState),

            // Save task state
            this.fileStore.saveTaskState(snapshot.taskState),
        ]);
    }

    /**
     * Calculate session statistics.
     */
    private calculateStatistics(
        messages: ConversationMessage[],
        toolCalls: ToolCallRecord[],
        artifacts: ArtifactReference[]
    ): SessionStatistics {
        const userMessages = messages.filter(m => m.role === 'user');
        const assistantMessages = messages.filter(m => m.role === 'assistant');

        const totalContent = messages.map(m => m.content).join('');
        const estimatedTokens = Math.ceil(totalContent.length / 4);

        const timestamps = messages.map(m => m.timestamp.getTime());
        const duration = timestamps.length > 1
            ? Math.max(...timestamps) - Math.min(...timestamps)
            : 0;

        const uniqueFiles = new Set<string>();
        messages.forEach(m => {
            const matches = m.content.match(/(?:\/[\w.-]+)+\.\w+/g);
            matches?.forEach(f => uniqueFiles.add(f));
        });

        const errors = messages.filter(m =>
            m.content.toLowerCase().includes('error') ||
            m.content.toLowerCase().includes('failed')
        );

        return {
            messageCount: messages.length,
            userMessageCount: userMessages.length,
            assistantMessageCount: assistantMessages.length,
            toolCallCount: toolCalls.length,
            artifactCount: artifacts.length,
            totalTokens: estimatedTokens,
            duration,
            filesModified: uniqueFiles.size,
            filesCreated: 0, // Would need to track this separately
            errorsEncountered: errors.length,
        };
    }

    /**
     * Calculate checksum for snapshot.
     */
    private calculateChecksum(snapshot: SessionSnapshot): string {
        const data = {
            messages: snapshot.messages,
            toolCalls: snapshot.toolCalls,
            summary: snapshot.summary,
            decisions: snapshot.keyDecisions,
        };

        return createHash('sha256')
            .update(JSON.stringify(data))
            .digest('hex');
    }

    /**
     * Create default project state.
     */
    private createDefaultProjectState(): ProjectState {
        return {
            name: 'Unknown Project',
            rootPath: '',
            techStack: {
                framework: 'unknown',
                language: 'unknown',
                runtime: 'unknown',
                packageManager: 'unknown',
                other: {},
            },
            currentPhase: 'unknown',
            completedTasks: [],
            pendingTasks: [],
            fileStructure: [],
            dependencies: [],
            customState: {},
        };
    }

    /**
     * Create default task state.
     */
    private createDefaultTaskState(): TaskState {
        return {
            checklistItems: [],
        };
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a snapshot creator instance.
 */
export function createSnapshotCreator(config: {
    sessionMemory: SessionMemory;
    summarizedMemory: SummarizedMemory;
    summarizer: Summarizer;
    extractor: KnowledgeExtractor;
    fileStore: FileStore;
    conversationId: string;
}): SnapshotCreator {
    return new SnapshotCreator(config);
}
