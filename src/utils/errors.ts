export interface ServiceError {
  code: string;
  message: string;
  service: string;
  timestamp: string;
  details?: unknown;
  stack?: string;
}

/**
 * Base Nimbus Error
 */
export class NimbusError extends Error {
  code: string;
  service: string;
  timestamp: string;
  details?: unknown;

  constructor(message: string, code: string, service: string, details?: unknown) {
    super(message);
    this.name = 'NimbusError';
    this.code = code;
    this.service = service;
    this.timestamp = new Date().toISOString();
    this.details = details;
  }

  toJSON(): ServiceError {
    return {
      code: this.code,
      message: this.message,
      service: this.service,
      timestamp: this.timestamp,
      details: this.details,
      stack: this.stack,
    };
  }
}

export class ValidationError extends NimbusError {
  constructor(message: string, service: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', service, details);
    this.name = 'ValidationError';
  }
}

export class ServiceUnavailableError extends NimbusError {
  constructor(serviceName: string, details?: unknown) {
    super(`Service ${serviceName} is unavailable`, 'SERVICE_UNAVAILABLE', 'nimbus', details);
    this.name = 'ServiceUnavailableError';
  }
}

export class TimeoutError extends NimbusError {
  constructor(operation: string, service: string, timeoutMs: number) {
    super(`Operation ${operation} timed out after ${timeoutMs}ms`, 'TIMEOUT_ERROR', service, {
      operation,
      timeoutMs,
    });
    this.name = 'TimeoutError';
  }
}

export class ConfigurationError extends NimbusError {
  constructor(message: string, service: string, details?: unknown) {
    super(message, 'CONFIGURATION_ERROR', service, details);
    this.name = 'ConfigurationError';
  }
}
