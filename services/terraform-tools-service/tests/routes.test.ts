import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startServer } from '../src/server';

describe('Terraform Tools Service Routes', () => {
  let server: any;
  const PORT = 3106; // Different port to avoid conflicts

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
    expect(data.service).toBe('terraform-tools-service');
  });

  // Init tests
  test('POST /api/terraform/init accepts valid request', async () => {
    // Note: This test only validates the route handling, not actual terraform execution
    // Actual terraform execution would require proper terraform configuration
    const response = await fetch(`http://localhost:${PORT}/api/terraform/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workingDir: '/tmp/nonexistent' }),
    });
    const data = await response.json();

    // Expecting 500 because terraform command fails without valid config
    // but route handling should be successful
    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });

  // Plan tests
  test('POST /api/terraform/plan accepts valid request', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/terraform/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workingDir: '/tmp/nonexistent' }),
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });

  // Apply tests
  test('POST /api/terraform/apply accepts valid request', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/terraform/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workingDir: '/tmp/nonexistent', autoApprove: true }),
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });

  // Destroy tests
  test('POST /api/terraform/destroy accepts valid request', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/terraform/destroy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workingDir: '/tmp/nonexistent', autoApprove: true }),
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });

  // Output tests
  test('GET /api/terraform/output accepts request', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/terraform/output?workingDir=/tmp/nonexistent`);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });

  // Show tests
  test('GET /api/terraform/show accepts request', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/terraform/show?workingDir=/tmp/nonexistent`);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });

  // Validate tests
  test('POST /api/terraform/validate accepts valid request', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/terraform/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workingDir: '/tmp/nonexistent' }),
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });

  // Fmt tests
  test('POST /api/terraform/fmt accepts valid request', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/terraform/fmt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workingDir: '/tmp/nonexistent', check: true }),
    });
    const data = await response.json();

    // fmt may succeed or fail depending on directory existence
    expect([200, 500]).toContain(response.status);
  });

  // Workspace tests
  test('GET /api/terraform/workspace/list accepts request', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/terraform/workspace/list?workingDir=/tmp/nonexistent`);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });

  test('POST /api/terraform/workspace/select returns error without name', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/terraform/workspace/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('name');
  });

  test('POST /api/terraform/workspace/new returns error without name', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/terraform/workspace/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('name');
  });

  test('POST /api/terraform/workspace/delete returns error without name', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/terraform/workspace/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('name');
  });

  // State tests
  test('GET /api/terraform/state/list accepts request', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/terraform/state/list?workingDir=/tmp/nonexistent`);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
  });

  test('GET /api/terraform/state/show returns error without address', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/terraform/state/show?workingDir=/tmp/nonexistent`);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('address');
  });

  // Version test
  test('GET /api/terraform/version returns terraform version', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/terraform/version`);
    const data = await response.json();

    // May succeed if terraform is installed, or fail if not
    expect([200, 500]).toContain(response.status);
  });

  test('returns 404 for unknown routes', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/terraform/unknown`);
    expect(response.status).toBe(404);
  });
});
