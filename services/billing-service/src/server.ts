/**
 * Billing Service Server
 * HTTP server for billing endpoints
 */

import { logger } from '@nimbus/shared-utils';
import { getBillingStatus, subscribe, cancelSubscription } from './routes/subscriptions';
import { getUsage, recordUsage } from './routes/usage';
import { handleStripeWebhook } from './routes/webhooks';
import { initDatabase } from './db/adapter';

export async function startServer(port: number) {
  // Initialize database
  await initDatabase();

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
          // Mock invoices for now (real implementation would call Stripe)
          const invoices = await getMockInvoices(teamId, limit);
          return Response.json({ success: true, data: invoices });
        } catch (error: any) {
          logger.error('Get invoices error:', error);
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
          return Response.json(
            { success: false, error: error.message },
            { status: 400 }
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
  logger.info('  - POST /api/billing/webhooks/stripe');

  return server;
}

// Mock invoices (replace with real Stripe integration)
async function getMockInvoices(teamId: string, limit: number) {
  return [];
}
