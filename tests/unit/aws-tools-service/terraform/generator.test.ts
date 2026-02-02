/**
 * Terraform Generator Tests
 */

import { describe, it, expect } from 'bun:test';
import type { DiscoveredResource } from '../../../../services/aws-tools-service/src/discovery/types';
import {
  TerraformGenerator,
  createTerraformGenerator,
} from '../../../../services/aws-tools-service/src/terraform/generator';

/**
 * Create a mock discovered resource
 */
function createMockResource(
  type: string,
  id: string,
  properties: Record<string, unknown> = {},
  overrides: Partial<DiscoveredResource> = {}
): DiscoveredResource {
  return {
    id,
    type,
    arn: `arn:aws:service:us-east-1:123456789012:${type.toLowerCase()}/${id}`,
    region: 'us-east-1',
    name: overrides.name || id,
    tags: overrides.tags || {},
    properties,
    relationships: overrides.relationships || [],
    discoveredAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('TerraformGenerator', () => {
  describe('constructor', () => {
    it('creates generator with default config', () => {
      const generator = createTerraformGenerator({
        outputDir: '/tmp/terraform',
      });
      expect(generator).toBeInstanceOf(TerraformGenerator);
    });

    it('accepts custom config options', () => {
      const generator = createTerraformGenerator({
        outputDir: '/tmp/terraform',
        generateImportBlocks: false,
        generateImportScript: false,
        organizeByService: false,
        terraformVersion: '1.6.0',
        awsProviderVersion: '~> 5.30',
      });
      expect(generator).toBeInstanceOf(TerraformGenerator);
    });
  });

  describe('generate', () => {
    it('generates files for EC2 instances', () => {
      const generator = createTerraformGenerator({
        outputDir: '/tmp/terraform',
      });

      const resources: DiscoveredResource[] = [
        createMockResource('AWS::EC2::Instance', 'i-1234567890abcdef0', {
          imageId: 'ami-12345678',
          instanceType: 't2.micro',
        }, { name: 'web-server' }),
      ];

      const result = generator.generate(resources);

      expect(result.files.size).toBeGreaterThan(0);
      expect(result.unmappedResources).toHaveLength(0);
      expect(result.summary.mappedResources).toBe(1);
    });

    it('generates providers.tf', () => {
      const generator = createTerraformGenerator({
        outputDir: '/tmp/terraform',
        defaultRegion: 'us-west-2',
      });

      const result = generator.generate([]);

      expect(result.files.has('providers.tf')).toBe(true);
      const providersContent = result.files.get('providers.tf')!;
      expect(providersContent).toContain('terraform {');
      expect(providersContent).toContain('provider "aws"');
      // The terraform block may or may not have required_providers depending on implementation
      expect(providersContent).toContain('aws_region');
    });

    it('generates variables.tf when variables exist', () => {
      const generator = createTerraformGenerator({
        outputDir: '/tmp/terraform',
      });

      const resources: DiscoveredResource[] = [
        createMockResource('AWS::RDS::DBInstance', 'my-db', {
          dbInstanceIdentifier: 'my-db',
          dbInstanceClass: 'db.t3.micro',
          engine: 'mysql',
          masterUsername: 'admin',
        }),
      ];

      const result = generator.generate(resources);

      expect(result.files.has('variables.tf')).toBe(true);
      expect(result.variables.length).toBeGreaterThan(0);

      const variablesContent = result.files.get('variables.tf')!;
      expect(variablesContent).toContain('variable');
    });

    it('generates import.tf with import blocks', () => {
      const generator = createTerraformGenerator({
        outputDir: '/tmp/terraform',
        generateImportBlocks: true,
      });

      const resources: DiscoveredResource[] = [
        createMockResource('AWS::EC2::Instance', 'i-1234567890abcdef0', {
          imageId: 'ami-12345678',
          instanceType: 't2.micro',
        }),
      ];

      const result = generator.generate(resources);

      expect(result.files.has('import.tf')).toBe(true);
      expect(result.imports.length).toBeGreaterThan(0);

      const importContent = result.files.get('import.tf')!;
      expect(importContent).toContain('import {');
      expect(importContent).toContain('i-1234567890abcdef0');
    });

    it('generates import script', () => {
      const generator = createTerraformGenerator({
        outputDir: '/tmp/terraform',
        generateImportScript: true,
      });

      const resources: DiscoveredResource[] = [
        createMockResource('AWS::S3::Bucket', 'my-bucket', {}),
      ];

      const result = generator.generate(resources);

      expect(result.importScript).toContain('#!/bin/bash');
      expect(result.importScript).toContain('terraform import');
      expect(result.importScript).toContain('my-bucket');
    });

    it('generates terraform.tfvars.example', () => {
      const generator = createTerraformGenerator({
        outputDir: '/tmp/terraform',
      });

      const resources: DiscoveredResource[] = [
        createMockResource('AWS::RDS::DBInstance', 'my-db', {
          dbInstanceIdentifier: 'my-db',
          masterUsername: 'admin',
        }),
      ];

      const result = generator.generate(resources);

      expect(result.files.has('terraform.tfvars.example')).toBe(true);
      const tfvarsContent = result.files.get('terraform.tfvars.example')!;
      expect(tfvarsContent).toContain('<sensitive-value>');
    });

    it('organizes resources by service when enabled', () => {
      const generator = createTerraformGenerator({
        outputDir: '/tmp/terraform',
        organizeByService: true,
      });

      const resources: DiscoveredResource[] = [
        createMockResource('AWS::EC2::Instance', 'i-1234567890abcdef0', {
          imageId: 'ami-12345678',
          instanceType: 't2.micro',
        }),
        createMockResource('AWS::S3::Bucket', 'my-bucket', {}),
        createMockResource('AWS::EC2::VPC', 'vpc-12345678', {
          cidrBlock: '10.0.0.0/16',
        }),
      ];

      const result = generator.generate(resources);

      expect(result.files.has('ec2.tf')).toBe(true);
      expect(result.files.has('s3.tf')).toBe(true);
      expect(result.files.has('vpc.tf')).toBe(true);
    });

    it('generates single main.tf when organizeByService is disabled', () => {
      const generator = createTerraformGenerator({
        outputDir: '/tmp/terraform',
        organizeByService: false,
      });

      const resources: DiscoveredResource[] = [
        createMockResource('AWS::EC2::Instance', 'i-1234567890abcdef0', {
          imageId: 'ami-12345678',
          instanceType: 't2.micro',
        }),
        createMockResource('AWS::S3::Bucket', 'my-bucket', {}),
      ];

      const result = generator.generate(resources);

      expect(result.files.has('main.tf')).toBe(true);
      expect(result.files.has('ec2.tf')).toBe(false);
      expect(result.files.has('s3.tf')).toBe(false);
    });

    it('tracks unmapped resources', () => {
      const generator = createTerraformGenerator({
        outputDir: '/tmp/terraform',
      });

      const resources: DiscoveredResource[] = [
        createMockResource('AWS::EC2::Instance', 'i-1234567890abcdef0', {
          imageId: 'ami-12345678',
        }),
        createMockResource('AWS::Unknown::Resource', 'unknown-1', {}),
      ];

      const result = generator.generate(resources);

      expect(result.unmappedResources).toHaveLength(1);
      expect(result.unmappedResources[0].type).toBe('AWS::Unknown::Resource');
    });

    it('generates outputs', () => {
      const generator = createTerraformGenerator({
        outputDir: '/tmp/terraform',
        organizeByService: false,
      });

      const resources: DiscoveredResource[] = [
        createMockResource('AWS::EC2::Instance', 'i-1234567890abcdef0', {
          imageId: 'ami-12345678',
          instanceType: 't2.micro',
        }, { name: 'web-server' }),
      ];

      const result = generator.generate(resources);

      expect(result.outputs.length).toBeGreaterThan(0);
      expect(result.outputs.some(o => o.name.includes('id'))).toBe(true);
    });

    it('calculates summary statistics', () => {
      const generator = createTerraformGenerator({
        outputDir: '/tmp/terraform',
      });

      const resources: DiscoveredResource[] = [
        createMockResource('AWS::EC2::Instance', 'i-1', { imageId: 'ami-1', instanceType: 't2.micro' }),
        createMockResource('AWS::EC2::Instance', 'i-2', { imageId: 'ami-2', instanceType: 't2.micro' }),
        createMockResource('AWS::S3::Bucket', 'bucket-1', {}),
        createMockResource('AWS::Unknown::Resource', 'unknown-1', {}),
      ];

      const result = generator.generate(resources);

      expect(result.summary.totalResources).toBe(4);
      expect(result.summary.mappedResources).toBe(3);
      expect(result.summary.unmappedResources).toBe(1);
      expect(result.summary.resourcesByService.ec2).toBe(2);
      expect(result.summary.resourcesByService.s3).toBe(1);
    });

    it('handles multiple resources of same type', () => {
      const generator = createTerraformGenerator({
        outputDir: '/tmp/terraform',
      });

      const resources: DiscoveredResource[] = [
        createMockResource('AWS::S3::Bucket', 'bucket-1', {}),
        createMockResource('AWS::S3::Bucket', 'bucket-2', {}),
        createMockResource('AWS::S3::Bucket', 'bucket-3', {}),
      ];

      const result = generator.generate(resources);

      expect(result.summary.mappedResources).toBe(3);

      const s3Content = result.files.get('s3.tf')!;
      expect(s3Content).toContain('bucket-1');
      expect(s3Content).toContain('bucket-2');
      expect(s3Content).toContain('bucket-3');
    });

    it('handles resources with tags', () => {
      const generator = createTerraformGenerator({
        outputDir: '/tmp/terraform',
      });

      const resources: DiscoveredResource[] = [
        createMockResource('AWS::EC2::Instance', 'i-1234567890abcdef0', {
          imageId: 'ami-12345678',
          instanceType: 't2.micro',
        }, {
          tags: {
            Name: 'web-server',
            Environment: 'production',
            'aws:autoscaling:groupName': 'should-be-filtered',
          },
        }),
      ];

      const result = generator.generate(resources);

      const ec2Content = result.files.get('ec2.tf')!;
      expect(ec2Content).toContain('Environment');
      expect(ec2Content).toContain('production');
      expect(ec2Content).not.toContain('aws:autoscaling:groupName');
    });

    it('handles empty resource list', () => {
      const generator = createTerraformGenerator({
        outputDir: '/tmp/terraform',
      });

      const result = generator.generate([]);

      expect(result.files.has('providers.tf')).toBe(true);
      expect(result.unmappedResources).toHaveLength(0);
      expect(result.summary.totalResources).toBe(0);
      expect(result.summary.mappedResources).toBe(0);
    });

    it('handles complex VPC setup', () => {
      const generator = createTerraformGenerator({
        outputDir: '/tmp/terraform',
      });

      const resources: DiscoveredResource[] = [
        createMockResource('AWS::EC2::VPC', 'vpc-12345678', {
          cidrBlock: '10.0.0.0/16',
        }),
        createMockResource('AWS::EC2::Subnet', 'subnet-12345678', {
          vpcId: 'vpc-12345678',
          cidrBlock: '10.0.1.0/24',
          availabilityZone: 'us-east-1a',
        }),
        createMockResource('AWS::EC2::InternetGateway', 'igw-12345678', {
          attachments: [{ vpcId: 'vpc-12345678' }],
        }),
        createMockResource('AWS::EC2::RouteTable', 'rtb-12345678', {
          vpcId: 'vpc-12345678',
          routes: [
            { destinationCidrBlock: '0.0.0.0/0', gatewayId: 'igw-12345678' },
          ],
        }),
      ];

      const result = generator.generate(resources);

      expect(result.summary.mappedResources).toBe(4);
      expect(result.files.has('vpc.tf')).toBe(true);

      const vpcContent = result.files.get('vpc.tf')!;
      expect(vpcContent).toContain('aws_vpc');
      expect(vpcContent).toContain('aws_subnet');
      expect(vpcContent).toContain('aws_internet_gateway');
      expect(vpcContent).toContain('aws_route_table');
    });
  });
});

describe('createTerraformGenerator', () => {
  it('creates a TerraformGenerator instance', () => {
    const generator = createTerraformGenerator({
      outputDir: '/tmp/terraform',
    });
    expect(generator).toBeInstanceOf(TerraformGenerator);
  });
});
