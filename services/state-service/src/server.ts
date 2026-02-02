import { logger } from '@nimbus/shared-utils';
import { healthHandler } from './routes/health';
import { configRouter } from './routes/config';
import { historyRouter } from './routes/history';
import { conversationsRouter } from './routes/conversations';
import { artifactsRouter } from './routes/artifacts';
import { templatesRouter } from './routes/templates';
import { credentialsRouter } from './routes/credentials';

export async function startServer(port: number) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // Health check endpoint (not prefixed)
      if (path === '/health') {
        return Response.json(healthHandler());
      }

      // Enforce /api/state prefix for all API routes
      if (!path.startsWith('/api/state/')) {
        return Response.json(
          {
            success: false,
            error: 'All API routes must be prefixed with /api/state/',
          },
          { status: 404 }
        );
      }

      // Extract the route path after /api/state
      const apiPath = path.replace('/api/state', '');

      // Config routes
      if (apiPath.startsWith('/config')) {
        return configRouter(req, apiPath);
      }

      // History routes
      if (apiPath.startsWith('/history')) {
        return historyRouter(req, apiPath);
      }

      // Conversations routes
      if (apiPath.startsWith('/conversations')) {
        return conversationsRouter(req, apiPath);
      }

      // Artifacts routes
      if (apiPath.startsWith('/artifacts')) {
        return artifactsRouter(req, apiPath);
      }

      // Templates routes
      if (apiPath.startsWith('/templates')) {
        return templatesRouter(req, apiPath);
      }

      // Credentials routes
      if (apiPath.startsWith('/credentials')) {
        return credentialsRouter(req, apiPath);
      }

      // 404
      return Response.json(
        {
          success: false,
          error: 'Not Found',
        },
        { status: 404 }
      );
    },
  });

  logger.info(`State Service HTTP server listening on port ${port}`);
  logger.info('Available routes:');
  logger.info('  GET  /health');
  logger.info('  GET  /api/state/config');
  logger.info('  PUT  /api/state/config');
  logger.info('  GET  /api/state/history');
  logger.info('  POST /api/state/history');
  logger.info('  GET  /api/state/conversations');
  logger.info('  POST /api/state/conversations');
  logger.info('  GET  /api/state/artifacts');
  logger.info('  POST /api/state/artifacts');
  logger.info('  GET  /api/state/templates');
  logger.info('  POST /api/state/templates');
  logger.info('  GET  /api/state/credentials/:provider');
  logger.info('  POST /api/state/credentials/validate/:provider');

  return server;
}
