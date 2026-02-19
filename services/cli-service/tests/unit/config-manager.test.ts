import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ConfigManager } from '../../src/config/manager';
import { CONFIG_KEYS } from '../../src/config/types';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('ConfigManager', () => {
  let tmpDir: string;
  let configPath: string;
  let manager: ConfigManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-config-'));
    configPath = path.join(tmpDir, 'config.yaml');
    manager = new ConfigManager(configPath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  describe('persona config', () => {
    test('should have default persona.mode as standard', () => {
      const mode = manager.get('persona.mode');
      expect(mode).toBe('standard');
    });

    test('should have default persona.verbosity as normal', () => {
      const verbosity = manager.get('persona.verbosity');
      expect(verbosity).toBe('normal');
    });

    test('should have default persona.custom as empty string', () => {
      const custom = manager.get('persona.custom');
      expect(custom).toBe('');
    });

    test('should set and get persona.mode', () => {
      manager.set('persona.mode', 'expert');
      expect(manager.get('persona.mode')).toBe('expert');
    });

    test('should set and get persona.verbosity', () => {
      manager.set('persona.verbosity', 'detailed');
      expect(manager.get('persona.verbosity')).toBe('detailed');
    });

    test('should set and get persona.custom', () => {
      manager.set('persona.custom', 'You are a helpful cloud architect');
      expect(manager.get('persona.custom')).toBe('You are a helpful cloud architect');
    });

    test('should retain persona config in memory after set', () => {
      manager.set('persona.mode', 'professional');
      manager.set('persona.verbosity', 'minimal');

      // Verify in-memory values
      expect(manager.get('persona.mode')).toBe('professional');
      expect(manager.get('persona.verbosity')).toBe('minimal');

      // Verify flat representation also includes them
      const flat = manager.getAllFlat();
      expect(flat['persona.mode']).toBe('professional');
      expect(flat['persona.verbosity']).toBe('minimal');
    });

    test('persona keys should be registered in CONFIG_KEYS', () => {
      const personaMode = CONFIG_KEYS.find(k => k.key === 'persona.mode');
      const personaVerbosity = CONFIG_KEYS.find(k => k.key === 'persona.verbosity');
      const personaCustom = CONFIG_KEYS.find(k => k.key === 'persona.custom');

      expect(personaMode).toBeDefined();
      expect(personaMode!.type).toBe('string');
      expect(personaMode!.defaultValue).toBe('standard');

      expect(personaVerbosity).toBeDefined();
      expect(personaVerbosity!.type).toBe('string');
      expect(personaVerbosity!.defaultValue).toBe('normal');

      expect(personaCustom).toBeDefined();
      expect(personaCustom!.type).toBe('string');
      expect(personaCustom!.defaultValue).toBe('');
    });
  });

  describe('getAllFlat', () => {
    test('should include persona keys in flat config', () => {
      const flat = manager.getAllFlat();
      expect(flat['persona.mode']).toBe('standard');
      expect(flat['persona.verbosity']).toBe('normal');
      expect(flat['persona.custom']).toBe('');
    });

    test('should include all default keys', () => {
      const flat = manager.getAllFlat();
      expect(flat['workspace.defaultProvider']).toBe('aws');
      expect(flat['llm.temperature']).toBe(0.7);
      expect(flat['ui.theme']).toBe('auto');
    });

    test('should reflect updates', () => {
      manager.set('persona.mode', 'expert');
      const flat = manager.getAllFlat();
      expect(flat['persona.mode']).toBe('expert');
    });
  });

  describe('reset', () => {
    test('should restore persona defaults after reset', () => {
      manager.set('persona.mode', 'expert');
      manager.set('persona.verbosity', 'detailed');
      manager.set('persona.custom', 'custom prompt');
      manager.reset();

      expect(manager.get('persona.mode')).toBe('standard');
      expect(manager.get('persona.verbosity')).toBe('normal');
      expect(manager.get('persona.custom')).toBe('');
    });

    test('should restore all defaults after reset', () => {
      manager.set('workspace.defaultProvider', 'gcp');
      manager.set('llm.temperature', 0.5);
      manager.reset();

      expect(manager.get('workspace.defaultProvider')).toBe('aws');
      expect(manager.get('llm.temperature')).toBe(0.7);
    });
  });

  describe('parseValue', () => {
    test('should parse persona.mode as string', () => {
      const value = manager.parseValue('persona.mode', 'expert');
      expect(value).toBe('expert');
    });

    test('should parse boolean values', () => {
      expect(manager.parseValue('history.enabled', 'true')).toBe(true);
      expect(manager.parseValue('history.enabled', 'false')).toBe(false);
    });

    test('should parse numeric values', () => {
      expect(manager.parseValue('llm.temperature', '0.5')).toBe(0.5);
      expect(manager.parseValue('llm.maxTokens', '8192')).toBe(8192);
    });

    test('should return string for unknown keys', () => {
      const value = manager.parseValue('unknown.key', 'hello');
      expect(value).toBe('hello');
    });
  });

  describe('isValidKey', () => {
    test('should validate persona keys', () => {
      expect(manager.isValidKey('persona.mode')).toBe(true);
      expect(manager.isValidKey('persona.verbosity')).toBe(true);
      expect(manager.isValidKey('persona.custom')).toBe(true);
    });

    test('should reject invalid keys', () => {
      expect(manager.isValidKey('nonexistent.key')).toBe(false);
    });
  });

  describe('delete', () => {
    test('should delete a config value', () => {
      manager.set('persona.mode', 'expert');
      manager.delete('persona.mode');
      expect(manager.get('persona.mode')).toBeUndefined();
    });

    test('should not throw for non-existent key', () => {
      expect(() => manager.delete('nonexistent.deep.key')).not.toThrow();
    });
  });

  describe('deep merge on load', () => {
    test('should merge persona with defaults when partially specified', () => {
      // Write a config with only persona.mode set
      const content = `version: 1\npersona:\n  mode: professional\n`;
      fs.writeFileSync(configPath, content);

      const manager2 = new ConfigManager(configPath);
      expect(manager2.get('persona.mode')).toBe('professional');
      expect(manager2.get('persona.verbosity')).toBe('normal');
    });

    test('should use defaults when persona section is missing', () => {
      const content = `version: 1\nworkspace:\n  defaultProvider: gcp\n`;
      fs.writeFileSync(configPath, content);

      const manager2 = new ConfigManager(configPath);
      expect(manager2.get('persona.mode')).toBe('standard');
      expect(manager2.get('persona.verbosity')).toBe('normal');
      expect(manager2.get('workspace.defaultProvider')).toBe('gcp');
    });
  });
});
