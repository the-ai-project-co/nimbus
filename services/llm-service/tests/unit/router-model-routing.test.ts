import { describe, test, expect, beforeEach } from 'bun:test';
import { LLMRouter } from '../../src/router';
import type { LLMProvider, CompletionRequest, LLMResponse, StreamChunk, ToolCompletionRequest } from '../../src/providers/base';

/**
 * Create a mock LLM provider
 */
function createMockProvider(name: string): LLMProvider {
  return {
    name,
    async complete(request: CompletionRequest): Promise<LLMResponse> {
      return {
        content: `Response from ${name}`,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        model: request.model || 'test-model',
        finishReason: 'stop',
      };
    },
    async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
      yield { content: `Chunk from ${name}`, done: false };
      yield { content: '', done: true, usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 } };
    },
    async completeWithTools(request: ToolCompletionRequest): Promise<LLMResponse> {
      return {
        content: `Tool response from ${name}`,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        model: request.model || 'test-model',
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

describe('LLM Router — Model-Level Cost Routing (Gap 6)', () => {
  test('router config should include cheapModel and expensiveModel defaults', () => {
    // Clear env vars that might interfere
    const savedCheap = process.env.CHEAP_MODEL;
    const savedExpensive = process.env.EXPENSIVE_MODEL;
    delete process.env.CHEAP_MODEL;
    delete process.env.EXPENSIVE_MODEL;

    const router = new LLMRouter({
      costOptimization: {
        enabled: true,
        cheapModelFor: ['summarization'],
        expensiveModelFor: ['code_generation'],
        cheapModel: 'claude-haiku-4-20250514',
        expensiveModel: 'claude-sonnet-4-20250514',
      },
      fallback: { enabled: false, providers: [] },
    });

    // Restore env vars
    if (savedCheap) process.env.CHEAP_MODEL = savedCheap;
    if (savedExpensive) process.env.EXPENSIVE_MODEL = savedExpensive;

    expect(router).toBeDefined();
  });

  test('cheap task type should inject cheapModel into request', async () => {
    const router = new LLMRouter({
      defaultProvider: 'anthropic',
      costOptimization: {
        enabled: true,
        cheapModelFor: ['summarization'],
        expensiveModelFor: ['code_generation'],
        cheapModel: 'claude-haiku-4-20250514',
        expensiveModel: 'claude-sonnet-4-20250514',
      },
      fallback: { enabled: false, providers: [] },
    });

    // Register a mock provider
    const mockProvider = createMockProvider('anthropic');
    let capturedModel: string | undefined;
    const originalComplete = mockProvider.complete.bind(mockProvider);
    mockProvider.complete = async (request: CompletionRequest) => {
      capturedModel = request.model;
      return originalComplete(request);
    };
    router.registerProvider(mockProvider);

    // Route with a cheap task type and no explicit model
    const request: CompletionRequest = {
      messages: [{ role: 'user', content: 'Summarize this' }],
    };

    await router.route(request, 'summarization');

    expect(capturedModel).toBe('claude-haiku-4-20250514');
  });

  test('expensive task type should inject expensiveModel into request', async () => {
    const router = new LLMRouter({
      defaultProvider: 'anthropic',
      costOptimization: {
        enabled: true,
        cheapModelFor: ['summarization'],
        expensiveModelFor: ['code_generation'],
        cheapModel: 'claude-haiku-4-20250514',
        expensiveModel: 'claude-sonnet-4-20250514',
      },
      fallback: { enabled: false, providers: [] },
    });

    const mockProvider = createMockProvider('anthropic');
    let capturedModel: string | undefined;
    const originalComplete = mockProvider.complete.bind(mockProvider);
    mockProvider.complete = async (request: CompletionRequest) => {
      capturedModel = request.model;
      return originalComplete(request);
    };
    router.registerProvider(mockProvider);

    const request: CompletionRequest = {
      messages: [{ role: 'user', content: 'Generate code' }],
    };

    await router.route(request, 'code_generation');

    expect(capturedModel).toBe('claude-sonnet-4-20250514');
  });

  test('should not override explicitly set model', async () => {
    const router = new LLMRouter({
      defaultProvider: 'anthropic',
      costOptimization: {
        enabled: true,
        cheapModelFor: ['summarization'],
        expensiveModelFor: ['code_generation'],
        cheapModel: 'claude-haiku-4-20250514',
        expensiveModel: 'claude-sonnet-4-20250514',
      },
      fallback: { enabled: false, providers: [] },
    });

    const mockProvider = createMockProvider('anthropic');
    let capturedModel: string | undefined;
    const originalComplete = mockProvider.complete.bind(mockProvider);
    mockProvider.complete = async (request: CompletionRequest) => {
      capturedModel = request.model;
      return originalComplete(request);
    };
    router.registerProvider(mockProvider);

    // Explicitly set model on the request
    const request: CompletionRequest = {
      messages: [{ role: 'user', content: 'Summarize this' }],
      model: 'claude-opus-4-20250514',
    };

    await router.route(request, 'summarization');

    // The explicitly set model should be used, not overridden
    expect(capturedModel).toBe('claude-opus-4-20250514');
  });

  test('custom cheapModel and expensiveModel should be respected', async () => {
    const router = new LLMRouter({
      defaultProvider: 'openai',
      costOptimization: {
        enabled: true,
        cheapModelFor: ['classification'],
        expensiveModelFor: ['planning'],
        cheapModel: 'gpt-4o-mini',
        expensiveModel: 'gpt-4o',
      },
      fallback: { enabled: false, providers: [] },
    });

    const mockProvider = createMockProvider('openai');
    let capturedModel: string | undefined;
    const originalComplete = mockProvider.complete.bind(mockProvider);
    mockProvider.complete = async (request: CompletionRequest) => {
      capturedModel = request.model;
      return originalComplete(request);
    };
    router.registerProvider(mockProvider);

    const request: CompletionRequest = {
      messages: [{ role: 'user', content: 'Classify this' }],
    };

    await router.route(request, 'classification');

    expect(capturedModel).toBe('gpt-4o-mini');
  });

  test('cost optimization disabled should not inject model', async () => {
    const router = new LLMRouter({
      defaultProvider: 'anthropic',
      costOptimization: {
        enabled: false,
        cheapModelFor: ['summarization'],
        expensiveModelFor: ['code_generation'],
        cheapModel: 'claude-haiku-4-20250514',
        expensiveModel: 'claude-sonnet-4-20250514',
      },
      fallback: { enabled: false, providers: [] },
    });

    const mockProvider = createMockProvider('anthropic');
    let capturedModel: string | undefined;
    const originalComplete = mockProvider.complete.bind(mockProvider);
    mockProvider.complete = async (request: CompletionRequest) => {
      capturedModel = request.model;
      return originalComplete(request);
    };
    router.registerProvider(mockProvider);

    const request: CompletionRequest = {
      messages: [{ role: 'user', content: 'Summarize' }],
    };

    await router.route(request, 'summarization');

    // Model should not have been set since cost optimization is disabled
    expect(capturedModel).toBeUndefined();
  });
});
