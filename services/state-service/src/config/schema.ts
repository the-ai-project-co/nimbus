import { z } from 'zod';

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
  tone: z.enum(['professional', 'friendly', 'technical']).default('professional'),
  expertise: z.array(z.string()).default(['terraform', 'kubernetes', 'aws', 'gcp', 'azure']),
});

// Safety Configuration
export const SafetyConfigSchema = z.object({
  requireConfirmation: z.boolean().default(true),
  dryRunByDefault: z.boolean().default(true),
  maxCostPerOperation: z.number().positive().default(10.0),
  allowDestructiveOps: z.boolean().default(false),
  restrictedCommands: z.array(z.string()).default(['rm -rf', 'kubectl delete', 'terraform destroy']),
});

// Cloud Provider Configuration
export const CloudProviderConfigSchema = z.object({
  name: z.string(),
  region: z.string().optional(),
  credentialsPath: z.string().optional(),
  profile: z.string().optional(),
});

export const CloudConfigSchema = z.object({
  aws: CloudProviderConfigSchema.optional(),
  gcp: CloudProviderConfigSchema.optional(),
  azure: CloudProviderConfigSchema.optional(),
});

// Terraform Configuration
export const TerraformConfigSchema = z.object({
  version: z.string().default('latest'),
  backend: z.enum(['local', 's3', 'gcs', 'azurerm']).default('local'),
  backendConfig: z.record(z.string(), z.any()).optional(),
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
});

export type NimbusConfig = z.infer<typeof NimbusConfigSchema>;
export type LLMConfig = z.infer<typeof LLMConfigSchema>;
export type PersonaConfig = z.infer<typeof PersonaConfigSchema>;
export type SafetyConfig = z.infer<typeof SafetyConfigSchema>;
export type CloudConfig = z.infer<typeof CloudConfigSchema>;
export type TerraformConfig = z.infer<typeof TerraformConfigSchema>;
export type KubernetesConfig = z.infer<typeof KubernetesConfigSchema>;
export type UIConfig = z.infer<typeof UIConfigSchema>;

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
    expertise: ['terraform', 'kubernetes', 'aws', 'gcp', 'azure'],
  },
  safety: {
    requireConfirmation: true,
    dryRunByDefault: true,
    maxCostPerOperation: 10.0,
    allowDestructiveOps: false,
    restrictedCommands: ['rm -rf', 'kubectl delete', 'terraform destroy'],
  },
  cloud: {},
  terraform: {
    version: 'latest',
    backend: 'local',
    workingDirectory: '~/.nimbus/terraform',
    autoApprove: false,
    planTimeout: 300,
    applyTimeout: 600,
  },
  kubernetes: {
    kubeconfigPath: '~/.kube/config',
    defaultNamespace: 'default',
    helmVersion: 'latest',
  },
  ui: {
    theme: 'auto',
    editor: 'vscode',
    showCostEstimates: true,
    verboseOutput: false,
    logLevel: 'info',
  },
};
