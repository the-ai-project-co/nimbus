import { describe, expect, test, beforeEach } from 'bun:test';
import { ProviderCircuitBreaker } from '../llm/circuit-breaker';

describe('ProviderCircuitBreaker', () => {
  let breaker: ProviderCircuitBreaker;

  beforeEach(() => {
    breaker = new ProviderCircuitBreaker({ failureThreshold: 3, cooldownMs: 100 });
  });

  test('new provider is available (CLOSED)', () => {
    expect(breaker.isAvailable('anthropic')).toBe(true);
    expect(breaker.getState('anthropic')).toBe('CLOSED');
  });

  test('stays CLOSED below failure threshold', () => {
    breaker.recordFailure('anthropic');
    breaker.recordFailure('anthropic');
    expect(breaker.isAvailable('anthropic')).toBe(true);
    expect(breaker.getState('anthropic')).toBe('CLOSED');
  });

  test('opens circuit after reaching failure threshold', () => {
    breaker.recordFailure('openai');
    breaker.recordFailure('openai');
    breaker.recordFailure('openai');
    expect(breaker.isAvailable('openai')).toBe(false);
    expect(breaker.getState('openai')).toBe('OPEN');
  });

  test('success resets circuit to CLOSED', () => {
    breaker.recordFailure('google');
    breaker.recordFailure('google');
    breaker.recordSuccess('google');
    expect(breaker.isAvailable('google')).toBe(true);
    expect(breaker.getState('google')).toBe('CLOSED');
  });

  test('transitions to HALF_OPEN after cooldown', async () => {
    breaker.recordFailure('bedrock');
    breaker.recordFailure('bedrock');
    breaker.recordFailure('bedrock');
    expect(breaker.isAvailable('bedrock')).toBe(false);

    // Wait for cooldown
    await new Promise(r => setTimeout(r, 150));

    expect(breaker.isAvailable('bedrock')).toBe(true);
    expect(breaker.getState('bedrock')).toBe('HALF_OPEN');
  });

  test('success in HALF_OPEN returns to CLOSED', async () => {
    breaker.recordFailure('ollama');
    breaker.recordFailure('ollama');
    breaker.recordFailure('ollama');

    await new Promise(r => setTimeout(r, 150));

    // Now HALF_OPEN
    expect(breaker.isAvailable('ollama')).toBe(true);
    breaker.recordSuccess('ollama');
    expect(breaker.getState('ollama')).toBe('CLOSED');
  });

  test('failure in HALF_OPEN returns to OPEN', async () => {
    breaker.recordFailure('groq');
    breaker.recordFailure('groq');
    breaker.recordFailure('groq');

    await new Promise(r => setTimeout(r, 150));

    // Transition to HALF_OPEN
    expect(breaker.isAvailable('groq')).toBe(true);
    breaker.recordFailure('groq');
    expect(breaker.getState('groq')).toBe('OPEN');
  });

  test('independent circuits per provider', () => {
    breaker.recordFailure('anthropic');
    breaker.recordFailure('anthropic');
    breaker.recordFailure('anthropic');
    expect(breaker.isAvailable('anthropic')).toBe(false);
    expect(breaker.isAvailable('openai')).toBe(true);
  });

  test('reset clears a single provider', () => {
    breaker.recordFailure('anthropic');
    breaker.recordFailure('anthropic');
    breaker.recordFailure('anthropic');
    breaker.reset('anthropic');
    expect(breaker.isAvailable('anthropic')).toBe(true);
    expect(breaker.getState('anthropic')).toBe('CLOSED');
  });

  test('resetAll clears all providers', () => {
    breaker.recordFailure('anthropic');
    breaker.recordFailure('anthropic');
    breaker.recordFailure('anthropic');
    breaker.recordFailure('openai');
    breaker.recordFailure('openai');
    breaker.recordFailure('openai');
    breaker.resetAll();
    expect(breaker.isAvailable('anthropic')).toBe(true);
    expect(breaker.isAvailable('openai')).toBe(true);
  });

  test('default thresholds (5 failures, 60s cooldown)', () => {
    const defaultBreaker = new ProviderCircuitBreaker();
    for (let i = 0; i < 4; i++) {
      defaultBreaker.recordFailure('test');
    }
    expect(defaultBreaker.isAvailable('test')).toBe(true);
    defaultBreaker.recordFailure('test');
    expect(defaultBreaker.isAvailable('test')).toBe(false);
  });
});
