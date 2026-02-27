/**
 * Session Manager — Multi-Session Lifecycle
 *
 * Manages creation, switching, suspension, and destruction of parallel
 * agent sessions. Each session has its own conversation history, tool
 * state, and working context, but shares project config (NIMBUS.md).
 *
 * File conflict detection warns when two sessions edit the same file.
 */

import { getDb } from '../state/db';
import type { Database } from '../compat/sqlite';
import type { SessionRecord, SessionStatus, SessionEvent, SessionFileEdit } from './types';
import type { LLMMessage } from '../llm/types';

/** Singleton session manager instance. */
let instance: SessionManager | null = null;

export class SessionManager {
  private db: Database;
  private activeSessionId: string | null = null;
  private fileEdits: Map<string, SessionFileEdit[]> = new Map();
  private eventListeners: Array<(event: SessionEvent) => void> = [];

  constructor(db?: Database) {
    this.db = db || getDb();
    this.ensureTable();
  }

  /** Get the singleton instance. */
  static getInstance(db?: Database): SessionManager {
    if (!instance) {
      instance = new SessionManager(db);
    }
    return instance;
  }

  /** Reset the singleton (for testing). */
  static resetInstance(): void {
    instance = null;
  }

  /** Ensure the sessions table exists with the status column. */
  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        mode TEXT NOT NULL DEFAULT 'plan',
        model TEXT NOT NULL DEFAULT 'default',
        cwd TEXT NOT NULL DEFAULT '.',
        token_count INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        snapshot_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        metadata TEXT
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'Untitled',
        messages TEXT NOT NULL DEFAULT '[]',
        model TEXT NOT NULL DEFAULT 'default',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  /** Create a new session. */
  create(options: {
    name: string;
    mode?: SessionRecord['mode'];
    model?: string;
    cwd?: string;
  }): SessionRecord {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const mode = options.mode ?? 'plan';
    const model = options.model ?? 'default';
    const cwd = options.cwd ?? process.cwd();

    this.db
      .prepare(
        `
      INSERT INTO sessions (id, name, status, mode, model, cwd, token_count, cost_usd, snapshot_count, created_at, updated_at)
      VALUES (?, ?, 'active', ?, ?, ?, 0, 0, 0, ?, ?)
    `
      )
      .run(id, options.name, mode, model, cwd, now, now);

    const session: SessionRecord = {
      id,
      name: options.name,
      status: 'active',
      mode,
      model,
      cwd,
      tokenCount: 0,
      costUSD: 0,
      snapshotCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.emit({ type: 'created', sessionId: id, timestamp: new Date() });
    return session;
  }

  /** List all sessions, optionally filtered by status. */
  list(status?: SessionStatus): SessionRecord[] {
    let rows: any[];
    if (status) {
      rows = this.db
        .prepare('SELECT * FROM sessions WHERE status = ? ORDER BY updated_at DESC')
        .all(status) as any[];
    } else {
      rows = this.db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all() as any[];
    }
    return rows.map(rowToSession);
  }

  /** List only active sessions. */
  listActive(): SessionRecord[] {
    return this.list('active');
  }

  /** Get a session by ID. */
  get(id: string): SessionRecord | null {
    const row: any = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
    return row ? rowToSession(row) : null;
  }

  /** Get the currently active session ID. */
  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  /** Switch to a different session. Suspends the current one. */
  switchTo(sessionId: string): SessionRecord | null {
    const session = this.get(sessionId);
    if (!session) {
      return null;
    }

    // Suspend current session
    if (this.activeSessionId && this.activeSessionId !== sessionId) {
      this.updateStatus(this.activeSessionId, 'suspended');
      this.emit({
        type: 'suspended',
        sessionId: this.activeSessionId,
        timestamp: new Date(),
      });
    }

    // Activate target session
    this.updateStatus(sessionId, 'active');
    this.activeSessionId = sessionId;

    this.emit({ type: 'switched', sessionId, timestamp: new Date() });
    return this.get(sessionId);
  }

  /** Suspend a session (keeps state, stops processing). */
  suspend(sessionId: string): void {
    this.updateStatus(sessionId, 'suspended');
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }
    this.emit({ type: 'suspended', sessionId, timestamp: new Date() });
  }

  /** Resume a suspended session. */
  resume(sessionId: string): SessionRecord | null {
    const session = this.get(sessionId);
    if (!session || session.status === 'completed') {
      return null;
    }

    this.updateStatus(sessionId, 'active');
    this.activeSessionId = sessionId;
    this.emit({ type: 'resumed', sessionId, timestamp: new Date() });
    return this.get(sessionId);
  }

  /** Mark a session as completed. */
  complete(sessionId: string): void {
    this.updateStatus(sessionId, 'completed');
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }
    this.emit({ type: 'completed', sessionId, timestamp: new Date() });
  }

  /** Destroy a session (removes from DB). */
  destroy(sessionId: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }
    // Clean up file edits for this session
    for (const [path, edits] of this.fileEdits) {
      const filtered = edits.filter(e => e.sessionId !== sessionId);
      if (filtered.length === 0) {
        this.fileEdits.delete(path);
      } else {
        this.fileEdits.set(path, filtered);
      }
    }
    this.emit({ type: 'destroyed', sessionId, timestamp: new Date() });
  }

  /** Update session metadata (tokens, cost, mode, etc.). */
  updateSession(
    sessionId: string,
    updates: Partial<
      Pick<SessionRecord, 'tokenCount' | 'costUSD' | 'snapshotCount' | 'mode' | 'model'>
    >
  ): void {
    const parts: string[] = [];
    const values: any[] = [];

    if (updates.tokenCount !== undefined) {
      parts.push('token_count = ?');
      values.push(updates.tokenCount);
    }
    if (updates.costUSD !== undefined) {
      parts.push('cost_usd = ?');
      values.push(updates.costUSD);
    }
    if (updates.snapshotCount !== undefined) {
      parts.push('snapshot_count = ?');
      values.push(updates.snapshotCount);
    }
    if (updates.mode !== undefined) {
      parts.push('mode = ?');
      values.push(updates.mode);
    }
    if (updates.model !== undefined) {
      parts.push('model = ?');
      values.push(updates.model);
    }

    if (parts.length === 0) {
      return;
    }

    parts.push("updated_at = datetime('now')");
    values.push(sessionId);

    this.db.prepare(`UPDATE sessions SET ${parts.join(', ')} WHERE id = ?`).run(...values);
  }

  /** Save conversation messages for a session. */
  saveConversation(sessionId: string, messages: LLMMessage[]): void {
    const existing = this.db.prepare('SELECT id FROM conversations WHERE id = ?').get(sessionId);
    const session = this.get(sessionId);
    const title = session?.name ?? 'Untitled';
    const messagesJson = JSON.stringify(messages);

    if (existing) {
      this.db
        .prepare("UPDATE conversations SET messages = ?, updated_at = datetime('now') WHERE id = ?")
        .run(messagesJson, sessionId);
    } else {
      this.db
        .prepare(
          "INSERT INTO conversations (id, title, messages, model, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))"
        )
        .run(sessionId, title, messagesJson, session?.model ?? 'default');
    }
  }

  /** Load conversation messages for a session. Returns empty array if not found. */
  loadConversation(sessionId: string): LLMMessage[] {
    const row: any = this.db
      .prepare('SELECT messages FROM conversations WHERE id = ?')
      .get(sessionId);
    if (!row?.messages) {
      return [];
    }
    try {
      return JSON.parse(row.messages);
    } catch {
      return [];
    }
  }

  /** Record a file edit for conflict detection. */
  recordFileEdit(sessionId: string, filePath: string): string[] {
    const normalizedPath = filePath;
    const edit: SessionFileEdit = { sessionId, filePath: normalizedPath, timestamp: new Date() };

    const existing = this.fileEdits.get(normalizedPath) || [];
    existing.push(edit);
    this.fileEdits.set(normalizedPath, existing);

    // Check for conflicts (other sessions editing the same file)
    const conflicts: string[] = [];
    const otherEditors = existing.filter(
      e => e.sessionId !== sessionId && e.timestamp.getTime() > Date.now() - 5 * 60 * 1000 // Within last 5 minutes
    );

    for (const editor of otherEditors) {
      conflicts.push(editor.sessionId);
    }

    if (conflicts.length > 0) {
      this.emit({
        type: 'file_conflict',
        sessionId,
        timestamp: new Date(),
        details: `File "${filePath}" is also being edited by session(s): ${conflicts.join(', ')}`,
      });
    }

    return conflicts;
  }

  /** Listen for session events. */
  onEvent(listener: (event: SessionEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      this.eventListeners = this.eventListeners.filter(l => l !== listener);
    };
  }

  private emit(event: SessionEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        /* ignore */
      }
    }
  }

  private updateStatus(sessionId: string, status: SessionStatus): void {
    this.db
      .prepare("UPDATE sessions SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(status, sessionId);
  }
}

/** Convert a raw DB row to a SessionRecord. */
function rowToSession(row: any): SessionRecord {
  return {
    id: row.id,
    name: row.name,
    status: row.status as SessionStatus,
    mode: row.mode,
    model: row.model,
    cwd: row.cwd,
    tokenCount: row.token_count,
    costUSD: row.cost_usd,
    snapshotCount: row.snapshot_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}
