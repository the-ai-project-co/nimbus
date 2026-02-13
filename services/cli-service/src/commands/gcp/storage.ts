/**
 * GCP Cloud Storage CLI Commands
 *
 * Operations for Cloud Storage buckets and objects
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '@nimbus/shared-utils';
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
 * Run storage safety checks
 */
async function runStorageSafetyChecks(
  action: string,
  target: string,
  options: GcpCommandOptions
): Promise<SafetyCheckResult> {
  const safetyPolicy = loadSafetyPolicy();

  const context: SafetyContext = {
    operation: action,
    type: 'gcp',
    environment: options.project || 'default',
    resources: [target],
    metadata: {
      resourceType: 'storage',
      resourceId: target,
    },
  };

  return evaluateSafety(context, safetyPolicy);
}

/**
 * Main Cloud Storage command router
 */
export async function storageCommand(
  action: string,
  args: string[],
  options: GcpCommandOptions
): Promise<void> {
  logger.info('Running GCP Storage command', { action, args, options });

  switch (action) {
    case 'ls':
      await listBucketsOrObjects(args[0], options);
      break;

    case 'cp':
      if (args.length < 2) {
        ui.error('Source and destination required');
        return;
      }
      await copyObject(args[0], args[1], options);
      break;

    case 'rm':
      if (!args[0]) {
        ui.error('Object path required');
        return;
      }
      await removeObject(args[0], options);
      break;

    case 'mb':
      if (!args[0]) {
        ui.error('Bucket name required');
        return;
      }
      await makeBucket(args[0], options);
      break;

    case 'rb':
      if (!args[0]) {
        ui.error('Bucket name required');
        return;
      }
      await removeBucket(args[0], options);
      break;

    default:
      showStorageHelp();
      break;
  }
}

/**
 * List buckets or objects
 */
async function listBucketsOrObjects(
  path: string | undefined,
  _options: GcpCommandOptions
): Promise<void> {
  const gsutilArgs = ['ls'];
  if (path) {
    gsutilArgs.push(path);
  }

  try {
    ui.startSpinner({ message: path ? `Listing objects in ${path}...` : 'Listing buckets...' });
    const { stdout } = await execFileAsync('gsutil', gsutilArgs);
    ui.stopSpinnerSuccess(path ? `Objects in ${path}` : 'Buckets listed');

    const items = stdout.trim().split('\n').filter(Boolean);

    if (items.length === 0) {
      ui.info(path ? 'No objects found' : 'No buckets found');
      return;
    }

    ui.header(path ? `Objects in ${path}` : 'Cloud Storage Buckets');
    ui.newLine();

    ui.print(`Found ${items.length} item(s)\n`);

    for (const item of items) {
      if (item.startsWith('gs://')) {
        // Bucket
        ui.print(`  ${ui.color(item, 'cyan')}`);
      } else {
        // Object
        ui.print(`  ${item}`);
      }
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to list');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list storage', { error: message });
    ui.error(`Failed to list: ${message}`);
  }
}

/**
 * Copy objects
 */
async function copyObject(
  source: string,
  destination: string,
  _options: GcpCommandOptions
): Promise<void> {
  const gsutilArgs = ['cp', source, destination];

  try {
    ui.startSpinner({ message: `Copying ${source} to ${destination}...` });
    await execFileAsync('gsutil', gsutilArgs);
    ui.stopSpinnerSuccess(`Copied ${source} to ${destination}`);
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to copy');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to copy object', { error: message });
    ui.error(`Failed to copy: ${message}`);
  }
}

/**
 * Remove an object (requires safety approval)
 */
async function removeObject(path: string, options: GcpCommandOptions): Promise<void> {
  // Run safety checks
  const safetyResult = await runStorageSafetyChecks('delete', path, options);

  displaySafetySummary({
    operation: `rm ${path}`,
    risks: safetyResult.risks,
    passed: safetyResult.passed,
  });

  if (safetyResult.requiresApproval) {
    const result = await promptForApproval({
      title: 'Remove Storage Object',
      operation: `gsutil rm ${path}`,
      risks: safetyResult.risks,
    });

    if (!result.approved) {
      ui.warning('Operation cancelled');
      return;
    }
  }

  const gsutilArgs = ['rm', path];

  try {
    ui.startSpinner({ message: `Removing ${path}...` });
    await execFileAsync('gsutil', gsutilArgs);
    ui.stopSpinnerSuccess(`Removed ${path}`);
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to remove');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to remove object', { error: message });
    ui.error(`Failed to remove: ${message}`);
  }
}

/**
 * Create a bucket
 */
async function makeBucket(
  bucketName: string,
  options: GcpCommandOptions
): Promise<void> {
  const gsutilArgs = ['mb'];
  if (options.project) {
    gsutilArgs.push('-p', options.project);
  }
  if (options.region) {
    gsutilArgs.push('-l', options.region);
  }
  gsutilArgs.push(bucketName.startsWith('gs://') ? bucketName : `gs://${bucketName}`);

  try {
    ui.startSpinner({ message: `Creating bucket ${bucketName}...` });
    await execFileAsync('gsutil', gsutilArgs);
    ui.stopSpinnerSuccess(`Bucket ${bucketName} created`);
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to create bucket');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create bucket', { error: message });
    ui.error(`Failed to create bucket: ${message}`);
  }
}

/**
 * Remove a bucket (requires safety approval)
 */
async function removeBucket(
  bucketName: string,
  options: GcpCommandOptions
): Promise<void> {
  const bucket = bucketName.startsWith('gs://') ? bucketName : `gs://${bucketName}`;

  // Run safety checks
  const safetyResult = await runStorageSafetyChecks('delete', bucket, options);

  displaySafetySummary({
    operation: `rb ${bucket}`,
    risks: safetyResult.risks,
    passed: safetyResult.passed,
  });

  if (safetyResult.requiresApproval) {
    const result = await promptForApproval({
      title: 'Remove Storage Bucket',
      operation: `gsutil rb ${bucket}`,
      risks: safetyResult.risks,
    });

    if (!result.approved) {
      ui.warning('Operation cancelled');
      return;
    }
  }

  const gsutilArgs = ['rb', bucket];

  try {
    ui.startSpinner({ message: `Removing bucket ${bucket}...` });
    await execFileAsync('gsutil', gsutilArgs);
    ui.stopSpinnerSuccess(`Bucket ${bucket} removed`);
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to remove bucket');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to remove bucket', { error: message });
    ui.error(`Failed to remove bucket: ${message}`);
  }
}

/**
 * Show Storage help
 */
function showStorageHelp(): void {
  ui.print(ui.bold('Cloud Storage Commands:'));
  ui.print('  ls [gs://bucket]      List buckets or objects');
  ui.print('  cp <src> <dst>        Copy objects');
  ui.print('  rm <path>             Remove object (requires approval)');
  ui.print('  mb <bucket>           Create bucket');
  ui.print('  rb <bucket>           Remove bucket (requires approval)');
}
