/**
 * CryptoAgentHQ - File-Based Persistence
 * @module lib/memory/persistence/file-store
 * 
 * File system storage for memory persistence.
 * Konsey Değerlendirmesi: Persistence Engineer + Data Integrity Guardian ⭐⭐⭐⭐⭐
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { MEMORY_DIRS, MEMORY_FILES, PERSISTENCE_CONFIG, memoryLogger } from '../core/config';
import type { SessionSnapshot, Summary, ExtractedEntity, KeyDecision, LearnedFact, ProjectState, TaskState } from '../core/types';

// ============================================================================
// FILE STORE CLASS
// ============================================================================

/**
 * File-based persistence for memory system.
 */
export class FileStore {
    private readonly basePath: string;
    private readonly conversationId: string;
    private writeQueue: Map<string, Promise<void>> = new Map();

    constructor(config: {
        basePath: string;
        conversationId: string;
    }) {
        this.basePath = config.basePath;
        this.conversationId = config.conversationId;
    }

    // ============================================================================
    // DIRECTORY OPERATIONS
    // ============================================================================

    /**
     * Ensure all required directories exist.
     */
    async ensureDirectories(): Promise<void> {
        const dirs = Object.values(MEMORY_DIRS);

        for (const dir of dirs) {
            const fullPath = join(this.basePath, dir);
            await fs.mkdir(fullPath, { recursive: true });
        }

        memoryLogger.debug('Memory directories ensured');
    }

    /**
     * Get the full path for a file.
     */
    getPath(dir: keyof typeof MEMORY_DIRS, filename: string): string {
        return join(this.basePath, MEMORY_DIRS[dir], filename);
    }

    // ============================================================================
    // READ OPERATIONS
    // ============================================================================

    /**
     * Read a JSON file.
     */
    async readJson<T>(filePath: string): Promise<T | null> {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content, this.jsonReviver);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return null;
            }
            memoryLogger.error(`Failed to read: ${filePath}`, error);
            throw error;
        }
    }

    /**
     * Read a text file.
     */
    async readText(filePath: string): Promise<string | null> {
        try {
            return await fs.readFile(filePath, 'utf-8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return null;
            }
            throw error;
        }
    }

    /**
     * Check if a file exists.
     */
    async exists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * List files in a directory.
     */
    async listFiles(dirPath: string): Promise<string[]> {
        try {
            const entries = await fs.readdir(dirPath);
            const files: string[] = [];

            for (const entry of entries) {
                const fullPath = join(dirPath, entry);
                const stat = await fs.stat(fullPath);
                if (stat.isFile()) {
                    files.push(entry);
                }
            }

            return files;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    // ============================================================================
    // WRITE OPERATIONS
    // ============================================================================

    /**
     * Write a JSON file with optional backup.
     */
    async writeJson<T>(filePath: string, data: T): Promise<void> {
        await this.queueWrite(filePath, async () => {
            // Ensure directory exists
            await fs.mkdir(dirname(filePath), { recursive: true });

            // Backup if enabled
            if (PERSISTENCE_CONFIG.backupOnWrite && await this.exists(filePath)) {
                await this.backup(filePath);
            }

            // Write atomically
            const tempPath = `${filePath}.tmp`;
            const content = JSON.stringify(data, null, PERSISTENCE_CONFIG.prettyPrint ? 2 : 0);

            await fs.writeFile(tempPath, content, 'utf-8');
            await fs.rename(tempPath, filePath);

            memoryLogger.debug(`Written: ${filePath}`, { size: content.length });
        });
    }

    /**
     * Write a text file.
     */
    async writeText(filePath: string, content: string): Promise<void> {
        await this.queueWrite(filePath, async () => {
            await fs.mkdir(dirname(filePath), { recursive: true });

            const tempPath = `${filePath}.tmp`;
            await fs.writeFile(tempPath, content, 'utf-8');
            await fs.rename(tempPath, filePath);
        });
    }

    /**
     * Append to a file.
     */
    async append(filePath: string, content: string): Promise<void> {
        await this.queueWrite(filePath, async () => {
            await fs.mkdir(dirname(filePath), { recursive: true });
            await fs.appendFile(filePath, content, 'utf-8');
        });
    }

    /**
     * Delete a file.
     */
    async delete(filePath: string): Promise<boolean> {
        try {
            await fs.unlink(filePath);
            return true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return false;
            }
            throw error;
        }
    }

    // ============================================================================
    // BACKUP & RECOVERY
    // ============================================================================

    /**
     * Create a backup of a file.
     */
    async backup(filePath: string): Promise<string> {
        const backupPath = `${filePath}.backup.${Date.now()}`;
        await fs.copyFile(filePath, backupPath);
        return backupPath;
    }

    /**
     * Restore from backup.
     */
    async restore(backupPath: string, targetPath: string): Promise<void> {
        await fs.copyFile(backupPath, targetPath);
        memoryLogger.info(`Restored from backup: ${backupPath}`);
    }

    /**
     * Get available backups for a file.
     */
    async getBackups(filePath: string): Promise<string[]> {
        const dir = dirname(filePath);
        const files = await this.listFiles(dir);
        const basename = filePath.split('/').pop()!;

        return files
            .filter(f => f.startsWith(`${basename}.backup.`))
            .sort()
            .reverse();
    }

    // ============================================================================
    // CHECKSUM & VALIDATION
    // ============================================================================

    /**
     * Calculate checksum for data.
     */
    calculateChecksum(data: unknown): string {
        const content = JSON.stringify(data);
        return createHash(PERSISTENCE_CONFIG.checksumAlgorithm)
            .update(content)
            .digest('hex');
    }

    /**
     * Validate data against checksum.
     */
    validateChecksum(data: unknown, expectedChecksum: string): boolean {
        const actualChecksum = this.calculateChecksum(data);
        return actualChecksum === expectedChecksum;
    }

    // ============================================================================
    // HIGH-LEVEL SAVE/LOAD
    // ============================================================================

    /**
     * Save a session snapshot.
     */
    async saveSnapshot(snapshot: SessionSnapshot): Promise<void> {
        const path = this.getPath('archives', `snapshot-${snapshot.id}.json`);
        await this.writeJson(path, snapshot);
    }

    /**
     * Load a session snapshot.
     */
    async loadSnapshot(snapshotId: string): Promise<SessionSnapshot | null> {
        const path = this.getPath('archives', `snapshot-${snapshotId}.json`);
        return this.readJson<SessionSnapshot>(path);
    }

    /**
     * List all snapshots.
     */
    async listSnapshots(): Promise<string[]> {
        const dir = join(this.basePath, MEMORY_DIRS.archives);
        const files = await this.listFiles(dir);
        return files
            .filter(f => f.startsWith('snapshot-') && f.endsWith('.json'))
            .map(f => f.replace('snapshot-', '').replace('.json', ''));
    }

    /**
     * Save session messages.
     */
    async saveMessages(messages: unknown[]): Promise<void> {
        const path = this.getPath('session', MEMORY_FILES.messages);
        await this.writeJson(path, messages);
    }

    /**
     * Load session messages.
     */
    async loadMessages<T>(): Promise<T[] | null> {
        const path = this.getPath('session', MEMORY_FILES.messages);
        return this.readJson<T[]>(path);
    }

    /**
     * Save session summary.
     */
    async saveSummary(summary: Summary): Promise<void> {
        // Save as JSON
        const jsonPath = this.getPath('summaries', 'summary.json');
        await this.writeJson(jsonPath, summary);

        // Also save as Markdown for readability
        const mdContent = this.summaryToMarkdown(summary);
        const mdPath = this.getPath('summaries', MEMORY_FILES.sessionSummary);
        await this.writeText(mdPath, mdContent);
    }

    /**
     * Save key decisions.
     */
    async saveDecisions(decisions: KeyDecision[]): Promise<void> {
        const path = this.getPath('summaries', MEMORY_FILES.keyDecisions);
        await this.writeJson(path, decisions);
    }

    /**
     * Save extracted entities.
     */
    async saveEntities(entities: ExtractedEntity[]): Promise<void> {
        const path = this.getPath('knowledge', MEMORY_FILES.entities);
        await this.writeJson(path, entities);
    }

    /**
     * Load extracted entities.
     */
    async loadEntities(): Promise<ExtractedEntity[] | null> {
        const path = this.getPath('knowledge', MEMORY_FILES.entities);
        return this.readJson<ExtractedEntity[]>(path);
    }

    /**
     * Save project state.
     */
    async saveProjectState(state: ProjectState): Promise<void> {
        const path = this.getPath('context', MEMORY_FILES.projectState);
        await this.writeJson(path, state);
    }

    /**
     * Load project state.
     */
    async loadProjectState(): Promise<ProjectState | null> {
        const path = this.getPath('context', MEMORY_FILES.projectState);
        return this.readJson<ProjectState>(path);
    }

    /**
     * Save task state.
     */
    async saveTaskState(state: TaskState): Promise<void> {
        const path = this.getPath('context', MEMORY_FILES.activeTasks);
        await this.writeJson(path, state);
    }

    /**
     * Load task state.
     */
    async loadTaskState(): Promise<TaskState | null> {
        const path = this.getPath('context', MEMORY_FILES.activeTasks);
        return this.readJson<TaskState>(path);
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    /**
     * Queue a write operation to prevent concurrent writes to same file.
     */
    private async queueWrite(filePath: string, operation: () => Promise<void>): Promise<void> {
        const existing = this.writeQueue.get(filePath);

        const promise = (async () => {
            if (existing) {
                await existing.catch(() => { });
            }
            await operation();
        })();

        this.writeQueue.set(filePath, promise);

        try {
            await promise;
        } finally {
            if (this.writeQueue.get(filePath) === promise) {
                this.writeQueue.delete(filePath);
            }
        }
    }

    /**
     * JSON reviver for dates.
     */
    private jsonReviver(key: string, value: unknown): unknown {
        if (typeof value === 'string') {
            const dateMatch = value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
            if (dateMatch) {
                return new Date(value);
            }
        }
        return value;
    }

    /**
     * Convert summary to markdown.
     */
    private summaryToMarkdown(summary: Summary): string {
        const lines: string[] = [
            '# Session Summary',
            '',
            `**Conversation ID**: ${summary.conversationId}`,
            `**Created**: ${summary.timestamp.toISOString()}`,
            `**Messages**: ${summary.sourceMessages}`,
            '',
            '---',
            '',
            '## Overview',
            '',
            summary.content,
            '',
        ];

        if (summary.keyPoints.length > 0) {
            lines.push('## Key Points', '');
            summary.keyPoints.forEach(point => {
                lines.push(`- ${point}`);
            });
            lines.push('');
        }

        if (summary.decisions.length > 0) {
            lines.push('## Key Decisions', '');
            summary.decisions.forEach(d => {
                lines.push(`### ${d.title}`);
                lines.push(`- **Impact**: ${d.impact}`);
                lines.push(`- **Description**: ${d.description}`);
                lines.push(`- **Rationale**: ${d.rationale}`);
                lines.push('');
            });
        }

        if (summary.errors.length > 0) {
            lines.push('## Errors & Solutions', '');
            summary.errors.forEach(e => {
                lines.push(`- **Error**: ${e.description}`);
                lines.push(`  - **Solution**: ${e.solution}`);
            });
            lines.push('');
        }

        if (summary.filesModified.length > 0) {
            lines.push('## Files Modified', '');
            summary.filesModified.forEach(f => {
                lines.push(`- \`${f}\``);
            });
            lines.push('');
        }

        if (summary.currentState) {
            lines.push('## Current State', '', summary.currentState, '');
        }

        if (summary.nextSteps.length > 0) {
            lines.push('## Next Steps', '');
            summary.nextSteps.forEach((step, i) => {
                lines.push(`${i + 1}. ${step}`);
            });
        }

        return lines.join('\n');
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a file store instance.
 */
export function createFileStore(basePath: string, conversationId: string): FileStore {
    return new FileStore({ basePath, conversationId });
}
