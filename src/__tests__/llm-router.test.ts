/**
 * Tests for the LLM router support modules:
 *   - src/llm/model-aliases.ts  – resolveModelAlias, getAliases
 *   - src/llm/provider-registry.ts – detectProvider
 *   - src/llm/cost-calculator.ts  – calculateCost, getPricingData
 *
 * The LLMRouter constructor itself requires a fully populated config with valid
 * API keys and is therefore NOT exercised here. All tested functions are pure
 * (no I/O, no network) and execute synchronously.
 */

import { describe, it, expect } from 'bun:test';
import { resolveModelAlias, getAliases } from '../llm/model-aliases';
import { detectProvider } from '../llm/provider-registry';
import { calculateCost, getPricingData, type CostResult } from '../llm/cost-calculator';

// ---------------------------------------------------------------------------
// resolveModelAlias
// ---------------------------------------------------------------------------

describe('resolveModelAlias', () => {
  it('resolves "sonnet" alias to the full Claude Sonnet model ID', () => {
    const resolved = resolveModelAlias('sonnet');
    expect(resolved).toBe('claude-sonnet-4-20250514');
  });

  it('resolves "haiku" alias to the full Claude Haiku model ID', () => {
    const resolved = resolveModelAlias('haiku');
    expect(resolved).toBe('claude-haiku-4-20250514');
  });

  it('resolves "opus" alias to the full Claude Opus model ID', () => {
    expect(resolveModelAlias('opus')).toBe('claude-opus-4-20250514');
  });

  it('resolves "gpt4o" alias to "gpt-4o"', () => {
    expect(resolveModelAlias('gpt4o')).toBe('gpt-4o');
  });

  it('resolves "gemini" alias to the Gemini Flash model ID', () => {
    expect(resolveModelAlias('gemini')).toBe('gemini-2.0-flash-exp');
  });

  it('returns the original string when no alias match is found', () => {
    const unknown = 'some-unknown-model-id';
    expect(resolveModelAlias(unknown)).toBe(unknown);
  });

  it('resolves aliases case-insensitively', () => {
    expect(resolveModelAlias('SONNET')).toBe('claude-sonnet-4-20250514');
    expect(resolveModelAlias('Haiku')).toBe('claude-haiku-4-20250514');
  });

  it('resolves "claude" alias to the default Claude model', () => {
    expect(resolveModelAlias('claude')).toBe('claude-sonnet-4-20250514');
  });
});

// ---------------------------------------------------------------------------
// getAliases
// ---------------------------------------------------------------------------

describe('getAliases', () => {
  it('returns an object', () => {
    const aliases = getAliases();
    expect(typeof aliases).toBe('object');
    expect(aliases).not.toBeNull();
  });

  it('includes the expected shortcut keys', () => {
    const aliases = getAliases();
    expect('sonnet' in aliases).toBe(true);
    expect('haiku' in aliases).toBe(true);
    expect('opus' in aliases).toBe(true);
    expect('gpt4o' in aliases).toBe(true);
  });

  it('returns a copy so mutation does not affect subsequent calls', () => {
    const aliases = getAliases();
    (aliases as any)['__test__'] = 'should-not-persist';
    const aliases2 = getAliases();
    expect('__test__' in aliases2).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectProvider
// ---------------------------------------------------------------------------

describe('detectProvider', () => {
  it('detects anthropic for "claude-sonnet-4-20250514"', () => {
    expect(detectProvider('claude-sonnet-4-20250514')).toBe('anthropic');
  });

  it('detects openai for "gpt-4o"', () => {
    expect(detectProvider('gpt-4o')).toBe('openai');
  });

  it('detects google for "gemini-2.0-flash-exp"', () => {
    expect(detectProvider('gemini-2.0-flash-exp')).toBe('google');
  });

  it('detects ollama for "llama3.2"', () => {
    expect(detectProvider('llama3.2')).toBe('ollama');
  });

  it('detects ollama for "mistral"', () => {
    expect(detectProvider('mistral')).toBe('ollama');
  });

  it('resolves explicit provider prefix "groq/llama-3.1-70b"', () => {
    expect(detectProvider('groq/llama-3.1-70b')).toBe('groq');
  });

  it('resolves explicit provider prefix "openai/gpt-4o"', () => {
    expect(detectProvider('openai/gpt-4o')).toBe('openai');
  });

  it('falls back to openrouter for unknown "provider/model" prefix', () => {
    expect(detectProvider('unknown-provider/some-model')).toBe('openrouter');
  });

  it('defaults to anthropic for unrecognised bare model names', () => {
    expect(detectProvider('totally-unknown-model')).toBe('anthropic');
  });
});

// ---------------------------------------------------------------------------
// calculateCost
// ---------------------------------------------------------------------------

describe('calculateCost', () => {
  it('returns a CostResult with costUSD and breakdown fields', () => {
    const result: CostResult = calculateCost('anthropic', 'claude-sonnet-4-20250514', 1000, 1000);
    expect(typeof result.costUSD).toBe('number');
    expect(typeof result.breakdown.input).toBe('number');
    expect(typeof result.breakdown.output).toBe('number');
  });

  it('calculates correct cost for claude-sonnet-4-20250514 at 1K input + 1K output tokens', () => {
    // Pricing: $0.003 / 1K input, $0.015 / 1K output
    const result = calculateCost('anthropic', 'claude-sonnet-4-20250514', 1000, 1000);
    expect(result.breakdown.input).toBeCloseTo(0.003, 6);
    expect(result.breakdown.output).toBeCloseTo(0.015, 6);
    expect(result.costUSD).toBeCloseTo(0.018, 6);
  });

  it('calculates correct cost for gpt-4o at 2K input + 500 output tokens', () => {
    // Pricing: $0.005 / 1K input, $0.015 / 1K output
    const result = calculateCost('openai', 'gpt-4o', 2000, 500);
    expect(result.breakdown.input).toBeCloseTo(0.01, 6);
    expect(result.breakdown.output).toBeCloseTo(0.0075, 6);
    expect(result.costUSD).toBeCloseTo(0.0175, 6);
  });

  it('returns zero cost for ollama (local model)', () => {
    const result = calculateCost('ollama', 'llama3.2', 5000, 2000);
    expect(result.costUSD).toBe(0);
    expect(result.breakdown.input).toBe(0);
    expect(result.breakdown.output).toBe(0);
  });

  it('returns zero cost for an unknown provider', () => {
    const result = calculateCost('nonexistent-provider', 'some-model', 1000, 1000);
    expect(result.costUSD).toBe(0);
  });

  it('returns zero cost for a known provider but unknown model', () => {
    const result = calculateCost('openai', 'gpt-99-ultra-fake', 1000, 1000);
    expect(result.costUSD).toBe(0);
  });

  it('costUSD equals breakdown.input + breakdown.output', () => {
    const result = calculateCost('anthropic', 'claude-opus-4-20250514', 3000, 1500);
    expect(result.costUSD).toBeCloseTo(result.breakdown.input + result.breakdown.output, 10);
  });

  it('returns zero cost for zero tokens', () => {
    const result = calculateCost('anthropic', 'claude-sonnet-4-20250514', 0, 0);
    expect(result.costUSD).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getPricingData
// ---------------------------------------------------------------------------

describe('getPricingData', () => {
  it('returns an object with anthropic pricing', () => {
    const pricing = getPricingData();
    expect(typeof pricing).toBe('object');
    expect('anthropic' in pricing).toBe(true);
  });

  it('contains openai pricing', () => {
    expect('openai' in getPricingData()).toBe(true);
  });

  it('contains google pricing', () => {
    expect('google' in getPricingData()).toBe(true);
  });

  it('anthropic pricing for claude-sonnet-4-20250514 is a two-element array', () => {
    const pricing = getPricingData();
    const entry = pricing.anthropic['claude-sonnet-4-20250514'];
    expect(Array.isArray(entry)).toBe(true);
    expect(entry.length).toBe(2);
  });
});
