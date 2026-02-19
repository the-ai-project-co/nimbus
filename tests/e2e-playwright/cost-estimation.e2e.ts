import { test, expect } from '@playwright/test';

const CORE_URL = 'http://localhost:3001';

test.describe('Cost Estimation E2E', () => {
  test('core engine health check', async ({ request }) => {
    const response = await request.get(`${CORE_URL}/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('healthy');
  });

  test('cost estimation endpoint', async ({ request }) => {
    const response = await request.post(`${CORE_URL}/api/engine/estimate`, {
      data: { directory: '/tmp', provider: 'aws' },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(body.success).toBe(true);
  });
});
