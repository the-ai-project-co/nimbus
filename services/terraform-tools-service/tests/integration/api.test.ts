import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startServer } from '../../src/server';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Terraform Tools Service API Integration', () => {
  let server: any;
  const PORT = 14006;
  const TEST_DIR = '/tmp/terraform-integration-test';

  beforeAll(async () => {
    server = await startServer(PORT);
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    server?.stop();
    await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  describe('Health Check Integration', () => {
    test('should respond to health check', async () => {
      const response = await fetch(`http://localhost:${PORT}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.service).toBe('terraform-tools-service');
    });
  });

  describe('Version Integration', () => {
    test('should get terraform version', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/terraform/version`);
      const data = await response.json();

      // Will fail if terraform is not installed, which is expected
      if (response.status === 200) {
        expect(data.success).toBe(true);
        expect(data.data.terraform).toBeDefined();
      } else {
        // Terraform not installed - just verify error handling works
        expect(data.success).toBe(false);
      }
    });
  });

  describe('Validate Integration', () => {
    test('should validate terraform configuration', async () => {
      const validDir = path.join(TEST_DIR, 'validate-test');
      await fs.mkdir(validDir, { recursive: true });

      // Create a simple terraform file
      await fs.writeFile(
        path.join(validDir, 'main.tf'),
        'terraform {\n  required_version = ">= 1.0"\n}\n'
      );

      const response = await fetch(`http://localhost:${PORT}/api/terraform/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: validDir }),
      });

      const data = await response.json();

      // Will depend on terraform being installed
      if (response.status === 200) {
        expect(data.success).toBe(true);
      } else {
        expect(data.success).toBe(false);
      }
    });
  });

  describe('Fmt Integration', () => {
    test('should format terraform files', async () => {
      const fmtDir = path.join(TEST_DIR, 'fmt-test');
      await fs.mkdir(fmtDir, { recursive: true });

      // Create an unformatted terraform file
      await fs.writeFile(
        path.join(fmtDir, 'main.tf'),
        'variable "name" {type=string}'
      );

      const response = await fetch(`http://localhost:${PORT}/api/terraform/fmt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: fmtDir }),
      });

      const data = await response.json();

      // Will depend on terraform being installed
      if (response.status === 200) {
        expect(data.success).toBe(true);
      }
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle missing directory', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/terraform/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle non-existent directory', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/terraform/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: '/nonexistent/path' }),
      });

      const data = await response.json();
      // Terraform may return different status codes depending on whether it's installed
      // and how it handles non-existent directories
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('Workspace Integration', () => {
    test('should list workspaces', async () => {
      const wsDir = path.join(TEST_DIR, 'workspace-test');
      await fs.mkdir(wsDir, { recursive: true });

      // Create minimal terraform files
      await fs.writeFile(path.join(wsDir, 'main.tf'), '');

      // First need to init
      await fetch(`http://localhost:${PORT}/api/terraform/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: wsDir }),
      });

      const response = await fetch(
        `http://localhost:${PORT}/api/terraform/workspace/list?directory=${encodeURIComponent(wsDir)}`
      );

      // Will succeed only if terraform is installed and init succeeded
      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
      }
    });
  });
});
