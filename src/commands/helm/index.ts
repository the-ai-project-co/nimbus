/**
 * Helm Commands
 *
 * CLI commands for Helm operations
 */

import { helmClient } from '../../clients';
import { ui } from '../../wizard/ui';
import { confirmWithResourceName } from '../../wizard/approval';
import { showDestructionCostWarning } from '../../utils/cost-warning';
import { historyManager } from '../../history';

export interface HelmCommandOptions {
  namespace?: string;
  allNamespaces?: boolean;
  values?: Record<string, any>;
  valuesFile?: string;
  version?: string;
  wait?: boolean;
  timeout?: string;
  createNamespace?: boolean;
  dryRun?: boolean;
  keepHistory?: boolean;
  install?: boolean;
  repo?: string;
  yes?: boolean;
  // package-specific
  destination?: string;
  appVersion?: string;
  dependencyUpdate?: boolean;
  // status-specific
  revision?: number;
  // template-specific
  set?: Record<string, string>;
}

/**
 * List Helm releases
 */
export async function helmListCommand(options: HelmCommandOptions = {}): Promise<void> {
  ui.header('Helm Releases');

  if (options.allNamespaces) {
    ui.info('Showing releases across all namespaces');
  } else if (options.namespace) {
    ui.info(`Namespace: ${options.namespace}`);
  }

  ui.startSpinner({ message: 'Fetching Helm releases...' });

  try {
    const available = await helmClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Helm Tools Service not available');
      ui.error('Please ensure the Helm Tools Service is running.');
      return;
    }

    const result = await helmClient.list({
      namespace: options.namespace,
      allNamespaces: options.allNamespaces,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Found ${result.releases.length} releases`);

      if (result.releases.length > 0) {
        ui.table({
          columns: [
            { key: 'name', header: 'Name' },
            { key: 'namespace', header: 'Namespace' },
            { key: 'revision', header: 'Revision' },
            { key: 'status', header: 'Status' },
            { key: 'chart', header: 'Chart' },
            { key: 'appVersion', header: 'App Version' },
            { key: 'updated', header: 'Updated' },
          ],
          data: result.releases.map((release) => ({
            name: release.name,
            namespace: release.namespace,
            revision: release.revision,
            status: release.status,
            chart: release.chart,
            appVersion: release.appVersion,
            updated: release.updated,
          })),
        });
      } else {
        ui.info('No releases found');
      }
    } else {
      ui.stopSpinnerFail('Failed to list releases');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error listing Helm releases');
    ui.error(error.message);
  }
}

/**
 * Install a Helm chart
 */
export async function helmInstallCommand(
  releaseName: string,
  chart: string,
  options: HelmCommandOptions = {}
): Promise<void> {
  ui.header('Helm Install');
  ui.info(`Release: ${releaseName}`);
  ui.info(`Chart: ${chart}`);

  if (options.namespace) {
    ui.info(`Namespace: ${options.namespace}`);
  }
  if (options.version) {
    ui.info(`Version: ${options.version}`);
  }

  ui.startSpinner({ message: `Installing ${chart}...` });

  try {
    const available = await helmClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Helm Tools Service not available');
      ui.error('Please ensure the Helm Tools Service is running.');
      return;
    }

    const result = await helmClient.install(releaseName, chart, {
      namespace: options.namespace,
      values: options.values,
      valuesFile: options.valuesFile,
      version: options.version,
      wait: options.wait,
      timeout: options.timeout,
      createNamespace: options.createNamespace,
      dryRun: options.dryRun,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Installed ${releaseName}`);

      ui.info(`Status: ${result.release.status}`);
      ui.info(`Revision: ${result.release.revision}`);

      if (result.output) {
        ui.box({ title: 'Output', content: result.output });
      }
    } else {
      ui.stopSpinnerFail('Failed to install chart');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error installing Helm chart');
    ui.error(error.message);
  }
}

/**
 * Upgrade a Helm release
 */
export async function helmUpgradeCommand(
  releaseName: string,
  chart: string,
  options: HelmCommandOptions = {}
): Promise<void> {
  ui.header('Helm Upgrade');
  ui.info(`Release: ${releaseName}`);
  ui.info(`Chart: ${chart}`);

  if (options.namespace) {
    ui.info(`Namespace: ${options.namespace}`);
  }
  if (options.version) {
    ui.info(`Version: ${options.version}`);
  }
  if (options.install) {
    ui.info('Install if not exists: yes');
  }

  ui.startSpinner({ message: `Upgrading ${releaseName}...` });

  try {
    const available = await helmClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Helm Tools Service not available');
      ui.error('Please ensure the Helm Tools Service is running.');
      return;
    }

    const result = await helmClient.upgrade(releaseName, chart, {
      namespace: options.namespace,
      values: options.values,
      valuesFile: options.valuesFile,
      version: options.version,
      wait: options.wait,
      timeout: options.timeout,
      install: options.install,
      dryRun: options.dryRun,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Upgraded ${releaseName}`);

      ui.info(`Status: ${result.release.status}`);
      ui.info(`Revision: ${result.release.revision}`);

      if (result.output) {
        ui.box({ title: 'Output', content: result.output });
      }
    } else {
      ui.stopSpinnerFail('Failed to upgrade release');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error upgrading Helm release');
    ui.error(error.message);
  }
}

/**
 * Uninstall a Helm release
 */
export async function helmUninstallCommand(
  releaseName: string,
  options: HelmCommandOptions = {}
): Promise<void> {
  ui.header('Helm Uninstall');
  ui.info(`Release: ${releaseName}`);

  if (options.namespace) {
    ui.info(`Namespace: ${options.namespace}`);
  }

  // Show release info warning before destructive operation
  ui.newLine();
  ui.warning(`Destructive operation: uninstalling helm release "${releaseName}"`);
  ui.print(`  ${ui.color('Release:', 'yellow')} ${releaseName}`);
  ui.print(`  ${ui.color('Namespace:', 'yellow')} ${options.namespace || 'default'}`);
  ui.print(`  ${ui.color('Keep history:', 'yellow')} ${options.keepHistory ? 'yes' : 'no'}`);
  ui.print(`  ${ui.color('Impact:', 'red')} All resources managed by this release will be deleted.`);

  // Attempt to show release details if service is available
  try {
    const available = await helmClient.isAvailable();
    if (available) {
      const statusResult = await helmClient.status(releaseName, {
        namespace: options.namespace,
      });
      if (statusResult?.release) {
        ui.print(`  ${ui.color('Chart:', 'yellow')} ${statusResult.release.chart || 'unknown'}`);
        ui.print(`  ${ui.color('Revision:', 'yellow')} ${statusResult.release.revision || 'unknown'}`);
        ui.print(`  ${ui.color('Status:', 'yellow')} ${statusResult.release.status || 'unknown'}`);
      }
    }
  } catch {
    // Best-effort release info display -- silently skip on failure
  }

  // Show cost warning before destructive operation
  await showDestructionCostWarning(process.cwd());

  // Require confirmation for destructive operation
  if (!options.dryRun && !options.yes) {
    const confirmed = await confirmWithResourceName(releaseName, 'helm release');
    if (!confirmed) {
      return;
    }
  }

  ui.startSpinner({ message: `Uninstalling ${releaseName}...` });

  try {
    const available = await helmClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Helm Tools Service not available');
      ui.error('Please ensure the Helm Tools Service is running.');
      return;
    }

    const result = await helmClient.uninstall(releaseName, {
      namespace: options.namespace,
      keepHistory: options.keepHistory,
      dryRun: options.dryRun,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Uninstalled ${releaseName}`);

      if (result.output) {
        ui.box({ title: 'Output', content: result.output });
      }
    } else {
      ui.stopSpinnerFail('Failed to uninstall release');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error uninstalling Helm release');
    ui.error(error.message);
  }
}

/**
 * Rollback a Helm release
 */
export async function helmRollbackCommand(
  releaseName: string,
  revision: number,
  options: HelmCommandOptions = {}
): Promise<void> {
  ui.header('Helm Rollback');
  ui.info(`Release: ${releaseName}`);
  ui.info(`Revision: ${revision}`);

  if (options.namespace) {
    ui.info(`Namespace: ${options.namespace}`);
  }

  ui.startSpinner({ message: `Rolling back ${releaseName} to revision ${revision}...` });

  try {
    const available = await helmClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Helm Tools Service not available');
      ui.error('Please ensure the Helm Tools Service is running.');
      return;
    }

    const result = await helmClient.rollback(releaseName, revision, {
      namespace: options.namespace,
      wait: options.wait,
      dryRun: options.dryRun,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Rolled back ${releaseName} to revision ${revision}`);

      if (result.output) {
        ui.box({ title: 'Output', content: result.output });
      }
    } else {
      ui.stopSpinnerFail('Failed to rollback release');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error rolling back Helm release');
    ui.error(error.message);
  }
}

/**
 * Show release history
 */
export async function helmHistoryCommand(
  releaseName: string,
  options: HelmCommandOptions = {}
): Promise<void> {
  ui.header(`Helm History - ${releaseName}`);

  if (options.namespace) {
    ui.info(`Namespace: ${options.namespace}`);
  }

  ui.startSpinner({ message: 'Fetching release history...' });

  try {
    const available = await helmClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Helm Tools Service not available');
      ui.error('Please ensure the Helm Tools Service is running.');
      return;
    }

    const result = await helmClient.history(releaseName, {
      namespace: options.namespace,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Found ${result.history.length} revisions`);

      if (result.history.length > 0) {
        // Display history - the history format can vary, so we just show it raw
        for (const entry of result.history) {
          ui.info(JSON.stringify(entry));
        }
      }
    } else {
      ui.stopSpinnerFail('Failed to get release history');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error getting Helm history');
    ui.error(error.message);
  }
}

/**
 * Search for Helm charts
 */
export async function helmSearchCommand(
  keyword: string,
  options: HelmCommandOptions = {}
): Promise<void> {
  ui.header(`Helm Search - "${keyword}"`);

  if (options.repo) {
    ui.info(`Repository: ${options.repo}`);
  }

  ui.startSpinner({ message: 'Searching for charts...' });

  try {
    const available = await helmClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Helm Tools Service not available');
      ui.error('Please ensure the Helm Tools Service is running.');
      return;
    }

    const result = await helmClient.search(keyword, {
      repo: options.repo,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Found ${result.charts.length} charts`);

      if (result.charts.length > 0) {
        ui.table({
          columns: [
            { key: 'name', header: 'Name' },
            { key: 'version', header: 'Version' },
            { key: 'appVersion', header: 'App Version' },
            { key: 'description', header: 'Description' },
          ],
          data: result.charts.map((chart) => ({
            name: chart.name,
            version: chart.version,
            appVersion: chart.appVersion,
            description: chart.description,
          })),
        });
      } else {
        ui.info('No charts found');
      }
    } else {
      ui.stopSpinnerFail('Failed to search charts');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error searching Helm charts');
    ui.error(error.message);
  }
}

/**
 * Add a Helm repository
 */
export async function helmRepoAddCommand(name: string, url: string): Promise<void> {
  ui.header('Helm Repo Add');
  ui.info(`Name: ${name}`);
  ui.info(`URL: ${url}`);

  ui.startSpinner({ message: `Adding repository ${name}...` });

  try {
    const available = await helmClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Helm Tools Service not available');
      ui.error('Please ensure the Helm Tools Service is running.');
      return;
    }

    const result = await helmClient.repoAdd(name, url);

    if (result.success) {
      ui.stopSpinnerSuccess(`Added repository ${name}`);

      if (result.output) {
        ui.info(result.output);
      }
    } else {
      ui.stopSpinnerFail('Failed to add repository');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error adding Helm repository');
    ui.error(error.message);
  }
}

/**
 * Update Helm repositories
 */
export async function helmRepoUpdateCommand(): Promise<void> {
  ui.header('Helm Repo Update');

  ui.startSpinner({ message: 'Updating repositories...' });

  try {
    const available = await helmClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Helm Tools Service not available');
      ui.error('Please ensure the Helm Tools Service is running.');
      return;
    }

    const result = await helmClient.repoUpdate();

    if (result.success) {
      ui.stopSpinnerSuccess('Repositories updated');

      if (result.output) {
        ui.info(result.output);
      }
    } else {
      ui.stopSpinnerFail('Failed to update repositories');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error updating Helm repositories');
    ui.error(error.message);
  }
}

/**
 * Show chart information
 */
export async function helmShowCommand(
  chart: string,
  options: HelmCommandOptions & { subcommand?: 'all' | 'chart' | 'readme' | 'values' | 'crds' } = {}
): Promise<void> {
  const sub = options.subcommand || 'all';
  ui.header(`Helm Show ${sub} - ${chart}`);

  if (options.version) {
    ui.info(`Version: ${options.version}`);
  }

  ui.startSpinner({ message: `Fetching chart info for ${chart}...` });

  try {
    const available = await helmClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Helm Tools Service not available');
      ui.error('Please ensure the Helm Tools Service is running.');
      return;
    }

    const result = await helmClient.show(chart, {
      subcommand: sub,
      version: options.version,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Chart info retrieved`);
      if (result.output) {
        console.log(result.output);
      }
    } else {
      ui.stopSpinnerFail('Failed to show chart info');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error showing chart info');
    ui.error(error.message);
  }
}

/**
 * Lint a Helm chart
 */
export async function helmLintCommand(
  chartPath: string,
  options: HelmCommandOptions & { strict?: boolean; valuesFiles?: string[] } = {}
): Promise<void> {
  ui.header('Helm Lint');
  ui.info(`Chart: ${chartPath}`);

  if (options.strict) {
    ui.info('Mode: strict');
  }

  ui.startSpinner({ message: `Linting ${chartPath}...` });

  try {
    const available = await helmClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Helm Tools Service not available');
      ui.error('Please ensure the Helm Tools Service is running.');
      return;
    }

    const result = await helmClient.lint(chartPath, {
      strict: options.strict,
      valuesFiles: options.valuesFiles,
      namespace: options.namespace,
    });

    if (result.success) {
      const lintData = result.data;
      const messages: any[] = lintData?.messages || [];
      const errors = messages.filter((m: any) => m.severity === 'error');
      const warnings = messages.filter((m: any) => m.severity === 'warning');

      if (errors.length === 0) {
        ui.stopSpinnerSuccess(`Chart linted successfully${warnings.length > 0 ? ` (${warnings.length} warnings)` : ''}`);
      } else {
        ui.stopSpinnerFail(`Lint found ${errors.length} error(s)`);
      }

      if (messages.length > 0) {
        ui.newLine();
        for (const msg of messages) {
          if (msg.severity === 'error') {
            ui.error(`  ${msg.message || msg}`);
          } else {
            ui.warning(`  ${msg.message || msg}`);
          }
        }
      }

      if (lintData?.output) {
        ui.newLine();
        ui.box({ title: 'Lint Output', content: lintData.output });
      }
    } else {
      ui.stopSpinnerFail('Lint failed');
      if (result.error) {
        ui.error(typeof result.error === 'string' ? result.error : 'Unknown error');
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error linting Helm chart');
    ui.error(error.message);
  }
}

/**
 * Render chart templates locally without installing
 */
export async function helmTemplateCommand(
  releaseName: string,
  chart: string,
  options: HelmCommandOptions & { set?: Record<string, string> } = {}
): Promise<void> {
  ui.header('Helm Template');
  ui.info(`Release name: ${releaseName}`);
  ui.info(`Chart: ${chart}`);

  if (options.namespace) {
    ui.info(`Namespace: ${options.namespace}`);
  }
  if (options.version) {
    ui.info(`Version: ${options.version}`);
  }

  ui.startSpinner({ message: `Rendering templates for ${chart}...` });

  try {
    const available = await helmClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Helm Tools Service not available');
      ui.error('Please ensure the Helm Tools Service is running.');
      return;
    }

    const result = await helmClient.template(releaseName, chart, {
      namespace: options.namespace,
      values: options.values,
      valuesFile: options.valuesFile,
      set: options.set,
      version: options.version,
    });

    if (result.success) {
      ui.stopSpinnerSuccess('Templates rendered successfully');

      if (result.manifests) {
        ui.newLine();
        console.log(result.manifests);
      }
    } else {
      ui.stopSpinnerFail('Failed to render templates');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error rendering Helm templates');
    ui.error(error.message);
  }
}

/**
 * Package a chart directory into a chart archive
 */
export async function helmPackageCommand(
  chartPath: string,
  options: HelmCommandOptions & { destination?: string; appVersion?: string; dependencyUpdate?: boolean } = {}
): Promise<void> {
  ui.header('Helm Package');
  ui.info(`Chart path: ${chartPath}`);

  if (options.destination) {
    ui.info(`Destination: ${options.destination}`);
  }
  if (options.version) {
    ui.info(`Version: ${options.version}`);
  }
  if (options.appVersion) {
    ui.info(`App version: ${options.appVersion}`);
  }

  ui.startSpinner({ message: `Packaging chart ${chartPath}...` });

  try {
    const available = await helmClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Helm Tools Service not available');
      ui.error('Please ensure the Helm Tools Service is running.');
      return;
    }

    const result = await helmClient.package(chartPath, {
      destination: options.destination,
      version: options.version,
      appVersion: options.appVersion,
      dependencyUpdate: options.dependencyUpdate,
    });

    if (result.success) {
      ui.stopSpinnerSuccess('Chart packaged successfully');

      if (result.output) {
        ui.box({ title: 'Output', content: result.output });
      }
    } else {
      ui.stopSpinnerFail('Failed to package chart');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error packaging Helm chart');
    ui.error(error.message);
  }
}

/**
 * Manage chart dependencies
 */
export async function helmDependencyCommand(
  depSubcommand: string,
  chartPath: string
): Promise<void> {
  const action = depSubcommand === 'build' ? 'build' : 'update';
  ui.header(`Helm Dependency ${action.charAt(0).toUpperCase() + action.slice(1)}`);
  ui.info(`Chart path: ${chartPath}`);

  ui.startSpinner({ message: `Running dependency ${action} for ${chartPath}...` });

  try {
    const available = await helmClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Helm Tools Service not available');
      ui.error('Please ensure the Helm Tools Service is running.');
      return;
    }

    const result = action === 'build'
      ? await helmClient.dependencyBuild(chartPath)
      : await helmClient.dependencyUpdate(chartPath);

    if (result.success) {
      ui.stopSpinnerSuccess(`Dependency ${action} completed`);

      if (result.output) {
        ui.box({ title: 'Output', content: result.output });
      }
    } else {
      ui.stopSpinnerFail(`Failed to ${action} dependencies`);
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail(`Error running dependency ${action}`);
    ui.error(error.message);
  }
}

/**
 * Show the status of a named release
 */
export async function helmStatusCommand(
  releaseName: string,
  options: HelmCommandOptions & { revision?: number } = {}
): Promise<void> {
  ui.header(`Helm Status - ${releaseName}`);

  if (options.namespace) {
    ui.info(`Namespace: ${options.namespace}`);
  }
  if (options.revision !== undefined) {
    ui.info(`Revision: ${options.revision}`);
  }

  ui.startSpinner({ message: `Fetching status for ${releaseName}...` });

  try {
    const available = await helmClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Helm Tools Service not available');
      ui.error('Please ensure the Helm Tools Service is running.');
      return;
    }

    const result = await helmClient.statusDetailed(releaseName, {
      namespace: options.namespace,
      revision: options.revision,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Status retrieved for ${releaseName}`);

      if (result.status) {
        const statusData = result.status;
        if (typeof statusData === 'object') {
          ui.newLine();
          if (statusData.name) ui.info(`Name:      ${statusData.name}`);
          if (statusData.namespace) ui.info(`Namespace: ${statusData.namespace}`);
          if (statusData.status) ui.info(`Status:    ${statusData.status}`);
          if (statusData.revision) ui.info(`Revision:  ${statusData.revision}`);
          if (statusData.chart) ui.info(`Chart:     ${statusData.chart}`);
          if (statusData.appVersion) ui.info(`App Ver:   ${statusData.appVersion}`);
          if (statusData.updated) ui.info(`Updated:   ${statusData.updated}`);
          if (statusData.description) {
            ui.newLine();
            ui.info(`Description: ${statusData.description}`);
          }
          if (statusData.notes) {
            ui.newLine();
            ui.box({ title: 'Notes', content: statusData.notes });
          }
        } else if (typeof statusData === 'string') {
          ui.newLine();
          console.log(statusData);
        }
      }
    } else {
      ui.stopSpinnerFail(`Failed to get status for ${releaseName}`);
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error fetching Helm release status');
    ui.error(error.message);
  }
}

/**
 * Main helm command router
 */
export async function helmCommand(subcommand: string, args: string[]): Promise<void> {
  const options: HelmCommandOptions = {};

  // Extract positional args and options
  const positionalArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-n' || arg === '--namespace') {
      options.namespace = args[++i];
    } else if (arg === '-A' || arg === '--all-namespaces') {
      options.allNamespaces = true;
    } else if (arg === '-f' || arg === '--values') {
      options.valuesFile = args[++i];
    } else if (arg === '--version') {
      options.version = args[++i];
    } else if (arg === '--wait') {
      options.wait = true;
    } else if (arg === '--timeout') {
      options.timeout = args[++i];
    } else if (arg === '--create-namespace') {
      options.createNamespace = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--keep-history') {
      options.keepHistory = true;
    } else if (arg === '-i' || arg === '--install') {
      options.install = true;
    } else if (arg === '--yes' || arg === '-y') {
      options.yes = true;
    } else if (arg === '--repo') {
      options.repo = args[++i];
    } else if (arg === '--destination' || arg === '-d') {
      options.destination = args[++i];
    } else if (arg === '--app-version') {
      options.appVersion = args[++i];
    } else if (arg === '--dependency-update') {
      options.dependencyUpdate = true;
    } else if (arg === '--revision') {
      options.revision = parseInt(args[++i], 10);
    } else if (arg.startsWith('--set=')) {
      const setExpr = arg.slice(6);
      const eqIdx = setExpr.indexOf('=');
      if (eqIdx !== -1) {
        const key = setExpr.slice(0, eqIdx);
        const value = setExpr.slice(eqIdx + 1);
        options.set = options.set || {};
        options.set[key] = value;
        options.values = options.values || {};
        options.values[key] = value;
      }
    } else if (arg === '--set') {
      const setExpr = args[++i] || '';
      const eqIdx = setExpr.indexOf('=');
      if (eqIdx !== -1) {
        const key = setExpr.slice(0, eqIdx);
        const value = setExpr.slice(eqIdx + 1);
        options.set = options.set || {};
        options.set[key] = value;
        options.values = options.values || {};
        options.values[key] = value;
      }
    } else if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    }
  }

  const startTime = Date.now();
  const entry = historyManager.addEntry('helm', [subcommand, ...args]);

  try {
    switch (subcommand) {
      case 'list':
      case 'ls':
        await helmListCommand(options);
        break;
      case 'install':
        if (positionalArgs.length < 2) {
          ui.error('Usage: nimbus helm install <release-name> <chart>');
          return;
        }
        await helmInstallCommand(positionalArgs[0], positionalArgs[1], options);
        break;
      case 'upgrade':
        if (positionalArgs.length < 2) {
          ui.error('Usage: nimbus helm upgrade <release-name> <chart>');
          return;
        }
        await helmUpgradeCommand(positionalArgs[0], positionalArgs[1], options);
        break;
      case 'uninstall':
      case 'delete':
        if (positionalArgs.length < 1) {
          ui.error('Usage: nimbus helm uninstall <release-name>');
          return;
        }
        await helmUninstallCommand(positionalArgs[0], options);
        break;
      case 'rollback':
        if (positionalArgs.length < 2) {
          ui.error('Usage: nimbus helm rollback <release-name> <revision>');
          return;
        }
        await helmRollbackCommand(positionalArgs[0], parseInt(positionalArgs[1], 10), options);
        break;
      case 'history':
        if (positionalArgs.length < 1) {
          ui.error('Usage: nimbus helm history <release-name>');
          return;
        }
        await helmHistoryCommand(positionalArgs[0], options);
        break;
      case 'search':
        if (positionalArgs.length < 1) {
          ui.error('Usage: nimbus helm search <keyword>');
          return;
        }
        await helmSearchCommand(positionalArgs[0], options);
        break;
      case 'show':
        if (positionalArgs.length < 1) {
          ui.error('Usage: nimbus helm show <chart> [--subcommand all|chart|readme|values|crds]');
          return;
        }
        {
          // First positional arg might be the subcommand (all, chart, readme, values, crds)
          const validSubs = ['all', 'chart', 'readme', 'values', 'crds'];
          let showSub: 'all' | 'chart' | 'readme' | 'values' | 'crds' = 'all';
          let chartName = positionalArgs[0];
          if (validSubs.includes(positionalArgs[0]) && positionalArgs[1]) {
            showSub = positionalArgs[0] as typeof showSub;
            chartName = positionalArgs[1];
          }
          await helmShowCommand(chartName, { ...options, subcommand: showSub });
        }
        break;
      case 'repo':
        if (positionalArgs[0] === 'add' && positionalArgs.length >= 3) {
          await helmRepoAddCommand(positionalArgs[1], positionalArgs[2]);
        } else if (positionalArgs[0] === 'update') {
          await helmRepoUpdateCommand();
        } else {
          ui.error('Usage: nimbus helm repo add <name> <url> | nimbus helm repo update');
        }
        break;
      case 'lint':
        if (positionalArgs.length < 1) {
          ui.error('Usage: nimbus helm lint <chart-path> [--strict]');
          return;
        }
        {
          const strict = args.includes('--strict');
          const valuesFiles: string[] = [];
          for (let i = 0; i < args.length; i++) {
            if ((args[i] === '-f' || args[i] === '--values') && args[i + 1]) {
              valuesFiles.push(args[i + 1]);
            }
          }
          await helmLintCommand(positionalArgs[0], { ...options, strict, valuesFiles });
        }
        break;
      case 'template':
        if (positionalArgs.length < 2) {
          ui.error('Usage: nimbus helm template <release-name> <chart> [--namespace <ns>] [--values <file>] [--set key=val] [--version <ver>]');
          return;
        }
        await helmTemplateCommand(positionalArgs[0], positionalArgs[1], options);
        break;
      case 'package':
        if (positionalArgs.length < 1) {
          ui.error('Usage: nimbus helm package <chart-path> [--destination <dir>] [--version <ver>] [--app-version <ver>]');
          return;
        }
        await helmPackageCommand(positionalArgs[0], options);
        break;
      case 'dependency':
      case 'dep': {
        // Supports: nimbus helm dependency update <chart-path>
        //           nimbus helm dependency build <chart-path>
        const depSubcommand = positionalArgs[0] || 'update';
        const depChartPath = positionalArgs[1];
        if (!depChartPath) {
          ui.error('Usage: nimbus helm dependency <update|build> <chart-path>');
          return;
        }
        await helmDependencyCommand(depSubcommand, depChartPath);
        break;
      }
      case 'status':
        if (positionalArgs.length < 1) {
          ui.error('Usage: nimbus helm status <release-name> [--namespace <ns>] [--revision <rev>]');
          return;
        }
        await helmStatusCommand(positionalArgs[0], options);
        break;
      default:
        ui.error(`Unknown helm subcommand: ${subcommand}`);
        ui.info('Available commands: list, install, upgrade, uninstall, rollback, history, search, show, repo, lint, template, package, dependency, status');
    }

    historyManager.completeEntry(entry.id, 'success', Date.now() - startTime);
  } catch (error: any) {
    historyManager.completeEntry(entry.id, 'failure', Date.now() - startTime, { error: error.message });
    throw error;
  }
}
