/**
 * Audit Export Routes
 * Export audit logs in various formats
 */

import type { AuditLogQuery } from '@nimbus/shared-types';
import { queryAuditLogs, type AuditLogRecord } from '../db/adapter';

// Export query interface that accepts string for action
interface ExportQueryParams {
  teamId?: string;
  userId?: string;
  action?: string;
  since?: string;
  until?: string;
}

/**
 * Export audit logs
 */
export async function exportLogs(
  format: 'csv' | 'json',
  query: ExportQueryParams
): Promise<string> {
  // Get all matching logs (no limit for export)
  const records = queryAuditLogs({
    ...query,
    limit: 10000, // Max export limit
    offset: 0,
  } as AuditLogQuery);

  if (format === 'csv') {
    return exportToCsv(records);
  }

  return exportToJson(records);
}

/**
 * Export to CSV format
 */
function exportToCsv(records: AuditLogRecord[]): string {
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

  const rows = records.map(record => {
    return [
      escapeCsvField(record.id),
      escapeCsvField(record.timestamp),
      escapeCsvField(record.team_id || ''),
      escapeCsvField(record.user_id || ''),
      escapeCsvField(record.action),
      escapeCsvField(record.resource_type || ''),
      escapeCsvField(record.resource_id || ''),
      escapeCsvField(record.status),
      escapeCsvField(record.details || ''),
      escapeCsvField(record.ip_address || ''),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Export to JSON format
 */
function exportToJson(records: AuditLogRecord[]): string {
  const logs = records.map(record => ({
    id: record.id,
    timestamp: record.timestamp,
    teamId: record.team_id || undefined,
    userId: record.user_id || undefined,
    action: record.action,
    resourceType: record.resource_type || undefined,
    resourceId: record.resource_id || undefined,
    status: record.status,
    details: record.details ? JSON.parse(record.details) : undefined,
    ipAddress: record.ip_address || undefined,
  }));

  return JSON.stringify({ logs, exportedAt: new Date().toISOString() }, null, 2);
}

/**
 * Escape a field for CSV
 */
function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
