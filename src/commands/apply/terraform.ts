/**
 * Apply Terraform Command
 *
 * Apply Terraform configuration to create/update infrastructure
 *
 * Usage: nimbus apply terraform [directory] [options]
 */

import { logger } from '../../utils';
import { ui, confirm } from '../../wizard';
import { terraformClient } from '../../clients';
import { CostEstimator } from '../cost/estimator';
import {
  loadSafetyPolicy,
  evaluateSafety,
  type SafetyContext,
  type SafetyCheckResult,
} from '../../config/safety-policy';
import {
  promptForApproval,
  displaySafetySummary,
  confirmWithResourceName,
} from '../../wizard/approval';

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
  /** Skip safety checks */
  skipSafety?: boolean;
  /** Environment name (for safety policy) */
  environment?: string;
}

/**
 * Display inline cost estimate for a terraform directory
 */
async function displayCostEstimate(directory: string): Promise<void> {
  try {
    const estimate = await CostEstimator.estimateDirectory(directory);
    if (estimate.totalMonthlyCost > 0) {
      ui.newLine();
      ui.print(
        `  ${ui.color('$', 'yellow')} Estimated monthly cost: ${ui.bold(`$${estimate.totalMonthlyCost.toFixed(2)}/mo`)}`
      );
      const projects = estimate.projects || [];
      const costResources = projects.length > 0 ? projects[0].resources || [] : [];
      if (costResources.length > 0) {
        for (const resource of costResources.slice(0, 5)) {
          ui.print(`    ${resource.name}: $${resource.monthlyCost.toFixed(2)}/mo`);
        }
        if (costResources.length > 5) {
          ui.print(ui.dim(`    ... and ${costResources.length - 5} more resources`));
        }
      }
    }
  } catch {
    // Silently skip if cost estimation fails — don't block the apply
    ui.print(ui.dim('  Cost estimation available: run "nimbus cost estimate"'));
  }
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

    // Show inline cost estimate if resources are being created
    if (planResult.hasChanges) {
      await displayCostEstimate(directory);
    }

    // Dry run - don't apply
    if (options.dryRun) {
      ui.newLine();
      ui.info('Dry run mode - no changes applied');
      return;
    }

    // Parse destroy count to determine confirmation type
    const destroyCountMatch = planResult.output.match(/(\d+) to destroy/);
    const destroyCount = parseInt(destroyCountMatch?.[1] || '0', 10);

    // Run safety checks if not skipped
    if (!options.skipSafety) {
      const safetyResult = await runSafetyChecks('apply', planResult.output, options);

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
        // Destructive plans require type-name confirmation first
        if (destroyCount > 0) {
          const confirmed = await confirmWithResourceName(directory, 'terraform directory');
          if (!confirmed) {
            ui.newLine();
            ui.info('Apply cancelled');
            return;
          }
        }

        const approvalResult = await promptForApproval({
          title: 'Terraform Apply',
          operation: 'terraform apply',
          risks: safetyResult.risks,
          environment: options.environment,
          affectedResources: safetyResult.affectedResources,
          estimatedCost: safetyResult.estimatedCost,
        });

        if (!approvalResult.approved) {
          ui.newLine();
          ui.info(`Apply cancelled: ${approvalResult.reason || 'User declined'}`);
          return;
        }
      } else {
        // Show safety summary and simple confirm (or type-name confirm for destroys)
        displaySafetySummary({
          operation: 'terraform apply',
          risks: safetyResult.risks,
          passed: safetyResult.passed,
        });

        ui.newLine();

        if (destroyCount > 0) {
          const confirmed = await confirmWithResourceName(directory, 'terraform directory');
          if (!confirmed) {
            ui.newLine();
            ui.info('Apply cancelled');
            return;
          }
        } else {
          const proceed = await confirm({
            message: 'Do you want to apply these changes?',
            defaultValue: false,
          });

          if (!proceed) {
            ui.info('Apply cancelled');
            return;
          }
        }
      }
    } else {
      // Simple confirmation when safety is skipped, but still enforce type-name for destroys
      ui.newLine();

      if (destroyCount > 0) {
        const confirmed = await confirmWithResourceName(directory, 'terraform directory');
        if (!confirmed) {
          ui.newLine();
          ui.info('Apply cancelled');
          return;
        }
      } else {
        const proceed = await confirm({
          message: 'Do you want to apply these changes?',
          defaultValue: false,
        });

        if (!proceed) {
          ui.info('Apply cancelled');
          return;
        }
      }
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

  // Track successful terraform apply
  try {
    const { trackGeneration } = await import('../../telemetry');
    trackGeneration('terraform-apply', ['terraform']);
  } catch {
    /* telemetry failure is non-critical */
  }

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

  // First, run plan to get the output for safety checks (unless auto-approved)
  if (!options.autoApprove && !options.skipSafety) {
    ui.startSpinner({ message: 'Creating execution plan...' });

    const planOutput = await runLocalTerraformPlan(directory, options);

    ui.stopSpinnerSuccess('Plan created');
    ui.newLine();

    // Display plan summary
    const hasChanges =
      planOutput.includes('to add') ||
      planOutput.includes('to change') ||
      planOutput.includes('to destroy');

    displayPlanSummary({
      success: true,
      hasChanges,
      output: planOutput,
    });

    if (!hasChanges) {
      ui.success('No changes. Infrastructure is up to date.');
      return;
    }

    // Dry run - don't apply
    if (options.dryRun) {
      ui.newLine();
      ui.info('Dry run mode - no changes applied');
      return;
    }

    // Parse destroy count to determine confirmation type
    const destroyCountMatch = planOutput.match(/(\d+) to destroy/);
    const destroyCount = parseInt(destroyCountMatch?.[1] || '0', 10);

    // Run safety checks
    const safetyResult = await runSafetyChecks('apply', planOutput, options);

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
      // Destructive plans require type-name confirmation first
      if (destroyCount > 0) {
        const confirmed = await confirmWithResourceName(directory, 'terraform directory');
        if (!confirmed) {
          ui.newLine();
          ui.info('Apply cancelled');
          return;
        }
      }

      const approvalResult = await promptForApproval({
        title: 'Terraform Apply',
        operation: 'terraform apply',
        risks: safetyResult.risks,
        environment: options.environment,
        affectedResources: safetyResult.affectedResources,
        estimatedCost: safetyResult.estimatedCost,
      });

      if (!approvalResult.approved) {
        ui.newLine();
        ui.info(`Apply cancelled: ${approvalResult.reason || 'User declined'}`);
        return;
      }
    } else {
      // Show safety summary and simple confirm (or type-name confirm for destroys)
      displaySafetySummary({
        operation: 'terraform apply',
        risks: safetyResult.risks,
        passed: safetyResult.passed,
      });

      ui.newLine();

      if (destroyCount > 0) {
        const confirmed = await confirmWithResourceName(directory, 'terraform directory');
        if (!confirmed) {
          ui.newLine();
          ui.info('Apply cancelled');
          return;
        }
      } else {
        const proceed = await confirm({
          message: 'Do you want to apply these changes?',
          defaultValue: false,
        });

        if (!proceed) {
          ui.info('Apply cancelled');
          return;
        }
      }
    }
  }

  // Build terraform apply command
  const args = ['apply', '-auto-approve']; // Auto-approve since we already confirmed

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

  ui.newLine();
  ui.info(`Running: terraform ${args.join(' ')}`);
  ui.newLine();

  // Run terraform
  return new Promise(resolve => {
    const proc = spawn('terraform', args, {
      cwd: directory,
      stdio: 'inherit',
    });

    proc.on('error', error => {
      ui.error(`Failed to run terraform: ${error.message}`);
      ui.info('Make sure terraform is installed and in your PATH');
      process.exit(1);
    });

    proc.on('close', code => {
      if (code === 0) {
        ui.newLine();
        ui.success('Terraform apply completed successfully');

        // Track successful terraform apply
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { trackGeneration } = require('../../telemetry');
          trackGeneration('terraform-apply', ['terraform']);
        } catch {
          /* telemetry failure is non-critical */
        }

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
 * Run local terraform plan and capture output
 */
async function runLocalTerraformPlan(
  directory: string,
  options: ApplyTerraformOptions
): Promise<string> {
  const { spawn } = await import('child_process');

  const args = ['plan', '-no-color'];

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

  return new Promise((resolve, reject) => {
    let output = '';

    const proc = spawn('terraform', args, {
      cwd: directory,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    proc.stdout?.on('data', data => {
      output += data.toString();
    });

    proc.stderr?.on('data', data => {
      output += data.toString();
    });

    proc.on('error', error => {
      reject(new Error(`Failed to run terraform plan: ${error.message}`));
    });

    proc.on('close', code => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Terraform plan failed with exit code ${code}`));
      }
    });
  });
}

/**
 * Run safety checks for the operation
 */
async function runSafetyChecks(
  operation: string,
  planOutput: string,
  options: ApplyTerraformOptions
): Promise<SafetyCheckResult> {
  const policy = loadSafetyPolicy();

  const context: SafetyContext = {
    operation,
    type: 'terraform',
    environment: options.environment,
    planOutput,
    metadata: {
      directory: options.directory,
      target: options.target,
    },
  };

  return evaluateSafety(context, policy);
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
