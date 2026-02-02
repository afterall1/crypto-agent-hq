/**
 * IntegrityChecker Unit Tests
 * 
 * Tests for pre-flight validation before loading context data.
 * Covers file integrity, version compatibility, and checksum validation.
 * Tests only use PUBLIC API methods.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import {
    IntegrityChecker,
    type IntegrityCheckerConfig,
} from '../integrity-checker';

// Mock fs module
vi.mock('fs', () => ({
    promises: {
        access: vi.fn(),
        readFile: vi.fn(),
        stat: vi.fn(),
        readdir: vi.fn(),
    },
}));

// ============================================================================
// TEST FIXTURES
// ============================================================================

const mockBasePath = '/test/memory';
const mockConversationId = 'test-conv-123';

const createMockConfig = (overrides: Partial<IntegrityCheckerConfig> = {}): IntegrityCheckerConfig => ({
    basePath: mockBasePath,
    conversationId: mockConversationId,
    strictMode: false,
    validateChecksums: true,
    maxSnapshotsToCheck: 5,
    ...overrides,
});

const createValidContext = () => ({
    version: '2.0.0',
    generatedAt: new Date().toISOString(),
    conversationId: mockConversationId,
    hot: {
        currentTask: 'Test Task',
        taskStatus: 'running',
        lastUserMessage: 'Test',
        lastAssistantMessage: 'Response',
        activeFilesPaths: [],
        immediateContext: [],
    },
    warm: {
        sessionSummary: 'Test summary',
        recentDecisions: [],
        activeEntities: [],
        keyFacts: [],
        errorsEncountered: [],
    },
    cold: {
        snapshotPath: '/test/snapshot.json',
        totalMessages: 10,
        totalEntities: 5,
        totalDecisions: 3,
        sessionDuration: 3600000,
    },
    tokenEstimates: {
        hot: 100,
        warm: 500,
        cold: 50,
        total: 650,
    },
});

// ============================================================================
// TESTS: CONSTRUCTOR
// ============================================================================

describe('IntegrityChecker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should create instance with valid config', () => {
            const config = createMockConfig();
            const checker = new IntegrityChecker(config);

            expect(checker).toBeDefined();
        });

        it('should apply default values for optional config', () => {
            const config = createMockConfig({
                strictMode: undefined,
                validateChecksums: undefined,
                maxSnapshotsToCheck: undefined,
            });

            const checker = new IntegrityChecker(config);
            expect(checker).toBeDefined();
        });
    });

    // ============================================================================
    // TESTS: FULL INTEGRITY CHECK (PUBLIC API)
    // ============================================================================

    describe('check', () => {
        it('should pass complete integrity check with valid files', async () => {
            const config = createMockConfig();
            const checker = new IntegrityChecker(config);

            // Mock all file system operations for a valid scenario
            vi.mocked(fs.stat).mockResolvedValue({
                size: 500,
                mtime: new Date(),
                isFile: () => true,
                isDirectory: () => false,
            } as unknown as Awaited<ReturnType<typeof fs.stat>>);

            vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(createValidContext()));

            vi.mocked(fs.readdir).mockResolvedValue([
                'session-1234.json',
                'session-5678.json',
            ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

            const result = await checker.check();

            expect(result.valid).toBe(true);
            expect(result.canProceed).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(result.contextFileResult.validJson).toBe(true);
        });

        it('should fail check when context file is missing', async () => {
            const config = createMockConfig();
            const checker = new IntegrityChecker(config);

            // Context file doesn't exist
            vi.mocked(fs.stat).mockRejectedValue({ code: 'ENOENT' });
            vi.mocked(fs.readdir).mockResolvedValue([
                'session-1234.json',
            ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

            const result = await checker.check();

            expect(result.valid).toBe(false);
            expect(result.contextFileResult.exists).toBe(false);
        });

        it('should detect corrupted context file', async () => {
            const config = createMockConfig();
            const checker = new IntegrityChecker(config);

            vi.mocked(fs.stat).mockResolvedValue({
                size: 100,
                mtime: new Date(),
                isFile: () => true,
                isDirectory: () => false,
            } as unknown as Awaited<ReturnType<typeof fs.stat>>);

            vi.mocked(fs.readFile).mockResolvedValue('{ corrupted json }}}');
            vi.mocked(fs.readdir).mockResolvedValue([]);

            const result = await checker.check();

            expect(result.contextFileResult.validJson).toBe(false);
        });

        it('should include processing duration in result', async () => {
            const config = createMockConfig();
            const checker = new IntegrityChecker(config);

            vi.mocked(fs.stat).mockResolvedValue({
                size: 500,
                mtime: new Date(),
                isFile: () => true,
                isDirectory: () => false,
            } as unknown as Awaited<ReturnType<typeof fs.stat>>);
            vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(createValidContext()));
            vi.mocked(fs.readdir).mockResolvedValue([]);

            const result = await checker.check();

            expect(result.duration).toBeGreaterThanOrEqual(0);
            expect(result.timestamp).toBeInstanceOf(Date);
        });

        it('should provide recovery options when context is missing but snapshots exist', async () => {
            const config = createMockConfig();
            const checker = new IntegrityChecker(config);

            // Context file doesn't exist
            const callCount = 0;
            vi.mocked(fs.stat).mockImplementation(async (filePath) => {
                if (String(filePath).includes('resumable.json')) {
                    throw { code: 'ENOENT' };
                }
                return {
                    size: 500,
                    mtime: new Date(),
                    isFile: () => true,
                    isDirectory: () => false,
                } as Awaited<ReturnType<typeof fs.stat>>;
            });

            vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(createValidContext()));
            vi.mocked(fs.readdir).mockResolvedValue([
                'session-1738534789000.json',
            ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

            const result = await checker.check();

            expect(result.snapshotsAvailable.length).toBeGreaterThan(0);
            expect(result.recoveryOptions.length).toBeGreaterThan(0);
        });

        it('should detect version incompatibility', async () => {
            const config = createMockConfig();
            const checker = new IntegrityChecker(config);

            const oldContext = { ...createValidContext(), version: '0.1.0' };

            vi.mocked(fs.stat).mockResolvedValue({
                size: 500,
                mtime: new Date(),
                isFile: () => true,
                isDirectory: () => false,
            } as unknown as Awaited<ReturnType<typeof fs.stat>>);
            vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(oldContext));
            vi.mocked(fs.readdir).mockResolvedValue([]);

            const result = await checker.check();

            expect(result.versionCompatible).toBe(false);
        });
    });

    // ============================================================================
    // TESTS: QUICK CHECK (PUBLIC API)
    // ============================================================================

    describe('quickCheck', () => {
        it('should return true for accessible files', async () => {
            const config = createMockConfig();
            const checker = new IntegrityChecker(config);

            vi.mocked(fs.stat).mockResolvedValue({
                isFile: () => true,
            } as unknown as Awaited<ReturnType<typeof fs.stat>>);

            const result = await checker.quickCheck();

            expect(result).toBe(true);
        });

        it('should return false when files are inaccessible', async () => {
            const config = createMockConfig();
            const checker = new IntegrityChecker(config);

            vi.mocked(fs.stat).mockRejectedValue(new Error('Permission denied'));

            const result = await checker.quickCheck();

            expect(result).toBe(false);
        });
    });

    // ============================================================================
    // TESTS: SNAPSHOT DISCOVERY (PUBLIC API)
    // ============================================================================

    describe('getAvailableSnapshots', () => {
        it('should return list of available snapshot files', async () => {
            const config = createMockConfig();
            const checker = new IntegrityChecker(config);

            vi.mocked(fs.readdir).mockResolvedValue([
                'session-1738534789000.json',
                'session-1738539583000.json',
                'session-1738540000000.json',
            ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

            const snapshots = await checker.getAvailableSnapshots();

            expect(snapshots).toHaveLength(3);
            expect(snapshots[0]).toContain('session-');
        });

        it('should filter out non-json files', async () => {
            const config = createMockConfig();
            const checker = new IntegrityChecker(config);

            vi.mocked(fs.readdir).mockResolvedValue([
                'session-1738534789000.json',
                'readme.txt',
                '.DS_Store',
                'session-1738539583000.json',
            ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

            const snapshots = await checker.getAvailableSnapshots();

            expect(snapshots).toHaveLength(2);
        });

        it('should return empty array when directory is empty', async () => {
            const config = createMockConfig();
            const checker = new IntegrityChecker(config);

            vi.mocked(fs.readdir).mockResolvedValue([]);

            const snapshots = await checker.getAvailableSnapshots();

            expect(snapshots).toHaveLength(0);
        });

        it('should handle directory read errors gracefully', async () => {
            const config = createMockConfig();
            const checker = new IntegrityChecker(config);

            vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

            const snapshots = await checker.getAvailableSnapshots();

            expect(snapshots).toHaveLength(0);
        });
    });

    // ============================================================================
    // TESTS: RESULT STRUCTURE
    // ============================================================================

    describe('result structure', () => {
        it('should return complete result structure on success', async () => {
            const config = createMockConfig();
            const checker = new IntegrityChecker(config);

            vi.mocked(fs.stat).mockResolvedValue({
                size: 500,
                mtime: new Date(),
                isFile: () => true,
                isDirectory: () => false,
            } as unknown as Awaited<ReturnType<typeof fs.stat>>);
            vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(createValidContext()));
            vi.mocked(fs.readdir).mockResolvedValue([]);

            const result = await checker.check();

            // Verify all required fields exist
            expect(result).toHaveProperty('valid');
            expect(result).toHaveProperty('timestamp');
            expect(result).toHaveProperty('duration');
            expect(result).toHaveProperty('contextFileResult');
            expect(result).toHaveProperty('snapshotResults');
            expect(result).toHaveProperty('checksumMatch');
            expect(result).toHaveProperty('versionCompatible');
            expect(result).toHaveProperty('snapshotsAvailable');
            expect(result).toHaveProperty('warnings');
            expect(result).toHaveProperty('errors');
            expect(result).toHaveProperty('canProceed');
            expect(result).toHaveProperty('recoveryOptions');
        });

        it('should return complete result structure on failure', async () => {
            const config = createMockConfig();
            const checker = new IntegrityChecker(config);

            vi.mocked(fs.stat).mockRejectedValue(new Error('Unexpected error'));
            vi.mocked(fs.readdir).mockRejectedValue(new Error('Unexpected error'));

            const result = await checker.check();

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            // canProceed may be true if recovery options exist
            expect(typeof result.canProceed).toBe('boolean');
        });
    });
});
