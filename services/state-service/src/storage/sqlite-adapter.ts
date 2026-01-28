import { Database } from 'bun:sqlite';
import type { Operation } from '@nimbus/shared-types';
import { logger } from '@nimbus/shared-utils';

export class SQLiteAdapter {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  // Operations
  saveOperation(operation: Operation): void {
    const stmt = this.db.prepare(`
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
      operation.metadata ? JSON.stringify(operation.metadata) : null
    );

    logger.debug(`Saved operation ${operation.id}`);
  }

  getOperation(id: string): Operation | null {
    const stmt = this.db.prepare('SELECT * FROM operations WHERE id = ?');
    const row: any = stmt.get(id);

    if (!row) {
      return null;
    }

    return this.rowToOperation(row);
  }

  listOperations(limit: number = 50, offset: number = 0): Operation[] {
    const stmt = this.db.prepare(`
      SELECT * FROM operations
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);

    const rows: any[] = stmt.all(limit, offset) as any[];
    return rows.map(row => this.rowToOperation(row));
  }

  listOperationsByType(type: string, limit: number = 50): Operation[] {
    const stmt = this.db.prepare(`
      SELECT * FROM operations
      WHERE type = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows: any[] = stmt.all(type, limit) as any[];
    return rows.map(row => this.rowToOperation(row));
  }

  // Config
  setConfig(key: string, value: any): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO config (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(key, JSON.stringify(value));
    logger.debug(`Set config ${key}`);
  }

  getConfig(key: string): any | null {
    const stmt = this.db.prepare('SELECT value FROM config WHERE key = ?');
    const row: any = stmt.get(key);

    if (!row) {
      return null;
    }

    return JSON.parse(row.value);
  }

  getAllConfig(): Record<string, any> {
    const stmt = this.db.prepare('SELECT key, value FROM config');
    const rows: any[] = stmt.all() as any[];

    const config: Record<string, any> = {};
    for (const row of rows) {
      config[row.key] = JSON.parse(row.value);
    }

    return config;
  }

  // Templates
  saveTemplate(id: string, name: string, type: string, content: string, variables?: any): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO templates (id, name, type, content, variables, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM templates WHERE id = ?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
    `);

    stmt.run(
      id,
      name,
      type,
      content,
      variables ? JSON.stringify(variables) : null,
      id
    );

    logger.debug(`Saved template ${id}`);
  }

  getTemplate(id: string): any | null {
    const stmt = this.db.prepare('SELECT * FROM templates WHERE id = ?');
    const row: any = stmt.get(id);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      content: row.content,
      variables: row.variables ? JSON.parse(row.variables) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listTemplates(type?: string): any[] {
    let stmt;
    let rows: any[];

    if (type) {
      stmt = this.db.prepare('SELECT * FROM templates WHERE type = ? ORDER BY created_at DESC');
      rows = stmt.all(type) as any[];
    } else {
      stmt = this.db.prepare('SELECT * FROM templates ORDER BY created_at DESC');
      rows = stmt.all() as any[];
    }

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      content: row.content,
      variables: row.variables ? JSON.parse(row.variables) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  deleteTemplate(id: string): void {
    const stmt = this.db.prepare('DELETE FROM templates WHERE id = ?');
    stmt.run(id);
    logger.debug(`Deleted template ${id}`);
  }

  // Conversations
  saveConversation(id: string, title: string, messages: any[], model?: string, metadata?: any): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO conversations (id, title, messages, model, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, COALESCE((SELECT created_at FROM conversations WHERE id = ?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, ?)
    `);

    stmt.run(
      id,
      title,
      JSON.stringify(messages),
      model || null,
      id,
      metadata ? JSON.stringify(metadata) : null
    );

    logger.debug(`Saved conversation ${id}`);
  }

  getConversation(id: string): any | null {
    const stmt = this.db.prepare('SELECT * FROM conversations WHERE id = ?');
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

  listConversations(limit: number = 50, offset: number = 0): any[] {
    const stmt = this.db.prepare(`
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

  deleteConversation(id: string): void {
    const stmt = this.db.prepare('DELETE FROM conversations WHERE id = ?');
    stmt.run(id);
    logger.debug(`Deleted conversation ${id}`);
  }

  // Artifacts
  saveArtifact(id: string, conversationId: string | null, name: string, type: string, content: string, language?: string, metadata?: any): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO artifacts (id, conversation_id, name, type, content, language, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM artifacts WHERE id = ?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, ?)
    `);

    stmt.run(
      id,
      conversationId || null,
      name,
      type,
      content,
      language || null,
      id,
      metadata ? JSON.stringify(metadata) : null
    );

    logger.debug(`Saved artifact ${id}`);
  }

  getArtifact(id: string): any | null {
    const stmt = this.db.prepare('SELECT * FROM artifacts WHERE id = ?');
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

  listArtifacts(type?: string, conversationId?: string, limit: number = 50, offset: number = 0): any[] {
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

    const stmt = this.db.prepare(query);
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

  deleteArtifact(id: string): void {
    const stmt = this.db.prepare('DELETE FROM artifacts WHERE id = ?');
    stmt.run(id);
    logger.debug(`Deleted artifact ${id}`);
  }

  // Helper methods
  private rowToOperation(row: any): Operation {
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

  close(): void {
    this.db.close();
    logger.info('Database connection closed');
  }
}
