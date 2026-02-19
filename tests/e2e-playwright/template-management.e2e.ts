import { test, expect } from '@playwright/test';

const STATE_URL = 'http://localhost:3004';

test.describe('Template Management E2E', () => {
  let createdTemplateId: string | null = null;

  test('list templates returns success', async ({ request }) => {
    const response = await request.get(`${STATE_URL}/api/state/templates`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test('create a template', async ({ request }) => {
    const response = await request.post(`${STATE_URL}/api/state/templates`, {
      data: {
        name: 'e2e-test-template',
        type: 'terraform',
        content: 'resource "aws_instance" "test" { ami = "ami-12345" }',
        variables: { region: 'us-east-1' },
      },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    if (body.data?.id) {
      createdTemplateId = body.data.id;
    }
  });

  test('get template by ID', async ({ request }) => {
    if (!createdTemplateId) {
      test.skip();
      return;
    }
    const response = await request.get(`${STATE_URL}/api/state/templates/${createdTemplateId}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data?.name).toBe('e2e-test-template');
  });

  test('list templates includes created template', async ({ request }) => {
    const response = await request.get(`${STATE_URL}/api/state/templates`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    if (createdTemplateId && Array.isArray(body.data)) {
      const found = body.data.find((t: any) => t.id === createdTemplateId);
      expect(found).toBeDefined();
    }
  });

  test('delete template', async ({ request }) => {
    if (!createdTemplateId) {
      test.skip();
      return;
    }
    const response = await request.delete(`${STATE_URL}/api/state/templates/${createdTemplateId}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
