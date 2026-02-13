/**
 * Terraform Project Generator Tests
 *
 * Tests for complete project generation, environment separation,
 * validation pipeline, and tflint-style checks.
 */

import { describe, it, expect } from 'bun:test';
import {
  TerraformProjectGenerator,
  type TerraformProjectConfig,
  type GeneratedFile,
} from '../generators/terraform-project-generator';

describe('TerraformProjectGenerator', () => {
  const generator = new TerraformProjectGenerator();

  const baseConfig: TerraformProjectConfig = {
    projectName: 'test-project',
    provider: 'aws',
    region: 'us-east-1',
    components: ['vpc', 'eks', 'rds', 's3'],
  };

  // ==================================================
  // Full Project Generation
  // ==================================================

  describe('generate', () => {
    it('should generate full project structure', async () => {
      const result = await generator.generate(baseConfig);
      const filePaths = result.files.map(f => f.path);

      // Root configuration files
      expect(filePaths).toContain('main.tf');
      expect(filePaths).toContain('variables.tf');
      expect(filePaths).toContain('outputs.tf');
      expect(filePaths).toContain('versions.tf');
      expect(filePaths).toContain('backend.tf');
      expect(filePaths).toContain('terraform.tfvars.example');
      expect(filePaths).toContain('README.md');

      // Environment tfvars
      expect(filePaths).toContain('environments/dev/terraform.tfvars');
      expect(filePaths).toContain('environments/staging/terraform.tfvars');
      expect(filePaths).toContain('environments/prod/terraform.tfvars');
    });

    it('should generate module files for each component', async () => {
      const result = await generator.generate({
        projectName: 'test',
        provider: 'aws',
        region: 'us-east-1',
        components: ['vpc', 's3'],
      });

      const filePaths = result.files.map(f => f.path);

      expect(filePaths).toContain('modules/vpc/main.tf');
      expect(filePaths).toContain('modules/vpc/variables.tf');
      expect(filePaths).toContain('modules/vpc/outputs.tf');
      expect(filePaths).toContain('modules/s3/main.tf');
      expect(filePaths).toContain('modules/s3/variables.tf');
      expect(filePaths).toContain('modules/s3/outputs.tf');
    });

    it('should generate all module files for all components', async () => {
      const result = await generator.generate(baseConfig);
      const filePaths = result.files.map(f => f.path);

      for (const component of baseConfig.components) {
        expect(filePaths).toContain(`modules/${component}/main.tf`);
        expect(filePaths).toContain(`modules/${component}/variables.tf`);
        expect(filePaths).toContain(`modules/${component}/outputs.tf`);
      }
    });

    it('should include project name in main.tf', async () => {
      const result = await generator.generate(baseConfig);
      const mainTf = result.files.find(f => f.path === 'main.tf');

      expect(mainTf).toBeDefined();
      expect(mainTf!.content).toContain('test-project');
    });

    it('should include provider block in main.tf', async () => {
      const result = await generator.generate(baseConfig);
      const mainTf = result.files.find(f => f.path === 'main.tf');

      expect(mainTf!.content).toContain('provider "aws"');
      expect(mainTf!.content).toContain('var.region');
    });

    it('should include module blocks in main.tf', async () => {
      const result = await generator.generate(baseConfig);
      const mainTf = result.files.find(f => f.path === 'main.tf');

      expect(mainTf!.content).toContain('module "vpc"');
      expect(mainTf!.content).toContain('module "eks"');
      expect(mainTf!.content).toContain('module "rds"');
      expect(mainTf!.content).toContain('module "s3"');
    });

    it('should generate variables for all components', async () => {
      const result = await generator.generate(baseConfig);
      const variablesTf = result.files.find(f => f.path === 'variables.tf');

      expect(variablesTf!.content).toContain('variable "project_name"');
      expect(variablesTf!.content).toContain('variable "environment"');
      expect(variablesTf!.content).toContain('variable "region"');
      expect(variablesTf!.content).toContain('variable "vpc_cidr"');
      expect(variablesTf!.content).toContain('variable "node_instance_type"');
      expect(variablesTf!.content).toContain('variable "db_instance_class"');
      expect(variablesTf!.content).toContain('variable "bucket_name"');
    });

    it('should generate outputs for all components', async () => {
      const result = await generator.generate(baseConfig);
      const outputsTf = result.files.find(f => f.path === 'outputs.tf');

      expect(outputsTf!.content).toContain('output "vpc_id"');
      expect(outputsTf!.content).toContain('output "eks_cluster_endpoint"');
      expect(outputsTf!.content).toContain('output "rds_endpoint"');
      expect(outputsTf!.content).toContain('output "s3_bucket_arn"');
    });

    it('should mark rds_endpoint as sensitive', async () => {
      const result = await generator.generate(baseConfig);
      const outputsTf = result.files.find(f => f.path === 'outputs.tf');

      expect(outputsTf!.content).toContain('sensitive   = true');
    });

    it('should include environment validation in variables.tf', async () => {
      const result = await generator.generate(baseConfig);
      const variablesTf = result.files.find(f => f.path === 'variables.tf');

      expect(variablesTf!.content).toContain('validation {');
      expect(variablesTf!.content).toContain('contains(["dev", "staging", "prod"]');
    });

    it('should include terraform version constraint', async () => {
      const result = await generator.generate(baseConfig);
      const versionsTf = result.files.find(f => f.path === 'versions.tf');

      expect(versionsTf!.content).toContain('required_version = ">= 1.5.0"');
      expect(versionsTf!.content).toContain('hashicorp/aws');
      expect(versionsTf!.content).toContain('~> 5.0');
    });

    it('should generate s3 backend for aws', async () => {
      const result = await generator.generate(baseConfig);
      const backendTf = result.files.find(f => f.path === 'backend.tf');

      expect(backendTf!.content).toContain('backend "s3"');
      expect(backendTf!.content).toContain('encrypt        = true');
      expect(backendTf!.content).toContain('dynamodb_table');
    });

    it('should use custom backend config when provided', async () => {
      const result = await generator.generate({
        ...baseConfig,
        backendConfig: {
          bucket: 'my-custom-bucket',
          dynamodbTable: 'my-lock-table',
          key: 'custom/key.tfstate',
        },
      });
      const backendTf = result.files.find(f => f.path === 'backend.tf');

      expect(backendTf!.content).toContain('my-custom-bucket');
      expect(backendTf!.content).toContain('my-lock-table');
      expect(backendTf!.content).toContain('custom/key.tfstate');
    });

    it('should generate README with project details', async () => {
      const result = await generator.generate(baseConfig);
      const readme = result.files.find(f => f.path === 'README.md');

      expect(readme!.content).toContain('# test-project');
      expect(readme!.content).toContain('VPC');
      expect(readme!.content).toContain('EKS');
      expect(readme!.content).toContain('terraform init');
      expect(readme!.content).toContain('terraform plan');
    });
  });

  // ==================================================
  // Single Component Generation
  // ==================================================

  describe('single component', () => {
    it('should generate project with only vpc', async () => {
      const result = await generator.generate({
        projectName: 'vpc-only',
        provider: 'aws',
        region: 'us-west-2',
        components: ['vpc'],
      });

      const filePaths = result.files.map(f => f.path);
      expect(filePaths).toContain('modules/vpc/main.tf');
      expect(filePaths).not.toContain('modules/eks/main.tf');

      const variablesTf = result.files.find(f => f.path === 'variables.tf');
      expect(variablesTf!.content).toContain('variable "vpc_cidr"');
      expect(variablesTf!.content).not.toContain('variable "node_count"');
    });

    it('should generate project with only s3', async () => {
      const result = await generator.generate({
        projectName: 's3-only',
        provider: 'aws',
        region: 'us-east-1',
        components: ['s3'],
      });

      const filePaths = result.files.map(f => f.path);
      expect(filePaths).toContain('modules/s3/main.tf');
      expect(filePaths).not.toContain('modules/vpc/main.tf');

      const outputsTf = result.files.find(f => f.path === 'outputs.tf');
      expect(outputsTf!.content).toContain('output "s3_bucket_arn"');
      expect(outputsTf!.content).not.toContain('output "vpc_id"');
    });

    it('should handle unknown component gracefully', async () => {
      const result = await generator.generate({
        projectName: 'custom',
        provider: 'aws',
        region: 'us-east-1',
        components: ['custom-component'],
      });

      const filePaths = result.files.map(f => f.path);
      expect(filePaths).toContain('modules/custom-component/main.tf');
      expect(filePaths).toContain('modules/custom-component/variables.tf');
    });
  });

  // ==================================================
  // Environment Separation (Gap #10)
  // ==================================================

  describe('environment separation', () => {
    it('should have different instance sizes per environment', async () => {
      const result = await generator.generate({
        projectName: 'test',
        provider: 'aws',
        region: 'us-east-1',
        components: ['eks'],
      });

      const devTfvars = result.files.find(
        f => f.path === 'environments/dev/terraform.tfvars',
      );
      const stagingTfvars = result.files.find(
        f => f.path === 'environments/staging/terraform.tfvars',
      );
      const prodTfvars = result.files.find(
        f => f.path === 'environments/prod/terraform.tfvars',
      );

      expect(devTfvars?.content).toContain('t3.small');
      expect(stagingTfvars?.content).toContain('t3.medium');
      expect(prodTfvars?.content).toContain('t3.large');
    });

    it('should have more nodes in prod', async () => {
      const result = await generator.generate({
        projectName: 'test',
        provider: 'aws',
        region: 'us-east-1',
        components: ['eks'],
      });

      const devTfvars = result.files.find(
        f => f.path === 'environments/dev/terraform.tfvars',
      );
      const prodTfvars = result.files.find(
        f => f.path === 'environments/prod/terraform.tfvars',
      );

      expect(devTfvars?.content).toContain('node_count         = 1');
      expect(prodTfvars?.content).toContain('node_count         = 3');
    });

    it('should have different CIDR blocks per environment', async () => {
      const result = await generator.generate({
        projectName: 'test',
        provider: 'aws',
        region: 'us-east-1',
        components: ['vpc'],
      });

      const devTfvars = result.files.find(
        f => f.path === 'environments/dev/terraform.tfvars',
      );
      const stagingTfvars = result.files.find(
        f => f.path === 'environments/staging/terraform.tfvars',
      );
      const prodTfvars = result.files.find(
        f => f.path === 'environments/prod/terraform.tfvars',
      );

      expect(devTfvars?.content).toContain('10.0.0.0/16');
      expect(stagingTfvars?.content).toContain('10.1.0.0/16');
      expect(prodTfvars?.content).toContain('10.2.0.0/16');
    });

    it('should have larger database in prod', async () => {
      const result = await generator.generate({
        projectName: 'test',
        provider: 'aws',
        region: 'us-east-1',
        components: ['rds'],
      });

      const devTfvars = result.files.find(
        f => f.path === 'environments/dev/terraform.tfvars',
      );
      const prodTfvars = result.files.find(
        f => f.path === 'environments/prod/terraform.tfvars',
      );

      expect(devTfvars?.content).toContain('db.t3.micro');
      expect(devTfvars?.content).toContain('db_storage_size   = 20');
      expect(prodTfvars?.content).toContain('db.r6g.large');
      expect(prodTfvars?.content).toContain('db_storage_size   = 100');
    });

    it('should have more availability zones in prod', async () => {
      const result = await generator.generate({
        projectName: 'test',
        provider: 'aws',
        region: 'us-east-1',
        components: ['vpc'],
      });

      const devTfvars = result.files.find(
        f => f.path === 'environments/dev/terraform.tfvars',
      );
      const prodTfvars = result.files.find(
        f => f.path === 'environments/prod/terraform.tfvars',
      );

      // Dev: 2 AZs
      expect(devTfvars?.content).toContain('"us-east-1a"');
      expect(devTfvars?.content).toContain('"us-east-1b"');

      // Prod: 3 AZs
      expect(prodTfvars?.content).toContain('"us-east-1a"');
      expect(prodTfvars?.content).toContain('"us-east-1b"');
      expect(prodTfvars?.content).toContain('"us-east-1c"');
    });

    it('should set correct environment label in tfvars', async () => {
      const result = await generator.generate({
        projectName: 'my-app',
        provider: 'aws',
        region: 'eu-west-1',
        components: ['vpc'],
      });

      const devTfvars = result.files.find(
        f => f.path === 'environments/dev/terraform.tfvars',
      );
      const prodTfvars = result.files.find(
        f => f.path === 'environments/prod/terraform.tfvars',
      );

      expect(devTfvars?.content).toContain('environment  = "dev"');
      expect(prodTfvars?.content).toContain('environment  = "prod"');
    });

    it('should include tags in environment tfvars', async () => {
      const result = await generator.generate({
        projectName: 'tagged-project',
        provider: 'aws',
        region: 'us-east-1',
        components: ['vpc'],
      });

      const stagingTfvars = result.files.find(
        f => f.path === 'environments/staging/terraform.tfvars',
      );

      expect(stagingTfvars?.content).toContain('tags = {');
      expect(stagingTfvars?.content).toContain('Environment = "staging"');
      expect(stagingTfvars?.content).toContain('ManagedBy   = "terraform"');
    });
  });

  // ==================================================
  // Different Providers
  // ==================================================

  describe('providers', () => {
    it('should generate GCP provider block', async () => {
      const result = await generator.generate({
        projectName: 'gcp-project',
        provider: 'gcp',
        region: 'us-central1',
        components: ['vpc'],
      });

      const mainTf = result.files.find(f => f.path === 'main.tf');
      expect(mainTf!.content).toContain('provider "google"');
      expect(mainTf!.content).toContain('var.project_name');

      const versionsTf = result.files.find(f => f.path === 'versions.tf');
      expect(versionsTf!.content).toContain('hashicorp/google');
    });

    it('should generate Azure provider block', async () => {
      const result = await generator.generate({
        projectName: 'azure-project',
        provider: 'azure',
        region: 'eastus',
        components: ['vpc'],
      });

      const mainTf = result.files.find(f => f.path === 'main.tf');
      expect(mainTf!.content).toContain('provider "azurerm"');
      expect(mainTf!.content).toContain('features {}');

      const versionsTf = result.files.find(f => f.path === 'versions.tf');
      expect(versionsTf!.content).toContain('hashicorp/azurerm');
      expect(versionsTf!.content).toContain('~> 3.0');
    });

    it('should generate commented backend for GCP', async () => {
      const result = await generator.generate({
        projectName: 'gcp-project',
        provider: 'gcp',
        region: 'us-central1',
        components: ['vpc'],
      });

      const backendTf = result.files.find(f => f.path === 'backend.tf');
      expect(backendTf!.content).toContain('# terraform {');
      expect(backendTf!.content).toContain('gcs');
    });

    it('should generate commented backend for Azure', async () => {
      const result = await generator.generate({
        projectName: 'azure-project',
        provider: 'azure',
        region: 'eastus',
        components: ['vpc'],
      });

      const backendTf = result.files.find(f => f.path === 'backend.tf');
      expect(backendTf!.content).toContain('# terraform {');
      expect(backendTf!.content).toContain('azurerm');
    });
  });

  // ==================================================
  // Module Content
  // ==================================================

  describe('module content', () => {
    it('should generate VPC module with subnets', async () => {
      const result = await generator.generate({
        projectName: 'test',
        provider: 'aws',
        region: 'us-east-1',
        components: ['vpc'],
      });

      const vpcMain = result.files.find(
        f => f.path === 'modules/vpc/main.tf',
      );
      expect(vpcMain!.content).toContain('resource "aws_vpc" "main"');
      expect(vpcMain!.content).toContain('resource "aws_subnet" "private"');
      expect(vpcMain!.content).toContain('resource "aws_subnet" "public"');
      expect(vpcMain!.content).toContain('enable_dns_hostnames = true');
    });

    it('should generate EKS module with encryption', async () => {
      const result = await generator.generate({
        projectName: 'test',
        provider: 'aws',
        region: 'us-east-1',
        components: ['eks'],
      });

      const eksMain = result.files.find(
        f => f.path === 'modules/eks/main.tf',
      );
      expect(eksMain!.content).toContain('resource "aws_eks_cluster" "main"');
      expect(eksMain!.content).toContain('encryption_config');
      expect(eksMain!.content).toContain('endpoint_public_access  = false');
    });

    it('should generate RDS module with encryption and backup', async () => {
      const result = await generator.generate({
        projectName: 'test',
        provider: 'aws',
        region: 'us-east-1',
        components: ['rds'],
      });

      const rdsMain = result.files.find(
        f => f.path === 'modules/rds/main.tf',
      );
      expect(rdsMain!.content).toContain('storage_encrypted       = true');
      expect(rdsMain!.content).toContain('backup_retention_period = 7');
      expect(rdsMain!.content).toContain('publicly_accessible     = false');
    });

    it('should generate S3 module with security best practices', async () => {
      const result = await generator.generate({
        projectName: 'test',
        provider: 'aws',
        region: 'us-east-1',
        components: ['s3'],
      });

      const s3Main = result.files.find(
        f => f.path === 'modules/s3/main.tf',
      );
      expect(s3Main!.content).toContain('aws_s3_bucket_versioning');
      expect(s3Main!.content).toContain('server_side_encryption_configuration');
      expect(s3Main!.content).toContain('aws_s3_bucket_public_access_block');
      expect(s3Main!.content).toContain('block_public_acls       = true');
    });

    it('should generate VPC module outputs', async () => {
      const result = await generator.generate({
        projectName: 'test',
        provider: 'aws',
        region: 'us-east-1',
        components: ['vpc'],
      });

      const vpcOutputs = result.files.find(
        f => f.path === 'modules/vpc/outputs.tf',
      );
      expect(vpcOutputs!.content).toContain('output "vpc_id"');
      expect(vpcOutputs!.content).toContain('output "private_subnet_ids"');
      expect(vpcOutputs!.content).toContain('output "public_subnet_ids"');
    });

    it('should generate module variables with types', async () => {
      const result = await generator.generate({
        projectName: 'test',
        provider: 'aws',
        region: 'us-east-1',
        components: ['eks'],
      });

      const eksVars = result.files.find(
        f => f.path === 'modules/eks/variables.tf',
      );
      expect(eksVars!.content).toContain('variable "vpc_id"');
      expect(eksVars!.content).toContain('variable "subnet_ids"');
      expect(eksVars!.content).toContain('variable "cluster_version"');
      expect(eksVars!.content).toContain('type = list(string)');
    });

    it('should include depends_on for eks module', async () => {
      const result = await generator.generate({
        projectName: 'test',
        provider: 'aws',
        region: 'us-east-1',
        components: ['vpc', 'eks'],
      });

      const mainTf = result.files.find(f => f.path === 'main.tf');
      expect(mainTf!.content).toContain('depends_on = [module.vpc]');
    });
  });

  // ==================================================
  // Validation Pipeline (Gap #9 + #12)
  // ==================================================

  describe('validation', () => {
    it('should pass validation for complete project', async () => {
      const result = await generator.generate({
        projectName: 'test',
        provider: 'aws',
        region: 'us-east-1',
        components: ['vpc'],
      });

      expect(result.validation.valid).toBe(true);
      expect(result.validation.summary.errors).toBe(0);
    });

    it('should detect missing required files', () => {
      const report = generator.validateProject([
        { path: 'main.tf', content: 'provider "aws" {}' },
      ]);

      expect(report.valid).toBe(false);
      expect(report.summary.errors).toBeGreaterThan(0);

      const missingFileErrors = report.items.filter(
        i => i.rule === 'required-files',
      );
      expect(missingFileErrors.length).toBeGreaterThan(0);
    });

    it('should detect all missing required files', () => {
      const report = generator.validateProject([]);

      const missingFileErrors = report.items.filter(
        i => i.rule === 'required-files',
      );
      // Should report main.tf, variables.tf, outputs.tf, versions.tf, backend.tf
      expect(missingFileErrors.length).toBe(5);
    });

    it('should warn about missing environment tfvars', () => {
      const report = generator.validateProject([
        { path: 'main.tf', content: '' },
        { path: 'variables.tf', content: '' },
        { path: 'outputs.tf', content: '' },
        { path: 'versions.tf', content: '' },
        { path: 'backend.tf', content: '' },
      ]);

      const envWarnings = report.items.filter(
        i => i.rule === 'env-separation',
      );
      expect(envWarnings.length).toBe(3); // dev, staging, prod
      expect(envWarnings[0].severity).toBe('warning');
    });

    it('should detect mismatched braces', () => {
      const report = generator.validateProject([
        { path: 'main.tf', content: 'resource "aws_vpc" "test" {' },
        { path: 'variables.tf', content: '' },
        { path: 'outputs.tf', content: '' },
        { path: 'versions.tf', content: '' },
        { path: 'backend.tf', content: '' },
      ]);

      const syntaxErrors = report.items.filter(i => i.rule === 'hcl-syntax');
      expect(syntaxErrors.length).toBeGreaterThan(0);
    });

    it('should detect mismatched quotes', () => {
      const report = generator.validateProject([
        { path: 'main.tf', content: 'resource "aws_vpc "test" {}' },
        { path: 'variables.tf', content: '' },
        { path: 'outputs.tf', content: '' },
        { path: 'versions.tf', content: '' },
        { path: 'backend.tf', content: '' },
      ]);

      const syntaxErrors = report.items.filter(
        i => i.rule === 'hcl-syntax' && i.message.includes('quotes'),
      );
      expect(syntaxErrors.length).toBeGreaterThan(0);
    });

    it('should detect publicly accessible resources', () => {
      const report = generator.validateProject([
        {
          path: 'main.tf',
          content: 'resource "aws_db_instance" "test" {\n  publicly_accessible = true\n}',
        },
        { path: 'variables.tf', content: '' },
        { path: 'outputs.tf', content: '' },
        { path: 'versions.tf', content: '' },
        { path: 'backend.tf', content: '' },
      ]);

      const publicAccess = report.items.filter(
        i => i.rule === 'no-public-access',
      );
      expect(publicAccess.length).toBeGreaterThan(0);
      expect(publicAccess[0].severity).toBe('warning');
    });

    it('should warn about missing tags on resources', () => {
      const report = generator.validateProject([
        {
          path: 'main.tf',
          content: 'resource "aws_vpc" "test" {\n  cidr_block = "10.0.0.0/16"\n}',
        },
        { path: 'variables.tf', content: '' },
        { path: 'outputs.tf', content: '' },
        { path: 'versions.tf', content: '' },
        { path: 'backend.tf', content: '' },
      ]);

      const tagWarnings = report.items.filter(
        i => i.rule === 'require-tags',
      );
      expect(tagWarnings.length).toBeGreaterThan(0);
    });

    it('should not warn about tags in variables/outputs files', () => {
      const report = generator.validateProject([
        { path: 'main.tf', content: '' },
        {
          path: 'variables.tf',
          content: 'resource "aws_vpc" "test" {\n  cidr_block = "10.0.0.0/16"\n}',
        },
        { path: 'outputs.tf', content: '' },
        { path: 'versions.tf', content: '' },
        { path: 'backend.tf', content: '' },
      ]);

      const tagWarnings = report.items.filter(
        i => i.rule === 'require-tags',
      );
      expect(tagWarnings.length).toBe(0);
    });

    it('should provide correct summary counts', () => {
      const report = generator.validateProject([
        {
          path: 'main.tf',
          content: 'resource "aws_db_instance" "test" {\n  publicly_accessible = true\n}',
        },
      ]);

      expect(report.summary.errors).toBeGreaterThan(0);
      expect(report.summary.warnings).toBeGreaterThan(0);
      expect(report.summary.errors + report.summary.warnings + report.summary.info).toBe(
        report.items.length,
      );
    });

    it('should include file and line in validation items', () => {
      const report = generator.validateProject([
        {
          path: 'main.tf',
          content: 'line1\npublicly_accessible = true\nline3',
        },
        { path: 'variables.tf', content: '' },
        { path: 'outputs.tf', content: '' },
        { path: 'versions.tf', content: '' },
        { path: 'backend.tf', content: '' },
      ]);

      const publicAccess = report.items.find(
        i => i.rule === 'no-public-access',
      );
      expect(publicAccess?.file).toBe('main.tf');
      expect(publicAccess?.line).toBe(2);
    });

    it('should not flag commented lines', () => {
      const report = generator.validateProject([
        {
          path: 'main.tf',
          content: '# publicly_accessible = true\n',
        },
        { path: 'variables.tf', content: '' },
        { path: 'outputs.tf', content: '' },
        { path: 'versions.tf', content: '' },
        { path: 'backend.tf', content: '' },
      ]);

      const publicAccess = report.items.filter(
        i => i.rule === 'no-public-access',
      );
      expect(publicAccess.length).toBe(0);
    });

    it('should only check .tf files for syntax', () => {
      const report = generator.validateProject([
        { path: 'main.tf', content: '' },
        { path: 'variables.tf', content: '' },
        { path: 'outputs.tf', content: '' },
        { path: 'versions.tf', content: '' },
        { path: 'backend.tf', content: '' },
        { path: 'README.md', content: 'This has { unmatched braces' },
      ]);

      const syntaxErrors = report.items.filter(
        i => i.rule === 'hcl-syntax',
      );
      expect(syntaxErrors.length).toBe(0);
    });
  });

  // ==================================================
  // Generated project passes its own validation
  // ==================================================

  describe('self-validation', () => {
    it('should pass validation for aws project with all components', async () => {
      const result = await generator.generate({
        projectName: 'full-aws',
        provider: 'aws',
        region: 'us-east-1',
        components: ['vpc', 'eks', 'rds', 's3'],
      });

      expect(result.validation.valid).toBe(true);
      expect(result.validation.summary.errors).toBe(0);
    });

    it('should pass validation for gcp project', async () => {
      const result = await generator.generate({
        projectName: 'gcp-app',
        provider: 'gcp',
        region: 'us-central1',
        components: ['vpc'],
      });

      expect(result.validation.valid).toBe(true);
    });

    it('should pass validation for azure project', async () => {
      const result = await generator.generate({
        projectName: 'azure-app',
        provider: 'azure',
        region: 'eastus',
        components: ['vpc'],
      });

      expect(result.validation.valid).toBe(true);
    });
  });
});
