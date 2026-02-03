/**
 * CryptoAgentHQ - Streaming Agent API
 * @module app/api/agents/stream/route
 *
 * Server-Sent Events endpoint for streaming responses.
 * Security: Rate limiting, input validation.
 */

import { NextRequest } from 'next/server';
import { getAgentManager } from '@/lib/agents';
import {
    validateRequest,
    StreamRequestSchema,
    checkRateLimit,
    createRateLimitHeaders,
    STREAMING_API_RATE_LIMIT,
    DEFAULT_SECURITY_HEADERS,
    API_CSP,
} from '@/lib/middleware';
import type { AgentInput } from '@/lib/agents/core/types';

// ============================================================================
// POST /api/agents/stream - Stream agent response
// ============================================================================

export async function POST(request: NextRequest) {
    // Rate limiting check
    const rateLimitResult = await checkRateLimit(request, STREAMING_API_RATE_LIMIT);

    if (!rateLimitResult.allowed) {
        const headers = createRateLimitHeaders(rateLimitResult);
        return new Response(
            JSON.stringify({
                success: false,
                error: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: 'Too many requests. Please try again later.',
                    retryAfter: rateLimitResult.retryAfter,
                },
            }),
            {
                status: 429,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                    ...DEFAULT_SECURITY_HEADERS,
                },
            }
        );
    }

    // Validate request body
    const validation = await validateRequest(request, StreamRequestSchema);

    if (!validation.success) {
        return new Response(
            JSON.stringify({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: validation.error,
                    details: validation.details,
                },
            }),
            {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                    ...DEFAULT_SECURITY_HEADERS,
                },
            }
        );
    }

    const { message, sessionId, userId, context } = validation.data;

    // Create encoder for streaming
    const encoder = new TextEncoder();

    // Build response headers with rate limit info and security
    const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
    const responseHeaders: Record<string, string> = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
        ...rateLimitHeaders,
        ...DEFAULT_SECURITY_HEADERS,
        'Content-Security-Policy': API_CSP,
    };

    // Create readable stream
    const stream = new ReadableStream({
        async start(controller) {
            try {
                const manager = getAgentManager();
                await manager.initialize();

                const input: AgentInput = {
                    sessionId: sessionId || `session-${Date.now()}`,
                    userId: userId || 'anonymous',
                    message,
                    context,
                };

                // Send initial event
                controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: 'start' })}\n\n`)
                );

                // Process with streaming
                const output = await manager.processStream(input, (chunk) => {
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
                    );
                });

                // Send final result
                controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({
                        type: 'complete',
                        data: {
                            id: output.id,
                            content: output.content,
                            role: output.role,
                            usage: output.usage,
                        }
                    })}\n\n`)
                );

                controller.close();

            } catch (error) {
                // Send error event
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({
                        type: 'error',
                        error: {
                            code: 'STREAM_ERROR',
                            message: errorMessage,
                        }
                    })}\n\n`)
                );
                controller.close();
            }
        },
    });

    return new Response(stream, { headers: responseHeaders });
}
