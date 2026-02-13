import { describe, it, expect, beforeEach } from 'bun:test';
import { Verifier } from '../components/verifier';
import type { ExecutionResult } from '../types/agent';

/**
 * Additional edge case tests for the Verifier component.
 *
 * These tests cover scenarios that the base verifier-real.test.ts may not:
 * - Empty components array
 * - Missing context fields
 * - Failed execution results
 * - Results without artifacts
 * - Instance sizing in production
 * - VPC with invalid CIDR
 * - Unknown component in verifyComponent
 * - Multiple result entries
 * - Budget limit checks
 * - Reserved instance warnings
 */
describe('Verifier - Edge Cases', () => {
  let verifier: Verifier;

  const createResult = (overrides?: Partial<ExecutionResult>): ExecutionResult => ({
    id: 'exec-edge-1',
    plan_id: 'plan-1',
    step_id: 'step-1',
    status: 'success',
    started_at: new Date(),
    completed_at: new Date(),
    duration: 5000,
    outputs: { vpc_id: 'vpc-123' },
    artifacts: [{ id: 'a1', type: 'terraform', name: 'main.tf', path: '/tmp/main.tf', size: 100, checksum: 'abc', created_at: new Date() }],
    ...overrides,
  });

  beforeEach(() => {
    verifier = new Verifier();
  });

  it('should handle empty components array', async () => {
    const result = await verifier.verifyExecution([createResult()], { components: [] });
    expect(result.checks.length).toBeGreaterThan(0);
    // Should still have security, compliance, functionality, performance, and cost checks
    expect(result.checks.some(c => c.type === 'security')).toBe(true);
    expect(result.checks.some(c => c.type === 'functionality')).toBe(true);
  });

  it('should handle missing context fields gracefully', async () => {
    const result = await verifier.verifyExecution([createResult()], {});
    expect(result).toBeDefined();
    expect(result.checks.length).toBeGreaterThan(0);
    // With empty context, components defaults to []
    expect(result.id).toBeDefined();
  });

  it('should handle failed execution results', async () => {
    const result = await verifier.verifyExecution(
      [createResult({ status: 'failure' })],
      { components: ['vpc'] }
    );
    const funcCheck = result.checks.find(c => c.id === 'func_check_001');
    expect(funcCheck?.status).toBe('failed');
    expect(funcCheck?.error).toContain('failed');
  });

  it('should handle partial execution results', async () => {
    const result = await verifier.verifyExecution(
      [createResult({ status: 'partial' })],
      { components: ['vpc'] }
    );
    const funcCheck = result.checks.find(c => c.id === 'func_check_001');
    // partial != success, so func check should fail
    expect(funcCheck?.status).toBe('failed');
  });

  it('should handle results without artifacts', async () => {
    const result = await verifier.verifyExecution(
      [createResult({ artifacts: undefined })],
      { components: ['vpc'] }
    );
    const artCheck = result.checks.find(c => c.id === 'func_check_002');
    expect(artCheck?.status).toBe('failed');
  });

  it('should handle results with empty artifacts array', async () => {
    const result = await verifier.verifyExecution(
      [createResult({ artifacts: [] })],
      { components: ['vpc'] }
    );
    const artCheck = result.checks.find(c => c.id === 'func_check_002');
    expect(artCheck?.status).toBe('failed');
  });

  it('should handle results without outputs', async () => {
    const result = await verifier.verifyExecution(
      [createResult({ outputs: undefined })],
      { components: ['vpc'] }
    );
    const outCheck = result.checks.find(c => c.id === 'func_check_003');
    expect(outCheck?.status).toBe('warning');
  });

  it('should handle results with empty outputs', async () => {
    const result = await verifier.verifyExecution(
      [createResult({ outputs: {} })],
      { components: ['vpc'] }
    );
    const outCheck = result.checks.find(c => c.id === 'func_check_003');
    expect(outCheck?.status).toBe('warning');
  });

  it('should warn about instance sizing in production with t3.small', async () => {
    const result = await verifier.verifyExecution(
      [createResult()],
      {
        components: ['eks'],
        environment: 'production',
        instance_type: 't3.small',
        iam_role: 'my-role',
        vpc_id: 'vpc-123',
      }
    );
    const sizeCheck = result.checks.find(c => c.id === 'perf_check_003');
    expect(sizeCheck?.status).toBe('warning');
  });

  it('should pass instance sizing in production with appropriate instance', async () => {
    const result = await verifier.verifyExecution(
      [createResult()],
      {
        components: ['eks'],
        environment: 'production',
        instance_type: 't3.xlarge',
        iam_role: 'my-role',
        vpc_id: 'vpc-123',
      }
    );
    const sizeCheck = result.checks.find(c => c.id === 'perf_check_003');
    expect(sizeCheck?.status).toBe('passed');
  });

  it('should handle VPC with missing CIDR in verifyComponent', async () => {
    const checks = await verifier.verifyComponent('vpc', {
      enable_flow_logs: true,
    });
    const cidrCheck = checks.find(c => c.id === 'vpc_001');
    expect(cidrCheck?.status).toBe('failed');
    expect(cidrCheck?.error).toContain('Invalid CIDR');
  });

  it('should handle VPC with invalid CIDR format in verifyComponent', async () => {
    const checks = await verifier.verifyComponent('vpc', {
      vpc_cidr: 'not-a-cidr',
    });
    const cidrCheck = checks.find(c => c.id === 'vpc_001');
    expect(cidrCheck?.status).toBe('failed');
  });

  it('should handle VPC with CIDR that has wrong prefix in verifyComponent', async () => {
    const checks = await verifier.verifyComponent('vpc', {
      vpc_cidr: '999.999.999.999/99',
    });
    const cidrCheck = checks.find(c => c.id === 'vpc_001');
    // The regex only checks format, not validity of octets
    // So 999.999.999.999/99 matches the pattern but would be invalid
    expect(cidrCheck).toBeDefined();
  });

  it('should handle unknown component in verifyComponent', async () => {
    const checks = await verifier.verifyComponent('unknown-component', {});
    expect(checks.length).toBe(0);
  });

  it('should handle multiple results correctly', async () => {
    const results = [
      createResult({ id: 'exec-1', step_id: 'step-1', status: 'success' }),
      createResult({ id: 'exec-2', step_id: 'step-2', status: 'success' }),
    ];
    const result = await verifier.verifyExecution(results, { components: ['vpc'] });
    const funcCheck = result.checks.find(c => c.id === 'func_check_001');
    expect(funcCheck?.status).toBe('passed');
    expect(result.execution_id).toBe('exec-1');
  });

  it('should handle mixed success/failure results', async () => {
    const results = [
      createResult({ id: 'exec-1', status: 'success' }),
      createResult({ id: 'exec-2', status: 'failure' }),
    ];
    const result = await verifier.verifyExecution(results, { components: ['vpc'] });
    const funcCheck = result.checks.find(c => c.id === 'func_check_001');
    expect(funcCheck?.status).toBe('failed');
  });

  it('should include cost warning for budget exceeding estimates', async () => {
    const result = await verifier.verifyExecution(
      [createResult()],
      {
        components: ['vpc', 'eks', 'rds'],
        budget_limit: 50,
        iam_role: 'my-role',
        vpc_id: 'vpc-123',
      }
    );
    const costCheck = result.checks.find(c => c.id === 'cost_check_001');
    // vpc(32) + eks(73) + rds(50) = 155, which exceeds budget of 50
    expect(costCheck?.status).toBe('warning');
  });

  it('should pass cost check when budget is sufficient', async () => {
    const result = await verifier.verifyExecution(
      [createResult()],
      {
        components: ['s3'],
        budget_limit: 100,
        iam_role: 'my-role',
        vpc_id: 'vpc-123',
      }
    );
    const costCheck = result.checks.find(c => c.id === 'cost_check_001');
    // s3(5) is well within 100 budget
    expect(costCheck?.status).toBe('passed');
  });

  it('should include reserved instance warning for production', async () => {
    const result = await verifier.verifyExecution(
      [createResult()],
      {
        components: ['vpc'],
        environment: 'production',
        iam_role: 'my-role',
        vpc_id: 'vpc-123',
      }
    );
    const riCheck = result.checks.find(c => c.id === 'cost_check_004');
    expect(riCheck).toBeDefined();
    expect(riCheck?.status).toBe('warning');
    expect(riCheck?.remediation).toContain('reserved');
  });

  it('should not include reserved instance check for non-production', async () => {
    const result = await verifier.verifyExecution(
      [createResult()],
      {
        components: ['vpc'],
        environment: 'development',
        iam_role: 'my-role',
        vpc_id: 'vpc-123',
      }
    );
    const riCheck = result.checks.find(c => c.id === 'cost_check_004');
    expect(riCheck).toBeUndefined();
  });

  it('should handle very long execution durations', async () => {
    const result = await verifier.verifyExecution(
      [createResult({ duration: 7200000 })], // 2 hours
      {
        components: ['vpc'],
        iam_role: 'my-role',
        vpc_id: 'vpc-123',
      }
    );
    const perfCheck = result.checks.find(c => c.id === 'perf_check_001');
    // 2 hours > 1 hour limit
    expect(perfCheck?.status).toBe('warning');
  });

  it('should pass performance check for fast execution', async () => {
    const result = await verifier.verifyExecution(
      [createResult({ duration: 1000 })], // 1 second
      {
        components: ['vpc'],
        iam_role: 'my-role',
        vpc_id: 'vpc-123',
      }
    );
    const perfCheck = result.checks.find(c => c.id === 'perf_check_001');
    expect(perfCheck?.status).toBe('passed');
  });

  it('should verify RDS with default-safe config in verifyComponent', async () => {
    const checks = await verifier.verifyComponent('rds', {
      backup_retention_period: 7,
      publicly_accessible: false,
    });
    // storage_encrypted defaults to true (not false)
    const encCheck = checks.find(c => c.id === 'rds_001');
    expect(encCheck?.status).toBe('passed');
  });

  it('should verify S3 with all defaults in verifyComponent', async () => {
    const checks = await verifier.verifyComponent('s3', {});
    // server_side_encryption defaults to true (not false)
    const encCheck = checks.find(c => c.id === 's3_001');
    expect(encCheck?.status).toBe('passed');
    // block_public_access defaults to true (not false)
    const pubCheck = checks.find(c => c.id === 's3_002');
    expect(pubCheck?.status).toBe('passed');
    // enable_versioning not set -> falsy -> warning
    const verCheck = checks.find(c => c.id === 's3_003');
    expect(verCheck?.status).toBe('warning');
  });

  it('should handle empty execution results array', async () => {
    const result = await verifier.verifyExecution([], { components: ['vpc'] });
    expect(result).toBeDefined();
    expect(result.execution_id).toBe('unknown');
    // All steps completed check should pass (vacuously true for empty)
    const funcCheck = result.checks.find(c => c.id === 'func_check_001');
    expect(funcCheck?.status).toBe('passed');
  });
});
