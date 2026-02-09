/**
 * Usage Command
 * Usage dashboard CLI command
 */

import { ui } from '../../wizard/ui';
import { billingClient } from '../../clients/enterprise-client';
import type { UsageOptions } from '@nimbus/shared-types';

/**
 * Get current team ID from config or environment
 */
function getCurrentTeamId(): string | null {
  return process.env.NIMBUS_TEAM_ID || null;
}

/**
 * Parse usage options
 */
export function parseUsageOptions(args: string[]): UsageOptions {
  const options: UsageOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--period' && args[i + 1]) {
      options.period = args[++i] as 'day' | 'week' | 'month';
    } else if (arg === '--team' && args[i + 1]) {
      options.teamId = args[++i];
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--non-interactive') {
      options.nonInteractive = true;
    }
  }

  return options;
}

/**
 * Format number with commas
 */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Format cost in USD
 */
function formatCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * Usage command
 */
export async function usageCommand(options: UsageOptions): Promise<void> {
  try {
    const teamId = options.teamId || getCurrentTeamId();
    if (!teamId) {
      ui.error('No team selected. Run `nimbus team switch <team-id>` first.');
      ui.info('Or use: nimbus usage --team <team-id>');
      return;
    }

    const period = options.period || 'month';

    ui.startSpinner({ message: `Fetching ${period} usage...` });
    const usage = await billingClient.getUsage(teamId, period);
    ui.stopSpinnerSuccess('Usage retrieved');

    if (options.json) {
      console.log(JSON.stringify(usage, null, 2));
      return;
    }

    ui.newLine();
    ui.header('Usage Dashboard', `${new Date(usage.period.start).toLocaleDateString()} - ${new Date(usage.period.end).toLocaleDateString()}`);

    // Summary
    ui.section('Summary');
    ui.print(`  Total Operations: ${formatNumber(usage.totals.operations)}`);
    ui.print(`  Total Tokens:     ${formatNumber(usage.totals.tokensUsed)}`);
    ui.print(`  Total Cost:       ${formatCost(usage.totals.costUsd)}`);

    // By operation type
    const operationTypes = Object.entries(usage.byOperationType);
    if (operationTypes.length > 0) {
      ui.section('By Operation Type');
      ui.table({
        columns: [
          { key: 'type', header: 'Operation' },
          { key: 'count', header: 'Count' },
          { key: 'tokens', header: 'Tokens' },
          { key: 'cost', header: 'Cost' },
        ],
        data: operationTypes.map(([type, data]) => ({
          type,
          count: formatNumber(data.count),
          tokens: formatNumber(data.tokensUsed),
          cost: formatCost(data.costUsd),
        })),
      });
    }

    // By user (if available)
    if (usage.byUser && Object.keys(usage.byUser).length > 0) {
      const userUsage = Object.entries(usage.byUser);
      ui.section('By User');
      ui.table({
        columns: [
          { key: 'user', header: 'User' },
          { key: 'count', header: 'Operations' },
          { key: 'tokens', header: 'Tokens' },
          { key: 'cost', header: 'Cost' },
        ],
        data: userUsage.map(([user, data]) => ({
          user,
          count: formatNumber(data.count),
          tokens: formatNumber(data.tokensUsed),
          cost: formatCost(data.costUsd),
        })),
      });
    }

    ui.newLine();
    ui.dim(`Period: ${period} | Use --period day|week|month to change`);
  } catch (error: any) {
    ui.stopSpinnerFail('Failed to get usage');
    ui.error(error.message);
  }
}
