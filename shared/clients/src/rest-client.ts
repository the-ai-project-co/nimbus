import { logger, ServiceUnavailableError, TimeoutError } from '@nimbus/shared-utils';
import type { APIResponse } from '@nimbus/shared-types';

export interface RestClientOptions {
  timeout?: number;
  headers?: Record<string, string>;
  retries?: number;
}

/**
 * REST Client for inter-service communication
 */
export class RestClient {
  private baseUrl: string;
  private timeout: number;
  private headers: Record<string, string>;
  private retries: number;

  constructor(baseUrl: string, options: RestClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = options.timeout || 30000;
    this.headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    this.retries = options.retries || 0;
  }

  async get<T>(path: string): Promise<APIResponse<T>> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<APIResponse<T>> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body?: unknown): Promise<APIResponse<T>> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T>(path: string): Promise<APIResponse<T>> {
    return this.request<T>('DELETE', path);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    attempt: number = 0
  ): Promise<APIResponse<T>> {
    const url = `${this.baseUrl}${path}`;

    try {
      logger.debug(`${method} ${url}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: error || response.statusText,
            service: this.baseUrl,
            timestamp: new Date().toISOString(),
          },
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: data as T,
      };
    } catch (error: any) {
      // Handle abort (timeout)
      if (error.name === 'AbortError') {
        if (attempt < this.retries) {
          logger.warn(`Request timeout, retrying (${attempt + 1}/${this.retries})...`);
          return this.request<T>(method, path, body, attempt + 1);
        }
        throw new TimeoutError(
          `${method} ${path}`,
          this.baseUrl,
          this.timeout
        );
      }

      // Handle connection errors
      if (error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED') {
        throw new ServiceUnavailableError(this.baseUrl, {
          url,
          error: error.message,
        });
      }

      // Other errors
      return {
        success: false,
        error: {
          code: 'REQUEST_ERROR',
          message: error.message || 'Unknown error',
          service: this.baseUrl,
          timestamp: new Date().toISOString(),
          details: error,
        },
      };
    }
  }

  /**
   * Health check helper
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.get('/health');
      return response.success;
    } catch {
      return false;
    }
  }
}
