import { logger } from '@nimbus/shared-utils';
import { initDatabase } from '../db/init';

export async function templatesRouter(req: Request, path: string): Promise<Response> {
  try {
    const { adapter } = await initDatabase();

    // POST /templates - Save template
    if (req.method === 'POST' && path === '/templates') {
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

      adapter.saveTemplate(
        body.id,
        body.name,
        body.type,
        body.content,
        body.variables
      );

      return Response.json({
        success: true,
        message: 'Template saved successfully',
        data: { id: body.id },
      });
    }

    // GET /templates/:id - Get template by ID
    if (req.method === 'GET' && path.startsWith('/templates/') && !path.includes('?')) {
      // Extract ID from path, stripping query parameters if present
      let id = path.replace('/templates/', '');
      const queryIndex = id.indexOf('?');
      if (queryIndex !== -1) {
        id = id.substring(0, queryIndex);
      }

      if (!id || id.includes('/')) {
        return Response.json(
          {
            success: false,
            error: 'Invalid template ID',
          },
          { status: 400 }
        );
      }

      const template = adapter.getTemplate(id);

      if (!template) {
        return Response.json(
          {
            success: false,
            error: `Template not found: ${id}`,
          },
          { status: 404 }
        );
      }

      return Response.json({
        success: true,
        data: template,
      });
    }

    // GET /templates - List templates
    if (req.method === 'GET' && (path === '/templates' || path.startsWith('/templates?'))) {
      const url = new URL(req.url);
      const type = url.searchParams.get('type') || undefined;

      const templates = adapter.listTemplates(type);

      return Response.json({
        success: true,
        data: templates,
        filters: {
          type: type || null,
        },
      });
    }

    // DELETE /templates/:id - Delete template
    if (req.method === 'DELETE' && path.startsWith('/templates/')) {
      // Extract ID from path, stripping query parameters if present
      let id = path.replace('/templates/', '');
      const queryIndex = id.indexOf('?');
      if (queryIndex !== -1) {
        id = id.substring(0, queryIndex);
      }

      if (!id || id.includes('/')) {
        return Response.json(
          {
            success: false,
            error: 'Invalid template ID',
          },
          { status: 400 }
        );
      }

      adapter.deleteTemplate(id);

      return Response.json({
        success: true,
        message: `Template ${id} deleted successfully`,
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
    logger.error('Templates route error', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
