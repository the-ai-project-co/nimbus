/**
 * Drift Commands
 *
 * Commands for detecting and fixing infrastructure drift
 */

import { ui } from '../../wizard/ui';
import { select, confirm } from '../../wizard/prompts';
import type { DriftReport, DriftRemediationResult, DriftProvider } from '../../types';

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
function _formatSeverity(severity: 'critical' | 'high' | 'medium' | 'low'): string {
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
  ui.print(
    `  ${ui.dim('Has drift:')}   ${report.hasDrift ? ui.color('Yes', 'yellow') : ui.color('No', 'green')}`
  );
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
        ui.print(
          `      ${ui.dim(change.attribute)}: ${ui.color(expected, 'red')} -> ${ui.color(actual, 'green')}`
        );
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
  ui.print(
    `  ${ui.dim('Status:')}   ${ui.color(result.success ? 'Success' : 'Failed', statusColor)}`
  );
  ui.print(`  ${ui.dim('Applied:')}  ${result.appliedCount}`);
  ui.print(`  ${ui.dim('Failed:')}   ${result.failedCount}`);
  ui.print(`  ${ui.dim('Skipped:')} ${result.skippedCount}`);
  ui.newLine();

  if (result.actions.length > 0) {
    ui.section('Actions Taken');

    for (const action of result.actions) {
      const icon =
        action.status === 'applied'
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
 * Detect drift directly using CLI tools (no CoreEngineClient).
 * For terraform: uses terraform plan -detailed-exitcode.
 * For kubernetes/helm: returns a minimal "no API" report.
 */
async function detectDriftDirect(provider: DriftProvider, directory: string): Promise<DriftReport> {
  const { execFileSync } = await import('child_process');

  if (provider === 'terraform') {
    try {
      execFileSync('terraform', ['plan', '-no-color', '-detailed-exitcode'], {
        cwd: directory,
        encoding: 'utf-8',
        timeout: 120_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // exit 0 = no drift
      return { hasDrift: false, provider, directory, detectedAt: new Date().toISOString(), resources: [], summary: { total: 0, added: 0, removed: 0, modified: 0, bySeverity: {} } };
    } catch (e: any) {
      if (e.status === 2) {
        // exit 2 = changes present
        const planOutput: string = e.stdout ?? '';
        const planLine = planOutput.split('\n').find((l: string) => l.startsWith('Plan:')) ?? 'Changes detected';
        return {
          hasDrift: true,
          provider,
          directory,
          detectedAt: new Date().toISOString(),
          resources: [{ resourceId: planLine.trim(), resourceType: 'terraform', driftType: 'modified', severity: 'medium', changes: [] }],
          summary: { total: 1, added: 0, removed: 0, modified: 1, bySeverity: { medium: 1 } },
        };
      }
      throw new Error(`terraform plan failed: ${String(e.message ?? e).slice(0, 200)}`);
    }
  }

  if (provider === 'kubernetes') {
    try {
      const out = execFileSync('kubectl', ['diff', '-R', '-f', directory], {
        encoding: 'utf-8', timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'],
      });
      const hasDiff = out.trim().length > 0;
      return { hasDrift: hasDiff, provider, directory, detectedAt: new Date().toISOString(), resources: [], summary: { total: hasDiff ? 1 : 0, added: 0, removed: 0, modified: hasDiff ? 1 : 0, bySeverity: {} } };
    } catch (e: any) {
      // kubectl diff exits 1 when there are differences
      if (e.status === 1) {
        return { hasDrift: true, provider, directory, detectedAt: new Date().toISOString(), resources: [], summary: { total: 1, added: 0, removed: 0, modified: 1, bySeverity: { medium: 1 } } };
      }
      throw new Error(`kubectl diff failed: ${String(e.message ?? e).slice(0, 200)}`);
    }
  }

  if (provider === 'helm') {
    try {
      const out = execFileSync('helm', ['list', '--all-namespaces', '--output', 'json'], {
        encoding: 'utf-8', timeout: 15_000, stdio: ['pipe', 'pipe', 'pipe'],
      });
      const releases: Array<{ status: string; name: string }> = JSON.parse(out || '[]');
      const drifted = releases.filter(r => r.status !== 'deployed');
      return {
        hasDrift: drifted.length > 0,
        provider,
        directory,
        detectedAt: new Date().toISOString(),
        resources: drifted.map(r => ({ resourceId: r.name, resourceType: 'helm', driftType: 'modified' as const, severity: 'medium' as const, changes: [{ attribute: 'status', expected: 'deployed', actual: r.status }] })),
        summary: { total: drifted.length, added: 0, removed: 0, modified: drifted.length, bySeverity: { medium: drifted.length } },
      };
    } catch (e: any) {
      throw new Error(`helm list failed: ${String(e.message ?? e).slice(0, 200)}`);
    }
  }

  throw new Error(`Unknown provider: ${provider}`);
}

/**
 * Fix drift directly using CLI tools (no CoreEngineClient).
 * For terraform: runs terraform apply -auto-approve.
 * For kubernetes: runs kubectl apply -f <dir>.
 * For helm: no automated fix; returns guidance.
 */
async function fixDriftDirect(provider: DriftProvider, directory: string): Promise<DriftRemediationResult> {
  const { execFileSync } = await import('child_process');

  if (provider === 'terraform') {
    try {
      const output = execFileSync('terraform', ['apply', '-auto-approve', '-no-color'], {
        cwd: directory,
        encoding: 'utf-8',
        timeout: 300_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { success: true, appliedCount: 1, failedCount: 0, skippedCount: 0, actions: [{ id: '1', type: 'apply' as const, resourceId: directory, description: 'terraform apply', status: 'applied' as const }], report: output.slice(0, 500) };
    } catch (e: any) {
      return { success: false, appliedCount: 0, failedCount: 1, skippedCount: 0, actions: [{ id: '1', type: 'apply' as const, resourceId: directory, description: 'terraform apply', status: 'failed' as const, error: String(e.message ?? e).slice(0, 200) }] };
    }
  }

  if (provider === 'kubernetes') {
    try {
      const output = execFileSync('kubectl', ['apply', '-R', '-f', directory], {
        encoding: 'utf-8', timeout: 60_000, stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { success: true, appliedCount: 1, failedCount: 0, skippedCount: 0, actions: [{ id: '1', type: 'apply' as const, resourceId: directory, description: 'kubectl apply', status: 'applied' as const }], report: output.slice(0, 500) };
    } catch (e: any) {
      return { success: false, appliedCount: 0, failedCount: 1, skippedCount: 0, actions: [{ id: '1', type: 'apply' as const, resourceId: directory, description: 'kubectl apply', status: 'failed' as const, error: String(e.message ?? e).slice(0, 200) }] };
    }
  }

  // Helm: no automated fix
  return { success: false, appliedCount: 0, failedCount: 0, skippedCount: 1, actions: [{ id: '1', type: 'manual' as const, resourceId: directory, description: 'helm fix', status: 'skipped' as const, error: 'Helm drift fix requires manual intervention. Run "helm upgrade <release> <chart>" to remediate.' }] };
}

/**
 * H3: Direct drift scan — runs terraform plan -detailed-exitcode in all
 * subdirectories that contain Terraform configs, without needing CoreEngineClient.
 */
export async function driftScanCommand(opts: { workdir?: string; format?: 'table' | 'json' } = {}): Promise<void> {
  const { execFileSync } = await import('child_process');
  const fsSync = await import('fs');
  const pathMod = await import('path');

  const rootDir = pathMod.resolve(opts.workdir ?? process.cwd());

  interface ScanResult {
    directory: string;
    status: 'clean' | 'drift' | 'error';
    summary: string;
  }

  // Find terraform directories up to depth 3
  const tfDirs: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > 3) return;
    try {
      if (fsSync.existsSync(pathMod.join(dir, '.terraform')) || fsSync.readdirSync(dir).some(f => f.endsWith('.tf'))) {
        tfDirs.push(dir);
      }
      for (const entry of fsSync.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(pathMod.join(dir, entry.name), depth + 1);
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  walk(rootDir, 0);

  if (tfDirs.length === 0) {
    ui.info('No Terraform directories found.');
    return;
  }

  ui.header('Terraform Drift Scan');
  const results: ScanResult[] = [];

  for (const dir of tfDirs) {
    const relDir = pathMod.relative(rootDir, dir) || '.';
    try {
      execFileSync('terraform', ['plan', '-no-color', '-detailed-exitcode'], {
        cwd: dir,
        encoding: 'utf-8',
        timeout: 120_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // exit 0 = no changes
      results.push({ directory: relDir, status: 'clean', summary: 'No changes' });
    } catch (e: any) {
      if (e.status === 2) {
        // exit 2 = changes present
        const planOutput: string = e.stdout ?? '';
        const planLine = planOutput.split('\n').find((l: string) => l.startsWith('Plan:')) ?? 'Changes detected';
        results.push({ directory: relDir, status: 'drift', summary: planLine.trim() });
      } else {
        results.push({ directory: relDir, status: 'error', summary: String(e.message ?? 'error').slice(0, 80) });
      }
    }
  }

  if (opts.format === 'json') {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Print table
  const COL = { dir: 40, status: 8, summary: 60 };
  const pad = (s: string, n: number) => s.slice(0, n).padEnd(n);
  const divider = `${'-'.repeat(COL.dir + 2)}+${'-'.repeat(COL.status + 2)}+${'-'.repeat(COL.summary + 2)}`;
  console.log(divider);
  console.log(`| ${pad('Directory', COL.dir)} | ${pad('Status', COL.status)} | ${pad('Summary', COL.summary)} |`);
  console.log(divider);
  for (const r of results) {
    console.log(`| ${pad(r.directory, COL.dir)} | ${pad(r.status, COL.status)} | ${pad(r.summary, COL.summary)} |`);
  }
  console.log(divider);
}

// ==========================================
// K8s Drift Detection (H3)
// ==========================================

export interface K8sDriftOptions {
  /** Update baseline with current resource counts. */
  updateBaseline?: boolean;
  /** Output format. */
  format?: 'table' | 'json';
}

/** Stored baseline: map of namespace → resource count. */
interface K8sBaseline {
  capturedAt: string;
  namespaceCounts: Record<string, number>;
}

/**
 * H3: Check ConfigMap/Secret drift versus a stored baseline.
 * Runs `kubectl get configmap,secret -A` to get current counts per namespace,
 * compares against ~/.nimbus/drift-baseline.json, and reports new/missing resources.
 */
export async function checkK8sDrift(opts: K8sDriftOptions = {}): Promise<void> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import('fs');
  const { join } = await import('path');
  const { homedir } = await import('os');
  const execFileAsync = promisify(execFile);

  const baselinePath = join(homedir(), '.nimbus', 'drift-baseline.json');

  // Get current resource counts per namespace
  let rawOutput = '';
  try {
    const { stdout } = await execFileAsync('kubectl', [
      'get', 'configmap,secret', '-A', '--no-headers', '-o',
      'custom-columns=NAMESPACE:.metadata.namespace,NAME:.metadata.name',
    ], { timeout: 15000 });
    rawOutput = stdout;
  } catch {
    ui.error('kubectl not available or cluster unreachable.');
    return;
  }

  const lines = rawOutput.trim().split('\n').filter(Boolean);
  const namespaceCounts: Record<string, number> = {};
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const ns = parts[0] ?? 'default';
    namespaceCounts[ns] = (namespaceCounts[ns] ?? 0) + 1;
  }

  if (opts.updateBaseline) {
    const baseline: K8sBaseline = { capturedAt: new Date().toISOString(), namespaceCounts };
    mkdirSync(join(homedir(), '.nimbus'), { recursive: true });
    writeFileSync(baselinePath, JSON.stringify(baseline, null, 2), 'utf-8');
    ui.success(`Baseline saved: ${Object.keys(namespaceCounts).length} namespaces, ${lines.length} resources total.`);
    return;
  }

  // Load baseline
  if (!existsSync(baselinePath)) {
    ui.warning('No K8s drift baseline found. Run with --update-baseline to capture current state.');
    ui.newLine();
    ui.print(`Current state: ${lines.length} ConfigMaps/Secrets across ${Object.keys(namespaceCounts).length} namespaces.`);
    return;
  }

  let baseline: K8sBaseline;
  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf-8')) as K8sBaseline;
  } catch {
    ui.error('Failed to parse drift baseline file. Re-capture with --update-baseline.');
    return;
  }

  // Compare counts
  const driftEntries: Array<{ namespace: string; baseline: number; current: number; delta: number }> = [];
  const allNamespaces = new Set([...Object.keys(baseline.namespaceCounts), ...Object.keys(namespaceCounts)]);

  for (const ns of allNamespaces) {
    const baseCount = baseline.namespaceCounts[ns] ?? 0;
    const currCount = namespaceCounts[ns] ?? 0;
    if (baseCount !== currCount) {
      driftEntries.push({ namespace: ns, baseline: baseCount, current: currCount, delta: currCount - baseCount });
    }
  }

  if (opts.format === 'json') {
    console.log(JSON.stringify({ capturedAt: baseline.capturedAt, drift: driftEntries }, null, 2));
    return;
  }

  ui.header('K8s ConfigMap/Secret Drift');
  ui.print(`  Baseline captured: ${new Date(baseline.capturedAt).toLocaleString()}`);
  ui.newLine();

  if (driftEntries.length === 0) {
    ui.success('No drift detected — ConfigMap/Secret counts match baseline.');
    return;
  }

  ui.warning(`${driftEntries.length} namespace(s) have drifted from baseline:`);
  ui.newLine();
  for (const entry of driftEntries) {
    const sign = entry.delta > 0 ? '+' : '';
    const color = entry.delta > 0 ? 'yellow' : 'red';
    ui.print(`  ${ui.bold(entry.namespace.padEnd(30))} baseline: ${String(entry.baseline).padStart(4)}  current: ${String(entry.current).padStart(4)}  delta: ${ui.color(sign + entry.delta, color)}`);
  }
  ui.newLine();
  ui.print(ui.dim('Run "nimbus drift k8s --update-baseline" to update the baseline.'));
}

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
    ui.print(`  ${ui.bold('scan')}    Direct terraform drift scan (no service dependency)`);
    ui.print(`  ${ui.bold('k8s')}     K8s ConfigMap/Secret drift vs baseline`);
    ui.print(`  ${ui.bold('detect')}  Detect infrastructure drift`);
    ui.print(`  ${ui.bold('fix')}     Fix detected drift`);
    ui.newLine();
    ui.print('Examples:');
    ui.print('  nimbus drift scan');
    ui.print('  nimbus drift scan --format json');
    ui.print('  nimbus drift k8s');
    ui.print('  nimbus drift k8s --update-baseline');
    ui.print('  nimbus drift detect --provider terraform');
    ui.print('  nimbus drift detect kubernetes -d ./manifests');
    ui.print('  nimbus drift fix terraform --auto-approve');
    ui.print('  nimbus drift fix --dry-run');
    return;
  }

  const subcommand = args[0];
  const subArgs = args.slice(1);

  switch (subcommand) {
    case 'scan': {
      const format = subArgs.includes('--json') ? 'json' : 'table';
      const workdirIdx = subArgs.indexOf('--workdir');
      const workdir = workdirIdx !== -1 ? subArgs[workdirIdx + 1] : undefined;
      await driftScanCommand({ workdir, format });
      break;
    }
    case 'k8s': {
      const updateBaseline = subArgs.includes('--update-baseline');
      const format = subArgs.includes('--json') ? 'json' : 'table';
      await checkK8sDrift({ updateBaseline, format });
      break;
    }
    case 'detect':
      await driftDetectCommand(parseDriftDetectOptions(subArgs));
      break;
    case 'fix':
      await driftFixCommand(parseDriftFixOptions(subArgs), subArgs);
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
        {
          label: 'Kubernetes',
          value: 'kubernetes',
          description: 'Check Kubernetes manifest drift',
        },
        { label: 'Helm', value: 'helm', description: 'Check Helm release drift' },
      ],
    });
    provider = providerChoice as DriftProvider;
  }

  ui.startSpinner({ message: `Detecting ${provider} drift...` });

  try {
    const report = await detectDriftDirect(provider, directory);
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
export async function driftFixCommand(options: DriftFixOptions, args: string[] = []): Promise<void> {
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
    report = await detectDriftDirect(provider, directory);
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

  let driftReport: DriftReport | undefined;
  try {
    const result = await fixDriftDirect(provider, directory);

    driftReport = report;

    if (result.success) {
      ui.stopSpinnerSuccess('Remediation complete');
    } else {
      ui.stopSpinnerFail('Remediation partially failed');
    }

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      displayRemediationResult(result);
    }
  } catch (error) {
    ui.stopSpinnerFail('Remediation failed');
    ui.error((error as Error).message);
  }

  // GAP-23: --notify support for Slack/email
  const notifyFlag = args.find((a: string) => a.startsWith('--notify='))?.split('=')[1]
    ?? (args.includes('--notify') ? args[args.indexOf('--notify') + 1] : undefined);

  if (notifyFlag === 'slack') {
    const webhookUrl = process.env.NIMBUS_SLACK_WEBHOOK;
    if (!webhookUrl) {
      ui.warning('Set NIMBUS_SLACK_WEBHOOK env var to enable Slack notifications');
    } else {
      try {
        const summary = driftReport ? JSON.stringify(driftReport).slice(0, 2000) : 'Drift check completed';
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `*Nimbus Drift Report*\n${summary}` }),
        });
        ui.success('Slack notification sent');
      } catch (e) {
        ui.warning(`Slack notification failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } else if (notifyFlag === 'email') {
    // Generate curl command for email via SMTP relay / webhook
    ui.print('To send drift report via email, run:');
    ui.print(`  curl -X POST https://api.mailersend.com/v1/email \\
    -H "Authorization: Bearer $MAILERSEND_API_KEY" \\
    -H "Content-Type: application/json" \\
    -d '{"from":{"email":"nimbus@yourdomain.com"},"to":[{"email":"team@yourdomain.com"}],"subject":"Nimbus Drift Report","text":"${JSON.stringify(driftReport ?? 'completed').slice(0, 500)}"}'`);
  }
}
