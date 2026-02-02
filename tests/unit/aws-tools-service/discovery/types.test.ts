/**
 * Unit tests for Discovery Types
 */

import { describe, test, expect } from 'bun:test';
import {
  getTerraformType,
  AWS_TO_TERRAFORM_TYPE_MAP,
  SUPPORTED_SERVICES,
} from '../../../../services/aws-tools-service/src/discovery/types';

describe('getTerraformType', () => {
  test('returns correct Terraform type for EC2 Instance', () => {
    expect(getTerraformType('AWS::EC2::Instance')).toBe('aws_instance');
  });

  test('returns correct Terraform type for S3 Bucket', () => {
    expect(getTerraformType('AWS::S3::Bucket')).toBe('aws_s3_bucket');
  });

  test('returns correct Terraform type for RDS Instance', () => {
    expect(getTerraformType('AWS::RDS::DBInstance')).toBe('aws_db_instance');
  });

  test('returns correct Terraform type for Lambda Function', () => {
    expect(getTerraformType('AWS::Lambda::Function')).toBe('aws_lambda_function');
  });

  test('returns correct Terraform type for IAM Role', () => {
    expect(getTerraformType('AWS::IAM::Role')).toBe('aws_iam_role');
  });

  test('returns correct Terraform type for VPC', () => {
    expect(getTerraformType('AWS::EC2::VPC')).toBe('aws_vpc');
  });

  test('returns generated type for unknown AWS type', () => {
    const result = getTerraformType('AWS::NewService::NewResource');
    expect(result).toMatch(/^aws_/);
  });
});

describe('AWS_TO_TERRAFORM_TYPE_MAP', () => {
  test('has mappings for EC2 resources', () => {
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::EC2::Instance']).toBe('aws_instance');
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::EC2::Volume']).toBe('aws_ebs_volume');
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::EC2::SecurityGroup']).toBe('aws_security_group');
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::EC2::VPC']).toBe('aws_vpc');
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::EC2::Subnet']).toBe('aws_subnet');
  });

  test('has mappings for S3 resources', () => {
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::S3::Bucket']).toBe('aws_s3_bucket');
  });

  test('has mappings for RDS resources', () => {
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::RDS::DBInstance']).toBe('aws_db_instance');
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::RDS::DBCluster']).toBe('aws_rds_cluster');
  });

  test('has mappings for Lambda resources', () => {
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::Lambda::Function']).toBe('aws_lambda_function');
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::Lambda::LayerVersion']).toBe('aws_lambda_layer_version');
  });

  test('has mappings for IAM resources', () => {
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::IAM::Role']).toBe('aws_iam_role');
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::IAM::Policy']).toBe('aws_iam_policy');
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::IAM::User']).toBe('aws_iam_user');
  });

  test('has mappings for ECS resources', () => {
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::ECS::Cluster']).toBe('aws_ecs_cluster');
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::ECS::Service']).toBe('aws_ecs_service');
  });

  test('has mappings for EKS resources', () => {
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::EKS::Cluster']).toBe('aws_eks_cluster');
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::EKS::Nodegroup']).toBe('aws_eks_node_group');
  });

  test('has mappings for DynamoDB resources', () => {
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::DynamoDB::Table']).toBe('aws_dynamodb_table');
  });

  test('has mappings for CloudFront resources', () => {
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::CloudFront::Distribution']).toBe('aws_cloudfront_distribution');
  });

  test('has mappings for SQS resources', () => {
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::SQS::Queue']).toBe('aws_sqs_queue');
  });

  test('has mappings for SNS resources', () => {
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::SNS::Topic']).toBe('aws_sns_topic');
  });

  test('has mappings for KMS resources', () => {
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::KMS::Key']).toBe('aws_kms_key');
    expect(AWS_TO_TERRAFORM_TYPE_MAP['AWS::KMS::Alias']).toBe('aws_kms_alias');
  });
});

describe('SUPPORTED_SERVICES', () => {
  test('contains core AWS services', () => {
    expect(SUPPORTED_SERVICES).toContain('EC2');
    expect(SUPPORTED_SERVICES).toContain('S3');
    expect(SUPPORTED_SERVICES).toContain('RDS');
    expect(SUPPORTED_SERVICES).toContain('Lambda');
    expect(SUPPORTED_SERVICES).toContain('VPC');
    expect(SUPPORTED_SERVICES).toContain('IAM');
  });

  test('contains container services', () => {
    expect(SUPPORTED_SERVICES).toContain('ECS');
    expect(SUPPORTED_SERVICES).toContain('EKS');
  });

  test('contains database services', () => {
    expect(SUPPORTED_SERVICES).toContain('DynamoDB');
    expect(SUPPORTED_SERVICES).toContain('ElastiCache');
  });

  test('contains messaging services', () => {
    expect(SUPPORTED_SERVICES).toContain('SQS');
    expect(SUPPORTED_SERVICES).toContain('SNS');
  });

  test('contains CDN and networking services', () => {
    expect(SUPPORTED_SERVICES).toContain('CloudFront');
    expect(SUPPORTED_SERVICES).toContain('Route53');
    expect(SUPPORTED_SERVICES).toContain('APIGateway');
  });

  test('contains security services', () => {
    expect(SUPPORTED_SERVICES).toContain('KMS');
    expect(SUPPORTED_SERVICES).toContain('SecretsManager');
  });
});
