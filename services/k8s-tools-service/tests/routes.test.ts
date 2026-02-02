import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startServer } from '../src/server';

describe('Kubernetes Tools Service Routes', () => {
  let server: any;
  const PORT = 3107; // Different port to avoid conflicts

  beforeAll(async () => {
    server = await startServer(PORT);
  });

  afterAll(() => {
    server?.stop();
  });

  test('health endpoint returns healthy status', async () => {
    const response = await fetch(`http://localhost:${PORT}/health`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.service).toBe('k8s-tools-service');
  });

  test('GET /api/k8s/resources returns error without resource param', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/k8s/resources`);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('resource');
  });

  test('POST /api/k8s/apply returns error without manifest', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/k8s/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('manifest');
  });

  test('POST /api/k8s/delete returns error without resource', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/k8s/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('resource');
  });

  test('POST /api/k8s/delete returns error without name or selector', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/k8s/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource: 'pods' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('name or selector');
  });

  test('GET /api/k8s/logs returns error without pod param', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/k8s/logs`);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('pod');
  });

  test('POST /api/k8s/exec returns error without pod', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/k8s/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: ['ls'] }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('pod');
  });

  test('POST /api/k8s/exec returns error without command', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/k8s/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pod: 'test-pod' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('command');
  });

  test('GET /api/k8s/describe returns error without resource param', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/k8s/describe`);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('resource');
  });

  test('POST /api/k8s/scale returns error without required fields', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/k8s/scale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('POST /api/k8s/rollout returns error without required fields', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/k8s/rollout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('POST /api/k8s/rollout returns error with invalid action', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/k8s/rollout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource: 'deployment', name: 'test', action: 'invalid' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('action');
  });

  test('POST /api/k8s/context returns error without context', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/k8s/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('context');
  });

  test('POST /api/k8s/namespace returns error without name', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/k8s/namespace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('name');
  });

  test('DELETE /api/k8s/namespace returns error without name', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/k8s/namespace`, {
      method: 'DELETE',
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('name');
  });

  test('returns 404 for unknown routes', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/k8s/unknown`);
    expect(response.status).toBe(404);
  });
});
