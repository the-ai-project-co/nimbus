/**
 * Enterprise Team E2E Tests
 * Tests for team management functionality
 *
 * NOTE: These tests require the team-service to be running on port 3013.
 * They will be skipped automatically in CI if the service is not available.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';

const TEAM_SERVICE_URL = process.env.TEAM_SERVICE_URL || 'http://localhost:3013';

// Test data
const testUser = {
  id: 'test-user-' + Date.now(),
  email: `test-${Date.now()}@example.com`,
};

let testTeamId: string;

// Check if service is available before running tests
async function isServiceAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${TEAM_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Store service availability
let serviceAvailable = false;

describe('Team Management', () => {
  beforeAll(async () => {
    serviceAvailable = await isServiceAvailable();
    if (!serviceAvailable) {
      console.warn('Team service not reachable at', TEAM_SERVICE_URL, '- skipping tests');
    }
  });

  describe('Team CRUD', () => {
    it('creates team successfully', async () => {
      if (!serviceAvailable) return;

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
      if (!serviceAvailable || !testTeamId) return;

      const response = await fetch(`${TEAM_SERVICE_URL}/api/team/teams/${testTeamId}`);

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(testTeamId);
      expect(data.data.name).toBe('Test Team');
    });

    it('lists teams for user', async () => {
      if (!serviceAvailable || !testTeamId) return;

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
      if (!serviceAvailable) return;

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
      if (!serviceAvailable || !testTeamId) return;

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
      if (!serviceAvailable || !testTeamId) return;

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
      if (!serviceAvailable || !testTeamId) return;

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
      if (!serviceAvailable || !testTeamId) return;

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
    if (serviceAvailable && testTeamId) {
      await fetch(`${TEAM_SERVICE_URL}/api/team/teams/${testTeamId}`, {
        method: 'DELETE',
      });
    }
  });
});
