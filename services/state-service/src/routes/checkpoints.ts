import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { getAdapter } from '../storage';
import { logger } from '@nimbus/shared-utils';

const checkpoints = new Hono();

// Save a checkpoint
checkpoints.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const {
      id = uuidv4(),
      operationId,
      step,
      state,
    } = body;

    if (!operationId || step === undefined || !state) {
      return c.json({ success: false, error: 'operationId, step, and state are required' }, 400);
    }

    const adapter = getAdapter();
    adapter.saveCheckpoint(id, operationId, step, state);

    return c.json({ success: true, id });
  } catch (error: any) {
    logger.error('Failed to save checkpoint', { error: error.message });
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get latest checkpoint for an operation
checkpoints.get('/latest/:operationId', (c) => {
  try {
    const operationId = c.req.param('operationId');
    const adapter = getAdapter();
    const checkpoint = adapter.getLatestCheckpoint(operationId);

    if (!checkpoint) {
      return c.json({ success: false, error: 'No checkpoint found' }, 404);
    }

    return c.json({ success: true, checkpoint });
  } catch (error: any) {
    logger.error('Failed to get latest checkpoint', { error: error.message });
    return c.json({ success: false, error: error.message }, 500);
  }
});

// List all checkpoints for an operation
checkpoints.get('/list/:operationId', (c) => {
  try {
    const operationId = c.req.param('operationId');
    const adapter = getAdapter();
    const items = adapter.listCheckpoints(operationId);

    return c.json({ success: true, checkpoints: items, count: items.length });
  } catch (error: any) {
    logger.error('Failed to list checkpoints', { error: error.message });
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get a checkpoint by ID
checkpoints.get('/:id', (c) => {
  try {
    const id = c.req.param('id');
    const adapter = getAdapter();
    const checkpoint = adapter.getCheckpoint(id);

    if (!checkpoint) {
      return c.json({ success: false, error: 'Checkpoint not found' }, 404);
    }

    return c.json({ success: true, checkpoint });
  } catch (error: any) {
    logger.error('Failed to get checkpoint', { error: error.message });
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete all checkpoints for an operation
checkpoints.delete('/:operationId', (c) => {
  try {
    const operationId = c.req.param('operationId');
    const adapter = getAdapter();
    adapter.deleteCheckpoints(operationId);

    return c.json({ success: true });
  } catch (error: any) {
    logger.error('Failed to delete checkpoints', { error: error.message });
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default checkpoints;
