/**
 * Apply Kubernetes Command
 *
 * Apply Kubernetes manifests to a cluster
 *
 * Usage: nimbus apply k8s <manifests> [options]
 */

import { logger } from '@nimbus/shared-utils';
import { ui, confirm } from '../../wizard';
import { k8sClient } from '../../clients';
import {
  loadSafetyPolicy,
  evaluateSafety,
  type SafetyContext,
  type SafetyCheckResult,
} from '../../config/safety-policy';
import { promptForApproval, displaySafetySummary } from '../../wizard/approval';

/**
 * Command options
 */
export interface ApplyK8sOptions {
  manifests?: string;
  namespace?: string;
  dryRun?: boolean;
  wait?: boolean;
  prune?: boolean;
  force?: boolean;
  recursive?: boolean;
  selector?: string;
  /** Skip safety checks */
  skipSafety?: boolean;
  /** Environment name (for safety policy) */
  environment?: string;
}

/**
 * Run kubectl apply command
 */
export async function applyK8sCommand(options: ApplyK8sOptions = {}): Promise<void> {
  logger.info('Running kubectl apply', { options });

  const manifests = options.manifests || '.';

  ui.header('Kubernetes Apply');
  ui.info(`Manifests: ${manifests}`);
  if (options.namespace) {
    ui.info(`Namespace: ${options.namespace}`);
  }
  ui.newLine();

  // Check if k8s client is available
  const clientAvailable = await k8sClient.isAvailable();

  if (clientAvailable) {
    // Use K8s tools service
    await applyWithService(options);
  } else {
    // Fall back to local kubectl CLI
    await applyWithLocalCLI(options);
  }
}

/**
 * Apply using K8s Tools Service
 */
async function applyWithService(options: ApplyK8sOptions): Promise<void> {
  const manifests = options.manifests || '.';
  const fs = await import('fs/promises');
  const path = await import('path');

  // Read manifest files
  let manifestContent: string;

  try {
    const stat = await fs.stat(manifests);

    if (stat.isDirectory()) {
      // Read all YAML files in directory
      const files = await fs.readdir(manifests);
      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

      if (yamlFiles.length === 0) {
        ui.error('No YAML manifests found in directory');
        process.exit(1);
      }

      const contents = await Promise.all(
        yamlFiles.map(f => fs.readFile(path.join(manifests, f), 'utf-8'))
      );
      manifestContent = contents.join('\n---\n');

      ui.info(`Found ${yamlFiles.length} manifest file(s)`);
    } else {
      manifestContent = await fs.readFile(manifests, 'utf-8');
    }
  } catch (error: any) {
    ui.error(`Failed to read manifests: ${error.message}`);
    process.exit(1);
  }

  // Parse manifests to show what will be applied
  const resources = parseManifests(manifestContent);
  ui.newLine();
  ui.print('Resources to apply:');
  for (const resource of resources) {
    ui.print(`  - ${resource.kind}/${resource.name}${resource.namespace ? ` (${resource.namespace})` : ''}`);
  }

  // Dry run mode
  if (options.dryRun) {
    ui.newLine();
    ui.startSpinner({ message: 'Running dry-run...' });

    const result = await k8sClient.apply(manifestContent, {
      namespace: options.namespace,
      dryRun: true,
    });

    if (!result.success) {
      ui.stopSpinnerFail('Dry-run failed');
      ui.error(result.error || 'Unknown error');
      process.exit(1);
    }

    ui.stopSpinnerSuccess('Dry-run successful');
    ui.newLine();
    ui.info('No changes applied (dry-run mode)');

    if (result.output) {
      ui.newLine();
      ui.print(result.output);
    }

    return;
  }

  // Run safety checks if not skipped
  if (!options.skipSafety) {
    const resourceList = resources.map(r => `${r.kind}/${r.name}`);
    const safetyResult = await runK8sSafetyChecks('apply', resourceList, options);

    if (!safetyResult.passed) {
      ui.newLine();
      ui.error('Safety checks failed - operation blocked');
      for (const blocker of safetyResult.blockers) {
        ui.print(`  ${ui.color('✗', 'red')} ${blocker.message}`);
      }
      process.exit(1);
    }

    // If safety requires approval, prompt for it
    if (safetyResult.requiresApproval) {
      const approvalResult = await promptForApproval({
        title: 'Kubernetes Apply',
        operation: 'kubectl apply',
        risks: safetyResult.risks,
        environment: options.environment,
        affectedResources: resourceList,
      });

      if (!approvalResult.approved) {
        ui.newLine();
        ui.info(`Apply cancelled: ${approvalResult.reason || 'User declined'}`);
        return;
      }
    } else {
      // Show safety summary and simple confirm
      displaySafetySummary({
        operation: 'kubectl apply',
        risks: safetyResult.risks,
        passed: safetyResult.passed,
      });

      ui.newLine();
      const proceed = await confirm({
        message: `Apply ${resources.length} resource(s)?`,
        defaultValue: true,
      });

      if (!proceed) {
        ui.info('Apply cancelled');
        return;
      }
    }
  } else {
    // Simple confirmation when safety is skipped
    ui.newLine();
    const proceed = await confirm({
      message: `Apply ${resources.length} resource(s)?`,
      defaultValue: true,
    });

    if (!proceed) {
      ui.info('Apply cancelled');
      return;
    }
  }

  // Apply manifests
  ui.newLine();
  ui.startSpinner({ message: 'Applying manifests...' });

  const result = await k8sClient.apply(manifestContent, {
    namespace: options.namespace,
  });

  if (!result.success) {
    ui.stopSpinnerFail('Apply failed');
    ui.error(result.error || 'Unknown error');
    process.exit(1);
  }

  ui.stopSpinnerSuccess('Apply complete!');

  // Track successful k8s apply
  try {
    const { trackGeneration } = await import('../../telemetry');
    trackGeneration('k8s-apply', ['kubernetes']);
  } catch { /* telemetry failure is non-critical */ }

  // Display results
  ui.newLine();
  if (result.created?.length) {
    ui.print('Created:');
    for (const r of result.created) {
      ui.print(`  ${ui.color('+', 'green')} ${r}`);
    }
  }
  if (result.configured?.length) {
    ui.print('Configured:');
    for (const r of result.configured) {
      ui.print(`  ${ui.color('~', 'yellow')} ${r}`);
    }
  }

  // Wait for resources to be ready
  if (options.wait) {
    ui.newLine();
    await waitForResources(resources, options.namespace);
  }
}

/**
 * Wait for rollout resources to be ready by polling kubectl rollout status
 * via the k8s tools service. Only Deployments, StatefulSets, and DaemonSets
 * are tracked; other resource kinds are skipped.
 */
async function waitForResources(
  resources: Array<{ kind: string; name: string; namespace?: string }>,
  defaultNamespace?: string
): Promise<void> {
  const rolloutKinds = ['Deployment', 'StatefulSet', 'DaemonSet'];
  const rolloutResources = resources.filter(r => rolloutKinds.includes(r.kind));

  if (rolloutResources.length === 0) {
    ui.success('All resources applied (no rollout resources to wait for)');
    return;
  }

  ui.startSpinner({ message: `Waiting for ${rolloutResources.length} resource(s) to be ready...` });

  const timeout = 120_000; // 120 seconds
  const pollInterval = 2_000; // 2 seconds
  const startTime = Date.now();
  let readyCount = 0;
  const readySet = new Set<string>();

  while (readyCount < rolloutResources.length) {
    if (Date.now() - startTime > timeout) {
      const pending = rolloutResources
        .filter(r => !readySet.has(`${r.kind}/${r.name}`))
        .map(r => `${r.kind}/${r.name}`);
      ui.stopSpinnerFail(`Timeout: ${pending.join(', ')} not ready after ${timeout / 1000}s`);
      return;
    }

    for (const resource of rolloutResources) {
      const key = `${resource.kind}/${resource.name}`;
      if (readySet.has(key)) continue;

      try {
        const result = await k8sClient.rollout(
          resource.kind.toLowerCase(),
          resource.name,
          'status',
          { namespace: resource.namespace || defaultNamespace }
        );

        if (result.success && result.output && result.output.includes('successfully rolled out')) {
          readySet.add(key);
          readyCount++;
        }
      } catch {
        // Not ready yet, continue polling
      }
    }

    if (readyCount < rolloutResources.length) {
      ui.updateSpinner(`Waiting: ${readyCount}/${rolloutResources.length} resources ready...`);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  ui.stopSpinnerSuccess(`All ${rolloutResources.length} resource(s) ready`);
}

/**
 * Apply using local kubectl CLI
 */
async function applyWithLocalCLI(options: ApplyK8sOptions): Promise<void> {
  const { spawn } = await import('child_process');

  const manifests = options.manifests || '.';

  // Build kubectl command
  const args = ['apply', '-f', manifests];

  if (options.namespace) {
    args.push('-n', options.namespace);
  }

  if (options.dryRun) {
    args.push('--dry-run=client');
  }

  if (options.wait) {
    args.push('--wait');
  }

  if (options.prune) {
    args.push('--prune');
  }

  if (options.force) {
    args.push('--force');
  }

  if (options.recursive) {
    args.push('-R');
  }

  if (options.selector) {
    args.push('-l', options.selector);
  }

  ui.info(`Running: kubectl ${args.join(' ')}`);
  ui.newLine();

  // Run kubectl
  return new Promise((resolve, reject) => {
    const proc = spawn('kubectl', args, {
      stdio: 'inherit',
    });

    proc.on('error', (error) => {
      ui.error(`Failed to run kubectl: ${error.message}`);
      ui.info('Make sure kubectl is installed and in your PATH');
      process.exit(1);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        ui.newLine();
        ui.success('kubectl apply completed successfully');

        // Track successful k8s apply
        try {
          const { trackGeneration } = require('../../telemetry');
          trackGeneration('k8s-apply', ['kubernetes']);
        } catch { /* telemetry failure is non-critical */ }

        resolve();
      } else {
        ui.newLine();
        ui.error(`kubectl apply failed with exit code ${code}`);
        process.exit(code || 1);
      }
    });
  });
}

/**
 * Run safety checks for the operation
 */
async function runK8sSafetyChecks(
  operation: string,
  resources: string[],
  options: ApplyK8sOptions
): Promise<SafetyCheckResult> {
  const policy = loadSafetyPolicy();

  const context: SafetyContext = {
    operation,
    type: 'kubernetes',
    environment: options.environment,
    resources,
    metadata: {
      manifests: options.manifests,
      namespace: options.namespace,
    },
  };

  return evaluateSafety(context, policy);
}

/**
 * Parse manifests to extract resource information
 */
function parseManifests(content: string): Array<{
  kind: string;
  name: string;
  namespace?: string;
}> {
  const resources: Array<{ kind: string; name: string; namespace?: string }> = [];

  // Split by document separator
  const documents = content.split(/^---$/m);

  for (const doc of documents) {
    const trimmed = doc.trim();
    if (!trimmed) continue;

    // Simple YAML parsing for kind and metadata
    const kindMatch = trimmed.match(/^kind:\s*(.+)$/m);
    const nameMatch = trimmed.match(/^\s+name:\s*(.+)$/m);
    const namespaceMatch = trimmed.match(/^\s+namespace:\s*(.+)$/m);

    if (kindMatch && nameMatch) {
      resources.push({
        kind: kindMatch[1].trim(),
        name: nameMatch[1].trim(),
        namespace: namespaceMatch?.[1]?.trim(),
      });
    }
  }

  return resources;
}

// Export as default
export default applyK8sCommand;
