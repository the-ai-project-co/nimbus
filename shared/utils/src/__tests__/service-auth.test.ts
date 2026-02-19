import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  validateServiceToken,
  serviceAuthMiddleware,
  getServiceAuthHeaders,
} from '../service-auth';

describe('service-auth', () => {
  let originalToken: string | undefined;

  beforeEach(() => {
    originalToken = process.env.INTERNAL_SERVICE_TOKEN;
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.INTERNAL_SERVICE_TOKEN;
    } else {
      process.env.INTERNAL_SERVICE_TOKEN = originalToken;
    }
  });

  // ---------- validateServiceToken ----------

  describe('validateServiceToken', () => {
    it('returns true when no env var is set (no-op mode)', () => {
      delete process.env.INTERNAL_SERVICE_TOKEN;
      const req = new Request('http://localhost/api/test');
      expect(validateServiceToken(req)).toBe(true);
    });

    it('returns true when token matches', () => {
      process.env.INTERNAL_SERVICE_TOKEN = 'secret-123';
      const req = new Request('http://localhost/api/test', {
        headers: { 'x-internal-service-token': 'secret-123' },
      });
      expect(validateServiceToken(req)).toBe(true);
    });

    it('returns false when token mismatches', () => {
      process.env.INTERNAL_SERVICE_TOKEN = 'secret-123';
      const req = new Request('http://localhost/api/test', {
        headers: { 'x-internal-service-token': 'wrong-token' },
      });
      expect(validateServiceToken(req)).toBe(false);
    });

    it('returns false when token header is missing', () => {
      process.env.INTERNAL_SERVICE_TOKEN = 'secret-123';
      const req = new Request('http://localhost/api/test');
      expect(validateServiceToken(req)).toBe(false);
    });
  });

  // ---------- serviceAuthMiddleware ----------

  describe('serviceAuthMiddleware', () => {
    it('returns null (pass) when no token configured', () => {
      delete process.env.INTERNAL_SERVICE_TOKEN;
      const req = new Request('http://localhost/api/secret');
      expect(serviceAuthMiddleware(req)).toBeNull();
    });

    it('returns null for /health path', () => {
      process.env.INTERNAL_SERVICE_TOKEN = 'secret-123';
      const req = new Request('http://localhost/health');
      expect(serviceAuthMiddleware(req)).toBeNull();
    });

    it('returns null for /swagger path', () => {
      process.env.INTERNAL_SERVICE_TOKEN = 'secret-123';
      const req = new Request('http://localhost/swagger/index.html');
      expect(serviceAuthMiddleware(req)).toBeNull();
    });

    it('returns null for /api/openapi.json path', () => {
      process.env.INTERNAL_SERVICE_TOKEN = 'secret-123';
      const req = new Request('http://localhost/api/openapi.json');
      expect(serviceAuthMiddleware(req)).toBeNull();
    });

    it('returns 401 for /api/ routes with wrong token', () => {
      process.env.INTERNAL_SERVICE_TOKEN = 'secret-123';
      const req = new Request('http://localhost/api/data', {
        headers: { 'x-internal-service-token': 'bad-token' },
      });
      const response = serviceAuthMiddleware(req);
      expect(response).not.toBeNull();
      expect(response!.status).toBe(401);
    });

    it('returns 401 for /api/ routes with missing token', () => {
      process.env.INTERNAL_SERVICE_TOKEN = 'secret-123';
      const req = new Request('http://localhost/api/data');
      const response = serviceAuthMiddleware(req);
      expect(response).not.toBeNull();
      expect(response!.status).toBe(401);
    });

    it('returns null for /api/ routes with correct token', () => {
      process.env.INTERNAL_SERVICE_TOKEN = 'secret-123';
      const req = new Request('http://localhost/api/data', {
        headers: { 'x-internal-service-token': 'secret-123' },
      });
      expect(serviceAuthMiddleware(req)).toBeNull();
    });

    it('returns null for non-/api/ routes even with wrong token', () => {
      process.env.INTERNAL_SERVICE_TOKEN = 'secret-123';
      const req = new Request('http://localhost/other/path', {
        headers: { 'x-internal-service-token': 'wrong' },
      });
      expect(serviceAuthMiddleware(req)).toBeNull();
    });
  });

  // ---------- getServiceAuthHeaders ----------

  describe('getServiceAuthHeaders', () => {
    it('returns empty object when no env var set', () => {
      delete process.env.INTERNAL_SERVICE_TOKEN;
      const headers = getServiceAuthHeaders();
      expect(Object.keys(headers).length).toBe(0);
    });

    it('returns header when env var is set', () => {
      process.env.INTERNAL_SERVICE_TOKEN = 'my-token';
      const headers = getServiceAuthHeaders();
      expect(headers['x-internal-service-token']).toBe('my-token');
    });
  });
});
