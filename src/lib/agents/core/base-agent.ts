/**
 * CryptoAgentHQ - Base Agent
 * @module lib/agents/core/base-agent
 * 
 * Abstract base class for all agents.
 * Konsey Değerlendirmesi: Multi-Agent Mimarı ⭐⭐⭐⭐⭐
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
    AgentConfig,
    AgentRole,
    AgentInput,
    AgentOutput,
    AgentMessage,
    ToolCall,
    ToolResult,
    TokenUsage,
    AgentEvent,
    AgentEventHandler,
    StreamChunk,
    StreamHandler,
    AnthropicMessage,
    AnthropicTool,
    AnthropicContentBlock,
} from './types';
import { MemoryManager, createMemoryManager } from './agent-memory';
import { ErrorHandler, getErrorHandler, AgentProcessingError } from '../../errors/handler';

// ============================================================================
// BASE AGENT CLASS
// ============================================================================

export abstract class BaseAgent {
    protected readonly config: AgentConfig;
    protected readonly client: Anthropic;
    protected readonly memory: MemoryManager;
    protected readonly errorHandler: ErrorHandler;

    private eventHandlers: Map<string, AgentEventHandler[]> = new Map();
    private isProcessing: boolean = false;

    constructor(config: AgentConfig, client?: Anthropic) {
        this.config = config;
        this.client = client || new Anthropic();
        this.memory = createMemoryManager();
        this.errorHandler = getErrorHandler();
    }

    // ============================================================================
    // PUBLIC API
    // ============================================================================

    /**
     * Get agent ID.
     */
    get id(): string {
        return this.config.id;
    }

    /**
     * Get agent role.
     */
    get role(): AgentRole {
        return this.config.role;
    }

    /**
     * Get agent name.
     */
    get name(): string {
        return this.config.name;
    }

    /**
     * Check if agent is currently processing.
     */
    get busy(): boolean {
        return this.isProcessing;
    }

    /**
     * Process input and return output.
     * This is the main entry point for agent interaction.
     */
    async process(input: AgentInput): Promise<AgentOutput> {
        if (this.isProcessing) {
            throw new AgentProcessingError(
                this.role,
                'Agent is already processing a request'
            );
        }

        this.isProcessing = true;
        this.emit('agent:started', { input });

        try {
            // Pre-process input
            const processedInput = await this.preProcess(input);

            // Build messages
            const messages = this.buildMessages(processedInput);

            // Call model with retry protection
            const response = await this.errorHandler.executeWithProtection(
                `agent:${this.role}:call`,
                () => this.callModel(messages)
            );

            // Handle tool calls if any
            const { content, toolCalls, toolResults } = await this.handleResponse(response);

            // Post-process output
            const output = await this.postProcess({
                content,
                toolCalls,
                toolResults,
                usage: this.extractUsage(response),
            });

            // Store in memory
            this.memory.addMessage({
                id: `msg-${Date.now()}`,
                role: 'user',
                content: input.message,
                timestamp: new Date(),
            });

            this.memory.addMessage({
                id: output.id,
                role: 'assistant',
                content: output.content,
                timestamp: output.timestamp,
                toolCalls,
                toolResults,
            });

            this.emit('agent:completed', { output });
            return output;

        } catch (error) {
            const agentError = this.errorHandler.handle(error, {
                agentId: this.id,
                agentRole: this.role,
                input,
            });

            this.emit('agent:error', { error: agentError });
            throw agentError;

        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Process with streaming output.
     */
    async processStream(
        input: AgentInput,
        onChunk: StreamHandler
    ): Promise<AgentOutput> {
        if (this.isProcessing) {
            throw new AgentProcessingError(
                this.role,
                'Agent is already processing a request'
            );
        }

        this.isProcessing = true;
        this.emit('agent:started', { input, streaming: true });

        try {
            // Pre-process input
            const processedInput = await this.preProcess(input);

            // Build messages
            const messages = this.buildMessages(processedInput);

            // Stream response
            const { content, usage, toolCalls, toolResults } = await this.streamModel(
                messages,
                onChunk
            );

            // Post-process output
            const output = await this.postProcess({
                content,
                toolCalls,
                toolResults,
                usage,
            });

            // Store in memory
            this.memory.addMessage({
                id: `msg-${Date.now()}`,
                role: 'user',
                content: input.message,
                timestamp: new Date(),
            });

            this.memory.addMessage({
                id: output.id,
                role: 'assistant',
                content: output.content,
                timestamp: output.timestamp,
                toolCalls,
                toolResults,
            });

            onChunk({ type: 'done' });
            this.emit('agent:completed', { output });
            return output;

        } catch (error) {
            const agentError = this.errorHandler.handle(error, {
                agentId: this.id,
                agentRole: this.role,
                input,
            });

            onChunk({ type: 'error', error: agentError.message });
            this.emit('agent:error', { error: agentError });
            throw agentError;

        } finally {
            this.isProcessing = false;
        }
    }

    // ============================================================================
    // EVENT SYSTEM
    // ============================================================================

    /**
     * Subscribe to agent events.
     */
    on(event: string, handler: AgentEventHandler): void {
        const handlers = this.eventHandlers.get(event) || [];
        handlers.push(handler);
        this.eventHandlers.set(event, handlers);
    }

    /**
     * Unsubscribe from agent events.
     */
    off(event: string, handler: AgentEventHandler): void {
        const handlers = this.eventHandlers.get(event) || [];
        const index = handlers.indexOf(handler);
        if (index !== -1) {
            handlers.splice(index, 1);
            this.eventHandlers.set(event, handlers);
        }
    }

    /**
     * Emit an agent event.
     */
    protected emit(type: string, data: Record<string, unknown>): void {
        const event: AgentEvent = {
            type: type as AgentEvent['type'],
            agentId: this.id,
            timestamp: new Date(),
            data,
        };

        const handlers = this.eventHandlers.get(type) || [];
        handlers.forEach(handler => {
            try {
                handler(event);
            } catch (e) {
                console.error('Error in event handler:', e);
            }
        });
    }

    // ============================================================================
    // ABSTRACT METHODS - Must be implemented by subclasses
    // ============================================================================

    /**
     * Pre-process input before sending to model.
     * Override to add agent-specific preprocessing.
     */
    protected abstract preProcess(input: AgentInput): Promise<AgentInput>;

    /**
     * Post-process output before returning.
     * Override to add agent-specific postprocessing.
     */
    protected abstract postProcess(raw: {
        content: string;
        toolCalls?: ToolCall[];
        toolResults?: ToolResult[];
        usage: TokenUsage;
    }): Promise<AgentOutput>;

    // ============================================================================
    // PROTECTED METHODS
    // ============================================================================

    /**
     * Build messages array for API call.
     */
    protected buildMessages(input: AgentInput): AnthropicMessage[] {
        const messages: AnthropicMessage[] = [];

        // Add context from memory
        const contextString = this.memory.buildContextString({
            includeShortTerm: true,
            includeContext: true,
            relevantQuery: input.message,
        });

        // Add recent conversation history
        const recentMessages = this.memory.getRecentMessages(10);
        recentMessages.forEach(entry => {
            const role = entry.metadata.role as 'user' | 'assistant';
            messages.push({
                role,
                content: entry.content,
            });
        });

        // Add current user message with context
        let userContent = input.message;
        if (contextString) {
            userContent = `${contextString}\n\n---\n\n${input.message}`;
        }

        messages.push({
            role: 'user',
            content: userContent,
        });

        return messages;
    }

    /**
     * Call the Anthropic API.
     */
    protected async callModel(
        messages: AnthropicMessage[]
    ): Promise<Anthropic.Messages.Message> {
        const tools = this.buildToolSchemas();

        const response = await this.client.messages.create({
            model: this.config.model,
            max_tokens: this.config.maxTokens,
            temperature: this.config.temperature,
            system: this.config.systemPrompt,
            messages,
            ...(tools.length > 0 && { tools }),
        });

        return response;
    }

    /**
     * Stream response from Anthropic API.
     */
    protected async streamModel(
        messages: AnthropicMessage[],
        onChunk: StreamHandler
    ): Promise<{
        content: string;
        usage: TokenUsage;
        toolCalls?: ToolCall[];
        toolResults?: ToolResult[];
    }> {
        const tools = this.buildToolSchemas();

        const stream = await this.client.messages.stream({
            model: this.config.model,
            max_tokens: this.config.maxTokens,
            temperature: this.config.temperature,
            system: this.config.systemPrompt,
            messages,
            ...(tools.length > 0 && { tools }),
        });

        let content = '';
        const toolCalls: ToolCall[] = [];
        let currentToolUse: Partial<ToolCall> | null = null;

        for await (const event of stream) {
            if (event.type === 'content_block_delta') {
                if (event.delta.type === 'text_delta') {
                    content += event.delta.text;
                    onChunk({ type: 'text', content: event.delta.text });
                } else if (event.delta.type === 'input_json_delta') {
                    // Handle tool input streaming
                    if (currentToolUse) {
                        // Accumulate JSON input
                    }
                }
            } else if (event.type === 'content_block_start') {
                if (event.content_block.type === 'tool_use') {
                    currentToolUse = {
                        id: event.content_block.id,
                        name: event.content_block.name,
                        arguments: {},
                    };
                }
            } else if (event.type === 'content_block_stop') {
                if (currentToolUse && currentToolUse.id && currentToolUse.name) {
                    toolCalls.push(currentToolUse as ToolCall);
                    onChunk({ type: 'tool_use', toolCall: currentToolUse as ToolCall });
                    currentToolUse = null;
                }
            }
        }

        // Execute tool calls if any
        const toolResults: ToolResult[] = [];
        for (const toolCall of toolCalls) {
            const result = await this.executeTool(toolCall);
            toolResults.push(result);
            onChunk({ type: 'tool_result', toolResult: result });
        }

        const finalMessage = await stream.finalMessage();

        return {
            content,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            toolResults: toolResults.length > 0 ? toolResults : undefined,
            usage: this.extractUsage(finalMessage),
        };
    }

    /**
     * Handle response and extract content.
     */
    protected async handleResponse(
        response: Anthropic.Messages.Message
    ): Promise<{
        content: string;
        toolCalls?: ToolCall[];
        toolResults?: ToolResult[];
    }> {
        let content = '';
        const toolCalls: ToolCall[] = [];
        const toolResults: ToolResult[] = [];

        for (const block of response.content) {
            if (block.type === 'text') {
                content += block.text;
            } else if (block.type === 'tool_use') {
                const toolCall: ToolCall = {
                    id: block.id,
                    name: block.name,
                    arguments: block.input as Record<string, unknown>,
                };
                toolCalls.push(toolCall);

                // Execute tool
                const result = await this.executeTool(toolCall);
                toolResults.push(result);

                this.emit('tool:called', { toolCall });
                this.emit('tool:completed', { toolCall, result });
            }
        }

        return {
            content,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            toolResults: toolResults.length > 0 ? toolResults : undefined,
        };
    }

    /**
     * Execute a tool call.
     */
    protected async executeTool(toolCall: ToolCall): Promise<ToolResult> {
        const tool = this.config.tools.find(t => t.name === toolCall.name);

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

        try {
            const result = await this.errorHandler.executeWithProtection(
                `tool:${toolCall.name}`,
                () => tool.handler!(toolCall.arguments),
                {
                    context: {
                        toolName: toolCall.name,
                        agentId: this.id,
                    },
                }
            );
            return result;
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Build tool schemas for API call.
     */
    protected buildToolSchemas(): AnthropicTool[] {
        return this.config.tools.map(tool => ({
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
     * Extract usage from response.
     */
    protected extractUsage(response: Anthropic.Messages.Message): TokenUsage {
        return {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        };
    }

    // ============================================================================
    // MEMORY ACCESS
    // ============================================================================

    /**
     * Get memory manager for external access.
     */
    getMemory(): MemoryManager {
        return this.memory;
    }

    /**
     * Set context value.
     */
    setContext(key: string, value: unknown): void {
        this.memory.setContext(key, value);
    }

    /**
     * Get context value.
     */
    getContext<T = unknown>(key: string): T | undefined {
        return this.memory.getContext<T>(key);
    }

    /**
     * Clear agent memory.
     */
    clearMemory(): void {
        this.memory.clear();
    }
}
