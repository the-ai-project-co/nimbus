import { describe, test, expect, beforeAll, beforeEach, afterAll, afterEach, spyOn } from 'bun:test';
import { startServer } from '../../src/server';
import { GitHubOperations } from '../../src/github/operations';

describe('GitHub Tools Service Routes', () => {
  let server: any;
  const PORT = 13010;
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
    // Set up default spies for all methods the routes may call.
    // Individual tests can override with mockImplementationOnce if needed.
    spyProto('listPRs', async () => [{ number: 1, title: 'PR 1' }]);
    spyProto('getPR', async () => ({ number: 1, title: 'PR 1' }));
    spyProto('createPR', async () => ({ number: 1, title: 'New PR' }));
    spyProto('mergePR', async () => ({ sha: 'abc123', merged: true, message: 'Merged' }));
    spyProto('closePR', async () => ({ number: 1, state: 'closed' }));
    spyProto('listIssues', async () => [{ number: 1, title: 'Issue 1' }]);
    spyProto('getIssue', async () => ({ number: 1, title: 'Issue 1' }));
    spyProto('createIssue', async () => ({ number: 1, title: 'New Issue' }));
    spyProto('updateIssue', async () => ({ number: 1 }));
    spyProto('closeIssue', async () => ({ number: 1, state: 'closed' }));
    spyProto('addComment', async () => ({ id: 1, body: 'Comment' }));
    spyProto('listComments', async () => []);
    spyProto('getRepo', async () => ({ name: 'repo', full_name: 'owner/repo' }));
    spyProto('listBranches', async () => [{ name: 'main' }]);
    spyProto('getBranch', async () => ({ name: 'main', commit: { sha: 'abc123' } }));
    spyProto('createBranch', async () => ({ ref: 'refs/heads/new', object: { sha: 'abc123' } }));
    spyProto('deleteBranch', async () => undefined);
    spyProto('validateToken', async () => ({ login: 'user', name: 'User', email: 'user@test.com' }));
  });

  afterEach(() => {
    // Restore all spies so they do not leak to other test files
    for (const s of spies) {
      s.mockRestore();
    }
    spies.length = 0;
  });

  describe('Health Check', () => {
    test('GET /health should return healthy status', async () => {
      const response = await fetch(`http://localhost:${PORT}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.service).toBe('github-tools-service');
    });
  });

  describe('Authentication', () => {
    test('should reject requests without auth header', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/user`);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });
  });

  describe('Pull Requests', () => {
    test('GET /api/github/prs should list PRs', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/prs?owner=test&repo=repo`, {
        headers: AUTH_HEADER,
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('GET /api/github/prs should fail without owner/repo', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/prs`, {
        headers: AUTH_HEADER,
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('POST /api/github/prs should create PR', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/prs`, {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'test',
          repo: 'repo',
          title: 'New PR',
          head: 'feature',
          base: 'main',
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
    });

    test('GET /api/github/prs/:number should get PR', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/prs/1?owner=test&repo=repo`, {
        headers: AUTH_HEADER,
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/github/prs/:number/merge should merge PR', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/prs/1/merge`, {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: 'test', repo: 'repo' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Issues', () => {
    test('GET /api/github/issues should list issues', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/issues?owner=test&repo=repo`, {
        headers: AUTH_HEADER,
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/github/issues should create issue', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/issues`, {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'test',
          repo: 'repo',
          title: 'New Issue',
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
    });

    test('GET /api/github/issues/:number should get issue', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/issues/1?owner=test&repo=repo`, {
        headers: AUTH_HEADER,
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('PUT /api/github/issues/:number/close should close issue', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/issues/1/close?owner=test&repo=repo`, {
        method: 'PUT',
        headers: AUTH_HEADER,
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/github/issues/:number/comments should add comment', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/issues/1/comments`, {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'test',
          repo: 'repo',
          body: 'Test comment',
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
    });
  });

  describe('Repositories', () => {
    test('GET /api/github/repos should get repo info', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/repos?owner=test&repo=repo`, {
        headers: AUTH_HEADER,
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('GET /api/github/repos/branches should list branches', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/repos/branches?owner=test&repo=repo`, {
        headers: AUTH_HEADER,
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/github/repos/branches should create branch', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/repos/branches`, {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'test',
          repo: 'repo',
          branch: 'new-branch',
          sha: 'abc123',
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
    });

    test('DELETE /api/github/repos/branches should delete branch', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/repos/branches?owner=test&repo=repo&branch=old-branch`, {
        method: 'DELETE',
        headers: AUTH_HEADER,
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('User', () => {
    test('GET /api/github/user should get authenticated user', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/user`, {
        headers: AUTH_HEADER,
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('404 Not Found', () => {
    test('should return 404 for unknown routes', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/unknown`, {
        headers: AUTH_HEADER,
      });
      expect(response.status).toBe(404);
    });
  });
});
