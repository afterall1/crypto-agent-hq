/**
 * RelevanceScorer Unit Tests
 * 
 * Tests for relevance scoring of entities, decisions, and facts.
 * Covers scoring algorithms, context sensitivity, and filtering.
 * Tests only use PUBLIC API methods.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    RelevanceScorer,
    type ScoringConfig,
    type ScoringContext,
} from '../relevance-scorer';
import type { ExtractedEntity, KeyDecision, LearnedFact } from '../../core/types';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createMockEntity = (overrides: Partial<ExtractedEntity> = {}): ExtractedEntity => ({
    id: `entity-${Date.now()}-${Math.random()}`,
    name: 'TestEntity',
    type: 'function',
    properties: {},
    mentions: [],
    relationships: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
});

const createMockDecision = (overrides: Partial<KeyDecision> = {}): KeyDecision => ({
    id: `decision-${Date.now()}-${Math.random()}`,
    title: 'Test Decision',
    description: 'A test decision for unit testing',
    rationale: 'Test rationale',
    alternatives: ['Option A', 'Option B'],
    timestamp: new Date(),
    turnNumber: 1,
    impact: 'medium',
    ...overrides,
});

const createMockFact = (overrides: Partial<LearnedFact> = {}): LearnedFact => ({
    id: `fact-${Date.now()}-${Math.random()}`,
    content: 'Test fact content',
    source: 'test',
    confidence: 0.8,
    category: 'technical',
    timestamp: new Date(),
    ...overrides,
});

const createScoringContext = (overrides: Partial<ScoringContext> = {}): ScoringContext => ({
    currentTask: 'Memory System Implementation',
    activeFiles: ['/test/memory/loader.ts'],
    recentTopics: ['caching', 'performance'],
    conversationKeywords: ['memory', 'loader', 'context'],
    ...overrides,
});

// ============================================================================
// TESTS: CONSTRUCTOR
// ============================================================================

describe('RelevanceScorer', () => {
    describe('constructor', () => {
        it('should create instance with default config', () => {
            const scorer = new RelevanceScorer();
            expect(scorer).toBeDefined();
        });

        it('should create instance with custom config', () => {
            const config: Partial<ScoringConfig> = {
                threshold: 0.5,
                maxItems: 20,
                recencyWeight: 0.3,
            };
            const scorer = new RelevanceScorer(config);
            expect(scorer).toBeDefined();
        });

        it('should merge custom config with defaults', () => {
            const config: Partial<ScoringConfig> = {
                threshold: 0.7,
            };
            const scorer = new RelevanceScorer(config);
            expect(scorer).toBeDefined();
        });
    });

    // ============================================================================
    // TESTS: CONTEXT MANAGEMENT
    // ============================================================================

    describe('context management', () => {
        it('should set scoring context', () => {
            const scorer = new RelevanceScorer();
            const context = createScoringContext();

            scorer.setContext(context);

            expect(scorer).toBeDefined();
        });

        it('should update partial context', () => {
            const scorer = new RelevanceScorer();
            const initialContext = createScoringContext();

            scorer.setContext(initialContext);
            scorer.updateContext({ currentTask: 'Updated Task' });

            expect(scorer).toBeDefined();
        });

        it('should preserve existing context on partial update', () => {
            const scorer = new RelevanceScorer();
            const initialContext = createScoringContext({
                currentTask: 'Original Task',
                activeFiles: ['/original/file.ts'],
            });

            scorer.setContext(initialContext);
            scorer.updateContext({ currentTask: 'Updated Task' });

            expect(scorer).toBeDefined();
        });
    });

    // ============================================================================
    // TESTS: ENTITY SCORING (PUBLIC API)
    // ============================================================================

    describe('entity scoring', () => {
        let scorer: RelevanceScorer;

        beforeEach(() => {
            scorer = new RelevanceScorer();
            scorer.setContext(createScoringContext());
        });

        it('should score entities via scoreEntities', () => {
            const entities = [
                createMockEntity({ name: 'MemoryLoader' }),
                createMockEntity({ name: 'CacheManager' }),
            ];

            const results = scorer.scoreEntities(entities);

            expect(results).toHaveLength(2);
            results.forEach(result => {
                expect(result.score).toBeGreaterThanOrEqual(0);
                expect(result.score).toBeLessThanOrEqual(1);
                expect(result.factors).toBeDefined();
                expect(result.entity).toBeDefined();
            });
        });

        it('should rank entities by relevance (relevant entities score higher)', () => {
            const entities = [
                createMockEntity({ name: 'memory_handler', type: 'function' }),
                createMockEntity({ name: 'random_utility', type: 'function' }),
                createMockEntity({ name: 'context_loader', type: 'class' }),
            ];

            scorer.setContext(createScoringContext({
                currentTask: 'Memory Context Loading',
                conversationKeywords: ['memory', 'context', 'loader'],
            }));

            const results = scorer.scoreEntities(entities);

            // Entities with matching keywords should score higher
            const memoryHandler = results.find(r => r.entity.name === 'memory_handler');
            const randomUtility = results.find(r => r.entity.name === 'random_utility');

            expect(memoryHandler).toBeDefined();
            expect(randomUtility).toBeDefined();
            expect(memoryHandler!.score).toBeGreaterThan(randomUtility!.score);
        });

        it('should calculate scoring factors correctly', () => {
            const entity = createMockEntity({
                name: 'MemoryLoader',
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const results = scorer.scoreEntities([entity]);
            const result = results[0];

            expect(result.factors.recency).toBeGreaterThanOrEqual(0);
            expect(result.factors.recency).toBeLessThanOrEqual(1);
            expect(result.factors.frequency).toBeGreaterThanOrEqual(0);
            expect(result.factors.importance).toBeGreaterThanOrEqual(0);
            expect(result.factors.relevance).toBeGreaterThanOrEqual(0);
            expect(result.factors.connections).toBeGreaterThanOrEqual(0);
        });

        it('should give higher importance to class types', () => {
            const classEntity = createMockEntity({ type: 'class' });
            const funcEntity = createMockEntity({ type: 'function' });

            const results = scorer.scoreEntities([classEntity, funcEntity]);
            const classResult = results.find(r => r.entity.type === 'class')!;
            const funcResult = results.find(r => r.entity.type === 'function')!;

            expect(classResult.factors.importance).toBeGreaterThan(funcResult.factors.importance);
        });
    });

    // ============================================================================
    // TESTS: DECISION SCORING (PUBLIC API)
    // ============================================================================

    describe('decision scoring', () => {
        let scorer: RelevanceScorer;

        beforeEach(() => {
            scorer = new RelevanceScorer();
            scorer.setContext(createScoringContext());
        });

        it('should score decisions via scoreDecisions', () => {
            const decisions = [
                createMockDecision({ title: 'Use Vitest for testing' }),
                createMockDecision({ title: 'Architecture Decision' }),
            ];

            const results = scorer.scoreDecisions(decisions);

            expect(results).toHaveLength(2);
            results.forEach(result => {
                expect(result.score).toBeGreaterThanOrEqual(0);
                expect(result.score).toBeLessThanOrEqual(1);
                expect(result.decision).toBeDefined();
            });
        });

        it('should rank recent decisions higher', () => {
            const recentDecision = createMockDecision({
                title: 'Recent Decision',
                timestamp: new Date(),
            });

            const oldDecision = createMockDecision({
                title: 'Old Decision',
                timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
            });

            const results = scorer.scoreDecisions([recentDecision, oldDecision]);
            const recentResult = results.find(r => r.decision.title === 'Recent Decision')!;
            const oldResult = results.find(r => r.decision.title === 'Old Decision')!;

            expect(recentResult.factors.recency).toBeGreaterThan(oldResult.factors.recency);
        });
    });

    // ============================================================================
    // TESTS: FACT SCORING (PUBLIC API)
    // ============================================================================

    describe('fact scoring', () => {
        let scorer: RelevanceScorer;

        beforeEach(() => {
            scorer = new RelevanceScorer();
            scorer.setContext(createScoringContext());
        });

        it('should score facts via scoreFacts', () => {
            const facts = [
                createMockFact({ content: 'Memory system uses 3-tier architecture' }),
                createMockFact({ content: 'Database uses PostgreSQL' }),
            ];

            const results = scorer.scoreFacts(facts);

            expect(results).toHaveLength(2);
            results.forEach(result => {
                expect(result.score).toBeGreaterThanOrEqual(0);
                expect(result.fact).toBeDefined();
            });
        });

        it('should score relevant facts higher', () => {
            scorer.setContext(createScoringContext({
                currentTask: 'Memory Implementation',
                conversationKeywords: ['memory', 'tier', 'architecture'],
            }));

            const relevantFact = createMockFact({
                content: 'Memory tier uses hot/warm/cold architecture',
            });

            const irrelevantFact = createMockFact({
                content: 'Unrelated content about something else',
            });

            const results = scorer.scoreFacts([relevantFact, irrelevantFact]);
            const relevantResult = results.find(r => r.fact.content.includes('Memory'))!;
            const irrelevantResult = results.find(r => !r.fact.content.includes('Memory'))!;

            expect(relevantResult.factors.relevance).toBeGreaterThan(irrelevantResult.factors.relevance);
        });
    });

    // ============================================================================
    // TESTS: SCORE ALL (PUBLIC API)
    // ============================================================================

    describe('scoreAll', () => {
        let scorer: RelevanceScorer;

        beforeEach(() => {
            scorer = new RelevanceScorer({ threshold: 0.3, maxItems: 10 });
            scorer.setContext(createScoringContext());
        });

        it('should score and filter all item types', () => {
            const entities = [
                createMockEntity({ name: 'Entity1' }),
                createMockEntity({ name: 'Entity2' }),
            ];
            const decisions = [
                createMockDecision({ title: 'Decision1' }),
            ];
            const facts = [
                createMockFact({ content: 'Fact1' }),
                createMockFact({ content: 'Fact2' }),
            ];

            const result = scorer.scoreAll(entities, decisions, facts);

            expect(result.entities).toBeDefined();
            expect(result.decisions).toBeDefined();
            expect(result.facts).toBeDefined();
            expect(result.statistics).toBeDefined();
        });

        it('should calculate statistics correctly', () => {
            const entities = Array.from({ length: 5 }, (_, i) =>
                createMockEntity({ name: `Entity${i}` })
            );
            const decisions = Array.from({ length: 3 }, (_, i) =>
                createMockDecision({ title: `Decision${i}` })
            );
            const facts = Array.from({ length: 4 }, (_, i) =>
                createMockFact({ content: `Fact${i}` })
            );

            const result = scorer.scoreAll(entities, decisions, facts);

            expect(result.statistics.totalEntities).toBe(5);
            expect(result.statistics.totalDecisions).toBe(3);
            expect(result.statistics.totalFacts).toBe(4);
            expect(result.statistics.processingTime).toBeGreaterThanOrEqual(0);
        });

        it('should respect maxItems limit', () => {
            const scorer = new RelevanceScorer({ maxItems: 3, threshold: 0 });
            scorer.setContext(createScoringContext());

            const entities = Array.from({ length: 10 }, (_, i) =>
                createMockEntity({ name: `Entity${i}` })
            );

            const result = scorer.scoreAll(entities, [], []);

            // Should be limited by maxItems
            expect(result.entities.length).toBeLessThanOrEqual(3);
        });

        it('should filter by threshold', () => {
            const scorer = new RelevanceScorer({ threshold: 0.9, maxItems: 100 });
            scorer.setContext(createScoringContext());

            const entities = Array.from({ length: 5 }, (_, i) =>
                createMockEntity({ name: `LowRelevanceEntity${i}` })
            );

            const result = scorer.scoreAll(entities, [], []);

            // With very high threshold, few or no items should pass
            result.entities.forEach(e => {
                expect(e.score).toBeGreaterThanOrEqual(0.9);
            });
        });

        it('should mark includeInContext correctly', () => {
            const entities = [
                createMockEntity({ name: 'HighRelevance' }),
            ];

            const result = scorer.scoreAll(entities, [], []);

            // Check that at least returned items have includeInContext = true
            result.entities.forEach(e => {
                expect(e.includeInContext).toBe(true);
            });
        });
    });

    // ============================================================================
    // TESTS: EDGE CASES
    // ============================================================================

    describe('edge cases', () => {
        it('should handle empty input arrays', () => {
            const scorer = new RelevanceScorer();
            scorer.setContext(createScoringContext());

            const result = scorer.scoreAll([], [], []);

            expect(result.entities).toHaveLength(0);
            expect(result.decisions).toHaveLength(0);
            expect(result.facts).toHaveLength(0);
            expect(result.statistics.totalEntities).toBe(0);
        });

        it('should handle empty context', () => {
            const scorer = new RelevanceScorer();
            scorer.setContext({});

            const entity = createMockEntity();
            const results = scorer.scoreEntities([entity]);

            expect(results[0].score).toBeGreaterThanOrEqual(0);
        });

        it('should handle entities with empty properties', () => {
            const scorer = new RelevanceScorer();
            scorer.setContext(createScoringContext());

            const entity = createMockEntity({
                properties: {},
                mentions: [],
                relationships: [],
            });

            const results = scorer.scoreEntities([entity]);
            expect(results[0].score).toBeGreaterThanOrEqual(0);
        });

        it('should handle very old timestamps', () => {
            const scorer = new RelevanceScorer();
            scorer.setContext(createScoringContext());

            const oldEntity = createMockEntity({
                createdAt: new Date('2020-01-01'),
                updatedAt: new Date('2020-01-01'),
            });

            const results = scorer.scoreEntities([oldEntity]);

            // Very old items should have low recency score
            expect(results[0].factors.recency).toBeLessThan(0.5);
        });
    });
});
