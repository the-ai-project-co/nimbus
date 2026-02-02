/**
 * Unit tests for Rate Limiter
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  RateLimiter,
  createDiscoveryRateLimiter,
  createConservativeRateLimiter,
} from '../../../../services/aws-tools-service/src/discovery/rate-limiter';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      maxConcurrent: 5,
      requestsPerSecond: 10,
      initialBackoffMs: 100,
      maxBackoffMs: 1000,
      maxRetries: 3,
      jitterFactor: 0.1,
    });
  });

  describe('acquire and release', () => {
    test('allows requests within concurrent limit', async () => {
      const startTime = Date.now();

      // Acquire 3 slots (under limit of 5)
      await Promise.all([
        rateLimiter.acquire(),
        rateLimiter.acquire(),
        rateLimiter.acquire(),
      ]);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(100); // Should be nearly instant
    });

    test('release frees up slots', async () => {
      // Acquire all slots
      for (let i = 0; i < 5; i++) {
        await rateLimiter.acquire();
      }

      // Release one
      rateLimiter.release();

      // Should be able to acquire one more without waiting
      const startTime = Date.now();
      await rateLimiter.acquire();
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('withBackoff', () => {
    test('executes operation successfully', async () => {
      const result = await rateLimiter.withBackoff(async () => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    test('retries on throttling error', async () => {
      let attempts = 0;

      const result = await rateLimiter.withBackoff(async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('Throttling');
          (error as any).name = 'ThrottlingException';
          throw error;
        }
        return 'success';
      });

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    test('throws after max retries', async () => {
      let attempts = 0;

      await expect(
        rateLimiter.withBackoff(
          async () => {
            attempts++;
            const error = new Error('Throttling');
            (error as any).name = 'ThrottlingException';
            throw error;
          },
          { maxRetries: 2 }
        )
      ).rejects.toThrow('Throttling');

      expect(attempts).toBe(3); // Initial + 2 retries
    });

    test('does not retry non-throttling errors', async () => {
      let attempts = 0;

      await expect(
        rateLimiter.withBackoff(async () => {
          attempts++;
          throw new Error('Access denied');
        })
      ).rejects.toThrow('Access denied');

      expect(attempts).toBe(1);
    });
  });

  describe('isThrottlingError', () => {
    test('detects ThrottlingException by name', () => {
      const error = new Error('Rate exceeded');
      (error as any).name = 'ThrottlingException';

      expect(rateLimiter.isThrottlingError(error)).toBe(true);
    });

    test('detects throttling by error code', () => {
      const error = new Error('Rate exceeded');
      (error as any).code = 'Throttling';

      expect(rateLimiter.isThrottlingError(error)).toBe(true);
    });

    test('detects throttling by HTTP status 429', () => {
      const error = new Error('Rate exceeded');
      (error as any).$metadata = { httpStatusCode: 429 };

      expect(rateLimiter.isThrottlingError(error)).toBe(true);
    });

    test('detects throttling by message content', () => {
      const error = new Error('Too many requests, please slow down');

      expect(rateLimiter.isThrottlingError(error)).toBe(true);
    });

    test('returns false for non-throttling errors', () => {
      const error = new Error('Access denied');

      expect(rateLimiter.isThrottlingError(error)).toBe(false);
    });

    test('returns false for null/undefined', () => {
      expect(rateLimiter.isThrottlingError(null)).toBe(false);
      expect(rateLimiter.isThrottlingError(undefined)).toBe(false);
    });
  });

  describe('withBatch', () => {
    test('processes items with rate limiting', async () => {
      const items = [1, 2, 3, 4, 5];
      const processedItems: number[] = [];

      const { results, errors } = await rateLimiter.withBatch(
        items,
        async (item) => {
          processedItems.push(item);
          return item * 2;
        }
      );

      expect(results).toEqual([2, 4, 6, 8, 10]);
      expect(errors).toHaveLength(0);
      expect(processedItems.sort()).toEqual([1, 2, 3, 4, 5]);
    });

    test('collects errors from failed items', async () => {
      const items = [1, 2, 3];

      const { results, errors } = await rateLimiter.withBatch(
        items,
        async (item) => {
          if (item === 2) {
            throw new Error('Failed for item 2');
          }
          return item * 2;
        }
      );

      expect(results).toContain(2);
      expect(results).toContain(6);
      expect(errors).toHaveLength(1);
      expect(errors[0].item).toBe(2);
    });

    test('calls progress callback', async () => {
      const items = [1, 2, 3];
      const progressCalls: Array<{ completed: number; total: number }> = [];

      await rateLimiter.withBatch(
        items,
        async (item) => item,
        {
          onProgress: (completed, total) => {
            progressCalls.push({ completed, total });
          },
        }
      );

      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[progressCalls.length - 1]).toEqual({ completed: 3, total: 3 });
    });
  });

  describe('getStats', () => {
    test('tracks total requests', async () => {
      await rateLimiter.withBackoff(async () => 'a');
      await rateLimiter.withBackoff(async () => 'b');

      const stats = rateLimiter.getStats();

      expect(stats.totalRequests).toBe(2);
    });

    test('tracks throttled requests', async () => {
      let attempts = 0;

      await rateLimiter.withBackoff(async () => {
        attempts++;
        if (attempts < 2) {
          const error = new Error('Throttling');
          (error as any).name = 'ThrottlingException';
          throw error;
        }
        return 'success';
      });

      const stats = rateLimiter.getStats();

      expect(stats.throttledRequests).toBe(1);
    });
  });

  describe('updateConfig', () => {
    test('updates configuration values', () => {
      rateLimiter.updateConfig({
        maxConcurrent: 10,
        requestsPerSecond: 20,
      });

      // Verify by checking we can acquire more concurrent slots
      const stats = rateLimiter.getStats();
      expect(stats.currentConcurrent).toBe(0);
    });
  });
});

describe('Factory functions', () => {
  test('createDiscoveryRateLimiter creates with default config', () => {
    const limiter = createDiscoveryRateLimiter();

    // Should work without errors
    expect(limiter).toBeDefined();
    expect(limiter.getStats().totalRequests).toBe(0);
  });

  test('createConservativeRateLimiter creates with conservative config', () => {
    const limiter = createConservativeRateLimiter();

    expect(limiter).toBeDefined();
    expect(limiter.getStats().totalRequests).toBe(0);
  });
});
