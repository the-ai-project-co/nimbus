/**
 * Cloud Credential Management Commands
 *
 * Validate and display cloud provider credentials.
 *
 * Usage:
 *   nimbus auth aws [--profile <name>]
 *   nimbus auth gcp [--project <name>]
 *   nimbus auth azure [--subscription <id>]
 */

import { logger } from '../utils';
import { ui } from '../wizard/ui';

export interface AuthCloudOptions {
  profile?: string;
  project?: string;
  subscription?: string;
  region?: string;
}

/**
 * Check if a CLI tool is installed
 */
async function isCliInstalled(cmd: string): Promise<boolean> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);

  try {
    await execFileAsync(cmd, ['--version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a CLI command and capture output
 */
async function runCommand(
  cmd: string,
  args: string[]
): Promise<{ stdout: string; success: boolean }> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: 15000 });
    return { stdout: stdout.trim(), success: true };
  } catch (error: any) {
    return { stdout: error.stdout?.trim() || error.message, success: false };
  }
}

/**
 * nimbus auth aws — Validate AWS credentials
 */
export async function authAwsCommand(options: AuthCloudOptions = {}): Promise<void> {
  logger.info('Validating AWS credentials', { options });

  ui.header('AWS Credentials');

  // Check if AWS CLI is installed
  const installed = await isCliInstalled('aws');
  if (!installed) {
    ui.error('AWS CLI is not installed');
    ui.newLine();
    ui.print('Install the AWS CLI:');
    ui.print(`  ${ui.dim('brew install awscli')} (macOS)`);
    ui.print(`  ${ui.dim('pip install awscli')} (pip)`);
    ui.print(`  ${ui.dim('https://aws.amazon.com/cli/')} (official)`);
    return;
  }

  ui.startSpinner({ message: 'Validating AWS credentials...' });

  // Get caller identity
  const identityArgs = ['sts', 'get-caller-identity', '--output', 'json'];
  if (options.profile) {
    identityArgs.push('--profile', options.profile);
  }

  const identity = await runCommand('aws', identityArgs);

  if (!identity.success) {
    ui.stopSpinnerFail('AWS credentials validation failed');
    ui.newLine();
    ui.error('Unable to validate AWS credentials');
    ui.print(ui.dim(identity.stdout));
    ui.newLine();
    ui.print('Configure credentials:');
    ui.print(`  ${ui.dim('aws configure')}`);
    ui.print(`  ${ui.dim('export AWS_ACCESS_KEY_ID=...')}`);
    ui.print(`  ${ui.dim('export AWS_SECRET_ACCESS_KEY=...')}`);
    return;
  }

  ui.stopSpinnerSuccess('AWS credentials valid');
  ui.newLine();

  // Parse identity
  try {
    const data = JSON.parse(identity.stdout);
    ui.print(`  ${ui.bold('Account:')}  ${data.Account}`);
    ui.print(`  ${ui.bold('User ARN:')} ${data.Arn}`);
    ui.print(`  ${ui.bold('User ID:')}  ${data.UserId}`);
  } catch {
    ui.print(`  ${identity.stdout}`);
  }

  // Get current region
  const regionArgs = ['configure', 'get', 'region'];
  if (options.profile) {
    regionArgs.push('--profile', options.profile);
  }

  const region = await runCommand('aws', regionArgs);
  if (region.success && region.stdout) {
    ui.print(`  ${ui.bold('Region:')}   ${region.stdout}`);
  }

  if (options.profile) {
    ui.print(`  ${ui.bold('Profile:')}  ${options.profile}`);
  }

  ui.newLine();
  ui.success('AWS credentials are configured and valid');
}

/**
 * nimbus auth gcp — Validate GCP credentials
 */
export async function authGcpCommand(options: AuthCloudOptions = {}): Promise<void> {
  logger.info('Validating GCP credentials', { options });

  ui.header('GCP Credentials');

  // Check if gcloud CLI is installed
  const installed = await isCliInstalled('gcloud');
  if (!installed) {
    ui.error('Google Cloud SDK (gcloud) is not installed');
    ui.newLine();
    ui.print('Install the Google Cloud SDK:');
    ui.print(`  ${ui.dim('brew install google-cloud-sdk')} (macOS)`);
    ui.print(`  ${ui.dim('https://cloud.google.com/sdk/docs/install')} (official)`);
    return;
  }

  ui.startSpinner({ message: 'Validating GCP credentials...' });

  // Get current account
  const account = await runCommand('gcloud', [
    'auth',
    'list',
    '--filter=status:ACTIVE',
    '--format=value(account)',
  ]);

  if (!account.success || !account.stdout) {
    ui.stopSpinnerFail('GCP credentials validation failed');
    ui.newLine();
    ui.error('No active GCP credentials found');
    ui.print('Configure credentials:');
    ui.print(`  ${ui.dim('gcloud auth login')}`);
    ui.print(`  ${ui.dim('gcloud auth application-default login')}`);
    return;
  }

  ui.stopSpinnerSuccess('GCP credentials valid');
  ui.newLine();

  ui.print(`  ${ui.bold('Account:')} ${account.stdout}`);

  // Check Application Default Credentials
  const adcCheck = await runCommand('gcloud', [
    'auth',
    'application-default',
    'print-access-token',
  ]);
  if (adcCheck.success) {
    ui.print(`  ${ui.bold('ADC:')}     ${ui.color('configured', 'green')}`);
  } else {
    ui.print(`  ${ui.bold('ADC:')}     ${ui.color('not configured', 'yellow')}`);
    ui.print(ui.dim('  Set with: gcloud auth application-default login'));
  }

  // Get current project
  const projectArgs = options.project
    ? ['config', 'get-value', 'project', '--project', options.project]
    : ['config', 'get-value', 'project'];
  const project = await runCommand('gcloud', projectArgs);
  if (project.success && project.stdout && project.stdout !== '(unset)') {
    ui.print(`  ${ui.bold('Project:')} ${project.stdout}`);
  } else if (options.project) {
    ui.print(`  ${ui.bold('Project:')} ${options.project}`);
  } else {
    ui.print(`  ${ui.bold('Project:')} ${ui.color('not set', 'yellow')}`);
    ui.print(ui.dim('  Set with: gcloud config set project PROJECT_ID'));
  }

  // Get current region
  const region = await runCommand('gcloud', ['config', 'get-value', 'compute/region']);
  if (region.success && region.stdout && region.stdout !== '(unset)') {
    ui.print(`  ${ui.bold('Region:')}  ${region.stdout}`);
  }

  ui.newLine();
  ui.success('GCP credentials are configured and valid');
}

/**
 * nimbus auth azure — Validate Azure credentials
 */
export async function authAzureCommand(options: AuthCloudOptions = {}): Promise<void> {
  logger.info('Validating Azure credentials', { options });

  ui.header('Azure Credentials');

  // Check if az CLI is installed
  const installed = await isCliInstalled('az');
  if (!installed) {
    ui.error('Azure CLI (az) is not installed');
    ui.newLine();
    ui.print('Install the Azure CLI:');
    ui.print(`  ${ui.dim('brew install azure-cli')} (macOS)`);
    ui.print(
      `  ${ui.dim('https://learn.microsoft.com/en-us/cli/azure/install-azure-cli')} (official)`
    );
    return;
  }

  ui.startSpinner({ message: 'Validating Azure credentials...' });

  // Get current account
  const account = await runCommand('az', ['account', 'show', '--output', 'json']);

  if (!account.success) {
    ui.stopSpinnerFail('Azure credentials validation failed');
    ui.newLine();
    ui.error('No active Azure credentials found');
    ui.print('Configure credentials:');
    ui.print(`  ${ui.dim('az login')}`);
    return;
  }

  ui.stopSpinnerSuccess('Azure credentials valid');
  ui.newLine();

  try {
    const data = JSON.parse(account.stdout);
    ui.print(`  ${ui.bold('Subscription:')} ${data.name} (${data.id})`);
    ui.print(`  ${ui.bold('Tenant:')}       ${data.tenantId}`);
    ui.print(`  ${ui.bold('State:')}        ${data.state}`);

    if (data.user) {
      ui.print(`  ${ui.bold('User:')}         ${data.user.name} (${data.user.type})`);
    }
  } catch {
    ui.print(`  ${account.stdout}`);
  }

  ui.newLine();
  ui.success('Azure credentials are configured and valid');
}

/**
 * Cloud auth parent command router
 */
export async function authCloudCommand(
  provider: string,
  options: AuthCloudOptions = {}
): Promise<void> {
  switch (provider) {
    case 'aws':
      await authAwsCommand(options);
      break;
    case 'gcp':
    case 'google':
      await authGcpCommand(options);
      break;
    case 'azure':
      await authAzureCommand(options);
      break;
    default:
      ui.error(`Unknown cloud provider: ${provider}`);
      ui.newLine();
      ui.print('Supported providers:');
      ui.print('  nimbus auth aws     — Validate AWS credentials');
      ui.print('  nimbus auth gcp     — Validate GCP credentials');
      ui.print('  nimbus auth azure   — Validate Azure credentials');
  }
}
