/**
 * AWS Tools Service Integration Tests
 *
 * Tests the complete workflows for AWS infrastructure discovery
 * and Terraform generation without requiring actual AWS credentials.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { startServer, type ServerInstances } from '../../../services/aws-tools-service/src/server';
import { getTestPorts, createTestClient, waitForService } from '../../utils/test-helpers';

describe('AWS Tools Service Integration Tests', () => {
  let server: ServerInstances;
  let client: ReturnType<typeof createTestClient>;
  const ports = getTestPorts();
  const BASE_URL = `http://localhost:${ports.http}`;

  beforeAll(async () => {
    server = await startServer(ports.http);
    await waitForService(BASE_URL);
    client = createTestClient(BASE_URL);
  });

  afterAll(() => {
    server?.stop?.();
  });

  // ==================== Health Check ====================

  describe('Health Check', () => {
    it('returns healthy status', async () => {
      const result = await client.get('/health');

      expect(result.status).toBe(200);
      expect(result.data.status).toBe('healthy');
      expect(result.data.service).toBe('aws-tools-service');
      expect(result.data.timestamp).toBeDefined();
    });
  });

  // ==================== Profile Management ====================

  describe('Profile Management', () => {
    it('lists available AWS profiles', async () => {
      const result = await client.get('/api/aws/profiles');

      expect(result.status).toBe(200);
      expect(result.data.success).toBe(true);
      expect(result.data.data.profiles).toBeInstanceOf(Array);
    });

    it('includes profile metadata in response', async () => {
      const result = await client.get('/api/aws/profiles');

      if (result.data.data.profiles.length > 0) {
        const profile = result.data.data.profiles[0];
        expect(profile).toHaveProperty('name');
        expect(profile).toHaveProperty('source');
      }
    });
  });

  // ==================== Region Management ====================

  describe('Region Management', () => {
    it('lists all AWS regions', async () => {
      const result = await client.get('/api/aws/regions');

      expect(result.status).toBe(200);
      expect(result.data.success).toBe(true);
      expect(result.data.data.regions).toBeInstanceOf(Array);
      expect(result.data.data.total).toBeGreaterThan(0);
    });

    it('returns regions with metadata', async () => {
      const result = await client.get('/api/aws/regions');

      const region = result.data.data.regions[0];
      expect(region).toHaveProperty('name');
      expect(region).toHaveProperty('displayName');
    });

    it('supports grouped regions parameter', async () => {
      const result = await client.get('/api/aws/regions?grouped=true');

      expect(result.status).toBe(200);
      expect(result.data.success).toBe(true);
      expect(result.data.data.regions).toBeDefined();
    });

    it('validates valid regions correctly', async () => {
      const result = await client.post('/api/aws/regions/validate', {
        regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
      });

      expect(result.status).toBe(200);
      expect(result.data.success).toBe(true);
      expect(result.data.data.valid).toContain('us-east-1');
      expect(result.data.data.valid).toContain('us-west-2');
      expect(result.data.data.valid).toContain('eu-west-1');
      expect(result.data.data.invalid).toEqual([]);
    });

    it('identifies invalid regions', async () => {
      const result = await client.post('/api/aws/regions/validate', {
        regions: ['us-east-1', 'invalid-region', 'fake-region-123'],
      });

      expect(result.status).toBe(200);
      expect(result.data.success).toBe(true);
      expect(result.data.data.valid).toContain('us-east-1');
      expect(result.data.data.invalid).toContain('invalid-region');
      expect(result.data.data.invalid).toContain('fake-region-123');
    });

    it('returns error when regions not provided', async () => {
      const result = await client.post('/api/aws/regions/validate', {});

      expect(result.status).toBe(400);
      expect(result.data.success).toBe(false);
      expect(result.data.error).toContain('regions');
    });
  });

  // ==================== Terraform Generation ====================

  describe('Terraform Generation', () => {
    describe('Supported Types', () => {
      it('returns list of supported AWS resource types', async () => {
        const result = await client.get('/api/aws/terraform/supported-types');

        expect(result.status).toBe(200);
        expect(result.data.success).toBe(true);
        expect(result.data.data.types).toBeInstanceOf(Array);
        expect(result.data.data.total).toBeGreaterThan(0);
      });

      it('includes common AWS resource types', async () => {
        const result = await client.get('/api/aws/terraform/supported-types');
        const types = result.data.data.types;

        expect(types).toContain('AWS::EC2::Instance');
        expect(types).toContain('AWS::S3::Bucket');
        expect(types).toContain('AWS::Lambda::Function');
        expect(types).toContain('AWS::RDS::DBInstance');
        expect(types).toContain('AWS::IAM::Role');
      });
    });

    describe('Direct Generation', () => {
      it('generates Terraform for EC2 instance', async () => {
        const resources = [
          {
            id: 'i-0123456789abcdef0',
            type: 'AWS::EC2::Instance',
            region: 'us-east-1',
            name: 'web-server',
            tags: { Environment: 'production', Name: 'web-server' },
            properties: {
              imageId: 'ami-12345678',
              instanceType: 't3.micro',
              subnetId: 'subnet-12345',
              securityGroups: ['sg-12345'],
            },
          },
        ];

        const result = await client.post('/api/aws/terraform/generate-direct', { resources });

        expect(result.status).toBe(200);
        expect(result.data.success).toBe(true);
        expect(result.data.data.terraformSessionId).toBeDefined();
        expect(result.data.data.files).toBeDefined();
        expect(result.data.data.summary.mappedResources).toBe(1);
      });

      it('generates Terraform for S3 bucket', async () => {
        const resources = [
          {
            id: 'my-app-bucket',
            type: 'AWS::S3::Bucket',
            region: 'us-west-2',
            name: 'my-app-bucket',
            tags: { Project: 'MyApp' },
            properties: {
              versioning: { status: 'Enabled' },
            },
          },
        ];

        const result = await client.post('/api/aws/terraform/generate-direct', { resources });

        expect(result.status).toBe(200);
        expect(result.data.data.files['s3.tf']).toContain('aws_s3_bucket');
      });

      it('generates Terraform for multiple resource types', async () => {
        const resources = [
          {
            id: 'i-ec2-test',
            type: 'AWS::EC2::Instance',
            region: 'us-east-1',
            properties: { imageId: 'ami-test', instanceType: 't2.micro' },
          },
          {
            id: 'my-bucket',
            type: 'AWS::S3::Bucket',
            region: 'us-east-1',
            properties: {},
          },
          {
            id: 'my-function',
            type: 'AWS::Lambda::Function',
            region: 'us-east-1',
            properties: { runtime: 'nodejs18.x', handler: 'index.handler' },
          },
        ];

        const result = await client.post('/api/aws/terraform/generate-direct', { resources });

        expect(result.status).toBe(200);
        expect(result.data.data.summary.mappedResources).toBe(3);
        expect(Object.keys(result.data.data.files)).toContain('ec2.tf');
        expect(Object.keys(result.data.data.files)).toContain('s3.tf');
        expect(Object.keys(result.data.data.files)).toContain('lambda.tf');
      });

      it('generates providers.tf with correct structure', async () => {
        const resources = [
          {
            id: 'test-instance',
            type: 'AWS::EC2::Instance',
            region: 'eu-west-1',
            properties: { imageId: 'ami-test', instanceType: 't2.micro' },
          },
        ];

        const result = await client.post('/api/aws/terraform/generate-direct', { resources });
        const providersContent = result.data.data.files['providers.tf'];

        expect(providersContent).toContain('terraform');
        expect(providersContent).toContain('provider "aws"');
        expect(providersContent).toContain('region');
      });

      it('handles unsupported resource types gracefully', async () => {
        const resources = [
          {
            id: 'unknown-resource',
            type: 'AWS::Unknown::Resource',
            region: 'us-east-1',
            properties: {},
          },
        ];

        const result = await client.post('/api/aws/terraform/generate-direct', { resources });

        expect(result.status).toBe(200);
        expect(result.data.data.summary.unmappedResources).toBe(1);
        expect(result.data.data.unmappedResources).toHaveLength(1);
      });

      it('returns error for empty resources array', async () => {
        const result = await client.post('/api/aws/terraform/generate-direct', { resources: [] });

        expect(result.status).toBe(400);
        expect(result.data.success).toBe(false);
      });

      it('returns error for missing required resource fields', async () => {
        const result = await client.post('/api/aws/terraform/generate-direct', {
          resources: [{ id: 'test' }], // Missing type and region
        });

        expect(result.status).toBe(400);
        expect(result.data.success).toBe(false);
      });
    });

    describe('Generation Options', () => {
      it('respects organizeByService=false option', async () => {
        const resources = [
          {
            id: 'i-test',
            type: 'AWS::EC2::Instance',
            region: 'us-east-1',
            properties: { imageId: 'ami-test', instanceType: 't2.micro' },
          },
          {
            id: 'bucket-test',
            type: 'AWS::S3::Bucket',
            region: 'us-east-1',
            properties: {},
          },
        ];

        const result = await client.post('/api/aws/terraform/generate-direct', {
          resources,
          options: { organizeByService: false },
        });

        expect(result.status).toBe(200);
        expect(Object.keys(result.data.data.files)).toContain('main.tf');
        expect(Object.keys(result.data.data.files)).not.toContain('ec2.tf');
        expect(Object.keys(result.data.data.files)).not.toContain('s3.tf');
      });

      it('generates import blocks when enabled', async () => {
        const resources = [
          {
            id: 'i-import-test',
            type: 'AWS::EC2::Instance',
            region: 'us-east-1',
            properties: { imageId: 'ami-test', instanceType: 't2.micro' },
          },
        ];

        const result = await client.post('/api/aws/terraform/generate-direct', {
          resources,
          options: { generateImportBlocks: true },
        });

        expect(result.status).toBe(200);
        expect(result.data.data.imports).toBeInstanceOf(Array);
        expect(result.data.data.imports.length).toBeGreaterThan(0);
      });

      it('generates import script', async () => {
        const resources = [
          {
            id: 'i-script-test',
            type: 'AWS::EC2::Instance',
            region: 'us-east-1',
            properties: { imageId: 'ami-test', instanceType: 't2.micro' },
          },
        ];

        const result = await client.post('/api/aws/terraform/generate-direct', { resources });

        expect(result.data.data.importScript).toContain('#!/bin/bash');
        expect(result.data.data.importScript).toContain('terraform import');
      });

      it('respects terraform version option', async () => {
        const resources = [
          {
            id: 'test-res',
            type: 'AWS::S3::Bucket',
            region: 'us-east-1',
            properties: {},
          },
        ];

        const result = await client.post('/api/aws/terraform/generate-direct', {
          resources,
          options: { terraformVersion: '1.4.0' },
        });

        expect(result.status).toBe(200);
        // Older version should still generate successfully
        expect(result.data.data.files).toBeDefined();
      });
    });

    describe('Session Management', () => {
      let terraformSessionId: string;

      beforeEach(async () => {
        // Create a terraform session
        const resources = [
          {
            id: 'session-test-instance',
            type: 'AWS::EC2::Instance',
            region: 'us-east-1',
            properties: { imageId: 'ami-test', instanceType: 't2.micro' },
          },
        ];

        const result = await client.post('/api/aws/terraform/generate-direct', { resources });
        terraformSessionId = result.data.data.terraformSessionId;
      });

      it('lists generated files for session', async () => {
        const result = await client.get(`/api/aws/terraform/${terraformSessionId}/files`);

        expect(result.status).toBe(200);
        expect(result.data.success).toBe(true);
        expect(result.data.data.files).toBeInstanceOf(Array);
        expect(result.data.data.total).toBeGreaterThan(0);
      });

      it('gets specific file content', async () => {
        const result = await client.get(`/api/aws/terraform/${terraformSessionId}/file/providers.tf`);

        expect(result.status).toBe(200);
        expect(result.data.success).toBe(true);
        expect(result.data.data.filename).toBe('providers.tf');
        expect(result.data.data.content).toContain('provider');
      });

      it('returns 404 for non-existent file', async () => {
        const result = await client.get(`/api/aws/terraform/${terraformSessionId}/file/nonexistent.tf`);

        expect(result.status).toBe(404);
      });

      it('downloads all files', async () => {
        const result = await client.get(`/api/aws/terraform/${terraformSessionId}/download`);

        expect(result.status).toBe(200);
        expect(result.data.success).toBe(true);
        expect(result.data.data.files).toBeDefined();
        expect(result.data.data.summary).toBeDefined();
      });

      it('gets import script', async () => {
        const result = await client.get(`/api/aws/terraform/${terraformSessionId}/import-script`);

        expect(result.status).toBe(200);
        expect(result.data.success).toBe(true);
        expect(result.data.data.script).toContain('terraform import');
      });

      it('returns 404 for non-existent session', async () => {
        const result = await client.get('/api/aws/terraform/non-existent-session/files');

        expect(result.status).toBe(404);
      });
    });
  });

  // ==================== Discovery Session Management ====================

  describe('Discovery Session Management', () => {
    it('returns error when starting discovery without regions', async () => {
      const result = await client.post('/api/aws/discover', {});

      expect(result.status).toBe(400);
      expect(result.data.success).toBe(false);
      expect(result.data.error).toContain('regions');
    });

    it('returns 404 for non-existent discovery session', async () => {
      const result = await client.get('/api/aws/discover/non-existent-session');

      expect(result.status).toBe(404);
      expect(result.data.success).toBe(false);
    });

    it('returns error when cancelling non-existent session', async () => {
      const result = await client.post('/api/aws/discover/non-existent-session/cancel');

      expect(result.status).toBe(400);
      expect(result.data.success).toBe(false);
    });
  });

  // ==================== Error Handling ====================

  describe('Error Handling', () => {
    it('returns 404 for unknown routes', async () => {
      const result = await client.get('/api/aws/unknown-endpoint');

      expect(result.status).toBe(404);
    });

    it('handles malformed JSON gracefully', async () => {
      const response = await fetch(`${BASE_URL}/api/aws/terraform/generate-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-valid-json',
      });

      expect(response.status).toBe(400);
    });
  });

  // ==================== Complex Scenarios ====================

  describe('Complex Scenarios', () => {
    it('generates complete VPC infrastructure', async () => {
      const resources = [
        {
          id: 'vpc-12345',
          type: 'AWS::EC2::VPC',
          region: 'us-east-1',
          name: 'main-vpc',
          properties: { cidrBlock: '10.0.0.0/16' },
        },
        {
          id: 'subnet-public-1',
          type: 'AWS::EC2::Subnet',
          region: 'us-east-1',
          name: 'public-subnet-1',
          properties: {
            vpcId: 'vpc-12345',
            cidrBlock: '10.0.1.0/24',
            availabilityZone: 'us-east-1a',
          },
        },
        {
          id: 'igw-12345',
          type: 'AWS::EC2::InternetGateway',
          region: 'us-east-1',
          name: 'main-igw',
          properties: {},
        },
        {
          id: 'sg-web',
          type: 'AWS::EC2::SecurityGroup',
          region: 'us-east-1',
          name: 'web-sg',
          properties: {
            vpcId: 'vpc-12345',
            description: 'Web security group',
          },
        },
      ];

      const result = await client.post('/api/aws/terraform/generate-direct', { resources });

      expect(result.status).toBe(200);
      expect(result.data.data.summary.mappedResources).toBe(4);
      expect(result.data.data.files['vpc.tf']).toBeDefined();
      expect(result.data.data.files['vpc.tf']).toContain('aws_vpc');
      expect(result.data.data.files['vpc.tf']).toContain('aws_subnet');
      expect(result.data.data.files['vpc.tf']).toContain('aws_internet_gateway');

      // Security groups may be in vpc.tf or ec2.tf depending on organization
      const allContent = Object.values(result.data.data.files).join('\n');
      expect(allContent).toContain('aws_security_group');
    });

    it('generates serverless stack', async () => {
      const resources = [
        {
          id: 'my-api-function',
          type: 'AWS::Lambda::Function',
          region: 'us-east-1',
          name: 'api-handler',
          properties: {
            runtime: 'nodejs18.x',
            handler: 'index.handler',
            memorySize: 256,
            timeout: 30,
          },
        },
        {
          id: 'api-data-table',
          type: 'AWS::DynamoDB::Table',
          region: 'us-east-1',
          name: 'api-data',
          properties: {
            tableName: 'api-data',
            keySchema: [{ attributeName: 'id', keyType: 'HASH' }],
            attributeDefinitions: [{ attributeName: 'id', attributeType: 'S' }],
            billingMode: 'PAY_PER_REQUEST',
          },
        },
        {
          id: 'lambda-role',
          type: 'AWS::IAM::Role',
          region: 'us-east-1',
          name: 'lambda-execution-role',
          properties: {
            assumeRolePolicyDocument: {
              Version: '2012-10-17',
              Statement: [{
                Effect: 'Allow',
                Principal: { Service: 'lambda.amazonaws.com' },
                Action: 'sts:AssumeRole',
              }],
            },
          },
        },
      ];

      const result = await client.post('/api/aws/terraform/generate-direct', { resources });

      expect(result.status).toBe(200);
      expect(result.data.data.summary.mappedResources).toBe(3);
      expect(result.data.data.files['lambda.tf']).toContain('aws_lambda_function');
      expect(result.data.data.files['dynamodb.tf']).toContain('aws_dynamodb_table');
      expect(result.data.data.files['iam.tf']).toContain('aws_iam_role');
    });

    it('handles mixed known and unknown resource types', async () => {
      const resources = [
        {
          id: 'known-bucket',
          type: 'AWS::S3::Bucket',
          region: 'us-east-1',
          properties: {},
        },
        {
          id: 'unknown-1',
          type: 'AWS::CustomService::Resource',
          region: 'us-east-1',
          properties: {},
        },
        {
          id: 'known-function',
          type: 'AWS::Lambda::Function',
          region: 'us-east-1',
          properties: { runtime: 'python3.9', handler: 'main.handler' },
        },
        {
          id: 'unknown-2',
          type: 'AWS::AnotherCustom::Thing',
          region: 'us-east-1',
          properties: {},
        },
      ];

      const result = await client.post('/api/aws/terraform/generate-direct', { resources });

      expect(result.status).toBe(200);
      expect(result.data.data.summary.mappedResources).toBe(2);
      expect(result.data.data.summary.unmappedResources).toBe(2);
      expect(result.data.data.unmappedResources).toHaveLength(2);
    });

    it('preserves resource tags in generation', async () => {
      const resources = [
        {
          id: 'tagged-instance',
          type: 'AWS::EC2::Instance',
          region: 'us-east-1',
          name: 'tagged-server',
          tags: {
            Environment: 'production',
            Team: 'platform',
            CostCenter: 'engineering',
          },
          properties: {
            imageId: 'ami-test',
            instanceType: 't3.medium',
          },
        },
      ];

      const result = await client.post('/api/aws/terraform/generate-direct', { resources });
      const ec2Content = result.data.data.files['ec2.tf'];

      expect(ec2Content).toContain('Environment');
      expect(ec2Content).toContain('production');
      expect(ec2Content).toContain('Team');
      expect(ec2Content).toContain('platform');
    });
  });
});
