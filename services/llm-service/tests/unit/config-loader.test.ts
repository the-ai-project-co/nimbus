import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('LLM Config Loader', () => {
  let tempDir: string;
  let origEnv: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-llm-config-'));
    origEnv = process.env.NIMBUS_CONFIG_PATH;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (origEnv !== undefined) {
      process.env.NIMBUS_CONFIG_PATH = origEnv;
    } else {
      delete process.env.NIMBUS_CONFIG_PATH;
    }
  });

  test('returns empty config when file does not exist', async () => {
    process.env.NIMBUS_CONFIG_PATH = path.join(tempDir, 'nonexistent.yaml');
    const { loadLLMConfig } = await import('../../src/config-loader');
    const config = loadLLMConfig();
    expect(config).toEqual({});
  });

  test('parses default_provider from YAML', async () => {
    const configPath = path.join(tempDir, 'config.yaml');
    fs.writeFileSync(configPath, [
      'llm:',
      '  default_provider: openai',
      '  defaultModel: gpt-4o',
    ].join('\n'));
    process.env.NIMBUS_CONFIG_PATH = configPath;
    const { loadLLMConfig } = await import('../../src/config-loader');
    const config = loadLLMConfig();
    expect(config.defaultProvider).toBe('openai');
    expect(config.defaultModel).toBe('gpt-4o');
  });

  test('parses cost optimization settings', async () => {
    const configPath = path.join(tempDir, 'config.yaml');
    fs.writeFileSync(configPath, [
      'llm:',
      '  cost_optimization:',
      '    enabled: true',
      '    cheap_model: claude-haiku-4-20250514',
      '    expensive_model: claude-opus-4-20250514',
      '    use_cheap_model_for:',
      '      - summarization',
      '      - classification',
      '    use_expensive_model_for:',
      '      - code_generation',
      '      - planning',
    ].join('\n'));
    process.env.NIMBUS_CONFIG_PATH = configPath;
    const { loadLLMConfig } = await import('../../src/config-loader');
    const config = loadLLMConfig();
    expect(config.costOptimization).toBeDefined();
    expect(config.costOptimization!.enabled).toBe(true);
    expect(config.costOptimization!.cheapModel).toBe('claude-haiku-4-20250514');
    expect(config.costOptimization!.expensiveModel).toBe('claude-opus-4-20250514');
    expect(config.costOptimization!.cheapModelFor).toEqual(['summarization', 'classification']);
    expect(config.costOptimization!.expensiveModelFor).toEqual(['code_generation', 'planning']);
  });

  test('parses fallback settings', async () => {
    const configPath = path.join(tempDir, 'config.yaml');
    fs.writeFileSync(configPath, [
      'llm:',
      '  fallback:',
      '    enabled: true',
      '    providers:',
      '      - anthropic',
      '      - openai',
      '      - google',
    ].join('\n'));
    process.env.NIMBUS_CONFIG_PATH = configPath;
    const { loadLLMConfig } = await import('../../src/config-loader');
    const config = loadLLMConfig();
    expect(config.fallback).toBeDefined();
    expect(config.fallback!.enabled).toBe(true);
    expect(config.fallback!.providers).toEqual(['anthropic', 'openai', 'google']);
  });

  test('parses maxTokens as tokenBudget', async () => {
    const configPath = path.join(tempDir, 'config.yaml');
    fs.writeFileSync(configPath, [
      'llm:',
      '  maxTokens: 4096',
    ].join('\n'));
    process.env.NIMBUS_CONFIG_PATH = configPath;
    const { loadLLMConfig } = await import('../../src/config-loader');
    const config = loadLLMConfig();
    expect(config.tokenBudget).toBeDefined();
    expect(config.tokenBudget!.maxTokensPerRequest).toBe(4096);
  });

  test('handles malformed YAML gracefully', async () => {
    const configPath = path.join(tempDir, 'config.yaml');
    fs.writeFileSync(configPath, 'this is not: [valid: yaml: {{{');
    process.env.NIMBUS_CONFIG_PATH = configPath;
    const { loadLLMConfig } = await import('../../src/config-loader');
    // Should not throw
    const config = loadLLMConfig();
    expect(config).toBeDefined();
  });
});
