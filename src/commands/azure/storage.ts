/**
 * Azure Storage CLI Commands
 *
 * Operations for Azure Storage accounts and blobs
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../utils';
import { ui } from '../../wizard/ui';
import {
  loadSafetyPolicy,
  evaluateSafety,
  type SafetyContext,
  type SafetyCheckResult,
} from '../../config/safety-policy';
import { promptForApproval, displaySafetySummary } from '../../wizard/approval';
import type { AzureCommandOptions } from './index';

const execFileAsync = promisify(execFile);

/**
 * Run storage safety checks
 */
async function runStorageSafetyChecks(
  action: string,
  target: string,
  options: AzureCommandOptions
): Promise<SafetyCheckResult> {
  const safetyPolicy = loadSafetyPolicy();

  const context: SafetyContext = {
    operation: action,
    type: 'azure',
    environment: options.subscription || 'default',
    resources: [target],
    metadata: {
      resourceType: 'storage',
      resourceGroup: options.resourceGroup,
    },
  };

  return evaluateSafety(context, safetyPolicy);
}

/**
 * Main Storage command router
 */
export async function storageCommand(
  action: string,
  args: string[],
  options: AzureCommandOptions
): Promise<void> {
  logger.info('Running Azure Storage command', { action, args, options });

  switch (action) {
    case 'account':
      await accountCommand(args[0], args.slice(1), options);
      break;

    case 'container':
      await containerCommand(args[0], args.slice(1), options);
      break;

    case 'blob':
      await blobCommand(args[0], args.slice(1), options);
      break;

    default:
      showStorageHelp();
      break;
  }
}

/**
 * Storage account subcommand
 */
async function accountCommand(
  action: string,
  args: string[],
  options: AzureCommandOptions
): Promise<void> {
  switch (action) {
    case 'list':
      await listAccounts(options);
      break;

    case 'show':
      if (!args[0]) {
        ui.error('Account name required');
        return;
      }
      await showAccount(args[0], options);
      break;

    default:
      ui.print(ui.bold('Storage Account Commands:'));
      ui.print('  list                     List all storage accounts');
      ui.print('  show <name> -g <rg>      Show account details');
      break;
  }
}

/**
 * Container subcommand
 */
async function containerCommand(
  action: string,
  args: string[],
  options: AzureCommandOptions
): Promise<void> {
  switch (action) {
    case 'list':
      if (!args[0]) {
        ui.error('Account name required');
        return;
      }
      await listContainers(args[0], options);
      break;

    case 'delete':
      if (!args[0] || !args[1]) {
        ui.error('Account name and container name required');
        return;
      }
      await deleteContainer(args[0], args[1], options);
      break;

    default:
      ui.print(ui.bold('Container Commands:'));
      ui.print('  list <account>                    List containers in account');
      ui.print('  delete <account> <container>      Delete container (requires approval)');
      break;
  }
}

/**
 * Blob subcommand
 */
async function blobCommand(
  action: string,
  args: string[],
  options: AzureCommandOptions
): Promise<void> {
  switch (action) {
    case 'list':
      if (!args[0] || !args[1]) {
        ui.error('Account name and container name required');
        return;
      }
      await listBlobs(args[0], args[1], options);
      break;

    default:
      ui.print(ui.bold('Blob Commands:'));
      ui.print('  list <account> <container>        List blobs in container');
      break;
  }
}

/**
 * List storage accounts
 */
async function listAccounts(options: AzureCommandOptions): Promise<void> {
  ui.header('Azure Storage Accounts');
  ui.newLine();

  const azArgs = ['storage', 'account', 'list', '-o', 'json'];
  if (options.subscription) {
    azArgs.push('--subscription', options.subscription);
  }
  if (options.resourceGroup) {
    azArgs.push('-g', options.resourceGroup);
  }

  try {
    ui.startSpinner({ message: 'Fetching storage accounts...' });
    const { stdout } = await execFileAsync('az', azArgs);
    ui.stopSpinnerSuccess('Accounts fetched');

    const accounts = JSON.parse(stdout || '[]');

    if (accounts.length === 0) {
      ui.info('No storage accounts found');
      return;
    }

    ui.print(`Found ${accounts.length} account(s)\n`);

    // Display table
    ui.print(
      ui.color(
        'Name'.padEnd(30) +
          'Resource Group'.padEnd(25) +
          'Location'.padEnd(15) +
          'Kind'.padEnd(15) +
          'Status',
        'cyan'
      )
    );
    ui.print('─'.repeat(100));

    for (const account of accounts) {
      const name = account.name?.substring(0, 29) || '';
      const rg = account.resourceGroup?.substring(0, 24) || '';
      const location = account.location?.substring(0, 14) || '';
      const kind = account.kind?.substring(0, 14) || '';
      const status = account.provisioningState || '';

      const statusColor =
        status === 'Succeeded'
          ? 'green'
          : status === 'Failed'
            ? 'red'
            : 'white';

      ui.print(
        `${name.padEnd(30)}${rg.padEnd(25)}${location.padEnd(15)}${kind.padEnd(15)}${ui.color(status, statusColor as 'green' | 'red' | 'white')}`
      );
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch accounts');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list storage accounts', { error: message });
    ui.error(`Failed to list accounts: ${message}`);
  }
}

/**
 * Show storage account details
 */
async function showAccount(
  accountName: string,
  options: AzureCommandOptions
): Promise<void> {
  ui.header(`Storage Account: ${accountName}`);
  ui.newLine();

  if (!options.resourceGroup) {
    ui.error('Resource group required (use -g)');
    return;
  }

  const azArgs = ['storage', 'account', 'show', '-n', accountName, '-g', options.resourceGroup, '-o', 'json'];
  if (options.subscription) {
    azArgs.push('--subscription', options.subscription);
  }

  try {
    ui.startSpinner({ message: 'Fetching account details...' });
    const { stdout } = await execFileAsync('az', azArgs);
    ui.stopSpinnerSuccess('Details fetched');

    const account = JSON.parse(stdout);

    ui.print(ui.bold('Basic Information:'));
    ui.print(`  Name:           ${account.name}`);
    ui.print(`  Resource Group: ${account.resourceGroup}`);
    ui.print(`  Location:       ${account.location}`);
    ui.print(`  Kind:           ${account.kind}`);
    ui.print(`  Status:         ${account.provisioningState}`);
    ui.newLine();

    ui.print(ui.bold('Properties:'));
    ui.print(`  SKU:            ${account.sku?.name}`);
    ui.print(`  Tier:           ${account.sku?.tier}`);
    ui.print(`  Access Tier:    ${account.accessTier || 'N/A'}`);
    ui.print(`  HTTPS Only:     ${account.enableHttpsTrafficOnly ? 'Yes' : 'No'}`);
    ui.newLine();

    ui.print(ui.bold('Encryption:'));
    ui.print(`  Services:       ${Object.keys(account.encryption?.services || {}).join(', ')}`);
    ui.print(`  Key Source:     ${account.encryption?.keySource}`);
    ui.newLine();

    ui.print(ui.bold('Endpoints:'));
    const endpoints = account.primaryEndpoints || {};
    if (endpoints.blob) ui.print(`  Blob:           ${endpoints.blob}`);
    if (endpoints.file) ui.print(`  File:           ${endpoints.file}`);
    if (endpoints.queue) ui.print(`  Queue:          ${endpoints.queue}`);
    if (endpoints.table) ui.print(`  Table:          ${endpoints.table}`);
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch details');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to show account', { error: message });
    ui.error(`Failed to show account: ${message}`);
  }
}

/**
 * List containers in a storage account
 */
async function listContainers(
  accountName: string,
  options: AzureCommandOptions
): Promise<void> {
  ui.header(`Containers in ${accountName}`);
  ui.newLine();

  const azArgs = ['storage', 'container', 'list', '--account-name', accountName, '-o', 'json', '--auth-mode', 'login'];
  if (options.subscription) {
    azArgs.push('--subscription', options.subscription);
  }

  try {
    ui.startSpinner({ message: 'Fetching containers...' });
    const { stdout } = await execFileAsync('az', azArgs);
    ui.stopSpinnerSuccess('Containers fetched');

    const containers = JSON.parse(stdout || '[]');

    if (containers.length === 0) {
      ui.info('No containers found');
      return;
    }

    ui.print(`Found ${containers.length} container(s)\n`);

    for (const container of containers) {
      ui.print(`  ${ui.color(container.name, 'cyan')}`);
      if (container.properties?.lastModified) {
        ui.print(ui.dim(`    Last Modified: ${container.properties.lastModified}`));
      }
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch containers');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list containers', { error: message });
    ui.error(`Failed to list containers: ${message}`);
  }
}

/**
 * Delete a container (requires safety approval)
 */
async function deleteContainer(
  accountName: string,
  containerName: string,
  options: AzureCommandOptions
): Promise<void> {
  // Run safety checks
  const safetyResult = await runStorageSafetyChecks('delete', `${accountName}/${containerName}`, options);

  displaySafetySummary({
    operation: `delete container ${containerName}`,
    risks: safetyResult.risks,
    passed: safetyResult.passed,
  });

  if (safetyResult.requiresApproval) {
    const result = await promptForApproval({
      title: 'Delete Storage Container',
      operation: `az storage container delete --name ${containerName} --account-name ${accountName}`,
      risks: safetyResult.risks,
    });

    if (!result.approved) {
      ui.warning('Operation cancelled');
      return;
    }
  }

  const azArgs = ['storage', 'container', 'delete', '--name', containerName, '--account-name', accountName, '--auth-mode', 'login'];
  if (options.subscription) {
    azArgs.push('--subscription', options.subscription);
  }

  try {
    ui.startSpinner({ message: `Deleting container ${containerName}...` });
    await execFileAsync('az', azArgs);
    ui.stopSpinnerSuccess(`Container ${containerName} deleted`);
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to delete container');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete container', { error: message });
    ui.error(`Failed to delete container: ${message}`);
  }
}

/**
 * List blobs in a container
 */
async function listBlobs(
  accountName: string,
  containerName: string,
  options: AzureCommandOptions
): Promise<void> {
  ui.header(`Blobs in ${accountName}/${containerName}`);
  ui.newLine();

  const azArgs = ['storage', 'blob', 'list', '--container-name', containerName, '--account-name', accountName, '-o', 'json', '--auth-mode', 'login'];
  if (options.subscription) {
    azArgs.push('--subscription', options.subscription);
  }

  try {
    ui.startSpinner({ message: 'Fetching blobs...' });
    const { stdout } = await execFileAsync('az', azArgs);
    ui.stopSpinnerSuccess('Blobs fetched');

    const blobs = JSON.parse(stdout || '[]');

    if (blobs.length === 0) {
      ui.info('No blobs found');
      return;
    }

    ui.print(`Found ${blobs.length} blob(s)\n`);

    for (const blob of blobs) {
      const size = blob.properties?.contentLength
        ? `${Math.round(blob.properties.contentLength / 1024)} KB`
        : '';
      ui.print(`  ${blob.name} ${ui.dim(size)}`);
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch blobs');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list blobs', { error: message });
    ui.error(`Failed to list blobs: ${message}`);
  }
}

/**
 * Show Storage help
 */
function showStorageHelp(): void {
  ui.print(ui.bold('Storage Commands:'));
  ui.print('  account list                       List storage accounts');
  ui.print('  account show <name> -g <rg>        Show account details');
  ui.print('  container list <account>           List containers');
  ui.print('  container delete <account> <name>  Delete container (requires approval)');
  ui.print('  blob list <account> <container>    List blobs');
}
