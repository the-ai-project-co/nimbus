import { z } from 'zod';
import { homedir } from 'os';
import { resolve } from 'path';

/**
 * Expand tilde (~) in paths to user home directory
 */
function expandTildePath(path: string): string {
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  return path;
}

// LLM Provider Configuration
export const LLMProviderConfigSchema = z.object({
  apiKey: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  enabled: z.boolean().default(true),
});

export const LLMConfigSchema = z.object({
  defaultProvider: z.enum(['anthropic', 'openai', 'google', 'ollama']).default('anthropic'),
  defaultModel: z.string().default('claude-sonnet-4-20250514'),
  providers: z.object({
    anthropic: LLMProviderConfigSchema.optional(),
    openai: LLMProviderConfigSchema.optional(),
    google: LLMProviderConfigSchema.optional(),
    ollama: LLMProviderConfigSchema.extend({
      baseUrl: z.string().url().optional(),
    }).optional(),
  }).optional(),
  costOptimization: z.boolean().default(true),
  enableFallback: z.boolean().default(true),
  fallbackProviders: z.array(z.string()).default(['anthropic', 'openai', 'google']),
});

// Persona Configuration
export const PersonaConfigSchema = z.object({
  name: z.string().default('Nimbus AI'),
  role: z.string().default('DevOps Assistant'),
  tone: z.enum(['professional', 'assistant', 'expert']).default('professional'),
  verbosity: z.enum(['minimal', 'normal', 'detailed']).default('normal'),
  expertise: z.array(z.string()).default(['terraform', 'kubernetes', 'aws', 'gcp', 'azure']),
});

// Safety Configuration
export const SafetyConfigSchema = z.object({
  requireConfirmation: z.boolean().default(true),
  dryRunByDefault: z.boolean().default(true),
  maxCostPerOperation: z.number().positive().default(10.0),
  allowDestructiveOps: z.boolean().default(false),
  restrictedCommands: z.array(z.string()).default(['rm -rf', 'kubectl delete', 'terraform destroy']),
  autoApprove: z.object({
    read: z.boolean().default(true),
    generate: z.boolean().default(true),
    create: z.boolean().default(false),
    update: z.boolean().default(false),
    delete: z.boolean().default(false),
  }).default({
    read: true,
    generate: true,
    create: false,
    update: false,
    delete: false,
  }),
});

// Cloud Provider Configuration
export const CloudProviderConfigSchema = z.object({
  name: z.string(),
  region: z.string().optional(),
  credentialsPath: z.string().optional(),
  profile: z.string().optional(),
});

export const AWSProviderConfigSchema = CloudProviderConfigSchema.extend({
  defaultRegion: z.string().default('us-east-1'),
  defaultProfile: z.string().default('default'),
});

export const GCPProviderConfigSchema = CloudProviderConfigSchema.extend({
  defaultProject: z.string().optional(),
  defaultRegion: z.string().default('us-central1'),
});

export const AzureProviderConfigSchema = CloudProviderConfigSchema.extend({
  defaultSubscription: z.string().optional(),
  defaultRegion: z.string().default('eastus'),
});

export const CloudConfigSchema = z.object({
  defaultProvider: z.enum(['aws', 'gcp', 'azure']).default('aws'),
  aws: AWSProviderConfigSchema.optional(),
  gcp: GCPProviderConfigSchema.optional(),
  azure: AzureProviderConfigSchema.optional(),
});

// Terraform Configuration
export const TerraformConfigSchema = z.object({
  version: z.string().default('latest'),
  backend: z.enum(['local', 's3', 'gcs', 'azurerm']).default('local'),
  backendConfig: z.record(z.string(), z.any()).optional(),
  stateBucket: z.string().optional(),
  lockTable: z.string().optional(),
  workingDirectory: z.string().default('~/.nimbus/terraform'),
  autoApprove: z.boolean().default(false),
  planTimeout: z.number().positive().default(300), // seconds
  applyTimeout: z.number().positive().default(600), // seconds
});

// Kubernetes Configuration
export const KubernetesConfigSchema = z.object({
  kubeconfigPath: z.string().default('~/.kube/config'),
  defaultNamespace: z.string().default('default'),
  defaultContext: z.string().optional(),
  helmVersion: z.string().default('latest'),
});

// UI Configuration
export const UIConfigSchema = z.object({
  theme: z.enum(['light', 'dark', 'auto']).default('auto'),
  editor: z.string().default('vscode'),
  showCostEstimates: z.boolean().default(true),
  verboseOutput: z.boolean().default(false),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  colors: z.boolean().default(true),
  spinner: z.enum(['dots', 'line', 'simple']).default('dots'),
});

// Telemetry Configuration
export const TelemetryConfigSchema = z.object({
  enabled: z.boolean().default(false),
  anonymousId: z.string().optional(),
  posthogApiKey: z.string().optional(),
  posthogHost: z.string().optional(),
});

// Main Configuration Schema
export const NimbusConfigSchema = z.object({
  version: z.string().default('1.0.0'),
  llm: LLMConfigSchema.optional().default(() => DEFAULT_CONFIG.llm),
  persona: PersonaConfigSchema.optional().default(() => DEFAULT_CONFIG.persona),
  safety: SafetyConfigSchema.optional().default(() => DEFAULT_CONFIG.safety),
  cloud: CloudConfigSchema.optional().default(() => DEFAULT_CONFIG.cloud),
  terraform: TerraformConfigSchema.optional().default(() => DEFAULT_CONFIG.terraform),
  kubernetes: KubernetesConfigSchema.optional().default(() => DEFAULT_CONFIG.kubernetes),
  ui: UIConfigSchema.optional().default(() => DEFAULT_CONFIG.ui),
  telemetry: TelemetryConfigSchema.optional().default(() => DEFAULT_CONFIG.telemetry),
});

export type NimbusConfig = z.infer<typeof NimbusConfigSchema>;
export type LLMConfig = z.infer<typeof LLMConfigSchema>;
export type PersonaConfig = z.infer<typeof PersonaConfigSchema>;
export type SafetyConfig = z.infer<typeof SafetyConfigSchema>;
export type CloudConfig = z.infer<typeof CloudConfigSchema>;
export type TerraformConfig = z.infer<typeof TerraformConfigSchema>;
export type KubernetesConfig = z.infer<typeof KubernetesConfigSchema>;
export type UIConfig = z.infer<typeof UIConfigSchema>;
export type TelemetryConfig = z.infer<typeof TelemetryConfigSchema>;

// Default configuration
export const DEFAULT_CONFIG: NimbusConfig = {
  version: '1.0.0',
  llm: {
    defaultProvider: 'anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    costOptimization: true,
    enableFallback: true,
    fallbackProviders: ['anthropic', 'openai', 'google'],
  },
  persona: {
    name: 'Nimbus AI',
    role: 'DevOps Assistant',
    tone: 'professional',
    verbosity: 'normal',
    expertise: ['terraform', 'kubernetes', 'aws', 'gcp', 'azure'],
  },
  safety: {
    requireConfirmation: true,
    dryRunByDefault: true,
    maxCostPerOperation: 10.0,
    allowDestructiveOps: false,
    restrictedCommands: ['rm -rf', 'kubectl delete', 'terraform destroy'],
    autoApprove: {
      read: true,
      generate: true,
      create: false,
      update: false,
      delete: false,
    },
  },
  cloud: {
    defaultProvider: 'aws',
  },
  terraform: {
    version: 'latest',
    backend: 'local',
    workingDirectory: expandTildePath('~/.nimbus/terraform'),
    autoApprove: false,
    planTimeout: 300,
    applyTimeout: 600,
  },
  kubernetes: {
    kubeconfigPath: expandTildePath('~/.kube/config'),
    defaultNamespace: 'default',
    helmVersion: 'latest',
  },
  ui: {
    theme: 'auto',
    editor: 'vscode',
    showCostEstimates: true,
    verboseOutput: false,
    logLevel: 'info',
    colors: true,
    spinner: 'dots',
  },
  telemetry: {
    enabled: false,
  },
};
