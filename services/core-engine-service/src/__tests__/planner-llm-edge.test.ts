import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Planner } from '../components/planner';
import type { AgentTask } from '../types/agent';

/**
 * Edge case tests for Planner LLM integration.
 *
 * These tests cover scenarios that the base planner-llm.test.ts may not:
 * - LLM returns empty array
 * - LLM returns wrong structure (object instead of array)
 * - LLM returns steps with missing required fields
 * - HTTP 500 response
 * - Fetch timeout
 * - Risk assessment edge cases
 * - Plan validation edge cases
 */
describe('Planner - LLM Edge Cases', () => {
  let planner: Planner;
  const originalFetch = globalThis.fetch;

  const createMockTask = (overrides?: Partial<AgentTask>): AgentTask => ({
    id: 'task-edge',
    type: 'generate',
    status: 'pending',
    priority: 'medium',
    user_id: 'user-1',
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

  beforeEach(() => {
    planner = new Planner();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should fall back when LLM returns empty array', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: '[]' } }],
      })))
    ) as any;

    const plan = await planner.generatePlan(createMockTask());
    expect(plan.steps.length).toBeGreaterThan(0);
    // Heuristic fallback should include validation step
    expect(plan.steps[0].description).toContain('Validate');
  });

  it('should fall back when LLM returns object instead of array', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: '{"step": "one"}' } }],
      })))
    ) as any;

    const plan = await planner.generatePlan(createMockTask());
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('should fall back when LLM returns steps with missing required fields', async () => {
    const invalidSteps = [
      { id: 'step_1', name: 'Missing description and type' },
    ];

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(invalidSteps) } }],
      })))
    ) as any;

    const plan = await planner.generatePlan(createMockTask());
    // Should fall back to heuristic steps because description is missing
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps[0].action).toBeDefined();
  });

  it('should fall back when LLM returns steps with invalid type', async () => {
    const invalidSteps = [
      { id: 'step_1', description: 'A step', type: 'invalid_type', order: 1 },
    ];

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(invalidSteps) } }],
      })))
    ) as any;

    const plan = await planner.generatePlan(createMockTask());
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('should fall back on HTTP 500', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Internal Server Error', { status: 500 }))
    ) as any;

    const plan = await planner.generatePlan(createMockTask());
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('should fall back on HTTP 429 Too Many Requests', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Rate limited', { status: 429 }))
    ) as any;

    const plan = await planner.generatePlan(createMockTask());
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('should fall back when LLM response has no choices', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({})))
    ) as any;

    const plan = await planner.generatePlan(createMockTask());
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('should fall back when LLM response content is null', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: null } }],
      })))
    ) as any;

    const plan = await planner.generatePlan(createMockTask());
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('should still validate plan from LLM steps', async () => {
    const llmSteps = [
      { id: 'step_1', name: 'Step 1', description: 'First step', type: 'validate', order: 1, estimatedDuration: 30 },
      { id: 'step_2', name: 'Step 2', description: 'Second step', type: 'generate', order: 2, estimatedDuration: 60 },
    ];

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(llmSteps) } }],
      })))
    ) as any;

    const plan = await planner.generatePlan(createMockTask());
    const validation = planner.validatePlan(plan);
    expect(validation.valid).toBe(true);
  });

  it('should include risk assessment even when step LLM fails', async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error('Connection refused'))
    ) as any;

    const task = createMockTask({
      context: {
        provider: 'aws',
        environment: 'production',
        components: ['eks', 'rds', 's3'],
      },
    });

    const plan = await planner.generatePlan(task);
    // Should have heuristic risks for production + expensive components + s3
    expect(plan.risks.length).toBeGreaterThan(0);
    expect(plan.risk_level).not.toBe('low');
  });

  it('should fall back risk assessment when LLM returns invalid risk structure', async () => {
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        // First call (steps) - fail to trigger heuristic
        return Promise.reject(new Error('no LLM'));
      }
      // Second call (risks) - return invalid structure
      return Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify([
          { id: 'r1', severity: 'invalid_severity', description: 'test' },
        ]) } }],
      })));
    }) as any;

    const plan = await planner.generatePlan(createMockTask({
      context: {
        provider: 'aws',
        environment: 'production',
        components: ['eks'],
      },
    }));

    // Should still have risks from either LLM or heuristic fallback
    expect(plan.risks.length).toBeGreaterThan(0);
  });

  it('should handle deploy task type with additional steps', async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error('no LLM'))
    ) as any;

    const task = createMockTask({
      type: 'deploy',
      context: {
        provider: 'aws',
        environment: 'staging',
        components: ['vpc'],
        requirements: {},
      },
    });

    const plan = await planner.generatePlan(task);
    // Deploy tasks should include plan/apply/verify steps
    const deploySteps = plan.steps.filter(s => s.type === 'deploy');
    expect(deploySteps.length).toBeGreaterThanOrEqual(2);
    expect(plan.steps.some(s => s.action === 'plan_deployment')).toBe(true);
    expect(plan.steps.some(s => s.action === 'apply_deployment')).toBe(true);
    expect(plan.steps.some(s => s.action === 'verify_deployment')).toBe(true);
  });

  it('should generate unique plan IDs across multiple calls', async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error('no LLM'))
    ) as any;

    const task = createMockTask();
    const plan1 = await planner.generatePlan(task);
    const plan2 = await planner.generatePlan(task);
    expect(plan1.id).not.toBe(plan2.id);
  });

  it('should estimate cost based on components', async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error('no LLM'))
    ) as any;

    const task = createMockTask({
      context: {
        provider: 'aws',
        environment: 'development',
        components: ['vpc', 'eks', 'rds', 's3'],
      },
    });

    const plan = await planner.generatePlan(task);
    // VPC($0 + $32 NAT) + EKS($73) + RDS($50) + S3($5) = $160
    expect(plan.estimated_cost).toBe(160);
  });

  it('should optimize plan by identifying parallel generation steps', async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error('no LLM'))
    ) as any;

    const task = createMockTask({
      context: {
        provider: 'aws',
        environment: 'development',
        components: ['vpc', 'eks', 's3'],
      },
    });

    const plan = await planner.generatePlan(task);
    const optimized = planner.optimizePlan(plan);

    // S3 generation step should be marked parallel (no VPC dependency)
    const s3Step = optimized.steps.find(s => s.component === 's3');
    expect(s3Step?.parameters.parallel_group).toBe('generation');
  });

  it('should detect circular dependencies in validation', () => {
    const plan = {
      id: 'plan-circular',
      task_id: 'task-1',
      status: 'draft' as const,
      created_at: new Date(),
      updated_at: new Date(),
      steps: [
        { id: 's1', order: 1, type: 'validate' as const, description: 'Step 1', action: 'a', parameters: {}, status: 'pending' as const, depends_on: ['s2'] },
        { id: 's2', order: 2, type: 'validate' as const, description: 'Step 2', action: 'b', parameters: {}, status: 'pending' as const, depends_on: ['s1'] },
      ],
      dependencies: [],
      risks: [],
      risk_level: 'low' as const,
      requires_approval: false,
    };

    const validation = planner.validatePlan(plan);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('circular'))).toBe(true);
  });

  it('should flag non-existent dependency IDs in validation', () => {
    const plan = {
      id: 'plan-bad-dep',
      task_id: 'task-1',
      status: 'draft' as const,
      created_at: new Date(),
      updated_at: new Date(),
      steps: [
        { id: 's1', order: 1, type: 'validate' as const, description: 'Step 1', action: 'a', parameters: {}, status: 'pending' as const },
        { id: 's2', order: 2, type: 'generate' as const, description: 'Step 2', action: 'b', parameters: {}, status: 'pending' as const, depends_on: ['nonexistent'] },
      ],
      dependencies: [],
      risks: [],
      risk_level: 'low' as const,
      requires_approval: false,
    };

    const validation = planner.validatePlan(plan);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('non-existent'))).toBe(true);
  });

  it('should require approval for high risk plans', async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error('no LLM'))
    ) as any;

    const task = createMockTask({
      context: {
        provider: 'aws',
        environment: 'production',
        components: ['eks', 'rds', 's3'],
      },
    });

    const plan = await planner.generatePlan(task);
    // Production + expensive components + s3 => high risk
    expect(plan.requires_approval).toBe(true);
  });
});
