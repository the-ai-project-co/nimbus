import { logger } from '@nimbus/shared-utils';
import { initDatabase } from '../db/init';

export async function artifactsRouter(req: Request, path: string): Promise<Response> {
  try {
    const { adapter } = await initDatabase();

    // POST /artifacts - Save artifact
    if (req.method === 'POST' && path === '/artifacts') {
      const body = await req.json() as any;

      if (!body.id || !body.name || !body.type || !body.content) {
        return Response.json(
          {
            success: false,
            error: 'Missing required fields: id, name, type, content',
          },
          { status: 400 }
        );
      }

      adapter.saveArtifact(
        body.id,
        body.conversationId,
        body.name,
        body.type,
        body.content,
        body.language,
        body.metadata
      );

      return Response.json({
        success: true,
        message: 'Artifact saved successfully',
        data: { id: body.id },
      });
    }

    // GET /artifacts/:id - Get artifact by ID
    if (req.method === 'GET' && path.startsWith('/artifacts/') && !path.includes('?')) {
      const id = path.replace('/artifacts/', '');

      if (!id || id.includes('/')) {
        return Response.json(
          {
            success: false,
            error: 'Invalid artifact ID',
          },
          { status: 400 }
        );
      }

      const artifact = adapter.getArtifact(id);

      if (!artifact) {
        return Response.json(
          {
            success: false,
            error: `Artifact not found: ${id}`,
          },
          { status: 404 }
        );
      }

      return Response.json({
        success: true,
        data: artifact,
      });
    }

    // GET /artifacts - List artifacts
    if (req.method === 'GET' && (path === '/artifacts' || path.startsWith('/artifacts?'))) {
      const url = new URL(req.url);
      const type = url.searchParams.get('type') || undefined;
      const conversationId = url.searchParams.get('conversationId') || undefined;
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      const artifacts = adapter.listArtifacts(type, conversationId, limit, offset);

      return Response.json({
        success: true,
        data: artifacts,
        pagination: {
          limit,
          offset,
          count: artifacts.length,
        },
        filters: {
          type: type || null,
          conversationId: conversationId || null,
        },
      });
    }

    // DELETE /artifacts/:id - Delete artifact
    if (req.method === 'DELETE' && path.startsWith('/artifacts/')) {
      const id = path.replace('/artifacts/', '');

      if (!id || id.includes('/')) {
        return Response.json(
          {
            success: false,
            error: 'Invalid artifact ID',
          },
          { status: 400 }
        );
      }

      adapter.deleteArtifact(id);

      return Response.json({
        success: true,
        message: `Artifact ${id} deleted successfully`,
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
    logger.error('Artifacts route error', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
