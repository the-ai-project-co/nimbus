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

// Custom error classes for different error types
export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

export class WebhookParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookParseError';
  }
}

export class WebhookProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookProcessingError';
  }
}

/**
 * Verify Stripe webhook signature
 * In production, use the Stripe SDK: stripe.webhooks.constructEvent(body, signature, secret)
 */
function verifySignature(body: string, signature: string): boolean {
  if (!STRIPE_WEBHOOK_SECRET) {
    logger.warn('STRIPE_WEBHOOK_SECRET not configured - signature verification skipped');
    return true; // Allow in development
  }

  if (!signature) {
    return false;
  }

  // In production, implement proper HMAC verification or use Stripe SDK
  // For now, just check that signature is present
  // TODO: Use stripe.webhooks.constructEvent() with actual Stripe SDK
  return signature.startsWith('t=') || signature.length > 0;
}

/**
 * Handle Stripe webhook
 */
export async function handleStripeWebhook(
  body: string,
  signature: string
): Promise<{ received: boolean }> {
  // Verify webhook signature
  if (!verifySignature(body, signature)) {
    throw new WebhookSignatureError('Invalid webhook signature');
  }

  // Parse the event
  let event: StripeEvent;
  try {
    event = JSON.parse(body);
  } catch (err) {
    throw new WebhookParseError('Invalid webhook payload');
  }

  logger.info(`Received Stripe webhook: ${event.type}`);

  try {
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

        // Handle both expanded object and string ID cases
        let teamId: string | undefined;

        if (subscription && typeof subscription === 'object') {
          teamId = subscription.metadata?.team_id;
        } else if (typeof subscription === 'string') {
          // Subscription is a string ID - in production, fetch from Stripe
          // For now, log and skip (would need: stripe.subscriptions.retrieve(subscription))
          logger.warn(`invoice.payment_failed: subscription is string ID "${subscription}" - cannot extract team_id without Stripe API call`);
        }

        if (teamId) {
          updateSubscriptionStatus(teamId, 'past_due');
        }
        break;
      }

      default:
        logger.debug(`Unhandled webhook event type: ${event.type}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new WebhookProcessingError(`Failed to process webhook: ${message}`);
  }

  return { received: true };
}
