import { test, expect } from '@playwright/test';

const STATE_URL = 'http://localhost:3004';

test.describe('State Persistence E2E', () => {
  test('list projects', async ({ request }) => {
    const response = await request.get(`${STATE_URL}/api/state/projects`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(body.success).toBe(true);
  });

  test('get history', async ({ request }) => {
    const response = await request.get(`${STATE_URL}/api/state/history`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(body.success).toBe(true);
  });

  test('list templates', async ({ request }) => {
    const response = await request.get(`${STATE_URL}/api/state/templates`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(body.success).toBe(true);
  });
});
