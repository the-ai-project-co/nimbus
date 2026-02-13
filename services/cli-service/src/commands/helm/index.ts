/**
 * Helm Commands
 *
 * CLI commands for Helm operations
 */

import { helmClient } from '../../clients';
import { ui } from '../../wizard/ui';

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
    } else if (arg === '--repo') {
      options.repo = args[++i];
    } else if (arg.startsWith('--set=')) {
      const [key, value] = arg.slice(6).split('=');
      options.values = options.values || {};
      options.values[key] = value;
    } else if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    }
  }

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
    default:
      ui.error(`Unknown helm subcommand: ${subcommand}`);
      ui.info('Available commands: list, install, upgrade, uninstall, rollback, history, search, show, repo');
  }
}
