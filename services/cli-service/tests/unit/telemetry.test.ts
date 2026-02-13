/**
 * Telemetry Module Tests
 *
 * Tests for opt-in anonymous usage telemetry: isEnabled, trackEvent,
 * trackCommand, trackError, trackGeneration, and shutdown.
 * Filesystem operations are mocked to avoid actual I/O.
 */

import { describe, test, expect, beforeEach, spyOn } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'os';

const NIMBUS_DIR = path.join(homedir(), '.nimbus');
const CONFIG_FILE = path.join(NIMBUS_DIR, 'config.json');

describe('Telemetry Module', () => {
  describe('isEnabled', () => {
    test('should return false when no config file exists', () => {
      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(false);

      const { isEnabled } = require('../../src/telemetry');
      expect(isEnabled()).toBe(false);

      existsSyncSpy.mockRestore();
    });

    test('should return false when config has no telemetry section', () => {
      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(true);
      const readFileSyncSpy = spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({}),
      );

      const { isEnabled } = require('../../src/telemetry');
      expect(isEnabled()).toBe(false);

      existsSyncSpy.mockRestore();
      readFileSyncSpy.mockRestore();
    });

    test('should return true when telemetry is enabled in config', () => {
      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(true);
      const readFileSyncSpy = spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({ telemetry: { enabled: true } }),
      );

      const { isEnabled } = require('../../src/telemetry');
      expect(isEnabled()).toBe(true);

      existsSyncSpy.mockRestore();
      readFileSyncSpy.mockRestore();
    });

    test('should return false when telemetry.enabled is false', () => {
      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(true);
      const readFileSyncSpy = spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({ telemetry: { enabled: false } }),
      );

      const { isEnabled } = require('../../src/telemetry');
      expect(isEnabled()).toBe(false);

      existsSyncSpy.mockRestore();
      readFileSyncSpy.mockRestore();
    });

    test('should return false on config parse error', () => {
      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(true);
      const readFileSyncSpy = spyOn(fs, 'readFileSync').mockReturnValue(
        'invalid json{{{',
      );

      const { isEnabled } = require('../../src/telemetry');
      expect(isEnabled()).toBe(false);

      existsSyncSpy.mockRestore();
      readFileSyncSpy.mockRestore();
    });

    test('should return false when telemetry.enabled is a truthy non-boolean', () => {
      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(true);
      const readFileSyncSpy = spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({ telemetry: { enabled: 'yes' } }),
      );

      const { isEnabled } = require('../../src/telemetry');
      // Strict equality check: 'yes' === true is false
      expect(isEnabled()).toBe(false);

      existsSyncSpy.mockRestore();
      readFileSyncSpy.mockRestore();
    });
  });

  describe('trackEvent', () => {
    test('should not throw when telemetry is disabled', () => {
      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(false);

      const { trackEvent } = require('../../src/telemetry');
      expect(() => trackEvent('test_event', { key: 'value' })).not.toThrow();

      existsSyncSpy.mockRestore();
    });

    test('should not throw when called without properties', () => {
      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(false);

      const { trackEvent } = require('../../src/telemetry');
      expect(() => trackEvent('test_event')).not.toThrow();

      existsSyncSpy.mockRestore();
    });

    test('should write to telemetry file when enabled', () => {
      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(true);
      const readFileSyncSpy = spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({ telemetry: { enabled: true, anonymousId: 'test-id' } }),
      );
      const mkdirSyncSpy = spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
      const appendFileSyncSpy = spyOn(fs, 'appendFileSync').mockReturnValue(undefined);

      const { trackEvent } = require('../../src/telemetry');
      trackEvent('test_event', { foo: 'bar' });

      expect(appendFileSyncSpy).toHaveBeenCalled();

      existsSyncSpy.mockRestore();
      readFileSyncSpy.mockRestore();
      mkdirSyncSpy.mockRestore();
      appendFileSyncSpy.mockRestore();
    });
  });

  describe('trackCommand', () => {
    test('should not throw when tracking a command with args', () => {
      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(false);

      const { trackCommand } = require('../../src/telemetry');
      expect(() => trackCommand('chat', ['--model', 'gpt-4'])).not.toThrow();

      existsSyncSpy.mockRestore();
    });

    test('should not throw when tracking a command without args', () => {
      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(false);

      const { trackCommand } = require('../../src/telemetry');
      expect(() => trackCommand('init')).not.toThrow();

      existsSyncSpy.mockRestore();
    });

    test('should not throw with empty args array', () => {
      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(false);

      const { trackCommand } = require('../../src/telemetry');
      expect(() => trackCommand('apply', [])).not.toThrow();

      existsSyncSpy.mockRestore();
    });
  });

  describe('trackError', () => {
    test('should not throw when tracking errors', () => {
      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(false);

      const { trackError } = require('../../src/telemetry');
      expect(() => trackError('apply', 'timeout')).not.toThrow();

      existsSyncSpy.mockRestore();
    });

    test('should not throw with various error types', () => {
      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(false);

      const { trackError } = require('../../src/telemetry');
      expect(() => trackError('chat', 'connection_refused')).not.toThrow();
      expect(() => trackError('init', 'permission_denied')).not.toThrow();
      expect(() => trackError('tf', 'validation_error')).not.toThrow();

      existsSyncSpy.mockRestore();
    });
  });

  describe('trackGeneration', () => {
    test('should not throw when tracking generation', () => {
      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(false);

      const { trackGeneration } = require('../../src/telemetry');
      expect(() => trackGeneration('terraform', ['vpc', 'eks'])).not.toThrow();

      existsSyncSpy.mockRestore();
    });

    test('should not throw with empty components list', () => {
      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(false);

      const { trackGeneration } = require('../../src/telemetry');
      expect(() => trackGeneration('kubernetes', [])).not.toThrow();

      existsSyncSpy.mockRestore();
    });

    test('should not throw with many components', () => {
      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(false);

      const { trackGeneration } = require('../../src/telemetry');
      const components = ['vpc', 'subnet', 'igw', 'nat', 'eks', 'rds', 'alb'];
      expect(() => trackGeneration('terraform', components)).not.toThrow();

      existsSyncSpy.mockRestore();
    });
  });

  describe('shutdown', () => {
    test('should resolve without error', async () => {
      const { shutdown } = require('../../src/telemetry');

      await expect(shutdown()).resolves.toBeUndefined();
    });

    test('should be callable multiple times', async () => {
      const { shutdown } = require('../../src/telemetry');

      await expect(shutdown()).resolves.toBeUndefined();
      await expect(shutdown()).resolves.toBeUndefined();
    });
  });

  describe('exports', () => {
    test('should export isEnabled as a function', () => {
      const telemetry = require('../../src/telemetry');

      expect(typeof telemetry.isEnabled).toBe('function');
    });

    test('should export trackEvent as a function', () => {
      const telemetry = require('../../src/telemetry');

      expect(typeof telemetry.trackEvent).toBe('function');
    });

    test('should export trackCommand as a function', () => {
      const telemetry = require('../../src/telemetry');

      expect(typeof telemetry.trackCommand).toBe('function');
    });

    test('should export trackError as a function', () => {
      const telemetry = require('../../src/telemetry');

      expect(typeof telemetry.trackError).toBe('function');
    });

    test('should export trackGeneration as a function', () => {
      const telemetry = require('../../src/telemetry');

      expect(typeof telemetry.trackGeneration).toBe('function');
    });

    test('should export shutdown as a function', () => {
      const telemetry = require('../../src/telemetry');

      expect(typeof telemetry.shutdown).toBe('function');
    });
  });
});
