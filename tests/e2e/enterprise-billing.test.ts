/**
 * Enterprise Billing E2E Tests
 * Tests for billing and usage tracking functionality
 */

import { describe, it, expect, beforeAll } from 'bun:test';

const BILLING_SERVICE_URL = process.env.BILLING_SERVICE_URL || 'http://localhost:3014';

const testTeamId = 'test-team-' + Date.now();

describe('Billing Service', () => {
  beforeAll(async () => {
    // Ensure service is running
    try {
      const health = await fetch(`${BILLING_SERVICE_URL}/health`);
      if (!health.ok) {
        console.warn('Billing service not running, skipping tests');
      }
    } catch {
      console.warn('Billing service not reachable, skipping tests');
    }
  });

  describe('Health Check', () => {
    it('returns healthy status', async () => {
      const response = await fetch(`${BILLING_SERVICE_URL}/health`);

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.status).toBe('healthy');
      expect(data.service).toBe('billing-service');
    });
  });

  describe('Billing Status', () => {
    it('returns free plan for new team', async () => {
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
      const response = await fetch(`${BILLING_SERVICE_URL}/api/billing/status`);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });

  describe('Subscription', () => {
    it('subscribes to pro plan', async () => {
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
