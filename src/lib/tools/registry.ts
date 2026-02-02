/**
 * CryptoAgentHQ - Tool Registry
 * @module lib/tools/registry
 * 
 * MCP-compatible tool registration and management.
 * Konsey Değerlendirmesi: Tool Design Uzmanı ⭐⭐⭐⭐⭐
 */

import type { ToolDefinition, ToolHandler, ToolParameter, AnthropicTool } from '../agents/core/types';

// ============================================================================
// TOOL REGISTRY CLASS
// ============================================================================

export class ToolRegistry {
    private tools: Map<string, ToolDefinition> = new Map();

    /**
     * Register a tool.
     */
    register(tool: ToolDefinition): void {
        if (this.tools.has(tool.name)) {
            console.warn(`Tool already registered: ${tool.name}. Overwriting.`);
        }
        this.tools.set(tool.name, tool);
    }

    /**
     * Register multiple tools.
     */
    registerAll(tools: ToolDefinition[]): void {
        tools.forEach(tool => this.register(tool));
    }

    /**
     * Get a tool by name.
     */
    get(name: string): ToolDefinition | undefined {
        return this.tools.get(name);
    }

    /**
     * Check if a tool exists.
     */
    has(name: string): boolean {
        return this.tools.has(name);
    }

    /**
     * Remove a tool.
     */
    unregister(name: string): boolean {
        return this.tools.delete(name);
    }

    /**
     * List all registered tools.
     */
    list(): ToolDefinition[] {
        return Array.from(this.tools.values());
    }

    /**
     * Get tool names.
     */
    names(): string[] {
        return Array.from(this.tools.keys());
    }

    /**
     * Get tools as Anthropic tool schemas.
     */
    getSchemas(): AnthropicTool[] {
        return this.list().map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: {
                type: 'object' as const,
                properties: tool.parameters.properties as Record<string, unknown>,
                required: tool.parameters.required,
            },
        }));
    }

    /**
     * Get schemas for specific tools.
     */
    getSchemasFor(names: string[]): AnthropicTool[] {
        return names
            .map(name => this.get(name))
            .filter((tool): tool is ToolDefinition => tool !== undefined)
            .map(tool => ({
                name: tool.name,
                description: tool.description,
                input_schema: {
                    type: 'object' as const,
                    properties: tool.parameters.properties as Record<string, unknown>,
                    required: tool.parameters.required,
                },
            }));
    }

    /**
     * Clear all tools.
     */
    clear(): void {
        this.tools.clear();
    }

    /**
     * Get count of registered tools.
     */
    get size(): number {
        return this.tools.size;
    }
}

// ============================================================================
// TOOL BUILDER
// ============================================================================

export interface ToolBuilderOptions {
    name: string;
    description: string;
    handler: ToolHandler;
    timeout?: number;
    retryable?: boolean;
}

export class ToolBuilder {
    private name: string = '';
    private description: string = '';
    private handler?: ToolHandler;
    private timeout: number = 30000;
    private retryable: boolean = false;
    private properties: Record<string, ToolParameter> = {};
    private required: string[] = [];

    /**
     * Set tool name.
     */
    withName(name: string): this {
        this.name = name;
        return this;
    }

    /**
     * Set tool description.
     */
    withDescription(description: string): this {
        this.description = description;
        return this;
    }

    /**
     * Set tool handler.
     */
    withHandler(handler: ToolHandler): this {
        this.handler = handler;
        return this;
    }

    /**
     * Add a string parameter.
     */
    addStringParam(
        name: string,
        description: string,
        options: { required?: boolean; enum?: string[] } = {}
    ): this {
        this.properties[name] = {
            type: 'string',
            description,
            ...(options.enum && { enum: options.enum }),
        };
        if (options.required) {
            this.required.push(name);
        }
        return this;
    }

    /**
     * Add a number parameter.
     */
    addNumberParam(
        name: string,
        description: string,
        options: { required?: boolean } = {}
    ): this {
        this.properties[name] = {
            type: 'number',
            description,
        };
        if (options.required) {
            this.required.push(name);
        }
        return this;
    }

    /**
     * Add a boolean parameter.
     */
    addBooleanParam(
        name: string,
        description: string,
        options: { required?: boolean } = {}
    ): this {
        this.properties[name] = {
            type: 'boolean',
            description,
        };
        if (options.required) {
            this.required.push(name);
        }
        return this;
    }

    /**
     * Add an array parameter.
     */
    addArrayParam(
        name: string,
        description: string,
        itemType: ToolParameter,
        options: { required?: boolean } = {}
    ): this {
        this.properties[name] = {
            type: 'array',
            description,
            items: itemType,
        };
        if (options.required) {
            this.required.push(name);
        }
        return this;
    }

    /**
     * Add an object parameter.
     */
    addObjectParam(
        name: string,
        description: string,
        properties: Record<string, ToolParameter>,
        options: { required?: boolean; requiredProps?: string[] } = {}
    ): this {
        this.properties[name] = {
            type: 'object',
            description,
            properties,
            required: options.requiredProps,
        };
        if (options.required) {
            this.required.push(name);
        }
        return this;
    }

    /**
     * Set timeout.
     */
    withTimeout(timeout: number): this {
        this.timeout = timeout;
        return this;
    }

    /**
     * Set retryable.
     */
    withRetryable(retryable: boolean): this {
        this.retryable = retryable;
        return this;
    }

    /**
     * Build the tool definition.
     */
    build(): ToolDefinition {
        if (!this.name) {
            throw new Error('Tool name is required');
        }
        if (!this.description) {
            throw new Error('Tool description is required');
        }

        return {
            name: this.name,
            description: this.description,
            parameters: {
                type: 'object',
                properties: this.properties,
                required: this.required,
            },
            handler: this.handler,
            timeout: this.timeout,
            retryable: this.retryable,
        };
    }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Create a new tool builder.
 */
export function defineTool(): ToolBuilder {
    return new ToolBuilder();
}

/**
 * Quick tool definition.
 */
export function createTool(options: ToolBuilderOptions): ToolDefinition {
    return {
        name: options.name,
        description: options.description,
        parameters: {
            type: 'object',
            properties: {},
            required: [],
        },
        handler: options.handler,
        timeout: options.timeout ?? 30000,
        retryable: options.retryable ?? false,
    };
}

// ============================================================================
// GLOBAL REGISTRY
// ============================================================================

export const globalToolRegistry = new ToolRegistry();

/**
 * Register a tool globally.
 */
export function registerTool(tool: ToolDefinition): void {
    globalToolRegistry.register(tool);
}

/**
 * Get a tool from global registry.
 */
export function getTool(name: string): ToolDefinition | undefined {
    return globalToolRegistry.get(name);
}
