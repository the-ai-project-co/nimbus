/**
 * CLI Commands
 *
 * Exports all available CLI commands
 */

export { generateTerraformCommand, type GenerateTerraformOptions } from './generate-terraform';

export {
  awsDiscoverCommand,
  type AwsDiscoverOptions,
  type AwsDiscoverContext,
} from './aws-discover';

export {
  awsTerraformCommand,
  type AwsTerraformOptions,
  type AwsTerraformContext,
} from './aws-terraform';

// Auth commands
export { loginCommand, type LoginOptions } from './login';
export { logoutCommand, type LogoutOptions } from './logout';
export { authStatusCommand, type AuthStatusOptions } from './auth-status';
export { authListCommand, type AuthListOptions } from './auth-list';

// Cloud auth commands
export {
  authCloudCommand,
  authAwsCommand,
  authGcpCommand,
  authAzureCommand,
  type AuthCloudOptions,
} from './auth-cloud';

// Chat command
export { chatCommand, type ChatOptions } from './chat';

// Config commands
export {
  configCommand,
  configSetCommand,
  configGetCommand,
  configListCommand,
  configInitCommand,
  configResetCommand,
  type ConfigOptions,
  type ConfigSetOptions,
  type ConfigGetOptions,
  type ConfigListOptions,
  type ConfigInitOptions,
} from './config';

// Init command
export { initCommand, type InitOptions } from './init';

// Infrastructure tool commands
export {
  tfCommand,
  tfInitCommand,
  tfPlanCommand,
  tfApplyCommand,
  tfValidateCommand,
  tfDestroyCommand,
  tfShowCommand,
  tfFmtCommand,
  tfWorkspaceCommand,
  tfImportCommand,
  tfOutputCommand,
  tfStateCommand,
  tfTaintCommand,
  tfUntaintCommand,
  tfGraphCommand,
  tfForceUnlockCommand,
  tfRefreshCommand,
  type TfCommandOptions,
} from './tf';

export {
  k8sCommand,
  k8sGetCommand,
  k8sApplyCommand,
  k8sDeleteCommand,
  k8sLogsCommand,
  k8sDescribeCommand,
  k8sScaleCommand,
  k8sExecCommand,
  k8sRolloutCommand,
  k8sPortForwardCommand,
  k8sNamespaceCommand,
  k8sTopCommand,
  k8sPatchCommand,
  k8sLabelCommand,
  k8sAnnotateCommand,
  type K8sCommandOptions,
} from './k8s';

export {
  helmCommand,
  helmListCommand,
  helmInstallCommand,
  helmUpgradeCommand,
  helmUninstallCommand,
  helmRollbackCommand,
  helmHistoryCommand,
  helmSearchCommand,
  helmShowCommand,
  helmRepoAddCommand,
  helmRepoUpdateCommand,
  helmLintCommand,
  helmTemplateCommand,
  helmPackageCommand,
  helmDependencyCommand,
  helmStatusCommand,
  type HelmCommandOptions,
} from './helm';

export {
  gitCommand,
  gitStatusCommand,
  gitAddCommand,
  gitCommitCommand,
  gitPushCommand,
  gitPullCommand,
  gitFetchCommand,
  gitLogCommand,
  gitBranchCommand,
  gitCheckoutCommand,
  gitDiffCommand,
  gitMergeCommand,
  gitStashCommand,
  gitTagCommand,
  gitRemoteCommand,
  gitResetCommand,
  gitRevertCommand,
  gitCherryPickCommand,
  gitBlameCommand,
  gitInitCommand,
  type GitCommandOptions,
} from './git';

// History command
export { historyCommand, historyShowCommand, type HistoryOptions } from './history';

// GitHub CLI commands
export {
  ghCommand,
  ghPrListCommand,
  ghPrViewCommand,
  ghPrCreateCommand,
  ghPrMergeCommand,
  ghIssueListCommand,
  ghIssueViewCommand,
  ghIssueCreateCommand,
  ghIssueCloseCommand,
  ghIssueCommentCommand,
  ghRepoInfoCommand,
  ghRepoBranchesCommand,
  type GhCommandOptions,
  type PrListOptions,
  type PrViewOptions,
  type PrCreateOptions,
  type PrMergeOptions,
  type IssueListOptions,
  type IssueViewOptions,
  type IssueCreateOptions,
  type IssueCloseOptions,
  type IssueCommentOptions,
  type RepoInfoOptions,
  type RepoBranchesOptions,
} from './gh';

// Enterprise: Team commands
export {
  teamCommand,
  teamCreateCommand,
  teamInviteCommand,
  teamMembersCommand,
  teamRemoveCommand,
  teamSwitchCommand,
  parseTeamCreateOptions,
  parseTeamInviteOptions,
  parseTeamMembersOptions,
  parseTeamRemoveOptions,
  parseTeamSwitchOptions,
} from './team';

// Enterprise: Billing commands
export {
  billingCommand,
  billingStatusCommand,
  billingUpgradeCommand,
  billingInvoicesCommand,
  billingCancelCommand,
  parseBillingStatusOptions,
  parseBillingUpgradeOptions,
  parseBillingInvoicesOptions,
} from './billing';

// Enterprise: Usage command
export { usageCommand, parseUsageOptions } from './usage';

// Enterprise: Audit commands
export {
  auditCommand,
  auditListCommand,
  auditExportCommand,
  parseAuditListOptions,
  parseAuditExportOptions,
} from './audit';

// Analyze command
export { analyzeCommand, parseAnalyzeOptions } from './analyze';

// Generate commands
export {
  generateK8sCommand,
  type GenerateK8sOptions,
  type K8sWizardContext,
  type K8sWorkloadType,
  type K8sServiceType,
} from './generate-k8s';

export {
  generateHelmCommand,
  type GenerateHelmOptions,
  type HelmWizardContext,
  type HelmEnvironment,
} from './generate-helm';

// Utility commands
export { versionCommand, type VersionOptions } from './version';
export { helpCommand, type HelpOptions } from './help';
export { doctorCommand, type DoctorOptions } from './doctor';

// Apply commands
export {
  applyCommand,
  applyTerraformCommand,
  applyK8sCommand,
  applyHelmCommand,
  parseApplyOptions,
  type ApplyOptions,
  type ApplyType,
  type ApplyTerraformOptions,
  type ApplyK8sOptions,
  type ApplyHelmOptions,
} from './apply';

// AI-powered commands
export { askCommand, type AskOptions } from './ask';
export { explainCommand, type ExplainOptions, type ExplainType } from './explain';
export { fixCommand, type FixOptions } from './fix';

// Plan command
export {
  planCommand,
  parsePlanOptions,
  displayPlan,
  type PlanOptions,
  type PlanType,
  type PlanResult,
} from './plan';

// Questionnaire command
export { questionnaireCommand, type QuestionnaireOptions } from './questionnaire';

// Preview command
export { previewCommand, type PreviewOptions } from './preview';

// Demo command
export {
  demoCommand,
  parseDemoOptions,
  runDemoScenario,
  listDemoScenarios,
  type DemoOptions,
} from './demo';

// AWS CLI commands
export { awsCommand, parseAwsOptions, type AwsCommandOptions } from './aws';

// GCP CLI commands
export { gcpCommand, parseGcpOptions, type GcpCommandOptions } from './gcp';

// Azure CLI commands
export { azureCommand, parseAzureOptions, type AzureCommandOptions } from './azure';

// Drift detection and remediation commands
export {
  driftCommand,
  driftDetectCommand,
  driftFixCommand,
  parseDriftDetectOptions,
  parseDriftFixOptions,
  type DriftDetectOptions,
  type DriftFixOptions,
} from './drift';

// Cost estimation and tracking commands
export {
  costCommand,
  costEstimateCommand,
  costHistoryCommand,
  parseCostEstimateOptions,
  parseCostHistoryOptions,
  type CostEstimateOptions,
  type CostHistoryOptions,
} from './cost';

// Import command
export { importCommand, parseImportOptions, type ImportOptions } from './import';

// Feedback command
export { feedbackCommand, parseFeedbackOptions, type FeedbackOptions } from './feedback';

// File system commands
export {
  fsCommand,
  fsListCommand,
  fsSearchCommand,
  fsReadCommand,
  fsTreeCommand,
  fsWriteCommand,
  fsDiffCommand,
  type FsCommandOptions,
} from './fs';

// Resume command (checkpoint/resume system)
export { resumeCommand, type ResumeOptions } from './resume';

// Template commands
export { templateCommand, type TemplateCommandOptions } from './template';

// Auth profile commands
export { authProfileCommand } from './auth-profile';

// Onboarding command
export { onboardingCommand, needsOnboarding, type OnboardingOptions } from './onboarding';

// ===== Top-Level Aliases =====
// These re-exports provide short-form access to common commands

// GitHub aliases: nimbus pr -> nimbus gh pr
export { ghPrListCommand as prListCommand } from './gh';
export { ghPrCreateCommand as prCreateCommand } from './gh';
export { ghPrViewCommand as prViewCommand } from './gh';
export { ghPrMergeCommand as prMergeCommand } from './gh';
export { ghIssueListCommand as issueListCommand } from './gh';
export { ghIssueCreateCommand as issueCreateCommand } from './gh';
export { ghIssueViewCommand as issueViewCommand } from './gh';

// File system aliases: nimbus read -> nimbus fs read
export { fsReadCommand as readCommand } from './fs';
export { fsSearchCommand as searchCommand } from './fs';
export { fsWriteCommand as writeCommand } from './fs';
export { fsDiffCommand as diffCommand } from './fs';

// Top-level command aliases: short names -> full commands
// tf -> terraform (tfCommand)
export { tfCommand as terraformCommand } from './tf';
// k -> k8s (k8sCommand)
export { k8sCommand as kCommand } from './k8s';
// g -> generate (generateTerraformCommand serves as the base generate entry point)
export { generateTerraformCommand as gCommand } from './generate-terraform';
// h -> helm (helmCommand)
export { helmCommand as hCommand } from './helm';
