/**
 * Session / operation CRUD helpers.
 *
 * Refactored from SQLiteAdapter.saveOperation, getOperation, listOperations,
 * and listOperationsByType.
 */

import type { Database } from 'bun:sqlite';
import { getDb } from './db';

/** Shape returned by the operation query helpers. */
export interface OperationRecord {
  id: string;
  timestamp: Date;
  type: string;
  command: string;
  input?: string;
  output?: string;
  status: string;
  durationMs?: number;
  model?: string;
  tokensUsed?: number;
  costUsd?: number;
  metadata?: Record<string, unknown>;
}

/** Shape accepted when persisting a new operation. */
export interface SaveOperationInput {
  id: string;
  timestamp: Date;
  type: string;
  command: string;
  input?: string;
  output?: string;
  status: string;
  durationMs?: number;
  model?: string;
  tokensUsed?: number;
  costUsd?: number;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function rowToOperation(row: any): OperationRecord {
  return {
    id: row.id,
    timestamp: new Date(row.timestamp),
    type: row.type,
    command: row.command,
    input: row.input,
    output: row.output,
    status: row.status,
    durationMs: row.duration_ms,
    model: row.model,
    tokensUsed: row.tokens_used,
    costUsd: row.cost_usd,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist a single operation record.
 */
export function saveOperation(operation: SaveOperationInput, db?: Database): void {
  const d = db || getDb();
  const stmt = d.prepare(`
    INSERT INTO operations (id, timestamp, type, command, input, output, status, duration_ms, model, tokens_used, cost_usd, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    operation.id,
    operation.timestamp.toISOString(),
    operation.type,
    operation.command,
    operation.input || null,
    operation.output || null,
    operation.status,
    operation.durationMs || null,
    operation.model || null,
    operation.tokensUsed || null,
    operation.costUsd || null,
    operation.metadata ? JSON.stringify(operation.metadata) : null,
  );
}

/**
 * Retrieve a single operation by id.
 */
export function getOperation(id: string, db?: Database): OperationRecord | null {
  const d = db || getDb();
  const stmt = d.prepare('SELECT * FROM operations WHERE id = ?');
  const row: any = stmt.get(id);

  if (!row) {
    return null;
  }

  return rowToOperation(row);
}

/**
 * List operations ordered by timestamp descending.
 */
export function listOperations(limit: number = 50, offset: number = 0, db?: Database): OperationRecord[] {
  const d = db || getDb();
  const stmt = d.prepare(`
    SELECT * FROM operations
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `);

  const rows: any[] = stmt.all(limit, offset) as any[];
  return rows.map(row => rowToOperation(row));
}

/**
 * List operations filtered by type, ordered by timestamp descending.
 */
export function listOperationsByType(type: string, limit: number = 50, offset: number = 0, db?: Database): OperationRecord[] {
  const d = db || getDb();
  const stmt = d.prepare(`
    SELECT * FROM operations
    WHERE type = ?
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `);

  const rows: any[] = stmt.all(type, limit, offset) as any[];
  return rows.map(row => rowToOperation(row));
}
