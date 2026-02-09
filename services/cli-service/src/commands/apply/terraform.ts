/**
 * Apply Terraform Command
 *
 * Apply Terraform configuration to create/update infrastructure
 *
 * Usage: nimbus apply terraform [directory] [options]
 */

import { logger } from '@nimbus/shared-utils';
import { ui, confirm } from '../../wizard';
import { terraformClient } from '../../clients';

/**
 * Command options
 */
export interface ApplyTerraformOptions {
  directory?: string;
  dryRun?: boolean;
  autoApprove?: boolean;
  target?: string;
  var?: Record<string, string>;
  varFile?: string;
  parallelism?: number;
  refresh?: boolean;
  lock?: boolean;
}

/**
 * Run terraform apply command
 */
export async function applyTerraformCommand(options: ApplyTerraformOptions = {}): Promise<void> {
  logger.info('Running terraform apply', { options });

  const directory = options.directory || '.';

  ui.header('Terraform Apply');
  ui.info(`Directory: ${directory}`);
  ui.newLine();

  // Check if terraform client is available
  const clientAvailable = await terraformClient.isAvailable();

  if (clientAvailable) {
    // Use terraform tools service
    await applyWithService(options);
  } else {
    // Fall back to local terraform CLI
    await applyWithLocalCLI(options);
  }
}

/**
 * Apply using Terraform Tools Service
 */
async function applyWithService(options: ApplyTerraformOptions): Promise<void> {
  const directory = options.directory || '.';

  // First, run plan if not auto-approved
  if (!options.autoApprove) {
    ui.startSpinner({ message: 'Creating execution plan...' });

    const planResult = await terraformClient.plan(directory, {
      vars: options.var,
      varFile: options.varFile,
    });

    ui.stopSpinnerSuccess('Plan created');
    ui.newLine();

    if (!planResult.success) {
      ui.error(`Plan failed: ${planResult.error}`);
      process.exit(1);
    }

    // Display plan summary
    displayPlanSummary(planResult);

    // Check if there are changes
    if (!planResult.hasChanges) {
      ui.success('No changes. Infrastructure is up to date.');
      return;
    }

    // Dry run - don't apply
    if (options.dryRun) {
      ui.newLine();
      ui.info('Dry run mode - no changes applied');
      return;
    }

    // Confirm apply
    ui.newLine();
    const proceed = await confirm({
      message: 'Do you want to apply these changes?',
      defaultValue: false,
    });

    if (!proceed) {
      ui.info('Apply cancelled');
      return;
    }
  }

  // Run apply
  ui.newLine();
  ui.startSpinner({ message: 'Applying changes...' });

  const applyResult = await terraformClient.apply(directory, {
    autoApprove: true, // Already confirmed above
    vars: options.var,
    varFile: options.varFile,
  });

  if (!applyResult.success) {
    ui.stopSpinnerFail('Apply failed');
    ui.error(applyResult.error || 'Unknown error');

    if (applyResult.output) {
      ui.newLine();
      ui.print(applyResult.output);
    }

    process.exit(1);
  }

  ui.stopSpinnerSuccess('Apply complete!');

  // Display output
  if (applyResult.output) {
    ui.newLine();
    ui.print(applyResult.output);
  }
}

/**
 * Apply using local Terraform CLI
 */
async function applyWithLocalCLI(options: ApplyTerraformOptions): Promise<void> {
  const { spawn } = await import('child_process');

  const directory = options.directory || '.';

  // Build terraform command
  const args = ['apply'];

  if (options.autoApprove) {
    args.push('-auto-approve');
  }

  if (options.var) {
    for (const [key, value] of Object.entries(options.var)) {
      args.push('-var', `${key}=${value}`);
    }
  }

  if (options.varFile) {
    args.push('-var-file', options.varFile);
  }

  if (options.target) {
    args.push('-target', options.target);
  }

  if (options.parallelism !== undefined) {
    args.push('-parallelism', String(options.parallelism));
  }

  if (options.refresh === false) {
    args.push('-refresh=false');
  }

  if (options.lock === false) {
    args.push('-lock=false');
  }

  ui.info(`Running: terraform ${args.join(' ')}`);
  ui.newLine();

  // Run terraform
  return new Promise((resolve, reject) => {
    const proc = spawn('terraform', args, {
      cwd: directory,
      stdio: 'inherit',
    });

    proc.on('error', (error) => {
      ui.error(`Failed to run terraform: ${error.message}`);
      ui.info('Make sure terraform is installed and in your PATH');
      process.exit(1);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        ui.newLine();
        ui.success('Terraform apply completed successfully');
        resolve();
      } else {
        ui.newLine();
        ui.error(`Terraform apply failed with exit code ${code}`);
        process.exit(code || 1);
      }
    });
  });
}

/**
 * Display plan summary
 */
function displayPlanSummary(planResult: {
  success: boolean;
  hasChanges: boolean;
  output: string;
}): void {
  if (!planResult.hasChanges) {
    ui.print('Plan Summary:');
    ui.newLine();
    ui.print('  No changes');
    return;
  }

  // Parse changes from output
  const addMatch = planResult.output.match(/(\d+) to add/);
  const changeMatch = planResult.output.match(/(\d+) to change/);
  const destroyMatch = planResult.output.match(/(\d+) to destroy/);

  const add = parseInt(addMatch?.[1] || '0', 10);
  const change = parseInt(changeMatch?.[1] || '0', 10);
  const destroy = parseInt(destroyMatch?.[1] || '0', 10);

  ui.print('Plan Summary:');
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

  if (add === 0 && change === 0 && destroy === 0) {
    ui.print('  Changes detected (see output)');
  }
}

// Export as default
export default applyTerraformCommand;
