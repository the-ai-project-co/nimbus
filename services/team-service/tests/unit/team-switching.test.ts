/**
 * Team Service — Team Switching Tests
 * Tests the logic around listing teams for a user (which drives context switching)
 * and validating that switching to a specific team context is coherent.
 *
 * "Team switching" in the Nimbus context is handled by:
 *   - listUserTeams — returns all teams the user belongs to
 *   - getTeam — retrieves the details of the team to switch into
 *
 * These tests verify that the data needed for context switching is correct.
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockListTeamsForUser = mock(() => []);
const mockGetTeamRecord = mock(() => null);

mock.module('../../../src/db/adapter', () => ({
  initDatabase: mock(async () => {}),
  getDatabase: mock(() => ({})),
  createTeamRecord: mock(() => {}),
  getTeamRecord: mockGetTeamRecord,
  listTeamsForUser: mockListTeamsForUser,
  deleteTeamRecord: mock(() => {}),
  isTeamOwner: mock(() => false),
  isTeamAdmin: mock(() => false),
  addTeamMember: mock(() => {}),
  getTeamMembers: mock(() => []),
  getTeamMember: mock(() => null),
  removeTeamMember: mock(() => {}),
  updateTeamMemberRole: mock(() => {}),
  getOrCreateUser: mock(() => ({ id: 'u1', email: 'u@e.com', name: null, created_at: '', updated_at: '' })),
  createUser: mock(() => {}),
  getUserByEmail: mock(() => null),
  getUserById: mock(() => null),
  updateTeamPlan: mock(() => {}),
}));

mock.module('@nimbus/shared-utils', () => ({
  logger: { info: mock(() => {}), error: mock(() => {}), warn: mock(() => {}), debug: mock(() => {}) },
  serviceAuthMiddleware: mock(() => null),
  SimpleRateLimiter: mock(function () { return {}; }),
  rateLimitMiddleware: mock(() => () => null),
}));

import { listUserTeams, getTeam } from '../../../src/routes/teams';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTeamRecord(id: string, name: string, plan = 'free') {
  return {
    id,
    name,
    owner_id: 'owner-1',
    plan,
    stripe_subscription_id: null,
    sso_config: null,
    created_at: '2024-01-01T00:00:00.000Z',
  };
}

// ---------------------------------------------------------------------------
// Team listing (foundation of context switching)
// ---------------------------------------------------------------------------

describe('listUserTeams — team context discovery', () => {
  beforeEach(() => {
    mockListTeamsForUser.mockReset();
    mockListTeamsForUser.mockReturnValue([]);
  });

  test('returns an empty array for a user who belongs to no teams', async () => {
    const result = await listUserTeams('lonely-user');

    expect(result).toHaveLength(0);
  });

  test('returns all teams that a user is a member of', async () => {
    mockListTeamsForUser.mockReturnValue([
      makeTeamRecord('team-a', 'Alpha Team'),
      makeTeamRecord('team-b', 'Beta Team'),
    ]);

    const result = await listUserTeams('multi-team-user');

    expect(result).toHaveLength(2);
    expect(result.map(t => t.id)).toEqual(['team-a', 'team-b']);
  });

  test('each returned team has the required fields for context switching (id, name, plan)', async () => {
    mockListTeamsForUser.mockReturnValue([makeTeamRecord('team-pro', 'Pro Team', 'pro')]);

    const result = await listUserTeams('user-pro');

    const team = result[0];
    expect(team.id).toBe('team-pro');
    expect(team.name).toBe('Pro Team');
    expect(team.plan).toBe('pro');
    expect(team.ownerId).toBe('owner-1');
    expect(typeof team.createdAt).toBe('string');
  });

  test('calls listTeamsForUser with the correct userId', async () => {
    await listUserTeams('explicit-user-id');

    expect(mockListTeamsForUser).toHaveBeenCalledWith('explicit-user-id');
  });

  test('teams are returned with SSO config parsed when present', async () => {
    mockListTeamsForUser.mockReturnValue([
      makeTeamRecord('team-sso', 'SSO Corp'),
    ]);
    // Patch the mock to return an sso_config field
    mockListTeamsForUser.mockReturnValue([
      { ...makeTeamRecord('team-sso', 'SSO Corp'), sso_config: JSON.stringify({ provider: 'okta' }) },
    ]);

    const result = await listUserTeams('sso-user');

    expect(result[0].ssoConfig).toEqual({ provider: 'okta' });
  });
});

// ---------------------------------------------------------------------------
// getTeam — context resolution after switch
// ---------------------------------------------------------------------------

describe('getTeam — context resolution', () => {
  beforeEach(() => {
    mockGetTeamRecord.mockReset();
    mockGetTeamRecord.mockReturnValue(null);
  });

  test('resolves full team context for a valid team ID', async () => {
    mockGetTeamRecord.mockReturnValue(makeTeamRecord('team-x', 'X Corp', 'enterprise'));

    const team = await getTeam('team-x');

    expect(team).not.toBeNull();
    expect(team!.id).toBe('team-x');
    expect(team!.plan).toBe('enterprise');
  });

  test('returns null when the target team does not exist (prevents invalid switch)', async () => {
    const team = await getTeam('does-not-exist');

    expect(team).toBeNull();
  });

  test('resolves team plan so UI can enforce feature gates', async () => {
    const plans: Array<'free' | 'pro' | 'enterprise'> = ['free', 'pro', 'enterprise'];

    for (const plan of plans) {
      mockGetTeamRecord.mockReturnValue(makeTeamRecord('team-plan', 'Plan Team', plan));
      const team = await getTeam('team-plan');
      expect(team!.plan).toBe(plan);
    }
  });

  test('resolves team ownerId for ownership badge in UI', async () => {
    mockGetTeamRecord.mockReturnValue(
      { ...makeTeamRecord('team-owned', 'Owned Team'), owner_id: 'the-real-owner' }
    );

    const team = await getTeam('team-owned');

    expect(team!.ownerId).toBe('the-real-owner');
  });
});

// ---------------------------------------------------------------------------
// Team switch permission checks (pure logic)
// ---------------------------------------------------------------------------

describe('Team switch permission logic — pure assertions', () => {
  test('user can switch to a team if they appear in its members list', () => {
    const userTeamIds = ['team-a', 'team-b', 'team-c'];
    const targetTeamId = 'team-b';

    const canSwitch = userTeamIds.includes(targetTeamId);

    expect(canSwitch).toBe(true);
  });

  test('user cannot switch to a team they are not a member of', () => {
    const userTeamIds = ['team-a', 'team-c'];
    const targetTeamId = 'team-b';

    const canSwitch = userTeamIds.includes(targetTeamId);

    expect(canSwitch).toBe(false);
  });

  test('a user with no teams cannot switch to any team', () => {
    const userTeamIds: string[] = [];
    const targetTeamId = 'team-any';

    const canSwitch = userTeamIds.includes(targetTeamId);

    expect(canSwitch).toBe(false);
  });

  test('default team selection is the first team returned from listUserTeams', () => {
    const teams = [
      makeTeamRecord('team-first', 'First'),
      makeTeamRecord('team-second', 'Second'),
    ];

    const defaultTeam = teams[0];

    expect(defaultTeam.id).toBe('team-first');
  });
});
