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
