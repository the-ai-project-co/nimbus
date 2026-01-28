import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import YAML from 'yaml';
import { logger } from '@nimbus/shared-utils';
import { NimbusConfigSchema, DEFAULT_CONFIG, type NimbusConfig } from './schema';
import { z } from 'zod';

export class ConfigurationManager {
  private configPath: string;
  private config: NimbusConfig;
  private loaded: boolean = false;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(os.homedir(), '.nimbus', 'config.yaml');
    this.config = DEFAULT_CONFIG;
  }

  /**
   * Load configuration from YAML file
   */
  async load(): Promise<NimbusConfig> {
    try {
      // Ensure config directory exists
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });

      // Check if config file exists
      try {
        await fs.access(this.configPath);
      } catch {
        // Config file doesn't exist, create it with defaults
        logger.info(`Config file not found at ${this.configPath}, creating with defaults`);
        await this.save(DEFAULT_CONFIG);
        this.config = DEFAULT_CONFIG;
        this.loaded = true;
        return this.config;
      }

      // Read and parse YAML
      const fileContent = await fs.readFile(this.configPath, 'utf-8');
      const rawConfig = YAML.parse(fileContent);

      // Resolve environment variables
      const resolvedConfig = this.resolveEnvVars(rawConfig);

      // Validate with Zod schema
      const validatedConfig = NimbusConfigSchema.parse(resolvedConfig);

      this.config = validatedConfig;
      this.loaded = true;

      logger.info(`Configuration loaded from ${this.configPath}`);
      return this.config;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.issues.map((issue: z.ZodIssue) => `${issue.path.join('.')}: ${issue.message}`);
        logger.error('Configuration validation failed', errorMessages);
        throw new Error(`Invalid configuration: ${errorMessages.join(', ')}`);
      }
      logger.error('Failed to load configuration', error);
      throw error;
    }
  }

  /**
   * Save configuration to YAML file
   */
  async save(config?: NimbusConfig): Promise<void> {
    try {
      const configToSave = config || this.config;

      // Validate before saving
      const validatedConfig = NimbusConfigSchema.parse(configToSave);

      // Ensure config directory exists
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });

      // Convert to YAML
      const yamlContent = YAML.stringify(validatedConfig, {
        lineWidth: 100,
        indent: 2,
      });

      // Write to file
      await fs.writeFile(this.configPath, yamlContent, 'utf-8');

      this.config = validatedConfig;
      logger.info(`Configuration saved to ${this.configPath}`);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.issues.map((issue: z.ZodIssue) => `${issue.path.join('.')}: ${issue.message}`);
        logger.error('Configuration validation failed', errorMessages);
        throw new Error(`Invalid configuration: ${errorMessages.join(', ')}`);
      }
      logger.error('Failed to save configuration', error);
      throw error;
    }
  }

  /**
   * Get a specific configuration value by path (e.g., 'llm.defaultProvider')
   */
  get<T = any>(keyPath: string): T | undefined {
    if (!this.loaded) {
      throw new Error('Configuration not loaded. Call load() first.');
    }

    const keys = keyPath.split('.');
    let value: any = this.config;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return value as T;
  }

  /**
   * Set a specific configuration value by path
   */
  async set(keyPath: string, value: any): Promise<void> {
    if (!this.loaded) {
      throw new Error('Configuration not loaded. Call load() first.');
    }

    const keys = keyPath.split('.');
    const lastKey = keys.pop();

    if (!lastKey) {
      throw new Error('Invalid key path');
    }

    let target: any = this.config;
    for (const key of keys) {
      if (!(key in target)) {
        target[key] = {};
      }
      target = target[key];
    }

    target[lastKey] = value;

    // Validate the entire config after update
    this.config = NimbusConfigSchema.parse(this.config);

    // Save to file
    await this.save();
  }

  /**
   * Get all configuration
   */
  getAll(): NimbusConfig {
    if (!this.loaded) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
    return this.config;
  }

  /**
   * Update configuration (partial update)
   */
  async update(partialConfig: Partial<NimbusConfig>): Promise<void> {
    if (!this.loaded) {
      throw new Error('Configuration not loaded. Call load() first.');
    }

    // Merge with existing config
    const merged = this.deepMerge(this.config, partialConfig);

    // Validate
    this.config = NimbusConfigSchema.parse(merged);

    // Save
    await this.save();
  }

  /**
   * Reset configuration to defaults
   */
  async reset(): Promise<void> {
    this.config = DEFAULT_CONFIG;
    await this.save();
    logger.info('Configuration reset to defaults');
  }

  /**
   * Resolve environment variables in configuration
   * Supports ${VAR_NAME} syntax
   */
  private resolveEnvVars(obj: any): any {
    if (typeof obj === 'string') {
      // Match ${VAR_NAME} pattern
      return obj.replace(/\$\{([^}]+)\}/g, (match, varName) => {
        return process.env[varName] || match;
      });
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.resolveEnvVars(item));
    }

    if (obj && typeof obj === 'object') {
      const resolved: any = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = this.resolveEnvVars(value);
      }
      return resolved;
    }

    return obj;
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(target: any, source: any): any {
    const output = { ...target };

    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            output[key] = source[key];
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          output[key] = source[key];
        }
      });
    }

    return output;
  }

  /**
   * Check if value is an object
   */
  private isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * Get config file path
   */
  getConfigPath(): string {
    return this.configPath;
  }
}
