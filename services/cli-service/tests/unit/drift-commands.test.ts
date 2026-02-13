/**
 * Drift Commands Tests
 */

import { describe, it, expect } from 'bun:test';
import {
  driftCommand,
  driftDetectCommand,
  driftFixCommand,
  parseDriftDetectOptions,
  parseDriftFixOptions,
} from '../../src/commands/drift';

describe('Drift Commands', () => {
  describe('parseDriftDetectOptions', () => {
    it('should parse provider from positional argument', () => {
      const options = parseDriftDetectOptions(['terraform']);
      expect(options.provider).toBe('terraform');
    });

    it('should parse --provider flag', () => {
      const options = parseDriftDetectOptions(['--provider', 'kubernetes']);
      expect(options.provider).toBe('kubernetes');
    });

    it('should parse --directory flag', () => {
      const options = parseDriftDetectOptions(['--directory', '/path/to/terraform']);
      expect(options.directory).toBe('/path/to/terraform');
    });

    it('should parse -d shorthand for directory', () => {
      const options = parseDriftDetectOptions(['-d', './infra']);
      expect(options.directory).toBe('./infra');
    });

    it('should parse --json flag', () => {
      const options = parseDriftDetectOptions(['--json']);
      expect(options.json).toBe(true);
    });

    it('should parse --verbose flag', () => {
      const options = parseDriftDetectOptions(['--verbose']);
      expect(options.verbose).toBe(true);
    });

    it('should parse -v shorthand for verbose', () => {
      const options = parseDriftDetectOptions(['-v']);
      expect(options.verbose).toBe(true);
    });

    it('should parse multiple flags together', () => {
      const options = parseDriftDetectOptions([
        'terraform',
        '-d', '/path/to/tf',
        '--json',
        '-v',
      ]);

      expect(options.provider).toBe('terraform');
      expect(options.directory).toBe('/path/to/tf');
      expect(options.json).toBe(true);
      expect(options.verbose).toBe(true);
    });

    it('should return empty options for empty args', () => {
      const options = parseDriftDetectOptions([]);
      expect(options.provider).toBeUndefined();
      expect(options.directory).toBeUndefined();
    });
  });

  describe('parseDriftFixOptions', () => {
    it('should parse provider from positional argument', () => {
      const options = parseDriftFixOptions(['helm']);
      expect(options.provider).toBe('helm');
    });

    it('should parse --provider flag', () => {
      const options = parseDriftFixOptions(['--provider', 'terraform']);
      expect(options.provider).toBe('terraform');
    });

    it('should parse --auto-approve flag', () => {
      const options = parseDriftFixOptions(['--auto-approve']);
      expect(options.autoApprove).toBe(true);
    });

    it('should parse -y shorthand for auto-approve', () => {
      const options = parseDriftFixOptions(['-y']);
      expect(options.autoApprove).toBe(true);
    });

    it('should parse --dry-run flag', () => {
      const options = parseDriftFixOptions(['--dry-run']);
      expect(options.dryRun).toBe(true);
    });

    it('should parse --directory flag', () => {
      const options = parseDriftFixOptions(['--directory', '/path/to/k8s']);
      expect(options.directory).toBe('/path/to/k8s');
    });

    it('should parse all flags together', () => {
      const options = parseDriftFixOptions([
        'kubernetes',
        '-d', './manifests',
        '--dry-run',
        '--json',
      ]);

      expect(options.provider).toBe('kubernetes');
      expect(options.directory).toBe('./manifests');
      expect(options.dryRun).toBe(true);
      expect(options.json).toBe(true);
    });
  });

  // ==========================================
  // Command export tests
  // ==========================================

  describe('Command Exports', () => {
    it('should export driftCommand as a function', () => {
      expect(typeof driftCommand).toBe('function');
    });

    it('should export driftDetectCommand as a function', () => {
      expect(typeof driftDetectCommand).toBe('function');
    });

    it('should export driftFixCommand as a function', () => {
      expect(typeof driftFixCommand).toBe('function');
    });
  });

  // ==========================================
  // Combined detect flag tests
  // ==========================================

  describe('parseDriftDetectOptions - combined flags', () => {
    it('should parse --provider with --directory and --verbose', () => {
      const options = parseDriftDetectOptions([
        '--provider', 'terraform',
        '--directory', '/opt/infra',
        '--verbose',
      ]);
      expect(options.provider).toBe('terraform');
      expect(options.directory).toBe('/opt/infra');
      expect(options.verbose).toBe(true);
    });

    it('should parse --provider kubernetes with --json', () => {
      const options = parseDriftDetectOptions([
        '--provider', 'kubernetes',
        '--json',
      ]);
      expect(options.provider).toBe('kubernetes');
      expect(options.json).toBe(true);
    });

    it('should parse --provider helm with --directory and --json', () => {
      const options = parseDriftDetectOptions([
        '--provider', 'helm',
        '-d', './charts',
        '--json',
      ]);
      expect(options.provider).toBe('helm');
      expect(options.directory).toBe('./charts');
      expect(options.json).toBe(true);
    });

    it('should parse positional provider with all flags', () => {
      const options = parseDriftDetectOptions([
        'terraform',
        '-d', '/my/project',
        '--json',
        '--verbose',
      ]);
      expect(options.provider).toBe('terraform');
      expect(options.directory).toBe('/my/project');
      expect(options.json).toBe(true);
      expect(options.verbose).toBe(true);
    });
  });

  // ==========================================
  // Combined fix flag tests
  // ==========================================

  describe('parseDriftFixOptions - combined flags', () => {
    it('should parse --provider with --auto-approve and --dry-run', () => {
      const options = parseDriftFixOptions([
        '--provider', 'terraform',
        '--auto-approve',
        '--dry-run',
      ]);
      expect(options.provider).toBe('terraform');
      expect(options.autoApprove).toBe(true);
      expect(options.dryRun).toBe(true);
    });

    it('should parse -y shorthand with --directory', () => {
      const options = parseDriftFixOptions([
        '-y',
        '-d', '/opt/tf',
      ]);
      expect(options.autoApprove).toBe(true);
      expect(options.directory).toBe('/opt/tf');
    });

    it('should parse positional provider with --auto-approve and --json', () => {
      const options = parseDriftFixOptions([
        'helm',
        '--auto-approve',
        '--json',
      ]);
      expect(options.provider).toBe('helm');
      expect(options.autoApprove).toBe(true);
      expect(options.json).toBe(true);
    });

    it('should parse kubernetes provider with --dry-run and --directory', () => {
      const options = parseDriftFixOptions([
        'kubernetes',
        '--dry-run',
        '--directory', './k8s-manifests',
      ]);
      expect(options.provider).toBe('kubernetes');
      expect(options.dryRun).toBe(true);
      expect(options.directory).toBe('./k8s-manifests');
    });
  });

  // ==========================================
  // Provider value tests
  // ==========================================

  describe('Provider Values', () => {
    it('should accept terraform as detect provider', () => {
      const options = parseDriftDetectOptions(['terraform']);
      expect(options.provider).toBe('terraform');
    });

    it('should accept kubernetes as detect provider', () => {
      const options = parseDriftDetectOptions(['kubernetes']);
      expect(options.provider).toBe('kubernetes');
    });

    it('should accept helm as detect provider', () => {
      const options = parseDriftDetectOptions(['helm']);
      expect(options.provider).toBe('helm');
    });

    it('should accept terraform as fix provider', () => {
      const options = parseDriftFixOptions(['terraform']);
      expect(options.provider).toBe('terraform');
    });

    it('should accept kubernetes as fix provider', () => {
      const options = parseDriftFixOptions(['kubernetes']);
      expect(options.provider).toBe('kubernetes');
    });

    it('should accept helm as fix provider via --provider flag', () => {
      const options = parseDriftFixOptions(['--provider', 'helm']);
      expect(options.provider).toBe('helm');
    });
  });
});
