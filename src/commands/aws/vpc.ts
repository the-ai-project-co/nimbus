/**
 * AWS VPC Commands
 *
 * VPC and networking operations
 *
 * Usage:
 *   nimbus aws vpc list
 *   nimbus aws vpc describe <vpc-id>
 */

import { logger } from '../../utils';
import { ui } from '../../wizard/ui';
import type { AwsCommandOptions } from './index';

interface VPC {
  VpcId: string;
  CidrBlock: string;
  State: string;
  IsDefault: boolean;
  Tags?: Array<{ Key: string; Value: string }>;
}

interface Subnet {
  SubnetId: string;
  VpcId: string;
  CidrBlock: string;
  AvailabilityZone: string;
  State: string;
  MapPublicIpOnLaunch: boolean;
  Tags?: Array<{ Key: string; Value: string }>;
}

interface SecurityGroup {
  GroupId: string;
  GroupName: string;
  Description: string;
  VpcId: string;
}

/**
 * VPC command router
 */
export async function vpcCommand(
  action: string,
  args: string[],
  options: AwsCommandOptions
): Promise<void> {
  logger.info('Running VPC command', { action, args, options });

  switch (action) {
    case 'list':
    case 'ls':
      await listVPCs(options);
      break;

    case 'describe':
      if (!args[0]) {
        ui.error('VPC ID is required');
        ui.print('Usage: nimbus aws vpc describe <vpc-id>');
        return;
      }
      await describeVPC(args[0], options);
      break;

    case 'subnets':
      await listSubnets(args[0], options);
      break;

    case 'security-groups':
    case 'sg':
      await listSecurityGroups(args[0], options);
      break;

    default:
      showVpcHelp();
      break;
  }
}

/**
 * List all VPCs
 */
async function listVPCs(options: AwsCommandOptions): Promise<void> {
  ui.header('VPCs');

  ui.startSpinner({ message: 'Fetching VPCs...' });

  try {
    const result = await runAwsCommand<{ Vpcs: VPC[] }>(
      'ec2 describe-vpcs',
      options
    );

    const vpcs = result.Vpcs || [];

    ui.stopSpinnerSuccess(`Found ${vpcs.length} VPC(s)`);
    ui.newLine();

    if (vpcs.length === 0) {
      ui.info('No VPCs found');
      return;
    }

    // Display table
    const headers = ['VPC ID', 'Name', 'CIDR', 'State', 'Default'];
    const rows = vpcs.map(vpc => {
      const nameTag = vpc.Tags?.find(t => t.Key === 'Name');
      return [
        vpc.VpcId,
        nameTag?.Value || '-',
        vpc.CidrBlock,
        vpc.State,
        vpc.IsDefault ? 'Yes' : 'No',
      ];
    });

    displayTable(headers, rows);
  } catch (error) {
    ui.stopSpinnerFail('Failed to list VPCs');
    ui.error((error as Error).message);
  }
}

/**
 * Describe a specific VPC
 */
async function describeVPC(vpcId: string, options: AwsCommandOptions): Promise<void> {
  ui.header(`VPC: ${vpcId}`);

  ui.startSpinner({ message: 'Fetching VPC details...' });

  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    // Get VPC details
    const vpcArgs = ['ec2', 'describe-vpcs', '--vpc-ids', vpcId, '--output', 'json'];
    if (options.profile) {
      vpcArgs.push('--profile', options.profile);
    }
    if (options.region) {
      vpcArgs.push('--region', options.region);
    }

    const { stdout: vpcOutput } = await execFileAsync('aws', vpcArgs);
    const vpcData = JSON.parse(vpcOutput);
    const vpc = vpcData.Vpcs[0];

    // Get subnets
    const subnetArgs = ['ec2', 'describe-subnets', '--filters', `Name=vpc-id,Values=${vpcId}`, '--output', 'json'];
    if (options.profile) {
      subnetArgs.push('--profile', options.profile);
    }
    if (options.region) {
      subnetArgs.push('--region', options.region);
    }

    const { stdout: subnetOutput } = await execFileAsync('aws', subnetArgs);
    const subnetData = JSON.parse(subnetOutput);
    const subnets = subnetData.Subnets || [];

    // Get security groups
    const sgArgs = ['ec2', 'describe-security-groups', '--filters', `Name=vpc-id,Values=${vpcId}`, '--output', 'json'];
    if (options.profile) {
      sgArgs.push('--profile', options.profile);
    }
    if (options.region) {
      sgArgs.push('--region', options.region);
    }

    const { stdout: sgOutput } = await execFileAsync('aws', sgArgs);
    const sgData = JSON.parse(sgOutput);
    const securityGroups = sgData.SecurityGroups || [];

    ui.stopSpinnerSuccess('VPC details retrieved');
    ui.newLine();

    // Display VPC details
    const nameTag = vpc.Tags?.find((t: { Key: string }) => t.Key === 'Name');
    ui.print(ui.bold('VPC Details:'));
    ui.newLine();
    ui.print(`  VPC ID:          ${vpc.VpcId}`);
    ui.print(`  Name:            ${nameTag?.Value || '-'}`);
    ui.print(`  CIDR Block:      ${vpc.CidrBlock}`);
    ui.print(`  State:           ${vpc.State}`);
    ui.print(`  Default:         ${vpc.IsDefault ? 'Yes' : 'No'}`);

    // Display subnets
    if (subnets.length > 0) {
      ui.newLine();
      ui.print(ui.bold(`Subnets (${subnets.length}):`));
      ui.newLine();

      for (const subnet of subnets) {
        const subnetName = subnet.Tags?.find((t: { Key: string }) => t.Key === 'Name')?.Value || '-';
        const publicLabel = subnet.MapPublicIpOnLaunch ? ui.color('public', 'green') : ui.color('private', 'yellow');
        ui.print(`  ${subnet.SubnetId}  ${subnetName.padEnd(20)}  ${subnet.CidrBlock.padEnd(18)}  ${subnet.AvailabilityZone}  ${publicLabel}`);
      }
    }

    // Display security groups
    if (securityGroups.length > 0) {
      ui.newLine();
      ui.print(ui.bold(`Security Groups (${securityGroups.length}):`));
      ui.newLine();

      for (const sg of securityGroups) {
        ui.print(`  ${sg.GroupId}  ${sg.GroupName.padEnd(25)}  ${sg.Description.substring(0, 40)}`);
      }
    }
  } catch (error) {
    ui.stopSpinnerFail('Failed to describe VPC');
    ui.error((error as Error).message);
  }
}

/**
 * List subnets
 */
async function listSubnets(vpcId: string | undefined, options: AwsCommandOptions): Promise<void> {
  ui.header('Subnets');

  ui.startSpinner({ message: 'Fetching subnets...' });

  try {
    let command = 'ec2 describe-subnets';
    if (vpcId) {
      command += ` --filters Name=vpc-id,Values=${vpcId}`;
    }

    const result = await runAwsCommand<{ Subnets: Subnet[] }>(
      command,
      options
    );

    const subnets = result.Subnets || [];

    ui.stopSpinnerSuccess(`Found ${subnets.length} subnet(s)`);
    ui.newLine();

    if (subnets.length === 0) {
      ui.info('No subnets found');
      return;
    }

    // Display table
    const headers = ['Subnet ID', 'Name', 'VPC ID', 'CIDR', 'AZ', 'Public'];
    const rows = subnets.map(subnet => {
      const nameTag = subnet.Tags?.find(t => t.Key === 'Name');
      return [
        subnet.SubnetId,
        nameTag?.Value || '-',
        subnet.VpcId,
        subnet.CidrBlock,
        subnet.AvailabilityZone,
        subnet.MapPublicIpOnLaunch ? 'Yes' : 'No',
      ];
    });

    displayTable(headers, rows);
  } catch (error) {
    ui.stopSpinnerFail('Failed to list subnets');
    ui.error((error as Error).message);
  }
}

/**
 * List security groups
 */
async function listSecurityGroups(vpcId: string | undefined, options: AwsCommandOptions): Promise<void> {
  ui.header('Security Groups');

  ui.startSpinner({ message: 'Fetching security groups...' });

  try {
    let command = 'ec2 describe-security-groups';
    if (vpcId) {
      command += ` --filters Name=vpc-id,Values=${vpcId}`;
    }

    const result = await runAwsCommand<{ SecurityGroups: SecurityGroup[] }>(
      command,
      options
    );

    const securityGroups = result.SecurityGroups || [];

    ui.stopSpinnerSuccess(`Found ${securityGroups.length} security group(s)`);
    ui.newLine();

    if (securityGroups.length === 0) {
      ui.info('No security groups found');
      return;
    }

    // Display table
    const headers = ['Group ID', 'Name', 'VPC ID', 'Description'];
    const rows = securityGroups.map(sg => [
      sg.GroupId,
      sg.GroupName,
      sg.VpcId,
      sg.Description.substring(0, 40),
    ]);

    displayTable(headers, rows);
  } catch (error) {
    ui.stopSpinnerFail('Failed to list security groups');
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
  if (options.region) {
    commandArgs.push('--region', options.region);
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
 * Show VPC command help
 */
function showVpcHelp(): void {
  ui.print('Usage: nimbus aws vpc <action> [args]');
  ui.newLine();

  ui.print(ui.bold('Actions:'));
  ui.print('  list                  List all VPCs');
  ui.print('  describe <vpc-id>     Describe a specific VPC');
  ui.print('  subnets [vpc-id]      List subnets');
  ui.print('  security-groups [id]  List security groups');
  ui.newLine();

  ui.print(ui.bold('Examples:'));
  ui.print('  nimbus aws vpc list');
  ui.print('  nimbus aws vpc describe vpc-1234567890abcdef0');
  ui.print('  nimbus aws vpc subnets vpc-1234567890abcdef0');
}

export default vpcCommand;
