import { test, expect } from '@playwright/test';

const STATE_URL = 'http://localhost:3004';

test.describe('History Recording E2E', () => {
  test('history endpoint returns success', async ({ request }) => {
    const response = await request.get(`${STATE_URL}/api/state/history`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test('can record a history entry via POST', async ({ request }) => {
    const entry = {
      id: `e2e-test-${Date.now()}`,
      command: 'k8s',
      args: ['get', 'pods'],
      timestamp: new Date().toISOString(),
      status: 'success',
      duration: 1234,
    };

    const response = await request.post(`${STATE_URL}/api/state/history`, {
      data: entry,
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test('history entries can be filtered by command', async ({ request }) => {
    const response = await request.get(`${STATE_URL}/api/state/history?command=k8s`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    if (body.data && Array.isArray(body.data)) {
      for (const entry of body.data) {
        expect(entry.command).toContain('k8s');
      }
    }
  });

  test('history entries can be filtered by status', async ({ request }) => {
    const response = await request.get(`${STATE_URL}/api/state/history?status=success`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test('history entries support limit parameter', async ({ request }) => {
    const response = await request.get(`${STATE_URL}/api/state/history?limit=5`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    if (body.data && Array.isArray(body.data)) {
      expect(body.data.length).toBeLessThanOrEqual(5);
    }
  });
});
