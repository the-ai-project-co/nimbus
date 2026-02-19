import { test, expect } from '@playwright/test';

const K8S_URL = 'http://localhost:3006';

test.describe('K8s Operations E2E', () => {
  test('list namespaces', async ({ request }) => {
    const response = await request.get(`${K8S_URL}/api/k8s/namespaces`);
    expect(typeof response.status()).toBe('number');
    const body = await response.json();
    expect(body).toBeDefined();
    if (response.ok()) {
      expect(body.success).toBe(true);
    }
  });

  test('get pods in default namespace', async ({ request }) => {
    const response = await request.get(`${K8S_URL}/api/k8s/pods?namespace=default`);
    expect(typeof response.status()).toBe('number');
    const body = await response.json();
    expect(body).toBeDefined();
    if (response.ok()) {
      expect(body.success).toBe(true);
    }
  });

  test('validate manifest dry-run', async ({ request }) => {
    const response = await request.post(`${K8S_URL}/api/k8s/validate`, {
      data: { manifest: 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: test' },
    });
    expect(typeof response.status()).toBe('number');
    const body = await response.json();
    expect(body).toBeDefined();
    if (response.ok()) {
      expect(body.success).toBe(true);
    }
  });
});
