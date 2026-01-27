/**
 * Nimbus Configuration
 */
export interface NimbusConfig {
  version: number;
  telemetry: boolean;
  llm: LLMConfig;
  persona: PersonaConfig;
  safety: SafetyConfig;
  cloud: CloudConfig;
  terraform: TerraformConfig;
  kubernetes: KubernetesConfig;
  ui: UIConfig;
}

export interface LLMConfig {
  defaultProvider: string;
  defaultModel: string;
  providers: Record<string, LLMProviderConfig>;
  costOptimization?: CostOptimizationConfig;
}

export interface LLMProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  models: string[];
}

export interface CostOptimizationConfig {
  enabled: boolean;
  useCheapModelFor?: string[];
  useExpensiveModelFor?: string[];
}

export interface PersonaConfig {
  mode: 'professional' | 'assistant' | 'expert';
  verbosity: 'minimal' | 'normal' | 'detailed';
}

export interface SafetyConfig {
  dryRun: boolean;
  requireConfirmation: boolean;
  autoApprove: Record<string, boolean>;
}

export interface CloudConfig {
  defaultProvider: string;
  aws?: AWSConfig;
  gcp?: GCPConfig;
  azure?: AzureConfig;
}

export interface AWSConfig {
  defaultRegion: string;
  defaultProfile: string;
}

export interface GCPConfig {
  defaultProject: string;
  defaultRegion: string;
}

export interface AzureConfig {
  defaultSubscription: string;
  defaultRegion: string;
}

export interface TerraformConfig {
  defaultBackend: string;
  stateBucket?: string;
  lockTable?: string;
}

export interface KubernetesConfig {
  defaultContext: string;
  defaultNamespace: string;
}

export interface UIConfig {
  theme: 'light' | 'dark';
  colors: boolean;
  spinner: string;
}
