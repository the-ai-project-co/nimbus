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

  listOperationsByType(type: string, limit: number = 50, offset: number = 0): Operation[] {
    const stmt = this.db.prepare(`
      SELECT * FROM operations
      WHERE type = ?
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);

    const rows: any[] = stmt.all(type, limit, offset) as any[];
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

  // Projects
  saveProject(id: string, name: string, path: string, config: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO projects (id, name, path, config, last_scanned, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        path = excluded.path,
        config = excluded.config,
        last_scanned = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(id, name, path, JSON.stringify(config));
    logger.debug(`Saved project ${id}`);
  }

  getProject(id: string): any | null {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE id = ?');
    const row: any = stmt.get(id);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      path: row.path,
      config: JSON.parse(row.config),
      lastScanned: row.last_scanned,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getProjectByPath(path: string): any | null {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE path = ?');
    const row: any = stmt.get(path);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      path: row.path,
      config: JSON.parse(row.config),
      lastScanned: row.last_scanned,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listProjects(): any[] {
    const stmt = this.db.prepare('SELECT * FROM projects ORDER BY updated_at DESC');
    const rows: any[] = stmt.all() as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      path: row.path,
      config: JSON.parse(row.config),
      lastScanned: row.last_scanned,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  deleteProject(id: string): void {
    const stmt = this.db.prepare('DELETE FROM projects WHERE id = ?');
    stmt.run(id);
    logger.debug(`Deleted project ${id}`);
  }

  // Audit Logs
  logAuditEvent(event: {
    id: string;
    userId?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    input?: any;
    output?: any;
    status: string;
    durationMs?: number;
    metadata?: any;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (id, timestamp, user_id, action, resource_type, resource_id, input, output, status, duration_ms, metadata)
      VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.id,
      event.userId || null,
      event.action,
      event.resourceType || null,
      event.resourceId || null,
      event.input ? JSON.stringify(event.input) : null,
      event.output ? JSON.stringify(event.output) : null,
      event.status,
      event.durationMs || null,
      event.metadata ? JSON.stringify(event.metadata) : null
    );

    logger.debug(`Logged audit event ${event.id}`);
  }

  getAuditLogs(filter?: {
    userId?: string;
    action?: string;
    resourceType?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): any[] {
    let query = 'SELECT * FROM audit_logs';
    const params: any[] = [];
    const conditions: string[] = [];

    if (filter?.userId) {
      conditions.push('user_id = ?');
      params.push(filter.userId);
    }
    if (filter?.action) {
      conditions.push('action = ?');
      params.push(filter.action);
    }
    if (filter?.resourceType) {
      conditions.push('resource_type = ?');
      params.push(filter.resourceType);
    }
    if (filter?.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    if (filter?.startDate) {
      conditions.push('timestamp >= ?');
      params.push(filter.startDate.toISOString());
    }
    if (filter?.endDate) {
      conditions.push('timestamp <= ?');
      params.push(filter.endDate.toISOString());
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(filter?.limit || 100, filter?.offset || 0);

    const stmt = this.db.prepare(query);
    const rows: any[] = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      userId: row.user_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      input: row.input ? JSON.parse(row.input) : null,
      output: row.output ? JSON.parse(row.output) : null,
      status: row.status,
      durationMs: row.duration_ms,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }));
  }

  // Safety Checks
  saveSafetyCheck(check: {
    id: string;
    operationId?: string;
    checkType: string;
    checkName: string;
    passed: boolean;
    severity?: string;
    message?: string;
    requiresApproval?: boolean;
    approvedBy?: string;
    approvedAt?: Date;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO safety_checks (id, operation_id, check_type, check_name, passed, severity, message, requires_approval, approved_by, approved_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(
      check.id,
      check.operationId || null,
      check.checkType,
      check.checkName,
      check.passed ? 1 : 0,
      check.severity || null,
      check.message || null,
      check.requiresApproval ? 1 : 0,
      check.approvedBy || null,
      check.approvedAt?.toISOString() || null
    );

    logger.debug(`Saved safety check ${check.id}`);
  }

  getSafetyChecksForOperation(operationId: string): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM safety_checks
      WHERE operation_id = ?
      ORDER BY created_at ASC
    `);

    const rows: any[] = stmt.all(operationId) as any[];

    return rows.map(row => ({
      id: row.id,
      operationId: row.operation_id,
      checkType: row.check_type,
      checkName: row.check_name,
      passed: row.passed === 1,
      severity: row.severity,
      message: row.message,
      requiresApproval: row.requires_approval === 1,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      createdAt: row.created_at,
    }));
  }

  recordApproval(checkId: string, approvedBy: string): void {
    const stmt = this.db.prepare(`
      UPDATE safety_checks
      SET approved_by = ?, approved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(approvedBy, checkId);
    logger.debug(`Recorded approval for safety check ${checkId}`);
  }

  // Checkpoints (for resumable operations)
  saveCheckpoint(id: string, operationId: string, step: number, state: Record<string, unknown>): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO checkpoints (id, operation_id, step, state, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(id, operationId, step, JSON.stringify(state));
    logger.debug(`Saved checkpoint ${id} for operation ${operationId} at step ${step}`);
  }

  getCheckpoint(id: string): { id: string; operationId: string; step: number; state: Record<string, unknown>; createdAt: string } | null {
    const stmt = this.db.prepare('SELECT * FROM checkpoints WHERE id = ?');
    const row: any = stmt.get(id);
    if (!row) return null;
    return {
      id: row.id,
      operationId: row.operation_id,
      step: row.step,
      state: JSON.parse(row.state),
      createdAt: row.created_at,
    };
  }

  getLatestCheckpoint(operationId: string): { id: string; operationId: string; step: number; state: Record<string, unknown>; createdAt: string } | null {
    const stmt = this.db.prepare(`
      SELECT * FROM checkpoints WHERE operation_id = ? ORDER BY step DESC LIMIT 1
    `);
    const row: any = stmt.get(operationId);
    if (!row) return null;
    return {
      id: row.id,
      operationId: row.operation_id,
      step: row.step,
      state: JSON.parse(row.state),
      createdAt: row.created_at,
    };
  }

  listCheckpoints(operationId: string): Array<{ id: string; step: number; createdAt: string }> {
    const stmt = this.db.prepare(`
      SELECT id, step, created_at FROM checkpoints WHERE operation_id = ? ORDER BY step ASC
    `);
    return (stmt.all(operationId) as any[]).map(row => ({
      id: row.id,
      step: row.step,
      createdAt: row.created_at,
    }));
  }

  deleteCheckpoints(operationId: string): void {
    const stmt = this.db.prepare('DELETE FROM checkpoints WHERE operation_id = ?');
    stmt.run(operationId);
    logger.debug(`Deleted checkpoints for operation ${operationId}`);
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
