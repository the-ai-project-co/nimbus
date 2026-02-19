import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { logger, serviceAuthMiddleware, SimpleRateLimiter, rateLimitMiddleware } from '@nimbus/shared-utils';
import { setupRoutes } from './routes';
import { createGeneratorWebSocketServer } from './websocket';

export async function startServer(port: number, wsPort: number) {
  // Rate limiter: 60 requests/min for generator service
  const limiter = new SimpleRateLimiter({ requestsPerMinute: 60 });
  const checkRateLimit = rateLimitMiddleware(limiter);

  const app = new Elysia();

  // Add CORS middleware
  app.use(cors());

  // Service auth + rate limiting for API routes
  app.onBeforeHandle(({ request }) => {
    const authResponse = serviceAuthMiddleware(request);
    if (authResponse) return authResponse;

    const rateLimitResponse = checkRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;
  });

  // Add Swagger documentation
  app.use(swagger({
    documentation: {
      info: {
        title: 'Nimbus Generator Service API',
        version: '0.1.0',
        description: 'Generator Service for IaC code generation, questionnaires, templates, and best practices',
      },
      tags: [
        { name: 'Questionnaire', description: 'Interactive questionnaire endpoints' },
        { name: 'Templates', description: 'Template management and rendering' },
        { name: 'Best Practices', description: 'Best practices analysis and autofix' },
        { name: 'Conversational', description: 'Conversational code generation' },
        { name: 'Generation', description: 'Code generation endpoints' },
      ],
    },
  }));

  // Setup all routes (original /api/* paths — kept for backward compatibility)
  setupRoutes(app);

  // D2: Unified /api/generator/ prefix group
  // All generator routes are also accessible under /api/generator/* for API
  // consistency across services. Requests are forwarded by rewriting the URL
  // to strip the /generator segment and delegating to the original handlers.
  setupGeneratorPrefixRoutes(app);

  // Start HTTP server
  const httpServer = app.listen(port);

  logger.info(`Generator Service HTTP server listening on port ${port}`);
  logger.info('Available routes (original /api/* and aliased /api/generator/*):');
  logger.info('  - POST /api/questionnaire/start');
  logger.info('  - POST /api/questionnaire/answer');
  logger.info('  - GET  /api/questionnaire/session/:sessionId');
  logger.info('  - POST /api/templates/render');
  logger.info('  - POST /api/best-practices/analyze');
  logger.info('  - POST /api/conversational/message');
  logger.info('  - POST /api/generate/from-questionnaire');
  logger.info('  - POST /api/generators/terraform/project');
  logger.info('  - POST /api/generators/terraform/validate');
  logger.info('  All routes above are also available under /api/generator/ prefix');

  // WebSocket server setup
  const wsServer = createGeneratorWebSocketServer(wsPort);

  // Graceful shutdown handlers
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    httpServer.stop();
    if (wsServer && typeof wsServer.stop === 'function') {
      wsServer.stop();
    }
    process.exit(0);
  });
  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down...');
    httpServer.stop();
    if (wsServer && typeof wsServer.stop === 'function') {
      wsServer.stop();
    }
    process.exit(0);
  });

  return app;
}

// ---------------------------------------------------------------------------
// D2: /api/generator/ prefix route aliases
// ---------------------------------------------------------------------------

/**
 * Register proxy routes under /api/generator/* that forward to the original
 * /api/* handlers. This provides a unified prefix for the generator service
 * while keeping full backward compatibility with the original paths.
 *
 * Each route rewrites the incoming request URL by replacing the
 * `/api/generator/` segment with `/api/` and delegates to `app.handle()`.
 */
function setupGeneratorPrefixRoutes(app: Elysia) {
  /** Build a handler that rewrites `/api/generator/` to `/api/` and re-dispatches. */
  const proxyHandler = async ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    url.pathname = url.pathname.replace('/api/generator/', '/api/');

    // Construct a new request preserving method, headers, and body
    const init: RequestInit = {
      method: request.method,
      headers: request.headers,
    };
    if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'DELETE') {
      init.body = request.body;
      // @ts-expect-error — Bun supports duplex on Request but the types lag behind
      init.duplex = 'half';
    }

    return app.handle(new Request(url.toString(), init));
  };

  // Questionnaire
  app.post('/api/generator/questionnaire/start', proxyHandler);
  app.post('/api/generator/questionnaire/answer', proxyHandler);
  app.get('/api/generator/questionnaire/session/:sessionId', proxyHandler);
  app.delete('/api/generator/questionnaire/session/:sessionId', proxyHandler);

  // Templates
  app.get('/api/generator/templates', proxyHandler);
  app.get('/api/generator/templates/type/:type', proxyHandler);
  app.get('/api/generator/templates/provider/:provider', proxyHandler);
  app.get('/api/generator/templates/:templateId', proxyHandler);
  app.post('/api/generator/templates/render', proxyHandler);
  app.post('/api/generator/templates/validate', proxyHandler);
  app.post('/api/generator/templates/extract-variables', proxyHandler);

  // Best Practices
  app.post('/api/generator/best-practices/analyze', proxyHandler);
  app.post('/api/generator/best-practices/analyze-all', proxyHandler);
  app.post('/api/generator/best-practices/autofix', proxyHandler);
  app.get('/api/generator/best-practices/rules/:category', proxyHandler);
  app.get('/api/generator/best-practices/rules', proxyHandler);
  app.post('/api/generator/best-practices/report/markdown', proxyHandler);

  // Conversational
  app.post('/api/generator/conversational/message', proxyHandler);
  app.get('/api/generator/conversational/history/:sessionId', proxyHandler);
  app.get('/api/generator/conversational/session/:sessionId', proxyHandler);
  app.post('/api/generator/conversational/clear/:sessionId', proxyHandler);
  app.delete('/api/generator/conversational/session/:sessionId', proxyHandler);

  // Generation
  app.post('/api/generator/generate/from-questionnaire', proxyHandler);
  app.post('/api/generator/generate/from-conversation', proxyHandler);

  // Terraform Project Generator
  app.post('/api/generator/generators/terraform/project', proxyHandler);
  app.post('/api/generator/generators/terraform/validate', proxyHandler);
}
