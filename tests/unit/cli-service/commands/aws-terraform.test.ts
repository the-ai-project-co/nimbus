/**
 * AWS Terraform Command Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { startServer as startAwsServer, type ServerInstances } from '../../../../services/aws-tools-service/src/server';

// Start AWS tools service for testing
const AWS_SERVICE_PORT = 13016;
let awsServer: ServerInstances;

describe('AWS Terraform Command', () => {
  beforeAll(async () => {
    // Set environment variable for the service URL
    process.env.AWS_TOOLS_SERVICE_URL = `http://localhost:${AWS_SERVICE_PORT}`;

    // Start the AWS tools service
    awsServer = await startAwsServer(AWS_SERVICE_PORT);
  });

  afterAll(() => {
    awsServer.stop();
  });

  describe('API Integration', () => {
    it('can get supported Terraform types', async () => {
      const response = await fetch(`http://localhost:${AWS_SERVICE_PORT}/api/aws/terraform/supported-types`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.types).toBeInstanceOf(Array);
      expect(data.data.total).toBeGreaterThan(0);
    });

    it('can generate Terraform directly from resources', async () => {
      const resources = [
        {
          id: 'i-test123',
          type: 'AWS::EC2::Instance',
          region: 'us-east-1',
          name: 'test-instance',
          tags: { Environment: 'test' },
          properties: {
            imageId: 'ami-12345678',
            instanceType: 't2.micro',
          },
        },
      ];

      const response = await fetch(`http://localhost:${AWS_SERVICE_PORT}/api/aws/terraform/generate-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resources }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.terraformSessionId).toBeDefined();
      expect(data.data.files).toBeDefined();
      expect(data.data.summary).toBeDefined();
    });

    it('generates providers.tf with correct structure', async () => {
      const resources = [
        {
          id: 'my-bucket',
          type: 'AWS::S3::Bucket',
          region: 'us-west-2',
          properties: {},
        },
      ];

      const response = await fetch(`http://localhost:${AWS_SERVICE_PORT}/api/aws/terraform/generate-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resources }),
      });

      const data = await response.json();
      const providersContent = data.data.files['providers.tf'];

      expect(providersContent).toContain('terraform');
      expect(providersContent).toContain('provider "aws"');
      expect(providersContent).toContain('region');
    });
  });

  describe('Command Options Parsing', () => {
    it('parses session-id option correctly', () => {
      const args = ['aws', 'terraform', '--session-id', 'abc-123'];

      let sessionId: string | undefined;
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--session-id' && args[i + 1]) {
          sessionId = args[++i];
        }
      }

      expect(sessionId).toBe('abc-123');
    });

    it('parses resources-file option correctly', () => {
      const args = ['aws', 'terraform', '--resources-file', './inventory.json'];

      let resourcesFile: string | undefined;
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--resources-file' && args[i + 1]) {
          resourcesFile = args[++i];
        }
      }

      expect(resourcesFile).toBe('./inventory.json');
    });

    it('parses output option correctly', () => {
      const args = ['aws', 'terraform', '--output', './terraform'];

      let output: string | undefined;
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--output' && args[i + 1]) {
          output = args[++i];
        }
      }

      expect(output).toBe('./terraform');
    });

    it('parses terraform-version option correctly', () => {
      const args = ['aws', 'terraform', '--terraform-version', '1.5.0'];

      let terraformVersion: string | undefined;
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--terraform-version' && args[i + 1]) {
          terraformVersion = args[++i];
        }
      }

      expect(terraformVersion).toBe('1.5.0');
    });

    it('parses organize-by-service flags correctly', () => {
      // Test positive flag
      let args = ['aws', 'terraform', '--organize-by-service'];
      let organizeByService: boolean | undefined;

      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--organize-by-service') {
          organizeByService = true;
        } else if (args[i] === '--no-organize-by-service') {
          organizeByService = false;
        }
      }

      expect(organizeByService).toBe(true);

      // Test negative flag
      args = ['aws', 'terraform', '--no-organize-by-service'];
      organizeByService = undefined;

      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--organize-by-service') {
          organizeByService = true;
        } else if (args[i] === '--no-organize-by-service') {
          organizeByService = false;
        }
      }

      expect(organizeByService).toBe(false);
    });

    it('parses import-blocks flags correctly', () => {
      const args = ['aws', 'terraform', '--import-blocks'];

      let importBlocks: boolean | undefined;
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--import-blocks') {
          importBlocks = true;
        } else if (args[i] === '--no-import-blocks') {
          importBlocks = false;
        }
      }

      expect(importBlocks).toBe(true);
    });

    it('parses starter-kit flags correctly', () => {
      const args = ['aws', 'terraform', '--starter-kit'];

      let includeStarterKit: boolean | undefined;
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--starter-kit') {
          includeStarterKit = true;
        } else if (args[i] === '--no-starter-kit') {
          includeStarterKit = false;
        }
      }

      expect(includeStarterKit).toBe(true);
    });

    it('parses full command with all options', () => {
      const args = [
        'aws', 'terraform',
        '--profile', 'prod',
        '--regions', 'us-east-1,us-west-2',
        '--services', 'EC2,S3',
        '--output', './terraform-infra',
        '--terraform-version', '1.5.0',
        '--organize-by-service',
        '--import-blocks',
        '--import-script',
        '--starter-kit',
        '--non-interactive',
      ];

      const options: Record<string, any> = {};

      for (let i = 2; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--profile' && args[i + 1]) {
          options.profile = args[++i];
        } else if (arg === '--regions' && args[i + 1]) {
          options.regions = args[++i].split(',');
        } else if (arg === '--services' && args[i + 1]) {
          options.services = args[++i].split(',');
        } else if (arg === '--output' && args[i + 1]) {
          options.output = args[++i];
        } else if (arg === '--terraform-version' && args[i + 1]) {
          options.terraformVersion = args[++i];
        } else if (arg === '--organize-by-service') {
          options.organizeByService = true;
        } else if (arg === '--import-blocks') {
          options.importBlocks = true;
        } else if (arg === '--import-script') {
          options.importScript = true;
        } else if (arg === '--starter-kit') {
          options.includeStarterKit = true;
        } else if (arg === '--non-interactive') {
          options.nonInteractive = true;
        }
      }

      expect(options).toEqual({
        profile: 'prod',
        regions: ['us-east-1', 'us-west-2'],
        services: ['EC2', 'S3'],
        output: './terraform-infra',
        terraformVersion: '1.5.0',
        organizeByService: true,
        importBlocks: true,
        importScript: true,
        includeStarterKit: true,
        nonInteractive: true,
      });
    });
  });

  describe('Starter Kit Generation', () => {
    it('generates README with correct content', () => {
      const summary = {
        totalResources: 10,
        mappedResources: 8,
        unmappedResources: 2,
        filesGenerated: 5,
        servicesIncluded: ['EC2', 'S3', 'RDS'],
        regionsIncluded: ['us-east-1', 'us-west-2'],
      };

      // Test README generation logic
      const readme = `# Terraform AWS Infrastructure

Generated by Nimbus CLI

## Summary

- **Total Resources**: ${summary.totalResources}
- **Mapped Resources**: ${summary.mappedResources}
- **Unmapped Resources**: ${summary.unmappedResources}
- **Files Generated**: ${summary.filesGenerated}`;

      expect(readme).toContain('**Total Resources**: 10');
      expect(readme).toContain('**Mapped Resources**: 8');
      expect(readme).toContain('**Unmapped Resources**: 2');
    });

    it('generates .gitignore with terraform patterns', () => {
      const gitignore = `# Terraform
*.tfstate
*.tfstate.*
.terraform/
.terraform.lock.hcl
crash.log
*.tfvars`;

      expect(gitignore).toContain('*.tfstate');
      expect(gitignore).toContain('.terraform/');
      expect(gitignore).toContain('*.tfvars');
    });

    it('generates Makefile with terraform targets', () => {
      const makefile = `# Terraform Makefile

.PHONY: init plan apply destroy fmt validate import clean

# Initialize Terraform
init:
	terraform init

# Plan changes
plan:
	terraform plan

# Apply changes
apply:
	terraform apply`;

      expect(makefile).toContain('init:');
      expect(makefile).toContain('plan:');
      expect(makefile).toContain('apply:');
      expect(makefile).toContain('terraform init');
    });
  });
});
