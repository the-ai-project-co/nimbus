import { describe, it, expect, beforeEach, spyOn } from 'bun:test';
import { Verifier } from '../components/verifier';
import { TerraformToolsClient } from '../clients/terraform-client';
import type { ExecutionResult } from '../types/agent';

describe('Verifier - Domain-Specific Validation', () => {
  let verifier: Verifier;

  const createMockResult = (overrides?: Partial<ExecutionResult>): ExecutionResult => ({
    id: 'exec-1',
    plan_id: 'plan-1',
    step_id: 'step-1',
    status: 'success',
    started_at: new Date(),
    completed_at: new Date(),
    duration: 5000,
    artifacts: [{ id: 'a1', type: 'terraform', name: 'main.tf', path: '/tmp/main.tf', size: 100, checksum: 'abc', created_at: new Date() }],
    outputs: { vpc_id: 'vpc-123' },
    ...overrides,
  });

  beforeEach(() => {
    verifier = new Verifier();
  });

  describe('terraform domain validation', () => {
    it('should call terraform validate when domain is terraform and workDir exists', async () => {
      const validateSpy = spyOn(TerraformToolsClient.prototype, 'validate').mockResolvedValue({
        valid: true,
        errorCount: 0,
        warningCount: 0,
        diagnostics: [],
      });

      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          domain: 'terraform',
          workDir: '/tmp/tf-project',
          encryption_at_rest: true,
          iam_role: 'my-role',
          tags: { Environment: 'dev', Project: 'test', ManagedBy: 'nimbus' },
        }
      );

      const domainCheck = result.checks.find(c => c.id === 'domain_tf_validate');
      expect(domainCheck).toBeDefined();
      expect(domainCheck!.status).toBe('passed');
      expect(domainCheck!.actual).toBe('valid');
      expect(validateSpy).toHaveBeenCalledWith('/tmp/tf-project');

      validateSpy.mockRestore();
    });

    it('should fail domain check when terraform validate returns invalid', async () => {
      const validateSpy = spyOn(TerraformToolsClient.prototype, 'validate').mockResolvedValue({
        valid: false,
        errorCount: 1,
        warningCount: 0,
        diagnostics: [{ severity: 'error', summary: 'Missing required argument' }],
      });

      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          domain: 'terraform',
          workDir: '/tmp/tf-project',
          encryption_at_rest: true,
          iam_role: 'my-role',
          tags: { Environment: 'dev', Project: 'test', ManagedBy: 'nimbus' },
        }
      );

      const domainCheck = result.checks.find(c => c.id === 'domain_tf_validate');
      expect(domainCheck).toBeDefined();
      expect(domainCheck!.status).toBe('failed');
      expect(domainCheck!.actual).toBe('invalid');
      expect(domainCheck!.error).toContain('Missing required argument');

      validateSpy.mockRestore();
    });

    it('should produce warning when terraform tools service is unavailable', async () => {
      const validateSpy = spyOn(TerraformToolsClient.prototype, 'validate').mockRejectedValue(
        new Error('Connection refused')
      );

      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          domain: 'terraform',
          workDir: '/tmp/tf-project',
          encryption_at_rest: true,
          iam_role: 'my-role',
          tags: { Environment: 'dev', Project: 'test', ManagedBy: 'nimbus' },
        }
      );

      const domainCheck = result.checks.find(c => c.id === 'domain_tf_validate');
      expect(domainCheck).toBeDefined();
      expect(domainCheck!.status).toBe('warning');
      expect(domainCheck!.actual).toBe('unavailable');

      validateSpy.mockRestore();
    });
  });

  describe('kubernetes domain validation', () => {
    it('should add advisory check for kubernetes domain', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          domain: 'kubernetes',
          workDir: '/tmp/k8s-manifests',
          encryption_at_rest: true,
          iam_role: 'my-role',
          tags: { Environment: 'dev', Project: 'test', ManagedBy: 'nimbus' },
        }
      );

      const k8sCheck = result.checks.find(c => c.id === 'domain_k8s_dryrun');
      expect(k8sCheck).toBeDefined();
      expect(k8sCheck!.status).toBe('warning');
      expect(k8sCheck!.actual).toBe('not_run');
      expect(k8sCheck!.error).toContain('kubectl apply --dry-run=client');
    });
  });

  describe('no domain validation', () => {
    it('should not add domain checks when no domain is specified', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          encryption_at_rest: true,
          iam_role: 'my-role',
          tags: { Environment: 'dev', Project: 'test', ManagedBy: 'nimbus' },
        }
      );

      const domainChecks = result.checks.filter(c => c.id.startsWith('domain_'));
      expect(domainChecks.length).toBe(0);
    });

    it('should not add domain checks when workDir is missing', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          domain: 'terraform',
          encryption_at_rest: true,
          iam_role: 'my-role',
          tags: { Environment: 'dev', Project: 'test', ManagedBy: 'nimbus' },
        }
      );

      const domainChecks = result.checks.filter(c => c.id.startsWith('domain_'));
      expect(domainChecks.length).toBe(0);
    });
  });

  describe('source code verification', () => {
    it('should have runDomainValidationChecks method in verifier source', () => {
      const fs = require('node:fs');
      const path = require('node:path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../components/verifier.ts'),
        'utf-8'
      );
      expect(source).toContain('runDomainValidationChecks');
      expect(source).toContain('TerraformToolsClient');
      expect(source).toContain("domain === 'terraform'");
      expect(source).toContain("domain === 'kubernetes'");
    });
  });
});
