import { describe, it, expect, afterEach } from 'bun:test';
import { SimpleRateLimiter, rateLimitMiddleware } from '../rate-limiter';

describe('SimpleRateLimiter', () => {
  const limiters: SimpleRateLimiter[] = [];

  /** Create a limiter and track it for cleanup */
  function createLimiter(requestsPerMinute: number, burstSize?: number): SimpleRateLimiter {
    const limiter = new SimpleRateLimiter({ requestsPerMinute, burstSize });
    limiters.push(limiter);
    return limiter;
  }

  afterEach(() => {
    for (const limiter of limiters) {
      limiter.destroy();
    }
    limiters.length = 0;
  });

  // ---------- tryAcquire ----------

  describe('tryAcquire', () => {
    it('allows requests within limit', () => {
      const limiter = createLimiter(60, 5);

      // Should allow up to burstSize requests
      for (let i = 0; i < 5; i++) {
        expect(limiter.tryAcquire('client-a')).toBe(true);
      }
    });

    it('blocks requests when limit exceeded', () => {
      const limiter = createLimiter(60, 3);

      // Exhaust the burst
      expect(limiter.tryAcquire('client-b')).toBe(true);
      expect(limiter.tryAcquire('client-b')).toBe(true);
      expect(limiter.tryAcquire('client-b')).toBe(true);

      // Next request should be blocked
      expect(limiter.tryAcquire('client-b')).toBe(false);
    });

    it('per-client isolation (different clients get separate buckets)', () => {
      const limiter = createLimiter(60, 2);

      // Exhaust client-x
      expect(limiter.tryAcquire('client-x')).toBe(true);
      expect(limiter.tryAcquire('client-x')).toBe(true);
      expect(limiter.tryAcquire('client-x')).toBe(false);

      // client-y should still have tokens
      expect(limiter.tryAcquire('client-y')).toBe(true);
      expect(limiter.tryAcquire('client-y')).toBe(true);
    });
  });

  // ---------- getRemainingRequests ----------

  describe('getRemainingRequests', () => {
    it('returns correct count after some requests', () => {
      const limiter = createLimiter(60, 10);

      // Before any requests, should return burst size
      expect(limiter.getRemainingRequests('fresh-client')).toBe(10);

      // Use some tokens
      limiter.tryAcquire('counter-client');
      limiter.tryAcquire('counter-client');
      limiter.tryAcquire('counter-client');

      const remaining = limiter.getRemainingRequests('counter-client');
      // Should be roughly burstSize - 3, allowing for small time-based refills
      expect(remaining).toBeLessThanOrEqual(10);
      expect(remaining).toBeGreaterThanOrEqual(6);
    });

    it('returns burst size for unknown client', () => {
      const limiter = createLimiter(60, 5);
      expect(limiter.getRemainingRequests('unknown')).toBe(5);
    });
  });

  // ---------- destroy ----------

  describe('destroy', () => {
    it('stops cleanup interval without errors', () => {
      const limiter = new SimpleRateLimiter({ requestsPerMinute: 60 });
      // Calling destroy should not throw
      expect(() => limiter.destroy()).not.toThrow();
      // Calling destroy again should be safe
      expect(() => limiter.destroy()).not.toThrow();
    });
  });
});

describe('rateLimitMiddleware', () => {
  it('returns null for /health endpoint', () => {
    const limiter = new SimpleRateLimiter({ requestsPerMinute: 60, burstSize: 5 });
    const middleware = rateLimitMiddleware(limiter);

    const req = new Request('http://localhost/health');
    expect(middleware(req)).toBeNull();

    limiter.destroy();
  });

  it('returns null for allowed requests', () => {
    const limiter = new SimpleRateLimiter({ requestsPerMinute: 60, burstSize: 5 });
    const middleware = rateLimitMiddleware(limiter);

    const req = new Request('http://localhost/api/data', {
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });
    expect(middleware(req)).toBeNull();

    limiter.destroy();
  });

  it('returns 429 when rate limited', () => {
    const limiter = new SimpleRateLimiter({ requestsPerMinute: 60, burstSize: 1 });
    const middleware = rateLimitMiddleware(limiter);

    const makeReq = () =>
      new Request('http://localhost/api/data', {
        headers: { 'x-forwarded-for': '10.0.0.99' },
      });

    // First request should pass
    expect(middleware(makeReq())).toBeNull();

    // Second request should be rate limited
    const response = middleware(makeReq());
    expect(response).not.toBeNull();
    expect(response!.status).toBe(429);
    expect(response!.headers.get('Retry-After')).toBeDefined();

    limiter.destroy();
  });

  it('rate limits per client IP independently', () => {
    const limiter = new SimpleRateLimiter({ requestsPerMinute: 60, burstSize: 1 });
    const middleware = rateLimitMiddleware(limiter);

    // Exhaust client-1
    const req1 = new Request('http://localhost/api/data', {
      headers: { 'x-forwarded-for': '192.168.1.1' },
    });
    expect(middleware(req1)).toBeNull();
    expect(middleware(new Request('http://localhost/api/data', {
      headers: { 'x-forwarded-for': '192.168.1.1' },
    }))).not.toBeNull();

    // client-2 should still pass
    const req2 = new Request('http://localhost/api/data', {
      headers: { 'x-forwarded-for': '192.168.1.2' },
    });
    expect(middleware(req2)).toBeNull();

    limiter.destroy();
  });
});
