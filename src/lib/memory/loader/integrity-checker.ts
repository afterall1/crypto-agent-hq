/**
 * CryptoAgentHQ - Integrity Checker
 * @module lib/memory/loader/integrity-checker
 * 
 * Pre-flight validation before loading any context data.
 * Expert Council Approved: Elena Kowalski (Data Integrity) ⭐⭐⭐⭐⭐
 */

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { memoryLogger } from '../core/config';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Integrity check result for a single file.
 */
export interface FileIntegrityResult {
    path: string;
    exists: boolean;
    readable: boolean;
    validJson: boolean;
    checksum?: string;
    size: number;
    lastModified?: Date;
    error?: string;
}

/**
 * Version compatibility status.
 */
export interface VersionCompatibility {
    compatible: boolean;
    currentVersion: string;
    requiredVersion: string;
    migrationNeeded: boolean;
    migrationPath?: string[];
}

/**
 * Complete integrity check result.
 */
export interface IntegrityCheckResult {
    valid: boolean;
    timestamp: Date;
    duration: number;

    // File checks
    contextFileResult: FileIntegrityResult;
    snapshotResults: FileIntegrityResult[];

    // Validation status
    checksumMatch: boolean;
    versionCompatible: boolean;

    // Available resources
    snapshotsAvailable: string[];
    latestSnapshot?: string;

    // Issues
    warnings: IntegrityWarning[];
    errors: IntegrityError[];

    // Recovery options
    fallbackSnapshot?: string;
    canProceed: boolean;
    recoveryOptions: RecoveryOption[];
}

/**
 * Integrity warning (non-blocking).
 */
export interface IntegrityWarning {
    code: string;
    message: string;
    details?: string;
    suggestion?: string;
}

/**
 * Integrity error (may block loading).
 */
export interface IntegrityError {
    code: string;
    message: string;
    details?: string;
    recoverable: boolean;
    recoveryAction?: string;
}

/**
 * Recovery option for issues.
 */
export interface RecoveryOption {
    id: string;
    label: string;
    description: string;
    action: 'use_fallback' | 'skip_validation' | 'create_new' | 'manual_fix';
    risk: 'low' | 'medium' | 'high';
}

/**
 * Integrity checker configuration.
 */
export interface IntegrityCheckerConfig {
    basePath: string;
    conversationId: string;
    strictMode?: boolean;
    validateChecksums?: boolean;
    maxSnapshotsToCheck?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SUPPORTED_VERSIONS = ['1.0.0', '1.1.0', '2.0.0'];
const CURRENT_VERSION = '2.0.0';
const CONTEXT_FILE = 'resumable.json';
const SNAPSHOTS_DIR = '.snapshots';
const CONTEXT_DIR = '.context';

// ============================================================================
// INTEGRITY CHECKER CLASS
// ============================================================================

/**
 * Pre-flight validation for memory context loading.
 */
export class IntegrityChecker {
    private readonly config: Required<IntegrityCheckerConfig>;

    constructor(config: IntegrityCheckerConfig) {
        this.config = {
            basePath: config.basePath,
            conversationId: config.conversationId,
            strictMode: config.strictMode ?? false,
            validateChecksums: config.validateChecksums ?? true,
            maxSnapshotsToCheck: config.maxSnapshotsToCheck ?? 10,
        };
    }

    // ============================================================================
    // MAIN CHECK
    // ============================================================================

    /**
     * Perform complete integrity check.
     */
    async check(): Promise<IntegrityCheckResult> {
        const startTime = Date.now();
        memoryLogger.info('Starting integrity check...');

        const warnings: IntegrityWarning[] = [];
        const errors: IntegrityError[] = [];
        const recoveryOptions: RecoveryOption[] = [];

        try {
            // Check context file
            const contextPath = this.getContextPath();
            const contextResult = await this.checkFile(contextPath);

            // Check snapshots
            const snapshotResults = await this.checkSnapshots();
            const snapshotsAvailable = snapshotResults
                .filter(r => r.exists && r.validJson)
                .map(r => path.basename(r.path, '.json'));

            // Determine latest snapshot
            const latestSnapshot = this.findLatestSnapshot(snapshotsAvailable);

            // Version compatibility
            let versionCompatible = true;
            if (contextResult.exists && contextResult.validJson) {
                const versionCheck = await this.checkVersionCompatibility(contextPath);
                versionCompatible = versionCheck.compatible;
                if (!versionCompatible) {
                    if (versionCheck.migrationNeeded) {
                        warnings.push({
                            code: 'VERSION_MIGRATION_NEEDED',
                            message: `Context version ${versionCheck.currentVersion} needs migration`,
                            details: `Current: ${versionCheck.currentVersion}, Required: ${versionCheck.requiredVersion}`,
                            suggestion: 'Automatic migration will be applied',
                        });
                    } else {
                        errors.push({
                            code: 'VERSION_INCOMPATIBLE',
                            message: `Context version ${versionCheck.currentVersion} is not compatible`,
                            recoverable: snapshotsAvailable.length > 0,
                            recoveryAction: 'Use fallback snapshot',
                        });
                    }
                }
            }

            // Checksum validation
            let checksumMatch = true;
            if (this.config.validateChecksums && contextResult.exists && contextResult.validJson) {
                checksumMatch = await this.validateChecksum(contextPath);
                if (!checksumMatch) {
                    warnings.push({
                        code: 'CHECKSUM_MISMATCH',
                        message: 'Context file checksum does not match',
                        suggestion: 'Data may have been modified externally',
                    });
                }
            }

            // Process context file issues
            if (!contextResult.exists) {
                if (snapshotsAvailable.length > 0) {
                    warnings.push({
                        code: 'CONTEXT_MISSING',
                        message: 'Resumable context file not found',
                        suggestion: 'Will rebuild from latest snapshot',
                    });
                    recoveryOptions.push({
                        id: 'rebuild_from_snapshot',
                        label: 'Rebuild Context',
                        description: 'Reconstruct context from latest snapshot',
                        action: 'use_fallback',
                        risk: 'low',
                    });
                } else {
                    errors.push({
                        code: 'NO_CONTEXT_DATA',
                        message: 'No context or snapshot data found',
                        recoverable: false,
                        recoveryAction: 'Start fresh session',
                    });
                    recoveryOptions.push({
                        id: 'start_fresh',
                        label: 'Start Fresh',
                        description: 'Begin a new session without previous context',
                        action: 'create_new',
                        risk: 'medium',
                    });
                }
            } else if (!contextResult.validJson) {
                errors.push({
                    code: 'CONTEXT_CORRUPT',
                    message: 'Context file is corrupted or invalid JSON',
                    details: contextResult.error,
                    recoverable: snapshotsAvailable.length > 0,
                    recoveryAction: 'Use fallback snapshot',
                });
                if (snapshotsAvailable.length > 0) {
                    recoveryOptions.push({
                        id: 'use_fallback',
                        label: 'Use Fallback',
                        description: `Load from snapshot: ${latestSnapshot}`,
                        action: 'use_fallback',
                        risk: 'low',
                    });
                }
            }

            // Find fallback snapshot
            const fallbackSnapshot = this.findFallbackSnapshot(snapshotResults, contextResult);

            // Determine if we can proceed
            const blockingErrors = errors.filter(e => !e.recoverable);
            const canProceed = blockingErrors.length === 0 || recoveryOptions.length > 0;
            const valid = errors.length === 0;

            const duration = Date.now() - startTime;

            const result: IntegrityCheckResult = {
                valid,
                timestamp: new Date(),
                duration,
                contextFileResult: contextResult,
                snapshotResults,
                checksumMatch,
                versionCompatible,
                snapshotsAvailable,
                latestSnapshot,
                warnings,
                errors,
                fallbackSnapshot,
                canProceed,
                recoveryOptions,
            };

            memoryLogger.info('Integrity check complete', {
                valid,
                warnings: warnings.length,
                errors: errors.length,
                snapshots: snapshotsAvailable.length,
                duration: `${duration}ms`,
            });

            return result;

        } catch (error) {
            const duration = Date.now() - startTime;
            memoryLogger.error('Integrity check failed', error);

            errors.push({
                code: 'CHECK_FAILED',
                message: 'Integrity check failed with exception',
                details: error instanceof Error ? error.message : String(error),
                recoverable: false,
            });

            return {
                valid: false,
                timestamp: new Date(),
                duration,
                contextFileResult: {
                    path: this.getContextPath(),
                    exists: false,
                    readable: false,
                    validJson: false,
                    size: 0,
                    error: 'Check failed',
                },
                snapshotResults: [],
                checksumMatch: false,
                versionCompatible: false,
                snapshotsAvailable: [],
                warnings,
                errors,
                canProceed: false,
                recoveryOptions,
            };
        }
    }

    // ============================================================================
    // FILE CHECKING
    // ============================================================================

    /**
     * Check a single file's integrity.
     */
    private async checkFile(filePath: string): Promise<FileIntegrityResult> {
        const result: FileIntegrityResult = {
            path: filePath,
            exists: false,
            readable: false,
            validJson: false,
            size: 0,
        };

        try {
            // Check existence
            const stats = await fs.stat(filePath);
            result.exists = true;
            result.size = stats.size;
            result.lastModified = stats.mtime;

            // Try to read
            const content = await fs.readFile(filePath, 'utf-8');
            result.readable = true;

            // Validate JSON
            JSON.parse(content);
            result.validJson = true;

            // Calculate checksum
            result.checksum = this.calculateChecksum(content);

        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                result.exists = false;
            } else if (error instanceof SyntaxError) {
                result.validJson = false;
                result.error = `Invalid JSON: ${error.message}`;
            } else {
                result.readable = false;
                result.error = error instanceof Error ? error.message : String(error);
            }
        }

        return result;
    }

    /**
     * Check all snapshot files.
     */
    private async checkSnapshots(): Promise<FileIntegrityResult[]> {
        const snapshotsPath = this.getSnapshotsPath();
        const results: FileIntegrityResult[] = [];

        try {
            const entries = await fs.readdir(snapshotsPath);
            const jsonFiles = entries
                .filter(e => e.endsWith('.json'))
                .slice(0, this.config.maxSnapshotsToCheck);

            for (const file of jsonFiles) {
                const filePath = path.join(snapshotsPath, file);
                const result = await this.checkFile(filePath);
                results.push(result);
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                memoryLogger.warn('Failed to check snapshots directory', error);
            }
        }

        return results;
    }

    // ============================================================================
    // VERSION CHECKING
    // ============================================================================

    /**
     * Check version compatibility.
     */
    private async checkVersionCompatibility(contextPath: string): Promise<VersionCompatibility> {
        try {
            const content = await fs.readFile(contextPath, 'utf-8');
            const data = JSON.parse(content);
            const currentVersion = data.version || '1.0.0';

            const compatible = SUPPORTED_VERSIONS.includes(currentVersion);
            const migrationNeeded = compatible && currentVersion !== CURRENT_VERSION;

            return {
                compatible: compatible || migrationNeeded,
                currentVersion,
                requiredVersion: CURRENT_VERSION,
                migrationNeeded,
                migrationPath: migrationNeeded
                    ? this.getMigrationPath(currentVersion, CURRENT_VERSION)
                    : undefined,
            };
        } catch {
            return {
                compatible: false,
                currentVersion: 'unknown',
                requiredVersion: CURRENT_VERSION,
                migrationNeeded: false,
            };
        }
    }

    /**
     * Get migration path between versions.
     */
    private getMigrationPath(from: string, to: string): string[] {
        const fromIndex = SUPPORTED_VERSIONS.indexOf(from);
        const toIndex = SUPPORTED_VERSIONS.indexOf(to);

        if (fromIndex === -1 || toIndex === -1 || fromIndex >= toIndex) {
            return [];
        }

        return SUPPORTED_VERSIONS.slice(fromIndex, toIndex + 1);
    }

    // ============================================================================
    // CHECKSUM VALIDATION
    // ============================================================================

    /**
     * Validate file checksum against stored checksum.
     */
    private async validateChecksum(filePath: string): Promise<boolean> {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(content);

            // Skip if no checksum stored
            if (!data.checksum) {
                return true;
            }

            // Remove checksum field for validation
            const contentWithoutChecksum = JSON.stringify({ ...data, checksum: undefined });
            const calculatedChecksum = this.calculateChecksum(contentWithoutChecksum);

            // Handle different checksum formats
            const storedChecksum = data.checksum.includes(':')
                ? data.checksum.split(':')[1]
                : data.checksum;

            return calculatedChecksum === storedChecksum;
        } catch {
            return false;
        }
    }

    /**
     * Calculate SHA-256 checksum.
     */
    private calculateChecksum(content: string): string {
        return createHash('sha256').update(content).digest('hex');
    }

    // ============================================================================
    // SNAPSHOT UTILITIES
    // ============================================================================

    /**
     * Find the latest valid snapshot.
     */
    private findLatestSnapshot(snapshots: string[]): string | undefined {
        if (snapshots.length === 0) return undefined;

        // Sort by timestamp (assuming format: session-{timestamp})
        const sorted = [...snapshots].sort((a, b) => {
            const tsA = this.extractTimestamp(a);
            const tsB = this.extractTimestamp(b);
            return tsB - tsA;
        });

        return sorted[0];
    }

    /**
     * Extract timestamp from snapshot ID.
     */
    private extractTimestamp(snapshotId: string): number {
        const match = snapshotId.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
    }

    /**
     * Find fallback snapshot when context is unavailable.
     */
    private findFallbackSnapshot(
        snapshotResults: FileIntegrityResult[],
        contextResult: FileIntegrityResult
    ): string | undefined {
        // Only need fallback if context is invalid
        if (contextResult.exists && contextResult.validJson) {
            return undefined;
        }

        // Find valid snapshots sorted by recency
        const validSnapshots = snapshotResults
            .filter(r => r.exists && r.validJson)
            .sort((a, b) => {
                const tsA = a.lastModified?.getTime() ?? 0;
                const tsB = b.lastModified?.getTime() ?? 0;
                return tsB - tsA;
            });

        if (validSnapshots.length === 0) return undefined;

        return path.basename(validSnapshots[0].path, '.json');
    }

    // ============================================================================
    // PATH UTILITIES
    // ============================================================================

    /**
     * Get context file path.
     */
    private getContextPath(): string {
        return path.join(this.config.basePath, CONTEXT_DIR, CONTEXT_FILE);
    }

    /**
     * Get snapshots directory path.
     */
    private getSnapshotsPath(): string {
        return path.join(this.config.basePath, SNAPSHOTS_DIR);
    }

    // ============================================================================
    // PUBLIC UTILITIES
    // ============================================================================

    /**
     * Quick check - just verify files exist and are readable.
     */
    async quickCheck(): Promise<boolean> {
        try {
            const contextPath = this.getContextPath();
            const stats = await fs.stat(contextPath);
            return stats.isFile();
        } catch {
            return false;
        }
    }

    /**
     * Get available snapshots list.
     */
    async getAvailableSnapshots(): Promise<string[]> {
        try {
            const snapshotsPath = this.getSnapshotsPath();
            const entries = await fs.readdir(snapshotsPath);
            return entries
                .filter(e => e.endsWith('.json'))
                .map(e => path.basename(e, '.json'));
        } catch {
            return [];
        }
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an integrity checker instance.
 */
export function createIntegrityChecker(config: IntegrityCheckerConfig): IntegrityChecker {
    return new IntegrityChecker(config);
}
