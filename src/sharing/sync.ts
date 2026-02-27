/**
 * Session Sharing — Generate share IDs and sync session data
 *
 * Provides local sharing via the nimbus serve API.
 * Shares are persisted to the SQLite `shares` table so they survive restarts.
 * For hosted sharing via Supabase, the astron-landing web UI handles
 * the sync directly using its existing Supabase integration.
 */

import { getConversation as _getConversation } from '../state/conversations';
import { SessionManager as _SessionManager } from '../sessions/manager';
import type { LLMMessage } from '../llm/types';

/**
 * Dependency overrides for testing. Set these before calling shareSession/etc.
 * In production code these remain undefined and the real implementations are used.
 */
export const _deps = {
  getConversation: undefined as ((id: string) => any) | undefined,
  getSessionManager: undefined as (() => { get: (id: string) => any }) | undefined,
};

function getConversation(id: string) {
  return (_deps.getConversation ?? _getConversation)(id);
}

function getSessionManager() {
  return _deps.getSessionManager ? _deps.getSessionManager() : _SessionManager.getInstance();
}

/** A shared session snapshot. */
export interface SharedSession {
  /** Unique share ID. */
  id: string;
  /** Session ID this share was created from. */
  sessionId: string;
  /** Session name. */
  name: string;
  /** Conversation messages at time of sharing. */
  messages: LLMMessage[];
  /** Model used. */
  model: string;
  /** Session mode. */
  mode: string;
  /** Total cost. */
  costUSD: number;
  /** Total tokens used. */
  tokenCount: number;
  /** When the share was created. */
  createdAt: string;
  /** When the share expires (30-day TTL). */
  expiresAt: string;
  /** Whether this is a live-updating share. */
  isLive: boolean;
  /** Access token for write access (optional). */
  writeToken?: string;
}

/**
 * Lazily import the DB to avoid circular dependency.
 */
function getDb() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getDb: _getDb } = require('../state/db');
    return _getDb();
  } catch {
    return null;
  }
}

/**
 * Generate a short, URL-safe share ID.
 */
function generateShareId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate a secure write token for controlling write access.
 */
function generateWriteToken(): string {
  return crypto.randomUUID();
}

/**
 * Create a share for a session.
 */
export function shareSession(
  sessionId: string,
  options?: {
    isLive?: boolean;
    ttlDays?: number;
  }
): SharedSession | null {
  const sessionManager = getSessionManager();
  const session = sessionManager.get(sessionId);
  if (!session) {
    return null;
  }

  const conversation = getConversation(sessionId);
  if (!conversation) {
    return null;
  }

  const ttlDays = options?.ttlDays ?? 30;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

  const shared: SharedSession = {
    id: generateShareId(),
    sessionId,
    name: session.name,
    messages: conversation.messages,
    model: session.model,
    mode: session.mode,
    costUSD: session.costUSD,
    tokenCount: session.tokenCount,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    isLive: options?.isLive ?? false,
    writeToken: generateWriteToken(),
  };

  // Persist to SQLite
  const db = getDb();
  if (db) {
    try {
      db.run(
        `INSERT INTO shares (id, session_id, name, messages, model, mode, cost_usd, token_count, is_live, write_token, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          shared.id,
          shared.sessionId,
          shared.name,
          JSON.stringify(shared.messages),
          shared.model,
          shared.mode,
          shared.costUSD,
          shared.tokenCount,
          shared.isLive ? 1 : 0,
          shared.writeToken,
          shared.createdAt,
          shared.expiresAt,
        ]
      );
    } catch {
      // Non-critical — share is still returned but won't survive restart
    }
  }

  return shared;
}

/**
 * Convert a raw SQLite row to a SharedSession object.
 */
function rowToSharedSession(row: any, includeWriteToken = false): SharedSession {
  const result: SharedSession = {
    id: row.id,
    sessionId: row.session_id,
    name: row.name,
    messages: JSON.parse(row.messages),
    model: row.model || '',
    mode: row.mode || '',
    costUSD: row.cost_usd || 0,
    tokenCount: row.token_count || 0,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    isLive: !!row.is_live,
  };
  if (includeWriteToken) {
    result.writeToken = row.write_token;
  }
  return result;
}

/**
 * Get a shared session by share ID.
 * If the share is live, refresh the messages from the current session.
 */
export function getSharedSession(shareId: string): SharedSession | null {
  const db = getDb();
  if (!db) {
    return null;
  }

  try {
    const now = new Date().toISOString();
    const row = db
      .query(`SELECT * FROM shares WHERE id = ? AND expires_at > ?`)
      .get(shareId, now) as any;

    if (!row) {
      return null;
    }

    const shared = rowToSharedSession(row);

    // Refresh messages for live shares
    if (shared.isLive) {
      const conversation = getConversation(shared.sessionId);
      if (conversation) {
        shared.messages = conversation.messages;
        // Update stored messages
        try {
          db.run(`UPDATE shares SET messages = ? WHERE id = ?`, [
            JSON.stringify(shared.messages),
            shareId,
          ]);
        } catch {
          /* non-critical */
        }
      }
    }

    return shared;
  } catch {
    return null;
  }
}

/**
 * List all active shares.
 */
export function listShares(): SharedSession[] {
  const db = getDb();
  if (!db) {
    return [];
  }

  try {
    // Clean up expired shares first
    const now = new Date().toISOString();
    db.run(`DELETE FROM shares WHERE expires_at <= ?`, [now]);

    const rows = db
      .query(
        `SELECT id, session_id, name, messages, model, mode, cost_usd, token_count, is_live, created_at, expires_at
       FROM shares ORDER BY created_at DESC`
      )
      .all() as any[];

    return rows.map(row => rowToSharedSession(row));
  } catch {
    return [];
  }
}

/**
 * Delete a share.
 */
export function deleteShare(shareId: string): boolean {
  const db = getDb();
  if (!db) {
    return false;
  }

  try {
    const result = db.run(`DELETE FROM shares WHERE id = ?`, [shareId]);
    return result.changes > 0;
  } catch {
    return false;
  }
}

/**
 * Get the share URL for a shared session.
 */
export function getShareUrl(shareId: string, baseUrl?: string): string {
  const base = baseUrl ?? 'http://localhost:6001';
  return `${base}/nimbus/share/${shareId}`;
}

/**
 * Clean up expired shares.
 */
export function cleanupExpiredShares(): number {
  const db = getDb();
  if (!db) {
    return 0;
  }

  try {
    const now = new Date().toISOString();
    const result = db.run(`DELETE FROM shares WHERE expires_at <= ?`, [now]);
    return result.changes;
  } catch {
    return 0;
  }
}
