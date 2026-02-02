/**
 * Test Fixtures
 * 
 * Reusable test data factories for consistent testing across the codebase.
 * These fixtures provide deterministic data for memory system, agents, and sessions.
 */

import type { ExtractedEntity, KeyDecision, LearnedFact, SessionSnapshot } from '@/lib/memory/core/types';

// ============================================================
// CONTEXT TYPES (Internal - matching resumable.json structure)
// ============================================================

export interface HotContext {
    currentTask: string;
    taskStatus: string;
    lastUserMessage: string;
    lastAssistantMessage: string;
    activeFilesPaths: string[];
    immediateContext: string[];
}

export interface WarmContext {
    sessionSummary: string;
    recentDecisions: Array<{
        title: string;
        description: string;
        timestamp: string;
    }>;
    activeEntities: Array<{
        name: string;
        type: string;
        description: string;
    }>;
    keyFacts: string[];
    errorsEncountered: string[];
}

export interface ColdContext {
    snapshotPath: string;
    totalMessages: number;
    totalEntities: number;
    totalDecisions: number;
    sessionDuration: number;
}

export interface ResumableContext {
    version: string;
    generatedAt: string;
    conversationId: string;
    hot: HotContext;
    warm: WarmContext;
    cold: ColdContext;
    tokenEstimates: {
        hot: number;
        warm: number;
        cold: number;
        total: number;
    };
}

// ============================================================
// MEMORY TIER FIXTURES
// ============================================================

/**
 * Creates a mock Hot tier context
 */
export function createHotContext(overrides: Partial<HotContext> = {}): HotContext {
    return {
        currentTask: 'Test Task',
        taskStatus: 'running',
        lastUserMessage: 'Test user message',
        lastAssistantMessage: 'Test assistant response',
        activeFilesPaths: ['/test/file1.ts', '/test/file2.ts'],
        immediateContext: ['Context item 1', 'Context item 2'],
        ...overrides,
    };
}

/**
 * Creates a mock Warm tier context
 */
export function createWarmContext(overrides: Partial<WarmContext> = {}): WarmContext {
    return {
        sessionSummary: 'Test session summary with important decisions',
        recentDecisions: [
            {
                title: 'Test Decision 1',
                description: 'Description of test decision 1',
                timestamp: new Date().toISOString(),
            },
        ],
        activeEntities: [
            {
                name: 'TestEntity',
                type: 'class',
                description: 'A test entity for unit testing',
            },
        ],
        keyFacts: ['Fact 1', 'Fact 2'],
        errorsEncountered: [],
        ...overrides,
    };
}

/**
 * Creates a mock Cold tier context
 */
export function createColdContext(overrides: Partial<ColdContext> = {}): ColdContext {
    return {
        snapshotPath: '/test/snapshots/session-123.json',
        totalMessages: 10,
        totalEntities: 5,
        totalDecisions: 3,
        sessionDuration: 3600000,
        ...overrides,
    };
}

/**
 * Creates a complete mock ResumableContext
 */
export function createResumableContext(overrides: Partial<ResumableContext> = {}): ResumableContext {
    return {
        version: '2.0.0',
        generatedAt: new Date().toISOString(),
        conversationId: 'test-conversation-id',
        hot: createHotContext(overrides.hot),
        warm: createWarmContext(overrides.warm),
        cold: createColdContext(overrides.cold),
        tokenEstimates: {
            hot: 100,
            warm: 500,
            cold: 50,
            total: 650,
        },
        ...overrides,
    };
}

// ============================================================
// AGENT RESPONSE FIXTURES
// ============================================================

/**
 * Creates a mock Anthropic message response
 */
export function createMockAnthropicResponse(text: string = 'Mock response') {
    return {
        id: `msg_${Date.now()}`,
        type: 'message' as const,
        role: 'assistant' as const,
        content: [
            {
                type: 'text' as const,
                text,
            },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: {
            input_tokens: 100,
            output_tokens: Math.ceil(text.length / 4),
        },
    };
}

// ============================================================
// SESSION FIXTURES
// ============================================================

/**
 * Creates a mock session snapshot
 */
export function createSessionSnapshot(messageCount: number = 10) {
    const messages = Array.from({ length: messageCount }, (_, i) => ({
        id: `msg_${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i} content`,
        timestamp: new Date(Date.now() - (messageCount - i) * 60000).toISOString(),
    }));

    return {
        conversationId: 'test-conversation-id',
        createdAt: new Date(Date.now() - messageCount * 60000).toISOString(),
        messages,
        entities: [],
        decisions: [],
        facts: [],
    };
}

// ============================================================
// INTEGRITY CHECK FIXTURES
// ============================================================

/**
 * Creates a valid integrity check result
 */
export function createValidIntegrityResult() {
    return {
        isValid: true,
        errors: [],
        warnings: [],
        metadata: {
            fileSize: 1024,
            lastModified: new Date().toISOString(),
            version: '2.0.0',
        },
    };
}

/**
 * Creates an invalid integrity check result
 */
export function createInvalidIntegrityResult(errors: string[] = ['Checksum mismatch']) {
    return {
        isValid: false,
        errors,
        warnings: [],
        metadata: null,
    };
}

// ============================================================
// RELEVANCE SCORE FIXTURES
// ============================================================

/**
 * Creates mock scored entities
 */
export function createScoredEntities(count: number = 5) {
    return Array.from({ length: count }, (_, i) => ({
        entity: {
            name: `Entity${i}`,
            type: 'function' as const,
            description: `Test entity ${i}`,
        },
        score: 1 - i * 0.1,
        factors: {
            recency: 0.8 - i * 0.1,
            frequency: 0.7 - i * 0.05,
            importance: 0.9 - i * 0.1,
            relevance: 0.85 - i * 0.08,
            connections: 0.6 - i * 0.05,
        },
    }));
}

// ============================================================
// ENTITY FIXTURES
// ============================================================

/**
 * Creates a mock extracted entity
 */
export function createMockEntity(overrides: Partial<ExtractedEntity> = {}): ExtractedEntity {
    return {
        id: `entity-${Date.now()}-${Math.random()}`,
        name: 'TestEntity',
        type: 'function',
        properties: {},
        mentions: [],
        relationships: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

/**
 * Creates a mock key decision
 */
export function createMockDecision(overrides: Partial<KeyDecision> = {}): KeyDecision {
    return {
        id: `decision-${Date.now()}-${Math.random()}`,
        title: 'Test Decision',
        description: 'A test decision for unit testing',
        rationale: 'Test rationale',
        alternatives: ['Option A', 'Option B'],
        timestamp: new Date(),
        turnNumber: 1,
        impact: 'medium',
        ...overrides,
    };
}

/**
 * Creates a mock learned fact
 */
export function createMockFact(overrides: Partial<LearnedFact> = {}): LearnedFact {
    return {
        id: `fact-${Date.now()}-${Math.random()}`,
        content: 'Test fact content',
        source: 'test',
        confidence: 0.8,
        category: 'technical',
        timestamp: new Date(),
        ...overrides,
    };
}
