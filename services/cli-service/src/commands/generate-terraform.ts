/**
 * Generate Terraform Command
 *
 * Interactive wizard for AWS infrastructure discovery and Terraform generation
 *
 * Usage: nimbus generate terraform [options]
 */

import { logger } from '@nimbus/shared-utils';
import { RestClient } from '@nimbus/shared-clients';
import {
  createWizard,
  ui,
  select,
  multiSelect,
  confirm,
  input,
  pathInput,
  pressEnter,
  type TerraformWizardContext,
  type WizardStep,
  type StepResult,
} from '../wizard';

// AWS Tools Service client
const awsToolsUrl = process.env.AWS_TOOLS_SERVICE_URL || 'http://localhost:3009';
const awsClient = new RestClient(awsToolsUrl);

// Generator Service client
const generatorUrl = process.env.GENERATOR_SERVICE_URL || 'http://localhost:3003';
const generatorClient = new RestClient(generatorUrl);

/**
 * Command options from CLI arguments
 */
export interface GenerateTerraformOptions {
  profile?: string;
  regions?: string[];
  services?: string[];
  output?: string;
  nonInteractive?: boolean;
  acceptAllImprovements?: boolean;
  rejectAllImprovements?: boolean;
  acceptCategories?: string[];
  mock?: boolean;
}

/**
 * Run the generate terraform command
 */
export async function generateTerraformCommand(options: GenerateTerraformOptions = {}): Promise<void> {
  logger.info('Starting Terraform generation wizard');

  // Non-interactive mode
  if (options.nonInteractive) {
    await runNonInteractive(options);
    return;
  }

  // Interactive wizard mode
  const wizard = createWizard<TerraformWizardContext>({
    title: 'nimbus generate terraform',
    description: 'Generate Terraform from your AWS infrastructure',
    initialContext: {
      provider: 'aws',
      awsProfile: options.profile,
      awsRegions: options.regions,
      servicesToScan: options.services,
      outputPath: options.output,
    },
    steps: createWizardSteps(),
    onEvent: (event) => {
      logger.debug('Wizard event', { type: event.type });
    },
  });

  const result = await wizard.run();

  if (result.success) {
    ui.newLine();
    ui.box({
      title: 'Complete!',
      content: [
        'Your infrastructure has been codified as Terraform.',
        '',
        'Next steps:',
        `  1. Review the generated files in ${result.context.outputPath}`,
        '  2. Run "terraform plan" to see what will be imported',
        '  3. Run "terraform apply" to bring resources under Terraform control',
        '',
        'Scan saved to history. View with: nimbus infra history',
      ],
      style: 'rounded',
      borderColor: 'green',
      padding: 1,
    });
  } else {
    ui.error(`Wizard failed: ${result.error?.message || 'Unknown error'}`);
    process.exit(1);
  }
}

/**
 * Create wizard steps
 */
function createWizardSteps(): WizardStep<TerraformWizardContext>[] {
  return [
    // Step 1: Provider Selection
    {
      id: 'provider',
      title: 'Cloud Provider Selection',
      description: 'Select the cloud provider to scan for infrastructure',
      execute: providerSelectionStep,
    },

    // Step 2: AWS Configuration
    {
      id: 'aws-config',
      title: 'AWS Configuration',
      description: 'Configure AWS profile and regions to scan',
      condition: (ctx) => ctx.provider === 'aws',
      execute: awsConfigStep,
    },

    // Step 3: Service Selection
    {
      id: 'services',
      title: 'Service Selection',
      description: 'Select which AWS services to scan',
      condition: (ctx) => ctx.provider === 'aws',
      execute: serviceSelectionStep,
    },

    // Step 4: Discovery
    {
      id: 'discovery',
      title: 'Infrastructure Discovery',
      description: 'Scanning your AWS infrastructure...',
      execute: discoveryStep,
    },

    // Step 5: Generation Options
    {
      id: 'generation-options',
      title: 'Generation Options',
      description: 'Configure Terraform generation options',
      execute: generationOptionsStep,
    },

    // Step 6: Output Location
    {
      id: 'output',
      title: 'Output Location',
      description: 'Where should the Terraform files be saved?',
      execute: outputLocationStep,
    },

    // Future steps (Phase 2+):
    // - Terraform Generation
    // - Best Practices Analysis
    // - Interactive Review
    // - Starter Kit Generation
    // - Terraform Operations
  ];
}

/**
 * Step 1: Provider Selection
 */
async function providerSelectionStep(ctx: TerraformWizardContext): Promise<StepResult> {
  const provider = await select<'aws' | 'gcp' | 'azure'>({
    message: 'Select cloud provider:',
    options: [
      {
        value: 'aws',
        label: 'AWS (Amazon Web Services)',
        description: 'Scan EC2, S3, RDS, Lambda, VPC, IAM, and more',
      },
      {
        value: 'gcp',
        label: 'GCP (Google Cloud Platform)',
        description: 'Coming soon',
        disabled: true,
        disabledReason: 'Coming Soon',
      },
      {
        value: 'azure',
        label: 'Azure (Microsoft Azure)',
        description: 'Coming soon',
        disabled: true,
        disabledReason: 'Coming Soon',
      },
    ],
    defaultValue: ctx.provider || 'aws',
  });

  if (!provider) {
    return { success: false, error: 'No provider selected' };
  }

  return {
    success: true,
    data: { provider },
  };
}

/**
 * Step 2: AWS Configuration
 */
async function awsConfigStep(ctx: TerraformWizardContext): Promise<StepResult> {
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
    // Continue with manual input
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
      `Authenticated to account ${validateResponse.data.accountId}` +
      (validateResponse.data.accountAlias ? ` (${validateResponse.data.accountAlias})` : '')
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
    defaultValue: 'all',
  });

  let selectedRegions: string[] = [];

  if (regionChoice === 'specific') {
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

        selectedRegions = await multiSelect({
          message: 'Select regions to scan:',
          options: regionOptions,
          required: true,
        }) as string[];
      }
    } catch (error) {
      ui.stopSpinnerFail('Could not fetch regions');
      // Use common regions as fallback
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
 * Step 3: Service Selection
 */
async function serviceSelectionStep(ctx: TerraformWizardContext): Promise<StepResult> {
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
 * Step 4: Discovery
 */
async function discoveryStep(ctx: TerraformWizardContext): Promise<StepResult> {
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
    });

    if (!startResponse.success || !startResponse.data?.sessionId) {
      return { success: false, error: 'Failed to start discovery' };
    }

    const sessionId = startResponse.data.sessionId;
    ctx.discoverySessionId = sessionId;

    // Poll for progress
    let completed = false;
    let lastResourceCount = 0;

    while (!completed) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const statusResponse = await awsClient.get<{
        status: string;
        progress: {
          regionsScanned: number;
          totalRegions: number;
          resourcesFound: number;
          currentRegion?: string;
          currentService?: string;
        };
        inventory?: any;
      }>(`/api/aws/discover/${sessionId}`);

      if (!statusResponse.success) {
        continue;
      }

      const { status, progress, inventory } = statusResponse.data!;

      // Update progress display
      if (progress.resourcesFound !== lastResourceCount) {
        ui.clearLine();
        ui.write(
          `  Scanning: ${progress.regionsScanned}/${progress.totalRegions} regions | ` +
          `${progress.resourcesFound} resources found`
        );
        if (progress.currentRegion) {
          ui.write(` | Current: ${progress.currentRegion}`);
        }
        lastResourceCount = progress.resourcesFound;
      }

      if (status === 'completed') {
        completed = true;
        ctx.inventory = inventory;

        ui.newLine();
        ui.newLine();
        ui.success(`Discovery complete! Found ${progress.resourcesFound} resources`);

        // Show summary
        if (inventory?.summary) {
          ui.newLine();
          ui.print('  Resources by service:');
          for (const [service, count] of Object.entries(inventory.summary.resourcesByService || {})) {
            ui.print(`    ${service}: ${count}`);
          }
        }
      } else if (status === 'failed') {
        ui.newLine();
        return { success: false, error: 'Discovery failed' };
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
 * Step 5: Generation Options
 */
async function generationOptionsStep(ctx: TerraformWizardContext): Promise<StepResult> {
  // Import method
  const importMethod = await select<'both' | 'blocks' | 'script'>({
    message: 'How should imports be generated?',
    options: [
      {
        value: 'both',
        label: 'Both import blocks and shell script (Recommended)',
        description: 'Maximum compatibility with all Terraform versions',
      },
      {
        value: 'blocks',
        label: 'Import blocks only (Terraform 1.5+)',
        description: 'Modern declarative imports',
      },
      {
        value: 'script',
        label: 'Shell script only',
        description: 'Traditional terraform import commands',
      },
    ],
    defaultValue: 'both',
  });

  // Starter kit options
  ui.newLine();
  const includeStarterKit = await confirm({
    message: 'Generate starter kit (README, .gitignore, Makefile, CI/CD)?',
    defaultValue: true,
  });

  return {
    success: true,
    data: {
      importMethod,
      includeReadme: includeStarterKit,
      includeGitignore: includeStarterKit,
      includeMakefile: includeStarterKit,
      includeGithubActions: includeStarterKit,
    },
  };
}

/**
 * Step 6: Output Location
 */
async function outputLocationStep(ctx: TerraformWizardContext): Promise<StepResult> {
  const outputPath = await pathInput(
    'Where should the Terraform files be saved?',
    ctx.outputPath || './terraform-infrastructure'
  );

  if (!outputPath) {
    return { success: false, error: 'Output path is required' };
  }

  // Ask about saving preferences
  ui.newLine();
  const savePreferences = await confirm({
    message: 'Save your preferences as organization policy for future runs?',
    defaultValue: false,
  });

  return {
    success: true,
    data: {
      outputPath,
      savePreferences,
    },
  };
}

/**
 * Run in non-interactive mode
 */
async function runNonInteractive(options: GenerateTerraformOptions): Promise<void> {
  ui.header('nimbus generate terraform', 'Non-interactive mode');

  // Validate required options
  if (!options.profile) {
    ui.error('Profile is required in non-interactive mode (--profile)');
    process.exit(1);
  }

  ui.info(`Using profile: ${options.profile}`);
  ui.info(`Regions: ${options.regions?.join(', ') || 'all'}`);
  ui.info(`Services: ${options.services?.join(', ') || 'all'}`);
  ui.info(`Output: ${options.output || './terraform-infrastructure'}`);

  // TODO: Implement non-interactive flow
  ui.warning('Non-interactive mode is not yet fully implemented');
}

// Export as default command
export default generateTerraformCommand;
