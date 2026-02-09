/**
 * Audit Service Server
 * HTTP server for audit logging endpoints
 */

import { logger } from '@nimbus/shared-utils';
import { createLog, queryLogs } from './routes/logs';
import { exportLogs } from './routes/export';
import { initDatabase } from './db/adapter';

export async function startServer(port: number) {
  // Initialize database
  await initDatabase();

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method;

      // Health check endpoint
      if (path === '/health') {
        return Response.json({
          status: 'healthy',
          service: 'audit-service',
          timestamp: new Date().toISOString(),
        });
      }

      // Create audit log
      if (path === '/api/audit/logs' && method === 'POST') {
        try {
          const body = await req.json() as { action: string; status: string; teamId?: string; userId?: string; resourceType?: string; resourceId?: string; details?: Record<string, unknown>; ipAddress?: string };
          const result = await createLog(body);
          return Response.json({ success: true, data: result });
        } catch (error: any) {
          logger.error('Create log error:', error);
          return Response.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }
      }

      // Query audit logs
      if (path === '/api/audit/logs' && method === 'GET') {
        try {
          const query = {
            teamId: url.searchParams.get('teamId') || undefined,
            userId: url.searchParams.get('userId') || undefined,
            action: url.searchParams.get('action') || undefined,
            status: url.searchParams.get('status') || undefined,
            since: url.searchParams.get('since') || undefined,
            until: url.searchParams.get('until') || undefined,
            limit: url.searchParams.get('limit')
              ? parseInt(url.searchParams.get('limit')!, 10)
              : undefined,
            offset: url.searchParams.get('offset')
              ? parseInt(url.searchParams.get('offset')!, 10)
              : undefined,
          };
          const result = await queryLogs(query);
          return Response.json({ success: true, data: result });
        } catch (error: any) {
          logger.error('Query logs error:', error);
          return Response.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }
      }

      // Export audit logs
      if (path === '/api/audit/export' && method === 'GET') {
        try {
          const format = (url.searchParams.get('format') || 'json') as 'csv' | 'json';
          const query = {
            teamId: url.searchParams.get('teamId') || undefined,
            userId: url.searchParams.get('userId') || undefined,
            action: url.searchParams.get('action') || undefined,
            since: url.searchParams.get('since') || undefined,
            until: url.searchParams.get('until') || undefined,
          };

          const result = await exportLogs(format, query);

          const contentType = format === 'csv' ? 'text/csv' : 'application/json';
          const filename = `audit-logs-${new Date().toISOString().split('T')[0]}.${format}`;

          return new Response(result, {
            headers: {
              'Content-Type': contentType,
              'Content-Disposition': `attachment; filename="${filename}"`,
            },
          });
        } catch (error: any) {
          logger.error('Export logs error:', error);
          return Response.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }
      }

      // 404
      return new Response('Not Found', { status: 404 });
    },
  });

  logger.info(`Audit Service listening on port ${port}`);
  logger.info('Available routes:');
  logger.info('  - GET  /health');
  logger.info('  - POST /api/audit/logs');
  logger.info('  - GET  /api/audit/logs');
  logger.info('  - GET  /api/audit/export');

  return server;
}
