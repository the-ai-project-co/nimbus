/**
 * Per-Service Rate Limiting
 *
 * Sliding window token bucket rate limiter per client IP.
 * Returns 429 with Retry-After header when limit exceeded.
 */

import { logger } from './logger';

interface RateLimiterOptions {
  requestsPerMinute: number;
  burstSize?: number;
}

interface ClientBucket {
  tokens: number;
  lastRefill: number;
}

export class SimpleRateLimiter {
  private requestsPerMinute: number;
  private burstSize: number;
  private buckets: Map<string, ClientBucket>;
  private cleanupInterval: ReturnType<typeof setInterval> | null;

  constructor(options: RateLimiterOptions) {
    this.requestsPerMinute = options.requestsPerMinute;
    this.burstSize = options.burstSize || options.requestsPerMinute;
    this.buckets = new Map();

    // Auto-clean stale entries every 60s
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
    // Allow GC to collect the interval if the limiter is abandoned
    if (this.cleanupInterval && typeof this.cleanupInterval === 'object' && 'unref' in this.cleanupInterval) {
      (this.cleanupInterval as any).unref();
    }
  }

  /**
   * Try to acquire a token for the given client.
   * Returns true if the request is allowed, false if rate limited.
   */
  tryAcquire(clientId: string = 'default'): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(clientId);

    if (!bucket) {
      bucket = { tokens: this.burstSize, lastRefill: now };
      this.buckets.set(clientId, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const refill = (elapsed / 60_000) * this.requestsPerMinute;
    bucket.tokens = Math.min(this.burstSize, bucket.tokens + refill);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Get remaining requests for a client
   */
  getRemainingRequests(clientId: string = 'default'): number {
    const bucket = this.buckets.get(clientId);
    if (!bucket) return this.burstSize;

    // Refill based on elapsed time
    const elapsed = Date.now() - bucket.lastRefill;
    const refill = (elapsed / 60_000) * this.requestsPerMinute;
    return Math.min(this.burstSize, Math.floor(bucket.tokens + refill));
  }

  /**
   * Clean up stale entries (no activity for 2+ minutes)
   */
  private cleanup(): void {
    const cutoff = Date.now() - 120_000;
    for (const [clientId, bucket] of this.buckets) {
      if (bucket.lastRefill < cutoff) {
        this.buckets.delete(clientId);
      }
    }
  }

  /**
   * Stop the cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/**
 * Extract client IP from request
 */
function getClientIp(req: Request): string {
  // Check common proxy headers
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();

  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;

  return 'unknown';
}

/**
 * Rate limit middleware factory.
 * Returns null to continue, or a 429 Response to block.
 */
export function rateLimitMiddleware(limiter: SimpleRateLimiter): (req: Request) => Response | null {
  return (req: Request): Response | null => {
    const url = new URL(req.url);

    // Skip health endpoints
    if (url.pathname === '/health') {
      return null;
    }

    const clientIp = getClientIp(req);
    if (!limiter.tryAcquire(clientIp)) {
      logger.warn(`Rate limited client ${clientIp} on ${url.pathname}`);
      const retryAfter = Math.ceil(60 / limiter.getRemainingRequests(clientIp) || 60);
      return new Response(
        JSON.stringify({ success: false, error: 'Too Many Requests' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
          },
        },
      );
    }

    return null;
  };
}
