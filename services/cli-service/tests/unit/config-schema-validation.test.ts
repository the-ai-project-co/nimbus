import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ConfigManager } from '../../src/config/manager';
import { NimbusConfigSchema } from '../../src/config/schema';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Config Schema Validation (Gaps 2 + 3)', () => {
  let tmpDir: string;
  let configPath: string;
  let manager: ConfigManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-config-test-'));
    configPath = path.join(tmpDir, 'config.yaml');
    manager = new ConfigManager(configPath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Gap 2: New config sections exist', () => {
    test('default config should include cloud section', () => {
      const config = manager.load();
      expect(config.cloud).toBeDefined();
      expect(config.cloud!.default_provider).toBe('aws');
    });

    test('default config should include cloud.aws defaults', () => {
      const config = manager.load();
      expect(config.cloud!.aws).toBeDefined();
      expect(config.cloud!.aws!.default_region).toBe('us-east-1');
      expect(config.cloud!.aws!.default_profile).toBe('default');
    });

    test('default config should include cloud.gcp defaults', () => {
      const config = manager.load();
      expect(config.cloud!.gcp).toBeDefined();
      expect(config.cloud!.gcp!.default_region).toBe('us-central1');
    });

    test('default config should include cloud.azure defaults', () => {
      const config = manager.load();
      expect(config.cloud!.azure).toBeDefined();
      expect(config.cloud!.azure!.default_region).toBe('eastus');
    });

    test('default config should include terraform section', () => {
      const config = manager.load();
      expect(config.terraform).toBeDefined();
      expect(config.terraform!.default_backend).toBe('s3');
    });

    test('default config should include kubernetes section', () => {
      const config = manager.load();
      expect(config.kubernetes).toBeDefined();
      expect(config.kubernetes!.default_namespace).toBe('default');
    });

    test('should be able to set and get cloud.default_provider', () => {
      manager.set('cloud.default_provider', 'gcp');
      expect(manager.get('cloud.default_provider')).toBe('gcp');
    });

    test('should be able to set and get terraform.default_backend', () => {
      manager.set('terraform.default_backend', 'gcs');
      expect(manager.get('terraform.default_backend')).toBe('gcs');
    });

    test('should be able to set and get kubernetes.default_namespace', () => {
      manager.set('kubernetes.default_namespace', 'production');
      expect(manager.get('kubernetes.default_namespace')).toBe('production');
    });

    test('should be able to set cloud.aws.default_region', () => {
      manager.set('cloud.aws.default_region', 'eu-west-1');
      expect(manager.get('cloud.aws.default_region')).toBe('eu-west-1');
    });
  });

  describe('Gap 3: Zod schema validation', () => {
    test('NimbusConfigSchema should accept valid config', () => {
      const result = NimbusConfigSchema.safeParse({
        version: 1,
        cloud: {
          default_provider: 'aws',
        },
        terraform: {
          default_backend: 's3',
        },
        kubernetes: {
          default_namespace: 'default',
        },
      });
      expect(result.success).toBe(true);
    });

    test('NimbusConfigSchema should reject invalid cloud.default_provider', () => {
      const result = NimbusConfigSchema.safeParse({
        version: 1,
        cloud: {
          default_provider: 'invalid_provider',
        },
      });
      expect(result.success).toBe(false);
    });

    test('NimbusConfigSchema should reject invalid terraform.default_backend', () => {
      const result = NimbusConfigSchema.safeParse({
        version: 1,
        terraform: {
          default_backend: 'invalid_backend',
        },
      });
      expect(result.success).toBe(false);
    });

    test('NimbusConfigSchema should reject invalid ui.theme', () => {
      const result = NimbusConfigSchema.safeParse({
        version: 1,
        ui: {
          theme: 'purple',
        },
      });
      expect(result.success).toBe(false);
    });

    test('NimbusConfigSchema should reject invalid llm.temperature', () => {
      const result = NimbusConfigSchema.safeParse({
        version: 1,
        llm: {
          temperature: 5,
        },
      });
      expect(result.success).toBe(false);
    });

    test('NimbusConfigSchema should accept empty object (all optional)', () => {
      const result = NimbusConfigSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('set() should reject invalid cloud.default_provider', () => {
      manager.load();
      expect(() => {
        manager.set('cloud.default_provider', 'invalid_provider');
      }).toThrow();
    });

    test('set() should reject invalid terraform.default_backend', () => {
      manager.load();
      expect(() => {
        manager.set('terraform.default_backend', 'invalid_backend');
      }).toThrow();
    });

    test('set() should accept valid cloud.default_provider', () => {
      manager.load();
      manager.set('cloud.default_provider', 'gcp');
      expect(manager.get('cloud.default_provider')).toBe('gcp');
    });

    test('set() should reject invalid ui.theme', () => {
      manager.load();
      expect(() => {
        manager.set('ui.theme', 'purple');
      }).toThrow();
    });

    test('load() should gracefully handle corrupted config file', () => {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, 'this is not valid yaml at all!!!{{{');

      const config = manager.load();
      // Should fall back to defaults
      expect(config.version).toBe(1);
      expect(config.cloud).toBeDefined();
    });

    test('load() should merge parsed config with defaults for invalid fields', () => {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      // Write a config with a valid workspace but invalid cloud provider
      fs.writeFileSync(configPath, `workspace:\n  name: my-project\ncloud:\n  default_provider: invalid\n`);

      const config = manager.load();
      // The valid field should be preserved
      expect(config.workspace?.name).toBe('my-project');
      // Defaults should still be present
      expect(config.version).toBe(1);
    });
  });
});
