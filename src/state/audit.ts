/**
 * Audit log helpers.
 *
 * Refactored from SQLiteAdapter.logAuditEvent and getAuditLogs.
 */

import type { Database } from '../compat/sqlite';
import { getDb } from './db';

/** Shape accepted when writing an audit event. */
export interface AuditEventInput {
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
}

/** Shape returned by audit log queries. */
export interface AuditLogRecord {
  id: string;
  timestamp: string;
  userId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  input: any | null;
  output: any | null;
  status: string;
  durationMs: number | null;
  metadata: any | null;
}

/** Filter criteria for querying audit logs. */
export interface AuditLogFilter {
  userId?: string;
  action?: string;
  resourceType?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist an audit event.
 */
export function logAuditEvent(event: AuditEventInput, db?: Database): void {
  const d = db || getDb();
  const stmt = d.prepare(`
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
}

/**
 * Query audit logs with optional filters.
 */
export function getAuditLogs(filter?: AuditLogFilter, db?: Database): AuditLogRecord[] {
  const d = db || getDb();

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
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(filter?.limit || 100, filter?.offset || 0);

  const stmt = d.prepare(query);
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
