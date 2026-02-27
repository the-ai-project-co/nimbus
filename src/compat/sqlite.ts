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
    throw new Error(
      'Nimbus requires either the Bun runtime (bun:sqlite) or the better-sqlite3 package.\n' +
        'Install better-sqlite3: npm install better-sqlite3\n' +
        'Or install Bun: curl -fsSL https://bun.sh/install | bash'
    );
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
