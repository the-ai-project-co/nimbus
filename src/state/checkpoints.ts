/**
 * Checkpoint save / restore helpers for resumable operations.
 *
 * Refactored from SQLiteAdapter.saveCheckpoint, getCheckpoint,
 * getLatestCheckpoint, listCheckpoints, and deleteCheckpoints.
 */

import type { Database } from '../compat/sqlite';
import { getDb } from './db';

/** Shape returned by checkpoint queries. */
export interface CheckpointRecord {
  id: string;
  operationId: string;
  step: number;
  state: Record<string, unknown>;
  createdAt: string;
}

/** Abbreviated shape used by listCheckpoints. */
export interface CheckpointListItem {
  id: string;
  step: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist or overwrite a checkpoint for a given operation and step.
 */
export function saveCheckpoint(
  id: string,
  operationId: string,
  step: number,
  state: Record<string, unknown>,
  db?: Database
): void {
  const d = db || getDb();
  const stmt = d.prepare(`
    INSERT OR REPLACE INTO checkpoints (id, operation_id, step, state, created_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  stmt.run(id, operationId, step, JSON.stringify(state));
}

/**
 * Retrieve a single checkpoint by its id.
 */
export function getCheckpoint(id: string, db?: Database): CheckpointRecord | null {
  const d = db || getDb();
  const stmt = d.prepare('SELECT * FROM checkpoints WHERE id = ?');
  const row: any = stmt.get(id);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    operationId: row.operation_id,
    step: row.step,
    state: JSON.parse(row.state),
    createdAt: row.created_at,
  };
}

/**
 * Retrieve the most recent checkpoint (highest step) for an operation.
 */
export function getLatestCheckpoint(operationId: string, db?: Database): CheckpointRecord | null {
  const d = db || getDb();
  const stmt = d.prepare(`
    SELECT * FROM checkpoints WHERE operation_id = ? ORDER BY step DESC LIMIT 1
  `);
  const row: any = stmt.get(operationId);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    operationId: row.operation_id,
    step: row.step,
    state: JSON.parse(row.state),
    createdAt: row.created_at,
  };
}

/**
 * List all checkpoints for an operation ordered by step ascending.
 */
export function listCheckpoints(operationId: string, db?: Database): CheckpointListItem[] {
  const d = db || getDb();
  const stmt = d.prepare(`
    SELECT id, step, created_at FROM checkpoints WHERE operation_id = ? ORDER BY step ASC
  `);

  return (stmt.all(operationId) as any[]).map(row => ({
    id: row.id,
    step: row.step,
    createdAt: row.created_at,
  }));
}

/**
 * Delete all checkpoints associated with an operation.
 */
export function deleteCheckpoints(operationId: string, db?: Database): void {
  const d = db || getDb();
  const stmt = d.prepare('DELETE FROM checkpoints WHERE operation_id = ?');
  stmt.run(operationId);
}
