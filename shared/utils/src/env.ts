import { ConfigurationError } from './errors';

/**
 * Environment variable helpers
 */

export function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new ConfigurationError(
      `Environment variable ${key} is required but not set`,
      'nimbus',
      { key }
    );
  }
  return value;
}

export function getEnvOptional(key: string): string | undefined {
  return process.env[key];
}

export function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new ConfigurationError(
      `Environment variable ${key} is required but not set`,
      'nimbus',
      { key }
    );
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new ConfigurationError(
      `Environment variable ${key} must be a valid number`,
      'nimbus',
      { key, value }
    );
  }
  return parsed;
}

export function getEnvBoolean(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}
