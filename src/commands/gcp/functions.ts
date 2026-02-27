/**
 * GCP Cloud Functions CLI Commands
 *
 * Operations for Cloud Functions
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../utils';
import { ui } from '../../wizard/ui';
import type { GcpCommandOptions } from './index';

const execFileAsync = promisify(execFile);

/**
 * Main Cloud Functions command router
 */
export async function functionsCommand(
  action: string,
  args: string[],
  options: GcpCommandOptions
): Promise<void> {
  logger.info('Running GCP Functions command', { action, args, options });

  switch (action) {
    case 'list':
      await listFunctions(options);
      break;

    case 'describe':
      if (!args[0]) {
        ui.error('Function name required');
        return;
      }
      await describeFunction(args[0], options);
      break;

    case 'call':
      if (!args[0]) {
        ui.error('Function name required');
        return;
      }
      await callFunction(args[0], args[1], options);
      break;

    case 'logs':
      if (!args[0]) {
        ui.error('Function name required');
        return;
      }
      await getFunctionLogs(args[0], options);
      break;

    default:
      showFunctionsHelp();
      break;
  }
}

/**
 * List Cloud Functions
 */
async function listFunctions(options: GcpCommandOptions): Promise<void> {
  ui.header('Cloud Functions');
  ui.newLine();

  const gcloudArgs = ['functions', 'list', '--format=json'];
  if (options.project) {
    gcloudArgs.push(`--project=${options.project}`);
  }
  if (options.region) {
    gcloudArgs.push(`--regions=${options.region}`);
  }

  try {
    ui.startSpinner({ message: 'Fetching functions...' });
    const { stdout } = await execFileAsync('gcloud', gcloudArgs);
    ui.stopSpinnerSuccess('Functions fetched');

    const functions = JSON.parse(stdout || '[]');

    if (functions.length === 0) {
      ui.info('No functions found');
      return;
    }

    ui.print(`Found ${functions.length} function(s)\n`);

    // Display table
    ui.print(
      ui.color(
        `${
          'Name'.padEnd(30) + 'Region'.padEnd(15) + 'Runtime'.padEnd(15) + 'Trigger'.padEnd(15)
        }State`,
        'cyan'
      )
    );
    ui.print('─'.repeat(90));

    for (const fn of functions) {
      const name = fn.name?.split('/').pop()?.substring(0, 29) || '';
      const region = fn.name?.split('/')[3]?.substring(0, 14) || '';
      const runtime = fn.runtime?.substring(0, 14) || '';
      const trigger = fn.httpsTrigger ? 'HTTP' : fn.eventTrigger ? 'Event' : 'Unknown';
      const state = fn.state || '';

      const stateColor =
        state === 'ACTIVE'
          ? 'green'
          : state === 'DEPLOYING'
            ? 'yellow'
            : state === 'FAILED'
              ? 'red'
              : 'white';

      ui.print(
        `${name.padEnd(30)}${region.padEnd(15)}${runtime.padEnd(15)}${trigger.padEnd(15)}${ui.color(state, stateColor as 'green' | 'yellow' | 'red' | 'white')}`
      );
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch functions');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list functions', { error: message });
    ui.error(`Failed to list functions: ${message}`);
  }
}

/**
 * Describe a specific function
 */
async function describeFunction(functionName: string, options: GcpCommandOptions): Promise<void> {
  ui.header(`Function: ${functionName}`);
  ui.newLine();

  const gcloudArgs = ['functions', 'describe', functionName, '--format=json'];
  if (options.project) {
    gcloudArgs.push(`--project=${options.project}`);
  }
  if (options.region) {
    gcloudArgs.push(`--region=${options.region}`);
  }

  try {
    ui.startSpinner({ message: 'Fetching function details...' });
    const { stdout } = await execFileAsync('gcloud', gcloudArgs);
    ui.stopSpinnerSuccess('Details fetched');

    const fn = JSON.parse(stdout);

    ui.print(ui.bold('Basic Information:'));
    ui.print(`  Name:           ${fn.name?.split('/').pop()}`);
    ui.print(`  Region:         ${fn.name?.split('/')[3]}`);
    ui.print(`  State:          ${fn.state}`);
    ui.print(`  Runtime:        ${fn.runtime}`);
    ui.print(`  Entry Point:    ${fn.entryPoint}`);
    ui.newLine();

    ui.print(ui.bold('Resources:'));
    ui.print(`  Memory:         ${fn.availableMemoryMb} MB`);
    ui.print(`  Timeout:        ${fn.timeout}`);
    ui.print(`  Max Instances:  ${fn.maxInstances || 'default'}`);
    ui.newLine();

    ui.print(ui.bold('Trigger:'));
    if (fn.httpsTrigger) {
      ui.print(`  Type:           HTTP`);
      ui.print(`  URL:            ${fn.httpsTrigger.url}`);
    } else if (fn.eventTrigger) {
      ui.print(`  Type:           Event`);
      ui.print(`  Event Type:     ${fn.eventTrigger.eventType}`);
      ui.print(`  Resource:       ${fn.eventTrigger.resource}`);
    }
    ui.newLine();

    ui.print(ui.bold('Timestamps:'));
    ui.print(`  Created:        ${fn.buildId ? `Build ID: ${fn.buildId}` : 'N/A'}`);
    ui.print(`  Updated:        ${fn.updateTime}`);
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch details');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to describe function', { error: message });
    ui.error(`Failed to describe function: ${message}`);
  }
}

/**
 * Call a function
 */
async function callFunction(
  functionName: string,
  data: string | undefined,
  options: GcpCommandOptions
): Promise<void> {
  const gcloudArgs = ['functions', 'call', functionName];
  if (data) {
    gcloudArgs.push('--data', data);
  }
  if (options.project) {
    gcloudArgs.push(`--project=${options.project}`);
  }
  if (options.region) {
    gcloudArgs.push(`--region=${options.region}`);
  }

  try {
    ui.startSpinner({ message: `Calling function ${functionName}...` });
    const { stdout, stderr } = await execFileAsync('gcloud', gcloudArgs);
    ui.stopSpinnerSuccess('Function invoked');
    ui.newLine();

    if (stdout) {
      ui.print(ui.bold('Response:'));
      ui.print(stdout);
    }

    if (stderr) {
      ui.print(ui.bold('Execution ID:'));
      ui.print(stderr);
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to call function');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to call function', { error: message });
    ui.error(`Failed to call function: ${message}`);
  }
}

/**
 * Get function logs
 */
async function getFunctionLogs(functionName: string, options: GcpCommandOptions): Promise<void> {
  ui.header(`Logs for ${functionName}`);
  ui.newLine();

  const gcloudArgs = ['functions', 'logs', 'read', functionName, '--limit=50'];
  if (options.project) {
    gcloudArgs.push(`--project=${options.project}`);
  }
  if (options.region) {
    gcloudArgs.push(`--region=${options.region}`);
  }

  try {
    ui.startSpinner({ message: 'Fetching logs...' });
    const { stdout } = await execFileAsync('gcloud', gcloudArgs);
    ui.stopSpinnerSuccess('Logs fetched');

    if (!stdout.trim()) {
      ui.info('No logs found');
      return;
    }

    ui.print(stdout);
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch logs');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get logs', { error: message });
    ui.error(`Failed to get logs: ${message}`);
  }
}

/**
 * Show Functions help
 */
function showFunctionsHelp(): void {
  ui.print(ui.bold('Cloud Functions Commands:'));
  ui.print('  list                        List all functions');
  ui.print('  describe <name>             Show function details');
  ui.print('  call <name> [data]          Invoke a function');
  ui.print('  logs <name>                 View function logs');
}
