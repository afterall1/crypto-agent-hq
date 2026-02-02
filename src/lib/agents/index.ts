/**
 * CryptoAgentHQ - Agents Module Index
 * @module lib/agents/index
 */

// Core
export * from './core/types';
export * from './core/agent-config';
export * from './core/agent-memory';
export { BaseAgent } from './core/base-agent';

// Orchestrator
export { OrchestratorAgent, createOrchestratorAgent } from './orchestrator';

// Specialists
export * from './specialists';

// Manager
export { AgentManager, getAgentManager, createAgentManager } from './manager';
