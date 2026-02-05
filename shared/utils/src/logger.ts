import type { LogLevel } from '@nimbus/shared-types';

const SENSITIVE_KEYS = new Set([
  'password',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'credentials',
  'credential',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'privatekey',
  'private_key',
]);

const REDACTED = '[REDACTED]';

function sanitize(value: unknown, seen = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  const obj = value as Record<string, unknown>;
  if (seen.has(obj)) return '[Circular]';
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map(item => sanitize(item, seen));
  }

  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = REDACTED;
    } else {
      sanitized[key] = sanitize(obj[key], seen);
    }
  }
  return sanitized;
}

function sanitizeArgs(args: unknown[]): unknown[] {
  return args.map(arg => sanitize(arg));
}

/**
 * Simple logger implementation
 * TODO: Replace with Pino or Winston in production
 */
class Logger {
  private level: LogLevel;
  private levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels.indexOf(level) >= this.levels.indexOf(this.level);
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    return `[${timestamp}] [${levelStr}] ${message}`;
  }

  debug(message: string, ...args: any[]) {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message), ...sanitizeArgs(args));
    }
  }

  info(message: string, ...args: any[]) {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message), ...sanitizeArgs(args));
    }
  }

  warn(message: string, ...args: any[]) {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message), ...sanitizeArgs(args));
    }
  }

  error(message: string, ...args: any[]) {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message), ...sanitizeArgs(args));
    }
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }
}

// Export singleton instance
export const logger = new Logger(
  (process.env.LOG_LEVEL as LogLevel) || 'info'
);

// Export Logger class for testing
export { Logger };
