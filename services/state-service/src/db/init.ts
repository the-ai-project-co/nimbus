import { Database } from 'bun:sqlite';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { logger } from '@nimbus/shared-utils';
import { SQLiteAdapter } from '../storage/sqlite-adapter';

let dbInstance: Database | null = null;
let adapterInstance: SQLiteAdapter | null = null;
let initPromise: Promise<{ db: Database; adapter: SQLiteAdapter }> | null = null;

/**
 * Run pending database migrations from the migrations/ directory.
 * Migration files must be named with a numeric prefix (e.g. 001_initial.sql).
 * Each migration is executed inside a transaction and its version is recorded
 * in the schema_version table so it is never applied twice.
 */
export function runMigrations(db: Database): void {
  // Ensure the schema_version tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Determine the current schema version
  const row = db.query('SELECT COALESCE(MAX(version), 0) AS current_version FROM schema_version').get() as { current_version: number };
  const currentVersion = row.current_version;

  // Locate migration files
  const migrationsDir = join(import.meta.dir, 'migrations');
  if (!existsSync(migrationsDir)) {
    logger.debug('No migrations directory found, skipping migrations');
    return;
  }

  const files = readdirSync(migrationsDir)
    .filter((f: string) => f.endsWith('.sql'))
    .sort();

  let applied = 0;

  for (const file of files) {
    // Extract the numeric version prefix (e.g. "001" from "001_initial.sql")
    const match = file.match(/^(\d+)/);
    if (!match) {
      logger.warn(`Skipping migration file with no numeric prefix: ${file}`);
      continue;
    }

    const version = parseInt(match[1], 10);
    if (version <= currentVersion) {
      continue; // Already applied
    }

    const migrationPath = join(migrationsDir, file);
    const sql = readFileSync(migrationPath, 'utf-8');

    logger.info(`Applying migration ${file} (version ${version})`);

    // Run the migration inside a transaction for atomicity
    db.exec('BEGIN TRANSACTION;');
    try {
      db.exec(sql);
      db.exec(`INSERT INTO schema_version (version) VALUES (${version});`);
      db.exec('COMMIT;');
      applied++;
      logger.info(`Migration ${file} applied successfully`);
    } catch (error) {
      db.exec('ROLLBACK;');
      logger.error(`Migration ${file} failed, rolled back`, error);
      throw error;
    }
  }

  if (applied > 0) {
    logger.info(`Applied ${applied} migration(s)`);
  } else {
    logger.debug('No new migrations to apply');
  }
}

export async function initializeDatabase(dbPath: string): Promise<Database> {
  try {
    logger.info(`Initializing database at ${dbPath}`);

    // Open database (creates if doesn't exist)
    const db = new Database(dbPath);

    // B1: Enable WAL mode for better concurrent read/write performance
    db.exec('PRAGMA journal_mode=WAL;');

    // B2: Enable foreign key constraint enforcement
    db.exec('PRAGMA foreign_keys=ON;');

    // B3: Create schema_version table for migration tracking
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Try to run migrations first
    const migrationsDir = join(import.meta.dir, 'migrations');
    if (existsSync(migrationsDir)) {
      const migrationFiles = readdirSync(migrationsDir).filter((f: string) => f.endsWith('.sql'));
      if (migrationFiles.length > 0) {
        runMigrations(db);
        logger.info('Database initialized successfully via migrations');
        return db;
      }
    }

    // Fallback: if no migration files found, execute schema.sql directly
    // This ensures backward compatibility with existing deployments
    const schemaPath = join(import.meta.dir, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    logger.info('Database initialized successfully via schema.sql fallback');
    return db;
  } catch (error) {
    logger.error('Failed to initialize database', error);
    throw error;
  }
}

export async function initDatabase(): Promise<{ db: Database; adapter: SQLiteAdapter }> {
  // Return cached instances if available
  if (dbInstance && adapterInstance) {
    return { db: dbInstance, adapter: adapterInstance };
  }

  // If initialization is in progress, wait for it
  if (initPromise) {
    return initPromise;
  }

  // Start initialization and cache the promise
  initPromise = (async () => {
    const dbPath = process.env.DATABASE_PATH || join(homedir(), '.nimbus', 'nimbus.db');
    dbInstance = await initializeDatabase(dbPath);
    adapterInstance = new SQLiteAdapter(dbInstance);
    initPromise = null; // Clear promise after completion
    return { db: dbInstance, adapter: adapterInstance };
  })();

  return initPromise;
}
