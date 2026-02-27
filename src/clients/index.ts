/**
 * CLI Service Clients
 *
 * Exports clients for communicating with backend services
 */

// Low-level shared clients
export { RestClient } from './rest-client';
export type { RestClientOptions } from './rest-client';
export { WebSocketClient } from './ws-client';
export type { WebSocketClientOptions } from './ws-client';
export { ServiceURLs, WebSocketURLs } from './service-discovery';
export { ToolsClient } from './tools-client';

// High-level service clients
export {
  LLMClient,
  llmClient,
  type ChatMessage,
  type StreamingChunk,
  type ChatOptions,
} from './llm-client';

export {
  TerraformClient,
  terraformClient,
  type TerraformInitResult,
  type TerraformPlanResult,
  type TerraformApplyResult,
  type TerraformValidateResult,
  type TerraformFmtResult,
  type TerraformOutputResult,
  type TerraformWorkspaceResult,
  type TerraformImportResult,
} from './terraform-client';

export {
  K8sClient,
  k8sClient,
  type K8sResource,
  type K8sGetResult,
  type K8sApplyResult,
  type K8sDeleteResult,
  type K8sLogsResult,
} from './k8s-client';

export {
  HelmClient,
  helmClient,
  type HelmRelease,
  type HelmChart,
  type HelmInstallResult,
  type HelmUpgradeResult,
} from './helm-client';

export {
  GitClient,
  gitClient,
  type GitStatus,
  type GitCommit,
  type GitBranch,
  type GitRemote,
} from './git-client';

export {
  GeneratorClient,
  generatorClient,
  type ConversationResult,
  type GeneratedFile,
  type GenerationResult,
  type QuestionnaireResponse,
} from './generator-client';

export {
  CoreEngineClient,
  type DriftDetectParams,
  type DriftFixParams,
  type RollbackParams,
  type RollbackResult,
} from './core-engine-client';
