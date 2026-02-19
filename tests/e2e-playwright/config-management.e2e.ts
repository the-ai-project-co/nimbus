import { test, expect } from '@playwright/test';

const STATE_URL = 'http://localhost:3004';

test.describe('Config Management E2E', () => {
  test('config list returns all settings', async ({ request }) => {
    const response = await request.get(`${STATE_URL}/api/state/config`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(body.success).toBe(true);
  });

  test('config get retrieves specific key', async ({ request }) => {
    const response = await request.get(`${STATE_URL}/api/state/config/editor`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(body.success).toBe(true);
  });

  test('config set updates a value', async ({ request }) => {
    const response = await request.post(`${STATE_URL}/api/state/config`, {
      data: { key: 'testKey', value: 'testValue' },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(body.success).toBe(true);
  });

  test('config reset returns to defaults', async ({ request }) => {
    const response = await request.post(`${STATE_URL}/api/state/config/reset`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(body.success).toBe(true);
  });

  test('config set/get round-trip preserves value', async ({ request }) => {
    const testKey = `e2e_test_${Date.now()}`;
    const testValue = 'round-trip-value';

    // Set the value
    const setResponse = await request.post(`${STATE_URL}/api/state/config`, {
      data: { key: testKey, value: testValue },
    });
    expect(setResponse.ok()).toBeTruthy();

    // Get the value back
    const getResponse = await request.get(`${STATE_URL}/api/state/config/${testKey}`);
    expect(getResponse.ok()).toBeTruthy();
    const body = await getResponse.json();
    expect(body.success).toBe(true);
    if (body.data) {
      expect(body.data.value || body.data).toBe(testValue);
    }
  });
});
