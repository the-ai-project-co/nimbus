/**
 * Enterprise Billing - Subscription management and usage tracking.
 *
 * Embedded replacement for services/billing-service.
 * All business logic is preserved verbatim from:
 *   - services/billing-service/src/routes/subscriptions.ts
 *   - services/billing-service/src/routes/usage.ts
 *
 * HTTP handlers, routes, and per-service SQLite are stripped.
 * State is read/written through the unified database via ../state/billing.
 */

import {
  createSubscription as stateCreateSubscription,
  getSubscription as stateGetSubscription,
  updateSubscription as stateUpdateSubscription,
  recordUsage as stateRecordUsage,
  getUsage as stateGetUsage,
  getUsageSummary as stateGetUsageSummary,
  type SubscriptionRecord,
  type UsageRecord,
  type UsageSummary as StateUsageSummary,
} from '../state/billing';

// ---------------------------------------------------------------------------
// Plan catalog (preserved verbatim from billing-service/src/routes/subscriptions.ts)
// ---------------------------------------------------------------------------

interface PlanDetails {
  name: string;
  stripe_price_id: string;
  amount_cents: number;
  currency: string;
  interval: 'month' | 'year';
  seats_included: number;
  features: string[];
}

const PLAN_CATALOG: Record<string, PlanDetails> = {
  free: {
    name: 'Nimbus Free',
    stripe_price_id: 'price_demo_free_monthly',
    amount_cents: 0,
    currency: 'usd',
    interval: 'month',
    seats_included: 5,
    features: [
      '5 team members',
      '100K tokens/month',
      'Community support',
      'Basic Terraform generation',
    ],
  },
  pro: {
    name: 'Nimbus Pro',
    stripe_price_id: 'price_demo_pro_monthly',
    amount_cents: 4900,
    currency: 'usd',
    interval: 'month',
    seats_included: 25,
    features: [
      '25 team members',
      '5M tokens/month',
      'Priority support',
      'Multi-cloud generation',
      'Drift detection',
      'Cost optimization',
      'Helm & K8s generation',
    ],
  },
  enterprise: {
    name: 'Nimbus Enterprise',
    stripe_price_id: 'price_demo_enterprise_monthly',
    amount_cents: 19900,
    currency: 'usd',
    interval: 'month',
    seats_included: 100,
    features: [
      'Unlimited team members',
      'Unlimited tokens',
      'Dedicated support & SLA',
      'SSO / SAML integration',
      'Audit log export',
      'Custom policy engine',
      'Private deployment option',
      'Advanced RBAC',
    ],
  },
};

const VALID_PLANS = ['free', 'pro', 'enterprise'] as const;
type ValidPlan = (typeof VALID_PLANS)[number];

// ---------------------------------------------------------------------------
// Plan quota definitions (preserved verbatim from billing-service/src/routes/usage.ts)
// ---------------------------------------------------------------------------

interface PlanQuota {
  tokensPerMonth: number;
  operationsPerMonth: number;
  costCapUsd: number;
}

const PLAN_QUOTAS: Record<string, PlanQuota> = {
  free: {
    tokensPerMonth: 100_000,
    operationsPerMonth: 500,
    costCapUsd: 0,
  },
  pro: {
    tokensPerMonth: 5_000_000,
    operationsPerMonth: 25_000,
    costCapUsd: 100,
  },
  enterprise: {
    tokensPerMonth: -1, // unlimited
    operationsPerMonth: -1,
    costCapUsd: -1,
  },
};

// ---------------------------------------------------------------------------
// Response type definitions (mirrors @nimbus/shared-types shapes)
// ---------------------------------------------------------------------------

/** Alias for the billing-specific plan type, re-exported from teams.ts */
type TeamPlan = ValidPlan;

export interface BillingStatus {
  plan: TeamPlan;
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  seats: {
    used: number;
    total: number;
  };
}

export interface StripeSubscriptionResponse {
  billing: BillingStatus;
  stripe: {
    id: string;
    object: 'subscription';
    customer: string;
    status: string;
    current_period_start: number;
    current_period_end: number;
    created: number;
    cancel_at_period_end: boolean;
    canceled_at: number | null;
    plan: {
      id: string;
      object: 'plan';
      product: string;
      nickname: string;
      amount: number;
      currency: string;
      interval: string;
      interval_count: number;
      active: boolean;
    };
    items: {
      object: 'list';
      data: Array<{
        id: string;
        object: 'subscription_item';
        price: {
          id: string;
          object: 'price';
          unit_amount: number;
          currency: string;
          recurring: { interval: string; interval_count: number };
          product: string;
        };
        quantity: number;
      }>;
      total_count: number;
    };
    latest_invoice: {
      id: string;
      object: 'invoice';
      number: string;
      status: 'draft' | 'open' | 'paid' | 'void';
      amount_due: number;
      amount_paid: number;
      currency: string;
      customer_email: string;
      period_start: number;
      period_end: number;
      subtotal: number;
      tax: number;
      total: number;
      lines: {
        object: 'list';
        data: Array<{
          id: string;
          object: 'line_item';
          description: string;
          amount: number;
          currency: string;
          quantity: number;
          period: { start: number; end: number };
        }>;
        total_count: number;
      };
      payment_intent: {
        id: string;
        object: 'payment_intent';
        status: 'succeeded' | 'requires_payment_method';
        amount: number;
        currency: string;
      };
      hosted_invoice_url: string;
      invoice_pdf: string;
      created: number;
    };
    metadata: { team_id: string; plan_name: string; provisioned_by: string };
    default_payment_method: {
      id: string;
      object: 'payment_method';
      type: 'card';
      card: { brand: string; last4: string; exp_month: number; exp_year: number; funding: string };
    };
  };
}

export interface StripeCancellationResponse {
  billing: BillingStatus;
  cancellation: {
    id: string;
    object: 'subscription';
    status: 'canceled';
    canceled_at: number;
    cancel_at_period_end: boolean;
    current_period_end: number;
    ended_at: number | null;
    cancellation_details: {
      comment: string | null;
      feedback: string | null;
      reason: 'cancellation_requested';
    };
  };
}

export interface SubscribeRequest {
  teamId: string;
  plan: string;
  paymentMethodId?: string;
  seats?: number;
}

export interface RecordUsageRequest {
  teamId: string;
  userId?: string;
  operationType: string;
  tokensUsed: number;
  costUsd: number;
}

export interface UsageRecordConfirmation {
  recorded: true;
  id: string;
  timestamp: string;
  teamId: string;
  operationType: string;
  tokensUsed: number;
  costUsd: number;
}

export interface EnhancedUsageSummary {
  period: { start: string; end: string };
  totals: { operations: number; tokensUsed: number; costUsd: number };
  byOperationType: Record<string, { count: number; tokensUsed: number; costUsd: number }>;
  byUser?: Record<string, { count: number; tokensUsed: number; costUsd: number }>;
  dailyBreakdown: Array<{ date: string; operations: number; tokensUsed: number; costUsd: number }>;
  quota: {
    plan: string;
    tokens: {
      used: number;
      limit: number;
      remaining: number;
      percentUsed: number;
      unlimited: boolean;
    };
    operations: {
      used: number;
      limit: number;
      remaining: number;
      percentUsed: number;
      unlimited: boolean;
    };
    cost: {
      accrued: number;
      cap: number;
      remaining: number;
      percentUsed: number;
      unlimited: boolean;
    };
  };
  rateLimit: {
    requestsPerMinute: number;
    tokensPerMinute: number;
    currentMinuteRequests: number;
    currentMinuteTokens: number;
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Generate a random alphanumeric demo ID of the given length.
 * Preserved verbatim from billing-service/src/db/adapter.ts.
 */
function generateDemoId(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Build a realistic Stripe-format subscription object for demo presentations.
 * Preserved verbatim from billing-service/src/routes/subscriptions.ts.
 */
function buildStripeSubscription(
  teamId: string,
  plan: string,
  stripeSubId: string,
  stripeCustomerId: string,
  periodStart: Date,
  periodEnd: Date,
  seats: number,
  canceled: boolean = false,
  canceledAt: Date | null = null
): StripeSubscriptionResponse['stripe'] {
  const planDetails = PLAN_CATALOG[plan] || PLAN_CATALOG.pro;
  const createdTimestamp = Math.floor((periodStart.getTime() - 5000) / 1000);
  const periodStartUnix = Math.floor(periodStart.getTime() / 1000);
  const periodEndUnix = Math.floor(periodEnd.getTime() / 1000);
  const invoiceId = `in_demo_${generateDemoId(24)}`;
  const invoiceNumber = `NIM-${periodStart.getFullYear()}${String(periodStart.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0')}`;
  const seatAmount = planDetails.amount_cents * seats;

  return {
    id: stripeSubId,
    object: 'subscription',
    customer: stripeCustomerId,
    status: canceled ? 'canceled' : 'active',
    current_period_start: periodStartUnix,
    current_period_end: periodEndUnix,
    created: createdTimestamp,
    cancel_at_period_end: canceled,
    canceled_at: canceledAt ? Math.floor(canceledAt.getTime() / 1000) : null,
    plan: {
      id: planDetails.stripe_price_id,
      object: 'plan',
      product: `prod_demo_nimbus_${plan}`,
      nickname: planDetails.name,
      amount: planDetails.amount_cents,
      currency: planDetails.currency,
      interval: planDetails.interval,
      interval_count: 1,
      active: true,
    },
    items: {
      object: 'list',
      data: [
        {
          id: `si_demo_${generateDemoId(14)}`,
          object: 'subscription_item',
          price: {
            id: planDetails.stripe_price_id,
            object: 'price',
            unit_amount: planDetails.amount_cents,
            currency: planDetails.currency,
            recurring: { interval: planDetails.interval, interval_count: 1 },
            product: `prod_demo_nimbus_${plan}`,
          },
          quantity: seats,
        },
      ],
      total_count: 1,
    },
    latest_invoice: {
      id: invoiceId,
      object: 'invoice',
      number: invoiceNumber,
      status: 'paid',
      amount_due: seatAmount,
      amount_paid: seatAmount,
      currency: planDetails.currency,
      customer_email: `billing+${teamId}@nimbus.dev`,
      period_start: periodStartUnix,
      period_end: periodEndUnix,
      subtotal: seatAmount,
      tax: 0,
      total: seatAmount,
      lines: {
        object: 'list',
        data: [
          {
            id: `il_demo_${generateDemoId(14)}`,
            object: 'line_item',
            description: `${planDetails.name} (${seats} seat${seats !== 1 ? 's' : ''} x $${(planDetails.amount_cents / 100).toFixed(2)}/mo)`,
            amount: seatAmount,
            currency: planDetails.currency,
            quantity: seats,
            period: { start: periodStartUnix, end: periodEndUnix },
          },
        ],
        total_count: 1,
      },
      payment_intent: {
        id: `pi_demo_${generateDemoId(24)}`,
        object: 'payment_intent',
        status: 'succeeded',
        amount: seatAmount,
        currency: planDetails.currency,
      },
      hosted_invoice_url: `https://invoice.stripe.com/i/demo/${invoiceId}`,
      invoice_pdf: `https://pay.stripe.com/invoice/${invoiceId}/pdf`,
      created: createdTimestamp,
    },
    metadata: {
      team_id: teamId,
      plan_name: planDetails.name,
      provisioned_by: 'nimbus-billing-service',
    },
    default_payment_method: {
      id: `pm_demo_${generateDemoId(14)}`,
      object: 'payment_method',
      type: 'card',
      card: {
        brand: 'visa',
        last4: '4242',
        exp_month: 12,
        exp_year: new Date().getFullYear() + 2,
        funding: 'credit',
      },
    },
  };
}

/**
 * Build quota status relative to the team's plan.
 * Preserved verbatim from billing-service/src/routes/usage.ts.
 */
function buildQuota(
  plan: string,
  totalTokens: number,
  totalOperations: number,
  totalCost: number
): EnhancedUsageSummary['quota'] {
  const quota = PLAN_QUOTAS[plan] || PLAN_QUOTAS.free;
  const unlimited = plan === 'enterprise';

  const tokensLimit = quota.tokensPerMonth;
  const opsLimit = quota.operationsPerMonth;
  const costCap = quota.costCapUsd;

  return {
    plan,
    tokens: {
      used: totalTokens,
      limit: unlimited ? -1 : tokensLimit,
      remaining: unlimited ? -1 : Math.max(0, tokensLimit - totalTokens),
      percentUsed: unlimited
        ? 0
        : tokensLimit > 0
          ? Math.min(100, Math.round((totalTokens / tokensLimit) * 100 * 100) / 100)
          : 0,
      unlimited,
    },
    operations: {
      used: totalOperations,
      limit: unlimited ? -1 : opsLimit,
      remaining: unlimited ? -1 : Math.max(0, opsLimit - totalOperations),
      percentUsed: unlimited
        ? 0
        : opsLimit > 0
          ? Math.min(100, Math.round((totalOperations / opsLimit) * 100 * 100) / 100)
          : 0,
      unlimited,
    },
    cost: {
      accrued: Math.round(totalCost * 100) / 100,
      cap: unlimited ? -1 : costCap,
      remaining: unlimited ? -1 : Math.max(0, Math.round((costCap - totalCost) * 100) / 100),
      percentUsed: unlimited
        ? 0
        : costCap > 0
          ? Math.min(100, Math.round((totalCost / costCap) * 100 * 100) / 100)
          : 0,
      unlimited,
    },
  };
}

/**
 * Build rate limit metadata for the current billing window.
 * Preserved verbatim from billing-service/src/routes/usage.ts.
 */
function buildRateLimit(plan: string): EnhancedUsageSummary['rateLimit'] {
  const limits: Record<string, { rpm: number; tpm: number }> = {
    free: { rpm: 30, tpm: 10_000 },
    pro: { rpm: 120, tpm: 100_000 },
    enterprise: { rpm: 600, tpm: 1_000_000 },
  };

  const planLimits = limits[plan] || limits.free;

  return {
    requestsPerMinute: planLimits.rpm,
    tokensPerMinute: planLimits.tpm,
    // Simulated current-minute counters (low values for demo)
    currentMinuteRequests: Math.floor(Math.random() * 5),
    currentMinuteTokens: Math.floor(Math.random() * 2000),
  };
}

// ---------------------------------------------------------------------------
// Public API - Subscriptions
// ---------------------------------------------------------------------------

/**
 * Get the current billing status for a team.
 *
 * Returns free-plan defaults when no subscription record exists.
 */
export async function getBillingStatus(teamId: string): Promise<BillingStatus> {
  const subscription: SubscriptionRecord | null = stateGetSubscription(teamId);

  if (!subscription) {
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

  // The unified billing schema (src/state/billing.ts) stores status directly
  // and does not have cancel_at_period_end or seats_used/seats_total columns.
  // We derive cancelAtPeriodEnd from status === 'canceled' for backward
  // compatibility with the original service response shape.
  return {
    plan: subscription.plan as TeamPlan,
    status: subscription.status as BillingStatus['status'],
    currentPeriodStart: subscription.currentPeriodStart || new Date().toISOString(),
    currentPeriodEnd:
      subscription.currentPeriodEnd ||
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    cancelAtPeriodEnd: subscription.status === 'canceled',
    seats: {
      used: 1, // seat tracking not available in the unified schema; caller can augment
      total: PLAN_CATALOG[subscription.plan]?.seats_included ?? 5,
    },
  };
}

/**
 * Subscribe a team to a plan.
 *
 * Creates or updates the subscription record in the unified database and
 * returns a rich Stripe-like subscription object for demo presentations.
 */
export async function subscribe(request: SubscribeRequest): Promise<StripeSubscriptionResponse> {
  const { teamId, plan, seats } = request;

  if (!teamId) {
    throw new Error('Team ID is required');
  }

  if (!VALID_PLANS.includes(plan as ValidPlan)) {
    throw new Error(`Invalid plan: ${plan}. Must be one of: ${VALID_PLANS.join(', ')}`);
  }

  const stripeSubscriptionId = `sub_demo_${generateDemoId(24)}`;
  const periodStart = new Date();
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const seatsTotal = seats || (plan === 'enterprise' ? 100 : plan === 'pro' ? 25 : 5);
  const stripeCustomerId = `cus_demo_${generateDemoId(14)}`;

  const existing = stateGetSubscription(teamId);

  if (existing) {
    stateUpdateSubscription(teamId, {
      plan,
      status: 'active',
      currentPeriodStart: periodStart.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
    });
  } else {
    stateCreateSubscription(
      crypto.randomUUID(),
      teamId,
      plan,
      'active',
      periodStart.toISOString(),
      periodEnd.toISOString()
    );
  }

  const billingStatus = await getBillingStatus(teamId);

  const stripeObject = buildStripeSubscription(
    teamId,
    plan,
    stripeSubscriptionId,
    stripeCustomerId,
    periodStart,
    periodEnd,
    seatsTotal
  );

  return {
    billing: billingStatus,
    stripe: stripeObject,
  };
}

/**
 * Cancel a team's active subscription.
 *
 * Marks the subscription as canceled in the unified database and returns a
 * Stripe-like cancellation confirmation object.
 */
export async function cancelSubscription(teamId: string): Promise<StripeCancellationResponse> {
  if (!teamId) {
    throw new Error('Team ID is required');
  }

  const subscription = stateGetSubscription(teamId);
  if (!subscription) {
    throw new Error('No subscription found');
  }

  if (subscription.plan === 'free') {
    throw new Error('Cannot cancel free plan');
  }

  const canceledAt = new Date();

  stateUpdateSubscription(teamId, { status: 'canceled' });

  const billingStatus = await getBillingStatus(teamId);

  const periodEnd = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return {
    billing: billingStatus,
    cancellation: {
      id: `sub_demo_${generateDemoId(24)}`,
      object: 'subscription',
      status: 'canceled',
      canceled_at: Math.floor(canceledAt.getTime() / 1000),
      cancel_at_period_end: true,
      current_period_end: Math.floor(periodEnd.getTime() / 1000),
      ended_at: null,
      cancellation_details: {
        comment: null,
        feedback: null,
        reason: 'cancellation_requested',
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Public API - Usage tracking
// ---------------------------------------------------------------------------

/**
 * Record a usage event for a team.
 *
 * Validates numeric inputs and returns a confirmation receipt with the
 * generated record ID.
 */
export async function recordUsage(request: RecordUsageRequest): Promise<UsageRecordConfirmation> {
  const { teamId, userId, operationType, tokensUsed, costUsd } = request;

  if (!teamId || !operationType) {
    throw new Error('Team ID and operation type are required');
  }

  if (!Number.isFinite(tokensUsed) || tokensUsed < 0) {
    throw new Error('tokensUsed must be a non-negative number');
  }
  if (!Number.isFinite(costUsd) || costUsd < 0) {
    throw new Error('costUsd must be a non-negative number');
  }

  const id = crypto.randomUUID();

  // stateRecordUsage(id, type, quantity, unit, costUsd, teamId, userId, metadata?)
  stateRecordUsage(id, operationType, tokensUsed, 'tokens', costUsd, teamId, userId);

  return {
    recorded: true,
    id,
    timestamp: new Date().toISOString(),
    teamId,
    operationType,
    tokensUsed,
    costUsd,
  };
}

/**
 * Get a usage summary for a team over a given period.
 *
 * Returns an enhanced summary with daily breakdown, quota status relative to
 * the team's current plan, and rate limit metadata.
 */
export async function getUsage(
  teamId: string,
  period: 'day' | 'week' | 'month' = 'month'
): Promise<EnhancedUsageSummary> {
  const now = new Date();
  let since: Date;

  switch (period) {
    case 'day':
      since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
    default:
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }

  // The unified billing state module provides getUsageSummary() aggregated by
  // type, and getUsage() for raw records. We use getUsageSummary() for
  // byOperationType totals and getUsage() for per-user and daily breakdowns.
  const summaryRows: StateUsageSummary[] = stateGetUsageSummary(teamId, since, now);
  const rawRecords: UsageRecord[] = stateGetUsage(teamId, since, now, 10000, 0);

  // Aggregate totals and byOperationType from summary rows
  let totalOperations = 0;
  let totalTokens = 0;
  let totalCost = 0;
  const byOperationType: Record<string, { count: number; tokensUsed: number; costUsd: number }> =
    {};

  for (const row of summaryRows) {
    totalOperations += row.count;
    totalTokens += row.totalQuantity;
    totalCost += row.totalCost;

    byOperationType[row.type] = {
      count: row.count,
      tokensUsed: row.totalQuantity,
      costUsd: row.totalCost,
    };
  }

  // Aggregate byUser from raw records
  const byUser: Record<string, { count: number; tokensUsed: number; costUsd: number }> = {};
  for (const rec of rawRecords) {
    if (rec.userId) {
      const existing = byUser[rec.userId] ?? { count: 0, tokensUsed: 0, costUsd: 0 };
      byUser[rec.userId] = {
        count: existing.count + 1,
        tokensUsed: existing.tokensUsed + rec.quantity,
        costUsd: existing.costUsd + (rec.costUsd ?? 0),
      };
    }
  }

  // Build daily breakdown from raw records (group by calendar date)
  const dailyMap: Record<string, { operations: number; tokensUsed: number; costUsd: number }> = {};
  for (const rec of rawRecords) {
    const date = rec.createdAt.slice(0, 10); // "YYYY-MM-DD"
    const existing = dailyMap[date] ?? { operations: 0, tokensUsed: 0, costUsd: 0 };
    dailyMap[date] = {
      operations: existing.operations + 1,
      tokensUsed: existing.tokensUsed + rec.quantity,
      costUsd: existing.costUsd + (rec.costUsd ?? 0),
    };
  }

  const dailyBreakdown = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, agg]) => ({ date, ...agg }));

  // Resolve the team's current plan for quota calculation
  const subscription = stateGetSubscription(teamId);
  const plan = subscription?.plan || 'free';

  return {
    period: {
      start: since.toISOString(),
      end: now.toISOString(),
    },
    totals: {
      operations: totalOperations,
      tokensUsed: totalTokens,
      costUsd: Math.round(totalCost * 100) / 100,
    },
    byOperationType,
    byUser: Object.keys(byUser).length > 0 ? byUser : undefined,
    dailyBreakdown,
    quota: buildQuota(plan, totalTokens, totalOperations, totalCost),
    rateLimit: buildRateLimit(plan),
  };
}
