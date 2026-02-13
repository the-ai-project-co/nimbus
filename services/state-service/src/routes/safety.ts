import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { getAdapter } from '../storage';
import { logger } from '@nimbus/shared-utils';

const safety = new Hono();

// Get safety checks for an operation
safety.get('/:operationId', (c) => {
  try {
    const adapter = getAdapter();
    const operationId = c.req.param('operationId');
    const checks = adapter.getSafetyChecksForOperation(operationId);

    return c.json({ success: true, checks, count: checks.length });
  } catch (error: any) {
    logger.error('Failed to get safety checks', { error: error.message });
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Create a safety check record
safety.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const {
      id = uuidv4(),
      operationId,
      checkType,
      checkName,
      passed,
      severity,
      message,
      requiresApproval,
    } = body;

    if (checkType === undefined || checkName === undefined || passed === undefined) {
      return c.json({ success: false, error: 'checkType, checkName, and passed are required' }, 400);
    }

    const adapter = getAdapter();
    adapter.saveSafetyCheck({
      id,
      operationId,
      checkType,
      checkName,
      passed,
      severity,
      message,
      requiresApproval,
    });

    return c.json({ success: true, id });
  } catch (error: any) {
    logger.error('Failed to create safety check', { error: error.message });
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Record approval for a safety check
safety.post('/:checkId/approve', async (c) => {
  try {
    const checkId = c.req.param('checkId');
    const body = await c.req.json();
    const { approvedBy } = body;

    if (!approvedBy) {
      return c.json({ success: false, error: 'approvedBy is required' }, 400);
    }

    const adapter = getAdapter();
    adapter.recordApproval(checkId, approvedBy);

    return c.json({ success: true });
  } catch (error: any) {
    logger.error('Failed to record approval', { error: error.message });
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default safety;
