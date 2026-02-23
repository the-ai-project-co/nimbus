/**
 * GCP Compute Engine CLI Commands
 *
 * Operations for Compute Engine instances
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
import type { GcpCommandOptions } from './index';

const execFileAsync = promisify(execFile);

/**
 * Run Compute Engine safety checks
 */
async function runComputeSafetyChecks(
  action: string,
  instanceId: string,
  options: GcpCommandOptions
): Promise<SafetyCheckResult> {
  const safetyPolicy = loadSafetyPolicy();

  const context: SafetyContext = {
    operation: action,
    type: 'gcp',
    environment: options.project || 'default',
    resources: [instanceId],
    metadata: {
      resourceType: 'compute-instance',
      resourceId: instanceId,
    },
  };

  return evaluateSafety(context, safetyPolicy);
}

/**
 * Main Compute Engine command router
 */
export async function computeCommand(
  action: string,
  args: string[],
  options: GcpCommandOptions
): Promise<void> {
  logger.info('Running GCP Compute command', { action, args, options });

  switch (action) {
    case 'list':
      await listInstances(options);
      break;

    case 'describe':
      if (!args[0]) {
        ui.error('Instance name required');
        return;
      }
      await describeInstance(args[0], options);
      break;

    case 'start':
      if (!args[0]) {
        ui.error('Instance name required');
        return;
      }
      await startInstance(args[0], options);
      break;

    case 'stop':
      if (!args[0]) {
        ui.error('Instance name required');
        return;
      }
      await stopInstance(args[0], options);
      break;

    case 'delete':
      if (!args[0]) {
        ui.error('Instance name required');
        return;
      }
      await deleteInstance(args[0], options);
      break;

    default:
      showComputeHelp();
      break;
  }
}

/**
 * List Compute Engine instances
 */
async function listInstances(options: GcpCommandOptions): Promise<void> {
  ui.header('Compute Engine Instances');
  ui.newLine();

  const gcloudArgs = ['compute', 'instances', 'list', '--format=json'];
  if (options.project) {
    gcloudArgs.push(`--project=${options.project}`);
  }
  if (options.zone) {
    gcloudArgs.push(`--zones=${options.zone}`);
  }

  try {
    ui.startSpinner({ message: 'Fetching instances...' });
    const { stdout } = await execFileAsync('gcloud', gcloudArgs);
    ui.stopSpinnerSuccess('Instances fetched');

    const instances = JSON.parse(stdout || '[]');

    if (instances.length === 0) {
      ui.info('No instances found');
      return;
    }

    ui.print(`Found ${instances.length} instance(s)\n`);

    // Display table
    ui.print(
      ui.color(
        'Name'.padEnd(25) +
          'Zone'.padEnd(25) +
          'Machine Type'.padEnd(20) +
          'Status'.padEnd(12) +
          'External IP',
        'cyan'
      )
    );
    ui.print('─'.repeat(100));

    for (const instance of instances) {
      const name = instance.name?.substring(0, 24) || '';
      const zone = instance.zone?.split('/').pop()?.substring(0, 24) || '';
      const machineType = instance.machineType?.split('/').pop()?.substring(0, 19) || '';
      const status = instance.status || '';
      const externalIp =
        instance.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP || 'None';

      const statusColor =
        status === 'RUNNING'
          ? 'green'
          : status === 'TERMINATED'
            ? 'red'
            : status === 'STOPPING'
              ? 'yellow'
              : 'white';

      ui.print(
        `${name.padEnd(25)}${zone.padEnd(25)}${machineType.padEnd(20)}${ui.color(status.padEnd(12), statusColor as 'green' | 'red' | 'yellow' | 'white')}${externalIp}`
      );
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch instances');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list instances', { error: message });
    ui.error(`Failed to list instances: ${message}`);
  }
}

/**
 * Describe a specific instance
 */
async function describeInstance(
  instanceName: string,
  options: GcpCommandOptions
): Promise<void> {
  ui.header(`Instance: ${instanceName}`);
  ui.newLine();

  const gcloudArgs = ['compute', 'instances', 'describe', instanceName, '--format=json'];
  if (options.project) {
    gcloudArgs.push(`--project=${options.project}`);
  }
  if (options.zone) {
    gcloudArgs.push(`--zone=${options.zone}`);
  }

  try {
    ui.startSpinner({ message: 'Fetching instance details...' });
    const { stdout } = await execFileAsync('gcloud', gcloudArgs);
    ui.stopSpinnerSuccess('Details fetched');

    const instance = JSON.parse(stdout);

    ui.print(ui.bold('Basic Information:'));
    ui.print(`  Name:         ${instance.name}`);
    ui.print(`  Zone:         ${instance.zone?.split('/').pop()}`);
    ui.print(`  Machine Type: ${instance.machineType?.split('/').pop()}`);
    ui.print(`  Status:       ${instance.status}`);
    ui.print(`  Created:      ${instance.creationTimestamp}`);
    ui.newLine();

    ui.print(ui.bold('Network:'));
    for (const nic of instance.networkInterfaces || []) {
      ui.print(`  Network:      ${nic.network?.split('/').pop()}`);
      ui.print(`  Internal IP:  ${nic.networkIP}`);
      if (nic.accessConfigs?.[0]?.natIP) {
        ui.print(`  External IP:  ${nic.accessConfigs[0].natIP}`);
      }
    }
    ui.newLine();

    ui.print(ui.bold('Disks:'));
    for (const disk of instance.disks || []) {
      ui.print(`  Name:         ${disk.source?.split('/').pop()}`);
      ui.print(`  Boot:         ${disk.boot ? 'Yes' : 'No'}`);
      ui.print(`  Size:         ${disk.diskSizeGb} GB`);
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch details');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to describe instance', { error: message });
    ui.error(`Failed to describe instance: ${message}`);
  }
}

/**
 * Start an instance
 */
async function startInstance(
  instanceName: string,
  options: GcpCommandOptions
): Promise<void> {
  const gcloudArgs = ['compute', 'instances', 'start', instanceName];
  if (options.project) {
    gcloudArgs.push(`--project=${options.project}`);
  }
  if (options.zone) {
    gcloudArgs.push(`--zone=${options.zone}`);
  }

  try {
    ui.startSpinner({ message: `Starting instance ${instanceName}...` });
    await execFileAsync('gcloud', gcloudArgs);
    ui.stopSpinnerSuccess(`Instance ${instanceName} started`);
  } catch (error: unknown) {
    ui.stopSpinnerFail(`Failed to start instance`);
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to start instance', { error: message });
    ui.error(`Failed to start instance: ${message}`);
  }
}

/**
 * Stop an instance
 */
async function stopInstance(
  instanceName: string,
  options: GcpCommandOptions
): Promise<void> {
  const gcloudArgs = ['compute', 'instances', 'stop', instanceName];
  if (options.project) {
    gcloudArgs.push(`--project=${options.project}`);
  }
  if (options.zone) {
    gcloudArgs.push(`--zone=${options.zone}`);
  }

  try {
    ui.startSpinner({ message: `Stopping instance ${instanceName}...` });
    await execFileAsync('gcloud', gcloudArgs);
    ui.stopSpinnerSuccess(`Instance ${instanceName} stopped`);
  } catch (error: unknown) {
    ui.stopSpinnerFail(`Failed to stop instance`);
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to stop instance', { error: message });
    ui.error(`Failed to stop instance: ${message}`);
  }
}

/**
 * Delete an instance (requires safety approval)
 */
async function deleteInstance(
  instanceName: string,
  options: GcpCommandOptions
): Promise<void> {
  // Run safety checks
  const safetyResult = await runComputeSafetyChecks('delete', instanceName, options);

  displaySafetySummary({
    operation: `delete ${instanceName}`,
    risks: safetyResult.risks,
    passed: safetyResult.passed,
  });

  if (safetyResult.requiresApproval) {
    const result = await promptForApproval({
      title: 'Delete Compute Engine Instance',
      operation: `gcloud compute instances delete ${instanceName}`,
      risks: safetyResult.risks,
    });

    if (!result.approved) {
      ui.warning('Operation cancelled');
      return;
    }
  }

  const gcloudArgs = ['compute', 'instances', 'delete', instanceName, '--quiet'];
  if (options.project) {
    gcloudArgs.push(`--project=${options.project}`);
  }
  if (options.zone) {
    gcloudArgs.push(`--zone=${options.zone}`);
  }

  try {
    ui.startSpinner({ message: `Deleting instance ${instanceName}...` });
    await execFileAsync('gcloud', gcloudArgs);
    ui.stopSpinnerSuccess(`Instance ${instanceName} deleted`);
  } catch (error: unknown) {
    ui.stopSpinnerFail(`Failed to delete instance`);
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete instance', { error: message });
    ui.error(`Failed to delete instance: ${message}`);
  }
}

/**
 * Show Compute help
 */
function showComputeHelp(): void {
  ui.print(ui.bold('Compute Engine Commands:'));
  ui.print('  list                  List all instances');
  ui.print('  describe <name>       Show instance details');
  ui.print('  start <name>          Start an instance');
  ui.print('  stop <name>           Stop an instance');
  ui.print('  delete <name>         Delete an instance (requires approval)');
}
