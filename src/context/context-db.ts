/**
 * Context Database
 *
 * Lightweight SQLite wrapper for .nimbus/context.db that stores:
 * - Recent commands and their results
 * - File change tracking for project context
 * - AI conversation context across sessions
 */

import { Database } from 'bun:sqlite';
import * as path from 'path';
import * as fs from 'fs';

const CONTEXT_DB_NAME = 'context.db';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS command_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    command TEXT NOT NULL,
    args TEXT,
    status TEXT NOT NULL DEFAULT 'success',
    duration_ms INTEGER,
    output_summary TEXT
);

CREATE TABLE IF NOT EXISTS file_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    file_path TEXT NOT NULL,
    change_type TEXT NOT NULL,
    content_hash TEXT,
    metadata TEXT
);

CREATE TABLE IF NOT EXISTS conversation_context (
    id TEXT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    title TEXT,
    messages TEXT NOT NULL,
    model TEXT,
    token_count INTEGER,
    metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_cmd_history_ts ON command_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_file_changes_path ON file_changes(file_path);
CREATE INDEX IF NOT EXISTS idx_file_changes_ts ON file_changes(timestamp);
CREATE INDEX IF NOT EXISTS idx_conversation_ts ON conversation_context(timestamp);
`;

export class ContextDatabase {
  private db: Database;
  private dbPath: string;

  constructor(projectDir: string) {
    const nimbusDir = path.join(projectDir, '.nimbus');
    this.dbPath = path.join(nimbusDir, CONTEXT_DB_NAME);

    if (!fs.existsSync(nimbusDir)) {
      fs.mkdirSync(nimbusDir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.exec(SCHEMA);
  }

  recordCommand(command: string, args?: string, status: string = 'success', durationMs?: number, outputSummary?: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO command_history (command, args, status, duration_ms, output_summary)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(command, args || null, status, durationMs || null, outputSummary || null);
  }

  getRecentCommands(limit: number = 20): Array<{
    id: number;
    timestamp: string;
    command: string;
    args: string | null;
    status: string;
    durationMs: number | null;
  }> {
    const stmt = this.db.prepare(`
      SELECT * FROM command_history ORDER BY timestamp DESC LIMIT ?
    `);
    return (stmt.all(limit) as any[]).map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      command: row.command,
      args: row.args,
      status: row.status,
      durationMs: row.duration_ms,
    }));
  }

  trackFileChange(filePath: string, changeType: 'created' | 'modified' | 'deleted', contentHash?: string, metadata?: Record<string, unknown>): void {
    const stmt = this.db.prepare(`
      INSERT INTO file_changes (file_path, change_type, content_hash, metadata)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(filePath, changeType, contentHash || null, metadata ? JSON.stringify(metadata) : null);
  }

  getRecentFileChanges(limit: number = 50): Array<{
    filePath: string;
    changeType: string;
    timestamp: string;
  }> {
    const stmt = this.db.prepare(`
      SELECT * FROM file_changes ORDER BY timestamp DESC LIMIT ?
    `);
    return (stmt.all(limit) as any[]).map(row => ({
      filePath: row.file_path,
      changeType: row.change_type,
      timestamp: row.timestamp,
    }));
  }

  saveConversation(id: string, title: string, messages: unknown[], model?: string, tokenCount?: number, metadata?: Record<string, unknown>): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO conversation_context (id, title, messages, model, token_count, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, title, JSON.stringify(messages), model || null, tokenCount || null, metadata ? JSON.stringify(metadata) : null);
  }

  getConversation(id: string): { id: string; title: string; messages: unknown[]; model: string | null; tokenCount: number | null } | null {
    const stmt = this.db.prepare('SELECT * FROM conversation_context WHERE id = ?');
    const row: any = stmt.get(id);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      messages: JSON.parse(row.messages),
      model: row.model,
      tokenCount: row.token_count,
    };
  }

  listConversations(limit: number = 20): Array<{ id: string; title: string; timestamp: string; model: string | null }> {
    const stmt = this.db.prepare(`
      SELECT id, title, timestamp, model FROM conversation_context ORDER BY timestamp DESC LIMIT ?
    `);
    return (stmt.all(limit) as any[]).map(row => ({
      id: row.id,
      title: row.title,
      timestamp: row.timestamp,
      model: row.model,
    }));
  }

  close(): void {
    this.db.close();
  }

  getPath(): string {
    return this.dbPath;
  }
}

export function initContextDatabase(projectDir: string): ContextDatabase {
  return new ContextDatabase(projectDir);
}
