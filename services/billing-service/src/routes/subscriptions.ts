/**
 * Subscription Routes
 * Stripe subscription management
 */

import type { BillingStatus, TeamPlan } from '@nimbus/shared-types';
import {
  getSubscription,
  createOrUpdateSubscription,
  cancelSubscriptionRecord,
} from '../db/adapter';

// Subscribe request interface that accepts plain strings
interface SubscribeReq {
  teamId: string;
  plan: string;
  paymentMethodId?: string;
  seats?: number;
}

/**
 * Get billing status for a team
 */
export async function getBillingStatus(teamId: string): Promise<BillingStatus> {
  const subscription = getSubscription(teamId);

  if (!subscription) {
    // Return free plan defaults
    return {
      plan: 'free',
      status: 'active',
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancelAtPeriodEnd: false,
      seats: {
        used: 1,
        total: 5,
      },
    };
  }

  return {
    plan: subscription.plan as TeamPlan,
    status: subscription.status as BillingStatus['status'],
    currentPeriodStart: subscription.current_period_start || new Date().toISOString(),
    currentPeriodEnd: subscription.current_period_end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === 1,
    seats: {
      used: subscription.seats_used,
      total: subscription.seats_total,
    },
  };
}

/**
 * Subscribe to a plan
 */
export async function subscribe(
  request: SubscribeReq
): Promise<BillingStatus> {
  const { teamId, plan, paymentMethodId, seats } = request;

  if (!teamId) {
    throw new Error('Team ID is required');
  }

  // In a real implementation, this would:
  // 1. Create/retrieve Stripe customer
  // 2. Create Stripe subscription
  // 3. Store subscription details

  const periodStart = new Date();
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  createOrUpdateSubscription(teamId, plan, {
    periodStart,
    periodEnd,
    seatsTotal: seats || (plan === 'enterprise' ? 100 : plan === 'pro' ? 25 : 5),
  });

  return getBillingStatus(teamId);
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(teamId: string): Promise<BillingStatus> {
  if (!teamId) {
    throw new Error('Team ID is required');
  }

  const subscription = getSubscription(teamId);
  if (!subscription) {
    throw new Error('No subscription found');
  }

  if (subscription.plan === 'free') {
    throw new Error('Cannot cancel free plan');
  }

  // In a real implementation, this would cancel via Stripe
  cancelSubscriptionRecord(teamId);

  return getBillingStatus(teamId);
}
