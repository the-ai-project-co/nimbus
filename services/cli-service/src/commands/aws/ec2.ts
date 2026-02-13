/**
 * AWS EC2 Commands
 *
 * EC2 instance operations
 *
 * Usage:
 *   nimbus aws ec2 list
 *   nimbus aws ec2 describe <instance-id>
 *   nimbus aws ec2 start <instance-id>
 *   nimbus aws ec2 stop <instance-id>
 *   nimbus aws ec2 terminate <instance-id>
 */

import { logger } from '@nimbus/shared-utils';
import { ui } from '../../wizard/ui';
import { confirm } from '../../wizard/prompts';
import {
  loadSafetyPolicy,
  evaluateSafety,
  type SafetyContext,
  type SafetyCheckResult,
} from '../../config/safety-policy';
import { promptForApproval } from '../../wizard/approval';
import type { AwsCommandOptions } from './index';

interface EC2Instance {
  InstanceId: string;
  InstanceType: string;
  State: { Name: string };
  PublicIpAddress?: string;
  PrivateIpAddress?: string;
  Tags?: Array<{ Key: string; Value: string }>;
  LaunchTime?: string;
}

/**
 * EC2 command router
 */
export async function ec2Command(
  action: string,
  args: string[],
  options: AwsCommandOptions
): Promise<void> {
  logger.info('Running EC2 command', { action, args, options });

  switch (action) {
    case 'list':
    case 'ls':
      await listInstances(options);
      break;

    case 'describe':
      if (!args[0]) {
        ui.error('Instance ID is required');
        ui.print('Usage: nimbus aws ec2 describe <instance-id>');
        return;
      }
      await describeInstance(args[0], options);
      break;

    case 'start':
      if (!args[0]) {
        ui.error('Instance ID is required');
        ui.print('Usage: nimbus aws ec2 start <instance-id>');
        return;
      }
      await startInstance(args[0], options);
      break;

    case 'stop':
      if (!args[0]) {
        ui.error('Instance ID is required');
        ui.print('Usage: nimbus aws ec2 stop <instance-id>');
        return;
      }
      await stopInstance(args[0], options);
      break;

    case 'terminate':
      if (!args[0]) {
        ui.error('Instance ID is required');
        ui.print('Usage: nimbus aws ec2 terminate <instance-id>');
        return;
      }
      await terminateInstance(args[0], options);
      break;

    default:
      showEc2Help();
      break;
  }
}

/**
 * List all EC2 instances
 */
async function listInstances(options: AwsCommandOptions): Promise<void> {
  ui.header('EC2 Instances');

  ui.startSpinner({ message: 'Fetching EC2 instances...' });

  try {
    const instances = await runAwsCommand<EC2Instance[]>(
      'ec2 describe-instances --query "Reservations[].Instances[]"',
      options
    );

    ui.stopSpinnerSuccess(`Found ${instances.length} instance(s)`);
    ui.newLine();

    if (instances.length === 0) {
      ui.info('No EC2 instances found');
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
 * Describe a specific EC2 instance
 */
async function describeInstance(instanceId: string, options: AwsCommandOptions): Promise<void> {
  ui.header(`EC2 Instance: ${instanceId}`);

  ui.startSpinner({ message: 'Fetching instance details...' });

  try {
    const instances = await runAwsCommand<EC2Instance[]>(
      `ec2 describe-instances --instance-ids ${instanceId} --query "Reservations[].Instances[]"`,
      options
    );

    ui.stopSpinnerSuccess('Instance details retrieved');
    ui.newLine();

    if (instances.length === 0) {
      ui.error(`Instance ${instanceId} not found`);
      return;
    }

    const instance = instances[0];

    // Display instance details
    ui.print(ui.bold('Instance Details:'));
    ui.newLine();
    ui.print(`  Instance ID:     ${instance.InstanceId}`);
    ui.print(`  Instance Type:   ${instance.InstanceType}`);
    ui.print(`  State:           ${formatState(instance.State.Name)}`);
    ui.print(`  Public IP:       ${instance.PublicIpAddress || 'N/A'}`);
    ui.print(`  Private IP:      ${instance.PrivateIpAddress || 'N/A'}`);
    ui.print(`  Launch Time:     ${instance.LaunchTime || 'N/A'}`);

    if (instance.Tags && instance.Tags.length > 0) {
      ui.newLine();
      ui.print(ui.bold('Tags:'));
      for (const tag of instance.Tags) {
        ui.print(`  ${tag.Key}: ${tag.Value}`);
      }
    }
  } catch (error) {
    ui.stopSpinnerFail('Failed to describe instance');
    ui.error((error as Error).message);
  }
}

/**
 * Estimated monthly cost by EC2 instance type (approximate on-demand US prices)
 */
const EC2_COST_TABLE: Record<string, { hourly: number; monthly: number }> = {
  't3.nano':    { hourly: 0.0052, monthly: 3.80 },
  't3.micro':   { hourly: 0.0104, monthly: 7.59 },
  't3.small':   { hourly: 0.0208, monthly: 15.18 },
  't3.medium':  { hourly: 0.0416, monthly: 30.37 },
  't3.large':   { hourly: 0.0832, monthly: 60.74 },
  't3.xlarge':  { hourly: 0.1664, monthly: 121.47 },
  't3.2xlarge': { hourly: 0.3328, monthly: 242.94 },
  'm5.large':   { hourly: 0.096,  monthly: 70.08 },
  'm5.xlarge':  { hourly: 0.192,  monthly: 140.16 },
  'm5.2xlarge': { hourly: 0.384,  monthly: 280.32 },
  'c5.large':   { hourly: 0.085,  monthly: 62.05 },
  'c5.xlarge':  { hourly: 0.170,  monthly: 124.10 },
  'r5.large':   { hourly: 0.126,  monthly: 91.98 },
  'r5.xlarge':  { hourly: 0.252,  monthly: 183.96 },
};

/**
 * Display cost estimate for an instance type
 */
function displayCostEstimate(instanceType: string): void {
  const cost = EC2_COST_TABLE[instanceType];
  if (cost) {
    const color = cost.monthly > 200 ? 'red' : cost.monthly > 50 ? 'yellow' : 'green';
    ui.newLine();
    ui.print(ui.bold('  Estimated Cost:'));
    ui.print(`    Hourly:  ${ui.color(`$${cost.hourly.toFixed(4)}/hr`, color)}`);
    ui.print(`    Monthly: ${ui.color(`$${cost.monthly.toFixed(2)}/mo`, color)} (on-demand, approximate)`);
    ui.newLine();
  }
}

/**
 * Start an EC2 instance
 */
async function startInstance(instanceId: string, options: AwsCommandOptions): Promise<void> {
  ui.header(`Start EC2 Instance: ${instanceId}`);

  // Try to get instance type for cost estimate
  try {
    const instances = await runAwsCommand<EC2Instance[]>(
      `ec2 describe-instances --instance-ids ${instanceId} --query "Reservations[].Instances[]"`,
      options
    );
    if (instances.length > 0) {
      displayCostEstimate(instances[0].InstanceType);
    }
  } catch {
    // Non-critical, continue without cost estimate
  }

  // Confirm action
  const proceed = await confirm({
    message: `Start instance ${instanceId}?`,
    defaultValue: true,
  });

  if (!proceed) {
    ui.info('Operation cancelled');
    return;
  }

  ui.startSpinner({ message: 'Starting instance...' });

  try {
    await runAwsCommand(
      `ec2 start-instances --instance-ids ${instanceId}`,
      options
    );

    ui.stopSpinnerSuccess('Instance started');
    ui.info(`Instance ${instanceId} is now starting`);
  } catch (error) {
    ui.stopSpinnerFail('Failed to start instance');
    ui.error((error as Error).message);
  }
}

/**
 * Stop an EC2 instance
 */
async function stopInstance(instanceId: string, options: AwsCommandOptions): Promise<void> {
  ui.header(`Stop EC2 Instance: ${instanceId}`);

  // Show cost estimate for the instance being stopped
  try {
    const instances = await runAwsCommand<EC2Instance[]>(
      `ec2 describe-instances --instance-ids ${instanceId} --query "Reservations[].Instances[]"`,
      options
    );
    if (instances.length > 0) {
      displayCostEstimate(instances[0].InstanceType);
      ui.info('Stopping this instance will stop incurring compute charges.');
      ui.newLine();
    }
  } catch {
    // Non-critical, continue without cost estimate
  }

  // Run safety checks
  const safetyResult = await runSafetyCheck('stop', instanceId, options);

  if (!safetyResult.passed) {
    ui.error('Safety checks failed');
    return;
  }

  if (safetyResult.requiresApproval) {
    const approval = await promptForApproval({
      title: 'Stop EC2 Instance',
      operation: `ec2 stop ${instanceId}`,
      risks: safetyResult.risks,
    });

    if (!approval.approved) {
      ui.info('Operation cancelled');
      return;
    }
  } else {
    const proceed = await confirm({
      message: `Stop instance ${instanceId}?`,
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
      `ec2 stop-instances --instance-ids ${instanceId}`,
      options
    );

    ui.stopSpinnerSuccess('Instance stopped');
    ui.info(`Instance ${instanceId} is now stopping`);
  } catch (error) {
    ui.stopSpinnerFail('Failed to stop instance');
    ui.error((error as Error).message);
  }
}

/**
 * Terminate an EC2 instance
 */
async function terminateInstance(instanceId: string, options: AwsCommandOptions): Promise<void> {
  ui.header(`Terminate EC2 Instance: ${instanceId}`);
  ui.warning('This action cannot be undone!');
  ui.newLine();

  // Show cost estimate for the instance being terminated
  try {
    const instances = await runAwsCommand<EC2Instance[]>(
      `ec2 describe-instances --instance-ids ${instanceId} --query "Reservations[].Instances[]"`,
      options
    );
    if (instances.length > 0) {
      displayCostEstimate(instances[0].InstanceType);
      ui.info('Terminating this instance will permanently stop all charges.');
      ui.newLine();
    }
  } catch {
    // Non-critical, continue without cost estimate
  }

  // Run safety checks
  const safetyResult = await runSafetyCheck('terminate', instanceId, options);

  if (!safetyResult.passed) {
    ui.error('Safety checks failed - operation blocked');
    for (const blocker of safetyResult.blockers) {
      ui.print(`  ${ui.color('x', 'red')} ${blocker.message}`);
    }
    return;
  }

  // Always require approval for terminate
  const approval = await promptForApproval({
    title: 'Terminate EC2 Instance',
    operation: `ec2 terminate ${instanceId}`,
    risks: safetyResult.risks,
    requireConfirmation: true,
    confirmationWord: 'terminate',
  });

  if (!approval.approved) {
    ui.info('Operation cancelled');
    return;
  }

  ui.startSpinner({ message: 'Terminating instance...' });

  try {
    await runAwsCommand(
      `ec2 terminate-instances --instance-ids ${instanceId}`,
      options
    );

    ui.stopSpinnerSuccess('Instance terminated');
    ui.info(`Instance ${instanceId} has been terminated`);
  } catch (error) {
    ui.stopSpinnerFail('Failed to terminate instance');
    ui.error((error as Error).message);
  }
}

/**
 * Run safety check for EC2 operation
 */
async function runSafetyCheck(
  operation: string,
  instanceId: string,
  options: AwsCommandOptions
): Promise<SafetyCheckResult> {
  const policy = loadSafetyPolicy();

  const context: SafetyContext = {
    operation,
    type: 'aws',
    resources: [instanceId],
    metadata: {
      service: 'ec2',
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
function displayInstanceTable(instances: EC2Instance[]): void {
  // Calculate column widths
  const headers = ['Instance ID', 'Name', 'Type', 'State', 'Public IP', 'Private IP'];
  const rows = instances.map(inst => {
    const nameTag = inst.Tags?.find(t => t.Key === 'Name');
    return [
      inst.InstanceId,
      nameTag?.Value || '-',
      inst.InstanceType,
      inst.State.Name,
      inst.PublicIpAddress || '-',
      inst.PrivateIpAddress || '-',
    ];
  });

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
        // State column - colorize
        return formatState(cell).padEnd(maxWidth + 10); // Extra for color codes
      }
      return cell.padEnd(maxWidth);
    }).join('  ');

    ui.print(formattedRow);
  }
}

/**
 * Format instance state with color
 */
function formatState(state: string): string {
  switch (state) {
    case 'running':
      return ui.color(state, 'green');
    case 'stopped':
      return ui.color(state, 'red');
    case 'pending':
    case 'stopping':
      return ui.color(state, 'yellow');
    case 'terminated':
      return ui.color(state, 'gray');
    default:
      return state;
  }
}

/**
 * Show EC2 command help
 */
function showEc2Help(): void {
  ui.print('Usage: nimbus aws ec2 <action> [args]');
  ui.newLine();

  ui.print(ui.bold('Actions:'));
  ui.print('  list                  List all EC2 instances');
  ui.print('  describe <id>         Describe a specific instance');
  ui.print('  start <id>            Start an instance');
  ui.print('  stop <id>             Stop an instance');
  ui.print('  terminate <id>        Terminate an instance (requires approval)');
  ui.newLine();

  ui.print(ui.bold('Examples:'));
  ui.print('  nimbus aws ec2 list');
  ui.print('  nimbus aws ec2 describe i-1234567890abcdef0');
  ui.print('  nimbus aws ec2 stop i-1234567890abcdef0');
}

export default ec2Command;
