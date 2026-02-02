/**
 * CryptoAgentHQ - Tool Executor
 * @module lib/tools/executor
 * 
 * Executes tools with validation, timeout, and error handling.
 * Konsey Değerlendirmesi: Tool Design Uzmanı ⭐⭐⭐⭐⭐
 */

import type { ToolCall, ToolResult, ToolDefinition } from '../agents/core/types';
import { ToolRegistry, globalToolRegistry } from './registry';
import { validateToolInput, validateToolOutput, type ValidationResult } from './validators';
import {
    withProtection,
    ToolExecutionError,
    ToolTimeoutError,
    ToolValidationError
} from '../errors/handler';
import { CircuitBreaker, circuitBreakerRegistry } from '../errors/circuit-breaker';

// ============================================================================
// EXECUTOR CONFIG
// ============================================================================

export interface ExecutorConfig {
    defaultTimeout: number;
    enableValidation: boolean;
    enableCircuitBreaker: boolean;
    onToolStart?: (toolCall: ToolCall) => void;
    onToolComplete?: (toolCall: ToolCall, result: ToolResult) => void;
    onToolError?: (toolCall: ToolCall, error: Error) => void;
}

const DEFAULT_EXECUTOR_CONFIG: ExecutorConfig = {
    defaultTimeout: 30000,
    enableValidation: true,
    enableCircuitBreaker: true,
};

// ============================================================================
// TOOL EXECUTOR CLASS
// ============================================================================

export class ToolExecutor {
    private registry: ToolRegistry;
    private config: ExecutorConfig;
    private circuits: Map<string, CircuitBreaker> = new Map();

    constructor(
        registry?: ToolRegistry,
        config: Partial<ExecutorConfig> = {}
    ) {
        this.registry = registry || globalToolRegistry;
        this.config = { ...DEFAULT_EXECUTOR_CONFIG, ...config };
    }

    /**
     * Execute a tool call.
     */
    async execute(toolCall: ToolCall): Promise<ToolResult> {
        const tool = this.registry.get(toolCall.name);

        if (!tool) {
            return {
                success: false,
                error: `Tool not found: ${toolCall.name}`,
            };
        }

        if (!tool.handler) {
            return {
                success: false,
                error: `Tool handler not implemented: ${toolCall.name}`,
            };
        }

        // Notify start
        this.config.onToolStart?.(toolCall);

        try {
            // Validate input
            if (this.config.enableValidation) {
                const validation = validateToolInput(toolCall.arguments, tool);
                if (!validation.valid) {
                    throw new ToolValidationError(toolCall.name, validation.errors);
                }
            }

            // Execute with protection
            const result = await this.executeWithProtection(toolCall, tool);

            // Validate output
            if (this.config.enableValidation && result.success) {
                const outputValidation = validateToolOutput(result, tool);
                if (!outputValidation.valid) {
                    console.warn(`Tool output validation failed: ${outputValidation.errors.join(', ')}`);
                }
            }

            // Notify complete
            this.config.onToolComplete?.(toolCall, result);

            return result;

        } catch (error) {
            const toolError = error instanceof Error ? error : new Error(String(error));
            this.config.onToolError?.(toolCall, toolError);

            return {
                success: false,
                error: toolError.message,
            };
        }
    }

    /**
     * Execute multiple tools in parallel.
     */
    async executeAll(toolCalls: ToolCall[]): Promise<Map<string, ToolResult>> {
        const results = new Map<string, ToolResult>();

        await Promise.all(
            toolCalls.map(async toolCall => {
                const result = await this.execute(toolCall);
                results.set(toolCall.id, result);
            })
        );

        return results;
    }

    /**
     * Execute multiple tools sequentially.
     */
    async executeSequential(toolCalls: ToolCall[]): Promise<Map<string, ToolResult>> {
        const results = new Map<string, ToolResult>();

        for (const toolCall of toolCalls) {
            const result = await this.execute(toolCall);
            results.set(toolCall.id, result);

            // Stop on first error if needed
            if (!result.success) {
                break;
            }
        }

        return results;
    }

    /**
     * Check if a tool can be executed (circuit not open).
     */
    canExecute(toolName: string): boolean {
        if (!this.config.enableCircuitBreaker) {
            return true;
        }

        const circuit = this.circuits.get(toolName);
        return circuit ? !circuit.isOpen() : true;
    }

    /**
     * Get circuit breaker stats.
     */
    getCircuitStats(toolName: string): unknown {
        const circuit = this.circuits.get(toolName);
        return circuit?.getStats() ?? null;
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    private async executeWithProtection(
        toolCall: ToolCall,
        tool: ToolDefinition
    ): Promise<ToolResult> {
        const timeout = tool.timeout ?? this.config.defaultTimeout;

        if (this.config.enableCircuitBreaker) {
            const circuit = this.getOrCreateCircuit(toolCall.name);

            return circuit.execute(async () => {
                return this.executeWithTimeout(toolCall, tool, timeout);
            });
        }

        return this.executeWithTimeout(toolCall, tool, timeout);
    }

    private async executeWithTimeout(
        toolCall: ToolCall,
        tool: ToolDefinition,
        timeout: number
    ): Promise<ToolResult> {
        return new Promise<ToolResult>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new ToolTimeoutError(toolCall.name, timeout));
            }, timeout);

            tool.handler!(toolCall.arguments)
                .then(result => {
                    clearTimeout(timeoutId);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timeoutId);
                    reject(
                        new ToolExecutionError(
                            toolCall.name,
                            error instanceof Error ? error.message : String(error),
                            error instanceof Error ? error : undefined
                        )
                    );
                });
        });
    }

    private getOrCreateCircuit(toolName: string): CircuitBreaker {
        let circuit = this.circuits.get(toolName);

        if (!circuit) {
            circuit = circuitBreakerRegistry.getOrCreate(`tool:${toolName}`, {
                failureThreshold: 3,
                resetTimeoutMs: 30000,
            });
            this.circuits.set(toolName, circuit);
        }

        return circuit;
    }
}

// ============================================================================
// GLOBAL EXECUTOR
// ============================================================================

let globalExecutor: ToolExecutor | null = null;

export function getToolExecutor(): ToolExecutor {
    if (!globalExecutor) {
        globalExecutor = new ToolExecutor();
    }
    return globalExecutor;
}

export function configureToolExecutor(
    registry?: ToolRegistry,
    config?: Partial<ExecutorConfig>
): void {
    globalExecutor = new ToolExecutor(registry, config);
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Execute a tool using the global executor.
 */
export async function executeTool(toolCall: ToolCall): Promise<ToolResult> {
    return getToolExecutor().execute(toolCall);
}

/**
 * Execute multiple tools using the global executor.
 */
export async function executeTools(toolCalls: ToolCall[]): Promise<Map<string, ToolResult>> {
    return getToolExecutor().executeAll(toolCalls);
}
