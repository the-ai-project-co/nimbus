import { describe, test, expect } from 'bun:test';
import { NimbusError, ValidationError, ServiceUnavailableError } from '../src/errors';

describe('NimbusError', () => {
  test('creates error with required fields', () => {
    const error = new NimbusError('Test error', 'TEST_CODE', 'test-service');

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.service).toBe('test-service');
    expect(error.timestamp).toBeDefined();
  });

  test('toJSON returns ServiceError object', () => {
    const error = new NimbusError('Test error', 'TEST_CODE', 'test-service', { foo: 'bar' });
    const json = error.toJSON();

    expect(json.code).toBe('TEST_CODE');
    expect(json.message).toBe('Test error');
    expect(json.service).toBe('test-service');
    expect(json.timestamp).toBeDefined();
    expect(json.details).toEqual({ foo: 'bar' });
  });
});

describe('ValidationError', () => {
  test('creates validation error', () => {
    const error = new ValidationError('Invalid input', 'test-service');

    expect(error.name).toBe('ValidationError');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('Invalid input');
  });
});

describe('ServiceUnavailableError', () => {
  test('creates service unavailable error', () => {
    const error = new ServiceUnavailableError('my-service');

    expect(error.name).toBe('ServiceUnavailableError');
    expect(error.code).toBe('SERVICE_UNAVAILABLE');
    expect(error.message).toContain('my-service');
  });
});
