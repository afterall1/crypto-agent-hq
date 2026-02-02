/**
 * CryptoAgentHQ - Knowledge Extractor
 * @module lib/memory/operations/extractor
 * 
 * Extracts structured knowledge from conversations.
 * Konsey Değerlendirmesi: Knowledge Graph Expert + Information Retrieval Scientist ⭐⭐⭐⭐⭐
 */

import type {
    ConversationMessage,
    ExtractedEntity,
    EntityType,
    EntityRelationship,
    LearnedFact,
    MentionLocation,
} from '../core/types';
import { memoryLogger } from '../core/config';

// ============================================================================
// EXTRACTION PATTERNS
// ============================================================================

/**
 * Patterns for entity extraction.
 */
const ENTITY_PATTERNS: Record<EntityType, RegExp[]> = {
    file: [
        /(?:\/[\w.-]+)+\.\w+/g, // Unix paths
        /`([^`]+\.\w+)`/g, // Backtick file references
        /(?:created?|modified?|updated?)\s+(?:file\s+)?([^\s,]+\.\w+)/gi,
    ],
    function: [
        /function\s+(\w+)/g,
        /const\s+(\w+)\s*=\s*(?:async\s*)?\(/g,
        /`(\w+)\(\)`/g,
        /called?\s+(\w+)\(/gi,
    ],
    class: [
        /class\s+(\w+)/g,
        /new\s+(\w+)\(/g,
        /extends\s+(\w+)/g,
    ],
    concept: [
        /(?:pattern|architecture|design|approach|strategy|system):\s*(\w[\w\s]{2,30})/gi,
    ],
    decision: [
        /decided\s+to\s+([\w\s]{5,50})/gi,
        /chose\s+([\w\s]{5,50})/gi,
        /going\s+with\s+([\w\s]{5,30})/gi,
    ],
    bug: [
        /(?:bug|error|issue):\s*([^.]+)/gi,
        /fixed?\s+(?:the\s+)?([^.]+(?:bug|error|issue))/gi,
    ],
    feature: [
        /implement(?:ed|ing)?\s+([\w\s]{5,40})/gi,
        /add(?:ed|ing)?\s+([\w\s]{5,40}feature)/gi,
    ],
    person: [
        /@(\w+)/g,
    ],
    tool: [
        /using\s+(\w+(?:\s+\w+)?)\s+tool/gi,
        /tool:\s*(\w+)/gi,
        /npm\s+(?:install|run)\s+(\w+)/gi,
    ],
    config: [
        /config(?:uration)?:\s*(\w+)/gi,
        /\.env\.(\w+)/g,
        /process\.env\.(\w+)/g,
    ],
    dependency: [
        /installed?\s+(\w+(?:@[\w.-]+)?)/gi,
        /"(\w+)":\s*"[\^~]?[\d.]+"/g,
    ],
};

// ============================================================================
// KNOWLEDGE EXTRACTOR CLASS
// ============================================================================

/**
 * Extracts structured knowledge from conversation messages.
 */
export class KnowledgeExtractor {
    private readonly conversationId: string;
    private entitiesById: Map<string, ExtractedEntity> = new Map();
    private entityIdCounter: number = 0;

    constructor(conversationId: string) {
        this.conversationId = conversationId;
    }

    /**
     * Extract all knowledge from messages.
     */
    extract(messages: ConversationMessage[]): {
        entities: ExtractedEntity[];
        relationships: EntityRelationship[];
        facts: LearnedFact[];
    } {
        const entities: ExtractedEntity[] = [];
        const relationships: EntityRelationship[] = [];
        const facts: LearnedFact[] = [];

        messages.forEach(message => {
            // Extract entities
            const messageEntities = this.extractEntities(message);
            entities.push(...messageEntities);

            // Extract facts
            const messageFacts = this.extractFacts(message);
            facts.push(...messageFacts);
        });

        // Deduplicate entities
        const deduped = this.deduplicateEntities(entities);

        // Extract relationships between entities
        const extractedRelationships = this.extractRelationships(deduped, messages);
        relationships.push(...extractedRelationships);

        memoryLogger.info('Knowledge extraction complete', {
            entities: deduped.length,
            relationships: relationships.length,
            facts: facts.length,
        });

        return {
            entities: deduped,
            relationships,
            facts,
        };
    }

    /**
     * Extract entities from a single message.
     */
    extractEntities(message: ConversationMessage): ExtractedEntity[] {
        const entities: ExtractedEntity[] = [];
        const content = message.content;

        (Object.entries(ENTITY_PATTERNS) as [EntityType, RegExp[]][]).forEach(
            ([type, patterns]) => {
                patterns.forEach(pattern => {
                    // Reset regex state
                    pattern.lastIndex = 0;

                    let match;
                    while ((match = pattern.exec(content)) !== null) {
                        const name = match[1] || match[0];
                        if (name.length < 2 || name.length > 100) continue;

                        const mention: MentionLocation = {
                            turnNumber: message.turnNumber,
                            startOffset: match.index,
                            endOffset: match.index + match[0].length,
                            context: content.slice(
                                Math.max(0, match.index - 30),
                                Math.min(content.length, match.index + match[0].length + 30)
                            ),
                        };

                        const entity = this.createOrUpdateEntity(name, type, mention);
                        entities.push(entity);
                    }
                });
            }
        );

        return entities;
    }

    /**
     * Extract facts from a message.
     */
    extractFacts(message: ConversationMessage): LearnedFact[] {
        const facts: LearnedFact[] = [];

        if (message.role !== 'assistant') return facts;

        const lines = message.content.split('\n');

        lines.forEach((line, index) => {
            // Look for factual statements
            const factPatterns = [
                /^(?:note|important|remember|key\s*point):\s*(.+)/i,
                /^>\s*(.+)/,
                /^\*\*(.+)\*\*/,
            ];

            factPatterns.forEach(pattern => {
                const match = line.match(pattern);
                if (match && match[1].length > 10) {
                    facts.push({
                        id: `fact-${this.conversationId}-${message.turnNumber}-${index}`,
                        content: match[1].trim(),
                        source: `Turn ${message.turnNumber}`,
                        confidence: 0.8,
                        category: this.categorize(match[1]),
                        timestamp: message.timestamp,
                    });
                }
            });
        });

        return facts;
    }

    /**
     * Extract relationships between entities.
     */
    extractRelationships(
        entities: ExtractedEntity[],
        messages: ConversationMessage[]
    ): EntityRelationship[] {
        const relationships: EntityRelationship[] = [];
        const entityByName = new Map(entities.map(e => [e.name.toLowerCase(), e]));

        // Find entities that co-occur in the same context
        entities.forEach(entity1 => {
            entity1.mentions.forEach(mention => {
                const context = mention.context.toLowerCase();

                entities.forEach(entity2 => {
                    if (entity1.id === entity2.id) return;

                    if (context.includes(entity2.name.toLowerCase())) {
                        // Check for specific relationship patterns
                        const relType = this.detectRelationshipType(
                            entity1.name,
                            entity2.name,
                            context
                        );

                        if (relType) {
                            relationships.push({
                                fromEntityId: entity1.id,
                                toEntityId: entity2.id,
                                type: relType,
                                weight: 0.5,
                            });
                        }
                    }
                });
            });
        });

        // Deduplicate relationships
        return this.deduplicateRelationships(relationships);
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    /**
     * Create or update an entity.
     */
    private createOrUpdateEntity(
        name: string,
        type: EntityType,
        mention: MentionLocation
    ): ExtractedEntity {
        const normalizedName = name.trim();
        const key = `${type}:${normalizedName.toLowerCase()}`;

        let entity = this.entitiesById.get(key);

        if (entity) {
            entity.mentions.push(mention);
            entity.updatedAt = new Date();
        } else {
            entity = {
                id: `entity-${++this.entityIdCounter}`,
                name: normalizedName,
                type,
                properties: {},
                mentions: [mention],
                relationships: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            this.entitiesById.set(key, entity);
        }

        return entity;
    }

    /**
     * Deduplicate entities by name and type.
     */
    private deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
        const byKey = new Map<string, ExtractedEntity>();

        entities.forEach(entity => {
            const key = `${entity.type}:${entity.name.toLowerCase()}`;
            const existing = byKey.get(key);

            if (existing) {
                existing.mentions.push(...entity.mentions);
                existing.updatedAt = new Date();
            } else {
                byKey.set(key, { ...entity });
            }
        });

        return Array.from(byKey.values());
    }

    /**
     * Deduplicate relationships.
     */
    private deduplicateRelationships(
        relationships: EntityRelationship[]
    ): EntityRelationship[] {
        const seen = new Set<string>();

        return relationships.filter(rel => {
            const key = `${rel.fromEntityId}-${rel.type}-${rel.toEntityId}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /**
     * Detect the type of relationship between two entities.
     */
    private detectRelationshipType(
        entity1: string,
        entity2: string,
        context: string
    ): string | null {
        const lowerContext = context.toLowerCase();

        const patterns: [RegExp, string][] = [
            [/imports?\s+from/i, 'imports'],
            [/extends/i, 'extends'],
            [/implements/i, 'implements'],
            [/uses/i, 'uses'],
            [/calls/i, 'calls'],
            [/creates?/i, 'creates'],
            [/modifies?/i, 'modifies'],
            [/depends?\s+on/i, 'depends_on'],
            [/contains?/i, 'contains'],
            [/part\s+of/i, 'part_of'],
        ];

        for (const [pattern, type] of patterns) {
            if (pattern.test(context)) {
                return type;
            }
        }

        // Default co-occurrence relationship
        return 'related_to';
    }

    /**
     * Categorize a fact.
     */
    private categorize(content: string): string {
        const lowerContent = content.toLowerCase();

        if (lowerContent.includes('error') || lowerContent.includes('bug')) {
            return 'troubleshooting';
        }
        if (lowerContent.includes('performance') || lowerContent.includes('optimize')) {
            return 'performance';
        }
        if (lowerContent.includes('security') || lowerContent.includes('auth')) {
            return 'security';
        }
        if (lowerContent.includes('api') || lowerContent.includes('endpoint')) {
            return 'api';
        }
        if (lowerContent.includes('config') || lowerContent.includes('setting')) {
            return 'configuration';
        }

        return 'general';
    }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a knowledge extractor instance.
 */
export function createKnowledgeExtractor(conversationId: string): KnowledgeExtractor {
    return new KnowledgeExtractor(conversationId);
}
