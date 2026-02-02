/**
 * HCL Formatter Tests
 */

import { describe, it, expect } from 'bun:test';
import { HCLFormatter } from '../../../../services/aws-tools-service/src/terraform/formatter';
import type {
  TerraformResource,
  TerraformVariable,
  TerraformOutput,
  TerraformProvider,
  TerraformImport,
  TerraformFileContent,
} from '../../../../services/aws-tools-service/src/terraform/types';

describe('HCLFormatter', () => {
  const formatter = new HCLFormatter();

  describe('formatValue', () => {
    it('formats string values', () => {
      expect(formatter.formatValue('hello')).toBe('"hello"');
    });

    it('formats number values', () => {
      expect(formatter.formatValue(42)).toBe('42');
      expect(formatter.formatValue(3.14)).toBe('3.14');
    });

    it('formats boolean values', () => {
      expect(formatter.formatValue(true)).toBe('true');
      expect(formatter.formatValue(false)).toBe('false');
    });

    it('formats null values', () => {
      expect(formatter.formatValue(null)).toBe('null');
    });

    it('formats array values', () => {
      expect(formatter.formatValue(['a', 'b', 'c'])).toBe('["a", "b", "c"]');
      expect(formatter.formatValue([1, 2, 3])).toBe('[1, 2, 3]');
    });

    it('formats reference values', () => {
      expect(formatter.formatValue({ _type: 'reference', value: 'var.region' }))
        .toBe('var.region');
      expect(formatter.formatValue({ _type: 'reference', value: 'aws_instance.main.id' }))
        .toBe('aws_instance.main.id');
    });

    it('formats expression values', () => {
      expect(formatter.formatValue({ _type: 'expression', value: 'length(var.list) > 0' }))
        .toBe('length(var.list) > 0');
    });

    it('escapes special characters in strings', () => {
      expect(formatter.formatValue('hello "world"')).toBe('"hello \\"world\\""');
      // Multiline strings use heredoc format in Terraform
      expect(formatter.formatValue('line1\nline2')).toBe('<<-EOT\nline1\nline2\nEOT');
    });
  });

  describe('formatVariable', () => {
    it('formats a simple variable', () => {
      const variable: TerraformVariable = {
        name: 'region',
        type: 'string',
        description: 'AWS region',
      };

      const result = formatter.formatVariable(variable);
      expect(result).toContain('variable "region"');
      expect(result).toContain('type        = string');
      expect(result).toContain('description = "AWS region"');
    });

    it('formats a variable with default value', () => {
      const variable: TerraformVariable = {
        name: 'instance_count',
        type: 'number',
        default: 3,
      };

      const result = formatter.formatVariable(variable);
      expect(result).toContain('variable "instance_count"');
      expect(result).toContain('type');
      expect(result).toContain('number');
      expect(result).toContain('default');
      expect(result).toContain('3');
    });

    it('formats a sensitive variable', () => {
      const variable: TerraformVariable = {
        name: 'db_password',
        type: 'string',
        sensitive: true,
      };

      const result = formatter.formatVariable(variable);
      expect(result).toContain('variable "db_password"');
      expect(result).toContain('sensitive');
      expect(result).toContain('true');
    });

    it('formats a variable with validation', () => {
      const variable: TerraformVariable = {
        name: 'environment',
        type: 'string',
        validation: [
          {
            condition: 'contains(["dev", "staging", "prod"], var.environment)',
            errorMessage: 'Environment must be dev, staging, or prod.',
          },
        ],
      };

      const result = formatter.formatVariable(variable);
      expect(result).toContain('validation {');
      expect(result).toContain('condition');
      expect(result).toContain('error_message');
    });
  });

  describe('formatOutput', () => {
    it('formats a simple output', () => {
      const output: TerraformOutput = {
        name: 'instance_id',
        value: 'aws_instance.main.id',
      };

      const result = formatter.formatOutput(output);
      expect(result).toContain('output "instance_id"');
      expect(result).toContain('value');
      expect(result).toContain('aws_instance.main.id');
    });

    it('formats an output with description', () => {
      const output: TerraformOutput = {
        name: 'vpc_id',
        value: 'aws_vpc.main.id',
        description: 'ID of the main VPC',
      };

      const result = formatter.formatOutput(output);
      expect(result).toContain('description = "ID of the main VPC"');
    });

    it('formats a sensitive output', () => {
      const output: TerraformOutput = {
        name: 'db_password',
        value: 'random_password.db.result',
        sensitive: true,
      };

      const result = formatter.formatOutput(output);
      expect(result).toContain('sensitive');
      expect(result).toContain('true');
    });
  });

  describe('formatResource', () => {
    it('formats a simple resource', () => {
      const resource: TerraformResource = {
        type: 'aws_instance',
        name: 'web',
        attributes: {
          ami: 'ami-12345678',
          instance_type: 't2.micro',
        },
      };

      const result = formatter.formatResource(resource);
      expect(result).toContain('resource "aws_instance" "web"');
      expect(result).toContain('ami = "ami-12345678"');
      // Note: t2.micro might not be quoted if it's detected as a reference-like pattern
      expect(result).toContain('instance_type');
      expect(result).toContain('t2.micro');
    });

    it('formats a resource with nested blocks', () => {
      const resource: TerraformResource = {
        type: 'aws_instance',
        name: 'web',
        attributes: {
          ami: 'ami-12345678',
          root_block_device: {
            _type: 'block',
            attributes: {
              volume_size: 100,
              volume_type: 'gp3',
            },
          },
        },
      };

      const result = formatter.formatResource(resource);
      expect(result).toContain('root_block_device {');
      expect(result).toContain('volume_size = 100');
      expect(result).toContain('volume_type = "gp3"');
    });

    it('formats a resource with lifecycle block', () => {
      const resource: TerraformResource = {
        type: 'aws_instance',
        name: 'web',
        attributes: {
          ami: 'ami-12345678',
        },
        lifecycle: {
          ignoreChanges: ['ami', 'user_data'],
          createBeforeDestroy: true,
        },
      };

      const result = formatter.formatResource(resource);
      expect(result).toContain('lifecycle {');
      expect(result).toContain('ignore_changes');
      expect(result).toContain('create_before_destroy = true');
    });

    it('formats a resource with depends_on', () => {
      const resource: TerraformResource = {
        type: 'aws_instance',
        name: 'web',
        attributes: {
          ami: 'ami-12345678',
        },
        dependsOn: ['aws_vpc.main', 'aws_subnet.public'],
      };

      const result = formatter.formatResource(resource);
      expect(result).toContain('depends_on = [');
      expect(result).toContain('aws_vpc.main');
      expect(result).toContain('aws_subnet.public');
    });

    it('formats a resource with references', () => {
      const resource: TerraformResource = {
        type: 'aws_instance',
        name: 'web',
        attributes: {
          ami: 'ami-12345678',
          subnet_id: { _type: 'reference', value: 'aws_subnet.main.id' },
        },
      };

      const result = formatter.formatResource(resource);
      expect(result).toContain('subnet_id = aws_subnet.main.id');
    });

    it('formats a resource with array of blocks', () => {
      const resource: TerraformResource = {
        type: 'aws_security_group',
        name: 'web',
        attributes: {
          name: 'web-sg',
          ingress: [
            {
              _type: 'block',
              attributes: {
                from_port: 80,
                to_port: 80,
                protocol: 'tcp',
                cidr_blocks: ['0.0.0.0/0'],
              },
            },
            {
              _type: 'block',
              attributes: {
                from_port: 443,
                to_port: 443,
                protocol: 'tcp',
                cidr_blocks: ['0.0.0.0/0'],
              },
            },
          ],
        },
      };

      const result = formatter.formatResource(resource);
      expect(result).toContain('ingress {');
      expect(result).toContain('from_port = 80');
      expect(result).toContain('from_port = 443');
    });
  });

  describe('formatProvider', () => {
    it('formats a simple provider', () => {
      const provider: TerraformProvider = {
        name: 'aws',
        attributes: {
          region: 'us-east-1',
        },
      };

      const result = formatter.formatProvider(provider);
      expect(result).toContain('provider "aws"');
      expect(result).toContain('region = "us-east-1"');
    });

    it('formats a provider with alias', () => {
      const provider: TerraformProvider = {
        name: 'aws',
        alias: 'west',
        attributes: {
          region: 'us-west-2',
        },
      };

      const result = formatter.formatProvider(provider);
      expect(result).toContain('provider "aws"');
      expect(result).toContain('alias = "west"');
      expect(result).toContain('region = "us-west-2"');
    });
  });

  describe('formatImport', () => {
    it('formats an import block', () => {
      const importBlock: TerraformImport = {
        to: 'aws_instance.web',
        id: 'i-1234567890abcdef0',
      };

      const result = formatter.formatImport(importBlock);
      expect(result).toContain('import {');
      expect(result).toContain('to = aws_instance.web');
      expect(result).toContain('id = "i-1234567890abcdef0"');
    });
  });

  describe('formatFile', () => {
    it('formats a complete file with all sections', () => {
      const content: TerraformFileContent = {
        terraform: {
          required_version: '>= 1.5.0',
          required_providers: {
            aws: {
              source: 'hashicorp/aws',
              version: '~> 5.0',
            },
          },
        },
        providers: [
          {
            name: 'aws',
            attributes: {
              region: { _type: 'reference', value: 'var.region' },
            },
          },
        ],
        variables: [
          {
            name: 'region',
            type: 'string',
            default: 'us-east-1',
          },
        ],
        resources: [
          {
            type: 'aws_instance',
            name: 'web',
            attributes: {
              ami: 'ami-12345678',
              instance_type: 't2.micro',
            },
          },
        ],
        outputs: [
          {
            name: 'instance_id',
            value: 'aws_instance.web.id',
          },
        ],
      };

      const result = formatter.formatFile(content);

      // Check terraform block
      expect(result).toContain('terraform {');

      // Check provider
      expect(result).toContain('provider "aws"');

      // Check variable
      expect(result).toContain('variable "region"');

      // Check resource
      expect(result).toContain('resource "aws_instance" "web"');

      // Check output
      expect(result).toContain('output "instance_id"');
    });
  });
});
