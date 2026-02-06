/**
 * Terraform Commands
 *
 * CLI commands for Terraform operations
 */

import { terraformClient } from '../../clients';
import { ui } from '../../wizard/ui';

export interface TfCommandOptions {
  directory?: string;
  varFile?: string;
  vars?: Record<string, string>;
  autoApprove?: boolean;
  out?: string;
  planFile?: string;
}

/**
 * Initialize Terraform working directory
 */
export async function tfInitCommand(options: TfCommandOptions = {}): Promise<void> {
  const directory = options.directory || process.cwd();

  ui.header('Terraform Init');
  ui.info(`Directory: ${directory}`);

  ui.startSpinner({ message: 'Initializing Terraform...' });

  try {
    const available = await terraformClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Terraform Tools Service not available');
      ui.error('Please ensure the Terraform Tools Service is running.');
      return;
    }

    const result = await terraformClient.init(directory);

    if (result.success) {
      ui.stopSpinnerSuccess('Terraform initialized successfully');
      if (result.output) {
        ui.box({ title: 'Output', content: result.output });
      }
    } else {
      ui.stopSpinnerFail('Terraform init failed');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error initializing Terraform');
    ui.error(error.message);
  }
}

/**
 * Generate Terraform execution plan
 */
export async function tfPlanCommand(options: TfCommandOptions = {}): Promise<void> {
  const directory = options.directory || process.cwd();

  ui.header('Terraform Plan');
  ui.info(`Directory: ${directory}`);

  ui.startSpinner({ message: 'Generating Terraform plan...' });

  try {
    const available = await terraformClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Terraform Tools Service not available');
      ui.error('Please ensure the Terraform Tools Service is running.');
      return;
    }

    const result = await terraformClient.plan(directory, {
      varFile: options.varFile,
      vars: options.vars,
      out: options.out,
    });

    if (result.success) {
      if (result.hasChanges) {
        ui.stopSpinnerSuccess('Plan generated with changes');
      } else {
        ui.stopSpinnerSuccess('Plan generated - no changes');
      }

      if (result.output) {
        ui.box({ title: 'Plan Output', content: result.output });
      }

      if (result.planFile) {
        ui.info(`Plan saved to: ${result.planFile}`);
      }
    } else {
      ui.stopSpinnerFail('Terraform plan failed');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error generating Terraform plan');
    ui.error(error.message);
  }
}

/**
 * Apply Terraform changes
 */
export async function tfApplyCommand(options: TfCommandOptions = {}): Promise<void> {
  const directory = options.directory || process.cwd();

  ui.header('Terraform Apply');
  ui.info(`Directory: ${directory}`);

  if (!options.autoApprove && !options.planFile) {
    ui.warning('Running with -auto-approve flag or specify a plan file for non-interactive mode');
  }

  ui.startSpinner({ message: 'Applying Terraform changes...' });

  try {
    const available = await terraformClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Terraform Tools Service not available');
      ui.error('Please ensure the Terraform Tools Service is running.');
      return;
    }

    const result = await terraformClient.apply(directory, {
      planFile: options.planFile,
      autoApprove: options.autoApprove,
      varFile: options.varFile,
      vars: options.vars,
    });

    if (result.success) {
      ui.stopSpinnerSuccess('Terraform apply completed successfully');
      if (result.output) {
        ui.box({ title: 'Apply Output', content: result.output });
      }
    } else {
      ui.stopSpinnerFail('Terraform apply failed');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error applying Terraform changes');
    ui.error(error.message);
  }
}

/**
 * Validate Terraform configuration
 */
export async function tfValidateCommand(options: TfCommandOptions = {}): Promise<void> {
  const directory = options.directory || process.cwd();

  ui.header('Terraform Validate');
  ui.info(`Directory: ${directory}`);

  ui.startSpinner({ message: 'Validating Terraform configuration...' });

  try {
    const available = await terraformClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Terraform Tools Service not available');
      ui.error('Please ensure the Terraform Tools Service is running.');
      return;
    }

    const result = await terraformClient.validate(directory);

    if (result.valid) {
      ui.stopSpinnerSuccess('Configuration is valid');
      if (result.output) {
        ui.box({ title: 'Validation Output', content: result.output });
      }
    } else {
      ui.stopSpinnerFail('Configuration is invalid');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error validating Terraform configuration');
    ui.error(error.message);
  }
}

/**
 * Destroy Terraform-managed infrastructure
 */
export async function tfDestroyCommand(options: TfCommandOptions = {}): Promise<void> {
  const directory = options.directory || process.cwd();

  ui.header('Terraform Destroy');
  ui.info(`Directory: ${directory}`);
  ui.warning('This will destroy all managed infrastructure!');

  if (!options.autoApprove) {
    ui.warning('Use -auto-approve flag to confirm destruction');
  }

  ui.startSpinner({ message: 'Destroying Terraform resources...' });

  try {
    const available = await terraformClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Terraform Tools Service not available');
      ui.error('Please ensure the Terraform Tools Service is running.');
      return;
    }

    const result = await terraformClient.destroy(directory, {
      autoApprove: options.autoApprove,
      varFile: options.varFile,
    });

    if (result.success) {
      ui.stopSpinnerSuccess('Terraform destroy completed');
      if (result.output) {
        ui.box({ title: 'Destroy Output', content: result.output });
      }
    } else {
      ui.stopSpinnerFail('Terraform destroy failed');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error destroying Terraform resources');
    ui.error(error.message);
  }
}

/**
 * Show Terraform state
 */
export async function tfShowCommand(options: TfCommandOptions = {}): Promise<void> {
  const directory = options.directory || process.cwd();

  ui.header('Terraform Show');
  ui.info(`Directory: ${directory}`);

  ui.startSpinner({ message: 'Retrieving Terraform state...' });

  try {
    const available = await terraformClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Terraform Tools Service not available');
      ui.error('Please ensure the Terraform Tools Service is running.');
      return;
    }

    const result = await terraformClient.show(directory);

    if (result.success) {
      ui.stopSpinnerSuccess('State retrieved');
      if (result.output) {
        ui.box({ title: 'State', content: result.output });
      }
    } else {
      ui.stopSpinnerFail('Failed to retrieve state');
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error retrieving Terraform state');
    ui.error(error.message);
  }
}

/**
 * Main terraform command router
 */
export async function tfCommand(subcommand: string, args: string[]): Promise<void> {
  const options: TfCommandOptions = {
    directory: process.cwd(),
  };

  // Parse args
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-d' || arg === '--directory') {
      options.directory = args[++i];
    } else if (arg === '--var-file') {
      options.varFile = args[++i];
    } else if (arg === '--auto-approve') {
      options.autoApprove = true;
    } else if (arg === '-o' || arg === '--out') {
      options.out = args[++i];
    } else if (arg === '-p' || arg === '--plan') {
      options.planFile = args[++i];
    } else if (arg.startsWith('--var=')) {
      const [key, value] = arg.slice(6).split('=');
      options.vars = options.vars || {};
      options.vars[key] = value;
    }
  }

  switch (subcommand) {
    case 'init':
      await tfInitCommand(options);
      break;
    case 'plan':
      await tfPlanCommand(options);
      break;
    case 'apply':
      await tfApplyCommand(options);
      break;
    case 'validate':
      await tfValidateCommand(options);
      break;
    case 'destroy':
      await tfDestroyCommand(options);
      break;
    case 'show':
      await tfShowCommand(options);
      break;
    default:
      ui.error(`Unknown terraform subcommand: ${subcommand}`);
      ui.info('Available commands: init, plan, apply, validate, destroy, show');
  }
}
