import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { LLMRouter } from '../../src/router';
import type {
  LLMProvider,
  CompletionRequest,
  LLMResponse,
  StreamChunk,
  ToolCompletionRequest,
} from '../../src/providers/base';

/**
 * Create a mock LLM provider that returns deterministic responses
 */
function createMockProvider(
  name: string,
  model: string = 'test-model'
): LLMProvider {
  return {
    name,
    async complete(_request: CompletionRequest): Promise<LLMResponse> {
      return {
        content: `Response from ${name}`,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model,
        finishReason: 'stop',
      };
    },
    async *stream(_request: CompletionRequest): AsyncIterable<StreamChunk> {
      yield { content: 'Hello ', done: false };
      yield { content: 'world', done: false };
      yield {
        done: true,
        usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120 },
      };
    },
    async completeWithTools(_request: ToolCompletionRequest): Promise<LLMResponse> {
      return {
        content: `Tool response from ${name}`,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model,
        finishReason: 'stop',
      };
    },
    async countTokens(): Promise<number> {
      return 25;
    },
    getMaxTokens(): number {
      return 4096;
    },
  };
}

describe('Usage Persistence to State Service', () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchCalls: Array<{ url: string; options: any }>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchCalls = [];

    // Mock global fetch to capture calls
    globalThis.fetch = mock(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url;
      fetchCalls.push({ url, options: init });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('sends usage data to state service after route() completion', async () => {
    const router = new LLMRouter({
      defaultProvider: 'testprov',
      fallback: { enabled: false, providers: [] },
    });
    const provider = createMockProvider('testprov', 'claude-sonnet-4-20250514');
    router.registerProvider(provider);

    await router.route({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    // Allow fire-and-forget fetch to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Find the state service call among all fetch calls
    const stateCall = fetchCalls.find((c) => c.url.includes('/api/state/history'));
    expect(stateCall).toBeDefined();
    expect(stateCall!.options.method).toBe('POST');

    const body = JSON.parse(stateCall!.options.body);
    expect(body.type).toBe('llm_usage');
    expect(body.provider).toBe('testprov');
    expect(body.model).toBe('claude-sonnet-4-20250514');
    expect(body.inputTokens).toBe(100);
    expect(body.outputTokens).toBe(50);
    expect(body.totalTokens).toBe(150);
    expect(typeof body.costUSD).toBe('number');
    expect(body.timestamp).toBeDefined();
  });

  test('sends usage data with cost after routeWithTools() completion', async () => {
    const router = new LLMRouter({
      defaultProvider: 'testprov',
      fallback: { enabled: false, providers: [] },
    });
    const provider = createMockProvider('testprov', 'gpt-4o');
    router.registerProvider(provider);

    await router.routeWithTools({
      messages: [{ role: 'user', content: 'Use a tool' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'test_tool',
            description: 'A test tool',
            parameters: { type: 'object' },
          },
        },
      ],
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const stateCall = fetchCalls.find((c) => c.url.includes('/api/state/history'));
    expect(stateCall).toBeDefined();

    const body = JSON.parse(stateCall!.options.body);
    expect(body.type).toBe('llm_usage');
    expect(body.inputTokens).toBe(100);
    expect(body.outputTokens).toBe(50);
    expect(typeof body.costUSD).toBe('number');
  });

  test('does not throw when state service is unavailable', async () => {
    // Override mock to simulate failure
    globalThis.fetch = mock(async () => {
      throw new Error('Connection refused');
    }) as any;

    const router = new LLMRouter({
      defaultProvider: 'testprov',
      fallback: { enabled: false, providers: [] },
    });
    const provider = createMockProvider('testprov');
    router.registerProvider(provider);

    // This should not throw even though state service is down
    const response = await router.route({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(response.content).toBe('Response from testprov');
  });

  test('does not throw when state service returns an error', async () => {
    globalThis.fetch = mock(async () => {
      return new Response('Internal Server Error', { status: 500 });
    }) as any;

    const router = new LLMRouter({
      defaultProvider: 'testprov',
      fallback: { enabled: false, providers: [] },
    });
    const provider = createMockProvider('testprov');
    router.registerProvider(provider);

    const response = await router.route({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(response.content).toBe('Response from testprov');
  });

  test('persistUsage sends correct payload shape', async () => {
    const router = new LLMRouter({
      defaultProvider: 'testprov',
      fallback: { enabled: false, providers: [] },
    });

    router.persistUsage(
      { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      'claude-sonnet-4-20250514',
      'anthropic',
      { costUSD: 0.0021, breakdown: { input: 0.0006, output: 0.0015 } }
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    const stateCall = fetchCalls.find((c) => c.url.includes('/api/state/history'));
    expect(stateCall).toBeDefined();

    const body = JSON.parse(stateCall!.options.body);
    expect(body).toEqual(
      expect.objectContaining({
        type: 'llm_usage',
        command: 'llm.completion',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
        costUSD: 0.0021,
      })
    );
    expect(typeof body.timestamp).toBe('string');
  });

  test('response includes cost field after route()', async () => {
    const router = new LLMRouter({
      defaultProvider: 'testprov',
      fallback: { enabled: false, providers: [] },
    });
    // Use a model with known pricing
    const provider = createMockProvider('testprov', 'claude-sonnet-4-20250514');
    // Override the provider name to match pricing lookup
    (provider as any).name = 'anthropic';
    router.registerProvider(provider);

    const response = await router.route({
      messages: [{ role: 'user', content: 'Hello' }],
      model: 'claude-sonnet-4-20250514',
    });

    expect(response.cost).toBeDefined();
    expect(typeof response.cost!.costUSD).toBe('number');
    expect(response.cost!.costUSD).toBeGreaterThan(0);
    expect(response.cost!.breakdown).toBeDefined();
    expect(typeof response.cost!.breakdown.input).toBe('number');
    expect(typeof response.cost!.breakdown.output).toBe('number');
  });
});
