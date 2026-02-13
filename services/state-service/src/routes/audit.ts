import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { getAdapter } from '../storage';
import { logger } from '@nimbus/shared-utils';

const audit = new Hono();

// List audit logs with optional filters
audit.get('/', (c) => {
  try {
    const adapter = getAdapter();

    // Parse query parameters
    const userId = c.req.query('userId');
    const action = c.req.query('action');
    const resourceType = c.req.query('resourceType');
    const status = c.req.query('status');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const limit = parseInt(c.req.query('limit') || '100', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    const logs = adapter.getAuditLogs({
      userId: userId || undefined,
      action: action || undefined,
      resourceType: resourceType || undefined,
      status: status || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit,
      offset,
    });

    return c.json({ success: true, logs, count: logs.length });
  } catch (error: any) {
    logger.error('Failed to list audit logs', { error: error.message });
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Create an audit log entry
audit.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const {
      id = uuidv4(),
      userId,
      action,
      resourceType,
      resourceId,
      input,
      output,
      status,
      durationMs,
      metadata,
    } = body;

    if (!action || !status) {
      return c.json({ success: false, error: 'action and status are required' }, 400);
    }

    const adapter = getAdapter();
    adapter.logAuditEvent({
      id,
      userId,
      action,
      resourceType,
      resourceId,
      input,
      output,
      status,
      durationMs,
      metadata,
    });

    return c.json({ success: true, id });
  } catch (error: any) {
    logger.error('Failed to create audit log', { error: error.message });
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Export audit logs (for compliance/reporting)
audit.get('/export', (c) => {
  try {
    const adapter = getAdapter();

    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const format = c.req.query('format') || 'json';

    const logs = adapter.getAuditLogs({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: 10000, // Max export size
    });

    if (format === 'csv') {
      // Generate CSV
      const headers = ['timestamp', 'user_id', 'action', 'resource_type', 'resource_id', 'status', 'duration_ms'];
      const rows = logs.map(log => [
        log.timestamp,
        log.userId || '',
        log.action,
        log.resourceType || '',
        log.resourceId || '',
        log.status,
        log.durationMs || '',
      ].join(','));

      const csv = [headers.join(','), ...rows].join('\n');
      return c.text(csv, 200, {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename=audit-logs-${new Date().toISOString().split('T')[0]}.csv`,
      });
    }

    return c.json({ success: true, logs, exportedAt: new Date().toISOString() });
  } catch (error: any) {
    logger.error('Failed to export audit logs', { error: error.message });
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default audit;
