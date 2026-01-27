import { Database } from 'bun:sqlite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '@nimbus/shared-utils';

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
