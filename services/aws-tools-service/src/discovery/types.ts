/**
 * Type definitions for AWS Infrastructure Discovery
 */

// AWS Profile types
export interface AWSProfile {
  name: string;
  source: 'credentials' | 'config' | 'sso' | 'environment';
  region?: string;
  ssoStartUrl?: string;
  ssoRegion?: string;
  ssoAccountId?: string;
  ssoRoleName?: string;
}

export interface AWSAccountInfo {
  accountId: string;
  alias?: string;
  arn: string;
}

export interface CredentialValidationResult {
  valid: boolean;
  account?: AWSAccountInfo;
  error?: string;
}

// Region types
export interface AWSRegion {
  regionName: string;
  endpoint: string;
  optInStatus?: 'opted-in' | 'opt-in-not-required' | 'not-opted-in';
}

export interface RegionScanConfig {
  regions: string[] | 'all';
  excludeRegions?: string[];
}

// Discovery configuration
export interface DiscoveryConfig {
  profile?: string;
  regions: RegionScanConfig;
  services?: string[];
  excludeServices?: string[];
  concurrency?: number;
  timeout?: number;
}

// Resource types
export interface DiscoveredResource {
  id: string;
  arn: string;
  type: string;           // Terraform resource type (e.g., 'aws_instance')
  awsType: string;        // AWS CloudFormation type (e.g., 'AWS::EC2::Instance')
  service: string;        // Service name (e.g., 'EC2', 'S3')
  region: string;
  name?: string;
  tags: Record<string, string>;
  properties: Record<string, unknown>;
  relationships: ResourceRelationship[];
  createdAt?: Date;
  status?: string;
}

export interface ResourceRelationship {
  type: 'depends_on' | 'contains' | 'references' | 'attached_to';
  targetArn: string;
  targetType: string;
}

// Inventory types
export interface InfrastructureInventory {
  id: string;
  timestamp: Date;
  provider: 'aws';
  profile: string;
  account: AWSAccountInfo;
  regions: string[];
  summary: InventorySummary;
  resources: DiscoveredResource[];
  metadata: DiscoveryMetadata;
}

export interface InventorySummary {
  totalResources: number;
  resourcesByService: Record<string, number>;
  resourcesByRegion: Record<string, number>;
  resourcesByType: Record<string, number>;
}

export interface DiscoveryMetadata {
  scanDuration: number;
  apiCallCount: number;
  startedAt: Date;
  completedAt?: Date;
  errors: ScanError[];
  warnings: ScanWarning[];
}

export interface ScanError {
  service: string;
  region: string;
  operation: string;
  message: string;
  code?: string;
  timestamp: Date;
}

export interface ScanWarning {
  service: string;
  region: string;
  message: string;
  timestamp: Date;
}

// Discovery progress types
export interface DiscoveryProgress {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  regionsScanned: number;
  totalRegions: number;
  servicesScanned: number;
  totalServices: number;
  resourcesFound: number;
  currentRegion?: string;
  currentService?: string;
  errors: ScanError[];
  startedAt: Date;
  updatedAt: Date;
}

// Discovery session
export interface DiscoverySession {
  id: string;
  config: DiscoveryConfig;
  progress: DiscoveryProgress;
  inventory?: InfrastructureInventory;
}

// Supported AWS services for discovery
export const SUPPORTED_SERVICES = [
  'EC2',
  'S3',
  'RDS',
  'Lambda',
  'VPC',
  'IAM',
  'ECS',
  'EKS',
  'DynamoDB',
  'CloudFront',
  'ElastiCache',
  'SQS',
  'SNS',
  'APIGateway',
  'Route53',
  'CloudWatch',
  'KMS',
  'SecretsManager',
] as const;

export type SupportedService = typeof SUPPORTED_SERVICES[number];

// AWS resource type to Terraform type mapping
export const AWS_TO_TERRAFORM_TYPE_MAP: Record<string, string> = {
  // EC2
  'AWS::EC2::Instance': 'aws_instance',
  'AWS::EC2::Volume': 'aws_ebs_volume',
  'AWS::EC2::SecurityGroup': 'aws_security_group',
  'AWS::EC2::VPC': 'aws_vpc',
  'AWS::EC2::Subnet': 'aws_subnet',
  'AWS::EC2::RouteTable': 'aws_route_table',
  'AWS::EC2::InternetGateway': 'aws_internet_gateway',
  'AWS::EC2::NatGateway': 'aws_nat_gateway',
  'AWS::EC2::EIP': 'aws_eip',
  'AWS::EC2::NetworkInterface': 'aws_network_interface',
  'AWS::EC2::LaunchTemplate': 'aws_launch_template',

  // S3
  'AWS::S3::Bucket': 'aws_s3_bucket',

  // RDS
  'AWS::RDS::DBInstance': 'aws_db_instance',
  'AWS::RDS::DBCluster': 'aws_rds_cluster',
  'AWS::RDS::DBSubnetGroup': 'aws_db_subnet_group',
  'AWS::RDS::DBParameterGroup': 'aws_db_parameter_group',

  // Lambda
  'AWS::Lambda::Function': 'aws_lambda_function',
  'AWS::Lambda::LayerVersion': 'aws_lambda_layer_version',
  'AWS::Lambda::EventSourceMapping': 'aws_lambda_event_source_mapping',

  // IAM
  'AWS::IAM::Role': 'aws_iam_role',
  'AWS::IAM::Policy': 'aws_iam_policy',
  'AWS::IAM::User': 'aws_iam_user',
  'AWS::IAM::Group': 'aws_iam_group',
  'AWS::IAM::InstanceProfile': 'aws_iam_instance_profile',

  // ECS
  'AWS::ECS::Cluster': 'aws_ecs_cluster',
  'AWS::ECS::Service': 'aws_ecs_service',
  'AWS::ECS::TaskDefinition': 'aws_ecs_task_definition',

  // EKS
  'AWS::EKS::Cluster': 'aws_eks_cluster',
  'AWS::EKS::Nodegroup': 'aws_eks_node_group',

  // DynamoDB
  'AWS::DynamoDB::Table': 'aws_dynamodb_table',

  // CloudFront
  'AWS::CloudFront::Distribution': 'aws_cloudfront_distribution',

  // ElastiCache
  'AWS::ElastiCache::CacheCluster': 'aws_elasticache_cluster',
  'AWS::ElastiCache::ReplicationGroup': 'aws_elasticache_replication_group',

  // SQS
  'AWS::SQS::Queue': 'aws_sqs_queue',

  // SNS
  'AWS::SNS::Topic': 'aws_sns_topic',

  // API Gateway
  'AWS::ApiGateway::RestApi': 'aws_api_gateway_rest_api',
  'AWS::ApiGatewayV2::Api': 'aws_apigatewayv2_api',

  // Route53
  'AWS::Route53::HostedZone': 'aws_route53_zone',
  'AWS::Route53::RecordSet': 'aws_route53_record',

  // KMS
  'AWS::KMS::Key': 'aws_kms_key',
  'AWS::KMS::Alias': 'aws_kms_alias',

  // Secrets Manager
  'AWS::SecretsManager::Secret': 'aws_secretsmanager_secret',
};

// Get Terraform resource type from AWS type
export function getTerraformType(awsType: string): string {
  return AWS_TO_TERRAFORM_TYPE_MAP[awsType] || `aws_${awsType.toLowerCase().replace(/::/g, '_')}`;
}
