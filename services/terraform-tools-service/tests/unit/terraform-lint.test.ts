import { describe, test, expect, beforeEach, spyOn } from 'bun:test';
import { TerraformOperations } from '../../src/terraform/operations';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('TerraformOperations - lint()', () => {
  let tfOps: TerraformOperations;
  let executeSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tfOps = new TerraformOperations('/tmp/terraform');
  });

  describe('source code verification', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../src/terraform/operations.ts'),
      'utf-8'
    );

    test('should have lint method defined', () => {
      expect(source).toContain('async lint(');
    });

    test('should run tflint with --format json', () => {
      expect(source).toContain('tflint --format json --no-color');
    });

    test('should run checkov with --framework terraform', () => {
      expect(source).toContain('--framework terraform --output json');
    });

    test('should handle ENOENT for unavailable tools', () => {
      expect(source).toContain('ENOENT');
      expect(source).toContain('available: false');
    });
  });

  describe('route verification', () => {
    const routeSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/routes.ts'),
      'utf-8'
    );

    test('should have /lint route in POST switch', () => {
      expect(routeSource).toContain("case '/lint':");
    });

    test('should have handleLint function', () => {
      expect(routeSource).toContain('async function handleLint');
    });

    test('handleLint should validate directory field', () => {
      expect(routeSource).toContain("'Missing required field: directory'");
    });
  });

  describe('lint method behavior', () => {
    test('should return tflint results when tflint succeeds', async () => {
      // Mock the internal execAsync calls by spying on the lint method's behavior
      // We spy at the exec level through the class
      const mockExecAsync = spyOn(require('child_process'), 'exec');

      // Create a mock implementation that captures the callback
      let callCount = 0;
      mockExecAsync.mockImplementation((cmd: string, opts: any, cb?: any) => {
        const callback = typeof opts === 'function' ? opts : cb;
        callCount++;

        if (cmd.includes('tflint')) {
          if (callback) callback(null, { stdout: '{"issues": []}', stderr: '' });
          return { on: () => {} };
        }
        if (cmd.includes('checkov')) {
          if (callback) callback(null, {
            stdout: JSON.stringify({
              summary: { passed: 5, failed: 0, skipped: 1 },
              results: { passed_checks: [], failed_checks: [] },
            }),
            stderr: '',
          });
          return { on: () => {} };
        }
        if (callback) callback(null, { stdout: '', stderr: '' });
        return { on: () => {} };
      });

      const result = await tfOps.lint();

      expect(result.tflint).toBeDefined();
      expect(result.checkov).toBeDefined();

      mockExecAsync.mockRestore();
    });

    test('should handle tflint: false option', async () => {
      const mockExecAsync = spyOn(require('child_process'), 'exec');
      mockExecAsync.mockImplementation((cmd: string, opts: any, cb?: any) => {
        const callback = typeof opts === 'function' ? opts : cb;
        if (cmd.includes('checkov')) {
          if (callback) callback(null, {
            stdout: JSON.stringify({
              summary: { passed: 3, failed: 1, skipped: 0 },
              results: {
                passed_checks: [{ check_id: 'CKV_1', check_name: 'Test', file_path: 'main.tf' }],
                failed_checks: [{ check_id: 'CKV_2', check_name: 'Test2', file_path: 'main.tf' }],
              },
            }),
            stderr: '',
          });
        } else {
          if (callback) callback(null, { stdout: '{}', stderr: '' });
        }
        return { on: () => {} };
      });

      const result = await tfOps.lint({ tflint: false });

      expect(result.tflint).toBeUndefined();
      expect(result.checkov).toBeDefined();

      mockExecAsync.mockRestore();
    });

    test('should handle checkov: false option', async () => {
      const mockExecAsync = spyOn(require('child_process'), 'exec');
      mockExecAsync.mockImplementation((cmd: string, opts: any, cb?: any) => {
        const callback = typeof opts === 'function' ? opts : cb;
        if (cmd.includes('tflint')) {
          if (callback) callback(null, { stdout: '{"issues": []}', stderr: '' });
        } else {
          if (callback) callback(null, { stdout: '{}', stderr: '' });
        }
        return { on: () => {} };
      });

      const result = await tfOps.lint({ checkov: false });

      expect(result.tflint).toBeDefined();
      expect(result.checkov).toBeUndefined();

      mockExecAsync.mockRestore();
    });
  });
});

describe('Terraform lint route integration', () => {
  test('POST /api/terraform/lint route exists in route source', () => {
    const routeSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/routes.ts'),
      'utf-8'
    );

    // Verify the lint case is in the POST switch block
    const postSwitchMatch = routeSource.match(/if \(method === 'POST'\)[\s\S]*?switch[\s\S]*?\}/);
    expect(postSwitchMatch).toBeTruthy();
    expect(routeSource).toContain("case '/lint':");
    expect(routeSource).toContain('handleLint(ctx)');
  });
});
