/**
 * AWS Commands Tests
 *
 * Tests for parseAwsOptions and awsCommand exports
 */

import { describe, it, expect } from 'bun:test';
import {
  parseAwsOptions,
  awsCommand,
  ec2Command,
  s3Command,
  rdsCommand,
  lambdaCommand,
  iamCommand,
  vpcCommand,
  type AwsCommandOptions,
} from '../../../src/commands/aws';

describe('AWS Commands', () => {
  describe('parseAwsOptions', () => {
    it('should return empty options for empty args', () => {
      const options = parseAwsOptions([]);

      expect(options.profile).toBeUndefined();
      expect(options.region).toBeUndefined();
      expect(options.output).toBeUndefined();
    });

    it('should parse --profile flag', () => {
      const options = parseAwsOptions(['--profile', 'production']);

      expect(options.profile).toBe('production');
    });

    it('should parse -p shorthand for profile', () => {
      const options = parseAwsOptions(['-p', 'staging']);

      expect(options.profile).toBe('staging');
    });

    it('should parse --region flag', () => {
      const options = parseAwsOptions(['--region', 'us-west-2']);

      expect(options.region).toBe('us-west-2');
    });

    it('should parse -r shorthand for region', () => {
      const options = parseAwsOptions(['-r', 'eu-west-1']);

      expect(options.region).toBe('eu-west-1');
    });

    it('should parse --output flag with json', () => {
      const options = parseAwsOptions(['--output', 'json']);

      expect(options.output).toBe('json');
    });

    it('should parse --output flag with table', () => {
      const options = parseAwsOptions(['--output', 'table']);

      expect(options.output).toBe('table');
    });

    it('should parse --output flag with text', () => {
      const options = parseAwsOptions(['--output', 'text']);

      expect(options.output).toBe('text');
    });

    it('should parse -o shorthand for output', () => {
      const options = parseAwsOptions(['-o', 'json']);

      expect(options.output).toBe('json');
    });

    it('should parse all flags combined', () => {
      const options = parseAwsOptions([
        '--profile', 'my-profile',
        '--region', 'ap-southeast-1',
        '--output', 'table',
      ]);

      expect(options.profile).toBe('my-profile');
      expect(options.region).toBe('ap-southeast-1');
      expect(options.output).toBe('table');
    });

    it('should parse shorthand flags combined', () => {
      const options = parseAwsOptions([
        '-p', 'dev',
        '-r', 'us-east-1',
        '-o', 'json',
      ]);

      expect(options.profile).toBe('dev');
      expect(options.region).toBe('us-east-1');
      expect(options.output).toBe('json');
    });

    it('should ignore positional arguments that are not flags', () => {
      const options = parseAwsOptions(['ec2', 'list', '--region', 'us-east-1']);

      expect(options.region).toBe('us-east-1');
      expect(options.profile).toBeUndefined();
      expect(options.output).toBeUndefined();
    });

    it('should not set profile when --profile has no following value', () => {
      const options = parseAwsOptions(['--profile']);

      expect(options.profile).toBeUndefined();
    });

    it('should not set region when --region has no following value', () => {
      const options = parseAwsOptions(['--region']);

      expect(options.region).toBeUndefined();
    });
  });

  describe('exports', () => {
    it('should export awsCommand as a function', () => {
      expect(typeof awsCommand).toBe('function');
    });

    it('should export parseAwsOptions as a function', () => {
      expect(typeof parseAwsOptions).toBe('function');
    });

    it('should export ec2Command as a function', () => {
      expect(typeof ec2Command).toBe('function');
    });

    it('should export s3Command as a function', () => {
      expect(typeof s3Command).toBe('function');
    });

    it('should export rdsCommand as a function', () => {
      expect(typeof rdsCommand).toBe('function');
    });

    it('should export lambdaCommand as a function', () => {
      expect(typeof lambdaCommand).toBe('function');
    });

    it('should export iamCommand as a function', () => {
      expect(typeof iamCommand).toBe('function');
    });

    it('should export vpcCommand as a function', () => {
      expect(typeof vpcCommand).toBe('function');
    });
  });
});
