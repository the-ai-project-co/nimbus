/**
 * Chat Routes
 * Handle chat completion requests
 */

import { logger } from '@nimbus/shared-utils';
import { LLMRouter } from '../router';
import { CompletionRequest, ToolCompletionRequest } from '../providers/base';

export function createChatRoutes(router: LLMRouter) {
  /**
   * POST /api/llm/chat
   * Non-streaming chat completion
   */
  async function chatHandler(req: Request): Promise<Response> {
    try {
      const body = (await req.json()) as CompletionRequest & { taskType?: string };

      if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
        return Response.json(
          {
            error: 'Invalid request',
            message: 'messages array is required and must not be empty',
          },
          { status: 400 }
        );
      }

      logger.info('Chat request received', {
        model: body.model,
        taskType: body.taskType,
        messageCount: body.messages.length,
      });

      const response = await router.route(body, body.taskType);

      logger.info('Chat request completed', {
        model: response.model,
        tokens: response.usage.totalTokens,
        finishReason: response.finishReason,
      });

      return Response.json(response);
    } catch (error: any) {
      logger.error('Chat request failed', error);
      return Response.json(
        {
          error: 'Chat request failed',
          message: error.message,
        },
        { status: 500 }
      );
    }
  }

  /**
   * POST /api/llm/chat/tools
   * Chat completion with tool calling support
   */
  async function chatWithToolsHandler(req: Request): Promise<Response> {
    try {
      const body = (await req.json()) as ToolCompletionRequest & { taskType?: string };

      if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
        return Response.json(
          {
            error: 'Invalid request',
            message: 'messages array is required and must not be empty',
          },
          { status: 400 }
        );
      }

      if (!body.tools || !Array.isArray(body.tools) || body.tools.length === 0) {
        return Response.json(
          {
            error: 'Invalid request',
            message: 'tools array is required for tool calling',
          },
          { status: 400 }
        );
      }

      logger.info('Chat with tools request received', {
        model: body.model,
        taskType: body.taskType,
        messageCount: body.messages.length,
        toolCount: body.tools.length,
      });

      const response = await router.routeWithTools(body, body.taskType);

      logger.info('Chat with tools request completed', {
        model: response.model,
        tokens: response.usage.totalTokens,
        hasToolCalls: !!response.toolCalls,
        toolCallCount: response.toolCalls?.length || 0,
      });

      return Response.json(response);
    } catch (error: any) {
      logger.error('Chat with tools request failed', error);
      return Response.json(
        {
          error: 'Chat with tools request failed',
          message: error.message,
        },
        { status: 500 }
      );
    }
  }

  return {
    chatHandler,
    chatWithToolsHandler,
  };
}
