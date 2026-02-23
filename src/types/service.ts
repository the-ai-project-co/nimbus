/**
 * Service Configuration
 */
export interface ServiceConfig {
  port: number;
  wsPort?: number;
  logLevel: LogLevel;
  environment: 'development' | 'staging' | 'production';
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Service Health Response
 */
export interface HealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  service: string;
  timestamp: string;
  uptime?: number;
  version?: string;
  dependencies?: ServiceDependencyHealth[];
}

export interface ServiceDependencyHealth {
  name: string;
  status: 'healthy' | 'unhealthy';
  responseTime?: number;
}

/**
 * Service Error
 */
export interface ServiceError {
  code: string;
  message: string;
  service: string;
  timestamp: string;
  details?: unknown;
  stack?: string;
}

/**
 * API Response Wrapper
 */
export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ServiceError;
  metadata?: Record<string, unknown>;
}
