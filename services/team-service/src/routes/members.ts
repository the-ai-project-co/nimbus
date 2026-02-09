/**
 * Team Members Routes
 * Member management for teams
 */

import type { TeamMember, TeamRole } from '@nimbus/shared-types';
import {
  addTeamMember,
  getTeamMembers,
  removeTeamMember,
  updateTeamMemberRole,
  getOrCreateUser,
  getTeamRecord,
  getTeamMember,
} from '../db/adapter';

// Valid roles for team members (excluding 'owner' which is set during team creation)
const VALID_MEMBER_ROLES: TeamRole[] = ['admin', 'member', 'viewer'];

// Request interfaces that accept plain strings
interface InviteRequest {
  email: string;
  role?: string;
}

interface UpdateRoleRequest {
  role: string;
}

/**
 * Invite a member to a team
 */
export async function inviteMember(
  teamId: string,
  request: InviteRequest,
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

  // Cannot invite as owner
  if (role === 'owner') {
    throw new Error('Cannot invite as owner. Use transfer ownership instead.');
  }

  // Verify requester authorization if provided
  if (requesterId) {
    const requesterMember = getTeamMember(teamId, requesterId);
    if (!requesterMember || !['owner', 'admin'].includes(requesterMember.role)) {
      throw new Error('Only team owners and admins can invite members');
    }
  }

  // Verify team exists
  const team = getTeamRecord(teamId);
  if (!team) {
    throw new Error('Team not found');
  }

  // Get or create user by email
  const user = getOrCreateUser(email);

  // Check if already a member
  const existingMember = getTeamMember(teamId, user.id);
  if (existingMember) {
    throw new Error('User is already a member of this team');
  }

  // Add member
  addTeamMember(teamId, user.id, role);

  return {
    teamId,
    userId: user.id,
    role: role as TeamRole,
    joinedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name || undefined,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    },
  };
}

/**
 * List members of a team
 */
export async function listMembers(teamId: string): Promise<TeamMember[]> {
  const members = getTeamMembers(teamId);

  return members.map(m => ({
    teamId: m.team_id,
    userId: m.user_id,
    role: m.role as TeamRole,
    joinedAt: m.joined_at,
    user: {
      id: m.user_id,
      email: m.email,
      name: m.name || undefined,
      createdAt: '', // Not included in join
      updatedAt: '',
    },
  }));
}

/**
 * Update a member's role
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

  // Validate role
  if (!VALID_MEMBER_ROLES.includes(role as TeamRole)) {
    throw new Error(`Invalid role: ${role}. Must be one of: ${VALID_MEMBER_ROLES.join(', ')}`);
  }

  // Verify requester authorization if provided
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

  // Cannot change owner role this way
  if (member.role === 'owner') {
    throw new Error('Cannot change owner role. Use transfer ownership instead.');
  }
  if (role === 'owner') {
    throw new Error('Cannot promote to owner. Use transfer ownership instead.');
  }

  updateTeamMemberRole(teamId, userId, role);

  return {
    teamId,
    userId,
    role: role as TeamRole,
    joinedAt: member.joined_at,
  };
}

/**
 * Remove a member from a team
 */
export async function removeMember(
  teamId: string,
  userId: string,
  requesterId?: string
): Promise<void> {
  // Verify requester authorization if provided
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

  // Cannot remove owner
  if (member.role === 'owner') {
    throw new Error('Cannot remove the team owner');
  }

  removeTeamMember(teamId, userId);
}
