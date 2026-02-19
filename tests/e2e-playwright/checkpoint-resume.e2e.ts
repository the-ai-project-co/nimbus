import { test, expect } from '@playwright/test';

const STATE_URL = 'http://localhost:3004';

test.describe('Checkpoint Resume E2E', () => {
  const operationId = `e2e-test-${Date.now()}`;
  let checkpointId: string | null = null;

  test('save a checkpoint', async ({ request }) => {
    const response = await request.post(`${STATE_URL}/api/state/checkpoints`, {
      data: {
        operationId,
        step: 1,
        state: { phase: 'planning', progress: 25 },
        metadata: { description: 'E2E test checkpoint step 1' },
      },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    if (body.data?.id) {
      checkpointId = body.data.id;
    }
  });

  test('get checkpoint by ID', async ({ request }) => {
    if (!checkpointId) { test.skip(); return; }
    const response = await request.get(`${STATE_URL}/api/state/checkpoints/${checkpointId}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data?.operationId).toBe(operationId);
    expect(body.data?.step).toBe(1);
  });

  test('get latest checkpoint for operation', async ({ request }) => {
    const response = await request.get(`${STATE_URL}/api/state/checkpoints/latest/${operationId}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data?.step).toBe(1);
  });

  test('save second checkpoint', async ({ request }) => {
    const response = await request.post(`${STATE_URL}/api/state/checkpoints`, {
      data: {
        operationId,
        step: 2,
        state: { phase: 'executing', progress: 50 },
        metadata: { description: 'E2E test checkpoint step 2' },
      },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test('latest checkpoint returns step 2', async ({ request }) => {
    const response = await request.get(`${STATE_URL}/api/state/checkpoints/latest/${operationId}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data?.step).toBe(2);
  });

  test('list all checkpoints for operation', async ({ request }) => {
    const response = await request.get(`${STATE_URL}/api/state/checkpoints/list/${operationId}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(2);
  });

  test('delete checkpoints for operation', async ({ request }) => {
    const response = await request.delete(`${STATE_URL}/api/state/checkpoints/${operationId}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
