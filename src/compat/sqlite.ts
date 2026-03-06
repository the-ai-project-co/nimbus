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
  } catch {
    // G1: Path 3 — sql.js fallback (pure WASM, no native build required)
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const initSqlJs = require('sql.js');
      process.stderr.write(
        '[nimbus] WARNING: Running in in-memory SQLite mode (no persistence).\n' +
        '[nimbus] Install better-sqlite3 for full functionality: npm install better-sqlite3\n'
      );

      let sqlJsDb: { run(sql: string, params?: unknown[]): void; prepare(sql: string): unknown; close(): void } | null = null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const getSqlJsDb = (): any => {
        if (!sqlJsDb) throw new Error('sql.js database not yet initialised — call new Database() first');
        return sqlJsDb;
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      class SqlJsDatabase {
        constructor(_path: string) {
          // Synchronously initialise — sql.js init is async but we use a trick:
          // initSqlJs() returns a promise; we store a sentinel and resolve lazily.
          // For simplicity, initialise synchronously with the default WASM bundle.
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const SQL = (initSqlJs as any)({ locateFile: () => '' });
            if (SQL && SQL.then) {
              // async — best-effort; DB will be ready after first await
              SQL.then((s: { Database: new () => typeof sqlJsDb }) => { sqlJsDb = new s.Database(); });
            } else {
              sqlJsDb = new (SQL as { Database: new () => typeof sqlJsDb }).Database();
            }
          } catch {
            // fallback: leave sqlJsDb null, operations will throw with clear message
          }
        }
        exec(sql: string): void { getSqlJsDb().run(sql); }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prepare(sql: string): any {
          const db = getSqlJsDb();
          const stmt = db.prepare(sql);
          return {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            run: (...params: unknown[]) => { stmt.run(params as any[]); return {}; },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            get: (...params: unknown[]) => { stmt.bind(params as any[]); return stmt.step() ? stmt.getAsObject() : undefined; },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            all: (...params: unknown[]) => { const rows: unknown[] = []; stmt.bind(params as any[]); while (stmt.step()) rows.push(stmt.getAsObject()); return rows; },
            finalize: () => stmt.free(),
          };
        }
        close(): void { getSqlJsDb().close(); sqlJsDb = null; }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (...args: any[]) => {
            getSqlJsDb().run('BEGIN');
            try { const r = fn(...args); getSqlJsDb().run('COMMIT'); return r; }
            catch (e) { try { getSqlJsDb().run('ROLLBACK'); } catch { /* ignore */ } throw e; }
          };
        }
        run(sql: string, params?: unknown[]): unknown {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return params ? getSqlJsDb().run(sql, params as any[]) : getSqlJsDb().run(sql);
        }
        query(sql: string) { return this.prepare(sql); }
      }
      _Impl = SqlJsDatabase;
    } catch {
      throw new Error(
        'Nimbus requires either the Bun runtime (bun:sqlite) or the better-sqlite3 package.\n' +
          'Install better-sqlite3: npm install better-sqlite3\n' +
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
