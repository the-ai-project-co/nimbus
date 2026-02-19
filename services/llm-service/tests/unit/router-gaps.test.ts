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
 * Create a mock LLM provider with configurable stream behaviour.
 */
function createMockProvider(
  name: string,
  opts: {
    model?: string;
    streamUsage?: boolean;
  } = {}
): LLMProvider {
  const model = opts.model ?? 'test-model';
  const includeStreamUsage = opts.streamUsage ?? true;

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
      if (includeStreamUsage) {
        yield {
          done: true,
          usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120 },
        };
      } else {
        yield { done: true };
      }
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

// ---------------------------------------------------------------------------
// C1: 'explanations' in cheapModelFor defaults
// ---------------------------------------------------------------------------
describe('C1: cheapModelFor defaults include explanations', () => {
  test('default cheapModelFor list contains explanations', () => {
    const router = new LLMRouter({
      defaultProvider: 'test',
      fallback: { enabled: false, providers: [] },
    });

    const cheapModelFor = (router as any).config.costOptimization.cheapModelFor as string[];
    expect(cheapModelFor).toContain('explanations');
  });

  test('default cheapModelFor still contains original entries', () => {
    const router = new LLMRouter({
      defaultProvider: 'test',
      fallback: { enabled: false, providers: [] },
    });

    const cheapModelFor = (router as any).config.costOptimization.cheapModelFor as string[];
    expect(cheapModelFor).toContain('simple_queries');
    expect(cheapModelFor).toContain('summarization');
    expect(cheapModelFor).toContain('classification');
    expect(cheapModelFor).toContain('explanations');
    expect(cheapModelFor).toHaveLength(4);
  });

  test('custom cheapModelFor overrides the defaults entirely', () => {
    const router = new LLMRouter({
      defaultProvider: 'test',
      costOptimization: {
        enabled: true,
        cheapModelFor: ['custom_task'],
        expensiveModelFor: [],
        cheapModel: 'claude-haiku-4-20250514',
        expensiveModel: 'claude-opus-4-20250514',
      },
      fallback: { enabled: false, providers: [] },
    });

    const cheapModelFor = (router as any).config.costOptimization.cheapModelFor as string[];
    expect(cheapModelFor).toEqual(['custom_task']);
    expect(cheapModelFor).not.toContain('explanations');
  });
});

// ---------------------------------------------------------------------------
// C2: default expensiveModel is claude-opus-4-20250514
// ---------------------------------------------------------------------------
describe('C2: default expensiveModel is claude-opus-4-20250514', () => {
  test('default expensiveModel is opus, not sonnet', () => {
    // Ensure env var does not interfere
    const saved = process.env.EXPENSIVE_MODEL;
    delete process.env.EXPENSIVE_MODEL;

    const router = new LLMRouter({
      defaultProvider: 'test',
      fallback: { enabled: false, providers: [] },
    });

    const expensiveModel = (router as any).config.costOptimization.expensiveModel as string;
    expect(expensiveModel).toBe('claude-opus-4-20250514');

    // Restore
    if (saved !== undefined) process.env.EXPENSIVE_MODEL = saved;
  });

  test('EXPENSIVE_MODEL env var overrides the default', () => {
    const saved = process.env.EXPENSIVE_MODEL;
    process.env.EXPENSIVE_MODEL = 'gpt-4o';

    const router = new LLMRouter({
      defaultProvider: 'test',
      fallback: { enabled: false, providers: [] },
    });

    const expensiveModel = (router as any).config.costOptimization.expensiveModel as string;
    expect(expensiveModel).toBe('gpt-4o');

    // Restore
    if (saved !== undefined) {
      process.env.EXPENSIVE_MODEL = saved;
    } else {
      delete process.env.EXPENSIVE_MODEL;
    }
  });

  test('explicit config overrides both env and default', () => {
    const saved = process.env.EXPENSIVE_MODEL;
    process.env.EXPENSIVE_MODEL = 'gpt-4o';

    const router = new LLMRouter({
      defaultProvider: 'test',
      costOptimization: {
        enabled: true,
        cheapModelFor: [],
        expensiveModelFor: [],
        cheapModel: 'claude-haiku-4-20250514',
        expensiveModel: 'gemini-1.5-pro',
      },
      fallback: { enabled: false, providers: [] },
    });

    const expensiveModel = (router as any).config.costOptimization.expensiveModel as string;
    expect(expensiveModel).toBe('gemini-1.5-pro');

    if (saved !== undefined) {
      process.env.EXPENSIVE_MODEL = saved;
    } else {
      delete process.env.EXPENSIVE_MODEL;
    }
  });
});

// ---------------------------------------------------------------------------
// C3: routeStream() tracks cost via persistUsage
// ---------------------------------------------------------------------------
describe('C3: routeStream() tracks streaming cost', () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchCalls: Array<{ url: string; options: any }>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchCalls = [];

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

  test('routeStream is an async generator function', () => {
    const router = new LLMRouter({
      defaultProvider: 'test',
      fallback: { enabled: false, providers: [] },
    });

    // AsyncGeneratorFunction constructor name check
    expect(typeof router.routeStream).toBe('function');
    expect(router.routeStream.constructor.name).toBe('AsyncGeneratorFunction');
  });

  test('persists usage data with actual token counts when provider reports usage', async () => {
    const router = new LLMRouter({
      defaultProvider: 'testprov',
      fallback: { enabled: false, providers: [] },
    });
    const provider = createMockProvider('testprov', { streamUsage: true });
    router.registerProvider(provider);

    const chunks: StreamChunk[] = [];
    for await (const chunk of router.routeStream({
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk);
    }

    // All chunks should have been yielded
    expect(chunks).toHaveLength(3);
    expect(chunks[0].content).toBe('Hello ');
    expect(chunks[1].content).toBe('world');
    expect(chunks[2].done).toBe(true);

    // Allow fire-and-forget fetch to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    const stateCall = fetchCalls.find((c) => c.url.includes('/api/state/history'));
    expect(stateCall).toBeDefined();

    const body = JSON.parse(stateCall!.options.body);
    expect(body.type).toBe('llm_usage');
    expect(body.provider).toBe('testprov');
    expect(body.inputTokens).toBe(80);
    expect(body.outputTokens).toBe(40);
    expect(body.totalTokens).toBe(120);
    expect(typeof body.costUSD).toBe('number');
    expect(body.timestamp).toBeDefined();
  });

  test('estimates tokens from content when provider does not report usage', async () => {
    const router = new LLMRouter({
      defaultProvider: 'testprov',
      fallback: { enabled: false, providers: [] },
    });
    const provider = createMockProvider('testprov', { streamUsage: false });
    router.registerProvider(provider);

    const chunks: StreamChunk[] = [];
    for await (const chunk of router.routeStream({
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk);
    }

    // All chunks should still be yielded
    expect(chunks).toHaveLength(3);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const stateCall = fetchCalls.find((c) => c.url.includes('/api/state/history'));
    expect(stateCall).toBeDefined();

    const body = JSON.parse(stateCall!.options.body);
    expect(body.type).toBe('llm_usage');
    expect(body.provider).toBe('testprov');
    // Estimated: "Hello world" = 11 chars, ceil(11/4) = 3 output tokens
    expect(body.outputTokens).toBe(Math.ceil('Hello world'.length / 4));
    // Estimated: "Hello" = 5 chars, ceil(5/4) = 2 input tokens
    expect(body.inputTokens).toBe(Math.ceil('Hello'.length / 4));
    expect(body.totalTokens).toBe(body.inputTokens + body.outputTokens);
  });

  test('routeStream throws when no provider is available', async () => {
    const router = new LLMRouter({
      defaultProvider: 'nonexistent',
      fallback: { enabled: false, providers: [] },
    });

    // Remove the default ollama provider
    (router as any).providers.clear();

    const iter = router.routeStream({
      messages: [{ role: 'user', content: 'hi' }],
    });

    // Consuming the async iterator should throw
    await expect(async () => {
      for await (const _chunk of iter) {
        // consume
      }
    }).toThrow('No LLM provider available');
  });
});
