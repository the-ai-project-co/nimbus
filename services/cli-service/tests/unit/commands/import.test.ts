/**
 * Import Command Tests
 *
 * Tests for parseImportOptions and importCommand exports
 */

import { describe, it, expect } from 'bun:test';
import {
  parseImportOptions,
  importCommand,
  type ImportOptions,
} from '../../../src/commands/import';

describe('Import Command', () => {
  describe('parseImportOptions', () => {
    it('should return empty options for empty args', () => {
      const options = parseImportOptions([]);

      expect(options.provider).toBeUndefined();
      expect(options.resourceType).toBeUndefined();
      expect(options.resourceId).toBeUndefined();
      expect(options.output).toBeUndefined();
      expect(options.nonInteractive).toBeUndefined();
      expect(options.region).toBeUndefined();
    });

    it('should parse --provider flag with aws', () => {
      const options = parseImportOptions(['--provider', 'aws']);

      expect(options.provider).toBe('aws');
    });

    it('should parse --provider flag with gcp', () => {
      const options = parseImportOptions(['--provider', 'gcp']);

      expect(options.provider).toBe('gcp');
    });

    it('should parse --provider flag with azure', () => {
      const options = parseImportOptions(['--provider', 'azure']);

      expect(options.provider).toBe('azure');
    });

    it('should parse positional argument as provider', () => {
      const options = parseImportOptions(['aws']);

      expect(options.provider).toBe('aws');
    });

    it('should prefer --provider flag over positional argument', () => {
      const options = parseImportOptions(['--provider', 'gcp']);

      expect(options.provider).toBe('gcp');
    });

    it('should parse --resource-type flag', () => {
      const options = parseImportOptions(['--resource-type', 'ec2']);

      expect(options.resourceType).toBe('ec2');
    });

    it('should parse --resource-id flag', () => {
      const options = parseImportOptions(['--resource-id', 'i-1234567890abcdef0']);

      expect(options.resourceId).toBe('i-1234567890abcdef0');
    });

    it('should parse --output flag', () => {
      const options = parseImportOptions(['--output', './terraform']);

      expect(options.output).toBe('./terraform');
    });

    it('should parse -o shorthand for output', () => {
      const options = parseImportOptions(['-o', './output']);

      expect(options.output).toBe('./output');
    });

    it('should parse --non-interactive flag', () => {
      const options = parseImportOptions(['--non-interactive']);

      expect(options.nonInteractive).toBe(true);
    });

    it('should parse -y shorthand for non-interactive', () => {
      const options = parseImportOptions(['-y']);

      expect(options.nonInteractive).toBe(true);
    });

    it('should parse --region flag', () => {
      const options = parseImportOptions(['--region', 'us-west-2']);

      expect(options.region).toBe('us-west-2');
    });

    it('should parse all flags combined', () => {
      const options = parseImportOptions([
        '--provider', 'aws',
        '--resource-type', 'vpc',
        '--resource-id', 'vpc-abc123',
        '--output', './infra',
        '--region', 'eu-west-1',
        '--non-interactive',
      ]);

      expect(options.provider).toBe('aws');
      expect(options.resourceType).toBe('vpc');
      expect(options.resourceId).toBe('vpc-abc123');
      expect(options.output).toBe('./infra');
      expect(options.region).toBe('eu-west-1');
      expect(options.nonInteractive).toBe(true);
    });

    it('should parse positional provider with other flags', () => {
      const options = parseImportOptions([
        'azure',
        '--resource-type', 'vm',
        '-o', './azure-infra',
        '-y',
      ]);

      expect(options.provider).toBe('azure');
      expect(options.resourceType).toBe('vm');
      expect(options.output).toBe('./azure-infra');
      expect(options.nonInteractive).toBe(true);
    });

    it('should not set provider when --provider has no following value', () => {
      const options = parseImportOptions(['--provider']);

      expect(options.provider).toBeUndefined();
    });

    it('should not set resource-type when --resource-type has no following value', () => {
      const options = parseImportOptions(['--resource-type']);

      expect(options.resourceType).toBeUndefined();
    });
  });

  describe('exports', () => {
    it('should export importCommand as a function', () => {
      expect(typeof importCommand).toBe('function');
    });

    it('should export parseImportOptions as a function', () => {
      expect(typeof parseImportOptions).toBe('function');
    });
  });
});
