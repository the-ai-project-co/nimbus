/**
 * Import Command
 *
 * Import existing cloud resources into Terraform state
 */

import { ui } from '../wizard/ui';
import { select, input, multiSelect } from '../wizard/prompts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

// ==========================================
// Types
// ==========================================

export interface ImportOptions {
  /** Cloud provider: aws, gcp, azure */
  provider?: 'aws' | 'gcp' | 'azure';
  /** Resource type to import */
  resourceType?: string;
  /** Resource ID to import */
  resourceId?: string;
  /** Output directory for generated Terraform */
  output?: string;
  /** Non-interactive mode */
  nonInteractive?: boolean;
  /** Region */
  region?: string;
}

interface DiscoveredResource {
  id: string;
  name: string;
  type: string;
  region: string;
  tags?: Record<string, string>;
  arn?: string;
}

interface ImportableResource {
  terraformType: string;
  cloudType: string;
  description: string;
  provider: 'aws' | 'gcp' | 'azure';
}

// ==========================================
// Constants
// ==========================================

const IMPORTABLE_RESOURCES: ImportableResource[] = [
  // AWS
  {
    terraformType: 'aws_vpc',
    cloudType: 'vpc',
    description: 'Virtual Private Cloud',
    provider: 'aws',
  },
  { terraformType: 'aws_subnet', cloudType: 'subnet', description: 'VPC Subnet', provider: 'aws' },
  {
    terraformType: 'aws_security_group',
    cloudType: 'security-group',
    description: 'Security Group',
    provider: 'aws',
  },
  { terraformType: 'aws_instance', cloudType: 'ec2', description: 'EC2 Instance', provider: 'aws' },
  {
    terraformType: 'aws_db_instance',
    cloudType: 'rds',
    description: 'RDS Database',
    provider: 'aws',
  },
  { terraformType: 'aws_s3_bucket', cloudType: 's3', description: 'S3 Bucket', provider: 'aws' },
  {
    terraformType: 'aws_lambda_function',
    cloudType: 'lambda',
    description: 'Lambda Function',
    provider: 'aws',
  },
  {
    terraformType: 'aws_iam_role',
    cloudType: 'iam-role',
    description: 'IAM Role',
    provider: 'aws',
  },
  {
    terraformType: 'aws_eks_cluster',
    cloudType: 'eks',
    description: 'EKS Cluster',
    provider: 'aws',
  },
  {
    terraformType: 'aws_elasticache_cluster',
    cloudType: 'elasticache',
    description: 'ElastiCache Cluster',
    provider: 'aws',
  },

  // GCP
  {
    terraformType: 'google_compute_network',
    cloudType: 'vpc',
    description: 'VPC Network',
    provider: 'gcp',
  },
  {
    terraformType: 'google_compute_subnetwork',
    cloudType: 'subnet',
    description: 'VPC Subnet',
    provider: 'gcp',
  },
  {
    terraformType: 'google_compute_instance',
    cloudType: 'gce',
    description: 'Compute Instance',
    provider: 'gcp',
  },
  {
    terraformType: 'google_sql_database_instance',
    cloudType: 'cloudsql',
    description: 'Cloud SQL Instance',
    provider: 'gcp',
  },
  {
    terraformType: 'google_storage_bucket',
    cloudType: 'gcs',
    description: 'Cloud Storage Bucket',
    provider: 'gcp',
  },
  {
    terraformType: 'google_cloudfunctions_function',
    cloudType: 'functions',
    description: 'Cloud Function',
    provider: 'gcp',
  },
  {
    terraformType: 'google_container_cluster',
    cloudType: 'gke',
    description: 'GKE Cluster',
    provider: 'gcp',
  },

  // Azure
  {
    terraformType: 'azurerm_virtual_network',
    cloudType: 'vnet',
    description: 'Virtual Network',
    provider: 'azure',
  },
  {
    terraformType: 'azurerm_subnet',
    cloudType: 'subnet',
    description: 'Subnet',
    provider: 'azure',
  },
  {
    terraformType: 'azurerm_virtual_machine',
    cloudType: 'vm',
    description: 'Virtual Machine',
    provider: 'azure',
  },
  {
    terraformType: 'azurerm_sql_database',
    cloudType: 'sql',
    description: 'SQL Database',
    provider: 'azure',
  },
  {
    terraformType: 'azurerm_storage_account',
    cloudType: 'storage',
    description: 'Storage Account',
    provider: 'azure',
  },
  {
    terraformType: 'azurerm_function_app',
    cloudType: 'functions',
    description: 'Function App',
    provider: 'azure',
  },
  {
    terraformType: 'azurerm_kubernetes_cluster',
    cloudType: 'aks',
    description: 'AKS Cluster',
    provider: 'azure',
  },
];

// ==========================================
// Parsers
// ==========================================

/**
 * Parse import options
 */
export function parseImportOptions(args: string[]): ImportOptions {
  const options: ImportOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--provider' && args[i + 1]) {
      options.provider = args[++i] as 'aws' | 'gcp' | 'azure';
    } else if (arg === '--resource-type' && args[i + 1]) {
      options.resourceType = args[++i];
    } else if (arg === '--resource-id' && args[i + 1]) {
      options.resourceId = args[++i];
    } else if (arg === '--output' && args[i + 1]) {
      options.output = args[++i];
    } else if (arg === '-o' && args[i + 1]) {
      options.output = args[++i];
    } else if (arg === '--region' && args[i + 1]) {
      options.region = args[++i];
    } else if (arg === '--non-interactive' || arg === '-y') {
      options.nonInteractive = true;
    } else if (!arg.startsWith('-') && !options.provider) {
      options.provider = arg as 'aws' | 'gcp' | 'azure';
    }
  }

  return options;
}

// ==========================================
// Discovery Functions
// ==========================================

/**
 * Discover AWS resources
 */
function discoverAwsResources(resourceType: string, region: string): DiscoveredResource[] {
  const resources: DiscoveredResource[] = [];

  try {
    switch (resourceType) {
      case 'vpc': {
        const output = execSync(
          `aws ec2 describe-vpcs --region ${region} --query 'Vpcs[*].{id:VpcId,name:Tags[?Key==\`Name\`].Value|[0]}' --output json`,
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        const vpcs = JSON.parse(output);
        for (const vpc of vpcs) {
          resources.push({
            id: vpc.id,
            name: vpc.name || vpc.id,
            type: 'aws_vpc',
            region,
          });
        }
        break;
      }
      case 's3': {
        const output = execSync(`aws s3api list-buckets --query 'Buckets[*].Name' --output json`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const buckets = JSON.parse(output);
        for (const bucket of buckets) {
          resources.push({
            id: bucket,
            name: bucket,
            type: 'aws_s3_bucket',
            region: 'global',
          });
        }
        break;
      }
      case 'ec2': {
        const output = execSync(
          `aws ec2 describe-instances --region ${region} --query 'Reservations[*].Instances[*].{id:InstanceId,name:Tags[?Key==\`Name\`].Value|[0],state:State.Name}' --output json`,
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        const reservations = JSON.parse(output);
        for (const instances of reservations) {
          for (const instance of instances) {
            if (instance.state !== 'terminated') {
              resources.push({
                id: instance.id,
                name: instance.name || instance.id,
                type: 'aws_instance',
                region,
              });
            }
          }
        }
        break;
      }
      case 'rds': {
        const output = execSync(
          `aws rds describe-db-instances --region ${region} --query 'DBInstances[*].{id:DBInstanceIdentifier,arn:DBInstanceArn}' --output json`,
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        const instances = JSON.parse(output);
        for (const db of instances) {
          resources.push({
            id: db.id,
            name: db.id,
            type: 'aws_db_instance',
            region,
            arn: db.arn,
          });
        }
        break;
      }
      case 'security-group': {
        const output = execSync(
          `aws ec2 describe-security-groups --region ${region} --query 'SecurityGroups[*].{id:GroupId,name:GroupName}' --output json`,
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        const groups = JSON.parse(output);
        for (const sg of groups) {
          resources.push({
            id: sg.id,
            name: sg.name,
            type: 'aws_security_group',
            region,
          });
        }
        break;
      }
    }
  } catch (error) {
    // AWS CLI not available or not authenticated
  }

  return resources;
}

/**
 * Discover GCP resources
 */
function discoverGcpResources(resourceType: string, project?: string): DiscoveredResource[] {
  const resources: DiscoveredResource[] = [];
  const projectFlag = project ? `--project=${project}` : '';

  try {
    switch (resourceType) {
      case 'vpc': {
        const output = execSync(`gcloud compute networks list ${projectFlag} --format=json`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const networks = JSON.parse(output);
        for (const net of networks) {
          resources.push({
            id: net.name,
            name: net.name,
            type: 'google_compute_network',
            region: 'global',
          });
        }
        break;
      }
      case 'gce': {
        const output = execSync(`gcloud compute instances list ${projectFlag} --format=json`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const instances = JSON.parse(output);
        for (const inst of instances) {
          const zone = inst.zone?.split('/').pop() || 'unknown';
          resources.push({
            id: inst.name,
            name: inst.name,
            type: 'google_compute_instance',
            region: zone,
          });
        }
        break;
      }
      case 'cloudsql': {
        const output = execSync(`gcloud sql instances list ${projectFlag} --format=json`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const instances = JSON.parse(output);
        for (const db of instances) {
          resources.push({
            id: db.name,
            name: db.name,
            type: 'google_sql_database_instance',
            region: db.region || 'unknown',
          });
        }
        break;
      }
      case 'gcs': {
        const output = execSync(`gcloud storage buckets list ${projectFlag} --format=json`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const buckets = JSON.parse(output);
        for (const bucket of buckets) {
          const name = bucket.name || bucket.id?.replace('projects/_/buckets/', '') || 'unknown';
          resources.push({
            id: name,
            name,
            type: 'google_storage_bucket',
            region: bucket.location || 'global',
          });
        }
        break;
      }
    }
  } catch (error) {
    // gcloud CLI not available or not authenticated
  }

  return resources;
}

/**
 * Discover Azure resources
 */
function discoverAzureResources(resourceType: string, subscription?: string): DiscoveredResource[] {
  const resources: DiscoveredResource[] = [];
  const subFlag = subscription ? `--subscription "${subscription}"` : '';

  try {
    switch (resourceType) {
      case 'vm': {
        const output = execSync(`az vm list ${subFlag} -o json`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const vms = JSON.parse(output);
        for (const vm of vms) {
          resources.push({
            id: vm.id,
            name: vm.name,
            type: 'azurerm_virtual_machine',
            region: vm.location || 'unknown',
          });
        }
        break;
      }
      case 'vnet': {
        const output = execSync(`az network vnet list ${subFlag} -o json`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const vnets = JSON.parse(output);
        for (const vnet of vnets) {
          resources.push({
            id: vnet.id,
            name: vnet.name,
            type: 'azurerm_virtual_network',
            region: vnet.location || 'unknown',
          });
        }
        break;
      }
      case 'sql': {
        const output = execSync(`az sql server list ${subFlag} -o json`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const servers = JSON.parse(output);
        for (const server of servers) {
          resources.push({
            id: server.id,
            name: server.name,
            type: 'azurerm_sql_database',
            region: server.location || 'unknown',
          });
        }
        break;
      }
      case 'storage': {
        const output = execSync(`az storage account list ${subFlag} -o json`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const accounts = JSON.parse(output);
        for (const acct of accounts) {
          resources.push({
            id: acct.id,
            name: acct.name,
            type: 'azurerm_storage_account',
            region: acct.location || 'unknown',
          });
        }
        break;
      }
    }
  } catch (error) {
    // az CLI not available or not authenticated
  }

  return resources;
}

/**
 * Generate Terraform import block
 */
function generateImportBlock(resource: DiscoveredResource, terraformName: string): string {
  return `import {
  to = ${resource.type}.${terraformName}
  id = "${resource.id}"
}
`;
}

/**
 * Generate Terraform resource skeleton
 */
function generateResourceSkeleton(resource: DiscoveredResource, terraformName: string): string {
  const lines = [`resource "${resource.type}" "${terraformName}" {`];

  switch (resource.type) {
    case 'aws_vpc':
      lines.push('  # cidr_block = "10.0.0.0/16"');
      lines.push('  # enable_dns_hostnames = true');
      lines.push('  # enable_dns_support = true');
      break;
    case 'aws_s3_bucket':
      lines.push(`  bucket = "${resource.id}"`);
      break;
    case 'aws_instance':
      lines.push('  # ami = "ami-..."');
      lines.push('  # instance_type = "t3.micro"');
      break;
    case 'aws_db_instance':
      lines.push(`  identifier = "${resource.id}"`);
      lines.push('  # instance_class = "db.t3.micro"');
      lines.push('  # engine = "mysql"');
      break;
    case 'aws_security_group':
      lines.push(`  name = "${resource.name}"`);
      lines.push('  # vpc_id = aws_vpc.main.id');
      break;
    // GCP resources
    case 'google_compute_network':
      lines.push(`  name = "${resource.id}"`);
      lines.push('  auto_create_subnetworks = false');
      break;
    case 'google_compute_instance':
      lines.push(`  name = "${resource.id}"`);
      lines.push('  # machine_type = "e2-medium"');
      lines.push(`  # zone = "${resource.region}"`);
      break;
    case 'google_sql_database_instance':
      lines.push(`  name = "${resource.id}"`);
      lines.push('  # database_version = "MYSQL_8_0"');
      lines.push(`  # region = "${resource.region}"`);
      break;
    case 'google_storage_bucket':
      lines.push(`  name = "${resource.id}"`);
      lines.push(`  location = "${resource.region}"`);
      break;
    // Azure resources
    case 'azurerm_virtual_network':
      lines.push(`  name = "${resource.name}"`);
      lines.push(`  location = "${resource.region}"`);
      lines.push('  # resource_group_name = "my-rg"');
      lines.push('  # address_space = ["10.0.0.0/16"]');
      break;
    case 'azurerm_virtual_machine':
      lines.push(`  name = "${resource.name}"`);
      lines.push(`  location = "${resource.region}"`);
      lines.push('  # resource_group_name = "my-rg"');
      lines.push('  # vm_size = "Standard_DS1_v2"');
      break;
    case 'azurerm_sql_database':
      lines.push(`  name = "${resource.name}"`);
      lines.push('  # server_name = "my-sql-server"');
      lines.push('  # resource_group_name = "my-rg"');
      break;
    case 'azurerm_storage_account':
      lines.push(`  name = "${resource.name}"`);
      lines.push(`  location = "${resource.region}"`);
      lines.push('  # resource_group_name = "my-rg"');
      lines.push('  # account_tier = "Standard"');
      lines.push('  # account_replication_type = "LRS"');
      break;
    default:
      // Generate sensible stubs for unknown resource types using available metadata
      if (resource.name) {
        lines.push(`  name = "${resource.name}"`);
      }
      if (resource.region) {
        lines.push(`  location = "${resource.region}"`);
      }
      lines.push('');
      lines.push('  # Nimbus could not determine the exact attributes for this resource type.');
      lines.push(`  # Resource type: ${resource.type}`);
      lines.push(`  # Resource ID:   ${resource.id}`);
      lines.push('  #');
      lines.push('  # Next steps:');
      lines.push('  #   1. Run: terraform plan');
      lines.push('  #   2. Review the plan output for required attributes.');
      lines.push('  #   3. Add any missing attributes below with placeholder values.');
      lines.push('  #');
      lines.push('  # Common attributes for most resources:');
      lines.push('  # description = "REPLACE_ME"');
      lines.push('  # tags = {');
      lines.push('  #   Environment = "production"');
      lines.push('  #   ManagedBy   = "terraform"');
      lines.push('  # }');
  }

  if (resource.name && resource.name !== resource.id) {
    lines.push('');
    lines.push('  tags = {');
    lines.push(`    Name = "${resource.name}"`);
    lines.push('  }');
  }

  lines.push('}');
  return lines.join('\n');
}

// ==========================================
// Command
// ==========================================

/**
 * Import command
 */
export async function importCommand(options: ImportOptions): Promise<void> {
  ui.header('Nimbus Import', 'Import existing cloud resources into Terraform');

  // Select provider
  let provider = options.provider;
  if (!provider) {
    provider = (await select({
      message: 'Select cloud provider:',
      options: [
        { label: 'AWS', value: 'aws', description: 'Amazon Web Services' },
        { label: 'GCP', value: 'gcp', description: 'Google Cloud Platform' },
        { label: 'Azure', value: 'azure', description: 'Microsoft Azure' },
      ],
    })) as 'aws' | 'gcp' | 'azure';
  }

  // Get region/project/subscription
  let region = options.region;
  if (!region) {
    if (provider === 'aws') {
      region = await input({
        message: 'AWS Region:',
        defaultValue: process.env.AWS_DEFAULT_REGION || 'us-east-1',
      });
    } else if (provider === 'gcp') {
      region = await input({
        message: 'GCP Project ID:',
        defaultValue: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '',
      });
    } else if (provider === 'azure') {
      region = await input({
        message: 'Azure Subscription ID (optional):',
        defaultValue: process.env.AZURE_SUBSCRIPTION_ID || '',
      });
    }
  }

  // Get available resource types for this provider
  const providerResources = IMPORTABLE_RESOURCES.filter(r => r.provider === provider);

  // Select resource type
  let resourceType = options.resourceType;
  if (!resourceType) {
    resourceType = (await select({
      message: 'Select resource type to import:',
      options: providerResources.map(r => ({
        label: r.description,
        value: r.cloudType,
        description: r.terraformType,
      })),
    })) as string;
  }

  const resourceInfo = providerResources.find(r => r.cloudType === resourceType);
  if (!resourceInfo) {
    ui.error(`Unknown resource type: ${resourceType}`);
    return;
  }

  ui.newLine();
  ui.startSpinner({ message: `Discovering ${resourceInfo.description}s...` });

  // Discover resources
  let discovered: DiscoveredResource[] = [];

  if (provider === 'aws') {
    discovered = discoverAwsResources(resourceType, region || 'us-east-1');
  } else if (provider === 'gcp') {
    discovered = discoverGcpResources(resourceType, region);
  } else if (provider === 'azure') {
    discovered = discoverAzureResources(resourceType, region);
  }

  if (discovered.length === 0) {
    ui.stopSpinnerSuccess('Discovery complete');
    ui.warning(`No ${resourceInfo.description}s found`);
    ui.info(`Make sure you have the correct ${provider.toUpperCase()} credentials configured`);
    return;
  }

  ui.stopSpinnerSuccess(`Found ${discovered.length} ${resourceInfo.description}(s)`);

  // Display discovered resources
  ui.newLine();
  ui.section('Discovered Resources');

  for (const resource of discovered) {
    ui.print(`  ${ui.color('•', 'blue')} ${resource.name || resource.id}`);
    ui.print(`    ${ui.dim('ID:')} ${resource.id}`);
    if (resource.region !== 'global') {
      ui.print(`    ${ui.dim('Region:')} ${resource.region}`);
    }
  }

  // Select resources to import
  ui.newLine();
  const selectedIds = await multiSelect({
    message: 'Select resources to import:',
    options: discovered.map(r => ({
      label: r.name || r.id,
      value: r.id,
      description: r.id,
    })),
  });

  if (selectedIds.length === 0) {
    ui.info('No resources selected');
    return;
  }

  const selectedResources = discovered.filter(r => selectedIds.includes(r.id));

  // Output directory
  const outputDir =
    options.output ||
    (await input({
      message: 'Output directory:',
      defaultValue: './terraform',
    }));

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate Terraform files
  ui.newLine();
  ui.startSpinner({ message: 'Generating Terraform configuration...' });

  const importBlocks: string[] = [];
  const resourceBlocks: string[] = [];

  for (const resource of selectedResources) {
    // Generate a terraform-friendly name
    const tfName = (resource.name || resource.id)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    importBlocks.push(generateImportBlock(resource, tfName));
    resourceBlocks.push(generateResourceSkeleton(resource, tfName));
  }

  // Write import.tf
  const importFile = path.join(outputDir, 'import.tf');
  const importContent = `# Terraform Import Configuration
# Generated by Nimbus
# Run: terraform init && terraform plan

${importBlocks.join('\n')}
`;
  fs.writeFileSync(importFile, importContent);

  // Write resources.tf
  const resourceFile = path.join(outputDir, 'imported_resources.tf');
  const resourceContent = `# Imported Resources
# Generated by Nimbus
#
# How to use this file:
#   1. Run: terraform init
#   2. Run: terraform plan -generate-config-out=generated.tf
#      This will auto-generate configuration for imported resources.
#   3. Merge the generated attributes into the resource blocks below.
#   4. Run: terraform plan  (verify no unexpected changes)
#   5. Run: terraform apply (lock the state)
#
# Example attributes you may need to fill in per resource:
#   - name, location/region, tags
#   - Provider-specific required fields (e.g., ami + instance_type for aws_instance)
#
# Tip: Use 'terraform state show <resource_address>' after import to see all current attributes.

${resourceBlocks.join('\n\n')}
`;
  fs.writeFileSync(resourceFile, resourceContent);

  // Check if provider.tf exists, if not create it
  const providerFile = path.join(outputDir, 'provider.tf');
  if (!fs.existsSync(providerFile)) {
    let providerContent = '';
    if (provider === 'aws') {
      providerContent = `terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "${region || 'us-east-1'}"
}
`;
    } else if (provider === 'gcp') {
      providerContent = `terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = "${region || 'my-project'}"
}
`;
    } else if (provider === 'azure') {
      providerContent = `terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {}
}
`;
    }
    fs.writeFileSync(providerFile, providerContent);
  }

  ui.stopSpinnerSuccess('Configuration generated');

  // Summary
  ui.newLine();
  ui.success(`Generated Terraform configuration for ${selectedResources.length} resource(s)`);
  ui.newLine();
  ui.print('  Files created:');
  ui.print(`    ${ui.dim('•')} ${importFile}`);
  ui.print(`    ${ui.dim('•')} ${resourceFile}`);
  ui.newLine();

  ui.section('Next Steps');
  ui.print('  1. Review the generated configuration');
  ui.print(`  2. Run ${ui.color(`cd ${outputDir}`, 'cyan')}`);
  ui.print(`  3. Run ${ui.color('terraform init', 'cyan')}`);
  ui.print(`  4. Run ${ui.color('terraform plan', 'cyan')} to import and verify`);
  ui.print('  5. Fill in any missing required attributes');
  ui.print(`  6. Run ${ui.color('terraform apply', 'cyan')} to complete the import`);
  ui.newLine();

  ui.warning('Important: Review the generated resources.tf file and fill in required attributes');
  ui.info('After import, run "terraform state show <resource>" to see the actual configuration');
}
