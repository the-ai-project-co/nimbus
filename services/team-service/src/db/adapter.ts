/**
 * Team Service Database Adapter
 * SQLite database for teams and members
 */

import { Database } from 'bun:sqlite';
import { logger } from '@nimbus/shared-utils';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let db: Database | null = null;

const DATABASE_PATH = process.env.TEAM_DATABASE_PATH ||
  path.join(os.homedir(), '.nimbus', 'team.db');

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  // Ensure directory exists
  const dir = path.dirname(DATABASE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DATABASE_PATH);

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      github_username TEXT,
      stripe_customer_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      plan TEXT DEFAULT 'free',
      stripe_subscription_id TEXT,
      sso_config TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS team_members (
      team_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (team_id, user_id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_teams_owner ON teams(owner_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id)`);

  logger.info(`Team database initialized at ${DATABASE_PATH}`);
  return db;
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

// User operations
export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  github_username: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export function createUser(id: string, email: string, name?: string): void {
  const db = getDatabase();
  db.run(
    `INSERT OR IGNORE INTO users (id, email, name) VALUES (?, ?, ?)`,
    [id, email, name || null]
  );
}

export function getUserByEmail(email: string): UserRecord | null {
  const db = getDatabase();
  return db.query(`SELECT * FROM users WHERE email = ?`).get(email) as UserRecord | null;
}

export function getUserById(id: string): UserRecord | null {
  const db = getDatabase();
  return db.query(`SELECT * FROM users WHERE id = ?`).get(id) as UserRecord | null;
}

export function getOrCreateUser(email: string, name?: string): UserRecord {
  let user = getUserByEmail(email);
  if (!user) {
    const id = crypto.randomUUID();
    createUser(id, email, name);
    user = getUserById(id)!;
  }
  return user;
}

// Team operations
export interface TeamRecord {
  id: string;
  name: string;
  owner_id: string;
  plan: string;
  stripe_subscription_id: string | null;
  sso_config: string | null;
  created_at: string;
}

export function createTeamRecord(id: string, name: string, ownerId: string): void {
  const db = getDatabase();
  db.run(
    `INSERT INTO teams (id, name, owner_id) VALUES (?, ?, ?)`,
    [id, name, ownerId]
  );
  // Add owner as member with owner role
  db.run(
    `INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'owner')`,
    [id, ownerId]
  );
}

export function getTeamRecord(id: string): TeamRecord | null {
  const db = getDatabase();
  return db.query(`SELECT * FROM teams WHERE id = ?`).get(id) as TeamRecord | null;
}

export function listTeamsForUser(userId: string): TeamRecord[] {
  const db = getDatabase();
  return db.query(`
    SELECT t.* FROM teams t
    JOIN team_members tm ON t.id = tm.team_id
    WHERE tm.user_id = ?
    ORDER BY t.created_at DESC
  `).all(userId) as TeamRecord[];
}

export function deleteTeamRecord(id: string): void {
  const db = getDatabase();
  db.run(`DELETE FROM team_members WHERE team_id = ?`, [id]);
  db.run(`DELETE FROM teams WHERE id = ?`, [id]);
}

export function updateTeamPlan(id: string, plan: string, subscriptionId?: string): void {
  const db = getDatabase();
  db.run(
    `UPDATE teams SET plan = ?, stripe_subscription_id = ? WHERE id = ?`,
    [plan, subscriptionId || null, id]
  );
}

// Team member operations
export interface TeamMemberRecord {
  team_id: string;
  user_id: string;
  role: string;
  joined_at: string;
}

export interface TeamMemberWithUser extends TeamMemberRecord {
  email: string;
  name: string | null;
}

export function addTeamMember(teamId: string, userId: string, role: string = 'member'): void {
  const db = getDatabase();
  db.run(
    `INSERT OR REPLACE INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)`,
    [teamId, userId, role]
  );
}

export function getTeamMembers(teamId: string): TeamMemberWithUser[] {
  const db = getDatabase();
  return db.query(`
    SELECT tm.*, u.email, u.name
    FROM team_members tm
    JOIN users u ON tm.user_id = u.id
    WHERE tm.team_id = ?
    ORDER BY tm.role, tm.joined_at
  `).all(teamId) as TeamMemberWithUser[];
}

export function getTeamMember(teamId: string, userId: string): TeamMemberRecord | null {
  const db = getDatabase();
  return db.query(
    `SELECT * FROM team_members WHERE team_id = ? AND user_id = ?`
  ).get(teamId, userId) as TeamMemberRecord | null;
}

export function updateTeamMemberRole(teamId: string, userId: string, role: string): void {
  const db = getDatabase();
  db.run(
    `UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?`,
    [role, teamId, userId]
  );
}

export function removeTeamMember(teamId: string, userId: string): void {
  const db = getDatabase();
  db.run(
    `DELETE FROM team_members WHERE team_id = ? AND user_id = ?`,
    [teamId, userId]
  );
}

export function isTeamOwner(teamId: string, userId: string): boolean {
  const member = getTeamMember(teamId, userId);
  return member?.role === 'owner';
}

export function isTeamAdmin(teamId: string, userId: string): boolean {
  const member = getTeamMember(teamId, userId);
  return member?.role === 'owner' || member?.role === 'admin';
}
