/**
 * Zod Config Schema
 *
 * Validates NimbusConfig at load time and on set() operations.
 * Uses safeParse to gracefully handle invalid configs without crashing.
 */

import { z } from 'zod';

export const WorkspaceConfigSchema = z.object({
  defaultProvider: z.string().optional(),
  outputDirectory: z.string().optional(),
  name: z.string().optional(),
});

export const CostOptimizationConfigSchema = z.object({
  enabled: z.boolean().optional(),
  cheap_model: z.string().optional(),
  expensive_model: z.string().optional(),
  // A5/A6: task-category routing arrays
  use_cheap_model_for: z.array(z.string()).optional(),
  use_expensive_model_for: z.array(z.string()).optional(),
});

// A3/A4: per-provider configuration map entry
export const ProviderConfigSchema = z.object({
  api_key: z.string().optional(),
  base_url: z.string().url().optional(),
  models: z.array(z.string()).optional(),
});

// A7/A8: provider fallback configuration
export const FallbackConfigSchema = z.object({
  enabled: z.boolean().optional(),
  providers: z.array(z.string()).optional(),
});

export const LLMConfigSchema = z.object({
  defaultModel: z.string().optional(),
  // A2: explicit default provider name
  default_provider: z.string().optional(),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().positive().optional(),
  cost_optimization: CostOptimizationConfigSchema.optional(),
  // A3/A4: per-provider configuration keyed by provider name
  providers: z.record(z.string(), ProviderConfigSchema).optional(),
  // A7/A8: fallback provider chain
  fallback: FallbackConfigSchema.optional(),
});

export const HistoryConfigSchema = z.object({
  maxEntries: z.number().positive().optional(),
  enabled: z.boolean().optional(),
});

export const AutoApproveConfigSchema = z.object({
  read: z.boolean().optional(),
  generate: z.boolean().optional(),
  create: z.boolean().optional(),
  update: z.boolean().optional(),
  delete: z.boolean().optional(),
});

export const SafetyConfigSchema = z.object({
  requireConfirmation: z.boolean().optional(),
  dryRunByDefault: z.boolean().optional(),
  auto_approve: AutoApproveConfigSchema.optional(),
});

export const UIConfigSchema = z.object({
  theme: z.enum(['dark', 'light', 'auto']).optional(),
  colors: z.boolean().optional(),
  spinner: z.enum(['dots', 'line', 'simple']).optional(),
});

export const PersonaConfigSchema = z.object({
  // A9: added 'custom' to the mode enum
  mode: z.enum(['professional', 'assistant', 'expert', 'standard', 'concise', 'detailed', 'custom']).optional(),
  verbosity: z.enum(['minimal', 'normal', 'detailed', 'verbose']).optional(),
  custom: z.string().optional(),
});

export const CloudProviderConfigSchema = z.object({
  default_region: z.string().optional(),
  default_profile: z.string().optional(),
  default_project: z.string().optional(),
  default_subscription: z.string().optional(),
});

export const CloudConfigSchema = z.object({
  default_provider: z.enum(['aws', 'gcp', 'azure']).optional(),
  aws: CloudProviderConfigSchema.optional(),
  gcp: CloudProviderConfigSchema.optional(),
  azure: CloudProviderConfigSchema.optional(),
});

export const TerraformDefaultsSchema = z.object({
  default_backend: z.enum(['s3', 'gcs', 'azurerm', 'local']).optional(),
  state_bucket: z.string().optional(),
  lock_table: z.string().optional(),
});

export const KubernetesDefaultsSchema = z.object({
  default_context: z.string().optional(),
  default_namespace: z.string().optional(),
});

export const NimbusConfigSchema = z.object({
  version: z.number().optional(),
  // A1: opt-in/out of anonymous telemetry
  telemetry: z.boolean().optional(),
  workspace: WorkspaceConfigSchema.optional(),
  llm: LLMConfigSchema.optional(),
  history: HistoryConfigSchema.optional(),
  safety: SafetyConfigSchema.optional(),
  ui: UIConfigSchema.optional(),
  persona: PersonaConfigSchema.optional(),
  cloud: CloudConfigSchema.optional(),
  terraform: TerraformDefaultsSchema.optional(),
  kubernetes: KubernetesDefaultsSchema.optional(),
});

export type ValidatedNimbusConfig = z.infer<typeof NimbusConfigSchema>;
