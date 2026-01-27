import { logger } from '@nimbus/shared-utils';
import { healthHandler } from './routes/health';
import { configRouter } from './routes/config';
import { historyRouter } from './routes/history';

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

      // Config routes
      if (path.startsWith('/config')) {
        return configRouter(req, path);
      }

      // History routes
      if (path.startsWith('/history')) {
        return historyRouter(req, path);
      }

      // 404
      return new Response('Not Found', { status: 404 });
    },
  });

  logger.info(`State Service HTTP server listening on port ${port}`);
  return server;
}
