/**
 * CryptoAgentHQ - Circuit Breaker
 * @module lib/errors/circuit-breaker
 * 
 * Prevents cascading failures by stopping calls to failing services.
 * Konsey Değerlendirmesi: Error Handling Mühendisi ⭐⭐⭐⭐⭐
 */

import { CircuitOpenError } from './types';

// ============================================================================
// CIRCUIT BREAKER STATES
// ============================================================================

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

// ============================================================================
// CIRCUIT BREAKER CONFIG
// ============================================================================

export interface CircuitBreakerConfig {
    name: string;
    failureThreshold: number;     // Number of failures to open circuit
    successThreshold: number;     // Successes in half-open to close
    resetTimeoutMs: number;       // Time before moving from open to half-open
    halfOpenMaxCalls: number;     // Max concurrent calls in half-open state
    monitorWindowMs: number;      // Window for counting failures
    onStateChange?: (from: CircuitState, to: CircuitState) => void;
    onFailure?: (error: Error) => void;
    onSuccess?: () => void;
}

export const DEFAULT_CIRCUIT_CONFIG: Omit<CircuitBreakerConfig, 'name'> = {
    failureThreshold: 5,
    successThreshold: 2,
    resetTimeoutMs: 30000,
    halfOpenMaxCalls: 3,
    monitorWindowMs: 60000,
};

// ============================================================================
// CIRCUIT BREAKER STATS
// ============================================================================

export interface CircuitBreakerStats {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureTime: number | null;
    lastSuccessTime: number | null;
    totalRequests: number;
    totalFailures: number;
    totalSuccesses: number;
}

// ============================================================================
// CIRCUIT BREAKER CLASS
// ============================================================================

export class CircuitBreaker {
    private state: CircuitState = 'CLOSED';
    private failures: number = 0;
    private successes: number = 0;
    private lastFailureTime: number | null = null;
    private lastSuccessTime: number | null = null;
    private halfOpenCalls: number = 0;
    private failureTimestamps: number[] = [];

    // Stats
    private totalRequests: number = 0;
    private totalFailures: number = 0;
    private totalSuccesses: number = 0;

    private readonly config: CircuitBreakerConfig;

    constructor(config: Partial<CircuitBreakerConfig> & { name: string }) {
        this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
    }

    /**
     * Get current circuit state.
     */
    getState(): CircuitState {
        this.checkStateTransition();
        return this.state;
    }

    /**
     * Get circuit breaker statistics.
     */
    getStats(): CircuitBreakerStats {
        return {
            state: this.getState(),
            failures: this.failures,
            successes: this.successes,
            lastFailureTime: this.lastFailureTime,
            lastSuccessTime: this.lastSuccessTime,
            totalRequests: this.totalRequests,
            totalFailures: this.totalFailures,
            totalSuccesses: this.totalSuccesses,
        };
    }

    /**
     * Check if circuit allows execution.
     */
    isOpen(): boolean {
        return this.getState() === 'OPEN';
    }

    /**
     * Execute an operation through the circuit breaker.
     */
    async execute<T>(operation: () => Promise<T>): Promise<T> {
        this.totalRequests++;
        this.checkStateTransition();

        // Check if circuit is open
        if (this.state === 'OPEN') {
            throw new CircuitOpenError(
                this.config.name,
                this.getRemainingResetTime(),
                { stats: this.getStats() }
            );
        }

        // Check half-open limits
        if (this.state === 'HALF_OPEN') {
            if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
                throw new CircuitOpenError(
                    this.config.name,
                    this.getRemainingResetTime(),
                    {
                        reason: 'Half-open call limit reached',
                        stats: this.getStats()
                    }
                );
            }
            this.halfOpenCalls++;
        }

        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure(error instanceof Error ? error : new Error(String(error)));
            throw error;
        } finally {
            if (this.state === 'HALF_OPEN') {
                this.halfOpenCalls = Math.max(0, this.halfOpenCalls - 1);
            }
        }
    }

    /**
     * Manually reset the circuit breaker.
     */
    reset(): void {
        const previousState = this.state;
        this.state = 'CLOSED';
        this.failures = 0;
        this.successes = 0;
        this.halfOpenCalls = 0;
        this.failureTimestamps = [];

        if (previousState !== 'CLOSED' && this.config.onStateChange) {
            this.config.onStateChange(previousState, 'CLOSED');
        }
    }

    /**
     * Manually open the circuit.
     */
    trip(): void {
        const previousState = this.state;
        this.state = 'OPEN';
        this.lastFailureTime = Date.now();

        if (previousState !== 'OPEN' && this.config.onStateChange) {
            this.config.onStateChange(previousState, 'OPEN');
        }
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    private onSuccess(): void {
        this.totalSuccesses++;
        this.lastSuccessTime = Date.now();
        this.config.onSuccess?.();

        if (this.state === 'HALF_OPEN') {
            this.successes++;

            if (this.successes >= this.config.successThreshold) {
                this.transitionTo('CLOSED');
                this.failures = 0;
                this.successes = 0;
                this.failureTimestamps = [];
            }
        } else if (this.state === 'CLOSED') {
            // Reset failure count on success in closed state
            this.failures = 0;
            this.cleanOldFailures();
        }
    }

    private onFailure(error: Error): void {
        this.totalFailures++;
        this.lastFailureTime = Date.now();
        this.failureTimestamps.push(Date.now());
        this.config.onFailure?.(error);

        if (this.state === 'HALF_OPEN') {
            // Any failure in half-open immediately opens the circuit
            this.transitionTo('OPEN');
            this.successes = 0;
        } else if (this.state === 'CLOSED') {
            this.cleanOldFailures();
            this.failures = this.failureTimestamps.length;

            if (this.failures >= this.config.failureThreshold) {
                this.transitionTo('OPEN');
            }
        }
    }

    private checkStateTransition(): void {
        if (this.state === 'OPEN' && this.lastFailureTime) {
            const timeSinceLastFailure = Date.now() - this.lastFailureTime;

            if (timeSinceLastFailure >= this.config.resetTimeoutMs) {
                this.transitionTo('HALF_OPEN');
                this.halfOpenCalls = 0;
                this.successes = 0;
            }
        }
    }

    private transitionTo(newState: CircuitState): void {
        if (this.state !== newState) {
            const previousState = this.state;
            this.state = newState;
            this.config.onStateChange?.(previousState, newState);
        }
    }

    private cleanOldFailures(): void {
        const cutoffTime = Date.now() - this.config.monitorWindowMs;
        this.failureTimestamps = this.failureTimestamps.filter(t => t > cutoffTime);
    }

    private getRemainingResetTime(): number {
        if (!this.lastFailureTime) return 0;
        const elapsed = Date.now() - this.lastFailureTime;
        return Math.max(0, this.config.resetTimeoutMs - elapsed);
    }
}

// ============================================================================
// CIRCUIT BREAKER REGISTRY
// ============================================================================

class CircuitBreakerRegistry {
    private circuits: Map<string, CircuitBreaker> = new Map();

    get(name: string): CircuitBreaker | undefined {
        return this.circuits.get(name);
    }

    getOrCreate(
        name: string,
        config?: Partial<Omit<CircuitBreakerConfig, 'name'>>
    ): CircuitBreaker {
        let circuit = this.circuits.get(name);

        if (!circuit) {
            circuit = new CircuitBreaker({ name, ...config });
            this.circuits.set(name, circuit);
        }

        return circuit;
    }

    remove(name: string): boolean {
        return this.circuits.delete(name);
    }

    reset(name: string): void {
        this.circuits.get(name)?.reset();
    }

    resetAll(): void {
        this.circuits.forEach(circuit => circuit.reset());
    }

    getAllStats(): Record<string, CircuitBreakerStats> {
        const stats: Record<string, CircuitBreakerStats> = {};

        this.circuits.forEach((circuit, name) => {
            stats[name] = circuit.getStats();
        });

        return stats;
    }
}

// ============================================================================
// SINGLETON REGISTRY
// ============================================================================

export const circuitBreakerRegistry = new CircuitBreakerRegistry();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Execute operation with circuit breaker protection.
 */
export async function withCircuitBreaker<T>(
    name: string,
    operation: () => Promise<T>,
    config?: Partial<Omit<CircuitBreakerConfig, 'name'>>
): Promise<T> {
    const circuit = circuitBreakerRegistry.getOrCreate(name, config);
    return circuit.execute(operation);
}

/**
 * Create a circuit breaker for a specific service.
 */
export function createCircuitBreaker(
    name: string,
    config?: Partial<Omit<CircuitBreakerConfig, 'name'>>
): CircuitBreaker {
    return circuitBreakerRegistry.getOrCreate(name, config);
}

/**
 * Decorator for circuit-breaker protected methods.
 */
export function circuitProtected(
    circuitName?: string,
    config?: Partial<Omit<CircuitBreakerConfig, 'name'>>
) {
    return function <T extends (...args: unknown[]) => Promise<unknown>>(
        _target: object,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<T>
    ): TypedPropertyDescriptor<T> {
        const originalMethod = descriptor.value;

        if (!originalMethod) {
            return descriptor;
        }

        const name = circuitName || propertyKey;
        const circuit = circuitBreakerRegistry.getOrCreate(name, config);

        descriptor.value = async function (this: unknown, ...args: unknown[]) {
            return circuit.execute(() => originalMethod.apply(this, args));
        } as T;

        return descriptor;
    };
}
