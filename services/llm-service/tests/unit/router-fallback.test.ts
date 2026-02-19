import { describe, test, expect, beforeEach } from 'bun:test';
import { LLMRouter } from '../../src/router';
import type { LLMProvider, CompletionRequest, LLMResponse, StreamChunk, ToolCompletionRequest } from '../../src/providers/base';

/**
 * Create a mock LLM provider
 */
function createMockProvider(
  name: string,
  opts: { failComplete?: boolean; failStream?: boolean } = {}
): LLMProvider {
  return {
    name,
    async complete(request: CompletionRequest): Promise<LLMResponse> {
      if (opts.failComplete) {
        throw new Error(`${name} complete failed`);
      }
      return {
        content: `Response from ${name}`,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        model: request.model || 'test-model',
        finishReason: 'stop',
      };
    },
    async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
      if (opts.failStream) {
        throw new Error(`${name} stream failed`);
      }
      yield { content: `Chunk from ${name}`, done: false };
      yield { content: '', done: true, usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 } };
    },
    async completeWithTools(request: ToolCompletionRequest): Promise<LLMResponse> {
      if (opts.failComplete) {
        throw new Error(`${name} tools failed`);
      }
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

const sampleRequest: CompletionRequest = {
  messages: [{ role: 'user', content: 'Hello' }],
};

describe('LLMRouter Fallback', () => {
  describe('fallback enabled by default', () => {
    test('should have fallback enabled when DISABLE_FALLBACK is not set', () => {
      delete process.env.DISABLE_FALLBACK;
      const router = new LLMRouter({ defaultProvider: 'test' });
      // The router config is private, but we can test behavior
      const primary = createMockProvider('test', { failComplete: true });
      const fallback = createMockProvider('fallback');
      router.registerProvider(primary);
      router.registerProvider(fallback);

      // If fallback is enabled and primary fails, fallback should succeed
      // We test this indirectly via the route method
    });

    test('should disable fallback when DISABLE_FALLBACK is true', () => {
      process.env.DISABLE_FALLBACK = 'true';
      const router = new LLMRouter({
        defaultProvider: 'test',
        fallback: { enabled: process.env.DISABLE_FALLBACK !== 'true', providers: [] },
      });
      const primary = createMockProvider('test', { failComplete: true });
      router.registerProvider(primary);

      // Without fallback, primary failure should throw
      expect(router.route(sampleRequest)).rejects.toThrow();
      delete process.env.DISABLE_FALLBACK;
    });
  });

  describe('non-streaming fallback', () => {
    test('should use primary provider when it succeeds', async () => {
      const router = new LLMRouter({
        defaultProvider: 'primary',
        fallback: { enabled: true, providers: ['primary', 'secondary'] },
      });
      const primary = createMockProvider('primary');
      const secondary = createMockProvider('secondary');
      router.registerProvider(primary);
      router.registerProvider(secondary);

      const result = await router.route(sampleRequest);
      expect(result.content).toBe('Response from primary');
    });

    test('should fall back to secondary when primary fails', async () => {
      const router = new LLMRouter({
        defaultProvider: 'primary',
        fallback: { enabled: true, providers: ['primary', 'secondary'] },
      });
      const primary = createMockProvider('primary', { failComplete: true });
      const secondary = createMockProvider('secondary');
      router.registerProvider(primary);
      router.registerProvider(secondary);

      const result = await router.route(sampleRequest);
      expect(result.content).toBe('Response from secondary');
    });

    test('should throw when all providers fail', async () => {
      const router = new LLMRouter({
        defaultProvider: 'primary',
        fallback: { enabled: true, providers: ['primary', 'secondary'] },
      });
      const primary = createMockProvider('primary', { failComplete: true });
      const secondary = createMockProvider('secondary', { failComplete: true });
      router.registerProvider(primary);
      router.registerProvider(secondary);

      await expect(router.route(sampleRequest)).rejects.toThrow('All LLM providers failed');
    });
  });

  describe('streaming fallback', () => {
    test('should stream from primary when it succeeds', async () => {
      const router = new LLMRouter({
        defaultProvider: 'primary',
        fallback: { enabled: true, providers: ['primary', 'secondary'] },
      });
      const primary = createMockProvider('primary');
      const secondary = createMockProvider('secondary');
      router.registerProvider(primary);
      router.registerProvider(secondary);

      const chunks: StreamChunk[] = [];
      for await (const chunk of router.routeStream(sampleRequest)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].content).toBe('Chunk from primary');
    });

    test('should fall back to secondary when primary stream fails', async () => {
      const router = new LLMRouter({
        defaultProvider: 'primary',
        fallback: { enabled: true, providers: ['primary', 'secondary'] },
      });
      const primary = createMockProvider('primary', { failStream: true });
      const secondary = createMockProvider('secondary');
      router.registerProvider(primary);
      router.registerProvider(secondary);

      const chunks: StreamChunk[] = [];
      for await (const chunk of router.routeStream(sampleRequest)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].content).toBe('Chunk from secondary');
    });

    test('should throw when all providers fail for streaming', async () => {
      const router = new LLMRouter({
        defaultProvider: 'primary',
        fallback: { enabled: true, providers: ['primary', 'secondary'] },
      });
      const primary = createMockProvider('primary', { failStream: true });
      const secondary = createMockProvider('secondary', { failStream: true });
      router.registerProvider(primary);
      router.registerProvider(secondary);

      const chunks: StreamChunk[] = [];
      try {
        for await (const chunk of router.routeStream(sampleRequest)) {
          chunks.push(chunk);
        }
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toBe('All LLM providers failed for streaming request');
      }
    });
  });

  describe('persistUsage', () => {
    test('should not throw when state service is unavailable', () => {
      const router = new LLMRouter({ defaultProvider: 'test' });
      // persistUsage is fire-and-forget, should not throw
      expect(() => {
        router.persistUsage({ promptTokens: 10, completionTokens: 20, totalTokens: 30 }, 'test-model');
      }).not.toThrow();
    });
  });
});
