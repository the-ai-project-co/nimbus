/**
 * Usage Routes
 * Usage tracking and reporting
 */

import type { UsageSummary } from '@nimbus/shared-types';
import {
  createUsageRecord,
  getUsageAggregates,
  getUserUsageAggregates,
} from '../db/adapter';

interface RecordUsageRequest {
  teamId: string;
  userId?: string;
  operationType: string;
  tokensUsed: number;
  costUsd: number;
}

/**
 * Record usage
 */
export async function recordUsage(request: RecordUsageRequest): Promise<void> {
  const { teamId, userId, operationType, tokensUsed, costUsd } = request;

  if (!teamId || !operationType) {
    throw new Error('Team ID and operation type are required');
  }

  // Validate numeric inputs
  if (!Number.isFinite(tokensUsed) || tokensUsed < 0) {
    throw new Error('tokensUsed must be a non-negative number');
  }
  if (!Number.isFinite(costUsd) || costUsd < 0) {
    throw new Error('costUsd must be a non-negative number');
  }

  createUsageRecord(teamId, operationType, tokensUsed, costUsd, userId);
}

/**
 * Get usage summary for a team
 */
export async function getUsage(
  teamId: string,
  period: 'day' | 'week' | 'month' = 'month'
): Promise<UsageSummary> {
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

  const aggregates = getUsageAggregates(teamId, since, now);
  const userAggregates = getUserUsageAggregates(teamId, since, now);

  // Calculate totals
  let totalOperations = 0;
  let totalTokens = 0;
  let totalCost = 0;

  const byOperationType: Record<string, { count: number; tokensUsed: number; costUsd: number }> = {};

  for (const agg of aggregates) {
    totalOperations += agg.count;
    totalTokens += agg.total_tokens || 0;
    totalCost += agg.total_cost || 0;

    byOperationType[agg.operation_type] = {
      count: agg.count,
      tokensUsed: agg.total_tokens || 0,
      costUsd: agg.total_cost || 0,
    };
  }

  const byUser: Record<string, { count: number; tokensUsed: number; costUsd: number }> = {};

  for (const agg of userAggregates) {
    if (agg.user_id) {
      byUser[agg.user_id] = {
        count: agg.count,
        tokensUsed: agg.total_tokens || 0,
        costUsd: agg.total_cost || 0,
      };
    }
  }

  return {
    period: {
      start: since.toISOString(),
      end: now.toISOString(),
    },
    totals: {
      operations: totalOperations,
      tokensUsed: totalTokens,
      costUsd: totalCost,
    },
    byOperationType,
    byUser: Object.keys(byUser).length > 0 ? byUser : undefined,
  };
}
