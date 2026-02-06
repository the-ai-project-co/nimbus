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
