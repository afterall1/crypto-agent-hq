/**
 * CryptoAgentHQ - Memory Event Emitter
 * @module lib/memory/events/event-emitter
 * 
 * Pub/sub system for memory events.
 * Konsey Değerlendirmesi: Dr. Lisa Wang (Real-time Systems) ⭐⭐⭐⭐⭐
 */

import type { MemoryEvent, MemoryEventType, MemoryEventPayload } from './event-types';
import { memoryLogger } from '../core/config';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Event handler function.
 */
export type EventHandler<T extends MemoryEventPayload = MemoryEventPayload> =
    (event: MemoryEvent<T>) => void | Promise<void>;

/**
 * Subscription handle for unsubscribing.
 */
export interface Subscription {
    unsubscribe: () => void;
}

/**
 * Event filter for subscriptions.
 */
export interface SubscriptionFilter {
    types?: MemoryEventType[];
    conversationId?: string;
    sessionId?: string;
}

// ============================================================================
// MEMORY EVENT EMITTER CLASS
// ============================================================================

/**
 * Event emitter for memory system.
 * Supports typed subscriptions and wildcards.
 */
export class MemoryEventEmitter {
    private handlers: Map<string, Set<EventHandler>> = new Map();
    private wildcardHandlers: Set<EventHandler> = new Set();
    private errorHandlers: Set<(error: Error, event: MemoryEvent) => void> = new Set();

    // ============================================================================
    // SUBSCRIPTION
    // ============================================================================

    /**
     * Subscribe to specific event type.
     */
    on<T extends MemoryEventPayload>(
        type: MemoryEventType,
        handler: EventHandler<T>
    ): Subscription {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, new Set());
        }

        this.handlers.get(type)!.add(handler as EventHandler);

        return {
            unsubscribe: () => {
                this.handlers.get(type)?.delete(handler as EventHandler);
            },
        };
    }

    /**
     * Subscribe to multiple event types.
     */
    onMany(
        types: MemoryEventType[],
        handler: EventHandler
    ): Subscription {
        const subscriptions = types.map(type => this.on(type, handler));

        return {
            unsubscribe: () => {
                subscriptions.forEach(sub => sub.unsubscribe());
            },
        };
    }

    /**
     * Subscribe to all events.
     */
    onAll(handler: EventHandler): Subscription {
        this.wildcardHandlers.add(handler);

        return {
            unsubscribe: () => {
                this.wildcardHandlers.delete(handler);
            },
        };
    }

    /**
     * Subscribe once (auto-unsubscribe after first event).
     */
    once<T extends MemoryEventPayload>(
        type: MemoryEventType,
        handler: EventHandler<T>
    ): Subscription {
        const wrappedHandler: EventHandler = (event) => {
            subscription.unsubscribe();
            return handler(event as MemoryEvent<T>);
        };

        const subscription = this.on(type, wrappedHandler);
        return subscription;
    }

    /**
     * Subscribe to events matching a pattern.
     */
    onPattern(
        pattern: string,
        handler: EventHandler
    ): Subscription {
        // Pattern like 'sync.*' or 'entry.created'
        const regex = new RegExp(`^${pattern.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`);

        const matchingHandler: EventHandler = (event) => {
            if (regex.test(event.type)) {
                return handler(event);
            }
        };

        this.wildcardHandlers.add(matchingHandler);

        return {
            unsubscribe: () => {
                this.wildcardHandlers.delete(matchingHandler);
            },
        };
    }

    /**
     * Subscribe to error events.
     */
    onError(handler: (error: Error, event: MemoryEvent) => void): Subscription {
        this.errorHandlers.add(handler);

        return {
            unsubscribe: () => {
                this.errorHandlers.delete(handler);
            },
        };
    }

    // ============================================================================
    // EMISSION
    // ============================================================================

    /**
     * Emit an event to all subscribers.
     */
    async emit(event: MemoryEvent): Promise<void> {
        const typeHandlers = this.handlers.get(event.type) || new Set();
        const allHandlers = [...typeHandlers, ...this.wildcardHandlers];

        if (allHandlers.length === 0) {
            return;
        }

        const results = await Promise.allSettled(
            allHandlers.map(handler => {
                try {
                    return Promise.resolve(handler(event));
                } catch (error) {
                    return Promise.reject(error);
                }
            })
        );

        // Handle errors
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                const error = result.reason instanceof Error
                    ? result.reason
                    : new Error(String(result.reason));

                memoryLogger.error(`Event handler error for ${event.type}`, error);

                this.errorHandlers.forEach(handler => {
                    try {
                        handler(error, event);
                    } catch (e) {
                        memoryLogger.error('Error handler threw', e);
                    }
                });
            }
        });
    }

    /**
     * Emit event synchronously (fire-and-forget).
     */
    emitSync(event: MemoryEvent): void {
        this.emit(event).catch(error => {
            memoryLogger.error('Async emit failed', error);
        });
    }

    // ============================================================================
    // UTILITIES
    // ============================================================================

    /**
     * Get subscriber count for an event type.
     */
    listenerCount(type?: MemoryEventType): number {
        if (type) {
            return (this.handlers.get(type)?.size || 0) + this.wildcardHandlers.size;
        }

        let total = this.wildcardHandlers.size;
        this.handlers.forEach(handlers => {
            total += handlers.size;
        });
        return total;
    }

    /**
     * Get all subscribed event types.
     */
    eventTypes(): MemoryEventType[] {
        return Array.from(this.handlers.keys()) as MemoryEventType[];
    }

    /**
     * Remove all handlers for a specific type.
     */
    off(type: MemoryEventType): void {
        this.handlers.delete(type);
    }

    /**
     * Remove all handlers.
     */
    offAll(): void {
        this.handlers.clear();
        this.wildcardHandlers.clear();
        this.errorHandlers.clear();
    }

    /**
     * Wait for a specific event.
     */
    waitFor(
        type: MemoryEventType,
        timeout?: number
    ): Promise<MemoryEvent> {
        return new Promise((resolve, reject) => {
            let timeoutId: NodeJS.Timeout | undefined;

            const subscription = this.once(type, (event) => {
                if (timeoutId) clearTimeout(timeoutId);
                resolve(event);
            });

            if (timeout) {
                timeoutId = setTimeout(() => {
                    subscription.unsubscribe();
                    reject(new Error(`Timeout waiting for event: ${type}`));
                }, timeout);
            }
        });
    }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let globalEmitter: MemoryEventEmitter | null = null;

/**
 * Get the global event emitter instance.
 */
export function getEventEmitter(): MemoryEventEmitter {
    if (!globalEmitter) {
        globalEmitter = new MemoryEventEmitter();
    }
    return globalEmitter;
}

/**
 * Create a new event emitter instance.
 */
export function createEventEmitter(): MemoryEventEmitter {
    return new MemoryEventEmitter();
}
