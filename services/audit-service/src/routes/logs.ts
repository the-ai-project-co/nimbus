/**
 * Audit Logs Routes
 * Create and query audit logs
 */

import type { AuditLog, AuditLogQuery } from '@nimbus/shared-types';
import {
  createAuditLog,
  queryAuditLogs,
  countAuditLogs,
  type AuditLogRecord,
} from '../db/adapter';

/**
 * Convert database record to API response
 */
function recordToLog(record: AuditLogRecord): AuditLog {
  return {
    id: record.id,
    timestamp: record.timestamp,
    teamId: record.team_id || undefined,
    userId: record.user_id || undefined,
    action: record.action as AuditLog['action'],
    resourceType: record.resource_type || undefined,
    resourceId: record.resource_id || undefined,
    status: record.status as AuditLog['status'],
    details: record.details ? JSON.parse(record.details) : undefined,
    ipAddress: record.ip_address || undefined,
  };
}

// Create log request interface that accepts string for action/status
interface CreateLogRequest {
  action: string;
  status: string;
  teamId?: string;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Create an audit log entry
 */
export async function createLog(request: CreateLogRequest): Promise<AuditLog> {
  const { action, status, teamId, userId, resourceType, resourceId, details, ipAddress } = request;

  if (!action || !status) {
    throw new Error('Action and status are required');
  }

  const id = createAuditLog(action, status, {
    teamId,
    userId,
    resourceType,
    resourceId,
    details,
    ipAddress,
  });

  return {
    id,
    timestamp: new Date().toISOString(),
    action: action as AuditLog['action'],
    status: status as AuditLog['status'],
    teamId,
    userId,
    resourceType,
    resourceId,
    details,
    ipAddress,
  };
}

// Query interface that accepts string for action (from URL params)
interface QueryLogsParams {
  teamId?: string;
  userId?: string;
  action?: string;
  status?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

/**
 * Query audit logs
 */
export async function queryLogs(query: QueryLogsParams): Promise<{
  logs: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}> {
  const records = queryAuditLogs(query as AuditLogQuery);
  const total = countAuditLogs(query as AuditLogQuery);

  return {
    logs: records.map(recordToLog),
    total,
    limit: query.limit || 100,
    offset: query.offset || 0,
  };
}
