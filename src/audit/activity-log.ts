/**
 * Activity Log - Record and query every tool call executed by the Nimbus agent.
 *
 * Each entry captures the tool name, input parameters, output, duration,
 * session context, and operating mode (plan/build/deploy). The log supports
 * flexible filtering, summary statistics with tool-level breakdowns, and
 * both concise and verbose text formatting.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single recorded tool call */
export interface ActivityEntry {
  /** Unique identifier */
  id: string;
  /** When the tool call was executed */
  timestamp: Date;
  /** Session in which the call occurred */
  sessionId: string;
  /** Name of the tool that was invoked */
  toolName: string;
  /** Input parameters passed to the tool */
  toolInput: Record<string, unknown>;
  /** Tool output and error status */
  result: { output: string; isError: boolean };
  /** Execution duration in milliseconds */
  duration: number;
  /** Operating mode when the call was made (e.g. plan, build, deploy) */
  mode: string;
}

/** Filter criteria for querying the activity log */
export interface ActivityFilter {
  /** Filter by tool name (exact match) */
  toolName?: string;
  /** Only include entries on or after this date */
  since?: Date;
  /** Only include entries on or before this date */
  until?: Date;
  /** Filter by session ID */
  sessionId?: string;
  /** Filter by error status */
  isError?: boolean;
  /** Maximum number of entries to return */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a duration in milliseconds as a human-friendly string.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = ((ms % 60_000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format a Date as a compact ISO-like timestamp (YYYY-MM-DD HH:MM:SS).
 */
function formatTimestamp(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

/**
 * Truncate a string to maxLen characters, appending an ellipsis if needed.
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

// ---------------------------------------------------------------------------
// ActivityLog
// ---------------------------------------------------------------------------

/**
 * In-memory log of all tool calls made during Nimbus sessions.
 *
 * Supports recording entries, querying with filters, computing summary
 * statistics, and formatting output for display in the CLI.
 *
 * @example
 * ```typescript
 * const log = new ActivityLog();
 *
 * log.log({
 *   timestamp: new Date(),
 *   sessionId: 'session-1',
 *   toolName: 'terraform_plan',
 *   toolInput: { dir: '/infra' },
 *   result: { output: 'Plan: 3 to add', isError: false },
 *   duration: 4200,
 *   mode: 'plan',
 * });
 *
 * const entries = log.query({ toolName: 'terraform_plan' });
 * console.log(log.formatLog(entries));
 * ```
 */
export class ActivityLog {
  private entries: ActivityEntry[] = [];

  /**
   * Record a tool call in the activity log.
   *
   * A unique ID is generated automatically. The entry is appended to the
   * internal ledger and returned.
   *
   * @param entry - All fields except `id` (which is auto-generated)
   * @returns The created activity entry with its assigned ID
   */
  log(entry: Omit<ActivityEntry, 'id'>): ActivityEntry {
    const full: ActivityEntry = {
      id: crypto.randomUUID(),
      ...entry,
    };

    this.entries.push(full);
    return full;
  }

  /**
   * Query the activity log with optional filters.
   *
   * Filters are combined with AND logic. Results are returned in reverse
   * chronological order (newest first). Use `limit` to cap the result count.
   *
   * @param filter - Optional filter criteria
   * @returns Matching activity entries
   */
  query(filter?: ActivityFilter): ActivityEntry[] {
    let results = [...this.entries];

    if (filter?.toolName) {
      results = results.filter(e => e.toolName === filter.toolName);
    }

    if (filter?.sessionId) {
      results = results.filter(e => e.sessionId === filter.sessionId);
    }

    if (filter?.since) {
      const since = filter.since.getTime();
      results = results.filter(e => e.timestamp.getTime() >= since);
    }

    if (filter?.until) {
      const until = filter.until.getTime();
      results = results.filter(e => e.timestamp.getTime() <= until);
    }

    if (filter?.isError !== undefined) {
      results = results.filter(e => e.result.isError === filter.isError);
    }

    // Sort newest first
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filter?.limit !== undefined && filter.limit > 0) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  /**
   * Compute summary statistics for the activity log.
   *
   * Returns total call count, error count, average duration, and a breakdown
   * of call counts per tool name.
   *
   * @param sessionId - If provided, restrict statistics to this session
   * @returns Summary statistics object
   */
  getStats(sessionId?: string): {
    totalCalls: number;
    errorCount: number;
    avgDuration: number;
    toolBreakdown: Record<string, number>;
  } {
    let entries = this.entries;
    if (sessionId) {
      entries = entries.filter(e => e.sessionId === sessionId);
    }

    const totalCalls = entries.length;
    const errorCount = entries.filter(e => e.result.isError).length;

    const totalDuration = entries.reduce((sum, e) => sum + e.duration, 0);
    const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;

    const toolBreakdown: Record<string, number> = {};
    for (const entry of entries) {
      toolBreakdown[entry.toolName] = (toolBreakdown[entry.toolName] ?? 0) + 1;
    }

    return {
      totalCalls,
      errorCount,
      avgDuration,
      toolBreakdown,
    };
  }

  /**
   * Format activity entries as a human-readable text report.
   *
   * In concise mode (default), each entry is a single line with timestamp,
   * tool name, duration, and status. In verbose mode, input parameters and
   * output are also shown.
   *
   * @param entries - Entries to format
   * @param options - Formatting options
   * @returns Multi-line formatted log
   */
  formatLog(entries: ActivityEntry[], options?: { verbose?: boolean }): string {
    if (entries.length === 0) {
      return 'No activity entries to display.';
    }

    const verbose = options?.verbose ?? false;

    const lines: string[] = [
      `Activity Log (${entries.length} entries)`,
      '='.repeat(60),
      '',
    ];

    for (const entry of entries) {
      const status = entry.result.isError ? '[ERROR]' : '[OK]   ';
      const ts = formatTimestamp(entry.timestamp);
      const dur = formatDuration(entry.duration);

      lines.push(`${ts}  ${status}  ${entry.toolName}  (${dur})  [${entry.mode}]`);

      if (verbose) {
        // Show input
        const inputStr = JSON.stringify(entry.toolInput);
        lines.push(`  Input:  ${truncate(inputStr, 120)}`);

        // Show output
        const outputStr = entry.result.output;
        lines.push(`  Output: ${truncate(outputStr, 120)}`);

        if (entry.result.isError) {
          lines.push(`  ** Error occurred during execution **`);
        }

        lines.push('');
      }
    }

    if (!verbose) {
      lines.push('');
    }

    // Append quick stats
    const errorCount = entries.filter(e => e.result.isError).length;
    const totalDuration = entries.reduce((s, e) => s + e.duration, 0);
    const avgDuration = entries.length > 0 ? Math.round(totalDuration / entries.length) : 0;

    lines.push('-'.repeat(60));
    lines.push(
      `${entries.length} calls, ${errorCount} errors, avg ${formatDuration(avgDuration)}`,
    );

    return lines.join('\n');
  }

  /**
   * Remove all entries from the activity log.
   */
  clear(): void {
    this.entries = [];
  }
}
