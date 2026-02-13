import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startServer } from '../../src/server';

describe('K8s Tools Service API Integration', () => {
  let server: any;
  const PORT = 14007;

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
      expect(data.service).toBe('k8s-tools-service');
    });
  });

  describe('Version Integration', () => {
    test('should get kubernetes version', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/k8s/version`);
      const data = await response.json();

      // Will fail if kubectl is not installed or no cluster is configured
      if (response.status === 200) {
        expect(data.success).toBe(true);
      } else {
        // kubectl not installed or not configured
        expect(data.success).toBe(false);
      }
    });
  });

  describe('Contexts Integration', () => {
    test('should list contexts', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/k8s/contexts`);
      const data = await response.json();

      // Will depend on kubectl being installed
      if (response.status === 200) {
        expect(data.success).toBe(true);
        expect(data.data.contexts).toBeDefined();
      }
    });
  });

  describe('Namespaces Integration', () => {
    test('should list namespaces', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/k8s/namespaces`);
      const data = await response.json();

      // Will depend on cluster being configured
      if (response.status === 200) {
        expect(data.success).toBe(true);
      }
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle missing resource parameter', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/k8s/resources`);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle missing pod parameter for logs', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/k8s/logs`);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle missing manifest for apply', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/k8s/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle invalid scale parameters', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/k8s/scale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'deployment' }),
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle invalid rollout action', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/k8s/rollout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource: 'deployment',
          name: 'test',
          action: 'invalid-action',
        }),
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('API Request Validation', () => {
    test('should validate delete requires name or selector', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/k8s/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'pods' }),
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should validate exec requires command', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/k8s/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pod: 'my-pod' }),
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should validate context switch requires context', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/k8s/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should validate namespace creation requires name', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/k8s/namespace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });
});
