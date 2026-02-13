import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Planner } from '../../services/core-engine-service/src/components/planner';
import { Verifier } from '../../services/core-engine-service/src/components/verifier';
import { Executor } from '../../services/core-engine-service/src/components/executor';
import { IntentParser } from '../../services/generator-service/src/conversational/intent-parser';
import { TerraformProjectGenerator } from '../../services/generator-service/src/generators/terraform-project-generator';
import type { AgentTask, ExecutionResult, AgentPlan, PlanStep } from '../../services/core-engine-service/src/types/agent';

/**
 * P95 Response Time Baseline Tests (Gap #15)
 *
 * Establishes performance baselines for critical operations.
 * Each test runs the operation multiple times and asserts that the P95
 * response time falls within acceptable thresholds.
 *
 * Thresholds are intentionally generous to avoid flaky tests in CI,
 * while still catching gross regressions (e.g. accidental O(n^2)).
 */

/** Number of iterations for each benchmark. */
const ITERATIONS = 20;

/** Sort durations ascending and return the P95 value. */
function computeP95(durations: number[]): number {
  const sorted = [...durations].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[index];
}

/** Sort durations and return the median. */
function computeMedian(durations: number[]): number {
  const sorted = [...durations].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Pretty-print benchmark results. */
function logBenchmark(name: string, durations: number[]): void {
  const p95 = computeP95(durations);
  const median = computeMedian(durations);
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;

  console.log(
    `  [BENCH] ${name}: p95=${p95.toFixed(1)}ms, median=${median.toFixed(1)}ms, avg=${avg.toFixed(1)}ms, min=${min.toFixed(1)}ms, max=${max.toFixed(1)}ms`,
  );
}

/** Helper: high-resolution timer using Bun's performance API. */
function now(): number {
  return performance.now();
}

describe('P95 Response Time Baselines', () => {
  const originalFetch = globalThis.fetch;

  beforeAll(() => {
    // Mock fetch for all benchmarks so we are not depending on external services
    globalThis.fetch = (() =>
      Promise.reject(new Error('benchmark: fetch disabled'))
    ) as any;
  });

  // Restore after all tests
  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  // =============================================
  // Planner benchmarks
  // =============================================

  describe('Planner', () => {
    const createTask = (components: string[]): AgentTask => ({
      id: 'bench-task',
      type: 'generate',
      status: 'pending',
      priority: 'medium',
      user_id: 'bench-user',
      created_at: new Date(),
      updated_at: new Date(),
      context: {
        provider: 'aws',
        environment: 'development',
        components,
        requirements: {},
      },
      execution: {},
    });

    it('P95 generatePlan (single component) should be < 50ms', async () => {
      const planner = new Planner();
      const durations: number[] = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const start = now();
        await planner.generatePlan(createTask(['vpc']));
        durations.push(now() - start);
      }

      const p95 = computeP95(durations);
      logBenchmark('Planner.generatePlan (1 component)', durations);
      expect(p95).toBeLessThan(50);
    });

    it('P95 generatePlan (4 components) should be < 100ms', async () => {
      const planner = new Planner();
      const durations: number[] = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const start = now();
        await planner.generatePlan(createTask(['vpc', 'eks', 'rds', 's3']));
        durations.push(now() - start);
      }

      const p95 = computeP95(durations);
      logBenchmark('Planner.generatePlan (4 components)', durations);
      expect(p95).toBeLessThan(100);
    });

    it('P95 validatePlan should be < 5ms', async () => {
      const planner = new Planner();
      const plan = await planner.generatePlan(createTask(['vpc', 'eks', 'rds', 's3']));
      const durations: number[] = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const start = now();
        planner.validatePlan(plan);
        durations.push(now() - start);
      }

      const p95 = computeP95(durations);
      logBenchmark('Planner.validatePlan', durations);
      expect(p95).toBeLessThan(5);
    });

    it('P95 optimizePlan should be < 5ms', async () => {
      const planner = new Planner();
      const plan = await planner.generatePlan(createTask(['vpc', 'eks', 'rds', 's3']));
      const durations: number[] = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const start = now();
        planner.optimizePlan(plan);
        durations.push(now() - start);
      }

      const p95 = computeP95(durations);
      logBenchmark('Planner.optimizePlan', durations);
      expect(p95).toBeLessThan(5);
    });
  });

  // =============================================
  // Verifier benchmarks
  // =============================================

  describe('Verifier', () => {
    const createResult = (): ExecutionResult => ({
      id: 'exec-bench',
      plan_id: 'plan-1',
      step_id: 'step-1',
      status: 'success',
      started_at: new Date(),
      completed_at: new Date(),
      duration: 5000,
      outputs: { vpc_id: 'vpc-123' },
      artifacts: [{
        id: 'a1',
        type: 'terraform',
        name: 'main.tf',
        path: '/tmp/main.tf',
        size: 100,
        checksum: 'abc',
        created_at: new Date(),
      }],
    });

    it('P95 verifyExecution (full context) should be < 20ms', async () => {
      const verifier = new Verifier();
      const durations: number[] = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const start = now();
        await verifier.verifyExecution([createResult()], {
          components: ['vpc', 'eks', 'rds', 's3'],
          encryption_at_rest: true,
          vpc_id: 'vpc-123',
          private_subnets: ['subnet-1'],
          iam_role: 'my-role',
          tags: { Environment: 'dev', Project: 'test', ManagedBy: 'terraform' },
          audit_logging: true,
          environment: 'development',
        });
        durations.push(now() - start);
      }

      const p95 = computeP95(durations);
      logBenchmark('Verifier.verifyExecution (full)', durations);
      expect(p95).toBeLessThan(20);
    });

    it('P95 verifyComponent should be < 5ms', async () => {
      const verifier = new Verifier();
      const durations: number[] = [];
      const components = ['vpc', 'eks', 'rds', 's3'];

      for (let i = 0; i < ITERATIONS; i++) {
        const component = components[i % components.length];
        const start = now();
        await verifier.verifyComponent(component, {
          vpc_cidr: '10.0.0.0/16',
          enable_flow_logs: true,
          cluster_encryption: true,
          endpoint_private_access: true,
          storage_encrypted: true,
          backup_retention_period: 7,
          publicly_accessible: false,
          server_side_encryption: true,
          block_public_access: true,
          enable_versioning: true,
        });
        durations.push(now() - start);
      }

      const p95 = computeP95(durations);
      logBenchmark('Verifier.verifyComponent', durations);
      expect(p95).toBeLessThan(5);
    });
  });

  // =============================================
  // IntentParser benchmarks
  // =============================================

  describe('IntentParser', () => {
    it('P95 parse (fallback mode) should be < 10ms', async () => {
      const parser = new IntentParser();
      const inputs = [
        'create a vpc on aws',
        'deploy kubernetes cluster',
        'help me with terraform',
        'explain what is eks',
        'modify the rds database',
        'create a helm chart',
        'generate s3 bucket for production',
        'build an ingress controller',
        'create a deployment in us-east-1',
        'setup staging environment',
      ];
      const durations: number[] = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const input = inputs[i % inputs.length];
        const start = now();
        await parser.parse(input);
        durations.push(now() - start);
      }

      const p95 = computeP95(durations);
      logBenchmark('IntentParser.parse (fallback)', durations);
      expect(p95).toBeLessThan(10);
    });
  });

  // =============================================
  // TerraformProjectGenerator benchmarks
  // =============================================

  describe('TerraformProjectGenerator', () => {
    it('P95 generate (single component) should be < 50ms', async () => {
      const generator = new TerraformProjectGenerator();
      const durations: number[] = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const start = now();
        await generator.generate({
          projectName: 'bench-project',
          provider: 'aws',
          region: 'us-east-1',
          components: ['vpc'],
        });
        durations.push(now() - start);
      }

      const p95 = computeP95(durations);
      logBenchmark('TerraformProjectGenerator.generate (1 component)', durations);
      expect(p95).toBeLessThan(50);
    });

    it('P95 generate (4 components) should be < 100ms', async () => {
      const generator = new TerraformProjectGenerator();
      const durations: number[] = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const start = now();
        await generator.generate({
          projectName: 'bench-full',
          provider: 'aws',
          region: 'us-east-1',
          components: ['vpc', 'eks', 'rds', 's3'],
        });
        durations.push(now() - start);
      }

      const p95 = computeP95(durations);
      logBenchmark('TerraformProjectGenerator.generate (4 components)', durations);
      expect(p95).toBeLessThan(100);
    });

    it('P95 validateProject should be < 20ms', async () => {
      const generator = new TerraformProjectGenerator();
      const project = await generator.generate({
        projectName: 'bench-validate',
        provider: 'aws',
        region: 'us-east-1',
        components: ['vpc', 'eks', 'rds', 's3'],
      });
      const durations: number[] = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const start = now();
        generator.validateProject(project.files);
        durations.push(now() - start);
      }

      const p95 = computeP95(durations);
      logBenchmark('TerraformProjectGenerator.validateProject', durations);
      expect(p95).toBeLessThan(20);
    });
  });

  // =============================================
  // Executor benchmarks
  // =============================================

  describe('Executor', () => {
    function makePlan(steps: Array<Partial<PlanStep> & { id: string; description: string; action: string }>): AgentPlan {
      return {
        id: 'bench-plan',
        task_id: 'bench-task',
        status: 'approved',
        created_at: new Date(),
        updated_at: new Date(),
        steps: steps.map((s, i) => ({
          order: i + 1,
          type: 'validate' as const,
          parameters: {},
          status: 'pending' as const,
          ...s,
        })),
        dependencies: [],
        risks: [],
        risk_level: 'low',
        requires_approval: false,
      };
    }

    it('P95 executePlan (single validate step) should be < 50ms', async () => {
      const executor = new Executor();
      const durations: number[] = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const plan = makePlan([{
          id: `step-${i}`,
          description: 'Validate',
          action: 'validate_requirements',
          parameters: { provider: 'aws', components: ['vpc'], requirements: {} },
        }]);

        const start = now();
        await executor.executePlan(plan);
        durations.push(now() - start);
      }

      const p95 = computeP95(durations);
      logBenchmark('Executor.executePlan (1 validate step)', durations);
      expect(p95).toBeLessThan(50);
    });

    it('P95 executePlan (generate component step) should be < 50ms', async () => {
      const executor = new Executor();
      const durations: number[] = [];

      for (let i = 0; i < ITERATIONS; i++) {
        const plan = makePlan([{
          id: `step-gen-${i}`,
          description: 'Generate VPC',
          action: 'generate_component',
          type: 'generate',
          parameters: { component: 'vpc', provider: 'aws', variables: {} },
        }]);

        const start = now();
        await executor.executePlan(plan);
        durations.push(now() - start);
      }

      const p95 = computeP95(durations);
      logBenchmark('Executor.executePlan (generate component)', durations);
      expect(p95).toBeLessThan(50);
    });
  });

  // =============================================
  // Cross-cutting: combined pipeline benchmark
  // =============================================

  describe('End-to-End Pipeline', () => {
    it('P95 full plan-execute-verify cycle should be < 200ms', async () => {
      const planner = new Planner();
      const executor = new Executor();
      const verifier = new Verifier();
      const durations: number[] = [];

      const task: AgentTask = {
        id: 'bench-e2e',
        type: 'generate',
        status: 'pending',
        priority: 'medium',
        user_id: 'bench-user',
        created_at: new Date(),
        updated_at: new Date(),
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['vpc'],
          requirements: {},
        },
        execution: {},
      };

      for (let i = 0; i < ITERATIONS; i++) {
        const start = now();

        // Plan
        const plan = await planner.generatePlan(task);

        // Execute first step only (validate)
        const executionPlan: AgentPlan = {
          ...plan,
          steps: [plan.steps[0]],
        };
        const results = await executor.executePlan(executionPlan);

        // Verify
        await verifier.verifyExecution(results, {
          components: ['vpc'],
          vpc_id: 'vpc-123',
          iam_role: 'my-role',
        });

        durations.push(now() - start);
      }

      const p95 = computeP95(durations);
      logBenchmark('E2E plan-execute-verify', durations);
      expect(p95).toBeLessThan(200);
    });
  });
});

