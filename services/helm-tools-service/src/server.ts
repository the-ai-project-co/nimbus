import { logger } from '@nimbus/shared-utils';
import { router } from './routes';

export async function startServer(port: number) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      try {
        return await router(req);
      } catch (error: any) {
        logger.error('Request handler error', error);
        return Response.json(
          { success: false, error: error.message || 'Internal server error' },
          { status: 500 }
        );
      }
    },
  });

  logger.info(`Helm Tools Service HTTP server listening on port ${port}`);

  return server;
}
