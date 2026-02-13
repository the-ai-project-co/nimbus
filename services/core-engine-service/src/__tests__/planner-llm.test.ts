import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Planner } from '../components/planner';
import type { AgentTask } from '../types/agent';

// Test pattern: mock global fetch
describe('Planner LLM Integration', () => {
  let planner: Planner;
  const originalFetch = globalThis.fetch;

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
      components: ['vpc', 'eks'],
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

  it('should use LLM-generated steps when LLM service is available', async () => {
    const llmSteps = [
      { id: 'step_1', name: 'Validate', description: 'Validate requirements', type: 'validate', order: 1, estimatedDuration: 30 },
      { id: 'step_2', name: 'Generate VPC', description: 'Generate VPC config', type: 'generate', order: 2, estimatedDuration: 60 },
    ];

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(llmSteps) } }],
      })))
    ) as any;

    const task = createMockTask();
    const plan = await planner.generatePlan(task);

    expect(plan.steps.length).toBe(2);
    expect(plan.steps[0].description).toBe('Validate requirements');
  });

  it('should fall back to heuristic steps when LLM service is unavailable', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('Connection refused'))) as any;

    const task = createMockTask();
    const plan = await planner.generatePlan(task);

    // Should still produce a valid plan from heuristics
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.id).toBeDefined();
  });

  it('should fall back when LLM returns invalid JSON', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: 'not valid json' } }],
      })))
    ) as any;

    const task = createMockTask();
    const plan = await planner.generatePlan(task);

    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('should use LLM-assessed risks when available', async () => {
    const llmRisks = [
      { id: 'risk_1', severity: 'high', category: 'security', description: 'Public subnet exposure', mitigation: 'Use private subnets', probability: 0.6, impact: 0.8 },
    ];

    // First call for steps, second for risks
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('skip LLM for steps'));
      }
      return Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(llmRisks) } }],
      })));
    }) as any;

    const task = createMockTask();
    const plan = await planner.generatePlan(task);

    expect(plan.risks.length).toBe(1);
    expect(plan.risks[0].description).toBe('Public subnet exposure');
  });

  it('should fall back to heuristic risks when LLM fails', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('Network error'))) as any;

    const task = createMockTask({
      context: {
        provider: 'aws',
        environment: 'production',
        components: ['eks', 'rds', 's3'],
      },
    });
    const plan = await planner.generatePlan(task);

    // Heuristic risks for production + eks/rds + s3
    expect(plan.risks.length).toBeGreaterThan(0);
  });
});
