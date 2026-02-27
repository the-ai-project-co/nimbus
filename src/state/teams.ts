/**
 * Team and user CRUD helpers.
 *
 * Refactored from the team-service database adapter
 * (services/team-service/src/db/adapter.ts) into standalone functions
 * that operate against the unified Nimbus database.
 */

import type { Database } from '../compat/sqlite';
import { getDb } from './db';

/** Shape returned by team queries. */
export interface TeamRecord {
  id: string;
  name: string;
  ownerId: string;
  plan: string;
  createdAt: string;
  updatedAt: string;
}

/** Shape returned by team-member queries. */
export interface TeamMemberRecord {
  id: string;
  teamId: string;
  userId: string;
  role: string;
  joinedAt: string;
}

/** Shape returned by user queries. */
export interface UserRecord {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Team helpers
// ---------------------------------------------------------------------------

/**
 * Create a new team.
 */
export function createTeam(
  id: string,
  name: string,
  ownerId: string,
  plan: string = 'free',
  db?: Database
): void {
  const d = db || getDb();
  const stmt = d.prepare(`
    INSERT INTO teams (id, name, owner_id, plan, created_at, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  stmt.run(id, name, ownerId, plan);
}

/**
 * Retrieve a team by id.
 */
export function getTeam(id: string, db?: Database): TeamRecord | null {
  const d = db || getDb();
  const stmt = d.prepare('SELECT * FROM teams WHERE id = ?');
  const row: any = stmt.get(id);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    plan: row.plan,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * List all teams, ordered by most-recently updated first.
 */
export function listTeams(db?: Database): TeamRecord[] {
  const d = db || getDb();
  const stmt = d.prepare('SELECT * FROM teams ORDER BY updated_at DESC');
  const rows: any[] = stmt.all() as any[];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    plan: row.plan,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// ---------------------------------------------------------------------------
// Team member helpers
// ---------------------------------------------------------------------------

/**
 * Add a member to a team.
 */
export function addTeamMember(
  id: string,
  teamId: string,
  userId: string,
  role: string = 'member',
  db?: Database
): void {
  const d = db || getDb();
  const stmt = d.prepare(`
    INSERT INTO team_members (id, team_id, user_id, role, joined_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  stmt.run(id, teamId, userId, role);
}

/**
 * Remove a member from a team by user id.
 */
export function removeTeamMember(teamId: string, userId: string, db?: Database): void {
  const d = db || getDb();
  const stmt = d.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?');
  stmt.run(teamId, userId);
}

/**
 * List all members of a team.
 */
export function listTeamMembers(teamId: string, db?: Database): TeamMemberRecord[] {
  const d = db || getDb();
  const stmt = d.prepare(`
    SELECT * FROM team_members
    WHERE team_id = ?
    ORDER BY joined_at ASC
  `);

  const rows: any[] = stmt.all(teamId) as any[];
  return rows.map(row => ({
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    role: row.role,
    joinedAt: row.joined_at,
  }));
}

// ---------------------------------------------------------------------------
// User helpers
// ---------------------------------------------------------------------------

/**
 * Create a new user.
 */
export function createUser(
  id: string,
  email?: string,
  name?: string,
  avatarUrl?: string,
  db?: Database
): void {
  const d = db || getDb();
  const stmt = d.prepare(`
    INSERT INTO users (id, email, name, avatar_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  stmt.run(id, email || null, name || null, avatarUrl || null);
}

/**
 * Retrieve a user by id.
 */
export function getUser(id: string, db?: Database): UserRecord | null {
  const d = db || getDb();
  const stmt = d.prepare('SELECT * FROM users WHERE id = ?');
  const row: any = stmt.get(id);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
