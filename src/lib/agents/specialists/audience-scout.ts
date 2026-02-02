/**
 * CryptoAgentHQ - Audience Scout Agent
 * @module lib/agents/specialists/audience-scout
 */

import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent } from '../core/base-agent';
import type { AgentInput, AgentOutput, TokenUsage, ToolCall, ToolResult } from '../core/types';
import { MODELS } from '../core/types';
import { createAgentConfig } from '../core/agent-config';
import { getKnowledgeBase } from '../../rag/knowledge-base';

const AUDIENCE_SCOUT_SYSTEM_PROMPT = `You are the Audience Scout Agent for CryptoAgentHQ - an expert in target audience research and community analysis.

## Your Role
You research and identify:
1. Target audience demographics and interests
2. Influential accounts to engage with
3. Community trends and sentiment
4. Engagement opportunities

## Research Areas
- **Demographics**: Age, location, interests, expertise level
- **Influencers**: Key accounts in the niche, their content style
- **Communities**: Active groups, hashtags, spaces
- **Trends**: What topics are gaining traction

## Analysis Output
1. **Audience Profile**: Who they are
2. **Key Influencers**: Top 10-20 accounts to watch
3. **Engagement Opportunities**: Where to participate
4. **Content Gaps**: Underserved topics

Be specific and actionable in recommendations.`;

export class AudienceScoutAgent extends BaseAgent {
    private knowledgeBase = getKnowledgeBase();

    constructor(client?: Anthropic) {
        const config = createAgentConfig('audience-scout', {
            model: MODELS.SONNET,
            systemPrompt: AUDIENCE_SCOUT_SYSTEM_PROMPT,
            temperature: 0.7,
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
            id: `audience-scout-${Date.now()}`,
            agentId: this.id,
            role: this.role,
            content: raw.content,
            toolCalls: raw.toolCalls,
            usage: raw.usage,
            timestamp: new Date(),
        };
    }
}

export function createAudienceScoutAgent(client?: Anthropic): AudienceScoutAgent {
    return new AudienceScoutAgent(client);
}
