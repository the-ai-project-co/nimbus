import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { logger } from '@nimbus/shared-utils';
import { setupRoutes } from './routes';

export async function startServer(port: number, wsPort: number) {
  const app = new Elysia();

  // Add CORS middleware
  app.use(cors());

  // Setup all routes
  setupRoutes(app);

  // Start HTTP server
  app.listen(port);

  logger.info(`Generator Service HTTP server listening on port ${port}`);
  logger.info('Available routes:');
  logger.info('  - POST /api/questionnaire/start');
  logger.info('  - POST /api/questionnaire/answer');
  logger.info('  - GET  /api/questionnaire/session/:sessionId');
  logger.info('  - POST /api/templates/render');
  logger.info('  - POST /api/best-practices/analyze');
  logger.info('  - POST /api/conversational/message');
  logger.info('  - POST /api/generate/from-questionnaire');

  // TODO: WebSocket server setup
  logger.info(`Generator Service WebSocket server will listen on port ${wsPort}`);

  return app;
}
