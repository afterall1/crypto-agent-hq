/**
 * CryptoAgentHQ - Core Agent Types
 * @module lib/agents/core/types
 * 
 * Tüm agent'lar için temel type definitions.
 * Konsey Değerlendirmesi: TypeScript Expert ⭐⭐⭐⭐⭐
 */

import type Anthropic from '@anthropic-ai/sdk';

// ============================================================================
// MODEL TYPES
// ============================================================================

export const MODELS = {
    OPUS: 'claude-opus-4-20250514',
    SONNET: 'claude-sonnet-4-20250514',
    HAIKU: 'claude-3-5-haiku-20241022',
} as const;

export type ModelType = (typeof MODELS)[keyof typeof MODELS];

// ============================================================================
// AGENT ROLES
// ============================================================================

export type AgentRole =
    | 'orchestrator'
    | 'content-strategist'
    | 'tweet-optimizer'
    | 'engagement-analyst'
    | 'audience-scout'
    | 'voice-calibrator'
    | 'schedule-commander';

export const AGENT_ROLE_LABELS: Record<AgentRole, string> = {
    orchestrator: 'Orchestrator',
    'content-strategist': 'Content Strategist',
    'tweet-optimizer': 'Tweet Optimizer',
    'engagement-analyst': 'Engagement Analyst',
    'audience-scout': 'Audience Scout',
    'voice-calibrator': 'Voice Calibrator',
    'schedule-commander': 'Schedule Commander',
};

// ============================================================================
// AGENT CONFIGURATION
// ============================================================================

export interface RetryConfig {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    jitterFactor: number;
    retryableErrors: string[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitterFactor: 0.1,
    retryableErrors: ['rate_limit_error', 'overloaded_error', 'api_error'],
};

export interface AgentConfig {
    id: string;
    role: AgentRole;
    name: string;
    description: string;
    model: ModelType;
    systemPrompt: string;
    tools: ToolDefinition[];
    temperature: number;
    maxTokens: number;
    retryConfig: RetryConfig;
}

// ============================================================================
// TOOL TYPES
// ============================================================================

export interface ToolParameter {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description: string;
    enum?: string[];
    items?: ToolParameter;
    properties?: Record<string, ToolParameter>;
    required?: string[];
}

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, ToolParameter>;
        required: string[];
    };
    handler?: ToolHandler;
    timeout?: number;
    retryable?: boolean;
}

export type ToolHandler = (
    args: Record<string, unknown>
) => Promise<ToolResult>;

export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}

export interface ToolResult {
    success: boolean;
    data?: unknown;
    error?: string;
}

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export interface AgentMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    toolCalls?: ToolCall[];
    toolResults?: ToolResult[];
}

export interface AgentInput {
    sessionId: string;
    userId: string;
    message: string;
    context?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

export interface AgentOutput {
    id: string;
    agentId: string;
    role: AgentRole;
    content: string;
    toolCalls?: ToolCall[];
    usage: TokenUsage;
    timestamp: Date;
    metadata?: Record<string, unknown>;
}

export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

// ============================================================================
// WORKFLOW TYPES
// ============================================================================

export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface AgentTask {
    id: string;
    type: string;
    status: TaskStatus;
    priority: TaskPriority;
    assignedAgent: AgentRole;
    input: Record<string, unknown>;
    output?: Record<string, unknown>;
    error?: string;
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
    parentTaskId?: string;
    childTaskIds?: string[];
}

export interface DelegationRequest {
    fromAgent: AgentRole;
    toAgent: AgentRole;
    task: AgentTask;
    context: string;
    priority: TaskPriority;
}

export interface WorkflowState {
    id: string;
    status: 'running' | 'paused' | 'completed' | 'failed';
    currentPhase: string;
    tasks: AgentTask[];
    context: Record<string, unknown>;
    startedAt: Date;
    updatedAt: Date;
    completedAt?: Date;
}

// ============================================================================
// MEMORY TYPES
// ============================================================================

export interface MemoryEntry {
    id: string;
    type: 'message' | 'summary' | 'fact' | 'context';
    content: string;
    metadata: Record<string, unknown>;
    timestamp: Date;
    relevanceScore?: number;
}

export interface AgentMemory {
    shortTerm: MemoryEntry[];
    longTerm: MemoryEntry[];
    context: Record<string, unknown>;
}

// ============================================================================
// EVENT TYPES
// ============================================================================

export type AgentEventType =
    | 'agent:started'
    | 'agent:completed'
    | 'agent:error'
    | 'tool:called'
    | 'tool:completed'
    | 'delegation:requested'
    | 'delegation:completed'
    | 'workflow:started'
    | 'workflow:completed';

export interface AgentEvent {
    type: AgentEventType;
    agentId: string;
    timestamp: Date;
    data: Record<string, unknown>;
}

export type AgentEventHandler = (event: AgentEvent) => void;

// ============================================================================
// STREAMING TYPES
// ============================================================================

export interface StreamChunk {
    type: 'text' | 'tool_use' | 'tool_result' | 'error' | 'done';
    content?: string;
    toolCall?: ToolCall;
    toolResult?: ToolResult;
    error?: string;
}

export type StreamHandler = (chunk: StreamChunk) => void;

// ============================================================================
// ANTHROPIC SDK HELPERS
// ============================================================================

export type AnthropicMessage = Anthropic.Messages.MessageParam;
export type AnthropicTool = Anthropic.Messages.Tool;
export type AnthropicResponse = Anthropic.Messages.Message;
export type AnthropicContentBlock = Anthropic.Messages.ContentBlock;
