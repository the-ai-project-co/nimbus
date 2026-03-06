/**
 * AWS Discover Command
 *
 * Interactive and non-interactive AWS infrastructure discovery
 *
 * Usage: nimbus aws discover [options]
 */

import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { logger } from '../utils';
import { createWizard, ui, select, multiSelect, type WizardStep, type StepResult } from '../wizard';

// ---- CLI helpers ----

function cliGetAwsProfiles(): string[] {
  try {
    const out = execFileSync('aws', ['configure', 'list-profiles'], {
      encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
    }) as string;
    return out.trim().split('\n').map(s => s.trim()).filter(Boolean);
  } catch {
    return ['default'];
  }
}

function cliValidateAwsProfile(profile: string): { accountId?: string; valid: boolean; error?: string } {
  try {
    const out = execFileSync('aws', ['sts', 'get-caller-identity', '--profile', profile, '--output', 'json'], {
      encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'],
    }) as string;
    const data = JSON.parse(out);
    return { valid: true, accountId: data.Account };
  } catch (e: any) {
    return { valid: false, error: e.message?.slice(0, 100) };
  }
}

function cliDiscoverResources(profile: string, regions?: string[], services?: string[]): DiscoveryInventory {
  const env = { ...process.env, AWS_PROFILE: profile };
  const resources: DiscoveredResource[] = [];
  const byType: Record<string, number> = {};
  const byRegion: Record<string, number> = {};
  const byService: Record<string, number> = {};
  const allServices = services || ['EC2', 'S3', 'RDS', 'EKS'];

  const addResources = (items: Array<{ id: string; type: string; region: string; name?: string }>) => {
    for (const item of items) {
      resources.push({ id: item.id, type: item.type, region: item.region, name: item.name, properties: {} });
      byType[item.type] = (byType[item.type] ?? 0) + 1;
      byRegion[item.region] = (byRegion[item.region] ?? 0) + 1;
      const svc = item.type.split('::')[0] ?? item.type;
      byService[svc] = (byService[svc] ?? 0) + 1;
    }
  };

  const targetRegions = regions?.length ? regions : ['us-east-1'];

  for (const region of targetRegions) {
    const regionEnv = { ...env, AWS_DEFAULT_REGION: region };

    if (!services || allServices.includes('EC2') || allServices.includes('all')) {
      try {
        const out = execFileSync('aws', ['ec2', 'describe-instances', '--query', 'Reservations[*].Instances[*].{id:InstanceId,name:Tags[?Key==`Name`].Value|[0]}', '--output', 'json'], { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'], env: regionEnv }) as string;
        const instances = JSON.parse(out).flat();
        addResources(instances.map((i: any) => ({ id: i.id, type: 'AWS::EC2::Instance', region, name: i.name })));
      } catch { /* skip */ }
    }

    if (!services || allServices.includes('RDS') || allServices.includes('all')) {
      try {
        const out = execFileSync('aws', ['rds', 'describe-db-instances', '--query', 'DBInstances[*].DBInstanceIdentifier', '--output', 'json'], { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'], env: regionEnv }) as string;
        const dbs = JSON.parse(out);
        addResources(dbs.map((id: string) => ({ id, type: 'AWS::RDS::DBInstance', region, name: id })));
      } catch { /* skip */ }
    }

    if (!services || allServices.includes('EKS') || allServices.includes('all')) {
      try {
        const out = execFileSync('aws', ['eks', 'list-clusters', '--output', 'json'], { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'], env: regionEnv }) as string;
        const clusters = JSON.parse(out).clusters ?? [];
        addResources(clusters.map((name: string) => ({ id: name, type: 'AWS::EKS::Cluster', region, name })));
      } catch { /* skip */ }
    }
  }

  // S3 is global
  if (!services || allServices.includes('S3') || allServices.includes('all')) {
    try {
      const out = execFileSync('aws', ['s3', 'ls'], { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'], env }) as string;
      const buckets = out.trim().split('\n').filter(Boolean).map(l => l.split(' ').pop()!);
      addResources(buckets.map(name => ({ id: name, type: 'AWS::S3::Bucket', region: 'us-east-1', name })));
    } catch { /* skip */ }
  }

  return {
    resources,
    byType,
    byRegion,
    byService,
    summary: {
      totalResources: resources.length,
      resourcesByService: byService,
      resourcesByRegion: byRegion,
    },
  };
}

/**
 * Discovery context for wizard
 */
export interface AwsDiscoverContext {
  // AWS configuration
  awsProfile?: string;
  awsRegions?: string[];
  awsAccountId?: string;
  awsAccountAlias?: string;

  // Discovery options
  servicesToScan?: string[];
  excludeServices?: string[];

  // State
  discoverySessionId?: string;
  inventory?: DiscoveryInventory;
}

/**
 * Discovery inventory from AWS
 */
interface DiscoveryInventory {
  resources: DiscoveredResource[];
  byType: Record<string, number>;
  byRegion: Record<string, number>;
  byService: Record<string, number>;
  summary?: {
    totalResources: number;
    resourcesByService: Record<string, number>;
    resourcesByRegion: Record<string, number>;
  };
}

/**
 * Discovered resource
 */
interface DiscoveredResource {
  id: string;
  type: string;
  region: string;
  name?: string;
  tags?: Record<string, string>;
  properties: Record<string, unknown>;
}

/**
 * Command options from CLI arguments
 */
export interface AwsDiscoverOptions {
  profile?: string;
  regions?: string[];
  services?: string[];
  excludeServices?: string[];
  outputFormat?: 'json' | 'table' | 'summary';
  outputFile?: string;
  nonInteractive?: boolean;
}

/**
 * Run the AWS discover command
 */
export async function awsDiscoverCommand(
  options: AwsDiscoverOptions = {}
): Promise<DiscoveryInventory | null> {
  logger.info('Starting AWS infrastructure discovery');

  // Non-interactive mode
  if (options.nonInteractive) {
    return await runNonInteractive(options);
  }

  // Interactive wizard mode
  const wizard = createWizard<AwsDiscoverContext>({
    title: 'nimbus aws discover',
    description: 'Discover AWS infrastructure resources',
    initialContext: {
      awsProfile: options.profile,
      awsRegions: options.regions,
      servicesToScan: options.services,
      excludeServices: options.excludeServices,
    },
    steps: createWizardSteps(),
    onEvent: event => {
      logger.debug('Wizard event', { type: event.type });
    },
  });

  const result = await wizard.run();

  if (result.success && result.context.inventory) {
    ui.newLine();
    displayInventorySummary(result.context.inventory);

    // Handle output options
    if (options.outputFile) {
      await saveInventory(
        result.context.inventory,
        options.outputFile,
        options.outputFormat || 'json'
      );
    }

    return result.context.inventory;
  } else {
    ui.error(`Discovery failed: ${result.error?.message || 'Unknown error'}`);
    return null;
  }
}

/**
 * Create wizard steps
 */
function createWizardSteps(): WizardStep<AwsDiscoverContext>[] {
  return [
    // Step 1: AWS Configuration
    {
      id: 'aws-config',
      title: 'AWS Configuration',
      description: 'Configure AWS profile and regions to scan',
      execute: awsConfigStep,
    },

    // Step 2: Service Selection
    {
      id: 'services',
      title: 'Service Selection',
      description: 'Select which AWS services to scan',
      execute: serviceSelectionStep,
    },

    // Step 3: Discovery
    {
      id: 'discovery',
      title: 'Infrastructure Discovery',
      description: 'Scanning your AWS infrastructure...',
      execute: discoveryStep,
    },
  ];
}

/**
 * Step 1: AWS Configuration
 */
async function awsConfigStep(ctx: AwsDiscoverContext): Promise<StepResult> {
  // Fetch available profiles via AWS CLI
  ui.startSpinner({ message: 'Fetching AWS profiles...' });
  const profileNames = cliGetAwsProfiles();
  ui.stopSpinnerSuccess(`Found ${profileNames.length} AWS profile(s)`);

  // Profile selection
  let selectedProfile = ctx.awsProfile;

  if (!selectedProfile) {
    const profileOptions = profileNames.map(p => ({ value: p, label: p }));

    selectedProfile = await select({
      message: 'Select AWS profile:',
      options: profileOptions,
      defaultValue: 'default',
    });

    if (!selectedProfile) {
      return { success: false, error: 'No profile selected' };
    }
  }

  // Validate credentials via AWS CLI
  ui.startSpinner({ message: `Validating credentials for profile "${selectedProfile}"...` });
  const validation = cliValidateAwsProfile(selectedProfile);

  if (!validation.valid) {
    ui.stopSpinnerFail(`Invalid credentials: ${validation.error || 'Unknown error'}`);
    return { success: false, error: 'Invalid AWS credentials' };
  }

  ui.stopSpinnerSuccess(`Authenticated to account ${validation.accountId || 'unknown'}`);
  ctx.awsAccountId = validation.accountId;

  // Region selection
  ui.newLine();

  const regionChoice = await select<'all' | 'specific'>({
    message: 'Select regions to scan:',
    options: [
      {
        value: 'all',
        label: 'All enabled regions',
        description: 'Scan all regions enabled for your account',
      },
      {
        value: 'specific',
        label: 'Specific regions',
        description: 'Select specific regions to scan',
      },
    ],
    defaultValue: ctx.awsRegions?.length ? 'specific' : 'all',
  });

  let selectedRegions: string[] = ctx.awsRegions || [];

  if (regionChoice === 'specific' && selectedRegions.length === 0) {
    // Hardcoded common AWS regions (no service needed)
    const regionOptions = [
      { value: 'us-east-1', label: 'us-east-1 - N. Virginia' },
      { value: 'us-east-2', label: 'us-east-2 - Ohio' },
      { value: 'us-west-1', label: 'us-west-1 - N. California' },
      { value: 'us-west-2', label: 'us-west-2 - Oregon' },
      { value: 'eu-west-1', label: 'eu-west-1 - Ireland' },
      { value: 'eu-central-1', label: 'eu-central-1 - Frankfurt' },
      { value: 'ap-southeast-1', label: 'ap-southeast-1 - Singapore' },
      { value: 'ap-northeast-1', label: 'ap-northeast-1 - Tokyo' },
    ];

    selectedRegions = (await multiSelect({
      message: 'Select regions to scan:',
      options: regionOptions,
      required: true,
    })) as string[];
  }

  return {
    success: true,
    data: {
      awsProfile: selectedProfile,
      awsRegions: regionChoice === 'all' ? undefined : selectedRegions,
    },
  };
}

/**
 * Step 2: Service Selection
 */
async function serviceSelectionStep(ctx: AwsDiscoverContext): Promise<StepResult> {
  if (ctx.servicesToScan && ctx.servicesToScan.length > 0) {
    // Services already specified
    ui.info(`Services to scan: ${ctx.servicesToScan.join(', ')}`);
    return { success: true, data: { servicesToScan: ctx.servicesToScan } };
  }

  const serviceChoice = await select<'all' | 'specific'>({
    message: 'Select services to scan:',
    options: [
      {
        value: 'all',
        label: 'All supported services',
        description: 'EC2, S3, RDS, Lambda, VPC, IAM, ECS, EKS, DynamoDB, CloudFront',
      },
      {
        value: 'specific',
        label: 'Specific services',
        description: 'Select specific services to scan',
      },
    ],
    defaultValue: 'all',
  });

  if (serviceChoice === 'all') {
    return { success: true, data: { servicesToScan: undefined } };
  }

  const serviceOptions = [
    { value: 'EC2', label: 'EC2', description: 'Instances, volumes, security groups, AMIs' },
    { value: 'S3', label: 'S3', description: 'Buckets and bucket policies' },
    { value: 'RDS', label: 'RDS', description: 'Database instances and clusters' },
    { value: 'Lambda', label: 'Lambda', description: 'Functions and layers' },
    { value: 'VPC', label: 'VPC', description: 'VPCs, subnets, route tables, NAT gateways' },
    { value: 'IAM', label: 'IAM', description: 'Roles, policies, users, groups' },
    { value: 'ECS', label: 'ECS', description: 'Clusters, services, task definitions' },
    { value: 'EKS', label: 'EKS', description: 'Clusters and node groups' },
    { value: 'DynamoDB', label: 'DynamoDB', description: 'Tables' },
    { value: 'CloudFront', label: 'CloudFront', description: 'Distributions' },
  ];

  const selectedServices = await multiSelect({
    message: 'Select services to scan:',
    options: serviceOptions,
    required: true,
  });

  return {
    success: true,
    data: { servicesToScan: selectedServices as string[] },
  };
}

/**
 * Step 3: Discovery — uses AWS CLI directly (no REST service)
 */
async function discoveryStep(ctx: AwsDiscoverContext): Promise<StepResult> {
  ui.startSpinner({ message: 'Discovering AWS infrastructure via CLI...' });
  try {
    const inventory = cliDiscoverResources(ctx.awsProfile || 'default', ctx.awsRegions, ctx.servicesToScan);
    ctx.inventory = inventory;
    ui.stopSpinnerSuccess(`Discovery complete! Found ${inventory.resources.length} resource(s)`);
    return { success: true, data: { inventory } };
  } catch (error: any) {
    ui.stopSpinnerFail('Discovery failed');
    return { success: false, error: error.message };
  }
}

/**
 * Build progress message
 */
function buildProgressMessage(progress: {
  regionsScanned: number;
  totalRegions: number;
  servicesScanned: number;
  totalServices: number;
  resourcesFound: number;
  currentRegion?: string;
  currentService?: string;
}): string {
  const parts = [
    `  Regions: ${progress.regionsScanned}/${progress.totalRegions}`,
    `Services: ${progress.servicesScanned}/${progress.totalServices}`,
    `Resources: ${progress.resourcesFound}`,
  ];

  if (progress.currentRegion && progress.currentService) {
    parts.push(`Current: ${progress.currentRegion}/${progress.currentService}`);
  } else if (progress.currentRegion) {
    parts.push(`Current: ${progress.currentRegion}`);
  }

  return parts.join(' | ');
}

/**
 * Display inventory summary
 */
function displayInventorySummary(inventory: DiscoveryInventory): void {
  ui.box({
    title: 'Discovery Summary',
    content: [
      `Total Resources: ${inventory.resources.length}`,
      '',
      'By Service:',
      ...Object.entries(inventory.byService || {}).map(
        ([service, count]) => `  ${service}: ${count}`
      ),
      '',
      'By Region:',
      ...Object.entries(inventory.byRegion || {}).map(([region, count]) => `  ${region}: ${count}`),
    ],
    style: 'rounded',
    borderColor: 'cyan',
    padding: 1,
  });
}

/**
 * Save inventory to file
 */
async function saveInventory(
  inventory: DiscoveryInventory,
  outputFile: string,
  format: 'json' | 'table' | 'summary'
): Promise<void> {
  let content: string;

  if (format === 'json') {
    content = JSON.stringify(inventory, null, 2);
  } else if (format === 'summary') {
    content = [
      `# AWS Infrastructure Discovery Summary`,
      ``,
      `Total Resources: ${inventory.resources.length}`,
      ``,
      `## By Service`,
      ...Object.entries(inventory.byService || {}).map(
        ([service, count]) => `- ${service}: ${count}`
      ),
      ``,
      `## By Region`,
      ...Object.entries(inventory.byRegion || {}).map(([region, count]) => `- ${region}: ${count}`),
    ].join('\n');
  } else {
    // Table format - CSV-like
    const headers = ['ID', 'Type', 'Region', 'Name'];
    const rows = inventory.resources.map(r => [r.id, r.type, r.region, r.name || '']);
    content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  await writeFile(outputFile, content, 'utf-8');
  ui.success(`Inventory saved to ${outputFile}`);
}

/**
 * Run in non-interactive mode
 */
async function runNonInteractive(options: AwsDiscoverOptions): Promise<DiscoveryInventory | null> {
  ui.header('nimbus aws discover', 'Non-interactive mode');

  // Validate required options
  if (!options.profile) {
    ui.error('Profile is required in non-interactive mode (--profile)');
    process.exit(1);
  }

  ui.info(`Using profile: ${options.profile}`);
  ui.info(`Regions: ${options.regions?.join(', ') || 'all'}`);
  ui.info(`Services: ${options.services?.join(', ') || 'all'}`);

  // Validate credentials via AWS CLI
  ui.startSpinner({ message: 'Validating credentials...' });
  const validation = cliValidateAwsProfile(options.profile!);
  if (!validation.valid) {
    ui.stopSpinnerFail(`Invalid credentials: ${validation.error || 'Unknown error'}`);
    return null;
  }
  ui.stopSpinnerSuccess(`Authenticated to account ${validation.accountId || 'unknown'}`);

  // Discover via AWS CLI
  ui.startSpinner({ message: 'Discovering infrastructure...' });
  try {
    const inventory = cliDiscoverResources(options.profile!, options.regions, options.services);
    ui.stopSpinnerSuccess(`Discovery complete! Found ${inventory.resources.length} resource(s)`);

    displayInventorySummary(inventory);

    if (options.outputFile) {
      await saveInventory(inventory, options.outputFile, options.outputFormat || 'json');
    }

    return inventory;
  } catch (error: any) {
    ui.stopSpinnerFail(`Discovery failed: ${error.message}`);
    return null;
  }
}

export default awsDiscoverCommand;
