import { describe, test, expect, beforeEach } from 'bun:test';
import { SafetyManager } from '../components/safety-manager';

describe('Token Budget Safety Check', () => {
  let safetyManager: SafetyManager;

  beforeEach(() => {
    safetyManager = new SafetyManager();
  });

  test('pre_token_budget check is registered', () => {
    const checks = safetyManager.getAllChecks();
    const tokenBudgetCheck = checks.find(c => c.id === 'pre_token_budget');
    expect(tokenBudgetCheck).toBeDefined();
    expect(tokenBudgetCheck!.type).toBe('pre_execution');
    expect(tokenBudgetCheck!.category).toBe('cost');
  });

  test('passes when no budget configured', async () => {
    const originalEnv = process.env.MAX_TOKENS_PER_TASK;
    delete process.env.MAX_TOKENS_PER_TASK;

    const checks = safetyManager.getAllChecks();
    const tokenBudgetCheck = checks.find(c => c.id === 'pre_token_budget')!;

    const result = await tokenBudgetCheck.check({
      plan: { estimated_tokens: 10000, steps: [] },
      task: { context: { environment: 'dev', provider: 'aws', components: [] } },
    });

    expect(result.passed).toBe(true);
    process.env.MAX_TOKENS_PER_TASK = originalEnv;
  });

  test('passes when within budget', async () => {
    const originalEnv = process.env.MAX_TOKENS_PER_TASK;
    process.env.MAX_TOKENS_PER_TASK = '50000';

    const checks = safetyManager.getAllChecks();
    const tokenBudgetCheck = checks.find(c => c.id === 'pre_token_budget')!;

    const result = await tokenBudgetCheck.check({
      plan: { estimated_tokens: 30000, steps: [] },
      task: { context: { environment: 'dev', provider: 'aws', components: [] } },
    });

    expect(result.passed).toBe(true);
    process.env.MAX_TOKENS_PER_TASK = originalEnv;
  });

  test('fails when exceeding budget', async () => {
    const originalEnv = process.env.MAX_TOKENS_PER_TASK;
    process.env.MAX_TOKENS_PER_TASK = '10000';

    const checks = safetyManager.getAllChecks();
    const tokenBudgetCheck = checks.find(c => c.id === 'pre_token_budget')!;

    const result = await tokenBudgetCheck.check({
      plan: { estimated_tokens: 50000, steps: [] },
      task: { context: { environment: 'dev', provider: 'aws', components: [] } },
    });

    expect(result.passed).toBe(false);
    expect(result.can_proceed).toBe(false);
    process.env.MAX_TOKENS_PER_TASK = originalEnv;
  });

  test('token budget enforcement in router config', async () => {
    // Verify RouterConfig accepts tokenBudget
    const { LLMRouter } = await import('../../../llm-service/src/router');
    const router = new LLMRouter({
      tokenBudget: { maxTokensPerRequest: 2048 },
    });
    expect(router).toBeDefined();
  });
});
