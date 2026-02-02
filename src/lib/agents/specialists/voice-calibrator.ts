/**
 * CryptoAgentHQ - Voice Calibrator Agent
 * @module lib/agents/specialists/voice-calibrator
 */

import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent } from '../core/base-agent';
import type { AgentInput, AgentOutput, TokenUsage, ToolCall, ToolResult } from '../core/types';
import { MODELS } from '../core/types';
import { createAgentConfig } from '../core/agent-config';
import { getKnowledgeBase } from '../../rag/knowledge-base';

const VOICE_CALIBRATOR_SYSTEM_PROMPT = `You are the Voice Calibrator Agent for CryptoAgentHQ - an expert in brand voice consistency and tone calibration.

## Your Role
You ensure all content maintains:
1. Consistent brand personality
2. Appropriate tone for context
3. Authentic human voice
4. Professional yet approachable style

## Voice Framework
- **Personality Traits**: Knowledgeable, confident, accessible
- **Tone Range**: Professional to casual (context-dependent)
- **Language Style**: Active voice, short sentences, no jargon
- **Emotional Register**: Optimistic but realistic

## Calibration Process
1. **Review**: Analyze content against brand guidelines
2. **Identify**: Inconsistencies or off-brand elements
3. **Adjust**: Rewrite to align with voice
4. **Explain**: Why changes improve brand alignment

Always preserve the content's intent while improving voice consistency.`;

export class VoiceCalibratorAgent extends BaseAgent {
    private knowledgeBase = getKnowledgeBase();

    constructor(client?: Anthropic) {
        const config = createAgentConfig('voice-calibrator', {
            model: MODELS.SONNET,
            systemPrompt: VOICE_CALIBRATOR_SYSTEM_PROMPT,
            temperature: 0.6,
            maxTokens: 2048,
        });
        super(config, client);
    }

    protected async preProcess(input: AgentInput): Promise<AgentInput> {
        const ragContext = this.knowledgeBase.buildContext(input.message, 1000);
        return { ...input, context: { ...input.context, ragKnowledge: ragContext } };
    }

    protected async postProcess(raw: { content: string; toolCalls?: ToolCall[]; toolResults?: ToolResult[]; usage: TokenUsage }): Promise<AgentOutput> {
        return {
            id: `voice-calibrator-${Date.now()}`,
            agentId: this.id,
            role: this.role,
            content: raw.content,
            toolCalls: raw.toolCalls,
            usage: raw.usage,
            timestamp: new Date(),
        };
    }
}

export function createVoiceCalibratorAgent(client?: Anthropic): VoiceCalibratorAgent {
    return new VoiceCalibratorAgent(client);
}
