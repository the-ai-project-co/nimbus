import { describe, it, expect, beforeEach } from 'bun:test';
import { BestPracticesEngine } from '../best-practices/engine';

describe('BestPracticesEngine', () => {
  let engine: BestPracticesEngine;

  beforeEach(() => {
    engine = new BestPracticesEngine();
  });

  describe('analyze', () => {
    it('should analyze VPC configuration', () => {
      const config = {
        vpc_cidr: '10.0.0.0/16',
        enable_flow_logs: false,
        environment: 'production',
      };

      const report = engine.analyze('vpc', config);

      expect(report.summary.total_rules_checked).toBeGreaterThan(0);
      expect(report.violations.length).toBeGreaterThan(0);
      expect(report.violations.some((v) => v.rule_id === 'sec-002')).toBe(true);
    });

    it('should pass all checks for well-configured S3', () => {
      const config = {
        encryption_enabled: true,
        enable_versioning: true,
        block_public_acls: true,
        block_public_policy: true,
        ignore_public_acls: true,
        restrict_public_buckets: true,
        enable_lifecycle_rules: true,
        abort_incomplete_multipart_days: 7,
        environment: 'production',
        tags: {
          Environment: 'production',
          ManagedBy: 'terraform',
          Project: 'test',
          CostCenter: 'engineering',
        },
      };

      const report = engine.analyze('s3', config);

      expect(report.summary.violations_found).toBe(0);
    });

    it('should detect missing encryption', () => {
      const config = {
        storage_encrypted: false,
        environment: 'production',
      };

      const report = engine.analyze('rds', config);

      const encryptionViolation = report.violations.find((v) => v.rule_id === 'sec-001');
      expect(encryptionViolation).toBeDefined();
      expect(encryptionViolation?.severity).toBe('critical');
    });

    it('should filter by categories', () => {
      const config = {
        enable_flow_logs: false,
        single_nat_gateway: false,
        environment: 'development',
      };

      const report = engine.analyze('vpc', config, {
        categories: ['security'],
      });

      expect(report.violations.every((v) => v.category === 'security')).toBe(true);
    });

    it('should filter by severities', () => {
      const config = {
        storage_encrypted: false,
        publicly_accessible: true,
        environment: 'production',
      };

      const report = engine.analyze('rds', config, {
        severities: ['critical'],
      });

      expect(report.violations.every((v) => v.severity === 'critical')).toBe(true);
    });
  });

  describe('analyzeAll', () => {
    it('should analyze multiple components', () => {
      const configs = [
        {
          component: 'vpc',
          config: { enable_flow_logs: false },
        },
        {
          component: 's3',
          config: { enable_versioning: false },
        },
      ];

      const report = engine.analyzeAll(configs);

      expect(report.summary.violations_found).toBeGreaterThan(0);
      expect(report.violations.some((v) => v.component === 'vpc')).toBe(true);
      expect(report.violations.some((v) => v.component === 's3')).toBe(true);
    });
  });

  describe('autofix', () => {
    it('should apply autofixes to configuration', () => {
      const config = {
        storage_encrypted: false,
        publicly_accessible: true,
        environment: 'production',
      };

      const result = engine.autofix('rds', config);

      expect(result.fixed_config.storage_encrypted).toBe(true);
      expect(result.fixed_config.publicly_accessible).toBe(false);
      expect(result.applied_fixes.length).toBeGreaterThan(0);
    });

    it('should only apply specified rule fixes', () => {
      const config = {
        storage_encrypted: false,
        enable_flow_logs: false,
      };

      const result = engine.autofix('vpc', config, {
        ruleIds: ['sec-002'],
      });

      expect(result.fixed_config.enable_flow_logs).toBe(true);
      expect(result.applied_fixes).toContain('sec-002');
    });

    it('should return remaining violations after autofix', () => {
      const config = {
        environment: 'production',
      };

      const result = engine.autofix('rds', config);

      expect(result.violations_remaining).toBeDefined();
    });
  });

  describe('getRulesByCategory', () => {
    it('should return security rules', () => {
      const rules = engine.getRulesByCategory('security');

      expect(rules.length).toBeGreaterThan(0);
      expect(rules.every((r) => r.category === 'security')).toBe(true);
    });

    it('should return cost optimization rules', () => {
      const rules = engine.getRulesByCategory('cost');

      expect(rules.length).toBeGreaterThan(0);
      expect(rules.every((r) => r.category === 'cost')).toBe(true);
    });
  });

  describe('getComplianceScore', () => {
    it('should calculate compliance score', () => {
      const config = {
        enable_versioning: true,
        block_public_acls: true,
        block_public_policy: true,
        ignore_public_acls: true,
        restrict_public_buckets: true,
      };

      const report = engine.analyze('s3', config);
      const score = engine.getComplianceScore(report);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should return 100 for perfect compliance', () => {
      const config = {
        encryption_enabled: true,
        enable_versioning: true,
        block_public_acls: true,
        block_public_policy: true,
        ignore_public_acls: true,
        restrict_public_buckets: true,
        enable_lifecycle_rules: true,
        abort_incomplete_multipart_days: 7,
        tags: {
          Environment: 'production',
          ManagedBy: 'Terraform',
          Project: 'test',
          CostCenter: 'engineering',
        },
      };

      const report = engine.analyze('s3', config);
      const score = engine.getComplianceScore(report);

      expect(score).toBe(100);
    });
  });

  describe('formatReportAsMarkdown', () => {
    it('should format report as markdown', () => {
      const config = {
        enable_flow_logs: false,
        environment: 'production',
      };

      const report = engine.analyze('vpc', config);
      const markdown = engine.formatReportAsMarkdown(report);

      expect(markdown).toContain('# Best Practices Report');
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain('## Violations');
      expect(markdown).toContain('Total Rules Checked');
    });
  });

  describe('custom rules', () => {
    it('should allow adding custom rules', () => {
      const customRule = {
        id: 'custom-001',
        category: 'security' as const,
        severity: 'high' as const,
        title: 'Custom Rule',
        description: 'A custom security rule',
        recommendation: 'Follow custom guideline',
        applies_to: ['vpc'],
        check: (config: Record<string, unknown>) => {
          return config.custom_field === true;
        },
      };

      engine.addRule(customRule);

      const config = { custom_field: false };
      const report = engine.analyze('vpc', config);

      const violation = report.violations.find((v) => v.rule_id === 'custom-001');
      expect(violation).toBeDefined();
    });

    it('should allow removing rules', () => {
      engine.removeRule('sec-001');

      const config = { storage_encrypted: false };
      const report = engine.analyze('rds', config);

      const violation = report.violations.find((v) => v.rule_id === 'sec-001');
      expect(violation).toBeUndefined();
    });
  });
});
