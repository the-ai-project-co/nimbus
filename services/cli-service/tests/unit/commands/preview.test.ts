/**
 * Preview Command Tests
 *
 * Tests for previewCommand exports and option structure validation
 */

import { describe, it, expect } from 'bun:test';
import {
  previewCommand,
  type PreviewOptions,
} from '../../../src/commands/preview';

describe('Preview Command', () => {
  describe('exports', () => {
    it('should export previewCommand as a function', () => {
      expect(typeof previewCommand).toBe('function');
    });

    it('should export previewCommand as the default export', async () => {
      const mod = await import('../../../src/commands/preview');

      expect(typeof mod.default).toBe('function');
      expect(mod.default).toBe(previewCommand);
    });
  });

  describe('PreviewOptions type validation', () => {
    it('should accept terraform as a valid type', () => {
      const options: PreviewOptions = {
        type: 'terraform',
      };

      expect(options.type).toBe('terraform');
    });

    it('should accept k8s as a valid type', () => {
      const options: PreviewOptions = {
        type: 'k8s',
      };

      expect(options.type).toBe('k8s');
    });

    it('should accept helm as a valid type', () => {
      const options: PreviewOptions = {
        type: 'helm',
      };

      expect(options.type).toBe('helm');
    });

    it('should accept terraform options with directory', () => {
      const options: PreviewOptions = {
        type: 'terraform',
        directory: './infrastructure',
        target: 'aws_vpc.main',
        verbose: true,
      };

      expect(options.type).toBe('terraform');
      expect(options.directory).toBe('./infrastructure');
      expect(options.target).toBe('aws_vpc.main');
      expect(options.verbose).toBe(true);
    });

    it('should accept k8s options with namespace', () => {
      const options: PreviewOptions = {
        type: 'k8s',
        directory: './manifests',
        namespace: 'production',
        format: 'diff',
      };

      expect(options.type).toBe('k8s');
      expect(options.namespace).toBe('production');
      expect(options.format).toBe('diff');
    });

    it('should accept helm options with release and values file', () => {
      const options: PreviewOptions = {
        type: 'helm',
        directory: './charts/my-app',
        release: 'my-release',
        namespace: 'staging',
        valuesFile: 'values-staging.yaml',
      };

      expect(options.type).toBe('helm');
      expect(options.release).toBe('my-release');
      expect(options.namespace).toBe('staging');
      expect(options.valuesFile).toBe('values-staging.yaml');
    });

    it('should accept format option as table', () => {
      const options: PreviewOptions = {
        type: 'terraform',
        format: 'table',
      };

      expect(options.format).toBe('table');
    });

    it('should accept format option as json', () => {
      const options: PreviewOptions = {
        type: 'terraform',
        format: 'json',
      };

      expect(options.format).toBe('json');
    });

    it('should accept format option as diff', () => {
      const options: PreviewOptions = {
        type: 'k8s',
        format: 'diff',
      };

      expect(options.format).toBe('diff');
    });

    it('should accept skipSafety option', () => {
      const options: PreviewOptions = {
        type: 'terraform',
        skipSafety: true,
      };

      expect(options.skipSafety).toBe(true);
    });

    it('should default optional fields to undefined', () => {
      const options: PreviewOptions = {
        type: 'terraform',
      };

      expect(options.directory).toBeUndefined();
      expect(options.format).toBeUndefined();
      expect(options.verbose).toBeUndefined();
      expect(options.skipSafety).toBeUndefined();
      expect(options.target).toBeUndefined();
      expect(options.namespace).toBeUndefined();
      expect(options.release).toBeUndefined();
      expect(options.valuesFile).toBeUndefined();
    });

    it('should accept a fully populated options object', () => {
      const options: PreviewOptions = {
        type: 'helm',
        directory: './charts',
        format: 'json',
        verbose: true,
        skipSafety: false,
        target: 'deployment/nginx',
        namespace: 'default',
        release: 'nginx-release',
        valuesFile: 'custom-values.yaml',
      };

      expect(options.type).toBe('helm');
      expect(options.directory).toBe('./charts');
      expect(options.format).toBe('json');
      expect(options.verbose).toBe(true);
      expect(options.skipSafety).toBe(false);
      expect(options.target).toBe('deployment/nginx');
      expect(options.namespace).toBe('default');
      expect(options.release).toBe('nginx-release');
      expect(options.valuesFile).toBe('custom-values.yaml');
    });
  });
});
