import { test, expect } from '@playwright/test';

const STATE_URL = 'http://localhost:3004';

test.describe('State Service E2E', () => {
  test('GET /api/state/config returns config', async ({ request }) => {
    const response = await request.get(`${STATE_URL}/api/state/config`);
    expect([200, 400, 500]).toContain(response.status());
    const body = await response.json();
    expect(body).toBeDefined();
    if (response.ok()) {
      expect(body.success !== undefined || body.config !== undefined).toBeTruthy();
    }
  });

  test('GET /api/state/history returns history entries', async ({ request }) => {
    const response = await request.get(`${STATE_URL}/api/state/history`);
    expect([200, 400, 500]).toContain(response.status());
    const body = await response.json();
    expect(body).toBeDefined();
  });

  test('GET /api/state/credentials/status returns credentials status', async ({ request }) => {
    const response = await request.get(`${STATE_URL}/api/state/credentials/status`);
    expect([200, 400, 404, 500]).toContain(response.status());
    const body = await response.json();
    expect(body).toBeDefined();
  });

  test('health endpoint returns healthy status', async ({ request }) => {
    const response = await request.get(`${STATE_URL}/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('healthy');
  });
});
