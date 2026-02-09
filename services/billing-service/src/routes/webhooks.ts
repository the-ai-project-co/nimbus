/**
 * Stripe Webhook Handler
 * Handles Stripe webhook events for subscription updates
 */

import { logger } from '@nimbus/shared-utils';
import { updateSubscriptionStatus, createOrUpdateSubscription } from '../db/adapter';

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: any;
  };
}

/**
 * Handle Stripe webhook
 */
export async function handleStripeWebhook(
  body: string,
  signature: string
): Promise<{ received: boolean }> {
  // In production, verify webhook signature using STRIPE_WEBHOOK_SECRET
  // For now, just parse the event
  let event: StripeEvent;

  try {
    event = JSON.parse(body);
  } catch (err) {
    throw new Error('Invalid webhook payload');
  }

  logger.info(`Received Stripe webhook: ${event.type}`);

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const teamId = subscription.metadata?.team_id;

      if (teamId) {
        const plan = subscription.items?.data?.[0]?.price?.lookup_key || 'pro';
        createOrUpdateSubscription(teamId, plan, {
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: subscription.customer,
          periodStart: new Date(subscription.current_period_start * 1000),
          periodEnd: new Date(subscription.current_period_end * 1000),
        });
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const teamId = subscription.metadata?.team_id;

      if (teamId) {
        updateSubscriptionStatus(teamId, 'canceled');
      }
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      logger.info(`Payment succeeded for invoice ${invoice.id}`);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const subscription = invoice.subscription;

      if (subscription && typeof subscription === 'object') {
        const teamId = subscription.metadata?.team_id;
        if (teamId) {
          updateSubscriptionStatus(teamId, 'past_due');
        }
      }
      break;
    }

    default:
      logger.debug(`Unhandled webhook event type: ${event.type}`);
  }

  return { received: true };
}
