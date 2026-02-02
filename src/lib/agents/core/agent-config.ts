/**
 * CryptoAgentHQ - Agent Configuration
 * @module lib/agents/core/agent-config
 * 
 * Centralized agent configuration definitions.
 * Konsey Değerlendirmesi: Claude SDK Uzmanı ⭐⭐⭐⭐⭐
 */

import type { AgentConfig, AgentRole, RetryConfig, ToolDefinition, ModelType } from './types';
import { MODELS, DEFAULT_RETRY_CONFIG } from './types';

// ============================================================================
// MODEL ASSIGNMENTS
// ============================================================================

export const AGENT_MODEL_ASSIGNMENTS: Record<AgentRole, ModelType> = {
    orchestrator: MODELS.SONNET,
    'content-strategist': MODELS.SONNET,
    'tweet-optimizer': MODELS.SONNET,
    'engagement-analyst': MODELS.SONNET,
    'audience-scout': MODELS.SONNET,
    'voice-calibrator': MODELS.SONNET,
    'schedule-commander': MODELS.HAIKU, // Simple tasks, fast responses
};

// ============================================================================
// DEFAULT AGENT SETTINGS
// ============================================================================

export const DEFAULT_AGENT_SETTINGS = {
    temperature: 0.7,
    maxTokens: 4096,
    retryConfig: DEFAULT_RETRY_CONFIG,
} as const;

// ============================================================================
// AGENT DESCRIPTIONS
// ============================================================================

export const AGENT_DESCRIPTIONS: Record<AgentRole, string> = {
    orchestrator:
        'Central coordinator that analyzes requests, creates execution plans, ' +
        'and delegates tasks to specialist agents. Maintains workflow state and synthesizes results.',

    'content-strategist':
        'Develops comprehensive content strategies including themes, posting cadence, ' +
        'and long-term content calendars optimized for X algorithm.',

    'tweet-optimizer':
        'Expert in X algorithm engagement scoring. Optimizes tweet structure, ' +
        'hooks, and formatting for maximum reach and engagement.',

    'engagement-analyst':
        'Analyzes performance metrics, identifies trends, and provides actionable ' +
        'insights for improving content engagement.',

    'audience-scout':
        'Researches target audiences, identifies influencers, and discovers ' +
        'engagement opportunities within the crypto/finance niche.',

    'voice-calibrator':
        'Ensures brand voice consistency across all content. Reviews and adjusts ' +
        'tone, style, and messaging alignment.',

    'schedule-commander':
        'Determines optimal posting times based on audience activity, timezone data, ' +
        'and historical engagement patterns.',
};

// ============================================================================
// AGENT CONFIG BUILDER
// ============================================================================

export interface AgentConfigOptions {
    id?: string;
    model?: ModelType;
    temperature?: number;
    maxTokens?: number;
    retryConfig?: Partial<RetryConfig>;
    tools?: ToolDefinition[];
    systemPrompt?: string;
}

export function createAgentConfig(
    role: AgentRole,
    options: AgentConfigOptions = {}
): AgentConfig {
    const id = options.id || `agent-${role}-${Date.now()}`;
    const model = options.model || AGENT_MODEL_ASSIGNMENTS[role];

    return {
        id,
        role,
        name: formatAgentName(role),
        description: AGENT_DESCRIPTIONS[role],
        model,
        systemPrompt: options.systemPrompt || '',
        tools: options.tools || [],
        temperature: options.temperature ?? DEFAULT_AGENT_SETTINGS.temperature,
        maxTokens: options.maxTokens ?? DEFAULT_AGENT_SETTINGS.maxTokens,
        retryConfig: {
            ...DEFAULT_AGENT_SETTINGS.retryConfig,
            ...options.retryConfig,
        },
    };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function formatAgentName(role: AgentRole): string {
    return role
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export function getAgentEmoji(role: AgentRole): string {
    const emojis: Record<AgentRole, string> = {
        orchestrator: '🎛️',
        'content-strategist': '📊',
        'tweet-optimizer': '✍️',
        'engagement-analyst': '📈',
        'audience-scout': '👥',
        'voice-calibrator': '🎭',
        'schedule-commander': '⏰',
    };
    return emojis[role];
}

export function getAgentColor(role: AgentRole): string {
    const colors: Record<AgentRole, string> = {
        orchestrator: '#8B5CF6',
        'content-strategist': '#10B981',
        'tweet-optimizer': '#F59E0B',
        'engagement-analyst': '#3B82F6',
        'audience-scout': '#EC4899',
        'voice-calibrator': '#14B8A6',
        'schedule-commander': '#F97316',
    };
    return colors[role];
}

// ============================================================================
// VALIDATION
// ============================================================================

export function validateAgentConfig(config: AgentConfig): string[] {
    const errors: string[] = [];

    if (!config.id || config.id.trim() === '') {
        errors.push('Agent ID is required');
    }

    if (!config.role) {
        errors.push('Agent role is required');
    }

    if (!config.systemPrompt || config.systemPrompt.trim() === '') {
        errors.push('System prompt is required');
    }

    if (config.temperature < 0 || config.temperature > 2) {
        errors.push('Temperature must be between 0 and 2');
    }

    if (config.maxTokens < 1 || config.maxTokens > 200000) {
        errors.push('Max tokens must be between 1 and 200000');
    }

    if (config.retryConfig.maxAttempts < 1) {
        errors.push('Max retry attempts must be at least 1');
    }

    return errors;
}
