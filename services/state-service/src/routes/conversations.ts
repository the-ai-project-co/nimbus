import { logger } from '@nimbus/shared-utils';
import { initDatabase } from '../db/init';

export async function conversationsRouter(req: Request, path: string): Promise<Response> {
  try {
    const { adapter } = await initDatabase();

    // POST /conversations - Save conversation
    if (req.method === 'POST' && path === '/conversations') {
      const body = await req.json() as any;

      if (!body.id || !body.title || !body.messages) {
        return Response.json(
          {
            success: false,
            error: 'Missing required fields: id, title, messages',
          },
          { status: 400 }
        );
      }

      adapter.saveConversation(
        body.id,
        body.title,
        body.messages,
        body.model,
        body.metadata
      );

      return Response.json({
        success: true,
        message: 'Conversation saved successfully',
        data: { id: body.id },
      });
    }

    // GET /conversations/:id - Get conversation by ID
    if (req.method === 'GET' && path.startsWith('/conversations/')) {
      const id = path.replace('/conversations/', '');

      if (!id || id.includes('/')) {
        return Response.json(
          {
            success: false,
            error: 'Invalid conversation ID',
          },
          { status: 400 }
        );
      }

      const conversation = adapter.getConversation(id);

      if (!conversation) {
        return Response.json(
          {
            success: false,
            error: `Conversation not found: ${id}`,
          },
          { status: 404 }
        );
      }

      return Response.json({
        success: true,
        data: conversation,
      });
    }

    // GET /conversations - List all conversations
    if (req.method === 'GET' && path === '/conversations') {
      const url = new URL(req.url);
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      const conversations = adapter.listConversations(limit, offset);

      return Response.json({
        success: true,
        data: conversations,
        pagination: {
          limit,
          offset,
          count: conversations.length,
        },
      });
    }

    // DELETE /conversations/:id - Delete conversation
    if (req.method === 'DELETE' && path.startsWith('/conversations/')) {
      const id = path.replace('/conversations/', '');

      if (!id || id.includes('/')) {
        return Response.json(
          {
            success: false,
            error: 'Invalid conversation ID',
          },
          { status: 400 }
        );
      }

      adapter.deleteConversation(id);

      return Response.json({
        success: true,
        message: `Conversation ${id} deleted successfully`,
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
    logger.error('Conversations route error', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
