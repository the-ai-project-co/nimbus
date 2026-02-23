/**
 * Billing Commands
 * Billing and subscription CLI commands
 */

import { ui } from '../../wizard/ui';
import { billingClient } from '../../clients/enterprise-client';
import type {
  BillingStatusOptions,
  BillingUpgradeOptions,
  BillingInvoicesOptions,
  TeamPlan,
} from '../../types';

/**
 * Get current team ID from config or environment
 */
function getCurrentTeamId(): string | null {
  return process.env.NIMBUS_TEAM_ID || null;
}

/**
 * Parse billing status options
 */
export function parseBillingStatusOptions(args: string[]): BillingStatusOptions {
  const options: BillingStatusOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--non-interactive') {
      options.nonInteractive = true;
    }
  }

  return options;
}

/**
 * Parse billing upgrade options
 */
export function parseBillingUpgradeOptions(args: string[]): BillingUpgradeOptions {
  const options: BillingUpgradeOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--plan' && args[i + 1]) {
      options.plan = args[++i] as TeamPlan;
    } else if (arg === '--non-interactive') {
      options.nonInteractive = true;
    } else if (!arg.startsWith('-') && !options.plan) {
      options.plan = arg as TeamPlan;
    }
  }

  return options;
}

/**
 * Parse billing invoices options
 */
export function parseBillingInvoicesOptions(args: string[]): BillingInvoicesOptions {
  const options: BillingInvoicesOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[++i], 10);
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--non-interactive') {
      options.nonInteractive = true;
    }
  }

  return options;
}

/**
 * Billing status command
 */
export async function billingStatusCommand(options: BillingStatusOptions): Promise<void> {
  try {
    const teamId = getCurrentTeamId();
    if (!teamId) {
      ui.error('No team selected. Run `nimbus team switch <team-id>` first.');
      return;
    }

    ui.startSpinner({ message: 'Fetching billing status...' });
    const status = await billingClient.getStatus(teamId);
    ui.stopSpinnerSuccess('Billing status retrieved');

    if (options.json) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }

    ui.newLine();
    ui.header('Billing Status');

    ui.print(`  Plan: ${status.plan.toUpperCase()}`);
    ui.print(`  Status: ${status.status}`);
    ui.print(`  Period: ${new Date(status.currentPeriodStart).toLocaleDateString()} - ${new Date(status.currentPeriodEnd).toLocaleDateString()}`);
    ui.print(`  Seats: ${status.seats.used} / ${status.seats.total} used`);

    if (status.cancelAtPeriodEnd) {
      ui.warning('Subscription will cancel at end of period');
    }

    ui.newLine();
    if (status.plan === 'free') {
      ui.info('Upgrade to Pro for more seats and features:');
      ui.print('  nimbus billing upgrade pro');
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Failed to get billing status');
    ui.error(error.message);
  }
}

/**
 * Billing upgrade command
 */
export async function billingUpgradeCommand(options: BillingUpgradeOptions): Promise<void> {
  try {
    const teamId = getCurrentTeamId();
    if (!teamId) {
      ui.error('No team selected. Run `nimbus team switch <team-id>` first.');
      return;
    }

    const plan = options.plan;
    if (!plan || !['pro', 'enterprise'].includes(plan)) {
      ui.error('Plan is required');
      ui.info('Usage: nimbus billing upgrade <pro|enterprise>');
      return;
    }

    ui.startSpinner({ message: `Upgrading to ${plan}...` });
    const status = await billingClient.subscribe(teamId, { plan });
    ui.stopSpinnerSuccess(`Upgraded to ${plan.toUpperCase()}`);

    ui.newLine();
    ui.success(`Your team is now on the ${plan.toUpperCase()} plan!`);
    ui.print(`  Seats available: ${status.seats.total}`);
    ui.print(`  Next billing date: ${new Date(status.currentPeriodEnd).toLocaleDateString()}`);
  } catch (error: any) {
    ui.stopSpinnerFail('Failed to upgrade');
    ui.error(error.message);
  }
}

/**
 * Billing invoices command
 */
export async function billingInvoicesCommand(options: BillingInvoicesOptions): Promise<void> {
  try {
    const teamId = getCurrentTeamId();
    if (!teamId) {
      ui.error('No team selected. Run `nimbus team switch <team-id>` first.');
      return;
    }

    ui.startSpinner({ message: 'Fetching invoices...' });
    const invoices = await billingClient.getInvoices(teamId, options.limit || 10);
    ui.stopSpinnerSuccess(`Found ${invoices.length} invoices`);

    if (options.json) {
      console.log(JSON.stringify(invoices, null, 2));
      return;
    }

    if (invoices.length === 0) {
      ui.info('No invoices found');
      return;
    }

    ui.newLine();
    ui.table({
      columns: [
        { key: 'number', header: 'Invoice #' },
        { key: 'date', header: 'Date' },
        { key: 'amount', header: 'Amount' },
        { key: 'status', header: 'Status' },
      ],
      data: invoices.map(inv => ({
        number: inv.number,
        date: new Date(inv.createdAt).toLocaleDateString(),
        amount: `$${(inv.amountDue / 100).toFixed(2)} ${inv.currency.toUpperCase()}`,
        status: inv.status,
      })),
    });
  } catch (error: any) {
    ui.stopSpinnerFail('Failed to get invoices');
    ui.error(error.message);
  }
}

/**
 * Billing cancel command
 */
export async function billingCancelCommand(): Promise<void> {
  try {
    const teamId = getCurrentTeamId();
    if (!teamId) {
      ui.error('No team selected. Run `nimbus team switch <team-id>` first.');
      return;
    }

    ui.startSpinner({ message: 'Canceling subscription...' });
    const status = await billingClient.cancel(teamId);
    ui.stopSpinnerSuccess('Subscription canceled');

    ui.newLine();
    ui.warning(`Your subscription will end on ${new Date(status.currentPeriodEnd).toLocaleDateString()}`);
    ui.info('You will retain access until then.');
  } catch (error: any) {
    ui.stopSpinnerFail('Failed to cancel');
    ui.error(error.message);
  }
}

/**
 * Main billing command dispatcher
 */
export async function billingCommand(subcommand: string, args: string[]): Promise<void> {
  switch (subcommand) {
    case 'status':
    case undefined:
      await billingStatusCommand(parseBillingStatusOptions(args));
      break;
    case 'upgrade':
      await billingUpgradeCommand(parseBillingUpgradeOptions(args));
      break;
    case 'invoices':
      await billingInvoicesCommand(parseBillingInvoicesOptions(args));
      break;
    case 'cancel':
      await billingCancelCommand();
      break;
    default:
      ui.error(`Unknown billing command: ${subcommand}`);
      ui.newLine();
      ui.info('Available billing commands:');
      ui.print('  nimbus billing status          - Show billing status');
      ui.print('  nimbus billing upgrade <plan>  - Upgrade plan (pro|enterprise)');
      ui.print('  nimbus billing invoices        - List invoices');
      ui.print('  nimbus billing cancel          - Cancel subscription');
  }
}
