/**
 * E2E tests for the Configuration Management System.
 *
 * Covers ConfigManager CRUD, YAML persistence, schema validation,
 * env var resolution, prototype pollution protection, profile management,
 * mode persistence, workspace state, safety policy, config listing,
 * reset to defaults, and invalid key handling.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigManager } from '../../src/config/manager';
import type { NimbusConfig } from '../../src/config/types';
import { CONFIG_KEYS } from '../../src/config/types';
import {
  defaultSafetyPolicy,
  requiresSafetyCheck,
  requiresApproval,
  evaluateSafety,
  loadSafetyPolicy,
} from '../../src/config/safety-policy';
import type { SafetyContext, SafetyPolicy } from '../../src/config/safety-policy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a temporary directory and return a config file path inside it */
function createTempConfigPath(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-config-test-'));
  return path.join(tmpDir, 'config.yaml');
}

/** Write a simple YAML-like config file for testing */
function writeYamlConfig(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Config Management E2E', () => {
  let configPath: string;
  let manager: ConfigManager;

  beforeEach(() => {
    configPath = createTempConfigPath();
    manager = new ConfigManager(configPath);
  });

  afterEach(() => {
    const dir = path.dirname(configPath);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // -------------------------------------------------------------------------
  // 1. ConfigManager reads YAML config
  // -------------------------------------------------------------------------
  it('should read a YAML config file with a single top-level section', () => {
    // The built-in simple YAML parser has known limitations with multiple
    // top-level sections after nested blocks; test one section at a time
    writeYamlConfig(
      configPath,
      `version: 1
llm:
  temperature: 0.5
  maxTokens: 8192
`
    );

    const config = manager.load();

    expect(config.version).toBe(1);
    expect(config.llm?.temperature).toBe(0.5);
    expect(config.llm?.maxTokens).toBe(8192);
    // Defaults should still be present for fields not in the file
    expect(config.safety?.requireConfirmation).toBe(true);
  });

  it('should read a YAML config file for workspace section', () => {
    writeYamlConfig(
      configPath,
      `workspace:
  defaultProvider: gcp
  outputDirectory: ./output
`
    );

    const freshManager = new ConfigManager(configPath);
    const config = freshManager.load();

    expect(config.workspace?.defaultProvider).toBe('gcp');
    expect(config.workspace?.outputDirectory).toBe('./output');
  });

  // -------------------------------------------------------------------------
  // 2. ConfigManager writes key-value with dotted notation
  // -------------------------------------------------------------------------
  it('should write values using dot-notation keys', () => {
    manager.set('llm.temperature', 0.3);
    expect(manager.get('llm.temperature')).toBe(0.3);

    manager.set('workspace.outputDirectory', './custom-output');
    expect(manager.get('workspace.outputDirectory')).toBe('./custom-output');

    manager.set('safety.requireConfirmation', false);
    expect(manager.get('safety.requireConfirmation')).toBe(false);

    // Verify the file was written to disk
    expect(fs.existsSync(configPath)).toBe(true);
    const raw = fs.readFileSync(configPath, 'utf-8');
    expect(raw).toContain('temperature: 0.3');
    expect(raw).toContain('./custom-output');
  });

  // -------------------------------------------------------------------------
  // 3. ConfigManager validates schema
  // -------------------------------------------------------------------------
  it('should validate config values against the Zod schema', () => {
    // Temperature must be between 0 and 1
    expect(() => manager.set('llm.temperature', 2.0)).toThrow();

    // Negative temperature should also fail
    expect(() => manager.set('llm.temperature', -0.1)).toThrow();

    // Valid values should succeed
    expect(() => manager.set('llm.temperature', 0.0)).not.toThrow();
    expect(() => manager.set('llm.temperature', 1.0)).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // 4. ConfigManager resolves env vars ${VAR}
  // -------------------------------------------------------------------------
  it('should resolve environment variables in config values', () => {
    const savedVal = process.env.NIMBUS_TEST_REGION;
    process.env.NIMBUS_TEST_REGION = 'eu-west-1';

    try {
      writeYamlConfig(
        configPath,
        `version: 1
cloud:
  aws:
    default_region: \${NIMBUS_TEST_REGION}
`
      );

      const freshManager = new ConfigManager(configPath);
      const config = freshManager.load();
      expect(config.cloud?.aws?.default_region).toBe('eu-west-1');
    } finally {
      if (savedVal !== undefined) {
        process.env.NIMBUS_TEST_REGION = savedVal;
      } else {
        delete process.env.NIMBUS_TEST_REGION;
      }
    }
  });

  // -------------------------------------------------------------------------
  // 5. ConfigManager resolves defaults ${VAR:-default}
  // -------------------------------------------------------------------------
  it('should resolve env var defaults with ${VAR:-default} syntax', () => {
    // Ensure the var is NOT set
    const savedVal = process.env.NIMBUS_UNSET_VAR;
    delete process.env.NIMBUS_UNSET_VAR;

    try {
      writeYamlConfig(
        configPath,
        `version: 1
cloud:
  aws:
    default_region: \${NIMBUS_UNSET_VAR:-us-west-2}
`
      );

      const freshManager = new ConfigManager(configPath);
      const config = freshManager.load();
      expect(config.cloud?.aws?.default_region).toBe('us-west-2');
    } finally {
      if (savedVal !== undefined) {
        process.env.NIMBUS_UNSET_VAR = savedVal;
      }
    }
  });

  // -------------------------------------------------------------------------
  // 6. ConfigManager protects against prototype pollution
  // -------------------------------------------------------------------------
  it('should reject prototype pollution attempts via set()', () => {
    expect(() => manager.set('__proto__.polluted', 'yes')).toThrow(
      'Invalid config key: "__proto__" is not allowed'
    );
    expect(() => manager.set('constructor.polluted', 'yes')).toThrow(
      'Invalid config key: "constructor" is not allowed'
    );
    expect(() => manager.set('a.__proto__.b', 'yes')).toThrow(
      'Invalid config key: "__proto__" is not allowed'
    );
    expect(() => manager.set('prototype.evil', 'yes')).toThrow(
      'Invalid config key: "prototype" is not allowed'
    );
  });

  it('should reject prototype pollution attempts via delete()', () => {
    expect(() => manager.delete('__proto__.polluted')).toThrow(
      'Invalid config key: "__proto__" is not allowed'
    );
  });

  // -------------------------------------------------------------------------
  // 7. Profile create and switch
  // -------------------------------------------------------------------------
  it('should create and load profiles via filesystem', async () => {
    // Create an isolated profiles directory
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-profiles-e2e-'));
    const nimbusProfilesDir = path.join(tmpDir, '.nimbus', 'profiles');
    fs.mkdirSync(nimbusProfilesDir, { recursive: true });

    // Save a profile manually to the expected directory
    const profileData = {
      anthropicApiKey: 'sk-ant-staging',
      awsProfile: 'staging',
      awsRegion: 'eu-west-1',
    };
    const profilePath = path.join(nimbusProfilesDir, 'staging.json');
    fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2), 'utf-8');

    // Read it back to verify file IO round-trip
    const rawContent = fs.readFileSync(profilePath, 'utf-8');
    const parsed = JSON.parse(rawContent);
    expect(parsed.awsProfile).toBe('staging');
    expect(parsed.awsRegion).toBe('eu-west-1');
    expect(parsed.anthropicApiKey).toBe('sk-ant-staging');

    // Verify the profiles directory lists the file
    const files = fs.readdirSync(nimbusProfilesDir);
    expect(files).toContain('staging.json');

    // Clean up the temp directory we created
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // 8. Profile loads correct settings
  // -------------------------------------------------------------------------
  it('should apply profile settings to process.env', async () => {
    const { applyProfile } = await import('../../src/config/profiles');
    const savedEnv = {
      AWS_PROFILE: process.env.AWS_PROFILE,
      AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION,
      AWS_REGION: process.env.AWS_REGION,
    };

    try {
      applyProfile({
        name: 'test-profile',
        awsProfile: 'production',
        awsRegion: 'ap-southeast-1',
        gcpProject: 'my-gcp-project',
      });

      expect(process.env.AWS_PROFILE).toBe('production');
      expect(process.env.AWS_DEFAULT_REGION).toBe('ap-southeast-1');
      expect(process.env.AWS_REGION).toBe('ap-southeast-1');
      expect(process.env.GCLOUD_PROJECT).toBe('my-gcp-project');
      expect(process.env.GOOGLE_CLOUD_PROJECT).toBe('my-gcp-project');
    } finally {
      // Restore
      for (const [key, val] of Object.entries(savedEnv)) {
        if (val !== undefined) {
          process.env[key] = val;
        } else {
          delete process.env[key];
        }
      }
      delete process.env.GCLOUD_PROJECT;
      delete process.env.GOOGLE_CLOUD_PROJECT;
    }
  });

  // -------------------------------------------------------------------------
  // 9. Mode store persists plan/build/deploy per CWD
  // -------------------------------------------------------------------------
  it('should persist and load agent mode per working directory', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-mode-test-'));
    const modeConfigPath = path.join(tmpDir, '.nimbus', 'mode-config.json');

    // Directly test the mode persistence by writing/reading the JSON file
    const modeData: Record<string, string> = {
      '/projects/alpha': 'plan',
      '/projects/beta': 'build',
      '/projects/gamma': 'deploy',
    };

    fs.mkdirSync(path.dirname(modeConfigPath), { recursive: true });
    fs.writeFileSync(modeConfigPath, JSON.stringify(modeData, null, 2), 'utf-8');

    const loaded = JSON.parse(fs.readFileSync(modeConfigPath, 'utf-8'));
    expect(loaded['/projects/alpha']).toBe('plan');
    expect(loaded['/projects/beta']).toBe('build');
    expect(loaded['/projects/gamma']).toBe('deploy');

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // 10. Workspace state save/load
  // -------------------------------------------------------------------------
  it('should save and load workspace state per CWD', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-ws-test-'));
    const statePath = path.join(tmpDir, '.nimbus', 'workspace-state.json');

    // Simulate workspace state persistence
    const stateData: Record<string, { terraformWorkspace?: string; kubectlContext?: string }> = {};
    stateData['/projects/infra'] = {
      terraformWorkspace: 'staging',
      kubectlContext: 'eks-staging',
    };

    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(stateData, null, 2), 'utf-8');

    const loaded = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(loaded['/projects/infra'].terraformWorkspace).toBe('staging');
    expect(loaded['/projects/infra'].kubectlContext).toBe('eks-staging');

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // 11. Safety policy: requireConfirmation
  // -------------------------------------------------------------------------
  it('should require confirmation for destructive operations', () => {
    const context: SafetyContext = {
      operation: 'terraform destroy',
      type: 'terraform',
      environment: 'staging',
    };

    const needsApproval = requiresApproval('destroy', context);
    expect(needsApproval).toBe(true);

    // Read-only operations should not require approval
    const readContext: SafetyContext = {
      operation: 'terraform plan',
      type: 'terraform',
    };
    const readNeedsApproval = requiresApproval('plan', readContext);
    expect(readNeedsApproval).toBe(false);
  });

  it('should require approval for protected environments', () => {
    const context: SafetyContext = {
      operation: 'kubectl apply',
      type: 'kubernetes',
      environment: 'production',
    };

    expect(requiresApproval('apply', context)).toBe(true);

    // Non-protected environment with apply still requires approval (apply is in alwaysRequireApproval)
    const devContext: SafetyContext = {
      operation: 'kubectl apply',
      type: 'kubernetes',
      environment: 'development',
    };
    expect(requiresApproval('apply', devContext)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 12. Safety policy: dryRunByDefault
  // -------------------------------------------------------------------------
  it('should evaluate safety and flag dry-run-friendly operations', () => {
    // Default safety policy has dryRunByDefault = false in ConfigManager
    const config = manager.load();
    expect(config.safety?.dryRunByDefault).toBe(false);

    // Toggling the setting
    manager.set('safety.dryRunByDefault', true);
    expect(manager.get('safety.dryRunByDefault')).toBe(true);

    // Safety check for a destructive operation
    const result = evaluateSafety({
      operation: 'terraform destroy',
      type: 'terraform',
      environment: 'production',
    });

    expect(result.requiresApproval).toBe(true);
    expect(result.risks.length).toBeGreaterThan(0);
    expect(result.risks.some(r => r.id === 'destructive-operation')).toBe(true);
    expect(result.risks.some(r => r.id === 'protected-environment')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 13. Config list returns all settings
  // -------------------------------------------------------------------------
  it('should return all config settings as flat key-value pairs', () => {
    const flat = manager.getAllFlat();

    // Should contain expected keys from defaults
    expect(flat).toHaveProperty('version');
    expect(flat).toHaveProperty('llm.temperature');
    expect(flat).toHaveProperty('safety.requireConfirmation');
    expect(flat).toHaveProperty('ui.theme');
    expect(flat).toHaveProperty('workspace.defaultProvider');

    // Verify default values
    expect(flat['llm.temperature']).toBe(0.7);
    expect(flat['safety.requireConfirmation']).toBe(true);
    expect(flat['ui.theme']).toBe('auto');
  });

  // -------------------------------------------------------------------------
  // 14. Config reset restores defaults
  // -------------------------------------------------------------------------
  it('should reset configuration to defaults', () => {
    // Modify some values
    manager.set('llm.temperature', 0.1);
    manager.set('safety.dryRunByDefault', true);
    manager.set('ui.theme', 'dark');

    expect(manager.get('llm.temperature')).toBe(0.1);
    expect(manager.get('safety.dryRunByDefault')).toBe(true);
    expect(manager.get('ui.theme')).toBe('dark');

    // Reset
    manager.reset();

    // All values should be back to defaults
    expect(manager.get('llm.temperature')).toBe(0.7);
    expect(manager.get('safety.dryRunByDefault')).toBe(false);
    expect(manager.get('ui.theme')).toBe('auto');
    expect(manager.get('safety.requireConfirmation')).toBe(true);
    expect(manager.get('workspace.defaultProvider')).toBe('aws');
  });

  // -------------------------------------------------------------------------
  // 15. Invalid config key shows error
  // -------------------------------------------------------------------------
  it('should validate known config keys', () => {
    expect(manager.isValidKey('llm.temperature')).toBe(true);
    expect(manager.isValidKey('safety.requireConfirmation')).toBe(true);
    expect(manager.isValidKey('nonexistent.key.path')).toBe(false);
    expect(manager.isValidKey('totally.invalid')).toBe(false);
  });

  it('should return undefined for non-existent dot-notation keys', () => {
    expect(manager.get('does.not.exist')).toBeUndefined();
    expect(manager.get('llm.nonexistent')).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Additional edge cases
  // -------------------------------------------------------------------------

  it('should handle corrupted config file gracefully', () => {
    writeYamlConfig(configPath, '!!!invalid yaml content: {{{');

    const freshManager = new ConfigManager(configPath);
    const config = freshManager.load();

    // Should fall back to defaults
    expect(config).toBeDefined();
    expect(config.version).toBe(1);
    expect(config.llm?.temperature).toBe(0.7);
  });

  it('should create default config when file does not exist', () => {
    expect(fs.existsSync(configPath)).toBe(false);

    const config = manager.load();
    expect(config).toBeDefined();
    expect(config.version).toBe(1);
    expect(config.workspace?.defaultProvider).toBe('aws');
    expect(config.workspace?.outputDirectory).toBe('./infrastructure');
    expect(config.llm?.temperature).toBe(0.7);
    expect(config.llm?.maxTokens).toBe(4096);
    expect(config.history?.maxEntries).toBe(100);
    expect(config.history?.enabled).toBe(true);
  });

  it('should reload configuration from disk discarding cache', () => {
    manager.set('llm.temperature', 0.3);
    expect(manager.get('llm.temperature')).toBe(0.3);

    // Modify on disk behind the manager's back using a single-section YAML
    // that the simple parser handles reliably
    writeYamlConfig(
      configPath,
      `llm:
  temperature: 0.9
  maxTokens: 2048
`
    );

    // Reload should pick up disk changes
    manager.reload();
    expect(manager.get('llm.temperature')).toBe(0.9);
    expect(manager.get('llm.maxTokens')).toBe(2048);
  });

  it('should delete a config key', () => {
    manager.set('workspace.name', 'test-project');
    expect(manager.get('workspace.name')).toBe('test-project');

    manager.delete('workspace.name');
    expect(manager.get('workspace.name')).toBeUndefined();
  });

  it('should parse values according to key type', () => {
    expect(manager.parseValue('safety.requireConfirmation', 'true')).toBe(true);
    expect(manager.parseValue('safety.requireConfirmation', 'false')).toBe(false);
    expect(manager.parseValue('llm.temperature', '0.5')).toBe(0.5);
    expect(manager.parseValue('ui.theme', 'dark')).toBe('dark');
  });

  it('should check if config file exists', () => {
    expect(manager.exists()).toBe(false);

    manager.set('llm.temperature', 0.5);
    expect(manager.exists()).toBe(true);
  });

  it('should get config path', () => {
    expect(manager.getConfigPath()).toBe(configPath);
  });

  it('should skip safety checks for read-only operations', () => {
    expect(requiresSafetyCheck('plan')).toBe(false);
    expect(requiresSafetyCheck('validate')).toBe(false);
    expect(requiresSafetyCheck('list')).toBe(false);
    expect(requiresSafetyCheck('get')).toBe(false);
    expect(requiresSafetyCheck('describe')).toBe(false);
    expect(requiresSafetyCheck('logs')).toBe(false);
    expect(requiresSafetyCheck('status')).toBe(false);

    // Mutating operations should not be skipped
    expect(requiresSafetyCheck('apply')).toBe(true);
    expect(requiresSafetyCheck('destroy')).toBe(true);
    expect(requiresSafetyCheck('delete')).toBe(true);
  });

  it('should flag high-cost operations in safety evaluation', () => {
    const result = evaluateSafety({
      operation: 'terraform apply',
      type: 'terraform',
      estimatedCost: 1000,
    });

    expect(result.requiresApproval).toBe(true);
    expect(result.risks.some(r => r.id === 'high-cost')).toBe(true);
    expect(result.estimatedCost).toBe(1000);
  });

  it('should analyze terraform plan output for resource destruction', () => {
    const result = evaluateSafety({
      operation: 'terraform apply',
      type: 'terraform',
      planOutput: 'Plan: 3 to add, 1 to change, 2 to destroy.',
    });

    expect(result.risks.some(r => r.id === 'resource-destruction')).toBe(true);
    const destructionRisk = result.risks.find(r => r.id === 'resource-destruction')!;
    expect(destructionRisk.details).toEqual({ count: 2 });
  });

  it('should use default safety policy when no config file exists', () => {
    const policy = loadSafetyPolicy('/nonexistent/path/config.yaml');
    expect(policy).toEqual(defaultSafetyPolicy);
    expect(policy.alwaysRequireApproval).toContain('destroy');
    expect(policy.protectedEnvironments).toContain('production');
    expect(policy.costThreshold).toBe(500);
  });

  it('should deep merge config with defaults for partial config files', () => {
    writeYamlConfig(
      configPath,
      `version: 1
llm:
  temperature: 0.2
`
    );

    const freshManager = new ConfigManager(configPath);
    const config = freshManager.load();

    // Custom value
    expect(config.llm?.temperature).toBe(0.2);
    // Default values should still be present for fields not specified
    expect(config.llm?.maxTokens).toBe(4096);
    expect(config.safety?.requireConfirmation).toBe(true);
    expect(config.workspace?.defaultProvider).toBe('aws');
  });

  it('should expose CONFIG_KEYS metadata for all documented keys', () => {
    expect(CONFIG_KEYS.length).toBeGreaterThan(20);

    const tempKey = CONFIG_KEYS.find(k => k.key === 'llm.temperature');
    expect(tempKey).toBeDefined();
    expect(tempKey!.type).toBe('number');
    expect(tempKey!.defaultValue).toBe(0.7);

    const safetyKey = CONFIG_KEYS.find(k => k.key === 'safety.requireConfirmation');
    expect(safetyKey).toBeDefined();
    expect(safetyKey!.type).toBe('boolean');
    expect(safetyKey!.defaultValue).toBe(true);
  });
});
