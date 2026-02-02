/**
 * CryptoAgentHQ - Central Error Handler
 * @module lib/errors/handler
 * 
 * Unified error handling for the entire agent system.
 * Konsey Değerlendirmesi: Error Handling Mühendisi ⭐⭐⭐⭐⭐
 */

import {
    AgentError,
    APIError,
    RateLimitError,
    isAgentError,
    wrapError,
    getErrorCode,
} from './types';
import { RetryHandler, type RetryOptions, type RetryResult } from './retry';
import {
    CircuitBreaker,
    circuitBreakerRegistry,
    type CircuitBreakerConfig
} from './circuit-breaker';
import type { RetryConfig } from '../agents/core/types';

// ============================================================================
// ERROR HANDLER CONFIG
// ============================================================================

export interface ErrorHandlerConfig {
    retry?: Partial<RetryConfig>;
    circuitBreaker?: Partial<Omit<CircuitBreakerConfig, 'name'>>;
    enableLogging?: boolean;
    logError?: (error: AgentError, context: Record<string, unknown>) => void;
    onError?: (error: AgentError) => void;
    transformError?: (error: Error) => AgentError;
}

const DEFAULT_CONFIG: ErrorHandlerConfig = {
    enableLogging: true,
};

// ============================================================================
// ERROR HANDLER CLASS
// ============================================================================

export class ErrorHandler {
    private config: ErrorHandlerConfig;
    private retryHandler: RetryHandler;
    private circuits: Map<string, CircuitBreaker> = new Map();

    constructor(config: ErrorHandlerConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.retryHandler = new RetryHandler(config.retry);
    }

    /**
     * Handle an error consistently across the system.
     */
    handle(
        error: unknown,
        context: Record<string, unknown> = {}
    ): AgentError {
        // Transform to AgentError if needed
        let agentError: AgentError;

        if (isAgentError(error)) {
            agentError = error;
        } else if (this.config.transformError && error instanceof Error) {
            agentError = this.config.transformError(error);
        } else {
            agentError = wrapError(error, context);
        }

        // Log the error
        if (this.config.enableLogging) {
            this.logError(agentError, context);
        }

        // Call error callback
        if (this.config.onError) {
            this.config.onError(agentError);
        }

        return agentError;
    }

    /**
     * Execute an operation with retry and circuit breaker protection.
     */
    async executeWithProtection<T>(
        name: string,
        operation: () => Promise<T>,
        options: {
            retry?: RetryOptions;
            context?: Record<string, unknown>;
        } = {}
    ): Promise<T> {
        const circuit = this.getOrCreateCircuit(name);

        try {
            return await circuit.execute(async () => {
                return await this.retryHandler.execute(operation, {
                    ...options.retry,
                    onRetry: (error, attempt, delay) => {
                        if (this.config.enableLogging) {
                            console.warn(
                                `[${name}] Retry attempt ${attempt} after ${delay}ms:`,
                                error.message
                            );
                        }
                        options.retry?.onRetry?.(error, attempt, delay);
                    },
                });
            });
        } catch (error) {
            throw this.handle(error, {
                operation: name,
                ...options.context
            });
        }
    }

    /**
     * Execute with protection, returning result wrapper instead of throwing.
     */
    async executeWithProtectionSafe<T>(
        name: string,
        operation: () => Promise<T>,
        options: {
            retry?: RetryOptions;
            context?: Record<string, unknown>;
        } = {}
    ): Promise<RetryResult<T> & { error?: AgentError }> {
        const circuit = this.getOrCreateCircuit(name);

        try {
            const result = await circuit.execute(async () => {
                return await this.retryHandler.executeWithResult(operation, options.retry);
            });

            return result;
        } catch (error) {
            const agentError = this.handle(error, {
                operation: name,
                ...options.context
            });

            return {
                success: false,
                error: agentError,
                attempts: 0,
                totalTimeMs: 0,
            };
        }
    }

    /**
     * Create an error response for API endpoints.
     */
    createErrorResponse(
        error: unknown,
        context: Record<string, unknown> = {}
    ): {
        error: {
            code: string;
            message: string;
            retryable: boolean;
            retryAfterMs?: number;
        };
        status: number;
    } {
        const agentError = this.handle(error, context);

        let status = 500;
        let retryAfterMs: number | undefined;

        if (agentError instanceof RateLimitError) {
            status = 429;
            retryAfterMs = agentError.retryAfterMs;
        } else if (agentError instanceof APIError) {
            status = agentError.statusCode ?? 500;
        } else if (agentError.code === 'VALIDATION_ERROR') {
            status = 400;
        } else if (agentError.code === 'AGENT_NOT_FOUND') {
            status = 404;
        } else if (agentError.code === 'AUTHENTICATION_ERROR') {
            status = 401;
        } else if (agentError.code === 'CIRCUIT_OPEN') {
            status = 503;
        }

        return {
            error: {
                code: agentError.code,
                message: agentError.message,
                retryable: agentError.retryable,
                ...(retryAfterMs && { retryAfterMs }),
            },
            status,
        };
    }

    /**
     * Get circuit breaker stats for monitoring.
     */
    getCircuitStats(): Record<string, unknown> {
        return circuitBreakerRegistry.getAllStats();
    }

    /**
     * Reset a specific circuit breaker.
     */
    resetCircuit(name: string): void {
        this.circuits.get(name)?.reset();
    }

    /**
     * Reset all circuit breakers.
     */
    resetAllCircuits(): void {
        this.circuits.forEach(circuit => circuit.reset());
        circuitBreakerRegistry.resetAll();
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    private getOrCreateCircuit(name: string): CircuitBreaker {
        let circuit = this.circuits.get(name);

        if (!circuit) {
            circuit = circuitBreakerRegistry.getOrCreate(name, {
                ...this.config.circuitBreaker,
                onStateChange: (from, to) => {
                    if (this.config.enableLogging) {
                        console.warn(`[CircuitBreaker:${name}] State changed: ${from} → ${to}`);
                    }
                },
            });
            this.circuits.set(name, circuit);
        }

        return circuit;
    }

    private logError(error: AgentError, context: Record<string, unknown>): void {
        if (this.config.logError) {
            this.config.logError(error, context);
            return;
        }

        // Default logging
        const logData = {
            timestamp: error.timestamp.toISOString(),
            code: error.code,
            message: error.message,
            retryable: error.retryable,
            context: { ...error.context, ...context },
        };

        if (error.retryable) {
            console.warn('[AgentError]', JSON.stringify(logData));
        } else {
            console.error('[AgentError]', JSON.stringify(logData));
        }
    }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let globalErrorHandler: ErrorHandler | null = null;

export function getErrorHandler(): ErrorHandler {
    if (!globalErrorHandler) {
        globalErrorHandler = new ErrorHandler();
    }
    return globalErrorHandler;
}

export function configureErrorHandler(config: ErrorHandlerConfig): void {
    globalErrorHandler = new ErrorHandler(config);
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Handle an error using the global error handler.
 */
export function handleError(
    error: unknown,
    context: Record<string, unknown> = {}
): AgentError {
    return getErrorHandler().handle(error, context);
}

/**
 * Execute with protection using the global error handler.
 */
export async function withProtection<T>(
    name: string,
    operation: () => Promise<T>,
    options: {
        retry?: RetryOptions;
        context?: Record<string, unknown>;
    } = {}
): Promise<T> {
    return getErrorHandler().executeWithProtection(name, operation, options);
}

/**
 * Create an error response for API endpoints.
 */
export function createErrorResponse(
    error: unknown,
    context: Record<string, unknown> = {}
): ReturnType<ErrorHandler['createErrorResponse']> {
    return getErrorHandler().createErrorResponse(error, context);
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

export {
    isAgentError,
    isRetryableError,
    getErrorCode,
    wrapError
} from './types';

export * from './types';
export * from './retry';
export * from './circuit-breaker';
