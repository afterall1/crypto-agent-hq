/**
 * CryptoAgentHQ - Tool Validators
 * @module lib/tools/validators
 * 
 * Input and output validation for tools.
 * Konsey Değerlendirmesi: Tool Design Uzmanı ⭐⭐⭐⭐⭐
 */

import type { ToolDefinition, ToolParameter, ToolResult } from '../agents/core/types';

// ============================================================================
// VALIDATION RESULT
// ============================================================================

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

// ============================================================================
// INPUT VALIDATION
// ============================================================================

/**
 * Validate tool input against schema.
 */
export function validateToolInput(
    input: Record<string, unknown>,
    tool: ToolDefinition
): ValidationResult {
    const errors: string[] = [];
    const { properties, required } = tool.parameters;

    // Check required parameters
    for (const param of required) {
        if (input[param] === undefined || input[param] === null) {
            errors.push(`Missing required parameter: ${param}`);
        }
    }

    // Validate each provided parameter
    for (const [key, value] of Object.entries(input)) {
        const schema = properties[key];

        if (!schema) {
            // Unknown parameter - warn but don't fail
            console.warn(`Unknown parameter for ${tool.name}: ${key}`);
            continue;
        }

        const paramErrors = validateParameter(key, value, schema);
        errors.push(...paramErrors);
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Validate a single parameter.
 */
function validateParameter(
    name: string,
    value: unknown,
    schema: ToolParameter
): string[] {
    const errors: string[] = [];

    // Type checking
    const actualType = getValueType(value);

    if (actualType !== schema.type) {
        // Allow number for string if it can be converted
        if (schema.type === 'string' && actualType === 'number') {
            // OK - will be converted
        } else if (schema.type === 'number' && actualType === 'string') {
            // Check if it's a numeric string
            if (isNaN(Number(value))) {
                errors.push(`Parameter ${name} must be a number, got string`);
            }
        } else {
            errors.push(`Parameter ${name} must be ${schema.type}, got ${actualType}`);
        }
    }

    // Enum validation
    if (schema.enum && schema.type === 'string') {
        if (!schema.enum.includes(value as string)) {
            errors.push(
                `Parameter ${name} must be one of: ${schema.enum.join(', ')}`
            );
        }
    }

    // Array item validation
    if (schema.type === 'array' && Array.isArray(value) && schema.items) {
        value.forEach((item, index) => {
            const itemErrors = validateParameter(`${name}[${index}]`, item, schema.items!);
            errors.push(...itemErrors);
        });
    }

    // Object property validation
    if (schema.type === 'object' && typeof value === 'object' && value !== null) {
        const objValue = value as Record<string, unknown>;

        // Check required properties
        if (schema.required) {
            for (const reqProp of schema.required) {
                if (objValue[reqProp] === undefined) {
                    errors.push(`Missing required property ${name}.${reqProp}`);
                }
            }
        }

        // Validate properties
        if (schema.properties) {
            for (const [propName, propValue] of Object.entries(objValue)) {
                const propSchema = schema.properties[propName];
                if (propSchema) {
                    const propErrors = validateParameter(
                        `${name}.${propName}`,
                        propValue,
                        propSchema
                    );
                    errors.push(...propErrors);
                }
            }
        }
    }

    return errors;
}

/**
 * Get the type of a value.
 */
function getValueType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

// ============================================================================
// OUTPUT VALIDATION
// ============================================================================

/**
 * Validate tool output.
 */
export function validateToolOutput(
    result: ToolResult,
    _tool: ToolDefinition
): ValidationResult {
    const errors: string[] = [];

    // Basic structure validation
    if (typeof result.success !== 'boolean') {
        errors.push('Result must have a boolean success property');
    }

    if (!result.success && !result.error) {
        errors.push('Failed result must have an error message');
    }

    if (result.success && result.error) {
        errors.push('Successful result should not have an error');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

// ============================================================================
// SCHEMA VALIDATION
// ============================================================================

/**
 * Validate a tool definition schema.
 */
export function validateToolSchema(tool: ToolDefinition): ValidationResult {
    const errors: string[] = [];

    // Name validation
    if (!tool.name || typeof tool.name !== 'string') {
        errors.push('Tool must have a name');
    } else if (!/^[a-z][a-z0-9_-]*$/i.test(tool.name)) {
        errors.push('Tool name must start with a letter and contain only alphanumeric characters, underscores, and hyphens');
    }

    // Description validation
    if (!tool.description || typeof tool.description !== 'string') {
        errors.push('Tool must have a description');
    } else if (tool.description.length < 10) {
        errors.push('Tool description should be at least 10 characters');
    }

    // Parameters validation
    if (!tool.parameters || tool.parameters.type !== 'object') {
        errors.push('Tool parameters must be an object type');
    }

    // Required check
    if (tool.parameters.required) {
        for (const reqParam of tool.parameters.required) {
            if (!tool.parameters.properties[reqParam]) {
                errors.push(`Required parameter ${reqParam} is not defined in properties`);
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

// ============================================================================
// SANITIZATION
// ============================================================================

/**
 * Sanitize tool input by converting types and applying defaults.
 */
export function sanitizeToolInput(
    input: Record<string, unknown>,
    tool: ToolDefinition
): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const { properties } = tool.parameters;

    for (const [key, value] of Object.entries(input)) {
        const schema = properties[key];

        if (!schema) {
            // Pass through unknown parameters
            sanitized[key] = value;
            continue;
        }

        sanitized[key] = sanitizeValue(value, schema);
    }

    return sanitized;
}

/**
 * Sanitize a single value based on schema.
 */
function sanitizeValue(value: unknown, schema: ToolParameter): unknown {
    if (value === undefined || value === null) {
        return value;
    }

    switch (schema.type) {
        case 'string':
            return String(value);

        case 'number':
            const num = Number(value);
            return isNaN(num) ? 0 : num;

        case 'boolean':
            if (typeof value === 'string') {
                return value.toLowerCase() === 'true';
            }
            return Boolean(value);

        case 'array':
            if (!Array.isArray(value)) {
                return [value];
            }
            if (schema.items) {
                return value.map(item => sanitizeValue(item, schema.items!));
            }
            return value;

        case 'object':
            if (typeof value !== 'object' || value === null) {
                return {};
            }
            const obj = value as Record<string, unknown>;
            if (schema.properties) {
                const sanitizedObj: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(obj)) {
                    const propSchema = schema.properties[k];
                    sanitizedObj[k] = propSchema ? sanitizeValue(v, propSchema) : v;
                }
                return sanitizedObj;
            }
            return value;

        default:
            return value;
    }
}

// ============================================================================
// CONVENIENCE
// ============================================================================

/**
 * Create a validator for a specific tool.
 */
export function createToolValidator(tool: ToolDefinition) {
    return {
        validateInput: (input: Record<string, unknown>) => validateToolInput(input, tool),
        validateOutput: (result: ToolResult) => validateToolOutput(result, tool),
        sanitizeInput: (input: Record<string, unknown>) => sanitizeToolInput(input, tool),
    };
}
