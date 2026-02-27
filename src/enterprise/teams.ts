/**
 * Enterprise Teams - Team CRUD and member management.
 *
 * Embedded replacement for services/team-service.
 * All business logic is preserved verbatim from:
 *   - services/team-service/src/routes/teams.ts
 *   - services/team-service/src/routes/members.ts
 *
 * HTTP handlers, routes, and per-service SQLite are stripped.
 * State is read/written through the unified database via ../state/teams.
 */

import {
  createTeam as stateCreateTeam,
  getTeam as stateGetTeam,
  addTeamMember as stateAddTeamMember,
  removeTeamMember as stateRemoveTeamMember,
  listTeamMembers as stateListTeamMembers,
  createUser as stateCreateUser,
  type TeamRecord,
  type TeamMemberRecord,
  type UserRecord,
} from '../state/teams';

// ---------------------------------------------------------------------------
// Type definitions (mirrors @nimbus/shared-types shapes)
// ---------------------------------------------------------------------------

export type TeamPlan = 'free' | 'pro' | 'enterprise';
export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface Team {
  id: string;
  name: string;
  ownerId: string;
  plan: TeamPlan;
  createdAt: string;
}

export interface TeamMember {
  teamId: string;
  userId: string;
  role: TeamRole;
  joinedAt: string;
  user?: {
    id: string;
    email: string | null;
    name?: string;
    createdAt: string;
    updatedAt: string;
  };
}

export interface CreateTeamRequest {
  name: string;
  ownerId: string;
}

export interface InviteMemberRequest {
  email: string;
  role?: string;
}

export interface UpdateRoleRequest {
  role: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Valid roles for team members (owner is set during team creation only)
const VALID_MEMBER_ROLES: TeamRole[] = ['admin', 'member', 'viewer'];

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Map a state TeamRecord to the public Team shape.
 */
function recordToTeam(record: TeamRecord): Team {
  return {
    id: record.id,
    name: record.name,
    ownerId: record.ownerId,
    plan: record.plan as TeamPlan,
    createdAt: record.createdAt,
  };
}

/**
 * Retrieve the team_members row for a specific (teamId, userId) pair.
 * The unified state module exposes listTeamMembers() but not a single-member
 * getter, so we filter in-process here — consistent with the original
 * team-service adapter's getTeamMember().
 */
function getTeamMember(teamId: string, userId: string): TeamMemberRecord | null {
  const members = stateListTeamMembers(teamId);
  return members.find(m => m.userId === userId) ?? null;
}

/**
 * Look up a user by email from the unified users table.
 * If no user exists, create one with a generated id.
 */
async function getOrCreateUserByEmail(email: string): Promise<UserRecord> {
  const { getDb } = await import('../state/db');
  const db = getDb();

  // Try to find by email first
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any | null;

  if (existing) {
    return {
      id: existing.id,
      email: existing.email,
      name: existing.name,
      avatarUrl: existing.avatar_url,
      createdAt: existing.created_at,
      updatedAt: existing.updated_at,
    };
  }

  // Create a new user record
  const id = crypto.randomUUID();
  stateCreateUser(id, email);

  const created = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  if (!created) {
    throw new Error('Failed to create or load user');
  }

  return {
    id: created.id,
    email: created.email,
    name: created.name,
    avatarUrl: created.avatar_url,
    createdAt: created.created_at,
    updatedAt: created.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Public API - Team CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new team.
 *
 * The owner is automatically added as a team member with the 'owner' role
 * via the underlying state layer transaction.
 */
export async function createTeam(request: CreateTeamRequest): Promise<Team> {
  const { name, ownerId } = request;

  if (!name || !ownerId) {
    throw new Error('Team name and owner ID are required');
  }

  const id = crypto.randomUUID();

  // stateCreateTeam(id, name, ownerId, plan?)
  stateCreateTeam(id, name, ownerId);

  // Add owner as a member with role 'owner' via the members table
  const memberId = crypto.randomUUID();
  stateAddTeamMember(memberId, id, ownerId, 'owner');

  const record = stateGetTeam(id);
  if (!record) {
    throw new Error('Failed to create team');
  }

  return recordToTeam(record);
}

/**
 * Get a team by ID.
 *
 * Returns null if no team with the given ID exists.
 */
export async function getTeam(id: string): Promise<Team | null> {
  const record = stateGetTeam(id);
  if (!record) {
    return null;
  }
  return recordToTeam(record);
}

/**
 * List all teams visible to a given user (teams where userId is a member).
 */
export async function listUserTeams(userId: string): Promise<Team[]> {
  // The unified state module's listTeams() returns all teams; we filter by
  // membership using the team_members table via a direct query to replicate
  // the original listTeamsForUser(userId) JOIN behavior.
  const { getDb } = await import('../state/db');
  const db = getDb();

  const rows = db
    .prepare(
      `
    SELECT t.* FROM teams t
    JOIN team_members tm ON t.id = tm.team_id
    WHERE tm.user_id = ?
    ORDER BY t.created_at DESC
  `
    )
    .all(userId) as any[];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    plan: (row.plan || 'free') as TeamPlan,
    createdAt: row.created_at,
  }));
}

/**
 * Delete a team and all its member associations.
 *
 * If requesterId is provided, verifies the requester is the team owner before
 * proceeding.
 */
export async function deleteTeam(id: string, requesterId?: string): Promise<void> {
  const record = stateGetTeam(id);
  if (!record) {
    throw new Error('Team not found');
  }

  if (requesterId) {
    const member = getTeamMember(id, requesterId);
    if (!member || member.role !== 'owner') {
      throw new Error('Only the team owner can delete the team');
    }
  }

  const { getDb } = await import('../state/db');
  const db = getDb();

  // Delete members first (foreign-key safe), then the team row
  db.prepare('DELETE FROM team_members WHERE team_id = ?').run(id);
  db.prepare('DELETE FROM teams WHERE id = ?').run(id);
}

// ---------------------------------------------------------------------------
// Public API - Member management
// ---------------------------------------------------------------------------

/**
 * Invite a member to a team by email address.
 *
 * Creates the user record if one does not yet exist.  Validates role and
 * requester authorization before inserting the membership row.
 */
export async function inviteMember(
  teamId: string,
  request: InviteMemberRequest,
  requesterId?: string
): Promise<TeamMember> {
  const { email, role = 'member' } = request;

  if (!email) {
    throw new Error('Email is required');
  }

  // Validate role
  if (!VALID_MEMBER_ROLES.includes(role as TeamRole)) {
    throw new Error(`Invalid role: ${role}. Must be one of: ${VALID_MEMBER_ROLES.join(', ')}`);
  }

  if (role === 'owner') {
    throw new Error('Cannot invite as owner. Use transfer ownership instead.');
  }

  // Verify requester authorization
  if (requesterId) {
    const requesterMember = getTeamMember(teamId, requesterId);
    if (!requesterMember || !['owner', 'admin'].includes(requesterMember.role)) {
      throw new Error('Only team owners and admins can invite members');
    }
  }

  // Verify team exists
  const team = stateGetTeam(teamId);
  if (!team) {
    throw new Error('Team not found');
  }

  // Get or create user by email
  const user = await getOrCreateUserByEmail(email);

  // Check if already a member
  const existingMember = getTeamMember(teamId, user.id);
  if (existingMember) {
    throw new Error('User is already a member of this team');
  }

  const memberId = crypto.randomUUID();
  stateAddTeamMember(memberId, teamId, user.id, role);

  return {
    teamId,
    userId: user.id,
    role: role as TeamRole,
    joinedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  };
}

/**
 * List all members of a team.
 */
export async function listMembers(teamId: string): Promise<TeamMember[]> {
  // We need the joined user email/name alongside the member row.
  // The unified state module's listTeamMembers() returns TeamMemberRecord
  // (id, teamId, userId, role, joinedAt) without the user details, so we
  // perform a JOIN directly to include the user's email.
  const { getDb } = await import('../state/db');
  const db = getDb();

  const rows = db
    .prepare(
      `
    SELECT tm.id, tm.team_id, tm.user_id, tm.role, tm.joined_at,
           u.email, u.name
    FROM team_members tm
    LEFT JOIN users u ON tm.user_id = u.id
    WHERE tm.team_id = ?
    ORDER BY tm.joined_at ASC
  `
    )
    .all(teamId) as any[];

  return rows.map(row => ({
    teamId: row.team_id,
    userId: row.user_id,
    role: row.role as TeamRole,
    joinedAt: row.joined_at,
    user: {
      id: row.user_id,
      email: row.email ?? null,
      name: row.name ?? undefined,
      createdAt: '',
      updatedAt: '',
    },
  }));
}

/**
 * Update a team member's role.
 *
 * Owner role transitions are blocked; use a dedicated transfer-ownership flow
 * instead.
 */
export async function updateMemberRole(
  teamId: string,
  userId: string,
  request: UpdateRoleRequest,
  requesterId?: string
): Promise<TeamMember> {
  const { role } = request;

  if (!role) {
    throw new Error('Role is required');
  }

  if (!VALID_MEMBER_ROLES.includes(role as TeamRole)) {
    throw new Error(`Invalid role: ${role}. Must be one of: ${VALID_MEMBER_ROLES.join(', ')}`);
  }

  if (requesterId) {
    const requesterMember = getTeamMember(teamId, requesterId);
    if (!requesterMember || !['owner', 'admin'].includes(requesterMember.role)) {
      throw new Error('Only team owners and admins can update member roles');
    }
  }

  const member = getTeamMember(teamId, userId);
  if (!member) {
    throw new Error('Member not found');
  }

  if (member.role === 'owner') {
    throw new Error('Cannot change owner role. Use transfer ownership instead.');
  }
  if (role === 'owner') {
    throw new Error('Cannot promote to owner. Use transfer ownership instead.');
  }

  const { getDb } = await import('../state/db');
  const db = getDb();
  db.prepare('UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?').run(
    role,
    teamId,
    userId
  );

  return {
    teamId,
    userId,
    role: role as TeamRole,
    joinedAt: member.joinedAt,
  };
}

/**
 * Remove a member from a team.
 *
 * The team owner cannot be removed; use a dedicated transfer-ownership flow
 * before deleting the team.
 */
export async function removeMember(
  teamId: string,
  userId: string,
  requesterId?: string
): Promise<void> {
  if (requesterId) {
    const requesterMember = getTeamMember(teamId, requesterId);
    if (!requesterMember || !['owner', 'admin'].includes(requesterMember.role)) {
      throw new Error('Only team owners and admins can remove members');
    }
  }

  const member = getTeamMember(teamId, userId);
  if (!member) {
    throw new Error('Member not found');
  }

  if (member.role === 'owner') {
    throw new Error('Cannot remove the team owner');
  }

  stateRemoveTeamMember(teamId, userId);
}
