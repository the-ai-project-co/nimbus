/**
 * AWS RDS Commands
 *
 * RDS database operations with cost warnings before billable actions
 *
 * Usage:
 *   nimbus aws rds list
 *   nimbus aws rds describe <db-identifier>
 *   nimbus aws rds start <db-identifier>
 *   nimbus aws rds stop <db-identifier>
 */

import { logger } from '../../utils';
import { ui } from '../../wizard/ui';
import { confirm } from '../../wizard/prompts';
import {
  loadSafetyPolicy,
  evaluateSafety,
  type SafetyContext,
  type SafetyCheckResult,
} from '../../config/safety-policy';
import { promptForApproval } from '../../wizard/approval';
import {
  estimateCloudCost,
  formatCostWarning,
} from '../cost/cloud-cost-estimator';
import type { AwsCommandOptions } from './index';

interface RDSInstance {
  DBInstanceIdentifier: string;
  DBInstanceClass: string;
  Engine: string;
  EngineVersion: string;
  DBInstanceStatus: string;
  Endpoint?: {
    Address: string;
    Port: number;
  };
  AllocatedStorage: number;
  AvailabilityZone: string;
  MultiAZ: boolean;
}

/**
 * RDS command router
 */
export async function rdsCommand(
  action: string,
  args: string[],
  options: AwsCommandOptions
): Promise<void> {
  logger.info('Running RDS command', { action, args, options });

  switch (action) {
    case 'list':
    case 'ls':
      await listInstances(options);
      break;

    case 'describe':
      if (!args[0]) {
        ui.error('DB instance identifier is required');
        ui.print('Usage: nimbus aws rds describe <db-identifier>');
        return;
      }
      await describeInstance(args[0], options);
      break;

    case 'start':
      if (!args[0]) {
        ui.error('DB instance identifier is required');
        ui.print('Usage: nimbus aws rds start <db-identifier>');
        return;
      }
      await startInstance(args[0], options);
      break;

    case 'stop':
      if (!args[0]) {
        ui.error('DB instance identifier is required');
        ui.print('Usage: nimbus aws rds stop <db-identifier>');
        return;
      }
      await stopInstance(args[0], options);
      break;

    default:
      showRdsHelp();
      break;
  }
}

/**
 * Display a cost warning for an RDS instance class using the cloud cost estimator.
 */
function displayRdsCostWarning(instanceClass: string, multiAz: boolean): void {
  const estimate = estimateCloudCost('rds:StartDBInstance', {
    instanceClass,
    multiAz,
  });
  if (estimate) {
    const color = estimate.monthly > 200 ? 'red' : estimate.monthly > 50 ? 'yellow' : 'green';
    ui.newLine();
    ui.print(ui.bold('  Estimated Cost:'));
    ui.print(`    Hourly:  ${ui.color(`$${estimate.hourly.toFixed(4)}/hr`, color)}`);
    ui.print(`    Monthly: ${ui.color(`$${estimate.monthly.toFixed(2)}/mo`, color)} (on-demand${multiAz ? ', Multi-AZ' : ''}, approximate)`);
    ui.newLine();
  }
}

/**
 * List all RDS instances
 */
async function listInstances(options: AwsCommandOptions): Promise<void> {
  ui.header('RDS Instances');

  ui.startSpinner({ message: 'Fetching RDS instances...' });

  try {
    const result = await runAwsCommand<{ DBInstances: RDSInstance[] }>(
      'rds describe-db-instances',
      options
    );

    const instances = result.DBInstances || [];

    ui.stopSpinnerSuccess(`Found ${instances.length} instance(s)`);
    ui.newLine();

    if (instances.length === 0) {
      ui.info('No RDS instances found');
      return;
    }

    // Display table
    displayInstanceTable(instances);
  } catch (error) {
    ui.stopSpinnerFail('Failed to list instances');
    ui.error((error as Error).message);
  }
}

/**
 * Describe a specific RDS instance
 */
async function describeInstance(identifier: string, options: AwsCommandOptions): Promise<void> {
  ui.header(`RDS Instance: ${identifier}`);

  ui.startSpinner({ message: 'Fetching instance details...' });

  try {
    const result = await runAwsCommand<{ DBInstances: RDSInstance[] }>(
      `rds describe-db-instances --db-instance-identifier ${identifier}`,
      options
    );

    const instances = result.DBInstances || [];

    ui.stopSpinnerSuccess('Instance details retrieved');
    ui.newLine();

    if (instances.length === 0) {
      ui.error(`Instance ${identifier} not found`);
      return;
    }

    const instance = instances[0];

    // Display instance details
    ui.print(ui.bold('Instance Details:'));
    ui.newLine();
    ui.print(`  Identifier:      ${instance.DBInstanceIdentifier}`);
    ui.print(`  Class:           ${instance.DBInstanceClass}`);
    ui.print(`  Engine:          ${instance.Engine} ${instance.EngineVersion}`);
    ui.print(`  Status:          ${formatStatus(instance.DBInstanceStatus)}`);
    ui.print(`  Storage:         ${instance.AllocatedStorage} GB`);
    ui.print(`  AZ:              ${instance.AvailabilityZone}`);
    ui.print(`  Multi-AZ:        ${instance.MultiAZ ? 'Yes' : 'No'}`);

    if (instance.Endpoint) {
      ui.newLine();
      ui.print(ui.bold('Endpoint:'));
      ui.print(`  Address:         ${instance.Endpoint.Address}`);
      ui.print(`  Port:            ${instance.Endpoint.Port}`);
    }

    // Show cost estimate
    displayRdsCostWarning(instance.DBInstanceClass, instance.MultiAZ);
  } catch (error) {
    ui.stopSpinnerFail('Failed to describe instance');
    ui.error((error as Error).message);
  }
}

/**
 * Start an RDS instance
 */
async function startInstance(identifier: string, options: AwsCommandOptions): Promise<void> {
  ui.header(`Start RDS Instance: ${identifier}`);

  // Try to get instance class for cost estimate
  try {
    const result = await runAwsCommand<{ DBInstances: RDSInstance[] }>(
      `rds describe-db-instances --db-instance-identifier ${identifier}`,
      options
    );
    const instances = result.DBInstances || [];
    if (instances.length > 0) {
      const instance = instances[0];
      const estimate = estimateCloudCost('rds:StartDBInstance', {
        instanceClass: instance.DBInstanceClass,
        multiAz: instance.MultiAZ,
      });
      if (estimate) {
        ui.newLine();
        ui.warning(formatCostWarning(estimate));
        ui.newLine();
      }
    }
  } catch {
    // Non-critical, continue without cost estimate
  }

  const proceed = await confirm({
    message: `Start instance ${identifier}?`,
    defaultValue: true,
  });

  if (!proceed) {
    ui.info('Operation cancelled');
    return;
  }

  ui.startSpinner({ message: 'Starting instance...' });

  try {
    await runAwsCommand(
      `rds start-db-instance --db-instance-identifier ${identifier}`,
      options
    );

    ui.stopSpinnerSuccess('Instance starting');
    ui.info(`Instance ${identifier} is now starting`);
  } catch (error) {
    ui.stopSpinnerFail('Failed to start instance');
    ui.error((error as Error).message);
  }
}

/**
 * Stop an RDS instance
 */
async function stopInstance(identifier: string, options: AwsCommandOptions): Promise<void> {
  ui.header(`Stop RDS Instance: ${identifier}`);

  // Show cost estimate for the instance being stopped
  try {
    const result = await runAwsCommand<{ DBInstances: RDSInstance[] }>(
      `rds describe-db-instances --db-instance-identifier ${identifier}`,
      options
    );
    const instances = result.DBInstances || [];
    if (instances.length > 0) {
      const instance = instances[0];
      displayRdsCostWarning(instance.DBInstanceClass, instance.MultiAZ);
      ui.info('Stopping this instance will stop incurring compute charges.');
      ui.newLine();
    }
  } catch {
    // Non-critical, continue without cost estimate
  }

  // Run safety checks
  const safetyResult = await runSafetyCheck('stop', identifier, options);

  if (safetyResult.requiresApproval) {
    const approval = await promptForApproval({
      title: 'Stop RDS Instance',
      operation: `rds stop ${identifier}`,
      risks: safetyResult.risks,
    });

    if (!approval.approved) {
      ui.info('Operation cancelled');
      return;
    }
  } else {
    const proceed = await confirm({
      message: `Stop instance ${identifier}?`,
      defaultValue: false,
    });

    if (!proceed) {
      ui.info('Operation cancelled');
      return;
    }
  }

  ui.startSpinner({ message: 'Stopping instance...' });

  try {
    await runAwsCommand(
      `rds stop-db-instance --db-instance-identifier ${identifier}`,
      options
    );

    ui.stopSpinnerSuccess('Instance stopping');
    ui.info(`Instance ${identifier} is now stopping`);
  } catch (error) {
    ui.stopSpinnerFail('Failed to stop instance');
    ui.error((error as Error).message);
  }
}

/**
 * Run safety check for RDS operation
 */
async function runSafetyCheck(
  operation: string,
  identifier: string,
  options: AwsCommandOptions
): Promise<SafetyCheckResult> {
  const policy = loadSafetyPolicy();

  const context: SafetyContext = {
    operation,
    type: 'aws',
    resources: [identifier],
    metadata: {
      service: 'rds',
      region: options.region,
    },
  };

  return evaluateSafety(context, policy);
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
  if (options.region) {
    commandArgs.push('--region', options.region);
  }
  commandArgs.push('--output', 'json');

  const { stdout } = await execFileAsync('aws', [baseCommand, ...commandArgs]);
  return JSON.parse(stdout) as T;
}

/**
 * Display instances in a table format
 */
function displayInstanceTable(instances: RDSInstance[]): void {
  const headers = ['Identifier', 'Engine', 'Class', 'Status', 'Storage', 'Multi-AZ'];
  const rows = instances.map(inst => [
    inst.DBInstanceIdentifier,
    `${inst.Engine} ${inst.EngineVersion}`,
    inst.DBInstanceClass,
    inst.DBInstanceStatus,
    `${inst.AllocatedStorage} GB`,
    inst.MultiAZ ? 'Yes' : 'No',
  ]);

  // Print header
  const headerRow = headers.map((h, i) => {
    const maxWidth = Math.max(h.length, ...rows.map(r => r[i].length));
    return h.padEnd(maxWidth);
  }).join('  ');

  ui.print(ui.bold(headerRow));
  ui.print('-'.repeat(headerRow.length));

  // Print rows
  for (const row of rows) {
    const formattedRow = row.map((cell, i) => {
      const maxWidth = Math.max(headers[i].length, ...rows.map(r => r[i].length));
      if (i === 3) {
        // Status column - colorize
        return formatStatus(cell).padEnd(maxWidth + 10);
      }
      return cell.padEnd(maxWidth);
    }).join('  ');

    ui.print(formattedRow);
  }
}

/**
 * Format instance status with color
 */
function formatStatus(status: string): string {
  switch (status) {
    case 'available':
      return ui.color(status, 'green');
    case 'stopped':
      return ui.color(status, 'red');
    case 'starting':
    case 'stopping':
    case 'creating':
    case 'modifying':
      return ui.color(status, 'yellow');
    case 'deleting':
      return ui.color(status, 'gray');
    default:
      return status;
  }
}

/**
 * Show RDS command help
 */
function showRdsHelp(): void {
  ui.print('Usage: nimbus aws rds <action> [args]');
  ui.newLine();

  ui.print(ui.bold('Actions:'));
  ui.print('  list                  List all RDS instances');
  ui.print('  describe <id>         Describe a specific instance');
  ui.print('  start <id>            Start an instance');
  ui.print('  stop <id>             Stop an instance');
  ui.newLine();

  ui.print(ui.bold('Examples:'));
  ui.print('  nimbus aws rds list');
  ui.print('  nimbus aws rds describe my-database');
  ui.print('  nimbus aws rds stop my-database');
}

export default rdsCommand;
