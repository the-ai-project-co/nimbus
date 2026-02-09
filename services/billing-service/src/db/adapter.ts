/**
 * Billing Service Database Adapter
 * SQLite database for usage records and billing data
 */

import { Database } from 'bun:sqlite';
import { logger } from '@nimbus/shared-utils';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let db: Database | null = null;

const DATABASE_PATH = process.env.BILLING_DATABASE_PATH ||
  path.join(os.homedir(), '.nimbus', 'billing.db');

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  // Ensure directory exists
  const dir = path.dirname(DATABASE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DATABASE_PATH);

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      team_id TEXT PRIMARY KEY,
      plan TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'active',
      stripe_subscription_id TEXT,
      stripe_customer_id TEXT,
      current_period_start DATETIME,
      current_period_end DATETIME,
      cancel_at_period_end INTEGER DEFAULT 0,
      seats_total INTEGER DEFAULT 5,
      seats_used INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS usage_records (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      user_id TEXT,
      operation_type TEXT NOT NULL,
      tokens_used INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_usage_team ON usage_records(team_id, timestamp)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_records(user_id, timestamp)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_usage_type ON usage_records(operation_type)`);

  logger.info(`Billing database initialized at ${DATABASE_PATH}`);
  return db;
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

// Subscription operations
export interface SubscriptionRecord {
  team_id: string;
  plan: string;
  status: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: number;
  seats_total: number;
  seats_used: number;
  created_at: string;
  updated_at: string;
}

export function getSubscription(teamId: string): SubscriptionRecord | null {
  const db = getDatabase();
  return db.query(`SELECT * FROM subscriptions WHERE team_id = ?`).get(teamId) as SubscriptionRecord | null;
}

export function createOrUpdateSubscription(
  teamId: string,
  plan: string,
  options: {
    stripeSubscriptionId?: string;
    stripeCustomerId?: string;
    periodStart?: Date;
    periodEnd?: Date;
    seatsTotal?: number;
  } = {}
): void {
  const db = getDatabase();
  const existing = getSubscription(teamId);

  if (existing) {
    db.run(`
      UPDATE subscriptions
      SET plan = ?,
          stripe_subscription_id = COALESCE(?, stripe_subscription_id),
          stripe_customer_id = COALESCE(?, stripe_customer_id),
          current_period_start = COALESCE(?, current_period_start),
          current_period_end = COALESCE(?, current_period_end),
          seats_total = COALESCE(?, seats_total),
          status = 'active',
          updated_at = CURRENT_TIMESTAMP
      WHERE team_id = ?
    `, [
      plan,
      options.stripeSubscriptionId || null,
      options.stripeCustomerId || null,
      options.periodStart?.toISOString() || null,
      options.periodEnd?.toISOString() || null,
      options.seatsTotal || null,
      teamId,
    ]);
  } else {
    db.run(`
      INSERT INTO subscriptions (
        team_id, plan, stripe_subscription_id, stripe_customer_id,
        current_period_start, current_period_end, seats_total
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      teamId,
      plan,
      options.stripeSubscriptionId || null,
      options.stripeCustomerId || null,
      options.periodStart?.toISOString() || null,
      options.periodEnd?.toISOString() || null,
      options.seatsTotal || 5,
    ]);
  }
}

export function cancelSubscriptionRecord(teamId: string): void {
  const db = getDatabase();
  db.run(`
    UPDATE subscriptions
    SET cancel_at_period_end = 1, updated_at = CURRENT_TIMESTAMP
    WHERE team_id = ?
  `, [teamId]);
}

export function updateSubscriptionStatus(teamId: string, status: string): void {
  const db = getDatabase();
  db.run(`
    UPDATE subscriptions
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE team_id = ?
  `, [status, teamId]);
}

export function updateSeatsUsed(teamId: string, seatsUsed: number): void {
  const db = getDatabase();
  db.run(`
    UPDATE subscriptions
    SET seats_used = ?, updated_at = CURRENT_TIMESTAMP
    WHERE team_id = ?
  `, [seatsUsed, teamId]);
}

// Usage operations
export interface UsageRecord {
  id: string;
  team_id: string;
  user_id: string | null;
  operation_type: string;
  tokens_used: number;
  cost_usd: number;
  timestamp: string;
}

export function createUsageRecord(
  teamId: string,
  operationType: string,
  tokensUsed: number,
  costUsd: number,
  userId?: string
): void {
  const db = getDatabase();
  const id = crypto.randomUUID();
  db.run(`
    INSERT INTO usage_records (id, team_id, user_id, operation_type, tokens_used, cost_usd)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, teamId, userId || null, operationType, tokensUsed, costUsd]);
}

export function getUsageRecords(
  teamId: string,
  since: Date,
  until?: Date
): UsageRecord[] {
  const db = getDatabase();
  const untilDate = until || new Date();

  return db.query(`
    SELECT * FROM usage_records
    WHERE team_id = ?
      AND timestamp >= ?
      AND timestamp <= ?
    ORDER BY timestamp DESC
  `).all(teamId, since.toISOString(), untilDate.toISOString()) as UsageRecord[];
}

export interface UsageAggregate {
  operation_type: string;
  count: number;
  total_tokens: number;
  total_cost: number;
}

export function getUsageAggregates(
  teamId: string,
  since: Date,
  until?: Date
): UsageAggregate[] {
  const db = getDatabase();
  const untilDate = until || new Date();

  return db.query(`
    SELECT
      operation_type,
      COUNT(*) as count,
      SUM(tokens_used) as total_tokens,
      SUM(cost_usd) as total_cost
    FROM usage_records
    WHERE team_id = ?
      AND timestamp >= ?
      AND timestamp <= ?
    GROUP BY operation_type
  `).all(teamId, since.toISOString(), untilDate.toISOString()) as UsageAggregate[];
}

export interface UserUsageAggregate {
  user_id: string;
  count: number;
  total_tokens: number;
  total_cost: number;
}

export function getUserUsageAggregates(
  teamId: string,
  since: Date,
  until?: Date
): UserUsageAggregate[] {
  const db = getDatabase();
  const untilDate = until || new Date();

  return db.query(`
    SELECT
      user_id,
      COUNT(*) as count,
      SUM(tokens_used) as total_tokens,
      SUM(cost_usd) as total_cost
    FROM usage_records
    WHERE team_id = ?
      AND user_id IS NOT NULL
      AND timestamp >= ?
      AND timestamp <= ?
    GROUP BY user_id
  `).all(teamId, since.toISOString(), untilDate.toISOString()) as UserUsageAggregate[];
}
