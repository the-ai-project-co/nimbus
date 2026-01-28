import { describe, it, expect, beforeEach } from 'bun:test';
import { SafetyManager } from '../components/safety-manager';
import type { AgentTask, AgentPlan } from '../types/agent';

describe('SafetyManager', () => {
  let safetyManager: SafetyManager;

  beforeEach(() => {
    safetyManager = new SafetyManager();
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

  const createMockPlan = (overrides?: Partial<AgentPlan>): AgentPlan => ({
    id: 'plan-123',
    task_id: 'task-123',
    status: 'draft',
    created_at: new Date(),
    updated_at: new Date(),
    steps: [
      {
        id: 'step_1',
        type: 'validate',
        order: 1,
        action: 'apply_best_practices',
        description: 'Apply security and best practices',
        parameters: {},
        status: 'pending',
      },
    ],
    dependencies: [],
    risks: [],
    risk_level: 'low',
    requires_approval: false,
    estimated_duration: 300,
    estimated_cost: 100,
    ...overrides,
  });

  describe('runPreExecutionChecks', () => {
    it('should pass for development environment', async () => {
      const task = createMockTask();
      const plan = createMockPlan();

      const result = await safetyManager.runPreExecutionChecks(task, plan);

      expect(result.passed).toBe(true);
      expect(result.blockers.length).toBe(0);
    });

    it('should require approval for production', async () => {
      const task = createMockTask({
        context: {
          provider: 'aws',
          environment: 'production',
          components: ['eks'],
        },
      });
      const plan = createMockPlan({
        requires_approval: true,
      });

      const result = await safetyManager.runPreExecutionChecks(task, plan);

      expect(result.results.some((r) => r.requires_approval)).toBe(true);
    });

    it('should enforce cost limits', async () => {
      const task = createMockTask();
      const plan = createMockPlan({
        estimated_cost: 10000, // Exceeds limit
      });

      const result = await safetyManager.runPreExecutionChecks(task, plan);

      const costCheck = result.results.find((r) => !r.passed && r.severity === 'high');
      expect(costCheck).toBeDefined();
    });

    it('should verify security practices', async () => {
      const task = createMockTask();
      const plan = createMockPlan({
        steps: [], // No security validation step
      });

      const result = await safetyManager.runPreExecutionChecks(task, plan);

      const securityCheck = result.results.find(
        (r) => !r.passed && r.message.includes('security')
      );
      expect(securityCheck).toBeDefined();
    });

    it('should check backup strategy for stateful components', async () => {
      const task = createMockTask({
        context: {
          provider: 'aws',
          environment: 'production',
          components: ['rds'],
          requirements: {
            backup_enabled: false,
          },
        },
      });
      const plan = createMockPlan();

      const result = await safetyManager.runPreExecutionChecks(task, plan);

      const backupCheck = result.results.find((r) => r.message.includes('backup'));
      expect(backupCheck).toBeDefined();
    });
  });

  describe('runDuringExecutionChecks', () => {
    it('should monitor resource creation rate', async () => {
      const context = {
        resources_created: 10,
      };

      const result = await safetyManager.runDuringExecutionChecks(context);

      expect(result.passed).toBe(true);
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('should detect unusual resource creation', async () => {
      const context = {
        resources_created: 100, // Exceeds threshold
      };

      const result = await safetyManager.runDuringExecutionChecks(context);

      const rateCheck = result.results.find((r) => !r.passed);
      expect(rateCheck).toBeDefined();
    });

    it('should check execution timeout', async () => {
      const context = {
        start_time: new Date(Date.now() - 7200000), // 2 hours ago
      };

      const result = await safetyManager.runDuringExecutionChecks(context);

      const timeoutCheck = result.results.find((r) => !r.passed);
      expect(timeoutCheck).toBeDefined();
    });
  });

  describe('runPostExecutionChecks', () => {
    it('should verify deployment success', async () => {
      const context = {
        deployment_success: true,
        security_score: 95,
      };

      const result = await safetyManager.runPostExecutionChecks(context);

      expect(result.passed).toBe(true);
    });

    it('should detect deployment failures', async () => {
      const context = {
        deployment_success: false,
      };

      const result = await safetyManager.runPostExecutionChecks(context);

      const deploymentCheck = result.results.find((r) => !r.passed);
      expect(deploymentCheck).toBeDefined();
    });

    it('should detect cost anomalies', async () => {
      const context = {
        estimated_cost: 100,
        actual_cost: 200, // 100% variance
      };

      const result = await safetyManager.runPostExecutionChecks(context);

      const costCheck = result.results.find((r) => !r.passed && r.message.includes('cost'));
      expect(costCheck).toBeDefined();
    });

    it('should assess security posture', async () => {
      const context = {
        security_score: 50, // Below threshold
      };

      const result = await safetyManager.runPostExecutionChecks(context);

      const securityCheck = result.results.find(
        (r) => !r.passed && r.severity === 'critical'
      );
      expect(securityCheck).toBeDefined();
    });
  });

  describe('custom checks', () => {
    it('should allow registering custom checks', async () => {
      const customCheck = {
        id: 'custom-001',
        type: 'pre_execution' as const,
        category: 'security' as const,
        name: 'Custom Check',
        description: 'A custom safety check',
        severity: 'high' as const,
        check: async (context: Record<string, unknown>) => ({
          passed: false,
          severity: 'high' as const,
          message: 'Custom check failed',
          can_proceed: false,
          requires_approval: true,
        }),
      };

      safetyManager.registerCheck(customCheck);

      const task = createMockTask();
      const plan = createMockPlan();

      const result = await safetyManager.runPreExecutionChecks(task, plan);

      const customResult = result.results.find((r) => r.message === 'Custom check failed');
      expect(customResult).toBeDefined();
    });

    it('should allow removing checks', () => {
      safetyManager.removeCheck('pre_prod_safeguard');

      const checks = safetyManager.getAllChecks();
      const removedCheck = checks.find((c) => c.id === 'pre_prod_safeguard');

      expect(removedCheck).toBeUndefined();
    });
  });

  describe('getAllChecks', () => {
    it('should return all registered checks', () => {
      const checks = safetyManager.getAllChecks();

      expect(checks.length).toBeGreaterThan(0);
      expect(checks.every((c) => c.id && c.name && c.check)).toBe(true);
    });

    it('should include pre, during, and post execution checks', () => {
      const checks = safetyManager.getAllChecks();

      const hasPreChecks = checks.some((c) => c.type === 'pre_execution');
      const hasDuringChecks = checks.some((c) => c.type === 'during_execution');
      const hasPostChecks = checks.some((c) => c.type === 'post_execution');

      expect(hasPreChecks).toBe(true);
      expect(hasDuringChecks).toBe(true);
      expect(hasPostChecks).toBe(true);
    });
  });

  describe('severity levels', () => {
    it('should categorize checks by severity', () => {
      const checks = safetyManager.getAllChecks();

      const hasCritical = checks.some((c) => c.severity === 'critical');
      const hasHigh = checks.some((c) => c.severity === 'high');
      const hasMedium = checks.some((c) => c.severity === 'medium');

      expect(hasCritical).toBe(true);
      expect(hasHigh).toBe(true);
      expect(hasMedium).toBe(true);
    });
  });

  describe('check categories', () => {
    it('should include all safety categories', () => {
      const checks = safetyManager.getAllChecks();

      const categories = new Set(checks.map((c) => c.category));

      expect(categories.has('security')).toBe(true);
      expect(categories.has('cost')).toBe(true);
      expect(categories.has('availability')).toBe(true);
    });
  });
});
