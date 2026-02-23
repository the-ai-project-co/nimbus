/**
 * Config key-value store helpers.
 *
 * Refactored from SQLiteAdapter.setConfig, getConfig, and getAllConfig.
 */

import type { Database } from 'bun:sqlite';
import { getDb } from './db';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Set (insert or replace) a configuration value.
 * The value is JSON-serialised before storage.
 */
export function setConfig(key: string, value: any, db?: Database): void {
  const d = db || getDb();
  const stmt = d.prepare(`
    INSERT OR REPLACE INTO config (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `);

  stmt.run(key, JSON.stringify(value));
}

/**
 * Retrieve a single configuration value by key.
 * Returns `null` when the key does not exist.
 */
export function getConfig(key: string, db?: Database): any | null {
  const d = db || getDb();
  const stmt = d.prepare('SELECT value FROM config WHERE key = ?');
  const row: any = stmt.get(key);

  if (!row) {
    return null;
  }

  return JSON.parse(row.value);
}

/**
 * Retrieve every configuration entry as a flat key-value object.
 */
export function getAllConfig(db?: Database): Record<string, any> {
  const d = db || getDb();
  const stmt = d.prepare('SELECT key, value FROM config');
  const rows: any[] = stmt.all() as any[];

  const config: Record<string, any> = {};
  for (const row of rows) {
    config[row.key] = JSON.parse(row.value);
  }

  return config;
}
