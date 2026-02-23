/**
 * History Command
 *
 * CLI command for viewing command history
 */

import { historyManager, type HistoryQueryOptions } from '../history';
import { ui } from '../wizard/ui';

export interface HistoryOptions {
  limit?: number;
  filter?: string;
  since?: string;
  until?: string;
  status?: 'success' | 'failure' | 'pending';
  json?: boolean;
  clear?: boolean;
}

/**
 * Format a timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

/**
 * Format duration in ms to human readable
 */
function formatDuration(duration?: number): string {
  if (!duration) return '-';
  if (duration < 1000) return `${duration}ms`;
  if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
  return `${(duration / 60000).toFixed(1)}m`;
}

/**
 * History command - view and manage command history
 */
export async function historyCommand(options: HistoryOptions = {}): Promise<void> {
  // Handle clear
  if (options.clear) {
    ui.header('Clear History');
    historyManager.clear();
    ui.success('History cleared');
    return;
  }

  ui.header('Command History');

  // Build query options
  const queryOptions: HistoryQueryOptions = {
    limit: options.limit || 20,
    command: options.filter,
    since: options.since,
    until: options.until,
    status: options.status,
  };

  const entries = await historyManager.getEntries(queryOptions);

  if (entries.length === 0) {
    ui.info('No history entries found');
    return;
  }

  // JSON output
  if (options.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  // Display as table
  ui.info(`Showing ${entries.length} entries`);
  ui.newLine();

  ui.table({
    columns: [
      { key: 'timestamp', header: 'Time' },
      { key: 'command', header: 'Command' },
      { key: 'status', header: 'Status' },
      { key: 'duration', header: 'Duration' },
    ],
    data: entries.map((entry) => ({
      timestamp: formatTimestamp(entry.timestamp),
      command: `${entry.command} ${entry.args.join(' ')}`.substring(0, 40),
      status: entry.status === 'success'
        ? ui.color('success', 'green')
        : entry.status === 'failure'
        ? ui.color('failure', 'red')
        : ui.color('pending', 'yellow'),
      duration: formatDuration(entry.duration),
    })),
  });
}

/**
 * Show detailed history for a specific entry
 */
export async function historyShowCommand(id: string): Promise<void> {
  ui.header('History Entry Details');

  const entry = historyManager.getEntry(id);

  if (!entry) {
    ui.error(`Entry not found: ${id}`);
    return;
  }

  ui.info(`ID: ${entry.id}`);
  ui.info(`Command: ${entry.command}`);
  ui.info(`Args: ${entry.args.join(' ')}`);
  ui.info(`Time: ${formatTimestamp(entry.timestamp)}`);
  ui.info(`Status: ${entry.status}`);
  ui.info(`Duration: ${formatDuration(entry.duration)}`);

  if (entry.result?.output) {
    ui.newLine();
    ui.box({ title: 'Output', content: entry.result.output });
  }

  if (entry.result?.error) {
    ui.newLine();
    ui.box({ title: 'Error', content: entry.result.error, borderColor: 'red' });
  }

  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    ui.newLine();
    ui.info('Metadata:');
    for (const [key, value] of Object.entries(entry.metadata)) {
      ui.info(`  ${key}: ${JSON.stringify(value)}`);
    }
  }
}
