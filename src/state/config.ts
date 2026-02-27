/**
 * Config key-value store helpers.
 *
 * Refactored from SQLiteAdapter.setConfig, getConfig, and getAllConfig.
 */

import type { Database } from '../compat/sqlite';
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

  try {
    return JSON.parse(row.value);
  } catch {
    // Corrupted config value — treat as missing
    return null;
  }
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
    try {
      config[row.key] = JSON.parse(row.value);
    } catch {
      // Skip corrupted config entries
    }
  }

  return config;
}
