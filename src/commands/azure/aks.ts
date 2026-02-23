/**
 * Azure Kubernetes Service CLI Commands
 *
 * Operations for AKS clusters
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../utils';
import { ui } from '../../wizard/ui';
import {
  loadSafetyPolicy,
  evaluateSafety,
  type SafetyContext,
  type SafetyCheckResult,
} from '../../config/safety-policy';
import { promptForApproval, displaySafetySummary } from '../../wizard/approval';
import type { AzureCommandOptions } from './index';

const execFileAsync = promisify(execFile);

/**
 * Run AKS safety checks
 */
async function runAksSafetyChecks(
  action: string,
  clusterName: string,
  options: AzureCommandOptions
): Promise<SafetyCheckResult> {
  const safetyPolicy = loadSafetyPolicy();

  const context: SafetyContext = {
    operation: action,
    type: 'azure',
    environment: options.subscription || 'default',
    resources: [clusterName],
    metadata: {
      resourceType: 'aks-cluster',
      resourceGroup: options.resourceGroup,
    },
  };

  return evaluateSafety(context, safetyPolicy);
}

/**
 * Main AKS command router
 */
export async function aksCommand(
  action: string,
  args: string[],
  options: AzureCommandOptions
): Promise<void> {
  logger.info('Running Azure AKS command', { action, args, options });

  switch (action) {
    case 'list':
      await listClusters(options);
      break;

    case 'show':
      if (!args[0]) {
        ui.error('Cluster name required');
        return;
      }
      await showCluster(args[0], options);
      break;

    case 'get-credentials':
      if (!args[0]) {
        ui.error('Cluster name required');
        return;
      }
      await getCredentials(args[0], options);
      break;

    case 'scale':
      if (args.length < 2) {
        ui.error('Cluster name and node count required');
        return;
      }
      await scaleCluster(args[0], parseInt(args[1], 10), options);
      break;

    case 'delete':
      if (!args[0]) {
        ui.error('Cluster name required');
        return;
      }
      await deleteCluster(args[0], options);
      break;

    default:
      showAksHelp();
      break;
  }
}

/**
 * List AKS clusters
 */
async function listClusters(options: AzureCommandOptions): Promise<void> {
  ui.header('AKS Clusters');
  ui.newLine();

  const azArgs = ['aks', 'list', '-o', 'json'];
  if (options.subscription) {
    azArgs.push('--subscription', options.subscription);
  }
  if (options.resourceGroup) {
    azArgs.push('-g', options.resourceGroup);
  }

  try {
    ui.startSpinner({ message: 'Fetching AKS clusters...' });
    const { stdout } = await execFileAsync('az', azArgs);
    ui.stopSpinnerSuccess('Clusters fetched');

    const clusters = JSON.parse(stdout || '[]');

    if (clusters.length === 0) {
      ui.info('No AKS clusters found');
      return;
    }

    ui.print(`Found ${clusters.length} cluster(s)\n`);

    // Display table
    ui.print(
      ui.color(
        'Name'.padEnd(25) +
          'Resource Group'.padEnd(25) +
          'Location'.padEnd(15) +
          'K8s Version'.padEnd(15) +
          'Status',
        'cyan'
      )
    );
    ui.print('─'.repeat(95));

    for (const cluster of clusters) {
      const name = cluster.name?.substring(0, 24) || '';
      const rg = cluster.resourceGroup?.substring(0, 24) || '';
      const location = cluster.location?.substring(0, 14) || '';
      const version = cluster.kubernetesVersion?.substring(0, 14) || '';
      const status = cluster.provisioningState || '';

      const statusColor =
        status === 'Succeeded'
          ? 'green'
          : status === 'Failed'
            ? 'red'
            : status === 'Updating'
              ? 'yellow'
              : 'white';

      ui.print(
        `${name.padEnd(25)}${rg.padEnd(25)}${location.padEnd(15)}${version.padEnd(15)}${ui.color(status, statusColor as 'green' | 'red' | 'yellow' | 'white')}`
      );
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch clusters');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list AKS clusters', { error: message });
    ui.error(`Failed to list clusters: ${message}`);
  }
}

/**
 * Show AKS cluster details
 */
async function showCluster(
  clusterName: string,
  options: AzureCommandOptions
): Promise<void> {
  ui.header(`AKS Cluster: ${clusterName}`);
  ui.newLine();

  if (!options.resourceGroup) {
    ui.error('Resource group required (use -g)');
    return;
  }

  const azArgs = ['aks', 'show', '-n', clusterName, '-g', options.resourceGroup, '-o', 'json'];
  if (options.subscription) {
    azArgs.push('--subscription', options.subscription);
  }

  try {
    ui.startSpinner({ message: 'Fetching cluster details...' });
    const { stdout } = await execFileAsync('az', azArgs);
    ui.stopSpinnerSuccess('Details fetched');

    const cluster = JSON.parse(stdout);

    ui.print(ui.bold('Basic Information:'));
    ui.print(`  Name:              ${cluster.name}`);
    ui.print(`  Resource Group:    ${cluster.resourceGroup}`);
    ui.print(`  Location:          ${cluster.location}`);
    ui.print(`  Kubernetes Ver:    ${cluster.kubernetesVersion}`);
    ui.print(`  Status:            ${cluster.provisioningState}`);
    ui.print(`  FQDN:              ${cluster.fqdn}`);
    ui.newLine();

    ui.print(ui.bold('Network:'));
    const networkProfile = cluster.networkProfile || {};
    ui.print(`  Network Plugin:    ${networkProfile.networkPlugin}`);
    ui.print(`  Network Policy:    ${networkProfile.networkPolicy || 'None'}`);
    ui.print(`  Service CIDR:      ${networkProfile.serviceCidr}`);
    ui.print(`  DNS Service IP:    ${networkProfile.dnsServiceIp}`);
    ui.print(`  Pod CIDR:          ${networkProfile.podCidr || 'N/A'}`);
    ui.newLine();

    ui.print(ui.bold('Node Pools:'));
    const nodePools = cluster.agentPoolProfiles || [];
    for (const pool of nodePools) {
      ui.print(`  ${ui.color(pool.name, 'cyan')}`);
      ui.print(`    VM Size:         ${pool.vmSize}`);
      ui.print(`    Node Count:      ${pool.count}`);
      ui.print(`    OS Type:         ${pool.osType}`);
      ui.print(`    Mode:            ${pool.mode}`);
      ui.newLine();
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch details');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to show cluster', { error: message });
    ui.error(`Failed to show cluster: ${message}`);
  }
}

/**
 * Get cluster credentials for kubectl
 */
async function getCredentials(
  clusterName: string,
  options: AzureCommandOptions
): Promise<void> {
  if (!options.resourceGroup) {
    ui.error('Resource group required (use -g)');
    return;
  }

  const azArgs = ['aks', 'get-credentials', '-n', clusterName, '-g', options.resourceGroup];
  if (options.subscription) {
    azArgs.push('--subscription', options.subscription);
  }

  try {
    ui.startSpinner({ message: `Getting credentials for ${clusterName}...` });
    await execFileAsync('az', azArgs);
    ui.stopSpinnerSuccess(`Credentials configured for cluster ${clusterName}`);
    ui.info('You can now use kubectl to interact with this cluster');
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to get credentials');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get credentials', { error: message });
    ui.error(`Failed to get credentials: ${message}`);
  }
}

/**
 * Scale AKS cluster
 */
async function scaleCluster(
  clusterName: string,
  nodeCount: number,
  options: AzureCommandOptions
): Promise<void> {
  if (!options.resourceGroup) {
    ui.error('Resource group required (use -g)');
    return;
  }

  // Run safety checks
  const safetyResult = await runAksSafetyChecks('scale', clusterName, options);

  displaySafetySummary({
    operation: `scale ${clusterName} to ${nodeCount} nodes`,
    risks: safetyResult.risks,
    passed: safetyResult.passed,
  });

  if (safetyResult.requiresApproval) {
    const result = await promptForApproval({
      title: 'Scale AKS Cluster',
      operation: `az aks scale -n ${clusterName} -g ${options.resourceGroup} --node-count ${nodeCount}`,
      risks: safetyResult.risks,
    });

    if (!result.approved) {
      ui.warning('Operation cancelled');
      return;
    }
  }

  const azArgs = ['aks', 'scale', '-n', clusterName, '-g', options.resourceGroup, '--node-count', String(nodeCount)];
  if (options.subscription) {
    azArgs.push('--subscription', options.subscription);
  }

  try {
    ui.startSpinner({ message: `Scaling cluster ${clusterName} to ${nodeCount} nodes...` });
    await execFileAsync('az', azArgs);
    ui.stopSpinnerSuccess(`Cluster ${clusterName} scaled to ${nodeCount} nodes`);
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to scale cluster');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to scale cluster', { error: message });
    ui.error(`Failed to scale cluster: ${message}`);
  }
}

/**
 * Delete AKS cluster (requires safety approval)
 */
async function deleteCluster(
  clusterName: string,
  options: AzureCommandOptions
): Promise<void> {
  if (!options.resourceGroup) {
    ui.error('Resource group required (use -g)');
    return;
  }

  // Run safety checks
  const safetyResult = await runAksSafetyChecks('delete', clusterName, options);

  displaySafetySummary({
    operation: `delete cluster ${clusterName}`,
    risks: safetyResult.risks,
    passed: safetyResult.passed,
  });

  if (safetyResult.requiresApproval) {
    const result = await promptForApproval({
      title: 'Delete AKS Cluster',
      operation: `az aks delete -n ${clusterName} -g ${options.resourceGroup}`,
      risks: safetyResult.risks,
    });

    if (!result.approved) {
      ui.warning('Operation cancelled');
      return;
    }
  }

  const azArgs = ['aks', 'delete', '-n', clusterName, '-g', options.resourceGroup, '--yes'];
  if (options.subscription) {
    azArgs.push('--subscription', options.subscription);
  }

  try {
    ui.startSpinner({ message: `Deleting cluster ${clusterName}...` });
    await execFileAsync('az', azArgs);
    ui.stopSpinnerSuccess(`Cluster ${clusterName} deleted`);
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to delete cluster');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete cluster', { error: message });
    ui.error(`Failed to delete cluster: ${message}`);
  }
}

/**
 * Show AKS help
 */
function showAksHelp(): void {
  ui.print(ui.bold('AKS Commands:'));
  ui.print('  list                              List all AKS clusters');
  ui.print('  show <name> -g <rg>               Show cluster details');
  ui.print('  get-credentials <name> -g <rg>    Configure kubectl for cluster');
  ui.print('  scale <name> <count> -g <rg>      Scale cluster (requires approval)');
  ui.print('  delete <name> -g <rg>             Delete cluster (requires approval)');
}
