import { logger, serviceAuthMiddleware, SimpleRateLimiter, rateLimitMiddleware } from '@nimbus/shared-utils';
import { router } from './routes';

export interface ServerOptions {
  httpPort: number;
}

export interface ServerInstances {
  http: ReturnType<typeof Bun.serve>;
  stop: () => void;
}

const limiter = new SimpleRateLimiter({ requestsPerMinute: 120 });
const checkRateLimit = rateLimitMiddleware(limiter);

export async function startServer(options: ServerOptions): Promise<ServerInstances> {
  const { httpPort } = options;

  const httpServer = Bun.serve({
    port: httpPort,
    async fetch(req) {
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

  logger.info(`Azure Tools Service HTTP server listening on port ${httpPort}`);

  const instances: ServerInstances = {
    http: httpServer,
    stop: () => {
      httpServer.stop();
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
