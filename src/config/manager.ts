/**
 * Config Manager
 *
 * Manages Nimbus configuration stored at ~/.nimbus/config.yaml
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CONFIG_KEYS, type NimbusConfig, type ConfigKey } from './types';
import { NimbusConfigSchema } from './schema';

const CONFIG_VERSION = 1;

/**
 * Forbidden keys that could lead to prototype pollution
 */
const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Check if a key is safe from prototype pollution
 */
function isSafeKey(key: string): boolean {
  return !FORBIDDEN_KEYS.includes(key);
}

/**
 * Validate all parts of a dot-notation key path
 */
function validateKeyPath(key: string): void {
  const parts = key.split('.');
  for (const part of parts) {
    if (!isSafeKey(part)) {
      throw new Error(`Invalid config key: "${part}" is not allowed`);
    }
  }
}

/**
 * Resolve environment variables in config values.
 * Supports ${VAR} and ${VAR:-default} syntax.
 * Recursively walks objects and arrays.
 */
function resolveEnvVars(value: any): any {
  if (typeof value === 'string') {
    return value.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
      const defaultSep = expr.indexOf(':-');
      if (defaultSep !== -1) {
        const varName = expr.slice(0, defaultSep);
        const defaultValue = expr.slice(defaultSep + 2);
        return process.env[varName] ?? defaultValue;
      }
      return process.env[expr] ?? '';
    });
  }
  if (Array.isArray(value)) {
    return value.map(resolveEnvVars);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = resolveEnvVars(v);
    }
    return result;
  }
  return value;
}

/**
 * Create default configuration
 */
function createDefaultConfig(): NimbusConfig {
  return {
    version: CONFIG_VERSION,
    workspace: {
      defaultProvider: 'aws',
      outputDirectory: './infrastructure',
    },
    llm: {
      temperature: 0.7,
      maxTokens: 4096,
    },
    history: {
      maxEntries: 100,
      enabled: true,
    },
    safety: {
      requireConfirmation: true,
      dryRunByDefault: false,
    },
    ui: {
      theme: 'auto',
      colors: true,
      spinner: 'dots',
    },
    persona: {
      mode: 'standard',
      verbosity: 'normal',
      custom: '',
    },
    cloud: {
      default_provider: 'aws',
      aws: { default_region: 'us-east-1', default_profile: 'default' },
      gcp: { default_region: 'us-central1' },
      azure: { default_region: 'eastus' },
    },
    terraform: { default_backend: 's3' },
    kubernetes: { default_namespace: 'default' },
  };
}

/**
 * Parse YAML-like config (simple key: value format)
 * Note: This is a simple parser, not full YAML
 */
function parseSimpleYaml(content: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = content.split('\n');
  const stack: Array<{ indent: number; obj: Record<string, any>; key: string }> = [];
  let currentObj = result;
  let currentIndent = 0;

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.trim().startsWith('#') || !line.trim()) {
      continue;
    }

    const indent = line.search(/\S/);
    const trimmed = line.trim();

    // Handle nested objects
    if (trimmed.endsWith(':')) {
      const key = trimmed.slice(0, -1);

      if (indent > currentIndent) {
        // Going deeper
        stack.push({ indent: currentIndent, obj: currentObj, key: '' });
      } else if (indent < currentIndent) {
        // Going back up
        while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
          const item = stack.pop()!;
          currentObj = item.obj;
        }
      }

      currentObj[key] = {};
      stack.push({ indent, obj: currentObj, key });
      currentObj = currentObj[key];
      currentIndent = indent;
    } else if (trimmed.includes(':')) {
      // Key-value pair
      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.slice(0, colonIndex).trim();
      let value: any = trimmed.slice(colonIndex + 1).trim();

      // Handle indentation changes
      if (indent < currentIndent && stack.length > 0) {
        while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
          const item = stack.pop()!;
          currentObj = item.obj;
        }
        currentIndent = indent;
      }

      // Parse value type
      if (value === 'true') {
        value = true;
      } else if (value === 'false') {
        value = false;
      } else if (value === 'null' || value === '~') {
        value = null;
      } else if (!isNaN(Number(value)) && value !== '') {
        value = Number(value);
      } else if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      currentObj[key] = value;
    }
  }

  return result;
}

/**
 * Serialize config to YAML-like format
 */
function serializeToYaml(config: Record<string, any>, indent = 0): string {
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);

  for (const [key, value] of Object.entries(config)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`${prefix}${key}:`);
      lines.push(serializeToYaml(value, indent + 1));
    } else {
      let serializedValue: string;

      if (typeof value === 'string') {
        // Quote strings that need it - escape backslashes and quotes
        if (
          value.includes(':') ||
          value.includes('#') ||
          value.includes("'") ||
          value.includes('"') ||
          value.includes('\\')
        ) {
          serializedValue = `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
        } else {
          serializedValue = value;
        }
      } else if (typeof value === 'boolean') {
        serializedValue = value ? 'true' : 'false';
      } else {
        serializedValue = String(value);
      }

      lines.push(`${prefix}${key}: ${serializedValue}`);
    }
  }

  return lines.join('\n');
}

/**
 * ConfigManager class for configuration persistence
 */
export class ConfigManager {
  private configPath: string;
  private config: NimbusConfig | null = null;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(os.homedir(), '.nimbus', 'config.yaml');
  }

  /**
   * Deep merge two objects, with source values taking precedence
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        target[key] &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else if (source[key] !== undefined) {
        result[key] = source[key];
      }
    }
    return result;
  }

  /**
   * Get the path to the config file
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Ensure the config directory exists
   */
  private ensureDirectory(): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Load configuration from disk
   */
  load(): NimbusConfig {
    if (this.config) {
      return this.config;
    }

    this.ensureDirectory();

    if (!fs.existsSync(this.configPath)) {
      this.config = createDefaultConfig();
      return this.config;
    }

    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = resolveEnvVars(parseSimpleYaml(content));

      // Validate with Zod schema
      const parseResult = NimbusConfigSchema.safeParse(parsed);
      const defaults = createDefaultConfig();

      if (!parseResult.success) {
        // Use defaults for invalid fields — don't crash
        const merged = this.deepMerge(defaults, parsed);
        this.config = merged as NimbusConfig;
      } else {
        this.config = this.deepMerge(defaults, parseResult.data) as NimbusConfig;
      }

      this.config.version = CONFIG_VERSION;
      return this.config;
    } catch {
      // If file is corrupted, start fresh
      this.config = createDefaultConfig();
      return this.config;
    }
  }

  /**
   * Save configuration to disk
   */
  save(config?: NimbusConfig): void {
    this.ensureDirectory();

    const configToSave = config || this.config;
    if (!configToSave) {
      throw new Error('No config to save');
    }

    this.config = configToSave;

    const header = `# Nimbus CLI Configuration
# Version: ${CONFIG_VERSION}
# Documentation: https://github.com/the-ai-project-co/nimbus
#
# Edit this file to customize Nimbus behavior.
# Run 'nimbus config list' to see all available options.

`;

    const content = header + serializeToYaml(configToSave);
    fs.writeFileSync(this.configPath, content, { mode: 0o600 });
  }

  /**
   * Check if config file exists
   */
  exists(): boolean {
    return fs.existsSync(this.configPath);
  }

  /**
   * Get a configuration value by dot-notation key
   */
  get(key: string): any {
    const config = this.load();
    const parts = key.split('.');
    let value: any = config;

    for (const part of parts) {
      if (value === undefined || value === null) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }

  /**
   * Set a configuration value by dot-notation key
   */
  set(key: string, value: any): void {
    // Guard against prototype pollution
    validateKeyPath(key);

    const config = this.load();
    const configCopy = JSON.parse(JSON.stringify(config));
    const parts = key.split('.');
    let obj: any = configCopy;

    // Navigate to parent object
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (obj[part] === undefined) {
        // Use Object.create(null) to avoid prototype chain
        obj[part] = Object.create(null);
      }
      obj = obj[part];
    }

    // Set the value
    const lastPart = parts[parts.length - 1];
    obj[lastPart] = value;

    // Validate the entire config after the change
    const result = NimbusConfigSchema.safeParse(configCopy);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new Error(`Invalid value for '${key}': ${issue?.message || 'validation failed'}`);
    }

    // Apply to the real config and save
    let realObj: any = config;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (realObj[part] === undefined) {
        realObj[part] = Object.create(null);
      }
      realObj = realObj[part];
    }
    realObj[lastPart] = value;

    this.save(config);
  }

  /**
   * Delete a configuration value by dot-notation key
   */
  delete(key: string): void {
    // Guard against prototype pollution
    validateKeyPath(key);

    const config = this.load();
    const parts = key.split('.');
    let obj: any = config;

    // Navigate to parent object
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!Object.prototype.hasOwnProperty.call(obj, part) || obj[part] === undefined) {
        return; // Key doesn't exist
      }
      obj = obj[part];
    }

    // Delete the value
    const lastPart = parts[parts.length - 1];
    delete obj[lastPart];

    this.save(config);
  }

  /**
   * Get all configuration as flat key-value pairs
   */
  getAllFlat(): Record<string, any> {
    const config = this.load();
    const result: Record<string, any> = {};

    function flatten(obj: any, prefix = '') {
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          flatten(value, fullKey);
        } else {
          result[fullKey] = value;
        }
      }
    }

    flatten(config);
    return result;
  }

  /**
   * Reset configuration to defaults
   */
  reset(): void {
    this.config = createDefaultConfig();
    this.save();
  }

  /**
   * Reload configuration from disk
   */
  reload(): NimbusConfig {
    this.config = null;
    return this.load();
  }

  /**
   * Get config key info
   */
  getKeyInfo(key: string): (typeof CONFIG_KEYS)[number] | undefined {
    return CONFIG_KEYS.find(k => k.key === key);
  }

  /**
   * Validate a key exists in the schema
   */
  isValidKey(key: string): boolean {
    return CONFIG_KEYS.some(k => k.key === key);
  }

  /**
   * Parse a value according to the key's type
   */
  parseValue(key: string, value: string): any {
    const keyInfo = this.getKeyInfo(key);
    if (!keyInfo) {
      // Unknown key, return as string
      return value;
    }

    switch (keyInfo.type) {
      case 'boolean':
        return value.toLowerCase() === 'true';
      case 'number':
        return Number(value);
      case 'string':
      default:
        return value;
    }
  }
}

/**
 * Export singleton instance
 */
export const configManager = new ConfigManager();

// Re-export types
export { CONFIG_KEYS };
export type { ConfigKey };
