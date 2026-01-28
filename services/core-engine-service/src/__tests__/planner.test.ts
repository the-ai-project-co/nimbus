import { describe, it, expect, beforeEach } from 'bun:test';
import { Planner } from '../components/planner';
import type { AgentTask } from '../types/agent';

describe('Planner', () => {
  let planner: Planner;

  beforeEach(() => {
    planner = new Planner();
  });

  const createMockTask = (overrides?: Partial<AgentTask>): AgentTask => ({
    id: 'task-123',
    type: 'generate',
    status: 'pending',
    priority: 'medium',
    user_id: 'user-123',
    created_at: new Date(),
    updated_at: new Date(),
    context: {
      provider: 'aws',
      environment: 'development',
      components: ['vpc'],
      requirements: {},
    },
    execution: {},
    ...overrides,
  });

  describe('generatePlan', () => {
    it('should generate plan for simple task', async () => {
      const task = createMockTask();

      const plan = await planner.generatePlan(task);

      expect(plan.id).toBeDefined();
      expect(plan.task_id).toBe(task.id);
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.status).toBe('draft');
    });

    it('should include validation steps', async () => {
      const task = createMockTask();

      const plan = await planner.generatePlan(task);

      const hasValidation = plan.steps.some((s) => s.type === 'validate');
      expect(hasValidation).toBe(true);
    });

    it('should include generation steps for each component', async () => {
      const task = createMockTask({
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['vpc', 's3', 'rds'],
        },
      });

      const plan = await planner.generatePlan(task);

      const generationSteps = plan.steps.filter((s) => s.type === 'generate' && s.component);
      expect(generationSteps.length).toBeGreaterThanOrEqual(3);
    });

    it('should include deployment steps for deploy tasks', async () => {
      const task = createMockTask({
        type: 'deploy',
      });

      const plan = await planner.generatePlan(task);

      const hasDeployment = plan.steps.some((s) => s.type === 'deploy');
      expect(hasDeployment).toBe(true);
    });

    it('should assess risks', async () => {
      const task = createMockTask({
        context: {
          provider: 'aws',
          environment: 'production',
          components: ['eks', 'rds'],
        },
      });

      const plan = await planner.generatePlan(task);

      expect(plan.risks.length).toBeGreaterThan(0);
      expect(plan.risk_level).toBeDefined();
    });

    it('should require approval for high-risk plans', async () => {
      const task = createMockTask({
        context: {
          provider: 'aws',
          environment: 'production',
          components: ['eks', 'rds'],
        },
      });

      const plan = await planner.generatePlan(task);

      expect(plan.requires_approval).toBe(true);
    });

    it('should estimate duration', async () => {
      const task = createMockTask();

      const plan = await planner.generatePlan(task);

      expect(plan.estimated_duration).toBeGreaterThan(0);
    });

    it('should estimate cost', async () => {
      const task = createMockTask({
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['eks', 'rds'],
        },
      });

      const plan = await planner.generatePlan(task);

      expect(plan.estimated_cost).toBeGreaterThan(0);
    });
  });

  describe('validatePlan', () => {
    it('should validate correct plan', async () => {
      const task = createMockTask();
      const plan = await planner.generatePlan(task);

      const validation = planner.validatePlan(plan);

      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    it('should detect circular dependencies', async () => {
      const task = createMockTask();
      const plan = await planner.generatePlan(task);

      // Create circular dependency
      plan.steps[0].depends_on = [plan.steps[plan.steps.length - 1].id];
      plan.steps[plan.steps.length - 1].depends_on = [plan.steps[0].id];

      const validation = planner.validatePlan(plan);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('circular'))).toBe(true);
    });

    it('should detect invalid step order', async () => {
      const task = createMockTask();
      const plan = await planner.generatePlan(task);

      // Make a step depend on a later step with wrong order
      if (plan.steps.length >= 2) {
        plan.steps[0].depends_on = [plan.steps[1].id];
        plan.steps[0].order = 2;
        plan.steps[1].order = 1;

        const validation = planner.validatePlan(plan);

        expect(validation.valid).toBe(false);
      }
    });
  });

  describe('optimizePlan', () => {
    it('should identify parallel execution opportunities', async () => {
      const task = createMockTask({
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['s3', 'vpc'],
        },
      });

      const plan = await planner.generatePlan(task);
      const optimized = planner.optimizePlan(plan);

      expect(optimized.steps).toBeDefined();
    });
  });

  describe('risk assessment', () => {
    it('should identify production risks', async () => {
      const task = createMockTask({
        context: {
          provider: 'aws',
          environment: 'production',
          components: ['eks'],
        },
      });

      const plan = await planner.generatePlan(task);

      const prodRisk = plan.risks.find((r) => r.id === 'risk_prod_deploy');
      expect(prodRisk).toBeDefined();
      expect(prodRisk?.severity).toBe('high');
    });

    it('should identify cost risks', async () => {
      const task = createMockTask({
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['eks', 'rds'],
        },
      });

      const plan = await planner.generatePlan(task);

      const costRisk = plan.risks.find((r) => r.category === 'cost');
      expect(costRisk).toBeDefined();
    });

    it('should identify security risks', async () => {
      const task = createMockTask({
        context: {
          provider: 'aws',
          environment: 'production',
          components: ['s3'],
        },
      });

      const plan = await planner.generatePlan(task);

      const securityRisk = plan.risks.find((r) => r.category === 'security');
      expect(securityRisk).toBeDefined();
    });

    it('should calculate overall risk level', async () => {
      const task = createMockTask({
        context: {
          provider: 'aws',
          environment: 'production',
          components: ['eks', 'rds', 's3'],
        },
      });

      const plan = await planner.generatePlan(task);

      expect(['low', 'medium', 'high', 'critical']).toContain(plan.risk_level);
    });
  });

  describe('dependencies', () => {
    it('should create proper dependencies', async () => {
      const task = createMockTask({
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['vpc', 'eks'],
        },
      });

      const plan = await planner.generatePlan(task);

      expect(plan.dependencies.length).toBeGreaterThan(0);
      expect(plan.dependencies.every((d) => d.step_id && d.depends_on)).toBe(true);
    });

    it('should ensure generation depends on validation', async () => {
      const task = createMockTask();
      const plan = await planner.generatePlan(task);

      const validationStep = plan.steps.find((s) => s.action === 'validate_requirements');
      const generationSteps = plan.steps.filter((s) => s.type === 'generate' && s.component);

      if (validationStep && generationSteps.length > 0) {
        const allDependOnValidation = generationSteps.every(
          (s) => s.depends_on?.includes(validationStep.id)
        );
        expect(allDependOnValidation).toBe(true);
      }
    });
  });
});
