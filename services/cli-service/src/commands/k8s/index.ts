/**
 * Kubernetes Commands
 *
 * CLI commands for Kubernetes operations
 */

import { k8sClient } from '../../clients';
import { ui } from '../../wizard/ui';
import { confirmWithResourceName } from '../../wizard/approval';
import { showDestructionCostWarning } from '../../utils/cost-warning';
import { historyManager } from '../../history';

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

  // Show destructive operation warning with resource count and estimated impact
  ui.newLine();
  ui.warning(`Destructive operation: deleting ${resource}/${name}`);
  ui.print(`  ${ui.color('Resource:', 'yellow')} ${resource}`);
  ui.print(`  ${ui.color('Name:', 'yellow')} ${name}`);
  ui.print(`  ${ui.color('Namespace:', 'yellow')} ${options.namespace || 'default'}`);
  ui.print(`  ${ui.color('Resources affected:', 'yellow')} 1 ${resource}`);
  ui.print(`  ${ui.color('Impact:', 'red')} This will permanently remove the ${resource} and any dependent resources.`);

  // Show cost warning before destructive operation
  await showDestructionCostWarning(process.cwd());

  // Require type-name-to-delete confirmation for destructive operations
  if (!options.force && !options.dryRun) {
    const confirmed = await confirmWithResourceName(name, resource);
    if (!confirmed) {
      return;
    }
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
 * Execute a command in a pod
 */
export async function k8sExecCommand(
  pod: string,
  command: string[],
  options: K8sCommandOptions = {}
): Promise<void> {
  ui.header(`Kubernetes Exec - ${pod}`);

  if (options.namespace) {
    ui.info(`Namespace: ${options.namespace}`);
  }
  if (options.container) {
    ui.info(`Container: ${options.container}`);
  }
  ui.info(`Command: ${command.join(' ')}`);

  ui.startSpinner({ message: `Executing in ${pod}...` });

  try {
    const available = await k8sClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Kubernetes Tools Service not available');
      ui.error('Please ensure the Kubernetes Tools Service is running.');
      return;
    }

    const result = await k8sClient.exec(pod, command, {
      namespace: options.namespace,
      container: options.container,
    });

    if (result.success) {
      ui.stopSpinnerSuccess('Command executed');
      if (result.output) {
        console.log(result.output);
      }
    } else {
      ui.stopSpinnerFail('Command failed');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error executing command');
    ui.error(error.message);
  }
}

/**
 * Manage rollouts for a resource
 */
export async function k8sRolloutCommand(
  resource: string,
  name: string,
  action: 'status' | 'history' | 'restart' | 'undo' | 'pause' | 'resume',
  options: K8sCommandOptions = {}
): Promise<void> {
  ui.header(`Kubernetes Rollout ${action} - ${resource}/${name}`);

  if (options.namespace) {
    ui.info(`Namespace: ${options.namespace}`);
  }

  ui.startSpinner({ message: `Running rollout ${action}...` });

  try {
    const available = await k8sClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Kubernetes Tools Service not available');
      ui.error('Please ensure the Kubernetes Tools Service is running.');
      return;
    }

    const result = await k8sClient.rollout(resource, name, action, {
      namespace: options.namespace,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Rollout ${action} complete`);
      if (result.output) {
        console.log(result.output);
      }
    } else {
      ui.stopSpinnerFail(`Rollout ${action} failed`);
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail(`Error during rollout ${action}`);
    ui.error(error.message);
  }
}

/**
 * Get Kubernetes events
 */
export async function k8sEventsCommand(options: K8sCommandOptions = {}): Promise<void> {
  ui.header('Kubernetes Events');

  if (options.namespace) {
    ui.info(`Namespace: ${options.namespace}`);
  } else {
    ui.info('Namespace: all');
  }

  ui.startSpinner({ message: 'Fetching events...' });

  try {
    const available = await k8sClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Kubernetes Tools Service not available');
      ui.error('Please ensure the Kubernetes Tools Service is running.');
      return;
    }

    const result = await k8sClient.events({
      namespace: options.namespace,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Found ${result.events.length} events`);

      if (result.events.length > 0) {
        ui.table({
          columns: [
            { key: 'type', header: 'Type' },
            { key: 'reason', header: 'Reason' },
            { key: 'object', header: 'Object' },
            { key: 'message', header: 'Message' },
            { key: 'age', header: 'Age' },
          ],
          data: result.events.map((event) => ({
            type: event.type || '-',
            reason: event.reason || '-',
            object: event.object || '-',
            message: event.message || '-',
            age: event.age || '-',
          })),
        });
      }
    } else {
      ui.stopSpinnerFail('Failed to get events');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error getting events');
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

  const startTime = Date.now();
  const entry = historyManager.addEntry('k8s', [subcommand, ...args]);

  try {
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
      case 'exec': {
        if (positionalArgs.length < 1) {
          ui.error('Usage: nimbus k8s exec <pod> -- <command...>');
          return;
        }
        // Everything after '--' is the command
        const dashIdx = args.indexOf('--');
        const execCmd = dashIdx >= 0 ? args.slice(dashIdx + 1) : positionalArgs.slice(1);
        if (execCmd.length === 0) {
          ui.error('Usage: nimbus k8s exec <pod> -- <command...>');
          return;
        }
        await k8sExecCommand(positionalArgs[0], execCmd, options);
        break;
      }
      case 'rollout': {
        if (positionalArgs.length < 2) {
          ui.error('Usage: nimbus k8s rollout <action> <resource>/<name>');
          ui.info('Actions: status, history, restart, undo, pause, resume');
          return;
        }
        const rolloutAction = positionalArgs[0] as 'status' | 'history' | 'restart' | 'undo' | 'pause' | 'resume';
        const resourceParts = positionalArgs[1].split('/');
        const rolloutResource = resourceParts.length > 1 ? resourceParts[0] : 'deployment';
        const rolloutName = resourceParts.length > 1 ? resourceParts[1] : resourceParts[0];
        await k8sRolloutCommand(rolloutResource, rolloutName, rolloutAction, options);
        break;
      }
      case 'events':
        await k8sEventsCommand(options);
        break;
      case 'generate': {
        const type = positionalArgs[0] as string | undefined;
        const { generateK8sCommand } = await import('../generate-k8s');
        await generateK8sCommand({ workloadType: type as any });
        break;
      }
      default:
        ui.error(`Unknown k8s subcommand: ${subcommand}`);
        ui.info('Available commands: get, apply, delete, logs, describe, scale, exec, rollout, events, generate');
    }

    historyManager.completeEntry(entry.id, 'success', Date.now() - startTime);
  } catch (error: any) {
    historyManager.completeEntry(entry.id, 'failure', Date.now() - startTime, { error: error.message });
    throw error;
  }
}
