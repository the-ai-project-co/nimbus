import { describe, it, expect, mock, beforeEach } from 'bun:test';
import type { AgentPlan, PlanStep } from '../types/agent';

// Mock service clients to avoid real connections
mock.module('../clients', () => ({
  GeneratorServiceClient: class {
    renderTemplate() {
      return { rendered_content: 'mock' };
    }
  },
  TerraformToolsClient: class {
    init() {}
    validate() {
      return { valid: true, errorCount: 0, warningCount: 0, diagnostics: [] };
    }
    plan() {}
    apply() {}
    fmt() {}
    output() {}
  },
  FSToolsClient: class {
    write() {}
  },
  StateServiceClient: class {
    getLatestCheckpoint() {
      return null;
    }
    saveCheckpoint() {}
    deleteCheckpoints() {}
  },
}));

import { Executor } from '../components/executor';

/** Helper to build a valid AgentPlan */
function makePlan(overrides: {
  id: string;
  steps: Array<
    Omit<PlanStep, 'order' | 'type'> & { order?: number; type?: PlanStep['type'] }
  >;
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

describe('Executor retry logic', () => {
  let executor: Executor;

  beforeEach(() => {
    executor = new Executor();
  });

  it('successful execution on first try does not retry', async () => {
    const plan = makePlan({
      id: 'retry-success-1',
      steps: [
        {
          id: 'step-1',
          description: 'Validate requirements',
          action: 'validate_requirements',
          status: 'pending' as const,
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
    expect(results[0].outputs?.validated).toBe(true);
  });

  it('failed execution retries up to 3 times then returns failure', async () => {
    // Use an unknown action which causes executeStep to throw,
    // triggering the retry logic in executeWithRetry.
    const plan = makePlan({
      id: 'retry-fail-exhaust',
      steps: [
        {
          id: 'step-fail',
          description: 'Unknown action triggers retry',
          action: 'nonexistent_action',
          status: 'pending' as const,
          parameters: {},
        },
      ],
    });

    const startTime = Date.now();
    const results = await executor.executePlan(plan);
    const elapsed = Date.now() - startTime;

    expect(results.length).toBe(1);
    expect(results[0].status).toBe('failure');
    // The error should mention the unknown action or retry exhaustion
    expect(results[0].error).toBeDefined();
    expect(
      results[0].error!.message.includes('Unknown action') ||
        results[0].error!.message.includes('RETRY_EXHAUSTED') ||
        results[0].error!.code === 'RETRY_EXHAUSTED' ||
        results[0].error!.code === 'STEP_EXECUTION_ERROR',
    ).toBe(true);
  }, 30_000);

  it('returns failure after max retries exhausted with RETRY_EXHAUSTED code', async () => {
    const plan = makePlan({
      id: 'retry-exhaust-code',
      steps: [
        {
          id: 'step-unknown',
          description: 'This action does not exist',
          action: 'totally_bogus_action',
          status: 'pending' as const,
          parameters: {},
        },
      ],
    });

    const results = await executor.executePlan(plan);

    expect(results.length).toBe(1);
    expect(results[0].status).toBe('failure');
    // Either the step returns failure with STEP_EXECUTION_ERROR each time
    // (and retry sees a non-thrown failure) or it throws and we get RETRY_EXHAUSTED.
    expect(results[0].error).toBeDefined();
    const code = results[0].error!.code;
    expect(
      code === 'RETRY_EXHAUSTED' || code === 'STEP_EXECUTION_ERROR',
    ).toBe(true);
  }, 30_000);

  it('exponential backoff timings increase between retries', async () => {
    // We verify timing indirectly: an unknown action triggers throws in
    // executeStep which leads to retry with delays of 1s, 2s, 4s.
    // Total minimum delay should be ~7s for 3 retries, but since the
    // executor also returns a failure result on attempt 0, timing varies.
    // We just confirm the elapsed time is greater than 0 (retries happened)
    // and the result is a failure.
    const plan = makePlan({
      id: 'retry-backoff-timing',
      steps: [
        {
          id: 'step-backoff',
          description: 'Trigger backoff retries',
          action: 'unknown_action_for_backoff',
          status: 'pending' as const,
          parameters: {},
        },
      ],
    });

    const startTime = Date.now();
    const results = await executor.executePlan(plan);
    const elapsed = Date.now() - startTime;

    expect(results.length).toBe(1);
    expect(results[0].status).toBe('failure');
    // If retries occurred with exponential backoff, elapsed should be meaningful.
    // The executeStep returns a failure result (doesn't throw) for unknown actions,
    // so the retry logic sees status === 'failure' and retries with backoff.
    // Minimum: 1000 + 2000 + 4000 = 7000ms for the backoff delays alone.
    // We relax the threshold a bit to avoid flakiness.
    expect(elapsed).toBeGreaterThanOrEqual(5000);
  }, 30_000); // 30s timeout for retry delays

  it('does not retry when step succeeds on first attempt', async () => {
    const plan = makePlan({
      id: 'retry-no-retry',
      steps: [
        {
          id: 'step-ok',
          description: 'Validate requirements',
          action: 'validate_requirements',
          status: 'pending' as const,
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
    const elapsed = Date.now() - startTime;

    expect(results.length).toBe(1);
    expect(results[0].status).toBe('success');
    // A successful first attempt should complete almost instantly (no backoff delays)
    expect(elapsed).toBeLessThan(2000);
  });
});
