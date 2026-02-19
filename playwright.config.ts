import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e-playwright',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3001',
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },
  projects: [
    {
      name: 'api',
      testMatch: '**/*.e2e.ts',
    },
  ],
});
