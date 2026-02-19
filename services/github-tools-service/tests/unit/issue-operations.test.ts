import { describe, test, expect, beforeAll, afterAll, afterEach, spyOn } from 'bun:test';
import { startServer } from '../../src/server';
import { GitHubOperations } from '../../src/github/operations';

describe('Issue Operations', () => {
  let server: any;
  const PORT = 3301;
  const AUTH = { Authorization: 'Bearer ghp_test_token' };

  const spies: Array<ReturnType<typeof spyOn>> = [];
  function spy<K extends keyof GitHubOperations>(method: K, impl: (...args: any[]) => any) {
    const s = spyOn(GitHubOperations.prototype, method).mockImplementation(impl as any);
    spies.push(s);
    return s;
  }

  beforeAll(async () => { server = await startServer(PORT); });
  afterAll(() => { server?.stop(); });
  afterEach(() => { for (const s of spies) s.mockRestore(); spies.length = 0; });

  describe('GET /api/github/issues - List Issues', () => {
    test('returns list of open issues', async () => {
      spy('listIssues', async () => [
        { number: 1, title: 'Bug: login broken', state: 'open', user: { login: 'alice' } },
        { number: 2, title: 'Feature request', state: 'open', user: { login: 'bob' } },
      ]);

      const res = await fetch(`http://localhost:${PORT}/api/github/issues?owner=myorg&repo=myrepo`, {
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
    });

    test('returns 401 without authorization', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/issues?owner=myorg&repo=myrepo`);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.success).toBe(false);
    });

    test('returns 400 when owner and repo are missing', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/issues`, {
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('filters issues by state', async () => {
      spy('listIssues', async (owner: string, repo: string, state: string) => {
        expect(state).toBe('all');
        return [];
      });

      const res = await fetch(`http://localhost:${PORT}/api/github/issues?owner=myorg&repo=myrepo&state=all`, {
        headers: AUTH,
      });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/github/issues/:number - Get Issue', () => {
    test('returns a specific issue', async () => {
      spy('getIssue', async () => ({
        number: 5,
        title: 'Critical bug in production',
        state: 'open',
        body: 'The app crashes on login',
        labels: [{ name: 'bug' }],
      }));

      const res = await fetch(`http://localhost:${PORT}/api/github/issues/5?owner=myorg&repo=myrepo`, {
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.number).toBe(5);
      expect(data.data.title).toBe('Critical bug in production');
    });

    test('returns 400 when owner/repo missing for get issue', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/issues/5`, {
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('handles 404 from GitHub API', async () => {
      spy('getIssue', async () => {
        const err: any = new Error('Issue not found');
        err.status = 404;
        throw err;
      });

      const res = await fetch(`http://localhost:${PORT}/api/github/issues/9999?owner=myorg&repo=myrepo`, {
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });

  describe('POST /api/github/issues - Create Issue', () => {
    test('creates a new issue', async () => {
      spy('createIssue', async () => ({
        number: 15,
        title: 'New bug report',
        html_url: 'https://github.com/myorg/myrepo/issues/15',
        state: 'open',
      }));

      const res = await fetch(`http://localhost:${PORT}/api/github/issues`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'myorg',
          repo: 'myrepo',
          title: 'New bug report',
          body: 'Steps to reproduce...',
          labels: ['bug', 'priority-high'],
        }),
      });
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.number).toBe(15);
    });

    test('returns 400 when title is missing', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/issues`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'myorg',
          repo: 'myrepo',
          // missing title
        }),
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('returns 401 without auth for issue creation', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: 'myorg', repo: 'myrepo', title: 'test' }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/github/issues/:number/close - Close Issue', () => {
    test('closes an issue successfully', async () => {
      spy('closeIssue', async () => ({
        number: 5,
        title: 'Old bug',
        state: 'closed',
      }));

      const res = await fetch(`http://localhost:${PORT}/api/github/issues/5/close?owner=myorg&repo=myrepo`, {
        method: 'PUT',
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.state).toBe('closed');
    });

    test('returns 400 when owner/repo missing for close', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/issues/5/close`, {
        method: 'PUT',
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('POST /api/github/issues/:number/comments - Add Comment', () => {
    test('adds a comment to an issue', async () => {
      spy('addComment', async () => ({
        id: 100,
        body: 'This is a comment',
        user: { login: 'alice' },
        created_at: '2025-01-01T00:00:00Z',
      }));

      const res = await fetch(`http://localhost:${PORT}/api/github/issues/5/comments`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'myorg',
          repo: 'myrepo',
          body: 'This is a comment',
        }),
      });
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(100);
    });

    test('returns 400 when comment body is missing', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/issues/5/comments`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'myorg',
          repo: 'myrepo',
          // missing body
        }),
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });
});
