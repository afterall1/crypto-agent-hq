/**
 * CryptoAgentHQ - Agent API Routes
 * @module app/api/agents/route
 *
 * REST API endpoints for agent interaction.
 * Security: Rate limiting, input validation, security headers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAgentManager } from '@/lib/agents';
import { createErrorResponse } from '@/lib/errors/handler';
import {
    validateRequest,
    AgentRequestSchema,
    checkRateLimit,
    createRateLimitHeaders,
    AGENT_API_RATE_LIMIT,
    applySecurityHeaders,
} from '@/lib/middleware';
import type { AgentInput } from '@/lib/agents/core/types';

// ============================================================================
// POST /api/agents - Process a request
// ============================================================================

export async function POST(request: NextRequest) {
    try {
        // Rate limiting check
        const rateLimitResult = await checkRateLimit(request, AGENT_API_RATE_LIMIT);
        const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);

        if (!rateLimitResult.allowed) {
            const response = NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'RATE_LIMIT_EXCEEDED',
                        message: 'Too many requests. Please try again later.',
                        retryAfter: rateLimitResult.retryAfter,
                    },
                },
                { status: 429 }
            );

            // Apply headers
            for (const [key, value] of Object.entries(rateLimitHeaders)) {
                response.headers.set(key, value);
            }

            return applySecurityHeaders(response, { isAPI: true });
        }

        // Validate request body
        const validation = await validateRequest(request, AgentRequestSchema);

        if (!validation.success) {
            const response = NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: validation.error,
                        details: validation.details,
                    },
                },
                { status: 400 }
            );
            return applySecurityHeaders(response, { isAPI: true });
        }

        const { message, sessionId, userId, context, agentRole } = validation.data;

        const manager = getAgentManager();
        await manager.initialize();

        const input: AgentInput = {
            sessionId: sessionId || `session-${Date.now()}`,
            userId: userId || 'anonymous',
            message,
            context,
        };

        let output;

        if (agentRole && agentRole !== 'orchestrator') {
            // Direct agent access
            output = await manager.processWithAgent(agentRole, input);
        } else {
            // Process through orchestrator
            output = await manager.process(input);
        }

        const response = NextResponse.json({
            success: true,
            data: {
                id: output.id,
                content: output.content,
                role: output.role,
                usage: output.usage,
                timestamp: output.timestamp,
            },
        });

        // Apply rate limit and security headers
        for (const [key, value] of Object.entries(rateLimitHeaders)) {
            response.headers.set(key, value);
        }

        return applySecurityHeaders(response, { isAPI: true });

    } catch (error) {
        const { error: errorData, status } = createErrorResponse(error);
        const response = NextResponse.json(
            { success: false, error: errorData },
            { status }
        );
        return applySecurityHeaders(response, { isAPI: true });
    }
}

// ============================================================================
// GET /api/agents - Get agent status
// ============================================================================

export async function GET(request: NextRequest) {
    try {
        // Rate limiting check (using default limits for GET)
        const rateLimitResult = await checkRateLimit(request);
        const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);

        if (!rateLimitResult.allowed) {
            const response = NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'RATE_LIMIT_EXCEEDED',
                        message: 'Too many requests. Please try again later.',
                        retryAfter: rateLimitResult.retryAfter,
                    },
                },
                { status: 429 }
            );

            for (const [key, value] of Object.entries(rateLimitHeaders)) {
                response.headers.set(key, value);
            }

            return applySecurityHeaders(response, { isAPI: true });
        }

        const manager = getAgentManager();
        const stats = manager.getStats();

        const response = NextResponse.json({
            success: true,
            data: stats,
        });

        for (const [key, value] of Object.entries(rateLimitHeaders)) {
            response.headers.set(key, value);
        }

        return applySecurityHeaders(response, { isAPI: true });

    } catch (error) {
        const { error: errorData, status } = createErrorResponse(error);
        const response = NextResponse.json(
            { success: false, error: errorData },
            { status }
        );
        return applySecurityHeaders(response, { isAPI: true });
    }
}
