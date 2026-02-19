import { logger, initTracing, serviceAuthMiddleware, SimpleRateLimiter, rateLimitMiddleware } from '@nimbus/shared-utils';
import { healthHandler } from './routes/health';
import { LLMRouter } from './router';
import { loadLLMConfig } from './config-loader';
import { createChatRoutes } from './routes/chat';
import { createModelsRoutes } from './routes/models';
import { createProvidersRoutes } from './routes/providers';
import { createTokenRoutes } from './routes/tokens';
import { createWebSocketServer } from './websocket';

export async function startServer(port: number, wsPort: number) {
  // Initialize distributed tracing
  initTracing('llm-service');

  // Rate limiter: 60 requests/min for LLM service
  const limiter = new SimpleRateLimiter({ requestsPerMinute: 60 });
  const checkRateLimit = rateLimitMiddleware(limiter);

  // Initialize LLM router with config from ~/.nimbus/config.yaml
  const router = new LLMRouter(loadLLMConfig());

  // Create route handlers
  const { chatHandler, chatWithToolsHandler } = createChatRoutes(router);
  const { modelsHandler } = createModelsRoutes(router);
  const { providersHandler } = createProvidersRoutes(router);
  const { countTokensHandler } = createTokenRoutes(router);

  // HTTP Server
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // Health check endpoint
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
  <title>Nimbus LLM Service API</title>
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
            title: 'Nimbus LLM Service API',
            version: '0.1.0',
            description: 'LLM routing and chat completion service',
          },
          servers: [{ url: 'http://localhost:3002', description: 'Local development' }],
          paths: {
            '/health': { get: { tags: ['Health'], summary: 'Health check', responses: { '200': { description: 'Healthy' } } } },
            '/api/llm/chat': { post: { tags: ['Chat'], summary: 'Chat completion', requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { '200': { description: 'Chat response' } } } },
            '/api/llm/chat/tools': { post: { tags: ['Chat'], summary: 'Chat with tool use', requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { '200': { description: 'Chat response with tools' } } } },
            '/api/llm/models': { get: { tags: ['Models'], summary: 'List available models', responses: { '200': { description: 'Model list' } } } },
            '/api/llm/providers': { get: { tags: ['Providers'], summary: 'List registered providers with availability', responses: { '200': { description: 'Provider list' } } } },
            '/api/llm/tokens/count': { post: { tags: ['Tokens'], summary: 'Count tokens in text', requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { '200': { description: 'Token count' } } } },
          },
        });
      }

      // Chat routes
      if (path === '/api/llm/chat' && req.method === 'POST') {
        return chatHandler(req);
      }

      if (path === '/api/llm/chat/tools' && req.method === 'POST') {
        return chatWithToolsHandler(req);
      }

      // Models route
      if (path === '/api/llm/models' && req.method === 'GET') {
        return modelsHandler(req);
      }

      // Providers route
      if (path === '/api/llm/providers' && req.method === 'GET') {
        return providersHandler(req);
      }

      // Token counting route
      if (path === '/api/llm/tokens/count' && req.method === 'POST') {
        return countTokensHandler(req);
      }

      // 404
      return new Response('Not Found', { status: 404 });
    },
  });

  logger.info(`LLM Service HTTP server listening on port ${port}`);

  // WebSocket server setup
  const wsServer = createWebSocketServer(router, wsPort);

  // Graceful shutdown handlers
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    server.stop();
    if (wsServer && typeof wsServer.stop === 'function') {
      wsServer.stop();
    }
    process.exit(0);
  });
  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down...');
    server.stop();
    if (wsServer && typeof wsServer.stop === 'function') {
      wsServer.stop();
    }
    process.exit(0);
  });

  return server;
}
