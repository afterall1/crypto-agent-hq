/**
 * CryptoAgentHQ - Tweet Optimizer Agent
 * @module lib/agents/specialists/tweet-optimizer
 * 
 * X Algorithm optimization specialist.
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

const TWEET_OPTIMIZER_SYSTEM_PROMPT = `You are the Tweet Optimizer Agent for CryptoAgentHQ - an expert in the X/Twitter algorithm and engagement optimization.

## Your Expertise
You specialize in:
1. Optimizing tweet structure for maximum algorithm performance
2. Crafting scroll-stopping hooks
3. Analyzing engagement potential
4. Rewriting content for better reach

## X Algorithm Deep Knowledge

### Engagement Weights
- Replies: 1x (drives conversation)
- Retweets: 8x (sharing signal)
- Likes: 0.5x (passive)
- Follows from tweet: 10x (strongest)
- Bookmarks: 3x (private value signal)

### Optimal Tweet Structure
1. **Hook (first 7-10 words)**: Must stop the scroll
2. **Body (if needed)**: Clear, punchy, value-packed
3. **CTA**: Encourage specific action
4. **Length**: 71-100 chars for max engagement

### High-Performing Patterns
- "How I [achieved X] in [timeframe]:"
- "Unpopular opinion: [contrarian take]"
- "Stop [common mistake]. Start [better approach]."
- "[Number] things about [topic] you didn't know:"
- "The difference between [A] and [B]:"

### Negative Signals to Avoid
- External links in main tweet (reduces reach 20-50%)
- More than 2 hashtags (spam signal)
- Engagement bait phrases ("Like if you agree")
- Excessive punctuation/caps

## Response Format
When optimizing a tweet, provide:
1. **Original Analysis**: Strengths and weaknesses
2. **Optimized Version(s)**: 2-3 alternatives
3. **Engagement Score**: 1-10 rating with reasoning
4. **Algorithm Alignment**: Specific improvements made

Always explain WHY changes improve algorithm performance.`;

// ============================================================================
// TWEET OPTIMIZER AGENT
// ============================================================================

export class TweetOptimizerAgent extends BaseAgent {
    private knowledgeBase = getKnowledgeBase();

    constructor(client?: Anthropic) {
        const config = createAgentConfig('tweet-optimizer', {
            model: MODELS.SONNET,
            systemPrompt: TWEET_OPTIMIZER_SYSTEM_PROMPT,
            temperature: 0.8,
            maxTokens: 2048,
        });

        super(config, client);
    }

    protected async preProcess(input: AgentInput): Promise<AgentInput> {
        // Add RAG context
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
            id: `tweet-optimizer-${Date.now()}`,
            agentId: this.id,
            role: this.role,
            content: raw.content,
            toolCalls: raw.toolCalls,
            usage: raw.usage,
            timestamp: new Date(),
        };
    }

    /**
     * Score a tweet's engagement potential.
     */
    scoreTweet(tweet: string): {
        score: number;
        breakdown: Record<string, number>;
        suggestions: string[];
    } {
        const suggestions: string[] = [];
        const breakdown: Record<string, number> = {};

        // Length score
        const length = tweet.length;
        if (length >= 71 && length <= 100) {
            breakdown.length = 10;
        } else if (length < 50) {
            breakdown.length = 5;
            suggestions.push('Consider expanding for more context');
        } else if (length > 200) {
            breakdown.length = 6;
            suggestions.push('Consider shortening for better engagement');
        } else {
            breakdown.length = 7;
        }

        // Hook quality
        const firstWords = tweet.split(' ').slice(0, 7).join(' ');
        const hasStrongHook = /^(how|why|stop|never|the secret|unpopular|controversial)/i.test(firstWords);
        breakdown.hook = hasStrongHook ? 9 : 5;
        if (!hasStrongHook) {
            suggestions.push('Start with a stronger hook to stop the scroll');
        }

        // Hashtag check
        const hashtagCount = (tweet.match(/#\w+/g) || []).length;
        if (hashtagCount === 0) {
            breakdown.hashtags = 8;
        } else if (hashtagCount <= 2) {
            breakdown.hashtags = 10;
        } else {
            breakdown.hashtags = 4;
            suggestions.push('Reduce hashtags to 2 or fewer');
        }

        // Link check
        const hasLink = /https?:\/\//.test(tweet);
        breakdown.links = hasLink ? 3 : 10;
        if (hasLink) {
            suggestions.push('Move links to reply for better reach');
        }

        // Emoji usage
        const emojiCount = (tweet.match(/[\u{1F600}-\u{1F6FF}]/gu) || []).length;
        if (emojiCount >= 1 && emojiCount <= 3) {
            breakdown.emoji = 9;
        } else if (emojiCount === 0) {
            breakdown.emoji = 6;
            suggestions.push('Add 1-2 strategic emojis');
        } else {
            breakdown.emoji = 4;
            suggestions.push('Reduce emoji count');
        }

        // Calculate final score
        const weights = { length: 0.2, hook: 0.3, hashtags: 0.15, links: 0.2, emoji: 0.15 };
        const score = Object.entries(breakdown).reduce((sum, [key, val]) => {
            return sum + val * (weights[key as keyof typeof weights] || 0.1);
        }, 0);

        return {
            score: Math.round(score * 10) / 10,
            breakdown,
            suggestions,
        };
    }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createTweetOptimizerAgent(client?: Anthropic): TweetOptimizerAgent {
    return new TweetOptimizerAgent(client);
}
