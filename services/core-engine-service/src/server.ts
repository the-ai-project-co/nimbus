import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { logger, initTracing, serviceAuthMiddleware, SimpleRateLimiter, rateLimitMiddleware } from '@nimbus/shared-utils';
import { setupRoutes } from './routes';
import { setupWebSocket } from './websocket';

export async function startServer(port: number, wsPort: number) {
  // Initialize distributed tracing
  initTracing('core-engine-service');

  // Rate limiter: 120 requests/min for core engine
  const limiter = new SimpleRateLimiter({ requestsPerMinute: 120 });
  const checkRateLimit = rateLimitMiddleware(limiter);

  // HTTP Server
  const httpApp = new Elysia();

  // Add CORS middleware
  httpApp.use(cors());

  // Service auth + rate limiting for API routes
  httpApp.onBeforeHandle(({ request }) => {
    const authResponse = serviceAuthMiddleware(request);
    if (authResponse) return authResponse;

    const rateLimitResponse = checkRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;
  });

  // Add Swagger documentation
  httpApp.use(swagger({
    documentation: {
      info: {
        title: 'Nimbus Core Engine API',
        version: '0.1.0',
        description: 'Core Engine Service for AI-Powered Cloud Engineering',
      },
      tags: [
        { name: 'Tasks', description: 'Task management endpoints' },
        { name: 'Plans', description: 'Plan generation endpoints' },
        { name: 'Safety', description: 'Safety check endpoints' },
        { name: 'Statistics', description: 'Statistics endpoints' },
      ],
    },
  }));

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
  logger.info('  - GET  /swagger (API Documentation)');

  // WebSocket Server
  const wsApp = new Elysia();

  // Setup WebSocket
  setupWebSocket(wsApp);

  // Start WebSocket server
  const wsServer = wsApp.listen(wsPort);

  logger.info(`Core Engine Service WebSocket server listening on port ${wsPort}`);
  logger.info('WebSocket endpoint: ws://localhost:' + wsPort);

  const instances = {
    httpApp,
    wsApp,
    stop: () => {
      httpServer.stop();
      wsServer.stop();
    },
  };

  // Graceful shutdown handlers
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    instances.stop();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down...');
    instances.stop();
    process.exit(0);
  });

  return instances;
}
