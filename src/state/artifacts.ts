/**
 * Artifact CRUD helpers.
 *
 * Refactored from SQLiteAdapter.saveArtifact, getArtifact, listArtifacts,
 * and deleteArtifact.
 */

import type { Database } from 'bun:sqlite';
import { getDb } from './db';

/** Shape returned by artifact query helpers. */
export interface ArtifactRecord {
  id: string;
  conversationId: string | null;
  name: string;
  type: string;
  content: string;
  language: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: any | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist or update an artifact.  Uses INSERT ... ON CONFLICT to upsert.
 */
export function saveArtifact(
  id: string,
  conversationId: string | null,
  name: string,
  type: string,
  content: string,
  language?: string,
  metadata?: any,
  db?: Database,
): void {
  const d = db || getDb();
  const stmt = d.prepare(`
    INSERT INTO artifacts (id, conversation_id, name, type, content, language, created_at, updated_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
    ON CONFLICT(id) DO UPDATE SET
      conversation_id = excluded.conversation_id,
      name = excluded.name,
      type = excluded.type,
      content = excluded.content,
      language = excluded.language,
      updated_at = CURRENT_TIMESTAMP,
      metadata = excluded.metadata
  `);

  stmt.run(
    id,
    conversationId || null,
    name,
    type,
    content,
    language || null,
    metadata ? JSON.stringify(metadata) : null,
  );
}

/**
 * Retrieve a single artifact by id.
 */
export function getArtifact(id: string, db?: Database): ArtifactRecord | null {
  const d = db || getDb();
  const stmt = d.prepare('SELECT * FROM artifacts WHERE id = ?');
  const row: any = stmt.get(id);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    conversationId: row.conversation_id,
    name: row.name,
    type: row.type,
    content: row.content,
    language: row.language,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  };
}

/**
 * List artifacts with optional type and conversation filters.
 */
export function listArtifacts(
  type?: string,
  conversationId?: string,
  limit: number = 50,
  offset: number = 0,
  db?: Database,
): ArtifactRecord[] {
  const d = db || getDb();

  let query = 'SELECT * FROM artifacts';
  const params: any[] = [];
  const conditions: string[] = [];

  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }

  if (conversationId) {
    conditions.push('conversation_id = ?');
    params.push(conversationId);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const stmt = d.prepare(query);
  const rows: any[] = stmt.all(...params) as any[];

  return rows.map(row => ({
    id: row.id,
    conversationId: row.conversation_id,
    name: row.name,
    type: row.type,
    content: row.content,
    language: row.language,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  }));
}

/**
 * Delete an artifact by id.
 */
export function deleteArtifact(id: string, db?: Database): void {
  const d = db || getDb();
  const stmt = d.prepare('DELETE FROM artifacts WHERE id = ?');
  stmt.run(id);
}
