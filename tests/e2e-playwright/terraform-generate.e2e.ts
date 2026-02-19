import { test, expect } from '@playwright/test';

const GENERATOR_URL = 'http://localhost:3003';

test.describe('Terraform Generate E2E', () => {
  test('generator health check', async ({ request }) => {
    const response = await request.get(`${GENERATOR_URL}/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('healthy');
  });

  test('start generation session', async ({ request }) => {
    const response = await request.post(`${GENERATOR_URL}/api/generate/session`, {
      data: { provider: 'aws', components: ['vpc'] },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(body.success).toBe(true);
  });

  test('list available templates', async ({ request }) => {
    const response = await request.get(`${GENERATOR_URL}/api/generate/templates`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(body.success).toBe(true);
  });
});
