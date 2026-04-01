import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    env: {
      LOG_LEVEL: 'warn',
    },

    // forks pool isolates globalThis.fetch mutations between test files
    // but can cause EPIPE in CI when child processes write after stdout closes.
    // Using threads with isolate:true gives the same module isolation without EPIPE.
    pool: 'threads',
    poolOptions: {
      threads: {
        isolate: true,
      },
    },

    globals: false,
    testTimeout: 30000,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'test/**',
        'src/build.ts',
        'node_modules/**',
      ],
    },
  },
});
