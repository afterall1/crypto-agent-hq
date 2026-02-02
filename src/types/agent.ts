/**
 * CryptoAgentHQ - Agent Type Definitions
 * Claude Opus 4.5 Agent Ekibi için TypeScript types
 */

export type AgentRole =
  | 'orchestrator'
  | 'content-strategist'
  | 'tweet-optimizer'
  | 'engagement-analyst'
  | 'audience-scout'
  | 'voice-calibrator'
  | 'schedule-commander';

export interface AgentConfig {
  id: string;
  role: AgentRole;
  name: string;
  description: string;
  model: 'claude-sonnet-4-20250514' | 'claude-opus-4-20250514';
  systemPrompt: string;
  tools: AgentTool[];
  temperature: number;
  maxTokens: number;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  required: string[];
}

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  enum?: string[];
}

export interface AgentMessage {
  id: string;
  agentId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

export interface AgentTask {
  id: string;
  type: 'content' | 'optimization' | 'analysis' | 'scheduling';
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  assignedAgent: AgentRole;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  createdAt: Date;
  completedAt?: Date;
}

export interface AgentDelegation {
  fromAgent: AgentRole;
  toAgent: AgentRole;
  task: AgentTask;
  context: string;
}

export interface AgentState {
  agents: Map<AgentRole, AgentConfig>;
  activeAgent: AgentRole | null;
  messages: AgentMessage[];
  tasks: AgentTask[];
  isProcessing: boolean;
}
