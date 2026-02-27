/**
 * Generator Module — barrel re-exports
 *
 * Provides embedded Terraform, Kubernetes, and Helm generators,
 * best practices engine, and conversational intent parser.
 */

export {
  TerraformProjectGenerator,
  type TerraformProjectConfig,
  type GeneratedFile,
  type ValidationReport,
  type ValidationItem,
} from './terraform';

export {
  KubernetesGenerator,
  createKubernetesGenerator,
  type K8sGeneratorConfig,
  type GeneratedManifest,
} from './kubernetes';

export { HelmGenerator, createHelmGenerator, type HelmChartConfig } from './helm';

export {
  BestPracticesEngine,
  type BestPracticeRule,
  type BestPracticeViolation,
  type BestPracticeReport,
} from './best-practices';

export {
  IntentParser,
  type ConversationalIntent,
  type IntentEntity,
  type NLUPattern,
} from './intent-parser';
