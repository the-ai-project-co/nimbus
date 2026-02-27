/**
 * Message / conversation CRUD helpers.
 *
 * Refactored from SQLiteAdapter.saveConversation, getConversation,
 * listConversations, and deleteConversation.
 */

import type { Database } from '../compat/sqlite';
import { getDb } from './db';

/** Shape returned by conversation query helpers. */
export interface ConversationRecord {
  id: string;
  title: string;
  messages: any[];
  model: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: any | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist or update a conversation.  Uses INSERT ... ON CONFLICT to upsert.
 */
export function saveConversation(
  id: string,
  title: string,
  messages: any[],
  model?: string,
  metadata?: any,
  db?: Database
): void {
  const d = db || getDb();
  const stmt = d.prepare(`
    INSERT INTO conversations (id, title, messages, model, created_at, updated_at, metadata)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      messages = excluded.messages,
      model = excluded.model,
      updated_at = CURRENT_TIMESTAMP,
      metadata = excluded.metadata
  `);

  stmt.run(
    id,
    title,
    JSON.stringify(messages),
    model || null,
    metadata ? JSON.stringify(metadata) : null
  );
}

/**
 * Retrieve a single conversation by id.
 */
export function getConversation(id: string, db?: Database): ConversationRecord | null {
  const d = db || getDb();
  const stmt = d.prepare('SELECT * FROM conversations WHERE id = ?');
  const row: any = stmt.get(id);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    messages: JSON.parse(row.messages),
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  };
}

/**
 * List conversations ordered by most-recently updated first.
 */
export function listConversations(
  limit: number = 50,
  offset: number = 0,
  db?: Database
): ConversationRecord[] {
  const d = db || getDb();
  const stmt = d.prepare(`
    SELECT * FROM conversations
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `);

  const rows: any[] = stmt.all(limit, offset) as any[];
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    messages: JSON.parse(row.messages),
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  }));
}

/**
 * Delete a conversation by id.
 */
export function deleteConversation(id: string, db?: Database): void {
  const d = db || getDb();
  const stmt = d.prepare('DELETE FROM conversations WHERE id = ?');
  stmt.run(id);
}
