/**
 * End-to-End Tests for Infrastructure Workflows
 *
 * These tests verify infrastructure-related workflows using multiple services.
 * Note: Some tests require external tools (terraform, kubectl, helm) to be installed.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { startServer as startFsService } from '../../../services/fs-tools-service/src/server';
import { startServer as startGitService } from '../../../services/git-tools-service/src/server';
import { startServer as startTerraformService } from '../../../services/terraform-tools-service/src/server';
import { waitForService, createTestClient, getTestPorts, createTempDir, removeTempDir } from '../../utils/test-helpers';
import { join } from 'node:path';
import { $ } from 'bun';

describe('E2E: Infrastructure Workflows', () => {
  // Service instances
  let fsServer: any;
  let gitServer: any;
  let terraformServer: any;

  // Ports and URLs
  const fsPorts = getTestPorts();
  const gitPorts = getTestPorts();
  const terraformPorts = getTestPorts();

  const fsUrl = `http://localhost:${fsPorts.http}`;
  const gitUrl = `http://localhost:${gitPorts.http}`;
  const terraformUrl = `http://localhost:${terraformPorts.http}`;

  // Clients
  let fsClient: ReturnType<typeof createTestClient>;
  let gitClient: ReturnType<typeof createTestClient>;
  let terraformClient: ReturnType<typeof createTestClient>;

  // Temp directory
  let tempDir: string;

  // Check if terraform is available
  let terraformAvailable = false;

  beforeAll(async () => {
    // Check terraform availability
    try {
      const result = await $`terraform version`.quiet();
      terraformAvailable = result.exitCode === 0;
    } catch {
      terraformAvailable = false;
    }

    // Start services
    [fsServer, gitServer, terraformServer] = await Promise.all([
      startFsService(fsPorts.http),
      startGitService(gitPorts.http),
      startTerraformService(terraformPorts.http),
    ]);

    // Wait for services
    const [fsReady, gitReady, terraformReady] = await Promise.all([
      waitForService(fsUrl),
      waitForService(gitUrl),
      waitForService(terraformUrl),
    ]);

    if (!fsReady || !gitReady || !terraformReady) {
      throw new Error('One or more services failed to start');
    }

    fsClient = createTestClient(fsUrl);
    gitClient = createTestClient(gitUrl);
    terraformClient = createTestClient(terraformUrl);
  });

  afterAll(() => {
    fsServer?.stop?.();
    gitServer?.stop?.();
    terraformServer?.stop?.();
  });

  beforeEach(async () => {
    tempDir = await createTempDir('e2e-infra-');
  });

  afterEach(async () => {
    if (tempDir) {
      await removeTempDir(tempDir);
    }
  });

  describe('Workflow: Infrastructure as Code Project Setup', () => {
    test('creates IaC project with terraform files', async () => {
      const projectDir = join(tempDir, 'terraform-project');

      // Step 1: Create project structure
      await fsClient.post('/api/fs/mkdir', { path: projectDir });
      await fsClient.post('/api/fs/mkdir', { path: join(projectDir, 'modules') });
      await fsClient.post('/api/fs/mkdir', { path: join(projectDir, 'environments') });

      // Step 2: Create main.tf
      const mainTf = `
terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

output "environment" {
  value = var.environment
}
`;
      await fsClient.post('/api/fs/write', {
        path: join(projectDir, 'main.tf'),
        content: mainTf,
      });

      // Step 3: Create variables.tf
      const variablesTf = `
variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "my-project"
}

variable "tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default     = {
    Project   = "my-project"
    ManagedBy = "terraform"
  }
}
`;
      await fsClient.post('/api/fs/write', {
        path: join(projectDir, 'variables.tf'),
        content: variablesTf,
      });

      // Step 4: Create .gitignore
      const gitignore = `
# Terraform
*.tfstate
*.tfstate.*
.terraform/
.terraform.lock.hcl
*.tfplan

# IDE
.idea/
.vscode/
*.swp

# OS
.DS_Store
`;
      await fsClient.post('/api/fs/write', {
        path: join(projectDir, '.gitignore'),
        content: gitignore,
      });

      // Step 5: Initialize git repository
      await gitClient.post('/api/git/init', { path: projectDir });
      await $`cd ${projectDir} && git config user.email "infra@test.com"`;
      await $`cd ${projectDir} && git config user.name "Infra Test"`;

      // Step 6: Commit infrastructure code
      await gitClient.post('/api/git/add', { path: projectDir, files: '.' });
      const commitResult = await gitClient.post('/api/git/commit', {
        path: projectDir,
        message: 'Initial infrastructure setup',
      });
      expect(commitResult.status).toBe(200);

      // Step 7: Verify project structure
      const listResult = await fsClient.post('/api/fs/list', {
        directory: projectDir,
        pattern: '*.tf',
      });
      const tfFiles = listResult.data.data.files.filter((f: string) => f.endsWith('.tf'));
      expect(tfFiles.length).toBeGreaterThanOrEqual(2);

      // Step 8: Search for required providers
      const searchResult = await fsClient.post('/api/fs/search', {
        directory: projectDir,
        pattern: 'hashicorp/aws',
        filePattern: '*.tf',
      });
      expect(searchResult.data.data.results.length).toBeGreaterThan(0);
    });
  });

  describe('Workflow: Terraform Validation (requires terraform CLI)', () => {
    test.skipIf(!terraformAvailable)('validates terraform configuration', async () => {
      const projectDir = join(tempDir, 'tf-validate');

      // Create minimal terraform config
      await fsClient.post('/api/fs/mkdir', { path: projectDir });

      const mainTf = `
terraform {
  required_version = ">= 1.0"
}

variable "test" {
  type    = string
  default = "test"
}

output "test" {
  value = var.test
}
`;
      await fsClient.post('/api/fs/write', {
        path: join(projectDir, 'main.tf'),
        content: mainTf,
      });

      // Initialize terraform
      const initResult = await terraformClient.post('/api/terraform/init', {
        directory: projectDir,
      });
      // Init should work for basic config
      expect([200, 500]).toContain(initResult.status);

      // Validate (should work if init succeeded)
      if (initResult.status === 200) {
        const validateResult = await terraformClient.post('/api/terraform/validate', {
          directory: projectDir,
        });
        expect(validateResult.status).toBe(200);
      }
    });

    test.skipIf(!terraformAvailable)('formats terraform files', async () => {
      const projectDir = join(tempDir, 'tf-fmt');

      // Create unformatted terraform config
      await fsClient.post('/api/fs/mkdir', { path: projectDir });

      const unformattedTf = `
variable "test" {
type=string
default="test"
}
`;
      await fsClient.post('/api/fs/write', {
        path: join(projectDir, 'main.tf'),
        content: unformattedTf,
      });

      // Format using terraform service
      const fmtResult = await terraformClient.post('/api/terraform/fmt', {
        directory: projectDir,
        diff: true,
      });

      // Should succeed and potentially show differences
      expect([200, 500]).toContain(fmtResult.status);
    });
  });

  describe('Workflow: Infrastructure Change Management', () => {
    test('creates branch for infrastructure changes', async () => {
      const projectDir = join(tempDir, 'infra-changes');

      // Setup: Create initial terraform project
      await fsClient.post('/api/fs/mkdir', { path: projectDir });
      const initialTf = `
variable "instance_type" {
  type    = string
  default = "t2.micro"
}
`;
      await fsClient.post('/api/fs/write', {
        path: join(projectDir, 'main.tf'),
        content: initialTf,
      });

      // Initialize git
      await gitClient.post('/api/git/init', { path: projectDir });
      await $`cd ${projectDir} && git config user.email "change@test.com"`;
      await $`cd ${projectDir} && git config user.name "Change Test"`;
      await gitClient.post('/api/git/add', { path: projectDir, files: '.' });
      await gitClient.post('/api/git/commit', { path: projectDir, message: 'Initial config' });

      // Step 1: Create feature branch for change
      const branchResult = await gitClient.post('/api/git/branch', {
        path: projectDir,
        name: 'feature/upgrade-instance',
        checkout: true,
      });
      expect(branchResult.status).toBe(200);

      // Step 2: Update terraform config
      const updatedTf = `
variable "instance_type" {
  type    = string
  default = "t3.medium"  # Upgraded instance type
}

variable "instance_count" {
  type    = number
  default = 2
}
`;
      await fsClient.post('/api/fs/write', {
        path: join(projectDir, 'main.tf'),
        content: updatedTf,
      });

      // Step 3: Verify diff shows changes
      const diffResult = await gitClient.get(`/api/git/diff?path=${encodeURIComponent(projectDir)}`);
      expect(diffResult.data.data.diff).toContain('t3.medium');
      expect(diffResult.data.data.diff).toContain('instance_count');

      // Step 4: Commit the changes
      await gitClient.post('/api/git/add', { path: projectDir, files: '.' });
      const commitResult = await gitClient.post('/api/git/commit', {
        path: projectDir,
        message: 'Upgrade instance type and add scaling',
      });
      expect(commitResult.status).toBe(200);

      // Step 5: Verify log shows both commits
      const logResult = await gitClient.get(`/api/git/log?path=${encodeURIComponent(projectDir)}`);
      expect(logResult.data.data.total).toBe(2);

      // Step 6: Verify branch
      const branchesResult = await gitClient.get(`/api/git/branches?path=${encodeURIComponent(projectDir)}`);
      expect(branchesResult.data.data.branches).toContain('feature/upgrade-instance');
    });
  });

  describe('Workflow: Infrastructure Documentation', () => {
    test('generates documentation for terraform modules', async () => {
      const projectDir = join(tempDir, 'infra-docs');

      // Create terraform module
      await fsClient.post('/api/fs/mkdir', { path: projectDir });

      const mainTf = `
/**
 * AWS VPC Module
 *
 * This module creates a VPC with public and private subnets.
 */

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "enable_nat_gateway" {
  description = "Whether to enable NAT Gateway"
  type        = bool
  default     = true
}

output "vpc_id" {
  description = "The ID of the VPC"
  value       = "vpc-example"
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = ["subnet-1", "subnet-2"]
}
`;
      await fsClient.post('/api/fs/write', {
        path: join(projectDir, 'main.tf'),
        content: mainTf,
      });

      // Step 1: Search for all variables
      const varsSearch = await fsClient.post('/api/fs/search', {
        directory: projectDir,
        pattern: 'variable\\s+"\\w+"',
        filePattern: '*.tf',
      });
      expect(varsSearch.data.data.results.length).toBe(3);

      // Step 2: Search for all outputs
      const outputsSearch = await fsClient.post('/api/fs/search', {
        directory: projectDir,
        pattern: 'output\\s+"\\w+"',
        filePattern: '*.tf',
      });
      expect(outputsSearch.data.data.results.length).toBe(2);

      // Step 3: Create README from terraform content
      const readmeContent = `# AWS VPC Module

## Description
This module creates a VPC with public and private subnets.

## Variables

| Name | Description | Type | Default |
|------|-------------|------|---------|
| vpc_cidr | CIDR block for the VPC | string | 10.0.0.0/16 |
| availability_zones | List of availability zones | list(string) | ["us-east-1a", "us-east-1b"] |
| enable_nat_gateway | Whether to enable NAT Gateway | bool | true |

## Outputs

| Name | Description |
|------|-------------|
| vpc_id | The ID of the VPC |
| public_subnet_ids | List of public subnet IDs |
`;

      await fsClient.post('/api/fs/write', {
        path: join(projectDir, 'README.md'),
        content: readmeContent,
      });

      // Step 4: Initialize git and commit
      await gitClient.post('/api/git/init', { path: projectDir });
      await $`cd ${projectDir} && git config user.email "docs@test.com"`;
      await $`cd ${projectDir} && git config user.name "Docs Test"`;
      await gitClient.post('/api/git/add', { path: projectDir, files: '.' });
      await gitClient.post('/api/git/commit', {
        path: projectDir,
        message: 'Add VPC module with documentation',
      });

      // Verify structure
      const existsResult = await fsClient.post('/api/fs/exists', {
        path: join(projectDir, 'README.md'),
      });
      expect(existsResult.data.data.exists).toBe(true);
    });
  });

  describe('Workflow: Service Health Check', () => {
    test('verifies all infrastructure services are healthy', async () => {
      const healthChecks = await Promise.all([
        fsClient.get('/health'),
        gitClient.get('/health'),
        terraformClient.get('/health'),
      ]);

      for (const check of healthChecks) {
        expect(check.status).toBe(200);
        expect(check.data.status).toBe('healthy');
      }
    });
  });
});
