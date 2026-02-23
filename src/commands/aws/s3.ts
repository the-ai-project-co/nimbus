/**
 * AWS S3 Commands
 *
 * S3 bucket and object operations
 *
 * Usage:
 *   nimbus aws s3 ls
 *   nimbus aws s3 ls <bucket>
 *   nimbus aws s3 cp <src> <dst>
 *   nimbus aws s3 rm <path>
 *   nimbus aws s3 mb <bucket>
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
import type { AwsCommandOptions } from './index';

interface S3Bucket {
  Name: string;
  CreationDate: string;
}

interface S3Object {
  Key: string;
  Size: number;
  LastModified: string;
  StorageClass: string;
}

/**
 * S3 command router
 */
export async function s3Command(
  action: string,
  args: string[],
  options: AwsCommandOptions
): Promise<void> {
  logger.info('Running S3 command', { action, args, options });

  switch (action) {
    case 'ls':
    case 'list':
      if (args[0]) {
        await listObjects(args[0], options);
      } else {
        await listBuckets(options);
      }
      break;

    case 'cp':
    case 'copy':
      if (args.length < 2) {
        ui.error('Source and destination are required');
        ui.print('Usage: nimbus aws s3 cp <source> <destination>');
        return;
      }
      await copyObject(args[0], args[1], options);
      break;

    case 'rm':
    case 'remove':
      if (!args[0]) {
        ui.error('S3 path is required');
        ui.print('Usage: nimbus aws s3 rm <s3://bucket/key>');
        return;
      }
      await removeObject(args[0], options);
      break;

    case 'mb':
      if (!args[0]) {
        ui.error('Bucket name is required');
        ui.print('Usage: nimbus aws s3 mb <bucket-name>');
        return;
      }
      await makeBucket(args[0], options);
      break;

    case 'rb':
      if (!args[0]) {
        ui.error('Bucket name is required');
        ui.print('Usage: nimbus aws s3 rb <bucket-name>');
        return;
      }
      await removeBucket(args[0], options);
      break;

    default:
      showS3Help();
      break;
  }
}

/**
 * List all S3 buckets
 */
async function listBuckets(options: AwsCommandOptions): Promise<void> {
  ui.header('S3 Buckets');

  ui.startSpinner({ message: 'Fetching S3 buckets...' });

  try {
    const result = await runAwsCommand<{ Buckets: S3Bucket[] }>(
      's3api list-buckets',
      options
    );

    const buckets = result.Buckets || [];

    ui.stopSpinnerSuccess(`Found ${buckets.length} bucket(s)`);
    ui.newLine();

    if (buckets.length === 0) {
      ui.info('No S3 buckets found');
      return;
    }

    // Display table
    ui.print(ui.bold('Name'.padEnd(50) + 'Created'));
    ui.print('-'.repeat(70));

    for (const bucket of buckets) {
      const date = new Date(bucket.CreationDate).toLocaleDateString();
      ui.print(`${bucket.Name.padEnd(50)}${date}`);
    }
  } catch (error) {
    ui.stopSpinnerFail('Failed to list buckets');
    ui.error((error as Error).message);
  }
}

/**
 * List objects in a bucket
 */
async function listObjects(bucket: string, options: AwsCommandOptions): Promise<void> {
  // Remove s3:// prefix if present
  const bucketName = bucket.replace(/^s3:\/\//, '').split('/')[0];
  const prefix = bucket.replace(/^s3:\/\//, '').split('/').slice(1).join('/');

  ui.header(`S3 Objects: ${bucketName}`);

  ui.startSpinner({ message: 'Fetching objects...' });

  try {
    let command = `s3api list-objects-v2 --bucket ${bucketName}`;
    if (prefix) {
      command += ` --prefix ${prefix}`;
    }

    const result = await runAwsCommand<{ Contents?: S3Object[] }>(
      command,
      options
    );

    const objects = result.Contents || [];

    ui.stopSpinnerSuccess(`Found ${objects.length} object(s)`);
    ui.newLine();

    if (objects.length === 0) {
      ui.info('No objects found');
      return;
    }

    // Display table
    ui.print(ui.bold('Key'.padEnd(50) + 'Size'.padEnd(15) + 'Modified'));
    ui.print('-'.repeat(80));

    for (const obj of objects) {
      const size = formatBytes(obj.Size);
      const date = new Date(obj.LastModified).toLocaleDateString();
      ui.print(`${obj.Key.padEnd(50)}${size.padEnd(15)}${date}`);
    }
  } catch (error) {
    ui.stopSpinnerFail('Failed to list objects');
    ui.error((error as Error).message);
  }
}

/**
 * Copy object
 */
async function copyObject(
  source: string,
  destination: string,
  options: AwsCommandOptions
): Promise<void> {
  ui.header('S3 Copy');
  ui.info(`Source: ${source}`);
  ui.info(`Destination: ${destination}`);
  ui.newLine();

  const proceed = await confirm({
    message: 'Proceed with copy?',
    defaultValue: true,
  });

  if (!proceed) {
    ui.info('Operation cancelled');
    return;
  }

  ui.startSpinner({ message: 'Copying...' });

  try {
    await runAwsS3Command(`cp ${source} ${destination}`, options);

    ui.stopSpinnerSuccess('Copy complete');
  } catch (error) {
    ui.stopSpinnerFail('Copy failed');
    ui.error((error as Error).message);
  }
}

/**
 * Remove object
 */
async function removeObject(path: string, options: AwsCommandOptions): Promise<void> {
  ui.header('S3 Remove');
  ui.warning(`This will delete: ${path}`);
  ui.newLine();

  // Run safety checks
  const safetyResult = await runSafetyCheck('delete', path, options);

  if (safetyResult.requiresApproval) {
    const approval = await promptForApproval({
      title: 'Delete S3 Object',
      operation: `s3 rm ${path}`,
      risks: safetyResult.risks,
    });

    if (!approval.approved) {
      ui.info('Operation cancelled');
      return;
    }
  } else {
    const proceed = await confirm({
      message: 'Delete this object?',
      defaultValue: false,
    });

    if (!proceed) {
      ui.info('Operation cancelled');
      return;
    }
  }

  ui.startSpinner({ message: 'Deleting...' });

  try {
    await runAwsS3Command(`rm ${path}`, options);

    ui.stopSpinnerSuccess('Object deleted');
  } catch (error) {
    ui.stopSpinnerFail('Delete failed');
    ui.error((error as Error).message);
  }
}

/**
 * Create a bucket
 */
async function makeBucket(bucketName: string, options: AwsCommandOptions): Promise<void> {
  ui.header('Create S3 Bucket');
  ui.info(`Bucket: ${bucketName}`);
  ui.newLine();

  const proceed = await confirm({
    message: 'Create this bucket?',
    defaultValue: true,
  });

  if (!proceed) {
    ui.info('Operation cancelled');
    return;
  }

  ui.startSpinner({ message: 'Creating bucket...' });

  try {
    await runAwsS3Command(`mb s3://${bucketName}`, options);

    ui.stopSpinnerSuccess('Bucket created');
  } catch (error) {
    ui.stopSpinnerFail('Failed to create bucket');
    ui.error((error as Error).message);
  }
}

/**
 * Remove a bucket
 */
async function removeBucket(bucketName: string, options: AwsCommandOptions): Promise<void> {
  ui.header('Remove S3 Bucket');
  ui.warning(`This will delete bucket: ${bucketName}`);
  ui.newLine();

  // Run safety checks
  const safetyResult = await runSafetyCheck('delete', bucketName, options);

  const approval = await promptForApproval({
    title: 'Delete S3 Bucket',
    operation: `s3 rb ${bucketName}`,
    risks: safetyResult.risks,
    requireConfirmation: true,
    confirmationWord: 'delete',
  });

  if (!approval.approved) {
    ui.info('Operation cancelled');
    return;
  }

  ui.startSpinner({ message: 'Removing bucket...' });

  try {
    await runAwsS3Command(`rb s3://${bucketName} --force`, options);

    ui.stopSpinnerSuccess('Bucket removed');
  } catch (error) {
    ui.stopSpinnerFail('Failed to remove bucket');
    ui.error((error as Error).message);
  }
}

/**
 * Run safety check for S3 operation
 */
async function runSafetyCheck(
  operation: string,
  resource: string,
  options: AwsCommandOptions
): Promise<SafetyCheckResult> {
  const policy = loadSafetyPolicy();

  const context: SafetyContext = {
    operation,
    type: 'aws',
    resources: [resource],
    metadata: {
      service: 's3',
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
 * Run AWS S3 high-level command
 */
async function runAwsS3Command(command: string, options: AwsCommandOptions): Promise<void> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);

  const args = command.split(' ');

  // Add common options
  if (options.profile) {
    args.push('--profile', options.profile);
  }
  if (options.region) {
    args.push('--region', options.region);
  }

  await execFileAsync('aws', ['s3', ...args]);
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Show S3 command help
 */
function showS3Help(): void {
  ui.print('Usage: nimbus aws s3 <action> [args]');
  ui.newLine();

  ui.print(ui.bold('Actions:'));
  ui.print('  ls [bucket]           List buckets or objects');
  ui.print('  cp <src> <dst>        Copy files/objects');
  ui.print('  rm <path>             Remove an object');
  ui.print('  mb <bucket>           Create a bucket');
  ui.print('  rb <bucket>           Remove a bucket');
  ui.newLine();

  ui.print(ui.bold('Examples:'));
  ui.print('  nimbus aws s3 ls');
  ui.print('  nimbus aws s3 ls s3://my-bucket/prefix/');
  ui.print('  nimbus aws s3 cp file.txt s3://my-bucket/');
  ui.print('  nimbus aws s3 rm s3://my-bucket/file.txt');
}

export default s3Command;
