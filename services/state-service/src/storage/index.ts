import { Database } from 'bun:sqlite';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { logger, getEnv } from '@nimbus/shared-utils';
import { initializeDatabase } from '../db/init';
import { SQLiteAdapter } from './sqlite-adapter';
import { MemoryAdapter } from './memory-adapter';

export type StorageAdapter = SQLiteAdapter | MemoryAdapter;

let _adapter: StorageAdapter | null = null;

/**
 * Get the current storage adapter singleton.
 * Must call createStorageAdapter() first during startup.
 */
export function getAdapter(): StorageAdapter {
  if (!_adapter) {
    // Fallback to in-memory adapter if not initialized
    _adapter = new MemoryAdapter();
  }
  return _adapter;
}

export async function createStorageAdapter(): Promise<StorageAdapter> {
  const dbType = getEnv('DATABASE_TYPE', 'sqlite');

  if (dbType === 'memory') {
    logger.info('Using in-memory storage adapter');
    _adapter = new MemoryAdapter();
    return _adapter;
  }

  // SQLite (default)
  const dbPath = getEnv('DATABASE_PATH', './data/nimbus.db');
  const dbDir = join(dbPath, '..');

  // Ensure data directory exists
  mkdirSync(dbDir, { recursive: true });

  const db = await initializeDatabase(dbPath);
  logger.info(`Using SQLite storage adapter at ${dbPath}`);

  _adapter = new SQLiteAdapter(db);
  return _adapter;
}

export { SQLiteAdapter } from './sqlite-adapter';
export { MemoryAdapter } from './memory-adapter';
