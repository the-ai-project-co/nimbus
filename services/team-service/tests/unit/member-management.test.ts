/**
 * Team Service — Member Management Tests
 * Tests add, remove, list members and invitation logic.
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAddTeamMember = mock(() => {});
const mockGetTeamMembers = mock(() => []);
const mockGetTeamMember = mock(() => null);
const mockRemoveTeamMember = mock(() => {});
const mockUpdateTeamMemberRole = mock(() => {});
const mockGetOrCreateUser = mock(() => ({
  id: 'new-user-id',
  email: 'invited@example.com',
  name: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
}));
const mockGetTeamRecord = mock(() => null);

mock.module('../../../src/db/adapter', () => ({
  initDatabase: mock(async () => {}),
  getDatabase: mock(() => ({})),
  createTeamRecord: mock(() => {}),
  getTeamRecord: mockGetTeamRecord,
  listTeamsForUser: mock(() => []),
  deleteTeamRecord: mock(() => {}),
  isTeamOwner: mock(() => false),
  isTeamAdmin: mock(() => false),
  addTeamMember: mockAddTeamMember,
  getTeamMembers: mockGetTeamMembers,
  getTeamMember: mockGetTeamMember,
  removeTeamMember: mockRemoveTeamMember,
  updateTeamMemberRole: mockUpdateTeamMemberRole,
  getOrCreateUser: mockGetOrCreateUser,
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

import { inviteMember, listMembers, removeMember, updateMemberRole } from '../../../src/routes/members';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTeamRecord(id = 'team-1') {
  return {
    id,
    name: 'Test Team',
    owner_id: 'owner-1',
    plan: 'free',
    stripe_subscription_id: null,
    sso_config: null,
    created_at: '2024-01-01T00:00:00.000Z',
  };
}

function makeMemberRecord(overrides: Record<string, unknown> = {}) {
  return {
    team_id: 'team-1',
    user_id: 'member-user-1',
    role: 'member',
    joined_at: '2024-02-01T00:00:00.000Z',
    email: 'member@example.com',
    name: null,
    ...overrides,
  };
}

function makeOwnerMemberRecord() {
  return {
    team_id: 'team-1',
    user_id: 'owner-1',
    role: 'owner',
    joined_at: '2024-01-01T00:00:00.000Z',
  };
}

// ---------------------------------------------------------------------------
// inviteMember
// ---------------------------------------------------------------------------

describe('inviteMember', () => {
  beforeEach(() => {
    mockAddTeamMember.mockReset();
    mockGetTeamMember.mockReset();
    mockGetOrCreateUser.mockReset();
    mockGetTeamRecord.mockReset();
    mockGetTeamRecord.mockReturnValue(makeTeamRecord());
    mockGetTeamMember.mockReturnValue(null); // not already a member
    mockGetOrCreateUser.mockReturnValue({
      id: 'new-user-id',
      email: 'invited@example.com',
      name: null,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    });
  });

  test('invites a user with default "member" role', async () => {
    const result = await inviteMember('team-1', { email: 'invited@example.com' });

    expect(result.role).toBe('member');
    expect(result.teamId).toBe('team-1');
    expect(result.user?.email).toBe('invited@example.com');
  });

  test('invites a user with explicit "admin" role', async () => {
    const result = await inviteMember('team-1', { email: 'admin@example.com', role: 'admin' });

    expect(result.role).toBe('admin');
    expect(mockAddTeamMember).toHaveBeenCalledWith('team-1', 'new-user-id', 'admin');
  });

  test('invites a user with "viewer" role', async () => {
    const result = await inviteMember('team-1', { email: 'viewer@example.com', role: 'viewer' });

    expect(result.role).toBe('viewer');
  });

  test('throws when email is missing', async () => {
    await expect(
      inviteMember('team-1', { email: '' })
    ).rejects.toThrow('Email is required');
  });

  test('throws for invalid role', async () => {
    await expect(
      inviteMember('team-1', { email: 'x@example.com', role: 'superadmin' })
    ).rejects.toThrow('Invalid role');
  });

  test('throws when team does not exist', async () => {
    mockGetTeamRecord.mockReturnValue(null);

    await expect(
      inviteMember('nonexistent-team', { email: 'x@example.com' })
    ).rejects.toThrow('Team not found');
  });

  test('throws when user is already a member', async () => {
    // First call returns null (requester check passes), second returns existing member
    mockGetTeamMember
      .mockReturnValueOnce(null) // requester has no record — no auth check
      .mockReturnValueOnce(makeMemberRecord()); // user is already a member

    await expect(
      inviteMember('team-1', { email: 'existing@example.com' })
    ).rejects.toThrow('already a member');
  });

  test('authorization check: non-admin requester is rejected', async () => {
    // Return a regular "member" record for the requester
    mockGetTeamMember.mockReturnValue(makeMemberRecord({ role: 'member' }));

    await expect(
      inviteMember('team-1', { email: 'new@example.com' }, 'non-admin-requester')
    ).rejects.toThrow('Only team owners and admins can invite members');
  });

  test('authorization check: admin requester is allowed to invite', async () => {
    mockGetTeamMember.mockReturnValueOnce(
      makeMemberRecord({ role: 'admin', user_id: 'requester-admin' })
    ).mockReturnValueOnce(null); // invited user not already a member

    const result = await inviteMember(
      'team-1',
      { email: 'new@example.com' },
      'requester-admin'
    );

    expect(result.teamId).toBe('team-1');
  });
});

// ---------------------------------------------------------------------------
// listMembers
// ---------------------------------------------------------------------------

describe('listMembers', () => {
  beforeEach(() => {
    mockGetTeamMembers.mockReset();
  });

  test('returns an empty array when team has no members', async () => {
    mockGetTeamMembers.mockReturnValue([]);

    const result = await listMembers('team-1');

    expect(result).toHaveLength(0);
  });

  test('maps DB records to TeamMember API shape', async () => {
    mockGetTeamMembers.mockReturnValue([
      makeMemberRecord(),
      makeMemberRecord({ user_id: 'member-2', role: 'admin', email: 'admin@example.com' }),
    ]);

    const result = await listMembers('team-1');

    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('member');
    expect(result[0].user?.email).toBe('member@example.com');
    expect(result[1].role).toBe('admin');
  });

  test('calls getTeamMembers with the correct teamId', async () => {
    mockGetTeamMembers.mockReturnValue([]);

    await listMembers('specific-team');

    expect(mockGetTeamMembers).toHaveBeenCalledWith('specific-team');
  });
});

// ---------------------------------------------------------------------------
// removeMember
// ---------------------------------------------------------------------------

describe('removeMember', () => {
  beforeEach(() => {
    mockGetTeamMember.mockReset();
    mockRemoveTeamMember.mockReset();
  });

  test('removes a member successfully', async () => {
    mockGetTeamMember.mockReturnValue(makeMemberRecord());

    await expect(
      removeMember('team-1', 'member-user-1')
    ).resolves.toBeUndefined();

    expect(mockRemoveTeamMember).toHaveBeenCalledWith('team-1', 'member-user-1');
  });

  test('throws when member is not found', async () => {
    mockGetTeamMember.mockReturnValue(null);

    await expect(
      removeMember('team-1', 'ghost-user')
    ).rejects.toThrow('Member not found');
  });

  test('throws when attempting to remove the team owner', async () => {
    mockGetTeamMember.mockReturnValue(makeMemberRecord({ role: 'owner' }));

    await expect(
      removeMember('team-1', 'owner-1')
    ).rejects.toThrow('Cannot remove the team owner');
  });

  test('authorization check: non-admin requester is rejected', async () => {
    // First call: requester check — requester is a plain member
    mockGetTeamMember.mockReturnValueOnce(makeMemberRecord({ role: 'member' }));

    await expect(
      removeMember('team-1', 'member-user-1', 'non-admin-requester')
    ).rejects.toThrow('Only team owners and admins can remove members');
  });
});
