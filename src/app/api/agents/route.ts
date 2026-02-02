/**
 * CryptoAgentHQ - Agent API Routes
 * @module app/api/agents/route
 * 
 * REST API endpoints for agent interaction.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAgentManager } from '@/lib/agents';
import { createErrorResponse } from '@/lib/errors/handler';
import type { AgentRole, AgentInput } from '@/lib/agents/core/types';

// ============================================================================
// POST /api/agents - Process a request
// ============================================================================

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const { message, sessionId, userId, context, agentRole } = body as {
            message: string;
            sessionId?: string;
            userId?: string;
            context?: Record<string, unknown>;
            agentRole?: AgentRole;
        };

        if (!message) {
            return NextResponse.json(
                { error: { code: 'VALIDATION_ERROR', message: 'Message is required' } },
                { status: 400 }
            );
        }

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

        return NextResponse.json({
            success: true,
            data: {
                id: output.id,
                content: output.content,
                role: output.role,
                usage: output.usage,
                timestamp: output.timestamp,
            },
        });

    } catch (error) {
        const { error: errorData, status } = createErrorResponse(error);
        return NextResponse.json({ success: false, error: errorData }, { status });
    }
}

// ============================================================================
// GET /api/agents - Get agent status
// ============================================================================

export async function GET() {
    try {
        const manager = getAgentManager();
        const stats = manager.getStats();

        return NextResponse.json({
            success: true,
            data: stats,
        });

    } catch (error) {
        const { error: errorData, status } = createErrorResponse(error);
        return NextResponse.json({ success: false, error: errorData }, { status });
    }
}
