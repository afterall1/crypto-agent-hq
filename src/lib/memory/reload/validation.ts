/**
 * CryptoAgentHQ - Reload Validation
 * @module lib/memory/reload/validation
 * 
 * Post-reload verification and integrity checks.
 * Konsey Değerlendirmesi: Dr. Ana Rodriguez (Data Integrity Guardian) ⭐⭐⭐⭐⭐
 */

import { createHash } from 'crypto';
import type { MemoryEntry, MemoryTier, SessionSnapshot } from '../core/types';
import { memoryLogger } from '../core/config';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Validation result.
 */
export interface ValidationResult {
    valid: boolean;
    checks: ValidationCheck[];
    errors: ValidationError[];
    warnings: ValidationWarning[];
    summary: string;
    timestamp: Date;
}

/**
 * Individual validation check.
 */
export interface ValidationCheck {
    name: string;
    passed: boolean;
    details?: string;
    tier?: MemoryTier;
}

/**
 * Validation error.
 */
export interface ValidationError {
    code: string;
    message: string;
    tier?: MemoryTier;
    entryId?: string;
    recoverable: boolean;
}

/**
 * Validation warning (non-critical).
 */
export interface ValidationWarning {
    code: string;
    message: string;
    suggestion?: string;
}

/**
 * Validation options.
 */
export interface ValidationOptions {
    checkIntegrity?: boolean;
    checkConsistency?: boolean;
    checkReferences?: boolean;
    checkChecksums?: boolean;
    strictMode?: boolean;
}

// ============================================================================
// RELOAD VALIDATOR CLASS
// ============================================================================

/**
 * Validates memory state after reload operations.
 */
export class ReloadValidator {
    private readonly options: Required<ValidationOptions>;

    constructor(options?: ValidationOptions) {
        this.options = {
            checkIntegrity: options?.checkIntegrity ?? true,
            checkConsistency: options?.checkConsistency ?? true,
            checkReferences: options?.checkReferences ?? true,
            checkChecksums: options?.checkChecksums ?? true,
            strictMode: options?.strictMode ?? false,
        };
    }

    /**
     * Validate reloaded memory state.
     */
    validate(
        entries: Map<string, MemoryEntry>,
        source?: SessionSnapshot
    ): ValidationResult {
        const checks: ValidationCheck[] = [];
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        // 1. Integrity checks
        if (this.options.checkIntegrity) {
            const integrityResult = this.checkIntegrity(entries);
            checks.push(...integrityResult.checks);
            errors.push(...integrityResult.errors);
            warnings.push(...integrityResult.warnings);
        }

        // 2. Consistency checks
        if (this.options.checkConsistency) {
            const consistencyResult = this.checkConsistency(entries);
            checks.push(...consistencyResult.checks);
            errors.push(...consistencyResult.errors);
            warnings.push(...consistencyResult.warnings);
        }

        // 3. Reference checks
        if (this.options.checkReferences) {
            const referenceResult = this.checkReferences(entries);
            checks.push(...referenceResult.checks);
            errors.push(...referenceResult.errors);
            warnings.push(...referenceResult.warnings);
        }

        // 4. Checksum validation (if source snapshot provided)
        if (this.options.checkChecksums && source) {
            const checksumResult = this.validateChecksums(entries, source);
            checks.push(...checksumResult.checks);
            errors.push(...checksumResult.errors);
        }

        const passedChecks = checks.filter(c => c.passed).length;
        const totalChecks = checks.length;
        const valid = errors.filter(e => !e.recoverable).length === 0;

        const summary = `${passedChecks}/${totalChecks} checks passed. ` +
            `${errors.length} errors, ${warnings.length} warnings.`;

        memoryLogger.info('Validation complete', { valid, summary });

        return {
            valid,
            checks,
            errors,
            warnings,
            summary,
            timestamp: new Date(),
        };
    }

    /**
     * Quick validation (minimal checks).
     */
    quickValidate(entries: Map<string, MemoryEntry>): boolean {
        // Basic sanity checks only
        if (entries.size === 0) {
            return true; // Empty is valid
        }

        for (const [id, entry] of entries) {
            if (!entry.id || !entry.content || !entry.tier) {
                return false;
            }
        }

        return true;
    }

    // ============================================================================
    // INTEGRITY CHECKS
    // ============================================================================

    private checkIntegrity(entries: Map<string, MemoryEntry>): {
        checks: ValidationCheck[];
        errors: ValidationError[];
        warnings: ValidationWarning[];
    } {
        const checks: ValidationCheck[] = [];
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        // Check: All entries have required fields
        let missingFields = 0;
        for (const [id, entry] of entries) {
            if (!entry.id || !entry.content || !entry.tier || !entry.type) {
                missingFields++;
                errors.push({
                    code: 'MISSING_REQUIRED_FIELD',
                    message: `Entry ${id} missing required fields`,
                    entryId: id,
                    recoverable: false,
                });
            }
        }

        checks.push({
            name: 'Required Fields',
            passed: missingFields === 0,
            details: missingFields > 0
                ? `${missingFields} entries missing fields`
                : `All ${entries.size} entries valid`,
        });

        // Check: Entry IDs match map keys
        let idMismatches = 0;
        for (const [id, entry] of entries) {
            if (id !== entry.id) {
                idMismatches++;
                errors.push({
                    code: 'ID_MISMATCH',
                    message: `Entry key ${id} doesn't match entry.id ${entry.id}`,
                    entryId: id,
                    recoverable: true,
                });
            }
        }

        checks.push({
            name: 'ID Consistency',
            passed: idMismatches === 0,
            details: idMismatches > 0
                ? `${idMismatches} ID mismatches`
                : 'All IDs consistent',
        });

        // Check: Timestamps are valid
        let invalidTimestamps = 0;
        for (const [id, entry] of entries) {
            if (!(entry.createdAt instanceof Date) || isNaN(entry.createdAt.getTime())) {
                invalidTimestamps++;
                warnings.push({
                    code: 'INVALID_TIMESTAMP',
                    message: `Entry ${id} has invalid createdAt`,
                    suggestion: 'Timestamp will be set to current time',
                });
            }
        }

        checks.push({
            name: 'Valid Timestamps',
            passed: invalidTimestamps === 0,
            details: invalidTimestamps > 0
                ? `${invalidTimestamps} invalid timestamps`
                : 'All timestamps valid',
        });

        return { checks, errors, warnings };
    }

    // ============================================================================
    // CONSISTENCY CHECKS
    // ============================================================================

    private checkConsistency(entries: Map<string, MemoryEntry>): {
        checks: ValidationCheck[];
        errors: ValidationError[];
        warnings: ValidationWarning[];
    } {
        const checks: ValidationCheck[] = [];
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        // Check: Importance values in valid range
        let invalidImportance = 0;
        for (const [id, entry] of entries) {
            if (entry.importance < 0 || entry.importance > 1) {
                invalidImportance++;
                warnings.push({
                    code: 'INVALID_IMPORTANCE',
                    message: `Entry ${id} has importance ${entry.importance} outside [0,1]`,
                    suggestion: 'Clamp to valid range',
                });
            }
        }

        checks.push({
            name: 'Valid Importance Range',
            passed: invalidImportance === 0,
            details: invalidImportance > 0
                ? `${invalidImportance} entries with invalid importance`
                : 'All importance values valid',
        });

        // Check: Tier distribution is reasonable
        const tierCounts: Record<MemoryTier, number> = {
            immediate: 0,
            session: 0,
            summarized: 0,
            archival: 0,
        };

        for (const [, entry] of entries) {
            if (entry.tier in tierCounts) {
                tierCounts[entry.tier]++;
            }
        }

        checks.push({
            name: 'Tier Distribution',
            passed: true,
            details: `immediate: ${tierCounts.immediate}, session: ${tierCounts.session}, ` +
                `summarized: ${tierCounts.summarized}, archival: ${tierCounts.archival}`,
        });

        // Check: No duplicate content hashes within same tier
        const contentHashes = new Map<string, string[]>();
        for (const [id, entry] of entries) {
            const hash = createHash('md5').update(entry.content).digest('hex');
            const key = `${entry.tier}:${hash}`;
            if (!contentHashes.has(key)) {
                contentHashes.set(key, []);
            }
            contentHashes.get(key)!.push(id);
        }

        let duplicates = 0;
        for (const [, ids] of contentHashes) {
            if (ids.length > 1) {
                duplicates += ids.length - 1;
                if (this.options.strictMode) {
                    warnings.push({
                        code: 'DUPLICATE_CONTENT',
                        message: `Duplicate content found: ${ids.join(', ')}`,
                        suggestion: 'Consider deduplicating',
                    });
                }
            }
        }

        checks.push({
            name: 'No Duplicates',
            passed: duplicates === 0 || !this.options.strictMode,
            details: duplicates > 0
                ? `${duplicates} duplicate entries found`
                : 'No duplicates',
        });

        return { checks, errors, warnings };
    }

    // ============================================================================
    // REFERENCE CHECKS
    // ============================================================================

    private checkReferences(entries: Map<string, MemoryEntry>): {
        checks: ValidationCheck[];
        errors: ValidationError[];
        warnings: ValidationWarning[];
    } {
        const checks: ValidationCheck[] = [];
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        const entryIds = new Set(entries.keys());

        // Check: All referenced IDs exist
        let brokenRefs = 0;
        for (const [id, entry] of entries) {
            const refs = entry.metadata.references || [];
            for (const ref of refs) {
                if (!entryIds.has(ref)) {
                    brokenRefs++;
                    warnings.push({
                        code: 'BROKEN_REFERENCE',
                        message: `Entry ${id} references non-existent ${ref}`,
                        suggestion: 'Clean up orphaned references',
                    });
                }
            }
        }

        checks.push({
            name: 'Valid References',
            passed: brokenRefs === 0,
            details: brokenRefs > 0
                ? `${brokenRefs} broken references`
                : 'All references valid',
        });

        return { checks, errors, warnings };
    }

    // ============================================================================
    // CHECKSUM VALIDATION
    // ============================================================================

    private validateChecksums(
        entries: Map<string, MemoryEntry>,
        source: SessionSnapshot
    ): {
        checks: ValidationCheck[];
        errors: ValidationError[];
    } {
        const checks: ValidationCheck[] = [];
        const errors: ValidationError[] = [];

        // Validate snapshot checksum
        if (source.checksum) {
            const calculatedChecksum = createHash('sha256')
                .update(JSON.stringify({
                    messages: source.messages,
                    toolCalls: source.toolCalls,
                    summary: source.summary,
                    decisions: source.keyDecisions,
                }))
                .digest('hex');

            const valid = calculatedChecksum === source.checksum;

            checks.push({
                name: 'Snapshot Checksum',
                passed: valid,
                details: valid
                    ? 'Checksum verified'
                    : 'Checksum mismatch - data may be corrupted',
            });

            if (!valid) {
                errors.push({
                    code: 'CHECKSUM_MISMATCH',
                    message: 'Snapshot checksum does not match calculated value',
                    recoverable: false,
                });
            }
        }

        return { checks, errors };
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a reload validator instance.
 */
export function createReloadValidator(options?: ValidationOptions): ReloadValidator {
    return new ReloadValidator(options);
}
