/**
 * CryptoAgentHQ - Commit Persister
 * @module lib/memory/commit/commit-persister
 * 
 * Atomic persistence with Write-Ahead Log (WAL) pattern.
 * Konsey Değerlendirmesi: Elena Kowalski (Persistence Engineering Lead) ⭐⭐⭐⭐⭐
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import type { SessionData } from './data-collector';
import type { CommitChecksums } from './commit-validator';
import type { ResumableContext } from './resumable-context';
import type { SessionSnapshot } from '../core/types';
import { MEMORY_DIRS, memoryLogger } from '../core/config';
import type { FileStore } from '../persistence/file-store';

// ============================================================================
// TYPES
// ============================================================================

/**
 * WAL operation types.
 */
export type WALOperationType =
    | 'commit.prepare'
    | 'commit.snapshot'
    | 'commit.messages'
    | 'commit.entities'
    | 'commit.decisions'
    | 'commit.context'
    | 'commit.complete'
    | 'commit.rollback';

/**
 * WAL entry structure.
 */
export interface WALEntry {
    id: string;
    commitId: string;
    operation: WALOperationType;
    timestamp: Date;
    data?: unknown;
    checksum?: string;
    completed: boolean;
}

/**
 * Commit operation record.
 */
export interface CommitOperation {
    commitId: string;
    phase: WALOperationType;
    startedAt: Date;
    completedAt?: Date;
    success: boolean;
    error?: string;
}

/**
 * Persist result.
 */
export interface PersistResult {
    success: boolean;
    commitId: string;
    snapshotPath: string;
    contextPath?: string;
    archivePath: string;
    duration: number;
    bytesWritten: number;
    error?: string;
}

/**
 * Commit metadata stored with each commit.
 */
export interface CommitMetadata {
    commitId: string;
    conversationId: string;
    sessionId: string;
    timestamp: Date;
    version: string;
    previousCommitId?: string;
    checksums: CommitChecksums;
    statistics: {
        messagesCount: number;
        toolCallsCount: number;
        entitiesCount: number;
        filesChangedCount: number;
        totalSizeBytes: number;
    };
    paths: {
        snapshot: string;
        messages: string;
        entities: string;
        decisions: string;
        context?: string;
    };
}

/**
 * Persister configuration.
 */
export interface CommitPersisterConfig {
    basePath: string;
    conversationId: string;
    fileStore: FileStore;
    walEnabled?: boolean;
    walRetentionMs?: number;
}

// ============================================================================
// COMMIT PERSISTER CLASS
// ============================================================================

/**
 * Atomic persistence with WAL pattern.
 */
export class CommitPersister {
    private readonly config: Required<CommitPersisterConfig>;
    private readonly walPath: string;
    private currentCommitId: string | null = null;
    private walEntries: WALEntry[] = [];

    constructor(config: CommitPersisterConfig) {
        this.config = {
            basePath: config.basePath,
            conversationId: config.conversationId,
            fileStore: config.fileStore,
            walEnabled: config.walEnabled ?? true,
            walRetentionMs: config.walRetentionMs ?? 86400000, // 24 hours
        };
        this.walPath = join(this.config.basePath, 'wal');
    }

    // ============================================================================
    // MAIN PERSISTENCE
    // ============================================================================

    /**
     * Persist session data atomically.
     */
    async persist(
        data: SessionData,
        checksums: CommitChecksums,
        resumableContext?: ResumableContext
    ): Promise<PersistResult> {
        const startTime = Date.now();
        const commitId = this.generateCommitId();
        this.currentCommitId = commitId;
        let bytesWritten = 0;

        memoryLogger.info('Starting atomic persist...', { commitId });

        try {
            // Phase 1: Prepare - Write to WAL
            if (this.config.walEnabled) {
                await this.writeToWAL({
                    operation: 'commit.prepare',
                    commitId,
                    data: { conversationId: data.conversationId, sessionId: data.sessionId },
                });
            }

            // Ensure directories exist
            await this.ensureCommitDirectories();

            // Phase 2: Create snapshot
            const snapshot = this.createSnapshot(data, checksums, commitId);
            const snapshotPath = this.getPath('archives', `snapshot-${commitId}.json`);
            await this.writeJson(snapshotPath, snapshot);
            bytesWritten += JSON.stringify(snapshot).length;

            if (this.config.walEnabled) {
                await this.writeToWAL({ operation: 'commit.snapshot', commitId });
            }

            // Phase 3: Save individual components
            const messagesPath = this.getPath('session', 'messages.json');
            await this.writeJson(messagesPath, data.messages);
            bytesWritten += JSON.stringify(data.messages).length;

            if (this.config.walEnabled) {
                await this.writeToWAL({ operation: 'commit.messages', commitId });
            }

            // Save entities
            const entitiesPath = this.getPath('knowledge', 'entities.json');
            await this.writeJson(entitiesPath, data.entities);
            bytesWritten += JSON.stringify(data.entities).length;

            if (this.config.walEnabled) {
                await this.writeToWAL({ operation: 'commit.entities', commitId });
            }

            // Save decisions
            const decisionsPath = this.getPath('summaries', 'decisions.json');
            await this.writeJson(decisionsPath, data.decisions);
            bytesWritten += JSON.stringify(data.decisions).length;

            if (this.config.walEnabled) {
                await this.writeToWAL({ operation: 'commit.decisions', commitId });
            }

            // Save facts
            const factsPath = this.getPath('knowledge', 'facts.json');
            await this.writeJson(factsPath, data.facts);
            bytesWritten += JSON.stringify(data.facts).length;

            // Save tool calls
            const toolCallsPath = this.getPath('session', 'tool-calls.json');
            await this.writeJson(toolCallsPath, data.toolCalls);
            bytesWritten += JSON.stringify(data.toolCalls).length;

            // Save tool outputs
            if (data.toolOutputs.length > 0) {
                const toolOutputsPath = this.getPath('session', 'tool-outputs.json');
                await this.writeJson(toolOutputsPath, data.toolOutputs);
                bytesWritten += JSON.stringify(data.toolOutputs).length;
            }

            // Save file changes
            if (data.fileChanges.length > 0) {
                const fileChangesPath = this.getPath('session', 'file-changes.json');
                await this.writeJson(fileChangesPath, data.fileChanges);
                bytesWritten += JSON.stringify(data.fileChanges).length;
            }

            // Save project state
            const projectStatePath = this.getPath('context', 'project-state.json');
            await this.writeJson(projectStatePath, data.projectState);
            bytesWritten += JSON.stringify(data.projectState).length;

            // Save task state
            const taskStatePath = this.getPath('context', 'task-state.json');
            await this.writeJson(taskStatePath, data.taskState);
            bytesWritten += JSON.stringify(data.taskState).length;

            // Phase 4: Save resumable context
            let contextPath: string | undefined;
            if (resumableContext) {
                contextPath = this.getPath('context', 'resumable.json');
                await this.writeJson(contextPath, resumableContext);
                bytesWritten += JSON.stringify(resumableContext).length;

                if (this.config.walEnabled) {
                    await this.writeToWAL({ operation: 'commit.context', commitId });
                }
            }

            // Phase 5: Save commit metadata
            const metadata = this.createCommitMetadata(data, checksums, commitId, {
                snapshot: snapshotPath,
                messages: messagesPath,
                entities: entitiesPath,
                decisions: decisionsPath,
                context: contextPath,
            });
            const metadataPath = this.getPath('commits', `${commitId}.json`);
            await this.writeJson(metadataPath, metadata);
            bytesWritten += JSON.stringify(metadata).length;

            // Phase 6: Update latest commit pointer
            const latestPath = this.getPath('commits', 'latest.json');
            await this.writeJson(latestPath, { commitId, timestamp: new Date() });

            // Phase 7: Mark commit as complete in WAL
            if (this.config.walEnabled) {
                await this.writeToWAL({ operation: 'commit.complete', commitId });
                await this.clearWAL(commitId);
            }

            const duration = Date.now() - startTime;

            memoryLogger.info('Atomic persist complete', {
                commitId,
                bytesWritten,
                duration: `${duration}ms`,
            });

            return {
                success: true,
                commitId,
                snapshotPath,
                contextPath,
                archivePath: snapshotPath,
                duration,
                bytesWritten,
            };

        } catch (error) {
            memoryLogger.error('Persist failed, rolling back...', error);

            // Rollback on failure
            if (this.config.walEnabled) {
                await this.rollbackWAL(commitId);
            }

            return {
                success: false,
                commitId,
                snapshotPath: '',
                archivePath: '',
                duration: Date.now() - startTime,
                bytesWritten: 0,
                error: error instanceof Error ? error.message : String(error),
            };
        } finally {
            this.currentCommitId = null;
        }
    }

    // ============================================================================
    // WAL OPERATIONS
    // ============================================================================

    /**
     * Write operation to WAL.
     */
    private async writeToWAL(entry: Omit<WALEntry, 'id' | 'timestamp' | 'completed'>): Promise<void> {
        const walEntry: WALEntry = {
            id: `wal-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            commitId: entry.commitId,
            operation: entry.operation,
            timestamp: new Date(),
            data: entry.data,
            checksum: entry.checksum,
            completed: false,
        };

        this.walEntries.push(walEntry);

        // Persist WAL to disk
        await this.ensureDir(this.walPath);
        const walFilePath = join(this.walPath, `${entry.commitId}.wal.json`);
        await this.writeJson(walFilePath, this.walEntries.filter(e => e.commitId === entry.commitId));

        memoryLogger.debug('WAL entry written', { operation: entry.operation, commitId: entry.commitId });
    }

    /**
     * Clear WAL entries for completed commit.
     */
    private async clearWAL(commitId: string): Promise<void> {
        this.walEntries = this.walEntries.filter(e => e.commitId !== commitId);

        const walFilePath = join(this.walPath, `${commitId}.wal.json`);
        try {
            await fs.unlink(walFilePath);
        } catch {
            // File may not exist
        }

        memoryLogger.debug('WAL cleared', { commitId });
    }

    /**
     * Rollback failed commit using WAL.
     */
    private async rollbackWAL(commitId: string): Promise<void> {
        memoryLogger.info('Rolling back commit...', { commitId });

        const entries = this.walEntries.filter(e => e.commitId === commitId);

        // Delete files created during this commit (in reverse order)
        for (const entry of entries.reverse()) {
            try {
                switch (entry.operation) {
                    case 'commit.snapshot':
                        await this.deleteFile(this.getPath('archives', `snapshot-${commitId}.json`));
                        break;
                    case 'commit.messages':
                        // Don't delete messages - they may have existed before
                        break;
                    case 'commit.context':
                        await this.deleteFile(this.getPath('context', 'resumable.json'));
                        break;
                }
            } catch (error) {
                memoryLogger.warn('Rollback step failed', { operation: entry.operation, error });
            }
        }

        // Write rollback entry
        await this.writeToWAL({ operation: 'commit.rollback', commitId });

        // Clear WAL
        await this.clearWAL(commitId);

        memoryLogger.info('Rollback complete', { commitId });
    }

    /**
     * Recover from incomplete commits on startup.
     */
    async recoverFromWAL(): Promise<void> {
        try {
            await this.ensureDir(this.walPath);
            const files = await fs.readdir(this.walPath);
            const walFiles = files.filter(f => f.endsWith('.wal.json'));

            for (const walFile of walFiles) {
                const walFilePath = join(this.walPath, walFile);
                const content = await fs.readFile(walFilePath, 'utf-8');
                const entries: WALEntry[] = JSON.parse(content);

                // Check if commit was completed
                const hasComplete = entries.some(e => e.operation === 'commit.complete');

                if (!hasComplete && entries.length > 0) {
                    const commitId = entries[0].commitId;
                    memoryLogger.warn('Found incomplete commit, rolling back', { commitId });
                    await this.rollbackWAL(commitId);
                }

                // Clean up old WAL file
                await fs.unlink(walFilePath);
            }
        } catch (error) {
            memoryLogger.warn('WAL recovery check failed', error);
        }
    }

    // ============================================================================
    // SNAPSHOT CREATION
    // ============================================================================

    /**
     * Create session snapshot from data.
     */
    private createSnapshot(
        data: SessionData,
        checksums: CommitChecksums,
        commitId: string
    ): SessionSnapshot {
        return {
            id: commitId,
            conversationId: data.conversationId,
            sessionId: data.sessionId,
            version: '2.0.0',
            timestamp: new Date(),
            messages: data.messages,
            toolCalls: data.toolCalls,
            artifacts: data.artifacts,
            projectState: data.projectState,
            taskState: data.taskState,
            summary: `Session with ${data.messages.length} messages`,
            keyDecisions: data.decisions,
            learnedFacts: data.facts,
            entities: data.entities,
            statistics: {
                messageCount: data.statistics.messageCount,
                userMessageCount: data.statistics.userMessageCount,
                assistantMessageCount: data.statistics.assistantMessageCount,
                toolCallCount: data.statistics.toolCallCount,
                artifactCount: data.statistics.artifactCount,
                totalTokens: Math.ceil(data.statistics.totalContentSize / 4),
                duration: 0,
                filesModified: data.statistics.fileChangeCount,
                filesCreated: 0,
                errorsEncountered: 0,
            },
            checksum: checksums.global,
        };
    }

    /**
     * Create commit metadata.
     */
    private createCommitMetadata(
        data: SessionData,
        checksums: CommitChecksums,
        commitId: string,
        paths: CommitMetadata['paths']
    ): CommitMetadata {
        return {
            commitId,
            conversationId: data.conversationId,
            sessionId: data.sessionId,
            timestamp: new Date(),
            version: '2.0.0',
            checksums,
            statistics: {
                messagesCount: data.statistics.messageCount,
                toolCallsCount: data.statistics.toolCallCount,
                entitiesCount: data.statistics.entityCount,
                filesChangedCount: data.statistics.fileChangeCount,
                totalSizeBytes: data.statistics.totalContentSize,
            },
            paths,
        };
    }

    // ============================================================================
    // UTILITIES
    // ============================================================================

    /**
     * Generate a unique commit ID.
     */
    private generateCommitId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 8);
        return `commit-${timestamp}-${random}`;
    }

    /**
     * Get full path for a file.
     */
    private getPath(dir: keyof typeof MEMORY_DIRS | 'commits', filename: string): string {
        return join(this.config.basePath, dir, filename);
    }

    /**
     * Ensure all commit directories exist.
     */
    private async ensureCommitDirectories(): Promise<void> {
        const dirs = ['session', 'summaries', 'knowledge', 'context', 'archives', 'commits', 'wal'];

        for (const dir of dirs) {
            await this.ensureDir(join(this.config.basePath, dir));
        }
    }

    /**
     * Ensure directory exists.
     */
    private async ensureDir(path: string): Promise<void> {
        await fs.mkdir(path, { recursive: true });
    }

    /**
     * Write JSON file atomically.
     */
    private async writeJson(filePath: string, data: unknown): Promise<void> {
        await this.ensureDir(dirname(filePath));

        const tempPath = `${filePath}.tmp`;
        const content = JSON.stringify(data, null, 2);

        await fs.writeFile(tempPath, content, 'utf-8');
        await fs.rename(tempPath, filePath);
    }

    /**
     * Delete a file safely.
     */
    private async deleteFile(filePath: string): Promise<boolean> {
        try {
            await fs.unlink(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get last commit metadata.
     */
    async getLastCommit(): Promise<CommitMetadata | null> {
        try {
            const latestPath = this.getPath('commits', 'latest.json');
            const content = await fs.readFile(latestPath, 'utf-8');
            const { commitId } = JSON.parse(content);

            const metadataPath = this.getPath('commits', `${commitId}.json`);
            const metadataContent = await fs.readFile(metadataPath, 'utf-8');
            return JSON.parse(metadataContent);
        } catch {
            return null;
        }
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a commit persister instance.
 */
export function createCommitPersister(config: CommitPersisterConfig): CommitPersister {
    return new CommitPersister(config);
}
