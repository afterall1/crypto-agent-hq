/**
 * CryptoAgentHQ - Rate Limiter Middleware
 * @module lib/middleware/rate-limiter
 *
 * In-memory rate limiter with sliding window algorithm.
 * Konsey Değerlendirmesi: API Security Engineer ⭐⭐⭐⭐⭐
 */

import { NextRequest } from 'next/server';

// ============================================================================
// RATE LIMITER TYPES
// ============================================================================

export interface RateLimitConfig {
    /** Maximum requests allowed in the window */
    limit: number;
    /** Time window in milliseconds */
    windowMs: number;
    /** Key generator function (default: IP-based) */
    keyGenerator?: (request: NextRequest) => string;
}

export interface RateLimitResult {
    /** Whether the request is allowed */
    allowed: boolean;
    /** Current request count in window */
    current: number;
    /** Maximum requests allowed */
    limit: number;
    /** Time remaining until window reset (seconds) */
    remaining: number;
    /** Seconds to wait before retry (if rate limited) */
    retryAfter?: number;
}

interface RateLimitEntry {
    count: number;
    resetAt: number;
    timestamps: number[];
}

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup interval (every 60 seconds)
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
    if (cleanupInterval) return;

    cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of rateLimitStore.entries()) {
            if (entry.resetAt < now) {
                rateLimitStore.delete(key);
            }
        }
    }, 60000);

    // Don't prevent process exit
    if (cleanupInterval.unref) {
        cleanupInterval.unref();
    }
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
    limit: 60,
    windowMs: 60000, // 1 minute
};

export const AGENT_API_RATE_LIMIT: RateLimitConfig = {
    limit: 30,
    windowMs: 60000, // 1 minute - more restrictive for costly API calls
};

export const STREAMING_API_RATE_LIMIT: RateLimitConfig = {
    limit: 20,
    windowMs: 60000, // 1 minute - streaming is more resource-intensive
};

// ============================================================================
// KEY GENERATORS
// ============================================================================

/**
 * Extract client IP from request headers.
 * Handles common proxy headers.
 */
export function getClientIP(request: NextRequest): string {
    // Check standard proxy headers
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
        // x-forwarded-for can contain multiple IPs, take the first one
        const firstIP = forwardedFor.split(',')[0]?.trim();
        if (firstIP && isValidIP(firstIP)) {
            return firstIP;
        }
    }

    const realIP = request.headers.get('x-real-ip');
    if (realIP && isValidIP(realIP)) {
        return realIP;
    }

    // Fallback to a default identifier
    return 'unknown-client';
}

/**
 * Basic IP validation.
 */
function isValidIP(ip: string): boolean {
    // IPv4 pattern
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    // IPv6 pattern (simplified)
    const ipv6Pattern = /^[0-9a-fA-F:]+$/;

    return ipv4Pattern.test(ip) || ipv6Pattern.test(ip);
}

/**
 * Generate rate limit key combining IP and endpoint.
 */
export function createEndpointKey(request: NextRequest): string {
    const ip = getClientIP(request);
    const path = new URL(request.url).pathname;
    return `${ip}:${path}`;
}

// ============================================================================
// RATE LIMITING FUNCTIONS
// ============================================================================

/**
 * Check if a request is within rate limits.
 * Uses sliding window algorithm for accuracy.
 */
export async function checkRateLimit(
    request: NextRequest,
    config: RateLimitConfig = DEFAULT_RATE_LIMIT
): Promise<RateLimitResult> {
    startCleanup();

    const keyGenerator = config.keyGenerator ?? createEndpointKey;
    const key = keyGenerator(request);
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Get or create entry
    let entry = rateLimitStore.get(key);

    if (!entry || entry.resetAt < now) {
        // Create new entry
        entry = {
            count: 0,
            resetAt: now + config.windowMs,
            timestamps: [],
        };
    }

    // Filter timestamps within current window (sliding window)
    entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);
    entry.count = entry.timestamps.length;

    // Check if limit exceeded
    if (entry.count >= config.limit) {
        const oldestTimestamp = entry.timestamps[0] || now;
        const retryAfter = Math.ceil((oldestTimestamp + config.windowMs - now) / 1000);

        rateLimitStore.set(key, entry);

        return {
            allowed: false,
            current: entry.count,
            limit: config.limit,
            remaining: Math.max(0, Math.ceil((entry.resetAt - now) / 1000)),
            retryAfter: Math.max(1, retryAfter),
        };
    }

    // Add current request timestamp
    entry.timestamps.push(now);
    entry.count = entry.timestamps.length;
    entry.resetAt = now + config.windowMs;

    rateLimitStore.set(key, entry);

    return {
        allowed: true,
        current: entry.count,
        limit: config.limit,
        remaining: config.limit - entry.count,
    };
}

/**
 * Create rate limit headers for response.
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
    const headers: Record<string, string> = {
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(Math.max(0, result.limit - result.current)),
        'X-RateLimit-Reset': String(result.remaining),
    };

    if (!result.allowed && result.retryAfter) {
        headers['Retry-After'] = String(result.retryAfter);
    }

    return headers;
}

/**
 * Reset rate limit for a specific key.
 * Useful for testing or admin operations.
 */
export function resetRateLimit(key: string): void {
    rateLimitStore.delete(key);
}

/**
 * Get current rate limit stats (for monitoring).
 */
export function getRateLimitStats(): {
    totalKeys: number;
    entries: Array<{ key: string; count: number; resetAt: number }>;
} {
    const entries: Array<{ key: string; count: number; resetAt: number }> = [];

    for (const [key, entry] of rateLimitStore.entries()) {
        entries.push({
            key,
            count: entry.count,
            resetAt: entry.resetAt,
        });
    }

    return {
        totalKeys: rateLimitStore.size,
        entries,
    };
}

/**
 * Clear all rate limit entries.
 * Use with caution - mainly for testing.
 */
export function clearAllRateLimits(): void {
    rateLimitStore.clear();
}
