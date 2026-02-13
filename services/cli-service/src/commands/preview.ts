/**
 * Preview Command
 *
 * Preview infrastructure changes without applying them
 *
 * Usage:
 *   nimbus preview terraform [directory]
 *   nimbus preview k8s [directory]
 *   nimbus preview helm [chart]
 */

import { logger } from '@nimbus/shared-utils';
import { ui } from '../wizard/ui';
import { terraformClient, k8sClient, helmClient } from '../clients';
import {
  loadSafetyPolicy,
  evaluateSafety,
  type SafetyContext,
} from '../config/safety-policy';
import { displaySafetySummary } from '../wizard/approval';

export interface PreviewOptions {
  /** Type of infrastructure to preview */
  type: 'terraform' | 'k8s' | 'helm';
  /** Directory or chart path */
  directory?: string;
  /** Output format */
  format?: 'table' | 'json' | 'diff';
  /** Show detailed output */
  verbose?: boolean;
  /** Skip safety checks */
  skipSafety?: boolean;
  /** Target specific resources (terraform) */
  target?: string;
  /** Namespace (k8s) */
  namespace?: string;
  /** Release name (helm) */
  release?: string;
  /** Values file (helm) */
  valuesFile?: string;
}

/**
 * Preview command handler
 */
export async function previewCommand(options: PreviewOptions): Promise<void> {
  logger.info('Running preview', { type: options.type });

  ui.newLine();
  ui.header(`Preview ${capitalize(options.type)} Changes`);

  switch (options.type) {
    case 'terraform':
      await previewTerraform(options);
      break;
    case 'k8s':
      await previewKubernetes(options);
      break;
    case 'helm':
      await previewHelm(options);
      break;
    default:
      ui.error(`Unknown preview type: ${options.type}`);
  }
}

/**
 * Preview Terraform changes
 */
async function previewTerraform(options: PreviewOptions): Promise<void> {
  const directory = options.directory || '.';

  ui.info(`Directory: ${directory}`);
  ui.newLine();

  // Check if terraform client is available
  const clientAvailable = await terraformClient.isAvailable();

  if (clientAvailable) {
    await previewTerraformWithService(options);
  } else {
    await previewTerraformWithCLI(options);
  }
}

/**
 * Preview Terraform using service
 */
async function previewTerraformWithService(options: PreviewOptions): Promise<void> {
  const directory = options.directory || '.';

  ui.startSpinner({ message: 'Creating execution plan...' });

  try {
    const result = await terraformClient.plan(directory, {});

    ui.stopSpinnerSuccess('Plan created');
    ui.newLine();

    if (!result.success) {
      ui.error(`Plan failed: ${result.error}`);
      return;
    }

    // Display plan
    displayTerraformPlan(result, options);

    // Run safety checks if not skipped
    if (!options.skipSafety) {
      await runSafetyChecks('plan', 'terraform', result.output, options);
    }
  } catch (error) {
    ui.stopSpinnerFail('Plan failed');
    ui.error((error as Error).message);
  }
}

/**
 * Preview Terraform using local CLI
 */
async function previewTerraformWithCLI(options: PreviewOptions): Promise<void> {
  const { spawn } = await import('child_process');
  const directory = options.directory || '.';

  const args = ['plan', '-no-color'];

  if (options.target) {
    args.push('-target', options.target);
  }

  ui.info(`Running: terraform ${args.join(' ')}`);
  ui.newLine();

  return new Promise((resolve) => {
    let output = '';

    const proc = spawn('terraform', args, {
      cwd: directory,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    proc.stdout?.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    proc.stderr?.on('data', (data) => {
      process.stderr.write(data);
    });

    proc.on('error', (error) => {
      ui.error(`Failed to run terraform: ${error.message}`);
      ui.info('Make sure terraform is installed and in your PATH');
      resolve();
    });

    proc.on('close', async (code) => {
      if (code === 0) {
        ui.newLine();
        ui.success('Plan preview complete');

        // Run safety checks if not skipped
        if (!options.skipSafety) {
          await runSafetyChecks('plan', 'terraform', output, options);
        }
      } else {
        ui.newLine();
        ui.error(`Terraform plan failed with exit code ${code}`);
      }
      resolve();
    });
  });
}

/**
 * Display Terraform plan results
 */
function displayTerraformPlan(
  result: { success: boolean; hasChanges: boolean; output: string },
  options: PreviewOptions
): void {
  if (!result.hasChanges) {
    ui.success('No changes. Infrastructure is up to date.');
    return;
  }

  if (options.format === 'json') {
    console.log(JSON.stringify({ hasChanges: result.hasChanges, output: result.output }, null, 2));
    return;
  }

  // Parse changes from output
  const addMatch = result.output.match(/(\d+) to add/);
  const changeMatch = result.output.match(/(\d+) to change/);
  const destroyMatch = result.output.match(/(\d+) to destroy/);

  const add = parseInt(addMatch?.[1] || '0', 10);
  const change = parseInt(changeMatch?.[1] || '0', 10);
  const destroy = parseInt(destroyMatch?.[1] || '0', 10);

  // Display summary table
  ui.print(ui.bold('Plan Summary:'));
  ui.newLine();

  if (add > 0) {
    ui.print(`  ${ui.color(`+ ${add} to add`, 'green')}`);
  }
  if (change > 0) {
    ui.print(`  ${ui.color(`~ ${change} to change`, 'yellow')}`);
  }
  if (destroy > 0) {
    ui.print(`  ${ui.color(`- ${destroy} to destroy`, 'red')}`);
  }

  // Show detailed output if verbose
  if (options.verbose) {
    ui.newLine();
    ui.print(ui.bold('Detailed Changes:'));
    ui.newLine();
    ui.print(result.output);
  }
}

/**
 * Preview Kubernetes changes
 */
async function previewKubernetes(options: PreviewOptions): Promise<void> {
  const directory = options.directory || '.';
  const namespace = options.namespace || 'default';

  ui.info(`Directory: ${directory}`);
  ui.info(`Namespace: ${namespace}`);
  ui.newLine();

  // Check if k8s client is available
  const clientAvailable = await k8sClient.isAvailable();

  // K8s client doesn't have a diff method, always use CLI
  // If client is available, we could use dry-run apply in the future
  if (clientAvailable) {
    ui.info('Using kubectl diff for preview...');
  }

  // Use kubectl diff CLI
  await previewKubernetesWithCLI(options);
}

/**
 * Preview Kubernetes using kubectl
 */
async function previewKubernetesWithCLI(options: PreviewOptions): Promise<void> {
  const { spawn } = await import('child_process');
  const directory = options.directory || '.';
  const namespace = options.namespace || 'default';

  const args = ['diff', '-f', directory, '-n', namespace];

  ui.info(`Running: kubectl ${args.join(' ')}`);
  ui.newLine();

  return new Promise((resolve) => {
    const proc = spawn('kubectl', args, {
      stdio: 'inherit',
    });

    proc.on('error', (error) => {
      ui.error(`Failed to run kubectl: ${error.message}`);
      ui.info('Make sure kubectl is installed and configured');
      resolve();
    });

    proc.on('close', (code) => {
      ui.newLine();
      if (code === 0) {
        ui.success('No changes detected');
      } else if (code === 1) {
        ui.info('Changes detected (see diff above)');
      } else {
        ui.error(`kubectl diff failed with exit code ${code}`);
      }
      resolve();
    });
  });
}

/**
 * Display Kubernetes diff
 */
function displayK8sDiff(
  result: { success: boolean; hasDiff: boolean; output?: string },
  options: PreviewOptions
): void {
  if (options.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  ui.print(ui.bold('Kubernetes Diff:'));
  ui.newLine();

  if (result.output) {
    // Color the diff output
    const lines = result.output.split('\n');
    for (const line of lines) {
      if (line.startsWith('+')) {
        ui.print(ui.color(line, 'green'));
      } else if (line.startsWith('-')) {
        ui.print(ui.color(line, 'red'));
      } else if (line.startsWith('@')) {
        ui.print(ui.color(line, 'cyan'));
      } else {
        ui.print(line);
      }
    }
  }
}

/**
 * Preview Helm changes
 */
async function previewHelm(options: PreviewOptions): Promise<void> {
  const chart = options.directory || '.';
  const release = options.release || 'preview';
  const namespace = options.namespace || 'default';

  ui.info(`Chart: ${chart}`);
  ui.info(`Release: ${release}`);
  ui.info(`Namespace: ${namespace}`);
  ui.newLine();

  // Check if helm client is available
  const clientAvailable = await helmClient.isAvailable();

  // Helm client doesn't have a diff method, always use CLI
  // If client is available, we could use template comparison in the future
  if (clientAvailable) {
    ui.info('Using helm template for preview...');
  }

  // Use helm template CLI
  await previewHelmWithCLI(options);
}

/**
 * Preview Helm using helm CLI
 */
async function previewHelmWithCLI(options: PreviewOptions): Promise<void> {
  const { spawn } = await import('child_process');
  const chart = options.directory || '.';
  const release = options.release || 'preview';
  const namespace = options.namespace || 'default';

  // Use helm template to preview what would be generated
  const args = ['template', release, chart, '-n', namespace];

  if (options.valuesFile) {
    args.push('-f', options.valuesFile);
  }

  ui.info(`Running: helm ${args.join(' ')}`);
  ui.newLine();

  return new Promise((resolve) => {
    const proc = spawn('helm', args, {
      stdio: 'inherit',
    });

    proc.on('error', (error) => {
      ui.error(`Failed to run helm: ${error.message}`);
      ui.info('Make sure helm is installed and in your PATH');
      resolve();
    });

    proc.on('close', (code) => {
      ui.newLine();
      if (code === 0) {
        ui.success('Template preview complete');
      } else {
        ui.error(`helm template failed with exit code ${code}`);
      }
      resolve();
    });
  });
}

/**
 * Display Helm diff
 */
function displayHelmDiff(
  result: { success: boolean; hasDiff?: boolean; output?: string },
  options: PreviewOptions
): void {
  if (options.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (!result.hasDiff) {
    ui.success('No changes. Helm release is up to date.');
    return;
  }

  ui.print(ui.bold('Helm Diff:'));
  ui.newLine();

  if (result.output) {
    ui.print(result.output);
  }
}

/**
 * Run safety checks on the preview
 */
async function runSafetyChecks(
  operation: string,
  type: 'terraform' | 'kubernetes' | 'helm',
  output: string,
  options: PreviewOptions
): Promise<void> {
  const policy = loadSafetyPolicy();

  const context: SafetyContext = {
    operation,
    type,
    planOutput: output,
    metadata: {
      directory: options.directory,
      namespace: options.namespace,
    },
  };

  const result = evaluateSafety(context, policy);

  ui.newLine();
  displaySafetySummary({
    operation: `${type} ${operation}`,
    risks: result.risks,
    passed: result.passed,
  });

  if (result.requiresApproval) {
    ui.newLine();
    ui.warning('This operation will require approval when applied');
  }
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Export as default
export default previewCommand;
