/**
 * AWS Discover Command
 *
 * Interactive and non-interactive AWS infrastructure discovery
 *
 * Usage: nimbus aws discover [options]
 */

import { writeFile } from 'node:fs/promises';
import { logger } from '../utils';
import { RestClient } from '../clients';
import { createWizard, ui, select, multiSelect, type WizardStep, type StepResult } from '../wizard';

// AWS Tools Service client
const awsToolsUrl = process.env.AWS_TOOLS_SERVICE_URL || 'http://localhost:3009';
const awsClient = new RestClient(awsToolsUrl);

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
  // Fetch available profiles
  ui.startSpinner({ message: 'Fetching AWS profiles...' });

  let profiles: Array<{ name: string; source: string; region?: string; isSSO: boolean }> = [];

  try {
    const profilesResponse = await awsClient.get<{
      profiles: Array<{ name: string; source: string; region?: string; isSSO: boolean }>;
    }>('/api/aws/profiles');

    if (profilesResponse.success && profilesResponse.data?.profiles) {
      profiles = profilesResponse.data.profiles;
    }

    ui.stopSpinnerSuccess(`Found ${profiles.length} AWS profiles`);
  } catch (error) {
    ui.stopSpinnerFail('Could not fetch AWS profiles');
    profiles = [{ name: 'default', source: 'credentials', isSSO: false }];
  }

  // Profile selection
  let selectedProfile = ctx.awsProfile;

  if (!selectedProfile) {
    const profileOptions = profiles.map(p => ({
      value: p.name,
      label: p.name + (p.isSSO ? ' (SSO)' : ''),
      description: `Source: ${p.source}${p.region ? `, Region: ${p.region}` : ''}`,
    }));

    selectedProfile = await select({
      message: 'Select AWS profile:',
      options: profileOptions,
      defaultValue: 'default',
    });

    if (!selectedProfile) {
      return { success: false, error: 'No profile selected' };
    }
  }

  // Validate credentials
  ui.startSpinner({ message: `Validating credentials for profile "${selectedProfile}"...` });

  try {
    const validateResponse = await awsClient.post<{
      valid: boolean;
      accountId?: string;
      accountAlias?: string;
      error?: string;
    }>('/api/aws/profiles/validate', { profile: selectedProfile });

    if (!validateResponse.success || !validateResponse.data?.valid) {
      ui.stopSpinnerFail(`Invalid credentials: ${validateResponse.data?.error || 'Unknown error'}`);
      return { success: false, error: 'Invalid AWS credentials' };
    }

    ui.stopSpinnerSuccess(
      `Authenticated to account ${validateResponse.data.accountId}${
        validateResponse.data.accountAlias ? ` (${validateResponse.data.accountAlias})` : ''
      }`
    );

    ctx.awsAccountId = validateResponse.data.accountId;
    ctx.awsAccountAlias = validateResponse.data.accountAlias;
  } catch (error: any) {
    ui.stopSpinnerFail(`Failed to validate credentials: ${error.message}`);
    return { success: false, error: 'Credential validation failed' };
  }

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
    // Fetch available regions
    ui.startSpinner({ message: 'Fetching available regions...' });

    try {
      const regionsResponse = await awsClient.get<{
        regions: Array<{ name: string; displayName: string }>;
      }>(`/api/aws/regions?profile=${selectedProfile}`);

      ui.stopSpinnerSuccess(`Found ${regionsResponse.data?.regions?.length || 0} regions`);

      if (regionsResponse.success && regionsResponse.data?.regions) {
        const regionOptions = regionsResponse.data.regions.map(r => ({
          value: r.name,
          label: `${r.name} - ${r.displayName}`,
        }));

        selectedRegions = (await multiSelect({
          message: 'Select regions to scan:',
          options: regionOptions,
          required: true,
        })) as string[];
      }
    } catch (error) {
      ui.stopSpinnerFail('Could not fetch regions');
      selectedRegions = ['us-east-1'];
    }
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
 * Step 3: Discovery
 */
async function discoveryStep(ctx: AwsDiscoverContext): Promise<StepResult> {
  ui.print('  Starting infrastructure discovery...');
  ui.newLine();

  try {
    // Start discovery
    const startResponse = await awsClient.post<{
      sessionId: string;
      status: string;
    }>('/api/aws/discover', {
      profile: ctx.awsProfile,
      regions: ctx.awsRegions || 'all',
      services: ctx.servicesToScan,
      excludeServices: ctx.excludeServices,
    });

    if (!startResponse.success || !startResponse.data?.sessionId) {
      return { success: false, error: 'Failed to start discovery' };
    }

    const sessionId = startResponse.data.sessionId;
    ctx.discoverySessionId = sessionId;

    // Poll for progress with visual feedback
    let completed = false;
    let lastUpdate = '';

    while (!completed) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const statusResponse = await awsClient.get<{
        status: string;
        progress: {
          regionsScanned: number;
          totalRegions: number;
          servicesScanned: number;
          totalServices: number;
          resourcesFound: number;
          currentRegion?: string;
          currentService?: string;
          errors: string[];
        };
        inventory?: DiscoveryInventory;
      }>(`/api/aws/discover/${sessionId}`);

      if (!statusResponse.success) {
        continue;
      }

      const { status, progress, inventory } = statusResponse.data!;

      // Build progress message
      const progressMsg = buildProgressMessage(progress);
      if (progressMsg !== lastUpdate) {
        ui.clearLine();
        ui.write(progressMsg);
        lastUpdate = progressMsg;
      }

      if (status === 'completed') {
        completed = true;
        ctx.inventory = inventory;

        ui.newLine();
        ui.newLine();
        ui.success(`Discovery complete! Found ${progress.resourcesFound} resources`);

        if (progress.errors.length > 0) {
          ui.newLine();
          ui.warning(`${progress.errors.length} errors occurred during discovery:`);
          for (const err of progress.errors.slice(0, 5)) {
            ui.print(`    ${ui.dim(err)}`);
          }
          if (progress.errors.length > 5) {
            ui.print(`    ${ui.dim(`... and ${progress.errors.length - 5} more`)}`);
          }
        }
      } else if (status === 'failed') {
        ui.newLine();
        ui.error('Discovery failed');
        return { success: false, error: 'Discovery failed' };
      } else if (status === 'cancelled') {
        ui.newLine();
        ui.warning('Discovery was cancelled');
        return { success: false, error: 'Discovery cancelled' };
      }
    }

    return {
      success: true,
      data: {
        discoverySessionId: sessionId,
        inventory: ctx.inventory,
      },
    };
  } catch (error: any) {
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

  // Validate credentials
  ui.startSpinner({ message: 'Validating credentials...' });

  try {
    const validateResponse = await awsClient.post<{
      valid: boolean;
      accountId?: string;
      error?: string;
    }>('/api/aws/profiles/validate', { profile: options.profile });

    if (!validateResponse.success || !validateResponse.data?.valid) {
      ui.stopSpinnerFail(`Invalid credentials: ${validateResponse.data?.error || 'Unknown error'}`);
      return null;
    }

    ui.stopSpinnerSuccess(`Authenticated to account ${validateResponse.data.accountId}`);
  } catch (error: any) {
    ui.stopSpinnerFail(`Credential validation failed: ${error.message}`);
    return null;
  }

  // Start discovery
  ui.startSpinner({ message: 'Starting discovery...' });

  try {
    const startResponse = await awsClient.post<{
      sessionId: string;
    }>('/api/aws/discover', {
      profile: options.profile,
      regions: options.regions || 'all',
      services: options.services,
      excludeServices: options.excludeServices,
    });

    if (!startResponse.success || !startResponse.data?.sessionId) {
      ui.stopSpinnerFail('Failed to start discovery');
      return null;
    }

    const sessionId = startResponse.data.sessionId;
    ui.stopSpinnerSuccess(`Discovery started (session: ${sessionId})`);

    // Poll for completion
    ui.startSpinner({ message: 'Scanning infrastructure...' });

    let completed = false;
    let inventory: DiscoveryInventory | undefined;

    while (!completed) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const statusResponse = await awsClient.get<{
        status: string;
        progress: { resourcesFound: number };
        inventory?: DiscoveryInventory;
      }>(`/api/aws/discover/${sessionId}`);

      if (!statusResponse.success) {
        continue;
      }

      const { status, progress } = statusResponse.data!;

      ui.updateSpinner(`Scanning... ${progress.resourcesFound} resources found`);

      if (status === 'completed') {
        completed = true;
        inventory = statusResponse.data!.inventory;
        ui.stopSpinnerSuccess(`Discovery complete! Found ${progress.resourcesFound} resources`);
      } else if (status === 'failed' || status === 'cancelled') {
        ui.stopSpinnerFail(`Discovery ${status}`);
        return null;
      }
    }

    if (inventory) {
      // Display summary
      displayInventorySummary(inventory);

      // Save to file if requested
      if (options.outputFile) {
        await saveInventory(inventory, options.outputFile, options.outputFormat || 'json');
      }

      return inventory;
    }

    return null;
  } catch (error: any) {
    ui.stopSpinnerFail(`Discovery failed: ${error.message}`);
    return null;
  }
}

export default awsDiscoverCommand;
