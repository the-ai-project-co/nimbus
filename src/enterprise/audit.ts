/**
 * Enterprise Audit - Audit logging and export.
 *
 * Embedded replacement for services/audit-service.
 * All business logic is preserved verbatim from:
 *   - services/audit-service/src/routes/logs.ts
 *   - services/audit-service/src/routes/export.ts
 *
 * HTTP handlers, routes, and per-service SQLite are stripped.
 * State is read/written through the unified database via ../state/audit.
 *
 * IMPORTANT: The unified audit schema (src/state/audit.ts) uses a different
 * column layout from the audit-service schema.  The audit-service stored
 * (team_id, user_id, action, resource_type, resource_id, status, details,
 * ip_address) whereas the unified schema stores (user_id, action,
 * resource_type, resource_id, input, output, status, duration_ms, metadata).
 *
 * This module adapts to the unified schema:
 *   - "details" from the service is stored in "metadata" in the unified DB
 *   - "ip_address" and "team_id" are stored inside "metadata" JSON
 *   - The public return types mirror the original service API for callers
 */

import {
  logAuditEvent as stateLogAuditEvent,
  getAuditLogs as stateGetAuditLogs,
  type AuditEventInput,
  type AuditLogRecord as StateAuditLogRecord,
  type AuditLogFilter,
} from '../state/audit';

// ---------------------------------------------------------------------------
// Response type definitions (mirrors @nimbus/shared-types shapes and the
// original audit-service AuditLogRecord used in export)
// ---------------------------------------------------------------------------

export interface AuditLog {
  id: string;
  timestamp: string;
  teamId?: string;
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  status: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

// ---------------------------------------------------------------------------
// Request type definitions
// ---------------------------------------------------------------------------

export interface CreateLogRequest {
  action: string;
  status: string;
  teamId?: string;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export interface QueryLogsParams {
  teamId?: string;
  userId?: string;
  action?: string;
  status?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export interface ExportQueryParams {
  teamId?: string;
  userId?: string;
  action?: string;
  since?: string;
  until?: string;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Convert a state AuditLogRecord to the public AuditLog API shape.
 *
 * The unified state module stores extra fields (team_id, ip_address, original
 * service "details") inside the metadata JSON blob.  We unpack them here to
 * reconstruct the original API surface.
 */
function stateRecordToLog(record: StateAuditLogRecord): AuditLog {
  // Unpack metadata to recover service-level fields stored there
  const meta: Record<string, unknown> =
    typeof record.metadata === 'object' && record.metadata !== null
      ? (record.metadata as Record<string, unknown>)
      : {};

  return {
    id: record.id,
    timestamp: record.timestamp,
    teamId: (meta._teamId as string | undefined) ?? undefined,
    userId: record.userId ?? undefined,
    action: record.action,
    resourceType: record.resourceType ?? undefined,
    resourceId: record.resourceId ?? undefined,
    status: record.status,
    details: (meta._details as Record<string, unknown> | undefined) ?? undefined,
    ipAddress: (meta._ipAddress as string | undefined) ?? undefined,
  };
}

/**
 * Build the metadata object that bundles service-level fields not present
 * in the unified audit schema as top-level columns.
 */
function buildMetadata(
  teamId?: string,
  ipAddress?: string,
  details?: Record<string, unknown>
): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = {};
  let hasData = false;

  if (teamId) {
    meta._teamId = teamId;
    hasData = true;
  }
  if (ipAddress) {
    meta._ipAddress = ipAddress;
    hasData = true;
  }
  if (details && Object.keys(details).length > 0) {
    meta._details = details;
    hasData = true;
  }

  return hasData ? meta : undefined;
}

// ---------------------------------------------------------------------------
// CSV / JSON export helpers (preserved verbatim from audit-service/src/routes/export.ts)
// ---------------------------------------------------------------------------

/**
 * Escape a field value for RFC 4180-compliant CSV output.
 */
function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Serialize a list of AuditLog entries to CSV format.
 */
function exportToCsv(logs: AuditLog[]): string {
  const headers = [
    'id',
    'timestamp',
    'team_id',
    'user_id',
    'action',
    'resource_type',
    'resource_id',
    'status',
    'details',
    'ip_address',
  ];

  const rows = logs.map(log => {
    return [
      escapeCsvField(log.id),
      escapeCsvField(log.timestamp),
      escapeCsvField(log.teamId || ''),
      escapeCsvField(log.userId || ''),
      escapeCsvField(log.action),
      escapeCsvField(log.resourceType || ''),
      escapeCsvField(log.resourceId || ''),
      escapeCsvField(log.status),
      escapeCsvField(log.details ? JSON.stringify(log.details) : ''),
      escapeCsvField(log.ipAddress || ''),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Serialize a list of AuditLog entries to pretty-printed JSON format.
 */
function exportToJson(logs: AuditLog[]): string {
  return JSON.stringify({ logs, exportedAt: new Date().toISOString() }, null, 2);
}

// ---------------------------------------------------------------------------
// Public API - Log creation and querying
// ---------------------------------------------------------------------------

/**
 * Create an audit log entry.
 *
 * Writes to the unified audit_logs table via the state layer.
 * Returns the created log entry with the generated ID and timestamp.
 */
export async function createLog(request: CreateLogRequest): Promise<AuditLog> {
  const { action, status, teamId, userId, resourceType, resourceId, details, ipAddress } = request;

  if (!action || !status) {
    throw new Error('Action and status are required');
  }

  const id = crypto.randomUUID();
  const metadata = buildMetadata(teamId, ipAddress, details);

  const event: AuditEventInput = {
    id,
    userId,
    action,
    resourceType,
    resourceId,
    status,
    metadata,
  };

  stateLogAuditEvent(event);

  return {
    id,
    timestamp: new Date().toISOString(),
    action,
    status,
    teamId,
    userId,
    resourceType,
    resourceId,
    details,
    ipAddress,
  };
}

/**
 * Query audit logs with optional filters.
 *
 * Supports filtering by teamId, userId, action, status, and date range.
 * Returns paginated results with a total count.
 */
export async function queryLogs(query: QueryLogsParams): Promise<{
  logs: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}> {
  const limit = query.limit || 100;
  const offset = query.offset || 0;

  const filter: AuditLogFilter = {
    userId: query.userId,
    action: query.action,
    status: query.status,
    startDate: query.since ? new Date(query.since) : undefined,
    endDate: query.until ? new Date(query.until) : undefined,
    limit,
    offset,
  };

  let records = stateGetAuditLogs(filter);

  // If teamId is provided, post-filter by the _teamId stored in metadata,
  // since the unified schema does not have a top-level team_id column.
  if (query.teamId) {
    records = records.filter(rec => {
      const meta: Record<string, unknown> =
        typeof rec.metadata === 'object' && rec.metadata !== null
          ? (rec.metadata as Record<string, unknown>)
          : {};
      return meta._teamId === query.teamId;
    });
  }

  // Count total matching records (without pagination) for the response envelope
  const allRecords = stateGetAuditLogs({ ...filter, limit: 100_000, offset: 0 });
  const filteredAll = query.teamId
    ? allRecords.filter(rec => {
        const meta: Record<string, unknown> =
          typeof rec.metadata === 'object' && rec.metadata !== null
            ? (rec.metadata as Record<string, unknown>)
            : {};
        return meta._teamId === query.teamId;
      })
    : allRecords;

  return {
    logs: records.map(stateRecordToLog),
    total: filteredAll.length,
    limit,
    offset,
  };
}

// ---------------------------------------------------------------------------
// Public API - Export
// ---------------------------------------------------------------------------

/**
 * Export audit logs in CSV or JSON format.
 *
 * Fetches up to 10,000 matching records (no pagination) and serializes them
 * to the requested format string.
 */
export async function exportLogs(
  format: 'csv' | 'json',
  query: ExportQueryParams
): Promise<string> {
  const filter: AuditLogFilter = {
    userId: query.userId,
    action: query.action,
    startDate: query.since ? new Date(query.since) : undefined,
    endDate: query.until ? new Date(query.until) : undefined,
    limit: 10_000,
    offset: 0,
  };

  let records = stateGetAuditLogs(filter);

  // Post-filter by teamId if provided (stored in metadata)
  if (query.teamId) {
    records = records.filter(rec => {
      const meta: Record<string, unknown> =
        typeof rec.metadata === 'object' && rec.metadata !== null
          ? (rec.metadata as Record<string, unknown>)
          : {};
      return meta._teamId === query.teamId;
    });
  }

  const logs = records.map(stateRecordToLog);

  if (format === 'csv') {
    return exportToCsv(logs);
  }

  return exportToJson(logs);
}
