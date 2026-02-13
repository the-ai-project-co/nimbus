/**
 * Configuration Types
 *
 * Type definitions for Nimbus CLI configuration
 */

/**
 * Workspace configuration for a project
 */
export interface WorkspaceConfig {
  /** Default cloud provider (aws, gcp, azure) */
  defaultProvider?: string;
  /** Output directory for generated code */
  outputDirectory?: string;
  /** Project name */
  name?: string;
}

/**
 * LLM-related configuration
 */
export interface LLMConfig {
  /** Default model to use */
  defaultModel?: string;
  /** Temperature for generation (0-1) */
  temperature?: number;
  /** Maximum tokens for response */
  maxTokens?: number;
}

/**
 * History configuration
 */
export interface HistoryConfig {
  /** Maximum number of entries to keep */
  maxEntries?: number;
  /** Whether to save history */
  enabled?: boolean;
}

/**
 * Auto-approve settings per operation type
 */
export interface AutoApproveConfig {
  /** Auto-approve read operations (list, get, describe) */
  read?: boolean;
  /** Auto-approve generate operations (IaC generation) */
  generate?: boolean;
  /** Auto-approve create operations (apply, install) */
  create?: boolean;
  /** Auto-approve update operations (upgrade, scale) */
  update?: boolean;
  /** Auto-approve delete operations (delete, destroy, uninstall) */
  delete?: boolean;
}

/**
 * Safety configuration
 */
export interface SafetyConfig {
  /** Require confirmation for destructive operations */
  requireConfirmation?: boolean;
  /** Enable dry-run by default */
  dryRunByDefault?: boolean;
  /** Auto-approve settings per operation type */
  auto_approve?: AutoApproveConfig;
}

/**
 * UI configuration
 */
export interface UIConfig {
  /** Color theme */
  theme?: 'dark' | 'light' | 'auto';
  /** Enable colors in output */
  colors?: boolean;
  /** Spinner style */
  spinner?: 'dots' | 'line' | 'simple';
}

/**
 * Complete Nimbus configuration schema
 * Stored at ~/.nimbus/config.yaml
 */
export interface NimbusConfig {
  /** Config version for migrations */
  version: number;
  /** Workspace settings */
  workspace?: WorkspaceConfig;
  /** LLM settings */
  llm?: LLMConfig;
  /** History settings */
  history?: HistoryConfig;
  /** Safety settings */
  safety?: SafetyConfig;
  /** UI settings */
  ui?: UIConfig;
}

/**
 * Flat key-value representation of config
 * Used for set/get operations like: llm.defaultModel
 */
export type ConfigKey =
  | 'workspace.defaultProvider'
  | 'workspace.outputDirectory'
  | 'workspace.name'
  | 'llm.defaultModel'
  | 'llm.temperature'
  | 'llm.maxTokens'
  | 'history.maxEntries'
  | 'history.enabled'
  | 'safety.requireConfirmation'
  | 'safety.dryRunByDefault'
  | 'safety.auto_approve.read'
  | 'safety.auto_approve.generate'
  | 'safety.auto_approve.create'
  | 'safety.auto_approve.update'
  | 'safety.auto_approve.delete'
  | 'ui.theme'
  | 'ui.colors'
  | 'ui.spinner';

/**
 * Config key metadata for help/validation
 */
export interface ConfigKeyInfo {
  key: ConfigKey;
  description: string;
  type: 'string' | 'number' | 'boolean';
  defaultValue?: string | number | boolean;
}

/**
 * Registry of all config keys
 */
export const CONFIG_KEYS: ConfigKeyInfo[] = [
  {
    key: 'workspace.defaultProvider',
    description: 'Default cloud provider (aws, gcp, azure)',
    type: 'string',
    defaultValue: 'aws',
  },
  {
    key: 'workspace.outputDirectory',
    description: 'Output directory for generated code',
    type: 'string',
    defaultValue: './infrastructure',
  },
  {
    key: 'workspace.name',
    description: 'Project name',
    type: 'string',
  },
  {
    key: 'llm.defaultModel',
    description: 'Default LLM model to use',
    type: 'string',
  },
  {
    key: 'llm.temperature',
    description: 'Temperature for LLM generation (0-1)',
    type: 'number',
    defaultValue: 0.7,
  },
  {
    key: 'llm.maxTokens',
    description: 'Maximum tokens for LLM response',
    type: 'number',
    defaultValue: 4096,
  },
  {
    key: 'history.maxEntries',
    description: 'Maximum history entries to keep',
    type: 'number',
    defaultValue: 100,
  },
  {
    key: 'history.enabled',
    description: 'Enable command history',
    type: 'boolean',
    defaultValue: true,
  },
  {
    key: 'safety.requireConfirmation',
    description: 'Require confirmation for destructive operations',
    type: 'boolean',
    defaultValue: true,
  },
  {
    key: 'safety.dryRunByDefault',
    description: 'Enable dry-run mode by default',
    type: 'boolean',
    defaultValue: false,
  },
  {
    key: 'safety.auto_approve.read',
    description: 'Auto-approve read operations (list, get, describe)',
    type: 'boolean',
    defaultValue: true,
  },
  {
    key: 'safety.auto_approve.generate',
    description: 'Auto-approve generate operations (IaC generation)',
    type: 'boolean',
    defaultValue: true,
  },
  {
    key: 'safety.auto_approve.create',
    description: 'Auto-approve create operations (apply, install)',
    type: 'boolean',
    defaultValue: false,
  },
  {
    key: 'safety.auto_approve.update',
    description: 'Auto-approve update operations (upgrade, scale)',
    type: 'boolean',
    defaultValue: false,
  },
  {
    key: 'safety.auto_approve.delete',
    description: 'Auto-approve delete operations (delete, destroy, uninstall)',
    type: 'boolean',
    defaultValue: false,
  },
  {
    key: 'ui.theme',
    description: 'Color theme (dark, light, auto)',
    type: 'string',
    defaultValue: 'auto',
  },
  {
    key: 'ui.colors',
    description: 'Enable colors in output',
    type: 'boolean',
    defaultValue: true,
  },
  {
    key: 'ui.spinner',
    description: 'Spinner style (dots, line, simple)',
    type: 'string',
    defaultValue: 'dots',
  },
];
