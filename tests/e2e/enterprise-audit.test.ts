/**
 * Enterprise Audit E2E Tests
 * Tests for audit logging functionality
 */

import { describe, it, expect, beforeAll } from 'bun:test';

const AUDIT_SERVICE_URL = process.env.AUDIT_SERVICE_URL || 'http://localhost:3015';

const testTeamId = 'test-team-' + Date.now();
const testUserId = 'test-user-' + Date.now();

describe('Audit Service', () => {
  beforeAll(async () => {
    // Ensure service is running
    try {
      const health = await fetch(`${AUDIT_SERVICE_URL}/health`);
      if (!health.ok) {
        console.warn('Audit service not running, skipping tests');
      }
    } catch {
      console.warn('Audit service not reachable, skipping tests');
    }
  });

  describe('Health Check', () => {
    it('returns healthy status', async () => {
      const response = await fetch(`${AUDIT_SERVICE_URL}/health`);

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.status).toBe('healthy');
      expect(data.service).toBe('audit-service');
    });
  });

  describe('Audit Log Creation', () => {
    it('creates audit log entry', async () => {
      const response = await fetch(`${AUDIT_SERVICE_URL}/api/audit/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: testTeamId,
          userId: testUserId,
          action: 'login',
          status: 'success',
          details: { method: 'github' },
          ipAddress: '127.0.0.1',
        }),
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBeDefined();
      expect(data.data.action).toBe('login');
      expect(data.data.status).toBe('success');
    });

    it('creates log with resource info', async () => {
      const response = await fetch(`${AUDIT_SERVICE_URL}/api/audit/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: testTeamId,
          userId: testUserId,
          action: 'terraform_apply',
          resourceType: 'terraform',
          resourceId: 'main.tf',
          status: 'success',
        }),
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.data.resourceType).toBe('terraform');
      expect(data.data.resourceId).toBe('main.tf');
    });

    it('requires action and status', async () => {
      const response = await fetch(`${AUDIT_SERVICE_URL}/api/audit/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: testTeamId,
        }),
      });

      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });

  describe('Audit Log Querying', () => {
    beforeAll(async () => {
      // Create some logs for querying
      const actions = ['chat', 'generate', 'team_create'];
      for (const action of actions) {
        await fetch(`${AUDIT_SERVICE_URL}/api/audit/logs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teamId: testTeamId,
            userId: testUserId,
            action,
            status: 'success',
          }),
        });
      }
    });

    it('queries logs for team', async () => {
      const response = await fetch(
        `${AUDIT_SERVICE_URL}/api/audit/logs?teamId=${testTeamId}`
      );

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.logs.length).toBeGreaterThan(0);
      expect(data.data.total).toBeGreaterThan(0);
    });

    it('filters by action', async () => {
      const response = await fetch(
        `${AUDIT_SERVICE_URL}/api/audit/logs?teamId=${testTeamId}&action=chat`
      );

      const data = await response.json();
      expect(data.success).toBe(true);
      for (const log of data.data.logs) {
        expect(log.action).toBe('chat');
      }
    });

    it('limits results', async () => {
      const response = await fetch(
        `${AUDIT_SERVICE_URL}/api/audit/logs?teamId=${testTeamId}&limit=2`
      );

      const data = await response.json();
      expect(data.data.logs.length).toBeLessThanOrEqual(2);
      expect(data.data.limit).toBe(2);
    });

    it('paginates with offset', async () => {
      const page1 = await fetch(
        `${AUDIT_SERVICE_URL}/api/audit/logs?teamId=${testTeamId}&limit=2&offset=0`
      );
      const page2 = await fetch(
        `${AUDIT_SERVICE_URL}/api/audit/logs?teamId=${testTeamId}&limit=2&offset=2`
      );

      const data1 = await page1.json();
      const data2 = await page2.json();

      expect(data1.data.offset).toBe(0);
      expect(data2.data.offset).toBe(2);

      // Logs should be different (if there are enough)
      if (data1.data.logs.length > 0 && data2.data.logs.length > 0) {
        expect(data1.data.logs[0].id).not.toBe(data2.data.logs[0].id);
      }
    });
  });

  describe('Audit Log Export', () => {
    it('exports as JSON', async () => {
      const response = await fetch(
        `${AUDIT_SERVICE_URL}/api/audit/export?format=json&teamId=${testTeamId}`
      );

      expect(response.ok).toBe(true);
      expect(response.headers.get('Content-Type')).toContain('application/json');

      const text = await response.text();
      const data = JSON.parse(text);
      expect(data.logs).toBeDefined();
      expect(data.exportedAt).toBeDefined();
    });

    it('exports as CSV', async () => {
      const response = await fetch(
        `${AUDIT_SERVICE_URL}/api/audit/export?format=csv&teamId=${testTeamId}`
      );

      expect(response.ok).toBe(true);
      expect(response.headers.get('Content-Type')).toContain('text/csv');

      const text = await response.text();
      expect(text).toContain('id,timestamp');
    });

    it('sets Content-Disposition header', async () => {
      const response = await fetch(
        `${AUDIT_SERVICE_URL}/api/audit/export?format=json`
      );

      const disposition = response.headers.get('Content-Disposition');
      expect(disposition).toContain('attachment');
      expect(disposition).toContain('audit-logs');
    });
  });
});
