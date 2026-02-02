/**
 * Terraform Resource Mappers Index
 *
 * Exports all resource mappers and provides a registry factory
 */

import { BaseResourceMapper, MapperRegistry } from './base';
import { getEC2Mappers } from './ec2';
import { getVPCMappers } from './vpc';
import { getS3Mappers, getS3SupplementaryMappers } from './s3';
import { getRDSMappers } from './rds';
import { getLambdaMappers } from './lambda';
import { getIAMMappers } from './iam';
import { getECSMappers, getEKSMappers } from './ecs-eks';
import { getDynamoDBMappers } from './dynamodb';
import { getCloudFrontMappers } from './cloudfront';

// Re-export base classes and types
export { BaseResourceMapper, MapperRegistry } from './base';

// Re-export all mappers
export * from './ec2';
export * from './vpc';
export * from './s3';
export * from './rds';
export * from './lambda';
export * from './iam';
export * from './ecs-eks';
export * from './dynamodb';
export * from './cloudfront';

/**
 * Get all available mappers
 */
export function getAllMappers(): BaseResourceMapper[] {
  return [
    ...getEC2Mappers(),
    ...getVPCMappers(),
    ...getS3Mappers(),
    ...getS3SupplementaryMappers(),
    ...getRDSMappers(),
    ...getLambdaMappers(),
    ...getIAMMappers(),
    ...getECSMappers(),
    ...getEKSMappers(),
    ...getDynamoDBMappers(),
    ...getCloudFrontMappers(),
  ];
}

/**
 * Create a mapper registry with all mappers registered
 */
export function createMapperRegistry(): MapperRegistry {
  const registry = new MapperRegistry();

  for (const mapper of getAllMappers()) {
    registry.register(mapper);
  }

  return registry;
}

/**
 * Mapper type to service mapping for file organization
 */
export const TERRAFORM_TYPE_TO_SERVICE: Record<string, string> = {
  // EC2
  aws_instance: 'ec2',
  aws_ebs_volume: 'ec2',
  aws_security_group: 'ec2',
  aws_launch_template: 'ec2',
  aws_key_pair: 'ec2',

  // VPC
  aws_vpc: 'vpc',
  aws_subnet: 'vpc',
  aws_route_table: 'vpc',
  aws_internet_gateway: 'vpc',
  aws_nat_gateway: 'vpc',
  aws_vpc_endpoint: 'vpc',
  aws_network_acl: 'vpc',

  // S3
  aws_s3_bucket: 's3',
  aws_s3_bucket_versioning: 's3',
  aws_s3_bucket_server_side_encryption_configuration: 's3',
  aws_s3_bucket_public_access_block: 's3',

  // RDS
  aws_db_instance: 'rds',
  aws_rds_cluster: 'rds',
  aws_db_subnet_group: 'rds',
  aws_db_parameter_group: 'rds',

  // Lambda
  aws_lambda_function: 'lambda',
  aws_lambda_layer_version: 'lambda',
  aws_lambda_event_source_mapping: 'lambda',
  aws_lambda_permission: 'lambda',

  // IAM
  aws_iam_role: 'iam',
  aws_iam_policy: 'iam',
  aws_iam_user: 'iam',
  aws_iam_group: 'iam',
  aws_iam_instance_profile: 'iam',
  aws_iam_role_policy_attachment: 'iam',
  aws_iam_user_policy_attachment: 'iam',
  aws_iam_group_policy_attachment: 'iam',

  // ECS
  aws_ecs_cluster: 'ecs',
  aws_ecs_service: 'ecs',
  aws_ecs_task_definition: 'ecs',

  // EKS
  aws_eks_cluster: 'eks',
  aws_eks_node_group: 'eks',

  // DynamoDB
  aws_dynamodb_table: 'dynamodb',

  // CloudFront
  aws_cloudfront_distribution: 'cloudfront',
  aws_cloudfront_origin_access_identity: 'cloudfront',
  aws_cloudfront_origin_access_control: 'cloudfront',
};

/**
 * Get service name for a Terraform resource type
 */
export function getServiceForTerraformType(terraformType: string): string {
  return TERRAFORM_TYPE_TO_SERVICE[terraformType] || 'misc';
}

/**
 * AWS type to Terraform type mapping
 * This is a reverse lookup table for converting AWS types
 */
export const AWS_TYPE_TO_TERRAFORM_TYPE: Record<string, string> = {
  // EC2
  'AWS::EC2::Instance': 'aws_instance',
  'AWS::EC2::Volume': 'aws_ebs_volume',
  'AWS::EC2::SecurityGroup': 'aws_security_group',
  'AWS::EC2::LaunchTemplate': 'aws_launch_template',
  'AWS::EC2::KeyPair': 'aws_key_pair',

  // VPC
  'AWS::EC2::VPC': 'aws_vpc',
  'AWS::EC2::Subnet': 'aws_subnet',
  'AWS::EC2::RouteTable': 'aws_route_table',
  'AWS::EC2::InternetGateway': 'aws_internet_gateway',
  'AWS::EC2::NatGateway': 'aws_nat_gateway',
  'AWS::EC2::VPCEndpoint': 'aws_vpc_endpoint',
  'AWS::EC2::NetworkAcl': 'aws_network_acl',

  // S3
  'AWS::S3::Bucket': 'aws_s3_bucket',
  'AWS::S3::Bucket::Versioning': 'aws_s3_bucket_versioning',
  'AWS::S3::Bucket::Encryption': 'aws_s3_bucket_server_side_encryption_configuration',
  'AWS::S3::Bucket::PublicAccessBlock': 'aws_s3_bucket_public_access_block',

  // RDS
  'AWS::RDS::DBInstance': 'aws_db_instance',
  'AWS::RDS::DBCluster': 'aws_rds_cluster',
  'AWS::RDS::DBSubnetGroup': 'aws_db_subnet_group',
  'AWS::RDS::DBParameterGroup': 'aws_db_parameter_group',

  // Lambda
  'AWS::Lambda::Function': 'aws_lambda_function',
  'AWS::Lambda::LayerVersion': 'aws_lambda_layer_version',
  'AWS::Lambda::EventSourceMapping': 'aws_lambda_event_source_mapping',
  'AWS::Lambda::Permission': 'aws_lambda_permission',

  // IAM
  'AWS::IAM::Role': 'aws_iam_role',
  'AWS::IAM::ManagedPolicy': 'aws_iam_policy',
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
  'AWS::DynamoDB::GlobalTable': 'aws_dynamodb_table',

  // CloudFront
  'AWS::CloudFront::Distribution': 'aws_cloudfront_distribution',
  'AWS::CloudFront::CloudFrontOriginAccessIdentity': 'aws_cloudfront_origin_access_identity',
  'AWS::CloudFront::OriginAccessControl': 'aws_cloudfront_origin_access_control',
};

/**
 * Get Terraform type for an AWS type
 */
export function getTerraformTypeForAwsType(awsType: string): string | undefined {
  return AWS_TYPE_TO_TERRAFORM_TYPE[awsType];
}

/**
 * Get supported AWS types
 */
export function getSupportedAwsTypes(): string[] {
  return Object.keys(AWS_TYPE_TO_TERRAFORM_TYPE);
}

/**
 * Check if an AWS type is supported
 */
export function isAwsTypeSupported(awsType: string): boolean {
  return awsType in AWS_TYPE_TO_TERRAFORM_TYPE;
}
