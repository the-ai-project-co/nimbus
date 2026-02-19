import { describe, test, expect } from 'bun:test';

describe('Config Router Integration', () => {
  test('LLMRouter accepts partial config', async () => {
    const { LLMRouter } = await import('../../src/router');
    const router = new LLMRouter({
      defaultProvider: 'openai',
      defaultModel: 'gpt-4o',
    });
    expect(router).toBeDefined();
  });

  test('LLMRouter accepts empty config', async () => {
    const { LLMRouter } = await import('../../src/router');
    const router = new LLMRouter({});
    expect(router).toBeDefined();
  });

  test('LLMRouter uses config costOptimization', async () => {
    const { LLMRouter } = await import('../../src/router');
    const router = new LLMRouter({
      costOptimization: {
        enabled: true,
        cheapModel: 'claude-haiku-4-20250514',
        expensiveModel: 'claude-opus-4-20250514',
        cheapModelFor: ['summarization'],
        expensiveModelFor: ['code_generation'],
      },
    });
    expect(router).toBeDefined();
  });

  test('LLMRouter uses config fallback', async () => {
    const { LLMRouter } = await import('../../src/router');
    const router = new LLMRouter({
      fallback: {
        enabled: true,
        providers: ['anthropic', 'openai'],
      },
    });
    expect(router).toBeDefined();
  });

  test('LLMRouter uses config tokenBudget', async () => {
    const { LLMRouter } = await import('../../src/router');
    const router = new LLMRouter({
      tokenBudget: {
        maxTokensPerRequest: 8192,
      },
    });
    expect(router).toBeDefined();
  });
});
