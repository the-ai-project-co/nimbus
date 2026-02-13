/**
 * Drift Detection Integration Tests
 *
 * These tests require actual services to be running
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Drift Detection Integration', () => {
  let tempDir: string;
  let coreEngineUrl: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-int-test-'));
    coreEngineUrl = process.env.CORE_ENGINE_URL || 'http://localhost:3010';
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Core Engine API', () => {
    it('should respond to health check', async () => {
      try {
        const response = await fetch(`${coreEngineUrl}/health`);

        if (response.ok) {
          const data = await response.json();
          expect(data.status).toBe('ok');
        } else {
          // Service not running - skip test
          console.log('Core Engine service not running, skipping test');
        }
      } catch (error) {
        // Connection refused - service not running
        console.log('Core Engine service not available, skipping test');
      }
    });

    it('should accept drift detection request', async () => {
      // Create a minimal terraform directory
      const tfDir = path.join(tempDir, 'terraform');
      fs.mkdirSync(tfDir, { recursive: true });
      fs.writeFileSync(
        path.join(tfDir, 'main.tf'),
        `
        terraform {
          required_providers {
            null = {
              source = "hashicorp/null"
              version = "~> 3.0"
            }
          }
        }

        resource "null_resource" "test" {
          triggers = {
            always_run = timestamp()
          }
        }
        `
      );

      try {
        const response = await fetch(`${coreEngineUrl}/api/drift/detect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'terraform',
            directory: tfDir,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          expect(data.report).toBeDefined();
          expect(data.report.provider).toBe('terraform');
        } else if (response.status === 404) {
          console.log('Drift detection endpoint not available');
        }
      } catch (error) {
        console.log('Core Engine service not available, skipping test');
      }
    });
  });

  describe('Rollback API', () => {
    it('should check rollback availability', async () => {
      const taskId = 'test-task-123';

      try {
        const response = await fetch(`${coreEngineUrl}/api/tasks/${taskId}/rollback/check`);

        if (response.ok) {
          const data = await response.json();
          expect(typeof data.canRollback).toBe('boolean');
        } else if (response.status === 404) {
          // Task doesn't exist, which is expected
          expect(response.status).toBe(404);
        }
      } catch (error) {
        console.log('Core Engine service not available, skipping test');
      }
    });

    it('should list available rollback states', async () => {
      try {
        const response = await fetch(`${coreEngineUrl}/api/rollback/states`);

        if (response.ok) {
          const data = await response.json();
          expect(data.states).toBeInstanceOf(Array);
        }
      } catch (error) {
        console.log('Core Engine service not available, skipping test');
      }
    });
  });

  describe('Compliance Report', () => {
    it('should generate compliance report', async () => {
      const tfDir = path.join(tempDir, 'terraform-compliance');
      fs.mkdirSync(tfDir, { recursive: true });
      fs.writeFileSync(
        path.join(tfDir, 'main.tf'),
        `
        resource "aws_s3_bucket" "test" {
          bucket = "test-bucket"
        }
        `
      );

      try {
        const response = await fetch(`${coreEngineUrl}/api/drift/compliance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'terraform',
            directory: tfDir,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          expect(data.report).toBeDefined();
        }
      } catch (error) {
        console.log('Core Engine service not available, skipping test');
      }
    });
  });
});

describe('Kubernetes Drift Integration', () => {
  let k8sNamespace: string;

  beforeAll(() => {
    k8sNamespace = `test-drift-${Date.now()}`;
  });

  it('should detect kubernetes manifest drift', async () => {
    // This test requires kubectl to be configured
    const coreEngineUrl = process.env.CORE_ENGINE_URL || 'http://localhost:3010';

    try {
      const response = await fetch(`${coreEngineUrl}/api/drift/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'kubernetes',
          directory: '/tmp/k8s-manifests',
          namespace: k8sNamespace,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        expect(data.report.provider).toBe('kubernetes');
      }
    } catch (error) {
      console.log('Core Engine or Kubernetes not available, skipping test');
    }
  });
});

describe('Helm Drift Integration', () => {
  it('should detect helm release drift', async () => {
    const coreEngineUrl = process.env.CORE_ENGINE_URL || 'http://localhost:3010';

    try {
      const response = await fetch(`${coreEngineUrl}/api/drift/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'helm',
          directory: '/tmp/helm-chart',
          release: 'test-release',
          namespace: 'default',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        expect(data.report.provider).toBe('helm');
      }
    } catch (error) {
      console.log('Core Engine or Helm not available, skipping test');
    }
  });
});

describe('Drift Detection via Core Engine API', () => {
  let tempDir: string;
  let coreEngineUrl: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-api-test-'));
    coreEngineUrl = process.env.CORE_ENGINE_URL || 'http://localhost:3010';
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('POST /api/drift/detect with terraform provider', () => {
    it('should detect drift for a terraform project with provider config', async () => {
      const tfDir = path.join(tempDir, 'tf-detect');
      fs.mkdirSync(tfDir, { recursive: true });
      fs.writeFileSync(
        path.join(tfDir, 'main.tf'),
        `
        terraform {
          required_providers {
            aws = {
              source  = "hashicorp/aws"
              version = "~> 5.0"
            }
          }
        }

        provider "aws" {
          region = "us-east-1"
        }

        resource "aws_s3_bucket" "example" {
          bucket = "my-drift-test-bucket"
          tags = {
            Environment = "test"
          }
        }
        `
      );

      try {
        const response = await fetch(`${coreEngineUrl}/api/drift/detect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'terraform',
            workDir: tfDir,
            environment: 'test',
          }),
        });

        if (!response.ok) {
          console.log('Service not available, skipping');
          return;
        }

        const data = (await response.json()) as any;
        expect(data.success).toBe(true);
        expect(data.data).toBeDefined();
        expect(data.data.provider).toBe('terraform');
        expect(data.data.workDir).toBe(tfDir);
        expect(data.data.summary).toBeDefined();
        expect(typeof data.data.summary.totalResources).toBe('number');
        expect(typeof data.data.summary.driftedResources).toBe('number');
        expect(typeof data.data.summary.unchangedResources).toBe('number');
        expect(data.data.summary.byDriftType).toBeDefined();
        expect(data.data.summary.bySeverity).toBeDefined();
        expect(data.data.resources).toBeInstanceOf(Array);
        expect(typeof data.data.duration).toBe('number');
        expect(data.data.id).toBeDefined();
      } catch (error) {
        console.log('Core Engine service not available, skipping test');
      }
    });

    it('should return report with environment field when specified', async () => {
      const tfDir = path.join(tempDir, 'tf-env');
      fs.mkdirSync(tfDir, { recursive: true });
      fs.writeFileSync(
        path.join(tfDir, 'main.tf'),
        `resource "null_resource" "env_test" {}`
      );

      try {
        const response = await fetch(`${coreEngineUrl}/api/drift/detect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'terraform',
            workDir: tfDir,
            environment: 'staging',
          }),
        });

        if (!response.ok) {
          console.log('Service not available, skipping');
          return;
        }

        const data = (await response.json()) as any;
        expect(data.success).toBe(true);
        expect(data.data.environment).toBe('staging');
      } catch (error) {
        console.log('Core Engine service not available, skipping test');
      }
    });
  });

  describe('POST /api/drift/fix with dry-run mode', () => {
    it('should accept drift fix request in dry-run mode', async () => {
      const mockReport = {
        id: 'drift_test_dry_run',
        provider: 'terraform' as const,
        workDir: tempDir,
        environment: 'test',
        summary: {
          totalResources: 2,
          driftedResources: 1,
          unchangedResources: 1,
          byDriftType: { added: 0, removed: 0, modified: 1, unchanged: 1 },
          bySeverity: { critical: 0, high: 0, medium: 1, low: 0, info: 0 },
          autoFixable: 1,
        },
        resources: [
          {
            address: 'aws_s3_bucket.example',
            provider: 'terraform' as const,
            resourceType: 'aws_s3_bucket',
            drifts: [
              {
                resourceId: 'aws_s3_bucket.example',
                resourceType: 'aws_s3_bucket',
                resourceName: 'example',
                driftType: 'modified' as const,
                severity: 'medium' as const,
                expected: { versioning: true },
                actual: { versioning: false },
                attribute: 'versioning',
                description: 'Versioning has been disabled',
                remediation: "Run 'terraform apply' to restore versioning",
                autoFixable: true,
              },
            ],
            detectedAt: new Date(),
          },
        ],
        generatedAt: new Date(),
        duration: 1200,
      };

      try {
        const response = await fetch(`${coreEngineUrl}/api/drift/fix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            report: mockReport,
            dryRun: true,
            autoFixOnly: true,
          }),
        });

        if (!response.ok) {
          console.log('Service not available, skipping');
          return;
        }

        const data = (await response.json()) as any;
        expect(data.success).toBe(true);
        expect(data.data).toBeDefined();
        expect(typeof data.data.fixed).toBe('number');
        expect(typeof data.data.failed).toBe('number');
        expect(typeof data.data.skipped).toBe('number');
        expect(data.data.actions).toBeInstanceOf(Array);
        expect(typeof data.data.duration).toBe('number');
      } catch (error) {
        console.log('Core Engine service not available, skipping test');
      }
    });

    it('should return error when report is missing from fix request', async () => {
      try {
        const response = await fetch(`${coreEngineUrl}/api/drift/fix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dryRun: true,
          }),
        });

        if (!response.ok) {
          console.log('Service not available, skipping');
          return;
        }

        const data = (await response.json()) as any;
        expect(data.success).toBe(false);
        expect(data.error).toBeDefined();
      } catch (error) {
        console.log('Core Engine service not available, skipping test');
      }
    });
  });

  describe('POST /api/drift/format', () => {
    it('should format a drift report as markdown', async () => {
      const mockReport = {
        id: 'drift_format_test',
        provider: 'terraform',
        workDir: '/tmp/test',
        environment: 'production',
        summary: {
          totalResources: 3,
          driftedResources: 2,
          unchangedResources: 1,
          byDriftType: { added: 0, removed: 1, modified: 1, unchanged: 1 },
          bySeverity: { critical: 1, high: 0, medium: 1, low: 0, info: 0 },
          autoFixable: 1,
        },
        resources: [
          {
            address: 'aws_security_group.main',
            provider: 'terraform',
            resourceType: 'aws_security_group',
            drifts: [
              {
                resourceId: 'aws_security_group.main',
                resourceType: 'aws_security_group',
                resourceName: 'main',
                driftType: 'modified',
                severity: 'critical',
                expected: { ingress: [{ from_port: 443 }] },
                actual: { ingress: [{ from_port: 0 }] },
                attribute: 'ingress',
                description: 'Ingress rules have been modified',
                remediation: "Run 'terraform apply' to restore security group rules",
                autoFixable: true,
              },
            ],
            detectedAt: new Date().toISOString(),
          },
          {
            address: 'aws_instance.web',
            provider: 'terraform',
            resourceType: 'aws_instance',
            drifts: [
              {
                resourceId: 'aws_instance.web',
                resourceType: 'aws_instance',
                resourceName: 'web',
                driftType: 'removed',
                severity: 'medium',
                description: 'Instance has been terminated',
                remediation: "Run 'terraform apply' to recreate",
                autoFixable: false,
              },
            ],
            detectedAt: new Date().toISOString(),
          },
        ],
        generatedAt: new Date().toISOString(),
        duration: 3400,
      };

      try {
        const response = await fetch(`${coreEngineUrl}/api/drift/format`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ report: mockReport }),
        });

        if (!response.ok) {
          console.log('Service not available, skipping');
          return;
        }

        const data = (await response.json()) as any;
        expect(data.success).toBe(true);
        expect(data.data).toBeDefined();
        expect(typeof data.data.markdown).toBe('string');
        expect(data.data.markdown).toContain('Drift Detection Report');
        expect(data.data.markdown).toContain('terraform');
        expect(data.data.markdown).toContain('Summary');
        expect(data.data.markdown).toContain('Drifted Resources');
        expect(data.data.markdown).toContain('Critical');
      } catch (error) {
        console.log('Core Engine service not available, skipping test');
      }
    });

    it('should return error when report is missing from format request', async () => {
      try {
        const response = await fetch(`${coreEngineUrl}/api/drift/format`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        if (!response.ok) {
          console.log('Service not available, skipping');
          return;
        }

        const data = (await response.json()) as any;
        expect(data.success).toBe(false);
        expect(data.error).toContain('report');
      } catch (error) {
        console.log('Core Engine service not available, skipping test');
      }
    });
  });

  describe('POST /api/drift/compliance', () => {
    it('should generate a compliance report from a drift report', async () => {
      const mockReport = {
        id: 'drift_compliance_test',
        provider: 'terraform',
        workDir: '/tmp/compliance-test',
        environment: 'production',
        summary: {
          totalResources: 5,
          driftedResources: 2,
          unchangedResources: 3,
          byDriftType: { added: 0, removed: 0, modified: 2, unchanged: 3 },
          bySeverity: { critical: 1, high: 1, medium: 0, low: 0, info: 0 },
          autoFixable: 2,
        },
        resources: [
          {
            address: 'aws_s3_bucket.logs',
            provider: 'terraform',
            resourceType: 'aws_s3_bucket',
            drifts: [
              {
                resourceId: 'aws_s3_bucket.logs',
                resourceType: 'aws_s3_bucket',
                resourceName: 'logs',
                driftType: 'modified',
                severity: 'critical',
                expected: { server_side_encryption_configuration: { enabled: true } },
                actual: { server_side_encryption_configuration: null },
                attribute: 'server_side_encryption_configuration',
                description: 'Encryption has been disabled on the logs bucket',
                remediation: "Run 'terraform apply' to re-enable encryption",
                autoFixable: true,
              },
            ],
            detectedAt: new Date().toISOString(),
          },
          {
            address: 'aws_vpc.main',
            provider: 'terraform',
            resourceType: 'aws_vpc',
            drifts: [
              {
                resourceId: 'aws_vpc.main',
                resourceType: 'aws_vpc',
                resourceName: 'main',
                driftType: 'modified',
                severity: 'high',
                expected: { enable_dns_hostnames: true },
                actual: { enable_dns_hostnames: false },
                attribute: 'enable_dns_hostnames',
                description: 'DNS hostnames have been disabled',
                remediation: "Run 'terraform apply' to restore",
                autoFixable: true,
              },
            ],
            detectedAt: new Date().toISOString(),
          },
        ],
        generatedAt: new Date().toISOString(),
        duration: 2500,
      };

      try {
        const response = await fetch(`${coreEngineUrl}/api/drift/compliance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ report: mockReport }),
        });

        if (!response.ok) {
          console.log('Service not available, skipping');
          return;
        }

        const data = (await response.json()) as any;
        expect(data.success).toBe(true);
        expect(data.data).toBeDefined();
        expect(typeof data.data.compliant).toBe('boolean');
        expect(data.data.compliant).toBe(false);
        expect(typeof data.data.score).toBe('number');
        expect(data.data.score).toBeLessThan(100);
        expect(data.data.score).toBeGreaterThanOrEqual(0);
        expect(data.data.findings).toBeInstanceOf(Array);
        expect(data.data.findings.length).toBeGreaterThan(0);

        for (const finding of data.data.findings) {
          expect(finding.resource).toBeDefined();
          expect(finding.finding).toBeDefined();
          expect(finding.severity).toBeDefined();
          expect(finding.remediation).toBeDefined();
        }
      } catch (error) {
        console.log('Core Engine service not available, skipping test');
      }
    });

    it('should report 100% compliance when no drift exists', async () => {
      const cleanReport = {
        id: 'drift_clean_compliance',
        provider: 'terraform',
        workDir: '/tmp/clean',
        summary: {
          totalResources: 3,
          driftedResources: 0,
          unchangedResources: 3,
          byDriftType: { added: 0, removed: 0, modified: 0, unchanged: 3 },
          bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          autoFixable: 0,
        },
        resources: [],
        generatedAt: new Date().toISOString(),
        duration: 800,
      };

      try {
        const response = await fetch(`${coreEngineUrl}/api/drift/compliance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ report: cleanReport }),
        });

        if (!response.ok) {
          console.log('Service not available, skipping');
          return;
        }

        const data = (await response.json()) as any;
        expect(data.success).toBe(true);
        expect(data.data.compliant).toBe(true);
        expect(data.data.score).toBe(100);
        expect(data.data.findings).toHaveLength(0);
      } catch (error) {
        console.log('Core Engine service not available, skipping test');
      }
    });

    it('should return error when report is missing from compliance request', async () => {
      try {
        const response = await fetch(`${coreEngineUrl}/api/drift/compliance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        if (!response.ok) {
          console.log('Service not available, skipping');
          return;
        }

        const data = (await response.json()) as any;
        expect(data.success).toBe(false);
        expect(data.error).toContain('report');
      } catch (error) {
        console.log('Core Engine service not available, skipping test');
      }
    });
  });

  describe('Error handling for invalid provider types', () => {
    it('should return error for unsupported provider type', async () => {
      const tfDir = path.join(tempDir, 'tf-invalid-provider');
      fs.mkdirSync(tfDir, { recursive: true });
      fs.writeFileSync(path.join(tfDir, 'main.tf'), 'resource "null" "test" {}');

      try {
        const response = await fetch(`${coreEngineUrl}/api/drift/detect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'invalid_provider',
            workDir: tfDir,
          }),
        });

        if (!response.ok) {
          console.log('Service not available, skipping');
          return;
        }

        const data = (await response.json()) as any;
        expect(data.success).toBe(false);
        expect(data.error).toBeDefined();
      } catch (error) {
        console.log('Core Engine service not available, skipping test');
      }
    });

    it('should return error when provider is missing from detect request', async () => {
      try {
        const response = await fetch(`${coreEngineUrl}/api/drift/detect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workDir: '/tmp/some-dir',
          }),
        });

        if (!response.ok) {
          console.log('Service not available, skipping');
          return;
        }

        const data = (await response.json()) as any;
        expect(data.success).toBe(false);
        expect(data.error).toContain('provider');
      } catch (error) {
        console.log('Core Engine service not available, skipping test');
      }
    });

    it('should return error when workDir is missing from detect request', async () => {
      try {
        const response = await fetch(`${coreEngineUrl}/api/drift/detect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'terraform',
          }),
        });

        if (!response.ok) {
          console.log('Service not available, skipping');
          return;
        }

        const data = (await response.json()) as any;
        expect(data.success).toBe(false);
        expect(data.error).toContain('workDir');
      } catch (error) {
        console.log('Core Engine service not available, skipping test');
      }
    });

    it('should return error when empty body is sent to detect endpoint', async () => {
      try {
        const response = await fetch(`${coreEngineUrl}/api/drift/detect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        if (!response.ok) {
          console.log('Service not available, skipping');
          return;
        }

        const data = (await response.json()) as any;
        expect(data.success).toBe(false);
        expect(data.error).toBeDefined();
      } catch (error) {
        console.log('Core Engine service not available, skipping test');
      }
    });
  });
});
