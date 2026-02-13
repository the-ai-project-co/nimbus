/**
 * GCP Commands Tests
 *
 * Tests for parseGcpOptions and gcpCommand exports
 */

import { describe, it, expect } from 'bun:test';
import {
  parseGcpOptions,
  gcpCommand,
  computeCommand,
  storageCommand,
  gkeCommand,
  functionsCommand,
  iamCommand,
  type GcpCommandOptions,
} from '../../../src/commands/gcp';

describe('GCP Commands', () => {
  describe('parseGcpOptions', () => {
    it('should return empty options for empty args', () => {
      const options = parseGcpOptions([]);

      expect(options.project).toBeUndefined();
      expect(options.region).toBeUndefined();
      expect(options.zone).toBeUndefined();
      expect(options.format).toBeUndefined();
    });

    it('should parse --project flag', () => {
      const options = parseGcpOptions(['--project', 'my-gcp-project']);

      expect(options.project).toBe('my-gcp-project');
    });

    it('should parse -p shorthand for project', () => {
      const options = parseGcpOptions(['-p', 'staging-project']);

      expect(options.project).toBe('staging-project');
    });

    it('should parse --region flag', () => {
      const options = parseGcpOptions(['--region', 'us-central1']);

      expect(options.region).toBe('us-central1');
    });

    it('should parse -r shorthand for region', () => {
      const options = parseGcpOptions(['-r', 'europe-west1']);

      expect(options.region).toBe('europe-west1');
    });

    it('should parse --zone flag', () => {
      const options = parseGcpOptions(['--zone', 'us-central1-a']);

      expect(options.zone).toBe('us-central1-a');
    });

    it('should parse -z shorthand for zone', () => {
      const options = parseGcpOptions(['-z', 'us-east1-b']);

      expect(options.zone).toBe('us-east1-b');
    });

    it('should parse --format flag with json', () => {
      const options = parseGcpOptions(['--format', 'json']);

      expect(options.format).toBe('json');
    });

    it('should parse --format flag with table', () => {
      const options = parseGcpOptions(['--format', 'table']);

      expect(options.format).toBe('table');
    });

    it('should parse --format flag with text', () => {
      const options = parseGcpOptions(['--format', 'text']);

      expect(options.format).toBe('text');
    });

    it('should parse -f shorthand for format', () => {
      const options = parseGcpOptions(['-f', 'json']);

      expect(options.format).toBe('json');
    });

    it('should parse all flags combined', () => {
      const options = parseGcpOptions([
        '--project', 'prod-project',
        '--region', 'asia-east1',
        '--zone', 'asia-east1-c',
        '--format', 'table',
      ]);

      expect(options.project).toBe('prod-project');
      expect(options.region).toBe('asia-east1');
      expect(options.zone).toBe('asia-east1-c');
      expect(options.format).toBe('table');
    });

    it('should parse shorthand flags combined', () => {
      const options = parseGcpOptions([
        '-p', 'dev-project',
        '-r', 'us-west1',
        '-z', 'us-west1-a',
        '-f', 'json',
      ]);

      expect(options.project).toBe('dev-project');
      expect(options.region).toBe('us-west1');
      expect(options.zone).toBe('us-west1-a');
      expect(options.format).toBe('json');
    });

    it('should ignore positional arguments that are not flags', () => {
      const options = parseGcpOptions(['compute', 'list', '--project', 'my-proj']);

      expect(options.project).toBe('my-proj');
      expect(options.region).toBeUndefined();
      expect(options.zone).toBeUndefined();
    });

    it('should not set project when --project has no following value', () => {
      const options = parseGcpOptions(['--project']);

      expect(options.project).toBeUndefined();
    });

    it('should not set zone when --zone has no following value', () => {
      const options = parseGcpOptions(['--zone']);

      expect(options.zone).toBeUndefined();
    });
  });

  describe('exports', () => {
    it('should export gcpCommand as a function', () => {
      expect(typeof gcpCommand).toBe('function');
    });

    it('should export parseGcpOptions as a function', () => {
      expect(typeof parseGcpOptions).toBe('function');
    });

    it('should export computeCommand as a function', () => {
      expect(typeof computeCommand).toBe('function');
    });

    it('should export storageCommand as a function', () => {
      expect(typeof storageCommand).toBe('function');
    });

    it('should export gkeCommand as a function', () => {
      expect(typeof gkeCommand).toBe('function');
    });

    it('should export functionsCommand as a function', () => {
      expect(typeof functionsCommand).toBe('function');
    });

    it('should export iamCommand as a function', () => {
      expect(typeof iamCommand).toBe('function');
    });
  });
});
