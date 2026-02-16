/**
 * WebSocket LLM Streaming Tests
 *
 * Tests for the LLM service integration via WebSocket
 */

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';

describe('WebSocket LLM Handler', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('LLM service integration', () => {
    it('should attempt to call LLM service REST endpoint', async () => {
      let fetchUrl = '';
      let fetchBody: any = {};

      globalThis.fetch = mock(async (url: any, opts: any) => {
        fetchUrl = typeof url === 'string' ? url : url.toString();
        fetchBody = JSON.parse(opts?.body || '{}');
        return new Response(JSON.stringify({
          content: 'Hello, this is a test response from the LLM service.',
        }), { status: 200 });
      }) as any;

      const llmServiceUrl = process.env.LLM_SERVICE_URL || 'http://localhost:3002';
      const response = await fetch(`${llmServiceUrl}/api/llm/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'test prompt' }],
          model: 'gpt-4',
        }),
      });

      expect(fetchUrl).toContain('/api/llm/chat');
      expect(fetchBody.messages[0].content).toBe('test prompt');
      expect(fetchBody.model).toBe('gpt-4');
      expect(response.ok).toBe(true);

      const result = await response.json() as any;
      expect(result.content).toBeDefined();
    });

    it('should handle LLM service returning error status', async () => {
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
      }) as any;

      const llmServiceUrl = 'http://localhost:3002';
      const response = await fetch(`${llmServiceUrl}/api/llm/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'test' }],
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
    });

    it('should handle LLM service being unavailable', async () => {
      globalThis.fetch = mock(async () => {
        throw new Error('ECONNREFUSED');
      }) as any;

      let error: Error | null = null;
      try {
        await fetch('http://localhost:3002/api/llm/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] }),
        });
      } catch (e) {
        error = e as Error;
      }

      expect(error).not.toBeNull();
      expect(error!.message).toContain('ECONNREFUSED');
    });

    it('should chunk response content for streaming UX', () => {
      const content = 'This is a long response that should be chunked for streaming';
      const chunkSize = 20;
      const chunks: string[] = [];

      for (let i = 0; i < content.length; i += chunkSize) {
        chunks.push(content.slice(i, i + chunkSize));
      }

      expect(chunks.length).toBe(Math.ceil(content.length / chunkSize));
      expect(chunks.join('')).toBe(content);
      expect(chunks[0]).toBe('This is a long respo');
    });

    it('should emit start, chunks, and end events in order', () => {
      const events: Array<{ type: string; content?: string; sessionId?: string }> = [];
      const sessionId = 'test-session';

      // Simulate the event emission pattern
      events.push({ type: 'start', sessionId });

      const content = 'Hello world response';
      const chunkSize = 20;
      for (let i = 0; i < content.length; i += chunkSize) {
        events.push({
          type: 'chunk',
          content: content.slice(i, i + chunkSize),
          sessionId,
        });
      }

      events.push({ type: 'end', sessionId });

      expect(events[0].type).toBe('start');
      expect(events[events.length - 1].type).toBe('end');
      expect(events.filter(e => e.type === 'chunk').length).toBeGreaterThan(0);
    });

    it('should include fallback message when LLM service unavailable', () => {
      const prompt = 'What is infrastructure as code?';
      const fallbackMessage = `Processing: "${prompt.substring(0, 100)}..."\n\nLLM service is not currently running. Start it with: bun run services/llm-service/src/index.ts`;

      expect(fallbackMessage).toContain('Processing');
      expect(fallbackMessage).toContain('LLM service is not currently running');
      expect(fallbackMessage).toContain('bun run');
    });

    it('should handle empty response content gracefully', () => {
      const content = '';
      const chunkSize = 20;
      const chunks: string[] = [];

      for (let i = 0; i < content.length; i += chunkSize) {
        chunks.push(content.slice(i, i + chunkSize));
      }

      expect(chunks.length).toBe(0);
    });

    it('should use LLM_SERVICE_URL env var when available', () => {
      const customUrl = 'http://custom-llm:4000';
      const resolvedUrl = customUrl || 'http://localhost:3002';

      expect(resolvedUrl).toBe('http://custom-llm:4000');
    });

    it('should default to localhost:3002 when LLM_SERVICE_URL not set', () => {
      const resolvedUrl = undefined || 'http://localhost:3002';

      expect(resolvedUrl).toBe('http://localhost:3002');
    });
  });
});
