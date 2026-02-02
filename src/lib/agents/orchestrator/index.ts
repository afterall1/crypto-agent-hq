/**
 * CryptoAgentHQ - Orchestrator Agent
 * @module lib/agents/orchestrator/index
 * 
 * Central coordinator that manages workflow and delegates to specialists.
 * Konsey Değerlendirmesi: Multi-Agent Mimarı ⭐⭐⭐⭐⭐
 */

import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent } from '../core/base-agent';
import type {
    AgentConfig,
    AgentRole,
    AgentInput,
    AgentOutput,
    AgentTask,
    DelegationRequest,
    WorkflowState,
    TokenUsage,
    ToolCall,
    ToolResult,
} from '../core/types';
import { MODELS } from '../core/types';
import { createAgentConfig } from '../core/agent-config';
import { TaskRouter } from './router';
import { TaskDelegator } from './delegator';
import { WorkflowStateManager } from './state-manager';

// ============================================================================
// ORCHESTRATOR SYSTEM PROMPT
// ============================================================================

const ORCHESTRATOR_SYSTEM_PROMPT = `You are the Orchestrator Agent for CryptoAgentHQ - a sophisticated multi-agent system designed to manage and optimize cryptocurrency-focused Twitter/X accounts.

## Your Role
You are the central coordinator responsible for:
1. Analyzing user requests and breaking them into actionable tasks
2. Delegating tasks to the appropriate specialist agents
3. Synthesizing results from multiple agents into coherent responses
4. Managing workflow state and ensuring task completion

## Your Team (Specialist Agents)

| Agent | Role | When to Delegate |
|-------|------|------------------|
| Content Strategist | Long-term content planning, themes, calendars | Strategy requests, content planning |
| Tweet Optimizer | X algorithm optimization, engagement scoring | Tweet drafts, optimization requests |
| Engagement Analyst | Performance metrics, trend analysis | Analytics questions, performance reviews |
| Audience Scout | Target audience research, influencer identification | Audience questions, growth strategies |
| Voice Calibrator | Brand voice consistency, tone adjustment | Voice reviews, persona questions |
| Schedule Commander | Optimal posting times, timezone optimization | Scheduling questions, timing requests |

## Delegation Rules
1. For simple queries, respond directly without delegation
2. For complex requests, create a plan and delegate subtasks
3. Always synthesize specialist responses into a unified answer
4. If multiple specialists are needed, coordinate their work
5. Track task status and report back to the user

## X Algorithm Knowledge
You have deep knowledge of the X/Twitter algorithm:
- Engagement types: Replies (1x), Retweets (8x), Likes (0.5x)
- Optimal tweet length: 71-100 characters for max engagement
- Best posting times: 8-10 AM, 12-1 PM based on audience timezone
- Content pillars: Educational (40%), Engagement (30%), Personal (20%), Promotional (10%)

## Response Format
When responding, structure your output as:
1. Analysis of the request
2. Execution plan (if delegation needed)
3. Synthesized results
4. Recommendations

Always be concise, actionable, and focused on maximizing X algorithm performance.`;

import type { ToolDefinition } from '../core/types';

const ORCHESTRATOR_TOOLS: ToolDefinition[] = [
    {
        name: 'delegate_task',
        description: 'Delegate a task to a specialist agent. Use this when a request requires specialized expertise.',
        parameters: {
            type: 'object',
            properties: {
                agent: {
                    type: 'string' as const,
                    description: 'The specialist agent to delegate to',
                    enum: [
                        'content-strategist',
                        'tweet-optimizer',
                        'engagement-analyst',
                        'audience-scout',
                        'voice-calibrator',
                        'schedule-commander',
                    ],
                },
                task: {
                    type: 'string' as const,
                    description: 'Clear description of what the agent should do',
                },
                context: {
                    type: 'string' as const,
                    description: 'Relevant context for the specialist',
                },
                priority: {
                    type: 'string' as const,
                    description: 'Task priority level',
                    enum: ['low', 'medium', 'high', 'critical'],
                },
            },
            required: ['agent', 'task'],
        },
    },
    {
        name: 'analyze_request',
        description: 'Analyze a user request to determine the best approach and required agents.',
        parameters: {
            type: 'object',
            properties: {
                request: {
                    type: 'string' as const,
                    description: 'The user request to analyze',
                },
            },
            required: ['request'],
        },
    },
    {
        name: 'create_workflow',
        description: 'Create a multi-step workflow for complex requests.',
        parameters: {
            type: 'object',
            properties: {
                name: {
                    type: 'string' as const,
                    description: 'Name of the workflow',
                },
                steps: {
                    type: 'array' as const,
                    description: 'Array of workflow steps',
                    items: {
                        type: 'object' as const,
                        description: 'Workflow step',
                        properties: {
                            agent: { type: 'string' as const, description: 'Agent role' },
                            task: { type: 'string' as const, description: 'Task description' },
                            dependsOn: { type: 'array' as const, description: 'Dependencies', items: { type: 'string' as const, description: 'Dependency ID' } },
                        },
                    },
                },
            },
            required: ['name', 'steps'],
        },
    },
];

// ============================================================================
// ORCHESTRATOR AGENT CLASS
// ============================================================================

export class OrchestratorAgent extends BaseAgent {
    private router: TaskRouter;
    private delegator: TaskDelegator;
    private stateManager: WorkflowStateManager;
    private specialists: Map<AgentRole, BaseAgent> = new Map();

    constructor(client?: Anthropic) {
        const config = createAgentConfig('orchestrator', {
            model: MODELS.SONNET,
            systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
            tools: ORCHESTRATOR_TOOLS,
            temperature: 0.7,
            maxTokens: 4096,
        });

        super(config, client);

        this.router = new TaskRouter();
        this.delegator = new TaskDelegator();
        this.stateManager = new WorkflowStateManager();
    }

    // ============================================================================
    // PUBLIC API
    // ============================================================================

    /**
     * Register a specialist agent.
     */
    registerSpecialist(agent: BaseAgent): void {
        this.specialists.set(agent.role, agent);
        this.delegator.registerAgent(agent);
    }

    /**
     * Get registered specialists.
     */
    getSpecialists(): AgentRole[] {
        return Array.from(this.specialists.keys());
    }

    /**
     * Orchestrate a complex request.
     */
    async orchestrate(input: AgentInput): Promise<AgentOutput> {
        // Create workflow state
        const workflowId = `workflow-${Date.now()}`;
        this.stateManager.create(workflowId);

        try {
            // Process through base agent (which may trigger delegations)
            const output = await this.process(input);

            // Complete workflow
            this.stateManager.complete(workflowId);

            return output;
        } catch (error) {
            this.stateManager.fail(workflowId, error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    /**
     * Get current workflow state.
     */
    getWorkflowState(workflowId: string): WorkflowState | undefined {
        return this.stateManager.get(workflowId);
    }

    // ============================================================================
    // ABSTRACT METHOD IMPLEMENTATIONS
    // ============================================================================

    protected async preProcess(input: AgentInput): Promise<AgentInput> {
        // Add orchestration context
        const context = {
            ...input.context,
            availableAgents: this.getSpecialists(),
            timestamp: new Date().toISOString(),
        };

        return {
            ...input,
            context,
        };
    }

    protected async postProcess(raw: {
        content: string;
        toolCalls?: ToolCall[];
        toolResults?: ToolResult[];
        usage: TokenUsage;
    }): Promise<AgentOutput> {
        // Process any delegation results
        let finalContent = raw.content;

        if (raw.toolResults && raw.toolResults.length > 0) {
            // Synthesize delegation results into the response
            const delegationResults = raw.toolResults
                .filter(r => r.success && r.data)
                .map(r => r.data);

            if (delegationResults.length > 0) {
                finalContent += '\n\n## Specialist Results\n';
                delegationResults.forEach((result, index) => {
                    if (typeof result === 'object' && result !== null) {
                        const resultObj = result as { agent?: string; response?: string };
                        finalContent += `\n### ${resultObj.agent || `Result ${index + 1}`}\n`;
                        finalContent += resultObj.response || JSON.stringify(result);
                    }
                });
            }
        }

        return {
            id: `orchestrator-${Date.now()}`,
            agentId: this.id,
            role: this.role,
            content: finalContent,
            toolCalls: raw.toolCalls,
            usage: raw.usage,
            timestamp: new Date(),
            metadata: {
                delegations: raw.toolCalls?.filter(tc => tc.name === 'delegate_task').length || 0,
            },
        };
    }

    // ============================================================================
    // TOOL HANDLERS
    // ============================================================================

    /**
     * Handle delegation tool calls.
     */
    protected async executeTool(toolCall: ToolCall): Promise<ToolResult> {
        switch (toolCall.name) {
            case 'delegate_task':
                return this.handleDelegation(toolCall.arguments as {
                    agent: AgentRole;
                    task: string;
                    context?: string;
                    priority?: string;
                });

            case 'analyze_request':
                return this.handleAnalysis(toolCall.arguments as {
                    request: string;
                });

            case 'create_workflow':
                return this.handleWorkflowCreation(toolCall.arguments as {
                    name: string;
                    steps: Array<{ agent: string; task: string; dependsOn?: string[] }>;
                });

            default:
                return super.executeTool(toolCall);
        }
    }

    private async handleDelegation(args: {
        agent: AgentRole;
        task: string;
        context?: string;
        priority?: string;
    }): Promise<ToolResult> {
        const specialist = this.specialists.get(args.agent);

        if (!specialist) {
            return {
                success: false,
                error: `Specialist agent not found: ${args.agent}`,
            };
        }

        try {
            const response = await this.delegator.delegate({
                fromAgent: this.role,
                toAgent: args.agent,
                task: {
                    id: `task-${Date.now()}`,
                    type: 'delegation',
                    status: 'pending',
                    priority: (args.priority as 'low' | 'medium' | 'high' | 'critical') || 'medium',
                    assignedAgent: args.agent,
                    input: {
                        task: args.task,
                        context: args.context,
                    },
                    createdAt: new Date(),
                },
                context: args.context || '',
                priority: (args.priority as 'low' | 'medium' | 'high' | 'critical') || 'medium',
            });

            this.emit('delegation:completed', {
                agent: args.agent,
                task: args.task,
                success: true,
            });

            return {
                success: true,
                data: {
                    agent: args.agent,
                    response: response.content,
                },
            };
        } catch (error) {
            this.emit('delegation:completed', {
                agent: args.agent,
                task: args.task,
                success: false,
                error,
            });

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    private async handleAnalysis(args: { request: string }): Promise<ToolResult> {
        // Route the request to determine required agents
        const routing = this.router.route(args.request);

        return {
            success: true,
            data: {
                complexity: routing.complexity,
                suggestedAgents: routing.agents,
                approach: routing.approach,
                estimatedSteps: routing.steps,
            },
        };
    }

    private async handleWorkflowCreation(args: {
        name: string;
        steps: Array<{ agent: string; task: string; dependsOn?: string[] }>;
    }): Promise<ToolResult> {
        const workflowId = `workflow-${args.name}-${Date.now()}`;

        this.stateManager.create(workflowId);

        // Add tasks to workflow
        args.steps.forEach((step, index) => {
            const task: AgentTask = {
                id: `${workflowId}-step-${index}`,
                type: 'workflow-step',
                status: 'pending',
                priority: 'medium',
                assignedAgent: step.agent as AgentRole,
                input: { task: step.task },
                createdAt: new Date(),
                parentTaskId: workflowId,
            };

            this.stateManager.addTask(workflowId, task);
        });

        return {
            success: true,
            data: {
                workflowId,
                name: args.name,
                steps: args.steps.length,
                status: 'created',
            },
        };
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createOrchestratorAgent(client?: Anthropic): OrchestratorAgent {
    return new OrchestratorAgent(client);
}
