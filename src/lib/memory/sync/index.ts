/**
 * CryptoAgentHQ - Sync Module
 * @module lib/memory/sync
 */

// Diff Calculator
export {
    type MemoryDiff,
    type ModifiedEntry,
    type MemoryState,
    DiffCalculator,
    createDiffCalculator,
} from './diff-calculator';

// Sync Status
export {
    type SyncState,
    type SyncPhase,
    type SyncProgress,
    type SyncInfo,
    type StateChangeEvent,
    SyncStatusTracker,
    createSyncStatusTracker,
    getSyncStatusTracker,
} from './sync-status';

// Conflict Resolver
export {
    type ResolutionStrategy,
    type ConflictRecord,
    type ConflictDiff,
    type ResolvedConflict,
    type ConflictResolverConfig,
    ConflictResolver,
    createConflictResolver,
} from './conflict-resolver';

// Sync Strategy
export {
    type SyncMode,
    type SyncDirection,
    type SyncStrategyOptions,
    type SyncStrategyResult,
    type AppliedChange,
    type SyncError,
    type ISyncStrategy,
    BaseSyncStrategy,
    FullSyncStrategy,
    IncrementalSyncStrategy,
    TierSpecificSyncStrategy,
    createSyncStrategy,
    getAllStrategies,
} from './sync-strategy';

// Sync Engine
export {
    type SyncOptions,
    type SyncResult,
    type SyncEngineConfig,
    SyncEngine,
    createSyncEngine,
} from './sync-engine';
