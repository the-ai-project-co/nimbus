/**
 * Auth Service Database Adapter
 * SQLite database for device codes and tokens
 */

import { Database } from 'bun:sqlite';
import { logger } from '@nimbus/shared-utils';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let db: Database | null = null;

const DATABASE_PATH = process.env.AUTH_DATABASE_PATH ||
  path.join(os.homedir(), '.nimbus', 'auth.db');

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
    CREATE TABLE IF NOT EXISTS device_codes (
      device_code TEXT PRIMARY KEY,
      user_code TEXT UNIQUE NOT NULL,
      user_id TEXT,
      verified INTEGER DEFAULT 0,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      team_id TEXT,
      access_token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_device_codes_user ON device_codes(user_code)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_device_codes_expires ON device_codes(expires_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tokens_access ON tokens(access_token)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id)`);

  logger.info(`Auth database initialized at ${DATABASE_PATH}`);
  return db;
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

// Device Code operations
export interface DeviceCodeRecord {
  device_code: string;
  user_code: string;
  user_id: string | null;
  verified: number;
  expires_at: string;
  created_at: string;
}

export function createDeviceCode(
  deviceCode: string,
  userCode: string,
  expiresAt: Date
): void {
  const db = getDatabase();
  db.run(
    `INSERT INTO device_codes (device_code, user_code, expires_at) VALUES (?, ?, ?)`,
    [deviceCode, userCode, expiresAt.toISOString()]
  );
}

export function getDeviceCode(deviceCode: string): DeviceCodeRecord | null {
  const db = getDatabase();
  const result = db.query(
    `SELECT * FROM device_codes WHERE device_code = ?`
  ).get(deviceCode) as DeviceCodeRecord | null;
  return result;
}

export function getDeviceCodeByUserCode(userCode: string): DeviceCodeRecord | null {
  const db = getDatabase();
  const result = db.query(
    `SELECT * FROM device_codes WHERE user_code = ?`
  ).get(userCode) as DeviceCodeRecord | null;
  return result;
}

export function verifyDeviceCodeRecord(userCode: string, userId: string): boolean {
  const db = getDatabase();
  const result = db.run(
    `UPDATE device_codes SET verified = 1, user_id = ? WHERE user_code = ? AND verified = 0`,
    [userId, userCode]
  );
  return result.changes > 0;
}

export function deleteDeviceCode(deviceCode: string): void {
  const db = getDatabase();
  db.run(`DELETE FROM device_codes WHERE device_code = ?`, [deviceCode]);
}

export function cleanupExpiredDeviceCodes(): void {
  const db = getDatabase();
  db.run(`DELETE FROM device_codes WHERE expires_at < datetime('now')`);
}

// Token operations
export interface TokenRecord {
  id: string;
  user_id: string;
  team_id: string | null;
  access_token: string;
  expires_at: string;
  created_at: string;
}

export function createToken(
  id: string,
  userId: string,
  teamId: string | null,
  accessToken: string,
  expiresAt: Date
): void {
  const db = getDatabase();
  db.run(
    `INSERT INTO tokens (id, user_id, team_id, access_token, expires_at) VALUES (?, ?, ?, ?, ?)`,
    [id, userId, teamId, accessToken, expiresAt.toISOString()]
  );
}

export function getTokenByAccessToken(accessToken: string): TokenRecord | null {
  const db = getDatabase();
  const result = db.query(
    `SELECT * FROM tokens WHERE access_token = ? AND expires_at > datetime('now')`
  ).get(accessToken) as TokenRecord | null;
  return result;
}

export function deleteToken(accessToken: string): void {
  const db = getDatabase();
  db.run(`DELETE FROM tokens WHERE access_token = ?`, [accessToken]);
}

export function cleanupExpiredTokens(): void {
  const db = getDatabase();
  db.run(`DELETE FROM tokens WHERE expires_at < datetime('now')`);
}
