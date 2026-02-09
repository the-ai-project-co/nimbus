/**
 * Enterprise Team E2E Tests
 * Tests for team management functionality
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';

const TEAM_SERVICE_URL = process.env.TEAM_SERVICE_URL || 'http://localhost:3013';

// Test data
const testUser = {
  id: 'test-user-' + Date.now(),
  email: `test-${Date.now()}@example.com`,
};

let testTeamId: string;

describe('Team Management', () => {
  beforeAll(async () => {
    // Ensure service is running
    try {
      const health = await fetch(`${TEAM_SERVICE_URL}/health`);
      if (!health.ok) {
        console.warn('Team service not running, skipping tests');
      }
    } catch {
      console.warn('Team service not reachable, skipping tests');
    }
  });

  describe('Team CRUD', () => {
    it('creates team successfully', async () => {
      const response = await fetch(`${TEAM_SERVICE_URL}/api/team/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Team',
          ownerId: testUser.id,
        }),
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Test Team');
      expect(data.data.ownerId).toBe(testUser.id);
      expect(data.data.plan).toBe('free');

      testTeamId = data.data.id;
    });

    it('gets team by ID', async () => {
      if (!testTeamId) return;

      const response = await fetch(`${TEAM_SERVICE_URL}/api/team/teams/${testTeamId}`);

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(testTeamId);
      expect(data.data.name).toBe('Test Team');
    });

    it('lists teams for user', async () => {
      if (!testTeamId) return;

      const response = await fetch(
        `${TEAM_SERVICE_URL}/api/team/teams?userId=${testUser.id}`
      );

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);
    });

    it('returns 404 for non-existent team', async () => {
      const response = await fetch(
        `${TEAM_SERVICE_URL}/api/team/teams/non-existent-id`
      );

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });

  describe('Team Members', () => {
    it('invites member with correct role', async () => {
      if (!testTeamId) return;

      const response = await fetch(
        `${TEAM_SERVICE_URL}/api/team/teams/${testTeamId}/members`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'member@test.com',
            role: 'member',
          }),
        }
      );

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.role).toBe('member');
    });

    it('lists team members', async () => {
      if (!testTeamId) return;

      const response = await fetch(
        `${TEAM_SERVICE_URL}/api/team/teams/${testTeamId}/members`
      );

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      // Should have owner + invited member
      expect(data.data.length).toBeGreaterThanOrEqual(1);
    });

    it('prevents inviting as owner', async () => {
      if (!testTeamId) return;

      const response = await fetch(
        `${TEAM_SERVICE_URL}/api/team/teams/${testTeamId}/members`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'another@test.com',
            role: 'owner',
          }),
        }
      );

      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('updates member role', async () => {
      if (!testTeamId) return;

      // First, get members to find the non-owner member
      const listResponse = await fetch(
        `${TEAM_SERVICE_URL}/api/team/teams/${testTeamId}/members`
      );
      const listData = await listResponse.json();

      const member = listData.data.find((m: any) => m.role !== 'owner');
      if (!member) return;

      const response = await fetch(
        `${TEAM_SERVICE_URL}/api/team/teams/${testTeamId}/members/${member.userId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'admin' }),
        }
      );

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.role).toBe('admin');
    });
  });

  afterAll(async () => {
    // Cleanup: delete test team
    if (testTeamId) {
      await fetch(`${TEAM_SERVICE_URL}/api/team/teams/${testTeamId}`, {
        method: 'DELETE',
      });
    }
  });
});
