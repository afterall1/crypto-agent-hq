/**
 * CryptoAgentHQ - RAG Knowledge Base
 * @module lib/rag/knowledge-base
 * 
 * X Algorithm knowledge retrieval system.
 * Konsey Değerlendirmesi: RAG/Memory Uzmanı ⭐⭐⭐⭐⭐
 */

// ============================================================================
// KNOWLEDGE TYPES
// ============================================================================

export interface KnowledgeDocument {
    id: string;
    category: KnowledgeCategory;
    title: string;
    content: string;
    metadata: {
        source?: string;
        lastUpdated?: Date;
        relevanceScore?: number;
        tags?: string[];
    };
}

export type KnowledgeCategory =
    | 'algorithm'
    | 'engagement'
    | 'content-strategy'
    | 'timing'
    | 'audience'
    | 'voice'
    | 'crypto-niche';

export interface SearchResult {
    document: KnowledgeDocument;
    score: number;
    matchedTerms: string[];
}

// ============================================================================
// X ALGORITHM KNOWLEDGE
// ============================================================================

const X_ALGORITHM_KNOWLEDGE: KnowledgeDocument[] = [
    // Engagement Scoring
    {
        id: 'x-algo-engagement-weights',
        category: 'algorithm',
        title: 'X Algorithm Engagement Weights',
        content: `The X For You feed algorithm assigns different weights to engagement types:
- Replies: 1x base weight (drives conversation)
- Retweets: 8x weight (signals content worth sharing)
- Likes: 0.5x weight (passive engagement)
- Follows from tweet: 10x weight (strongest signal)
- Profile clicks: 2x weight
- Link clicks: 0.5x weight (can reduce organic reach)
- Quote tweets: 8x weight (similar to retweets)
- Bookmarks: 3x weight (private signal of value)

The algorithm prioritizes content that generates meaningful interactions (replies, quotes) over passive engagement (likes).`,
        metadata: {
            source: 'X Algorithm Open Source Analysis',
            tags: ['engagement', 'algorithm', 'weights'],
        },
    },
    {
        id: 'x-algo-ranking-factors',
        category: 'algorithm',
        title: 'Tweet Ranking Factors',
        content: `Key factors in tweet ranking:
1. Recency: Newer tweets get initial boost
2. Author relationship: Past interactions with author
3. Content type: Text, image, video have different weights
4. Engagement velocity: Fast early engagement signals quality
5. Topic relevance: Match with user interests
6. Tweet length: 71-100 chars optimal for engagement
7. Media presence: Images boost engagement 2.5x
8. Reply chain depth: Deep conversations rank higher

Negative signals:
- External links (reduces reach 20-50%)
- Excessive hashtags (>2 treated as spam)
- Engagement bait phrases
- Rapid posting (>5/hour flagged)`,
        metadata: {
            source: 'Twitter/X Algorithm Research',
            tags: ['ranking', 'algorithm', 'signals'],
        },
    },
    // Content Strategy
    {
        id: 'x-content-pillars',
        category: 'content-strategy',
        title: 'Content Pillar Strategy',
        content: `Optimal content mix for sustainable growth:
- Educational (40%): Teach, explain, share insights
- Engagement (30%): Questions, polls, controversial takes
- Personal (20%): Stories, behind-scenes, authenticity
- Promotional (10%): CTA, products, links

Thread structure for maximum reach:
1. Hook tweet (stop the scroll)
2. Promise tweet (what reader will learn)
3. Context tweets (background)
4. Value tweets (main content)
5. Summary tweet (key takeaways)
6. CTA (engagement ask)`,
        metadata: {
            source: 'Social Media Strategy Research',
            tags: ['content', 'strategy', 'pillars'],
        },
    },
    // Timing
    {
        id: 'x-optimal-timing',
        category: 'timing',
        title: 'Optimal Posting Times',
        content: `Best posting times (audience timezone):
- Morning: 8-10 AM (commute check)
- Lunch: 12-1 PM (break scrolling)
- Evening: 6-8 PM (wind-down time)
- Late night: 10-11 PM (before bed)

Day performance:
- Tuesday-Thursday: Highest engagement
- Sunday: Good for personal content
- Monday: Professional content
- Friday: Lower engagement (weekend mode)

Crypto-specific:
- Market open hours: High activity
- After major price moves: Peak attention
- Weekend: More engaged audience`,
        metadata: {
            source: 'Social Media Analytics',
            tags: ['timing', 'scheduling'],
        },
    },
    // Crypto Niche
    {
        id: 'x-crypto-niche',
        category: 'crypto-niche',
        title: 'Crypto Twitter Best Practices',
        content: `Crypto Twitter (CT) specific strategies:
- Use $TICKER format for coins
- Engage during market volatility
- Share charts with brief analysis
- Use threads for deep analysis
- Quote tweet influential accounts

Key CT content types:
1. Market analysis
2. Project research (DYOR threads)
3. Trading insights (entries/exits)
4. Macro economic takes
5. Tech/development updates

Avoid:
- Shilling without disclosure
- Guaranteed returns language
- FUD spreading
- Copy-paste content`,
        metadata: {
            source: 'Crypto Twitter Analysis',
            tags: ['crypto', 'niche', 'best-practices'],
        },
    },
    // Voice & Tone
    {
        id: 'x-voice-guidelines',
        category: 'voice',
        title: 'Brand Voice Guidelines',
        content: `Effective X brand voice characteristics:
- Conversational but knowledgeable
- Confident without arrogance
- Accessible to beginners and experts
- Consistent personality across posts
- Authentic and human

Voice do's:
- Use active voice
- Short, punchy sentences
- Strategic emoji usage (1-2 per tweet)
- Direct address ("you", "your")
- Contractions for natural flow

Voice don'ts:
- Corporate speak
- Jargon without explanation
- Excessive formality
- Inconsistent tone shifts`,
        metadata: {
            source: 'Brand Voice Research',
            tags: ['voice', 'brand', 'tone'],
        },
    },
    // Audience
    {
        id: 'x-audience-growth',
        category: 'audience',
        title: 'Audience Growth Strategies',
        content: `Proven audience growth tactics:
1. Engagement-first approach:
   - Reply to larger accounts (thoughtful, not spammy)
   - Join conversations early
   - Add value before self-promotion

2. Content consistency:
   - Post 3-5x daily minimum
   - Same time slots for predictability
   - Thread every 2-3 days

3. Network building:
   - Engage with peers (similar follower count)
   - Collaborate on threads
   - Quote tweet with added value

4. Profile optimization:
   - Clear value proposition in bio
   - Pinned tweet as introduction
   - Consistent branding`,
        metadata: {
            source: 'Growth Hacking Research',
            tags: ['audience', 'growth', 'strategy'],
        },
    },
];

// ============================================================================
// KNOWLEDGE BASE CLASS
// ============================================================================

export class KnowledgeBase {
    private documents: Map<string, KnowledgeDocument> = new Map();
    private categoryIndex: Map<KnowledgeCategory, string[]> = new Map();
    private tagIndex: Map<string, string[]> = new Map();

    constructor() {
        // Load default knowledge
        this.loadDefaultKnowledge();
    }

    /**
     * Load default X algorithm knowledge.
     */
    private loadDefaultKnowledge(): void {
        X_ALGORITHM_KNOWLEDGE.forEach(doc => this.add(doc));
    }

    /**
     * Add a document to the knowledge base.
     */
    add(document: KnowledgeDocument): void {
        this.documents.set(document.id, document);

        // Update category index
        const categoryDocs = this.categoryIndex.get(document.category) || [];
        if (!categoryDocs.includes(document.id)) {
            categoryDocs.push(document.id);
            this.categoryIndex.set(document.category, categoryDocs);
        }

        // Update tag index
        document.metadata.tags?.forEach(tag => {
            const tagDocs = this.tagIndex.get(tag) || [];
            if (!tagDocs.includes(document.id)) {
                tagDocs.push(document.id);
                this.tagIndex.set(tag, tagDocs);
            }
        });
    }

    /**
     * Get a document by ID.
     */
    get(id: string): KnowledgeDocument | undefined {
        return this.documents.get(id);
    }

    /**
     * Search for relevant documents.
     */
    search(query: string, options: {
        category?: KnowledgeCategory;
        limit?: number;
        minScore?: number;
    } = {}): SearchResult[] {
        const { category, limit = 5, minScore = 0.1 } = options;
        const queryTerms = this.tokenize(query);
        const results: SearchResult[] = [];

        // Get candidate documents
        let candidates: KnowledgeDocument[];

        if (category) {
            const docIds = this.categoryIndex.get(category) || [];
            candidates = docIds
                .map(id => this.documents.get(id))
                .filter((d): d is KnowledgeDocument => d !== undefined);
        } else {
            candidates = Array.from(this.documents.values());
        }

        // Score each document
        for (const doc of candidates) {
            const { score, matchedTerms } = this.scoreDocument(doc, queryTerms);

            if (score >= minScore) {
                results.push({ document: doc, score, matchedTerms });
            }
        }

        // Sort by score and limit
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    /**
     * Get documents by category.
     */
    getByCategory(category: KnowledgeCategory): KnowledgeDocument[] {
        const docIds = this.categoryIndex.get(category) || [];
        return docIds
            .map(id => this.documents.get(id))
            .filter((d): d is KnowledgeDocument => d !== undefined);
    }

    /**
     * Get documents by tag.
     */
    getByTag(tag: string): KnowledgeDocument[] {
        const docIds = this.tagIndex.get(tag) || [];
        return docIds
            .map(id => this.documents.get(id))
            .filter((d): d is KnowledgeDocument => d !== undefined);
    }

    /**
     * Build context string for LLM prompt.
     */
    buildContext(query: string, maxTokens: number = 2000): string {
        const results = this.search(query, { limit: 3 });

        if (results.length === 0) {
            return '';
        }

        const parts: string[] = ['## Relevant Knowledge\n'];
        let tokenCount = 20;

        for (const result of results) {
            const docText = `### ${result.document.title}\n${result.document.content}\n\n`;
            const docTokens = Math.ceil(docText.length / 4); // Rough estimate

            if (tokenCount + docTokens > maxTokens) {
                break;
            }

            parts.push(docText);
            tokenCount += docTokens;
        }

        return parts.join('');
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    private tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(t => t.length > 2);
    }

    private scoreDocument(
        doc: KnowledgeDocument,
        queryTerms: string[]
    ): { score: number; matchedTerms: string[] } {
        const docTerms = new Set([
            ...this.tokenize(doc.title),
            ...this.tokenize(doc.content),
            ...(doc.metadata.tags || []).map(t => t.toLowerCase()),
        ]);

        const matchedTerms = queryTerms.filter(t => docTerms.has(t));
        const score = matchedTerms.length / Math.max(queryTerms.length, 1);

        // Boost for title matches
        const titleTerms = new Set(this.tokenize(doc.title));
        const titleMatches = queryTerms.filter(t => titleTerms.has(t)).length;
        const titleBoost = titleMatches * 0.2;

        return {
            score: Math.min(1, score + titleBoost),
            matchedTerms,
        };
    }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultKnowledgeBase: KnowledgeBase | null = null;

export function getKnowledgeBase(): KnowledgeBase {
    if (!defaultKnowledgeBase) {
        defaultKnowledgeBase = new KnowledgeBase();
    }
    return defaultKnowledgeBase;
}
