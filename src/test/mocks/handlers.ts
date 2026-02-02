/**
 * MSW Request Handlers
 * 
 * Define mock API handlers for testing.
 * These handlers intercept network requests and return mock responses.
 */

import { http, HttpResponse } from 'msw';

// Base URLs
const SUPABASE_URL = 'https://test.supabase.co';
const ANTHROPIC_URL = 'https://api.anthropic.com';

/**
 * Supabase API Handlers
 */
const supabaseHandlers = [
    // Health check
    http.get(`${SUPABASE_URL}/rest/v1/`, () => {
        return HttpResponse.json({ status: 'ok' });
    }),

    // Auth endpoints
    http.post(`${SUPABASE_URL}/auth/v1/token`, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        return HttpResponse.json({
            access_token: 'mock-access-token',
            token_type: 'bearer',
            expires_in: 3600,
            refresh_token: 'mock-refresh-token',
            user: {
                id: 'mock-user-id',
                email: body.email || 'test@example.com',
            },
        });
    }),

    http.post(`${SUPABASE_URL}/auth/v1/logout`, () => {
        return HttpResponse.json({ success: true });
    }),
];

/**
 * Anthropic API Handlers
 */
const anthropicHandlers = [
    // Messages endpoint
    http.post(`${ANTHROPIC_URL}/v1/messages`, async () => {
        return HttpResponse.json({
            id: 'mock-message-id',
            type: 'message',
            role: 'assistant',
            content: [
                {
                    type: 'text',
                    text: 'This is a mock response from Claude for testing purposes.',
                },
            ],
            model: 'claude-3-5-sonnet-20241022',
            stop_reason: 'end_turn',
            usage: {
                input_tokens: 100,
                output_tokens: 50,
            },
        });
    }),
];

/**
 * Memory System Handlers (for internal API routes)
 */
const memoryHandlers = [
    // Memory reload endpoint (if exists as API route)
    http.post('/api/memory/reload', () => {
        return HttpResponse.json({
            success: true,
            context: {
                hot: { currentTask: 'Test Task', taskStatus: 'running' },
                warm: { sessionSummary: 'Test session' },
                cold: { snapshotPath: '/test/path' },
            },
        });
    }),

    // Memory sync endpoint
    http.post('/api/memory/sync', () => {
        return HttpResponse.json({
            success: true,
            snapshotPath: '/test/snapshot.json',
            timestamp: new Date().toISOString(),
        });
    }),
];

/**
 * All handlers combined
 */
export const handlers = [
    ...supabaseHandlers,
    ...anthropicHandlers,
    ...memoryHandlers,
];
