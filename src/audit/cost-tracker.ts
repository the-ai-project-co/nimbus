/**
 * Cost Tracker - Track LLM and infrastructure costs across sessions.
 *
 * Records cost entries for LLM API calls (with token counts and model info)
 * and infrastructure changes (from terraform plan). Computes daily cost
 * aggregates, monthly projections, and per-session breakdowns.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single cost entry representing an LLM call or infrastructure change */
export interface CostEntry {
  /** Unique identifier */
  id: string;
  /** Session in which the cost was incurred */
  sessionId: string;
  /** When the cost was recorded */
  timestamp: Date;
  /** Whether this is an LLM or infrastructure cost */
  category: 'llm' | 'infra';
  /** Human-readable description of what generated the cost */
  description: string;
  /** Cost in USD */
  amount: number;
  /** Number of input/prompt tokens (LLM only) */
  inputTokens?: number;
  /** Number of output/completion tokens (LLM only) */
  outputTokens?: number;
  /** Model identifier (LLM only) */
  model?: string;
}

/** Aggregated cost summary with breakdowns and projections */
export interface CostSummary {
  /** Total cost across all entries in USD */
  totalCost: number;
  /** Total LLM cost in USD */
  llmCost: number;
  /** Total infrastructure cost in USD */
  infraCost: number;
  /** Entries grouped by session ID */
  entriesBySession: Map<string, CostEntry[]>;
  /** Per-day cost totals sorted chronologically */
  dailyCosts: { date: string; amount: number }[];
  /** Projected monthly cost based on the daily average in USD */
  monthlyProjection: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a Date as a YYYY-MM-DD string for daily aggregation.
 */
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format a USD amount with appropriate precision.
 */
function formatUSD(amount: number): string {
  if (amount < 0.01 && amount > 0) {
    return `$${amount.toFixed(6)}`;
  }
  return `$${amount.toFixed(4)}`;
}

// ---------------------------------------------------------------------------
// CostTracker
// ---------------------------------------------------------------------------

/**
 * Tracks LLM and infrastructure costs across Nimbus sessions.
 *
 * Maintains an in-memory ledger of cost entries and provides methods to
 * compute summaries, daily breakdowns, and monthly projections.
 *
 * @example
 * ```typescript
 * const tracker = new CostTracker();
 *
 * tracker.recordLLMCost({
 *   sessionId: 'abc-123',
 *   model: 'claude-sonnet-4-20250514',
 *   inputTokens: 1500,
 *   outputTokens: 800,
 *   costUSD: 0.0165,
 * });
 *
 * const summary = tracker.getSummary();
 * console.log(tracker.formatSummary(summary));
 * ```
 */
export class CostTracker {
  private entries: CostEntry[] = [];

  /**
   * Record a cost entry for an LLM API call.
   *
   * @param params - LLM call details including model, token counts, and cost
   * @returns The created cost entry
   */
  recordLLMCost(params: {
    sessionId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUSD: number;
  }): CostEntry {
    const entry: CostEntry = {
      id: crypto.randomUUID(),
      sessionId: params.sessionId,
      timestamp: new Date(),
      category: 'llm',
      description: `LLM call to ${params.model} (${params.inputTokens} in / ${params.outputTokens} out tokens)`,
      amount: params.costUSD,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      model: params.model,
    };

    this.entries.push(entry);
    return entry;
  }

  /**
   * Record an infrastructure cost change, typically derived from a terraform plan.
   *
   * @param params - Infrastructure cost details
   * @returns The created cost entry
   */
  recordInfraCost(params: {
    sessionId: string;
    description: string;
    monthlyCost: number;
  }): CostEntry {
    const entry: CostEntry = {
      id: crypto.randomUUID(),
      sessionId: params.sessionId,
      timestamp: new Date(),
      category: 'infra',
      description: params.description,
      amount: params.monthlyCost,
    };

    this.entries.push(entry);
    return entry;
  }

  /**
   * Compute a cost summary over all entries or a subset filtered by time/session.
   *
   * The monthly projection is calculated by taking the average daily cost
   * and multiplying by 30. If only a single day of data exists, that day's
   * total is used as the daily average.
   *
   * @param options - Optional time range or session filter
   * @returns Aggregated cost summary
   */
  getSummary(options?: { since?: Date; sessionId?: string }): CostSummary {
    let filtered = this.entries;

    if (options?.since) {
      const since = options.since.getTime();
      filtered = filtered.filter(e => e.timestamp.getTime() >= since);
    }

    if (options?.sessionId) {
      filtered = filtered.filter(e => e.sessionId === options.sessionId);
    }

    // Totals
    let totalCost = 0;
    let llmCost = 0;
    let infraCost = 0;

    // Group by session
    const entriesBySession = new Map<string, CostEntry[]>();

    // Group by date
    const dailyMap = new Map<string, number>();

    for (const entry of filtered) {
      totalCost += entry.amount;
      if (entry.category === 'llm') {
        llmCost += entry.amount;
      } else {
        infraCost += entry.amount;
      }

      // Session grouping
      const sessionEntries = entriesBySession.get(entry.sessionId);
      if (sessionEntries) {
        sessionEntries.push(entry);
      } else {
        entriesBySession.set(entry.sessionId, [entry]);
      }

      // Daily grouping
      const dateKey = toDateKey(entry.timestamp);
      dailyMap.set(dateKey, (dailyMap.get(dateKey) ?? 0) + entry.amount);
    }

    // Sort daily costs chronologically
    const dailyCosts = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }));

    // Monthly projection: average daily cost * 30
    let monthlyProjection = 0;
    if (dailyCosts.length > 0) {
      const totalDailyCost = dailyCosts.reduce((sum, d) => sum + d.amount, 0);
      const avgDaily = totalDailyCost / dailyCosts.length;
      monthlyProjection = avgDaily * 30;
    }

    return {
      totalCost,
      llmCost,
      infraCost,
      entriesBySession,
      dailyCosts,
      monthlyProjection,
    };
  }

  /**
   * Retrieve raw cost entries, optionally filtered by session.
   *
   * @param sessionId - If provided, only return entries for this session
   * @returns Array of cost entries sorted by timestamp (newest first)
   */
  getEntries(sessionId?: string): CostEntry[] {
    let result = [...this.entries];
    if (sessionId) {
      result = result.filter(e => e.sessionId === sessionId);
    }
    return result.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Format a cost summary as a human-readable text report.
   *
   * Includes totals, per-session breakdowns, daily costs, and the
   * projected monthly spend.
   *
   * @param summary - The summary to format
   * @returns Multi-line formatted report
   */
  formatSummary(summary: CostSummary): string {
    const lines: string[] = [
      'Cost Summary',
      '='.repeat(50),
      '',
      `  Total Cost:       ${formatUSD(summary.totalCost)}`,
      `  LLM Cost:         ${formatUSD(summary.llmCost)}`,
      `  Infra Cost:       ${formatUSD(summary.infraCost)}`,
      `  Monthly Estimate: ${formatUSD(summary.monthlyProjection)}`,
      '',
    ];

    // Per-session breakdown
    if (summary.entriesBySession.size > 0) {
      lines.push('Per-Session Breakdown:');
      lines.push('-'.repeat(50));

      for (const [sessionId, entries] of summary.entriesBySession) {
        const sessionTotal = entries.reduce((s, e) => s + e.amount, 0);
        const llm = entries.filter(e => e.category === 'llm');
        const infra = entries.filter(e => e.category === 'infra');

        const totalInputTokens = llm.reduce((s, e) => s + (e.inputTokens ?? 0), 0);
        const totalOutputTokens = llm.reduce((s, e) => s + (e.outputTokens ?? 0), 0);

        lines.push(`  Session: ${sessionId}`);
        lines.push(`    Total: ${formatUSD(sessionTotal)} (${entries.length} entries)`);

        if (llm.length > 0) {
          const llmTotal = llm.reduce((s, e) => s + e.amount, 0);
          lines.push(
            `    LLM:   ${formatUSD(llmTotal)} (${llm.length} calls, ${totalInputTokens} in / ${totalOutputTokens} out tokens)`
          );
        }

        if (infra.length > 0) {
          const infraTotal = infra.reduce((s, e) => s + e.amount, 0);
          lines.push(`    Infra: ${formatUSD(infraTotal)} (${infra.length} changes)`);
        }

        lines.push('');
      }
    }

    // Daily costs
    if (summary.dailyCosts.length > 0) {
      lines.push('Daily Costs:');
      lines.push('-'.repeat(50));

      for (const day of summary.dailyCosts) {
        lines.push(`  ${day.date}: ${formatUSD(day.amount)}`);
      }

      lines.push('');
    }

    lines.push('='.repeat(50));
    lines.push(`Projected monthly cost: ${formatUSD(summary.monthlyProjection)}`);

    return lines.join('\n');
  }
}
