/**
 * Enterprise Billing E2E Tests
 * Tests for billing and usage tracking functionality
 *
 * NOTE: These tests require the billing-service to be running on port 3014.
 * They will be skipped automatically in CI if the service is not available.
 */

import { describe, it, expect, beforeAll } from 'bun:test';

const BILLING_SERVICE_URL = process.env.BILLING_SERVICE_URL || 'http://localhost:3014';

const testTeamId = 'test-team-' + Date.now();

// Check if service is available before running tests
async function isServiceAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${BILLING_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Store service availability
let serviceAvailable = false;

describe('Billing Service', () => {
  beforeAll(async () => {
    serviceAvailable = await isServiceAvailable();
    if (!serviceAvailable) {
      console.warn('Billing service not reachable at', BILLING_SERVICE_URL, '- skipping tests');
    }
  });

  describe('Health Check', () => {
    it('returns healthy status', async () => {
      if (!serviceAvailable) return;

      const response = await fetch(`${BILLING_SERVICE_URL}/health`);

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.status).toBe('healthy');
      expect(data.service).toBe('billing-service');
    });
  });

  describe('Billing Status', () => {
    it('returns free plan for new team', async () => {
      if (!serviceAvailable) return;

      const response = await fetch(
        `${BILLING_SERVICE_URL}/api/billing/status?teamId=${testTeamId}`
      );

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.plan).toBe('free');
      expect(data.data.status).toBe('active');
      expect(data.data.seats).toBeDefined();
      expect(data.data.seats.total).toBe(5);
    });

    it('requires teamId parameter', async () => {
      if (!serviceAvailable) return;

      const response = await fetch(`${BILLING_SERVICE_URL}/api/billing/status`);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });

  describe('Subscription', () => {
    it('subscribes to pro plan', async () => {
      if (!serviceAvailable) return;

      const response = await fetch(`${BILLING_SERVICE_URL}/api/billing/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: testTeamId,
          plan: 'pro',
        }),
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.plan).toBe('pro');
      expect(data.data.seats.total).toBe(25);
    });

    it('cancels subscription', async () => {
      if (!serviceAvailable) return;

      const response = await fetch(`${BILLING_SERVICE_URL}/api/billing/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: testTeamId }),
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.cancelAtPeriodEnd).toBe(true);
    });
  });

  describe('Usage Tracking', () => {
    it('records usage', async () => {
      if (!serviceAvailable) return;

      const response = await fetch(`${BILLING_SERVICE_URL}/api/billing/usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: testTeamId,
          operationType: 'chat',
          tokensUsed: 1000,
          costUsd: 0.01,
        }),
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('gets usage summary', async () => {
      if (!serviceAvailable) return;

      const response = await fetch(
        `${BILLING_SERVICE_URL}/api/billing/usage?teamId=${testTeamId}&period=month`
      );

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.period).toBeDefined();
      expect(data.data.totals).toBeDefined();
      expect(data.data.byOperationType).toBeDefined();
    });

    it('groups usage by operation type', async () => {
      if (!serviceAvailable) return;

      // Record another usage
      await fetch(`${BILLING_SERVICE_URL}/api/billing/usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: testTeamId,
          operationType: 'generate',
          tokensUsed: 2000,
          costUsd: 0.02,
        }),
      });

      const response = await fetch(
        `${BILLING_SERVICE_URL}/api/billing/usage?teamId=${testTeamId}`
      );

      const data = await response.json();
      expect(data.data.byOperationType.chat).toBeDefined();
      expect(data.data.byOperationType.generate).toBeDefined();
    });
  });

  describe('Invoices', () => {
    it('returns empty invoices for new team', async () => {
      if (!serviceAvailable) return;

      const response = await fetch(
        `${BILLING_SERVICE_URL}/api/billing/invoices?teamId=${testTeamId}`
      );

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });
  });
});
