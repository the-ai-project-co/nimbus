import { describe, test, expect, beforeEach, mock, spyOn } from 'bun:test';
import { Executor } from '../components/executor';
import type { AgentPlan, PlanStep } from '../types/agent';

/**
 * Creates a minimal AgentPlan suitable for checkpoint tests.
 * Steps use "validate_requirements" with valid params so the
 * Executor can execute them without needing external services.
 */
function createTestPlan(overrides?: Partial<AgentPlan>): AgentPlan {
  return {
    id: 'plan-ckpt-1',
    goal: 'Test checkpoint behavior',
    steps: [
      {
        id: 'step-1',
        order: 0,
        description: 'First validation',
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
        order: 1,
        description: 'Second validation',
        action: 'validate_requirements',
        status: 'pending',
        depends_on: ['step-1'],
        parameters: {
          provider: 'aws',
          components: ['eks'],
          requirements: {},
        },
      },
      {
        id: 'step-3',
        order: 2,
        description: 'Third validation',
        action: 'validate_requirements',
        status: 'pending',
        depends_on: ['step-2'],
        parameters: {
          provider: 'aws',
          components: ['rds'],
          requirements: {},
        },
      },
    ],
    status: 'pending',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as AgentPlan;
}

describe('Executor Checkpoint', () => {
  let executor: Executor;

  beforeEach(() => {
    executor = new Executor();
  });

  describe('saveCheckpoint after each successful step', () => {
    test('should call saveCheckpoint once per successful step', async () => {
      const plan = createTestPlan();

      const stateClient = (executor as any).stateClient;

      // getLatestCheckpoint returns null so execution starts from scratch
      spyOn(stateClient, 'getLatestCheckpoint').mockResolvedValue(null);

      // saveCheckpoint succeeds
      const saveSpy = spyOn(stateClient, 'saveCheckpoint').mockResolvedValue({
        success: true,
        id: 'ckpt-mock',
      });

      // deleteCheckpoints succeeds on cleanup
      spyOn(stateClient, 'deleteCheckpoints').mockResolvedValue(true);

      const results = await executor.executePlan(plan);

      // All three steps should succeed
      expect(results.length).toBe(3);
      expect(results.every((r) => r.status === 'success')).toBe(true);

      // saveCheckpoint should have been called once per step
      expect(saveSpy).toHaveBeenCalledTimes(3);

      // Verify the checkpoint ID pattern and plan ID are correct
      const firstCallArgs = saveSpy.mock.calls[0];
      expect(firstCallArgs[0]).toMatch(/^ckpt_plan-ckpt-1_/);
      expect(firstCallArgs[1]).toBe('plan-ckpt-1');
      expect(typeof firstCallArgs[2]).toBe('number');

      // Verify the state payload includes completedStepIds and results
      const firstState = firstCallArgs[3] as Record<string, unknown>;
      expect(firstState.completedStepIds).toBeDefined();
      expect(Array.isArray(firstState.completedStepIds)).toBe(true);
      expect(firstState.results).toBeDefined();
      expect(Array.isArray(firstState.results)).toBe(true);
    });

    test('should include increasing completedStepIds in each checkpoint', async () => {
      const plan = createTestPlan();

      const stateClient = (executor as any).stateClient;
      spyOn(stateClient, 'getLatestCheckpoint').mockResolvedValue(null);
      const saveSpy = spyOn(stateClient, 'saveCheckpoint').mockResolvedValue({
        success: true,
        id: 'ckpt-mock',
      });
      spyOn(stateClient, 'deleteCheckpoints').mockResolvedValue(true);

      await executor.executePlan(plan);

      // After the first step, completedStepIds should contain step-1
      const firstState = saveSpy.mock.calls[0][3] as Record<string, unknown>;
      expect((firstState.completedStepIds as string[]).length).toBeGreaterThanOrEqual(1);

      // After the last step, completedStepIds should contain all three
      const lastState = saveSpy.mock.calls[2][3] as Record<string, unknown>;
      const completedIds = lastState.completedStepIds as string[];
      expect(completedIds).toContain('step-1');
      expect(completedIds).toContain('step-2');
      expect(completedIds).toContain('step-3');
    });
  });

  describe('resume skips completed steps when checkpoint exists', () => {
    test('should skip steps that were already completed in checkpoint', async () => {
      const plan = createTestPlan();

      const stateClient = (executor as any).stateClient;

      // Simulate a checkpoint from a previous run where step-1 and step-2 completed
      spyOn(stateClient, 'getLatestCheckpoint').mockResolvedValue({
        id: 'ckpt_plan-ckpt-1_1',
        operationId: 'plan-ckpt-1',
        step: 1,
        state: {
          completedStepIds: ['step-1', 'step-2'],
          results: [
            {
              id: 'exec-prev-1',
              plan_id: 'plan-ckpt-1',
              step_id: 'step-1',
              status: 'success',
              started_at: new Date(),
              completed_at: new Date(),
              duration: 10,
              outputs: { validated: true },
            },
            {
              id: 'exec-prev-2',
              plan_id: 'plan-ckpt-1',
              step_id: 'step-2',
              status: 'success',
              started_at: new Date(),
              completed_at: new Date(),
              duration: 12,
              outputs: { validated: true },
            },
          ],
          lastCompletedStep: 1,
        },
        createdAt: new Date().toISOString(),
      });

      const saveSpy = spyOn(stateClient, 'saveCheckpoint').mockResolvedValue({
        success: true,
        id: 'ckpt-mock',
      });
      spyOn(stateClient, 'deleteCheckpoints').mockResolvedValue(true);

      const results = await executor.executePlan(plan);

      // Results should include the 2 restored results + 1 newly executed
      expect(results.length).toBe(3);

      // The first two results come from the checkpoint (restored)
      expect(results[0].step_id).toBe('step-1');
      expect(results[1].step_id).toBe('step-2');

      // The third result is the newly executed step
      expect(results[2].step_id).toBe('step-3');
      expect(results[2].status).toBe('success');

      // saveCheckpoint should have been called only for the newly executed step
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanup deletes checkpoints after successful plan completion', () => {
    test('should call deleteCheckpoints with the plan ID on success', async () => {
      const plan = createTestPlan();

      const stateClient = (executor as any).stateClient;
      spyOn(stateClient, 'getLatestCheckpoint').mockResolvedValue(null);
      spyOn(stateClient, 'saveCheckpoint').mockResolvedValue({
        success: true,
        id: 'ckpt-mock',
      });

      const deleteSpy = spyOn(stateClient, 'deleteCheckpoints').mockResolvedValue(true);

      await executor.executePlan(plan);

      expect(deleteSpy).toHaveBeenCalledTimes(1);
      expect(deleteSpy).toHaveBeenCalledWith('plan-ckpt-1');
    });

    test('should still return results when deleteCheckpoints fails', async () => {
      const plan = createTestPlan();

      const stateClient = (executor as any).stateClient;
      spyOn(stateClient, 'getLatestCheckpoint').mockResolvedValue(null);
      spyOn(stateClient, 'saveCheckpoint').mockResolvedValue({
        success: true,
        id: 'ckpt-mock',
      });

      // Cleanup fails but execution should still complete
      spyOn(stateClient, 'deleteCheckpoints').mockRejectedValue(
        new Error('State service down')
      );

      const results = await executor.executePlan(plan);

      expect(results.length).toBe(3);
      expect(results.every((r) => r.status === 'success')).toBe(true);
    });
  });

  describe('resumePlan', () => {
    test('should throw when no checkpoint found', async () => {
      const stateClient = (executor as any).stateClient;
      spyOn(stateClient, 'getLatestCheckpoint').mockResolvedValue(null);

      await expect(executor.resumePlan('nonexistent-plan')).rejects.toThrow(
        'No checkpoint found for plan nonexistent-plan'
      );
    });

    test('should return stored results when checkpoint exists', async () => {
      const stateClient = (executor as any).stateClient;

      const storedResults = [
        {
          id: 'exec-1',
          plan_id: 'plan-resume-1',
          step_id: 'step-1',
          status: 'success',
          started_at: new Date(),
          completed_at: new Date(),
          duration: 10,
        },
      ];

      spyOn(stateClient, 'getLatestCheckpoint').mockResolvedValue({
        id: 'ckpt_plan-resume-1_0',
        operationId: 'plan-resume-1',
        step: 0,
        state: {
          completedStepIds: ['step-1'],
          results: storedResults,
          lastCompletedStep: 0,
        },
        createdAt: new Date().toISOString(),
      });

      const results = await executor.resumePlan('plan-resume-1');

      expect(results.length).toBe(1);
      expect(results[0].step_id).toBe('step-1');
      expect(results[0].status).toBe('success');
    });
  });

  describe('checkpoint save failure does not halt execution', () => {
    test('should continue executing subsequent steps when saveCheckpoint fails', async () => {
      const plan = createTestPlan();

      const stateClient = (executor as any).stateClient;
      spyOn(stateClient, 'getLatestCheckpoint').mockResolvedValue(null);

      // saveCheckpoint always fails
      spyOn(stateClient, 'saveCheckpoint').mockRejectedValue(
        new Error('State service unreachable')
      );

      spyOn(stateClient, 'deleteCheckpoints').mockResolvedValue(true);

      const results = await executor.executePlan(plan);

      // All three steps should still succeed despite checkpoint save failures
      expect(results.length).toBe(3);
      expect(results[0].status).toBe('success');
      expect(results[1].status).toBe('success');
      expect(results[2].status).toBe('success');
    });

    test('should continue when getLatestCheckpoint fails at startup', async () => {
      const plan = createTestPlan();

      const stateClient = (executor as any).stateClient;

      // getLatestCheckpoint throws (state service completely down)
      spyOn(stateClient, 'getLatestCheckpoint').mockRejectedValue(
        new Error('Connection refused')
      );

      spyOn(stateClient, 'saveCheckpoint').mockRejectedValue(
        new Error('Connection refused')
      );

      spyOn(stateClient, 'deleteCheckpoints').mockResolvedValue(false);

      const results = await executor.executePlan(plan);

      // Execution should still complete successfully
      expect(results.length).toBe(3);
      expect(results.every((r) => r.status === 'success')).toBe(true);
    });
  });
});
