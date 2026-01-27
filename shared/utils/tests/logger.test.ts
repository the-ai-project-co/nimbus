import { describe, test, expect } from 'bun:test';
import { Logger } from '../src/logger';

describe('Logger', () => {
  test('creates logger with default level', () => {
    const logger = new Logger();
    expect(logger).toBeDefined();
  });

  test('creates logger with custom level', () => {
    const logger = new Logger('debug');
    expect(logger).toBeDefined();
  });

  test('log methods do not throw', () => {
    const logger = new Logger('debug');

    expect(() => {
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');
    }).not.toThrow();
  });

  test('setLevel updates log level', () => {
    const logger = new Logger('info');
    expect(() => logger.setLevel('debug')).not.toThrow();
  });
});
