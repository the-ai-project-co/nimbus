/**
 * AWS Terraform Generation E2E Workflow Tests
 *
 * Tests complete end-to-end workflows for AWS infrastructure discovery
 * and Terraform generation. These tests verify the full system integration.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { startServer, type ServerInstances } from '../../services/aws-tools-service/src/server';
import { getTestPorts, createTestClient, waitForService, createTempDir, removeTempDir } from '../utils/test-helpers';
import * as fs from 'fs';
import * as path from 'path';

describe('AWS Terraform Workflow E2E Tests', () => {
  let server: ServerInstances;
  let client: ReturnType<typeof createTestClient>;
  let tempDir: string;
  const ports = getTestPorts();
  const BASE_URL = `http://localhost:${ports.http}`;

  beforeAll(async () => {
    server = await startServer(ports.http);
    await waitForService(BASE_URL);
    client = createTestClient(BASE_URL);
    tempDir = await createTempDir('aws-e2e-');
  });

  afterAll(async () => {
    server?.stop?.();
    await removeTempDir(tempDir);
  });

  // ==================== Complete Workflow Tests ====================

  describe('Direct Resource to Terraform Workflow', () => {
    it('completes full workflow: resources → terraform → files', async () => {
      // Step 1: Define infrastructure
      const infrastructure = [
        {
          id: 'vpc-main',
          type: 'AWS::EC2::VPC',
          region: 'us-east-1',
          name: 'main-vpc',
          tags: { Environment: 'production' },
          properties: { cidrBlock: '10.0.0.0/16' },
        },
        {
          id: 'subnet-public',
          type: 'AWS::EC2::Subnet',
          region: 'us-east-1',
          name: 'public-subnet',
          properties: {
            vpcId: 'vpc-main',
            cidrBlock: '10.0.1.0/24',
          },
        },
        {
          id: 'i-webserver',
          type: 'AWS::EC2::Instance',
          region: 'us-east-1',
          name: 'web-server',
          tags: { Role: 'webserver' },
          properties: {
            imageId: 'ami-0123456789',
            instanceType: 't3.micro',
            subnetId: 'subnet-public',
          },
        },
        {
          id: 'app-bucket',
          type: 'AWS::S3::Bucket',
          region: 'us-east-1',
          name: 'my-app-assets',
          properties: {},
        },
      ];

      // Step 2: Generate Terraform
      const generateResult = await client.post('/api/aws/terraform/generate-direct', {
        resources: infrastructure,
        options: {
          organizeByService: true,
          generateImportBlocks: true,
        },
      });

      expect(generateResult.status).toBe(200);
      expect(generateResult.data.success).toBe(true);

      const { terraformSessionId, files, summary, imports, importScript } = generateResult.data.data;

      // Verify generation results
      expect(terraformSessionId).toBeDefined();
      expect(summary.mappedResources).toBe(4);
      expect(summary.unmappedResources).toBe(0);
      expect(Object.keys(files)).toContain('providers.tf');
      expect(Object.keys(files)).toContain('vpc.tf');
      expect(Object.keys(files)).toContain('ec2.tf');
      expect(Object.keys(files)).toContain('s3.tf');

      // Step 3: Verify file contents
      expect(files['vpc.tf']).toContain('aws_vpc');
      expect(files['vpc.tf']).toContain('aws_subnet');
      expect(files['ec2.tf']).toContain('aws_instance');
      expect(files['s3.tf']).toContain('aws_s3_bucket');

      // Step 4: Verify imports
      expect(imports.length).toBeGreaterThan(0);
      expect(importScript).toContain('#!/bin/bash');
      expect(importScript).toContain('terraform import');

      // Step 5: Write files to disk and verify
      const outputDir = path.join(tempDir, 'workflow-test');
      fs.mkdirSync(outputDir, { recursive: true });

      for (const [filename, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(outputDir, filename), content as string);
      }

      // Verify files exist
      expect(fs.existsSync(path.join(outputDir, 'providers.tf'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'vpc.tf'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'ec2.tf'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 's3.tf'))).toBe(true);

      // Step 6: Verify session retrieval
      const filesResult = await client.get(`/api/aws/terraform/${terraformSessionId}/files`);
      expect(filesResult.status).toBe(200);
      expect(filesResult.data.data.files).toHaveLength(Object.keys(files).length);

      const downloadResult = await client.get(`/api/aws/terraform/${terraformSessionId}/download`);
      expect(downloadResult.status).toBe(200);
      expect(downloadResult.data.data.files).toEqual(files);
    });
  });

  describe('Multi-Region Infrastructure Workflow', () => {
    it('handles resources across multiple regions', async () => {
      const multiRegionInfra = [
        {
          id: 'bucket-us-east',
          type: 'AWS::S3::Bucket',
          region: 'us-east-1',
          name: 'assets-us-east',
          properties: {},
        },
        {
          id: 'bucket-eu-west',
          type: 'AWS::S3::Bucket',
          region: 'eu-west-1',
          name: 'assets-eu-west',
          properties: {},
        },
        {
          id: 'bucket-ap-northeast',
          type: 'AWS::S3::Bucket',
          region: 'ap-northeast-1',
          name: 'assets-ap-northeast',
          properties: {},
        },
      ];

      const result = await client.post('/api/aws/terraform/generate-direct', {
        resources: multiRegionInfra,
      });

      expect(result.status).toBe(200);
      expect(result.data.data.summary.mappedResources).toBe(3);
      // All buckets should be in s3.tf regardless of region
      expect(result.data.data.files['s3.tf']).toBeDefined();
      expect(result.data.data.files['s3.tf']).toContain('assets_us_east');
      expect(result.data.data.files['s3.tf']).toContain('assets_eu_west');
      expect(result.data.data.files['s3.tf']).toContain('assets_ap_northeast');
    });
  });

  describe('Serverless Application Workflow', () => {
    it('generates complete serverless stack terraform', async () => {
      const serverlessStack = [
        // Lambda function
        {
          id: 'api-function',
          type: 'AWS::Lambda::Function',
          region: 'us-east-1',
          name: 'api-handler',
          tags: { Application: 'my-api' },
          properties: {
            functionName: 'my-api-handler',
            runtime: 'nodejs18.x',
            handler: 'index.handler',
            memorySize: 512,
            timeout: 30,
            environment: {
              variables: {
                TABLE_NAME: 'my-data-table',
              },
            },
          },
        },
        // DynamoDB table
        {
          id: 'data-table',
          type: 'AWS::DynamoDB::Table',
          region: 'us-east-1',
          name: 'my-data-table',
          properties: {
            tableName: 'my-data-table',
            attributeDefinitions: [
              { attributeName: 'pk', attributeType: 'S' },
              { attributeName: 'sk', attributeType: 'S' },
            ],
            keySchema: [
              { attributeName: 'pk', keyType: 'HASH' },
              { attributeName: 'sk', keyType: 'RANGE' },
            ],
            billingMode: 'PAY_PER_REQUEST',
          },
        },
        // IAM role for Lambda
        {
          id: 'lambda-role',
          type: 'AWS::IAM::Role',
          region: 'us-east-1',
          name: 'api-lambda-role',
          properties: {
            roleName: 'api-lambda-role',
            assumeRolePolicyDocument: JSON.stringify({
              Version: '2012-10-17',
              Statement: [{
                Effect: 'Allow',
                Principal: { Service: 'lambda.amazonaws.com' },
                Action: 'sts:AssumeRole',
              }],
            }),
          },
        },
      ];

      const result = await client.post('/api/aws/terraform/generate-direct', {
        resources: serverlessStack,
        options: { organizeByService: true },
      });

      expect(result.status).toBe(200);

      const { files, summary } = result.data.data;

      expect(summary.mappedResources).toBe(3);
      // Check that files for each service are generated
      expect(files['lambda.tf']).toBeDefined();
      expect(files['dynamodb.tf']).toBeDefined();
      expect(files['iam.tf']).toBeDefined();

      // Verify Lambda file
      expect(files['lambda.tf']).toContain('aws_lambda_function');
      expect(files['lambda.tf']).toContain('api-handler');

      // Verify DynamoDB file
      expect(files['dynamodb.tf']).toContain('aws_dynamodb_table');
      expect(files['dynamodb.tf']).toContain('my-data-table');

      // Verify IAM file
      expect(files['iam.tf']).toContain('aws_iam_role');
    });
  });

  describe('Microservices Architecture Workflow', () => {
    it('generates terraform for ECS-based microservices', async () => {
      const microservicesInfra = [
        // ECS Cluster
        {
          id: 'ecs-cluster',
          type: 'AWS::ECS::Cluster',
          region: 'us-east-1',
          name: 'microservices-cluster',
          properties: {
            clusterName: 'microservices-cluster',
          },
        },
        // ECS Service
        {
          id: 'api-service',
          type: 'AWS::ECS::Service',
          region: 'us-east-1',
          name: 'api-service',
          properties: {
            serviceName: 'api-service',
            cluster: 'microservices-cluster',
            desiredCount: 2,
            launchType: 'FARGATE',
          },
        },
        // Application Load Balancer (if supported)
        {
          id: 'api-alb',
          type: 'AWS::ElasticLoadBalancingV2::LoadBalancer',
          region: 'us-east-1',
          name: 'api-alb',
          properties: {
            name: 'api-alb',
            scheme: 'internet-facing',
            type: 'application',
          },
        },
        // VPC for networking
        {
          id: 'services-vpc',
          type: 'AWS::EC2::VPC',
          region: 'us-east-1',
          name: 'services-vpc',
          properties: { cidrBlock: '10.0.0.0/16' },
        },
      ];

      const result = await client.post('/api/aws/terraform/generate-direct', {
        resources: microservicesInfra,
      });

      expect(result.status).toBe(200);

      const { summary, unmappedResources } = result.data.data;

      // ECS should be mapped
      expect(summary.mappedResources).toBeGreaterThanOrEqual(3);

      // ALB might be unmapped if not supported
      if (unmappedResources.length > 0) {
        expect(unmappedResources.some(r => r.type.includes('LoadBalancing'))).toBe(true);
      }
    });
  });

  describe('Data Platform Workflow', () => {
    it('generates terraform for data platform infrastructure', async () => {
      const dataPlatform = [
        // RDS Instance
        {
          id: 'analytics-db',
          type: 'AWS::RDS::DBInstance',
          region: 'us-east-1',
          name: 'analytics-postgres',
          tags: { Purpose: 'analytics' },
          properties: {
            dbInstanceIdentifier: 'analytics-postgres',
            engine: 'postgres',
            engineVersion: '14.7',
            dbInstanceClass: 'db.t3.medium',
            allocatedStorage: 100,
            storageType: 'gp3',
            multiAZ: true,
          },
        },
        // S3 Data Lake
        {
          id: 'data-lake',
          type: 'AWS::S3::Bucket',
          region: 'us-east-1',
          name: 'company-data-lake',
          properties: {
            versioning: { status: 'Enabled' },
          },
        },
        // DynamoDB for real-time
        {
          id: 'realtime-cache',
          type: 'AWS::DynamoDB::Table',
          region: 'us-east-1',
          name: 'realtime-cache',
          properties: {
            tableName: 'realtime-cache',
            billingMode: 'PAY_PER_REQUEST',
          },
        },
      ];

      const result = await client.post('/api/aws/terraform/generate-direct', {
        resources: dataPlatform,
        options: { organizeByService: true },
      });

      expect(result.status).toBe(200);

      const { files, summary } = result.data.data;

      expect(summary.mappedResources).toBe(3);
      expect(Object.keys(files)).toContain('rds.tf');
      expect(Object.keys(files)).toContain('s3.tf');
      expect(Object.keys(files)).toContain('dynamodb.tf');

      // Verify RDS configuration
      expect(files['rds.tf']).toContain('aws_db_instance');
      expect(files['rds.tf']).toContain('postgres');
    });
  });

  describe('Session Persistence Workflow', () => {
    it('maintains session data across multiple requests', async () => {
      // Generate initial terraform
      const resources = [
        {
          id: 'test-bucket',
          type: 'AWS::S3::Bucket',
          region: 'us-east-1',
          properties: {},
        },
      ];

      const genResult = await client.post('/api/aws/terraform/generate-direct', { resources });
      const { terraformSessionId } = genResult.data.data;

      // Make multiple requests to the same session
      const listResult1 = await client.get(`/api/aws/terraform/${terraformSessionId}/files`);
      const listResult2 = await client.get(`/api/aws/terraform/${terraformSessionId}/files`);

      expect(listResult1.data.data.files).toEqual(listResult2.data.data.files);

      // Get specific files
      const file1 = await client.get(`/api/aws/terraform/${terraformSessionId}/file/providers.tf`);
      const file2 = await client.get(`/api/aws/terraform/${terraformSessionId}/file/s3.tf`);

      expect(file1.status).toBe(200);
      expect(file2.status).toBe(200);

      // Download and verify completeness
      const download = await client.get(`/api/aws/terraform/${terraformSessionId}/download`);
      expect(download.data.data.files['providers.tf']).toBe(file1.data.data.content);
      expect(download.data.data.files['s3.tf']).toBe(file2.data.data.content);
    });
  });

  describe('Error Recovery Workflow', () => {
    it('handles partial failures gracefully', async () => {
      const mixedResources = [
        // Valid resources
        {
          id: 'valid-bucket',
          type: 'AWS::S3::Bucket',
          region: 'us-east-1',
          properties: {},
        },
        {
          id: 'valid-instance',
          type: 'AWS::EC2::Instance',
          region: 'us-east-1',
          properties: { imageId: 'ami-123', instanceType: 't2.micro' },
        },
        // Unknown/unsupported resources
        {
          id: 'unknown-1',
          type: 'AWS::CustomService::Resource',
          region: 'us-east-1',
          properties: {},
        },
        {
          id: 'unknown-2',
          type: 'AWS::AnotherService::Thing',
          region: 'us-east-1',
          properties: {},
        },
      ];

      const result = await client.post('/api/aws/terraform/generate-direct', { resources: mixedResources });

      // Should succeed despite unknown resources
      expect(result.status).toBe(200);
      expect(result.data.success).toBe(true);

      // Should have processed valid resources
      expect(result.data.data.summary.mappedResources).toBe(2);
      expect(result.data.data.summary.unmappedResources).toBe(2);

      // Should report unmapped resources
      expect(result.data.data.unmappedResources).toHaveLength(2);

      // Should still generate files for valid resources
      expect(result.data.data.files['s3.tf']).toBeDefined();
      expect(result.data.data.files['ec2.tf']).toBeDefined();
    });
  });

  describe('Large Scale Infrastructure Workflow', () => {
    it('handles large number of resources', async () => {
      // Generate 50 resources across multiple services
      const largeInfra: any[] = [];

      // Add 20 EC2 instances
      for (let i = 0; i < 20; i++) {
        largeInfra.push({
          id: `i-instance-${i}`,
          type: 'AWS::EC2::Instance',
          region: i % 2 === 0 ? 'us-east-1' : 'us-west-2',
          name: `server-${i}`,
          properties: { imageId: 'ami-123', instanceType: 't2.micro' },
        });
      }

      // Add 15 S3 buckets
      for (let i = 0; i < 15; i++) {
        largeInfra.push({
          id: `bucket-${i}`,
          type: 'AWS::S3::Bucket',
          region: 'us-east-1',
          name: `bucket-${i}`,
          properties: {},
        });
      }

      // Add 10 Lambda functions
      for (let i = 0; i < 10; i++) {
        largeInfra.push({
          id: `function-${i}`,
          type: 'AWS::Lambda::Function',
          region: 'us-east-1',
          name: `function-${i}`,
          properties: { runtime: 'nodejs18.x', handler: 'index.handler' },
        });
      }

      // Add 5 DynamoDB tables
      for (let i = 0; i < 5; i++) {
        largeInfra.push({
          id: `table-${i}`,
          type: 'AWS::DynamoDB::Table',
          region: 'us-east-1',
          name: `table-${i}`,
          properties: {},
        });
      }

      const result = await client.post('/api/aws/terraform/generate-direct', {
        resources: largeInfra,
        options: { organizeByService: true },
      });

      expect(result.status).toBe(200);
      expect(result.data.data.summary.mappedResources).toBe(50);
      expect(result.data.data.summary.totalResources).toBe(50);

      // Verify all service files exist
      expect(result.data.data.files['ec2.tf']).toBeDefined();
      expect(result.data.data.files['s3.tf']).toBeDefined();
      expect(result.data.data.files['lambda.tf']).toBeDefined();
      expect(result.data.data.files['dynamodb.tf']).toBeDefined();

      // Verify import script has all resources
      expect(result.data.data.imports.length).toBe(50);
    });
  });
});
