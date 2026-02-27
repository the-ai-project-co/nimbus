/**
 * GCP IAM CLI Commands
 *
 * Operations for IAM service accounts and roles
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../utils';
import { ui } from '../../wizard/ui';
import type { GcpCommandOptions } from './index';

const execFileAsync = promisify(execFile);

/**
 * Main IAM command router
 */
export async function iamCommand(
  action: string,
  args: string[],
  options: GcpCommandOptions
): Promise<void> {
  logger.info('Running GCP IAM command', { action, args, options });

  switch (action) {
    case 'service-accounts':
    case 'sa':
      await listServiceAccounts(options);
      break;

    case 'describe-sa':
      if (!args[0]) {
        ui.error('Service account email required');
        return;
      }
      await describeServiceAccount(args[0], options);
      break;

    case 'roles':
      await listRoles(options);
      break;

    case 'describe-role':
      if (!args[0]) {
        ui.error('Role name required');
        return;
      }
      await describeRole(args[0], options);
      break;

    case 'bindings':
      await listBindings(options);
      break;

    default:
      showIamHelp();
      break;
  }
}

/**
 * List service accounts
 */
async function listServiceAccounts(options: GcpCommandOptions): Promise<void> {
  ui.header('Service Accounts');
  ui.newLine();

  const gcloudArgs = ['iam', 'service-accounts', 'list', '--format=json'];
  if (options.project) {
    gcloudArgs.push(`--project=${options.project}`);
  }

  try {
    ui.startSpinner({ message: 'Fetching service accounts...' });
    const { stdout } = await execFileAsync('gcloud', gcloudArgs);
    ui.stopSpinnerSuccess('Service accounts fetched');

    const accounts = JSON.parse(stdout || '[]');

    if (accounts.length === 0) {
      ui.info('No service accounts found');
      return;
    }

    ui.print(`Found ${accounts.length} service account(s)\n`);

    // Display table
    ui.print(ui.color(`${'Display Name'.padEnd(30) + 'Email'.padEnd(50)}Disabled`, 'cyan'));
    ui.print('─'.repeat(90));

    for (const account of accounts) {
      const displayName = account.displayName?.substring(0, 29) || '(no name)';
      const email = account.email?.substring(0, 49) || '';
      const disabled = account.disabled ? 'Yes' : 'No';

      ui.print(`${displayName.padEnd(30)}${email.padEnd(50)}${disabled}`);
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch service accounts');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list service accounts', { error: message });
    ui.error(`Failed to list service accounts: ${message}`);
  }
}

/**
 * Describe a specific service account
 */
async function describeServiceAccount(email: string, options: GcpCommandOptions): Promise<void> {
  ui.header(`Service Account: ${email}`);
  ui.newLine();

  const gcloudArgs = ['iam', 'service-accounts', 'describe', email, '--format=json'];
  if (options.project) {
    gcloudArgs.push(`--project=${options.project}`);
  }

  try {
    ui.startSpinner({ message: 'Fetching service account details...' });
    const { stdout } = await execFileAsync('gcloud', gcloudArgs);
    ui.stopSpinnerSuccess('Details fetched');

    const account = JSON.parse(stdout);

    ui.print(ui.bold('Basic Information:'));
    ui.print(`  Display Name:   ${account.displayName || '(none)'}`);
    ui.print(`  Email:          ${account.email}`);
    ui.print(`  Unique ID:      ${account.uniqueId}`);
    ui.print(`  Disabled:       ${account.disabled ? 'Yes' : 'No'}`);
    ui.print(`  Description:    ${account.description || '(none)'}`);
    ui.newLine();

    // Get keys
    try {
      const keysArgs = [
        'iam',
        'service-accounts',
        'keys',
        'list',
        '--iam-account',
        email,
        '--format=json',
      ];
      if (options.project) {
        keysArgs.push(`--project=${options.project}`);
      }
      const { stdout: keysOutput } = await execFileAsync('gcloud', keysArgs);
      const keys = JSON.parse(keysOutput || '[]');

      ui.print(ui.bold('Keys:'));
      if (keys.length === 0) {
        ui.print('  No keys found');
      } else {
        for (const key of keys) {
          const keyId = key.name?.split('/').pop() || '';
          const keyType = key.keyType || '';
          const validAfter = key.validAfterTime || '';
          const validBefore = key.validBeforeTime || '';

          ui.print(`  Key ID:         ${keyId}`);
          ui.print(`    Type:         ${keyType}`);
          ui.print(`    Valid After:  ${validAfter}`);
          ui.print(`    Valid Before: ${validBefore}`);
          ui.newLine();
        }
      }
    } catch {
      ui.print(ui.bold('Keys:'));
      ui.print('  Unable to fetch keys');
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch details');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to describe service account', { error: message });
    ui.error(`Failed to describe service account: ${message}`);
  }
}

/**
 * List predefined roles
 */
async function listRoles(options: GcpCommandOptions): Promise<void> {
  ui.header('IAM Roles');
  ui.newLine();

  // List project-level custom roles
  const gcloudArgs = ['iam', 'roles', 'list', '--format=json'];
  if (options.project) {
    gcloudArgs.push(`--project=${options.project}`);
  }

  try {
    ui.startSpinner({ message: 'Fetching roles...' });
    const { stdout } = await execFileAsync('gcloud', gcloudArgs);
    ui.stopSpinnerSuccess('Roles fetched');

    const roles = JSON.parse(stdout || '[]');

    if (roles.length === 0) {
      ui.info(
        'No custom roles found. Use gcloud iam roles list --filter="stage=GA" to see predefined roles.'
      );
      return;
    }

    ui.print(`Found ${roles.length} custom role(s)\n`);

    // Display table
    ui.print(ui.color(`${'Name'.padEnd(40) + 'Title'.padEnd(35)}Stage`, 'cyan'));
    ui.print('─'.repeat(85));

    for (const role of roles) {
      const name = role.name?.split('/').pop()?.substring(0, 39) || '';
      const title = role.title?.substring(0, 34) || '';
      const stage = role.stage || '';

      ui.print(`${name.padEnd(40)}${title.padEnd(35)}${stage}`);
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch roles');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list roles', { error: message });
    ui.error(`Failed to list roles: ${message}`);
  }
}

/**
 * Describe a specific role
 */
async function describeRole(roleName: string, options: GcpCommandOptions): Promise<void> {
  ui.header(`Role: ${roleName}`);
  ui.newLine();

  const gcloudArgs = ['iam', 'roles', 'describe', roleName, '--format=json'];
  if (options.project && !roleName.startsWith('roles/')) {
    gcloudArgs.push(`--project=${options.project}`);
  }

  try {
    ui.startSpinner({ message: 'Fetching role details...' });
    const { stdout } = await execFileAsync('gcloud', gcloudArgs);
    ui.stopSpinnerSuccess('Details fetched');

    const role = JSON.parse(stdout);

    ui.print(ui.bold('Basic Information:'));
    ui.print(`  Name:           ${role.name}`);
    ui.print(`  Title:          ${role.title}`);
    ui.print(`  Description:    ${role.description || '(none)'}`);
    ui.print(`  Stage:          ${role.stage}`);
    ui.print(`  ETag:           ${role.etag}`);
    ui.newLine();

    ui.print(ui.bold('Permissions:'));
    const permissions = role.includedPermissions || [];
    if (permissions.length === 0) {
      ui.print('  No permissions');
    } else {
      ui.print(`  Total: ${permissions.length} permission(s)`);
      // Show first 20 permissions
      const displayPerms = permissions.slice(0, 20);
      for (const perm of displayPerms) {
        ui.print(`    ${perm}`);
      }
      if (permissions.length > 20) {
        ui.print(ui.dim(`    ... and ${permissions.length - 20} more`));
      }
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch details');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to describe role', { error: message });
    ui.error(`Failed to describe role: ${message}`);
  }
}

/**
 * List IAM bindings for the project
 */
async function listBindings(options: GcpCommandOptions): Promise<void> {
  ui.header('IAM Policy Bindings');
  ui.newLine();

  let projectId = options.project || '';

  if (!projectId) {
    // Get current project
    try {
      const { stdout: projectOut } = await execFileAsync('gcloud', [
        'config',
        'get-value',
        'project',
      ]);
      projectId = projectOut.trim();
    } catch {
      ui.error('Project not specified and no default project configured');
      return;
    }
  }

  const gcloudArgs = ['projects', 'get-iam-policy', projectId, '--format=json'];

  try {
    ui.startSpinner({ message: 'Fetching IAM policy...' });
    const { stdout } = await execFileAsync('gcloud', gcloudArgs);
    ui.stopSpinnerSuccess('Policy fetched');

    const policy = JSON.parse(stdout);
    const bindings = policy.bindings || [];

    if (bindings.length === 0) {
      ui.info('No IAM bindings found');
      return;
    }

    ui.print(`Found ${bindings.length} binding(s)\n`);

    for (const binding of bindings) {
      ui.print(ui.bold(`Role: ${binding.role}`));
      ui.print('  Members:');
      for (const member of binding.members || []) {
        ui.print(`    - ${member}`);
      }
      ui.newLine();
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch policy');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get IAM policy', { error: message });
    ui.error(`Failed to get IAM policy: ${message}`);
  }
}

/**
 * Show IAM help
 */
function showIamHelp(): void {
  ui.print(ui.bold('IAM Commands:'));
  ui.print('  service-accounts           List all service accounts');
  ui.print('  describe-sa <email>        Show service account details');
  ui.print('  roles                      List custom roles');
  ui.print('  describe-role <name>       Show role details');
  ui.print('  bindings                   Show project IAM policy bindings');
}
