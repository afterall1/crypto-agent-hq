/**
 * CryptoAgentHQ - Schedule Commander Agent
 * @module lib/agents/specialists/schedule-commander
 */

import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent } from '../core/base-agent';
import type { AgentInput, AgentOutput, TokenUsage, ToolCall, ToolResult } from '../core/types';
import { MODELS } from '../core/types';
import { createAgentConfig } from '../core/agent-config';
import { getKnowledgeBase } from '../../rag/knowledge-base';

const SCHEDULE_COMMANDER_SYSTEM_PROMPT = `You are the Schedule Commander Agent for CryptoAgentHQ - an expert in optimal posting times and schedule optimization.

## Your Role
You determine:
1. Best times to post for maximum reach
2. Optimal posting frequency
3. Schedule adjustments based on performance
4. Timezone optimization for global audiences

## Timing Framework
### Best Posting Windows (Audience TZ)
- Morning: 8-10 AM (commute)
- Lunch: 12-1 PM (break)
- Evening: 6-8 PM (wind-down)
- Night: 10-11 PM (before bed)

### Day Performance
- Tue-Thu: Highest engagement
- Mon: Professional content
- Fri: Lower engagement
- Weekend: Personal content

### Frequency Guidelines
- Minimum: 3 tweets/day
- Optimal: 5-7 tweets/day
- Threads: 2-3/week
- Max: 10 tweets/day (avoid spam signals)

Provide specific schedule recommendations with reasoning.`;

export class ScheduleCommanderAgent extends BaseAgent {
    private knowledgeBase = getKnowledgeBase();

    constructor(client?: Anthropic) {
        const config = createAgentConfig('schedule-commander', {
            model: MODELS.HAIKU, // Faster model for simple scheduling tasks
            systemPrompt: SCHEDULE_COMMANDER_SYSTEM_PROMPT,
            temperature: 0.3,
            maxTokens: 1024,
        });
        super(config, client);
    }

    protected async preProcess(input: AgentInput): Promise<AgentInput> {
        const ragContext = this.knowledgeBase.buildContext(input.message, 800);
        return { ...input, context: { ...input.context, ragKnowledge: ragContext } };
    }

    protected async postProcess(raw: { content: string; toolCalls?: ToolCall[]; toolResults?: ToolResult[]; usage: TokenUsage }): Promise<AgentOutput> {
        return {
            id: `schedule-commander-${Date.now()}`,
            agentId: this.id,
            role: this.role,
            content: raw.content,
            toolCalls: raw.toolCalls,
            usage: raw.usage,
            timestamp: new Date(),
        };
    }
}

export function createScheduleCommanderAgent(client?: Anthropic): ScheduleCommanderAgent {
    return new ScheduleCommanderAgent(client);
}
