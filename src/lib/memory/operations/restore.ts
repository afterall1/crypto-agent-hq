/**
 * CryptoAgentHQ - Session Restore Operations
 * @module lib/memory/operations/restore
 * 
 * Restores context from session snapshots.
 * Konsey Değerlendirmesi: Data Integrity Guardian ⭐⭐⭐⭐⭐
 */

import type {
    SessionSnapshot,
    RestoreResult,
    ConversationMessage,
    ExtractedEntity,
    LearnedFact,
} from '../core/types';
import { memoryLogger } from '../core/config';
import type { SessionMemory } from '../tiers/session-memory';
import type { SummarizedMemory } from '../tiers/summarized-memory';
import type { ArchivalMemory } from '../tiers/archival-memory';
import type { FileStore } from '../persistence/file-store';

// ============================================================================
// SESSION RESTORER CLASS
// ============================================================================

/**
 * Restores session context from snapshots.
 */
export class SessionRestorer {
    private readonly sessionMemory: SessionMemory;
    private readonly summarizedMemory: SummarizedMemory;
    private readonly archivalMemory: ArchivalMemory;
    private readonly fileStore: FileStore;

    constructor(config: {
        sessionMemory: SessionMemory;
        summarizedMemory: SummarizedMemory;
        archivalMemory: ArchivalMemory;
        fileStore: FileStore;
    }) {
        this.sessionMemory = config.sessionMemory;
        this.summarizedMemory = config.summarizedMemory;
        this.archivalMemory = config.archivalMemory;
        this.fileStore = config.fileStore;
    }

    /**
     * Restore from the most recent snapshot.
     */
    async restoreLatest(): Promise<RestoreResult> {
        const snapshotIds = await this.fileStore.listSnapshots();

        if (snapshotIds.length === 0) {
            return {
                success: false,
                messagesRestored: 0,
                entitiesRestored: 0,
                factsRestored: 0,
                error: 'No snapshots found',
                duration: 0,
            };
        }

        // Snapshots are sorted by timestamp in filename
        const latestId = snapshotIds.sort().reverse()[0];
        return this.restoreFromSnapshot(latestId);
    }

    /**
     * Restore from a specific snapshot.
     */
    async restoreFromSnapshot(snapshotId: string): Promise<RestoreResult> {
        const startTime = Date.now();

        try {
            memoryLogger.info(`Restoring from snapshot: ${snapshotId}`);

            // Load snapshot
            const snapshot = await this.fileStore.loadSnapshot(snapshotId);

            if (!snapshot) {
                return {
                    success: false,
                    messagesRestored: 0,
                    entitiesRestored: 0,
                    factsRestored: 0,
                    error: `Snapshot not found: ${snapshotId}`,
                    duration: Date.now() - startTime,
                };
            }

            // Validate snapshot integrity
            const isValid = await this.validateSnapshot(snapshot);
            if (!isValid) {
                memoryLogger.warn('Snapshot validation failed, proceeding with caution');
            }

            // Restore to memory tiers
            await this.restoreToMemory(snapshot);

            const duration = Date.now() - startTime;

            memoryLogger.info('Restore complete', {
                messages: snapshot.messages.length,
                entities: snapshot.entities.length,
                facts: snapshot.learnedFacts.length,
                duration: `${duration}ms`,
            });

            return {
                success: true,
                messagesRestored: snapshot.messages.length,
                entitiesRestored: snapshot.entities.length,
                factsRestored: snapshot.learnedFacts.length,
                duration,
            };

        } catch (error) {
            memoryLogger.error('Restore failed', error);

            return {
                success: false,
                messagesRestored: 0,
                entitiesRestored: 0,
                factsRestored: 0,
                error: error instanceof Error ? error.message : String(error),
                duration: Date.now() - startTime,
            };
        }
    }

    /**
     * Restore only specific parts of a snapshot.
     */
    async restorePartial(
        snapshotId: string,
        options: {
            messages?: boolean;
            entities?: boolean;
            facts?: boolean;
            lastNMessages?: number;
        }
    ): Promise<RestoreResult> {
        const startTime = Date.now();

        try {
            const snapshot = await this.fileStore.loadSnapshot(snapshotId);

            if (!snapshot) {
                return {
                    success: false,
                    messagesRestored: 0,
                    entitiesRestored: 0,
                    factsRestored: 0,
                    error: `Snapshot not found: ${snapshotId}`,
                    duration: Date.now() - startTime,
                };
            }

            let messagesRestored = 0;
            let entitiesRestored = 0;
            let factsRestored = 0;

            // Restore messages
            if (options.messages !== false) {
                const messages = options.lastNMessages
                    ? snapshot.messages.slice(-options.lastNMessages)
                    : snapshot.messages;

                this.sessionMemory.import({ messages });
                messagesRestored = messages.length;
            }

            // Restore entities
            if (options.entities !== false) {
                snapshot.entities.forEach(entity => {
                    this.archivalMemory.addEntity(entity);
                });
                entitiesRestored = snapshot.entities.length;
            }

            // Restore facts
            if (options.facts !== false) {
                snapshot.learnedFacts.forEach(fact => {
                    this.summarizedMemory.addFact(fact);
                });
                factsRestored = snapshot.learnedFacts.length;
            }

            return {
                success: true,
                messagesRestored,
                entitiesRestored,
                factsRestored,
                duration: Date.now() - startTime,
            };

        } catch (error) {
            return {
                success: false,
                messagesRestored: 0,
                entitiesRestored: 0,
                factsRestored: 0,
                error: error instanceof Error ? error.message : String(error),
                duration: Date.now() - startTime,
            };
        }
    }

    /**
     * Build a context summary from archived data.
     */
    async buildContextSummary(options?: {
        maxTokens?: number;
        includeDecisions?: boolean;
        includeEntities?: boolean;
    }): Promise<string> {
        const maxTokens = options?.maxTokens ?? 2000;
        const parts: string[] = [];

        // Get latest summary
        const summary = this.summarizedMemory.getLatestSummary();
        if (summary) {
            parts.push('## Previous Session Summary');
            parts.push(summary.content);
        }

        // Add key decisions
        if (options?.includeDecisions !== false) {
            const decisions = this.summarizedMemory.getDecisionsByImpact('critical')
                .concat(this.summarizedMemory.getDecisionsByImpact('high'))
                .slice(0, 5);

            if (decisions.length > 0) {
                parts.push('\n## Key Decisions');
                decisions.forEach(d => {
                    parts.push(`- **${d.title}**: ${d.description}`);
                });
            }
        }

        // Add important entities
        if (options?.includeEntities !== false) {
            const entities = this.archivalMemory.getEntities()
                .filter(e => e.mentions.length > 2)
                .slice(0, 10);

            if (entities.length > 0) {
                parts.push('\n## Important Entities');
                entities.forEach(e => {
                    parts.push(`- **${e.name}** (${e.type}): ${e.mentions.length} mentions`);
                });
            }
        }

        const fullContext = parts.join('\n');

        // Truncate if too long
        const estimatedTokens = Math.ceil(fullContext.length / 4);
        if (estimatedTokens > maxTokens) {
            const targetLength = maxTokens * 4;
            return fullContext.slice(0, targetLength) + '\n\n[Truncated due to length]';
        }

        return fullContext;
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    /**
     * Validate snapshot integrity.
     */
    private async validateSnapshot(snapshot: SessionSnapshot): Promise<boolean> {
        // Check required fields
        if (!snapshot.id || !snapshot.conversationId || !snapshot.timestamp) {
            memoryLogger.warn('Snapshot missing required fields');
            return false;
        }

        // Validate checksum if present
        if (snapshot.checksum) {
            const isValid = this.fileStore.validateChecksum(
                {
                    messages: snapshot.messages,
                    toolCalls: snapshot.toolCalls,
                    summary: snapshot.summary,
                    decisions: snapshot.keyDecisions,
                },
                snapshot.checksum
            );

            if (!isValid) {
                memoryLogger.warn('Snapshot checksum mismatch');
                return false;
            }
        }

        return true;
    }

    /**
     * Restore snapshot data to memory tiers.
     */
    private async restoreToMemory(snapshot: SessionSnapshot): Promise<void> {
        // Clear existing session memory
        this.sessionMemory.clear();

        // Restore messages to session memory
        this.sessionMemory.import({
            messages: snapshot.messages,
            toolCalls: snapshot.toolCalls,
        });

        // Restore decisions and facts to summarized memory
        snapshot.keyDecisions.forEach(decision => {
            this.summarizedMemory.addDecision(decision);
        });

        snapshot.learnedFacts.forEach(fact => {
            this.summarizedMemory.addFact(fact);
        });

        // Restore entities to archival memory
        snapshot.entities.forEach(entity => {
            this.archivalMemory.addEntity(entity);
        });

        // Archive the snapshot itself
        this.archivalMemory.archiveSnapshot(snapshot);
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a session restorer instance.
 */
export function createSessionRestorer(config: {
    sessionMemory: SessionMemory;
    summarizedMemory: SummarizedMemory;
    archivalMemory: ArchivalMemory;
    fileStore: FileStore;
}): SessionRestorer {
    return new SessionRestorer(config);
}
