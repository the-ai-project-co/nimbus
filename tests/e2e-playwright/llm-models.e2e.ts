import { test, expect } from '@playwright/test';

const LLM_URL = 'http://localhost:3002';

test.describe('LLM Models E2E', () => {
  test('list available models', async ({ request }) => {
    const response = await request.get(`${LLM_URL}/api/llm/models`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(body.success).toBe(true);
  });

  test('list available providers', async ({ request }) => {
    const response = await request.get(`${LLM_URL}/api/llm/providers`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(body.success).toBe(true);
  });

  test('token count endpoint', async ({ request }) => {
    const response = await request.post(`${LLM_URL}/api/llm/tokens/count`, {
      data: { text: 'Hello world', provider: 'openai' },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    expect(body.success).toBe(true);
  });

  test('models response contains provider information', async ({ request }) => {
    const response = await request.get(`${LLM_URL}/api/llm/models`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    if (body.data && Array.isArray(body.data)) {
      for (const model of body.data) {
        // Each model should have a provider key
        if (model.provider) {
          expect(typeof model.provider).toBe('string');
          expect(model.provider.length).toBeGreaterThan(0);
        }
        // Each model should have a name/id
        if (model.name || model.id) {
          expect(typeof (model.name || model.id)).toBe('string');
        }
      }
    }
  });
});
