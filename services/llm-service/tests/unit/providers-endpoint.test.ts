import { describe, test, expect } from 'bun:test';
import { LLMRouter } from '../../src/router';
import { createProvidersRoutes } from '../../src/routes/providers';
import type { LLMProvider, CompletionRequest, LLMResponse, StreamChunk, ToolCompletionRequest } from '../../src/providers/base';

/**
 * Create a mock LLM provider for testing
 */
function createMockProvider(
  name: string,
  models: string[],
  opts: { failListModels?: boolean } = {}
): LLMProvider {
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
      yield { content: '', done: true };
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
    async listModels(): Promise<string[]> {
      if (opts.failListModels) {
        throw new Error(`${name} listModels failed`);
      }
      return models;
    },
  };
}

describe('GET /api/llm/providers', () => {
  test('returns providers with availability and model lists', async () => {
    const router = new LLMRouter({ defaultProvider: 'mock-a' });
    const providerA = createMockProvider('mock-a', ['model-a1', 'model-a2']);
    const providerB = createMockProvider('mock-b', ['model-b1']);
    router.registerProvider(providerA);
    router.registerProvider(providerB);

    const providers = await router.getProviders();

    // Find our mock providers (ollama is always registered)
    const mockA = providers.find(p => p.name === 'mock-a');
    const mockB = providers.find(p => p.name === 'mock-b');

    expect(mockA).toBeDefined();
    expect(mockA!.available).toBe(true);
    expect(mockA!.models).toEqual(['model-a1', 'model-a2']);

    expect(mockB).toBeDefined();
    expect(mockB!.available).toBe(true);
    expect(mockB!.models).toEqual(['model-b1']);
  });

  test('marks provider as unavailable when listModels fails', async () => {
    const router = new LLMRouter({ defaultProvider: 'failing' });
    const failing = createMockProvider('failing', [], { failListModels: true });
    router.registerProvider(failing);

    const providers = await router.getProviders();

    const failingProvider = providers.find(p => p.name === 'failing');
    expect(failingProvider).toBeDefined();
    expect(failingProvider!.available).toBe(false);
    expect(failingProvider!.models).toEqual([]);
  });

  test('providersHandler returns correct JSON structure', async () => {
    const router = new LLMRouter({ defaultProvider: 'test-provider' });
    const provider = createMockProvider('test-provider', ['test-model-1', 'test-model-2']);
    router.registerProvider(provider);

    const { providersHandler } = createProvidersRoutes(router);

    const request = new Request('http://localhost/api/llm/providers', {
      method: 'GET',
    });

    const response = await providersHandler(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.providers).toBeDefined();
    expect(Array.isArray(body.data.providers)).toBe(true);

    const testProvider = body.data.providers.find((p: any) => p.name === 'test-provider');
    expect(testProvider).toBeDefined();
    expect(testProvider.available).toBe(true);
    expect(testProvider.models).toContain('test-model-1');
    expect(testProvider.models).toContain('test-model-2');
  });

  test('each provider entry has name, available, and models fields', async () => {
    const router = new LLMRouter({ defaultProvider: 'check-shape' });
    const provider = createMockProvider('check-shape', ['m1']);
    router.registerProvider(provider);

    const { providersHandler } = createProvidersRoutes(router);

    const request = new Request('http://localhost/api/llm/providers', {
      method: 'GET',
    });

    const response = await providersHandler(request);
    const body = await response.json();

    for (const p of body.data.providers) {
      expect(typeof p.name).toBe('string');
      expect(typeof p.available).toBe('boolean');
      expect(Array.isArray(p.models)).toBe(true);
    }
  });

  test('returns all registered providers including defaults', async () => {
    const router = new LLMRouter({ defaultProvider: 'custom' });
    const custom = createMockProvider('custom', ['custom-model']);
    router.registerProvider(custom);

    const providers = await router.getProviders();

    // Ollama is always registered by default
    const providerNames = providers.map(p => p.name);
    expect(providerNames).toContain('ollama');
    expect(providerNames).toContain('custom');
  });

  test('handles mixed available and unavailable providers', async () => {
    const router = new LLMRouter({ defaultProvider: 'good' });
    const good = createMockProvider('good', ['model-ok']);
    const bad = createMockProvider('bad', [], { failListModels: true });
    router.registerProvider(good);
    router.registerProvider(bad);

    const { providersHandler } = createProvidersRoutes(router);

    const request = new Request('http://localhost/api/llm/providers', {
      method: 'GET',
    });

    const response = await providersHandler(request);
    const body = await response.json();

    expect(body.success).toBe(true);

    const goodProvider = body.data.providers.find((p: any) => p.name === 'good');
    const badProvider = body.data.providers.find((p: any) => p.name === 'bad');

    expect(goodProvider.available).toBe(true);
    expect(goodProvider.models).toEqual(['model-ok']);

    expect(badProvider.available).toBe(false);
    expect(badProvider.models).toEqual([]);
  });
});
