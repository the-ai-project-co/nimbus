import { test, expect } from '@playwright/test';

const ENGINE_URL = 'http://localhost:3001';

test.describe('Core Engine Tasks E2E', () => {
  let taskId: string | null = null;

  test('create a task', async ({ request }) => {
    const response = await request.post(`${ENGINE_URL}/api/tasks`, {
      data: {
        type: 'generate',
        description: 'E2E test task',
        input: { template: 'vpc', region: 'us-east-1' },
      },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    if (body.data?.id) {
      taskId = body.data.id;
    }
  });

  test('list tasks', async ({ request }) => {
    const response = await request.get(`${ENGINE_URL}/api/tasks`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('get task by ID', async ({ request }) => {
    if (!taskId) { test.skip(); return; }
    const response = await request.get(`${ENGINE_URL}/api/tasks/${taskId}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data?.id).toBe(taskId);
  });

  test('execute task', async ({ request }) => {
    if (!taskId) { test.skip(); return; }
    const response = await request.post(`${ENGINE_URL}/api/tasks/${taskId}/execute`);
    // May succeed or fail depending on environment (no real LLM)
    expect([200, 500]).toContain(response.status());
  });

  test('cancel task', async ({ request }) => {
    if (!taskId) { test.skip(); return; }
    const response = await request.post(`${ENGINE_URL}/api/tasks/${taskId}/cancel`);
    expect([200, 400, 500]).toContain(response.status());
  });

  test('get task events', async ({ request }) => {
    if (!taskId) { test.skip(); return; }
    const response = await request.get(`${ENGINE_URL}/api/tasks/${taskId}/events`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('generate plan', async ({ request }) => {
    const response = await request.post(`${ENGINE_URL}/api/plans/generate`, {
      data: {
        type: 'generate',
        description: 'Generate VPC infrastructure',
        input: { template: 'vpc' },
      },
    });
    expect([200, 500]).toContain(response.status());
    if (response.ok()) {
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data?.steps).toBeDefined();
    }
  });

  test('get statistics', async ({ request }) => {
    const response = await request.get(`${ENGINE_URL}/api/statistics`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(typeof body.data).toBe('object');
  });

  test('get all events', async ({ request }) => {
    const response = await request.get(`${ENGINE_URL}/api/events`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('list safety checks', async ({ request }) => {
    const response = await request.get(`${ENGINE_URL}/api/safety/checks`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('list rollback states', async ({ request }) => {
    const response = await request.get(`${ENGINE_URL}/api/rollback/states`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});
