/**
 * streamWithTools() Tests
 *
 * Validates the streamWithTools() method added to three LLM providers:
 *   - OllamaProvider       (src/llm/providers/ollama.ts)
 *   - OpenRouterProvider    (src/llm/providers/openrouter.ts)
 *   - OpenAICompatibleProvider (src/llm/providers/openai-compatible.ts)
 *
 * Each provider is tested for:
 *   1. Text-only streaming (yields text chunks then a final done chunk)
 *   2. Tool call streaming (yields tool calls in the final chunk)
 *   3. Fallback behavior (when streaming fails, falls back gracefully)
 *
 * All tests use mocks -- no real API calls are made.
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';
import type { ToolCompletionRequest, StreamChunk } from '../llm/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect all chunks from an async generator into an array. */
async function collectChunks(gen: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of gen) {
    chunks.push(chunk);
  }
  return chunks;
}

/** Minimal ToolCompletionRequest used across all tests. */
function makeRequest(overrides?: Partial<ToolCompletionRequest>): ToolCompletionRequest {
  return {
    messages: [{ role: 'user', content: 'List files in the current directory' }],
    tools: [
      {
        type: 'function',
        function: {
          name: 'bash',
          description: 'Run a bash command',
          parameters: {
            type: 'object',
            properties: {
              command: { type: 'string', description: 'The command to run' },
            },
            required: ['command'],
          },
        },
      },
    ],
    ...overrides,
  };
}

/**
 * Build a ReadableStream from an array of raw strings.
 * Each string becomes one chunk the reader yields.
 */
function buildReadableStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < lines.length) {
        controller.enqueue(encoder.encode(lines[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

/**
 * Create a mock async iterable (simulating the OpenAI SDK stream object).
 * Accepts an array of chunk objects and yields them in order.
 */
function createMockOpenAIStream(
  chunks: Array<{
    choices: Array<{
      delta: { content?: string; tool_calls?: any[] };
      finish_reason: string | null;
    }>;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  }>
) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

// ===========================================================================
// OllamaProvider
// ===========================================================================

describe('OllamaProvider.streamWithTools', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  // Restore fetch after each test to avoid leaking mocks
  function restoreFetch() {
    globalThis.fetch = originalFetch;
  }

  test('text-only streaming yields text chunks then a done chunk', async () => {
    // Mock the fetch for /v1/chat/completions (native tool streaming endpoint)
    const sseLines = [
      'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
      'data: [DONE]\n\n',
    ];

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(buildReadableStream(sseLines), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      )
    ) as any;

    try {
      const { OllamaProvider } = await import('../llm/providers/ollama');
      const provider = new OllamaProvider('http://localhost:11434');
      const chunks = await collectChunks(provider.streamWithTools(makeRequest()));

      // Should have text chunks followed by a done chunk
      const textChunks = chunks.filter(c => c.content && !c.done);
      const doneChunks = chunks.filter(c => c.done);

      expect(textChunks.length).toBe(2);
      expect(textChunks[0].content).toBe('Hello');
      expect(textChunks[1].content).toBe(' world');

      expect(doneChunks.length).toBe(1);
      expect(doneChunks[0].done).toBe(true);
      expect(doneChunks[0].toolCalls).toBeUndefined();

      // Usage should be present on the final chunk
      expect(doneChunks[0].usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
    } finally {
      restoreFetch();
    }
  });

  test('tool call streaming accumulates tool calls and yields them on the done chunk', async () => {
    const sseLines = [
      // First chunk: tool call header
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc123","function":{"name":"bash","arguments":""}}]},"finish_reason":null}]}\n\n',
      // Second chunk: tool call arguments (streamed incrementally)
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"command\\""}}]},"finish_reason":null}]}\n\n',
      // Third chunk: remaining arguments
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"ls -la\\"}"}}]},"finish_reason":null}]}\n\n',
      // Final chunk with finish_reason
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(buildReadableStream(sseLines), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      )
    ) as any;

    try {
      const { OllamaProvider } = await import('../llm/providers/ollama');
      const provider = new OllamaProvider('http://localhost:11434');
      const chunks = await collectChunks(provider.streamWithTools(makeRequest()));

      const doneChunk = chunks.find(c => c.done);
      expect(doneChunk).toBeDefined();
      expect(doneChunk!.toolCalls).toBeDefined();
      expect(doneChunk!.toolCalls!.length).toBe(1);

      const tc = doneChunk!.toolCalls![0];
      expect(tc.id).toBe('call_abc123');
      expect(tc.type).toBe('function');
      expect(tc.function.name).toBe('bash');
      expect(tc.function.arguments).toBe('{"command":"ls -la"}');
    } finally {
      restoreFetch();
    }
  });

  test('fallback: when native streaming fails, falls back to completeWithTools', async () => {
    let _callCount = 0;

    globalThis.fetch = mock((url: string | URL | Request) => {
      _callCount++;
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

      // First call: /v1/chat/completions (native streaming) -- fail
      if (urlStr.includes('/v1/chat/completions')) {
        return Promise.resolve(new Response('Not found', { status: 404 }));
      }

      // Second call: /api/chat (native tool calling attempt) -- return tool call
      if (urlStr.includes('/api/chat')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              message: {
                content: '',
                tool_calls: [
                  {
                    function: {
                      name: 'bash',
                      arguments: { command: 'ls -la' },
                    },
                  },
                ],
              },
              model: 'llama3.2',
              prompt_eval_count: 20,
              eval_count: 10,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }

      return Promise.reject(new Error(`Unexpected fetch to ${urlStr}`));
    }) as any;

    try {
      const { OllamaProvider } = await import('../llm/providers/ollama');
      const provider = new OllamaProvider('http://localhost:11434');
      const chunks = await collectChunks(provider.streamWithTools(makeRequest()));

      // Fallback should yield a final done chunk with tool calls
      const doneChunk = chunks.find(c => c.done);
      expect(doneChunk).toBeDefined();
      expect(doneChunk!.toolCalls).toBeDefined();
      expect(doneChunk!.toolCalls!.length).toBe(1);
      expect(doneChunk!.toolCalls![0].function.name).toBe('bash');
    } finally {
      restoreFetch();
    }
  });

  test('multiple tool calls are accumulated correctly', async () => {
    const sseLines = [
      // Two tool calls starting in the same delta
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"bash","arguments":""}},{"index":1,"id":"call_2","function":{"name":"bash","arguments":""}}]},"finish_reason":null}]}\n\n',
      // Arguments for first tool call
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"command\\":\\"ls\\"}"}}]},"finish_reason":null}]}\n\n',
      // Arguments for second tool call
      'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"arguments":"{\\"command\\":\\"pwd\\"}"}}]},"finish_reason":null}]}\n\n',
      // Done
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(buildReadableStream(sseLines), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      )
    ) as any;

    try {
      const { OllamaProvider } = await import('../llm/providers/ollama');
      const provider = new OllamaProvider('http://localhost:11434');
      const chunks = await collectChunks(provider.streamWithTools(makeRequest()));

      const doneChunk = chunks.find(c => c.done);
      expect(doneChunk).toBeDefined();
      expect(doneChunk!.toolCalls).toBeDefined();
      expect(doneChunk!.toolCalls!.length).toBe(2);
      expect(doneChunk!.toolCalls![0].function.name).toBe('bash');
      expect(doneChunk!.toolCalls![0].function.arguments).toBe('{"command":"ls"}');
      expect(doneChunk!.toolCalls![1].function.name).toBe('bash');
      expect(doneChunk!.toolCalls![1].function.arguments).toBe('{"command":"pwd"}');
    } finally {
      restoreFetch();
    }
  });
});

// ===========================================================================
// OpenRouterProvider
// ===========================================================================

describe('OpenRouterProvider.streamWithTools', () => {
  test('text-only streaming yields text chunks then a done chunk', async () => {
    const streamChunks = createMockOpenAIStream([
      { choices: [{ delta: { content: 'Here is' }, finish_reason: null }] },
      { choices: [{ delta: { content: ' the answer' }, finish_reason: null }] },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
      },
    ]);

    const mockCreate = mock(() => Promise.resolve(streamChunks));

    const { OpenRouterProvider } = await import('../llm/providers/openrouter');
    const provider = new OpenRouterProvider('test-api-key');

    // Replace the client's create method with our mock
    (provider as any).client = {
      chat: { completions: { create: mockCreate } },
    };

    const chunks = await collectChunks(provider.streamWithTools(makeRequest()));

    // Verify text chunks
    const textChunks = chunks.filter(c => c.content && !c.done);
    expect(textChunks.length).toBe(2);
    expect(textChunks[0].content).toBe('Here is');
    expect(textChunks[1].content).toBe(' the answer');

    // Verify done chunk
    const doneChunk = chunks.find(c => c.done);
    expect(doneChunk).toBeDefined();
    expect(doneChunk!.done).toBe(true);
    expect(doneChunk!.toolCalls).toBeUndefined();

    // Verify usage
    expect(doneChunk!.usage).toEqual({
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
    });

    // Verify the create call was made with stream: true and tools
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const createArg = (mockCreate.mock.calls[0] as unknown[])[0] as any;
    expect(createArg.stream).toBe(true);
    expect(createArg.tools).toBeDefined();
    expect(createArg.tools.length).toBe(1);
    expect(createArg.tools[0].function.name).toBe('bash');
    expect(createArg.stream_options).toEqual({ include_usage: true });
  });

  test('tool call streaming accumulates tool calls and yields them on the done chunk', async () => {
    const streamChunks = createMockOpenAIStream([
      // Tool call header
      {
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, id: 'call_xyz', function: { name: 'bash', arguments: '' } }],
            },
            finish_reason: null,
          },
        ],
      },
      // Streamed arguments
      {
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { arguments: '{"command"' } }],
            },
            finish_reason: null,
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { arguments: ':"ls -la"}' } }],
            },
            finish_reason: null,
          },
        ],
      },
      // Finish with tool_calls reason
      {
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
      },
    ]);

    const mockCreate = mock(() => Promise.resolve(streamChunks));

    const { OpenRouterProvider } = await import('../llm/providers/openrouter');
    const provider = new OpenRouterProvider('test-api-key');
    (provider as any).client = {
      chat: { completions: { create: mockCreate } },
    };

    const chunks = await collectChunks(provider.streamWithTools(makeRequest()));

    const doneChunk = chunks.find(c => c.done);
    expect(doneChunk).toBeDefined();
    expect(doneChunk!.toolCalls).toBeDefined();
    expect(doneChunk!.toolCalls!.length).toBe(1);

    const tc = doneChunk!.toolCalls![0];
    expect(tc.id).toBe('call_xyz');
    expect(tc.type).toBe('function');
    expect(tc.function.name).toBe('bash');
    expect(tc.function.arguments).toBe('{"command":"ls -la"}');
  });

  test('fallback: when SDK stream creation throws, the generator yields nothing', async () => {
    const mockCreate = mock(() => Promise.reject(new Error('API unavailable')));

    const { OpenRouterProvider } = await import('../llm/providers/openrouter');
    const provider = new OpenRouterProvider('test-api-key');
    (provider as any).client = {
      chat: { completions: { create: mockCreate } },
    };

    // The method is an async generator that will throw when it tries to create
    // the stream. The error propagates to the caller.
    try {
      await collectChunks(provider.streamWithTools(makeRequest()));
      // If we get here, it means no error was thrown (unexpected)
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toBe('API unavailable');
    }
  });

  test('mixed content and tool calls are handled correctly', async () => {
    const streamChunks = createMockOpenAIStream([
      // Some text content first
      { choices: [{ delta: { content: 'Let me run that' }, finish_reason: null }] },
      // Then a tool call
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_mix',
                  function: { name: 'bash', arguments: '{"command":"ls"}' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      // Done
      {
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      },
    ]);

    const mockCreate = mock(() => Promise.resolve(streamChunks));

    const { OpenRouterProvider } = await import('../llm/providers/openrouter');
    const provider = new OpenRouterProvider('test-api-key');
    (provider as any).client = {
      chat: { completions: { create: mockCreate } },
    };

    const chunks = await collectChunks(provider.streamWithTools(makeRequest()));

    // Text chunk
    const textChunks = chunks.filter(c => c.content && !c.done);
    expect(textChunks.length).toBe(1);
    expect(textChunks[0].content).toBe('Let me run that');

    // Done chunk with tool calls
    const doneChunk = chunks.find(c => c.done);
    expect(doneChunk).toBeDefined();
    expect(doneChunk!.toolCalls).toBeDefined();
    expect(doneChunk!.toolCalls![0].function.name).toBe('bash');
    expect(doneChunk!.usage).toEqual({
      promptTokens: 5,
      completionTokens: 3,
      totalTokens: 8,
    });
  });
});

// ===========================================================================
// OpenAICompatibleProvider
// ===========================================================================

describe('OpenAICompatibleProvider.streamWithTools', () => {
  function createProvider() {
    // Dynamic import to avoid module-level side effects
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { OpenAICompatibleProvider } = require('../llm/providers/openai-compatible');
    return new OpenAICompatibleProvider({
      name: 'test-compat',
      apiKey: 'test-key',
      baseURL: 'https://api.test.com/v1',
      defaultModel: 'test-model',
    });
  }

  test('text-only streaming yields text chunks then a done chunk', async () => {
    const streamChunks = createMockOpenAIStream([
      { choices: [{ delta: { content: 'Response' }, finish_reason: null }] },
      { choices: [{ delta: { content: ' text' }, finish_reason: null }] },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
      },
    ]);

    const mockCreate = mock(() => Promise.resolve(streamChunks));

    const provider = createProvider();
    (provider as any).client = {
      chat: { completions: { create: mockCreate } },
    };

    const chunks = await collectChunks(provider.streamWithTools(makeRequest()));

    // Text chunks
    const textChunks = chunks.filter(c => c.content && !c.done);
    expect(textChunks.length).toBe(2);
    expect(textChunks[0].content).toBe('Response');
    expect(textChunks[1].content).toBe(' text');

    // Done chunk
    const doneChunk = chunks.find(c => c.done);
    expect(doneChunk).toBeDefined();
    expect(doneChunk!.done).toBe(true);
    expect(doneChunk!.toolCalls).toBeUndefined();
    expect(doneChunk!.usage).toEqual({
      promptTokens: 8,
      completionTokens: 4,
      totalTokens: 12,
    });

    // Verify stream options
    const createArg = (mockCreate.mock.calls[0] as unknown[])[0] as any;
    expect(createArg.stream).toBe(true);
    expect(createArg.stream_options).toEqual({ include_usage: true });
  });

  test('tool call streaming accumulates tool calls and yields them on the done chunk', async () => {
    const streamChunks = createMockOpenAIStream([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'call_compat1', function: { name: 'bash', arguments: '' } },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { arguments: '{"command":"pwd"}' } }],
            },
            finish_reason: null,
          },
        ],
      },
      {
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
      },
    ]);

    const mockCreate = mock(() => Promise.resolve(streamChunks));

    const provider = createProvider();
    (provider as any).client = {
      chat: { completions: { create: mockCreate } },
    };

    const chunks = await collectChunks(provider.streamWithTools(makeRequest()));

    const doneChunk = chunks.find(c => c.done);
    expect(doneChunk).toBeDefined();
    expect(doneChunk!.toolCalls).toBeDefined();
    expect(doneChunk!.toolCalls!.length).toBe(1);

    const tc = doneChunk!.toolCalls![0];
    expect(tc.id).toBe('call_compat1');
    expect(tc.type).toBe('function');
    expect(tc.function.name).toBe('bash');
    expect(tc.function.arguments).toBe('{"command":"pwd"}');
  });

  test('fallback: when SDK stream creation throws, the error propagates', async () => {
    const mockCreate = mock(() => Promise.reject(new Error('Provider down')));

    const provider = createProvider();
    (provider as any).client = {
      chat: { completions: { create: mockCreate } },
    };

    try {
      await collectChunks(provider.streamWithTools(makeRequest()));
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toBe('Provider down');
    }
  });

  test('multiple tool calls across different indices are accumulated', async () => {
    const streamChunks = createMockOpenAIStream([
      // Two tool calls in separate chunks
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_a',
                  function: { name: 'bash', arguments: '{"command":"ls"}' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 1,
                  id: 'call_b',
                  function: { name: 'bash', arguments: '{"command":"cat file.txt"}' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
      },
    ]);

    const mockCreate = mock(() => Promise.resolve(streamChunks));

    const provider = createProvider();
    (provider as any).client = {
      chat: { completions: { create: mockCreate } },
    };

    const chunks = await collectChunks(provider.streamWithTools(makeRequest()));

    const doneChunk = chunks.find(c => c.done);
    expect(doneChunk).toBeDefined();
    expect(doneChunk!.toolCalls).toBeDefined();
    expect(doneChunk!.toolCalls!.length).toBe(2);
    expect(doneChunk!.toolCalls![0].id).toBe('call_a');
    expect(doneChunk!.toolCalls![0].function.arguments).toBe('{"command":"ls"}');
    expect(doneChunk!.toolCalls![1].id).toBe('call_b');
    expect(doneChunk!.toolCalls![1].function.arguments).toBe('{"command":"cat file.txt"}');
  });

  test('usage from a mid-stream chunk is captured on the done chunk', async () => {
    const streamChunks = createMockOpenAIStream([
      { choices: [{ delta: { content: 'ok' }, finish_reason: null }] },
      {
        choices: [{ delta: {}, finish_reason: null }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
      },
    ]);

    const mockCreate = mock(() => Promise.resolve(streamChunks));

    const provider = createProvider();
    (provider as any).client = {
      chat: { completions: { create: mockCreate } },
    };

    const chunks = await collectChunks(provider.streamWithTools(makeRequest()));

    const doneChunk = chunks.find(c => c.done);
    expect(doneChunk).toBeDefined();
    expect(doneChunk!.usage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
  });

  test('tool_choice is forwarded to the API call', async () => {
    const streamChunks = createMockOpenAIStream([
      { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
    ]);

    const mockCreate = mock(() => Promise.resolve(streamChunks));

    const provider = createProvider();
    (provider as any).client = {
      chat: { completions: { create: mockCreate } },
    };

    const request = makeRequest({
      toolChoice: { type: 'function', function: { name: 'bash' } },
      temperature: 0.5,
      maxTokens: 1024,
    });

    await collectChunks(provider.streamWithTools(request));

    const createArg = (mockCreate.mock.calls[0] as unknown[])[0] as any;
    expect(createArg.tool_choice).toEqual({ type: 'function', function: { name: 'bash' } });
    expect(createArg.temperature).toBe(0.5);
    expect(createArg.max_tokens).toBe(1024);
  });
});
