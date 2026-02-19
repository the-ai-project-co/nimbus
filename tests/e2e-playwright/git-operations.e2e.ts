import { test, expect } from '@playwright/test';

const GIT_URL = 'http://localhost:3008';

test.describe('Git Operations E2E', () => {
  test('get git status', async ({ request }) => {
    const response = await request.get(`${GIT_URL}/api/git/status?directory=/tmp`);
    expect(typeof response.status()).toBe('number');
    const body = await response.json();
    expect(body).toBeDefined();
    if (response.ok()) {
      expect(body.success).toBe(true);
    }
  });

  test('get git log', async ({ request }) => {
    const response = await request.get(`${GIT_URL}/api/git/log?directory=/tmp&limit=5`);
    expect(typeof response.status()).toBe('number');
    const body = await response.json();
    expect(body).toBeDefined();
    if (response.ok()) {
      expect(body.success).toBe(true);
    }
  });

  test('list branches', async ({ request }) => {
    const response = await request.get(`${GIT_URL}/api/git/branches?directory=/tmp`);
    expect(typeof response.status()).toBe('number');
    const body = await response.json();
    expect(body).toBeDefined();
    if (response.ok()) {
      expect(body.success).toBe(true);
    }
  });
});
