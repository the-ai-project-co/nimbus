/**
 * Billing / usage tracking helpers.
 *
 * Refactored from the billing-service database adapter
 * (services/billing-service/src/db/adapter.ts) into standalone functions
 * that operate against the unified Nimbus database.
 */

import type { Database } from '../compat/sqlite';
import { getDb } from './db';

/** Shape returned by subscription queries. */
export interface SubscriptionRecord {
  id: string;
  teamId: string;
  plan: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Shape returned by usage queries. */
export interface UsageRecord {
  id: string;
  teamId: string | null;
  userId: string | null;
  type: string;
  quantity: number;
  unit: string;
  costUsd: number | null;
  metadata: any | null;
  createdAt: string;
}

/** Aggregated usage summary row. */
export interface UsageSummary {
  type: string;
  totalQuantity: number;
  totalCost: number;
  count: number;
}

// ---------------------------------------------------------------------------
// Subscription helpers
// ---------------------------------------------------------------------------

/**
 * Create a new subscription.
 */
export function createSubscription(
  id: string,
  teamId: string,
  plan: string = 'free',
  status: string = 'active',
  currentPeriodStart?: string,
  currentPeriodEnd?: string,
  db?: Database
): void {
  const d = db || getDb();
  const stmt = d.prepare(`
    INSERT INTO subscriptions (id, team_id, plan, status, current_period_start, current_period_end, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  stmt.run(id, teamId, plan, status, currentPeriodStart || null, currentPeriodEnd || null);
}

/**
 * Retrieve a subscription by team id.
 */
export function getSubscription(teamId: string, db?: Database): SubscriptionRecord | null {
  const d = db || getDb();
  const stmt = d.prepare('SELECT * FROM subscriptions WHERE team_id = ?');
  const row: any = stmt.get(teamId);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    teamId: row.team_id,
    plan: row.plan,
    status: row.status,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Update plan, status, or period boundaries of an existing subscription.
 */
export function updateSubscription(
  teamId: string,
  updates: {
    plan?: string;
    status?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
  },
  db?: Database
): void {
  const d = db || getDb();
  const stmt = d.prepare(`
    UPDATE subscriptions
    SET plan = COALESCE(?, plan),
        status = COALESCE(?, status),
        current_period_start = COALESCE(?, current_period_start),
        current_period_end = COALESCE(?, current_period_end),
        updated_at = CURRENT_TIMESTAMP
    WHERE team_id = ?
  `);

  stmt.run(
    updates.plan || null,
    updates.status || null,
    updates.currentPeriodStart || null,
    updates.currentPeriodEnd || null,
    teamId
  );
}

// ---------------------------------------------------------------------------
// Usage helpers
// ---------------------------------------------------------------------------

/**
 * Record a single usage event.
 */
export function recordUsage(
  id: string,
  type: string,
  quantity: number,
  unit: string = 'tokens',
  costUsd?: number,
  teamId?: string,
  userId?: string,
  metadata?: any,
  db?: Database
): void {
  const d = db || getDb();
  const stmt = d.prepare(`
    INSERT INTO usage (id, team_id, user_id, type, quantity, unit, cost_usd, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  stmt.run(
    id,
    teamId || null,
    userId || null,
    type,
    quantity,
    unit,
    costUsd ?? 0,
    metadata ? JSON.stringify(metadata) : null
  );
}

/**
 * Retrieve usage records for a team within a date range.
 */
export function getUsage(
  teamId: string,
  since: Date,
  until?: Date,
  limit: number = 100,
  offset: number = 0,
  db?: Database
): UsageRecord[] {
  const d = db || getDb();
  const untilDate = until || new Date();

  const stmt = d.prepare(`
    SELECT * FROM usage
    WHERE team_id = ?
      AND created_at >= ?
      AND created_at <= ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);

  const rows: any[] = stmt.all(
    teamId,
    since.toISOString(),
    untilDate.toISOString(),
    limit,
    offset
  ) as any[];

  return rows.map(row => ({
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    type: row.type,
    quantity: row.quantity,
    unit: row.unit,
    costUsd: row.cost_usd,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    createdAt: row.created_at,
  }));
}

/**
 * Aggregate usage by type for a team within a date range.
 */
export function getUsageSummary(
  teamId: string,
  since: Date,
  until?: Date,
  db?: Database
): UsageSummary[] {
  const d = db || getDb();
  const untilDate = until || new Date();

  const stmt = d.prepare(`
    SELECT
      type,
      SUM(quantity) as total_quantity,
      SUM(cost_usd) as total_cost,
      COUNT(*) as count
    FROM usage
    WHERE team_id = ?
      AND created_at >= ?
      AND created_at <= ?
    GROUP BY type
  `);

  const rows: any[] = stmt.all(teamId, since.toISOString(), untilDate.toISOString()) as any[];

  return rows.map(row => ({
    type: row.type,
    totalQuantity: row.total_quantity,
    totalCost: row.total_cost,
    count: row.count,
  }));
}
