import { test, expect } from '@playwright/test';

const BILLING_URL = 'http://localhost:3013';

test.describe('Billing Usage E2E', () => {
  test('billing health check', async ({ request }) => {
    const response = await request.get(`${BILLING_URL}/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('healthy');
  });

  test('get billing status', async ({ request }) => {
    const response = await request.get(`${BILLING_URL}/api/billing/status`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(body.success).toBe(true);
  });

  test('record usage event', async ({ request }) => {
    const response = await request.post(`${BILLING_URL}/api/billing/usage`, {
      data: { event: 'api_call', metadata: { provider: 'openai' } },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(body.success).toBe(true);
  });

  test('get usage summary', async ({ request }) => {
    const response = await request.get(`${BILLING_URL}/api/billing/usage/summary`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(body.success).toBe(true);
  });
});
