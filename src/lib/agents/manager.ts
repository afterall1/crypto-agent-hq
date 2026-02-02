/**
 * CryptoAgentHQ - Agent Manager
 * @module lib/agents/manager
 * 
 * Central manager for all agent instances.
 * Konsey Değerlendirmesi: Production DevOps ⭐⭐⭐⭐⭐
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AgentRole, AgentOutput, AgentInput } from './core/types';
import type { BaseAgent } from './core/base-agent';
import { OrchestratorAgent, createOrchestratorAgent } from './orchestrator';
import {
    createTweetOptimizerAgent,
    createContentStrategistAgent,
    createEngagementAnalystAgent,
    createAudienceScoutAgent,
    createVoiceCalibratorAgent,
    createScheduleCommanderAgent,
} from './specialists';

// ============================================================================
// AGENT MANAGER
// ============================================================================

export class AgentManager {
    private client: Anthropic;
    private orchestrator: OrchestratorAgent;
    private agents: Map<AgentRole, BaseAgent> = new Map();
    private initialized: boolean = false;

    constructor(apiKey?: string) {
        this.client = new Anthropic({
            apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
        });

        this.orchestrator = createOrchestratorAgent(this.client);
    }

    /**
     * Initialize all agents.
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        // Create all specialist agents
        const specialists = [
            createTweetOptimizerAgent(this.client),
            createContentStrategistAgent(this.client),
            createEngagementAnalystAgent(this.client),
            createAudienceScoutAgent(this.client),
            createVoiceCalibratorAgent(this.client),
            createScheduleCommanderAgent(this.client),
        ];

        // Register with manager and orchestrator
        for (const agent of specialists) {
            this.agents.set(agent.role, agent);
            this.orchestrator.registerSpecialist(agent);
        }

        // Add orchestrator to agents map
        this.agents.set('orchestrator', this.orchestrator);

        this.initialized = true;
        console.log(`[AgentManager] Initialized with ${this.agents.size} agents`);
    }

    /**
     * Get an agent by role.
     */
    getAgent(role: AgentRole): BaseAgent | undefined {
        return this.agents.get(role);
    }

    /**
     * Get the orchestrator.
     */
    getOrchestrator(): OrchestratorAgent {
        return this.orchestrator;
    }

    /**
     * Process a request through the orchestrator.
     */
    async process(input: AgentInput): Promise<AgentOutput> {
        if (!this.initialized) {
            await this.initialize();
        }

        return this.orchestrator.orchestrate(input);
    }

    /**
     * Process with streaming.
     */
    async processStream(
        input: AgentInput,
        onChunk: (chunk: { type: string; content?: string }) => void
    ): Promise<AgentOutput> {
        if (!this.initialized) {
            await this.initialize();
        }

        return this.orchestrator.processStream(input, onChunk);
    }

    /**
     * Direct access to a specialist (bypasses orchestrator).
     */
    async processWithAgent(role: AgentRole, input: AgentInput): Promise<AgentOutput> {
        if (!this.initialized) {
            await this.initialize();
        }

        const agent = this.agents.get(role);
        if (!agent) {
            throw new Error(`Agent not found: ${role}`);
        }

        return agent.process(input);
    }

    /**
     * Get all registered agent roles.
     */
    getAgentRoles(): AgentRole[] {
        return Array.from(this.agents.keys());
    }

    /**
     * Check if manager is initialized.
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Get agent stats.
     */
    getStats(): Record<string, unknown> {
        return {
            initialized: this.initialized,
            agentCount: this.agents.size,
            agents: Array.from(this.agents.entries()).map(([role, agent]) => ({
                role,
                id: agent.id,
                busy: agent.busy,
            })),
        };
    }
}

// ============================================================================
// SINGLETON
// ============================================================================

let globalManager: AgentManager | null = null;

export function getAgentManager(): AgentManager {
    if (!globalManager) {
        globalManager = new AgentManager();
    }
    return globalManager;
}

export function createAgentManager(apiKey?: string): AgentManager {
    return new AgentManager(apiKey);
}
