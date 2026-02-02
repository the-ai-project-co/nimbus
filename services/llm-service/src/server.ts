import { logger } from '@nimbus/shared-utils';
import { healthHandler } from './routes/health';
import { LLMRouter } from './router';
import { createChatRoutes } from './routes/chat';
import { createModelsRoutes } from './routes/models';
import { createTokenRoutes } from './routes/tokens';
import { createWebSocketServer } from './websocket';

export async function startServer(port: number, wsPort: number) {
  // Initialize LLM router
  const router = new LLMRouter();

  // Create route handlers
  const { chatHandler, chatWithToolsHandler } = createChatRoutes(router);
  const { modelsHandler } = createModelsRoutes(router);
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
  createWebSocketServer(router, wsPort);

  return server;
}
