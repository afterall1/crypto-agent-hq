/**
 * CryptoAgentHQ - Error Types
 * @module lib/errors/types
 * 
 * Production-grade error type hierarchy.
 * Konsey Değerlendirmesi: Error Handling Mühendisi ⭐⭐⭐⭐⭐
 */

// ============================================================================
// BASE ERROR
// ============================================================================

export abstract class AgentError extends Error {
    public readonly code: string;
    public readonly retryable: boolean;
    public readonly timestamp: Date;
    public readonly context: Record<string, unknown>;

    constructor(
        message: string,
        code: string,
        retryable: boolean = false,
        context: Record<string, unknown> = {}
    ) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.retryable = retryable;
        this.timestamp = new Date();
        this.context = context;

        // Ensure proper prototype chain
        Object.setPrototypeOf(this, new.target.prototype);

        // Capture stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            retryable: this.retryable,
            timestamp: this.timestamp.toISOString(),
            context: this.context,
            stack: this.stack,
        };
    }
}

// ============================================================================
// API ERRORS
// ============================================================================

export class APIError extends AgentError {
    public readonly statusCode?: number;
    public readonly headers?: Record<string, string>;

    constructor(
        message: string,
        statusCode?: number,
        headers?: Record<string, string>,
        context: Record<string, unknown> = {}
    ) {
        const retryable = statusCode ? [429, 500, 502, 503, 504].includes(statusCode) : false;
        super(message, 'API_ERROR', retryable, context);
        this.statusCode = statusCode;
        this.headers = headers;
    }
}

export class RateLimitError extends AgentError {
    public readonly retryAfterMs: number;

    constructor(
        message: string,
        retryAfterMs: number = 60000,
        context: Record<string, unknown> = {}
    ) {
        super(message, 'RATE_LIMIT_ERROR', true, context);
        this.retryAfterMs = retryAfterMs;
    }
}

export class AuthenticationError extends AgentError {
    constructor(message: string, context: Record<string, unknown> = {}) {
        super(message, 'AUTHENTICATION_ERROR', false, context);
    }
}

// ============================================================================
// TOOL ERRORS
// ============================================================================

export class ToolError extends AgentError {
    public readonly toolName: string;

    constructor(
        message: string,
        toolName: string,
        retryable: boolean = false,
        context: Record<string, unknown> = {}
    ) {
        super(message, 'TOOL_ERROR', retryable, { ...context, toolName });
        this.toolName = toolName;
    }
}

export class ToolValidationError extends ToolError {
    public readonly validationErrors: string[];

    constructor(
        toolName: string,
        validationErrors: string[],
        context: Record<string, unknown> = {}
    ) {
        super(
            `Tool validation failed: ${validationErrors.join(', ')}`,
            toolName,
            false,
            context
        );
        this.validationErrors = validationErrors;
    }
}

export class ToolTimeoutError extends ToolError {
    public readonly timeoutMs: number;

    constructor(
        toolName: string,
        timeoutMs: number,
        context: Record<string, unknown> = {}
    ) {
        super(`Tool execution timed out after ${timeoutMs}ms`, toolName, true, context);
        this.timeoutMs = timeoutMs;
    }
}

export class ToolExecutionError extends ToolError {
    public readonly originalError?: Error;

    constructor(
        toolName: string,
        message: string,
        originalError?: Error,
        context: Record<string, unknown> = {}
    ) {
        super(message, toolName, false, context);
        this.originalError = originalError;
    }
}

// ============================================================================
// AGENT ERRORS
// ============================================================================

export class AgentNotFoundError extends AgentError {
    public readonly agentRole: string;

    constructor(agentRole: string, context: Record<string, unknown> = {}) {
        super(`Agent not found: ${agentRole}`, 'AGENT_NOT_FOUND', false, context);
        this.agentRole = agentRole;
    }
}

export class AgentProcessingError extends AgentError {
    public readonly agentRole: string;
    public readonly originalError?: Error;

    constructor(
        agentRole: string,
        message: string,
        originalError?: Error,
        context: Record<string, unknown> = {}
    ) {
        super(message, 'AGENT_PROCESSING_ERROR', false, context);
        this.agentRole = agentRole;
        this.originalError = originalError;
    }
}

// ============================================================================
// WORKFLOW ERRORS
// ============================================================================

export class WorkflowError extends AgentError {
    public readonly workflowId: string;

    constructor(
        message: string,
        workflowId: string,
        retryable: boolean = false,
        context: Record<string, unknown> = {}
    ) {
        super(message, 'WORKFLOW_ERROR', retryable, { ...context, workflowId });
        this.workflowId = workflowId;
    }
}

export class DelegationError extends WorkflowError {
    public readonly fromAgent: string;
    public readonly toAgent: string;

    constructor(
        message: string,
        workflowId: string,
        fromAgent: string,
        toAgent: string,
        context: Record<string, unknown> = {}
    ) {
        super(message, workflowId, false, { ...context, fromAgent, toAgent });
        this.fromAgent = fromAgent;
        this.toAgent = toAgent;
    }
}

// ============================================================================
// CIRCUIT BREAKER ERRORS
// ============================================================================

export class CircuitOpenError extends AgentError {
    public readonly circuitName: string;
    public readonly resetTimeMs: number;

    constructor(
        circuitName: string,
        resetTimeMs: number,
        context: Record<string, unknown> = {}
    ) {
        super(
            `Circuit breaker is open for: ${circuitName}. Retry after ${resetTimeMs}ms.`,
            'CIRCUIT_OPEN',
            false,
            context
        );
        this.circuitName = circuitName;
        this.resetTimeMs = resetTimeMs;
    }
}

// ============================================================================
// RETRY ERRORS
// ============================================================================

export class MaxRetriesExceededError extends AgentError {
    public readonly attempts: number;
    public readonly lastError: Error;

    constructor(
        attempts: number,
        lastError: Error,
        context: Record<string, unknown> = {}
    ) {
        super(
            `Max retries exceeded after ${attempts} attempts. Last error: ${lastError.message}`,
            'MAX_RETRIES_EXCEEDED',
            false,
            context
        );
        this.attempts = attempts;
        this.lastError = lastError;
    }
}

// ============================================================================
// VALIDATION ERRORS
// ============================================================================

export class ValidationError extends AgentError {
    public readonly field: string;
    public readonly value: unknown;

    constructor(
        message: string,
        field: string,
        value: unknown,
        context: Record<string, unknown> = {}
    ) {
        super(message, 'VALIDATION_ERROR', false, { ...context, field, value });
        this.field = field;
        this.value = value;
    }
}

export class InputValidationError extends ValidationError {
    public readonly errors: Array<{ field: string; message: string }>;

    constructor(
        errors: Array<{ field: string; message: string }>,
        context: Record<string, unknown> = {}
    ) {
        super(
            `Input validation failed: ${errors.map(e => e.message).join(', ')}`,
            'input',
            null,
            context
        );
        this.errors = errors;
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function isAgentError(error: unknown): error is AgentError {
    return error instanceof AgentError;
}

export function isRetryableError(error: unknown): boolean {
    if (isAgentError(error)) {
        return error.retryable;
    }
    return false;
}

export function getErrorCode(error: unknown): string {
    if (isAgentError(error)) {
        return error.code;
    }
    if (error instanceof Error) {
        return 'UNKNOWN_ERROR';
    }
    return 'UNEXPECTED_ERROR';
}

export function wrapError(error: unknown, context: Record<string, unknown> = {}): AgentError {
    if (isAgentError(error)) {
        return error;
    }

    if (error instanceof Error) {
        return new AgentProcessingError(
            'unknown',
            error.message,
            error,
            context
        );
    }

    return new AgentProcessingError(
        'unknown',
        String(error),
        undefined,
        context
    );
}
