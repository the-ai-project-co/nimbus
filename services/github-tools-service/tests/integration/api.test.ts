import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startServer } from '../../src/server';

describe('GitHub Tools Service API Integration', () => {
  let server: any;
  const PORT = 14010;
  // Note: For real integration tests, you'd use a valid GitHub token
  // For CI/CD, you'd use a test token or mock the Octokit client
  const AUTH_HEADER = { Authorization: 'Bearer test-token' };

  beforeAll(async () => {
    server = await startServer(PORT);
  });

  afterAll(() => {
    server?.stop();
  });

  describe('Health Check Integration', () => {
    test('should respond to health check', async () => {
      const response = await fetch(`http://localhost:${PORT}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.service).toBe('github-tools-service');
    });
  });

  describe('Authentication Integration', () => {
    test('should reject requests without Authorization header', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/user`);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Authorization');
    });

    test('should accept Bearer token format', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/user`, {
        headers: { Authorization: 'Bearer test-token' },
      });

      // The request should reach the handler (not rejected for missing header).
      // Depending on environment, the GitHub API call may succeed (mocked) or
      // fail (real API rejects the invalid token). Either way, verify the
      // Authorization header was parsed -- a 401 with "Authorization header
      // required" would mean parsing failed.
      const data = await response.json();
      if (response.status === 401) {
        expect(data.error).not.toContain('header required');
      }
    });

    test('should accept token format', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/user`, {
        headers: { Authorization: 'token test-token' },
      });

      // Will fail with invalid token, but should not be 401 for missing header
      if (response.status === 401) {
        const data = await response.json();
        // If it's 401, it should be from GitHub API, not missing header
        expect(data.error).not.toContain('header required');
      }
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle missing owner/repo for PRs', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/prs`, {
        headers: AUTH_HEADER,
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle missing owner/repo for issues', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/issues`, {
        headers: AUTH_HEADER,
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle missing owner/repo for repo info', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/repos`, {
        headers: AUTH_HEADER,
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle missing owner/repo for branches', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/repos/branches`, {
        headers: AUTH_HEADER,
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle missing required fields for create PR', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/prs`, {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: 'test', repo: 'repo' }),
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle missing required fields for create issue', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/issues`, {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: 'test', repo: 'repo' }),
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle missing required fields for create branch', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/repos/branches`, {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: 'test', repo: 'repo' }),
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle missing required fields for add comment', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/issues/1/comments`, {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: 'test', repo: 'repo' }),
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle invalid JSON body', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/prs`, {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
        body: 'invalid json',
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('CORS Integration', () => {
    test('should handle OPTIONS preflight request', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/user`, {
        method: 'OPTIONS',
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    test('should include CORS headers in responses', async () => {
      const response = await fetch(`http://localhost:${PORT}/health`);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('404 Handling Integration', () => {
    test('should return 404 for unknown routes', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/github/unknown`, {
        headers: AUTH_HEADER,
      });

      expect(response.status).toBe(404);
    });
  });
});
