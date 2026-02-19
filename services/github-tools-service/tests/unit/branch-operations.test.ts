import { describe, test, expect, beforeAll, afterAll, afterEach, spyOn } from 'bun:test';
import { startServer } from '../../src/server';
import { GitHubOperations } from '../../src/github/operations';

describe('Branch Operations', () => {
  let server: any;
  const PORT = 3302;
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

  describe('GET /api/github/repos/branches - List Branches', () => {
    test('returns list of branches', async () => {
      spy('listBranches', async () => [
        { name: 'main', commit: { sha: 'abc123' }, protected: true },
        { name: 'develop', commit: { sha: 'def456' }, protected: false },
        { name: 'feature/auth', commit: { sha: 'ghi789' }, protected: false },
      ]);

      const res = await fetch(`http://localhost:${PORT}/api/github/repos/branches?owner=myorg&repo=myrepo`, {
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(3);
      expect(data.data[0].name).toBe('main');
    });

    test('returns 401 without authorization', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/repos/branches?owner=myorg&repo=myrepo`);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.success).toBe(false);
    });

    test('returns 400 when owner is missing', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/repos/branches?repo=myrepo`, {
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('returns 400 when repo is missing', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/repos/branches?owner=myorg`, {
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('handles GitHub API error for branch listing', async () => {
      spy('listBranches', async () => {
        const err: any = new Error('Repository not found');
        err.status = 404;
        throw err;
      });

      const res = await fetch(`http://localhost:${PORT}/api/github/repos/branches?owner=myorg&repo=nonexistent`, {
        headers: AUTH,
      });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });

  describe('POST /api/github/repos/branches - Create Branch', () => {
    test('creates a new branch', async () => {
      spy('createBranch', async () => ({
        ref: 'refs/heads/feature/new-ui',
        object: { sha: 'abc123def456' },
      }));

      const res = await fetch(`http://localhost:${PORT}/api/github/repos/branches`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'myorg',
          repo: 'myrepo',
          branch: 'feature/new-ui',
          sha: 'abc123def456',
        }),
      });
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.ref).toBe('refs/heads/feature/new-ui');
    });

    test('returns 400 when branch name is missing', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/repos/branches`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'myorg',
          repo: 'myrepo',
          sha: 'abc123',
          // missing branch
        }),
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('returns 400 when SHA is missing', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/repos/branches`, {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'myorg',
          repo: 'myrepo',
          branch: 'feature/new-ui',
          // missing sha
        }),
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('returns 401 without auth for branch creation', async () => {
      const res = await fetch(`http://localhost:${PORT}/api/github/repos/branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'myorg',
          repo: 'myrepo',
          branch: 'test-branch',
          sha: 'abc123',
        }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/github/repos/branches - Delete Branch', () => {
    test('deletes a branch successfully', async () => {
      spy('deleteBranch', async () => {});

      const res = await fetch(
        `http://localhost:${PORT}/api/github/repos/branches?owner=myorg&repo=myrepo&branch=feature/old-ui`,
        {
          method: 'DELETE',
          headers: AUTH,
        }
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.message).toContain('feature/old-ui');
    });

    test('returns 400 when branch query param is missing', async () => {
      const res = await fetch(
        `http://localhost:${PORT}/api/github/repos/branches?owner=myorg&repo=myrepo`,
        {
          method: 'DELETE',
          headers: AUTH,
        }
      );
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('handles error when deleting protected branch', async () => {
      spy('deleteBranch', async () => {
        const err: any = new Error('Cannot delete protected branch');
        err.status = 422;
        throw err;
      });

      const res = await fetch(
        `http://localhost:${PORT}/api/github/repos/branches?owner=myorg&repo=myrepo&branch=main`,
        {
          method: 'DELETE',
          headers: AUTH,
        }
      );
      const data = await res.json();

      expect(res.status).toBe(422);
      expect(data.success).toBe(false);
    });
  });
});
