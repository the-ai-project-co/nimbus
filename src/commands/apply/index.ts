/**
 * Apply Command
 *
 * Apply infrastructure changes for Terraform, Kubernetes, and Helm
 *
 * Usage: nimbus apply <type> [target] [options]
 */

import { logger } from '../../utils';
import { ui } from '../../wizard';
import { applyTerraformCommand } from './terraform';
import { applyK8sCommand } from './k8s';
import { applyHelmCommand } from './helm';

// Re-export subcommand types
export { type ApplyTerraformOptions } from './terraform';
export { type ApplyK8sOptions } from './k8s';
export { type ApplyHelmOptions } from './helm';

/**
 * Common apply options
 */
export interface ApplyOptions {
  dryRun?: boolean;
  autoApprove?: boolean;
  target?: string;
  var?: Record<string, string>;
  varFile?: string;
  namespace?: string;
  wait?: boolean;
  timeout?: string;
}

/**
 * Apply type
 */
export type ApplyType = 'terraform' | 'k8s' | 'helm';

/**
 * Parse common apply options from args
 */
export function parseApplyOptions(args: string[]): ApplyOptions {
  const options: ApplyOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--auto-approve' || arg === '-y' || arg === '--yes') {
      options.autoApprove = true;
    } else if ((arg === '--target' || arg === '-t') && args[i + 1]) {
      options.target = args[++i];
    } else if (arg === '--var' && args[i + 1]) {
      const varArg = args[++i];
      const [key, ...valueParts] = varArg.split('=');
      options.var = options.var || {};
      options.var[key] = valueParts.join('=');
    } else if (arg === '--var-file' && args[i + 1]) {
      options.varFile = args[++i];
    } else if ((arg === '--namespace' || arg === '-n') && args[i + 1]) {
      options.namespace = args[++i];
    } else if (arg === '--wait') {
      options.wait = true;
    } else if (arg === '--timeout' && args[i + 1]) {
      options.timeout = args[++i];
    }
  }

  return options;
}

/**
 * Detect infrastructure type from current directory
 */
async function detectInfraType(): Promise<ApplyType | null> {
  const fs = await import('fs/promises');

  // Check for Terraform files
  try {
    const files = await fs.readdir('.');
    if (files.some(f => f.endsWith('.tf'))) {
      return 'terraform';
    }
  } catch {
    // Ignore
  }

  // Check for Kubernetes manifests
  try {
    const files = await fs.readdir('.');
    const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    for (const file of yamlFiles) {
      const content = await fs.readFile(file, 'utf-8');
      if (content.includes('apiVersion:') && content.includes('kind:')) {
        return 'k8s';
      }
    }
  } catch {
    // Ignore
  }

  // Check for Helm chart
  try {
    await fs.access('./Chart.yaml');
    return 'helm';
  } catch {
    // Ignore
  }

  // Check for values files (Helm)
  try {
    const files = await fs.readdir('.');
    if (files.some(f => f.startsWith('values') && (f.endsWith('.yaml') || f.endsWith('.yml')))) {
      return 'helm';
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Run the apply command
 */
export async function applyCommand(type: string | undefined, args: string[]): Promise<void> {
  logger.info('Running apply command', { type, args });

  // Parse common options
  const options = parseApplyOptions(args);

  // Get positional arguments (after type)
  const positionalArgs = args.filter(arg => !arg.startsWith('-') && !arg.includes('='));

  // Auto-detect type if not provided
  if (!type || type.startsWith('-')) {
    ui.startSpinner({ message: 'Detecting infrastructure type...' });
    const detectedType = await detectInfraType();
    ui.stopSpinnerSuccess('');

    if (!detectedType) {
      ui.error('Could not detect infrastructure type');
      ui.newLine();
      ui.info('Usage: nimbus apply <type> [target] [options]');
      ui.info('');
      ui.info('Types:');
      ui.info('  terraform    Apply Terraform configuration');
      ui.info('  k8s          Apply Kubernetes manifests');
      ui.info('  helm         Install/upgrade Helm release');
      process.exit(1);
    }

    type = detectedType;
    ui.info(`Detected infrastructure type: ${type}`);
    ui.newLine();
  }

  switch (type) {
    case 'terraform':
    case 'tf':
      await applyTerraformCommand({
        directory: positionalArgs[0] || options.target || '.',
        dryRun: options.dryRun,
        autoApprove: options.autoApprove,
        var: options.var,
        varFile: options.varFile,
        target: options.target,
      });
      break;

    case 'k8s':
    case 'kubernetes':
      await applyK8sCommand({
        manifests: positionalArgs[0] || options.target || '.',
        namespace: options.namespace,
        dryRun: options.dryRun,
        wait: options.wait,
      });
      break;

    case 'helm': {
      // For Helm, we need release name and chart
      const releaseName = positionalArgs[0];
      const chartPath = positionalArgs[1] || '.';

      await applyHelmCommand({
        releaseName,
        chart: chartPath,
        namespace: options.namespace,
        dryRun: options.dryRun,
        wait: options.wait,
        timeout: options.timeout,
        values: options.varFile,
      });
      break;
    }

    default:
      ui.error(`Unknown apply type: ${type}`);
      ui.newLine();
      ui.info('Supported types: terraform, k8s, helm');
      process.exit(1);
  }
}

// Export subcommands
export { applyTerraformCommand } from './terraform';
export { applyK8sCommand } from './k8s';
export { applyHelmCommand } from './helm';

// Export as default
export default applyCommand;
