import { describe, test, expect, mock, beforeEach } from 'bun:test';

describe('Provider Token Counting', () => {
  describe('AnthropicProvider', () => {
    test('uses count_tokens API when available', async () => {
      // Mock the Anthropic client
      const mockCountTokens = mock(() => Promise.resolve({ input_tokens: 42 }));
      const mockClient = {
        messages: {
          create: mock(() => Promise.resolve({})),
          count_tokens: mockCountTokens,
        },
      };

      // Import and create provider
      const { AnthropicProvider } = await import('../../src/providers/anthropic');
      const provider = new AnthropicProvider('test-key');
      // Inject mock client
      (provider as any).client = mockClient;

      const count = await provider.countTokens('Hello world, this is a test.');
      expect(count).toBe(42);
      expect(mockCountTokens).toHaveBeenCalled();
    });

    test('falls back to approximation on API error', async () => {
      const mockCountTokens = mock(() => Promise.reject(new Error('API error')));
      const mockClient = {
        messages: {
          create: mock(() => Promise.resolve({})),
          count_tokens: mockCountTokens,
        },
      };

      const { AnthropicProvider } = await import('../../src/providers/anthropic');
      const provider = new AnthropicProvider('test-key');
      (provider as any).client = mockClient;

      const text = 'Hello world';
      const count = await provider.countTokens(text);
      // Fallback: Math.ceil(text.length / 4)
      expect(count).toBe(Math.ceil(text.length / 4));
    });
  });

  describe('GoogleProvider', () => {
    test('uses model.countTokens API when available', async () => {
      const mockCountTokens = mock(() => Promise.resolve({ totalTokens: 15 }));
      const mockGetModel = mock(() => ({
        countTokens: mockCountTokens,
        generateContent: mock(() => Promise.resolve({})),
      }));

      const { GoogleProvider } = await import('../../src/providers/google');
      const provider = new GoogleProvider('test-key');
      // Inject mock getModel
      (provider as any).getModel = mockGetModel;

      const count = await provider.countTokens('Test text for Google');
      expect(count).toBe(15);
    });

    test('falls back to approximation on API error', async () => {
      const mockGetModel = mock(() => ({
        countTokens: mock(() => Promise.reject(new Error('API error'))),
      }));

      const { GoogleProvider } = await import('../../src/providers/google');
      const provider = new GoogleProvider('test-key');
      (provider as any).getModel = mockGetModel;

      const text = 'Hello world test';
      const count = await provider.countTokens(text);
      expect(count).toBe(Math.ceil(text.length / 4));
    });
  });

  describe('OllamaProvider', () => {
    test('uses gpt-tokenizer for counting', async () => {
      const { OllamaProvider } = await import('../../src/providers/ollama');
      const provider = new OllamaProvider('http://localhost:11434');

      // gpt-tokenizer should be available and return a reasonable count
      const text = 'Hello world, this is a test of token counting.';
      const count = await provider.countTokens(text);
      // gpt-tokenizer should give a more accurate count than length/4
      expect(count).toBeGreaterThan(0);
      expect(typeof count).toBe('number');
    });

    test('returns consistent counts for same input', async () => {
      const { OllamaProvider } = await import('../../src/providers/ollama');
      const provider = new OllamaProvider('http://localhost:11434');

      const text = 'Consistent token counting test';
      const count1 = await provider.countTokens(text);
      const count2 = await provider.countTokens(text);
      expect(count1).toBe(count2);
    });
  });

  describe('Fallback behavior', () => {
    test('all providers handle empty string', async () => {
      const { AnthropicProvider } = await import('../../src/providers/anthropic');
      const anthropic = new AnthropicProvider('test-key');
      // Force fallback by injecting broken client
      (anthropic as any).client = { messages: { count_tokens: () => Promise.reject(new Error('fail')) } };
      const aCount = await anthropic.countTokens('');
      expect(aCount).toBe(0);

      const { OllamaProvider } = await import('../../src/providers/ollama');
      const ollama = new OllamaProvider('http://localhost:11434');
      const oCount = await ollama.countTokens('');
      expect(oCount).toBe(0);
    });

    test('all providers handle very long text', async () => {
      const longText = 'word '.repeat(10000);

      const { OllamaProvider } = await import('../../src/providers/ollama');
      const ollama = new OllamaProvider('http://localhost:11434');
      const count = await ollama.countTokens(longText);
      expect(count).toBeGreaterThan(100);
    });
  });
});
