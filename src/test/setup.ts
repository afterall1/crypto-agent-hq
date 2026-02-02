/**
 * Global Test Setup
 * 
 * This file is automatically executed before all tests.
 * It sets up MSW for API mocking and configures the test environment.
 */

import { server } from './mocks/server';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

// Establish API mocking before all tests
beforeAll(() => {
    server.listen({ onUnhandledRequest: 'warn' });
});

// Reset any request handlers that we may add during the tests
afterEach(() => {
    server.resetHandlers();
    vi.clearAllMocks();
});

// Clean up after the tests are finished
afterAll(() => {
    server.close();
});

// Mock environment variables
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');
