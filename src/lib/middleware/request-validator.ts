/**
 * CryptoAgentHQ - Request Validator Middleware
 * @module lib/middleware/request-validator
 *
 * Centralized input validation using Zod schemas.
 * Konsey Değerlendirmesi: API Security Engineer ⭐⭐⭐⭐⭐
 */

import { z, ZodSchema, ZodError } from 'zod';
import { NextRequest } from 'next/server';

// ============================================================================
// VALIDATION RESULT TYPES
// ============================================================================

export interface ValidationSuccess<T> {
    success: true;
    data: T;
}

export interface ValidationFailure {
    success: false;
    error: string;
    details?: z.ZodIssue[];
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

// ============================================================================
// REQUEST SIZE LIMITS
// ============================================================================

const MAX_BODY_SIZE = 1024 * 1024; // 1MB default

export interface ValidatorConfig {
    maxBodySize?: number;
}

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

/**
 * Agent request schema for POST /api/agents
 */
export const AgentRequestSchema = z.object({
    message: z
        .string()
        .min(1, 'Message is required')
        .max(10000, 'Message too long (max 10000 characters)'),
    sessionId: z
        .string()
        .max(100)
        .regex(/^[a-zA-Z0-9-_]+$/, 'Invalid session ID format')
        .optional(),
    userId: z
        .string()
        .max(100)
        .regex(/^[a-zA-Z0-9-_@.]+$/, 'Invalid user ID format')
        .optional(),
    context: z
        .record(z.string(), z.unknown())
        .optional(),
    agentRole: z
        .enum(['orchestrator', 'content-strategist', 'tweet-optimizer', 'engagement-analyst', 'audience-scout', 'voice-calibrator', 'schedule-commander'])
        .optional(),
});

export type AgentRequest = z.infer<typeof AgentRequestSchema>;

/**
 * Stream request schema for POST /api/agents/stream
 */
export const StreamRequestSchema = z.object({
    message: z
        .string()
        .min(1, 'Message is required')
        .max(10000, 'Message too long (max 10000 characters)'),
    sessionId: z
        .string()
        .max(100)
        .regex(/^[a-zA-Z0-9-_]+$/, 'Invalid session ID format')
        .optional(),
    userId: z
        .string()
        .max(100)
        .regex(/^[a-zA-Z0-9-_@.]+$/, 'Invalid user ID format')
        .optional(),
    context: z
        .record(z.string(), z.unknown())
        .optional(),
});

export type StreamRequest = z.infer<typeof StreamRequestSchema>;

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate request body against a Zod schema.
 * Includes body size check and JSON parsing error handling.
 */
export async function validateRequest<T>(
    request: NextRequest,
    schema: ZodSchema<T>,
    config: ValidatorConfig = {}
): Promise<ValidationResult<T>> {
    const maxSize = config.maxBodySize ?? MAX_BODY_SIZE;

    try {
        // Check content length if available
        const contentLength = request.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > maxSize) {
            return {
                success: false,
                error: `Request body too large (max ${Math.floor(maxSize / 1024)}KB)`,
            };
        }

        // Parse JSON body
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return {
                success: false,
                error: 'Invalid JSON in request body',
            };
        }

        // Validate against schema
        const result = schema.safeParse(body);

        if (result.success) {
            return {
                success: true,
                data: result.data,
            };
        }

        // Format validation errors
        const errorMessages = result.error.issues
            .map(issue => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ');

        return {
            success: false,
            error: errorMessages || 'Validation failed',
            details: result.error.issues,
        };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Validation error',
        };
    }
}

/**
 * Validate a plain object against a Zod schema.
 */
export function validateData<T>(
    data: unknown,
    schema: ZodSchema<T>
): ValidationResult<T> {
    try {
        const result = schema.safeParse(data);

        if (result.success) {
            return {
                success: true,
                data: result.data,
            };
        }

        const errorMessages = result.error.issues
            .map(issue => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ');

        return {
            success: false,
            error: errorMessages || 'Validation failed',
            details: result.error.issues,
        };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Validation error',
        };
    }
}

/**
 * Format Zod error for API response.
 */
export function formatZodError(error: ZodError): {
    code: string;
    message: string;
    details: z.ZodIssue[];
} {
    const messages = error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');

    return {
        code: 'VALIDATION_ERROR',
        message: messages || 'Request validation failed',
        details: error.issues,
    };
}

// ============================================================================
// SANITIZATION HELPERS
// ============================================================================

/**
 * Sanitize string input by removing potentially dangerous characters.
 */
export function sanitizeString(input: string): string {
    return input
        .replace(/[<>]/g, '') // Remove angle brackets (XSS)
        .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
        .trim();
}

/**
 * Create a sanitized schema wrapper.
 * Returns a transformed string schema that auto-sanitizes input.
 */
export function withSanitization(schema: z.ZodString) {
    return schema.transform((val) => sanitizeString(val));
}
