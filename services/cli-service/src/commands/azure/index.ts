/**
 * Azure CLI Commands
 *
 * Wrapper for Azure CLI operations with enhanced output and safety checks
 *
 * Usage:
 *   nimbus azure vm list
 *   nimbus azure storage account list
 *   nimbus azure aks list
 *   nimbus azure functions list
 */

import { logger } from '@nimbus/shared-utils';
import { ui } from '../../wizard/ui';
import { vmCommand } from './vm';
import { storageCommand } from './storage';
import { aksCommand } from './aks';
import { functionsCommand } from './functions';

export interface AzureCommandOptions {
  subscription?: string;
  resourceGroup?: string;
  output?: 'json' | 'table' | 'tsv';
}

/**
 * Parse common Azure options from args
 */
export function parseAzureOptions(args: string[]): AzureCommandOptions {
  const options: AzureCommandOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if ((arg === '--subscription' || arg === '-s') && args[i + 1]) {
      options.subscription = args[++i];
    } else if ((arg === '--resource-group' || arg === '-g') && args[i + 1]) {
      options.resourceGroup = args[++i];
    } else if ((arg === '--output' || arg === '-o') && args[i + 1]) {
      options.output = args[++i] as 'json' | 'table' | 'tsv';
    }
  }

  return options;
}

/**
 * Main Azure command router
 */
export async function azureCommand(subcommand: string, args: string[]): Promise<void> {
  logger.info('Running Azure command', { subcommand, args });

  const options = parseAzureOptions(args);
  const positionalArgs = args.filter(arg => !arg.startsWith('-') && !arg.startsWith('--'));

  switch (subcommand) {
    case 'vm':
      await vmCommand(positionalArgs[0], positionalArgs.slice(1), options);
      break;

    case 'storage':
      await storageCommand(positionalArgs[0], positionalArgs.slice(1), options);
      break;

    case 'aks':
      await aksCommand(positionalArgs[0], positionalArgs.slice(1), options);
      break;

    case 'functions':
      await functionsCommand(positionalArgs[0], positionalArgs.slice(1), options);
      break;

    default:
      showAzureHelp();
      break;
  }
}

/**
 * Show Azure command help
 */
function showAzureHelp(): void {
  ui.header('Nimbus Azure Commands');
  ui.newLine();

  ui.print('Usage: nimbus azure <service> <action> [options]');
  ui.newLine();

  ui.print(ui.bold('Services:'));
  ui.print('  vm          Virtual Machine operations');
  ui.print('  storage     Storage account and blob operations');
  ui.print('  aks         Azure Kubernetes Service operations');
  ui.print('  functions   Azure Functions operations');
  ui.newLine();

  ui.print(ui.bold('Common Options:'));
  ui.print('  --subscription, -s      Azure subscription ID');
  ui.print('  --resource-group, -g    Resource group name');
  ui.print('  --output, -o            Output format (json, table, tsv)');
  ui.newLine();

  ui.print(ui.bold('Examples:'));
  ui.print('  nimbus azure vm list                        List all VMs');
  ui.print('  nimbus azure vm show my-vm -g my-rg         Show VM details');
  ui.print('  nimbus azure storage account list           List storage accounts');
  ui.print('  nimbus azure aks list                       List AKS clusters');
  ui.print('  nimbus azure functions list                 List function apps');
}

// Re-export subcommands
export { vmCommand } from './vm';
export { storageCommand } from './storage';
export { aksCommand } from './aks';
export { functionsCommand } from './functions';

export default azureCommand;
