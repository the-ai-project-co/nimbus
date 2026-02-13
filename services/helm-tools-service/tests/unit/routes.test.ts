import { describe, test, expect, beforeAll, afterAll, afterEach, spyOn } from 'bun:test';
import { HelmOperations } from '../../src/helm/operations';
import { startServer } from '../../src/server';

describe('Helm Tools Service Routes', () => {
  let server: any;
  const PORT = 13008;

  /** Accumulates spies so they can be cleaned up after each test. */
  const spies: Array<ReturnType<typeof spyOn>> = [];

  /**
   * Spy on a HelmOperations prototype method and register
   * the spy for automatic cleanup in afterEach.
   */
  function mockMethod(method: string, value: any) {
    const spy = spyOn(HelmOperations.prototype as any, method).mockResolvedValue(value);
    spies.push(spy);
    return spy;
  }

  beforeAll(async () => {
    server = await startServer(PORT);
  });

  afterEach(() => {
    spies.forEach((s) => s.mockRestore());
    spies.length = 0;
  });

  afterAll(() => {
    server?.stop();
  });

  describe('Health Check', () => {
    test('GET /health should return healthy status', async () => {
      const response = await fetch(`http://localhost:${PORT}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.service).toBe('helm-tools-service');
    });
  });

  describe('Install', () => {
    test('POST /api/helm/install should install chart', async () => {
      mockMethod('install', { success: true, output: '{"name": "my-release"}', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/helm/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'my-release', chart: 'nginx' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/helm/install should fail without name', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart: 'nginx' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('POST /api/helm/install should fail without chart', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'my-release' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Upgrade', () => {
    test('POST /api/helm/upgrade should upgrade release', async () => {
      mockMethod('upgrade', { success: true, output: '{"name": "my-release"}', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/helm/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'my-release', chart: 'nginx' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Uninstall', () => {
    test('POST /api/helm/uninstall should uninstall release', async () => {
      mockMethod('uninstall', { success: true, output: 'uninstalled', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/helm/uninstall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'my-release' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/helm/uninstall should fail without name', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/uninstall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('List', () => {
    test('GET /api/helm/list should list releases', async () => {
      mockMethod('list', { success: true, output: '[]', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/helm/list`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Rollback', () => {
    test('POST /api/helm/rollback should rollback release', async () => {
      mockMethod('rollback', { success: true, output: 'rolled back', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/helm/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'my-release', revision: 1 }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/helm/rollback should fail without name', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: 1 }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Values', () => {
    test('GET /api/helm/values should get values', async () => {
      mockMethod('getValues', { success: true, output: 'replicaCount: 1', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/helm/values?name=my-release`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('GET /api/helm/values should fail without name', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/values`);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('History', () => {
    test('GET /api/helm/history should get history', async () => {
      mockMethod('history', { success: true, output: '[]', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/helm/history?name=my-release`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Status', () => {
    test('GET /api/helm/status should get status', async () => {
      mockMethod('status', { success: true, output: '{"info": {"status": "deployed"}}', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/helm/status?name=my-release`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Repo', () => {
    test('POST /api/helm/repo should manage repos', async () => {
      mockMethod('repo', { success: true, output: 'done', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/helm/repo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', name: 'bitnami', url: 'https://charts.bitnami.com/bitnami' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/helm/repo should fail with invalid action', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/repo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invalid' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Search', () => {
    test('GET /api/helm/search should search charts', async () => {
      mockMethod('search', { success: true, output: '[]', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/helm/search?keyword=nginx`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('GET /api/helm/search should fail without keyword', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/search`);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Show', () => {
    test('GET /api/helm/show should show chart', async () => {
      mockMethod('show', { success: true, output: 'chart info', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/helm/show?chart=nginx&subcommand=chart`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('GET /api/helm/show should fail without chart', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/show?subcommand=chart`);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Template', () => {
    test('POST /api/helm/template should template chart', async () => {
      mockMethod('template', { success: true, output: '---\napiVersion: v1', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/helm/template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'my-release', chart: 'nginx' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Version', () => {
    test('GET /api/helm/version should get version', async () => {
      mockMethod('version', { success: true, output: 'v3.12.0', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/helm/version`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('404 Not Found', () => {
    test('should return 404 for unknown routes', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/helm/unknown`);
      expect(response.status).toBe(404);
    });
  });
});
