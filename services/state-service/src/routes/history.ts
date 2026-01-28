import { logger } from '@nimbus/shared-utils';
import { initDatabase } from '../db/init';
import type { Operation } from '@nimbus/shared-types';

export async function historyRouter(req: Request, path: string): Promise<Response> {
  try {
    const { adapter } = await initDatabase();

    // POST /history - Save operation
    if (req.method === 'POST' && path === '/history') {
      const body = await req.json() as any;

      if (!body.id || !body.type || !body.command) {
        return Response.json(
          {
            success: false,
            error: 'Missing required fields: id, type, command',
          },
          { status: 400 }
        );
      }

      const operation: Operation = {
        id: body.id,
        timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
        type: body.type,
        command: body.command,
        input: body.input,
        output: body.output,
        status: body.status || 'success',
        durationMs: body.durationMs,
        model: body.model,
        tokensUsed: body.tokensUsed,
        costUsd: body.costUsd,
        metadata: body.metadata,
      };

      adapter.saveOperation(operation);

      return Response.json({
        success: true,
        message: 'Operation saved successfully',
        data: { id: operation.id },
      });
    }

    // GET /history/:id - Get operation by ID
    if (req.method === 'GET' && path.startsWith('/history/') && !path.includes('?')) {
      const id = path.replace('/history/', '');

      if (!id || id.includes('/')) {
        return Response.json(
          {
            success: false,
            error: 'Invalid operation ID',
          },
          { status: 400 }
        );
      }

      const operation = adapter.getOperation(id);

      if (!operation) {
        return Response.json(
          {
            success: false,
            error: `Operation not found: ${id}`,
          },
          { status: 404 }
        );
      }

      return Response.json({
        success: true,
        data: operation,
      });
    }

    // GET /history - Query operations with filters
    if (req.method === 'GET' && (path === '/history' || path.startsWith('/history?'))) {
      const url = new URL(req.url);
      const type = url.searchParams.get('type');
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      let operations: Operation[];

      if (type) {
        operations = adapter.listOperationsByType(type, limit);
      } else {
        operations = adapter.listOperations(limit, offset);
      }

      return Response.json({
        success: true,
        data: operations,
        pagination: {
          limit,
          offset,
          count: operations.length,
        },
        filters: {
          type: type || null,
        },
      });
    }

    // Method not allowed
    return Response.json(
      {
        success: false,
        error: 'Method not allowed',
      },
      { status: 405 }
    );
  } catch (error) {
    logger.error('History route error', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
