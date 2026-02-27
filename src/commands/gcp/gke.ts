/**
 * GCP GKE CLI Commands
 *
 * Operations for Google Kubernetes Engine clusters
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
import type { GcpCommandOptions } from './index';

const execFileAsync = promisify(execFile);

/**
 * Run GKE safety checks
 */
async function runGkeSafetyChecks(
  action: string,
  clusterName: string,
  options: GcpCommandOptions
): Promise<SafetyCheckResult> {
  const safetyPolicy = loadSafetyPolicy();

  const context: SafetyContext = {
    operation: action,
    type: 'gcp',
    environment: options.project || 'default',
    resources: [clusterName],
    metadata: {
      resourceType: 'gke-cluster',
      resourceId: clusterName,
    },
  };

  return evaluateSafety(context, safetyPolicy);
}

/**
 * Main GKE command router
 */
export async function gkeCommand(
  action: string,
  args: string[],
  options: GcpCommandOptions
): Promise<void> {
  logger.info('Running GCP GKE command', { action, args, options });

  switch (action) {
    case 'clusters':
    case 'list':
      await listClusters(options);
      break;

    case 'describe':
      if (!args[0]) {
        ui.error('Cluster name required');
        return;
      }
      await describeCluster(args[0], options);
      break;

    case 'get-credentials':
      if (!args[0]) {
        ui.error('Cluster name required');
        return;
      }
      await getCredentials(args[0], options);
      break;

    case 'node-pools':
      if (!args[0]) {
        ui.error('Cluster name required');
        return;
      }
      await listNodePools(args[0], options);
      break;

    case 'resize':
      if (args.length < 2) {
        ui.error('Cluster name and node count required');
        return;
      }
      await resizeCluster(args[0], parseInt(args[1], 10), options);
      break;

    case 'delete':
      if (!args[0]) {
        ui.error('Cluster name required');
        return;
      }
      await deleteCluster(args[0], options);
      break;

    default:
      showGkeHelp();
      break;
  }
}

/**
 * List GKE clusters
 */
async function listClusters(options: GcpCommandOptions): Promise<void> {
  ui.header('GKE Clusters');
  ui.newLine();

  const gcloudArgs = ['container', 'clusters', 'list', '--format=json'];
  if (options.project) {
    gcloudArgs.push(`--project=${options.project}`);
  }
  if (options.region) {
    gcloudArgs.push(`--region=${options.region}`);
  }
  if (options.zone) {
    gcloudArgs.push(`--zone=${options.zone}`);
  }

  try {
    ui.startSpinner({ message: 'Fetching clusters...' });
    const { stdout } = await execFileAsync('gcloud', gcloudArgs);
    ui.stopSpinnerSuccess('Clusters fetched');

    const clusters = JSON.parse(stdout || '[]');

    if (clusters.length === 0) {
      ui.info('No clusters found');
      return;
    }

    ui.print(`Found ${clusters.length} cluster(s)\n`);

    // Display table
    ui.print(
      ui.color(
        `${
          'Name'.padEnd(25) + 'Location'.padEnd(20) + 'Node Count'.padEnd(12) + 'Status'.padEnd(12)
        }Version`,
        'cyan'
      )
    );
    ui.print('─'.repeat(90));

    for (const cluster of clusters) {
      const name = cluster.name?.substring(0, 24) || '';
      const location = cluster.location?.substring(0, 19) || '';
      const nodeCount = String(cluster.currentNodeCount || 0);
      const status = cluster.status || '';
      const version = cluster.currentMasterVersion || '';

      const statusColor =
        status === 'RUNNING'
          ? 'green'
          : status === 'PROVISIONING'
            ? 'yellow'
            : status === 'ERROR'
              ? 'red'
              : 'white';

      ui.print(
        `${name.padEnd(25)}${location.padEnd(20)}${nodeCount.padEnd(12)}${ui.color(status.padEnd(12), statusColor as 'green' | 'yellow' | 'red' | 'white')}${version}`
      );
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch clusters');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list clusters', { error: message });
    ui.error(`Failed to list clusters: ${message}`);
  }
}

/**
 * Describe a specific cluster
 */
async function describeCluster(clusterName: string, options: GcpCommandOptions): Promise<void> {
  ui.header(`Cluster: ${clusterName}`);
  ui.newLine();

  const gcloudArgs = ['container', 'clusters', 'describe', clusterName, '--format=json'];
  if (options.project) {
    gcloudArgs.push(`--project=${options.project}`);
  }
  if (options.region) {
    gcloudArgs.push(`--region=${options.region}`);
  }
  if (options.zone) {
    gcloudArgs.push(`--zone=${options.zone}`);
  }

  try {
    ui.startSpinner({ message: 'Fetching cluster details...' });
    const { stdout } = await execFileAsync('gcloud', gcloudArgs);
    ui.stopSpinnerSuccess('Details fetched');

    const cluster = JSON.parse(stdout);

    ui.print(ui.bold('Basic Information:'));
    ui.print(`  Name:            ${cluster.name}`);
    ui.print(`  Location:        ${cluster.location}`);
    ui.print(`  Status:          ${cluster.status}`);
    ui.print(`  Master Version:  ${cluster.currentMasterVersion}`);
    ui.print(`  Node Count:      ${cluster.currentNodeCount}`);
    ui.print(`  Endpoint:        ${cluster.endpoint}`);
    ui.newLine();

    ui.print(ui.bold('Node Config:'));
    const nodeConfig = cluster.nodeConfig || {};
    ui.print(`  Machine Type:    ${nodeConfig.machineType}`);
    ui.print(`  Disk Size:       ${nodeConfig.diskSizeGb} GB`);
    ui.print(`  Disk Type:       ${nodeConfig.diskType}`);
    ui.newLine();

    ui.print(ui.bold('Networking:'));
    ui.print(`  Network:         ${cluster.network}`);
    ui.print(`  Subnetwork:      ${cluster.subnetwork}`);
    ui.print(`  Cluster CIDR:    ${cluster.clusterIpv4Cidr}`);
    ui.print(`  Services CIDR:   ${cluster.servicesIpv4Cidr}`);
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch details');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to describe cluster', { error: message });
    ui.error(`Failed to describe cluster: ${message}`);
  }
}

/**
 * Get cluster credentials for kubectl
 */
async function getCredentials(clusterName: string, options: GcpCommandOptions): Promise<void> {
  const gcloudArgs = ['container', 'clusters', 'get-credentials', clusterName];
  if (options.project) {
    gcloudArgs.push(`--project=${options.project}`);
  }
  if (options.region) {
    gcloudArgs.push(`--region=${options.region}`);
  }
  if (options.zone) {
    gcloudArgs.push(`--zone=${options.zone}`);
  }

  try {
    ui.startSpinner({ message: `Getting credentials for ${clusterName}...` });
    await execFileAsync('gcloud', gcloudArgs);
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
 * List node pools in a cluster
 */
async function listNodePools(clusterName: string, options: GcpCommandOptions): Promise<void> {
  ui.header(`Node Pools in ${clusterName}`);
  ui.newLine();

  const gcloudArgs = ['container', 'node-pools', 'list', '--cluster', clusterName, '--format=json'];
  if (options.project) {
    gcloudArgs.push(`--project=${options.project}`);
  }
  if (options.region) {
    gcloudArgs.push(`--region=${options.region}`);
  }
  if (options.zone) {
    gcloudArgs.push(`--zone=${options.zone}`);
  }

  try {
    ui.startSpinner({ message: 'Fetching node pools...' });
    const { stdout } = await execFileAsync('gcloud', gcloudArgs);
    ui.stopSpinnerSuccess('Node pools fetched');

    const nodePools = JSON.parse(stdout || '[]');

    if (nodePools.length === 0) {
      ui.info('No node pools found');
      return;
    }

    ui.print(`Found ${nodePools.length} node pool(s)\n`);

    // Display table
    ui.print(
      ui.color(
        `${'Name'.padEnd(25) + 'Machine Type'.padEnd(20) + 'Node Count'.padEnd(12)}Version`,
        'cyan'
      )
    );
    ui.print('─'.repeat(75));

    for (const pool of nodePools) {
      const name = pool.name?.substring(0, 24) || '';
      const machineType = pool.config?.machineType?.substring(0, 19) || '';
      const nodeCount = String(pool.initialNodeCount || 0);
      const version = pool.version || '';

      ui.print(`${name.padEnd(25)}${machineType.padEnd(20)}${nodeCount.padEnd(12)}${version}`);
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to fetch node pools');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list node pools', { error: message });
    ui.error(`Failed to list node pools: ${message}`);
  }
}

/**
 * Resize cluster node pool
 */
async function resizeCluster(
  clusterName: string,
  nodeCount: number,
  options: GcpCommandOptions
): Promise<void> {
  // Run safety checks
  const safetyResult = await runGkeSafetyChecks('resize', clusterName, options);

  displaySafetySummary({
    operation: `resize ${clusterName} to ${nodeCount} nodes`,
    risks: safetyResult.risks,
    passed: safetyResult.passed,
  });

  if (safetyResult.requiresApproval) {
    const result = await promptForApproval({
      title: 'Resize GKE Cluster',
      operation: `gcloud container clusters resize ${clusterName} --num-nodes=${nodeCount}`,
      risks: safetyResult.risks,
    });

    if (!result.approved) {
      ui.warning('Operation cancelled');
      return;
    }
  }

  const gcloudArgs = [
    'container',
    'clusters',
    'resize',
    clusterName,
    `--num-nodes=${nodeCount}`,
    '--quiet',
  ];
  if (options.project) {
    gcloudArgs.push(`--project=${options.project}`);
  }
  if (options.region) {
    gcloudArgs.push(`--region=${options.region}`);
  }
  if (options.zone) {
    gcloudArgs.push(`--zone=${options.zone}`);
  }

  try {
    ui.startSpinner({ message: `Resizing cluster ${clusterName} to ${nodeCount} nodes...` });
    await execFileAsync('gcloud', gcloudArgs);
    ui.stopSpinnerSuccess(`Cluster ${clusterName} resized to ${nodeCount} nodes`);
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to resize cluster');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to resize cluster', { error: message });
    ui.error(`Failed to resize cluster: ${message}`);
  }
}

/**
 * Delete a cluster (requires safety approval)
 */
async function deleteCluster(clusterName: string, options: GcpCommandOptions): Promise<void> {
  // Run safety checks
  const safetyResult = await runGkeSafetyChecks('delete', clusterName, options);

  displaySafetySummary({
    operation: `delete cluster ${clusterName}`,
    risks: safetyResult.risks,
    passed: safetyResult.passed,
  });

  if (safetyResult.requiresApproval) {
    const result = await promptForApproval({
      title: 'Delete GKE Cluster',
      operation: `gcloud container clusters delete ${clusterName}`,
      risks: safetyResult.risks,
    });

    if (!result.approved) {
      ui.warning('Operation cancelled');
      return;
    }
  }

  const gcloudArgs = ['container', 'clusters', 'delete', clusterName, '--quiet'];
  if (options.project) {
    gcloudArgs.push(`--project=${options.project}`);
  }
  if (options.region) {
    gcloudArgs.push(`--region=${options.region}`);
  }
  if (options.zone) {
    gcloudArgs.push(`--zone=${options.zone}`);
  }

  try {
    ui.startSpinner({ message: `Deleting cluster ${clusterName}...` });
    await execFileAsync('gcloud', gcloudArgs);
    ui.stopSpinnerSuccess(`Cluster ${clusterName} deleted`);
  } catch (error: unknown) {
    ui.stopSpinnerFail('Failed to delete cluster');
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete cluster', { error: message });
    ui.error(`Failed to delete cluster: ${message}`);
  }
}

/**
 * Show GKE help
 */
function showGkeHelp(): void {
  ui.print(ui.bold('GKE Commands:'));
  ui.print('  clusters                     List all GKE clusters');
  ui.print('  describe <name>              Show cluster details');
  ui.print('  get-credentials <name>       Configure kubectl for cluster');
  ui.print('  node-pools <cluster>         List node pools in cluster');
  ui.print('  resize <cluster> <count>     Resize cluster (requires approval)');
  ui.print('  delete <name>                Delete cluster (requires approval)');
}
