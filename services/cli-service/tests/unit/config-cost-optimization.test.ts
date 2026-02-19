import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ConfigManager } from '../../src/config/manager';
import { CONFIG_KEYS } from '../../src/config/types';
import { NimbusConfigSchema, CostOptimizationConfigSchema } from '../../src/config/schema';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('Gap 1: llm.cost_optimization config', () => {
  let tmpDir: string;
  let configPath: string;
  let manager: ConfigManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-cost-opt-'));
    configPath = path.join(tmpDir, 'config.yaml');
    manager = new ConfigManager(configPath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('CONFIG_KEYS registry', () => {
    test('should have llm.cost_optimization.enabled key', () => {
      const key = CONFIG_KEYS.find(k => k.key === 'llm.cost_optimization.enabled');
      expect(key).toBeDefined();
      expect(key!.type).toBe('boolean');
      expect(key!.defaultValue).toBe(false);
    });

    test('should have llm.cost_optimization.cheap_model key', () => {
      const key = CONFIG_KEYS.find(k => k.key === 'llm.cost_optimization.cheap_model');
      expect(key).toBeDefined();
      expect(key!.type).toBe('string');
      expect(key!.defaultValue).toBe('claude-haiku-4-20250514');
    });

    test('should have llm.cost_optimization.expensive_model key', () => {
      const key = CONFIG_KEYS.find(k => k.key === 'llm.cost_optimization.expensive_model');
      expect(key).toBeDefined();
      expect(key!.type).toBe('string');
      expect(key!.defaultValue).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('Zod schema', () => {
    test('CostOptimizationConfigSchema should accept valid config', () => {
      const result = CostOptimizationConfigSchema.safeParse({
        enabled: true,
        cheap_model: 'claude-haiku-4-20250514',
        expensive_model: 'claude-sonnet-4-20250514',
      });
      expect(result.success).toBe(true);
    });

    test('CostOptimizationConfigSchema should accept empty object', () => {
      const result = CostOptimizationConfigSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('NimbusConfigSchema should accept llm.cost_optimization', () => {
      const result = NimbusConfigSchema.safeParse({
        llm: {
          cost_optimization: {
            enabled: true,
            cheap_model: 'test-model',
          },
        },
      });
      expect(result.success).toBe(true);
    });

    test('NimbusConfigSchema should reject non-boolean enabled', () => {
      const result = NimbusConfigSchema.safeParse({
        llm: {
          cost_optimization: {
            enabled: 'yes',
          },
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ConfigManager set/get', () => {
    test('should set and get llm.cost_optimization.enabled', () => {
      manager.set('llm.cost_optimization.enabled', true);
      expect(manager.get('llm.cost_optimization.enabled')).toBe(true);
    });

    test('should set and get llm.cost_optimization.cheap_model', () => {
      manager.set('llm.cost_optimization.cheap_model', 'custom-model');
      expect(manager.get('llm.cost_optimization.cheap_model')).toBe('custom-model');
    });

    test('should set and get llm.cost_optimization.expensive_model', () => {
      manager.set('llm.cost_optimization.expensive_model', 'custom-expensive');
      expect(manager.get('llm.cost_optimization.expensive_model')).toBe('custom-expensive');
    });

    test('should persist cost_optimization in config file', () => {
      manager.set('llm.cost_optimization.enabled', true);
      manager.set('llm.cost_optimization.cheap_model', 'my-cheap');

      // Verify the YAML file contains the values
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain('cost_optimization');
      expect(content).toContain('enabled: true');
      expect(content).toContain('cheap_model: my-cheap');
    });

    test('should reject invalid enabled value via Zod', () => {
      expect(() => {
        manager.set('llm.cost_optimization.enabled', 'not-a-bool');
      }).toThrow();
    });
  });

  describe('isValidKey and parseValue', () => {
    test('should recognize cost_optimization keys as valid', () => {
      expect(manager.isValidKey('llm.cost_optimization.enabled')).toBe(true);
      expect(manager.isValidKey('llm.cost_optimization.cheap_model')).toBe(true);
      expect(manager.isValidKey('llm.cost_optimization.expensive_model')).toBe(true);
    });

    test('should parse boolean value for enabled', () => {
      expect(manager.parseValue('llm.cost_optimization.enabled', 'true')).toBe(true);
      expect(manager.parseValue('llm.cost_optimization.enabled', 'false')).toBe(false);
    });
  });
});
