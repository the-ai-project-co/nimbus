/**
 * Nimbus unified SQLite persistence layer.
 *
 * Re-exports every public symbol from the individual domain modules so that
 * consumers can do:
 *
 *   import { getDb, saveOperation, setConfig, ... } from '../state';
 */

// Database lifecycle
export { getDb, getTestDb, closeDb } from './db';

// Schema / migrations
export { runMigrations } from './schema';

// Domain modules
export * from './sessions';
export * from './messages';
export * from './config';
export * from './artifacts';
export * from './audit';
export * from './credentials';
export * from './teams';
export * from './billing';
export * from './checkpoints';
export * from './projects';
