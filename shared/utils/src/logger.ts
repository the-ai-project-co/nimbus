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
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return value;

  const obj = value as Record<string, unknown>;
  if (seen.has(obj)) return '[Circular]';
  seen.add(obj);

  if (obj instanceof Date) return obj.toISOString();
  if (obj instanceof Map) return sanitize(Object.fromEntries(obj), seen);
  if (obj instanceof Set) return sanitize([...obj], seen);

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

// Patterns to redact in error messages/stacks (connection strings, URLs with creds, etc.)
const SENSITIVE_PATTERNS = [
  /(?<=:\/\/[^:]+:)[^@]+(?=@)/g,       // URL password: protocol://user:PASSWORD@host
  /(?<=password[=:])\s*\S+/gi,          // password=VALUE or password: VALUE
  /(?<=secret[=:])\s*\S+/gi,            // secret=VALUE or secret: VALUE
  /(?<=token[=:])\s*\S+/gi,             // token=VALUE or token: VALUE
  /(?<=apikey[=:])\s*\S+/gi,            // apiKey=VALUE or apikey: VALUE
  /(?<=authorization[=:])\s*\S+/gi,     // authorization=VALUE
];

function sanitizeString(str: string): string {
  let result = str;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }
  return result;
}

function safeContext(context: unknown): string {
  if (context instanceof Error) {
    const errorText = context.stack ?? context.message;
    return sanitizeString(errorText);
  }
  return JSON.stringify(sanitize(context));
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

  debug(message: string, context?: unknown) {
    if (this.shouldLog('debug')) {
      const line = this.format('debug', message, context);
      console.log(line);
    }
  }

  info(message: string, context?: unknown) {
    if (this.shouldLog('info')) {
      const line = this.format('info', message, context);
      console.log(line);
    }
  }

  warn(message: string, context?: unknown) {
    if (this.shouldLog('warn')) {
      const line = this.format('warn', message, context);
      console.warn(line);
    }
  }

  error(message: string, context?: unknown) {
    if (this.shouldLog('error')) {
      const line = this.format('error', message, context);
      console.error(line);
    }
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }

  private format(level: LogLevel, message: string, context?: unknown): string {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    if (context === undefined) {
      return `[${timestamp}] [${levelStr}] ${message}`;
    }
    return `[${timestamp}] [${levelStr}] ${message} ${safeContext(context)}`;
  }
}

// Export singleton instance
export const logger = new Logger(
  (process.env.LOG_LEVEL as LogLevel) || 'info'
);

// Export Logger class for testing
export { Logger };
