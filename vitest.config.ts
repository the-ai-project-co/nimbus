import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],

    // Forked processes prevent globalThis.fetch mutations (stream-with-tools.test.ts)
    // from leaking between test files.
    pool: 'forks',

    globals: false,
    testTimeout: 30000,
    reporter: ['verbose'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
      include: ['src/**/*.ts'],
      exclude: [
        'src/__tests__/**',
        'src/build.ts',
        'node_modules/**',
      ],
    },
  },
});
