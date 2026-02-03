/**
 * CryptoAgentHQ - Middleware Module Index
 * @module lib/middleware
 *
 * Exports all security middleware components.
 */

// Request validation
export {
    validateRequest,
    validateData,
    formatZodError,
    sanitizeString,
    withSanitization,
    AgentRequestSchema,
    StreamRequestSchema,
    type AgentRequest,
    type StreamRequest,
    type ValidationResult,
    type ValidationSuccess,
    type ValidationFailure,
    type ValidatorConfig,
} from './request-validator';

// Rate limiting
export {
    checkRateLimit,
    createRateLimitHeaders,
    resetRateLimit,
    getRateLimitStats,
    clearAllRateLimits,
    getClientIP,
    createEndpointKey,
    DEFAULT_RATE_LIMIT,
    AGENT_API_RATE_LIMIT,
    STREAMING_API_RATE_LIMIT,
    type RateLimitConfig,
    type RateLimitResult,
} from './rate-limiter';

// Security headers
export {
    applySecurityHeaders,
    createSecureResponse,
    createSecureJSONResponse,
    applyCORSHeaders,
    handleCORSPreflight,
    isTrustedOrigin,
    getSecurityHeadersConfig,
    DEFAULT_SECURITY_HEADERS,
    API_CSP,
    PAGE_CSP,
    HSTS_HEADER,
    DEFAULT_CORS_CONFIG,
    type CORSConfig,
} from './security-headers';
