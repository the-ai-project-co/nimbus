/**
 * SQLite Compatibility Layer
 *
 * Uses bun:sqlite when running under Bun, falls back to better-sqlite3
 * under Node.js. Both libraries have nearly identical APIs.
 *
 * Exports:
 *   - `Database` (value) -- the constructor, usable as `new Database(path)`
 *   - `Database` (type)  -- the instance interface, usable as `db: Database`
 *
 * This dual export mirrors how a native `class` declaration works in
 * TypeScript: the same identifier serves as both a value and a type.
 */

import { isBun } from './runtime';

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/** Prepared statement returned by Database.prepare(). */
export interface Statement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  finalize?(): void;
}

/**
 * Minimal Database instance interface shared by bun:sqlite and better-sqlite3.
 *
 * When consumer code writes `db: Database`, TypeScript resolves
 * the *type* side of the `Database` export -- which is this interface.
 */
interface DatabaseI {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  close(): void;
  transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T;

  // bun:sqlite specific methods used throughout the codebase
  run(sql: string, params?: unknown[]): unknown;
  query(sql: string): Statement;

  // Allow accessing additional runtime-specific properties
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Runtime selection
// ---------------------------------------------------------------------------

// Re-export the Database class from the appropriate backend.
// Both bun:sqlite and better-sqlite3 expose a compatible API:
//   new Database(path), db.exec(sql), db.prepare(sql).run/get/all, db.close()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _Impl: any;

if (isBun) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  _Impl = require('bun:sqlite').Database;
} else {
  // Try better-sqlite3 first (persistent, fast, native)
  let betterSqlite3Loaded = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const BetterSqlite3 = require('better-sqlite3');
    // Polyfill bun:sqlite-compatible methods on better-sqlite3 instances
    const OrigProto = BetterSqlite3.prototype;
    if (!OrigProto.run) {
      OrigProto.run = function (sql: string, params?: unknown[]) {
        const stmt = this.prepare(sql);
        return params ? stmt.run(...params) : stmt.run();
      };
    }
    if (!OrigProto.query) {
      OrigProto.query = function (sql: string) {
        return this.prepare(sql);
      };
    }
    _Impl = BetterSqlite3;
    betterSqlite3Loaded = true;
  } catch {
    // better-sqlite3 native build unavailable (ARM, Windows without build tools, etc.)
    // Fall through to sql.js pure-WASM fallback with file persistence
  }

  if (!betterSqlite3Loaded) {
    // sql.js fallback — pure WASM, works everywhere, with file persistence via node:fs
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const initSqlJs = require('sql.js');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('node:fs') as typeof import('node:fs');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type SqlJsDb = any;
      let resolvedSQL: { Database: new (data?: Buffer) => SqlJsDb } | null = null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const getSQL = (): Promise<{ Database: new (data?: Buffer) => SqlJsDb }> => {
        if (resolvedSQL) return Promise.resolve(resolvedSQL);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (initSqlJs as any)().then((s: any) => { resolvedSQL = s; return s; });
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      class SqlJsDatabase {
        private db: SqlJsDb | null = null;
        private dbPath: string;
        private initPromise: Promise<void>;

        constructor(dbPath: string) {
          this.dbPath = dbPath;
          this.initPromise = getSQL().then(SQL => {
            // Load existing DB from disk if it exists
            let data: Buffer | undefined;
            try {
              if (fs.existsSync(dbPath)) {
                data = fs.readFileSync(dbPath);
              }
            } catch { /* ignore */ }
            this.db = data ? new SQL.Database(data) : new SQL.Database();
          });
        }

        /** Persist the current db to disk (called after every write). */
        private persist(): void {
          if (!this.db) return;
          try {
            const data = this.db.export();
            const dir = require('node:path').dirname(this.dbPath);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(this.dbPath, data);
          } catch { /* non-critical */ }
        }

        private getDb(): SqlJsDb {
          if (!this.db) throw new Error('sql.js database not yet initialised');
          return this.db;
        }

        exec(sql: string): void {
          this.getDb().run(sql);
          this.persist();
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prepare(sql: string): any {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const self = this;
          return {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            run: (...params: unknown[]) => {
              const stmt = self.getDb().prepare(sql);
              stmt.run(params as any[]);
              stmt.free();
              self.persist();
              return {};
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            get: (...params: unknown[]) => {
              const stmt = self.getDb().prepare(sql);
              stmt.bind(params as any[]);
              const row = stmt.step() ? stmt.getAsObject() : undefined;
              stmt.free();
              return row;
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            all: (...params: unknown[]) => {
              const stmt = self.getDb().prepare(sql);
              stmt.bind(params as any[]);
              const rows: unknown[] = [];
              while (stmt.step()) rows.push(stmt.getAsObject());
              stmt.free();
              return rows;
            },
            finalize: () => { /* no-op for sql.js */ },
          };
        }

        close(): void {
          this.persist();
          this.db?.close();
          this.db = null;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (...args: any[]) => {
            this.getDb().run('BEGIN');
            try {
              const r = fn(...args);
              this.getDb().run('COMMIT');
              this.persist();
              return r;
            } catch (e) {
              try { this.getDb().run('ROLLBACK'); } catch { /* ignore */ }
              throw e;
            }
          };
        }

        run(sql: string, params?: unknown[]): unknown {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          params ? this.getDb().run(sql, params as any[]) : this.getDb().run(sql);
          this.persist();
          return {};
        }

        query(sql: string) { return this.prepare(sql); }
      }

      _Impl = SqlJsDatabase;
    } catch {
      throw new Error(
        'Nimbus requires either the Bun runtime (bun:sqlite), better-sqlite3, or sql.js.\n' +
          'Install: npm install better-sqlite3\n' +
          'Or:      npm install sql.js\n' +
          'Or install Bun: curl -fsSL https://bun.sh/install | bash'
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Dual export: value + type under the same name
// ---------------------------------------------------------------------------

/**
 * The Database constructor at runtime.
 *
 * TypeScript resolves `Database` to either the *value* (constructor) or
 * the *type* (instance interface) depending on context:
 *   - `new Database(path)` -- uses the value
 *   - `db: Database`       -- uses the type (the interface below)
 */
const Database = _Impl as { new (path: string): DatabaseI };

/** The instance type, exported under the same name for type-position use. */
type Database = DatabaseI;

export { Database };
