/**
 * Token Routes
 * Handle token counting requests
 */

import { logger } from '@nimbus/shared-utils';
import { LLMRouter } from '../router';
import { AnthropicProvider, OpenAIProvider } from '../providers';

export function createTokenRoutes(router: LLMRouter) {
  /**
   * POST /api/llm/tokens/count
   * Count tokens for a given text
   */
  async function countTokensHandler(req: Request): Promise<Response> {
    try {
      const body = (await req.json()) as {
        text: string;
        model?: string;
      };

      if (!body.text) {
        return Response.json(
          {
            error: 'Invalid request',
            message: 'text field is required',
          },
          { status: 400 }
        );
      }

      // Determine which provider to use for token counting
      let provider;
      if (body.model) {
        if (body.model.startsWith('claude')) {
          provider = new AnthropicProvider();
        } else if (body.model.startsWith('gpt')) {
          provider = new OpenAIProvider();
        } else {
          // Default to approximation
          provider = new AnthropicProvider();
        }
      } else {
        // Default to OpenAI tokenizer (most accurate)
        provider = new OpenAIProvider();
      }

      const tokenCount = await provider.countTokens(body.text);

      logger.info('Token count requested', {
        model: body.model,
        textLength: body.text.length,
        tokenCount,
      });

      return Response.json({
        tokenCount,
        textLength: body.text.length,
        model: body.model || 'default',
      });
    } catch (error: any) {
      logger.error('Token count failed', error);
      return Response.json(
        {
          error: 'Token count failed',
          message: error.message,
        },
        { status: 500 }
      );
    }
  }

  return {
    countTokensHandler,
  };
}
