/**
 * Cost Commands Tests
 */

import { describe, it, expect } from 'bun:test';
import {
  costCommand,
  costEstimateCommand,
  costHistoryCommand,
  parseCostEstimateOptions,
  parseCostHistoryOptions,
} from '../../src/commands/cost';

describe('Cost Commands', () => {
  describe('parseCostEstimateOptions', () => {
    it('should parse directory from positional argument', () => {
      const options = parseCostEstimateOptions(['./terraform']);
      expect(options.directory).toBe('./terraform');
    });

    it('should parse --directory flag', () => {
      const options = parseCostEstimateOptions(['--directory', '/path/to/infra']);
      expect(options.directory).toBe('/path/to/infra');
    });

    it('should parse -d shorthand for directory', () => {
      const options = parseCostEstimateOptions(['-d', './infra']);
      expect(options.directory).toBe('./infra');
    });

    it('should parse --format flag', () => {
      const options = parseCostEstimateOptions(['--format', 'json']);
      expect(options.format).toBe('json');
    });

    it('should parse --detailed flag', () => {
      const options = parseCostEstimateOptions(['--detailed']);
      expect(options.detailed).toBe(true);
    });

    it('should parse --compare flag', () => {
      const options = parseCostEstimateOptions(['--compare', 'baseline.json']);
      expect(options.compare).toBe('baseline.json');
    });

    it('should parse multiple flags together', () => {
      const options = parseCostEstimateOptions([
        '-d', './terraform',
        '--format', 'html',
        '--detailed',
      ]);

      expect(options.directory).toBe('./terraform');
      expect(options.format).toBe('html');
      expect(options.detailed).toBe(true);
    });

    it('should return empty options for empty args', () => {
      const options = parseCostEstimateOptions([]);
      expect(options.directory).toBeUndefined();
      expect(options.format).toBeUndefined();
    });
  });

  describe('parseCostHistoryOptions', () => {
    it('should have default values', () => {
      const options = parseCostHistoryOptions([]);
      expect(options.days).toBe(30);
      expect(options.groupBy).toBe('service');
    });

    it('should parse --days flag', () => {
      const options = parseCostHistoryOptions(['--days', '7']);
      expect(options.days).toBe(7);
    });

    it('should parse --group-by flag', () => {
      const options = parseCostHistoryOptions(['--group-by', 'resource']);
      expect(options.groupBy).toBe('resource');
    });

    it('should parse --provider flag', () => {
      const options = parseCostHistoryOptions(['--provider', 'aws']);
      expect(options.provider).toBe('aws');
    });

    it('should parse --format flag', () => {
      const options = parseCostHistoryOptions(['--format', 'json']);
      expect(options.format).toBe('json');
    });

    it('should parse multiple flags together', () => {
      const options = parseCostHistoryOptions([
        '--days', '60',
        '--group-by', 'tag',
        '--provider', 'gcp',
        '--format', 'table',
      ]);

      expect(options.days).toBe(60);
      expect(options.groupBy).toBe('tag');
      expect(options.provider).toBe('gcp');
      expect(options.format).toBe('table');
    });

    it('should accept gcp provider', () => {
      const options = parseCostHistoryOptions(['--provider', 'gcp']);
      expect(options.provider).toBe('gcp');
    });

    it('should accept azure provider', () => {
      const options = parseCostHistoryOptions(['--provider', 'azure']);
      expect(options.provider).toBe('azure');
    });
  });

  // ==========================================
  // Command export tests
  // ==========================================

  describe('Command Exports', () => {
    it('should export costCommand as a function', () => {
      expect(typeof costCommand).toBe('function');
    });

    it('should export costEstimateCommand as a function', () => {
      expect(typeof costEstimateCommand).toBe('function');
    });

    it('should export costHistoryCommand as a function', () => {
      expect(typeof costHistoryCommand).toBe('function');
    });
  });

  // ==========================================
  // Combined option tests for estimate
  // ==========================================

  describe('parseCostEstimateOptions - combined flags', () => {
    it('should parse --format with --detailed', () => {
      const options = parseCostEstimateOptions(['--format', 'json', '--detailed']);
      expect(options.format).toBe('json');
      expect(options.detailed).toBe(true);
    });

    it('should parse directory with --format and --detailed', () => {
      const options = parseCostEstimateOptions([
        './my-infra',
        '--format', 'html',
        '--detailed',
      ]);
      expect(options.directory).toBe('./my-infra');
      expect(options.format).toBe('html');
      expect(options.detailed).toBe(true);
    });

    it('should parse --detailed with --compare', () => {
      const options = parseCostEstimateOptions([
        '--detailed',
        '--compare', 'old-estimate.json',
      ]);
      expect(options.detailed).toBe(true);
      expect(options.compare).toBe('old-estimate.json');
    });

    it('should handle --format table value', () => {
      const options = parseCostEstimateOptions(['--format', 'table']);
      expect(options.format).toBe('table');
    });
  });

  // ==========================================
  // Combined option tests for history
  // ==========================================

  describe('parseCostHistoryOptions - combined flags', () => {
    it('should parse --days with --group-by', () => {
      const options = parseCostHistoryOptions(['--days', '14', '--group-by', 'resource']);
      expect(options.days).toBe(14);
      expect(options.groupBy).toBe('resource');
    });

    it('should parse --days with --group-by tag', () => {
      const options = parseCostHistoryOptions(['--days', '90', '--group-by', 'tag']);
      expect(options.days).toBe(90);
      expect(options.groupBy).toBe('tag');
    });

    it('should parse --provider with --format json', () => {
      const options = parseCostHistoryOptions(['--provider', 'aws', '--format', 'json']);
      expect(options.provider).toBe('aws');
      expect(options.format).toBe('json');
    });

    it('should retain default days when only --group-by is specified', () => {
      const options = parseCostHistoryOptions(['--group-by', 'resource']);
      expect(options.days).toBe(30);
      expect(options.groupBy).toBe('resource');
    });

    it('should retain default groupBy when only --days is specified', () => {
      const options = parseCostHistoryOptions(['--days', '7']);
      expect(options.days).toBe(7);
      expect(options.groupBy).toBe('service');
    });
  });

  // ==========================================
  // Edge case tests
  // ==========================================

  describe('Edge Cases', () => {
    it('should parse --days with a string that becomes NaN gracefully', () => {
      const options = parseCostHistoryOptions(['--days', 'abc']);
      expect(options.days).toBeNaN();
    });

    it('should ignore unknown flags for estimate options', () => {
      const options = parseCostEstimateOptions(['--unknown-flag', '--detailed']);
      expect(options.detailed).toBe(true);
      expect((options as Record<string, unknown>)['unknown-flag']).toBeUndefined();
    });

    it('should ignore unknown flags for history options', () => {
      const options = parseCostHistoryOptions(['--unknown', 'value', '--days', '15']);
      expect(options.days).toBe(15);
    });

    it('should handle --format without a following value for estimate', () => {
      const options = parseCostEstimateOptions(['--format']);
      expect(options.format).toBeUndefined();
    });
  });
});
