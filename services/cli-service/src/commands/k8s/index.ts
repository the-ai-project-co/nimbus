/**
 * Kubernetes Commands
 *
 * CLI commands for Kubernetes operations
 */

import { k8sClient } from '../../clients';
import { ui } from '../../wizard/ui';

export interface K8sCommandOptions {
  namespace?: string;
  name?: string;
  labels?: Record<string, string>;
  output?: 'json' | 'yaml' | 'wide';
  container?: string;
  tail?: number;
  since?: string;
  force?: boolean;
  dryRun?: boolean;
}

/**
 * Get Kubernetes resources
 */
export async function k8sGetCommand(resource: string, options: K8sCommandOptions = {}): Promise<void> {
  ui.header(`Kubernetes Get ${resource}`);

  if (options.namespace) {
    ui.info(`Namespace: ${options.namespace}`);
  } else {
    ui.info('Namespace: all');
  }

  ui.startSpinner({ message: `Getting ${resource}...` });

  try {
    const available = await k8sClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Kubernetes Tools Service not available');
      ui.error('Please ensure the Kubernetes Tools Service is running.');
      return;
    }

    const result = await k8sClient.get(resource, {
      namespace: options.namespace,
      name: options.name,
      labels: options.labels,
      output: options.output,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Found ${result.items.length} ${resource}`);

      if (result.items.length > 0) {
        // Display as table
        ui.table({
          columns: [
            { key: 'name', header: 'Name' },
            { key: 'namespace', header: 'Namespace' },
            { key: 'kind', header: 'Kind' },
            { key: 'labels', header: 'Labels' },
          ],
          data: result.items.map((item) => ({
            name: item.metadata.name,
            namespace: item.metadata.namespace || 'default',
            kind: item.kind,
            labels: Object.entries(item.metadata.labels || {})
              .map(([k, v]) => `${k}=${v}`)
              .join(', ') || '-',
          })),
        });
      }
    } else {
      ui.stopSpinnerFail(`Failed to get ${resource}`);
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail(`Error getting ${resource}`);
    ui.error(error.message);
  }
}

/**
 * Apply Kubernetes manifests
 */
export async function k8sApplyCommand(
  manifests: string,
  options: K8sCommandOptions = {}
): Promise<void> {
  ui.header('Kubernetes Apply');

  ui.startSpinner({ message: 'Applying manifests...' });

  try {
    const available = await k8sClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Kubernetes Tools Service not available');
      ui.error('Please ensure the Kubernetes Tools Service is running.');
      return;
    }

    const result = await k8sClient.apply(manifests, {
      namespace: options.namespace,
      dryRun: options.dryRun,
    });

    if (result.success) {
      ui.stopSpinnerSuccess('Manifests applied successfully');

      if (result.created && result.created.length > 0) {
        ui.info('Created:');
        result.created.forEach((r) => ui.info(`  - ${r}`));
      }

      if (result.configured && result.configured.length > 0) {
        ui.info('Configured:');
        result.configured.forEach((r) => ui.info(`  - ${r}`));
      }

      if (result.output) {
        ui.box({ title: 'Output', content: result.output });
      }
    } else {
      ui.stopSpinnerFail('Failed to apply manifests');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error applying manifests');
    ui.error(error.message);
  }
}

/**
 * Delete Kubernetes resources
 */
export async function k8sDeleteCommand(
  resource: string,
  name: string,
  options: K8sCommandOptions = {}
): Promise<void> {
  ui.header(`Kubernetes Delete ${resource}/${name}`);

  if (options.namespace) {
    ui.info(`Namespace: ${options.namespace}`);
  }

  ui.startSpinner({ message: `Deleting ${resource}/${name}...` });

  try {
    const available = await k8sClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Kubernetes Tools Service not available');
      ui.error('Please ensure the Kubernetes Tools Service is running.');
      return;
    }

    const result = await k8sClient.delete(resource, name, {
      namespace: options.namespace,
      force: options.force,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Deleted ${resource}/${name}`);

      if (result.deleted && result.deleted.length > 0) {
        ui.info('Deleted:');
        result.deleted.forEach((r) => ui.info(`  - ${r}`));
      }
    } else {
      ui.stopSpinnerFail(`Failed to delete ${resource}/${name}`);
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail(`Error deleting ${resource}/${name}`);
    ui.error(error.message);
  }
}

/**
 * Get pod logs
 */
export async function k8sLogsCommand(podName: string, options: K8sCommandOptions = {}): Promise<void> {
  ui.header(`Kubernetes Logs - ${podName}`);

  if (options.namespace) {
    ui.info(`Namespace: ${options.namespace}`);
  }
  if (options.container) {
    ui.info(`Container: ${options.container}`);
  }

  ui.startSpinner({ message: `Fetching logs from ${podName}...` });

  try {
    const available = await k8sClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Kubernetes Tools Service not available');
      ui.error('Please ensure the Kubernetes Tools Service is running.');
      return;
    }

    const result = await k8sClient.logs(podName, {
      namespace: options.namespace,
      container: options.container,
      tail: options.tail,
      since: options.since,
    });

    if (result.success) {
      ui.stopSpinnerSuccess('Logs retrieved');
      console.log(result.logs);
    } else {
      ui.stopSpinnerFail('Failed to get logs');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error getting logs');
    ui.error(error.message);
  }
}

/**
 * Describe Kubernetes resource
 */
export async function k8sDescribeCommand(
  resource: string,
  name: string,
  options: K8sCommandOptions = {}
): Promise<void> {
  ui.header(`Kubernetes Describe ${resource}/${name}`);

  if (options.namespace) {
    ui.info(`Namespace: ${options.namespace}`);
  }

  ui.startSpinner({ message: `Describing ${resource}/${name}...` });

  try {
    const available = await k8sClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Kubernetes Tools Service not available');
      ui.error('Please ensure the Kubernetes Tools Service is running.');
      return;
    }

    const result = await k8sClient.describe(resource, name, {
      namespace: options.namespace,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Described ${resource}/${name}`);
      console.log(result.output);
    } else {
      ui.stopSpinnerFail(`Failed to describe ${resource}/${name}`);
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail(`Error describing ${resource}/${name}`);
    ui.error(error.message);
  }
}

/**
 * Scale deployment/replicaset
 */
export async function k8sScaleCommand(
  resource: string,
  name: string,
  replicas: number,
  options: K8sCommandOptions = {}
): Promise<void> {
  ui.header(`Kubernetes Scale ${resource}/${name}`);

  ui.info(`Scaling to ${replicas} replicas`);
  if (options.namespace) {
    ui.info(`Namespace: ${options.namespace}`);
  }

  ui.startSpinner({ message: `Scaling ${resource}/${name} to ${replicas}...` });

  try {
    const available = await k8sClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Kubernetes Tools Service not available');
      ui.error('Please ensure the Kubernetes Tools Service is running.');
      return;
    }

    const result = await k8sClient.scale(resource, name, replicas, {
      namespace: options.namespace,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Scaled ${resource}/${name} to ${replicas} replicas`);
      if (result.output) {
        ui.box({ title: 'Output', content: result.output });
      }
    } else {
      ui.stopSpinnerFail(`Failed to scale ${resource}/${name}`);
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail(`Error scaling ${resource}/${name}`);
    ui.error(error.message);
  }
}

/**
 * Main k8s command router
 */
export async function k8sCommand(subcommand: string, args: string[]): Promise<void> {
  const options: K8sCommandOptions = {};

  // Extract positional args and options
  const positionalArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-n' || arg === '--namespace') {
      options.namespace = args[++i];
    } else if (arg === '-c' || arg === '--container') {
      options.container = args[++i];
    } else if (arg === '--tail') {
      options.tail = parseInt(args[++i], 10);
    } else if (arg === '--since') {
      options.since = args[++i];
    } else if (arg === '-o' || arg === '--output') {
      options.output = args[++i] as 'json' | 'yaml' | 'wide';
    } else if (arg === '-f' || arg === '--force') {
      options.force = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('-l') || arg === '--labels') {
      const labelArg = arg.startsWith('-l=') ? arg.slice(3) : args[++i];
      options.labels = options.labels || {};
      const [key, value] = labelArg.split('=');
      options.labels[key] = value;
    } else if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    }
  }

  switch (subcommand) {
    case 'get':
      if (positionalArgs.length < 1) {
        ui.error('Usage: nimbus k8s get <resource> [name]');
        return;
      }
      options.name = positionalArgs[1];
      await k8sGetCommand(positionalArgs[0], options);
      break;
    case 'apply':
      if (positionalArgs.length < 1) {
        ui.error('Usage: nimbus k8s apply <manifest-file-or-yaml>');
        return;
      }
      await k8sApplyCommand(positionalArgs[0], options);
      break;
    case 'delete':
      if (positionalArgs.length < 2) {
        ui.error('Usage: nimbus k8s delete <resource> <name>');
        return;
      }
      await k8sDeleteCommand(positionalArgs[0], positionalArgs[1], options);
      break;
    case 'logs':
      if (positionalArgs.length < 1) {
        ui.error('Usage: nimbus k8s logs <pod-name>');
        return;
      }
      await k8sLogsCommand(positionalArgs[0], options);
      break;
    case 'describe':
      if (positionalArgs.length < 2) {
        ui.error('Usage: nimbus k8s describe <resource> <name>');
        return;
      }
      await k8sDescribeCommand(positionalArgs[0], positionalArgs[1], options);
      break;
    case 'scale':
      if (positionalArgs.length < 3) {
        ui.error('Usage: nimbus k8s scale <resource> <name> <replicas>');
        return;
      }
      await k8sScaleCommand(
        positionalArgs[0],
        positionalArgs[1],
        parseInt(positionalArgs[2], 10),
        options
      );
      break;
    default:
      ui.error(`Unknown k8s subcommand: ${subcommand}`);
      ui.info('Available commands: get, apply, delete, logs, describe, scale');
  }
}
