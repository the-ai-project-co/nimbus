import { Database } from 'bun:sqlite';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { logger, getEnv } from '@nimbus/shared-utils';
import { initializeDatabase } from '../db/init';
import { SQLiteAdapter } from './sqlite-adapter';
import { MemoryAdapter } from './memory-adapter';

export type StorageAdapter = SQLiteAdapter | MemoryAdapter;

export async function createStorageAdapter(): Promise<StorageAdapter> {
  const dbType = getEnv('DATABASE_TYPE', 'sqlite');

  if (dbType === 'memory') {
    logger.info('Using in-memory storage adapter');
    return new MemoryAdapter();
  }

  // SQLite (default)
  const dbPath = getEnv('DATABASE_PATH', './data/nimbus.db');
  const dbDir = join(dbPath, '..');

  // Ensure data directory exists
  mkdirSync(dbDir, { recursive: true });

  const db = await initializeDatabase(dbPath);
  logger.info(`Using SQLite storage adapter at ${dbPath}`);

  return new SQLiteAdapter(db);
}

export { SQLiteAdapter } from './sqlite-adapter';
export { MemoryAdapter } from './memory-adapter';
