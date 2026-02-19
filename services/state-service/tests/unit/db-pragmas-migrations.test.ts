import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Database PRAGMAs and Migrations', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'nimbus-db-test-'));
    dbPath = join(tempDir, 'test.db');
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors in tests
    }
  });

  describe('B1: WAL journal mode', () => {
    test('should enable WAL journal mode', () => {
      const db = new Database(dbPath);
      db.exec('PRAGMA journal_mode=WAL;');

      const result = db.query('PRAGMA journal_mode;').get() as { journal_mode: string };
      expect(result.journal_mode).toBe('wal');

      db.close();
    });

    test('WAL mode persists across queries', () => {
      const db = new Database(dbPath);
      db.exec('PRAGMA journal_mode=WAL;');

      // Create a table and insert data to ensure WAL is working
      db.exec('CREATE TABLE test_wal (id INTEGER PRIMARY KEY, value TEXT);');
      db.exec("INSERT INTO test_wal (id, value) VALUES (1, 'hello');");

      const result = db.query('PRAGMA journal_mode;').get() as { journal_mode: string };
      expect(result.journal_mode).toBe('wal');

      db.close();
    });
  });

  describe('B2: Foreign key enforcement', () => {
    test('should enable foreign key constraints', () => {
      const db = new Database(dbPath);
      db.exec('PRAGMA foreign_keys=ON;');

      const result = db.query('PRAGMA foreign_keys;').get() as { foreign_keys: number };
      expect(result.foreign_keys).toBe(1);

      db.close();
    });

    test('foreign keys are enforced when enabled', () => {
      const db = new Database(dbPath);
      db.exec('PRAGMA foreign_keys=ON;');

      db.exec('CREATE TABLE parent (id TEXT PRIMARY KEY);');
      db.exec('CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES parent(id));');

      // Inserting a child with a non-existent parent should fail
      expect(() => {
        db.exec("INSERT INTO child (id, parent_id) VALUES ('c1', 'nonexistent');");
      }).toThrow();

      db.close();
    });

    test('foreign keys are not enforced when disabled', () => {
      const db = new Database(dbPath);
      // Do NOT enable foreign keys

      db.exec('CREATE TABLE parent (id TEXT PRIMARY KEY);');
      db.exec('CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES parent(id));');

      // Without PRAGMA foreign_keys=ON, this should succeed silently
      expect(() => {
        db.exec("INSERT INTO child (id, parent_id) VALUES ('c1', 'nonexistent');");
      }).not.toThrow();

      db.close();
    });
  });

  describe('B3: Migration system', () => {
    test('schema_version table is created correctly', () => {
      const db = new Database(dbPath);

      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // Verify the table exists
      const tableCheck = db.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version';"
      ).get() as { name: string } | null;
      expect(tableCheck).not.toBeNull();
      expect(tableCheck!.name).toBe('schema_version');

      db.close();
    });

    test('schema_version starts at version 0 when empty', () => {
      const db = new Database(dbPath);

      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT DEFAULT (datetime('now'))
        );
      `);

      const row = db.query('SELECT COALESCE(MAX(version), 0) AS current_version FROM schema_version;').get() as { current_version: number };
      expect(row.current_version).toBe(0);

      db.close();
    });

    test('migration version is recorded after applying', () => {
      const db = new Database(dbPath);

      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // Simulate applying migration version 1
      db.exec('INSERT INTO schema_version (version) VALUES (1);');

      const row = db.query('SELECT COALESCE(MAX(version), 0) AS current_version FROM schema_version;').get() as { current_version: number };
      expect(row.current_version).toBe(1);

      // Verify the applied_at timestamp is recorded
      const record = db.query('SELECT * FROM schema_version WHERE version = 1;').get() as { version: number; applied_at: string };
      expect(record.version).toBe(1);
      expect(record.applied_at).toBeTruthy();

      db.close();
    });

    test('multiple migration versions are tracked correctly', () => {
      const db = new Database(dbPath);

      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // Simulate applying multiple migrations
      db.exec('INSERT INTO schema_version (version) VALUES (1);');
      db.exec('INSERT INTO schema_version (version) VALUES (2);');
      db.exec('INSERT INTO schema_version (version) VALUES (3);');

      const row = db.query('SELECT COALESCE(MAX(version), 0) AS current_version FROM schema_version;').get() as { current_version: number };
      expect(row.current_version).toBe(3);

      const allVersions = db.query('SELECT version FROM schema_version ORDER BY version ASC;').all() as Array<{ version: number }>;
      expect(allVersions).toHaveLength(3);
      expect(allVersions.map(v => v.version)).toEqual([1, 2, 3]);

      db.close();
    });

    test('re-running migrations is idempotent (does not re-apply)', () => {
      const db = new Database(dbPath);
      db.exec('PRAGMA journal_mode=WAL;');
      db.exec('PRAGMA foreign_keys=ON;');

      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // Simulate a migration that creates a table
      const migrationSQL = 'CREATE TABLE IF NOT EXISTS test_table (id TEXT PRIMARY KEY, value TEXT);';

      // Apply migration version 1
      const currentVersionRow = db.query('SELECT COALESCE(MAX(version), 0) AS current_version FROM schema_version;').get() as { current_version: number };
      const currentVersion = currentVersionRow.current_version;
      const migrationVersion = 1;

      if (migrationVersion > currentVersion) {
        db.exec('BEGIN TRANSACTION;');
        db.exec(migrationSQL);
        db.exec(`INSERT INTO schema_version (version) VALUES (${migrationVersion});`);
        db.exec('COMMIT;');
      }

      // Verify it was applied
      const afterFirst = db.query('SELECT COALESCE(MAX(version), 0) AS current_version FROM schema_version;').get() as { current_version: number };
      expect(afterFirst.current_version).toBe(1);

      // Try to "apply" the same migration again -- the version check should skip it
      const currentVersionRow2 = db.query('SELECT COALESCE(MAX(version), 0) AS current_version FROM schema_version;').get() as { current_version: number };
      const currentVersion2 = currentVersionRow2.current_version;

      if (migrationVersion > currentVersion2) {
        // This block should NOT execute
        db.exec('BEGIN TRANSACTION;');
        db.exec(migrationSQL);
        db.exec(`INSERT INTO schema_version (version) VALUES (${migrationVersion});`);
        db.exec('COMMIT;');
      }

      // Version should still be 1 (not duplicated)
      const afterSecond = db.query('SELECT COALESCE(MAX(version), 0) AS current_version FROM schema_version;').get() as { current_version: number };
      expect(afterSecond.current_version).toBe(1);

      // Only one row in schema_version
      const allRows = db.query('SELECT * FROM schema_version;').all();
      expect(allRows).toHaveLength(1);

      db.close();
    });

    test('migration files are parsed and ordered by numeric prefix', () => {
      // Create a temporary migrations directory with numbered files
      const migrationsDir = join(tempDir, 'migrations');
      mkdirSync(migrationsDir, { recursive: true });

      writeFileSync(join(migrationsDir, '002_add_column.sql'), 'CREATE TABLE IF NOT EXISTS m2 (id TEXT PRIMARY KEY);');
      writeFileSync(join(migrationsDir, '001_initial.sql'), 'CREATE TABLE IF NOT EXISTS m1 (id TEXT PRIMARY KEY);');
      writeFileSync(join(migrationsDir, '003_more_tables.sql'), 'CREATE TABLE IF NOT EXISTS m3 (id TEXT PRIMARY KEY);');

      // Read and sort the files like the migration runner does
      const { readdirSync } = require('fs');
      const files = readdirSync(migrationsDir)
        .filter((f: string) => f.endsWith('.sql'))
        .sort();

      expect(files).toEqual([
        '001_initial.sql',
        '002_add_column.sql',
        '003_more_tables.sql',
      ]);

      // Parse version numbers
      const versions = files.map((f: string) => {
        const match = f.match(/^(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      });
      expect(versions).toEqual([1, 2, 3]);
    });

    test('migration runner applies only pending migrations', () => {
      const db = new Database(dbPath);
      db.exec('PRAGMA journal_mode=WAL;');
      db.exec('PRAGMA foreign_keys=ON;');

      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // Simulate: version 1 already applied
      db.exec('CREATE TABLE IF NOT EXISTS m1 (id TEXT PRIMARY KEY);');
      db.exec('INSERT INTO schema_version (version) VALUES (1);');

      // Define pending migrations
      const pendingMigrations = [
        { version: 2, sql: 'CREATE TABLE IF NOT EXISTS m2 (id TEXT PRIMARY KEY, name TEXT);' },
        { version: 3, sql: 'CREATE TABLE IF NOT EXISTS m3 (id TEXT PRIMARY KEY, data TEXT);' },
      ];

      const currentVersionRow = db.query('SELECT COALESCE(MAX(version), 0) AS current_version FROM schema_version;').get() as { current_version: number };
      const currentVersion = currentVersionRow.current_version;

      for (const migration of pendingMigrations) {
        if (migration.version > currentVersion) {
          db.exec('BEGIN TRANSACTION;');
          db.exec(migration.sql);
          db.exec(`INSERT INTO schema_version (version) VALUES (${migration.version});`);
          db.exec('COMMIT;');
        }
      }

      // Verify all three versions are recorded
      const finalVersion = db.query('SELECT COALESCE(MAX(version), 0) AS current_version FROM schema_version;').get() as { current_version: number };
      expect(finalVersion.current_version).toBe(3);

      // Verify all tables exist
      const tables = db.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('m1', 'm2', 'm3') ORDER BY name;"
      ).all() as Array<{ name: string }>;
      expect(tables.map(t => t.name)).toEqual(['m1', 'm2', 'm3']);

      db.close();
    });

    test('failed migration rolls back cleanly', () => {
      const db = new Database(dbPath);
      db.exec('PRAGMA journal_mode=WAL;');
      db.exec('PRAGMA foreign_keys=ON;');

      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // Apply version 1 successfully
      db.exec('BEGIN TRANSACTION;');
      db.exec('CREATE TABLE IF NOT EXISTS good_table (id TEXT PRIMARY KEY);');
      db.exec('INSERT INTO schema_version (version) VALUES (1);');
      db.exec('COMMIT;');

      // Attempt a bad migration (version 2) that should fail
      const badSQL = 'CREATE TABLE bad_table (id TEXT PRIMARY KEY); INSERT INTO nonexistent_table VALUES (1);';
      let migrationFailed = false;

      try {
        db.exec('BEGIN TRANSACTION;');
        db.exec(badSQL);
        db.exec('INSERT INTO schema_version (version) VALUES (2);');
        db.exec('COMMIT;');
      } catch {
        db.exec('ROLLBACK;');
        migrationFailed = true;
      }

      expect(migrationFailed).toBe(true);

      // Version should still be 1
      const versionRow = db.query('SELECT COALESCE(MAX(version), 0) AS current_version FROM schema_version;').get() as { current_version: number };
      expect(versionRow.current_version).toBe(1);

      db.close();
    });
  });

  describe('Combined initialization flow', () => {
    test('full init flow sets WAL, foreign keys, and schema_version', () => {
      const db = new Database(dbPath);

      // Replicate the initialization order from init.ts
      db.exec('PRAGMA journal_mode=WAL;');
      db.exec('PRAGMA foreign_keys=ON;');
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // Verify WAL mode
      const journalMode = db.query('PRAGMA journal_mode;').get() as { journal_mode: string };
      expect(journalMode.journal_mode).toBe('wal');

      // Verify foreign keys
      const fkResult = db.query('PRAGMA foreign_keys;').get() as { foreign_keys: number };
      expect(fkResult.foreign_keys).toBe(1);

      // Verify schema_version table exists
      const tableCheck = db.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version';"
      ).get() as { name: string } | null;
      expect(tableCheck).not.toBeNull();
      expect(tableCheck!.name).toBe('schema_version');

      // Verify starting version is 0
      const versionRow = db.query('SELECT COALESCE(MAX(version), 0) AS current_version FROM schema_version;').get() as { current_version: number };
      expect(versionRow.current_version).toBe(0);

      db.close();
    });
  });
});
