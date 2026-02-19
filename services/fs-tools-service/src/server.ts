import { logger, serviceAuthMiddleware, SimpleRateLimiter, rateLimitMiddleware } from '@nimbus/shared-utils';
import { router } from './routes';

const SWAGGER_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Nimbus File System Tools Service API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger-ui' });</script>
</body>
</html>`;

const OPENAPI_SPEC = {
  openapi: '3.0.3',
  info: { title: 'Nimbus File System Tools Service API', version: '0.1.0', description: 'File system operations service for Nimbus' },
  paths: {
    '/health': { get: { tags: ['Health'], summary: 'Health check', responses: { '200': { description: 'Healthy' } } } },
    '/api/fs/read': { post: { tags: ['Files'], summary: 'Read file content', responses: { '200': { description: 'File content' } } } },
    '/api/fs/write': { post: { tags: ['Files'], summary: 'Write file content', responses: { '200': { description: 'Written' } } } },
    '/api/fs/append': { post: { tags: ['Files'], summary: 'Append to file', responses: { '200': { description: 'Appended' } } } },
    '/api/fs/list': { post: { tags: ['Directories'], summary: 'List directory', responses: { '200': { description: 'File list' } } } },
    '/api/fs/search': { post: { tags: ['Files'], summary: 'Search files', responses: { '200': { description: 'Search results' } } } },
    '/api/fs/tree': { post: { tags: ['Directories'], summary: 'Directory tree', responses: { '200': { description: 'Tree' } } } },
    '/api/fs/diff': { post: { tags: ['Files'], summary: 'File diff', responses: { '200': { description: 'Diff' } } } },
    '/api/fs/copy': { post: { tags: ['Files'], summary: 'Copy file/directory', responses: { '200': { description: 'Copied' } } } },
    '/api/fs/move': { post: { tags: ['Files'], summary: 'Move file/directory', responses: { '200': { description: 'Moved' } } } },
    '/api/fs/delete': { delete: { tags: ['Files'], summary: 'Delete file/directory', responses: { '200': { description: 'Deleted' } } } },
    '/api/fs/mkdir': { post: { tags: ['Directories'], summary: 'Create directory', responses: { '200': { description: 'Created' } } } },
    '/api/fs/exists': { post: { tags: ['Files'], summary: 'Check existence', responses: { '200': { description: 'Exists status' } } } },
    '/api/fs/stat': { post: { tags: ['Files'], summary: 'Get file stats', responses: { '200': { description: 'Stats' } } } },
    '/api/fs/readdir': { post: { tags: ['Directories'], summary: 'Read directory entries', responses: { '200': { description: 'Entries' } } } },
  },
};

const limiter = new SimpleRateLimiter({ requestsPerMinute: 120 });
const checkRateLimit = rateLimitMiddleware(limiter);

export async function startServer(port: number) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === '/swagger' || url.pathname === '/swagger/') {
        return new Response(SWAGGER_HTML, { headers: { 'Content-Type': 'text/html' } });
      }
      if (url.pathname === '/api/openapi.json') {
        return Response.json(OPENAPI_SPEC);
      }

      // Service-to-service authentication
      const authResponse = serviceAuthMiddleware(req);
      if (authResponse) return authResponse;

      // Rate limiting
      const rateLimitResponse = checkRateLimit(req);
      if (rateLimitResponse) return rateLimitResponse;

      try {
        return await router(req);
      } catch (error: any) {
        logger.error('Request handler error', error);
        return Response.json(
          { success: false, error: error.message || 'Internal server error' },
          { status: 500 }
        );
      }
    },
  });

  logger.info(`File System Tools Service HTTP server listening on port ${port}`);

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
