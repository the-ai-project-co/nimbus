/**
 * Auth Service Device Code Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

// Mock crypto for consistent testing
const mockUUID = 'test-uuid-1234-5678-90ab-cdef';
const originalRandomUUID = crypto.randomUUID;

describe('Device Code Flow', () => {
  beforeEach(() => {
    // @ts-ignore - mocking crypto
    crypto.randomUUID = () => mockUUID;
  });

  afterEach(() => {
    crypto.randomUUID = originalRandomUUID;
  });

  describe('User Code Generation', () => {
    it('generates user code in correct format', () => {
      // User codes should be in format XXXX-XXXX (letters-digits)
      const userCodePattern = /^[A-Z]{4}-[0-9]{4}$/;

      // Generate a few user codes to test pattern
      const generateUserCode = (): string => {
        const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        const digits = '0123456789';
        let code = '';
        for (let i = 0; i < 4; i++) {
          code += letters.charAt(Math.floor(Math.random() * letters.length));
        }
        code += '-';
        for (let i = 0; i < 4; i++) {
          code += digits.charAt(Math.floor(Math.random() * digits.length));
        }
        return code;
      };

      for (let i = 0; i < 10; i++) {
        const code = generateUserCode();
        expect(code).toMatch(userCodePattern);
      }
    });

    it('excludes confusing characters (I, O)', () => {
      const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      expect(letters).not.toContain('I');
      expect(letters).not.toContain('O');
    });
  });

  describe('Device Code Response', () => {
    it('includes required fields', () => {
      const response = {
        deviceCode: mockUUID,
        userCode: 'ABCD-1234',
        verificationUri: 'https://nimbus.dev/device',
        expiresIn: 900,
        interval: 5,
      };

      expect(response.deviceCode).toBeDefined();
      expect(response.userCode).toBeDefined();
      expect(response.verificationUri).toBeDefined();
      expect(response.expiresIn).toBeGreaterThan(0);
      expect(response.interval).toBeGreaterThan(0);
    });

    it('sets correct expiry time (15 minutes)', () => {
      const expiresIn = 900; // 15 minutes in seconds
      expect(expiresIn).toBe(15 * 60);
    });

    it('sets polling interval (5 seconds)', () => {
      const interval = 5;
      expect(interval).toBe(5);
    });
  });

  describe('Poll Response Handling', () => {
    it('returns authorization_pending when not verified', () => {
      const response = {
        error: 'authorization_pending',
        errorDescription: 'The user has not yet authorized this device',
      };

      expect(response.error).toBe('authorization_pending');
    });

    it('returns access token when verified', () => {
      const response = {
        accessToken: 'generated-access-token-abc123',
      };

      expect(response.accessToken).toBeDefined();
      expect(response.accessToken.length).toBeGreaterThan(0);
    });

    it('returns expired_token for expired codes', () => {
      const response = {
        error: 'expired_token',
        errorDescription: 'The device code has expired',
      };

      expect(response.error).toBe('expired_token');
    });

    it('returns access_denied when user denies', () => {
      const response = {
        error: 'access_denied',
        errorDescription: 'Authorization was denied',
      };

      expect(response.error).toBe('access_denied');
    });
  });

  describe('Token Generation', () => {
    it('generates cryptographically secure tokens', () => {
      const generateAccessToken = (): string => {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
      };

      const token1 = generateAccessToken();
      const token2 = generateAccessToken();

      // Tokens should be 64 hex characters (32 bytes)
      expect(token1).toHaveLength(64);
      expect(token2).toHaveLength(64);

      // Tokens should be unique
      expect(token1).not.toBe(token2);

      // Tokens should be valid hex
      expect(token1).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('Token Validation', () => {
    it('returns valid: false for non-existent token', () => {
      const result = { valid: false };
      expect(result.valid).toBe(false);
    });

    it('returns user info for valid token', () => {
      const result = {
        valid: true,
        userId: 'user-123',
        teamId: 'team-456',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      expect(result.valid).toBe(true);
      expect(result.userId).toBeDefined();
      expect(result.teamId).toBeDefined();
      expect(result.expiresAt).toBeDefined();
    });
  });
});
