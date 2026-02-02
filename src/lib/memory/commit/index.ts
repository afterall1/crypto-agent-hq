/**
 * CryptoAgentHQ - Commit Module Index
 * @module lib/memory/commit
 * 
 * Barrel export for session commit functionality.
 */

// Data Collection
export {
    DataCollector,
    createDataCollector,
    type SessionData,
    type FileChange,
    type ToolOutput,
    type CollectionStatistics,
    type DataCollectorConfig,
} from './data-collector';

// Validation
export {
    CommitValidator,
    createCommitValidator,
    type CommitChecksums,
    type ValidationResult as CommitValidationResult,
    type FullValidationReport,
    type CommitValidatorConfig,
} from './commit-validator';

// Persistence
export {
    CommitPersister,
    createCommitPersister,
    type WALEntry,
    type WALOperationType,
    type CommitOperation,
    type PersistResult,
    type CommitMetadata,
    type CommitPersisterConfig,
} from './commit-persister';

// Resumable Context
export {
    ResumableContextGenerator,
    createResumableContextGenerator,
    type HotContext,
    type WarmContext,
    type ColdContext,
    type ResumableContext,
    type ResumableContextConfig,
} from './resumable-context';

// Commit Command
export {
    CommitCommand,
    createCommitCommand,
    getCommitCommand,
    setGlobalCommitCommand,
    type CommitOptions,
    type CommitResult,
    type CommitStatistics,
    type CommitPreview,
    type CommitInfo,
    type IntegrityReport,
    type CommitCommandConfig,
} from './commit-command';
