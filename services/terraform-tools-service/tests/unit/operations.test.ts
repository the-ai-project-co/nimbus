import { describe, test, expect, beforeEach, mock, spyOn } from 'bun:test';
import { TerraformOperations } from '../../src/terraform/operations';

describe('TerraformOperations', () => {
  let tfOps: TerraformOperations;
  let executeSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tfOps = new TerraformOperations('/tmp/terraform');
    // Spy on the private execute method to intercept all subprocess calls.
    // This avoids needing to mock Node built-in modules (child_process, util)
    // which Bun's mock.module does not support for built-ins.
    executeSpy = spyOn(tfOps as any, 'execute');
    executeSpy.mockResolvedValue({ stdout: '{}', stderr: '' });
  });

  describe('init', () => {
    test('should initialize terraform', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: 'Terraform initialized', stderr: '' });

      const result = await tfOps.init();

      expect(result.success).toBe(true);
      expect(result.output).toContain('Terraform initialized');
    });

    test('should init with backend config', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: 'Terraform initialized', stderr: '' });

      const result = await tfOps.init({
        backendConfig: { bucket: 'my-bucket' },
      });

      expect(result.success).toBe(true);
    });

    test('should init with upgrade option', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: 'Terraform initialized', stderr: '' });

      const result = await tfOps.init({ upgrade: true });

      expect(result.success).toBe(true);
    });
  });

  describe('plan', () => {
    test('should create plan', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: 'Plan: 1 to add', stderr: '' });

      const result = await tfOps.plan();

      expect(result.success).toBe(true);
    });

    test('should plan with variables', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: 'Plan: 1 to add', stderr: '' });

      const result = await tfOps.plan({
        var: { environment: 'dev' },
      });

      expect(result.success).toBe(true);
    });

    test('should plan with output file', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: 'Plan saved to tfplan', stderr: '' });

      const result = await tfOps.plan({ out: 'tfplan' });

      expect(result.success).toBe(true);
    });

    test('should plan for destroy', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: 'Plan: 1 to destroy', stderr: '' });

      const result = await tfOps.plan({ destroy: true });

      expect(result.success).toBe(true);
    });
  });

  describe('apply', () => {
    test('should apply changes', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: 'Apply complete', stderr: '' });

      const result = await tfOps.apply({ autoApprove: true });

      expect(result.success).toBe(true);
    });

    test('should apply with plan file', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: 'Apply complete', stderr: '' });

      const result = await tfOps.apply({ planFile: 'tfplan' });

      expect(result.success).toBe(true);
    });

    test('should apply with variables', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: 'Apply complete', stderr: '' });

      const result = await tfOps.apply({
        autoApprove: true,
        var: { environment: 'prod' },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('destroy', () => {
    test('should destroy infrastructure', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: 'Destroy complete', stderr: '' });

      const result = await tfOps.destroy({ autoApprove: true });

      expect(result.success).toBe(true);
    });

    test('should destroy with target', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: 'Destroy complete', stderr: '' });

      const result = await tfOps.destroy({
        autoApprove: true,
        target: ['aws_instance.example'],
      });

      expect(result.success).toBe(true);
    });
  });

  describe('output', () => {
    test('should get all outputs', async () => {
      executeSpy.mockResolvedValueOnce({
        stdout: JSON.stringify({ instance_ip: { value: '1.2.3.4' } }),
        stderr: '',
      });

      const result = await tfOps.output();

      expect(result).toBeDefined();
    });

    test('should get specific output', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: '"1.2.3.4"', stderr: '' });

      const result = await tfOps.output({ name: 'instance_ip' });

      expect(result).toBeDefined();
    });
  });

  describe('show', () => {
    test('should show state', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: '# State output', stderr: '' });

      const result = await tfOps.show();

      expect(result.output).toBeDefined();
    });

    test('should show plan file', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: '{"format_version": "1.0"}', stderr: '' });

      const result = await tfOps.show('tfplan');

      expect(result.output).toBeDefined();
    });
  });

  describe('validate', () => {
    test('should validate configuration', async () => {
      executeSpy.mockResolvedValueOnce({
        stdout: JSON.stringify({ valid: true, error_count: 0, warning_count: 0 }),
        stderr: '',
      });

      const result = await tfOps.validate();

      expect(result.valid).toBe(true);
      expect(result.errorCount).toBe(0);
    });

    test('should return errors for invalid config', async () => {
      const errorPayload = JSON.stringify({
        valid: false,
        error_count: 1,
        diagnostics: [{ severity: 'error', summary: 'Invalid config' }],
      });
      executeSpy.mockImplementationOnce(() =>
        Promise.reject(new Error(errorPayload)),
      );

      const result = await tfOps.validate();

      expect(result.valid).toBe(false);
    });
  });

  describe('fmt', () => {
    test('should format files', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: 'main.tf', stderr: '' });

      const result = await tfOps.fmt();

      expect(result.success).toBe(true);
    });

    test('should check formatting', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await tfOps.fmt({ check: true });

      expect(result.success).toBe(true);
    });
  });

  describe('workspaceList', () => {
    test('should list workspaces', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: '* default\n  dev\n  prod', stderr: '' });

      const result = await tfOps.workspaceList();

      expect(result.current).toBe('default');
      expect(result.workspaces).toContain('default');
    });
  });

  describe('workspaceSelect', () => {
    test('should select workspace', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: 'Switched to workspace "dev"', stderr: '' });

      const result = await tfOps.workspaceSelect('dev');

      expect(result.success).toBe(true);
      expect(result.workspace).toBe('dev');
    });
  });

  describe('workspaceNew', () => {
    test('should create workspace', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: 'Created workspace "staging"', stderr: '' });

      const result = await tfOps.workspaceNew('staging');

      expect(result.success).toBe(true);
      expect(result.workspace).toBe('staging');
    });
  });

  describe('workspaceDelete', () => {
    test('should delete workspace', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: 'Deleted workspace "staging"', stderr: '' });

      const result = await tfOps.workspaceDelete('staging');

      expect(result.success).toBe(true);
    });
  });

  describe('stateList', () => {
    test('should list state resources', async () => {
      executeSpy.mockResolvedValueOnce({
        stdout: 'aws_instance.example\naws_vpc.main',
        stderr: '',
      });

      const resources = await tfOps.stateList();

      expect(Array.isArray(resources)).toBe(true);
      expect(resources).toContain('aws_instance.example');
    });
  });

  describe('stateShow', () => {
    test('should show resource state', async () => {
      executeSpy.mockResolvedValueOnce({
        stdout: '# aws_instance.example:\nresource "aws_instance" "example" {}',
        stderr: '',
      });

      const state = await tfOps.stateShow('aws_instance.example');

      expect(state).toContain('aws_instance');
    });
  });

  describe('import', () => {
    test('should import resource', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: 'Import successful', stderr: '' });

      const result = await tfOps.import('aws_instance.example', 'i-12345678');

      expect(result.success).toBe(true);
    });
  });

  describe('refresh', () => {
    test('should refresh state', async () => {
      executeSpy.mockResolvedValueOnce({ stdout: 'Refresh complete', stderr: '' });

      const result = await tfOps.refresh();

      expect(result.success).toBe(true);
    });
  });

  describe('version', () => {
    test('should get terraform version', async () => {
      executeSpy.mockResolvedValueOnce({
        stdout: JSON.stringify({
          terraform_version: '1.5.0',
          provider_selections: { 'registry.terraform.io/hashicorp/aws': '5.0.0' },
        }),
        stderr: '',
      });

      const result = await tfOps.version();

      expect(result.terraform).toBe('1.5.0');
    });
  });
});
