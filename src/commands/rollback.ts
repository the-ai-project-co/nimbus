/**
 * nimbus rollback — Infrastructure Rollback Assistant
 *
 * Provides guided rollback for Helm releases and Kubernetes deployments.
 * For Terraform, explains the rollback approach via state management.
 *
 * G20: New command added to the gap fix plan.
 *
 * Usage:
 *   nimbus rollback --helm <release>
 *   nimbus rollback --helm <release> --namespace <ns>
 *   nimbus rollback --k8s <deployment>
 *   nimbus rollback --k8s <deployment> --namespace <ns>
 *   nimbus rollback --tf
 */

import { ui, confirm, select } from '../wizard';

/** Options for the rollback command. */
export interface RollbackOptions {
  /** Helm release name to roll back. */
  helm?: string;
  /** Kubernetes deployment name to roll back. */
  k8s?: string;
  /** Kubernetes namespace (used for both Helm and kubectl). */
  namespace?: string;
  /** Terraform rollback guidance (no automated rollback). */
  tf?: boolean;
  /** Explicit terraform state rollback via --terraform flag. */
  terraform?: boolean;
  /** Directory containing terraform files (default: cwd). */
  tfDir?: string;
}

/**
 * Run the nimbus rollback command.
 */
export async function rollbackCommand(options: RollbackOptions): Promise<void> {
  const { execFileSync } = await import('node:child_process');

  const run = (cmd: string, args: string[]): string => {
    return execFileSync(cmd, args, {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  };

  // Helm rollback
  if (options.helm) {
    await rollbackHelm(options.helm, options.namespace, run);
    return;
  }

  // Kubernetes deployment rollback
  if (options.k8s) {
    await rollbackK8s(options.k8s, options.namespace, run);
    return;
  }

  // Terraform state rollback (--terraform flag)
  if (options.terraform) {
    await rollbackTerraformState(options.tfDir ?? process.cwd(), run);
    return;
  }

  // Terraform guidance (--tf flag)
  if (options.tf) {
    rollbackTerraformGuidance();
    return;
  }

  ui.error('Specify a rollback target: --helm <release>, --k8s <deployment>, --tf, or --terraform');
  ui.print('Usage:');
  ui.print('  nimbus rollback --helm <release> [--namespace <ns>]');
  ui.print('  nimbus rollback --k8s <deployment> [--namespace <ns>]');
  ui.print('  nimbus rollback --tf');
  ui.print('  nimbus rollback --terraform [--tf-dir <path>]');
}

async function rollbackHelm(
  release: string,
  namespace: string | undefined,
  run: (cmd: string, args: string[]) => string
): Promise<void> {
  const nsArgs = namespace ? ['--namespace', namespace] : [];

  ui.info(`Fetching history for Helm release: ${release}`);

  let historyOutput: string;
  try {
    historyOutput = run('helm', ['history', release, '--output', 'table', ...nsArgs]);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    ui.error(`Failed to fetch Helm history: ${msg}`);
    return;
  }

  ui.newLine();
  ui.print(historyOutput);
  ui.newLine();

  // Parse revision numbers from history output
  const revisionLines = historyOutput
    .split('\n')
    .slice(1) // skip header
    .filter(line => /^\d+/.test(line.trim()));

  if (revisionLines.length === 0) {
    ui.warning('No revision history found.');
    return;
  }

  const revisionOptions = revisionLines.map(line => {
    const parts = line.trim().split(/\s+/);
    const rev = parts[0];
    const status = parts[2] ?? '';
    const description = parts.slice(4).join(' ') ?? '';
    return {
      value: rev,
      label: `Revision ${rev} — ${status} ${description}`.trim(),
    };
  });

  const selectedRevision = await select<string>({
    message: `Roll back ${release} to which revision?`,
    options: revisionOptions,
  });

  if (!selectedRevision) {
    ui.info('Rollback cancelled.');
    return;
  }

  const confirmed = await confirm({
    message: `Roll back ${release} to revision ${selectedRevision}? This will update the release.`,
    defaultValue: false,
  });

  if (!confirmed) {
    ui.info('Rollback cancelled.');
    return;
  }

  ui.startSpinner({ message: `Rolling back ${release} to revision ${selectedRevision}...` });
  try {
    run('helm', ['rollback', release, selectedRevision, ...nsArgs]);
    ui.stopSpinnerSuccess(`${release} rolled back to revision ${selectedRevision}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    ui.stopSpinnerFail(`Rollback failed: ${msg}`);
  }
}

async function rollbackK8s(
  deployment: string,
  namespace: string | undefined,
  run: (cmd: string, args: string[]) => string
): Promise<void> {
  const nsArgs = namespace ? ['-n', namespace] : [];
  const deployTarget = `deployment/${deployment}`;

  ui.info(`Fetching rollout history for ${deployTarget}`);

  let historyOutput: string;
  try {
    historyOutput = run('kubectl', ['rollout', 'history', deployTarget, ...nsArgs]);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    ui.error(`Failed to fetch rollout history: ${msg}`);
    return;
  }

  ui.newLine();
  ui.print(historyOutput);
  ui.newLine();

  const confirmed = await confirm({
    message: `Undo the last rollout for ${deployTarget}? This will revert to the previous revision.`,
    defaultValue: false,
  });

  if (!confirmed) {
    ui.info('Rollback cancelled.');
    return;
  }

  ui.startSpinner({ message: `Rolling back ${deployTarget}...` });
  try {
    run('kubectl', ['rollout', 'undo', deployTarget, ...nsArgs]);
    ui.stopSpinnerSuccess(`${deployTarget} rolled back`);
    // Show status
    const status = run('kubectl', ['rollout', 'status', deployTarget, ...nsArgs]);
    ui.print(status);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    ui.stopSpinnerFail(`Rollback failed: ${msg}`);
  }
}

async function rollbackTerraformState(
  dir: string,
  run: (cmd: string, args: string[]) => string
): Promise<void> {
  const { existsSync, readdirSync } = await import('node:fs');

  // Detect if terraform directory exists (look for *.tf files)
  let hasTfFiles = false;
  try {
    hasTfFiles = existsSync(dir) && readdirSync(dir).some(f => f.endsWith('.tf'));
  } catch {
    /* ignore */
  }

  if (!hasTfFiles) {
    ui.warning(`No *.tf files found in ${dir}. Is this a Terraform directory?`);
    ui.dim('Use --tf-dir <path> to specify a different directory.');
    return;
  }

  // Show current workspace
  let currentWorkspace = 'default';
  try {
    currentWorkspace = run('terraform', ['workspace', 'show']).trim();
    ui.info(`Current Terraform workspace: ${currentWorkspace}`);
  } catch {
    ui.dim('Could not determine current workspace (terraform not in PATH?)');
  }

  ui.newLine();

  // Show state list
  let stateList = '';
  try {
    stateList = run('terraform', ['state', 'list']).trim();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ui.warning(`Could not list terraform state: ${msg}`);
  }

  if (stateList) {
    ui.info('Current state resources:');
    for (const line of stateList.split('\n').slice(0, 20)) {
      ui.print(`  ${line}`);
    }
    const total = stateList.split('\n').length;
    if (total > 20) ui.dim(`  ... and ${total - 20} more`);
    ui.newLine();
  }

  // Rollback guidance specific to state
  ui.box({
    title: `Terraform State Rollback — workspace: ${currentWorkspace}`,
    content: [
      '',
      'To roll back Terraform state in workspace "' + currentWorkspace + '":',
      '',
      '1. Pull current state:',
      '     terraform state pull > state-backup.tfstate',
      '',
      '2. Push a previous state backup:',
      '     terraform state push <backup>.tfstate',
      '',
      '3. Or revert IaC code and re-apply:',
      '     git checkout <commit> -- *.tf',
      '     terraform plan && terraform apply',
      '',
      '4. For targeted resource rollback:',
      '     terraform apply -target=<resource>',
      '',
      'Run `nimbus chat` for AI-assisted rollback guidance.',
      '',
    ],
    style: 'rounded',
    borderColor: 'yellow',
    padding: 0,
  });
  ui.newLine();
}

function rollbackTerraformGuidance(): void {
  ui.newLine();
  ui.box({
    title: 'Terraform Rollback Guidance',
    content: [
      '',
      'Terraform does not have a built-in rollback command.',
      'To restore previous infrastructure state, use one of these approaches:',
      '',
      '1. Revert IaC code to a previous git commit:',
      '     git checkout <commit> -- *.tf',
      '     terraform plan && terraform apply',
      '',
      '2. Restore state from a backup:',
      '     terraform state pull > current.tfstate',
      '     terraform state push <backup>.tfstate',
      '',
      '3. Use workspace-specific state:',
      '     terraform workspace select <env>',
      '     terraform state list',
      '',
      '4. Target a specific resource for rollback:',
      '     terraform apply -target=<resource>',
      '',
      'Run `nimbus chat` to get AI-assisted rollback guidance.',
      '',
    ],
    style: 'rounded',
    borderColor: 'yellow',
    padding: 0,
  });
  ui.newLine();
}

export default rollbackCommand;
