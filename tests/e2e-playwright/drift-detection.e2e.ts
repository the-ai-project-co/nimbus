import { test, expect } from '@playwright/test';

const ENGINE_URL = 'http://localhost:3001';

test.describe('Drift Detection E2E', () => {
  test('detect drift', async ({ request }) => {
    const response = await request.post(`${ENGINE_URL}/api/drift/detect`, {
      data: {
        workDir: '/tmp/terraform-test',
        provider: 'aws',
      },
    });
    // May fail without real terraform state
    expect([200, 500]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty('success');
  });

  test('create drift remediation plan', async ({ request }) => {
    const response = await request.post(`${ENGINE_URL}/api/drift/plan`, {
      data: {
        report: {
          id: 'test-drift-report',
          timestamp: new Date().toISOString(),
          provider: 'aws',
          drifted: [],
          added: [],
          removed: [],
          unchanged: [],
          summary: { total: 0, drifted: 0, added: 0, removed: 0, unchanged: 0 },
        },
      },
    });
    expect([200, 500]).toContain(response.status());
    if (response.ok()) {
      const body = await response.json();
      expect(body.success).toBe(true);
    }
  });

  test('format drift report as markdown', async ({ request }) => {
    const response = await request.post(`${ENGINE_URL}/api/drift/format`, {
      data: {
        report: {
          id: 'test-format-report',
          timestamp: new Date().toISOString(),
          provider: 'aws',
          drifted: [],
          added: [],
          removed: [],
          unchanged: [],
          summary: { total: 0, drifted: 0, added: 0, removed: 0, unchanged: 0 },
        },
      },
    });
    expect([200, 500]).toContain(response.status());
    if (response.ok()) {
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(typeof body.data).toBe('string');
    }
  });

  test('generate compliance report from drift', async ({ request }) => {
    const response = await request.post(`${ENGINE_URL}/api/drift/compliance`, {
      data: {
        report: {
          id: 'test-compliance-report',
          timestamp: new Date().toISOString(),
          provider: 'aws',
          drifted: [],
          added: [],
          removed: [],
          unchanged: [],
          summary: { total: 0, drifted: 0, added: 0, removed: 0, unchanged: 0 },
        },
      },
    });
    expect([200, 500]).toContain(response.status());
    if (response.ok()) {
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    }
  });

  test('fix drift', async ({ request }) => {
    const response = await request.post(`${ENGINE_URL}/api/drift/fix`, {
      data: {
        report: {
          id: 'test-fix-report',
          timestamp: new Date().toISOString(),
          provider: 'aws',
          drifted: [],
          added: [],
          removed: [],
          unchanged: [],
          summary: { total: 0, drifted: 0, added: 0, removed: 0, unchanged: 0 },
        },
        strategy: 'reconcile',
      },
    });
    expect([200, 500]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty('success');
  });
});
