/**
 * Apply Helm Command
 *
 * Install or upgrade Helm releases
 *
 * Usage: nimbus apply helm <release> <chart> [options]
 */

import { logger } from '../../utils';
import { ui, confirm, input } from '../../wizard';
import { helmClient } from '../../clients';
import {
  loadSafetyPolicy,
  evaluateSafety,
  type SafetyContext,
  type SafetyCheckResult,
} from '../../config/safety-policy';
import { promptForApproval, displaySafetySummary } from '../../wizard/approval';

/**
 * Command options
 */
export interface ApplyHelmOptions {
  releaseName?: string;
  chart?: string;
  namespace?: string;
  dryRun?: boolean;
  wait?: boolean;
  timeout?: string;
  values?: string;
  valuesFiles?: string[];
  set?: Record<string, string>;
  version?: string;
  createNamespace?: boolean;
  install?: boolean;
  atomic?: boolean;
  force?: boolean;
  /** Skip safety checks */
  skipSafety?: boolean;
  /** Environment name (for safety policy) */
  environment?: string;
}

/**
 * Run helm install/upgrade command
 */
export async function applyHelmCommand(options: ApplyHelmOptions = {}): Promise<void> {
  logger.info('Running helm apply', { options });

  // Validate required options
  let releaseName = options.releaseName;
  let chart = options.chart;

  if (!releaseName) {
    releaseName = await input({
      message: 'Release name:',
      validate: value => {
        if (!value) {
          return 'Release name is required';
        }
        return true;
      },
    });

    if (!releaseName) {
      ui.error('Release name is required');
      process.exit(1);
    }
  }

  if (!chart) {
    chart = await input({
      message: 'Chart (path or name):',
      defaultValue: '.',
      validate: value => {
        if (!value) {
          return 'Chart is required';
        }
        return true;
      },
    });

    if (!chart) {
      ui.error('Chart is required');
      process.exit(1);
    }
  }

  ui.header('Helm Apply');
  ui.info(`Release: ${releaseName}`);
  ui.info(`Chart: ${chart}`);
  if (options.namespace) {
    ui.info(`Namespace: ${options.namespace}`);
  }
  ui.newLine();

  // Check if helm client is available
  const clientAvailable = await helmClient.isAvailable();

  if (clientAvailable) {
    // Use Helm tools service
    await applyWithService(releaseName, chart, options);
  } else {
    // Fall back to local helm CLI
    await applyWithLocalCLI(releaseName, chart, options);
  }
}

/**
 * Apply using Helm Tools Service
 */
async function applyWithService(
  releaseName: string,
  chart: string,
  options: ApplyHelmOptions
): Promise<void> {
  // Check if release already exists
  ui.startSpinner({ message: 'Checking existing releases...' });

  const listResult = await helmClient.list({
    namespace: options.namespace,
  });

  const existingRelease = listResult.releases.find(r => r.name === releaseName);
  ui.stopSpinnerSuccess('');

  const isUpgrade = !!existingRelease;

  if (isUpgrade) {
    ui.info(`Upgrading existing release (revision ${existingRelease.revision})`);
  } else {
    ui.info('Installing new release');
  }
  ui.newLine();

  // Dry run mode
  if (options.dryRun) {
    ui.startSpinner({ message: 'Running dry-run...' });

    if (isUpgrade) {
      const result = await helmClient.upgrade(releaseName, chart, {
        namespace: options.namespace,
        valuesFile: options.values,
        version: options.version,
        dryRun: true,
      });

      ui.stopSpinnerSuccess('Dry-run complete');

      if (!result.success) {
        ui.error(result.error || 'Unknown error');
        process.exit(1);
      }

      if (result.output) {
        ui.newLine();
        ui.print(result.output);
      }
    } else {
      const result = await helmClient.install(releaseName, chart, {
        namespace: options.namespace,
        valuesFile: options.values,
        version: options.version,
        createNamespace: options.createNamespace,
        dryRun: true,
      });

      ui.stopSpinnerSuccess('Dry-run complete');

      if (!result.success) {
        ui.error(result.error || 'Unknown error');
        process.exit(1);
      }

      if (result.output) {
        ui.newLine();
        ui.print(result.output);
      }
    }

    ui.newLine();
    ui.info('No changes applied (dry-run mode)');
    return;
  }

  // Run safety checks if not skipped
  if (!options.skipSafety) {
    const operation = isUpgrade ? 'upgrade' : 'install';
    const safetyResult = await runHelmSafetyChecks(operation, releaseName, chart, options);

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
      const approvalResult = await promptForApproval({
        title: `Helm ${isUpgrade ? 'Upgrade' : 'Install'}`,
        operation: `helm ${operation}`,
        risks: safetyResult.risks,
        environment: options.environment,
        affectedResources: [`${releaseName} (${chart})`],
      });

      if (!approvalResult.approved) {
        ui.newLine();
        ui.info(`Apply cancelled: ${approvalResult.reason || 'User declined'}`);
        return;
      }
    } else {
      // Show safety summary and simple confirm
      displaySafetySummary({
        operation: `helm ${operation}`,
        risks: safetyResult.risks,
        passed: safetyResult.passed,
      });

      ui.newLine();
      const proceed = await confirm({
        message: isUpgrade
          ? `Upgrade release '${releaseName}'?`
          : `Install release '${releaseName}'?`,
        defaultValue: true,
      });

      if (!proceed) {
        ui.info('Apply cancelled');
        return;
      }
    }
  } else {
    // Simple confirmation when safety is skipped
    const proceed = await confirm({
      message: isUpgrade
        ? `Upgrade release '${releaseName}'?`
        : `Install release '${releaseName}'?`,
      defaultValue: true,
    });

    if (!proceed) {
      ui.info('Apply cancelled');
      return;
    }
  }

  // Install or upgrade
  ui.newLine();
  ui.startSpinner({
    message: isUpgrade ? 'Upgrading release...' : 'Installing release...',
  });

  let result;

  if (isUpgrade) {
    result = await helmClient.upgrade(releaseName, chart, {
      namespace: options.namespace,
      valuesFile: options.values,
      version: options.version,
      wait: options.wait,
      timeout: options.timeout,
    });
  } else {
    result = await helmClient.install(releaseName, chart, {
      namespace: options.namespace,
      valuesFile: options.values,
      version: options.version,
      createNamespace: options.createNamespace ?? true,
      wait: options.wait,
      timeout: options.timeout,
    });
  }

  if (!result.success) {
    ui.stopSpinnerFail(isUpgrade ? 'Upgrade failed' : 'Installation failed');
    ui.error(result.error || 'Unknown error');
    process.exit(1);
  }

  ui.stopSpinnerSuccess(isUpgrade ? 'Upgrade complete!' : 'Installation complete!');

  // Track successful helm apply
  try {
    const { trackGeneration } = await import('../../telemetry');
    trackGeneration('helm-apply', ['helm']);
  } catch {
    /* telemetry failure is non-critical */
  }

  // Display release info
  ui.newLine();
  ui.print('Release Info:');
  ui.print(`  Name:      ${result.release.name}`);
  ui.print(`  Namespace: ${result.release.namespace}`);
  ui.print(`  Revision:  ${result.release.revision}`);
  ui.print(`  Status:    ${result.release.status}`);
  ui.print(`  Chart:     ${result.release.chart}`);

  if (result.output) {
    ui.newLine();
    ui.print('Notes:');
    ui.print(result.output);
  }
}

/**
 * Apply using local helm CLI
 */
async function applyWithLocalCLI(
  releaseName: string,
  chart: string,
  options: ApplyHelmOptions
): Promise<void> {
  const { spawn, execFileSync } = await import('child_process');

  // Check if release exists (use execFileSync with args array to prevent shell injection)
  let isUpgrade = false;
  try {
    const statusArgs = ['status', releaseName];
    if (options.namespace) {
      statusArgs.push('-n', options.namespace);
    }
    execFileSync('helm', statusArgs, { stdio: 'pipe' });
    isUpgrade = true;
    ui.info('Upgrading existing release');
  } catch {
    ui.info('Installing new release');
  }
  ui.newLine();

  // Build helm command
  const command = isUpgrade ? 'upgrade' : 'install';
  const args = [command, releaseName, chart];

  if (options.namespace) {
    args.push('-n', options.namespace);
  }

  if (options.values) {
    args.push('-f', options.values);
  }

  if (options.valuesFiles) {
    for (const vf of options.valuesFiles) {
      args.push('-f', vf);
    }
  }

  if (options.set) {
    for (const [key, value] of Object.entries(options.set)) {
      args.push('--set', `${key}=${value}`);
    }
  }

  if (options.version) {
    args.push('--version', options.version);
  }

  if (!isUpgrade && (options.createNamespace ?? true)) {
    args.push('--create-namespace');
  }

  if (options.wait) {
    args.push('--wait');
  }

  if (options.timeout) {
    args.push('--timeout', options.timeout);
  }

  if (options.dryRun) {
    args.push('--dry-run');
  }

  if (options.atomic) {
    args.push('--atomic');
  }

  if (options.force) {
    args.push('--force');
  }

  // For upgrade, always use --install flag
  if (isUpgrade) {
    args.push('--install');
  }

  // Redact sensitive values from --set flags before logging
  const redactedArgs = [...args];
  for (let i = 0; i < redactedArgs.length; i++) {
    if (
      (redactedArgs[i] === '--set' ||
        redactedArgs[i] === '--set-string' ||
        redactedArgs[i] === '--set-file') &&
      redactedArgs[i + 1]
    ) {
      const raw = redactedArgs[i + 1];
      const eq = raw.indexOf('=');
      redactedArgs[i + 1] = eq >= 0 ? `${raw.slice(0, eq + 1)}<REDACTED>` : '<REDACTED>';
    }
  }
  ui.info(`Running: helm ${redactedArgs.join(' ')}`);
  ui.newLine();

  // Run helm
  return new Promise((resolve, _reject) => {
    const proc = spawn('helm', args, {
      stdio: 'inherit',
    });

    proc.on('error', error => {
      ui.error(`Failed to run helm: ${error.message}`);
      ui.info('Make sure helm is installed and in your PATH');
      process.exit(1);
    });

    proc.on('close', code => {
      if (code === 0) {
        ui.newLine();
        ui.success(`Helm ${isUpgrade ? 'upgrade' : 'install'} completed successfully`);

        // Track successful helm apply
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { trackGeneration } = require('../../telemetry');
          trackGeneration('helm-apply', ['helm']);
        } catch {
          /* telemetry failure is non-critical */
        }

        resolve();
      } else {
        ui.newLine();
        ui.error(`Helm ${isUpgrade ? 'upgrade' : 'install'} failed with exit code ${code}`);
        process.exit(code || 1);
      }
    });
  });
}

/**
 * Run safety checks for the operation
 */
async function runHelmSafetyChecks(
  operation: string,
  releaseName: string,
  chart: string,
  options: ApplyHelmOptions
): Promise<SafetyCheckResult> {
  const policy = loadSafetyPolicy();

  const context: SafetyContext = {
    operation,
    type: 'helm',
    environment: options.environment,
    resources: [`${releaseName}:${chart}`],
    metadata: {
      releaseName,
      chart,
      namespace: options.namespace,
      version: options.version,
    },
  };

  return evaluateSafety(context, policy);
}

// Export as default
export default applyHelmCommand;
