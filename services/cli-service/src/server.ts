import { logger } from '@nimbus/shared-utils';
import { healthHandler } from './routes/health';

export async function startServer(port: number, wsPort: number) {
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

  logger.info(`CLI Service HTTP server listening on port ${port}`);

  
  // TODO: WebSocket server setup
  logger.info(`CLI Service WebSocket server will listen on port ${wsPort}`);
  

  return server;
}
