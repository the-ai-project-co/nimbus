/**
 * CLI Commands
 *
 * Exports all available CLI commands
 */

export {
  generateTerraformCommand,
  type GenerateTerraformOptions,
} from './generate-terraform';

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
  helmRepoAddCommand,
  helmRepoUpdateCommand,
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
export {
  usageCommand,
  parseUsageOptions,
} from './usage';

// Enterprise: Audit commands
export {
  auditCommand,
  auditListCommand,
  auditExportCommand,
  parseAuditListOptions,
  parseAuditExportOptions,
} from './audit';

// Analyze command
export {
  analyzeCommand,
  parseAnalyzeOptions,
} from './analyze';

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
