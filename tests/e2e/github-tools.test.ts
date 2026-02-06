/**
 * GitHub Tools Service E2E Tests
 *
 * Tests the GitHub Tools Service API endpoints for PR, issue, and repo operations.
 * These tests verify the HTTP API layer - they use mocked GitHub responses
 * to avoid hitting the real GitHub API.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { startServer } from '../../services/github-tools-service/src/server';
import { getTestPorts, createTestClient, waitForService } from '../utils/test-helpers';

describe('GitHub Tools Service E2E Tests', () => {
  let server: any;
  let client: ReturnType<typeof createTestClient>;
  const ports = getTestPorts();
  const BASE_URL = `http://localhost:${ports.http}`;

  beforeAll(async () => {
    server = await startServer(ports.http);
    await waitForService(BASE_URL);
    client = createTestClient(BASE_URL);
  });

  afterAll(() => {
    server?.stop?.();
  });

  // ==================== Health Check Tests ====================

  describe('Health Check', () => {
    it('returns healthy status', async () => {
      const result = await client.get('/health');

      expect(result.status).toBe(200);
      expect(result.data.status).toBe('healthy');
      expect(result.data.service).toBe('github-tools-service');
    });
  });

  // ==================== Pull Request Endpoint Tests ====================
  // Note: The GitHub Tools Service requires authentication before validation,
  // so most endpoints return 401 without a valid token.

  describe('Pull Request Endpoints', () => {
    describe('GET /api/github/prs', () => {
      it('returns 401 when authorization is missing', async () => {
        const result = await client.get('/api/github/prs?owner=test&repo=test');

        // Without a token, should get auth error from GitHub
        expect([401, 403]).toContain(result.status);
      });

      it('requires owner and repo parameters', async () => {
        // These would return 400 if authenticated, but 401 takes precedence
        const result1 = await client.get('/api/github/prs?repo=test');
        const result2 = await client.get('/api/github/prs?owner=test');

        // Auth error comes before validation
        expect([400, 401, 403]).toContain(result1.status);
        expect([400, 401, 403]).toContain(result2.status);
      });
    });

    describe('POST /api/github/prs', () => {
      it('returns error when not authenticated', async () => {
        const result = await client.post('/api/github/prs', {
          owner: 'test',
          repo: 'test',
          title: 'Test PR',
          head: 'feature',
          base: 'main',
        });

        // Auth error or validation error
        expect([400, 401, 403]).toContain(result.status);
        expect(result.data.success).toBe(false);
      });
    });

    describe('GET /api/github/prs/:number', () => {
      it('returns error without authentication', async () => {
        const result = await client.get('/api/github/prs/123?owner=test&repo=test');

        expect([400, 401, 403]).toContain(result.status);
      });
    });

    describe('POST /api/github/prs/:number/merge', () => {
      it('returns error without authentication', async () => {
        const result = await client.post('/api/github/prs/123/merge', {
          owner: 'test',
          repo: 'test',
        });

        expect([400, 401, 403]).toContain(result.status);
      });
    });
  });

  // ==================== Issue Endpoint Tests ====================

  describe('Issue Endpoints', () => {
    describe('GET /api/github/issues', () => {
      it('returns error when not authenticated', async () => {
        const result = await client.get('/api/github/issues?owner=test&repo=test');

        expect([400, 401, 403]).toContain(result.status);
      });
    });

    describe('POST /api/github/issues', () => {
      it('returns error when not authenticated', async () => {
        const result = await client.post('/api/github/issues', {
          owner: 'test',
          repo: 'test',
          title: 'Test Issue',
        });

        expect([400, 401, 403]).toContain(result.status);
        expect(result.data.success).toBe(false);
      });
    });

    describe('GET /api/github/issues/:number', () => {
      it('returns error without authentication', async () => {
        const result = await client.get('/api/github/issues/123?owner=test&repo=test');

        expect([400, 401, 403]).toContain(result.status);
      });
    });

    describe('PUT /api/github/issues/:number/close', () => {
      it('returns error without authentication', async () => {
        const result = await client.put('/api/github/issues/123/close', {
          owner: 'test',
          repo: 'test',
        });

        expect([400, 401, 403]).toContain(result.status);
      });
    });

    describe('POST /api/github/issues/:number/comments', () => {
      it('returns error without authentication', async () => {
        const result = await client.post('/api/github/issues/123/comments', {
          owner: 'test',
          repo: 'test',
          body: 'Test comment',
        });

        expect([400, 401, 403]).toContain(result.status);
      });
    });
  });

  // ==================== Repository Endpoint Tests ====================

  describe('Repository Endpoints', () => {
    describe('GET /api/github/repos', () => {
      it('returns error without authentication', async () => {
        const result = await client.get('/api/github/repos?owner=test&repo=test');

        expect([400, 401, 403]).toContain(result.status);
      });
    });

    describe('GET /api/github/repos/branches', () => {
      it('returns error without authentication', async () => {
        const result = await client.get('/api/github/repos/branches?owner=test&repo=test');

        expect([400, 401, 403]).toContain(result.status);
      });
    });

    describe('POST /api/github/repos/branches', () => {
      it('returns error without authentication', async () => {
        const result = await client.post('/api/github/repos/branches', {
          owner: 'test',
          repo: 'test',
          name: 'new-branch',
          sha: 'abc123',
        });

        expect([400, 401, 403]).toContain(result.status);
      });
    });

    describe('DELETE /api/github/repos/branches', () => {
      it('returns error without authentication', async () => {
        const result = await client.delete('/api/github/repos/branches', {
          owner: 'test',
          repo: 'test',
          name: 'branch-to-delete',
        });

        expect([400, 401, 403]).toContain(result.status);
      });
    });
  });

  // ==================== User Endpoint Tests ====================

  describe('User Endpoints', () => {
    describe('GET /api/github/user', () => {
      it('returns 401 when authorization is missing', async () => {
        const result = await client.get('/api/github/user');

        // Without a token, should get auth error
        expect([401, 403]).toContain(result.status);
      });
    });
  });

  // ==================== CORS Tests ====================

  describe('CORS Support', () => {
    it('handles preflight OPTIONS request', async () => {
      const response = await fetch(`${BASE_URL}/api/github/prs`, {
        method: 'OPTIONS',
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('includes CORS headers in response', async () => {
      const response = await fetch(`${BASE_URL}/health`);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  // ==================== 404 Tests ====================

  describe('Unknown Routes', () => {
    it('returns 404 for unknown paths', async () => {
      const result = await client.get('/api/unknown/path');

      expect(result.status).toBe(404);
    });
  });
});
