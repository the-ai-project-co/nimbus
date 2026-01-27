import { logger } from '@nimbus/shared-utils';
import { healthHandler } from './routes/health';

export async function startServer(port: number) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // Health check endpoint
      if (path === '/health') {
        return Response.json(healthHandler());
      }

      // TODO: Add your routes here

      // 404
      return new Response('Not Found', { status: 404 });
    },
  });

  logger.info(`File System Tools Service HTTP server listening on port ${port}`);

  

  return server;
}
