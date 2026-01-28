import { Database } from 'bun:sqlite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { logger } from '@nimbus/shared-utils';
import { SQLiteAdapter } from '../storage/sqlite-adapter';

let dbInstance: Database | null = null;
let adapterInstance: SQLiteAdapter | null = null;

export async function initializeDatabase(dbPath: string): Promise<Database> {
  try {
    logger.info(`Initializing database at ${dbPath}`);

    // Open database (creates if doesn't exist)
    const db = new Database(dbPath);

    // Read and execute schema
    const schemaPath = join(import.meta.dir, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    // Execute schema statements
    db.exec(schema);

    logger.info('Database initialized successfully');
    return db;
  } catch (error) {
    logger.error('Failed to initialize database', error);
    throw error;
  }
}

export async function initDatabase(): Promise<{ db: Database; adapter: SQLiteAdapter }> {
  if (dbInstance && adapterInstance) {
    return { db: dbInstance, adapter: adapterInstance };
  }

  const dbPath = process.env.DATABASE_PATH || join(homedir(), '.nimbus', 'nimbus.db');
  dbInstance = await initializeDatabase(dbPath);
  adapterInstance = new SQLiteAdapter(dbInstance);

  return { db: dbInstance, adapter: adapterInstance };
}
