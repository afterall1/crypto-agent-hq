/**
 * CryptoAgentHQ - Relevance Scorer
 * @module lib/memory/loader/relevance-scorer
 * 
 * Rank entities by relevance to current context.
 * Expert Council Approved: Prof. Michael Rodriguez (Memory Retrieval) ⭐⭐⭐⭐⭐
 */

import { memoryLogger } from '../core/config';
import type { ExtractedEntity, KeyDecision, LearnedFact } from '../core/types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Scored entity with relevance information.
 */
export interface ScoredEntity {
    entity: ExtractedEntity;
    score: number;           // 0.0 - 1.0
    factors: ScoringFactors;
    reason: string;
    includeInContext: boolean;
}

/**
 * Scored decision with relevance information.
 */
export interface ScoredDecision {
    decision: KeyDecision;
    score: number;
    factors: ScoringFactors;
    reason: string;
    includeInContext: boolean;
}

/**
 * Scored fact with relevance information.
 */
export interface ScoredFact {
    fact: LearnedFact;
    score: number;
    factors: ScoringFactors;
    reason: string;
    includeInContext: boolean;
}

/**
 * Individual scoring factors.
 */
export interface ScoringFactors {
    recency: number;         // How recent (0-1)
    frequency: number;       // Access frequency (0-1)
    importance: number;      // Type-based importance (0-1)
    relevance: number;       // Task relevance (0-1)
    connections: number;     // Relationship count (0-1)
}

/**
 * Scoring configuration.
 */
export interface ScoringConfig {
    recencyWeight: number;
    frequencyWeight: number;
    importanceWeight: number;
    relevanceWeight: number;
    connectionsWeight: number;
    threshold: number;
    maxItems: number;
}

/**
 * Scoring context for relevance calculation.
 */
export interface ScoringContext {
    currentTask?: string;
    activeFiles?: string[];
    recentTopics?: string[];
    conversationKeywords?: string[];
}

/**
 * Scoring result summary.
 */
export interface ScoringResult {
    entities: ScoredEntity[];
    decisions: ScoredDecision[];
    facts: ScoredFact[];
    statistics: ScoringStatistics;
}

/**
 * Scoring statistics.
 */
export interface ScoringStatistics {
    totalEntities: number;
    includedEntities: number;
    totalDecisions: number;
    includedDecisions: number;
    totalFacts: number;
    includedFacts: number;
    averageScore: number;
    processingTime: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: ScoringConfig = {
    recencyWeight: 0.25,
    frequencyWeight: 0.15,
    importanceWeight: 0.30,
    relevanceWeight: 0.20,
    connectionsWeight: 0.10,
    threshold: 0.4,
    maxItems: 20,
};

const ENTITY_TYPE_IMPORTANCE: Record<string, number> = {
    'class': 0.9,
    'function': 0.8,
    'interface': 0.85,
    'component': 0.85,
    'module': 0.75,
    'file': 0.7,
    'constant': 0.5,
    'variable': 0.4,
    'config': 0.65,
    'api': 0.9,
    'endpoint': 0.85,
    'database': 0.8,
    'table': 0.75,
    'default': 0.5,
};

// ============================================================================
// RELEVANCE SCORER CLASS
// ============================================================================

/**
 * Score entities by relevance to current context.
 */
export class RelevanceScorer {
    private readonly config: ScoringConfig;
    private context: ScoringContext;

    constructor(config: Partial<ScoringConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.context = {};
    }

    // ============================================================================
    // CONTEXT MANAGEMENT
    // ============================================================================

    /**
     * Set scoring context.
     */
    setContext(context: ScoringContext): void {
        this.context = context;
    }

    /**
     * Update scoring context.
     */
    updateContext(updates: Partial<ScoringContext>): void {
        this.context = { ...this.context, ...updates };
    }

    // ============================================================================
    // MAIN SCORING
    // ============================================================================

    /**
     * Score all items and return filtered results.
     */
    scoreAll(
        entities: ExtractedEntity[],
        decisions: KeyDecision[],
        facts: LearnedFact[]
    ): ScoringResult {
        const startTime = Date.now();
        memoryLogger.info('Starting relevance scoring...');

        // Score each category
        const scoredEntities = this.scoreEntities(entities);
        const scoredDecisions = this.scoreDecisions(decisions);
        const scoredFacts = this.scoreFacts(facts);

        // Filter by threshold and limit
        const filteredEntities = this.filterAndLimit(scoredEntities);
        const filteredDecisions = this.filterAndLimit(scoredDecisions);
        const filteredFacts = this.filterAndLimit(scoredFacts);

        // Calculate statistics
        const allScores = [
            ...scoredEntities.map(e => e.score),
            ...scoredDecisions.map(d => d.score),
            ...scoredFacts.map(f => f.score),
        ];
        const averageScore = allScores.length > 0
            ? allScores.reduce((a, b) => a + b, 0) / allScores.length
            : 0;

        const processingTime = Date.now() - startTime;

        const result: ScoringResult = {
            entities: filteredEntities,
            decisions: filteredDecisions,
            facts: filteredFacts,
            statistics: {
                totalEntities: entities.length,
                includedEntities: filteredEntities.length,
                totalDecisions: decisions.length,
                includedDecisions: filteredDecisions.length,
                totalFacts: facts.length,
                includedFacts: filteredFacts.length,
                averageScore,
                processingTime,
            },
        };

        memoryLogger.info('Relevance scoring complete', {
            entities: `${filteredEntities.length}/${entities.length}`,
            decisions: `${filteredDecisions.length}/${decisions.length}`,
            facts: `${filteredFacts.length}/${facts.length}`,
            avgScore: averageScore.toFixed(2),
            duration: `${processingTime}ms`,
        });

        return result;
    }

    // ============================================================================
    // ENTITY SCORING
    // ============================================================================

    /**
     * Score entities.
     */
    scoreEntities(entities: ExtractedEntity[]): ScoredEntity[] {
        return entities.map(entity => this.scoreEntity(entity));
    }

    /**
     * Score a single entity.
     */
    private scoreEntity(entity: ExtractedEntity): ScoredEntity {
        const factors = this.calculateEntityFactors(entity);
        const score = this.calculateWeightedScore(factors);
        const includeInContext = score >= this.config.threshold;

        return {
            entity,
            score,
            factors,
            reason: this.generateReason(factors, score),
            includeInContext,
        };
    }

    /**
     * Calculate scoring factors for entity.
     */
    private calculateEntityFactors(entity: ExtractedEntity): ScoringFactors {
        return {
            recency: this.calculateRecency(entity.createdAt),
            frequency: this.calculateFrequency(entity.mentions?.length ?? 1),
            importance: this.calculateEntityImportance(entity.type),
            relevance: this.calculateEntityRelevance(entity),
            connections: this.calculateConnections(entity.relationships?.length ?? 0),
        };
    }

    /**
     * Calculate entity type importance.
     */
    private calculateEntityImportance(type: string): number {
        return ENTITY_TYPE_IMPORTANCE[type.toLowerCase()] ?? ENTITY_TYPE_IMPORTANCE['default'];
    }

    /**
     * Calculate entity relevance to current context.
     */
    private calculateEntityRelevance(entity: ExtractedEntity): number {
        let relevance = 0;
        let factors = 0;

        // Check if entity name matches current task
        if (this.context.currentTask) {
            const taskWords = this.tokenize(this.context.currentTask);
            const entityWords = this.tokenize(entity.name);
            const overlap = this.calculateOverlap(taskWords, entityWords);
            relevance += overlap;
            factors++;
        }

        // Check if entity is in active files (using name matching since source is in properties)
        if (this.context.activeFiles) {
            const entitySource = entity.properties?.source as string | undefined;
            const isActive = this.context.activeFiles.some(f =>
                (entitySource && (entitySource.includes(f) || f.includes(entitySource))) ||
                f.includes(entity.name)
            );
            if (isActive) {
                relevance += 1;
            }
            factors++;
        }

        // Check against recent topics
        if (this.context.recentTopics) {
            const topicMatch = this.context.recentTopics.some(topic =>
                entity.name.toLowerCase().includes(topic.toLowerCase()) ||
                topic.toLowerCase().includes(entity.name.toLowerCase())
            );
            if (topicMatch) {
                relevance += 0.8;
            }
            factors++;
        }

        // Check against keywords (description is in properties)
        if (this.context.conversationKeywords) {
            const entityDescription = entity.properties?.description as string | undefined;
            const keywordMatch = this.context.conversationKeywords.some(kw =>
                entity.name.toLowerCase().includes(kw.toLowerCase()) ||
                (entityDescription?.toLowerCase().includes(kw.toLowerCase()) ?? false)
            );
            if (keywordMatch) {
                relevance += 0.6;
            }
            factors++;
        }

        return factors > 0 ? Math.min(relevance / factors, 1) : 0.5;
    }

    // ============================================================================
    // DECISION SCORING
    // ============================================================================

    /**
     * Score decisions.
     */
    scoreDecisions(decisions: KeyDecision[]): ScoredDecision[] {
        return decisions.map(decision => this.scoreDecision(decision));
    }

    /**
     * Score a single decision.
     */
    private scoreDecision(decision: KeyDecision): ScoredDecision {
        const factors = this.calculateDecisionFactors(decision);
        const score = this.calculateWeightedScore(factors);
        const includeInContext = score >= this.config.threshold;

        return {
            decision,
            score,
            factors,
            reason: this.generateReason(factors, score),
            includeInContext,
        };
    }

    /**
     * Calculate scoring factors for decision.
     */
    private calculateDecisionFactors(decision: KeyDecision): ScoringFactors {
        return {
            recency: this.calculateRecency(decision.timestamp),
            frequency: 0.5, // Decisions don't have frequency
            importance: this.calculateDecisionImportance(decision),
            relevance: this.calculateDecisionRelevance(decision),
            connections: this.calculateConnections(decision.alternatives?.length ?? 0),
        };
    }

    /**
     * Calculate decision importance.
     */
    private calculateDecisionImportance(decision: KeyDecision): number {
        // Decisions with rationale are more important
        let importance = 0.5;

        if (decision.rationale && decision.rationale.length > 50) {
            importance += 0.2;
        }

        // Use impact for importance boost
        if (decision.impact === 'critical') {
            importance += 0.3;
        } else if (decision.impact === 'high') {
            importance += 0.2;
        }

        // Check for key decision indicators
        const indicators = ['critical', 'important', 'essential', 'required', 'must'];
        const hasIndicator = indicators.some(ind =>
            decision.description?.toLowerCase().includes(ind) ||
            decision.rationale?.toLowerCase().includes(ind)
        );
        if (hasIndicator) {
            importance += 0.1;
        }

        return Math.min(importance, 1);
    }

    /**
     * Calculate decision relevance.
     */
    private calculateDecisionRelevance(decision: KeyDecision): number {
        let relevance = 0;
        let factors = 0;

        // Check title and description against active files
        if (this.context.activeFiles) {
            const hasOverlap = this.context.activeFiles.some(af =>
                decision.title.toLowerCase().includes(af.toLowerCase()) ||
                decision.description.toLowerCase().includes(af.toLowerCase())
            );
            if (hasOverlap) {
                relevance += 1;
            }
            factors++;
        }

        // Check topics
        if (this.context.recentTopics) {
            const topicMatch = this.context.recentTopics.some(topic =>
                decision.description?.toLowerCase().includes(topic.toLowerCase())
            );
            if (topicMatch) {
                relevance += 0.8;
            }
            factors++;
        }

        return factors > 0 ? Math.min(relevance / factors, 1) : 0.5;
    }

    // ============================================================================
    // FACT SCORING
    // ============================================================================

    /**
     * Score facts.
     */
    scoreFacts(facts: LearnedFact[]): ScoredFact[] {
        return facts.map(fact => this.scoreFact(fact));
    }

    /**
     * Score a single fact.
     */
    private scoreFact(fact: LearnedFact): ScoredFact {
        const factors = this.calculateFactFactors(fact);
        const score = this.calculateWeightedScore(factors);
        const includeInContext = score >= this.config.threshold;

        return {
            fact,
            score,
            factors,
            reason: this.generateReason(factors, score),
            includeInContext,
        };
    }

    /**
     * Calculate scoring factors for fact.
     */
    private calculateFactFactors(fact: LearnedFact): ScoringFactors {
        return {
            recency: this.calculateRecency(fact.timestamp),
            frequency: 0.5,
            importance: fact.confidence,
            relevance: this.calculateFactRelevance(fact),
            connections: 0.5,
        };
    }

    /**
     * Calculate fact relevance.
     */
    private calculateFactRelevance(fact: LearnedFact): number {
        if (!this.context.conversationKeywords) return 0.5;

        const factWords = this.tokenize(fact.content);
        const keywordMatch = this.context.conversationKeywords.filter(kw =>
            factWords.includes(kw.toLowerCase())
        ).length;

        return Math.min(keywordMatch / 3, 1);
    }

    // ============================================================================
    // UTILITY METHODS
    // ============================================================================

    /**
     * Calculate recency score.
     */
    private calculateRecency(date?: Date): number {
        if (!date) return 0.5;

        const now = Date.now();
        const then = date instanceof Date ? date.getTime() : new Date(date).getTime();
        const ageMs = now - then;

        // Decay over 24 hours
        const hourMs = 60 * 60 * 1000;
        const maxAge = 24 * hourMs;

        if (ageMs <= 0) return 1;
        if (ageMs >= maxAge) return 0.1;

        return 1 - (ageMs / maxAge) * 0.9;
    }

    /**
     * Calculate frequency score.
     */
    private calculateFrequency(mentions: number): number {
        // Logarithmic scaling
        const normalized = Math.log10(mentions + 1) / Math.log10(100);
        return Math.min(Math.max(normalized, 0), 1);
    }

    /**
     * Calculate connections score.
     */
    private calculateConnections(count: number): number {
        // More connections = more important, with diminishing returns
        const normalized = Math.log10(count + 1) / Math.log10(20);
        return Math.min(Math.max(normalized, 0), 1);
    }

    /**
     * Calculate weighted total score.
     */
    private calculateWeightedScore(factors: ScoringFactors): number {
        return (
            factors.recency * this.config.recencyWeight +
            factors.frequency * this.config.frequencyWeight +
            factors.importance * this.config.importanceWeight +
            factors.relevance * this.config.relevanceWeight +
            factors.connections * this.config.connectionsWeight
        );
    }

    /**
     * Generate human-readable reason for score.
     */
    private generateReason(factors: ScoringFactors, score: number): string {
        const topFactor = Object.entries(factors)
            .sort(([, a], [, b]) => b - a)[0];

        const threshold = this.config.threshold;
        const status = score >= threshold ? 'included' : 'excluded';

        return `${status} (${(score * 100).toFixed(0)}%) - primary factor: ${topFactor[0]} (${(topFactor[1] * 100).toFixed(0)}%)`;
    }

    /**
     * Filter by threshold and limit count.
     */
    private filterAndLimit<T extends { score: number; includeInContext: boolean }>(
        items: T[]
    ): T[] {
        return items
            .filter(item => item.includeInContext)
            .sort((a, b) => b.score - a.score)
            .slice(0, this.config.maxItems);
    }

    /**
     * Tokenize text into words.
     */
    private tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^a-zA-Z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2);
    }

    /**
     * Calculate word overlap ratio.
     */
    private calculateOverlap(words1: string[], words2: string[]): number {
        if (words1.length === 0 || words2.length === 0) return 0;

        const set1 = new Set(words1);
        const set2 = new Set(words2);
        const intersection = Array.from(set1).filter(w => set2.has(w));

        return intersection.length / Math.min(set1.size, set2.size);
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a relevance scorer instance.
 */
export function createRelevanceScorer(config?: Partial<ScoringConfig>): RelevanceScorer {
    return new RelevanceScorer(config);
}
