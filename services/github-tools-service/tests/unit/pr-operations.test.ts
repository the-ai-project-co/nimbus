import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, spyOn } from 'bun:test';
import { startServer } from '../../src/server';
import { GitHubOperations } from '../../src/github/operations';

describe('PR Operations', () => {
  let server: any;
  const PORT = 3300;
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

  describe('GET /api/github/prs - List PRs', () => {
    test('returns list of open PRs', async () => {
      spy('listPRs', async () => [
        { number: 1, title: 'feat: add login', state: 'open', user: { login: 'alice' } },
        { number: 2, title: 'fix: typo', state: 'open', user: { login: 'bob' } },
      ]);

      const res = await fetch(`http://localhost:${PORT}/api/github/prs?owner=myorg&repo=myrepo`, {
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].number).toBe(1);
    });

    test('returns 401 without authorization header', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/prs?owner=myorg&repo=myrepo`);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.success).toBe(false);
    });

    test('returns 400 when owner is missing', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/prs?repo=myrepo`, {
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('filters PRs by state', async () => {
      spy('listPRs', async (owner: string, repo: string, state: string) => {
        expect(state).toBe('closed');
        return [{ number: 3, title: 'old fix', state: 'closed' }];
      });

      const res = await fetch(`http://localhost:${PORT}/api/github/prs?owner=myorg&repo=myrepo&state=closed`, {
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data).toHaveLength(1);
    });
  });

  describe('GET /api/github/prs/:number - Get PR', () => {
    test('returns a specific PR by number', async () => {
      spy('getPR', async () => ({
        number: 42,
        title: 'feat: implement auth',
        state: 'open',
        head: { ref: 'feat/auth' },
        base: { ref: 'main' },
      }));

      const res = await fetch(`http://localhost:${PORT}/api/github/prs/42?owner=myorg&repo=myrepo`, {
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.number).toBe(42);
    });

    test('returns 401 without auth for PR fetch', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/prs/42?owner=myorg&repo=myrepo`);
      expect(res.status).toBe(401);
    });

    test('handles GitHub API error', async () => {
      spy('getPR', async () => {
        const err: any = new Error('Not Found');
        err.status = 404;
        throw err;
      });

      const res = await fetch(`http://localhost:${PORT}/api/github/prs/999?owner=myorg&repo=myrepo`, {
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });

  describe('POST /api/github/prs - Create PR', () => {
    test('creates a PR successfully', async () => {
      spy('createPR', async () => ({
        number: 10,
        title: 'Add new feature',
        html_url: 'https://github.com/myorg/myrepo/pull/10',
        state: 'open',
      }));

      const res = await fetch(`http://localhost:${PORT}/api/github/prs`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'myorg',
          repo: 'myrepo',
          title: 'Add new feature',
          head: 'feature-branch',
          base: 'main',
          body: 'This adds a great feature',
        }),
      });
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.number).toBe(10);
    });

    test('returns 400 when title is missing', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/prs`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'myorg',
          repo: 'myrepo',
          head: 'feature-branch',
          base: 'main',
          // missing title
        }),
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('returns 400 for invalid JSON body', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/prs`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: 'not-valid-json',
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('POST /api/github/prs/:number/merge - Merge PR', () => {
    test('merges a PR successfully', async () => {
      spy('mergePR', async () => ({
        sha: 'abc123def456',
        merged: true,
        message: 'Pull Request successfully merged',
      }));

      const res = await fetch(`http://localhost:${PORT}/api/github/prs/42/merge`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'myorg',
          repo: 'myrepo',
          merge_method: 'squash',
        }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.merged).toBe(true);
    });

    test('returns 400 when owner/repo are missing for merge', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/prs/42/merge`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ merge_method: 'squash' }),
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });
});
