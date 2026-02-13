/**
 * Drift Commands
 *
 * Commands for detecting and fixing infrastructure drift
 */

import { ui } from '../../wizard/ui';
import { select, confirm } from '../../wizard/prompts';
import { CoreEngineClient } from '../../clients/core-engine-client';
import type { DriftReport, DriftRemediationResult, DriftProvider } from '@nimbus/shared-types';

// ==========================================
// Types
// ==========================================

export interface DriftDetectOptions {
  /** Provider to check: terraform, kubernetes, helm */
  provider?: DriftProvider;
  /** Directory containing infrastructure code */
  directory?: string;
  /** Output format */
  json?: boolean;
  /** Show verbose output */
  verbose?: boolean;
}

export interface DriftFixOptions {
  /** Provider to fix: terraform, kubernetes, helm */
  provider?: DriftProvider;
  /** Directory containing infrastructure code */
  directory?: string;
  /** Auto-approve all changes */
  autoApprove?: boolean;
  /** Dry run - show what would be fixed */
  dryRun?: boolean;
  /** Output format */
  json?: boolean;
}

// ==========================================
// Parsers
// ==========================================

/**
 * Parse drift detect options
 */
export function parseDriftDetectOptions(args: string[]): DriftDetectOptions {
  const options: DriftDetectOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--provider' && args[i + 1]) {
      options.provider = args[++i] as DriftProvider;
    } else if (arg === '--directory' && args[i + 1]) {
      options.directory = args[++i];
    } else if (arg === '-d' && args[i + 1]) {
      options.directory = args[++i];
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (!arg.startsWith('-') && !options.provider) {
      options.provider = arg as DriftProvider;
    }
  }

  return options;
}

/**
 * Parse drift fix options
 */
export function parseDriftFixOptions(args: string[]): DriftFixOptions {
  const options: DriftFixOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--provider' && args[i + 1]) {
      options.provider = args[++i] as DriftProvider;
    } else if (arg === '--directory' && args[i + 1]) {
      options.directory = args[++i];
    } else if (arg === '-d' && args[i + 1]) {
      options.directory = args[++i];
    } else if (arg === '--auto-approve' || arg === '-y') {
      options.autoApprove = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (!arg.startsWith('-') && !options.provider) {
      options.provider = arg as DriftProvider;
    }
  }

  return options;
}

// ==========================================
// Display Functions
// ==========================================

/**
 * Format drift severity with color
 */
function formatSeverity(severity: 'critical' | 'high' | 'medium' | 'low'): string {
  switch (severity) {
    case 'critical':
      return ui.color('CRITICAL', 'red');
    case 'high':
      return ui.color('HIGH', 'red');
    case 'medium':
      return ui.color('MEDIUM', 'yellow');
    case 'low':
    default:
      return ui.color('LOW', 'blue');
  }
}

/**
 * Format drift type with color
 */
function formatDriftType(type: 'added' | 'removed' | 'modified'): string {
  switch (type) {
    case 'added':
      return ui.color('+', 'green');
    case 'removed':
      return ui.color('-', 'red');
    case 'modified':
      return ui.color('~', 'yellow');
    default:
      return '?';
  }
}

/**
 * Display drift report
 */
function displayDriftReport(report: DriftReport): void {
  ui.newLine();
  ui.section(`Drift Report - ${report.provider.toUpperCase()}`);

  ui.print(`  ${ui.dim('Detected at:')} ${new Date(report.detectedAt).toLocaleString()}`);
  ui.print(`  ${ui.dim('Total items:')} ${report.summary.total}`);
  ui.print(`  ${ui.dim('Has drift:')}   ${report.hasDrift ? ui.color('Yes', 'yellow') : ui.color('No', 'green')}`);
  ui.newLine();

  if (!report.hasDrift) {
    ui.success('No drift detected. Infrastructure is in sync.');
    return;
  }

  // Summary
  ui.print('  Changes:');
  if (report.summary.added > 0) {
    ui.print(`    ${ui.color('+', 'green')} Added:    ${report.summary.added}`);
  }
  if (report.summary.removed > 0) {
    ui.print(`    ${ui.color('-', 'red')} Removed:  ${report.summary.removed}`);
  }
  if (report.summary.modified > 0) {
    ui.print(`    ${ui.color('~', 'yellow')} Modified: ${report.summary.modified}`);
  }
  ui.newLine();

  // Resource Details
  ui.section('Resources with Drift');

  for (const resource of report.resources) {
    ui.newLine();
    ui.print(`  ${formatDriftType(resource.driftType)} ${ui.bold(resource.resourceId)}`);
    ui.print(`    ${ui.dim('Type:')} ${resource.resourceType}`);
    if (resource.name) {
      ui.print(`    ${ui.dim('Name:')} ${resource.name}`);
    }

    if (resource.changes.length > 0) {
      ui.print(`    ${ui.dim('Changes:')}`);
      for (const change of resource.changes.slice(0, 5)) {
        const expected = change.expected !== undefined ? JSON.stringify(change.expected) : 'null';
        const actual = change.actual !== undefined ? JSON.stringify(change.actual) : 'null';
        ui.print(`      ${ui.dim(change.attribute)}: ${ui.color(expected, 'red')} -> ${ui.color(actual, 'green')}`);
      }
      if (resource.changes.length > 5) {
        ui.print(ui.dim(`      ... and ${resource.changes.length - 5} more changes`));
      }
    }
  }
}

/**
 * Display remediation result
 */
function displayRemediationResult(result: DriftRemediationResult): void {
  ui.newLine();
  ui.section('Remediation Result');

  const statusColor = result.success ? 'green' : 'red';
  ui.print(`  ${ui.dim('Status:')}   ${ui.color(result.success ? 'Success' : 'Failed', statusColor)}`);
  ui.print(`  ${ui.dim('Applied:')}  ${result.appliedCount}`);
  ui.print(`  ${ui.dim('Failed:')}   ${result.failedCount}`);
  ui.print(`  ${ui.dim('Skipped:')} ${result.skippedCount}`);
  ui.newLine();

  if (result.actions.length > 0) {
    ui.section('Actions Taken');

    for (const action of result.actions) {
      const icon = action.status === 'applied'
        ? ui.color('✓', 'green')
        : action.status === 'failed'
          ? ui.color('✗', 'red')
          : ui.color('○', 'dim');

      ui.print(`  ${icon} ${action.description}`);
      if (action.error) {
        ui.print(`    ${ui.color('Error:', 'red')} ${action.error}`);
      }
    }
  }

  if (result.report) {
    ui.newLine();
    ui.print(ui.dim('Full report:'));
    ui.print(result.report);
  }
}

// ==========================================
// Commands
// ==========================================

/**
 * Drift parent command
 */
export async function driftCommand(args: string[]): Promise<void> {
  if (args.length === 0) {
    ui.header('Nimbus Drift', 'Infrastructure drift detection and remediation');
    ui.newLine();
    ui.print('Usage: nimbus drift <command> [options]');
    ui.newLine();
    ui.print('Commands:');
    ui.print(`  ${ui.bold('detect')}  Detect infrastructure drift`);
    ui.print(`  ${ui.bold('fix')}     Fix detected drift`);
    ui.newLine();
    ui.print('Examples:');
    ui.print('  nimbus drift detect --provider terraform');
    ui.print('  nimbus drift detect kubernetes -d ./manifests');
    ui.print('  nimbus drift fix terraform --auto-approve');
    ui.print('  nimbus drift fix --dry-run');
    return;
  }

  const subcommand = args[0];
  const subArgs = args.slice(1);

  switch (subcommand) {
    case 'detect':
      await driftDetectCommand(parseDriftDetectOptions(subArgs));
      break;
    case 'fix':
      await driftFixCommand(parseDriftFixOptions(subArgs));
      break;
    default:
      ui.error(`Unknown drift command: ${subcommand}`);
      ui.info('Run "nimbus drift" for usage');
  }
}

/**
 * Detect drift command
 */
export async function driftDetectCommand(options: DriftDetectOptions): Promise<void> {
  const directory = options.directory || process.cwd();
  let provider = options.provider;

  ui.header('Nimbus Drift Detect', directory);

  // If no provider specified, try to detect or ask
  if (!provider) {
    const providerChoice = await select({
      message: 'Select infrastructure provider to check:',
      options: [
        { label: 'Terraform', value: 'terraform', description: 'Check Terraform state drift' },
        { label: 'Kubernetes', value: 'kubernetes', description: 'Check Kubernetes manifest drift' },
        { label: 'Helm', value: 'helm', description: 'Check Helm release drift' },
      ],
    });
    provider = providerChoice as DriftProvider;
  }

  ui.startSpinner({ message: `Detecting ${provider} drift...` });

  try {
    const client = new CoreEngineClient();
    const report = await client.detectDrift({
      provider,
      directory,
    });

    ui.stopSpinnerSuccess('Drift detection complete');

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    displayDriftReport(report);

    if (report.hasDrift) {
      ui.newLine();
      ui.info('Run "nimbus drift fix" to remediate detected drift');
    }
  } catch (error) {
    ui.stopSpinnerFail('Drift detection failed');
    ui.error((error as Error).message);
  }
}

/**
 * Fix drift command
 */
export async function driftFixCommand(options: DriftFixOptions): Promise<void> {
  const directory = options.directory || process.cwd();
  let provider = options.provider;

  ui.header('Nimbus Drift Fix', directory);

  // If no provider specified, ask
  if (!provider) {
    const providerChoice = await select({
      message: 'Select infrastructure provider to fix:',
      options: [
        { label: 'Terraform', value: 'terraform', description: 'Fix Terraform state drift' },
        { label: 'Kubernetes', value: 'kubernetes', description: 'Fix Kubernetes manifest drift' },
        { label: 'Helm', value: 'helm', description: 'Fix Helm release drift' },
      ],
    });
    provider = providerChoice as DriftProvider;
  }

  // First detect drift
  ui.startSpinner({ message: `Detecting ${provider} drift...` });

  let report: DriftReport;
  try {
    const client = new CoreEngineClient();
    report = await client.detectDrift({
      provider,
      directory,
    });
    ui.stopSpinnerSuccess('Drift detection complete');
  } catch (error) {
    ui.stopSpinnerFail('Drift detection failed');
    ui.error((error as Error).message);
    return;
  }

  if (!report.hasDrift) {
    ui.newLine();
    ui.success('No drift detected. Nothing to fix.');
    return;
  }

  // Show what will be fixed
  displayDriftReport(report);

  // Confirm before fixing (unless auto-approve or dry-run)
  if (!options.autoApprove && !options.dryRun) {
    ui.newLine();
    const proceed = await confirm({
      message: `Apply ${report.summary.total} remediation actions?`,
      defaultValue: false,
    });

    if (!proceed) {
      ui.info('Fix cancelled.');
      return;
    }
  }

  if (options.dryRun) {
    ui.newLine();
    ui.info('Dry run mode - no changes will be applied');
    ui.newLine();

    // Show what would be done
    ui.section('Actions that would be taken:');
    for (const resource of report.resources) {
      ui.print(`  ${formatDriftType(resource.driftType)} ${resource.resourceId}`);
      if (resource.driftType === 'added') {
        ui.print(`    ${ui.dim('Would be removed from actual state')}`);
      } else if (resource.driftType === 'removed') {
        ui.print(`    ${ui.dim('Would be recreated')}`);
      } else {
        ui.print(`    ${ui.dim('Would be updated to match desired state')}`);
      }
    }
    return;
  }

  // Apply fixes
  ui.startSpinner({ message: 'Applying remediation...' });

  try {
    const client = new CoreEngineClient();
    const result = await client.fixDrift({
      provider,
      directory,
      dryRun: false,
    });

    if (result.success) {
      ui.stopSpinnerSuccess('Remediation complete');
    } else {
      ui.stopSpinnerFail('Remediation partially failed');
    }

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    displayRemediationResult(result);
  } catch (error) {
    ui.stopSpinnerFail('Remediation failed');
    ui.error((error as Error).message);
  }
}
