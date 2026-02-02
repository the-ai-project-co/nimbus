import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startServer } from '../../../services/helm-tools-service/src/server';

describe('Helm Tools Service Routes', () => {
  let server: any;
  const PORT = 3108; // Different port to avoid conflicts

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
    expect(data.service).toBe('helm-tools-service');
  });

  test('POST /api/helm/install returns error without name', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/helm/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chart: 'nginx' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('name');
  });

  test('POST /api/helm/install returns error without chart', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/helm/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'my-release' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('chart');
  });

  test('POST /api/helm/upgrade returns error without name', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/helm/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chart: 'nginx' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('name');
  });

  test('POST /api/helm/upgrade returns error without chart', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/helm/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'my-release' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('chart');
  });

  test('POST /api/helm/uninstall returns error without name', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/helm/uninstall`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('name');
  });

  test('POST /api/helm/rollback returns error without name', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/helm/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: 1 }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('name');
  });

  test('POST /api/helm/rollback returns error without revision', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/helm/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'my-release' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('revision');
  });

  test('GET /api/helm/values returns error without name', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/helm/values`);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('name');
  });

  test('GET /api/helm/history returns error without name', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/helm/history`);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('name');
  });

  test('GET /api/helm/status returns error without name', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/helm/status`);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('name');
  });

  test('POST /api/helm/repo returns error without action', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/helm/repo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('action');
  });

  test('POST /api/helm/repo returns error with invalid action', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/helm/repo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'invalid' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('action');
  });

  test('GET /api/helm/search returns error without keyword', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/helm/search`);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('keyword');
  });

  test('GET /api/helm/show returns error without chart', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/helm/show?subcommand=values`);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('chart');
  });

  test('GET /api/helm/show returns error without subcommand', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/helm/show?chart=nginx`);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('subcommand');
  });

  test('POST /api/helm/template returns error without name', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/helm/template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chart: 'nginx' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('name');
  });

  test('POST /api/helm/template returns error without chart', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/helm/template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'my-release' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('chart');
  });

  test('returns 404 for unknown routes', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/helm/unknown`);
    expect(response.status).toBe(404);
  });
});
