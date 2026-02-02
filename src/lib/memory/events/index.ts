/**
 * CryptoAgentHQ - Events Module
 * @module lib/memory/events
 */

// Event types and factory
export {
    // Types
    type MemoryEventType,
    type EventTier,
    type EntryEventPayload,
    type MessageEventPayload,
    type TierEventPayload,
    type SnapshotEventPayload,
    type SyncEventPayload,
    type ReloadEventPayload,
    type ConflictEventPayload,
    type SystemEventPayload,
    type MemoryEventPayload,
    type MemoryEvent,
    type EventFilter,
    type EventCursor,
    // Factory
    createMemoryEvent,
    resetSequenceCounter,
    // Type guards
    isEntryEvent,
    isMessageEvent,
    isSyncEvent,
    isReloadEvent,
    isSnapshotEvent,
} from './event-types';

// Event log
export {
    type EventLogConfig,
    EventLog,
    createEventLog,
} from './event-log';

// Event emitter
export {
    type EventHandler,
    type Subscription,
    type SubscriptionFilter,
    MemoryEventEmitter,
    getEventEmitter,
    createEventEmitter,
} from './event-emitter';
