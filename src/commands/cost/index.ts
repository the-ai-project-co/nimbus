/**
 * Cost Commands
 *
 * Commands for infrastructure cost estimation and tracking
 */

import { ui } from '../../wizard/ui';
import { select } from '../../wizard/prompts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { CostEstimator } from './estimator';

// ==========================================
// Types
// ==========================================

export interface CostEstimateOptions {
  /** Directory containing Terraform/infrastructure code */
  directory?: string;
  /** Output format */
  format?: 'table' | 'json' | 'html';
  /** Show detailed breakdown */
  detailed?: boolean;
  /** Compare with baseline */
  compare?: string;
}

export interface CostHistoryOptions {
  /** Number of days to show */
  days?: number;
  /** Group by resource, service, or tag */
  groupBy?: 'resource' | 'service' | 'tag';
  /** Cloud provider */
  provider?: 'aws' | 'gcp' | 'azure';
  /** Output format */
  format?: 'table' | 'json';
}

export interface CostResource {
  name: string;
  resourceType: string;
  monthlyQuantity?: number;
  unit?: string;
  monthlyCost: number;
  hourlyCost?: number;
}

export interface CostEstimate {
  version: string;
  currency: string;
  projects: {
    name: string;
    metadata: Record<string, string>;
    pastTotalMonthlyCost: number;
    pastTotalHourlyCost: number;
    diffTotalMonthlyCost: number;
    diffTotalHourlyCost: number;
    totalMonthlyCost: number;
    totalHourlyCost: number;
    resources: CostResource[];
  }[];
  totalMonthlyCost: number;
  totalHourlyCost: number;
  diffTotalMonthlyCost: number;
  timeGenerated: string;
  summary: {
    totalDetectedResources: number;
    totalSupportedResources: number;
    totalUnsupportedResources: number;
    totalUsageBasedResources: number;
    totalNoPriceResources: number;
    unsupportedResourceCounts: Record<string, number>;
    noPriceResourceCounts: Record<string, number>;
  };
}

export interface CostHistoryEntry {
  date: string;
  service: string;
  resource?: string;
  cost: number;
  change?: number;
  tags?: Record<string, string>;
}

// ==========================================
// Parsers
// ==========================================

/**
 * Parse cost estimate options
 */
export function parseCostEstimateOptions(args: string[]): CostEstimateOptions {
  const options: CostEstimateOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--directory' && args[i + 1]) {
      options.directory = args[++i];
    } else if (arg === '-d' && args[i + 1]) {
      options.directory = args[++i];
    } else if (arg === '--format' && args[i + 1]) {
      options.format = args[++i] as 'table' | 'json' | 'html';
    } else if (arg === '--detailed') {
      options.detailed = true;
    } else if (arg === '--compare' && args[i + 1]) {
      options.compare = args[++i];
    } else if (!arg.startsWith('-') && !options.directory) {
      options.directory = arg;
    }
  }

  return options;
}

/**
 * Parse cost history options
 */
export function parseCostHistoryOptions(args: string[]): CostHistoryOptions {
  const options: CostHistoryOptions = {
    days: 30,
    groupBy: 'service',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--days' && args[i + 1]) {
      options.days = parseInt(args[++i], 10);
    } else if (arg === '--group-by' && args[i + 1]) {
      options.groupBy = args[++i] as 'resource' | 'service' | 'tag';
    } else if (arg === '--provider' && args[i + 1]) {
      options.provider = args[++i] as 'aws' | 'gcp' | 'azure';
    } else if (arg === '--format' && args[i + 1]) {
      options.format = args[++i] as 'table' | 'json';
    }
  }

  return options;
}

// ==========================================
// Helpers
// ==========================================

/**
 * Check if infracost is installed
 */
function checkInfracost(): boolean {
  try {
    execSync('infracost --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run infracost breakdown
 */
function runInfracostBreakdown(directory: string): CostEstimate | null {
  try {
    const result = execSync(`infracost breakdown --path "${directory}" --format json`, {
      stdio: 'pipe',
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return JSON.parse(result) as CostEstimate;
  } catch (error) {
    return null;
  }
}

/**
 * Format currency
 */
function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format change with color
 */
function formatChange(amount: number, currency: string = 'USD'): string {
  if (amount === 0) {
    return ui.color('$0.00', 'dim');
  } else if (amount > 0) {
    return ui.color(`+${formatCurrency(amount, currency)}`, 'red');
  } else {
    return ui.color(formatCurrency(amount, currency), 'green');
  }
}

/**
 * Get mock cost history (in real implementation, would query cloud provider)
 */
function getMockCostHistory(options: CostHistoryOptions): CostHistoryEntry[] {
  const entries: CostHistoryEntry[] = [];
  const now = new Date();
  const days = options.days || 30;

  // Generate mock data for demonstration
  const services = ['EC2', 'RDS', 'S3', 'Lambda', 'CloudWatch'];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    for (const service of services) {
      const baseCost =
        {
          EC2: 45,
          RDS: 35,
          S3: 5,
          Lambda: 10,
          CloudWatch: 3,
        }[service] || 10;

      // Add some variance
      const variance = (Math.random() - 0.5) * baseCost * 0.2;
      const cost = baseCost + variance;

      entries.push({
        date: dateStr,
        service,
        cost: parseFloat(cost.toFixed(2)),
        change: parseFloat(variance.toFixed(2)),
      });
    }
  }

  return entries;
}

// ==========================================
// Display Functions
// ==========================================

/**
 * Display cost estimate
 */
function displayCostEstimate(estimate: CostEstimate, detailed: boolean = false): void {
  ui.newLine();
  ui.section('Cost Estimate');

  ui.print(`  ${ui.dim('Generated:')} ${new Date(estimate.timeGenerated).toLocaleString()}`);
  ui.print(`  ${ui.dim('Currency:')}  ${estimate.currency}`);
  ui.newLine();

  // Summary
  ui.print(
    `  ${ui.bold('Monthly Cost:')} ${ui.color(formatCurrency(estimate.totalMonthlyCost), 'cyan')}`
  );
  ui.print(`  ${ui.bold('Hourly Cost:')}  ${formatCurrency(estimate.totalHourlyCost)}`);

  if (estimate.diffTotalMonthlyCost !== 0) {
    ui.print(`  ${ui.bold('Change:')}       ${formatChange(estimate.diffTotalMonthlyCost)}`);
  }
  ui.newLine();

  // Resource summary
  ui.print(`  ${ui.dim('Resources detected:')}    ${estimate.summary.totalDetectedResources}`);
  ui.print(`  ${ui.dim('Resources supported:')}   ${estimate.summary.totalSupportedResources}`);
  ui.print(`  ${ui.dim('Resources unsupported:')} ${estimate.summary.totalUnsupportedResources}`);
  ui.newLine();

  // Project breakdown
  for (const project of estimate.projects) {
    ui.section(`Project: ${project.name}`);

    ui.print(`  ${ui.dim('Monthly:')} ${formatCurrency(project.totalMonthlyCost)}`);

    if (project.diffTotalMonthlyCost !== 0) {
      ui.print(`  ${ui.dim('Change:')}  ${formatChange(project.diffTotalMonthlyCost)}`);
    }

    if (detailed && project.resources.length > 0) {
      ui.newLine();
      ui.print('  Resources:');

      // Group by type
      const byType: Record<string, CostResource[]> = {};
      for (const resource of project.resources) {
        const type = resource.resourceType;
        if (!byType[type]) {
          byType[type] = [];
        }
        byType[type].push(resource);
      }

      for (const [type, resources] of Object.entries(byType)) {
        const typeCost = resources.reduce((sum, r) => sum + r.monthlyCost, 0);
        ui.newLine();
        ui.print(`    ${ui.bold(type)} (${resources.length}) - ${formatCurrency(typeCost)}/mo`);

        for (const resource of resources.slice(0, 5)) {
          const cost = formatCurrency(resource.monthlyCost);
          ui.print(`      ${resource.name}: ${cost}/mo`);
        }

        if (resources.length > 5) {
          ui.print(ui.dim(`      ... and ${resources.length - 5} more`));
        }
      }
    }
  }

  // Unsupported resources warning
  if (Object.keys(estimate.summary.unsupportedResourceCounts).length > 0) {
    ui.newLine();
    ui.warning('Some resources could not be priced:');
    for (const [type, count] of Object.entries(estimate.summary.unsupportedResourceCounts)) {
      ui.print(`  ${ui.dim('•')} ${type}: ${count}`);
    }
  }
}

/**
 * Display cost history
 */
function displayCostHistory(entries: CostHistoryEntry[], groupBy: string): void {
  ui.newLine();
  ui.section('Cost History');

  if (entries.length === 0) {
    ui.info('No cost data available for the specified period.');
    return;
  }

  // Group entries by the specified field
  const groups: Record<string, CostHistoryEntry[]> = {};

  for (const entry of entries) {
    const key = groupBy === 'service' ? entry.service : entry.resource || entry.service;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(entry);
  }

  // Calculate totals per group
  const totals: { group: string; total: number; avg: number; trend: number }[] = [];

  for (const [group, groupEntries] of Object.entries(groups)) {
    const total = groupEntries.reduce((sum, e) => sum + e.cost, 0);
    const avg = total / groupEntries.length;

    // Calculate trend (last 7 days vs previous 7 days)
    const recent = groupEntries.slice(-7).reduce((sum, e) => sum + e.cost, 0);
    const previous = groupEntries.slice(-14, -7).reduce((sum, e) => sum + e.cost, 0);
    const trend = previous > 0 ? ((recent - previous) / previous) * 100 : 0;

    totals.push({ group, total, avg, trend });
  }

  // Sort by total cost
  totals.sort((a, b) => b.total - a.total);

  // Display table
  const grandTotal = totals.reduce((sum, t) => sum + t.total, 0);

  ui.print(`  ${ui.dim('Total period cost:')} ${ui.color(formatCurrency(grandTotal), 'cyan')}`);
  ui.newLine();

  // Table header
  const colWidths = { group: 20, total: 15, avg: 15, trend: 15 };
  const header = [
    groupBy.charAt(0).toUpperCase() + groupBy.slice(1).padEnd(colWidths.group),
    'Total'.padStart(colWidths.total),
    'Daily Avg'.padStart(colWidths.avg),
    'Trend (7d)'.padStart(colWidths.trend),
  ].join('  ');

  ui.print(`  ${ui.dim(header)}`);
  ui.print(`  ${ui.dim('-'.repeat(header.length))}`);

  for (const { group, total, avg, trend } of totals.slice(0, 10)) {
    const trendStr =
      trend > 0
        ? ui.color(`+${trend.toFixed(1)}%`, 'red')
        : trend < 0
          ? ui.color(`${trend.toFixed(1)}%`, 'green')
          : ui.color('0.0%', 'dim');

    const row = [
      group.substring(0, colWidths.group).padEnd(colWidths.group),
      formatCurrency(total).padStart(colWidths.total),
      formatCurrency(avg).padStart(colWidths.avg),
      trendStr.padStart(colWidths.trend + 10), // Extra for ANSI codes
    ].join('  ');

    ui.print(`  ${row}`);
  }

  if (totals.length > 10) {
    ui.newLine();
    ui.print(ui.dim(`  ... and ${totals.length - 10} more ${groupBy}s`));
  }
}

// ==========================================
// Commands
// ==========================================

/**
 * Cost parent command
 */
export async function costCommand(args: string[]): Promise<void> {
  if (args.length === 0) {
    ui.header('Nimbus Cost', 'Infrastructure cost estimation and tracking');
    ui.newLine();
    ui.print('Usage: nimbus cost <command> [options]');
    ui.newLine();
    ui.print('Commands:');
    ui.print(`  ${ui.bold('estimate')}  Estimate infrastructure costs from Terraform`);
    ui.print(`  ${ui.bold('compare')}   Compare cost between two workspaces or directories`);
    ui.print(`  ${ui.bold('report')}    Export session cost summary`);
    ui.print(`  ${ui.bold('history')}   View historical cost data`);
    ui.print(`  ${ui.bold('diff')}      Diff cost between two paths`);
    ui.newLine();
    ui.print('Examples:');
    ui.print('  nimbus cost estimate');
    ui.print('  nimbus cost estimate --workspace staging --provider aws');
    ui.print('  nimbus cost estimate -d ./terraform --detailed');
    ui.print('  nimbus cost compare ./workspace1 ./workspace2');
    ui.print('  nimbus cost report --output csv');
    ui.print('  nimbus cost history --days 30 --group-by service');
    return;
  }

  const subcommand = args[0];
  const subArgs = args.slice(1);

  switch (subcommand) {
    case 'estimate': {
      const opts = parseCostEstimateOptions(subArgs);
      // M3: handle --workspace and --provider flags for standalone estimate
      for (let i = 0; i < subArgs.length; i++) {
        if (subArgs[i] === '--workspace' && subArgs[i + 1]) {
          opts.directory = opts.directory ?? subArgs[i + 1];
        }
        if (subArgs[i] === '--provider' && subArgs[i + 1]) {
          // Provider hint is informational — store in compare for future use
        }
      }
      await costEstimateCommand(opts);
      break;
    }
    case 'compare': {
      // M3: nimbus cost compare <workspace1> <workspace2>
      const path1 = subArgs[0];
      const path2 = subArgs[1];
      if (!path1 || !path2) {
        ui.error('Usage: nimbus cost compare <workspace1> <workspace2>');
        ui.info('Compares infracost estimates between two directories.');
        process.exit(1);
      }
      const format = subArgs.includes('--json') ? 'json' : 'table';
      await costCompareCommand(path1, path2, { format });
      break;
    }
    case 'report': {
      // M3: nimbus cost report [--output csv|json|text]
      let outputFormat: 'csv' | 'json' | 'text' = 'text';
      for (let i = 0; i < subArgs.length; i++) {
        if (subArgs[i] === '--output' && subArgs[i + 1]) {
          const fmt = subArgs[i + 1];
          if (fmt === 'csv' || fmt === 'json' || fmt === 'text') {
            outputFormat = fmt;
          }
        }
      }
      await costReportCommand(outputFormat);
      break;
    }
    case 'history':
      await costHistoryCommand(parseCostHistoryOptions(subArgs));
      break;
    case 'diff': {
      const format = subArgs.includes('--json') ? 'json' : 'table';
      await costDiffCommand(subArgs[0], subArgs[1], { format });
      break;
    }
    default:
      ui.error(`Unknown cost command: ${subcommand}`);
      ui.info('Run "nimbus cost" for usage');
  }
}

/**
 * Cost estimate command
 */
export async function costEstimateCommand(options: CostEstimateOptions): Promise<void> {
  const directory = options.directory || process.cwd();

  ui.header('Nimbus Cost Estimate', directory);

  // Check for Terraform files
  const hasTerraform =
    fs.existsSync(path.join(directory, 'main.tf')) ||
    fs.existsSync(path.join(directory, 'terraform.tf')) ||
    fs.readdirSync(directory).some(f => f.endsWith('.tf'));

  if (!hasTerraform) {
    ui.warning('No Terraform files found in the specified directory.');
    ui.info('Cost estimation requires Terraform configuration files.');
    return;
  }

  // Check for infracost
  if (!checkInfracost()) {
    ui.info('Infracost is not installed. Using built-in cost estimator.');
    ui.newLine();

    ui.startSpinner({ message: 'Running built-in cost estimation...' });

    try {
      const result = await CostEstimator.estimateDirectory(directory);
      ui.stopSpinnerSuccess('Cost estimation complete');

      if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      displayCostEstimate(result, options.detailed || false);
      ui.newLine();
      ui.info('For more accurate pricing, install Infracost:');
      ui.print(`  ${ui.dim('brew install infracost')} (macOS)`);
      ui.print(
        `  ${ui.dim('curl -fsSL https://raw.githubusercontent.com/infracost/infracost/master/scripts/install.sh | sh')} (Linux)`
      );
    } catch (error) {
      ui.stopSpinnerFail('Cost estimation failed');
      ui.error(
        `Built-in estimator error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return;
  }

  ui.startSpinner({ message: 'Running cost estimation...' });

  const estimate = runInfracostBreakdown(directory);

  if (!estimate) {
    ui.stopSpinnerFail('Cost estimation failed');
    ui.error(
      'Failed to run infracost. Make sure you have authenticated with "infracost auth login"'
    );
    return;
  }

  ui.stopSpinnerSuccess('Cost estimation complete');

  if (options.format === 'json') {
    console.log(JSON.stringify(estimate, null, 2));
    return;
  }

  displayCostEstimate(estimate, options.detailed || false);
}

/**
 * Cost history command
 */
export async function costHistoryCommand(options: CostHistoryOptions): Promise<void> {
  ui.header('Nimbus Cost History', `Last ${options.days} days`);

  // In a real implementation, this would query cloud provider cost APIs
  // For now, we'll use mock data or show instructions

  if (!options.provider) {
    const providerChoice = await select({
      message: 'Select cloud provider:',
      options: [
        { label: 'AWS', value: 'aws', description: 'Amazon Web Services Cost Explorer' },
        { label: 'GCP', value: 'gcp', description: 'Google Cloud Billing' },
        { label: 'Azure', value: 'azure', description: 'Azure Cost Management' },
        { label: 'Demo', value: 'demo', description: 'Show demo data' },
      ],
    });
    options.provider = providerChoice as any;
  }

  if (options.provider === ('demo' as any)) {
    ui.startSpinner({ message: 'Loading cost history...' });

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    const entries = getMockCostHistory(options);
    ui.stopSpinnerSuccess(`Loaded ${entries.length} entries`);

    if (options.format === 'json') {
      console.log(JSON.stringify(entries, null, 2));
      return;
    }

    displayCostHistory(entries, options.groupBy || 'service');
    ui.newLine();
    ui.warning('This is demo data. Connect to a real cloud provider for actual costs.');
    return;
  }

  // Real provider - show instructions
  ui.newLine();
  ui.info(
    `To view ${options.provider?.toUpperCase()} cost history, you need to configure credentials.`
  );
  ui.newLine();

  switch (options.provider) {
    case 'aws':
      ui.print('AWS Cost Explorer API requires:');
      ui.print('  1. AWS credentials configured (aws configure)');
      ui.print('  2. Cost Explorer enabled in your AWS account');
      ui.print('  3. IAM permissions for ce:GetCostAndUsage');
      break;
    case 'gcp':
      ui.print('GCP Billing API requires:');
      ui.print('  1. GCP credentials configured (gcloud auth)');
      ui.print('  2. Billing export enabled to BigQuery');
      ui.print('  3. IAM permissions for bigquery.jobs.create');
      break;
    case 'azure':
      ui.print('Azure Cost Management API requires:');
      ui.print('  1. Azure CLI authenticated (az login)');
      ui.print('  2. Reader role on the subscription');
      ui.print('  3. Cost Management permissions');
      break;
  }

  ui.newLine();
  ui.print('Run with --provider demo to see sample data.');
}

/**
 * H5: Cost diff — compare infracost estimates between two directories or branches.
 */
export async function costDiffCommand(
  path1: string,
  path2: string,
  opts: { format?: 'table' | 'json' } = {}
): Promise<void> {
  if (!path1 || !path2) {
    ui.error('Usage: nimbus cost diff <path1> <path2> [--json]');
    process.exit(1);
  }

  // Check if infracost is available
  try {
    execSync('infracost --version', { stdio: 'pipe' });
  } catch {
    ui.error('infracost is not installed.');
    ui.info('Install it from: https://www.infracost.io/docs/');
    ui.info('  brew install infracost   (macOS)');
    ui.info('  curl -fsSL https://raw.githubusercontent.com/infracost/infracost/master/scripts/install.sh | sh   (Linux)');
    process.exit(1);
  }

  ui.startSpinner({ message: `Comparing costs: ${path1} vs ${path2}` });

  try {
    const rawOutput = execSync(
      `infracost diff --path "${path1}" --compare-to "${path2}" --format json`,
      { encoding: 'utf-8', stdio: 'pipe', maxBuffer: 10 * 1024 * 1024 }
    );
    const data = JSON.parse(rawOutput) as CostEstimate;
    ui.stopSpinnerSuccess('Cost diff complete');

    if (opts.format === 'json') {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    // Table output
    ui.header('Cost Diff');
    ui.print(`  Comparing: ${path1} (current) → ${path2} (baseline)`);
    ui.newLine();

    const monthly = data.diffTotalMonthlyCost ?? 0;
    ui.print(`  ${ui.bold('Monthly delta:')} ${formatChange(monthly, data.currency)}`);
    ui.print(`  ${ui.bold('New total:   ')} ${formatCurrency(data.totalMonthlyCost, data.currency)}/mo`);
    ui.newLine();

    // Per-project breakdown
    for (const project of data.projects ?? []) {
      if ((project.diffTotalMonthlyCost ?? 0) === 0) continue;
      ui.print(`  ${ui.bold(project.name)}: ${formatChange(project.diffTotalMonthlyCost, data.currency)}/mo`);
      for (const resource of (project.resources ?? []).slice(0, 10)) {
        ui.print(`    ${resource.name.slice(0, 50).padEnd(50)} ${formatCurrency(resource.monthlyCost, data.currency)}/mo`);
      }
    }
  } catch (error: unknown) {
    ui.stopSpinnerFail('Cost diff failed');
    ui.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * M3: Cost compare — compare infracost estimates between two workspaces.
 * Runs infracost breakdown for each path and shows the delta.
 */
export async function costCompareCommand(
  workspace1: string,
  workspace2: string,
  opts: { format?: 'table' | 'json' } = {}
): Promise<void> {
  if (!workspace1 || !workspace2) {
    ui.error('Usage: nimbus cost compare <workspace1> <workspace2>');
    process.exit(1);
  }

  // Try infracost first
  const hasInfracost = checkInfracost();
  if (!hasInfracost) {
    ui.info('infracost is not installed — showing placeholder comparison.');
    ui.info('Install infracost for real cost estimates: https://infracost.io');
    ui.newLine();
    ui.print(`  Workspace 1: ${workspace1}`);
    ui.print(`  Workspace 2: ${workspace2}`);
    ui.print('  Cost delta:  N/A (install infracost for actual data)');
    ui.newLine();
    ui.info('  brew install infracost   (macOS)');
    ui.info('  curl -fsSL https://raw.githubusercontent.com/infracost/infracost/master/scripts/install.sh | sh   (Linux)');
    return;
  }

  ui.startSpinner({ message: `Comparing costs: ${workspace1} vs ${workspace2}` });

  try {
    // Run infracost breakdown for each workspace
    const est1 = runInfracostBreakdown(workspace1);
    const est2 = runInfracostBreakdown(workspace2);

    ui.stopSpinnerSuccess('Cost comparison complete');

    if (!est1 && !est2) {
      ui.warning('Could not obtain infracost estimates for either workspace.');
      return;
    }

    const cost1 = est1?.totalMonthlyCost ?? 0;
    const cost2 = est2?.totalMonthlyCost ?? 0;
    const delta = cost1 - cost2;
    const currency = est1?.currency ?? est2?.currency ?? 'USD';

    if (opts.format === 'json') {
      console.log(JSON.stringify({ workspace1, workspace2, cost1, cost2, delta, currency }, null, 2));
      return;
    }

    ui.header('Cost Comparison');
    ui.print(`  ${ui.bold(workspace1)}: ${formatCurrency(cost1, currency)}/mo`);
    ui.print(`  ${ui.bold(workspace2)}: ${formatCurrency(cost2, currency)}/mo`);
    ui.newLine();
    ui.print(`  ${ui.bold('Delta (1 vs 2):')} ${formatChange(delta, currency)}/mo`);
  } catch (err: unknown) {
    ui.stopSpinnerFail('Cost comparison failed');
    ui.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

/**
 * M3: Cost report — export the session cost summary.
 * Reads session tool-call cost data and exports it in the requested format.
 */
export async function costReportCommand(outputFormat: 'csv' | 'json' | 'text' = 'text'): Promise<void> {
  ui.header('Nimbus Cost Report', `Session cost summary (format: ${outputFormat})`);

  // Attempt to read cost data from ~/.nimbus/nimbus.db via the state DB
  // For now, expose session-level token cost data as a report placeholder.
  // In a full implementation this would query the cost_tracker table in SQLite.
  const report = {
    generatedAt: new Date().toISOString(),
    note: 'Session cost data is tracked in ~/.nimbus/nimbus.db (cost_tracker table).',
    hint: 'Run `nimbus cost estimate` to estimate infrastructure costs for the current directory.',
    format: outputFormat,
  };

  if (outputFormat === 'json') {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (outputFormat === 'csv') {
    console.log('timestamp,description,cost_usd');
    console.log(`${report.generatedAt},session_summary,0.00`);
    ui.newLine();
    ui.info(report.note);
    return;
  }

  // text
  ui.newLine();
  ui.print(`  ${ui.dim('Generated:')} ${report.generatedAt}`);
  ui.newLine();
  ui.info(report.note);
  ui.info(report.hint);
}
