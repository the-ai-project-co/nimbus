/**
 * AWS Lambda Commands
 *
 * Lambda function operations
 *
 * Usage:
 *   nimbus aws lambda list
 *   nimbus aws lambda invoke <function-name>
 *   nimbus aws lambda logs <function-name>
 */

import { logger } from '../../utils';
import { ui } from '../../wizard/ui';
import { confirm, input } from '../../wizard/prompts';
import type { AwsCommandOptions } from './index';

interface LambdaFunction {
  FunctionName: string;
  Runtime: string;
  Handler: string;
  CodeSize: number;
  MemorySize: number;
  Timeout: number;
  LastModified: string;
  State?: string;
}

/**
 * Lambda command router
 */
export async function lambdaCommand(
  action: string,
  args: string[],
  options: AwsCommandOptions
): Promise<void> {
  logger.info('Running Lambda command', { action, args, options });

  switch (action) {
    case 'list':
    case 'ls':
      await listFunctions(options);
      break;

    case 'invoke':
      if (!args[0]) {
        ui.error('Function name is required');
        ui.print('Usage: nimbus aws lambda invoke <function-name>');
        return;
      }
      await invokeFunction(args[0], args[1], options);
      break;

    case 'logs':
      if (!args[0]) {
        ui.error('Function name is required');
        ui.print('Usage: nimbus aws lambda logs <function-name>');
        return;
      }
      await getFunctionLogs(args[0], options);
      break;

    default:
      showLambdaHelp();
      break;
  }
}

/**
 * List all Lambda functions
 */
async function listFunctions(options: AwsCommandOptions): Promise<void> {
  ui.header('Lambda Functions');

  ui.startSpinner({ message: 'Fetching Lambda functions...' });

  try {
    const result = await runAwsCommand<{ Functions: LambdaFunction[] }>(
      'lambda list-functions',
      options
    );

    const functions = result.Functions || [];

    ui.stopSpinnerSuccess(`Found ${functions.length} function(s)`);
    ui.newLine();

    if (functions.length === 0) {
      ui.info('No Lambda functions found');
      return;
    }

    // Display table
    displayFunctionTable(functions);
  } catch (error) {
    ui.stopSpinnerFail('Failed to list functions');
    ui.error((error as Error).message);
  }
}

/**
 * Invoke a Lambda function
 */
async function invokeFunction(
  functionName: string,
  payload: string | undefined,
  options: AwsCommandOptions
): Promise<void> {
  ui.header(`Invoke Lambda: ${functionName}`);

  // Get payload if not provided
  let invokePayload = payload;
  if (!invokePayload) {
    invokePayload = await input({
      message: 'Enter payload (JSON):',
      defaultValue: '{}',
    });
  }

  // Validate JSON
  try {
    JSON.parse(invokePayload);
  } catch {
    ui.error('Invalid JSON payload');
    return;
  }

  const proceed = await confirm({
    message: `Invoke function ${functionName}?`,
    defaultValue: true,
  });

  if (!proceed) {
    ui.info('Operation cancelled');
    return;
  }

  ui.startSpinner({ message: 'Invoking function...' });

  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const fs = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');
    const execFileAsync = promisify(execFile);

    // Write payload to temp file
    const tempFile = path.join(os.tmpdir(), `lambda-payload-${Date.now()}.json`);
    await fs.writeFile(tempFile, invokePayload);

    // Invoke Lambda
    const args = [
      'lambda',
      'invoke',
      '--function-name',
      functionName,
      '--payload',
      `file://${tempFile}`,
      '--cli-binary-format',
      'raw-in-base64-out',
    ];

    if (options.profile) {
      args.push('--profile', options.profile);
    }
    if (options.region) {
      args.push('--region', options.region);
    }

    const outputFile = path.join(os.tmpdir(), `lambda-response-${Date.now()}.json`);
    args.push(outputFile);

    const { stdout } = await execFileAsync('aws', args);

    ui.stopSpinnerSuccess('Function invoked');
    ui.newLine();

    // Parse invocation result
    const result = JSON.parse(stdout);
    ui.print(ui.bold('Invocation Result:'));
    ui.print(`  Status Code: ${result.StatusCode}`);
    if (result.FunctionError) {
      ui.print(`  Error: ${ui.color(result.FunctionError, 'red')}`);
    }

    // Read response
    try {
      const response = await fs.readFile(outputFile, 'utf-8');
      ui.newLine();
      ui.print(ui.bold('Response:'));
      ui.print(response);
    } catch {
      // No response file
    }

    // Cleanup
    await fs.unlink(tempFile).catch(() => {});
    await fs.unlink(outputFile).catch(() => {});
  } catch (error) {
    ui.stopSpinnerFail('Invocation failed');
    ui.error((error as Error).message);
  }
}

/**
 * Get Lambda function logs
 */
async function getFunctionLogs(functionName: string, options: AwsCommandOptions): Promise<void> {
  ui.header(`Lambda Logs: ${functionName}`);

  ui.startSpinner({ message: 'Fetching logs...' });

  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    // Get log group name
    const logGroupName = `/aws/lambda/${functionName}`;

    // Fetch recent log streams
    const args = [
      'logs',
      'describe-log-streams',
      '--log-group-name',
      logGroupName,
      '--order-by',
      'LastEventTime',
      '--descending',
      '--limit',
      '1',
      '--output',
      'json',
    ];

    if (options.profile) {
      args.push('--profile', options.profile);
    }
    if (options.region) {
      args.push('--region', options.region);
    }

    const { stdout: streamsOutput } = await execFileAsync('aws', args);
    const streams = JSON.parse(streamsOutput);

    if (!streams.logStreams || streams.logStreams.length === 0) {
      ui.stopSpinnerSuccess('');
      ui.info('No log streams found');
      return;
    }

    const latestStream = streams.logStreams[0].logStreamName;

    // Fetch log events
    const logArgs = [
      'logs',
      'get-log-events',
      '--log-group-name',
      logGroupName,
      '--log-stream-name',
      latestStream,
      '--limit',
      '50',
      '--output',
      'json',
    ];

    if (options.profile) {
      logArgs.push('--profile', options.profile);
    }
    if (options.region) {
      logArgs.push('--region', options.region);
    }

    const { stdout: logsOutput } = await execFileAsync('aws', logArgs);
    const logs = JSON.parse(logsOutput);

    ui.stopSpinnerSuccess('Logs retrieved');
    ui.newLine();

    if (!logs.events || logs.events.length === 0) {
      ui.info('No log events found');
      return;
    }

    ui.print(ui.bold(`Recent logs from: ${latestStream}`));
    ui.newLine();

    for (const event of logs.events) {
      const timestamp = new Date(event.timestamp).toISOString();
      ui.print(`${ui.dim(timestamp)} ${event.message.trim()}`);
    }
  } catch (error) {
    ui.stopSpinnerFail('Failed to fetch logs');
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
 * Display functions in a table format
 */
function displayFunctionTable(functions: LambdaFunction[]): void {
  const headers = ['Name', 'Runtime', 'Memory', 'Timeout', 'Code Size', 'Modified'];
  const rows = functions.map(fn => [
    fn.FunctionName,
    fn.Runtime || 'N/A',
    `${fn.MemorySize} MB`,
    `${fn.Timeout}s`,
    formatBytes(fn.CodeSize),
    new Date(fn.LastModified).toLocaleDateString(),
  ]);

  // Print header
  const headerRow = headers
    .map((h, i) => {
      const maxWidth = Math.max(h.length, ...rows.map(r => r[i].length));
      return h.padEnd(maxWidth);
    })
    .join('  ');

  ui.print(ui.bold(headerRow));
  ui.print('-'.repeat(headerRow.length));

  // Print rows
  for (const row of rows) {
    const formattedRow = row
      .map((cell, i) => {
        const maxWidth = Math.max(headers[i].length, ...rows.map(r => r[i].length));
        return cell.padEnd(maxWidth);
      })
      .join('  ');

    ui.print(formattedRow);
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Show Lambda command help
 */
function showLambdaHelp(): void {
  ui.print('Usage: nimbus aws lambda <action> [args]');
  ui.newLine();

  ui.print(ui.bold('Actions:'));
  ui.print('  list                  List all Lambda functions');
  ui.print('  invoke <name>         Invoke a function');
  ui.print('  logs <name>           View function logs');
  ui.newLine();

  ui.print(ui.bold('Examples:'));
  ui.print('  nimbus aws lambda list');
  ui.print('  nimbus aws lambda invoke my-function \'{"key": "value"}\'');
  ui.print('  nimbus aws lambda logs my-function');
}

export default lambdaCommand;
