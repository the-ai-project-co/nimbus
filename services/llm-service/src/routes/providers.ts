/**
 * Providers Routes
 * Handle provider listing requests
 */

import { logger } from '@nimbus/shared-utils';
import { LLMRouter } from '../router';

export function createProvidersRoutes(router: LLMRouter) {
  /**
   * GET /api/llm/providers
   * List all registered providers with availability and model info
   */
  async function providersHandler(req: Request): Promise<Response> {
    try {
      const providers = await router.getProviders();

      logger.info('Providers list requested', {
        totalProviders: providers.length,
        availableProviders: providers.filter(p => p.available).length,
      });

      return Response.json({
        success: true,
        data: {
          providers,
        },
      });
    } catch (error: any) {
      logger.error('Failed to list providers', error);
      return Response.json(
        {
          success: false,
          error: 'Failed to list providers',
          message: error.message,
        },
        { status: 500 }
      );
    }
  }

  return {
    providersHandler,
  };
}
