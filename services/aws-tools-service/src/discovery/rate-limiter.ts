/**
 * Rate Limiter with Exponential Backoff
 *
 * Handles API rate limiting and throttling for AWS API calls
 * to prevent hitting service limits during infrastructure discovery
 */

import { logger } from '@nimbus/shared-utils';

export interface RateLimiterConfig {
  /** Maximum concurrent requests */
  maxConcurrent: number;
  /** Requests per second limit */
  requestsPerSecond: number;
  /** Initial delay for exponential backoff (ms) */
  initialBackoffMs?: number;
  /** Maximum delay for exponential backoff (ms) */
  maxBackoffMs?: number;
  /** Maximum number of retries */
  maxRetries?: number;
  /** Jitter factor (0-1) to add randomness to backoff */
  jitterFactor?: number;
}

export interface BackoffOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  jitterFactor?: number;
}

interface QueuedRequest {
  resolve: () => void;
  timestamp: number;
}

/**
 * Throttling errors that should trigger retry with backoff
 */
const THROTTLING_ERROR_NAMES = [
  'ThrottlingException',
  'Throttling',
  'TooManyRequestsException',
  'RequestLimitExceeded',
  'ProvisionedThroughputExceededException',
  'RequestThrottled',
  'SlowDown',
  'BandwidthLimitExceeded',
];

const THROTTLING_ERROR_CODES = [
  'Throttling',
  'ThrottlingException',
  'RequestLimitExceeded',
  'TooManyRequests',
  'SlowDown',
];

/**
 * Rate limiter for AWS API calls with exponential backoff
 */
export class RateLimiter {
  private maxConcurrent: number;
  private requestsPerSecond: number;
  private initialBackoffMs: number;
  private maxBackoffMs: number;
  private maxRetries: number;
  private jitterFactor: number;

  private currentConcurrent: number = 0;
  private requestTimestamps: number[] = [];
  private queue: QueuedRequest[] = [];
  private totalRequests: number = 0;
  private throttledRequests: number = 0;

  constructor(config: RateLimiterConfig) {
    this.maxConcurrent = config.maxConcurrent;
    this.requestsPerSecond = config.requestsPerSecond;
    this.initialBackoffMs = config.initialBackoffMs ?? 1000;
    this.maxBackoffMs = config.maxBackoffMs ?? 30000;
    this.maxRetries = config.maxRetries ?? 5;
    this.jitterFactor = config.jitterFactor ?? 0.2;
  }

  /**
   * Acquire a slot to make a request
   * Will wait if rate limits are exceeded
   */
  async acquire(): Promise<void> {
    this.totalRequests++;

    // Wait if we've hit concurrent limit
    while (this.currentConcurrent >= this.maxConcurrent) {
      await this.waitForSlot();
    }

    // Wait if we've hit rate limit
    await this.waitForRateLimit();

    this.currentConcurrent++;
    this.requestTimestamps.push(Date.now());
  }

  /**
   * Release a slot after completing a request
   */
  release(): void {
    this.currentConcurrent = Math.max(0, this.currentConcurrent - 1);
    this.processQueue();
  }

  /**
   * Wait for a concurrent slot to become available
   */
  private async waitForSlot(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push({ resolve, timestamp: Date.now() });
    });
  }

  /**
   * Process the waiting queue
   */
  private processQueue(): void {
    if (this.queue.length > 0 && this.currentConcurrent < this.maxConcurrent) {
      const next = this.queue.shift();
      if (next) {
        next.resolve();
      }
    }
  }

  /**
   * Wait to respect the rate limit
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const oneSecondAgo = now - 1000;

    // Clean up old timestamps
    this.requestTimestamps = this.requestTimestamps.filter(t => t > oneSecondAgo);

    // Check if we're at the rate limit
    if (this.requestTimestamps.length >= this.requestsPerSecond) {
      const oldestTimestamp = this.requestTimestamps[0];
      const waitTime = oldestTimestamp + 1000 - now;

      if (waitTime > 0) {
        await this.delay(waitTime);
      }
    }
  }

  /**
   * Execute an operation with automatic retry and exponential backoff
   */
  async withBackoff<T>(
    operation: () => Promise<T>,
    options?: BackoffOptions
  ): Promise<T> {
    const maxRetries = options?.maxRetries ?? this.maxRetries;
    const initialDelay = options?.initialDelayMs ?? this.initialBackoffMs;
    const maxDelay = options?.maxDelayMs ?? this.maxBackoffMs;
    const jitter = options?.jitterFactor ?? this.jitterFactor;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.acquire();

        try {
          const result = await operation();
          return result;
        } finally {
          this.release();
        }
      } catch (error: any) {
        lastError = error;

        if (!this.isThrottlingError(error)) {
          throw error;
        }

        this.throttledRequests++;

        if (attempt === maxRetries) {
          logger.warn('Max retries exceeded', {
            attempts: attempt + 1,
            error: error.message,
          });
          throw error;
        }

        const delayMs = this.calculateBackoffDelay(attempt, initialDelay, maxDelay, jitter);

        logger.debug('Throttled, retrying with backoff', {
          attempt: attempt + 1,
          delayMs,
          error: error.message,
        });

        await this.delay(delayMs);
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }

  /**
   * Execute multiple operations with rate limiting
   */
  async withBatch<T, R>(
    items: T[],
    operation: (item: T) => Promise<R>,
    options?: { onProgress?: (completed: number, total: number) => void }
  ): Promise<{ results: R[]; errors: Array<{ item: T; error: Error }> }> {
    const results: R[] = [];
    const errors: Array<{ item: T; error: Error }> = [];
    let completed = 0;

    const promises = items.map(async (item, index) => {
      try {
        const result = await this.withBackoff(() => operation(item));
        results[index] = result;
      } catch (error: any) {
        errors.push({ item, error });
      } finally {
        completed++;
        options?.onProgress?.(completed, items.length);
      }
    });

    await Promise.all(promises);

    return { results: results.filter(r => r !== undefined), errors };
  }

  /**
   * Check if an error is a throttling error
   */
  isThrottlingError(error: any): boolean {
    if (!error) return false;

    // Check error name
    if (THROTTLING_ERROR_NAMES.includes(error.name)) {
      return true;
    }

    // Check error code
    if (error.code && THROTTLING_ERROR_CODES.includes(error.code)) {
      return true;
    }

    // Check $metadata (AWS SDK v3)
    if (error.$metadata?.httpStatusCode === 429) {
      return true;
    }

    // Check error message
    const message = error.message?.toLowerCase() || '';
    if (
      message.includes('throttl') ||
      message.includes('rate exceeded') ||
      message.includes('too many requests') ||
      message.includes('slow down')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Calculate backoff delay with exponential growth and jitter
   */
  private calculateBackoffDelay(
    attempt: number,
    initialDelay: number,
    maxDelay: number,
    jitterFactor: number
  ): number {
    // Exponential backoff: initialDelay * 2^attempt
    const exponentialDelay = initialDelay * Math.pow(2, attempt);

    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, maxDelay);

    // Add jitter
    const jitterRange = cappedDelay * jitterFactor;
    const jitter = (Math.random() - 0.5) * 2 * jitterRange;

    return Math.max(0, Math.round(cappedDelay + jitter));
  }

  /**
   * Helper to create a delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current statistics
   */
  getStats(): {
    totalRequests: number;
    throttledRequests: number;
    currentConcurrent: number;
    queueLength: number;
    throttleRate: number;
  } {
    return {
      totalRequests: this.totalRequests,
      throttledRequests: this.throttledRequests,
      currentConcurrent: this.currentConcurrent,
      queueLength: this.queue.length,
      throttleRate: this.totalRequests > 0
        ? this.throttledRequests / this.totalRequests
        : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.totalRequests = 0;
    this.throttledRequests = 0;
  }

  /**
   * Update rate limiter configuration
   */
  updateConfig(config: Partial<RateLimiterConfig>): void {
    if (config.maxConcurrent !== undefined) {
      this.maxConcurrent = config.maxConcurrent;
    }
    if (config.requestsPerSecond !== undefined) {
      this.requestsPerSecond = config.requestsPerSecond;
    }
    if (config.initialBackoffMs !== undefined) {
      this.initialBackoffMs = config.initialBackoffMs;
    }
    if (config.maxBackoffMs !== undefined) {
      this.maxBackoffMs = config.maxBackoffMs;
    }
    if (config.maxRetries !== undefined) {
      this.maxRetries = config.maxRetries;
    }
    if (config.jitterFactor !== undefined) {
      this.jitterFactor = config.jitterFactor;
    }
  }
}

/**
 * Create a rate limiter with default configuration for AWS discovery
 */
export function createDiscoveryRateLimiter(): RateLimiter {
  return new RateLimiter({
    maxConcurrent: 10,      // 10 concurrent requests
    requestsPerSecond: 20,  // 20 requests per second
    initialBackoffMs: 1000, // Start with 1 second
    maxBackoffMs: 30000,    // Max 30 seconds
    maxRetries: 5,          // Retry up to 5 times
    jitterFactor: 0.2,      // 20% jitter
  });
}

/**
 * Create a rate limiter with conservative configuration (for large accounts)
 */
export function createConservativeRateLimiter(): RateLimiter {
  return new RateLimiter({
    maxConcurrent: 5,       // 5 concurrent requests
    requestsPerSecond: 10,  // 10 requests per second
    initialBackoffMs: 2000, // Start with 2 seconds
    maxBackoffMs: 60000,    // Max 60 seconds
    maxRetries: 7,          // Retry up to 7 times
    jitterFactor: 0.3,      // 30% jitter
  });
}
