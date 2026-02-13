import { describe, test, expect, beforeEach, mock, spyOn } from 'bun:test';
import { Executor } from '../components/executor';
import type { AgentPlan, PlanStep } from '../types/agent';

/** Helper to create a valid AgentPlan with required fields */
function makePlan(overrides: {
  id: string;
  goal?: string;
  steps: Array<Omit<PlanStep, 'order' | 'type'> & { order?: number; type?: PlanStep['type'] }>;
}): AgentPlan {
  return {
    id: overrides.id,
    task_id: 'test-task',
    status: 'approved',
    created_at: new Date(),
    updated_at: new Date(),
    steps: overrides.steps.map((s, i) => ({
      order: i + 1,
      type: 'validate' as const,
      ...s,
    })),
    dependencies: [],
    risks: [],
    risk_level: 'low',
    requires_approval: false,
  };
}

describe('Executor', () => {
  let executor: Executor;

  beforeEach(() => {
    executor = new Executor();
  });

  describe('executePlan', () => {
    test('should execute a simple plan with one step', async () => {
      const plan = makePlan({
        id: 'test-plan-1',
        steps: [
          {
            id: 'step-1',
            description: 'Validate requirements',
            action: 'validate_requirements',
            status: 'pending',
            parameters: {
              provider: 'aws',
              components: ['vpc'],
              requirements: {},
            },
          },
        ],
      });

      const results = await executor.executePlan(plan);

      expect(results.length).toBe(1);
      expect(results[0].status).toBe('success');
      expect(results[0].outputs).toBeDefined();
      expect(results[0].outputs?.validated).toBe(true);
    });

    test('should execute steps respecting dependencies', async () => {
      const plan = makePlan({
        id: 'test-plan-2',
        steps: [
          {
            id: 'step-1',
            description: 'First step',
            action: 'validate_requirements',
            status: 'pending',
            parameters: {
              provider: 'aws',
              components: ['vpc'],
              requirements: {},
            },
          },
          {
            id: 'step-2',
            description: 'Second step (depends on step 1)',
            action: 'validate_requirements',
            status: 'pending',
            depends_on: ['step-1'],
            parameters: {
              provider: 'aws',
              components: ['eks'],
              requirements: {},
            },
          },
        ],
      });

      const results = await executor.executePlan(plan);

      expect(results.length).toBe(2);
      expect(results[0].step_id).toBe('step-1');
      expect(results[1].step_id).toBe('step-2');
      expect(results.every(r => r.status === 'success')).toBe(true);
    });

    test('should stop execution on step failure', async () => {
      const plan = makePlan({
        id: 'test-plan-3',
        steps: [
          {
            id: 'step-1',
            description: 'Invalid validation',
            action: 'validate_requirements',
            status: 'pending',
            parameters: {
              provider: 'invalid-provider',
              components: [],
              requirements: {},
            },
          },
          {
            id: 'step-2',
            description: 'Should not execute',
            action: 'validate_requirements',
            status: 'pending',
            parameters: {
              provider: 'aws',
              components: ['vpc'],
              requirements: {},
            },
          },
        ],
      });

      const results = await executor.executePlan(plan);

      expect(results.length).toBe(1);
      expect(results[0].status).toBe('failure');
      expect(results[0].error).toBeDefined();
    });
  });

  describe('validateRequirements', () => {
    test('should validate AWS provider and VPC component', async () => {
      const plan = makePlan({
        id: 'test-validate-1',
        steps: [
          {
            id: 'step-1',
            description: 'Validate',
            action: 'validate_requirements',
            status: 'pending',
            parameters: {
              provider: 'aws',
              components: ['vpc', 'eks', 'rds'],
              requirements: {},
            },
          },
        ],
      });

      const results = await executor.executePlan(plan);

      expect(results[0].status).toBe('success');
      expect(results[0].outputs?.validated).toBe(true);
      expect(results[0].outputs?.provider).toBe('aws');
      expect(results[0].outputs?.components).toEqual(['vpc', 'eks', 'rds']);
    });

    test('should reject invalid provider', async () => {
      const plan = makePlan({
        id: 'test-validate-2',
        steps: [
          {
            id: 'step-1',
            description: 'Validate',
            action: 'validate_requirements',
            status: 'pending',
            parameters: {
              provider: 'invalid',
              components: ['vpc'],
              requirements: {},
            },
          },
        ],
      });

      const results = await executor.executePlan(plan);

      expect(results[0].status).toBe('failure');
      expect(results[0].error?.message).toContain('Invalid provider');
    });

    test('should reject invalid component', async () => {
      const plan = makePlan({
        id: 'test-validate-3',
        steps: [
          {
            id: 'step-1',
            description: 'Validate',
            action: 'validate_requirements',
            status: 'pending',
            parameters: {
              provider: 'aws',
              components: ['invalid-component'],
              requirements: {},
            },
          },
        ],
      });

      const results = await executor.executePlan(plan);

      expect(results[0].status).toBe('failure');
      expect(results[0].error?.message).toContain('Invalid component');
    });

    test('should reject empty components array', async () => {
      const plan = makePlan({
        id: 'test-validate-4',
        steps: [
          {
            id: 'step-1',
            description: 'Validate',
            action: 'validate_requirements',
            status: 'pending',
            parameters: {
              provider: 'aws',
              components: [],
              requirements: {},
            },
          },
        ],
      });

      const results = await executor.executePlan(plan);

      expect(results[0].status).toBe('failure');
      expect(results[0].error?.message).toContain('No components');
    });
  });

  describe('generateComponent', () => {
    test('should generate component and create artifact', async () => {
      const plan = makePlan({
        id: 'test-generate-1',
        steps: [
          {
            id: 'step-1',
            type: 'generate',
            description: 'Generate VPC component',
            action: 'generate_component',
            status: 'pending',
            parameters: {
              component: 'vpc',
              provider: 'aws',
              variables: { project_name: 'test' },
            },
          },
        ],
      });

      const results = await executor.executePlan(plan);

      expect(results[0].status).toBe('success');
      expect(results[0].outputs?.component).toBe('vpc');
      expect(results[0].outputs?.code_size).toBeGreaterThan(0);
      expect(results[0].artifacts).toBeDefined();
      expect(results[0].artifacts?.length).toBe(1);
      expect(results[0].artifacts?.[0].type).toBe('terraform');
      expect(results[0].artifacts?.[0].name).toBe('vpc.tf');
    });
  });

  describe('planDeployment', () => {
    test('should plan deployment', async () => {
      const plan = makePlan({
        id: 'test-plan-deploy-1',
        steps: [
          {
            id: 'step-1',
            type: 'deploy',
            description: 'Plan deployment',
            action: 'plan_deployment',
            status: 'pending',
            parameters: {
              workDir: '/tmp/nimbus/test',
            },
          },
        ],
      });

      const results = await executor.executePlan(plan);

      // Should succeed (with mock fallback if service unavailable)
      expect(results[0].status).toBe('success');
      expect(results[0].outputs?.changes).toBeDefined();
    });
  });

  describe('applyDeployment', () => {
    test('should apply deployment', async () => {
      const plan = makePlan({
        id: 'test-apply-deploy-1',
        steps: [
          {
            id: 'step-1',
            type: 'deploy',
            description: 'Apply deployment',
            action: 'apply_deployment',
            status: 'pending',
            parameters: {
              workDir: '/tmp/nimbus/test',
              autoApprove: true,
            },
          },
        ],
      });

      const results = await executor.executePlan(plan);

      expect(results[0].status).toBe('success');
      expect(results[0].outputs?.applied).toBe(true);
    });
  });

  describe('verifyDeployment', () => {
    test('should verify deployment', async () => {
      const plan = makePlan({
        id: 'test-verify-1',
        steps: [
          {
            id: 'step-1',
            type: 'verify',
            description: 'Verify deployment',
            action: 'verify_deployment',
            status: 'pending',
            parameters: {
              components: ['vpc', 'eks'],
              workDir: '/tmp/nimbus/test',
            },
          },
        ],
      });

      const results = await executor.executePlan(plan);

      expect(results[0].status).toBe('success');
      expect(results[0].outputs?.verification_passed).toBe(true);
      expect(results[0].outputs?.checks).toBeDefined();
    });
  });

  describe('generateDocumentation', () => {
    test('should generate documentation artifacts', async () => {
      const plan = makePlan({
        id: 'test-docs-1',
        steps: [
          {
            id: 'step-1',
            type: 'generate',
            description: 'Generate documentation',
            action: 'generate_documentation',
            status: 'pending',
            parameters: {
              components: ['vpc', 'eks'],
              include_diagrams: true,
            },
          },
        ],
      });

      const results = await executor.executePlan(plan);

      expect(results[0].status).toBe('success');
      expect(results[0].artifacts).toBeDefined();
      expect(results[0].artifacts?.length).toBe(2); // README + diagram
      expect(results[0].artifacts?.some(a => a.name === 'README.md')).toBe(true);
      expect(results[0].artifacts?.some(a => a.name === 'architecture.png')).toBe(true);
    });

    test('should generate only README without diagrams', async () => {
      const plan = makePlan({
        id: 'test-docs-2',
        steps: [
          {
            id: 'step-1',
            type: 'generate',
            description: 'Generate documentation',
            action: 'generate_documentation',
            status: 'pending',
            parameters: {
              components: ['vpc'],
              include_diagrams: false,
            },
          },
        ],
      });

      const results = await executor.executePlan(plan);

      expect(results[0].status).toBe('success');
      expect(results[0].artifacts?.length).toBe(1);
      expect(results[0].artifacts?.[0].name).toBe('README.md');
    });
  });

  describe('rollbackStep', () => {
    test('should rollback a step with rollback action', async () => {
      const step: PlanStep = {
        id: 'step-rollback-1',
        order: 1,
        type: 'deploy',
        description: 'Test step',
        action: 'apply_deployment',
        status: 'completed',
        rollback_action: 'terraform_destroy',
        parameters: {
          workDir: '/tmp/nimbus/test',
        },
      };

      const result = await executor.rollbackStep(step);

      expect(result.status).toBe('success');
      expect(result.outputs?.rolled_back).toBe(true);
    });

    test('should fail rollback without rollback action', async () => {
      const step: PlanStep = {
        id: 'step-rollback-2',
        order: 1,
        type: 'validate',
        description: 'Test step',
        action: 'validate_requirements',
        status: 'completed',
        parameters: {},
      };

      await expect(executor.rollbackStep(step)).rejects.toThrow('does not have a rollback action');
    });
  });

  describe('getLogs', () => {
    test('should return logs for an execution', async () => {
      const plan = makePlan({
        id: 'test-logs-1',
        steps: [
          {
            id: 'step-1',
            description: 'Validate',
            action: 'validate_requirements',
            status: 'pending',
            parameters: {
              provider: 'aws',
              components: ['vpc'],
              requirements: {},
            },
          },
        ],
      });

      const results = await executor.executePlan(plan);
      const executionId = results[0].id;
      const logs = executor.getLogs(executionId);

      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some(l => l.level === 'info')).toBe(true);
    });
  });

  describe('getArtifacts', () => {
    test('should return artifacts for an execution', async () => {
      const plan = makePlan({
        id: 'test-artifacts-1',
        steps: [
          {
            id: 'step-1',
            type: 'generate',
            description: 'Generate',
            action: 'generate_component',
            status: 'pending',
            parameters: {
              component: 'vpc',
              provider: 'aws',
              variables: {},
            },
          },
        ],
      });

      const results = await executor.executePlan(plan);
      const executionId = results[0].id;
      const artifacts = executor.getArtifacts(executionId);

      expect(artifacts.length).toBe(1);
      expect(artifacts[0].type).toBe('terraform');
    });
  });

  describe('parallel execution', () => {
    test('should execute independent steps in parallel', async () => {
      const plan = makePlan({
        id: 'test-parallel-1',
        steps: [
          {
            id: 'step-1',
            description: 'First independent step',
            action: 'validate_requirements',
            status: 'pending',
            parameters: {
              provider: 'aws',
              components: ['vpc'],
              requirements: {},
            },
          },
          {
            id: 'step-2',
            description: 'Second independent step',
            action: 'validate_requirements',
            status: 'pending',
            parameters: {
              provider: 'gcp',
              components: ['gke'],
              requirements: {},
            },
          },
        ],
      });

      const startTime = Date.now();
      const results = await executor.executePlan(plan);
      const endTime = Date.now();

      expect(results.length).toBe(2);
      expect(results.every(r => r.status === 'success')).toBe(true);
      // Both steps should complete (no order guarantee for parallel)
      expect(results.map(r => r.step_id).sort()).toEqual(['step-1', 'step-2']);
    });
  });
});
