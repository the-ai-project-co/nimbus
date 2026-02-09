/**
 * Audit Service Database Adapter
 * SQLite database for audit logs
 */

import { Database } from 'bun:sqlite';
import { logger } from '@nimbus/shared-utils';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let db: Database | null = null;

const DATABASE_PATH = process.env.AUDIT_DATABASE_PATH ||
  path.join(os.homedir(), '.nimbus', 'audit.db');

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
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      team_id TEXT,
      user_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      status TEXT NOT NULL,
      details TEXT,
      ip_address TEXT
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_team ON audit_logs(team_id, timestamp)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, timestamp)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_status ON audit_logs(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp)`);

  logger.info(`Audit database initialized at ${DATABASE_PATH}`);
  return db;
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

// Audit log operations
export interface AuditLogRecord {
  id: string;
  timestamp: string;
  team_id: string | null;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  status: string;
  details: string | null;
  ip_address: string | null;
}

export function createAuditLog(
  action: string,
  status: string,
  options: {
    teamId?: string;
    userId?: string;
    resourceType?: string;
    resourceId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
  } = {}
): string {
  const db = getDatabase();
  const id = crypto.randomUUID();

  db.run(`
    INSERT INTO audit_logs (
      id, team_id, user_id, action, resource_type, resource_id, status, details, ip_address
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    options.teamId || null,
    options.userId || null,
    action,
    options.resourceType || null,
    options.resourceId || null,
    status,
    options.details ? JSON.stringify(options.details) : null,
    options.ipAddress || null,
  ]);

  return id;
}

export interface AuditLogQuery {
  teamId?: string;
  userId?: string;
  action?: string;
  status?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export function queryAuditLogs(query: AuditLogQuery = {}): AuditLogRecord[] {
  const db = getDatabase();

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (query.teamId) {
    conditions.push('team_id = ?');
    params.push(query.teamId);
  }

  if (query.userId) {
    conditions.push('user_id = ?');
    params.push(query.userId);
  }

  if (query.action) {
    conditions.push('action = ?');
    params.push(query.action);
  }

  if (query.status) {
    conditions.push('status = ?');
    params.push(query.status);
  }

  if (query.since) {
    conditions.push('timestamp >= ?');
    params.push(query.since);
  }

  if (query.until) {
    conditions.push('timestamp <= ?');
    params.push(query.until);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const limit = query.limit || 100;
  const offset = query.offset || 0;

  const sql = `
    SELECT * FROM audit_logs
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);

  return db.query(sql).all(...params) as AuditLogRecord[];
}

export function countAuditLogs(query: AuditLogQuery = {}): number {
  const db = getDatabase();

  const conditions: string[] = [];
  const params: string[] = [];

  if (query.teamId) {
    conditions.push('team_id = ?');
    params.push(query.teamId);
  }

  if (query.userId) {
    conditions.push('user_id = ?');
    params.push(query.userId);
  }

  if (query.action) {
    conditions.push('action = ?');
    params.push(query.action);
  }

  if (query.status) {
    conditions.push('status = ?');
    params.push(query.status);
  }

  if (query.since) {
    conditions.push('timestamp >= ?');
    params.push(query.since);
  }

  if (query.until) {
    conditions.push('timestamp <= ?');
    params.push(query.until);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const sql = `SELECT COUNT(*) as count FROM audit_logs ${whereClause}`;

  const result = db.query(sql).get(...params) as { count: number };
  return result.count;
}
