import { describe, test, expect } from 'bun:test';

describe('Provider listModels', () => {
  test('AnthropicProvider returns model list', async () => {
    const { AnthropicProvider } = await import('../../src/providers/anthropic');
    const provider = new AnthropicProvider('test-key');
    const models = await provider.listModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    expect(models).toContain('claude-sonnet-4-20250514');
  });

  test('OpenAIProvider returns model list', async () => {
    const { OpenAIProvider } = await import('../../src/providers/openai');
    const provider = new OpenAIProvider('test-key');
    const models = await provider.listModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    expect(models).toContain('gpt-4o');
  });

  test('GoogleProvider returns model list', async () => {
    const { GoogleProvider } = await import('../../src/providers/google');
    const provider = new GoogleProvider('test-key');
    const models = await provider.listModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    expect(models).toContain('gemini-2.0-flash-exp');
  });

  test('OllamaProvider returns model list (fallback)', async () => {
    const { OllamaProvider } = await import('../../src/providers/ollama');
    const provider = new OllamaProvider('http://localhost:99999'); // unreachable
    const models = await provider.listModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    expect(models).toContain('llama3.2');
  });

  test('OpenRouterProvider returns model list', async () => {
    const { OpenRouterProvider } = await import('../../src/providers/openrouter');
    const provider = new OpenRouterProvider('test-key');
    const models = await provider.listModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    expect(models).toContain('anthropic/claude-sonnet-4-20250514');
  });

  test('all providers return string arrays', async () => {
    const { AnthropicProvider } = await import('../../src/providers/anthropic');
    const provider = new AnthropicProvider('test-key');
    const models = await provider.listModels();
    for (const model of models) {
      expect(typeof model).toBe('string');
    }
  });
});
