/**
 * CryptoAgentHQ - Content Strategist Agent
 * @module lib/agents/specialists/content-strategist
 * 
 * Long-term content planning and strategy.
 * Konsey Değerlendirmesi: Prompt Engineer ⭐⭐⭐⭐⭐
 */

import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent } from '../core/base-agent';
import type {
    AgentInput,
    AgentOutput,
    TokenUsage,
    ToolCall,
    ToolResult,
} from '../core/types';
import { MODELS } from '../core/types';
import { createAgentConfig } from '../core/agent-config';
import { getKnowledgeBase } from '../../rag/knowledge-base';

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const CONTENT_STRATEGIST_SYSTEM_PROMPT = `You are the Content Strategist Agent for CryptoAgentHQ - a master of long-term content planning and strategic thinking.

## Your Role
You develop comprehensive content strategies that:
1. Build sustainable audience growth
2. Establish thought leadership
3. Maximize algorithm performance
4. Maintain brand consistency

## Strategic Frameworks

### Content Pillar Model
- **Educational (40%)**: Teach, explain, insights
- **Engagement (30%)**: Questions, polls, discussions
- **Personal (20%)**: Stories, behind-scenes
- **Promotional (10%)**: CTAs, products

### Theme Planning
Rotate themes weekly or bi-weekly:
- Week 1: Market Analysis
- Week 2: Project Deep Dives
- Week 3: Educational Series
- Week 4: Community Engagement

### Calendar Structure
Daily rhythm for consistency:
- Morning: Educational/Informational
- Midday: Engagement/Discussion
- Evening: Personal/Commentary
- Night: Thread (2-3x per week)

## Crypto-Specific Considerations
- Align content with market cycles
- Balance technical and accessible content
- Build credibility through accuracy
- Maintain neutrality when needed

## Response Format
When creating strategy, provide:
1. **Strategic Overview**: Goals and approach
2. **Content Calendar**: Weekly/monthly plan
3. **Theme Breakdown**: Topics and angles
4. **Success Metrics**: How to measure impact
5. **Risk Mitigation**: Avoid common pitfalls

Be specific, actionable, and data-driven.`;

// ============================================================================
// CONTENT STRATEGIST AGENT
// ============================================================================

export class ContentStrategistAgent extends BaseAgent {
    private knowledgeBase = getKnowledgeBase();

    constructor(client?: Anthropic) {
        const config = createAgentConfig('content-strategist', {
            model: MODELS.SONNET,
            systemPrompt: CONTENT_STRATEGIST_SYSTEM_PROMPT,
            temperature: 0.7,
            maxTokens: 4096,
        });

        super(config, client);
    }

    protected async preProcess(input: AgentInput): Promise<AgentInput> {
        const ragContext = this.knowledgeBase.buildContext(input.message, 1500);

        return {
            ...input,
            context: {
                ...input.context,
                ragKnowledge: ragContext,
            },
        };
    }

    protected async postProcess(raw: {
        content: string;
        toolCalls?: ToolCall[];
        toolResults?: ToolResult[];
        usage: TokenUsage;
    }): Promise<AgentOutput> {
        return {
            id: `content-strategist-${Date.now()}`,
            agentId: this.id,
            role: this.role,
            content: raw.content,
            toolCalls: raw.toolCalls,
            usage: raw.usage,
            timestamp: new Date(),
        };
    }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createContentStrategistAgent(client?: Anthropic): ContentStrategistAgent {
    return new ContentStrategistAgent(client);
}
