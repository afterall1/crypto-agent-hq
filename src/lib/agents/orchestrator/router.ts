/**
 * CryptoAgentHQ - Task Router
 * @module lib/agents/orchestrator/router
 * 
 * Routes tasks to appropriate specialist agents.
 * Konsey Değerlendirmesi: Multi-Agent Mimarı ⭐⭐⭐⭐⭐
 */

import type { AgentRole } from '../core/types';

// ============================================================================
// ROUTING RESULT
// ============================================================================

export interface RoutingResult {
    complexity: 'simple' | 'moderate' | 'complex';
    agents: AgentRole[];
    approach: string;
    steps: number;
    confidence: number;
}

// ============================================================================
// ROUTING RULES
// ============================================================================

interface RoutingRule {
    patterns: RegExp[];
    agents: AgentRole[];
    priority: number;
}

const ROUTING_RULES: RoutingRule[] = [
    // Content Strategy
    {
        patterns: [
            /content\s*(strategy|plan|calendar)/i,
            /what\s*should\s*i\s*(post|tweet)/i,
            /content\s*ideas/i,
            /theme/i,
            /pillar/i,
        ],
        agents: ['content-strategist'],
        priority: 1,
    },
    // Tweet Optimization
    {
        patterns: [
            /optimi[zs]e/i,
            /improve\s*(this\s*)?(tweet|post)/i,
            /make\s*(this\s*)?(better|viral)/i,
            /engagement\s*score/i,
            /algorithm/i,
            /rewrite/i,
        ],
        agents: ['tweet-optimizer'],
        priority: 1,
    },
    // Analytics
    {
        patterns: [
            /analytics/i,
            /performance/i,
            /metrics/i,
            /how\s*(did|is)\s*(my|the)/i,
            /stats/i,
            /report/i,
        ],
        agents: ['engagement-analyst'],
        priority: 1,
    },
    // Audience
    {
        patterns: [
            /audience/i,
            /follower/i,
            /target/i,
            /demographic/i,
            /who\s*(should|to)\s*(follow|engage)/i,
            /influencer/i,
        ],
        agents: ['audience-scout'],
        priority: 1,
    },
    // Voice & Brand
    {
        patterns: [
            /voice/i,
            /tone/i,
            /brand/i,
            /persona/i,
            /style/i,
            /consistent/i,
        ],
        agents: ['voice-calibrator'],
        priority: 1,
    },
    // Scheduling
    {
        patterns: [
            /schedule/i,
            /when\s*(to|should)/i,
            /best\s*time/i,
            /posting\s*time/i,
            /timezone/i,
        ],
        agents: ['schedule-commander'],
        priority: 1,
    },
    // Complex: Strategy + Optimization
    {
        patterns: [
            /complete\s*(content\s*)?strategy/i,
            /full\s*plan/i,
            /grow\s*(my\s*)?(account|following)/i,
        ],
        agents: ['content-strategist', 'tweet-optimizer', 'schedule-commander'],
        priority: 2,
    },
    // Complex: Analytics + Improvement
    {
        patterns: [
            /why\s*(is|isn't)\s*(my|the)/i,
            /analyze\s*and\s*(improve|fix)/i,
            /what's\s*wrong/i,
        ],
        agents: ['engagement-analyst', 'tweet-optimizer'],
        priority: 2,
    },
];

// ============================================================================
// TASK ROUTER CLASS
// ============================================================================

export class TaskRouter {
    private rules: RoutingRule[];

    constructor(customRules?: RoutingRule[]) {
        this.rules = customRules || ROUTING_RULES;
    }

    /**
     * Route a request to appropriate agents.
     */
    route(request: string): RoutingResult {
        const matches: Array<{ rule: RoutingRule; score: number }> = [];

        // Find matching rules
        for (const rule of this.rules) {
            const matchingPatterns = rule.patterns.filter(p => p.test(request));
            if (matchingPatterns.length > 0) {
                matches.push({
                    rule,
                    score: matchingPatterns.length * rule.priority,
                });
            }
        }

        // No matches - return orchestrator-only
        if (matches.length === 0) {
            return {
                complexity: 'simple',
                agents: ['orchestrator'],
                approach: 'Direct response without specialist delegation',
                steps: 1,
                confidence: 0.5,
            };
        }

        // Sort by score
        matches.sort((a, b) => b.score - a.score);

        // Get unique agents from top matches
        const agents = new Set<AgentRole>();
        let totalScore = 0;

        for (const match of matches.slice(0, 3)) {
            match.rule.agents.forEach(agent => agents.add(agent));
            totalScore += match.score;
        }

        const agentList = Array.from(agents);
        const complexity = this.determineComplexity(agentList.length, request);

        return {
            complexity,
            agents: agentList,
            approach: this.generateApproach(agentList),
            steps: this.estimateSteps(agentList, complexity),
            confidence: Math.min(0.95, 0.5 + (totalScore * 0.1)),
        };
    }

    /**
     * Check if a request requires multiple agents.
     */
    requiresMultipleAgents(request: string): boolean {
        const result = this.route(request);
        return result.agents.length > 1;
    }

    /**
     * Get the primary agent for a request.
     */
    getPrimaryAgent(request: string): AgentRole {
        const result = this.route(request);
        return result.agents[0] || 'orchestrator';
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    private determineComplexity(agentCount: number, request: string): 'simple' | 'moderate' | 'complex' {
        // Word count check
        const wordCount = request.split(/\s+/).length;

        if (agentCount >= 3 || wordCount > 50) {
            return 'complex';
        }

        if (agentCount === 2 || wordCount > 20) {
            return 'moderate';
        }

        return 'simple';
    }

    private generateApproach(agents: AgentRole[]): string {
        if (agents.length === 1) {
            return `Delegate to ${agents[0]} for specialized handling`;
        }

        const agentNames = agents.map(a => a.replace(/-/g, ' ')).join(', ');
        return `Multi-agent collaboration: ${agentNames}. Results will be synthesized.`;
    }

    private estimateSteps(agents: AgentRole[], complexity: string): number {
        const baseSteps = agents.length;

        switch (complexity) {
            case 'complex':
                return baseSteps + 2; // Additional synthesis and review
            case 'moderate':
                return baseSteps + 1;
            default:
                return baseSteps;
        }
    }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultRouter: TaskRouter | null = null;

export function getTaskRouter(): TaskRouter {
    if (!defaultRouter) {
        defaultRouter = new TaskRouter();
    }
    return defaultRouter;
}
