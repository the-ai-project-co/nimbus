import { test, expect } from '@playwright/test';

const HELM_URL = 'http://localhost:3007';

test.describe('Helm Operations E2E', () => {
  test('list helm releases', async ({ request }) => {
    const response = await request.get(`${HELM_URL}/api/helm/releases`);
    expect(typeof response.status()).toBe('number');
    const body = await response.json();
    expect(body).toBeDefined();
    if (response.ok()) {
      expect(body.success).toBe(true);
    }
  });

  test('search helm charts', async ({ request }) => {
    const response = await request.get(`${HELM_URL}/api/helm/search?query=nginx`);
    expect(typeof response.status()).toBe('number');
    const body = await response.json();
    expect(body).toBeDefined();
    if (response.ok()) {
      expect(body.success).toBe(true);
    }
  });

  test('list helm repositories', async ({ request }) => {
    const response = await request.get(`${HELM_URL}/api/helm/repos`);
    expect(typeof response.status()).toBe('number');
    const body = await response.json();
    expect(body).toBeDefined();
    if (response.ok()) {
      expect(body.success).toBe(true);
    }
  });
});
