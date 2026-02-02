/**
 * CryptoAgentHQ - Commit Validator
 * @module lib/memory/commit/commit-validator
 * 
 * Multi-layer validation for session commits.
 * Konsey Değerlendirmesi: Dr. Sarah Chen (Distributed Systems Expert) ⭐⭐⭐⭐⭐
 */

import { createHash } from 'crypto';
import type { SessionData, CollectionStatistics } from './data-collector';
import type { ConversationMessage, ExtractedEntity, KeyDecision } from '../core/types';
import { memoryLogger } from '../core/config';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Checksum collection for commit.
 */
export interface CommitChecksums {
    messages: string;
    toolCalls: string;
    entities: string;
    decisions: string;
    facts: string;
    artifacts: string;
    fileChanges: string;
    projectState: string;
    taskState: string;
    global: string;
}

/**
 * Single validation result.
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Complete validation report.
 */
export interface FullValidationReport {
    valid: boolean;
    timestamp: Date;
    duration: number;
    checksums: CommitChecksums;

    // Validation results
    messageValidation: ValidationResult;
    entityValidation: ValidationResult;
    referenceValidation: ValidationResult;
    consistencyValidation: ValidationResult;

    // Statistics
    totalErrors: number;
    totalWarnings: number;
    errorDetails: string[];
    warningDetails: string[];
}

/**
 * Validator configuration.
 */
export interface CommitValidatorConfig {
    checksumAlgorithm?: 'sha256' | 'sha512' | 'md5';
    strictMode?: boolean;
    validateReferences?: boolean;
}

// ============================================================================
// COMMIT VALIDATOR CLASS
// ============================================================================

/**
 * Multi-layer validation for session commits.
 */
export class CommitValidator {
    private readonly config: Required<CommitValidatorConfig>;

    constructor(config?: CommitValidatorConfig) {
        this.config = {
            checksumAlgorithm: config?.checksumAlgorithm ?? 'sha256',
            strictMode: config?.strictMode ?? true,
            validateReferences: config?.validateReferences ?? true,
        };
    }

    // ============================================================================
    // MAIN VALIDATION
    // ============================================================================

    /**
     * Perform complete validation of session data.
     */
    validateComplete(data: SessionData): FullValidationReport {
        const startTime = Date.now();
        memoryLogger.info('Starting commit validation...');

        // Calculate all checksums
        const checksums = this.calculateAllChecksums(data);

        // Run all validations
        const messageValidation = this.validateMessages(data.messages);
        const entityValidation = this.validateEntities(data.entities);
        const referenceValidation = this.config.validateReferences
            ? this.validateReferenceIntegrity(data)
            : { valid: true, errors: [], warnings: [] };
        const consistencyValidation = this.validateConsistency(data);

        // Aggregate results
        const allErrors = [
            ...messageValidation.errors,
            ...entityValidation.errors,
            ...referenceValidation.errors,
            ...consistencyValidation.errors,
        ];

        const allWarnings = [
            ...messageValidation.warnings,
            ...entityValidation.warnings,
            ...referenceValidation.warnings,
            ...consistencyValidation.warnings,
        ];

        const valid = this.config.strictMode
            ? allErrors.length === 0
            : allErrors.filter(e => e.includes('CRITICAL')).length === 0;

        const duration = Date.now() - startTime;

        const report: FullValidationReport = {
            valid,
            timestamp: new Date(),
            duration,
            checksums,
            messageValidation,
            entityValidation,
            referenceValidation,
            consistencyValidation,
            totalErrors: allErrors.length,
            totalWarnings: allWarnings.length,
            errorDetails: allErrors,
            warningDetails: allWarnings,
        };

        memoryLogger.info('Validation complete', {
            valid,
            errors: allErrors.length,
            warnings: allWarnings.length,
            duration: `${duration}ms`,
        });

        return report;
    }

    // ============================================================================
    // CHECKSUM CALCULATIONS
    // ============================================================================

    /**
     * Calculate all checksums for session data.
     */
    calculateAllChecksums(data: SessionData): CommitChecksums {
        return {
            messages: this.calculateMessagesChecksum(data.messages),
            toolCalls: this.calculateChecksum(data.toolCalls),
            entities: this.calculateChecksum(data.entities),
            decisions: this.calculateChecksum(data.decisions),
            facts: this.calculateChecksum(data.facts),
            artifacts: this.calculateChecksum(data.artifacts),
            fileChanges: this.calculateChecksum(data.fileChanges),
            projectState: this.calculateChecksum(data.projectState),
            taskState: this.calculateChecksum(data.taskState),
            global: this.calculateGlobalChecksum(data),
        };
    }

    /**
     * Calculate checksum for messages with individual message hashes.
     */
    calculateMessagesChecksum(messages: ConversationMessage[]): string {
        const messageHashes = messages.map(m =>
            this.calculateChecksum({
                id: m.id,
                role: m.role,
                content: m.content,
                turnNumber: m.turnNumber,
            })
        );

        return this.calculateChecksum(messageHashes);
    }

    /**
     * Calculate per-message checksums (Merkle leaves).
     */
    calculateMessageChecksums(messages: ConversationMessage[]): Map<string, string> {
        const checksums = new Map<string, string>();

        messages.forEach(m => {
            checksums.set(m.id, this.calculateChecksum({
                id: m.id,
                role: m.role,
                content: m.content,
                turnNumber: m.turnNumber,
            }));
        });

        return checksums;
    }

    /**
     * Calculate global checksum (all data combined).
     */
    calculateGlobalChecksum(data: SessionData): string {
        const globalData = {
            conversationId: data.conversationId,
            sessionId: data.sessionId,
            messageCount: data.messages.length,
            messagesHash: this.calculateMessagesChecksum(data.messages),
            toolCallsHash: this.calculateChecksum(data.toolCalls),
            entitiesHash: this.calculateChecksum(data.entities),
            decisionsHash: this.calculateChecksum(data.decisions),
            factsHash: this.calculateChecksum(data.facts),
        };

        return this.calculateChecksum(globalData);
    }

    /**
     * Calculate checksum for any data.
     */
    calculateChecksum(data: unknown): string {
        const content = JSON.stringify(data, this.jsonReplacer);
        return createHash(this.config.checksumAlgorithm)
            .update(content)
            .digest('hex');
    }

    // ============================================================================
    // INDIVIDUAL VALIDATIONS
    // ============================================================================

    /**
     * Validate messages.
     */
    validateMessages(messages: ConversationMessage[]): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check for required fields
        messages.forEach((msg, index) => {
            if (!msg.id) {
                errors.push(`Message at index ${index} missing id`);
            }
            if (!msg.role) {
                errors.push(`Message ${msg.id ?? index} missing role`);
            }
            if (msg.content === undefined || msg.content === null) {
                errors.push(`Message ${msg.id ?? index} missing content`);
            }
            if (msg.turnNumber === undefined) {
                warnings.push(`Message ${msg.id ?? index} missing turnNumber`);
            }
        });

        // Check for duplicate IDs
        const ids = new Set<string>();
        messages.forEach(msg => {
            if (msg.id) {
                if (ids.has(msg.id)) {
                    errors.push(`Duplicate message ID: ${msg.id}`);
                }
                ids.add(msg.id);
            }
        });

        // Check turn number sequence
        let lastTurn = -1;
        messages.forEach(msg => {
            if (msg.turnNumber !== undefined) {
                if (msg.turnNumber < lastTurn) {
                    warnings.push(`Message ${msg.id} has out-of-order turnNumber: ${msg.turnNumber}`);
                }
                lastTurn = msg.turnNumber;
            }
        });

        return { valid: errors.length === 0, errors, warnings };
    }

    /**
     * Validate entities.
     */
    validateEntities(entities: ExtractedEntity[]): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check for required fields
        entities.forEach((entity, index) => {
            if (!entity.id) {
                errors.push(`Entity at index ${index} missing id`);
            }
            if (!entity.name) {
                errors.push(`Entity ${entity.id ?? index} missing name`);
            }
            if (!entity.type) {
                errors.push(`Entity ${entity.id ?? index} missing type`);
            }
        });

        // Check for duplicate IDs
        const ids = new Set<string>();
        entities.forEach(entity => {
            if (entity.id) {
                if (ids.has(entity.id)) {
                    warnings.push(`Duplicate entity ID: ${entity.id}`);
                }
                ids.add(entity.id);
            }
        });

        // Check for orphaned entities (no mentions)
        entities.forEach(entity => {
            if (!entity.mentions || entity.mentions.length === 0) {
                warnings.push(`Entity ${entity.id} has no mentions`);
            }
        });

        return { valid: errors.length === 0, errors, warnings };
    }

    /**
     * Validate reference integrity between components.
     */
    validateReferenceIntegrity(data: SessionData): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Build message turn number index
        const messageTurns = new Set(data.messages.map(m => m.turnNumber));

        // Check entity mentions reference valid turns
        data.entities.forEach(entity => {
            entity.mentions?.forEach(mention => {
                if (!messageTurns.has(mention.turnNumber)) {
                    warnings.push(
                        `Entity ${entity.id} mentions turnNumber ${mention.turnNumber} which doesn't exist`
                    );
                }
            });
        });

        // Check decisions reference valid turns
        data.decisions.forEach(decision => {
            if (decision.turnNumber !== undefined && !messageTurns.has(decision.turnNumber)) {
                warnings.push(
                    `Decision ${decision.id} references turnNumber ${decision.turnNumber} which doesn't exist`
                );
            }
        });

        // Check tool call IDs match tool outputs
        const toolCallIds = new Set(data.toolCalls.map(t => t.id));
        data.toolOutputs.forEach(output => {
            if (!toolCallIds.has(output.toolCallId)) {
                warnings.push(`Tool output ${output.toolCallId} has no matching tool call`);
            }
        });

        return { valid: errors.length === 0, errors, warnings };
    }

    /**
     * Validate data consistency.
     */
    validateConsistency(data: SessionData): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check statistics match actual data
        const stats = data.statistics;

        if (stats.messageCount !== data.messages.length) {
            errors.push(
                `Statistics messageCount (${stats.messageCount}) doesn't match actual (${data.messages.length})`
            );
        }

        if (stats.toolCallCount !== data.toolCalls.length) {
            warnings.push(
                `Statistics toolCallCount (${stats.toolCallCount}) doesn't match actual (${data.toolCalls.length})`
            );
        }

        if (stats.entityCount !== data.entities.length) {
            warnings.push(
                `Statistics entityCount (${stats.entityCount}) doesn't match actual (${data.entities.length})`
            );
        }

        // Check conversation ID consistency
        if (!data.conversationId) {
            errors.push('Missing conversationId');
        }
        if (!data.sessionId) {
            errors.push('Missing sessionId');
        }

        return { valid: errors.length === 0, errors, warnings };
    }

    // ============================================================================
    // UTILITIES
    // ============================================================================

    /**
     * Verify checksum against expected value.
     */
    verifyChecksum(data: unknown, expectedChecksum: string): boolean {
        const actualChecksum = this.calculateChecksum(data);
        return actualChecksum === expectedChecksum;
    }

    /**
     * JSON replacer for consistent serialization.
     */
    private jsonReplacer(key: string, value: unknown): unknown {
        if (value instanceof Date) {
            return value.toISOString();
        }
        return value;
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a commit validator instance.
 */
export function createCommitValidator(config?: CommitValidatorConfig): CommitValidator {
    return new CommitValidator(config);
}
