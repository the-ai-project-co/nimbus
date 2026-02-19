/**
 * Billing Service Server
 * HTTP server for billing endpoints
 */

import { logger, serviceAuthMiddleware, SimpleRateLimiter, rateLimitMiddleware } from '@nimbus/shared-utils';
import { getBillingStatus, subscribe, cancelSubscription } from './routes/subscriptions';
import { getUsage, recordUsage } from './routes/usage';
import { handleStripeWebhook, WebhookSignatureError, WebhookParseError, WebhookProcessingError } from './routes/webhooks';
import { initDatabase, getInvoices, generateInvoice } from './db/adapter';

export async function startServer(port: number) {
  // Initialize database
  await initDatabase();

  // Rate limiter: 120 requests/min for billing service
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
          service: 'billing-service',
          timestamp: new Date().toISOString(),
        });
      }

      // Service-to-service authentication
      const authResponse = serviceAuthMiddleware(req);
      if (authResponse) return authResponse;

      // Rate limiting
      const rateLimitResponse = checkRateLimit(req);
      if (rateLimitResponse) return rateLimitResponse;

      // Get billing status
      if (path === '/api/billing/status' && method === 'GET') {
        try {
          const teamId = url.searchParams.get('teamId');
          if (!teamId) {
            return Response.json(
              { success: false, error: 'teamId query param required' },
              { status: 400 }
            );
          }
          const result = await getBillingStatus(teamId);
          return Response.json({ success: true, data: result });
        } catch (error: any) {
          logger.error('Get billing status error:', error);
          return Response.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }
      }

      // Subscribe to a plan
      if (path === '/api/billing/subscribe' && method === 'POST') {
        try {
          const body = await req.json() as { teamId: string; plan: string; paymentMethodId?: string; seats?: number };
          const result = await subscribe(body);
          return Response.json({ success: true, data: result });
        } catch (error: any) {
          logger.error('Subscribe error:', error);
          return Response.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }
      }

      // Cancel subscription
      if (path === '/api/billing/cancel' && method === 'POST') {
        try {
          const body = await req.json() as { teamId: string };
          const result = await cancelSubscription(body.teamId);
          return Response.json({ success: true, data: result });
        } catch (error: any) {
          logger.error('Cancel error:', error);
          return Response.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }
      }

      // Get usage
      if (path === '/api/billing/usage' && method === 'GET') {
        try {
          const teamId = url.searchParams.get('teamId');
          const period = url.searchParams.get('period') || 'month';
          if (!teamId) {
            return Response.json(
              { success: false, error: 'teamId query param required' },
              { status: 400 }
            );
          }
          const result = await getUsage(teamId, period as 'day' | 'week' | 'month');
          return Response.json({ success: true, data: result });
        } catch (error: any) {
          logger.error('Get usage error:', error);
          return Response.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }
      }

      // Record usage
      if (path === '/api/billing/usage' && method === 'POST') {
        try {
          const body = await req.json() as { teamId: string; userId?: string; operationType: string; tokensUsed: number; costUsd: number };
          await recordUsage(body);
          return Response.json({ success: true, data: { recorded: true } });
        } catch (error: any) {
          logger.error('Record usage error:', error);
          return Response.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }
      }

      // Get invoices
      if (path === '/api/billing/invoices' && method === 'GET') {
        try {
          const teamId = url.searchParams.get('teamId');
          const limit = parseInt(url.searchParams.get('limit') || '10', 10);
          if (!teamId) {
            return Response.json(
              { success: false, error: 'teamId query param required' },
              { status: 400 }
            );
          }
          const invoices = getInvoices(teamId, limit);
          return Response.json({ success: true, data: invoices });
        } catch (error: any) {
          logger.error('Get invoices error:', error);
          return Response.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }
      }

      // Generate invoice
      if (path === '/api/billing/invoices/generate' && method === 'POST') {
        try {
          const body = await req.json() as { teamId: string; periodStart: string; periodEnd: string };
          if (!body.teamId || !body.periodStart || !body.periodEnd) {
            return Response.json(
              { success: false, error: 'teamId, periodStart, and periodEnd are required' },
              { status: 400 }
            );
          }
          const invoice = generateInvoice(body.teamId, body.periodStart, body.periodEnd);
          return Response.json({ success: true, data: invoice });
        } catch (error: any) {
          logger.error('Generate invoice error:', error);
          return Response.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }
      }

      // Stripe webhook
      if (path === '/api/billing/webhooks/stripe' && method === 'POST') {
        try {
          const body = await req.text();
          const signature = req.headers.get('stripe-signature') || '';
          const result = await handleStripeWebhook(body, signature);
          return Response.json({ success: true, data: result });
        } catch (error: any) {
          logger.error('Webhook error:', error);

          // Return appropriate status codes based on error type
          if (error instanceof WebhookSignatureError || error instanceof WebhookParseError) {
            // 400 for signature/parsing errors - don't retry
            return Response.json(
              { success: false, error: error.message },
              { status: 400 }
            );
          } else if (error instanceof WebhookProcessingError) {
            // 500 for processing errors - Stripe will retry
            return Response.json(
              { success: false, error: error.message },
              { status: 500 }
            );
          }

          // Default to 500 for unknown errors (allows retry)
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

  logger.info(`Billing Service listening on port ${port}`);
  logger.info('Available routes:');
  logger.info('  - GET  /health');
  logger.info('  - GET  /api/billing/status?teamId=...');
  logger.info('  - POST /api/billing/subscribe');
  logger.info('  - POST /api/billing/cancel');
  logger.info('  - GET  /api/billing/usage?teamId=...');
  logger.info('  - POST /api/billing/usage');
  logger.info('  - GET  /api/billing/invoices?teamId=...');
  logger.info('  - POST /api/billing/invoices/generate');
  logger.info('  - POST /api/billing/webhooks/stripe');

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
