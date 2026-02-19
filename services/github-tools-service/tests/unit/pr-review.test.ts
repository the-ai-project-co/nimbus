import { describe, test, expect, beforeAll, beforeEach, afterAll, afterEach, spyOn } from 'bun:test';
import { startServer } from '../../src/server';
import { GitHubOperations } from '../../src/github/operations';

describe('PR Review Endpoint (POST /api/github/prs/:number/reviews)', () => {
  let server: any;
  const PORT = 13020;
  const AUTH_HEADER = { Authorization: 'Bearer test-token' };

  /** Spies attached to GitHubOperations.prototype for each test */
  const spies: Array<ReturnType<typeof spyOn>> = [];

  /** Helper to spy on a prototype method and track it for cleanup */
  function spyProto<K extends keyof GitHubOperations>(
    method: K,
    implementation: (...args: any[]) => any
  ) {
    const s = spyOn(GitHubOperations.prototype, method).mockImplementation(implementation as any);
    spies.push(s);
    return s;
  }

  beforeAll(async () => {
    server = await startServer(PORT);
  });

  afterAll(() => {
    server?.stop();
  });

  beforeEach(() => {
    spyProto('createPRReview', async () => ({
      id: 1,
      node_id: 'PRR_abc123',
      user: { login: 'reviewer', id: 42 },
      body: 'Looks good!',
      state: 'APPROVED',
      html_url: 'https://github.com/owner/repo/pull/1#pullrequestreview-1',
      submitted_at: '2025-01-01T00:00:00Z',
    }));
  });

  afterEach(() => {
    for (const s of spies) {
      s.mockRestore();
    }
    spies.length = 0;
  });

  test('should create an APPROVE review', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/github/prs/42/reviews`, {
      method: 'POST',
      headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: 'test-owner',
        repo: 'test-repo',
        event: 'APPROVE',
        body: 'Looks good!',
      }),
    });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe(1);
    expect(data.data.state).toBe('APPROVED');
  });

  test('should create a REQUEST_CHANGES review', async () => {
    spyProto('createPRReview', async () => ({
      id: 2,
      node_id: 'PRR_def456',
      user: { login: 'reviewer', id: 42 },
      body: 'Please fix the tests',
      state: 'CHANGES_REQUESTED',
      html_url: 'https://github.com/owner/repo/pull/1#pullrequestreview-2',
      submitted_at: '2025-01-01T00:00:00Z',
    }));

    const response = await fetch(`http://localhost:${PORT}/api/github/prs/42/reviews`, {
      method: 'POST',
      headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: 'test-owner',
        repo: 'test-repo',
        event: 'REQUEST_CHANGES',
        body: 'Please fix the tests',
      }),
    });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.state).toBe('CHANGES_REQUESTED');
  });

  test('should create a COMMENT review', async () => {
    spyProto('createPRReview', async () => ({
      id: 3,
      node_id: 'PRR_ghi789',
      user: { login: 'reviewer', id: 42 },
      body: 'Just a note',
      state: 'COMMENTED',
      html_url: 'https://github.com/owner/repo/pull/1#pullrequestreview-3',
      submitted_at: '2025-01-01T00:00:00Z',
    }));

    const response = await fetch(`http://localhost:${PORT}/api/github/prs/42/reviews`, {
      method: 'POST',
      headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: 'test-owner',
        repo: 'test-repo',
        event: 'COMMENT',
        body: 'Just a note',
      }),
    });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
  });

  test('should reject request without auth header', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/github/prs/42/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: 'test-owner',
        repo: 'test-repo',
        event: 'APPROVE',
      }),
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
  });

  test('should reject request without owner and repo', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/github/prs/42/reviews`, {
      method: 'POST',
      headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'APPROVE',
      }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('should reject request with invalid event type', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/github/prs/42/reviews`, {
      method: 'POST',
      headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: 'test-owner',
        repo: 'test-repo',
        event: 'INVALID_EVENT',
      }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('event is required');
  });

  test('should reject request with invalid JSON body', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/github/prs/42/reviews`, {
      method: 'POST',
      headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('should reject request without event field', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/github/prs/42/reviews`, {
      method: 'POST',
      headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: 'test-owner',
        repo: 'test-repo',
      }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('should handle API errors gracefully', async () => {
    spyProto('createPRReview', async () => {
      const err: any = new Error('Not Found');
      err.status = 404;
      throw err;
    });

    const response = await fetch(`http://localhost:${PORT}/api/github/prs/999/reviews`, {
      method: 'POST',
      headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: 'test-owner',
        repo: 'test-repo',
        event: 'APPROVE',
      }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Not Found');
  });
});
