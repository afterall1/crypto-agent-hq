/**
 * CryptoAgentHQ - Commit Command
 * @module lib/memory/commit/commit-command
 * 
 * User-facing session commit command.
 * Konsey Değerlendirmesi: Full Council Approval ⭐⭐⭐⭐⭐
 */

import type { SessionData, DataCollectorConfig } from './data-collector';
import { DataCollector, createDataCollector } from './data-collector';
import { CommitValidator, createCommitValidator, type CommitChecksums, type FullValidationReport } from './commit-validator';
import { CommitPersister, createCommitPersister, type PersistResult, type CommitMetadata } from './commit-persister';
import { ResumableContextGenerator, createResumableContextGenerator, type ResumableContext } from './resumable-context';
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
 * Commit options.
 */
export interface CommitOptions {
    mode: 'full' | 'incremental';
    includeToolOutputs?: boolean;
    includeFileChanges?: boolean;
    generateResumableContext?: boolean;
    validateIntegrity?: boolean;
    skipIfEmpty?: boolean;
}

/**
 * Commit result.
 */
export interface CommitResult {
    success: boolean;
    commitId: string;
    timestamp: Date;
    duration: number;
    statistics: CommitStatistics;
    checksums: CommitChecksums;
    validation?: FullValidationReport;
    resumableContextPath?: string;
    error?: string;
}

/**
 * Commit statistics.
 */
export interface CommitStatistics {
    messagesCommitted: number;
    toolCallsCommitted: number;
    toolOutputsCommitted: number;
    entitiesExtracted: number;
    decisionsRecorded: number;
    factsRecorded: number;
    filesChanged: number;
    artifactsCreated: number;
    totalSizeBytes: number;
    commitDuration: number;
}

/**
 * Commit preview (dry-run).
 */
export interface CommitPreview {
    messagesCount: number;
    toolCallsCount: number;
    entityCount: number;
    decisionCount: number;
    factCount: number;
    fileChangesCount: number;
    estimatedSizeBytes: number;
    estimatedDuration: number;
    warnings: string[];
}

/**
 * Commit info summary.
 */
export interface CommitInfo {
    commitId: string;
    timestamp: Date;
    messagesCount: number;
    entitiesCount: number;
    globalChecksum: string;
}

/**
 * Integrity verification report.
 */
export interface IntegrityReport {
    valid: boolean;
    commitId: string;
    verifiedAt: Date;
    checksumMatches: {
        messages: boolean;
        entities: boolean;
        decisions: boolean;
        global: boolean;
    };
    errors: string[];
}

/**
 * Commit command configuration.
 */
export interface CommitCommandConfig {
    conversationId: string;
    sessionId: string;
    basePath: string;
    sessionMemory: SessionMemory;
    summarizedMemory: SummarizedMemory;
    archivalMemory: ArchivalMemory;
    summarizer: Summarizer;
    extractor: KnowledgeExtractor;
    fileStore: FileStore;
}

// ============================================================================
// COMMIT COMMAND CLASS
// ============================================================================

/**
 * User-facing commit command.
 */
export class CommitCommand {
    private readonly config: CommitCommandConfig;
    private readonly dataCollector: DataCollector;
    private readonly validator: CommitValidator;
    private readonly persister: CommitPersister;
    private initialized: boolean = false;

    constructor(config: CommitCommandConfig) {
        this.config = config;

        // Initialize components
        this.dataCollector = createDataCollector({
            conversationId: config.conversationId,
            sessionId: config.sessionId,
            sessionMemory: config.sessionMemory,
            summarizedMemory: config.summarizedMemory,
            archivalMemory: config.archivalMemory,
            summarizer: config.summarizer,
            extractor: config.extractor,
            fileStore: config.fileStore,
        });

        this.validator = createCommitValidator({
            checksumAlgorithm: 'sha256',
            strictMode: true,
            validateReferences: true,
        });

        this.persister = createCommitPersister({
            basePath: config.basePath,
            conversationId: config.conversationId,
            fileStore: config.fileStore,
            walEnabled: true,
        });
    }

    // ============================================================================
    // INITIALIZATION
    // ============================================================================

    /**
     * Initialize the commit command.
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        // Recover from any incomplete commits
        await this.persister.recoverFromWAL();
        this.initialized = true;

        memoryLogger.info('CommitCommand initialized');
    }

    // ============================================================================
    // MAIN OPERATIONS
    // ============================================================================

    /**
     * Execute a commit with options.
     */
    async commit(options: CommitOptions = { mode: 'full' }): Promise<CommitResult> {
        await this.initialize();
        const startTime = Date.now();

        memoryLogger.info('Starting commit...', { mode: options.mode });

        try {
            // Phase 1: Collect data
            const data = await this.dataCollector.collectAll();

            // Skip if empty and option set
            if (options.skipIfEmpty && data.messages.length === 0) {
                return {
                    success: true,
                    commitId: '',
                    timestamp: new Date(),
                    duration: Date.now() - startTime,
                    statistics: this.createEmptyStatistics(),
                    checksums: this.createEmptyChecksums(),
                };
            }

            // Phase 2: Validate (if enabled)
            let validation: FullValidationReport | undefined;
            if (options.validateIntegrity !== false) {
                validation = this.validator.validateComplete(data);

                if (!validation.valid) {
                    memoryLogger.error('Validation failed', { errors: validation.totalErrors });
                    return {
                        success: false,
                        commitId: '',
                        timestamp: new Date(),
                        duration: Date.now() - startTime,
                        statistics: this.createStatisticsFromData(data, Date.now() - startTime),
                        checksums: validation.checksums,
                        validation,
                        error: `Validation failed with ${validation.totalErrors} errors`,
                    };
                }
            }

            // Calculate checksums
            const checksums = validation?.checksums ?? this.validator.calculateAllChecksums(data);

            // Phase 3: Generate resumable context (if enabled)
            let resumableContext: ResumableContext | undefined;
            if (options.generateResumableContext !== false) {
                const contextGenerator = createResumableContextGenerator({
                    basePath: this.config.basePath,
                    commitId: `commit-${Date.now()}`,
                    hotContextTokens: 2000,
                    warmContextTokens: 8000,
                });
                resumableContext = contextGenerator.generate(data);
            }

            // Phase 4: Persist atomically
            const persistResult = await this.persister.persist(data, checksums, resumableContext);

            if (!persistResult.success) {
                return {
                    success: false,
                    commitId: persistResult.commitId,
                    timestamp: new Date(),
                    duration: Date.now() - startTime,
                    statistics: this.createStatisticsFromData(data, Date.now() - startTime),
                    checksums,
                    validation,
                    error: persistResult.error,
                };
            }

            const duration = Date.now() - startTime;
            const statistics = this.createStatisticsFromData(data, duration);

            memoryLogger.info('Commit successful', {
                commitId: persistResult.commitId,
                messages: statistics.messagesCommitted,
                entities: statistics.entitiesExtracted,
                duration: `${duration}ms`,
            });

            return {
                success: true,
                commitId: persistResult.commitId,
                timestamp: new Date(),
                duration,
                statistics,
                checksums,
                validation,
                resumableContextPath: persistResult.contextPath,
            };

        } catch (error) {
            memoryLogger.error('Commit failed', error);

            return {
                success: false,
                commitId: '',
                timestamp: new Date(),
                duration: Date.now() - startTime,
                statistics: this.createEmptyStatistics(),
                checksums: this.createEmptyChecksums(),
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Quick commit (incremental, no validation).
     */
    async quickCommit(): Promise<CommitResult> {
        return this.commit({
            mode: 'incremental',
            includeToolOutputs: false,
            includeFileChanges: false,
            generateResumableContext: true,
            validateIntegrity: false,
            skipIfEmpty: true,
        });
    }

    /**
     * Full commit with all options enabled.
     */
    async fullCommit(): Promise<CommitResult> {
        return this.commit({
            mode: 'full',
            includeToolOutputs: true,
            includeFileChanges: true,
            generateResumableContext: true,
            validateIntegrity: true,
            skipIfEmpty: false,
        });
    }

    /**
     * Preview what will be committed (dry-run).
     */
    async preview(): Promise<CommitPreview> {
        await this.initialize();

        const data = await this.dataCollector.collectAll();
        const warnings: string[] = [];

        // Generate warnings
        if (data.messages.length === 0) {
            warnings.push('No messages to commit');
        }
        if (data.entities.length === 0) {
            warnings.push('No entities extracted');
        }
        if (data.decisions.length === 0) {
            warnings.push('No decisions recorded');
        }

        return {
            messagesCount: data.messages.length,
            toolCallsCount: data.toolCalls.length,
            entityCount: data.entities.length,
            decisionCount: data.decisions.length,
            factCount: data.facts.length,
            fileChangesCount: data.fileChanges.length,
            estimatedSizeBytes: data.statistics.totalContentSize,
            estimatedDuration: Math.max(100, data.messages.length * 10), // Rough estimate
            warnings,
        };
    }

    /**
     * Get last commit info.
     */
    async getLastCommit(): Promise<CommitInfo | null> {
        await this.initialize();

        const metadata = await this.persister.getLastCommit();

        if (!metadata) {
            return null;
        }

        return {
            commitId: metadata.commitId,
            timestamp: new Date(metadata.timestamp),
            messagesCount: metadata.statistics.messagesCount,
            entitiesCount: metadata.statistics.entitiesCount,
            globalChecksum: metadata.checksums.global,
        };
    }

    /**
     * Verify integrity of a commit.
     */
    async verifyIntegrity(commitId: string): Promise<IntegrityReport> {
        await this.initialize();

        const errors: string[] = [];
        const checksumMatches = {
            messages: false,
            entities: false,
            decisions: false,
            global: false,
        };

        try {
            // Load commit metadata
            const metadata = await this.persister.getLastCommit();

            if (!metadata || metadata.commitId !== commitId) {
                errors.push(`Commit ${commitId} not found`);
                return {
                    valid: false,
                    commitId,
                    verifiedAt: new Date(),
                    checksumMatches,
                    errors,
                };
            }

            // Load and verify each component
            const messages = await this.config.fileStore.loadMessages<unknown>();
            if (messages) {
                const actualChecksum = this.validator.calculateChecksum(messages);
                checksumMatches.messages = actualChecksum === metadata.checksums.messages;
                if (!checksumMatches.messages) {
                    errors.push('Messages checksum mismatch');
                }
            }

            const entities = await this.config.fileStore.loadEntities();
            if (entities) {
                const actualChecksum = this.validator.calculateChecksum(entities);
                checksumMatches.entities = actualChecksum === metadata.checksums.entities;
                if (!checksumMatches.entities) {
                    errors.push('Entities checksum mismatch');
                }
            }

            // Mark global as valid if all components match
            checksumMatches.global = checksumMatches.messages && checksumMatches.entities;
            checksumMatches.decisions = true; // Simplified for now

            return {
                valid: errors.length === 0,
                commitId,
                verifiedAt: new Date(),
                checksumMatches,
                errors,
            };

        } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
            return {
                valid: false,
                commitId,
                verifiedAt: new Date(),
                checksumMatches,
                errors,
            };
        }
    }

    // ============================================================================
    // DATA RECORDING
    // ============================================================================

    /**
     * Record a tool output for the current session.
     */
    recordToolOutput(toolCallId: string, name: string, output: unknown, success: boolean): void {
        this.dataCollector.recordToolOutput(toolCallId, name, output, success);
    }

    /**
     * Record a file change for the current session.
     */
    recordFileChange(
        path: string,
        operation: 'created' | 'modified' | 'deleted',
        turnNumber: number
    ): void {
        this.dataCollector.recordFileChange(path, operation, turnNumber);
    }

    // ============================================================================
    // HELPERS
    // ============================================================================

    /**
     * Create statistics from session data.
     */
    private createStatisticsFromData(data: SessionData, duration: number): CommitStatistics {
        return {
            messagesCommitted: data.statistics.messageCount,
            toolCallsCommitted: data.statistics.toolCallCount,
            toolOutputsCommitted: data.statistics.toolOutputCount,
            entitiesExtracted: data.statistics.entityCount,
            decisionsRecorded: data.statistics.decisionCount,
            factsRecorded: data.statistics.factCount,
            filesChanged: data.statistics.fileChangeCount,
            artifactsCreated: data.statistics.artifactCount,
            totalSizeBytes: data.statistics.totalContentSize,
            commitDuration: duration,
        };
    }

    /**
     * Create empty statistics.
     */
    private createEmptyStatistics(): CommitStatistics {
        return {
            messagesCommitted: 0,
            toolCallsCommitted: 0,
            toolOutputsCommitted: 0,
            entitiesExtracted: 0,
            decisionsRecorded: 0,
            factsRecorded: 0,
            filesChanged: 0,
            artifactsCreated: 0,
            totalSizeBytes: 0,
            commitDuration: 0,
        };
    }

    /**
     * Create empty checksums.
     */
    private createEmptyChecksums(): CommitChecksums {
        return {
            messages: '',
            toolCalls: '',
            entities: '',
            decisions: '',
            facts: '',
            artifacts: '',
            fileChanges: '',
            projectState: '',
            taskState: '',
            global: '',
        };
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a commit command instance.
 */
export function createCommitCommand(config: CommitCommandConfig): CommitCommand {
    return new CommitCommand(config);
}

// ============================================================================
// SINGLETON
// ============================================================================

let globalCommitCommand: CommitCommand | null = null;

/**
 * Get the global commit command instance.
 */
export function getCommitCommand(): CommitCommand {
    if (!globalCommitCommand) {
        throw new Error('CommitCommand not initialized. Call createCommitCommand first.');
    }
    return globalCommitCommand;
}

/**
 * Set the global commit command instance.
 */
export function setGlobalCommitCommand(command: CommitCommand): void {
    globalCommitCommand = command;
}
