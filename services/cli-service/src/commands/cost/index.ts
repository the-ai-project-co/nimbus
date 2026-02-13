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
    const result = execSync(
      `infracost breakdown --path "${directory}" --format json`,
      { stdio: 'pipe', encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
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
      const baseCost = {
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
        change: parseFloat((variance).toFixed(2)),
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
  ui.print(`  ${ui.bold('Monthly Cost:')} ${ui.color(formatCurrency(estimate.totalMonthlyCost), 'cyan')}`);
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
        if (!byType[type]) byType[type] = [];
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
    const key = groupBy === 'service' ? entry.service : (entry.resource || entry.service);
    if (!groups[key]) groups[key] = [];
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
    const trendStr = trend > 0
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
    ui.print(`  ${ui.bold('history')}   View historical cost data`);
    ui.newLine();
    ui.print('Examples:');
    ui.print('  nimbus cost estimate');
    ui.print('  nimbus cost estimate -d ./terraform --detailed');
    ui.print('  nimbus cost history --days 30 --group-by service');
    return;
  }

  const subcommand = args[0];
  const subArgs = args.slice(1);

  switch (subcommand) {
    case 'estimate':
      await costEstimateCommand(parseCostEstimateOptions(subArgs));
      break;
    case 'history':
      await costHistoryCommand(parseCostHistoryOptions(subArgs));
      break;
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
  const hasTerraform = fs.existsSync(path.join(directory, 'main.tf')) ||
                       fs.existsSync(path.join(directory, 'terraform.tf')) ||
                       fs.readdirSync(directory).some(f => f.endsWith('.tf'));

  if (!hasTerraform) {
    ui.warning('No Terraform files found in the specified directory.');
    ui.info('Cost estimation requires Terraform configuration files.');
    return;
  }

  // Check for infracost
  if (!checkInfracost()) {
    ui.warning('Infracost is not installed.');
    ui.newLine();
    ui.print('To install Infracost:');
    ui.print(`  ${ui.dim('brew install infracost')} (macOS)`);
    ui.print(`  ${ui.dim('curl -fsSL https://raw.githubusercontent.com/infracost/infracost/master/scripts/install.sh | sh')} (Linux)`);
    ui.newLine();
    ui.print('Then run: infracost auth login');

    // Offer to show a mock estimate
    const showMock = await select({
      message: 'Would you like to see a mock estimate for demonstration?',
      options: [
        { label: 'Yes, show mock data', value: 'yes' },
        { label: 'No, exit', value: 'no' },
      ],
    });

    if (showMock === 'no') return;

    // Generate mock estimate
    const mockEstimate: CostEstimate = {
      version: '0.2',
      currency: 'USD',
      projects: [{
        name: path.basename(directory),
        metadata: {},
        pastTotalMonthlyCost: 0,
        pastTotalHourlyCost: 0,
        diffTotalMonthlyCost: 0,
        diffTotalHourlyCost: 0,
        totalMonthlyCost: 542.50,
        totalHourlyCost: 0.74,
        resources: [
          { name: 'aws_instance.web', resourceType: 'aws_instance', monthlyCost: 85.00 },
          { name: 'aws_instance.api', resourceType: 'aws_instance', monthlyCost: 85.00 },
          { name: 'aws_db_instance.main', resourceType: 'aws_db_instance', monthlyCost: 210.50 },
          { name: 'aws_s3_bucket.assets', resourceType: 'aws_s3_bucket', monthlyCost: 25.00 },
          { name: 'aws_elasticache_cluster.cache', resourceType: 'aws_elasticache_cluster', monthlyCost: 137.00 },
        ],
      }],
      totalMonthlyCost: 542.50,
      totalHourlyCost: 0.74,
      diffTotalMonthlyCost: 0,
      timeGenerated: new Date().toISOString(),
      summary: {
        totalDetectedResources: 12,
        totalSupportedResources: 10,
        totalUnsupportedResources: 2,
        totalUsageBasedResources: 3,
        totalNoPriceResources: 0,
        unsupportedResourceCounts: { 'aws_iam_role': 2 },
        noPriceResourceCounts: {},
      },
    };

    ui.newLine();
    ui.warning('Showing mock data for demonstration');
    displayCostEstimate(mockEstimate, options.detailed || false);
    return;
  }

  ui.startSpinner({ message: 'Running cost estimation...' });

  const estimate = runInfracostBreakdown(directory);

  if (!estimate) {
    ui.stopSpinnerFail('Cost estimation failed');
    ui.error('Failed to run infracost. Make sure you have authenticated with "infracost auth login"');
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

  if (options.provider === 'demo' as any) {
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
  ui.info(`To view ${options.provider?.toUpperCase()} cost history, you need to configure credentials.`);
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
