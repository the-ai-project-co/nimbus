import { describe, test, expect } from 'bun:test';
import { parseAwsOptions } from '../../src/commands/aws';
import { parseGcpOptions } from '../../src/commands/gcp';
import { parseAzureOptions } from '../../src/commands/azure';

describe('Cloud Commands Integration', () => {
  describe('AWS Command Options', () => {
    test('should parse --profile option', () => {
      const options = parseAwsOptions(['--profile', 'production']);

      expect(options.profile).toBe('production');
    });

    test('should parse -p short option', () => {
      const options = parseAwsOptions(['-p', 'staging']);

      expect(options.profile).toBe('staging');
    });

    test('should parse --region option', () => {
      const options = parseAwsOptions(['--region', 'us-west-2']);

      expect(options.region).toBe('us-west-2');
    });

    test('should parse -r short option', () => {
      const options = parseAwsOptions(['-r', 'eu-west-1']);

      expect(options.region).toBe('eu-west-1');
    });

    test('should parse --output option', () => {
      const options = parseAwsOptions(['--output', 'json']);

      expect(options.output).toBe('json');
    });

    test('should parse multiple options', () => {
      const options = parseAwsOptions([
        '--profile', 'prod',
        '--region', 'us-east-1',
        '--output', 'table',
      ]);

      expect(options.profile).toBe('prod');
      expect(options.region).toBe('us-east-1');
      expect(options.output).toBe('table');
    });

    test('should ignore unknown options', () => {
      const options = parseAwsOptions(['--unknown', 'value', '--profile', 'test']);

      expect(options.profile).toBe('test');
    });
  });

  describe('GCP Command Options', () => {
    test('should parse --project option', () => {
      const options = parseGcpOptions(['--project', 'my-project']);

      expect(options.project).toBe('my-project');
    });

    test('should parse -p short option', () => {
      const options = parseGcpOptions(['-p', 'test-project']);

      expect(options.project).toBe('test-project');
    });

    test('should parse --region option', () => {
      const options = parseGcpOptions(['--region', 'us-central1']);

      expect(options.region).toBe('us-central1');
    });

    test('should parse --zone option', () => {
      const options = parseGcpOptions(['--zone', 'us-central1-a']);

      expect(options.zone).toBe('us-central1-a');
    });

    test('should parse -z short option', () => {
      const options = parseGcpOptions(['-z', 'europe-west1-b']);

      expect(options.zone).toBe('europe-west1-b');
    });

    test('should parse --format option', () => {
      const options = parseGcpOptions(['--format', 'json']);

      expect(options.format).toBe('json');
    });

    test('should parse multiple options', () => {
      const options = parseGcpOptions([
        '--project', 'prod-project',
        '--region', 'asia-east1',
        '--format', 'table',
      ]);

      expect(options.project).toBe('prod-project');
      expect(options.region).toBe('asia-east1');
      expect(options.format).toBe('table');
    });
  });

  describe('Azure Command Options', () => {
    test('should parse --subscription option', () => {
      const options = parseAzureOptions(['--subscription', 'sub-123']);

      expect(options.subscription).toBe('sub-123');
    });

    test('should parse -s short option', () => {
      const options = parseAzureOptions(['-s', 'sub-456']);

      expect(options.subscription).toBe('sub-456');
    });

    test('should parse --resource-group option', () => {
      const options = parseAzureOptions(['--resource-group', 'my-rg']);

      expect(options.resourceGroup).toBe('my-rg');
    });

    test('should parse -g short option', () => {
      const options = parseAzureOptions(['-g', 'test-rg']);

      expect(options.resourceGroup).toBe('test-rg');
    });

    test('should parse --output option', () => {
      const options = parseAzureOptions(['--output', 'table']);

      expect(options.output).toBe('table');
    });

    test('should parse multiple options', () => {
      const options = parseAzureOptions([
        '--subscription', 'prod-sub',
        '-g', 'prod-rg',
        '--output', 'json',
      ]);

      expect(options.subscription).toBe('prod-sub');
      expect(options.resourceGroup).toBe('prod-rg');
      expect(options.output).toBe('json');
    });
  });

  describe('Command Structure', () => {
    test('AWS commands should export main command function', async () => {
      const { awsCommand } = await import('../../src/commands/aws');
      expect(typeof awsCommand).toBe('function');
    });

    test('GCP commands should export main command function', async () => {
      const { gcpCommand } = await import('../../src/commands/gcp');
      expect(typeof gcpCommand).toBe('function');
    });

    test('Azure commands should export main command function', async () => {
      const { azureCommand } = await import('../../src/commands/azure');
      expect(typeof azureCommand).toBe('function');
    });

    test('AWS should export subcommands', async () => {
      const aws = await import('../../src/commands/aws');
      expect(typeof aws.ec2Command).toBe('function');
      expect(typeof aws.s3Command).toBe('function');
      expect(typeof aws.rdsCommand).toBe('function');
      expect(typeof aws.lambdaCommand).toBe('function');
      expect(typeof aws.iamCommand).toBe('function');
      expect(typeof aws.vpcCommand).toBe('function');
    });

    test('GCP should export subcommands', async () => {
      const gcp = await import('../../src/commands/gcp');
      expect(typeof gcp.computeCommand).toBe('function');
      expect(typeof gcp.storageCommand).toBe('function');
      expect(typeof gcp.gkeCommand).toBe('function');
      expect(typeof gcp.functionsCommand).toBe('function');
      expect(typeof gcp.iamCommand).toBe('function');
    });

    test('Azure should export subcommands', async () => {
      const azure = await import('../../src/commands/azure');
      expect(typeof azure.vmCommand).toBe('function');
      expect(typeof azure.storageCommand).toBe('function');
      expect(typeof azure.aksCommand).toBe('function');
      expect(typeof azure.functionsCommand).toBe('function');
    });
  });
});
