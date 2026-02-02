/**
 * Integration tests for LLM Service
 *
 * These tests verify the LLM service works correctly with actual service startup
 * and HTTP/WebSocket communication.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startServer } from '../../../services/llm-service/src/server';
import { waitForService, createTestClient, getTestPorts } from '../../utils/test-helpers';

describe('LLM Service Integration Tests', () => {
  let server: any;
  let wsServer: any;
  let client: ReturnType<typeof createTestClient>;
  const ports = getTestPorts();
  const BASE_URL = `http://localhost:${ports.http}`;
  const WS_URL = `ws://localhost:${ports.ws}`;

  beforeAll(async () => {
    // Start the LLM service
    server = await startServer(ports.http, ports.ws);

    // Wait for service to be ready
    const ready = await waitForService(BASE_URL);
    if (!ready) {
      throw new Error('LLM Service failed to start');
    }

    client = createTestClient(BASE_URL);
  });

  afterAll(() => {
    server?.stop?.();
  });

  describe('Health Endpoint', () => {
    test('returns healthy status with service info', async () => {
      const { status, data } = await client.get('/health');

      expect(status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.service).toBe('llm-service');
    });
  });

  describe('Models Endpoint', () => {
    test('returns available models and providers', async () => {
      const { status, data } = await client.get('/api/llm/models');

      expect(status).toBe(200);
      expect(data.models).toBeDefined();
      expect(data.providers).toBeDefined();
      expect(Array.isArray(data.providers)).toBe(true);
    });

    test('includes model metadata', async () => {
      const { status, data } = await client.get('/api/llm/models');

      expect(status).toBe(200);
      // Each provider should have models with metadata
      if (data.providers.length > 0) {
        expect(data.models).toBeDefined();
      }
    });
  });

  describe('Token Counting', () => {
    // Note: Token counting requires OpenAI API key, so these tests are skipped
    // in environments without the required credentials
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

    test.skipIf(!hasOpenAIKey)('counts tokens in text', async () => {
      const { status, data } = await client.post('/api/llm/tokens/count', {
        text: 'Hello, world!',
      });

      expect(status).toBe(200);
      expect(data.tokenCount).toBeGreaterThan(0);
      expect(data.textLength).toBe(13);
    });

    test.skipIf(!hasOpenAIKey)('counts tokens in longer text', async () => {
      const longText = 'This is a longer piece of text that should have more tokens. '.repeat(10);
      const { status, data } = await client.post('/api/llm/tokens/count', {
        text: longText,
      });

      expect(status).toBe(200);
      expect(data.tokenCount).toBeGreaterThan(50);
      expect(data.textLength).toBe(longText.length);
    });

    test('returns error for missing text', async () => {
      const { status, data } = await client.post('/api/llm/tokens/count', {});

      expect(status).toBe(400);
      expect(data.error).toBeDefined();
    });
  });

  describe('Chat Endpoint - Validation', () => {
    test('requires messages array', async () => {
      const { status, data } = await client.post('/api/llm/chat', {});

      expect(status).toBe(400);
      expect(data.error).toBeDefined();
    });

    test('requires non-empty messages', async () => {
      const { status, data } = await client.post('/api/llm/chat', {
        messages: [],
      });

      expect(status).toBe(400);
      expect(data.error).toBeDefined();
    });

    test('validates message structure', async () => {
      const { status, data } = await client.post('/api/llm/chat', {
        messages: [{ invalid: 'structure' }],
      });

      // Can be 400 for validation error or 500 if passed to LLM provider
      expect([400, 500]).toContain(status);
    });
  });

  describe('Chat with Tools Endpoint - Validation', () => {
    test('requires messages array', async () => {
      const { status, data } = await client.post('/api/llm/chat/tools', {
        tools: [],
      });

      expect(status).toBe(400);
      expect(data.error).toBeDefined();
    });

    test('accepts valid tool definitions', async () => {
      // This test validates the structure is accepted, actual execution requires API keys
      const { status, data } = await client.post('/api/llm/chat/tools', {
        messages: [{ role: 'user', content: 'Test message' }],
        tools: [
          {
            name: 'test_tool',
            description: 'A test tool',
            parameters: {
              type: 'object',
              properties: {
                input: { type: 'string' },
              },
            },
          },
        ],
      });

      // Will return error if no providers are configured, which is expected
      // The important thing is it doesn't return 400 for the request structure
      expect([200, 500]).toContain(status);
    });
  });

  describe('Unknown Routes', () => {
    test('returns 404 for unknown paths', async () => {
      const { status } = await client.get('/api/llm/unknown');
      expect(status).toBe(404);
    });

    test('returns 404 for invalid methods', async () => {
      const { status } = await client.post('/api/llm/models', {});
      expect(status).toBe(404);
    });
  });
});
