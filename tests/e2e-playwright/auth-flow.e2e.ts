import { test, expect } from '@playwright/test';

const AUTH_URL = 'http://localhost:3012';

test.describe('Auth Flow E2E', () => {
  test('auth health check', async ({ request }) => {
    const response = await request.get(`${AUTH_URL}/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('healthy');
  });

  test('initiate device auth flow', async ({ request }) => {
    const response = await request.post(`${AUTH_URL}/api/auth/device/start`, {
      data: { provider: 'github' },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(body.success).toBe(true);
  });

  test('validate token format', async ({ request }) => {
    const response = await request.post(`${AUTH_URL}/api/auth/validate`, {
      data: { token: 'test-invalid-token' },
    });
    expect(typeof response.status()).toBe('number');
    const body = await response.json();
    expect(body).toBeDefined();
    // An invalid token should return 401 or an error in the response body
    if (response.status() === 401) {
      expect(response.ok()).toBeFalsy();
    } else {
      expect(body.success === false || body.error !== undefined).toBeTruthy();
    }
  });
});
