/**
 * Models Routes
 * Handle model listing requests
 */

import { logger } from '@nimbus/shared-utils';
import { LLMRouter } from '../router';

export function createModelsRoutes(router: LLMRouter) {
  /**
   * GET /api/llm/models
   * List all available models across all providers
   */
  async function modelsHandler(req: Request): Promise<Response> {
    try {
      const models = await router.getAvailableModels();

      logger.info('Models list requested', {
        providerCount: Object.keys(models).length,
        totalModels: Object.values(models).reduce((sum, arr) => sum + arr.length, 0),
      });

      return Response.json({
        models,
        providers: Object.keys(models),
      });
    } catch (error: any) {
      logger.error('Failed to list models', error);
      return Response.json(
        {
          error: 'Failed to list models',
          message: error.message,
        },
        { status: 500 }
      );
    }
  }

  return {
    modelsHandler,
  };
}
