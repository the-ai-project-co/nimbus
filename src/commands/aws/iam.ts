/**
 * AWS IAM Commands
 *
 * IAM user, role, and policy operations
 *
 * Usage:
 *   nimbus aws iam users
 *   nimbus aws iam roles
 *   nimbus aws iam policies
 */

import { logger } from '../../utils';
import { ui } from '../../wizard/ui';
import type { AwsCommandOptions } from './index';

interface IAMUser {
  UserName: string;
  UserId: string;
  Arn: string;
  CreateDate: string;
  PasswordLastUsed?: string;
}

interface IAMRole {
  RoleName: string;
  RoleId: string;
  Arn: string;
  CreateDate: string;
  Description?: string;
}

interface IAMPolicy {
  PolicyName: string;
  PolicyId: string;
  Arn: string;
  CreateDate: string;
  AttachmentCount: number;
}

/**
 * IAM command router
 */
export async function iamCommand(
  action: string,
  args: string[],
  options: AwsCommandOptions
): Promise<void> {
  logger.info('Running IAM command', { action, args, options });

  switch (action) {
    case 'users':
      await listUsers(options);
      break;

    case 'roles':
      await listRoles(options);
      break;

    case 'policies':
      await listPolicies(options);
      break;

    case 'user':
      if (!args[0]) {
        ui.error('User name is required');
        ui.print('Usage: nimbus aws iam user <username>');
        return;
      }
      await describeUser(args[0], options);
      break;

    case 'role':
      if (!args[0]) {
        ui.error('Role name is required');
        ui.print('Usage: nimbus aws iam role <rolename>');
        return;
      }
      await describeRole(args[0], options);
      break;

    default:
      showIamHelp();
      break;
  }
}

/**
 * List all IAM users
 */
async function listUsers(options: AwsCommandOptions): Promise<void> {
  ui.header('IAM Users');

  ui.startSpinner({ message: 'Fetching IAM users...' });

  try {
    const result = await runAwsCommand<{ Users: IAMUser[] }>('iam list-users', options);

    const users = result.Users || [];

    ui.stopSpinnerSuccess(`Found ${users.length} user(s)`);
    ui.newLine();

    if (users.length === 0) {
      ui.info('No IAM users found');
      return;
    }

    // Display table
    const headers = ['Username', 'User ID', 'Created', 'Last Login'];
    const rows = users.map(user => [
      user.UserName,
      user.UserId,
      new Date(user.CreateDate).toLocaleDateString(),
      user.PasswordLastUsed ? new Date(user.PasswordLastUsed).toLocaleDateString() : 'Never',
    ]);

    displayTable(headers, rows);
  } catch (error) {
    ui.stopSpinnerFail('Failed to list users');
    ui.error((error as Error).message);
  }
}

/**
 * List all IAM roles
 */
async function listRoles(options: AwsCommandOptions): Promise<void> {
  ui.header('IAM Roles');

  ui.startSpinner({ message: 'Fetching IAM roles...' });

  try {
    const result = await runAwsCommand<{ Roles: IAMRole[] }>('iam list-roles', options);

    const roles = result.Roles || [];

    ui.stopSpinnerSuccess(`Found ${roles.length} role(s)`);
    ui.newLine();

    if (roles.length === 0) {
      ui.info('No IAM roles found');
      return;
    }

    // Display table (filter out AWS service roles by default)
    const customRoles = roles.filter(r => !r.RoleName.startsWith('AWS'));
    const headers = ['Role Name', 'Role ID', 'Created', 'Description'];
    const rows = customRoles.map(role => [
      role.RoleName,
      role.RoleId,
      new Date(role.CreateDate).toLocaleDateString(),
      role.Description || '-',
    ]);

    displayTable(headers, rows);

    if (customRoles.length < roles.length) {
      ui.newLine();
      ui.dim(`(${roles.length - customRoles.length} AWS service roles hidden)`);
    }
  } catch (error) {
    ui.stopSpinnerFail('Failed to list roles');
    ui.error((error as Error).message);
  }
}

/**
 * List all IAM policies
 */
async function listPolicies(options: AwsCommandOptions): Promise<void> {
  ui.header('IAM Policies');

  ui.startSpinner({ message: 'Fetching IAM policies...' });

  try {
    const result = await runAwsCommand<{ Policies: IAMPolicy[] }>(
      'iam list-policies --scope Local',
      options
    );

    const policies = result.Policies || [];

    ui.stopSpinnerSuccess(`Found ${policies.length} custom policy(ies)`);
    ui.newLine();

    if (policies.length === 0) {
      ui.info('No custom IAM policies found');
      return;
    }

    // Display table
    const headers = ['Policy Name', 'Policy ID', 'Attachments', 'Created'];
    const rows = policies.map(policy => [
      policy.PolicyName,
      policy.PolicyId,
      String(policy.AttachmentCount),
      new Date(policy.CreateDate).toLocaleDateString(),
    ]);

    displayTable(headers, rows);
  } catch (error) {
    ui.stopSpinnerFail('Failed to list policies');
    ui.error((error as Error).message);
  }
}

/**
 * Describe a specific IAM user
 */
async function describeUser(userName: string, options: AwsCommandOptions): Promise<void> {
  ui.header(`IAM User: ${userName}`);

  ui.startSpinner({ message: 'Fetching user details...' });

  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    // Get user details
    const userArgs = ['iam', 'get-user', '--user-name', userName, '--output', 'json'];
    if (options.profile) {
      userArgs.push('--profile', options.profile);
    }

    const { stdout: userOutput } = await execFileAsync('aws', userArgs);
    const userData = JSON.parse(userOutput);
    const user = userData.User;

    // Get user groups
    const groupArgs = ['iam', 'list-groups-for-user', '--user-name', userName, '--output', 'json'];
    if (options.profile) {
      groupArgs.push('--profile', options.profile);
    }

    const { stdout: groupOutput } = await execFileAsync('aws', groupArgs);
    const groupData = JSON.parse(groupOutput);
    const groups = groupData.Groups || [];

    ui.stopSpinnerSuccess('User details retrieved');
    ui.newLine();

    ui.print(ui.bold('User Details:'));
    ui.newLine();
    ui.print(`  Username:        ${user.UserName}`);
    ui.print(`  User ID:         ${user.UserId}`);
    ui.print(`  ARN:             ${user.Arn}`);
    ui.print(`  Created:         ${new Date(user.CreateDate).toLocaleString()}`);
    ui.print(
      `  Last Login:      ${user.PasswordLastUsed ? new Date(user.PasswordLastUsed).toLocaleString() : 'Never'}`
    );

    if (groups.length > 0) {
      ui.newLine();
      ui.print(ui.bold('Groups:'));
      for (const group of groups) {
        ui.print(`  - ${group.GroupName}`);
      }
    }
  } catch (error) {
    ui.stopSpinnerFail('Failed to describe user');
    ui.error((error as Error).message);
  }
}

/**
 * Describe a specific IAM role
 */
async function describeRole(roleName: string, options: AwsCommandOptions): Promise<void> {
  ui.header(`IAM Role: ${roleName}`);

  ui.startSpinner({ message: 'Fetching role details...' });

  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    // Get role details
    const roleArgs = ['iam', 'get-role', '--role-name', roleName, '--output', 'json'];
    if (options.profile) {
      roleArgs.push('--profile', options.profile);
    }

    const { stdout: roleOutput } = await execFileAsync('aws', roleArgs);
    const roleData = JSON.parse(roleOutput);
    const role = roleData.Role;

    // Get attached policies
    const policyArgs = [
      'iam',
      'list-attached-role-policies',
      '--role-name',
      roleName,
      '--output',
      'json',
    ];
    if (options.profile) {
      policyArgs.push('--profile', options.profile);
    }

    const { stdout: policyOutput } = await execFileAsync('aws', policyArgs);
    const policyData = JSON.parse(policyOutput);
    const policies = policyData.AttachedPolicies || [];

    ui.stopSpinnerSuccess('Role details retrieved');
    ui.newLine();

    ui.print(ui.bold('Role Details:'));
    ui.newLine();
    ui.print(`  Role Name:       ${role.RoleName}`);
    ui.print(`  Role ID:         ${role.RoleId}`);
    ui.print(`  ARN:             ${role.Arn}`);
    ui.print(`  Created:         ${new Date(role.CreateDate).toLocaleString()}`);
    if (role.Description) {
      ui.print(`  Description:     ${role.Description}`);
    }

    if (policies.length > 0) {
      ui.newLine();
      ui.print(ui.bold('Attached Policies:'));
      for (const policy of policies) {
        ui.print(`  - ${policy.PolicyName}`);
      }
    }
  } catch (error) {
    ui.stopSpinnerFail('Failed to describe role');
    ui.error((error as Error).message);
  }
}

/**
 * Run AWS CLI command and parse JSON output
 */
async function runAwsCommand<T>(command: string, options: AwsCommandOptions): Promise<T> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);

  const args = command.split(' ');
  const baseCommand = args[0];
  const commandArgs = args.slice(1);

  // Add common options
  if (options.profile) {
    commandArgs.push('--profile', options.profile);
  }
  commandArgs.push('--output', 'json');

  const { stdout } = await execFileAsync('aws', [baseCommand, ...commandArgs]);
  return JSON.parse(stdout) as T;
}

/**
 * Display a table
 */
function displayTable(headers: string[], rows: string[][]): void {
  // Calculate column widths
  const colWidths = headers.map((h, i) => {
    const maxDataWidth = Math.max(...rows.map(r => (r[i] || '').length));
    return Math.max(h.length, maxDataWidth);
  });

  // Print header
  const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join('  ');
  ui.print(ui.bold(headerRow));
  ui.print('-'.repeat(headerRow.length));

  // Print rows
  for (const row of rows) {
    const formattedRow = row.map((cell, i) => (cell || '').padEnd(colWidths[i])).join('  ');
    ui.print(formattedRow);
  }
}

/**
 * Show IAM command help
 */
function showIamHelp(): void {
  ui.print('Usage: nimbus aws iam <action> [args]');
  ui.newLine();

  ui.print(ui.bold('Actions:'));
  ui.print('  users             List all IAM users');
  ui.print('  roles             List all IAM roles');
  ui.print('  policies          List custom IAM policies');
  ui.print('  user <name>       Describe a specific user');
  ui.print('  role <name>       Describe a specific role');
  ui.newLine();

  ui.print(ui.bold('Examples:'));
  ui.print('  nimbus aws iam users');
  ui.print('  nimbus aws iam roles');
  ui.print('  nimbus aws iam user admin');
}

export default iamCommand;
