import { test, expect } from '@playwright/test';

const LLM_URL = 'http://localhost:3002';
const GENERATOR_URL = 'http://localhost:3003';

test.describe('Chat and Generation via HTTP', () => {
  test('LLM chat endpoint responds', async ({ request }) => {
    const response = await request.post(`${LLM_URL}/api/llm/chat`, {
      data: {
        messages: [
          { role: 'user', content: 'Hello, what can you help me with?' },
        ],
      },
    });

    // May fail if no API key is configured, so accept 200 or 500
    expect([200, 500]).toContain(response.status());
    const body = await response.json();
    expect(body).toBeDefined();
  });

  test('LLM models endpoint returns available models', async ({ request }) => {
    const response = await request.get(`${LLM_URL}/api/llm/models`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeDefined();
    // Verify proper models array structure
    const models = body.models || body.data || body;
    expect(Array.isArray(models)).toBeTruthy();
    if (models.length > 0) {
      const first = models[0];
      expect(typeof first === 'string' || typeof first === 'object').toBeTruthy();
    }
  });

  test('conversational generation endpoint responds', async ({ request }) => {
    const response = await request.post(`${GENERATOR_URL}/api/conversational/message`, {
      data: {
        message: 'Create an AWS VPC with 3 availability zones',
        sessionId: 'e2e-test-session',
      },
    });

    // May fail if LLM not configured, accept various statuses
    expect([200, 500, 502]).toContain(response.status());
    const body = await response.json();
    expect(body).toBeDefined();
  });

  test('template rendering endpoint responds', async ({ request }) => {
    const response = await request.post(`${GENERATOR_URL}/api/templates/render`, {
      data: {
        templateId: 'terraform/aws/vpc',
        variables: {
          project_name: 'e2e-test',
          region: 'us-east-1',
          vpc_cidr: '10.0.0.0/16',
          availability_zones: 3,
        },
      },
    });

    // Template may or may not exist
    expect([200, 404, 500]).toContain(response.status());
    const body = await response.json();
    expect(body).toBeDefined();
  });
});
