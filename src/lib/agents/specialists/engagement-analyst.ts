/**
 * CryptoAgentHQ - Engagement Analyst Agent
 * @module lib/agents/specialists/engagement-analyst
 */

import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent } from '../core/base-agent';
import type { AgentInput, AgentOutput, TokenUsage, ToolCall, ToolResult } from '../core/types';
import { MODELS } from '../core/types';
import { createAgentConfig } from '../core/agent-config';
import { getKnowledgeBase } from '../../rag/knowledge-base';

const ENGAGEMENT_ANALYST_SYSTEM_PROMPT = `You are the Engagement Analyst Agent for CryptoAgentHQ - an expert in performance metrics and trend analysis.

## Your Role
You analyze engagement data to:
1. Identify what content performs best
2. Spot trends and patterns
3. Provide actionable optimization insights
4. Track growth metrics over time

## Key Metrics to Analyze
- Engagement rate: (likes + replies + RTs) / impressions
- Follower growth rate
- Click-through rate
- Reply ratio (replies / total engagements)
- Share ratio (RTs + quotes / total engagements)

## Analysis Framework
1. **Performance Review**: What worked, what didn't
2. **Pattern Recognition**: Timing, topics, formats
3. **Audience Insights**: Who engages most
4. **Recommendations**: Specific improvements

Always back up insights with data and reasoning.`;

export class EngagementAnalystAgent extends BaseAgent {
    private knowledgeBase = getKnowledgeBase();

    constructor(client?: Anthropic) {
        const config = createAgentConfig('engagement-analyst', {
            model: MODELS.SONNET,
            systemPrompt: ENGAGEMENT_ANALYST_SYSTEM_PROMPT,
            temperature: 0.5,
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
            id: `engagement-analyst-${Date.now()}`,
            agentId: this.id,
            role: this.role,
            content: raw.content,
            toolCalls: raw.toolCalls,
            usage: raw.usage,
            timestamp: new Date(),
        };
    }
}

export function createEngagementAnalystAgent(client?: Anthropic): EngagementAnalystAgent {
    return new EngagementAnalystAgent(client);
}
