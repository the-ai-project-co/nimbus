/**
 * Tests for config schema gaps A1-A9
 *
 * Verifies that all nine gaps are correctly reflected in both the Zod schema
 * (schema.ts) and the CONFIG_KEYS registry (types.ts).
 */

import { describe, test, expect } from 'bun:test';
import {
  NimbusConfigSchema,
  LLMConfigSchema,
  CostOptimizationConfigSchema,
  PersonaConfigSchema,
  ProviderConfigSchema,
  FallbackConfigSchema,
} from '../../src/config/schema';
import { CONFIG_KEYS } from '../../src/config/types';

// ---------------------------------------------------------------------------
// A1 — telemetry field on NimbusConfig
// ---------------------------------------------------------------------------

describe('A1 — telemetry field', () => {
  test('schema accepts telemetry: true', () => {
    const result = NimbusConfigSchema.safeParse({ version: 1, telemetry: true });
    expect(result.success).toBe(true);
  });

  test('schema accepts telemetry: false', () => {
    const result = NimbusConfigSchema.safeParse({ version: 1, telemetry: false });
    expect(result.success).toBe(true);
  });

  test('schema rejects telemetry as a string', () => {
    const result = NimbusConfigSchema.safeParse({ version: 1, telemetry: 'yes' });
    expect(result.success).toBe(false);
  });

  test('schema rejects telemetry as a number', () => {
    const result = NimbusConfigSchema.safeParse({ version: 1, telemetry: 1 });
    expect(result.success).toBe(false);
  });

  test('CONFIG_KEYS includes "telemetry"', () => {
    const key = CONFIG_KEYS.find(k => k.key === 'telemetry');
    expect(key).toBeDefined();
    expect(key?.type).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// A2 — llm.default_provider
// ---------------------------------------------------------------------------

describe('A2 — llm.default_provider', () => {
  test('schema accepts llm.default_provider as a string', () => {
    const result = LLMConfigSchema.safeParse({ default_provider: 'anthropic' });
    expect(result.success).toBe(true);
  });

  test('schema rejects llm.default_provider as a number', () => {
    const result = LLMConfigSchema.safeParse({ default_provider: 42 });
    expect(result.success).toBe(false);
  });

  test('CONFIG_KEYS includes "llm.default_provider"', () => {
    const key = CONFIG_KEYS.find(k => k.key === 'llm.default_provider');
    expect(key).toBeDefined();
    expect(key?.type).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// A3/A4 — llm.providers map (ProviderConfig)
// ---------------------------------------------------------------------------

describe('A3/A4 — llm.providers map', () => {
  test('ProviderConfigSchema accepts api_key and models', () => {
    const result = ProviderConfigSchema.safeParse({
      api_key: 'sk-abc123',
      models: ['claude-3-opus', 'claude-3-sonnet'],
    });
    expect(result.success).toBe(true);
  });

  test('ProviderConfigSchema accepts partial object (only api_key)', () => {
    const result = ProviderConfigSchema.safeParse({ api_key: 'sk-xyz' });
    expect(result.success).toBe(true);
  });

  test('ProviderConfigSchema accepts empty object', () => {
    const result = ProviderConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test('ProviderConfigSchema rejects models as a non-array', () => {
    const result = ProviderConfigSchema.safeParse({ models: 'claude-3-opus' });
    expect(result.success).toBe(false);
  });

  test('LLMConfigSchema accepts providers as a record of ProviderConfig', () => {
    const result = LLMConfigSchema.safeParse({
      providers: {
        anthropic: { api_key: 'sk-ant-abc', models: ['claude-3-opus'] },
        openai: { api_key: 'sk-openai-xyz', models: ['gpt-4o'] },
      },
    });
    expect(result.success).toBe(true);
  });

  test('LLMConfigSchema rejects providers as a non-object', () => {
    const result = LLMConfigSchema.safeParse({ providers: 'anthropic' });
    expect(result.success).toBe(false);
  });

  test('LLMConfigSchema rejects providers as a plain number', () => {
    const result = LLMConfigSchema.safeParse({ providers: 99 });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A5/A6 — cost_optimization.use_cheap_model_for / use_expensive_model_for
// ---------------------------------------------------------------------------

describe('A5 — cost_optimization.use_cheap_model_for', () => {
  test('schema accepts use_cheap_model_for as an array of strings', () => {
    const result = CostOptimizationConfigSchema.safeParse({
      use_cheap_model_for: ['summarization', 'classification', 'chat'],
    });
    expect(result.success).toBe(true);
  });

  test('schema accepts empty use_cheap_model_for array', () => {
    const result = CostOptimizationConfigSchema.safeParse({ use_cheap_model_for: [] });
    expect(result.success).toBe(true);
  });

  test('schema rejects use_cheap_model_for as a string', () => {
    const result = CostOptimizationConfigSchema.safeParse({ use_cheap_model_for: 'summarization' });
    expect(result.success).toBe(false);
  });

  test('CONFIG_KEYS includes "llm.cost_optimization.use_cheap_model_for"', () => {
    const key = CONFIG_KEYS.find(k => k.key === 'llm.cost_optimization.use_cheap_model_for');
    expect(key).toBeDefined();
  });
});

describe('A6 — cost_optimization.use_expensive_model_for', () => {
  test('schema accepts use_expensive_model_for as an array of strings', () => {
    const result = CostOptimizationConfigSchema.safeParse({
      use_expensive_model_for: ['code_generation', 'reasoning', 'architecture'],
    });
    expect(result.success).toBe(true);
  });

  test('schema accepts empty use_expensive_model_for array', () => {
    const result = CostOptimizationConfigSchema.safeParse({ use_expensive_model_for: [] });
    expect(result.success).toBe(true);
  });

  test('schema rejects use_expensive_model_for as a boolean', () => {
    const result = CostOptimizationConfigSchema.safeParse({ use_expensive_model_for: true });
    expect(result.success).toBe(false);
  });

  test('CONFIG_KEYS includes "llm.cost_optimization.use_expensive_model_for"', () => {
    const key = CONFIG_KEYS.find(k => k.key === 'llm.cost_optimization.use_expensive_model_for');
    expect(key).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// A7/A8 — llm.fallback (FallbackConfig)
// ---------------------------------------------------------------------------

describe('A7/A8 — llm.fallback', () => {
  test('FallbackConfigSchema accepts enabled and providers', () => {
    const result = FallbackConfigSchema.safeParse({
      enabled: true,
      providers: ['openai', 'google'],
    });
    expect(result.success).toBe(true);
  });

  test('FallbackConfigSchema accepts only enabled', () => {
    const result = FallbackConfigSchema.safeParse({ enabled: false });
    expect(result.success).toBe(true);
  });

  test('FallbackConfigSchema accepts only providers', () => {
    const result = FallbackConfigSchema.safeParse({ providers: ['anthropic'] });
    expect(result.success).toBe(true);
  });

  test('FallbackConfigSchema accepts empty object', () => {
    const result = FallbackConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test('FallbackConfigSchema rejects providers as a string', () => {
    const result = FallbackConfigSchema.safeParse({ providers: 'openai' });
    expect(result.success).toBe(false);
  });

  test('FallbackConfigSchema rejects enabled as a string', () => {
    const result = FallbackConfigSchema.safeParse({ enabled: 'yes' });
    expect(result.success).toBe(false);
  });

  test('LLMConfigSchema accepts fallback object', () => {
    const result = LLMConfigSchema.safeParse({
      fallback: { enabled: true, providers: ['openai', 'google'] },
    });
    expect(result.success).toBe(true);
  });

  test('CONFIG_KEYS includes "llm.fallback.enabled"', () => {
    const key = CONFIG_KEYS.find(k => k.key === 'llm.fallback.enabled');
    expect(key).toBeDefined();
    expect(key?.type).toBe('boolean');
  });

  test('CONFIG_KEYS includes "llm.fallback.providers"', () => {
    const key = CONFIG_KEYS.find(k => k.key === 'llm.fallback.providers');
    expect(key).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// A9 — persona.mode includes 'custom'
// ---------------------------------------------------------------------------

describe('A9 — persona.mode = custom', () => {
  test("schema accepts mode: 'custom'", () => {
    const result = PersonaConfigSchema.safeParse({ mode: 'custom' });
    expect(result.success).toBe(true);
  });

  test("schema still accepts all original mode values", () => {
    const modes = ['professional', 'assistant', 'expert', 'standard', 'concise', 'detailed'] as const;
    for (const mode of modes) {
      const result = PersonaConfigSchema.safeParse({ mode });
      expect(result.success).toBe(true);
    }
  });

  test("schema rejects an unknown mode value", () => {
    const result = PersonaConfigSchema.safeParse({ mode: 'turbo' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Full round-trip: NimbusConfig with all new fields populated
// ---------------------------------------------------------------------------

describe('Full NimbusConfig round-trip with all new fields', () => {
  test('schema accepts a config object containing every new gap field', () => {
    const result = NimbusConfigSchema.safeParse({
      version: 1,
      telemetry: true,
      llm: {
        default_provider: 'anthropic',
        providers: {
          anthropic: { api_key: 'sk-ant-abc', models: ['claude-3-opus'] },
        },
        fallback: { enabled: true, providers: ['openai'] },
        cost_optimization: {
          enabled: true,
          cheap_model: 'claude-haiku',
          expensive_model: 'claude-opus',
          use_cheap_model_for: ['summarization'],
          use_expensive_model_for: ['code_generation'],
        },
      },
      persona: { mode: 'custom', custom: 'You are a terse DevOps expert.' },
    });
    expect(result.success).toBe(true);
  });
});
