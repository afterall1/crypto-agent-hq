/**
 * CryptoAgentHQ - Workflow State Manager
 * @module lib/agents/orchestrator/state-manager
 * 
 * Manages workflow execution state.
 * Konsey Değerlendirmesi: Multi-Agent Mimarı ⭐⭐⭐⭐⭐
 */

import type { WorkflowState, AgentTask, TaskStatus } from '../core/types';

// ============================================================================
// STATE MANAGER CLASS
// ============================================================================

export class WorkflowStateManager {
    private workflows: Map<string, WorkflowState> = new Map();

    /**
     * Create a new workflow.
     */
    create(id: string): WorkflowState {
        const workflow: WorkflowState = {
            id,
            status: 'running',
            currentPhase: 'initialization',
            tasks: [],
            context: {},
            startedAt: new Date(),
            updatedAt: new Date(),
        };

        this.workflows.set(id, workflow);
        return workflow;
    }

    /**
     * Get a workflow by ID.
     */
    get(id: string): WorkflowState | undefined {
        return this.workflows.get(id);
    }

    /**
     * Check if a workflow exists.
     */
    has(id: string): boolean {
        return this.workflows.has(id);
    }

    /**
     * Update workflow phase.
     */
    setPhase(id: string, phase: string): void {
        const workflow = this.workflows.get(id);
        if (workflow) {
            workflow.currentPhase = phase;
            workflow.updatedAt = new Date();
        }
    }

    /**
     * Add a task to workflow.
     */
    addTask(id: string, task: AgentTask): void {
        const workflow = this.workflows.get(id);
        if (workflow) {
            workflow.tasks.push(task);
            workflow.updatedAt = new Date();
        }
    }

    /**
     * Update task status.
     */
    updateTaskStatus(
        workflowId: string,
        taskId: string,
        status: TaskStatus,
        output?: Record<string, unknown>,
        error?: string
    ): void {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) return;

        const task = workflow.tasks.find(t => t.id === taskId);
        if (task) {
            task.status = status;

            if (status === 'in-progress' && !task.startedAt) {
                task.startedAt = new Date();
            }

            if (status === 'completed' || status === 'failed') {
                task.completedAt = new Date();
            }

            if (output) {
                task.output = output;
            }

            if (error) {
                task.error = error;
            }

            workflow.updatedAt = new Date();
        }
    }

    /**
     * Mark workflow as completed.
     */
    complete(id: string): void {
        const workflow = this.workflows.get(id);
        if (workflow) {
            workflow.status = 'completed';
            workflow.completedAt = new Date();
            workflow.updatedAt = new Date();
        }
    }

    /**
     * Mark workflow as failed.
     */
    fail(id: string, error: string): void {
        const workflow = this.workflows.get(id);
        if (workflow) {
            workflow.status = 'failed';
            workflow.context.error = error;
            workflow.completedAt = new Date();
            workflow.updatedAt = new Date();
        }
    }

    /**
     * Pause a workflow.
     */
    pause(id: string): void {
        const workflow = this.workflows.get(id);
        if (workflow && workflow.status === 'running') {
            workflow.status = 'paused';
            workflow.updatedAt = new Date();
        }
    }

    /**
     * Resume a paused workflow.
     */
    resume(id: string): void {
        const workflow = this.workflows.get(id);
        if (workflow && workflow.status === 'paused') {
            workflow.status = 'running';
            workflow.updatedAt = new Date();
        }
    }

    /**
     * Set workflow context value.
     */
    setContext(id: string, key: string, value: unknown): void {
        const workflow = this.workflows.get(id);
        if (workflow) {
            workflow.context[key] = value;
            workflow.updatedAt = new Date();
        }
    }

    /**
     * Get workflow context value.
     */
    getContext<T = unknown>(id: string, key: string): T | undefined {
        const workflow = this.workflows.get(id);
        return workflow?.context[key] as T | undefined;
    }

    /**
     * Delete a workflow.
     */
    delete(id: string): boolean {
        return this.workflows.delete(id);
    }

    /**
     * Get all active workflows.
     */
    getActive(): WorkflowState[] {
        return Array.from(this.workflows.values()).filter(
            w => w.status === 'running' || w.status === 'paused'
        );
    }

    /**
     * Get workflow statistics.
     */
    getStats(): {
        total: number;
        running: number;
        paused: number;
        completed: number;
        failed: number;
    } {
        const workflows = Array.from(this.workflows.values());

        return {
            total: workflows.length,
            running: workflows.filter(w => w.status === 'running').length,
            paused: workflows.filter(w => w.status === 'paused').length,
            completed: workflows.filter(w => w.status === 'completed').length,
            failed: workflows.filter(w => w.status === 'failed').length,
        };
    }

    /**
     * Get pending tasks for a workflow.
     */
    getPendingTasks(id: string): AgentTask[] {
        const workflow = this.workflows.get(id);
        return workflow?.tasks.filter(t => t.status === 'pending') || [];
    }

    /**
     * Get next executable task (respects dependencies).
     */
    getNextTask(id: string): AgentTask | null {
        const workflow = this.workflows.get(id);
        if (!workflow) return null;

        const pending = workflow.tasks.filter(t => t.status === 'pending');

        for (const task of pending) {
            // Check if all dependencies are completed
            if (!task.parentTaskId) {
                return task;
            }

            const parentCompleted = workflow.tasks.some(
                t => t.id === task.parentTaskId && t.status === 'completed'
            );

            if (parentCompleted) {
                return task;
            }
        }

        return null;
    }

    /**
     * Clean up old workflows.
     */
    cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
        const cutoff = new Date(Date.now() - maxAgeMs);
        let cleaned = 0;

        for (const [id, workflow] of this.workflows.entries()) {
            if (
                (workflow.status === 'completed' || workflow.status === 'failed') &&
                workflow.completedAt &&
                workflow.completedAt < cutoff
            ) {
                this.workflows.delete(id);
                cleaned++;
            }
        }

        return cleaned;
    }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultStateManager: WorkflowStateManager | null = null;

export function getWorkflowStateManager(): WorkflowStateManager {
    if (!defaultStateManager) {
        defaultStateManager = new WorkflowStateManager();
    }
    return defaultStateManager;
}
