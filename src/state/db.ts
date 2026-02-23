/**
 * Database singleton for the Nimbus unified SQLite persistence layer.
 *
 * Provides a lazily-initialized, WAL-mode SQLite database stored at
 * ~/.nimbus/nimbus.db (overridable via NIMBUS_DB_PATH).  An in-memory
 * variant is available for tests.
 */

import { Database } from 'bun:sqlite';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { runMigrations } from './schema';

let db: Database | null = null;

/**
 * Return the shared Database instance, creating it on first call.
 * The database file lives at `~/.nimbus/nimbus.db` unless the
 * `NIMBUS_DB_PATH` environment variable points elsewhere.
 */
export function getDb(): Database {
  if (!db) {
    const nimbusDir = path.join(os.homedir(), '.nimbus');
    if (!fs.existsSync(nimbusDir)) {
      fs.mkdirSync(nimbusDir, { recursive: true });
    }
    const dbPath = process.env.NIMBUS_DB_PATH || path.join(nimbusDir, 'nimbus.db');
    db = new Database(dbPath);
    db.exec('PRAGMA journal_mode=WAL');
    db.exec('PRAGMA foreign_keys=ON');
    runMigrations(db);
  }
  return db;
}

/**
 * Create a throwaway in-memory database for unit / integration tests.
 * Each call returns a fresh, fully-migrated instance.
 */
export function getTestDb(): Database {
  const testDb = new Database(':memory:');
  testDb.exec('PRAGMA journal_mode=WAL');
  testDb.exec('PRAGMA foreign_keys=ON');
  runMigrations(testDb);
  return testDb;
}

/**
 * Close the shared database connection and clear the singleton so that
 * a subsequent `getDb()` call will re-open it.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
