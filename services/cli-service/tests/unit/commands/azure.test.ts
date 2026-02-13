/**
 * Azure Commands Tests
 *
 * Tests for parseAzureOptions and azureCommand exports
 */

import { describe, it, expect } from 'bun:test';
import {
  parseAzureOptions,
  azureCommand,
  vmCommand,
  storageCommand,
  aksCommand,
  functionsCommand,
  type AzureCommandOptions,
} from '../../../src/commands/azure';

describe('Azure Commands', () => {
  describe('parseAzureOptions', () => {
    it('should return empty options for empty args', () => {
      const options = parseAzureOptions([]);

      expect(options.subscription).toBeUndefined();
      expect(options.resourceGroup).toBeUndefined();
      expect(options.output).toBeUndefined();
    });

    it('should parse --subscription flag', () => {
      const options = parseAzureOptions(['--subscription', 'sub-12345']);

      expect(options.subscription).toBe('sub-12345');
    });

    it('should parse -s shorthand for subscription', () => {
      const options = parseAzureOptions(['-s', 'my-subscription-id']);

      expect(options.subscription).toBe('my-subscription-id');
    });

    it('should parse --resource-group flag', () => {
      const options = parseAzureOptions(['--resource-group', 'my-rg']);

      expect(options.resourceGroup).toBe('my-rg');
    });

    it('should parse -g shorthand for resource-group', () => {
      const options = parseAzureOptions(['-g', 'prod-rg']);

      expect(options.resourceGroup).toBe('prod-rg');
    });

    it('should parse --output flag with json', () => {
      const options = parseAzureOptions(['--output', 'json']);

      expect(options.output).toBe('json');
    });

    it('should parse --output flag with table', () => {
      const options = parseAzureOptions(['--output', 'table']);

      expect(options.output).toBe('table');
    });

    it('should parse --output flag with tsv', () => {
      const options = parseAzureOptions(['--output', 'tsv']);

      expect(options.output).toBe('tsv');
    });

    it('should parse -o shorthand for output', () => {
      const options = parseAzureOptions(['-o', 'json']);

      expect(options.output).toBe('json');
    });

    it('should parse all flags combined', () => {
      const options = parseAzureOptions([
        '--subscription', 'sub-abc',
        '--resource-group', 'my-resource-group',
        '--output', 'table',
      ]);

      expect(options.subscription).toBe('sub-abc');
      expect(options.resourceGroup).toBe('my-resource-group');
      expect(options.output).toBe('table');
    });

    it('should parse shorthand flags combined', () => {
      const options = parseAzureOptions([
        '-s', 'sub-xyz',
        '-g', 'dev-rg',
        '-o', 'tsv',
      ]);

      expect(options.subscription).toBe('sub-xyz');
      expect(options.resourceGroup).toBe('dev-rg');
      expect(options.output).toBe('tsv');
    });

    it('should ignore positional arguments that are not flags', () => {
      const options = parseAzureOptions(['vm', 'list', '--subscription', 'sub-1']);

      expect(options.subscription).toBe('sub-1');
      expect(options.resourceGroup).toBeUndefined();
    });

    it('should not set subscription when --subscription has no following value', () => {
      const options = parseAzureOptions(['--subscription']);

      expect(options.subscription).toBeUndefined();
    });

    it('should not set resource-group when --resource-group has no following value', () => {
      const options = parseAzureOptions(['--resource-group']);

      expect(options.resourceGroup).toBeUndefined();
    });
  });

  describe('exports', () => {
    it('should export azureCommand as a function', () => {
      expect(typeof azureCommand).toBe('function');
    });

    it('should export parseAzureOptions as a function', () => {
      expect(typeof parseAzureOptions).toBe('function');
    });

    it('should export vmCommand as a function', () => {
      expect(typeof vmCommand).toBe('function');
    });

    it('should export storageCommand as a function', () => {
      expect(typeof storageCommand).toBe('function');
    });

    it('should export aksCommand as a function', () => {
      expect(typeof aksCommand).toBe('function');
    });

    it('should export functionsCommand as a function', () => {
      expect(typeof functionsCommand).toBe('function');
    });
  });
});
