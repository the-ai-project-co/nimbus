import { describe, test, expect, beforeAll, afterAll, afterEach, spyOn } from 'bun:test';
import { TerraformOperations } from '../../src/terraform/operations';
import { startServer } from '../../src/server';

describe('Terraform Tools Service Routes', () => {
  let server: any;
  const PORT = 13006;

  /** Accumulates spies so they can be cleaned up after each test. */
  const spies: Array<ReturnType<typeof spyOn>> = [];

  /**
   * Spy on a TerraformOperations prototype method and register
   * the spy for automatic cleanup in afterEach.
   */
  function mockMethod(method: string, value: any) {
    const spy = spyOn(TerraformOperations.prototype as any, method).mockResolvedValue(value);
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
      expect(data.service).toBe('terraform-tools-service');
    });
  });

  describe('Init', () => {
    test('POST /api/terraform/init should initialize', async () => {
      mockMethod('init', { success: true, output: 'Terraform initialized' });

      const response = await fetch(`http://localhost:${PORT}/api/terraform/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: '/tmp/terraform' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/terraform/init should fail without directory', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/terraform/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Plan', () => {
    test('POST /api/terraform/plan should create plan', async () => {
      mockMethod('plan', { success: true, output: 'Plan: 1 to add', hasChanges: true });

      const response = await fetch(`http://localhost:${PORT}/api/terraform/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: '/tmp/terraform' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Apply', () => {
    test('POST /api/terraform/apply should apply changes', async () => {
      mockMethod('apply', { success: true, output: 'Apply complete' });

      const response = await fetch(`http://localhost:${PORT}/api/terraform/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: '/tmp/terraform', autoApprove: true }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Destroy', () => {
    test('POST /api/terraform/destroy should destroy', async () => {
      mockMethod('destroy', { success: true, output: 'Destroy complete' });

      const response = await fetch(`http://localhost:${PORT}/api/terraform/destroy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: '/tmp/terraform', autoApprove: true }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Output', () => {
    test('GET /api/terraform/output should get outputs', async () => {
      mockMethod('output', { instance_ip: { value: '1.2.3.4' } });

      const response = await fetch(`http://localhost:${PORT}/api/terraform/output?directory=/tmp/terraform`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('GET /api/terraform/output should fail without directory', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/terraform/output`);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Show', () => {
    test('GET /api/terraform/show should show state', async () => {
      mockMethod('show', { output: 'State output' });

      const response = await fetch(`http://localhost:${PORT}/api/terraform/show?directory=/tmp/terraform`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Validate', () => {
    test('POST /api/terraform/validate should validate', async () => {
      mockMethod('validate', { valid: true, errorCount: 0, warningCount: 0, diagnostics: [] });

      const response = await fetch(`http://localhost:${PORT}/api/terraform/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: '/tmp/terraform' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Fmt', () => {
    test('POST /api/terraform/fmt should format', async () => {
      mockMethod('fmt', { success: true, output: 'main.tf', formatted: ['main.tf'] });

      const response = await fetch(`http://localhost:${PORT}/api/terraform/fmt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: '/tmp/terraform' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Workspace', () => {
    test('GET /api/terraform/workspace/list should list workspaces', async () => {
      mockMethod('workspaceList', { current: 'default', workspaces: ['default', 'dev'] });

      const response = await fetch(`http://localhost:${PORT}/api/terraform/workspace/list?directory=/tmp/terraform`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/terraform/workspace/select should select workspace', async () => {
      mockMethod('workspaceSelect', { success: true, workspace: 'dev' });

      const response = await fetch(`http://localhost:${PORT}/api/terraform/workspace/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: '/tmp/terraform', name: 'dev' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/terraform/workspace/new should create workspace', async () => {
      mockMethod('workspaceNew', { success: true, workspace: 'staging' });

      const response = await fetch(`http://localhost:${PORT}/api/terraform/workspace/new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: '/tmp/terraform', name: 'staging' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('DELETE /api/terraform/workspace/delete should delete workspace', async () => {
      mockMethod('workspaceDelete', { success: true });

      const response = await fetch(`http://localhost:${PORT}/api/terraform/workspace/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: '/tmp/terraform', name: 'staging' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('State', () => {
    test('GET /api/terraform/state/list should list state', async () => {
      mockMethod('stateList', ['aws_instance.example']);

      const response = await fetch(`http://localhost:${PORT}/api/terraform/state/list?directory=/tmp/terraform`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('GET /api/terraform/state/show should show resource', async () => {
      mockMethod('stateShow', '# aws_instance.example');

      const response = await fetch(`http://localhost:${PORT}/api/terraform/state/show?directory=/tmp/terraform&address=aws_instance.example`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Import', () => {
    test('POST /api/terraform/import should import resource', async () => {
      mockMethod('import', { success: true, output: 'Import successful' });

      const response = await fetch(`http://localhost:${PORT}/api/terraform/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directory: '/tmp/terraform',
          address: 'aws_instance.example',
          id: 'i-12345678',
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Refresh', () => {
    test('POST /api/terraform/refresh should refresh state', async () => {
      mockMethod('refresh', { success: true, output: 'Refresh complete' });

      const response = await fetch(`http://localhost:${PORT}/api/terraform/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: '/tmp/terraform' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Version', () => {
    test('GET /api/terraform/version should get version', async () => {
      mockMethod('version', { terraform: '1.5.0', providers: {} });

      const response = await fetch(`http://localhost:${PORT}/api/terraform/version`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('404 Not Found', () => {
    test('should return 404 for unknown routes', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/terraform/unknown`);
      expect(response.status).toBe(404);
    });
  });
});
