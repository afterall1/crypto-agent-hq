/**
 * CryptoAgentHQ - Content Type Definitions
 * Tweet, Thread ve içerik yönetimi types
 */

export type ContentType = 'tweet' | 'thread' | 'quote' | 'reply';
export type ContentStatus = 'draft' | 'scheduled' | 'published' | 'archived';

export interface Tweet {
    id: string;
    content: string;
    type: ContentType;
    status: ContentStatus;
    mediaUrls?: string[];
    scheduledAt?: Date;
    publishedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
    metrics?: TweetMetrics;
    optimizationScore?: OptimizationScore;
    parentTweetId?: string; // For replies/quotes
}

export interface Thread {
    id: string;
    tweets: Tweet[];
    title: string;
    status: ContentStatus;
    scheduledAt?: Date;
    publishedAt?: Date;
    createdAt: Date;
}

export interface TweetMetrics {
    impressions: number;
    engagements: number;
    likes: number;
    retweets: number;
    replies: number;
    quotes: number;
    bookmarks: number;
    profileClicks: number;
    linkClicks: number;
    dwellTime?: number;
    engagementRate: number;
}

export interface OptimizationScore {
    overall: number; // 0-100
    breakdown: {
        replyPotential: number;
        quotePotential: number;
        repostPotential: number;
        followPotential: number;
        dwellTimePotential: number;
    };
    suggestions: OptimizationSuggestion[];
    xAlgorithmAlignment: number; // 0-100
}

export interface OptimizationSuggestion {
    type: 'format' | 'content' | 'timing' | 'hashtag' | 'media';
    priority: 'high' | 'medium' | 'low';
    suggestion: string;
    impact: string;
}

export interface ContentCalendar {
    id: string;
    date: Date;
    slots: ContentSlot[];
}

export interface ContentSlot {
    id: string;
    time: string; // HH:mm format
    content?: Tweet | Thread;
    isOptimal: boolean;
    reason?: string;
}

export interface ContentPlan {
    id: string;
    title: string;
    description: string;
    startDate: Date;
    endDate: Date;
    topics: string[];
    goals: ContentGoal[];
    createdBy: string; // Agent ID
}

export interface ContentGoal {
    metric: keyof TweetMetrics | 'followers';
    target: number;
    current: number;
    deadline: Date;
}
