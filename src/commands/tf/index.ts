/**
 * Terraform Commands
 *
 * CLI commands for Terraform operations
 */

import { terraformClient } from '../../clients';
import { ui } from '../../wizard/ui';
import { confirmWithResourceName } from '../../wizard/approval';
import { showDestructionCostWarning } from '../../utils/cost-warning';
import { historyManager } from '../../history';

export interface TfCommandOptions {
  directory?: string;
  varFile?: string;
  vars?: Record<string, string>;
  autoApprove?: boolean;
  dryRun?: boolean;
  out?: string;
  planFile?: string;
  check?: boolean;
  recursive?: boolean;
  diff?: boolean;
  type?: 'plan' | 'apply';
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
  const path = await import('path');
  const workspaceName = path.basename(path.resolve(directory));

  ui.header('Terraform Destroy');
  ui.info(`Directory: ${directory}`);
  ui.warning('This will destroy all managed infrastructure!');

  // Show cost warning before destructive operation
  await showDestructionCostWarning(directory);

  if (!options.autoApprove) {
    // Require type-name-to-delete confirmation
    const confirmed = await confirmWithResourceName(workspaceName, 'terraform workspace');
    if (!confirmed) {
      return;
    }
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
 * Format Terraform configuration files
 */
export async function tfFmtCommand(options: TfCommandOptions = {}): Promise<void> {
  const directory = options.directory || process.cwd();

  ui.header('Terraform Fmt');
  ui.info(`Directory: ${directory}`);

  if (options.check) {
    ui.info('Mode: check only (no changes will be made)');
  }

  ui.startSpinner({ message: 'Formatting Terraform files...' });

  try {
    const available = await terraformClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Terraform Tools Service not available');
      ui.error('Please ensure the Terraform Tools Service is running.');
      return;
    }

    const result = await terraformClient.fmt(directory, {
      check: options.check,
      recursive: options.recursive,
      diff: options.diff,
    });

    if (result.success) {
      if (result.files && result.files.length > 0) {
        ui.stopSpinnerSuccess(`Formatted ${result.files.length} file(s)`);
        for (const file of result.files) {
          ui.print(`  ${ui.color('*', 'green')} ${file}`);
        }
      } else {
        ui.stopSpinnerSuccess('All files already formatted');
      }
      if (result.output) {
        ui.box({ title: 'Fmt Output', content: result.output });
      }
    } else {
      ui.stopSpinnerFail('Terraform fmt failed');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error formatting Terraform files');
    ui.error(error.message);
  }
}

/**
 * Manage Terraform workspaces
 */
export async function tfWorkspaceCommand(subcommand: string, name: string | undefined, options: TfCommandOptions = {}): Promise<void> {
  const directory = options.directory || process.cwd();

  ui.header('Terraform Workspace');
  ui.info(`Directory: ${directory}`);

  try {
    const available = await terraformClient.isAvailable();
    if (!available) {
      ui.error('Terraform Tools Service not available');
      ui.error('Please ensure the Terraform Tools Service is running.');
      return;
    }

    switch (subcommand) {
      case 'list': {
        ui.startSpinner({ message: 'Listing workspaces...' });
        const result = await terraformClient.workspace.list(directory);
        if (result.success) {
          ui.stopSpinnerSuccess('Workspaces retrieved');
          if (result.workspaces && result.workspaces.length > 0) {
            for (const ws of result.workspaces) {
              const marker = ws === result.current ? '* ' : '  ';
              ui.print(`${marker}${ws}`);
            }
          }
          if (result.output) {
            ui.box({ title: 'Workspace List', content: result.output });
          }
        } else {
          ui.stopSpinnerFail('Failed to list workspaces');
          if (result.error) {
            ui.error(result.error);
          }
        }
        break;
      }

      case 'select': {
        if (!name) {
          ui.error('Usage: nimbus tf workspace select <name>');
          return;
        }
        ui.startSpinner({ message: `Selecting workspace "${name}"...` });
        const result = await terraformClient.workspace.select(name, directory);
        if (result.success) {
          ui.stopSpinnerSuccess(`Switched to workspace "${name}"`);
          if (result.output) {
            ui.box({ title: 'Output', content: result.output });
          }
        } else {
          ui.stopSpinnerFail(`Failed to select workspace "${name}"`);
          if (result.error) {
            ui.error(result.error);
          }
        }
        break;
      }

      case 'new': {
        if (!name) {
          ui.error('Usage: nimbus tf workspace new <name>');
          return;
        }
        ui.startSpinner({ message: `Creating workspace "${name}"...` });
        const result = await terraformClient.workspace.new(name, directory);
        if (result.success) {
          ui.stopSpinnerSuccess(`Created and switched to workspace "${name}"`);
          if (result.output) {
            ui.box({ title: 'Output', content: result.output });
          }
        } else {
          ui.stopSpinnerFail(`Failed to create workspace "${name}"`);
          if (result.error) {
            ui.error(result.error);
          }
        }
        break;
      }

      case 'delete': {
        if (!name) {
          ui.error('Usage: nimbus tf workspace delete <name>');
          return;
        }
        ui.startSpinner({ message: `Deleting workspace "${name}"...` });
        const result = await terraformClient.workspace.delete(name, directory);
        if (result.success) {
          ui.stopSpinnerSuccess(`Deleted workspace "${name}"`);
          if (result.output) {
            ui.box({ title: 'Output', content: result.output });
          }
        } else {
          ui.stopSpinnerFail(`Failed to delete workspace "${name}"`);
          if (result.error) {
            ui.error(result.error);
          }
        }
        break;
      }

      default:
        ui.error(`Unknown workspace subcommand: ${subcommand}`);
        ui.info('Available subcommands: list, select, new, delete');
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error managing Terraform workspace');
    ui.error(error.message);
  }
}

/**
 * Import existing infrastructure into Terraform state
 */
export async function tfImportCommand(address: string, id: string, options: TfCommandOptions = {}): Promise<void> {
  const directory = options.directory || process.cwd();

  ui.header('Terraform Import');
  ui.info(`Directory: ${directory}`);
  ui.info(`Address: ${address}`);
  ui.info(`ID: ${id}`);

  ui.startSpinner({ message: `Importing ${address}...` });

  try {
    const available = await terraformClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Terraform Tools Service not available');
      ui.error('Please ensure the Terraform Tools Service is running.');
      return;
    }

    const result = await terraformClient.import(directory, address, id);

    if (result.success) {
      ui.stopSpinnerSuccess(`Successfully imported ${address}`);
      if (result.output) {
        ui.box({ title: 'Import Output', content: result.output });
      }
    } else {
      ui.stopSpinnerFail('Terraform import failed');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error importing resource');
    ui.error(error.message);
  }
}

/**
 * Show Terraform output values
 */
export async function tfOutputCommand(options: TfCommandOptions = {}, name?: string): Promise<void> {
  const directory = options.directory || process.cwd();

  ui.header('Terraform Output');
  ui.info(`Directory: ${directory}`);
  if (name) {
    ui.info(`Output: ${name}`);
  }

  ui.startSpinner({ message: 'Retrieving Terraform outputs...' });

  try {
    const available = await terraformClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Terraform Tools Service not available');
      ui.error('Please ensure the Terraform Tools Service is running.');
      return;
    }

    const result = await terraformClient.output(directory, name);

    if (result.success) {
      ui.stopSpinnerSuccess('Outputs retrieved');
      if (result.outputs) {
        for (const [key, val] of Object.entries(result.outputs)) {
          const value = val.sensitive ? '<sensitive>' : JSON.stringify(val.value);
          ui.print(`  ${ui.color(key, 'cyan')} = ${value}`);
        }
      }
      if (result.output) {
        ui.box({ title: 'Output', content: result.output });
      }
    } else {
      ui.stopSpinnerFail('Failed to retrieve outputs');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error retrieving Terraform outputs');
    ui.error(error.message);
  }
}

/**
 * Manage Terraform state
 */
export async function tfStateCommand(args: string[], options: TfCommandOptions = {}): Promise<void> {
  const directory = options.directory || process.cwd();
  const subcommand = args[0];

  ui.header('Terraform State');
  ui.info(`Directory: ${directory}`);

  try {
    const available = await terraformClient.isAvailable();
    if (!available) {
      ui.error('Terraform Tools Service not available');
      ui.error('Please ensure the Terraform Tools Service is running.');
      return;
    }

    switch (subcommand) {
      case 'list': {
        ui.startSpinner({ message: 'Listing state resources...' });
        const result = await terraformClient.state.list(directory);
        if (result.success) {
          ui.stopSpinnerSuccess('State resources retrieved');
          if (result.resources && result.resources.length > 0) {
            for (const resource of result.resources) {
              ui.print(`  ${resource}`);
            }
          } else if (result.output) {
            ui.box({ title: 'State List', content: result.output });
          } else {
            ui.info('No resources found in state.');
          }
        } else {
          ui.stopSpinnerFail('Failed to list state resources');
          if (result.error) {
            ui.error(result.error);
          }
        }
        break;
      }

      case 'show': {
        const address = args[1];
        if (!address) {
          ui.error('Usage: nimbus tf state show <address>');
          ui.info('Example: nimbus tf state show aws_instance.web');
          return;
        }
        ui.startSpinner({ message: `Showing state for ${address}...` });
        const result = await terraformClient.state.show(address, directory);
        if (result.success) {
          ui.stopSpinnerSuccess(`State retrieved for ${address}`);
          if (result.output) {
            ui.box({ title: `State: ${address}`, content: result.output });
          }
        } else {
          ui.stopSpinnerFail(`Failed to show state for ${address}`);
          if (result.error) {
            ui.error(result.error);
          }
        }
        break;
      }

      case 'mv': {
        const source = args[1];
        const destination = args[2];
        if (!source || !destination) {
          ui.error('Usage: nimbus tf state mv <source> <destination>');
          ui.info('Example: nimbus tf state mv aws_instance.old aws_instance.new');
          return;
        }
        ui.startSpinner({ message: `Moving state from ${source} to ${destination}...` });
        const result = await terraformClient.state.mv(directory, source, destination);
        if (result.success) {
          ui.stopSpinnerSuccess(`Moved state: ${source} -> ${destination}`);
          if (result.output) {
            ui.box({ title: 'State Move Output', content: result.output });
          }
        } else {
          ui.stopSpinnerFail(`Failed to move state from ${source} to ${destination}`);
          if (result.error) {
            ui.error(result.error);
          }
        }
        break;
      }

      case 'pull': {
        ui.startSpinner({ message: 'Pulling remote state...' });
        const result = await terraformClient.state.pull(directory);
        if (result.success) {
          ui.stopSpinnerSuccess('Remote state pulled successfully');
          if (result.output) {
            ui.box({ title: 'State Pull Output', content: result.output });
          }
        } else {
          ui.stopSpinnerFail('Failed to pull remote state');
          if (result.error) {
            ui.error(result.error);
          }
        }
        break;
      }

      case 'push': {
        ui.startSpinner({ message: 'Pushing local state...' });
        const result = await terraformClient.state.push(directory);
        if (result.success) {
          ui.stopSpinnerSuccess('Local state pushed successfully');
          if (result.output) {
            ui.box({ title: 'State Push Output', content: result.output });
          }
        } else {
          ui.stopSpinnerFail('Failed to push local state');
          if (result.error) {
            ui.error(result.error);
          }
        }
        break;
      }

      default:
        ui.error(`Unknown state subcommand: ${subcommand || '(none)'}`);
        ui.info('Available subcommands: list, show <address>, mv <src> <dst>, pull, push');
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error managing Terraform state');
    ui.error(error.message);
  }
}

/**
 * Taint a resource, marking it for recreation on next apply
 */
export async function tfTaintCommand(address: string, options: TfCommandOptions = {}): Promise<void> {
  const directory = options.directory || process.cwd();

  ui.header('Terraform Taint');
  ui.info(`Directory: ${directory}`);
  ui.info(`Address: ${address}`);
  ui.warning('This resource will be destroyed and recreated on the next apply.');

  ui.startSpinner({ message: `Tainting ${address}...` });

  try {
    const available = await terraformClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Terraform Tools Service not available');
      ui.error('Please ensure the Terraform Tools Service is running.');
      return;
    }

    const result = await terraformClient.taint(directory, address);

    if (result.success) {
      ui.stopSpinnerSuccess(`Resource ${address} tainted successfully`);
      if (result.output) {
        ui.box({ title: 'Taint Output', content: result.output });
      }
    } else {
      ui.stopSpinnerFail(`Failed to taint resource ${address}`);
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error tainting resource');
    ui.error(error.message);
  }
}

/**
 * Untaint a resource, removing the taint mark
 */
export async function tfUntaintCommand(address: string, options: TfCommandOptions = {}): Promise<void> {
  const directory = options.directory || process.cwd();

  ui.header('Terraform Untaint');
  ui.info(`Directory: ${directory}`);
  ui.info(`Address: ${address}`);

  ui.startSpinner({ message: `Untainting ${address}...` });

  try {
    const available = await terraformClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Terraform Tools Service not available');
      ui.error('Please ensure the Terraform Tools Service is running.');
      return;
    }

    const result = await terraformClient.untaint(directory, address);

    if (result.success) {
      ui.stopSpinnerSuccess(`Resource ${address} untainted successfully`);
      if (result.output) {
        ui.box({ title: 'Untaint Output', content: result.output });
      }
    } else {
      ui.stopSpinnerFail(`Failed to untaint resource ${address}`);
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error untainting resource');
    ui.error(error.message);
  }
}

/**
 * Generate a resource dependency graph in DOT format
 */
export async function tfGraphCommand(options: TfCommandOptions & { type?: 'plan' | 'apply' } = {}): Promise<void> {
  const directory = options.directory || process.cwd();

  ui.header('Terraform Graph');
  ui.info(`Directory: ${directory}`);
  if (options.type) {
    ui.info(`Graph type: ${options.type}`);
  }

  ui.startSpinner({ message: 'Generating resource dependency graph...' });

  try {
    const available = await terraformClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Terraform Tools Service not available');
      ui.error('Please ensure the Terraform Tools Service is running.');
      return;
    }

    const result = await terraformClient.graph(directory, { type: options.type });

    if (result.success) {
      ui.stopSpinnerSuccess('Dependency graph generated');
      if (result.output) {
        ui.box({ title: 'Dependency Graph (DOT format)', content: result.output });
      }
    } else {
      ui.stopSpinnerFail('Failed to generate dependency graph');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error generating Terraform graph');
    ui.error(error.message);
  }
}

/**
 * Force unlock a locked Terraform state
 */
export async function tfForceUnlockCommand(lockId: string, options: TfCommandOptions = {}): Promise<void> {
  const directory = options.directory || process.cwd();

  ui.header('Terraform Force-Unlock');
  ui.info(`Directory: ${directory}`);
  ui.info(`Lock ID: ${lockId}`);
  ui.warning('Force-unlocking state should only be done when a legitimate lock is stuck.');

  ui.startSpinner({ message: `Force-unlocking state with lock ID ${lockId}...` });

  try {
    const available = await terraformClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Terraform Tools Service not available');
      ui.error('Please ensure the Terraform Tools Service is running.');
      return;
    }

    const result = await terraformClient.forceUnlock(directory, lockId);

    if (result.success) {
      ui.stopSpinnerSuccess('State lock released successfully');
      if (result.output) {
        ui.box({ title: 'Force-Unlock Output', content: result.output });
      }
    } else {
      ui.stopSpinnerFail('Failed to force-unlock state');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error force-unlocking Terraform state');
    ui.error(error.message);
  }
}

/**
 * Refresh Terraform state against real infrastructure
 */
export async function tfRefreshCommand(options: TfCommandOptions = {}): Promise<void> {
  const directory = options.directory || process.cwd();

  ui.header('Terraform Refresh');
  ui.info(`Directory: ${directory}`);

  ui.startSpinner({ message: 'Refreshing Terraform state...' });

  try {
    const available = await terraformClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Terraform Tools Service not available');
      ui.error('Please ensure the Terraform Tools Service is running.');
      return;
    }

    const result = await terraformClient.refresh(directory, { varFile: options.varFile });

    if (result.success) {
      ui.stopSpinnerSuccess('Terraform state refreshed successfully');
      if (result.output) {
        ui.box({ title: 'Refresh Output', content: result.output });
      }
    } else {
      ui.stopSpinnerFail('Terraform refresh failed');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error refreshing Terraform state');
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

  // Collect positional args (non-flag args)
  const positionalArgs: string[] = [];

  // Parse args
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-d' || arg === '--directory') {
      options.directory = args[++i];
    } else if (arg === '--var-file') {
      options.varFile = args[++i];
    } else if (arg === '--auto-approve' || arg === '--yes' || arg === '-y') {
      options.autoApprove = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '-o' || arg === '--out') {
      options.out = args[++i];
    } else if (arg === '-p' || arg === '--plan') {
      options.planFile = args[++i];
    } else if (arg.startsWith('--var=')) {
      const [key, value] = arg.slice(6).split('=');
      options.vars = options.vars || {};
      options.vars[key] = value;
    } else if (arg === '--check') {
      options.check = true;
    } else if (arg === '-r' || arg === '--recursive') {
      options.recursive = true;
    } else if (arg === '--diff') {
      options.diff = true;
    } else if (arg === '--type') {
      const typeVal = args[++i];
      if (typeVal === 'plan' || typeVal === 'apply') {
        options.type = typeVal;
      }
    } else if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    }
  }

  const startTime = Date.now();
  const entry = historyManager.addEntry('tf', [subcommand, ...args]);

  try {
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
      case 'fmt':
        await tfFmtCommand(options);
        break;
      case 'workspace':
        await tfWorkspaceCommand(positionalArgs[0] || 'list', positionalArgs[1], options);
        break;
      case 'import':
        if (positionalArgs.length < 2) {
          ui.error('Usage: nimbus tf import <address> <id>');
          ui.info('Example: nimbus tf import aws_instance.web i-1234567890abcdef0');
          return;
        }
        await tfImportCommand(positionalArgs[0], positionalArgs[1], options);
        break;
      case 'output':
        await tfOutputCommand(options, positionalArgs[0]);
        break;
      case 'state':
        await tfStateCommand(positionalArgs, options);
        break;
      case 'taint':
        if (positionalArgs.length < 1) {
          ui.error('Usage: nimbus tf taint <address>');
          ui.info('Example: nimbus tf taint aws_instance.web');
          return;
        }
        await tfTaintCommand(positionalArgs[0], options);
        break;
      case 'untaint':
        if (positionalArgs.length < 1) {
          ui.error('Usage: nimbus tf untaint <address>');
          ui.info('Example: nimbus tf untaint aws_instance.web');
          return;
        }
        await tfUntaintCommand(positionalArgs[0], options);
        break;
      case 'graph':
        await tfGraphCommand(options);
        break;
      case 'force-unlock':
        if (positionalArgs.length < 1) {
          ui.error('Usage: nimbus tf force-unlock <lock-id>');
          ui.info('Example: nimbus tf force-unlock 5b3ab8f0-e74b-5d85-4b2f-b6a9d4b3f3e2');
          return;
        }
        await tfForceUnlockCommand(positionalArgs[0], options);
        break;
      case 'refresh':
        await tfRefreshCommand(options);
        break;
      default:
        ui.error(`Unknown terraform subcommand: ${subcommand}`);
        ui.info('Available commands: init, plan, apply, validate, destroy, show, fmt, workspace, import, output, state, taint, untaint, graph, force-unlock, refresh');
    }

    historyManager.completeEntry(entry.id, 'success', Date.now() - startTime);
  } catch (error: any) {
    historyManager.completeEntry(entry.id, 'failure', Date.now() - startTime, { error: error.message });
    throw error;
  }
}
