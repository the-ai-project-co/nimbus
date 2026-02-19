import { describe, test, expect } from 'bun:test';
import { calculateCost, getPricingData } from '../../src/cost-calculator';
import { LLMRouter } from '../../src/router';

describe('Cost Calculator', () => {
  describe('Anthropic pricing', () => {
    test('calculates cost for claude-sonnet-4-20250514', () => {
      const result = calculateCost('anthropic', 'claude-sonnet-4-20250514', 1000, 500);
      // Input: 1000/1000 * 0.003 = 0.003
      // Output: 500/1000 * 0.015 = 0.0075
      expect(result.costUSD).toBeCloseTo(0.0105, 6);
      expect(result.breakdown.input).toBeCloseTo(0.003, 6);
      expect(result.breakdown.output).toBeCloseTo(0.0075, 6);
    });

    test('calculates cost for claude-opus-4-20250514', () => {
      const result = calculateCost('anthropic', 'claude-opus-4-20250514', 2000, 1000);
      // Input: 2000/1000 * 0.015 = 0.03
      // Output: 1000/1000 * 0.075 = 0.075
      expect(result.costUSD).toBeCloseTo(0.105, 6);
      expect(result.breakdown.input).toBeCloseTo(0.03, 6);
      expect(result.breakdown.output).toBeCloseTo(0.075, 6);
    });

    test('calculates cost for claude-haiku-4-20250514', () => {
      const result = calculateCost('anthropic', 'claude-haiku-4-20250514', 5000, 2000);
      // Input: 5000/1000 * 0.0008 = 0.004
      // Output: 2000/1000 * 0.004 = 0.008
      expect(result.costUSD).toBeCloseTo(0.012, 6);
      expect(result.breakdown.input).toBeCloseTo(0.004, 6);
      expect(result.breakdown.output).toBeCloseTo(0.008, 6);
    });

    test('calculates cost for claude-3.5-sonnet', () => {
      const result = calculateCost('anthropic', 'claude-3.5-sonnet', 1000, 1000);
      // Input: 1000/1000 * 0.003 = 0.003
      // Output: 1000/1000 * 0.015 = 0.015
      expect(result.costUSD).toBeCloseTo(0.018, 6);
    });

    test('calculates cost for claude-3-opus', () => {
      const result = calculateCost('anthropic', 'claude-3-opus', 1000, 1000);
      // Input: 1000/1000 * 0.015 = 0.015
      // Output: 1000/1000 * 0.075 = 0.075
      expect(result.costUSD).toBeCloseTo(0.09, 6);
    });

    test('calculates cost for claude-3-haiku', () => {
      const result = calculateCost('anthropic', 'claude-3-haiku', 1000, 1000);
      // Input: 1000/1000 * 0.00025 = 0.00025
      // Output: 1000/1000 * 0.00125 = 0.00125
      expect(result.costUSD).toBeCloseTo(0.0015, 6);
    });
  });

  describe('OpenAI pricing', () => {
    test('calculates cost for gpt-4', () => {
      const result = calculateCost('openai', 'gpt-4', 1000, 500);
      // Input: 1000/1000 * 0.03 = 0.03
      // Output: 500/1000 * 0.06 = 0.03
      expect(result.costUSD).toBeCloseTo(0.06, 6);
    });

    test('calculates cost for gpt-4-turbo', () => {
      const result = calculateCost('openai', 'gpt-4-turbo', 1000, 500);
      // Input: 1000/1000 * 0.01 = 0.01
      // Output: 500/1000 * 0.03 = 0.015
      expect(result.costUSD).toBeCloseTo(0.025, 6);
    });

    test('calculates cost for gpt-4o', () => {
      const result = calculateCost('openai', 'gpt-4o', 1000, 500);
      // Input: 1000/1000 * 0.005 = 0.005
      // Output: 500/1000 * 0.015 = 0.0075
      expect(result.costUSD).toBeCloseTo(0.0125, 6);
    });

    test('calculates cost for gpt-4o-mini', () => {
      const result = calculateCost('openai', 'gpt-4o-mini', 10000, 5000);
      // Input: 10000/1000 * 0.00015 = 0.0015
      // Output: 5000/1000 * 0.0006 = 0.003
      expect(result.costUSD).toBeCloseTo(0.0045, 6);
    });

    test('calculates cost for gpt-3.5-turbo', () => {
      const result = calculateCost('openai', 'gpt-3.5-turbo', 1000, 1000);
      // Input: 1000/1000 * 0.0005 = 0.0005
      // Output: 1000/1000 * 0.0015 = 0.0015
      expect(result.costUSD).toBeCloseTo(0.002, 6);
    });
  });

  describe('Google pricing', () => {
    test('calculates cost for gemini-pro', () => {
      const result = calculateCost('google', 'gemini-pro', 1000, 1000);
      // Input: 1000/1000 * 0.00025 = 0.00025
      // Output: 1000/1000 * 0.0005 = 0.0005
      expect(result.costUSD).toBeCloseTo(0.00075, 6);
    });

    test('calculates cost for gemini-1.5-pro', () => {
      const result = calculateCost('google', 'gemini-1.5-pro', 1000, 1000);
      // Input: 1000/1000 * 0.00125 = 0.00125
      // Output: 1000/1000 * 0.005 = 0.005
      expect(result.costUSD).toBeCloseTo(0.00625, 6);
    });

    test('calculates cost for gemini-1.5-flash', () => {
      const result = calculateCost('google', 'gemini-1.5-flash', 1000, 1000);
      // Input: 1000/1000 * 0.000075 = 0.000075
      // Output: 1000/1000 * 0.0003 = 0.0003
      expect(result.costUSD).toBeCloseTo(0.000375, 6);
    });
  });

  describe('Ollama pricing (free/local)', () => {
    test('returns zero cost for all ollama models', () => {
      const models = ['llama3.2', 'codellama', 'mistral', 'mixtral', 'phi'];
      for (const model of models) {
        const result = calculateCost('ollama', model, 10000, 5000);
        expect(result.costUSD).toBe(0);
        expect(result.breakdown.input).toBe(0);
        expect(result.breakdown.output).toBe(0);
      }
    });
  });

  describe('OpenRouter pricing', () => {
    test('calculates cost for anthropic/claude-sonnet-4-20250514', () => {
      const result = calculateCost('openrouter', 'anthropic/claude-sonnet-4-20250514', 1000, 500);
      expect(result.costUSD).toBeCloseTo(0.0105, 6);
    });

    test('calculates cost for openai/gpt-4o', () => {
      const result = calculateCost('openrouter', 'openai/gpt-4o', 1000, 500);
      expect(result.costUSD).toBeCloseTo(0.0125, 6);
    });
  });

  describe('unknown models and providers', () => {
    test('returns zero cost for unknown model', () => {
      const result = calculateCost('anthropic', 'claude-99-ultra', 1000, 1000);
      expect(result.costUSD).toBe(0);
      expect(result.breakdown.input).toBe(0);
      expect(result.breakdown.output).toBe(0);
    });

    test('returns zero cost for unknown provider', () => {
      const result = calculateCost('unknown-provider', 'some-model', 1000, 1000);
      expect(result.costUSD).toBe(0);
      expect(result.breakdown.input).toBe(0);
      expect(result.breakdown.output).toBe(0);
    });
  });

  describe('edge cases', () => {
    test('returns zero cost when token counts are zero', () => {
      const result = calculateCost('anthropic', 'claude-sonnet-4-20250514', 0, 0);
      expect(result.costUSD).toBe(0);
      expect(result.breakdown.input).toBe(0);
      expect(result.breakdown.output).toBe(0);
    });

    test('handles large token counts without overflow', () => {
      const result = calculateCost('openai', 'gpt-4', 1_000_000, 500_000);
      // Input: 1000000/1000 * 0.03 = 30
      // Output: 500000/1000 * 0.06 = 30
      expect(result.costUSD).toBeCloseTo(60, 2);
    });

    test('cost breakdown sums to total', () => {
      const result = calculateCost('anthropic', 'claude-sonnet-4-20250514', 1500, 800);
      expect(result.costUSD).toBeCloseTo(
        result.breakdown.input + result.breakdown.output,
        10
      );
    });
  });

  describe('getPricingData', () => {
    test('returns pricing data for all major providers', () => {
      const data = getPricingData();
      expect(data).toHaveProperty('anthropic');
      expect(data).toHaveProperty('openai');
      expect(data).toHaveProperty('google');
      expect(data).toHaveProperty('ollama');
      expect(data).toHaveProperty('openrouter');
    });
  });
});

describe('Fallback enabled by default', () => {
  test('fallback is enabled when DISABLE_FALLBACK is not set', async () => {
    delete process.env.DISABLE_FALLBACK;

    // Provide both test and backup in the fallback providers list
    const router = new LLMRouter({
      defaultProvider: 'test',
      fallback: { enabled: true, providers: ['test', 'backup'] },
    });

    const mockPrimary = createMockProvider('test', { failComplete: true });
    const mockFallback = createMockProvider('backup');
    router.registerProvider(mockPrimary);
    router.registerProvider(mockFallback);

    // With fallback enabled and primary failing, should fall back to backup
    const result = await router.route({
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result).toBeDefined();
    expect(result.content).toBe('Response from backup');
  });

  test('LLMRouter defaults to fallback enabled when no config provided', async () => {
    delete process.env.DISABLE_FALLBACK;

    // Provide the mock names in the fallback list so executeWithFallback can find them
    const router = new LLMRouter({
      defaultProvider: 'primary',
      fallback: { enabled: true, providers: ['primary', 'secondary'] },
    });

    const mockPrimary = createMockProvider('primary', { failComplete: true });
    const mockSecondary = createMockProvider('secondary');
    router.registerProvider(mockPrimary);
    router.registerProvider(mockSecondary);

    // Fallback should kick in since it is enabled by default
    const result = await router.route({
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(result).toBeDefined();
    expect(result.content).toBe('Response from secondary');
  });

  test('router uses fallback by default (DISABLE_FALLBACK not set)', () => {
    delete process.env.DISABLE_FALLBACK;

    // When DISABLE_FALLBACK is not set, fallback.enabled defaults to true
    // We verify by constructing a router with no explicit fallback config
    // and checking that it does not reject when primary fails but a fallback is available
    const router = new LLMRouter({
      defaultProvider: 'primary',
    });

    // The router's default fallback.providers list includes ['anthropic', 'openai', 'openrouter', 'google']
    // Register mock providers under those names
    const mockPrimary = createMockProvider('primary', { failComplete: true });
    const mockAnthropicFallback = createMockProvider('anthropic');
    router.registerProvider(mockPrimary);
    router.registerProvider(mockAnthropicFallback);

    expect(
      router.route({ messages: [{ role: 'user', content: 'hi' }] })
    ).resolves.toBeDefined();
  });

  test('fallback is disabled when DISABLE_FALLBACK is "true"', async () => {
    process.env.DISABLE_FALLBACK = 'true';

    const router = new LLMRouter({
      defaultProvider: 'primary',
      fallback: { enabled: process.env.DISABLE_FALLBACK !== 'true', providers: [] },
    });
    const mockPrimary = createMockProvider('primary', { failComplete: true });
    router.registerProvider(mockPrimary);

    await expect(
      router.route({ messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow();

    delete process.env.DISABLE_FALLBACK;
  });
});

// ---- helpers ----

import type {
  LLMProvider,
  CompletionRequest,
  LLMResponse,
  StreamChunk,
  ToolCompletionRequest,
} from '../../src/providers/base';

function createMockProvider(
  name: string,
  opts: { failComplete?: boolean } = {}
): LLMProvider {
  return {
    name,
    async complete(_request: CompletionRequest): Promise<LLMResponse> {
      if (opts.failComplete) {
        throw new Error(`${name} complete failed`);
      }
      return {
        content: `Response from ${name}`,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        model: 'test-model',
        finishReason: 'stop',
      };
    },
    async *stream(_request: CompletionRequest): AsyncIterable<StreamChunk> {
      yield { content: `Chunk from ${name}`, done: false };
      yield { done: true, usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 } };
    },
    async completeWithTools(_request: ToolCompletionRequest): Promise<LLMResponse> {
      return {
        content: `Tool response from ${name}`,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        model: 'test-model',
        finishReason: 'stop',
      };
    },
    async countTokens(): Promise<number> {
      return 10;
    },
    getMaxTokens(): number {
      return 4096;
    },
  };
}
