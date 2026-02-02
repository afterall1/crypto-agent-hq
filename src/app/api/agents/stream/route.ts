/**
 * CryptoAgentHQ - Streaming Agent API
 * @module app/api/agents/stream/route
 * 
 * Server-Sent Events endpoint for streaming responses.
 */

import { NextRequest } from 'next/server';
import { getAgentManager } from '@/lib/agents';
import type { AgentInput } from '@/lib/agents/core/types';

// ============================================================================
// POST /api/agents/stream - Stream agent response
// ============================================================================

export async function POST(request: NextRequest) {
    const body = await request.json();

    const { message, sessionId, userId, context } = body as {
        message: string;
        sessionId?: string;
        userId?: string;
        context?: Record<string, unknown>;
    };

    if (!message) {
        return new Response(
            JSON.stringify({ error: 'Message is required' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // Create encoder for streaming
    const encoder = new TextEncoder();

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
                controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({
                        type: 'error',
                        error: error instanceof Error ? error.message : 'Unknown error'
                    })}\n\n`)
                );
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
