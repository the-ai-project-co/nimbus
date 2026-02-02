import type { QuestionnaireStep } from './types';

export const terraformQuestionnaire: QuestionnaireStep[] = [
  {
    id: 'provider',
    title: 'Cloud Provider',
    description: 'Select your cloud provider and region',
    questions: [
      {
        id: 'cloud',
        type: 'select',
        label: 'Which cloud provider?',
        description: 'Choose the cloud platform for your infrastructure',
        options: [
          {
            value: 'aws',
            label: 'AWS',
            description: 'Amazon Web Services'
          },
          {
            value: 'gcp',
            label: 'Google Cloud Platform',
            description: 'Google Cloud Platform'
          },
          {
            value: 'azure',
            label: 'Microsoft Azure',
            description: 'Microsoft Azure'
          },
        ],
        default: 'aws',
        validation: [
          { type: 'required', message: 'Cloud provider is required' },
        ],
      },
      {
        id: 'region',
        type: 'select',
        label: 'Which region?',
        description: 'Select the geographical region',
        options: [
          // AWS regions
          { value: 'us-east-1', label: 'US East (N. Virginia)' },
          { value: 'us-east-2', label: 'US East (Ohio)' },
          { value: 'us-west-1', label: 'US West (N. California)' },
          { value: 'us-west-2', label: 'US West (Oregon)' },
          { value: 'eu-west-1', label: 'EU (Ireland)' },
          { value: 'eu-central-1', label: 'EU (Frankfurt)' },
          { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
          { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
        ],
        default: 'us-east-1',
        validation: [
          { type: 'required', message: 'Region is required' },
        ],
        dependsOn: { questionId: 'cloud', value: 'aws' },
      },
      {
        id: 'project_name',
        type: 'text',
        label: 'Project name',
        description: 'A unique name for your project (lowercase, no spaces)',
        default: 'my-project',
        validation: [
          { type: 'required', message: 'Project name is required' },
          {
            type: 'pattern',
            value: /^[a-z0-9-]+$/,
            message: 'Project name must be lowercase alphanumeric with hyphens'
          },
        ],
      },
      {
        id: 'environment',
        type: 'select',
        label: 'Environment',
        description: 'What environment is this for?',
        options: [
          { value: 'dev', label: 'Development' },
          { value: 'staging', label: 'Staging' },
          { value: 'prod', label: 'Production' },
        ],
        default: 'dev',
        validation: [
          { type: 'required', message: 'Environment is required' },
        ],
      },
    ],
  },
  {
    id: 'components',
    title: 'Infrastructure Components',
    description: 'Select the infrastructure components you need',
    questions: [
      {
        id: 'components',
        type: 'multiselect',
        label: 'What components do you need?',
        description: 'Select all components you want to provision',
        options: [
          {
            value: 'vpc',
            label: 'VPC / Network',
            description: 'Virtual Private Cloud with subnets, route tables, and NAT'
          },
          {
            value: 'eks',
            label: 'Kubernetes (EKS)',
            description: 'Managed Kubernetes cluster with node groups'
          },
          {
            value: 'rds',
            label: 'Database (RDS)',
            description: 'Managed relational database (PostgreSQL, MySQL)'
          },
          {
            value: 's3',
            label: 'Object Storage (S3)',
            description: 'S3 buckets for file storage'
          },
          {
            value: 'ecs',
            label: 'Container Service (ECS)',
            description: 'AWS ECS for container workloads'
          },
        ],
        default: ['vpc'],
        validation: [
          {
            type: 'custom',
            message: 'At least one component is required',
            validate: (value: unknown) => {
              return Array.isArray(value) && value.length > 0;
            }
          },
        ],
      },
    ],
  },
  {
    id: 'vpc_config',
    title: 'VPC Configuration',
    description: 'Configure your Virtual Private Cloud network',
    condition: (answers) => {
      const components = answers.components as string[];
      return components && components.includes('vpc');
    },
    questions: [
      {
        id: 'vpc_cidr',
        type: 'text',
        label: 'VPC CIDR block',
        description: 'IP address range for your VPC (e.g., 10.0.0.0/16)',
        default: '10.0.0.0/16',
        validation: [
          { type: 'required', message: 'VPC CIDR is required' },
          {
            type: 'pattern',
            value: /^\d+\.\d+\.\d+\.\d+\/\d+$/,
            message: 'Invalid CIDR format (e.g., 10.0.0.0/16)'
          },
        ],
      },
      {
        id: 'availability_zones',
        type: 'number',
        label: 'Number of availability zones',
        description: 'How many AZs to span (1-6)',
        default: 3,
        validation: [
          { type: 'required', message: 'Number of AZs is required' },
          { type: 'min', value: 1, message: 'At least 1 AZ required' },
          { type: 'max', value: 6, message: 'Maximum 6 AZs supported' },
        ],
      },
      {
        id: 'public_subnets',
        type: 'confirm',
        label: 'Create public subnets?',
        description: 'Public subnets have direct internet access',
        default: true,
      },
      {
        id: 'private_subnets',
        type: 'confirm',
        label: 'Create private subnets?',
        description: 'Private subnets use NAT for outbound traffic',
        default: true,
      },
      {
        id: 'nat_gateway',
        type: 'select',
        label: 'NAT Gateway configuration',
        description: 'NAT Gateways enable private subnet internet access',
        options: [
          {
            value: 'single',
            label: 'Single NAT (~$32/month)',
            description: 'One NAT gateway, lower cost, single point of failure'
          },
          {
            value: 'ha',
            label: 'HA NAT (one per AZ)',
            description: 'Higher availability, more cost (~$32/month per AZ)'
          },
          {
            value: 'none',
            label: 'No NAT Gateway',
            description: 'No outbound internet from private subnets'
          },
        ],
        default: 'single',
      },
      {
        id: 'enable_dns_hostnames',
        type: 'confirm',
        label: 'Enable DNS hostnames?',
        description: 'Enables DNS hostnames in the VPC',
        default: true,
      },
      {
        id: 'enable_dns_support',
        type: 'confirm',
        label: 'Enable DNS support?',
        description: 'Enables DNS resolution in the VPC',
        default: true,
      },
    ],
  },
  {
    id: 'eks_config',
    title: 'Kubernetes Configuration',
    description: 'Configure your EKS cluster',
    condition: (answers) => {
      const components = answers.components as string[];
      return components && components.includes('eks');
    },
    questions: [
      {
        id: 'cluster_name',
        type: 'text',
        label: 'EKS cluster name',
        description: 'Name for your Kubernetes cluster',
        default: 'my-cluster',
        validation: [
          { type: 'required', message: 'Cluster name is required' },
          {
            type: 'pattern',
            value: /^[a-zA-Z0-9-]+$/,
            message: 'Cluster name must be alphanumeric with hyphens'
          },
        ],
      },
      {
        id: 'eks_version',
        type: 'select',
        label: 'Kubernetes version',
        description: 'EKS Kubernetes version',
        options: [
          { value: '1.29', label: 'v1.29 (Latest)' },
          { value: '1.28', label: 'v1.28' },
          { value: '1.27', label: 'v1.27' },
        ],
        default: '1.29',
        validation: [
          { type: 'required', message: 'Kubernetes version is required' },
        ],
      },
      {
        id: 'node_instance_type',
        type: 'select',
        label: 'Node instance type',
        description: 'EC2 instance type for worker nodes',
        options: [
          { value: 't3.small', label: 't3.small (2 vCPU, 2GB) - Dev/Test' },
          { value: 't3.medium', label: 't3.medium (2 vCPU, 4GB) - Small workloads' },
          { value: 't3.large', label: 't3.large (2 vCPU, 8GB) - Medium workloads' },
          { value: 't3.xlarge', label: 't3.xlarge (4 vCPU, 16GB) - Large workloads' },
          { value: 'm5.large', label: 'm5.large (2 vCPU, 8GB) - General purpose' },
          { value: 'm5.xlarge', label: 'm5.xlarge (4 vCPU, 16GB) - General purpose' },
        ],
        default: 't3.large',
        validation: [
          { type: 'required', message: 'Instance type is required' },
        ],
      },
      {
        id: 'node_count_min',
        type: 'number',
        label: 'Minimum nodes',
        description: 'Minimum number of worker nodes',
        default: 2,
        validation: [
          { type: 'required', message: 'Minimum node count is required' },
          { type: 'min', value: 1, message: 'At least 1 node required' },
        ],
      },
      {
        id: 'node_count_max',
        type: 'number',
        label: 'Maximum nodes',
        description: 'Maximum number of worker nodes for autoscaling',
        default: 5,
        validation: [
          { type: 'required', message: 'Maximum node count is required' },
          { type: 'min', value: 1, message: 'At least 1 node required' },
        ],
      },
      {
        id: 'node_count_desired',
        type: 'number',
        label: 'Desired nodes',
        description: 'Initial number of worker nodes',
        default: 3,
        validation: [
          { type: 'required', message: 'Desired node count is required' },
          { type: 'min', value: 1, message: 'At least 1 node required' },
        ],
      },
    ],
  },
  {
    id: 'rds_config',
    title: 'Database Configuration',
    description: 'Configure your RDS database',
    condition: (answers) => {
      const components = answers.components as string[];
      return components && components.includes('rds');
    },
    questions: [
      {
        id: 'db_engine',
        type: 'select',
        label: 'Database engine',
        description: 'Choose your database engine',
        options: [
          { value: 'postgres', label: 'PostgreSQL' },
          { value: 'mysql', label: 'MySQL' },
          { value: 'mariadb', label: 'MariaDB' },
        ],
        default: 'postgres',
        validation: [
          { type: 'required', message: 'Database engine is required' },
        ],
      },
      {
        id: 'db_engine_version',
        type: 'select',
        label: 'Engine version',
        description: 'Database engine version',
        options: [
          { value: '15.4', label: 'PostgreSQL 15.4' },
          { value: '14.9', label: 'PostgreSQL 14.9' },
          { value: '8.0', label: 'MySQL 8.0' },
        ],
        default: '15.4',
        validation: [
          { type: 'required', message: 'Engine version is required' },
        ],
      },
      {
        id: 'db_instance_class',
        type: 'select',
        label: 'Instance class',
        description: 'RDS instance size',
        options: [
          { value: 'db.t3.micro', label: 'db.t3.micro (1 vCPU, 1GB) - Dev/Test' },
          { value: 'db.t3.small', label: 'db.t3.small (2 vCPU, 2GB) - Small workloads' },
          { value: 'db.t3.medium', label: 'db.t3.medium (2 vCPU, 4GB) - Medium workloads' },
          { value: 'db.t3.large', label: 'db.t3.large (2 vCPU, 8GB) - Large workloads' },
          { value: 'db.r5.large', label: 'db.r5.large (2 vCPU, 16GB) - Memory optimized' },
        ],
        default: 'db.t3.small',
        validation: [
          { type: 'required', message: 'Instance class is required' },
        ],
      },
      {
        id: 'db_allocated_storage',
        type: 'number',
        label: 'Allocated storage (GB)',
        description: 'Initial database storage size',
        default: 20,
        validation: [
          { type: 'required', message: 'Storage size is required' },
          { type: 'min', value: 20, message: 'Minimum 20 GB required' },
          { type: 'max', value: 65536, message: 'Maximum 65536 GB supported' },
        ],
      },
      {
        id: 'db_name',
        type: 'text',
        label: 'Database name',
        description: 'Initial database name',
        default: 'mydb',
        validation: [
          { type: 'required', message: 'Database name is required' },
          {
            type: 'pattern',
            value: /^[a-zA-Z][a-zA-Z0-9_]*$/,
            message: 'Database name must start with a letter and contain only alphanumeric and underscores'
          },
        ],
      },
      {
        id: 'db_multi_az',
        type: 'confirm',
        label: 'Enable Multi-AZ?',
        description: 'Multi-AZ provides high availability (doubles cost)',
        default: false,
      },
      {
        id: 'db_backup_retention',
        type: 'number',
        label: 'Backup retention (days)',
        description: 'Number of days to retain automated backups',
        default: 7,
        validation: [
          { type: 'required', message: 'Backup retention is required' },
          { type: 'min', value: 0, message: 'Minimum 0 days' },
          { type: 'max', value: 35, message: 'Maximum 35 days' },
        ],
      },
    ],
  },
  {
    id: 's3_config',
    title: 'S3 Configuration',
    description: 'Configure your S3 buckets',
    condition: (answers) => {
      const components = answers.components as string[];
      return components && components.includes('s3');
    },
    questions: [
      {
        id: 's3_bucket_name',
        type: 'text',
        label: 'Bucket name',
        description: 'S3 bucket name (must be globally unique)',
        validation: [
          { type: 'required', message: 'Bucket name is required' },
          {
            type: 'pattern',
            value: /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
            message: 'Bucket name must be lowercase, alphanumeric with hyphens'
          },
        ],
      },
      {
        id: 's3_versioning',
        type: 'confirm',
        label: 'Enable versioning?',
        description: 'Keep multiple versions of objects',
        default: true,
      },
      {
        id: 's3_encryption',
        type: 'select',
        label: 'Encryption type',
        description: 'Server-side encryption',
        options: [
          { value: 'AES256', label: 'SSE-S3 (AES256)' },
          { value: 'aws:kms', label: 'SSE-KMS (AWS managed key)' },
        ],
        default: 'AES256',
        validation: [
          { type: 'required', message: 'Encryption type is required' },
        ],
      },
      {
        id: 's3_lifecycle',
        type: 'confirm',
        label: 'Enable lifecycle rules?',
        description: 'Automatically transition or expire objects',
        default: false,
      },
      {
        id: 's3_public_access_block',
        type: 'confirm',
        label: 'Block all public access?',
        description: 'Recommended for security',
        default: true,
      },
    ],
  },
  {
    id: 'state_backend',
    title: 'Terraform State Management',
    description: 'Configure where Terraform state will be stored',
    questions: [
      {
        id: 'backend_type',
        type: 'select',
        label: 'Terraform backend',
        description: 'Where to store Terraform state',
        options: [
          {
            value: 's3',
            label: 'S3 (AWS)',
            description: 'S3 bucket with DynamoDB locking (recommended for AWS)'
          },
          {
            value: 'gcs',
            label: 'GCS (GCP)',
            description: 'Google Cloud Storage (recommended for GCP)'
          },
          {
            value: 'azurerm',
            label: 'Azure Blob',
            description: 'Azure Blob Storage (recommended for Azure)'
          },
          {
            value: 'local',
            label: 'Local (not recommended)',
            description: 'Store state locally (only for testing)'
          },
        ],
        default: 's3',
        validation: [
          { type: 'required', message: 'Backend type is required' },
        ],
      },
      {
        id: 'state_bucket_name',
        type: 'text',
        label: 'State bucket name',
        description: 'S3 bucket name for Terraform state',
        dependsOn: { questionId: 'backend_type', value: 's3' },
        validation: [
          { type: 'required', message: 'State bucket name is required' },
          {
            type: 'pattern',
            value: /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
            message: 'Bucket name must be lowercase, alphanumeric with hyphens'
          },
        ],
      },
      {
        id: 'state_lock_table',
        type: 'text',
        label: 'DynamoDB table name',
        description: 'DynamoDB table for state locking',
        default: 'terraform-state-lock',
        dependsOn: { questionId: 'backend_type', value: 's3' },
        validation: [
          { type: 'required', message: 'Lock table name is required' },
        ],
      },
    ],
  },
  {
    id: 'tagging',
    title: 'Resource Tagging',
    description: 'Define tags for resource organization',
    questions: [
      {
        id: 'tags_owner',
        type: 'text',
        label: 'Owner',
        description: 'Team or person responsible',
        validation: [
          { type: 'required', message: 'Owner tag is required' },
        ],
      },
      {
        id: 'tags_cost_center',
        type: 'text',
        label: 'Cost center',
        description: 'For cost allocation',
      },
      {
        id: 'tags_additional',
        type: 'text',
        label: 'Additional tags (comma-separated key=value)',
        description: 'Example: Team=Platform,Department=Engineering',
      },
    ],
  },
];
