import { logger, serviceAuthMiddleware, SimpleRateLimiter, rateLimitMiddleware } from '@nimbus/shared-utils';
import { healthHandler } from './routes/health';
import { configRouter } from './routes/config';
import { historyRouter } from './routes/history';
import { conversationsRouter } from './routes/conversations';
import { artifactsRouter } from './routes/artifacts';
import { templatesRouter } from './routes/templates';
import { credentialsRouter } from './routes/credentials';
import projectsRouter from './routes/projects';
import auditRouter from './routes/audit';
import safetyRouter from './routes/safety';
import checkpointsRouter from './routes/checkpoints';

export async function startServer(port: number) {
  // Rate limiter: 300 requests/min for state service
  const limiter = new SimpleRateLimiter({ requestsPerMinute: 300 });
  const checkRateLimit = rateLimitMiddleware(limiter);

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // Health check endpoint (not prefixed)
      if (path === '/health') {
        return Response.json(healthHandler());
      }

      // Service-to-service authentication
      const authResponse = serviceAuthMiddleware(req);
      if (authResponse) return authResponse;

      // Rate limiting
      const rateLimitResponse = checkRateLimit(req);
      if (rateLimitResponse) return rateLimitResponse;

      // Swagger UI
      if (path === '/swagger' || path === '/swagger/') {
        return new Response(`<!DOCTYPE html>
<html>
<head>
  <title>Nimbus State Service API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger-ui' });</script>
</body>
</html>`, { headers: { 'Content-Type': 'text/html' } });
      }

      // OpenAPI spec
      if (path === '/api/openapi.json') {
        return Response.json({
          openapi: '3.0.3',
          info: {
            title: 'Nimbus State Service API',
            version: '0.1.0',
            description: 'State management service for configuration, history, conversations, and artifacts',
          },
          servers: [{ url: 'http://localhost:3011', description: 'Local development' }],
          paths: {
            '/health': { get: { tags: ['Health'], summary: 'Health check', responses: { '200': { description: 'Healthy' } } } },
            '/api/state/config': {
              get: { tags: ['Config'], summary: 'Get configuration', responses: { '200': { description: 'Config values' } } },
              put: { tags: ['Config'], summary: 'Update configuration', responses: { '200': { description: 'Updated' } } },
            },
            '/api/state/history': {
              get: { tags: ['History'], summary: 'Get command history', responses: { '200': { description: 'History entries' } } },
              post: { tags: ['History'], summary: 'Add history entry', responses: { '200': { description: 'Created' } } },
            },
            '/api/state/conversations': {
              get: { tags: ['Conversations'], summary: 'List conversations', responses: { '200': { description: 'Conversation list' } } },
              post: { tags: ['Conversations'], summary: 'Create conversation', responses: { '200': { description: 'Created' } } },
            },
            '/api/state/artifacts': {
              get: { tags: ['Artifacts'], summary: 'List artifacts', responses: { '200': { description: 'Artifact list' } } },
              post: { tags: ['Artifacts'], summary: 'Store artifact', responses: { '200': { description: 'Stored' } } },
            },
            '/api/state/templates': {
              get: { tags: ['Templates'], summary: 'List templates', responses: { '200': { description: 'Template list' } } },
              post: { tags: ['Templates'], summary: 'Store template', responses: { '200': { description: 'Stored' } } },
            },
            '/api/state/projects': {
              get: { tags: ['Projects'], summary: 'List projects', responses: { '200': { description: 'Project list' } } },
              post: { tags: ['Projects'], summary: 'Create project', responses: { '200': { description: 'Created' } } },
            },
            '/api/state/audit': {
              get: { tags: ['Audit'], summary: 'Get audit log', responses: { '200': { description: 'Audit entries' } } },
              post: { tags: ['Audit'], summary: 'Create audit entry', responses: { '200': { description: 'Created' } } },
            },
          },
        });
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

      // Projects routes
      if (apiPath.startsWith('/projects')) {
        return projectsRouter.fetch(req);
      }

      // Audit routes
      if (apiPath.startsWith('/audit')) {
        return auditRouter.fetch(req);
      }

      // Safety routes
      if (apiPath.startsWith('/safety')) {
        return safetyRouter.fetch(req);
      }

      // Checkpoints routes
      if (apiPath.startsWith('/checkpoints')) {
        return checkpointsRouter.fetch(req);
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
  logger.info('  GET  /api/state/projects');
  logger.info('  POST /api/state/projects');
  logger.info('  GET  /api/state/projects/:id');
  logger.info('  PUT  /api/state/projects/:id');
  logger.info('  DELETE /api/state/projects/:id');
  logger.info('  GET  /api/state/audit');
  logger.info('  POST /api/state/audit');
  logger.info('  GET  /api/state/audit/export');
  logger.info('  GET  /api/state/safety/:operationId');
  logger.info('  POST /api/state/safety');
  logger.info('  POST /api/state/safety/:checkId/approve');
  logger.info('  POST /api/state/checkpoints');
  logger.info('  GET  /api/state/checkpoints/latest/:operationId');
  logger.info('  GET  /api/state/checkpoints/list/:operationId');
  logger.info('  GET  /api/state/checkpoints/:id');
  logger.info('  DELETE /api/state/checkpoints/:operationId');

  // Graceful shutdown handlers
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    server.stop();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down...');
    server.stop();
    process.exit(0);
  });

  return server;
}
