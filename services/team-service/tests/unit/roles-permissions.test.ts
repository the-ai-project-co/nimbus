/**
 * Team Service — Roles & Permissions Tests
 * Tests role assignment, permission enforcement, and role update logic.
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetTeamMember = mock(() => null);
const mockUpdateTeamMemberRole = mock(() => {});
const mockAddTeamMember = mock(() => {});
const mockGetOrCreateUser = mock(() => ({
  id: 'user-role-test',
  email: 'role@example.com',
  name: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
}));
const mockGetTeamRecord = mock(() => ({
  id: 'team-roles-1',
  name: 'Roles Team',
  owner_id: 'owner-1',
  plan: 'free',
  stripe_subscription_id: null,
  sso_config: null,
  created_at: '2024-01-01T00:00:00.000Z',
}));

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
  getTeamMembers: mock(() => []),
  getTeamMember: mockGetTeamMember,
  removeTeamMember: mock(() => {}),
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

import { inviteMember, updateMemberRole, removeMember } from '../../../src/routes/members';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMemberRecord(role: string, userId = 'member-user') {
  return {
    team_id: 'team-roles-1',
    user_id: userId,
    role,
    joined_at: '2024-01-15T00:00:00.000Z',
  };
}

// ---------------------------------------------------------------------------
// Valid roles
// ---------------------------------------------------------------------------

describe('Role assignment — valid roles', () => {
  beforeEach(() => {
    mockGetTeamMember.mockReset();
    mockUpdateTeamMemberRole.mockReset();
    mockGetOrCreateUser.mockReset();
    mockGetOrCreateUser.mockReturnValue({
      id: 'user-role-test',
      email: 'role@example.com',
      name: null,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    });
  });

  test('can invite a user as "member"', async () => {
    mockGetTeamMember.mockReturnValue(null);

    const result = await inviteMember('team-roles-1', { email: 'role@example.com', role: 'member' });

    expect(result.role).toBe('member');
  });

  test('can invite a user as "admin"', async () => {
    mockGetTeamMember.mockReturnValue(null);

    const result = await inviteMember('team-roles-1', { email: 'role@example.com', role: 'admin' });

    expect(result.role).toBe('admin');
  });

  test('can invite a user as "viewer"', async () => {
    mockGetTeamMember.mockReturnValue(null);

    const result = await inviteMember('team-roles-1', { email: 'role@example.com', role: 'viewer' });

    expect(result.role).toBe('viewer');
  });

  test('updateMemberRole: member → admin is permitted', async () => {
    mockGetTeamMember.mockReturnValue(makeMemberRecord('member'));

    const result = await updateMemberRole('team-roles-1', 'member-user', { role: 'admin' });

    expect(result.role).toBe('admin');
    expect(mockUpdateTeamMemberRole).toHaveBeenCalledWith('team-roles-1', 'member-user', 'admin');
  });

  test('updateMemberRole: admin → viewer is permitted', async () => {
    mockGetTeamMember.mockReturnValue(makeMemberRecord('admin'));

    const result = await updateMemberRole('team-roles-1', 'member-user', { role: 'viewer' });

    expect(result.role).toBe('viewer');
  });
});

// ---------------------------------------------------------------------------
// Invalid roles
// ---------------------------------------------------------------------------

describe('Role assignment — invalid roles', () => {
  beforeEach(() => {
    mockGetTeamMember.mockReset();
    mockUpdateTeamMemberRole.mockReset();
    mockGetOrCreateUser.mockReset();
    mockGetOrCreateUser.mockReturnValue({
      id: 'user-role-test',
      email: 'role@example.com',
      name: null,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    });
  });

  test('inviteMember throws for an unrecognised role', async () => {
    mockGetTeamMember.mockReturnValue(null);

    await expect(
      inviteMember('team-roles-1', { email: 'x@x.com', role: 'superuser' })
    ).rejects.toThrow('Invalid role');
  });

  test('inviteMember cannot invite as "owner"', async () => {
    mockGetTeamMember.mockReturnValue(null);

    await expect(
      inviteMember('team-roles-1', { email: 'x@x.com', role: 'owner' })
    ).rejects.toThrow('Invalid role');
  });

  test('updateMemberRole throws for an unrecognised role', async () => {
    mockGetTeamMember.mockReturnValue(makeMemberRecord('member'));

    await expect(
      updateMemberRole('team-roles-1', 'member-user', { role: 'god' })
    ).rejects.toThrow('Invalid role');
  });

  test('updateMemberRole cannot promote to "owner"', async () => {
    mockGetTeamMember.mockReturnValue(makeMemberRecord('admin'));

    await expect(
      updateMemberRole('team-roles-1', 'member-user', { role: 'owner' })
    ).rejects.toThrow('Invalid role');
  });

  test('updateMemberRole cannot change the existing owner role', async () => {
    mockGetTeamMember.mockReturnValue(makeMemberRecord('owner'));

    await expect(
      updateMemberRole('team-roles-1', 'owner-1', { role: 'admin' })
    ).rejects.toThrow('Cannot change owner role');
  });
});

// ---------------------------------------------------------------------------
// Permission enforcement
// ---------------------------------------------------------------------------

describe('Permission enforcement', () => {
  beforeEach(() => {
    mockGetTeamMember.mockReset();
    mockUpdateTeamMemberRole.mockReset();
  });

  test('owner-role requester can update member role', async () => {
    // First call: requester check (owner), second call: target member
    mockGetTeamMember
      .mockReturnValueOnce(makeMemberRecord('owner', 'owner-requester'))
      .mockReturnValueOnce(makeMemberRecord('member', 'target-member'));

    const result = await updateMemberRole(
      'team-roles-1',
      'target-member',
      { role: 'admin' },
      'owner-requester'
    );

    expect(result.role).toBe('admin');
  });

  test('admin-role requester can update member role', async () => {
    mockGetTeamMember
      .mockReturnValueOnce(makeMemberRecord('admin', 'admin-requester'))
      .mockReturnValueOnce(makeMemberRecord('member', 'target-member'));

    const result = await updateMemberRole(
      'team-roles-1',
      'target-member',
      { role: 'viewer' },
      'admin-requester'
    );

    expect(result.role).toBe('viewer');
  });

  test('viewer-role requester cannot update member roles', async () => {
    mockGetTeamMember.mockReturnValueOnce(makeMemberRecord('viewer', 'viewer-requester'));

    await expect(
      updateMemberRole('team-roles-1', 'target-member', { role: 'admin' }, 'viewer-requester')
    ).rejects.toThrow('Only team owners and admins can update member roles');
  });

  test('member-role requester cannot update member roles', async () => {
    mockGetTeamMember.mockReturnValueOnce(makeMemberRecord('member', 'plain-member'));

    await expect(
      updateMemberRole('team-roles-1', 'target-member', { role: 'viewer' }, 'plain-member')
    ).rejects.toThrow('Only team owners and admins can update member roles');
  });

  test('updateMemberRole throws when target member is not found', async () => {
    // Requester is owner, but target member does not exist
    mockGetTeamMember
      .mockReturnValueOnce(null) // no requester check (no requesterId)
      .mockReturnValueOnce(null); // target not found

    await expect(
      updateMemberRole('team-roles-1', 'ghost-member', { role: 'admin' })
    ).rejects.toThrow('Member not found');
  });

  test('updateMemberRole throws when role field is empty', async () => {
    await expect(
      updateMemberRole('team-roles-1', 'some-user', { role: '' })
    ).rejects.toThrow('Role is required');
  });
});
