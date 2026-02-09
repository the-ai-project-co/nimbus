/**
 * Team Routes
 * CRUD operations for teams
 */

import type { Team, CreateTeamRequest } from '@nimbus/shared-types';
import {
  createTeamRecord,
  getTeamRecord,
  listTeamsForUser,
  deleteTeamRecord,
  isTeamOwner,
} from '../db/adapter';

/**
 * Create a new team
 */
export async function createTeam(request: CreateTeamRequest): Promise<Team> {
  const { name, ownerId } = request;

  if (!name || !ownerId) {
    throw new Error('Team name and owner ID are required');
  }

  const id = crypto.randomUUID();
  createTeamRecord(id, name, ownerId);

  const record = getTeamRecord(id);
  if (!record) {
    throw new Error('Failed to create team');
  }

  return {
    id: record.id,
    name: record.name,
    ownerId: record.owner_id,
    plan: record.plan as Team['plan'],
    stripeSubscriptionId: record.stripe_subscription_id || undefined,
    ssoConfig: record.sso_config ? JSON.parse(record.sso_config) : undefined,
    createdAt: record.created_at,
  };
}

/**
 * Get a team by ID
 */
export async function getTeam(id: string): Promise<Team | null> {
  const record = getTeamRecord(id);
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    name: record.name,
    ownerId: record.owner_id,
    plan: record.plan as Team['plan'],
    stripeSubscriptionId: record.stripe_subscription_id || undefined,
    ssoConfig: record.sso_config ? JSON.parse(record.sso_config) : undefined,
    createdAt: record.created_at,
  };
}

/**
 * List teams for a user
 */
export async function listUserTeams(userId: string): Promise<Team[]> {
  const records = listTeamsForUser(userId);

  return records.map(record => ({
    id: record.id,
    name: record.name,
    ownerId: record.owner_id,
    plan: record.plan as Team['plan'],
    stripeSubscriptionId: record.stripe_subscription_id || undefined,
    ssoConfig: record.sso_config ? JSON.parse(record.sso_config) : undefined,
    createdAt: record.created_at,
  }));
}

/**
 * Delete a team
 */
export async function deleteTeam(id: string, requesterId?: string): Promise<void> {
  const team = getTeamRecord(id);
  if (!team) {
    throw new Error('Team not found');
  }

  // If requesterId is provided, verify they are the owner
  if (requesterId && !isTeamOwner(id, requesterId)) {
    throw new Error('Only the team owner can delete the team');
  }

  deleteTeamRecord(id);
}
