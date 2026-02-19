/**
 * Team Service — CRUD Tests
 * Tests create, get, list, and delete team route handlers.
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCreateTeamRecord = mock(() => {});
const mockGetTeamRecord = mock(() => null);
const mockListTeamsForUser = mock(() => []);
const mockDeleteTeamRecord = mock(() => {});
const mockIsTeamOwner = mock(() => false);
const mockGetTeamMember = mock(() => null);

mock.module('../../../src/db/adapter', () => ({
  initDatabase: mock(async () => {}),
  getDatabase: mock(() => ({})),
  createTeamRecord: mockCreateTeamRecord,
  getTeamRecord: mockGetTeamRecord,
  listTeamsForUser: mockListTeamsForUser,
  deleteTeamRecord: mockDeleteTeamRecord,
  isTeamOwner: mockIsTeamOwner,
  isTeamAdmin: mock(() => false),
  addTeamMember: mock(() => {}),
  getTeamMembers: mock(() => []),
  getTeamMember: mockGetTeamMember,
  removeTeamMember: mock(() => {}),
  updateTeamMemberRole: mock(() => {}),
  getOrCreateUser: mock(() => ({ id: 'user-1', email: 'u@example.com', name: null, created_at: '', updated_at: '' })),
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

import { createTeam, getTeam, listUserTeams, deleteTeam } from '../../../src/routes/teams';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTeamRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'team-abc-123',
    name: 'Nimbus Engineering',
    owner_id: 'owner-user-1',
    plan: 'free',
    stripe_subscription_id: null,
    sso_config: null,
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createTeam
// ---------------------------------------------------------------------------

describe('createTeam', () => {
  beforeEach(() => {
    mockCreateTeamRecord.mockReset();
    mockGetTeamRecord.mockReset();
    // Default: getTeamRecord returns the newly-created team
    mockGetTeamRecord.mockReturnValue(makeTeamRecord());
  });

  test('creates a team and returns the Team shape', async () => {
    const result = await createTeam({ name: 'Nimbus Engineering', ownerId: 'owner-user-1' });

    expect(typeof result.id).toBe('string');
    expect(result.name).toBe('Nimbus Engineering');
    expect(result.ownerId).toBe('owner-user-1');
    expect(result.plan).toBe('free');
  });

  test('calls createTeamRecord with a generated UUID, the team name, and ownerId', async () => {
    await createTeam({ name: 'My Team', ownerId: 'owner-2' });

    expect(mockCreateTeamRecord).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f-]{36}$/),
      'My Team',
      'owner-2'
    );
  });

  test('throws when name is missing', async () => {
    await expect(
      createTeam({ name: '', ownerId: 'owner-1' })
    ).rejects.toThrow('Team name and owner ID are required');
  });

  test('throws when ownerId is missing', async () => {
    await expect(
      createTeam({ name: 'Some Team', ownerId: '' })
    ).rejects.toThrow('Team name and owner ID are required');
  });

  test('throws when getTeamRecord returns null after insert (DB failure simulation)', async () => {
    mockGetTeamRecord.mockReturnValue(null);

    await expect(
      createTeam({ name: 'Ghost Team', ownerId: 'owner-1' })
    ).rejects.toThrow('Failed to create team');
  });

  test('parses sso_config JSON when present in the DB record', async () => {
    mockGetTeamRecord.mockReturnValue(
      makeTeamRecord({ sso_config: JSON.stringify({ provider: 'google' }) })
    );

    const result = await createTeam({ name: 'SSO Team', ownerId: 'owner-sso' });

    expect(result.ssoConfig).toEqual({ provider: 'google' });
  });

  test('ssoConfig is undefined when sso_config is null in DB', async () => {
    mockGetTeamRecord.mockReturnValue(makeTeamRecord({ sso_config: null }));

    const result = await createTeam({ name: 'No SSO Team', ownerId: 'owner-1' });

    expect(result.ssoConfig).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getTeam
// ---------------------------------------------------------------------------

describe('getTeam', () => {
  beforeEach(() => {
    mockGetTeamRecord.mockReset();
  });

  test('returns the Team when found', async () => {
    mockGetTeamRecord.mockReturnValue(makeTeamRecord());

    const result = await getTeam('team-abc-123');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('team-abc-123');
    expect(result!.name).toBe('Nimbus Engineering');
  });

  test('returns null when team does not exist', async () => {
    mockGetTeamRecord.mockReturnValue(null);

    const result = await getTeam('nonexistent-id');

    expect(result).toBeNull();
  });

  test('calls getTeamRecord with the correct teamId', async () => {
    mockGetTeamRecord.mockReturnValue(makeTeamRecord());

    await getTeam('specific-team-id');

    expect(mockGetTeamRecord).toHaveBeenCalledWith('specific-team-id');
  });
});

// ---------------------------------------------------------------------------
// listUserTeams
// ---------------------------------------------------------------------------

describe('listUserTeams', () => {
  beforeEach(() => {
    mockListTeamsForUser.mockReset();
  });

  test('returns an array of Team objects', async () => {
    mockListTeamsForUser.mockReturnValue([makeTeamRecord(), makeTeamRecord({ id: 'team-2', name: 'Second Team' })]);

    const result = await listUserTeams('user-with-teams');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('team-abc-123');
    expect(result[1].name).toBe('Second Team');
  });

  test('returns an empty array when user has no teams', async () => {
    mockListTeamsForUser.mockReturnValue([]);

    const result = await listUserTeams('user-no-teams');

    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// deleteTeam
// ---------------------------------------------------------------------------

describe('deleteTeam', () => {
  beforeEach(() => {
    mockGetTeamRecord.mockReset();
    mockDeleteTeamRecord.mockReset();
    mockIsTeamOwner.mockReset();
  });

  test('deletes the team successfully when requesterId is the owner', async () => {
    mockGetTeamRecord.mockReturnValue(makeTeamRecord());
    mockIsTeamOwner.mockReturnValue(true);

    await expect(
      deleteTeam('team-abc-123', 'owner-user-1')
    ).resolves.toBeUndefined();

    expect(mockDeleteTeamRecord).toHaveBeenCalledWith('team-abc-123');
  });

  test('throws when team does not exist', async () => {
    mockGetTeamRecord.mockReturnValue(null);

    await expect(
      deleteTeam('nonexistent-team', 'owner-1')
    ).rejects.toThrow('Team not found');
  });

  test('throws "Only the team owner" when requester is not the owner', async () => {
    mockGetTeamRecord.mockReturnValue(makeTeamRecord());
    mockIsTeamOwner.mockReturnValue(false);

    await expect(
      deleteTeam('team-abc-123', 'non-owner-user')
    ).rejects.toThrow('Only the team owner can delete the team');
  });

  test('deletes without authorization check when requesterId is undefined', async () => {
    mockGetTeamRecord.mockReturnValue(makeTeamRecord());

    await deleteTeam('team-abc-123', undefined);

    // isTeamOwner should not be called if no requesterId
    expect(mockIsTeamOwner).not.toHaveBeenCalled();
    expect(mockDeleteTeamRecord).toHaveBeenCalledWith('team-abc-123');
  });
});
