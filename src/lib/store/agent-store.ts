/**
 * CryptoAgentHQ - Agent Store
 * Zustand store for agent state management
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { AgentRole, AgentMessage, AgentTask, AgentConfig } from '@/types/agent';

interface AgentState {
    // State
    agents: Map<AgentRole, AgentConfig>;
    activeAgent: AgentRole | null;
    messages: AgentMessage[];
    tasks: AgentTask[];
    isProcessing: boolean;
    error: string | null;

    // Actions
    setActiveAgent: (role: AgentRole | null) => void;
    addMessage: (message: AgentMessage) => void;
    clearMessages: () => void;
    addTask: (task: AgentTask) => void;
    updateTask: (taskId: string, updates: Partial<AgentTask>) => void;
    setProcessing: (processing: boolean) => void;
    setError: (error: string | null) => void;
    reset: () => void;
}

const initialState = {
    agents: new Map(),
    activeAgent: null,
    messages: [],
    tasks: [],
    isProcessing: false,
    error: null,
};

export const useAgentStore = create<AgentState>()(
    devtools(
        persist(
            (set, get) => ({
                ...initialState,

                setActiveAgent: (role) => set({ activeAgent: role }),

                addMessage: (message) =>
                    set((state) => ({
                        messages: [...state.messages, message],
                    })),

                clearMessages: () => set({ messages: [] }),

                addTask: (task) =>
                    set((state) => ({
                        tasks: [...state.tasks, task],
                    })),

                updateTask: (taskId, updates) =>
                    set((state) => ({
                        tasks: state.tasks.map((task) =>
                            task.id === taskId ? { ...task, ...updates } : task
                        ),
                    })),

                setProcessing: (processing) => set({ isProcessing: processing }),

                setError: (error) => set({ error }),

                reset: () => set(initialState),
            }),
            {
                name: 'crypto-agent-hq-agents',
                partialize: (state) => ({
                    messages: state.messages.slice(-100), // Keep last 100 messages
                    tasks: state.tasks.filter((t) => t.status !== 'completed').slice(-50),
                }),
            }
        ),
        { name: 'AgentStore' }
    )
);

// Selectors
export const selectActiveAgent = (state: AgentState) => state.activeAgent;
export const selectMessages = (state: AgentState) => state.messages;
export const selectPendingTasks = (state: AgentState) =>
    state.tasks.filter((t) => t.status === 'pending' || t.status === 'in-progress');
export const selectIsProcessing = (state: AgentState) => state.isProcessing;
