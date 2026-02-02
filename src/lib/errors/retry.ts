/**
 * CryptoAgentHQ - Retry Handler
 * @module lib/errors/retry
 * 
 * Exponential backoff with jitter for production resilience.
 * Konsey Değerlendirmesi: Error Handling Mühendisi ⭐⭐⭐⭐⭐
 */

import type { RetryConfig } from '../agents/core/types';
import {
    MaxRetriesExceededError,
    isRetryableError,
    wrapError,
    type AgentError
} from './types';

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitterFactor: 0.1,
    retryableErrors: ['rate_limit_error', 'overloaded_error', 'api_error'],
};

// ============================================================================
// RETRY RESULT TYPE
// ============================================================================

export interface RetryResult<T> {
    success: boolean;
    data?: T;
    error?: AgentError;
    attempts: number;
    totalTimeMs: number;
}

// ============================================================================
// RETRY OPTIONS
// ============================================================================

export interface RetryOptions {
    onRetry?: (error: Error, attempt: number, delayMs: number) => void;
    shouldRetry?: (error: Error, attempt: number) => boolean;
    abortSignal?: AbortSignal;
}

// ============================================================================
// RETRY HANDLER CLASS
// ============================================================================

export class RetryHandler {
    private config: RetryConfig;

    constructor(config: Partial<RetryConfig> = {}) {
        this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
    }

    /**
     * Execute an operation with automatic retry on transient failures.
     * Uses exponential backoff with jitter to prevent thundering herd.
     */
    async execute<T>(
        operation: () => Promise<T>,
        options: RetryOptions = {}
    ): Promise<T> {
        const startTime = Date.now();
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
            try {
                // Check abort signal before each attempt
                if (options.abortSignal?.aborted) {
                    throw new Error('Operation aborted');
                }

                return await operation();
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                // Check if we should retry
                const shouldRetry = this.shouldRetry(lastError, attempt, options);

                if (!shouldRetry || attempt >= this.config.maxAttempts) {
                    throw wrapError(lastError, {
                        attempts: attempt,
                        totalTimeMs: Date.now() - startTime,
                    });
                }

                // Calculate delay with exponential backoff and jitter
                const delay = this.calculateDelay(attempt);

                // Call retry hook if provided
                if (options.onRetry) {
                    options.onRetry(lastError, attempt, delay);
                }

                // Wait before next attempt
                await this.sleep(delay, options.abortSignal);
            }
        }

        // Should never reach here, but TypeScript needs it
        throw new MaxRetriesExceededError(
            this.config.maxAttempts,
            lastError ?? new Error('Unknown error'),
            { totalTimeMs: Date.now() - startTime }
        );
    }

    /**
     * Execute with result wrapper instead of throwing.
     */
    async executeWithResult<T>(
        operation: () => Promise<T>,
        options: RetryOptions = {}
    ): Promise<RetryResult<T>> {
        const startTime = Date.now();
        let attempts = 0;

        try {
            for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
                attempts = attempt;

                try {
                    if (options.abortSignal?.aborted) {
                        throw new Error('Operation aborted');
                    }

                    const data = await operation();

                    return {
                        success: true,
                        data,
                        attempts,
                        totalTimeMs: Date.now() - startTime,
                    };
                } catch (error) {
                    const wrappedError = wrapError(error);

                    if (!this.shouldRetry(wrappedError, attempt, options) ||
                        attempt >= this.config.maxAttempts) {
                        return {
                            success: false,
                            error: wrappedError,
                            attempts,
                            totalTimeMs: Date.now() - startTime,
                        };
                    }

                    const delay = this.calculateDelay(attempt);

                    if (options.onRetry) {
                        options.onRetry(wrappedError, attempt, delay);
                    }

                    await this.sleep(delay, options.abortSignal);
                }
            }
        } catch (error) {
            return {
                success: false,
                error: wrapError(error),
                attempts,
                totalTimeMs: Date.now() - startTime,
            };
        }

        // Should never reach here
        return {
            success: false,
            error: new MaxRetriesExceededError(
                this.config.maxAttempts,
                new Error('Unknown error')
            ),
            attempts,
            totalTimeMs: Date.now() - startTime,
        };
    }

    /**
     * Calculate delay with exponential backoff and jitter.
     */
    private calculateDelay(attempt: number): number {
        // Exponential backoff: initialDelay * multiplier^(attempt-1)
        const exponentialDelay =
            this.config.initialDelayMs *
            Math.pow(this.config.backoffMultiplier, attempt - 1);

        // Cap at max delay
        const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);

        // Add jitter to prevent thundering herd
        // Jitter range: [delay * (1 - jitter), delay * (1 + jitter)]
        const jitterRange = cappedDelay * this.config.jitterFactor;
        const jitter = (Math.random() * 2 - 1) * jitterRange;

        return Math.max(0, Math.round(cappedDelay + jitter));
    }

    /**
     * Determine if an error should be retried.
     */
    private shouldRetry(
        error: Error,
        attempt: number,
        options: RetryOptions
    ): boolean {
        // Custom retry logic takes precedence
        if (options.shouldRetry) {
            return options.shouldRetry(error, attempt);
        }

        // Check if error is retryable
        return isRetryableError(error);
    }

    /**
     * Sleep with abort signal support.
     */
    private sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
        return new Promise((resolve, reject) => {
            if (abortSignal?.aborted) {
                reject(new Error('Operation aborted'));
                return;
            }

            const timeout = setTimeout(resolve, ms);

            if (abortSignal) {
                const abortHandler = () => {
                    clearTimeout(timeout);
                    reject(new Error('Operation aborted'));
                };

                abortSignal.addEventListener('abort', abortHandler, { once: true });
            }
        });
    }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

const defaultHandler = new RetryHandler();

/**
 * Execute an operation with retry using default configuration.
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    options?: RetryOptions
): Promise<T> {
    return defaultHandler.execute(operation, options);
}

/**
 * Create a retry handler with custom configuration.
 */
export function createRetryHandler(config: Partial<RetryConfig>): RetryHandler {
    return new RetryHandler(config);
}

/**
 * Decorator for retryable async functions.
 */
export function retryable(config: Partial<RetryConfig> = {}) {
    const handler = new RetryHandler(config);

    return function <T extends (...args: unknown[]) => Promise<unknown>>(
        _target: object,
        _propertyKey: string,
        descriptor: TypedPropertyDescriptor<T>
    ): TypedPropertyDescriptor<T> {
        const originalMethod = descriptor.value;

        if (!originalMethod) {
            return descriptor;
        }

        descriptor.value = async function (this: unknown, ...args: unknown[]) {
            return handler.execute(() => originalMethod.apply(this, args));
        } as T;

        return descriptor;
    };
}
