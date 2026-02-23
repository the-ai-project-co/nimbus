/**
 * Auth token and device-code management helpers.
 *
 * Refactored from the auth-service database adapter
 * (services/auth-service/src/db/adapter.ts) into standalone functions
 * that operate against the unified Nimbus database.
 */

import type { Database } from 'bun:sqlite';
import { getDb } from './db';

/** Row shape for the device_codes table. */
export interface DeviceCodeRecord {
  deviceCode: string;
  userCode: string;
  clientId: string | null;
  scope: string | null;
  status: string;
  token: string | null;
  expiresAt: string;
  createdAt: string;
}

/** Row shape for the tokens table. */
export interface TokenRecord {
  id: string;
  userId: string | null;
  token: string;
  type: string;
  expiresAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Device Code helpers
// ---------------------------------------------------------------------------

/**
 * Persist a new device code for the OAuth device-authorization flow.
 */
export function saveDeviceCode(
  deviceCode: string,
  userCode: string,
  expiresAt: Date,
  clientId?: string,
  scope?: string,
  db?: Database,
): void {
  const d = db || getDb();
  const stmt = d.prepare(`
    INSERT INTO device_codes (device_code, user_code, client_id, scope, status, expires_at)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `);

  stmt.run(
    deviceCode,
    userCode,
    clientId || null,
    scope || null,
    expiresAt.toISOString(),
  );
}

/**
 * Retrieve a device code record by its device_code value.
 */
export function getDeviceCode(deviceCode: string, db?: Database): DeviceCodeRecord | null {
  const d = db || getDb();
  const stmt = d.prepare('SELECT * FROM device_codes WHERE device_code = ?');
  const row: any = stmt.get(deviceCode);

  if (!row) {
    return null;
  }

  return {
    deviceCode: row.device_code,
    userCode: row.user_code,
    clientId: row.client_id,
    scope: row.scope,
    status: row.status,
    token: row.token,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

/**
 * Update the status (and optionally the associated token) of a device code.
 */
export function updateDeviceCodeStatus(
  deviceCode: string,
  status: string,
  token?: string,
  db?: Database,
): void {
  const d = db || getDb();
  const stmt = d.prepare(`
    UPDATE device_codes
    SET status = ?, token = COALESCE(?, token)
    WHERE device_code = ?
  `);

  stmt.run(status, token || null, deviceCode);
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/**
 * Persist an authentication token.
 */
export function saveToken(
  id: string,
  token: string,
  type: string = 'access',
  userId?: string,
  expiresAt?: Date,
  db?: Database,
): void {
  const d = db || getDb();
  const stmt = d.prepare(`
    INSERT INTO tokens (id, user_id, token, type, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    userId || null,
    token,
    type,
    expiresAt ? expiresAt.toISOString() : null,
  );
}

/**
 * Retrieve a token record by its token string value.
 */
export function getToken(token: string, db?: Database): TokenRecord | null {
  const d = db || getDb();
  const stmt = d.prepare('SELECT * FROM tokens WHERE token = ?');
  const row: any = stmt.get(token);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    token: row.token,
    type: row.type,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

/**
 * Delete a token by its token string value.
 */
export function deleteToken(token: string, db?: Database): void {
  const d = db || getDb();
  const stmt = d.prepare('DELETE FROM tokens WHERE token = ?');
  stmt.run(token);
}
