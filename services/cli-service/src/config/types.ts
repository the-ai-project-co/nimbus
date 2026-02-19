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
 * Cost optimization routing configuration
 */
export interface CostOptimizationConfig {
  /** Enable LLM cost optimization routing */
  enabled?: boolean;
  /** Model for simple tasks (summaries, classification) */
  cheap_model?: string;
  /** Model for complex tasks (code generation, reasoning) */
  expensive_model?: string;
  /** Task categories that should use the cheap model */
  use_cheap_model_for?: string[];
  /** Task categories that should use the expensive model */
  use_expensive_model_for?: string[];
}

/**
 * Per-provider LLM configuration (A3/A4)
 */
export interface ProviderConfig {
  /** API key for this provider */
  api_key?: string;
  /** Base URL for custom API endpoints (e.g., self-hosted or proxy) */
  base_url?: string;
  /** Available models for this provider */
  models?: string[];
}

/**
 * LLM fallback configuration (A7/A8)
 */
export interface FallbackConfig {
  /** Enable fallback to alternative providers on failure */
  enabled?: boolean;
  /** Ordered list of provider names to try on failure */
  providers?: string[];
}

/**
 * LLM-related configuration
 */
export interface LLMConfig {
  /** Default model to use */
  defaultModel?: string;
  /** Default LLM provider name (A2) */
  default_provider?: string;
  /** Temperature for generation (0-1) */
  temperature?: number;
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Cost optimization settings */
  cost_optimization?: CostOptimizationConfig;
  /** Per-provider configuration map (A3/A4) */
  providers?: Record<string, ProviderConfig>;
  /** Fallback provider configuration (A7/A8) */
  fallback?: FallbackConfig;
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
 * Persona configuration for chat behavior
 */
export interface PersonaConfig {
  /** Persona mode (standard, concise, detailed, expert, custom) */
  mode?: 'professional' | 'assistant' | 'expert' | 'standard' | 'concise' | 'detailed' | 'custom';
  /** Verbosity level (minimal, normal, verbose, detailed) */
  verbosity?: 'minimal' | 'normal' | 'verbose' | 'detailed';
  /** Custom persona prompt override */
  custom?: string;
}

/**
 * Cloud provider-specific configuration
 */
export interface CloudProviderConfig {
  /** Default region for the provider */
  default_region?: string;
  /** Default AWS profile */
  default_profile?: string;
  /** Default GCP project */
  default_project?: string;
  /** Default Azure subscription */
  default_subscription?: string;
}

/**
 * Cloud configuration across providers
 */
export interface CloudConfig {
  /** Default cloud provider */
  default_provider?: 'aws' | 'gcp' | 'azure';
  /** AWS-specific settings */
  aws?: CloudProviderConfig;
  /** GCP-specific settings */
  gcp?: CloudProviderConfig;
  /** Azure-specific settings */
  azure?: CloudProviderConfig;
}

/**
 * Terraform defaults
 */
export interface TerraformDefaults {
  /** Default backend type */
  default_backend?: 's3' | 'gcs' | 'azurerm' | 'local';
  /** State bucket name */
  state_bucket?: string;
  /** DynamoDB lock table (AWS) */
  lock_table?: string;
}

/**
 * Kubernetes defaults
 */
export interface KubernetesDefaults {
  /** Default kubectl context */
  default_context?: string;
  /** Default namespace */
  default_namespace?: string;
}

/**
 * Complete Nimbus configuration schema
 * Stored at ~/.nimbus/config.yaml
 */
export interface NimbusConfig {
  /** Config version for migrations */
  version: number;
  /** Enable anonymous telemetry/usage statistics (A1) */
  telemetry?: boolean;
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
  /** Persona settings */
  persona?: PersonaConfig;
  /** Cloud provider settings */
  cloud?: CloudConfig;
  /** Terraform defaults */
  terraform?: TerraformDefaults;
  /** Kubernetes defaults */
  kubernetes?: KubernetesDefaults;
}

/**
 * Flat key-value representation of config
 * Used for set/get operations like: llm.defaultModel
 */
export type ConfigKey =
  | 'telemetry'
  | 'workspace.defaultProvider'
  | 'workspace.outputDirectory'
  | 'workspace.name'
  | 'llm.defaultModel'
  | 'llm.default_provider'
  | 'llm.temperature'
  | 'llm.maxTokens'
  | 'llm.fallback.enabled'
  | 'llm.fallback.providers'
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
  | 'ui.spinner'
  | 'persona.mode'
  | 'persona.verbosity'
  | 'persona.custom'
  | 'cloud.default_provider'
  | 'cloud.aws.default_region'
  | 'cloud.aws.default_profile'
  | 'cloud.gcp.default_region'
  | 'cloud.gcp.default_project'
  | 'cloud.azure.default_region'
  | 'cloud.azure.default_subscription'
  | 'terraform.default_backend'
  | 'terraform.state_bucket'
  | 'terraform.lock_table'
  | 'kubernetes.default_context'
  | 'kubernetes.default_namespace'
  | 'llm.cost_optimization.enabled'
  | 'llm.cost_optimization.cheap_model'
  | 'llm.cost_optimization.expensive_model'
  | 'llm.cost_optimization.use_cheap_model_for'
  | 'llm.cost_optimization.use_expensive_model_for';

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
  {
    key: 'persona.mode',
    description: 'AI persona mode (standard, concise, detailed, expert)',
    type: 'string',
    defaultValue: 'standard',
  },
  {
    key: 'persona.verbosity',
    description: 'Response verbosity level (minimal, normal, verbose)',
    type: 'string',
    defaultValue: 'normal',
  },
  {
    key: 'persona.custom',
    description: 'Custom persona prompt override',
    type: 'string',
    defaultValue: '',
  },
  {
    key: 'cloud.default_provider',
    description: 'Default cloud provider (aws, gcp, azure)',
    type: 'string',
    defaultValue: 'aws',
  },
  {
    key: 'cloud.aws.default_region',
    description: 'Default AWS region',
    type: 'string',
    defaultValue: 'us-east-1',
  },
  {
    key: 'cloud.aws.default_profile',
    description: 'Default AWS CLI profile',
    type: 'string',
    defaultValue: 'default',
  },
  {
    key: 'cloud.gcp.default_region',
    description: 'Default GCP region',
    type: 'string',
    defaultValue: 'us-central1',
  },
  {
    key: 'cloud.gcp.default_project',
    description: 'Default GCP project ID',
    type: 'string',
  },
  {
    key: 'cloud.azure.default_region',
    description: 'Default Azure region',
    type: 'string',
    defaultValue: 'eastus',
  },
  {
    key: 'cloud.azure.default_subscription',
    description: 'Default Azure subscription ID',
    type: 'string',
  },
  {
    key: 'terraform.default_backend',
    description: 'Default Terraform backend (s3, gcs, azurerm, local)',
    type: 'string',
    defaultValue: 's3',
  },
  {
    key: 'terraform.state_bucket',
    description: 'Terraform state bucket name',
    type: 'string',
  },
  {
    key: 'terraform.lock_table',
    description: 'Terraform DynamoDB lock table name',
    type: 'string',
  },
  {
    key: 'kubernetes.default_context',
    description: 'Default kubectl context',
    type: 'string',
  },
  {
    key: 'kubernetes.default_namespace',
    description: 'Default Kubernetes namespace',
    type: 'string',
    defaultValue: 'default',
  },
  {
    key: 'llm.cost_optimization.enabled',
    description: 'Enable LLM cost optimization routing',
    type: 'boolean',
    defaultValue: false,
  },
  {
    key: 'llm.cost_optimization.cheap_model',
    description: 'Model for simple tasks (summaries, classification)',
    type: 'string',
    defaultValue: 'claude-haiku-4-20250514',
  },
  {
    key: 'llm.cost_optimization.expensive_model',
    description: 'Model for complex tasks (code generation, reasoning)',
    type: 'string',
    defaultValue: 'claude-sonnet-4-20250514',
  },
  // A1: Telemetry
  {
    key: 'telemetry',
    description: 'Enable anonymous usage statistics and error reporting',
    type: 'boolean',
    defaultValue: true,
  },
  // A2: LLM default provider
  {
    key: 'llm.default_provider',
    description: 'Default LLM provider to use (e.g. anthropic, openai, google)',
    type: 'string',
  },
  // A5: Cost optimization — cheap model task routing
  {
    key: 'llm.cost_optimization.use_cheap_model_for',
    description: 'Task categories that should be routed to the cheap model (JSON array)',
    type: 'string',
  },
  // A6: Cost optimization — expensive model task routing
  {
    key: 'llm.cost_optimization.use_expensive_model_for',
    description: 'Task categories that should be routed to the expensive model (JSON array)',
    type: 'string',
  },
  // A7: Fallback enabled
  {
    key: 'llm.fallback.enabled',
    description: 'Enable automatic fallback to alternative LLM providers on failure',
    type: 'boolean',
    defaultValue: false,
  },
  // A8: Fallback provider list
  {
    key: 'llm.fallback.providers',
    description: 'Ordered list of fallback LLM providers to try on failure (JSON array)',
    type: 'string',
  },
];
