/**
 * CryptoAgentHQ - Anthropic Client
 * Claude API client configuration
 */

import Anthropic from '@anthropic-ai/sdk';

// Check for API key
if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('ANTHROPIC_API_KEY not found in environment variables');
}

// Create Anthropic client instance
export const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// Model configurations
export const MODELS = {
    // Opus for complex reasoning and orchestration
    OPUS: 'claude-opus-4-20250514',
    // Sonnet for most agent tasks (cost-effective)
    SONNET: 'claude-sonnet-4-20250514',
    // Haiku for quick, simple tasks
    HAIKU: 'claude-3-5-haiku-20241022',
} as const;

export type ModelType = (typeof MODELS)[keyof typeof MODELS];

// Default model settings
export const DEFAULT_SETTINGS = {
    temperature: 0.7,
    maxTokens: 4096,
    model: MODELS.SONNET,
};

// Agent-specific model assignments
export const AGENT_MODELS: Record<string, ModelType> = {
    orchestrator: MODELS.SONNET,
    'content-strategist': MODELS.SONNET,
    'tweet-optimizer': MODELS.SONNET,
    'engagement-analyst': MODELS.SONNET,
    'audience-scout': MODELS.SONNET,
    'voice-calibrator': MODELS.SONNET,
    'schedule-commander': MODELS.HAIKU,
};

/**
 * Send a message to Claude API
 */
export async function sendMessage({
    model = MODELS.SONNET,
    systemPrompt,
    messages,
    tools,
    maxTokens = DEFAULT_SETTINGS.maxTokens,
    temperature = DEFAULT_SETTINGS.temperature,
}: {
    model?: ModelType;
    systemPrompt: string;
    messages: Anthropic.Messages.MessageParam[];
    tools?: Anthropic.Messages.Tool[];
    maxTokens?: number;
    temperature?: number;
}) {
    try {
        const response = await anthropic.messages.create({
            model,
            max_tokens: maxTokens,
            temperature,
            system: systemPrompt,
            messages,
            tools,
        });

        return { success: true, data: response };
    } catch (error) {
        console.error('Anthropic API error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Stream a message from Claude API
 */
export async function streamMessage({
    model = MODELS.SONNET,
    systemPrompt,
    messages,
    tools,
    maxTokens = DEFAULT_SETTINGS.maxTokens,
    temperature = DEFAULT_SETTINGS.temperature,
    onChunk,
}: {
    model?: ModelType;
    systemPrompt: string;
    messages: Anthropic.Messages.MessageParam[];
    tools?: Anthropic.Messages.Tool[];
    maxTokens?: number;
    temperature?: number;
    onChunk: (chunk: string) => void;
}) {
    try {
        const stream = await anthropic.messages.stream({
            model,
            max_tokens: maxTokens,
            temperature,
            system: systemPrompt,
            messages,
            tools,
        });

        for await (const event of stream) {
            if (
                event.type === 'content_block_delta' &&
                event.delta.type === 'text_delta'
            ) {
                onChunk(event.delta.text);
            }
        }

        const finalMessage = await stream.finalMessage();
        return { success: true, data: finalMessage };
    } catch (error) {
        console.error('Anthropic streaming error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
