import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        // Test environment
        environment: 'node',

        // Global setup
        globals: true,

        // Setup files
        setupFiles: ['./src/test/setup.ts'],

        // Include patterns
        include: [
            'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        ],

        // Exclude patterns
        exclude: [
            'node_modules',
            '.next',
            'e2e',
        ],

        // Coverage configuration
        coverage: {
            provider: 'v8',
            reporter: ['text', 'text-summary', 'json', 'html', 'lcov'],
            reportsDirectory: './coverage',

            // Included files for coverage
            include: [
                'src/lib/**/*.ts',
                'src/components/**/*.tsx',
            ],

            // Excluded files from coverage
            exclude: [
                'src/**/*.test.ts',
                'src/**/*.spec.ts',
                'src/test/**/*',
                'src/types/**/*',
                '**/*.d.ts',
                'node_modules/**',
            ],

            // Coverage thresholds - BLOCKING GATE
            thresholds: {
                global: {
                    lines: 80,
                    branches: 80,
                    functions: 80,
                    statements: 80,
                },
            },
        },

        // Timeout settings
        testTimeout: 10000,
        hookTimeout: 10000,

        // Reporter
        reporters: ['verbose'],

        // Parallel execution - using forks pool which is more compatible
        pool: 'forks',
    },

    // Path aliases matching tsconfig
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
