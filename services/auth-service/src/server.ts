/**
 * Auth Service Server
 * HTTP server for authentication endpoints
 */

import { logger, serviceAuthMiddleware, SimpleRateLimiter, rateLimitMiddleware } from '@nimbus/shared-utils';
import {
  initiateDeviceFlow,
  pollDeviceCode,
  verifyDeviceCode,
} from './routes/device-code';
import { validateToken } from './routes/token';
import { initDatabase } from './db/adapter';

export async function startServer(port: number) {
  // Initialize database
  await initDatabase();

  // Rate limiter: 120 requests/min for auth service
  const limiter = new SimpleRateLimiter({ requestsPerMinute: 120 });
  const checkRateLimit = rateLimitMiddleware(limiter);

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method;

      // Health check endpoint
      if (path === '/health') {
        return Response.json({
          status: 'healthy',
          service: 'auth-service',
          timestamp: new Date().toISOString(),
        });
      }

      // Service-to-service authentication
      const authResponse = serviceAuthMiddleware(req);
      if (authResponse) return authResponse;

      // Rate limiting
      const rateLimitResponse = checkRateLimit(req);
      if (rateLimitResponse) return rateLimitResponse;

      // Device code flow - Initiate
      if (path === '/api/auth/device/initiate' && method === 'POST') {
        try {
          const result = await initiateDeviceFlow();
          return Response.json({ success: true, data: result });
        } catch (error: any) {
          logger.error('Device initiate error:', error);
          return Response.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }
      }

      // Device code flow - Poll
      if (path.startsWith('/api/auth/device/poll/') && method === 'GET') {
        try {
          const deviceCode = path.split('/').pop();
          if (!deviceCode) {
            return Response.json(
              { success: false, error: 'Device code required' },
              { status: 400 }
            );
          }
          const result = await pollDeviceCode(deviceCode);
          return Response.json({ success: true, data: result });
        } catch (error: any) {
          logger.error('Device poll error:', error);
          return Response.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }
      }

      // Device code flow - Verify
      if (path === '/api/auth/device/verify' && method === 'POST') {
        try {
          const body = await req.json() as { userCode: string; userId: string };
          const result = await verifyDeviceCode(body);
          return Response.json({ success: true, data: result });
        } catch (error: any) {
          logger.error('Device verify error:', error);
          return Response.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }
      }

      // Token validation
      if (path === '/api/auth/token/validate' && method === 'POST') {
        try {
          const body = await req.json() as { accessToken: string };
          const result = await validateToken(body);
          return Response.json({ success: true, data: result });
        } catch (error: any) {
          logger.error('Token validate error:', error);
          return Response.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }
      }

      // 404
      return new Response('Not Found', { status: 404 });
    },
  });

  logger.info(`Auth Service listening on port ${port}`);
  logger.info('Available routes:');
  logger.info('  - GET  /health');
  logger.info('  - POST /api/auth/device/initiate');
  logger.info('  - GET  /api/auth/device/poll/:code');
  logger.info('  - POST /api/auth/device/verify');
  logger.info('  - POST /api/auth/token/validate');

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
