/**
 * Plan Command
 *
 * Preview infrastructure changes for Terraform, Kubernetes, and Helm
 *
 * Usage: nimbus plan [options]
 */

import { logger } from '../../utils';
import { ui } from '../../wizard';
import { terraformClient, k8sClient } from '../../clients';
import { displayPlan, type PlanResult } from './display';

// Re-export display utilities
export { displayPlan, type PlanResult } from './display';

/**
 * Plan type
 */
export type PlanType = 'terraform' | 'k8s' | 'helm' | 'auto';

/**
 * Command options
 */
export interface PlanOptions {
  type?: PlanType;
  target?: string;
  out?: string;
  detailed?: boolean;
  json?: boolean;
  namespace?: string;
  var?: Record<string, string>;
  varFile?: string;
}

/**
 * Parse plan options from args
 */
export function parsePlanOptions(args: string[]): PlanOptions {
  const options: PlanOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--type' && args[i + 1]) {
      options.type = args[++i] as PlanType;
    } else if ((arg === '--target' || arg === '-t') && args[i + 1]) {
      options.target = args[++i];
    } else if (arg === '--out' && args[i + 1]) {
      options.out = args[++i];
    } else if (arg === '--detailed' || arg === '-d') {
      options.detailed = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if ((arg === '--namespace' || arg === '-n') && args[i + 1]) {
      options.namespace = args[++i];
    } else if (arg === '--var' && args[i + 1]) {
      const varArg = args[++i];
      const [key, ...valueParts] = varArg.split('=');
      options.var = options.var || {};
      options.var[key] = valueParts.join('=');
    } else if (arg === '--var-file' && args[i + 1]) {
      options.varFile = args[++i];
    } else if (!arg.startsWith('-') && !options.target) {
      options.target = arg;
    }
  }

  return options;
}

/**
 * Detect infrastructure type from current directory
 */
async function detectInfraType(targetPath?: string): Promise<PlanType | null> {
  const fs = await import('fs/promises');
  const path = await import('path');

  const basePath = targetPath || '.';

  // Check for Terraform files
  try {
    const files = await fs.readdir(basePath);
    if (files.some(f => f.endsWith('.tf'))) {
      return 'terraform';
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  // Check for Kubernetes manifests
  try {
    const files = await fs.readdir(basePath);
    const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    for (const file of yamlFiles.slice(0, 5)) { // Check first 5 files
      try {
        const content = await fs.readFile(path.join(basePath, file), 'utf-8');
        if (content.includes('apiVersion:') && content.includes('kind:')) {
          return 'k8s';
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Ignore
  }

  // Check for Helm chart
  try {
    await fs.access(path.join(basePath, 'Chart.yaml'));
    return 'helm';
  } catch {
    // No Chart.yaml
  }

  // Check if target is a specific file
  if (targetPath) {
    if (targetPath.endsWith('.tf')) return 'terraform';
    if (targetPath.endsWith('.yaml') || targetPath.endsWith('.yml')) return 'k8s';
  }

  return null;
}

/**
 * Run Terraform plan
 */
async function runTerraformPlan(options: PlanOptions): Promise<PlanResult> {
  const directory = options.target || '.';

  // Check if terraform client is available
  const clientAvailable = await terraformClient.isAvailable();

  if (clientAvailable) {
    const result = await terraformClient.plan(directory, {
      vars: options.var,
      varFile: options.varFile,
      out: options.out,
    });

    // Parse changes from output
    const addMatch = result.output.match(/(\d+) to add/);
    const changeMatch = result.output.match(/(\d+) to change/);
    const destroyMatch = result.output.match(/(\d+) to destroy/);

    return {
      type: 'terraform',
      success: result.success,
      error: result.error,
      changes: result.hasChanges ? {
        add: parseInt(addMatch?.[1] || '0', 10),
        change: parseInt(changeMatch?.[1] || '0', 10),
        destroy: parseInt(destroyMatch?.[1] || '0', 10),
      } : { add: 0, change: 0, destroy: 0 },
      raw: options.detailed ? result.output : undefined,
    };
  } else {
    // Fall back to local terraform CLI
    return runLocalTerraformPlan(options);
  }
}

/**
 * Run local Terraform plan
 */
async function runLocalTerraformPlan(options: PlanOptions): Promise<PlanResult> {
  const { execFileSync } = await import('child_process');
  const directory = options.target || '.';

  // Build command args (using execFileSync to prevent shell injection)
  const args = ['plan', '-no-color'];

  if (options.var) {
    for (const [key, value] of Object.entries(options.var)) {
      args.push('-var', `${key}=${value}`);
    }
  }

  if (options.varFile) {
    args.push('-var-file', options.varFile);
  }

  if (options.out) {
    args.push('-out', options.out);
  }

  try {
    const output = execFileSync('terraform', args, {
      cwd: directory,
      encoding: 'utf-8',
      timeout: 300000, // 5 minutes
    });

    // Parse output for changes
    const addMatch = output.match(/(\d+) to add/);
    const changeMatch = output.match(/(\d+) to change/);
    const destroyMatch = output.match(/(\d+) to destroy/);

    const changes = {
      add: parseInt(addMatch?.[1] || '0', 10),
      change: parseInt(changeMatch?.[1] || '0', 10),
      destroy: parseInt(destroyMatch?.[1] || '0', 10),
    };

    // Parse resource changes
    const resources: PlanResult['resources'] = [];
    const resourceMatches = output.matchAll(/# ([\w.-]+\.[\w.-]+) will be (created|updated|destroyed|read)/g);
    for (const match of resourceMatches) {
      const actionMap: Record<string, string> = {
        created: 'create',
        updated: 'update',
        destroyed: 'delete',
        read: 'read',
      };
      resources.push({
        action: actionMap[match[2]] || match[2],
        resource: match[1],
        address: match[1],
      });
    }

    return {
      type: 'terraform',
      success: true,
      changes,
      resources,
      raw: options.detailed ? output : undefined,
    };
  } catch (error: any) {
    return {
      type: 'terraform',
      success: false,
      error: error.message || 'Terraform plan failed',
      raw: error.stdout || error.stderr,
    };
  }
}

/**
 * Run Kubernetes dry-run plan
 */
async function runK8sPlan(options: PlanOptions): Promise<PlanResult> {
  const manifests = options.target || '.';
  const fs = await import('fs/promises');
  const path = await import('path');

  // Read manifest files
  let manifestContent: string;
  const resources: PlanResult['resources'] = [];

  try {
    const stat = await fs.stat(manifests);

    if (stat.isDirectory()) {
      const files = await fs.readdir(manifests);
      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

      if (yamlFiles.length === 0) {
        return {
          type: 'k8s',
          success: false,
          error: 'No YAML manifests found in directory',
        };
      }

      const contents = await Promise.all(
        yamlFiles.map(f => fs.readFile(path.join(manifests, f), 'utf-8'))
      );
      manifestContent = contents.join('\n---\n');
    } else {
      manifestContent = await fs.readFile(manifests, 'utf-8');
    }
  } catch (error: any) {
    return {
      type: 'k8s',
      success: false,
      error: `Failed to read manifests: ${error.message}`,
    };
  }

  // Parse manifests to list resources
  const documents = manifestContent.split(/^---$/m);
  for (const doc of documents) {
    const trimmed = doc.trim();
    if (!trimmed) continue;

    const kindMatch = trimmed.match(/^kind:\s*(.+)$/m);
    const nameMatch = trimmed.match(/^\s+name:\s*(.+)$/m);
    const namespaceMatch = trimmed.match(/^\s+namespace:\s*(.+)$/m);

    if (kindMatch && nameMatch) {
      resources.push({
        action: 'apply', // K8s apply is idempotent
        resource: `${kindMatch[1].trim()}/${nameMatch[1].trim()}`,
        address: namespaceMatch
          ? `${namespaceMatch[1].trim()}/${kindMatch[1].trim()}/${nameMatch[1].trim()}`
          : `default/${kindMatch[1].trim()}/${nameMatch[1].trim()}`,
      });
    }
  }

  // Check if k8s client is available for dry-run
  const clientAvailable = await k8sClient.isAvailable();

  if (clientAvailable) {
    const result = await k8sClient.apply(manifestContent, {
      namespace: options.namespace,
      dryRun: true,
    });

    return {
      type: 'k8s',
      success: result.success,
      error: result.error,
      changes: {
        add: result.created?.length || 0,
        change: result.configured?.length || 0,
        destroy: 0,
      },
      resources,
      raw: options.detailed ? result.output : undefined,
    };
  }

  // Return parsed resources without dry-run validation
  return {
    type: 'k8s',
    success: true,
    changes: {
      add: resources.length,
      change: 0,
      destroy: 0,
    },
    resources,
    raw: options.detailed ? manifestContent : undefined,
  };
}

/**
 * Run Helm diff plan
 */
async function runHelmPlan(options: PlanOptions): Promise<PlanResult> {
  const target = options.target || '.';
  const { execFileSync } = await import('child_process');

  // Check if helm-diff plugin is available
  try {
    const pluginOutput = execFileSync('helm', ['plugin', 'list'], { encoding: 'utf-8', stdio: 'pipe' });
    if (!pluginOutput.includes('diff')) {
      // helm-diff not installed, use template comparison
      return runHelmTemplatePlan(options);
    }
  } catch {
    // helm-diff not installed, use template comparison
    return runHelmTemplatePlan(options);
  }

  // Use helm diff for existing releases
  // First, need to determine release name
  let releaseName = target;
  let chartPath = '.';

  // If target is a path, try to extract release name from values
  if (target.includes('/') || target === '.') {
    chartPath = target;
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      // Look for release name in values file
      const valuesFiles = ['values.yaml', 'values.yml'];
      for (const vf of valuesFiles) {
        try {
          const content = await fs.readFile(path.join(chartPath, vf), 'utf-8');
          const nameMatch = content.match(/release[Nn]ame:\s*(.+)/);
          if (nameMatch) {
            releaseName = nameMatch[1].trim();
            break;
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Use directory name as release name
      releaseName = path.basename(path.resolve(chartPath));
    }
  }

  try {
    // Use execFileSync with args array to prevent shell injection
    const diffArgs = ['diff', 'upgrade', releaseName, chartPath];
    if (options.namespace) {
      diffArgs.push('-n', options.namespace);
    }
    const output = execFileSync('helm', diffArgs, {
      encoding: 'utf-8',
      timeout: 60000,
    });

    // Parse diff output
    const addMatch = output.match(/^\+[^+]/gm);
    const removeMatch = output.match(/^-[^-]/gm);

    return {
      type: 'helm',
      success: true,
      changes: {
        add: addMatch?.length || 0,
        change: 0,
        destroy: removeMatch?.length || 0,
      },
      raw: options.detailed ? output : undefined,
    };
  } catch {
    // Release might not exist
    return runHelmTemplatePlan(options);
  }
}

/**
 * Run Helm template plan (for new releases)
 */
async function runHelmTemplatePlan(options: PlanOptions): Promise<PlanResult> {
  const chartPath = options.target || '.';
  const { execFileSync } = await import('child_process');

  try {
    // Use execFileSync with args array to prevent shell injection
    const templateArgs = ['template', chartPath];
    if (options.namespace) {
      templateArgs.push('-n', options.namespace);
    }
    const output = execFileSync('helm', templateArgs, {
      encoding: 'utf-8',
      timeout: 60000,
    });

    // Parse rendered manifests
    const resources: PlanResult['resources'] = [];
    const documents = output.split(/^---$/m);

    for (const doc of documents) {
      const trimmed = doc.trim();
      if (!trimmed) continue;

      const kindMatch = trimmed.match(/^kind:\s*(.+)$/m);
      const nameMatch = trimmed.match(/^\s+name:\s*(.+)$/m);

      if (kindMatch && nameMatch) {
        resources.push({
          action: 'create',
          resource: `${kindMatch[1].trim()}/${nameMatch[1].trim()}`,
          address: `${kindMatch[1].trim()}/${nameMatch[1].trim()}`,
        });
      }
    }

    return {
      type: 'helm',
      success: true,
      changes: {
        add: resources.length,
        change: 0,
        destroy: 0,
      },
      resources,
      raw: options.detailed ? output : undefined,
    };
  } catch (error: any) {
    return {
      type: 'helm',
      success: false,
      error: error.message || 'Helm template failed',
      raw: error.stdout || error.stderr,
    };
  }
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Run the plan command
 */
export async function planCommand(options: PlanOptions = {}): Promise<void> {
  // Redact sensitive variables from logs
  const { var: _vars, ...safeOptions } = options;
  logger.info('Running plan command', {
    ...safeOptions,
    var: options.var ? '[REDACTED]' : undefined
  });

  // Detect or use specified type
  let type = options.type;

  if (!type || type === 'auto') {
    ui.startSpinner({ message: 'Detecting infrastructure type...' });
    const detectedType = await detectInfraType(options.target);
    ui.stopSpinnerSuccess('');

    if (!detectedType) {
      ui.error('Could not detect infrastructure type');
      ui.newLine();
      ui.info('Usage: nimbus plan [options]');
      ui.info('');
      ui.info('Options:');
      ui.info('  --type <type>     Infrastructure type: terraform, k8s, helm');
      ui.info('  --target <path>   Target directory or file');
      ui.info('  --detailed        Show detailed plan output');
      ui.info('');
      ui.info('Examples:');
      ui.info('  nimbus plan');
      ui.info('  nimbus plan --type terraform');
      ui.info('  nimbus plan --target ./manifests --type k8s');
      process.exit(1);
    }

    type = detectedType;
    ui.info(`Detected infrastructure type: ${type}`);
    ui.newLine();
  }

  ui.header(`${capitalizeFirst(type)} Plan`);
  ui.info(`Target: ${options.target || '.'}`);
  ui.newLine();

  ui.startSpinner({ message: 'Creating execution plan...' });

  let plan: PlanResult;

  switch (type) {
    case 'terraform':
      plan = await runTerraformPlan(options);
      break;
    case 'k8s':
      plan = await runK8sPlan(options);
      break;
    case 'helm':
      plan = await runHelmPlan(options);
      break;
    default:
      ui.stopSpinnerFail(`Unknown type: ${type}`);
      process.exit(1);
  }

  if (!plan.success) {
    ui.stopSpinnerFail('Plan failed');
    ui.error(plan.error || 'Unknown error');

    if (plan.raw) {
      ui.newLine();
      ui.print(plan.raw);
    }

    process.exit(1);
  }

  ui.stopSpinnerSuccess('Plan created');
  ui.newLine();

  // Display the plan
  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    displayPlan(plan, options.detailed);
  }

  // Save plan output if requested (Terraform only)
  if (options.out && type === 'terraform') {
    ui.newLine();
    ui.info(`Plan saved to: ${options.out}`);
    ui.info('Apply with: nimbus apply terraform');
  }
}

// Export as default
export default planCommand;
