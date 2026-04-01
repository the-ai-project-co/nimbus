/**
 * E2E tests for the Nimbus cost tracking and calculation system.
 *
 * Covers: per-model cost calculation for Anthropic / OpenAI / Google / Ollama,
 * cost tracker aggregation, provider summaries, input/output breakdowns,
 * unknown model handling, pricing data inspection, per-1K-token verification,
 * total cost formula, tracker reset, and large token counts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateCost,
  getPricingData,
  type CostResult,
} from '../../src/llm/cost-calculator';
import { CostTracker, type CostSummary } from '../../src/audit/cost-tracker';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Tolerance for floating-point USD comparisons. */
const EPSILON = 1e-10;

function expectCostClose(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThan(EPSILON);
}

// ---------------------------------------------------------------------------
// 1. Cost calculation for Anthropic claude-3-5-sonnet
// ---------------------------------------------------------------------------

describe('Anthropic claude-3.5-sonnet cost', () => {
  it('calculates cost for 1K input + 1K output tokens', () => {
    const result = calculateCost('anthropic', 'claude-3.5-sonnet', 1000, 1000);
    // Pricing: input $0.003/1K, output $0.015/1K
    expectCostClose(result.breakdown.input, 0.003);
    expectCostClose(result.breakdown.output, 0.015);
    expectCostClose(result.costUSD, 0.018);
  });

  it('handles the dated model variant', () => {
    const result = calculateCost('anthropic', 'claude-3-5-sonnet-20241022', 1000, 1000);
    expectCostClose(result.costUSD, 0.018);
  });

  it('scales linearly with token count', () => {
    const result = calculateCost('anthropic', 'claude-3.5-sonnet', 5000, 2000);
    // 5K input: 5 * 0.003 = 0.015; 2K output: 2 * 0.015 = 0.030
    expectCostClose(result.breakdown.input, 0.015);
    expectCostClose(result.breakdown.output, 0.030);
    expectCostClose(result.costUSD, 0.045);
  });
});

// ---------------------------------------------------------------------------
// 2. Cost calculation for Anthropic claude-3-haiku
// ---------------------------------------------------------------------------

describe('Anthropic claude-3-haiku cost', () => {
  it('calculates cost for 1K input + 1K output tokens', () => {
    const result = calculateCost('anthropic', 'claude-3-haiku', 1000, 1000);
    // Pricing: input $0.00025/1K, output $0.00125/1K
    expectCostClose(result.breakdown.input, 0.00025);
    expectCostClose(result.breakdown.output, 0.00125);
    expectCostClose(result.costUSD, 0.0015);
  });

  it('handles the dated model variant', () => {
    const result = calculateCost('anthropic', 'claude-3-haiku-20240307', 1000, 1000);
    expectCostClose(result.costUSD, 0.0015);
  });

  it('is significantly cheaper than claude-3.5-sonnet', () => {
    const haiku = calculateCost('anthropic', 'claude-3-haiku', 10000, 5000);
    const sonnet = calculateCost('anthropic', 'claude-3.5-sonnet', 10000, 5000);
    expect(haiku.costUSD).toBeLessThan(sonnet.costUSD);
  });
});

// ---------------------------------------------------------------------------
// 3. Cost calculation for OpenAI gpt-4o
// ---------------------------------------------------------------------------

describe('OpenAI gpt-4o cost', () => {
  it('calculates cost for 1K input + 1K output tokens', () => {
    const result = calculateCost('openai', 'gpt-4o', 1000, 1000);
    // Pricing: input $0.005/1K, output $0.015/1K
    expectCostClose(result.breakdown.input, 0.005);
    expectCostClose(result.breakdown.output, 0.015);
    expectCostClose(result.costUSD, 0.020);
  });

  it('handles the dated model variant', () => {
    const result = calculateCost('openai', 'gpt-4o-2024-11-20', 1000, 1000);
    expectCostClose(result.costUSD, 0.020);
  });
});

// ---------------------------------------------------------------------------
// 4. Cost calculation for OpenAI gpt-4-turbo
// ---------------------------------------------------------------------------

describe('OpenAI gpt-4-turbo cost', () => {
  it('calculates cost for 1K input + 1K output tokens', () => {
    const result = calculateCost('openai', 'gpt-4-turbo', 1000, 1000);
    // Pricing: input $0.01/1K, output $0.03/1K
    expectCostClose(result.breakdown.input, 0.01);
    expectCostClose(result.breakdown.output, 0.03);
    expectCostClose(result.costUSD, 0.04);
  });

  it('handles the dated variant', () => {
    const result = calculateCost('openai', 'gpt-4-turbo-2024-04-09', 1000, 1000);
    expectCostClose(result.costUSD, 0.04);
  });

  it('is cheaper than base gpt-4 but more expensive than gpt-4o', () => {
    const turbo = calculateCost('openai', 'gpt-4-turbo', 1000, 1000);
    const base = calculateCost('openai', 'gpt-4', 1000, 1000);
    const o = calculateCost('openai', 'gpt-4o', 1000, 1000);

    expect(turbo.costUSD).toBeLessThan(base.costUSD);
    expect(turbo.costUSD).toBeGreaterThan(o.costUSD);
  });
});

// ---------------------------------------------------------------------------
// 5. Cost calculation for Google gemini-1.5-pro
// ---------------------------------------------------------------------------

describe('Google gemini-1.5-pro cost', () => {
  it('calculates cost for 1K input + 1K output tokens', () => {
    const result = calculateCost('google', 'gemini-1.5-pro', 1000, 1000);
    // Pricing: input $0.00125/1K, output $0.005/1K
    expectCostClose(result.breakdown.input, 0.00125);
    expectCostClose(result.breakdown.output, 0.005);
    expectCostClose(result.costUSD, 0.00625);
  });

  it('is cheaper than OpenAI gpt-4o', () => {
    const gemini = calculateCost('google', 'gemini-1.5-pro', 10000, 5000);
    const gpt4o = calculateCost('openai', 'gpt-4o', 10000, 5000);
    expect(gemini.costUSD).toBeLessThan(gpt4o.costUSD);
  });
});

// ---------------------------------------------------------------------------
// 6. Ollama costs are zero
// ---------------------------------------------------------------------------

describe('Ollama costs', () => {
  it('returns zero cost for any Ollama model', () => {
    const result = calculateCost('ollama', 'llama3.1:70b', 50000, 10000);
    expect(result.costUSD).toBe(0);
    expect(result.breakdown.input).toBe(0);
    expect(result.breakdown.output).toBe(0);
  });

  it('returns zero cost regardless of token count', () => {
    const result = calculateCost('ollama', 'mistral:latest', 1000000, 500000);
    expect(result.costUSD).toBe(0);
  });

  it('returns zero for made-up Ollama model names', () => {
    const result = calculateCost('ollama', 'custom-model-abc', 1000, 1000);
    expect(result.costUSD).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Cost tracker aggregates multiple requests
// ---------------------------------------------------------------------------

describe('CostTracker aggregation', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  it('aggregates total cost across multiple LLM calls', () => {
    tracker.recordLLMCost({
      sessionId: 'sess-1',
      model: 'claude-3.5-sonnet',
      inputTokens: 1000,
      outputTokens: 500,
      costUSD: 0.01,
    });
    tracker.recordLLMCost({
      sessionId: 'sess-1',
      model: 'claude-3.5-sonnet',
      inputTokens: 2000,
      outputTokens: 1000,
      costUSD: 0.02,
    });

    const summary = tracker.getSummary();
    expectCostClose(summary.totalCost, 0.03);
    expectCostClose(summary.llmCost, 0.03);
    expect(summary.infraCost).toBe(0);
  });

  it('aggregates LLM and infra costs separately', () => {
    tracker.recordLLMCost({
      sessionId: 'sess-1',
      model: 'gpt-4o',
      inputTokens: 1000,
      outputTokens: 500,
      costUSD: 0.01,
    });
    tracker.recordInfraCost({
      sessionId: 'sess-1',
      description: 'New EC2 instance',
      monthlyCost: 50.0,
    });

    const summary = tracker.getSummary();
    expectCostClose(summary.totalCost, 50.01);
    expectCostClose(summary.llmCost, 0.01);
    expectCostClose(summary.infraCost, 50.0);
  });
});

// ---------------------------------------------------------------------------
// 8. Cost summary by provider (via session grouping)
// ---------------------------------------------------------------------------

describe('Cost summary by session (provider proxy)', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  it('groups costs by session ID', () => {
    tracker.recordLLMCost({
      sessionId: 'anthropic-session',
      model: 'claude-3.5-sonnet',
      inputTokens: 1000,
      outputTokens: 500,
      costUSD: 0.01,
    });
    tracker.recordLLMCost({
      sessionId: 'openai-session',
      model: 'gpt-4o',
      inputTokens: 2000,
      outputTokens: 1000,
      costUSD: 0.025,
    });
    tracker.recordLLMCost({
      sessionId: 'anthropic-session',
      model: 'claude-3.5-sonnet',
      inputTokens: 500,
      outputTokens: 200,
      costUSD: 0.005,
    });

    const summary = tracker.getSummary();
    expect(summary.entriesBySession.size).toBe(2);

    const anthropicEntries = summary.entriesBySession.get('anthropic-session')!;
    expect(anthropicEntries).toHaveLength(2);
    const anthropicTotal = anthropicEntries.reduce((s, e) => s + e.amount, 0);
    expectCostClose(anthropicTotal, 0.015);

    const openaiEntries = summary.entriesBySession.get('openai-session')!;
    expect(openaiEntries).toHaveLength(1);
    expectCostClose(openaiEntries[0].amount, 0.025);
  });

  it('filters summary by sessionId', () => {
    tracker.recordLLMCost({
      sessionId: 'sess-a',
      model: 'claude-3.5-sonnet',
      inputTokens: 1000,
      outputTokens: 500,
      costUSD: 0.01,
    });
    tracker.recordLLMCost({
      sessionId: 'sess-b',
      model: 'gpt-4o',
      inputTokens: 2000,
      outputTokens: 1000,
      costUSD: 0.02,
    });

    const summaryA = tracker.getSummary({ sessionId: 'sess-a' });
    expectCostClose(summaryA.totalCost, 0.01);
    expect(summaryA.entriesBySession.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 9. Cost breakdown includes input/output split
// ---------------------------------------------------------------------------

describe('Cost breakdown input/output split', () => {
  it('calculateCost returns separate input and output costs', () => {
    const result = calculateCost('anthropic', 'claude-3.5-sonnet', 2000, 3000);
    // input: 2 * 0.003 = 0.006, output: 3 * 0.015 = 0.045
    expect(result.breakdown.input).toBeGreaterThan(0);
    expect(result.breakdown.output).toBeGreaterThan(0);
    expectCostClose(result.breakdown.input, 0.006);
    expectCostClose(result.breakdown.output, 0.045);
    expectCostClose(result.costUSD, result.breakdown.input + result.breakdown.output);
  });

  it('CostTracker entries record separate input and output tokens', () => {
    const tracker = new CostTracker();
    const entry = tracker.recordLLMCost({
      sessionId: 'sess-1',
      model: 'gpt-4o',
      inputTokens: 3500,
      outputTokens: 1200,
      costUSD: 0.035,
    });

    expect(entry.inputTokens).toBe(3500);
    expect(entry.outputTokens).toBe(1200);
    expect(entry.model).toBe('gpt-4o');
    expect(entry.category).toBe('llm');
  });
});

// ---------------------------------------------------------------------------
// 10. Unknown model returns zero cost
// ---------------------------------------------------------------------------

describe('Unknown model returns zero cost', () => {
  it('returns zero for an unknown model on a known provider', () => {
    const result = calculateCost('anthropic', 'claude-99-mega', 1000, 1000);
    expect(result.costUSD).toBe(0);
    expect(result.breakdown.input).toBe(0);
    expect(result.breakdown.output).toBe(0);
  });

  it('returns zero for a completely unknown provider', () => {
    const result = calculateCost('unknownprovider', 'some-model', 5000, 5000);
    expect(result.costUSD).toBe(0);
    expect(result.breakdown.input).toBe(0);
    expect(result.breakdown.output).toBe(0);
  });

  it('returns zero for empty model string', () => {
    const result = calculateCost('openai', '', 1000, 1000);
    expect(result.costUSD).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 11. getPricingData returns all supported models
// ---------------------------------------------------------------------------

describe('getPricingData', () => {
  it('returns pricing data for all major providers', () => {
    const pricing = getPricingData();
    expect(pricing).toHaveProperty('anthropic');
    expect(pricing).toHaveProperty('openai');
    expect(pricing).toHaveProperty('google');
    expect(pricing).toHaveProperty('ollama');
    expect(pricing).toHaveProperty('groq');
    expect(pricing).toHaveProperty('deepseek');
  });

  it('contains known models within each provider', () => {
    const pricing = getPricingData();

    // Anthropic
    expect(pricing.anthropic).toHaveProperty('claude-3.5-sonnet');
    expect(pricing.anthropic).toHaveProperty('claude-3-haiku');
    expect(pricing.anthropic).toHaveProperty('claude-3-opus');

    // OpenAI
    expect(pricing.openai).toHaveProperty('gpt-4o');
    expect(pricing.openai).toHaveProperty('gpt-4-turbo');
    expect(pricing.openai).toHaveProperty('gpt-4');

    // Google
    expect(pricing.google).toHaveProperty('gemini-1.5-pro');
    expect(pricing.google).toHaveProperty('gemini-1.5-flash');
  });

  it('each pricing entry is a [input, output] tuple', () => {
    const pricing = getPricingData();

    for (const [_provider, models] of Object.entries(pricing)) {
      for (const [_model, entry] of Object.entries(models)) {
        expect(Array.isArray(entry)).toBe(true);
        expect(entry).toHaveLength(2);
        expect(typeof entry[0]).toBe('number');
        expect(typeof entry[1]).toBe('number');
        expect(entry[0]).toBeGreaterThanOrEqual(0);
        expect(entry[1]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('ollama has an empty model list (all free)', () => {
    const pricing = getPricingData();
    expect(Object.keys(pricing.ollama)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 12. Cost per 1K tokens matches published pricing
// ---------------------------------------------------------------------------

describe('Cost per 1K tokens matches pricing table', () => {
  const pricingChecks: {
    provider: string;
    model: string;
    inputPer1K: number;
    outputPer1K: number;
  }[] = [
    { provider: 'anthropic', model: 'claude-3.5-sonnet', inputPer1K: 0.003, outputPer1K: 0.015 },
    { provider: 'anthropic', model: 'claude-3-haiku', inputPer1K: 0.00025, outputPer1K: 0.00125 },
    { provider: 'anthropic', model: 'claude-3-opus', inputPer1K: 0.015, outputPer1K: 0.075 },
    { provider: 'openai', model: 'gpt-4o', inputPer1K: 0.005, outputPer1K: 0.015 },
    { provider: 'openai', model: 'gpt-4-turbo', inputPer1K: 0.01, outputPer1K: 0.03 },
    { provider: 'openai', model: 'gpt-4', inputPer1K: 0.03, outputPer1K: 0.06 },
    { provider: 'openai', model: 'gpt-4o-mini', inputPer1K: 0.00015, outputPer1K: 0.0006 },
    { provider: 'google', model: 'gemini-1.5-pro', inputPer1K: 0.00125, outputPer1K: 0.005 },
    { provider: 'google', model: 'gemini-1.5-flash', inputPer1K: 0.000075, outputPer1K: 0.0003 },
  ];

  for (const { provider, model, inputPer1K, outputPer1K } of pricingChecks) {
    it(`${provider}/${model}: input=$${inputPer1K}/1K, output=$${outputPer1K}/1K`, () => {
      // Test with exactly 1K tokens to verify the per-1K rate
      const result = calculateCost(provider, model, 1000, 1000);
      expectCostClose(result.breakdown.input, inputPer1K);
      expectCostClose(result.breakdown.output, outputPer1K);
    });
  }
});

// ---------------------------------------------------------------------------
// 13. Total cost = input_cost + output_cost
// ---------------------------------------------------------------------------

describe('Total cost = input_cost + output_cost', () => {
  const models: { provider: string; model: string }[] = [
    { provider: 'anthropic', model: 'claude-3.5-sonnet' },
    { provider: 'anthropic', model: 'claude-3-haiku' },
    { provider: 'openai', model: 'gpt-4o' },
    { provider: 'openai', model: 'gpt-4-turbo' },
    { provider: 'google', model: 'gemini-1.5-pro' },
  ];

  for (const { provider, model } of models) {
    it(`${provider}/${model}: costUSD === breakdown.input + breakdown.output`, () => {
      const result = calculateCost(provider, model, 7500, 3200);
      const sum = result.breakdown.input + result.breakdown.output;
      expectCostClose(result.costUSD, sum);
    });
  }

  it('invariant holds for zero tokens', () => {
    const result = calculateCost('anthropic', 'claude-3.5-sonnet', 0, 0);
    expect(result.costUSD).toBe(0);
    expect(result.breakdown.input).toBe(0);
    expect(result.breakdown.output).toBe(0);
  });

  it('invariant holds for input-only requests', () => {
    const result = calculateCost('openai', 'gpt-4o', 5000, 0);
    expectCostClose(result.costUSD, result.breakdown.input);
    expect(result.breakdown.output).toBe(0);
  });

  it('invariant holds for output-only requests', () => {
    const result = calculateCost('openai', 'gpt-4o', 0, 5000);
    expectCostClose(result.costUSD, result.breakdown.output);
    expect(result.breakdown.input).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 14. Cost tracker resets correctly
// ---------------------------------------------------------------------------

describe('Cost tracker resets correctly', () => {
  it('new CostTracker instance starts with empty entries', () => {
    const tracker = new CostTracker();
    const summary = tracker.getSummary();
    expect(summary.totalCost).toBe(0);
    expect(summary.llmCost).toBe(0);
    expect(summary.infraCost).toBe(0);
    expect(summary.entriesBySession.size).toBe(0);
    expect(summary.dailyCosts).toHaveLength(0);
    expect(summary.monthlyProjection).toBe(0);
  });

  it('creating a new CostTracker effectively resets tracking', () => {
    const tracker1 = new CostTracker();
    tracker1.recordLLMCost({
      sessionId: 'sess-1',
      model: 'gpt-4o',
      inputTokens: 1000,
      outputTokens: 500,
      costUSD: 0.01,
    });

    expect(tracker1.getSummary().totalCost).toBeGreaterThan(0);

    // A fresh tracker starts clean
    const tracker2 = new CostTracker();
    expect(tracker2.getSummary().totalCost).toBe(0);
    expect(tracker2.getEntries()).toHaveLength(0);
  });

  it('getEntries returns entries in reverse chronological order', () => {
    const tracker = new CostTracker();

    tracker.recordLLMCost({
      sessionId: 'sess-1',
      model: 'gpt-4o',
      inputTokens: 100,
      outputTokens: 50,
      costUSD: 0.001,
    });
    tracker.recordLLMCost({
      sessionId: 'sess-1',
      model: 'gpt-4o',
      inputTokens: 200,
      outputTokens: 100,
      costUSD: 0.002,
    });

    const entries = tracker.getEntries();
    expect(entries).toHaveLength(2);
    // Most recent should come first
    expect(entries[0].timestamp.getTime()).toBeGreaterThanOrEqual(entries[1].timestamp.getTime());
  });

  it('getEntries can filter by sessionId', () => {
    const tracker = new CostTracker();

    tracker.recordLLMCost({ sessionId: 'a', model: 'm', inputTokens: 1, outputTokens: 1, costUSD: 0.001 });
    tracker.recordLLMCost({ sessionId: 'b', model: 'm', inputTokens: 1, outputTokens: 1, costUSD: 0.002 });
    tracker.recordLLMCost({ sessionId: 'a', model: 'm', inputTokens: 1, outputTokens: 1, costUSD: 0.003 });

    expect(tracker.getEntries('a')).toHaveLength(2);
    expect(tracker.getEntries('b')).toHaveLength(1);
    expect(tracker.getEntries('c')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 15. Large token counts calculated accurately
// ---------------------------------------------------------------------------

describe('Large token counts', () => {
  it('handles 1 million input + 500K output tokens for claude-3.5-sonnet', () => {
    const result = calculateCost('anthropic', 'claude-3.5-sonnet', 1_000_000, 500_000);
    // input: 1000 * 0.003 = 3.0; output: 500 * 0.015 = 7.5
    expectCostClose(result.breakdown.input, 3.0);
    expectCostClose(result.breakdown.output, 7.5);
    expectCostClose(result.costUSD, 10.5);
  });

  it('handles 10 million tokens for gpt-4o', () => {
    const result = calculateCost('openai', 'gpt-4o', 10_000_000, 5_000_000);
    // input: 10000 * 0.005 = 50.0; output: 5000 * 0.015 = 75.0
    expectCostClose(result.breakdown.input, 50.0);
    expectCostClose(result.breakdown.output, 75.0);
    expectCostClose(result.costUSD, 125.0);
  });

  it('handles very small fractional token counts', () => {
    const result = calculateCost('anthropic', 'claude-3.5-sonnet', 1, 1);
    // input: 0.001 * 0.003 = 0.000003; output: 0.001 * 0.015 = 0.000015
    expectCostClose(result.breakdown.input, 0.000003);
    expectCostClose(result.breakdown.output, 0.000015);
    expectCostClose(result.costUSD, 0.000018);
  });

  it('CostTracker handles many entries without data loss', () => {
    const tracker = new CostTracker();
    const count = 1000;
    const costPerEntry = 0.001;

    for (let i = 0; i < count; i++) {
      tracker.recordLLMCost({
        sessionId: `sess-${i % 10}`,
        model: 'claude-3.5-sonnet',
        inputTokens: 100,
        outputTokens: 50,
        costUSD: costPerEntry,
      });
    }

    const summary = tracker.getSummary();
    // Total should be 1000 * 0.001 = 1.0
    expectCostClose(summary.totalCost, 1.0);
    expect(summary.entriesBySession.size).toBe(10);
    expect(tracker.getEntries()).toHaveLength(count);
  });

  it('formatSummary produces a readable report', () => {
    const tracker = new CostTracker();
    tracker.recordLLMCost({
      sessionId: 'demo',
      model: 'claude-3.5-sonnet',
      inputTokens: 5000,
      outputTokens: 2000,
      costUSD: 0.045,
    });
    tracker.recordInfraCost({
      sessionId: 'demo',
      description: 'New RDS instance',
      monthlyCost: 150.0,
    });

    const summary = tracker.getSummary();
    const report = tracker.formatSummary(summary);

    expect(report).toContain('Cost Summary');
    expect(report).toContain('Total Cost');
    expect(report).toContain('LLM Cost');
    expect(report).toContain('Infra Cost');
    expect(report).toContain('Monthly Estimate');
    expect(report).toContain('demo');
    expect(report).toContain('Per-Session Breakdown');
  });

  it('daily costs and monthly projection are computed correctly', () => {
    const tracker = new CostTracker();

    // Record entries - they all land on "today" since timestamp is new Date()
    tracker.recordLLMCost({
      sessionId: 'sess-1',
      model: 'gpt-4o',
      inputTokens: 1000,
      outputTokens: 500,
      costUSD: 0.10,
    });
    tracker.recordLLMCost({
      sessionId: 'sess-1',
      model: 'gpt-4o',
      inputTokens: 2000,
      outputTokens: 1000,
      costUSD: 0.20,
    });

    const summary = tracker.getSummary();
    // All entries on same day, so dailyCosts has 1 entry
    expect(summary.dailyCosts).toHaveLength(1);
    expectCostClose(summary.dailyCosts[0].amount, 0.30);
    // Monthly projection = daily average * 30 = 0.30 * 30 = 9.0
    expectCostClose(summary.monthlyProjection, 9.0);
  });
});
