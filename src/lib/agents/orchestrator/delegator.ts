/**
 * CryptoAgentHQ - Task Delegator
 * @module lib/agents/orchestrator/delegator
 * 
 * Handles delegation from orchestrator to specialist agents.
 * Konsey Değerlendirmesi: Multi-Agent Mimarı ⭐⭐⭐⭐⭐
 */

import type { BaseAgent } from '../core/base-agent';
import type { AgentRole, AgentInput, AgentOutput, DelegationRequest } from '../core/types';
import { DelegationError } from '../../errors/handler';

// ============================================================================
// DELEGATOR CLASS
// ============================================================================

export class TaskDelegator {
    private agents: Map<AgentRole, BaseAgent> = new Map();
    private pendingDelegations: Map<string, DelegationRequest> = new Map();
    private delegationHistory: Array<{
        request: DelegationRequest;
        result: AgentOutput | null;
        error?: string;
        timestamp: Date;
    }> = [];

    /**
     * Register an agent for delegation.
     */
    registerAgent(agent: BaseAgent): void {
        this.agents.set(agent.role, agent);
    }

    /**
     * Unregister an agent.
     */
    unregisterAgent(role: AgentRole): void {
        this.agents.delete(role);
    }

    /**
     * Get all registered agents.
     */
    getRegisteredAgents(): AgentRole[] {
        return Array.from(this.agents.keys());
    }

    /**
     * Check if an agent is available for delegation.
     */
    isAvailable(role: AgentRole): boolean {
        const agent = this.agents.get(role);
        return agent !== undefined && !agent.busy;
    }

    /**
     * Delegate a task to a specialist agent.
     */
    async delegate(request: DelegationRequest): Promise<AgentOutput> {
        const { toAgent, task, context } = request;
        const delegationId = `delegation-${Date.now()}`;

        // Check if agent exists
        const agent = this.agents.get(toAgent);
        if (!agent) {
            throw new DelegationError(
                `Agent not found: ${toAgent}`,
                task.id,
                request.fromAgent,
                toAgent
            );
        }

        // Check if agent is busy
        if (agent.busy) {
            throw new DelegationError(
                `Agent is busy: ${toAgent}`,
                task.id,
                request.fromAgent,
                toAgent
            );
        }

        // Store pending delegation
        this.pendingDelegations.set(delegationId, request);

        try {
            // Create agent input
            const input: AgentInput = {
                sessionId: `session-${delegationId}`,
                userId: 'orchestrator',
                message: this.formatTaskMessage(task.input as { task: string; context?: string }),
                context: {
                    delegatedFrom: request.fromAgent,
                    priority: request.priority,
                    originalContext: context,
                },
            };

            // Execute delegation
            const result = await agent.process(input);

            // Record success
            this.recordDelegation(request, result);

            return result;

        } catch (error) {
            // Record failure
            this.recordDelegation(request, null, error instanceof Error ? error.message : String(error));

            throw new DelegationError(
                error instanceof Error ? error.message : String(error),
                task.id,
                request.fromAgent,
                toAgent
            );

        } finally {
            this.pendingDelegations.delete(delegationId);
        }
    }

    /**
     * Delegate to multiple agents in parallel.
     */
    async delegateParallel(requests: DelegationRequest[]): Promise<Map<AgentRole, AgentOutput | Error>> {
        const results = new Map<AgentRole, AgentOutput | Error>();

        await Promise.all(
            requests.map(async request => {
                try {
                    const result = await this.delegate(request);
                    results.set(request.toAgent, result);
                } catch (error) {
                    results.set(request.toAgent, error instanceof Error ? error : new Error(String(error)));
                }
            })
        );

        return results;
    }

    /**
     * Delegate to multiple agents sequentially.
     */
    async delegateSequential(requests: DelegationRequest[]): Promise<Map<AgentRole, AgentOutput>> {
        const results = new Map<AgentRole, AgentOutput>();

        for (const request of requests) {
            const result = await this.delegate(request);
            results.set(request.toAgent, result);
        }

        return results;
    }

    /**
     * Get delegation history.
     */
    getHistory(limit?: number): typeof this.delegationHistory {
        const history = [...this.delegationHistory].reverse();
        return limit ? history.slice(0, limit) : history;
    }

    /**
     * Get pending delegations.
     */
    getPending(): DelegationRequest[] {
        return Array.from(this.pendingDelegations.values());
    }

    /**
     * Clear delegation history.
     */
    clearHistory(): void {
        this.delegationHistory = [];
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    private formatTaskMessage(input: { task: string; context?: string }): string {
        let message = input.task;

        if (input.context) {
            message = `Context: ${input.context}\n\nTask: ${input.task}`;
        }

        return message;
    }

    private recordDelegation(
        request: DelegationRequest,
        result: AgentOutput | null,
        error?: string
    ): void {
        this.delegationHistory.push({
            request,
            result,
            error,
            timestamp: new Date(),
        });

        // Limit history size
        if (this.delegationHistory.length > 100) {
            this.delegationHistory = this.delegationHistory.slice(-100);
        }
    }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultDelegator: TaskDelegator | null = null;

export function getTaskDelegator(): TaskDelegator {
    if (!defaultDelegator) {
        defaultDelegator = new TaskDelegator();
    }
    return defaultDelegator;
}
