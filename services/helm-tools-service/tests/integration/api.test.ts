import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startServer } from '../../src/server';

describe('Helm Tools Service API Integration', () => {
  let server: any;
  const PORT = 14008;

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
      expect(data.service).toBe('helm-tools-service');
    });
  });

  describe('Version Integration', () => {
    test('should get helm version', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/version`);
      const data = await response.json();

      // Will fail if helm is not installed
      if (response.status === 200) {
        expect(data.success).toBe(true);
        expect(data.data.version).toBeDefined();
      } else {
        // helm not installed
        expect(data.success).toBe(false);
      }
    });
  });

  describe('List Integration', () => {
    test('should list helm releases', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/list`);
      const data = await response.json();

      // Will depend on helm and cluster being configured
      if (response.status === 200) {
        expect(data.success).toBe(true);
        expect(Array.isArray(data.data.releases)).toBe(true);
      }
    });
  });

  describe('Repo Integration', () => {
    test('should list helm repos', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/repo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
      });

      const data = await response.json();

      // Will depend on helm being installed
      if (response.status === 200) {
        expect(data.success).toBe(true);
      }
    });
  });

  describe('Search Integration', () => {
    test('should search for charts', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/search?keyword=nginx`);
      const data = await response.json();

      // Will depend on helm and repos being configured
      if (response.status === 200) {
        expect(data.success).toBe(true);
        expect(Array.isArray(data.data.charts)).toBe(true);
      }
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle missing name for install', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart: 'nginx' }),
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle missing chart for install', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'my-release' }),
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle missing name for upgrade', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart: 'nginx' }),
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle missing name for uninstall', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/uninstall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle invalid revision for rollback', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'my-release', revision: -1 }),
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle invalid repo action', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/repo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invalid' }),
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle missing keyword for search', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/search`);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle missing name for values', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/values`);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle missing chart for show', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/show?subcommand=chart`);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle invalid subcommand for show', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/show?chart=nginx&subcommand=invalid`);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });
});
