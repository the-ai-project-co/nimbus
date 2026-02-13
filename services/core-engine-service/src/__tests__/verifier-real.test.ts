import { describe, it, expect, beforeEach } from 'bun:test';
import { Verifier } from '../components/verifier';
import type { ExecutionResult } from '../types/agent';

describe('Verifier - Real Context Checks', () => {
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

  describe('Security checks', () => {
    it('should pass all security checks with proper config', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc', 'eks', 'rds', 's3'],
          encryption_at_rest: true,
          vpc_id: 'vpc-123',
          private_subnets: ['subnet-1'],
          iam_role: 'my-role',
          security_groups: [{ cidr: '10.0.0.0/8', from_port: 443, to_port: 443 }],
          public_access_block: true,
        }
      );

      const checks = result.checks.filter(c => c.type === 'security');
      const failedSecurity = checks.filter(c => c.status === 'failed');
      expect(failedSecurity.length).toBe(0);
    });

    it('should fail encryption check when disabled', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc'],
          encryption_at_rest: false,
        }
      );

      const encCheck = result.checks.find(c => c.id === 'sec_check_001');
      expect(encCheck?.status).toBe('failed');
    });

    it('should pass encryption check when not specified (default safe)', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc'],
          iam_role: 'my-role',
        }
      );

      const encCheck = result.checks.find(c => c.id === 'sec_check_001');
      expect(encCheck?.status).toBe('passed');
    });

    it('should fail network isolation when no VPC/subnets', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc'],
        }
      );

      const netCheck = result.checks.find(c => c.id === 'sec_check_002');
      expect(netCheck?.status).not.toBe('passed');
    });

    it('should pass network isolation when vpc_id is present', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc'],
          vpc_id: 'vpc-abc',
          iam_role: 'my-role',
        }
      );

      const netCheck = result.checks.find(c => c.id === 'sec_check_002');
      expect(netCheck?.status).toBe('passed');
    });

    it('should pass network isolation when private_subnets is present', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc'],
          private_subnets: ['subnet-1'],
          iam_role: 'my-role',
        }
      );

      const netCheck = result.checks.find(c => c.id === 'sec_check_002');
      expect(netCheck?.status).toBe('passed');
    });

    it('should fail IAM check when no iam_role is set', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc'],
          vpc_id: 'vpc-123',
        }
      );

      const iamCheck = result.checks.find(c => c.id === 'sec_check_003');
      expect(iamCheck?.status).toBe('failed');
      expect(iamCheck?.error).toContain('No IAM role');
    });

    it('should fail IAM check when policy contains wildcard action', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc'],
          vpc_id: 'vpc-123',
          iam_role: 'my-role',
          iam_policy: '{"Action": "*", "Resource": "*"}',
        }
      );

      const iamCheck = result.checks.find(c => c.id === 'sec_check_003');
      expect(iamCheck?.status).toBe('failed');
      expect(iamCheck?.error).toContain('wildcard');
    });

    it('should fail security group check with overly permissive rules', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['eks'],
          iam_role: 'my-role',
          vpc_id: 'vpc-123',
          security_groups: [{ cidr: '0.0.0.0/0', from_port: 0, to_port: 65535 }],
        }
      );

      const sgCheck = result.checks.find(c => c.id === 'sec_check_004');
      expect(sgCheck?.status).toBe('failed');
    });

    it('should pass security group check with restrictive rules', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['eks'],
          iam_role: 'my-role',
          vpc_id: 'vpc-123',
          security_groups: [{ cidr: '10.0.0.0/8', from_port: 443, to_port: 443 }],
        }
      );

      const sgCheck = result.checks.find(c => c.id === 'sec_check_004');
      expect(sgCheck?.status).toBe('passed');
    });

    it('should not include security group check for non-eks/rds components', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc', 's3'],
          iam_role: 'my-role',
          vpc_id: 'vpc-123',
        }
      );

      const sgCheck = result.checks.find(c => c.id === 'sec_check_004');
      expect(sgCheck).toBeUndefined();
    });

    it('should fail S3 public access when not blocked', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['s3'],
          public_access_block: false,
        }
      );

      const s3Check = result.checks.find(c => c.id === 'sec_check_005');
      expect(s3Check?.status).toBe('failed');
    });

    it('should pass S3 public access when explicitly blocked', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['s3'],
          public_access_block: true,
          iam_role: 'my-role',
          vpc_id: 'vpc-123',
        }
      );

      const s3Check = result.checks.find(c => c.id === 'sec_check_005');
      expect(s3Check?.status).toBe('passed');
    });

    it('should pass S3 public access when not specified (default safe)', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['s3'],
          iam_role: 'my-role',
          vpc_id: 'vpc-123',
        }
      );

      const s3Check = result.checks.find(c => c.id === 'sec_check_005');
      expect(s3Check?.status).toBe('passed');
    });
  });

  describe('Compliance checks', () => {
    it('should pass when all required tags present', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc'],
          tags: { Environment: 'dev', Project: 'nimbus', ManagedBy: 'terraform' },
          audit_logging: true,
        }
      );

      const tagCheck = result.checks.find(c => c.id === 'comp_check_001');
      expect(tagCheck?.status).toBe('passed');
    });

    it('should fail when required tags missing', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc'],
          tags: { Environment: 'dev' },
        }
      );

      const tagCheck = result.checks.find(c => c.id === 'comp_check_001');
      expect(tagCheck?.status).toBe('failed');
      expect(tagCheck?.error).toContain('Project');
      expect(tagCheck?.error).toContain('ManagedBy');
    });

    it('should fail when no tags provided at all', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc'],
        }
      );

      const tagCheck = result.checks.find(c => c.id === 'comp_check_001');
      expect(tagCheck?.status).toBe('failed');
      expect(tagCheck?.error).toContain('Environment');
      expect(tagCheck?.error).toContain('Project');
      expect(tagCheck?.error).toContain('ManagedBy');
    });

    it('should use case-sensitive tag matching', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc'],
          tags: { environment: 'dev', project: 'nimbus', managedby: 'terraform' },
        }
      );

      const tagCheck = result.checks.find(c => c.id === 'comp_check_001');
      expect(tagCheck?.status).toBe('failed');
    });

    it('should fail backup check when explicitly disabled', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['rds'],
          backup_enabled: false,
        }
      );

      const backupCheck = result.checks.find(c => c.id === 'comp_check_002');
      expect(backupCheck?.status).toBe('failed');
    });

    it('should pass backup check when not specified (default safe)', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['rds'],
          iam_role: 'my-role',
          vpc_id: 'vpc-123',
        }
      );

      const backupCheck = result.checks.find(c => c.id === 'comp_check_002');
      expect(backupCheck?.status).toBe('passed');
    });

    it('should fail audit logging when explicitly disabled', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc'],
          audit_logging: false,
        }
      );

      const auditCheck = result.checks.find(c => c.id === 'comp_check_003');
      expect(auditCheck?.status).toBe('failed');
    });

    it('should pass audit logging when not specified', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc'],
          iam_role: 'my-role',
          vpc_id: 'vpc-123',
        }
      );

      const auditCheck = result.checks.find(c => c.id === 'comp_check_003');
      expect(auditCheck?.status).toBe('passed');
    });

    it('should warn on missing S3 lifecycle rules', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['s3'],
          iam_role: 'my-role',
          vpc_id: 'vpc-123',
        }
      );

      const retentionCheck = result.checks.find(c => c.id === 'comp_check_004');
      expect(retentionCheck?.status).toBe('warning');
    });

    it('should pass S3 data retention when lifecycle rules present', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['s3'],
          lifecycle_rules: [{ transition: { days: 30, storage_class: 'GLACIER' } }],
          iam_role: 'my-role',
          vpc_id: 'vpc-123',
        }
      );

      const retentionCheck = result.checks.find(c => c.id === 'comp_check_004');
      expect(retentionCheck?.status).toBe('passed');
    });
  });

  describe('Performance checks', () => {
    it('should compute EKS provisioning time from actual results', async () => {
      const eksResult = createMockResult({
        step_id: 'deploy-eks-cluster',
        duration: 480000, // 8 minutes
      });

      const result = await verifier.verifyExecution(
        [eksResult],
        {
          components: ['eks'],
          iam_role: 'my-role',
          vpc_id: 'vpc-123',
        }
      );

      const eksCheck = result.checks.find(c => c.id === 'perf_check_002');
      expect(eksCheck?.status).toBe('passed');
      expect(eksCheck?.actual).toBe('8 minutes');
    });

    it('should warn when EKS provisioning exceeds 15 minutes', async () => {
      const eksResult = createMockResult({
        step_id: 'deploy-eks-cluster',
        duration: 1200000, // 20 minutes
      });

      const result = await verifier.verifyExecution(
        [eksResult],
        {
          components: ['eks'],
          iam_role: 'my-role',
          vpc_id: 'vpc-123',
        }
      );

      const eksCheck = result.checks.find(c => c.id === 'perf_check_002');
      expect(eksCheck?.status).toBe('warning');
    });

    it('should show N/A for EKS provisioning when no EKS result found', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult({ step_id: 'deploy-vpc' })],
        {
          components: ['eks'],
          iam_role: 'my-role',
          vpc_id: 'vpc-123',
        }
      );

      const eksCheck = result.checks.find(c => c.id === 'perf_check_002');
      expect(eksCheck?.actual).toBe('N/A');
    });

    it('should warn on undersized instance for production', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc'],
          environment: 'production',
          instance_type: 't3.micro',
          iam_role: 'my-role',
          vpc_id: 'vpc-123',
        }
      );

      const sizeCheck = result.checks.find(c => c.id === 'perf_check_003');
      expect(sizeCheck?.status).toBe('warning');
    });

    it('should pass instance sizing for non-production with small instance', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc'],
          environment: 'development',
          instance_type: 't3.micro',
          iam_role: 'my-role',
          vpc_id: 'vpc-123',
        }
      );

      const sizeCheck = result.checks.find(c => c.id === 'perf_check_003');
      expect(sizeCheck?.status).toBe('passed');
    });
  });

  describe('Cost checks', () => {
    it('should warn on S3 without lifecycle rules', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['s3'],
          iam_role: 'my-role',
          vpc_id: 'vpc-123',
        }
      );

      const lifecycleCheck = result.checks.find(c => c.id === 'cost_check_002');
      expect(lifecycleCheck?.status).toBe('warning');
    });

    it('should pass S3 with lifecycle rules configured', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['s3'],
          lifecycle_rules: [{ days: 90 }],
          iam_role: 'my-role',
          vpc_id: 'vpc-123',
        }
      );

      const lifecycleCheck = result.checks.find(c => c.id === 'cost_check_002');
      expect(lifecycleCheck?.status).toBe('passed');
    });

    it('should warn on multiple NAT gateways in non-production', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc'],
          environment: 'development',
          single_nat_gateway: false,
          iam_role: 'my-role',
          vpc_id: 'vpc-123',
        }
      );

      const natCheck = result.checks.find(c => c.id === 'cost_check_003');
      expect(natCheck?.status).toBe('warning');
    });

    it('should pass NAT gateway check when single_nat_gateway is not false in non-prod', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc'],
          environment: 'development',
          single_nat_gateway: true,
          iam_role: 'my-role',
          vpc_id: 'vpc-123',
        }
      );

      const natCheck = result.checks.find(c => c.id === 'cost_check_003');
      expect(natCheck?.status).toBe('passed');
    });
  });

  describe('Component verification', () => {
    it('should validate VPC CIDR format', async () => {
      const checks = await verifier.verifyComponent('vpc', {
        vpc_cidr: '10.0.0.0/16',
        enable_flow_logs: true,
      });

      const cidrCheck = checks.find(c => c.id === 'vpc_001');
      expect(cidrCheck?.status).toBe('passed');
    });

    it('should fail VPC with invalid CIDR', async () => {
      const checks = await verifier.verifyComponent('vpc', {
        vpc_cidr: 'invalid-cidr',
        enable_flow_logs: true,
      });

      const cidrCheck = checks.find(c => c.id === 'vpc_001');
      expect(cidrCheck?.status).toBe('failed');
    });

    it('should fail VPC with missing CIDR', async () => {
      const checks = await verifier.verifyComponent('vpc', {
        enable_flow_logs: true,
      });

      const cidrCheck = checks.find(c => c.id === 'vpc_001');
      expect(cidrCheck?.status).toBe('failed');
    });

    it('should warn on VPC without flow logs', async () => {
      const checks = await verifier.verifyComponent('vpc', {
        vpc_cidr: '10.0.0.0/16',
        enable_flow_logs: false,
      });

      const flowCheck = checks.find(c => c.id === 'vpc_002');
      expect(flowCheck?.status).toBe('warning');
    });

    it('should check EKS encryption and private endpoint', async () => {
      const checks = await verifier.verifyComponent('eks', {
        cluster_encryption: true,
        endpoint_private_access: true,
      });

      expect(checks.every(c => c.status === 'passed')).toBe(true);
    });

    it('should fail EKS when encryption disabled', async () => {
      const checks = await verifier.verifyComponent('eks', {
        cluster_encryption: false,
      });

      const encCheck = checks.find(c => c.id === 'eks_001');
      expect(encCheck?.status).toBe('failed');
    });

    it('should fail EKS when endpoint private access disabled', async () => {
      const checks = await verifier.verifyComponent('eks', {
        cluster_encryption: true,
        endpoint_private_access: false,
      });

      const endpointCheck = checks.find(c => c.id === 'eks_002');
      expect(endpointCheck?.status).toBe('failed');
    });

    it('should check RDS encryption, backups, and public access', async () => {
      const checks = await verifier.verifyComponent('rds', {
        storage_encrypted: true,
        backup_retention_period: 7,
        publicly_accessible: false,
      });

      expect(checks.every(c => c.status === 'passed')).toBe(true);
    });

    it('should fail RDS when publicly accessible', async () => {
      const checks = await verifier.verifyComponent('rds', {
        storage_encrypted: true,
        backup_retention_period: 7,
        publicly_accessible: true,
      });

      const pubCheck = checks.find(c => c.id === 'rds_003');
      expect(pubCheck?.status).toBe('failed');
    });

    it('should fail RDS when storage encryption disabled', async () => {
      const checks = await verifier.verifyComponent('rds', {
        storage_encrypted: false,
        backup_retention_period: 7,
        publicly_accessible: false,
      });

      const encCheck = checks.find(c => c.id === 'rds_001');
      expect(encCheck?.status).toBe('failed');
    });

    it('should fail RDS when backup retention is 0', async () => {
      const checks = await verifier.verifyComponent('rds', {
        storage_encrypted: true,
        backup_retention_period: 0,
        publicly_accessible: false,
      });

      const backupCheck = checks.find(c => c.id === 'rds_002');
      expect(backupCheck?.status).toBe('failed');
    });

    it('should fail RDS when backup retention not set', async () => {
      const checks = await verifier.verifyComponent('rds', {
        storage_encrypted: true,
        publicly_accessible: false,
      });

      const backupCheck = checks.find(c => c.id === 'rds_002');
      expect(backupCheck?.status).toBe('failed');
    });

    it('should check S3 encryption, public access block, versioning', async () => {
      const checks = await verifier.verifyComponent('s3', {
        server_side_encryption: true,
        block_public_access: true,
        enable_versioning: true,
      });

      expect(checks.every(c => c.status === 'passed')).toBe(true);
    });

    it('should fail S3 when encryption disabled', async () => {
      const checks = await verifier.verifyComponent('s3', {
        server_side_encryption: false,
        block_public_access: true,
        enable_versioning: true,
      });

      const encCheck = checks.find(c => c.id === 's3_001');
      expect(encCheck?.status).toBe('failed');
    });

    it('should fail S3 when public access block disabled', async () => {
      const checks = await verifier.verifyComponent('s3', {
        server_side_encryption: true,
        block_public_access: false,
        enable_versioning: true,
      });

      const pubCheck = checks.find(c => c.id === 's3_002');
      expect(pubCheck?.status).toBe('failed');
    });

    it('should warn S3 when versioning not enabled', async () => {
      const checks = await verifier.verifyComponent('s3', {
        server_side_encryption: true,
        block_public_access: true,
        enable_versioning: false,
      });

      const verCheck = checks.find(c => c.id === 's3_003');
      expect(verCheck?.status).toBe('warning');
    });

    it('should return empty checks for unknown component', async () => {
      const checks = await verifier.verifyComponent('unknown', {});
      expect(checks.length).toBe(0);
    });
  });

  describe('Overall verification', () => {
    it('should report failed status when any check fails', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc'],
          encryption_at_rest: false,
        }
      );

      expect(result.status).toBe('failed');
      expect(result.summary.failed).toBeGreaterThan(0);
    });

    it('should report passed status with good config', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc'],
          encryption_at_rest: true,
          vpc_id: 'vpc-123',
          private_subnets: ['subnet-1'],
          iam_role: 'my-role',
          tags: { Environment: 'dev', Project: 'nimbus', ManagedBy: 'terraform' },
          audit_logging: true,
        }
      );

      expect(result.summary.failed).toBe(0);
    });

    it('should report warning status when only warnings exist', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc'],
          encryption_at_rest: true,
          vpc_id: 'vpc-123',
          private_subnets: ['subnet-1'],
          iam_role: 'my-role',
          tags: { Environment: 'dev', Project: 'nimbus', ManagedBy: 'terraform' },
          audit_logging: true,
          environment: 'development',
          single_nat_gateway: false,
        }
      );

      // NAT gateway check should produce a warning, no failures expected
      // since all security/compliance checks pass
      expect(result.summary.failed).toBe(0);
      expect(result.summary.warnings).toBeGreaterThan(0);
      expect(result.status).toBe('warning');
    });

    it('should include correct summary counts', async () => {
      const result = await verifier.verifyExecution(
        [createMockResult()],
        {
          components: ['vpc'],
          encryption_at_rest: true,
          vpc_id: 'vpc-123',
          iam_role: 'my-role',
          tags: { Environment: 'dev', Project: 'nimbus', ManagedBy: 'terraform' },
          audit_logging: true,
        }
      );

      expect(result.summary.total_checks).toBe(
        result.summary.passed + result.summary.failed + result.summary.warnings
      );
    });

    it('should generate unique verification IDs', async () => {
      const result1 = await verifier.verifyExecution(
        [createMockResult()],
        { components: ['vpc'] }
      );
      const result2 = await verifier.verifyExecution(
        [createMockResult()],
        { components: ['vpc'] }
      );

      expect(result1.id).not.toBe(result2.id);
    });
  });
});
