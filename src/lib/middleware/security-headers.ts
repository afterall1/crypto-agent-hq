/**
 * CryptoAgentHQ - Security Headers Middleware
 * @module lib/middleware/security-headers
 *
 * Security header utilities for API responses.
 * Konsey Değerlendirmesi: Application Security Architect ⭐⭐⭐⭐⭐
 */

import { NextResponse } from 'next/server';

// ============================================================================
// SECURITY HEADER DEFINITIONS
// ============================================================================

/**
 * Default security headers for all responses.
 */
export const DEFAULT_SECURITY_HEADERS: Record<string, string> = {
    // Prevent clickjacking
    'X-Frame-Options': 'DENY',

    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',

    // Enable XSS protection (legacy browsers)
    'X-XSS-Protection': '1; mode=block',

    // Control referrer information
    'Referrer-Policy': 'strict-origin-when-cross-origin',

    // Restrict browser features
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',

    // DNS prefetch control
    'X-DNS-Prefetch-Control': 'on',
};

/**
 * Content Security Policy for API responses.
 * More restrictive than page CSP since APIs shouldn't serve HTML.
 */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

/**
 * Content Security Policy for pages.
 */
export const PAGE_CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Required for Next.js
    "style-src 'self' 'unsafe-inline'", // Required for styled-jsx and CSS-in-JS
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.anthropic.com wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
].join('; ');

/**
 * HSTS header for HTTPS enforcement.
 * max-age: 2 years (63072000 seconds)
 */
export const HSTS_HEADER = 'max-age=63072000; includeSubDomains; preload';

// ============================================================================
// HEADER APPLICATION FUNCTIONS
// ============================================================================

/**
 * Apply security headers to a NextResponse.
 */
export function applySecurityHeaders(
    response: NextResponse,
    options: {
        isAPI?: boolean;
        includeHSTS?: boolean;
    } = {}
): NextResponse {
    const { isAPI = false, includeHSTS = true } = options;

    // Apply default headers
    for (const [key, value] of Object.entries(DEFAULT_SECURITY_HEADERS)) {
        response.headers.set(key, value);
    }

    // Apply CSP based on context
    const csp = isAPI ? API_CSP : PAGE_CSP;
    response.headers.set('Content-Security-Policy', csp);

    // Apply HSTS for production
    if (includeHSTS && process.env.NODE_ENV === 'production') {
        response.headers.set('Strict-Transport-Security', HSTS_HEADER);
    }

    return response;
}

/**
 * Create a Response with security headers applied.
 */
export function createSecureResponse(
    body: BodyInit | null,
    init?: ResponseInit,
    options: {
        isAPI?: boolean;
        includeHSTS?: boolean;
    } = {}
): Response {
    const { isAPI = true, includeHSTS = true } = options;

    const headers = new Headers(init?.headers);

    // Apply default headers
    for (const [key, value] of Object.entries(DEFAULT_SECURITY_HEADERS)) {
        headers.set(key, value);
    }

    // Apply CSP
    const csp = isAPI ? API_CSP : PAGE_CSP;
    headers.set('Content-Security-Policy', csp);

    // Apply HSTS for production
    if (includeHSTS && process.env.NODE_ENV === 'production') {
        headers.set('Strict-Transport-Security', HSTS_HEADER);
    }

    return new Response(body, {
        ...init,
        headers,
    });
}

/**
 * Create a JSON response with security headers.
 */
export function createSecureJSONResponse<T>(
    data: T,
    init?: ResponseInit
): Response {
    const headers = new Headers(init?.headers);

    // Set content type
    headers.set('Content-Type', 'application/json');

    // Apply security headers
    for (const [key, value] of Object.entries(DEFAULT_SECURITY_HEADERS)) {
        headers.set(key, value);
    }

    // API-specific CSP
    headers.set('Content-Security-Policy', API_CSP);

    // HSTS for production
    if (process.env.NODE_ENV === 'production') {
        headers.set('Strict-Transport-Security', HSTS_HEADER);
    }

    return new Response(JSON.stringify(data), {
        ...init,
        headers,
    });
}

// ============================================================================
// CORS CONFIGURATION
// ============================================================================

/**
 * CORS configuration for API endpoints.
 */
export interface CORSConfig {
    allowedOrigins: string[];
    allowedMethods: string[];
    allowedHeaders: string[];
    maxAge: number;
    credentials: boolean;
}

export const DEFAULT_CORS_CONFIG: CORSConfig = {
    allowedOrigins: [], // Empty = same-origin only
    allowedMethods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400, // 24 hours
    credentials: false,
};

/**
 * Apply CORS headers based on configuration.
 */
export function applyCORSHeaders(
    response: Response,
    origin: string | null,
    config: CORSConfig = DEFAULT_CORS_CONFIG
): Response {
    const headers = new Headers(response.headers);

    // Check if origin is allowed
    if (origin && config.allowedOrigins.includes(origin)) {
        headers.set('Access-Control-Allow-Origin', origin);

        if (config.credentials) {
            headers.set('Access-Control-Allow-Credentials', 'true');
        }
    }

    // Always set these for preflight caching
    headers.set('Access-Control-Allow-Methods', config.allowedMethods.join(', '));
    headers.set('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
    headers.set('Access-Control-Max-Age', String(config.maxAge));

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

/**
 * Handle CORS preflight (OPTIONS) request.
 */
export function handleCORSPreflight(
    origin: string | null,
    config: CORSConfig = DEFAULT_CORS_CONFIG
): Response {
    const headers = new Headers();

    if (origin && config.allowedOrigins.includes(origin)) {
        headers.set('Access-Control-Allow-Origin', origin);

        if (config.credentials) {
            headers.set('Access-Control-Allow-Credentials', 'true');
        }
    }

    headers.set('Access-Control-Allow-Methods', config.allowedMethods.join(', '));
    headers.set('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
    headers.set('Access-Control-Max-Age', String(config.maxAge));

    return new Response(null, {
        status: 204,
        headers,
    });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a request is from a trusted origin.
 */
export function isTrustedOrigin(
    origin: string | null,
    trustedOrigins: string[]
): boolean {
    if (!origin) return false;
    return trustedOrigins.some(trusted => {
        if (trusted.startsWith('*.')) {
            // Wildcard subdomain matching
            const domain = trusted.slice(2);
            return origin.endsWith(domain) || origin === `https://${domain}` || origin === `http://${domain}`;
        }
        return origin === trusted;
    });
}

/**
 * Get security headers as an object (for Next.js config).
 */
export function getSecurityHeadersConfig(): Array<{ key: string; value: string }> {
    const headers: Array<{ key: string; value: string }> = [];

    for (const [key, value] of Object.entries(DEFAULT_SECURITY_HEADERS)) {
        headers.push({ key, value });
    }

    // Add HSTS
    headers.push({
        key: 'Strict-Transport-Security',
        value: HSTS_HEADER,
    });

    // Add page CSP
    headers.push({
        key: 'Content-Security-Policy',
        value: PAGE_CSP,
    });

    return headers;
}
