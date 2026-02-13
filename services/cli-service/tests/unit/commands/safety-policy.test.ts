import { describe, test, expect } from 'bun:test';
import {
  loadSafetyPolicy,
  evaluateSafety,
  requiresSafetyCheck,
  requiresApproval,
  defaultSafetyPolicy,
  type SafetyContext,
} from '../../../src/config/safety-policy';

describe('SafetyPolicy', () => {
  describe('loadSafetyPolicy', () => {
    test('should return default policy when no config file exists', () => {
      const policy = loadSafetyPolicy('/nonexistent/path');

      expect(policy).toEqual(defaultSafetyPolicy);
    });

    test('should have required approval operations', () => {
      const policy = loadSafetyPolicy();

      expect(policy.alwaysRequireApproval).toContain('destroy');
      expect(policy.alwaysRequireApproval).toContain('delete');
      expect(policy.alwaysRequireApproval).toContain('apply');
    });

    test('should have protected environments', () => {
      const policy = loadSafetyPolicy();

      expect(policy.protectedEnvironments).toContain('production');
      expect(policy.protectedEnvironments).toContain('prod');
    });

    test('should have skip safety operations', () => {
      const policy = loadSafetyPolicy();

      expect(policy.skipSafetyFor).toContain('plan');
      expect(policy.skipSafetyFor).toContain('list');
      expect(policy.skipSafetyFor).toContain('describe');
    });
  });

  describe('requiresSafetyCheck', () => {
    test('should return false for list operations', () => {
      const result = requiresSafetyCheck('list');

      expect(result).toBe(false);
    });

    test('should return false for describe operations', () => {
      const result = requiresSafetyCheck('describe');

      expect(result).toBe(false);
    });

    test('should return false for plan operations', () => {
      const result = requiresSafetyCheck('terraform plan');

      expect(result).toBe(false);
    });

    test('should return true for apply operations', () => {
      const result = requiresSafetyCheck('terraform apply');

      expect(result).toBe(true);
    });

    test('should return true for destroy operations', () => {
      const result = requiresSafetyCheck('terraform destroy');

      expect(result).toBe(true);
    });

    test('should return true for delete operations', () => {
      const result = requiresSafetyCheck('kubectl delete');

      expect(result).toBe(true);
    });
  });

  describe('requiresApproval', () => {
    test('should require approval for destroy operations', () => {
      const context: SafetyContext = {
        operation: 'destroy',
        type: 'terraform',
      };

      const result = requiresApproval('destroy', context);

      expect(result).toBe(true);
    });

    test('should require approval for delete operations', () => {
      const context: SafetyContext = {
        operation: 'delete',
        type: 'kubernetes',
      };

      const result = requiresApproval('delete', context);

      expect(result).toBe(true);
    });

    test('should require approval for protected environments', () => {
      const context: SafetyContext = {
        operation: 'apply',
        type: 'terraform',
        environment: 'production',
      };

      const result = requiresApproval('apply', context);

      expect(result).toBe(true);
    });

    test('should require approval when cost exceeds threshold', () => {
      const context: SafetyContext = {
        operation: 'create',
        type: 'terraform',
        estimatedCost: 1000,
      };

      const result = requiresApproval('create', context);

      expect(result).toBe(true);
    });

    test('should not require approval for low-cost operations in dev', () => {
      const context: SafetyContext = {
        operation: 'list',
        type: 'terraform',
        environment: 'development',
        estimatedCost: 0,
      };

      const result = requiresApproval('list', context);

      expect(result).toBe(false);
    });
  });

  describe('evaluateSafety', () => {
    test('should identify destructive operations as critical risk', () => {
      const context: SafetyContext = {
        operation: 'destroy',
        type: 'terraform',
      };

      const result = evaluateSafety(context);

      expect(result.risks.some((r) => r.severity === 'critical')).toBe(true);
      expect(result.requiresApproval).toBe(true);
    });

    test('should identify protected environment as high risk', () => {
      const context: SafetyContext = {
        operation: 'apply',
        type: 'terraform',
        environment: 'production',
      };

      const result = evaluateSafety(context);

      expect(result.risks.some((r) => r.id === 'protected-environment')).toBe(true);
      expect(result.requiresApproval).toBe(true);
    });

    test('should identify high cost as high risk', () => {
      const context: SafetyContext = {
        operation: 'create',
        type: 'terraform',
        estimatedCost: 1000,
      };

      const result = evaluateSafety(context);

      expect(result.risks.some((r) => r.id === 'high-cost')).toBe(true);
      expect(result.requiresApproval).toBe(true);
    });

    test('should pass for safe operations', () => {
      const context: SafetyContext = {
        operation: 'list',
        type: 'terraform',
      };

      const result = evaluateSafety(context);

      expect(result.passed).toBe(true);
      expect(result.blockers).toEqual([]);
    });

    test('should include affected resources when provided', () => {
      const context: SafetyContext = {
        operation: 'delete',
        type: 'kubernetes',
        resources: ['pod/nginx', 'service/nginx'],
      };

      const result = evaluateSafety(context);

      expect(result.affectedResources).toEqual(['pod/nginx', 'service/nginx']);
    });

    test('should analyze plan output for resource destruction', () => {
      const context: SafetyContext = {
        operation: 'apply',
        type: 'terraform',
        planOutput: 'Plan: 0 to add, 0 to change, 5 to destroy.',
      };

      const result = evaluateSafety(context);

      expect(result.risks.some((r) => r.id === 'resource-destruction')).toBe(true);
    });
  });
});
