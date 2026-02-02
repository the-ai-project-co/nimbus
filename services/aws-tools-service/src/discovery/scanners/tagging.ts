/**
 * Resource Groups Tagging API Scanner
 *
 * Uses the Resource Groups Tagging API to discover tagged resources
 * across multiple AWS services efficiently
 */

import {
  ResourceGroupsTaggingAPIClient,
  GetResourcesCommand,
  type ResourceTagMapping,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { logger } from '@nimbus/shared-utils';
import { BaseScanner, type ScannerContext, type ScanResult } from './base';
import type { DiscoveredResource } from '../types';
import { getTerraformType } from '../types';

/**
 * Mapping from AWS service prefix to service name
 */
const SERVICE_PREFIX_MAP: Record<string, string> = {
  'ec2': 'EC2',
  's3': 'S3',
  'rds': 'RDS',
  'lambda': 'Lambda',
  'dynamodb': 'DynamoDB',
  'elasticache': 'ElastiCache',
  'sqs': 'SQS',
  'sns': 'SNS',
  'apigateway': 'APIGateway',
  'cloudfront': 'CloudFront',
  'ecs': 'ECS',
  'eks': 'EKS',
  'kms': 'KMS',
  'secretsmanager': 'SecretsManager',
  'route53': 'Route53',
  'iam': 'IAM',
  'elasticloadbalancing': 'ELB',
  'autoscaling': 'AutoScaling',
};

/**
 * Mapping from ARN resource type to AWS CloudFormation type
 */
const ARN_TO_AWS_TYPE_MAP: Record<string, string> = {
  // EC2
  'ec2:instance': 'AWS::EC2::Instance',
  'ec2:volume': 'AWS::EC2::Volume',
  'ec2:security-group': 'AWS::EC2::SecurityGroup',
  'ec2:vpc': 'AWS::EC2::VPC',
  'ec2:subnet': 'AWS::EC2::Subnet',
  'ec2:route-table': 'AWS::EC2::RouteTable',
  'ec2:internet-gateway': 'AWS::EC2::InternetGateway',
  'ec2:nat-gateway': 'AWS::EC2::NatGateway',
  'ec2:elastic-ip': 'AWS::EC2::EIP',
  'ec2:network-interface': 'AWS::EC2::NetworkInterface',

  // S3
  's3:bucket': 'AWS::S3::Bucket',

  // RDS
  'rds:db': 'AWS::RDS::DBInstance',
  'rds:cluster': 'AWS::RDS::DBCluster',
  'rds:subgrp': 'AWS::RDS::DBSubnetGroup',

  // Lambda
  'lambda:function': 'AWS::Lambda::Function',

  // DynamoDB
  'dynamodb:table': 'AWS::DynamoDB::Table',

  // ECS
  'ecs:cluster': 'AWS::ECS::Cluster',
  'ecs:service': 'AWS::ECS::Service',
  'ecs:task-definition': 'AWS::ECS::TaskDefinition',

  // EKS
  'eks:cluster': 'AWS::EKS::Cluster',
  'eks:nodegroup': 'AWS::EKS::Nodegroup',

  // ElastiCache
  'elasticache:cluster': 'AWS::ElastiCache::CacheCluster',
  'elasticache:replicationgroup': 'AWS::ElastiCache::ReplicationGroup',

  // SQS
  'sqs:queue': 'AWS::SQS::Queue',

  // SNS
  'sns:topic': 'AWS::SNS::Topic',

  // KMS
  'kms:key': 'AWS::KMS::Key',
  'kms:alias': 'AWS::KMS::Alias',

  // CloudFront
  'cloudfront:distribution': 'AWS::CloudFront::Distribution',

  // Route53
  'route53:hostedzone': 'AWS::Route53::HostedZone',

  // IAM
  'iam:role': 'AWS::IAM::Role',
  'iam:policy': 'AWS::IAM::Policy',
  'iam:user': 'AWS::IAM::User',
  'iam:group': 'AWS::IAM::Group',
};

/**
 * Resource Groups Tagging API Scanner
 */
export class TaggingScanner extends BaseScanner {
  readonly serviceName = 'Tagging';
  readonly isGlobal = false;

  /**
   * Resource type filters for the Tagging API
   * These are the resource types we want to discover
   */
  private resourceTypeFilters: string[] = [
    'ec2:instance',
    'ec2:volume',
    'ec2:security-group',
    'ec2:vpc',
    'ec2:subnet',
    'ec2:natgateway',
    'ec2:internet-gateway',
    's3:bucket',
    'rds:db',
    'rds:cluster',
    'lambda:function',
    'dynamodb:table',
    'ecs:cluster',
    'ecs:service',
    'eks:cluster',
    'elasticache:cluster',
    'sqs',
    'sns',
    'kms:key',
    'secretsmanager:secret',
  ];

  async scan(context: ScannerContext): Promise<ScanResult> {
    this.clearErrors();
    const resources: DiscoveredResource[] = [];

    const client = new ResourceGroupsTaggingAPIClient({
      region: context.region,
      credentials: context.credentials,
    });

    try {
      let paginationToken: string | undefined;

      do {
        const command = new GetResourcesCommand({
          ResourceTypeFilters: this.resourceTypeFilters,
          PaginationToken: paginationToken,
          ResourcesPerPage: 100,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.ResourceTagMappingList) {
          for (const mapping of response.ResourceTagMappingList) {
            const resource = this.mapToResource(mapping, context);
            if (resource) {
              resources.push(resource);
            }
          }
        }

        paginationToken = response.PaginationToken;
      } while (paginationToken);

      logger.debug(`Tagging scanner found ${resources.length} resources`, {
        region: context.region,
      });
    } catch (error: any) {
      this.recordError('GetResources', error.message, context.region, error.code);
      logger.warn('Tagging scanner failed', { region: context.region, error: error.message });
    }

    return {
      resources,
      errors: this.errors,
    };
  }

  getResourceTypes(): string[] {
    return this.resourceTypeFilters;
  }

  /**
   * Map a ResourceTagMapping to a DiscoveredResource
   */
  private mapToResource(
    mapping: ResourceTagMapping,
    context: ScannerContext
  ): DiscoveredResource | null {
    if (!mapping.ResourceARN) return null;

    const arnParts = this.parseArn(mapping.ResourceARN);
    if (!arnParts) return null;

    const { service, region, resourceType, resourceId } = arnParts;

    // Convert tags to record
    const tags: Record<string, string> = {};
    if (mapping.Tags) {
      for (const tag of mapping.Tags) {
        if (tag.Key) {
          tags[tag.Key] = tag.Value || '';
        }
      }
    }

    // Determine AWS type
    const typeKey = resourceType ? `${service}:${resourceType}` : service;
    const awsType = ARN_TO_AWS_TYPE_MAP[typeKey.toLowerCase()] || this.inferAwsType(service, resourceType);

    // Get service name
    const serviceName = SERVICE_PREFIX_MAP[service.toLowerCase()] || service.toUpperCase();

    return {
      id: resourceId,
      arn: mapping.ResourceARN,
      type: getTerraformType(awsType),
      awsType,
      service: serviceName,
      region: region || context.region,
      name: tags['Name'],
      tags,
      properties: {
        discoveredVia: 'tagging-api',
      },
      relationships: [],
    };
  }

  /**
   * Parse an ARN into its components
   */
  private parseArn(arn: string): {
    partition: string;
    service: string;
    region: string;
    accountId: string;
    resourceType: string;
    resourceId: string;
  } | null {
    // ARN format: arn:partition:service:region:account-id:resource
    // or: arn:partition:service:region:account-id:resource-type/resource-id
    // or: arn:partition:service:region:account-id:resource-type:resource-id

    const parts = arn.split(':');
    if (parts.length < 6) return null;

    const [arnPrefix, partition, service, region, accountId, ...resourceParts] = parts;

    if (arnPrefix !== 'arn') return null;

    const resourceString = resourceParts.join(':');

    // Try to parse resource type and id
    let resourceType = '';
    let resourceId = resourceString;

    // Check for / separator (e.g., instance/i-xxx)
    if (resourceString.includes('/')) {
      const slashIndex = resourceString.indexOf('/');
      resourceType = resourceString.substring(0, slashIndex);
      resourceId = resourceString.substring(slashIndex + 1);
    }
    // Check for : separator in resource (already split above, so rejoin)
    else if (resourceParts.length > 1) {
      resourceType = resourceParts[0];
      resourceId = resourceParts.slice(1).join(':');
    }

    return {
      partition,
      service,
      region,
      accountId,
      resourceType,
      resourceId,
    };
  }

  /**
   * Infer AWS CloudFormation type from service and resource type
   */
  private inferAwsType(service: string, resourceType?: string): string {
    const servicePascal = service.charAt(0).toUpperCase() + service.slice(1);
    const typePascal = resourceType
      ? resourceType.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('')
      : 'Resource';

    return `AWS::${servicePascal}::${typePascal}`;
  }
}
