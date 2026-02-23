/**
 * Azure Virtual Machine CLI Commands
 *
 * Operations for Azure VMs
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
 * Run VM safety checks
 */
async function runVmSafetyChecks(
  action: string,
  vmName: string,
  options: AzureCommandOptions
): Promise<SafetyCheckResult> {
  const safetyPolicy = loadSafetyPolicy();

  const context: SafetyContext = {
    operation: action,
    type: 'azure',
    environment: options.subscription || 'default',
    resources: [vmName],
    metadata: {
      resourceType: 'virtual-machine',
      resourceGroup: options.resourceGroup,
    },
  };

  return evaluateSafety(context, safetyPolicy);
}

/**
 * Main VM command router
 */
export async function vmCommand(
  action: string,
  args: string[],
  options: AzureCommandOptions
): Promise<void> {
  logger.info('Running Azure VM command', { action, args, options });

  switch (action) {
    case 'list':
      await listVms(options);
      break;

    case 'show':
      if (!args[0]) {
        ui.error('VM name required');
        return;
      }
      await showVm(args[0], options);
      break;

    case 'start':
      if (!args[0]) {
        ui.error('VM name required');
        return;
      }
      await startVm(args[0], options);
      break;

    case 'stop':
      if (!args[0]) {
        ui.error('VM name required');
        return;
      }
      await stopVm(args[0], options);
      break;

    case 'delete':
      if (!args[0]) {
        ui.error('VM name required');
        return;
      }
      await deleteVm(args[0], options);
      break;

    default:
      showVmHelp();
      break;
  }
}

/**
 * List VMs
 */
async function listVms(options: AzureCommandOptions): Promise<void> {
  ui.header('Azure Virtual Machines');
  ui.newLine();

  const azArgs = ['vm', 'list', '-o', 'json'];
  if (options.subscription) {
    azArgs.push('--subscription', options.subscription);
  }
  if (options.resourceGroup) {
    azArgs.push('-g', options.resourceGroup);
  }

  try {
    ui.startSpinner({ message: 'Fetching VMs...' });
    const { stdout } = await execFileAsync('az', azArgs);
    ui.stopSpinnerSuccess('VMs fetched');

    const vms = JSON.parse(stdout || '[]');

    if (vms.length === 0) {
      ui.info('No VMs found');
      return;
    }

    ui.print(`Found ${vms.length} VM(s)\n`);

    // Display table
    ui.print(
      ui.color(
        'Name'.padEnd(25) +
          'Resource Group'.padEnd(25) +
          'Location'.padEnd(15) +
          'VM Size'.padEnd(20) +
          'Status',
        'cyan'
      )
    );
    ui.print('─'.repeat(100));

    for (const vm of vms) {
      const name = vm.name?.substring(0, 24) || '';
      const rg = vm.resourceGroup?.substring(0, 24) || '';
      const location = vm.location?.substring(0, 14) || '';
      const size = vm.hardwareProfile?.vmSize?.substring(0, 19) || '';
      const status = vm.provisioningState || '';

      const statusColor =
        status === 'Succeeded'
          ? 'green'
          : status === 'Failed'
            ? 'red'
            : status === 'Updating'
              ? 'yellow'
              : 'white';

      ui.print(
        `${name.padEnd(25)}${rg.padEnd(25)}${location.padEnd(15)}${size.padEnd(20)}${ui.color(status, statusColor as 'green' | 'red' | 'yellow' | 'white')}`
      );
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch VMs');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list VMs', { error: message });
    ui.error(`Failed to list VMs: ${message}`);
  }
}

/**
 * Show VM details
 */
async function showVm(
  vmName: string,
  options: AzureCommandOptions
): Promise<void> {
  ui.header(`VM: ${vmName}`);
  ui.newLine();

  if (!options.resourceGroup) {
    ui.error('Resource group required (use -g)');
    return;
  }

  const azArgs = ['vm', 'show', '-n', vmName, '-g', options.resourceGroup, '-o', 'json', '--show-details'];
  if (options.subscription) {
    azArgs.push('--subscription', options.subscription);
  }

  try {
    ui.startSpinner({ message: 'Fetching VM details...' });
    const { stdout } = await execFileAsync('az', azArgs);
    ui.stopSpinnerSuccess('Details fetched');

    const vm = JSON.parse(stdout);

    ui.print(ui.bold('Basic Information:'));
    ui.print(`  Name:           ${vm.name}`);
    ui.print(`  Resource Group: ${vm.resourceGroup}`);
    ui.print(`  Location:       ${vm.location}`);
    ui.print(`  VM Size:        ${vm.hardwareProfile?.vmSize}`);
    ui.print(`  State:          ${vm.powerState || 'Unknown'}`);
    ui.newLine();

    ui.print(ui.bold('OS:'));
    ui.print(`  Publisher:      ${vm.storageProfile?.imageReference?.publisher || 'Custom'}`);
    ui.print(`  Offer:          ${vm.storageProfile?.imageReference?.offer || 'N/A'}`);
    ui.print(`  SKU:            ${vm.storageProfile?.imageReference?.sku || 'N/A'}`);
    ui.newLine();

    ui.print(ui.bold('Network:'));
    if (vm.publicIps) {
      ui.print(`  Public IP:      ${vm.publicIps}`);
    }
    if (vm.privateIps) {
      ui.print(`  Private IP:     ${vm.privateIps}`);
    }
    if (vm.fqdns) {
      ui.print(`  FQDN:           ${vm.fqdns}`);
    }
    ui.newLine();

    ui.print(ui.bold('Disks:'));
    ui.print(`  OS Disk:        ${vm.storageProfile?.osDisk?.name}`);
    ui.print(`  OS Disk Size:   ${vm.storageProfile?.osDisk?.diskSizeGb} GB`);
    const dataDisks = vm.storageProfile?.dataDisks || [];
    if (dataDisks.length > 0) {
      ui.print(`  Data Disks:     ${dataDisks.length}`);
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch details');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to show VM', { error: message });
    ui.error(`Failed to show VM: ${message}`);
  }
}

/**
 * Start a VM
 */
async function startVm(
  vmName: string,
  options: AzureCommandOptions
): Promise<void> {
  if (!options.resourceGroup) {
    ui.error('Resource group required (use -g)');
    return;
  }

  const azArgs = ['vm', 'start', '-n', vmName, '-g', options.resourceGroup];
  if (options.subscription) {
    azArgs.push('--subscription', options.subscription);
  }

  try {
    ui.startSpinner({ message: `Starting VM ${vmName}...` });
    await execFileAsync('az', azArgs);
    ui.stopSpinnerSuccess(`VM ${vmName} started`);
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to start VM');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to start VM', { error: message });
    ui.error(`Failed to start VM: ${message}`);
  }
}

/**
 * Stop a VM
 */
async function stopVm(
  vmName: string,
  options: AzureCommandOptions
): Promise<void> {
  if (!options.resourceGroup) {
    ui.error('Resource group required (use -g)');
    return;
  }

  const azArgs = ['vm', 'stop', '-n', vmName, '-g', options.resourceGroup];
  if (options.subscription) {
    azArgs.push('--subscription', options.subscription);
  }

  try {
    ui.startSpinner({ message: `Stopping VM ${vmName}...` });
    await execFileAsync('az', azArgs);
    ui.stopSpinnerSuccess(`VM ${vmName} stopped`);
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to stop VM');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to stop VM', { error: message });
    ui.error(`Failed to stop VM: ${message}`);
  }
}

/**
 * Delete a VM (requires safety approval)
 */
async function deleteVm(
  vmName: string,
  options: AzureCommandOptions
): Promise<void> {
  if (!options.resourceGroup) {
    ui.error('Resource group required (use -g)');
    return;
  }

  // Run safety checks
  const safetyResult = await runVmSafetyChecks('delete', vmName, options);

  displaySafetySummary({
    operation: `delete VM ${vmName}`,
    risks: safetyResult.risks,
    passed: safetyResult.passed,
  });

  if (safetyResult.requiresApproval) {
    const result = await promptForApproval({
      title: 'Delete Virtual Machine',
      operation: `az vm delete -n ${vmName} -g ${options.resourceGroup}`,
      risks: safetyResult.risks,
    });

    if (!result.approved) {
      ui.warning('Operation cancelled');
      return;
    }
  }

  const azArgs = ['vm', 'delete', '-n', vmName, '-g', options.resourceGroup, '--yes'];
  if (options.subscription) {
    azArgs.push('--subscription', options.subscription);
  }

  try {
    ui.startSpinner({ message: `Deleting VM ${vmName}...` });
    await execFileAsync('az', azArgs);
    ui.stopSpinnerSuccess(`VM ${vmName} deleted`);
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to delete VM');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete VM', { error: message });
    ui.error(`Failed to delete VM: ${message}`);
  }
}

/**
 * Show VM help
 */
function showVmHelp(): void {
  ui.print(ui.bold('VM Commands:'));
  ui.print('  list                        List all VMs');
  ui.print('  show <name> -g <rg>         Show VM details');
  ui.print('  start <name> -g <rg>        Start a VM');
  ui.print('  stop <name> -g <rg>         Stop a VM');
  ui.print('  delete <name> -g <rg>       Delete a VM (requires approval)');
}
