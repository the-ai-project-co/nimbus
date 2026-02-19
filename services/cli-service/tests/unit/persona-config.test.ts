import { describe, test, expect } from 'bun:test';
import { CONFIG_KEYS, type ConfigKey } from '../../src/config/types';

describe('Persona config keys', () => {
  test('persona.mode should exist in CONFIG_KEYS', () => {
    const entry = CONFIG_KEYS.find(k => k.key === 'persona.mode');
    expect(entry).toBeDefined();
    expect(entry!.type).toBe('string');
    expect(entry!.defaultValue).toBe('standard');
    expect(entry!.description).toBe('AI persona mode (standard, concise, detailed, expert)');
  });

  test('persona.verbosity should exist in CONFIG_KEYS', () => {
    const entry = CONFIG_KEYS.find(k => k.key === 'persona.verbosity');
    expect(entry).toBeDefined();
    expect(entry!.type).toBe('string');
    expect(entry!.defaultValue).toBe('normal');
    expect(entry!.description).toBe('Response verbosity level (minimal, normal, verbose)');
  });

  test('persona.custom should exist in CONFIG_KEYS', () => {
    const entry = CONFIG_KEYS.find(k => k.key === 'persona.custom');
    expect(entry).toBeDefined();
    expect(entry!.type).toBe('string');
    expect(entry!.defaultValue).toBe('');
    expect(entry!.description).toBe('Custom persona prompt override');
  });

  test('all three persona keys should be in the ConfigKey union', () => {
    // This test verifies the type system accepts these keys.
    // If any of these assignments fail, TypeScript would catch it at build time.
    const keys: ConfigKey[] = ['persona.mode', 'persona.verbosity', 'persona.custom'];
    expect(keys).toHaveLength(3);
    expect(keys).toContain('persona.mode');
    expect(keys).toContain('persona.verbosity');
    expect(keys).toContain('persona.custom');
  });

  test('persona keys should have correct types', () => {
    for (const key of ['persona.mode', 'persona.verbosity', 'persona.custom'] as const) {
      const entry = CONFIG_KEYS.find(k => k.key === key);
      expect(entry).toBeDefined();
      expect(entry!.type).toBe('string');
    }
  });

  test('persona.mode default should be standard', () => {
    const entry = CONFIG_KEYS.find(k => k.key === 'persona.mode');
    expect(entry!.defaultValue).toBe('standard');
  });

  test('persona.verbosity default should be normal', () => {
    const entry = CONFIG_KEYS.find(k => k.key === 'persona.verbosity');
    expect(entry!.defaultValue).toBe('normal');
  });

  test('persona.custom default should be empty string', () => {
    const entry = CONFIG_KEYS.find(k => k.key === 'persona.custom');
    expect(entry!.defaultValue).toBe('');
  });
});
