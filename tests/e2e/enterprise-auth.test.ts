/**
 * Enterprise Auth E2E Tests
 * Tests for SSO device code flow authentication
 */

import { describe, it, expect, beforeAll } from 'bun:test';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3012';

describe('Auth Service', () => {
  beforeAll(async () => {
    // Ensure service is running
    try {
      const health = await fetch(`${AUTH_SERVICE_URL}/health`);
      if (!health.ok) {
        console.warn('Auth service not running, skipping tests');
      }
    } catch {
      console.warn('Auth service not reachable, skipping tests');
    }
  });

  describe('Health Check', () => {
    it('returns healthy status', async () => {
      const response = await fetch(`${AUTH_SERVICE_URL}/health`);

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.status).toBe('healthy');
      expect(data.service).toBe('auth-service');
    });
  });

  describe('Device Code Flow', () => {
    let deviceCode: string;
    let userCode: string;

    it('initiates device flow', async () => {
      const response = await fetch(`${AUTH_SERVICE_URL}/api/auth/device/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.deviceCode).toBeDefined();
      expect(data.data.userCode).toBeDefined();
      expect(data.data.verificationUri).toBeDefined();
      expect(data.data.expiresIn).toBeGreaterThan(0);
      expect(data.data.interval).toBeGreaterThan(0);

      deviceCode = data.data.deviceCode;
      userCode = data.data.userCode;

      // User code should be in format XXXX-XXXX
      expect(userCode).toMatch(/^[A-Z]{4}-[0-9]{4}$/);
    });

    it('returns authorization_pending when polling before verification', async () => {
      if (!deviceCode) return;

      const response = await fetch(
        `${AUTH_SERVICE_URL}/api/auth/device/poll/${deviceCode}`
      );

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.error).toBe('authorization_pending');
    });

    it('verifies device code', async () => {
      if (!userCode) return;

      const response = await fetch(`${AUTH_SERVICE_URL}/api/auth/device/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userCode,
          userId: 'test-user-123',
        }),
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.verified).toBe(true);
    });

    it('returns access token after verification', async () => {
      if (!deviceCode) return;

      const response = await fetch(
        `${AUTH_SERVICE_URL}/api/auth/device/poll/${deviceCode}`
      );

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.accessToken).toBeDefined();
    });

    it('returns expired error for non-existent code', async () => {
      const response = await fetch(
        `${AUTH_SERVICE_URL}/api/auth/device/poll/non-existent-code`
      );

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.error).toBe('expired_token');
    });
  });

  describe('Token Validation', () => {
    it('returns invalid for non-existent token', async () => {
      const response = await fetch(`${AUTH_SERVICE_URL}/api/auth/token/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: 'invalid-token' }),
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.valid).toBe(false);
    });
  });
});
