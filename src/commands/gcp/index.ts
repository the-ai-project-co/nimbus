/**
 * GCP CLI Commands
 *
 * Wrapper for Google Cloud CLI operations with enhanced output and safety checks
 *
 * Usage:
 *   nimbus gcp compute list
 *   nimbus gcp storage ls
 *   nimbus gcp gke clusters
 *   nimbus gcp functions list
 *   nimbus gcp iam service-accounts
 */

import { logger } from '../../utils';
import { ui } from '../../wizard/ui';
import { computeCommand } from './compute';
import { storageCommand } from './storage';
import { gkeCommand } from './gke';
import { functionsCommand } from './functions';
import { iamCommand } from './iam';

export interface GcpCommandOptions {
  project?: string;
  region?: string;
  zone?: string;
  format?: 'json' | 'table' | 'text';
}

/**
 * Parse common GCP options from args
 */
export function parseGcpOptions(args: string[]): GcpCommandOptions {
  const options: GcpCommandOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if ((arg === '--project' || arg === '-p') && args[i + 1]) {
      options.project = args[++i];
    } else if ((arg === '--region' || arg === '-r') && args[i + 1]) {
      options.region = args[++i];
    } else if ((arg === '--zone' || arg === '-z') && args[i + 1]) {
      options.zone = args[++i];
    } else if ((arg === '--format' || arg === '-f') && args[i + 1]) {
      options.format = args[++i] as 'json' | 'table' | 'text';
    }
  }

  return options;
}

/**
 * Main GCP command router
 */
export async function gcpCommand(subcommand: string, args: string[]): Promise<void> {
  logger.info('Running GCP command', { subcommand, args });

  const options = parseGcpOptions(args);
  const positionalArgs = args.filter(arg => !arg.startsWith('-') && !arg.startsWith('--'));

  switch (subcommand) {
    case 'compute':
      await computeCommand(positionalArgs[0], positionalArgs.slice(1), options);
      break;

    case 'storage':
      await storageCommand(positionalArgs[0], positionalArgs.slice(1), options);
      break;

    case 'gke':
      await gkeCommand(positionalArgs[0], positionalArgs.slice(1), options);
      break;

    case 'functions':
      await functionsCommand(positionalArgs[0], positionalArgs.slice(1), options);
      break;

    case 'iam':
      await iamCommand(positionalArgs[0], positionalArgs.slice(1), options);
      break;

    default:
      showGcpHelp();
      break;
  }
}

/**
 * Show GCP command help
 */
function showGcpHelp(): void {
  ui.header('Nimbus GCP Commands');
  ui.newLine();

  ui.print('Usage: nimbus gcp <service> <action> [options]');
  ui.newLine();

  ui.print(ui.bold('Services:'));
  ui.print('  compute     Compute Engine operations');
  ui.print('  storage     Cloud Storage operations');
  ui.print('  gke         Google Kubernetes Engine operations');
  ui.print('  functions   Cloud Functions operations');
  ui.print('  iam         IAM service accounts and roles');
  ui.newLine();

  ui.print(ui.bold('Common Options:'));
  ui.print('  --project, -p   GCP project ID');
  ui.print('  --region, -r    GCP region');
  ui.print('  --zone, -z      GCP zone');
  ui.print('  --format, -f    Output format (json, table, text)');
  ui.newLine();

  ui.print(ui.bold('Examples:'));
  ui.print('  nimbus gcp compute list                    List all Compute Engine instances');
  ui.print('  nimbus gcp compute describe my-instance    Describe specific instance');
  ui.print('  nimbus gcp storage ls                      List all Cloud Storage buckets');
  ui.print('  nimbus gcp storage ls gs://my-bucket       List objects in bucket');
  ui.print('  nimbus gcp gke clusters                    List GKE clusters');
  ui.print('  nimbus gcp functions list                  List Cloud Functions');
}

// Re-export subcommands
export { computeCommand } from './compute';
export { storageCommand } from './storage';
export { gkeCommand } from './gke';
export { functionsCommand } from './functions';
export { iamCommand } from './iam';

export default gcpCommand;
