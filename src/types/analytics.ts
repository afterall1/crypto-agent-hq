/**
 * CryptoAgentHQ - Analytics Type Definitions
 * X algoritma metrikleri ve analytics types
 */

export interface AnalyticsPeriod {
    start: Date;
    end: Date;
    label: string;
}

export interface AccountMetrics {
    followers: number;
    following: number;
    tweets: number;
    impressions: number;
    engagements: number;
    profileVisits: number;
    mentions: number;
    followerGrowth: number;
    engagementRate: number;
    period: AnalyticsPeriod;
}

export interface EngagementBreakdown {
    likes: number;
    retweets: number;
    replies: number;
    quotes: number;
    bookmarks: number;
    shares: number;
    profileClicks: number;
    linkClicks: number;
    mediaViews: number;
}

// X Algorithm 19 Engagement Types (from Phoenix ML)
export interface XAlgorithmScores {
    favorite_score: number;
    reply_score: number;
    repost_score: number;
    photo_expand_score: number;
    click_score: number;
    profile_click_score: number;
    vqv_score: number;
    share_score: number;
    share_via_dm_score: number;
    share_via_copy_link_score: number;
    dwell_score: number;
    quote_score: number;
    quoted_click_score: number;
    follow_author_score: number;
    // Negative signals
    not_interested_score: number;
    block_author_score: number;
    mute_author_score: number;
    report_score: number;
    // Additional
    dwell_time: number;
}

export interface TweetAnalytics {
    tweetId: string;
    metrics: EngagementBreakdown;
    impressions: number;
    reach: number;
    engagementRate: number;
    predictedScores?: Partial<XAlgorithmScores>;
    performanceTier: 'viral' | 'high' | 'average' | 'low';
    createdAt: Date;
}

export interface AudienceInsight {
    id: string;
    type: 'follower' | 'engager' | 'potential';
    demographics: {
        topLocations: Array<{ location: string; percentage: number }>;
        topInterests: Array<{ interest: string; percentage: number }>;
        activeHours: Array<{ hour: number; activity: number }>;
    };
    engagement: {
        avgLikesPerPost: number;
        avgRepliesPerPost: number;
        avgRetweetsPerPost: number;
        mostEngagedWith: string[];
    };
}

export interface TrendAnalysis {
    topic: string;
    volume: number;
    sentiment: 'positive' | 'neutral' | 'negative';
    relevance: number; // 0-100
    peakTime: Date;
    relatedHashtags: string[];
    suggestedAngles: string[];
}

export interface PerformanceReport {
    id: string;
    period: AnalyticsPeriod;
    summary: {
        totalImpressions: number;
        totalEngagements: number;
        topTweet: TweetAnalytics;
        growthRate: number;
    };
    trends: {
        impressions: number[];
        engagements: number[];
        followers: number[];
    };
    recommendations: string[];
    generatedBy: string; // Agent ID
    createdAt: Date;
}
