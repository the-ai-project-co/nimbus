import { describe, it, expect } from 'bun:test';
import { TerraformProjectGenerator } from '../generators/terraform-project-generator';

/**
 * Edge case tests for TerraformProjectGenerator.
 *
 * These tests cover scenarios that the base terraform-project.test.ts may not:
 * - Single component projects
 * - GCP and Azure provider configurations
 * - Backend configuration with custom values
 * - Environment-specific AZ counts
 * - HCL syntax validation
 * - Anti-pattern detection
 * - Missing tags detection
 * - Module structure generation
 * - Validation of complete projects vs partial
 */
describe('TerraformProjectGenerator - Edge Cases', () => {
  const generator = new TerraformProjectGenerator();

  it('should handle single component', async () => {
    const result = await generator.generate({
      projectName: 'minimal',
      provider: 'aws',
      region: 'us-east-1',
      components: ['s3'],
    });

    // base files (main.tf, variables.tf, outputs.tf, versions.tf, backend.tf, tfvars.example, README) = 7
    // + 3 env files + 3 module files (main.tf, variables.tf, outputs.tf) = 13
    expect(result.files.length).toBeGreaterThan(7);
    expect(result.validation.valid).toBe(true);
  });

  it('should handle GCP provider', async () => {
    const result = await generator.generate({
      projectName: 'gcp-project',
      provider: 'gcp',
      region: 'us-central1',
      components: ['vpc'],
    });

    const versionsTf = result.files.find(f => f.path === 'versions.tf');
    expect(versionsTf?.content).toContain('hashicorp/google');
    expect(versionsTf?.content).toContain('~> 5.0');

    // GCP provider block should use "google" not "gcp"
    const mainTf = result.files.find(f => f.path === 'main.tf');
    expect(mainTf?.content).toContain('provider "google"');
  });

  it('should handle Azure provider', async () => {
    const result = await generator.generate({
      projectName: 'azure-project',
      provider: 'azure',
      region: 'eastus',
      components: ['vpc'],
    });

    const versionsTf = result.files.find(f => f.path === 'versions.tf');
    expect(versionsTf?.content).toContain('hashicorp/azurerm');
    expect(versionsTf?.content).toContain('~> 3.0');

    // Azure provider block
    const mainTf = result.files.find(f => f.path === 'main.tf');
    expect(mainTf?.content).toContain('provider "azurerm"');
    expect(mainTf?.content).toContain('features {}');
  });

  it('should include proper backend config with custom bucket', async () => {
    const result = await generator.generate({
      projectName: 'test',
      provider: 'aws',
      region: 'us-east-1',
      components: ['vpc'],
      backendConfig: {
        bucket: 'my-bucket',
        dynamodbTable: 'my-lock-table',
      },
    });

    const backend = result.files.find(f => f.path === 'backend.tf');
    expect(backend?.content).toContain('my-bucket');
    expect(backend?.content).toContain('my-lock-table');
    expect(backend?.content).toContain('encrypt');
  });

  it('should use default backend config when none provided', async () => {
    const result = await generator.generate({
      projectName: 'my-project',
      provider: 'aws',
      region: 'us-west-2',
      components: ['vpc'],
    });

    const backend = result.files.find(f => f.path === 'backend.tf');
    expect(backend?.content).toContain('my-project-tfstate');
    expect(backend?.content).toContain('my-project-tflock');
  });

  it('should generate commented backend for GCP', async () => {
    const result = await generator.generate({
      projectName: 'gcp-proj',
      provider: 'gcp',
      region: 'us-central1',
      components: ['vpc'],
    });

    const backend = result.files.find(f => f.path === 'backend.tf');
    expect(backend?.content).toContain('gcs');
    // Backend should be commented out for non-AWS
    expect(backend?.content).toContain('#');
  });

  it('should generate different AZ counts per environment', async () => {
    const result = await generator.generate({
      projectName: 'test',
      provider: 'aws',
      region: 'us-east-1',
      components: ['vpc'],
    });

    const devTfvars = result.files.find(f => f.path === 'environments/dev/terraform.tfvars');
    const prodTfvars = result.files.find(f => f.path === 'environments/prod/terraform.tfvars');

    expect(devTfvars).toBeDefined();
    expect(prodTfvars).toBeDefined();

    // Dev should have 2 AZs, prod should have 3
    const devAzCount = (devTfvars?.content.match(/us-east-1[a-z]/g) || []).length;
    const prodAzCount = (prodTfvars?.content.match(/us-east-1[a-z]/g) || []).length;

    expect(devAzCount).toBe(2);
    expect(prodAzCount).toBe(3);
  });

  it('should generate staging environment with 2 AZs', async () => {
    const result = await generator.generate({
      projectName: 'test',
      provider: 'aws',
      region: 'eu-west-1',
      components: ['vpc'],
    });

    const stagingTfvars = result.files.find(f => f.path === 'environments/staging/terraform.tfvars');
    expect(stagingTfvars).toBeDefined();

    const stagingAzCount = (stagingTfvars?.content.match(/eu-west-1[a-z]/g) || []).length;
    expect(stagingAzCount).toBe(2);
  });

  it('should include EKS-specific variables when EKS is a component', async () => {
    const result = await generator.generate({
      projectName: 'eks-test',
      provider: 'aws',
      region: 'us-east-1',
      components: ['vpc', 'eks'],
    });

    const varsTf = result.files.find(f => f.path === 'variables.tf');
    expect(varsTf?.content).toContain('cluster_version');
    expect(varsTf?.content).toContain('node_instance_type');
    expect(varsTf?.content).toContain('node_count');

    // EKS module should depend on VPC
    const mainTf = result.files.find(f => f.path === 'main.tf');
    expect(mainTf?.content).toContain('depends_on = [module.vpc]');
  });

  it('should include RDS-specific variables when RDS is a component', async () => {
    const result = await generator.generate({
      projectName: 'rds-test',
      provider: 'aws',
      region: 'us-east-1',
      components: ['vpc', 'rds'],
    });

    const varsTf = result.files.find(f => f.path === 'variables.tf');
    expect(varsTf?.content).toContain('db_instance_class');
    expect(varsTf?.content).toContain('db_engine');
    expect(varsTf?.content).toContain('db_storage_size');
  });

  it('should include S3-specific variables when S3 is a component', async () => {
    const result = await generator.generate({
      projectName: 's3-test',
      provider: 'aws',
      region: 'us-east-1',
      components: ['s3'],
    });

    const varsTf = result.files.find(f => f.path === 'variables.tf');
    expect(varsTf?.content).toContain('bucket_name');
  });

  it('should generate module files for each component', async () => {
    const result = await generator.generate({
      projectName: 'multi',
      provider: 'aws',
      region: 'us-east-1',
      components: ['vpc', 'eks', 'rds', 's3'],
    });

    for (const component of ['vpc', 'eks', 'rds', 's3']) {
      const moduleMain = result.files.find(f => f.path === `modules/${component}/main.tf`);
      const moduleVars = result.files.find(f => f.path === `modules/${component}/variables.tf`);
      const moduleOutputs = result.files.find(f => f.path === `modules/${component}/outputs.tf`);

      expect(moduleMain).toBeDefined();
      expect(moduleVars).toBeDefined();
      expect(moduleOutputs).toBeDefined();
    }
  });

  it('should validate HCL syntax correctly for valid files', () => {
    const validReport = generator.validateProject([
      { path: 'main.tf', content: 'resource "aws_vpc" "main" {\n  cidr_block = "10.0.0.0/16"\n}' },
      { path: 'variables.tf', content: 'variable "name" {\n  type = string\n}' },
      { path: 'outputs.tf', content: '' },
      { path: 'versions.tf', content: '' },
      { path: 'backend.tf', content: '' },
    ]);

    const syntaxErrors = validReport.items.filter(i => i.rule === 'hcl-syntax' && i.severity === 'error');
    expect(syntaxErrors.length).toBe(0);
  });

  it('should detect mismatched braces', () => {
    const report = generator.validateProject([
      { path: 'main.tf', content: 'resource "aws_vpc" "main" {\n  cidr_block = "10.0.0.0/16"\n' },
      { path: 'variables.tf', content: '' },
      { path: 'outputs.tf', content: '' },
      { path: 'versions.tf', content: '' },
      { path: 'backend.tf', content: '' },
    ]);

    const braceErrors = report.items.filter(i => i.rule === 'hcl-syntax' && i.message.includes('braces'));
    expect(braceErrors.length).toBeGreaterThan(0);
    expect(report.valid).toBe(false);
  });

  it('should detect unmatched quotes', () => {
    const report = generator.validateProject([
      { path: 'main.tf', content: 'resource "aws_vpc" "main {\n}' },
      { path: 'variables.tf', content: '' },
      { path: 'outputs.tf', content: '' },
      { path: 'versions.tf', content: '' },
      { path: 'backend.tf', content: '' },
    ]);

    const quoteErrors = report.items.filter(i => i.rule === 'hcl-syntax' && i.message.includes('quotes'));
    expect(quoteErrors.length).toBeGreaterThan(0);
    expect(report.valid).toBe(false);
  });

  it('should detect publicly accessible resources as anti-pattern', () => {
    const report = generator.validateProject([
      { path: 'main.tf', content: 'resource "aws_db_instance" "main" {\n  publicly_accessible = true\n}' },
      { path: 'variables.tf', content: '' },
      { path: 'outputs.tf', content: '' },
      { path: 'versions.tf', content: '' },
      { path: 'backend.tf', content: '' },
    ]);

    const publicWarnings = report.items.filter(i => i.rule === 'no-public-access');
    expect(publicWarnings.length).toBeGreaterThan(0);
  });

  it('should detect missing resource tags', () => {
    const report = generator.validateProject([
      { path: 'main.tf', content: 'resource "aws_vpc" "main" {\n  cidr_block = "10.0.0.0/16"\n}' },
      { path: 'variables.tf', content: '' },
      { path: 'outputs.tf', content: '' },
      { path: 'versions.tf', content: '' },
      { path: 'backend.tf', content: '' },
    ]);

    const tagWarnings = report.items.filter(i => i.rule === 'require-tags');
    expect(tagWarnings.length).toBeGreaterThan(0);
  });

  it('should report missing required files', () => {
    const report = generator.validateProject([
      { path: 'main.tf', content: '' },
    ]);

    const missingFiles = report.items.filter(i => i.rule === 'required-files');
    expect(missingFiles.length).toBeGreaterThan(0);
    expect(report.valid).toBe(false);
  });

  it('should report missing environment tfvars as warnings', () => {
    const report = generator.validateProject([
      { path: 'main.tf', content: '' },
      { path: 'variables.tf', content: '' },
      { path: 'outputs.tf', content: '' },
      { path: 'versions.tf', content: '' },
      { path: 'backend.tf', content: '' },
    ]);

    const envWarnings = report.items.filter(i => i.rule === 'env-separation');
    expect(envWarnings.length).toBe(3); // dev, staging, prod
  });

  it('should generate complete project with all components', async () => {
    const result = await generator.generate({
      projectName: 'full-stack',
      provider: 'aws',
      region: 'us-east-1',
      components: ['vpc', 'eks', 'rds', 's3'],
    });

    expect(result.validation.valid).toBe(true);
    expect(result.validation.summary.errors).toBe(0);

    // Outputs should contain all component outputs
    const outputsTf = result.files.find(f => f.path === 'outputs.tf');
    expect(outputsTf?.content).toContain('vpc_id');
    expect(outputsTf?.content).toContain('eks_cluster_endpoint');
    expect(outputsTf?.content).toContain('rds_endpoint');
    expect(outputsTf?.content).toContain('s3_bucket_arn');
  });

  it('should generate proper EKS module with encryption', async () => {
    const result = await generator.generate({
      projectName: 'secure-eks',
      provider: 'aws',
      region: 'us-east-1',
      components: ['vpc', 'eks'],
    });

    const eksMain = result.files.find(f => f.path === 'modules/eks/main.tf');
    expect(eksMain?.content).toContain('encryption_config');
    expect(eksMain?.content).toContain('endpoint_private_access = true');
    expect(eksMain?.content).toContain('endpoint_public_access  = false');
  });

  it('should generate proper RDS module with security defaults', async () => {
    const result = await generator.generate({
      projectName: 'secure-rds',
      provider: 'aws',
      region: 'us-east-1',
      components: ['vpc', 'rds'],
    });

    const rdsMain = result.files.find(f => f.path === 'modules/rds/main.tf');
    expect(rdsMain?.content).toContain('storage_encrypted       = true');
    expect(rdsMain?.content).toContain('publicly_accessible     = false');
    expect(rdsMain?.content).toContain('backup_retention_period = 7');
  });

  it('should generate proper S3 module with encryption and access block', async () => {
    const result = await generator.generate({
      projectName: 'secure-s3',
      provider: 'aws',
      region: 'us-east-1',
      components: ['s3'],
    });

    const s3Main = result.files.find(f => f.path === 'modules/s3/main.tf');
    expect(s3Main?.content).toContain('aws_s3_bucket_server_side_encryption_configuration');
    expect(s3Main?.content).toContain('aws_s3_bucket_public_access_block');
    expect(s3Main?.content).toContain('aws_s3_bucket_versioning');
  });

  it('should handle unknown component gracefully in module generation', async () => {
    const result = await generator.generate({
      projectName: 'custom',
      provider: 'aws',
      region: 'us-east-1',
      components: ['custom-service'],
    });

    const moduleMain = result.files.find(f => f.path === 'modules/custom-service/main.tf');
    expect(moduleMain).toBeDefined();
    expect(moduleMain?.content).toContain('custom-service Module');
  });

  it('should generate environment-specific instance types', async () => {
    const result = await generator.generate({
      projectName: 'test',
      provider: 'aws',
      region: 'us-east-1',
      components: ['eks'],
    });

    const devTfvars = result.files.find(f => f.path === 'environments/dev/terraform.tfvars');
    const prodTfvars = result.files.find(f => f.path === 'environments/prod/terraform.tfvars');

    expect(devTfvars?.content).toContain('t3.small');
    expect(prodTfvars?.content).toContain('t3.large');
  });

  it('should generate environment-specific database configs', async () => {
    const result = await generator.generate({
      projectName: 'test',
      provider: 'aws',
      region: 'us-east-1',
      components: ['rds'],
    });

    const devTfvars = result.files.find(f => f.path === 'environments/dev/terraform.tfvars');
    const prodTfvars = result.files.find(f => f.path === 'environments/prod/terraform.tfvars');

    expect(devTfvars?.content).toContain('db.t3.micro');
    expect(devTfvars?.content).toContain('20');
    expect(prodTfvars?.content).toContain('db.r6g.large');
    expect(prodTfvars?.content).toContain('100');
  });

  it('should include proper summary counts in validation report', async () => {
    const result = await generator.generate({
      projectName: 'test',
      provider: 'aws',
      region: 'us-east-1',
      components: ['vpc'],
    });

    const { summary } = result.validation;
    const totalFromCategories = summary.errors + summary.warnings + summary.info;
    expect(totalFromCategories).toBe(result.validation.items.length);
  });
});
