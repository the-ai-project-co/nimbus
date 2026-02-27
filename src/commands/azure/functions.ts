/**
 * Azure Functions CLI Commands
 *
 * Operations for Azure Function Apps
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../utils';
import { ui } from '../../wizard/ui';
import type { AzureCommandOptions } from './index';

const execFileAsync = promisify(execFile);

/**
 * Main Functions command router
 */
export async function functionsCommand(
  action: string,
  args: string[],
  options: AzureCommandOptions
): Promise<void> {
  logger.info('Running Azure Functions command', { action, args, options });

  switch (action) {
    case 'list':
      await listFunctionApps(options);
      break;

    case 'show':
      if (!args[0]) {
        ui.error('Function app name required');
        return;
      }
      await showFunctionApp(args[0], options);
      break;

    case 'functions':
      if (!args[0]) {
        ui.error('Function app name required');
        return;
      }
      await listFunctions(args[0], options);
      break;

    default:
      showFunctionsHelp();
      break;
  }
}

/**
 * List Function Apps
 */
async function listFunctionApps(options: AzureCommandOptions): Promise<void> {
  ui.header('Azure Function Apps');
  ui.newLine();

  const azArgs = ['functionapp', 'list', '-o', 'json'];
  if (options.subscription) {
    azArgs.push('--subscription', options.subscription);
  }
  if (options.resourceGroup) {
    azArgs.push('-g', options.resourceGroup);
  }

  try {
    ui.startSpinner({ message: 'Fetching function apps...' });
    const { stdout } = await execFileAsync('az', azArgs);
    ui.stopSpinnerSuccess('Function apps fetched');

    const apps = JSON.parse(stdout || '[]');

    if (apps.length === 0) {
      ui.info('No function apps found');
      return;
    }

    ui.print(`Found ${apps.length} function app(s)\n`);

    // Display table
    ui.print(
      ui.color(
        `${
          'Name'.padEnd(30) +
          'Resource Group'.padEnd(25) +
          'Location'.padEnd(15) +
          'Runtime'.padEnd(15)
        }State`,
        'cyan'
      )
    );
    ui.print('─'.repeat(100));

    for (const app of apps) {
      const name = app.name?.substring(0, 29) || '';
      const rg = app.resourceGroup?.substring(0, 24) || '';
      const location = app.location?.substring(0, 14) || '';
      const runtime =
        app.siteConfig?.linuxFxVersion?.substring(0, 14) ||
        app.siteConfig?.windowsFxVersion?.substring(0, 14) ||
        'N/A';
      const state = app.state || '';

      const stateColor = state === 'Running' ? 'green' : state === 'Stopped' ? 'red' : 'white';

      ui.print(
        `${name.padEnd(30)}${rg.padEnd(25)}${location.padEnd(15)}${runtime.padEnd(15)}${ui.color(state, stateColor as 'green' | 'red' | 'white')}`
      );
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch function apps');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list function apps', { error: message });
    ui.error(`Failed to list function apps: ${message}`);
  }
}

/**
 * Show Function App details
 */
async function showFunctionApp(appName: string, options: AzureCommandOptions): Promise<void> {
  ui.header(`Function App: ${appName}`);
  ui.newLine();

  if (!options.resourceGroup) {
    ui.error('Resource group required (use -g)');
    return;
  }

  const azArgs = ['functionapp', 'show', '-n', appName, '-g', options.resourceGroup, '-o', 'json'];
  if (options.subscription) {
    azArgs.push('--subscription', options.subscription);
  }

  try {
    ui.startSpinner({ message: 'Fetching function app details...' });
    const { stdout } = await execFileAsync('az', azArgs);
    ui.stopSpinnerSuccess('Details fetched');

    const app = JSON.parse(stdout);

    ui.print(ui.bold('Basic Information:'));
    ui.print(`  Name:           ${app.name}`);
    ui.print(`  Resource Group: ${app.resourceGroup}`);
    ui.print(`  Location:       ${app.location}`);
    ui.print(`  State:          ${app.state}`);
    ui.print(`  Default Host:   ${app.defaultHostName}`);
    ui.newLine();

    ui.print(ui.bold('Configuration:'));
    ui.print(
      `  Runtime:        ${app.siteConfig?.linuxFxVersion || app.siteConfig?.windowsFxVersion || 'N/A'}`
    );
    ui.print(`  Node Version:   ${app.siteConfig?.nodeVersion || 'N/A'}`);
    ui.print(`  Python Version: ${app.siteConfig?.pythonVersion || 'N/A'}`);
    ui.print(`  HTTPS Only:     ${app.httpsOnly ? 'Yes' : 'No'}`);
    ui.newLine();

    ui.print(ui.bold('Resources:'));
    ui.print(`  App Service Plan: ${app.serverFarmId?.split('/').pop() || 'Consumption'}`);
    ui.print(`  Kind:             ${app.kind}`);
    ui.newLine();

    ui.print(ui.bold('Outbound IPs:'));
    const outboundIps = app.outboundIpAddresses?.split(',') || [];
    for (const ip of outboundIps.slice(0, 5)) {
      ui.print(`  - ${ip}`);
    }
    if (outboundIps.length > 5) {
      ui.print(ui.dim(`  ... and ${outboundIps.length - 5} more`));
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch details');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to show function app', { error: message });
    ui.error(`Failed to show function app: ${message}`);
  }
}

/**
 * List functions in a Function App
 */
async function listFunctions(appName: string, options: AzureCommandOptions): Promise<void> {
  ui.header(`Functions in ${appName}`);
  ui.newLine();

  if (!options.resourceGroup) {
    ui.error('Resource group required (use -g)');
    return;
  }

  const azArgs = [
    'functionapp',
    'function',
    'list',
    '-n',
    appName,
    '-g',
    options.resourceGroup,
    '-o',
    'json',
  ];
  if (options.subscription) {
    azArgs.push('--subscription', options.subscription);
  }

  try {
    ui.startSpinner({ message: 'Fetching functions...' });
    const { stdout } = await execFileAsync('az', azArgs);
    ui.stopSpinnerSuccess('Functions fetched');

    const functions = JSON.parse(stdout || '[]');

    if (functions.length === 0) {
      ui.info('No functions found');
      return;
    }

    ui.print(`Found ${functions.length} function(s)\n`);

    for (const fn of functions) {
      const name = fn.name?.split('/').pop() || fn.name;
      const enabled = fn.isDisabled === false;

      ui.print(
        `  ${ui.color(name, 'cyan')} ${enabled ? ui.color('[enabled]', 'green') : ui.color('[disabled]', 'red')}`
      );

      // Show config if available
      if (fn.config?.bindings) {
        for (const binding of fn.config.bindings) {
          ui.print(ui.dim(`    ${binding.direction}: ${binding.type}`));
        }
      }
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch functions');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list functions', { error: message });
    ui.error(`Failed to list functions: ${message}`);
  }
}

/**
 * Show Functions help
 */
function showFunctionsHelp(): void {
  ui.print(ui.bold('Azure Functions Commands:'));
  ui.print('  list                        List all function apps');
  ui.print('  show <name> -g <rg>         Show function app details');
  ui.print('  functions <name> -g <rg>    List functions in app');
}
