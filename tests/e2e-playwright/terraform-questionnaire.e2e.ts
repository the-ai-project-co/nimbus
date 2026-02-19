import { test, expect } from '@playwright/test';

const GENERATOR_URL = 'http://localhost:3003';

test.describe('Terraform Questionnaire Flow', () => {
  test('start questionnaire session', async ({ request }) => {
    const response = await request.post(`${GENERATOR_URL}/api/questionnaire/start`, {
      data: { type: 'terraform' },
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.sessionId || body.data.session_id).toBeDefined();
  });

  test('submit questionnaire answers', async ({ request }) => {
    // Start session
    const startRes = await request.post(`${GENERATOR_URL}/api/questionnaire/start`, {
      data: { type: 'terraform' },
    });
    const startBody = await startRes.json();
    const sessionId = startBody.data?.sessionId || startBody.data?.session_id;

    if (!sessionId) {
      test.skip();
      return;
    }

    // Submit an answer
    const answerRes = await request.post(`${GENERATOR_URL}/api/questionnaire/answer`, {
      data: {
        sessionId,
        questionId: 'provider',
        answer: 'aws',
      },
    });

    expect(answerRes.ok()).toBeTruthy();
    const answerBody = await answerRes.json();
    expect(answerBody.success).toBe(true);
  });

  test('get questionnaire session state', async ({ request }) => {
    // Start session
    const startRes = await request.post(`${GENERATOR_URL}/api/questionnaire/start`, {
      data: { type: 'terraform' },
    });
    const startBody = await startRes.json();
    const sessionId = startBody.data?.sessionId || startBody.data?.session_id;

    if (!sessionId) {
      test.skip();
      return;
    }

    // Get session
    const getRes = await request.get(`${GENERATOR_URL}/api/questionnaire/session/${sessionId}`);
    expect(getRes.ok()).toBeTruthy();
    const getBody = await getRes.json();
    expect(getBody.success).toBe(true);
  });
});
