import { describe, test, expect } from 'bun:test';
import { ProviderConfigSchema, NimbusConfigSchema } from '../../src/config/schema';

describe('ProviderConfig base_url', () => {
  test('accepts valid base_url', () => {
    const result = ProviderConfigSchema.safeParse({
      api_key: 'sk-test',
      base_url: 'https://custom-api.example.com/v1',
      models: ['gpt-4'],
    });
    expect(result.success).toBe(true);
  });

  test('accepts config without base_url', () => {
    const result = ProviderConfigSchema.safeParse({
      api_key: 'sk-test',
    });
    expect(result.success).toBe(true);
  });

  test('rejects invalid base_url (not a URL)', () => {
    const result = ProviderConfigSchema.safeParse({
      api_key: 'sk-test',
      base_url: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  test('full config with provider base_url validates', () => {
    const result = NimbusConfigSchema.safeParse({
      version: 1,
      llm: {
        providers: {
          openai: {
            api_key: 'sk-test',
            base_url: 'https://api.openai.com/v1',
            models: ['gpt-4o'],
          },
          ollama: {
            base_url: 'http://localhost:11434',
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  test('empty provider config validates', () => {
    const result = ProviderConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
