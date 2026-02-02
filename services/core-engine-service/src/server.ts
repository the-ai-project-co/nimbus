import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { logger } from '@nimbus/shared-utils';
import { setupRoutes } from './routes';
import { setupWebSocket } from './websocket';

export async function startServer(port: number, wsPort: number) {
  // HTTP Server
  const httpApp = new Elysia();

  // Add CORS middleware
  httpApp.use(cors());

  // Setup all routes
  setupRoutes(httpApp);

  // Start HTTP server
  const httpServer = httpApp.listen(port);

  logger.info(`Core Engine Service HTTP server listening on port ${port}`);
  logger.info('Available routes:');
  logger.info('  - POST /api/tasks');
  logger.info('  - POST /api/tasks/:taskId/execute');
  logger.info('  - GET  /api/tasks/:taskId');
  logger.info('  - POST /api/plans/generate');
  logger.info('  - POST /api/safety/check');
  logger.info('  - GET  /api/statistics');

  // WebSocket Server
  const wsApp = new Elysia();

  // Setup WebSocket
  setupWebSocket(wsApp);

  // Start WebSocket server
  const wsServer = wsApp.listen(wsPort);

  logger.info(`Core Engine Service WebSocket server listening on port ${wsPort}`);
  logger.info('WebSocket endpoint: ws://localhost:' + wsPort);

  return {
    httpApp,
    wsApp,
    stop: () => {
      httpServer.stop();
      wsServer.stop();
    },
  };
}
