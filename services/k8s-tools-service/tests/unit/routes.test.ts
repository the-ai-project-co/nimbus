import { describe, test, expect, beforeAll, afterAll, afterEach, spyOn } from 'bun:test';
import { KubernetesOperations } from '../../src/k8s/operations';
import { startServer } from '../../src/server';

describe('K8s Tools Service Routes', () => {
  let server: any;
  const PORT = 13007;

  /** Accumulates spies so they can be cleaned up after each test. */
  const spies: Array<ReturnType<typeof spyOn>> = [];

  /**
   * Spy on a KubernetesOperations prototype method and register
   * the spy for automatic cleanup in afterEach.
   */
  function mockMethod(method: string, value: any) {
    const spy = spyOn(KubernetesOperations.prototype as any, method).mockResolvedValue(value);
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
      expect(data.service).toBe('k8s-tools-service');
    });
  });

  describe('Get Resources', () => {
    test('GET /api/k8s/resources should get resources', async () => {
      mockMethod('get', { success: true, output: '{"items": []}', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/k8s/resources?resource=pods`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('GET /api/k8s/resources should fail without resource', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/k8s/resources`);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Apply', () => {
    test('POST /api/k8s/apply should apply manifest', async () => {
      mockMethod('apply', { success: true, output: 'created', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/k8s/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifest: 'apiVersion: v1\nkind: Pod' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/k8s/apply should fail without manifest', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/k8s/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Delete', () => {
    test('POST /api/k8s/delete should delete resource', async () => {
      mockMethod('delete', { success: true, output: 'deleted', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/k8s/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'pod', name: 'my-pod' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/k8s/delete should fail without resource', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/k8s/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Logs', () => {
    test('GET /api/k8s/logs should get pod logs', async () => {
      mockMethod('logs', { success: true, output: 'log output', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/k8s/logs?pod=my-pod`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('GET /api/k8s/logs should fail without pod', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/k8s/logs`);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Exec', () => {
    test('POST /api/k8s/exec should exec command', async () => {
      mockMethod('exec', { success: true, output: 'command output', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/k8s/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pod: 'my-pod', command: ['ls', '-la'] }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/k8s/exec should fail without pod', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/k8s/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: ['ls'] }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Describe', () => {
    test('GET /api/k8s/describe should describe resource', async () => {
      mockMethod('describe', { success: true, output: 'resource description', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/k8s/describe?resource=pod&name=my-pod`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Scale', () => {
    test('POST /api/k8s/scale should scale resource', async () => {
      mockMethod('scale', { success: true, output: 'scaled', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/k8s/scale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'deployment', name: 'nginx', replicas: 3 }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/k8s/scale should fail without required fields', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/k8s/scale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'deployment' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Rollout', () => {
    test('POST /api/k8s/rollout should manage rollout', async () => {
      mockMethod('rollout', { success: true, output: 'rollout done', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/k8s/rollout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'deployment', name: 'nginx', action: 'status' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Cluster Info', () => {
    test('GET /api/k8s/cluster-info should get cluster info', async () => {
      mockMethod('clusterInfo', { success: true, output: 'cluster info', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/k8s/cluster-info`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Contexts', () => {
    test('GET /api/k8s/contexts should list contexts', async () => {
      mockMethod('getContexts', { success: true, output: 'ctx1\nctx2', exitCode: 0 });
      mockMethod('currentContext', { success: true, output: 'current-ctx', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/k8s/contexts`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/k8s/context should switch context', async () => {
      mockMethod('useContext', { success: true, output: 'switched', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/k8s/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: 'my-context' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Namespaces', () => {
    test('GET /api/k8s/namespaces should list namespaces', async () => {
      mockMethod('getNamespaces', {
        success: true,
        output: '{"items": [{"metadata": {"name": "default"}}]}',
        exitCode: 0,
      });

      const response = await fetch(`http://localhost:${PORT}/api/k8s/namespaces`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/k8s/namespace should create namespace', async () => {
      mockMethod('createNamespace', { success: true, output: 'created', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/k8s/namespace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'my-namespace' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('DELETE /api/k8s/namespace should delete namespace', async () => {
      mockMethod('deleteNamespace', { success: true, output: 'deleted', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/k8s/namespace?name=my-namespace`, {
        method: 'DELETE',
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Events', () => {
    test('GET /api/k8s/events should get events', async () => {
      mockMethod('getEvents', { success: true, output: '{"items": []}', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/k8s/events`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Top', () => {
    test('GET /api/k8s/top/pods should get pod metrics', async () => {
      mockMethod('topPods', { success: true, output: 'pod metrics', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/k8s/top/pods`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('GET /api/k8s/top/nodes should get node metrics', async () => {
      mockMethod('topNodes', { success: true, output: 'node metrics', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/k8s/top/nodes`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Version', () => {
    test('GET /api/k8s/version should get version', async () => {
      mockMethod('version', { success: true, output: '{"clientVersion": {}}', exitCode: 0 });

      const response = await fetch(`http://localhost:${PORT}/api/k8s/version`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('404 Not Found', () => {
    test('should return 404 for unknown routes', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/k8s/unknown`);
      expect(response.status).toBe(404);
    });
  });
});
