/**
 * Generate Terraform Command
 *
 * Interactive wizard for AWS infrastructure discovery and Terraform generation
 *
 * Usage: nimbus generate terraform [options]
 */

import { logger } from '../utils';
import { RestClient } from '../clients';
import {
  createWizard,
  ui,
  select,
  multiSelect,
  confirm,
  input,
  pathInput,
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

// GCP Tools Service client
const gcpToolsUrl = process.env.GCP_TOOLS_SERVICE_URL || 'http://localhost:3016';
const gcpClient = new RestClient(gcpToolsUrl);

// Azure Tools Service client
const azureToolsUrl = process.env.AZURE_TOOLS_SERVICE_URL || 'http://localhost:3017';
const azureClient = new RestClient(azureToolsUrl);

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
  provider?: 'aws' | 'gcp' | 'azure';
  gcpProject?: string;
  azureSubscription?: string;
  jsonOutput?: boolean;
  questionnaire?: boolean;
  conversational?: boolean;
  skipValidation?: boolean;
  validationMode?: 'required' | 'optional';
}

/**
 * Run the generate terraform command
 */
export async function generateTerraformCommand(
  options: GenerateTerraformOptions = {}
): Promise<void> {
  logger.info('Starting Terraform generation wizard');

  // Non-interactive mode
  if (options.nonInteractive) {
    await runNonInteractive(options);
    return;
  }

  // Questionnaire mode
  if (options.questionnaire) {
    const { questionnaireCommand } = await import('./questionnaire');
    await questionnaireCommand({
      type: 'terraform',
      outputDir: options.output,
    });
    return;
  }

  // Conversational mode (Mode B)
  if (options.conversational) {
    await runConversational(options);
    return;
  }

  // Interactive wizard mode
  const steps = createWizardSteps();

  const wizard = createWizard<TerraformWizardContext>({
    title: 'nimbus generate terraform',
    description: 'Generate Terraform from your cloud infrastructure',
    initialContext: {
      provider: 'aws',
      awsProfile: options.profile,
      awsRegions: options.regions,
      servicesToScan: options.services,
      outputPath: options.output,
    },
    steps,
    onEvent: event => {
      if (event.type === 'step:start' && process.stdout.isTTY) {
        const idx = steps.findIndex(s => s.id === event.stepId);
        if (idx >= 0) {
          // Visual step progress bar
          const progress = steps.map((s, i) => {
            if (i < idx) {
              return ui.color(`\u2713 ${s.title}`, 'green');
            }
            if (i === idx) {
              return ui.color(`\u25CF ${s.title}`, 'cyan');
            }
            return ui.dim(`\u25CB ${s.title}`);
          });
          ui.newLine();
          ui.print(ui.dim('  Progress: ') + progress.join(ui.dim(' \u2500 ')));
        }
      }
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
      condition: ctx => ctx.provider === 'aws',
      execute: awsConfigStep,
    },

    // Step 3: Service Selection
    {
      id: 'services',
      title: 'Service Selection',
      description: 'Select which AWS services to scan',
      condition: ctx => ctx.provider === 'aws',
      execute: serviceSelectionStep,
    },

    // GCP Configuration
    {
      id: 'gcp-config',
      title: 'GCP Configuration',
      description: 'Configure GCP project and regions to scan',
      condition: ctx => ctx.provider === 'gcp',
      execute: gcpConfigStep,
    },

    // GCP Service Selection
    {
      id: 'gcp-services',
      title: 'GCP Service Selection',
      description: 'Select which GCP services to scan',
      condition: ctx => ctx.provider === 'gcp',
      execute: gcpServiceSelectionStep,
    },

    // Azure Configuration
    {
      id: 'azure-config',
      title: 'Azure Configuration',
      description: 'Configure Azure subscription and resource group',
      condition: ctx => ctx.provider === 'azure',
      execute: azureConfigStep,
    },

    // Azure Service Selection
    {
      id: 'azure-services',
      title: 'Azure Service Selection',
      description: 'Select which Azure services to scan',
      condition: ctx => ctx.provider === 'azure',
      execute: azureServiceSelectionStep,
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
        description: 'Scan Compute, GCS, GKE, Cloud Functions, VPC, IAM',
      },
      {
        value: 'azure',
        label: 'Azure (Microsoft Azure)',
        description: 'Scan VMs, Storage, AKS, Functions, VNet, IAM',
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

        selectedRegions = (await multiSelect({
          message: 'Select regions to scan:',
          options: regionOptions,
          required: true,
        })) as string[];
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
async function serviceSelectionStep(_ctx: TerraformWizardContext): Promise<StepResult> {
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
 * GCP Configuration Step
 */
async function gcpConfigStep(ctx: TerraformWizardContext): Promise<StepResult> {
  // Project ID
  const projectId = await input({
    message: 'Enter your GCP project ID:',
    defaultValue: ctx.gcpProject || '',
  });

  if (!projectId) {
    return { success: false, error: 'GCP project ID is required' };
  }

  // Validate project access
  ui.startSpinner({ message: `Validating access to project "${projectId}"...` });

  try {
    const validateResponse = await gcpClient.post<{
      valid: boolean;
      projectName?: string;
      error?: string;
    }>('/api/gcp/projects/validate', { projectId });

    if (!validateResponse.success || !validateResponse.data?.valid) {
      ui.stopSpinnerFail(`Invalid project: ${validateResponse.data?.error || 'Unknown error'}`);
      return { success: false, error: 'Invalid GCP project' };
    }

    ui.stopSpinnerSuccess(
      `Connected to project ${projectId}${
        validateResponse.data.projectName ? ` (${validateResponse.data.projectName})` : ''
      }`
    );
  } catch (error: any) {
    ui.stopSpinnerFail(`Failed to validate project: ${error.message}`);
    return { success: false, error: 'Project validation failed' };
  }

  // Region selection
  ui.newLine();

  const regionChoice = await select<'all' | 'specific'>({
    message: 'Select regions to scan:',
    options: [
      {
        value: 'all',
        label: 'All available regions',
        description: 'Scan all GCP regions',
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
    const gcpRegionOptions = [
      { value: 'us-central1', label: 'us-central1 - Iowa' },
      { value: 'us-east1', label: 'us-east1 - South Carolina' },
      { value: 'us-east4', label: 'us-east4 - Northern Virginia' },
      { value: 'us-west1', label: 'us-west1 - Oregon' },
      { value: 'europe-west1', label: 'europe-west1 - Belgium' },
      { value: 'europe-west2', label: 'europe-west2 - London' },
      { value: 'asia-east1', label: 'asia-east1 - Taiwan' },
      { value: 'asia-southeast1', label: 'asia-southeast1 - Singapore' },
    ];

    selectedRegions = (await multiSelect({
      message: 'Select GCP regions to scan:',
      options: gcpRegionOptions,
      required: true,
    })) as string[];
  }

  return {
    success: true,
    data: {
      gcpProject: projectId,
      gcpRegions: regionChoice === 'all' ? undefined : selectedRegions,
    },
  };
}

/**
 * GCP Service Selection Step
 */
async function gcpServiceSelectionStep(_ctx: TerraformWizardContext): Promise<StepResult> {
  const serviceChoice = await select<'all' | 'specific'>({
    message: 'Select GCP services to scan:',
    options: [
      {
        value: 'all',
        label: 'All supported services',
        description: 'Compute, GCS, GKE, Cloud Functions, VPC, IAM, Cloud SQL, Pub/Sub',
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
    { value: 'Compute', label: 'Compute Engine', description: 'VMs, disks, images' },
    { value: 'GCS', label: 'Cloud Storage', description: 'Buckets and objects' },
    { value: 'GKE', label: 'Google Kubernetes Engine', description: 'Clusters and node pools' },
    { value: 'CloudFunctions', label: 'Cloud Functions', description: 'Serverless functions' },
    { value: 'VPC', label: 'VPC Network', description: 'Networks, subnets, firewalls' },
    { value: 'IAM', label: 'IAM', description: 'Roles, service accounts, policies' },
    { value: 'CloudSQL', label: 'Cloud SQL', description: 'Database instances' },
    { value: 'PubSub', label: 'Pub/Sub', description: 'Topics and subscriptions' },
  ];

  const selectedServices = await multiSelect({
    message: 'Select GCP services to scan:',
    options: serviceOptions,
    required: true,
  });

  return {
    success: true,
    data: { servicesToScan: selectedServices as string[] },
  };
}

/**
 * Azure Configuration Step
 */
async function azureConfigStep(ctx: TerraformWizardContext): Promise<StepResult> {
  // Subscription ID
  const subscriptionId = await input({
    message: 'Enter your Azure subscription ID:',
    defaultValue: ctx.azureSubscription || '',
  });

  if (!subscriptionId) {
    return { success: false, error: 'Azure subscription ID is required' };
  }

  // Validate subscription access
  ui.startSpinner({ message: `Validating access to subscription "${subscriptionId}"...` });

  try {
    const validateResponse = await azureClient.post<{
      valid: boolean;
      subscriptionName?: string;
      error?: string;
    }>('/api/azure/subscriptions/validate', { subscriptionId });

    if (!validateResponse.success || !validateResponse.data?.valid) {
      ui.stopSpinnerFail(
        `Invalid subscription: ${validateResponse.data?.error || 'Unknown error'}`
      );
      return { success: false, error: 'Invalid Azure subscription' };
    }

    ui.stopSpinnerSuccess(
      `Connected to subscription ${subscriptionId}${
        validateResponse.data.subscriptionName ? ` (${validateResponse.data.subscriptionName})` : ''
      }`
    );
  } catch (error: any) {
    ui.stopSpinnerFail(`Failed to validate subscription: ${error.message}`);
    return { success: false, error: 'Subscription validation failed' };
  }

  // Resource group (optional)
  ui.newLine();
  const resourceGroup = await input({
    message: 'Resource group (leave empty to scan all):',
    defaultValue: ctx.azureResourceGroup || '',
  });

  // Region selection
  ui.newLine();

  const regionChoice = await select<'all' | 'specific'>({
    message: 'Select regions to scan:',
    options: [
      {
        value: 'all',
        label: 'All available regions',
        description: 'Scan all Azure regions',
      },
      {
        value: 'specific',
        label: 'Specific regions',
        description: 'Select specific regions to scan',
      },
    ],
    defaultValue: 'all',
  });

  let _selectedRegions: string[] = [];

  if (regionChoice === 'specific') {
    const azureRegionOptions = [
      { value: 'eastus', label: 'East US' },
      { value: 'eastus2', label: 'East US 2' },
      { value: 'westus2', label: 'West US 2' },
      { value: 'centralus', label: 'Central US' },
      { value: 'westeurope', label: 'West Europe' },
      { value: 'northeurope', label: 'North Europe' },
      { value: 'southeastasia', label: 'Southeast Asia' },
      { value: 'eastasia', label: 'East Asia' },
    ];

    _selectedRegions = (await multiSelect({
      message: 'Select Azure regions to scan:',
      options: azureRegionOptions,
      required: true,
    })) as string[];
  }

  return {
    success: true,
    data: {
      azureSubscription: subscriptionId,
      azureResourceGroup: resourceGroup || undefined,
    },
  };
}

/**
 * Azure Service Selection Step
 */
async function azureServiceSelectionStep(_ctx: TerraformWizardContext): Promise<StepResult> {
  const serviceChoice = await select<'all' | 'specific'>({
    message: 'Select Azure services to scan:',
    options: [
      {
        value: 'all',
        label: 'All supported services',
        description: 'VMs, Storage, AKS, Functions, VNet, IAM, SQL, Service Bus',
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
    { value: 'VirtualMachines', label: 'Virtual Machines', description: 'VMs, disks, images' },
    {
      value: 'Storage',
      label: 'Storage Accounts',
      description: 'Blob, file, queue, table storage',
    },
    { value: 'AKS', label: 'Azure Kubernetes Service', description: 'Clusters and node pools' },
    { value: 'Functions', label: 'Azure Functions', description: 'Serverless functions' },
    { value: 'VNet', label: 'Virtual Network', description: 'VNets, subnets, NSGs' },
    { value: 'IAM', label: 'IAM', description: 'Role assignments, managed identities' },
    { value: 'SQLDatabase', label: 'Azure SQL', description: 'SQL databases and servers' },
    { value: 'ServiceBus', label: 'Service Bus', description: 'Queues and topics' },
  ];

  const selectedServices = await multiSelect({
    message: 'Select Azure services to scan:',
    options: serviceOptions,
    required: true,
  });

  return {
    success: true,
    data: { servicesToScan: selectedServices as string[] },
  };
}

/**
 * Poll a discovery session until completion
 */
async function pollDiscovery(
  client: RestClient,
  startPath: string,
  statusPath: (sessionId: string) => string,
  startPayload: Record<string, unknown>,
  ctx: TerraformWizardContext
): Promise<StepResult> {
  try {
    const startResponse = await client.post<{
      sessionId: string;
      status: string;
    }>(startPath, startPayload);

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

      const statusResponse = await client.get<{
        status: string;
        progress: {
          regionsScanned: number;
          totalRegions: number;
          resourcesFound: number;
          currentRegion?: string;
          currentService?: string;
        };
        inventory?: any;
      }>(statusPath(sessionId));

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
          for (const [service, count] of Object.entries(
            inventory.summary.resourcesByService || {}
          )) {
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
 * Step: Discovery
 */
async function discoveryStep(ctx: TerraformWizardContext): Promise<StepResult> {
  ui.print('  Starting infrastructure discovery...');
  ui.newLine();

  switch (ctx.provider) {
    case 'gcp':
      return pollDiscovery(
        gcpClient,
        '/api/gcp/discover/start',
        id => `/api/gcp/discover/session/${id}`,
        {
          projectId: ctx.gcpProject,
          regions: ctx.gcpRegions || 'all',
          services: ctx.servicesToScan,
        },
        ctx
      );

    case 'azure':
      return pollDiscovery(
        azureClient,
        '/api/azure/discover/start',
        id => `/api/azure/discover/session/${id}`,
        {
          subscriptionId: ctx.azureSubscription,
          resourceGroup: ctx.azureResourceGroup,
          services: ctx.servicesToScan,
        },
        ctx
      );

    case 'aws':
    default:
      return pollDiscovery(
        awsClient,
        '/api/aws/discover',
        id => `/api/aws/discover/${id}`,
        {
          profile: ctx.awsProfile,
          regions: ctx.awsRegions || 'all',
          services: ctx.servicesToScan,
        },
        ctx
      );
  }
}

/**
 * Step 5: Generation Options
 */
async function generationOptionsStep(_ctx: TerraformWizardContext): Promise<StepResult> {
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
 * Run in conversational mode (Mode B)
 * Uses the generator service's conversational endpoints to describe infrastructure
 * in natural language and generate Terraform from the conversation.
 */
async function runConversational(options: GenerateTerraformOptions): Promise<void> {
  const crypto = await import('crypto');
  const fs = await import('fs/promises');
  const pathMod = await import('path');

  const sessionId = crypto.randomUUID();

  ui.header('nimbus generate terraform', 'Conversational mode');
  ui.print('Describe your infrastructure in natural language.');
  ui.print('Type "generate" or "done" when ready to generate Terraform.');
  ui.print('Type "exit" to quit.');
  ui.newLine();

  for (;;) {
    const message = await input({
      message: 'You:',
      defaultValue: '',
    });

    if (!message || message.trim() === '') {
      continue;
    }

    const trimmed = message.trim().toLowerCase();

    if (trimmed === 'exit') {
      ui.info('Exiting conversational mode.');
      return;
    }

    // User explicitly wants to generate
    if (trimmed === 'generate' || trimmed === 'done') {
      const generated = await generateFromConversation(sessionId, options, fs, pathMod);
      if (generated) {
        ui.newLine();
        ui.print('You can refine the generated Terraform by continuing the conversation.');
        ui.print('Type "generate" to regenerate, or "exit" to finish.');
        ui.newLine();
        continue; // stays in the while(true) loop with same sessionId
      }
      return;
    }

    // Send message to conversational endpoint
    try {
      const response = await generatorClient.post<{
        message: string;
        suggested_actions?: Array<{ type: string; label?: string }>;
      }>('/api/conversational/message', { sessionId, message });

      if (response.success && response.data) {
        const data = response.data as any;
        // Handle double-unwrap pattern: response.data may contain { data: { message } }
        const replyMessage = data.data?.message || data.message || 'No response';
        ui.newLine();
        ui.print(replyMessage);
        ui.newLine();

        // Check for generate suggestion
        const actions = data.data?.suggested_actions || data.suggested_actions || [];
        const generateAction = actions.find((a: any) => a.type === 'generate');
        if (generateAction) {
          const shouldGenerate = await confirm({
            message: 'Ready to generate Terraform from this conversation?',
            defaultValue: true,
          });
          if (shouldGenerate) {
            const generated = await generateFromConversation(sessionId, options, fs, pathMod);
            if (generated) {
              ui.newLine();
              ui.print('You can refine the generated Terraform by continuing the conversation.');
              ui.print('Type "generate" to regenerate, or "exit" to finish.');
              ui.newLine();
              continue; // stays in the while(true) loop with same sessionId
            }
            return;
          }
        }
      } else {
        ui.error('Failed to get response from generator service.');
      }
    } catch (error: any) {
      ui.error(`Error: ${error.message}`);
    }
  }
}

/**
 * Generate Terraform files from a conversational session
 */
async function generateFromConversation(
  sessionId: string,
  options: GenerateTerraformOptions,
  fs: typeof import('fs/promises'),
  pathMod: typeof import('path')
): Promise<boolean> {
  ui.newLine();
  ui.startSpinner({ message: 'Generating Terraform from conversation...' });

  try {
    const genResponse = await generatorClient.post<{
      files: Array<{ path: string; content: string }>;
    }>('/api/generate/from-conversation', {
      sessionId,
      applyBestPractices: true,
    });

    if (!genResponse.success || !genResponse.data) {
      ui.stopSpinnerFail('Generation failed');
      return false;
    }

    ui.stopSpinnerSuccess('Terraform code generated');

    // Write files — same pattern as runNonInteractive
    const data = genResponse.data as any;
    const files: Array<{ path: string; content: string }> = data.data?.files || data.files || [];
    const outputDir = options.output || './infrastructure';

    await fs.mkdir(outputDir, { recursive: true });

    for (const file of files) {
      const filePath = pathMod.join(outputDir, file.path);
      await fs.mkdir(pathMod.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.content);
    }

    // Post-generation validation (Gaps C+D)
    if (!options.skipValidation && files.length > 0) {
      await runPostGenerationValidation(files, false);
    }

    ui.newLine();
    ui.success(`Generated ${files.length} Terraform file(s) in ${outputDir}`);
    ui.newLine();
    ui.print('Generated files:');
    for (const file of files) {
      ui.print(`  ${ui.color('●', 'green')} ${file.path}`);
    }
    ui.newLine();
    ui.print('Next steps:');
    ui.print(`  1. Review the generated files in ${outputDir}`);
    ui.print('  2. Run "terraform plan" to preview changes');
    ui.print('  3. Run "terraform apply" to create infrastructure');
    return true;
  } catch (error: any) {
    ui.stopSpinnerFail('Generation failed');
    ui.error(`Failed to generate Terraform: ${error.message}`);
    return false;
  }
}

/**
 * Run in non-interactive mode
 */
async function runNonInteractive(options: GenerateTerraformOptions): Promise<void> {
  ui.header('nimbus generate terraform', 'Non-interactive mode');

  const provider = options.provider || 'aws';

  // Validate required flags per provider
  if (provider === 'aws' && !options.profile) {
    ui.error('AWS profile is required in non-interactive mode (--profile)');
    process.exit(1);
  }
  if (provider === 'gcp' && !options.gcpProject) {
    ui.error('GCP project is required in non-interactive mode (--gcp-project)');
    process.exit(1);
  }
  if (provider === 'azure' && !options.azureSubscription) {
    ui.error('Azure subscription is required in non-interactive mode (--azure-subscription)');
    process.exit(1);
  }

  ui.info(`Provider: ${provider}`);
  if (provider === 'aws') {
    ui.info(`Profile: ${options.profile}`);
  } else if (provider === 'gcp') {
    ui.info(`Project: ${options.gcpProject}`);
  } else if (provider === 'azure') {
    ui.info(`Subscription: ${options.azureSubscription}`);
  }
  ui.info(`Regions: ${options.regions?.join(', ') || 'all'}`);
  ui.info(`Services: ${options.services?.join(', ') || 'all'}`);
  ui.info(`Output: ${options.output || './terraform-infrastructure'}`);
  ui.newLine();

  // Build discovery context
  const ctx: TerraformWizardContext = {
    provider,
    awsProfile: options.profile,
    awsRegions: options.regions,
    gcpProject: options.gcpProject,
    azureSubscription: options.azureSubscription,
    servicesToScan: options.services,
    outputPath: options.output || './terraform-infrastructure',
  };

  // Run discovery using the pollDiscovery helper (already implemented for Gap 1)
  ui.info('Starting infrastructure discovery...');
  ui.newLine();

  let discoveryResult: StepResult;

  switch (provider) {
    case 'gcp':
      discoveryResult = await pollDiscovery(
        gcpClient,
        '/api/gcp/discover/start',
        id => `/api/gcp/discover/session/${id}`,
        {
          projectId: ctx.gcpProject,
          regions: ctx.awsRegions || 'all',
          services: ctx.servicesToScan,
        },
        ctx
      );
      break;

    case 'azure':
      discoveryResult = await pollDiscovery(
        azureClient,
        '/api/azure/discover/start',
        id => `/api/azure/discover/session/${id}`,
        {
          subscriptionId: ctx.azureSubscription,
          services: ctx.servicesToScan,
        },
        ctx
      );
      break;

    case 'aws':
    default:
      discoveryResult = await pollDiscovery(
        awsClient,
        '/api/aws/discover',
        id => `/api/aws/discover/${id}`,
        {
          profile: ctx.awsProfile,
          regions: ctx.awsRegions || 'all',
          services: ctx.servicesToScan,
        },
        ctx
      );
      break;
  }

  if (!discoveryResult.success) {
    ui.error(`Discovery failed: ${discoveryResult.error || 'Unknown error'}`);
    process.exit(1);
  }

  // Generate Terraform from discovered inventory
  ui.newLine();
  ui.startSpinner({ message: 'Generating Terraform code...' });

  try {
    const genResponse = await generatorClient.post<{
      files: Array<{ path: string; content: string }>;
      validation?: any;
    }>('/api/generators/terraform/project', {
      projectName: 'infrastructure',
      provider,
      region: options.regions?.[0],
      components: options.services,
      inventory: ctx.inventory,
    });

    if (!genResponse.success || !genResponse.data) {
      ui.stopSpinnerFail('Generation failed');
      ui.error(genResponse.error?.message || 'Failed to generate Terraform code');
      process.exit(1);
    }

    ui.stopSpinnerSuccess('Terraform code generated');

    // Write generated files
    const outputDir = options.output || './terraform-infrastructure';
    const fs = await import('fs/promises');
    const path = await import('path');

    await fs.mkdir(outputDir, { recursive: true });

    const files = genResponse.data.files || [];
    for (const file of files) {
      const filePath = path.join(outputDir, file.path);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.content);
    }

    // --- Post-generation validation (Gaps C+D) ---
    let validationResults: Record<string, unknown> | undefined;
    if (!options.skipValidation && files.length > 0) {
      validationResults = await runPostGenerationValidation(files, options.jsonOutput);
    }

    if (options.jsonOutput) {
      // JSON output mode
      const summary = {
        success: true,
        provider,
        outputDir,
        filesGenerated: files.map(f => f.path),
        resourcesDiscovered: ctx.inventory?.summary?.totalResources || 0,
        validation: genResponse.data.validation,
        postGenerationValidation: validationResults,
      };
      console.log(JSON.stringify(summary, null, 2));
    } else {
      // Human-readable output
      ui.newLine();
      ui.success(`Generated ${files.length} Terraform file(s) in ${outputDir}`);
      ui.newLine();
      ui.print('Generated files:');
      for (const file of files) {
        ui.print(`  ${ui.color('●', 'green')} ${file.path}`);
      }
      ui.newLine();
      ui.print('Next steps:');
      ui.print(`  1. Review the generated files in ${outputDir}`);
      ui.print('  2. Run "terraform plan" to see what will be imported');
      ui.print('  3. Run "terraform apply" to bring resources under Terraform control');
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Generation failed');
    ui.error(`Failed to generate Terraform: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Run post-generation validation by calling the generator service's
 * existing validation endpoint with the generated files.
 *
 * Non-blocking: if the validation service call fails, a warning is shown
 * and the function returns undefined so the caller can continue normally.
 */
async function runPostGenerationValidation(
  files: Array<{ path: string; content: string }>,
  jsonOutput?: boolean
): Promise<Record<string, unknown> | undefined> {
  try {
    if (!jsonOutput) {
      ui.newLine();
      ui.startSpinner({ message: 'Running post-generation validation...' });
    }

    const validateResponse = await generatorClient.post<{
      valid: boolean;
      items: Array<{ severity: string; message: string; file?: string; rule?: string }>;
      summary: { errors: number; warnings: number; info: number };
    }>('/api/generators/terraform/validate', { files });

    if (!validateResponse.success || !validateResponse.data) {
      if (!jsonOutput) {
        ui.stopSpinnerFail('Validation service unavailable');
        ui.warning('Skipping validation — generator service did not respond.');
      }
      return undefined;
    }

    const report = validateResponse.data as any;
    const data = report.data || report;

    if (!jsonOutput) {
      ui.stopSpinnerSuccess('Validation complete');
      ui.newLine();
      displayValidationReport(data);
    }

    return data;
  } catch (error: any) {
    if (!jsonOutput) {
      ui.stopSpinnerFail('Validation failed');
      ui.warning(`Post-generation validation could not run: ${error.message}`);
      ui.warning('You can run validation manually with: nimbus validate terraform');
    }
    return undefined;
  }
}

/**
 * Display a human-readable validation report.
 * Shows results for terraform fmt, terraform validate, tflint, and checkov.
 * Tools that are not installed show as "not installed" gracefully.
 */
function displayValidationReport(report: any): void {
  const items: Array<{ severity: string; message: string; file?: string; rule?: string }> =
    report.items || [];
  const summary = report.summary || { errors: 0, warnings: 0, info: 0 };

  // Overall status
  const isValid = report.valid !== false && summary.errors === 0;
  if (isValid) {
    ui.print(`  ${ui.color('\u2713', 'green')} Validation passed`);
  } else {
    ui.print(`  ${ui.color('\u2717', 'red')} Validation found issues`);
  }

  // Summary line
  const parts: string[] = [];
  if (summary.errors > 0) {
    parts.push(ui.color(`${summary.errors} error(s)`, 'red'));
  }
  if (summary.warnings > 0) {
    parts.push(ui.color(`${summary.warnings} warning(s)`, 'yellow'));
  }
  if (summary.info > 0) {
    parts.push(ui.dim(`${summary.info} info`));
  }
  if (parts.length > 0) {
    ui.print(`  Summary: ${parts.join(', ')}`);
  }

  // Tool-level results (grouped by rule prefix)
  const toolStatus: Record<string, 'pass' | 'fail' | 'not-installed'> = {
    'terraform-fmt': 'pass',
    'terraform-validate': 'pass',
    tflint: 'pass',
    checkov: 'pass',
  };

  for (const item of items) {
    if (item.severity === 'error' || item.severity === 'warning') {
      const rule = item.rule || '';
      if (rule.startsWith('fmt') || rule.includes('format')) {
        toolStatus['terraform-fmt'] = 'fail';
      } else if (rule.startsWith('hcl') || rule.includes('syntax')) {
        toolStatus['terraform-validate'] = 'fail';
      } else if (rule.startsWith('require-') || rule.includes('anti-pattern')) {
        toolStatus['tflint'] = 'fail';
      } else if (rule.startsWith('checkov') || rule.includes('security')) {
        toolStatus['checkov'] = 'fail';
      }
    }
  }

  ui.newLine();
  ui.print('  Tool Results:');
  for (const [tool, status] of Object.entries(toolStatus)) {
    const icon =
      status === 'pass'
        ? ui.color('\u2713', 'green')
        : status === 'fail'
          ? ui.color('\u2717', 'red')
          : ui.dim('-');
    const label = status === 'not-installed' ? ui.dim('not installed') : status;
    ui.print(`    ${icon} ${tool}: ${label}`);
  }

  // Show first 5 error/warning details
  const significant = items.filter(i => i.severity === 'error' || i.severity === 'warning');
  if (significant.length > 0) {
    ui.newLine();
    ui.print('  Details:');
    const toShow = significant.slice(0, 5);
    for (const item of toShow) {
      const sevIcon = item.severity === 'error' ? ui.color('E', 'red') : ui.color('W', 'yellow');
      const fileInfo = item.file ? ` (${item.file})` : '';
      ui.print(`    [${sevIcon}] ${item.message}${fileInfo}`);
    }
    if (significant.length > 5) {
      ui.print(ui.dim(`    ... and ${significant.length - 5} more`));
    }
  }
}

// Export as default command
export default generateTerraformCommand;
