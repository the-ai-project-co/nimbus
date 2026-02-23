/**
 * Context Manager — Token Tracking & Auto-Compact
 *
 * Tracks cumulative token usage across the agent loop and triggers
 * automatic context compaction when usage exceeds a configurable
 * threshold (default 85% of the model's context window).
 *
 * The manager provides:
 * - Token estimation for messages, system prompts, and tool definitions.
 * - A breakdown of how the context budget is being consumed.
 * - Message selection logic for deciding what to preserve vs. summarize.
 * - A builder for reassembling messages after compaction.
 *
 * Configuration can be supplied via constructor options or read from the
 * Nimbus config database (keys: `context.auto_compact_threshold`,
 * `context.max_file_injection`).
 *
 * @module agent/context-manager
 */

import type { LLMMessage } from '../llm/types';
import { getConfig } from '../state/config';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

/** Detailed breakdown of how the context window budget is being used. */
export interface ContextBreakdown {
  /** Tokens consumed by the base system prompt (excluding NIMBUS.md). */
  systemPrompt: number;
  /** Tokens consumed by NIMBUS.md instructions within the system prompt. */
  nimbusInstructions: number;
  /** Tokens consumed by all conversation messages. */
  messages: number;
  /** Tokens consumed by tool definition schemas. */
  toolDefinitions: number;
  /** Sum of all token categories. */
  total: number;
  /** Total available budget (model context window size). */
  budget: number;
  /** Percentage of budget currently in use (0-100). */
  usagePercent: number;
}

/** Result of a compaction operation. */
export interface CompactionResult {
  /** Token count of the messages that were summarized. */
  originalTokens: number;
  /** Token count of the compacted message array. */
  compactedTokens: number;
  /** Tokens saved by compaction (originalTokens - summary tokens). */
  savedTokens: number;
  /** Whether a proper LLM summary was produced (false = fallback used). */
  summaryPreserved: boolean;
}

/** Configuration options for the context manager. */
export interface ContextManagerOptions {
  /** Max context window tokens (default: 200000 for Claude). */
  maxContextTokens?: number;
  /** Threshold percentage to trigger auto-compact (0.0 - 1.0, default: 0.85). */
  autoCompactThreshold?: number;
  /** Number of recent messages to always preserve during compaction (default: 5). */
  preserveRecentMessages?: number;
  /** NIMBUS.md section keys that should always remain in context. */
  alwaysInContext?: string[];
}

// ---------------------------------------------------------------------------
// Token Estimation Utilities
// ---------------------------------------------------------------------------

/**
 * Rough token estimate based on character count.
 *
 * Uses the common heuristic of ~4 characters per token, which is a
 * reasonable average across English text and source code.
 *
 * @param text - The text to estimate.
 * @returns Approximate token count (rounded up).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate token count for a single LLM message.
 *
 * Accounts for the message content, structural overhead (role, framing),
 * and any tool calls embedded in the message.
 *
 * @param message - The LLM message to estimate.
 * @returns Approximate token count.
 */
export function estimateMessageTokens(message: LLMMessage): number {
  let tokens = 0;

  if (typeof message.content === 'string') {
    tokens += estimateTokens(message.content);
  }

  // Add overhead for role and message structure
  tokens += 4;

  // Tool calls add extra tokens for name, arguments, and JSON structure
  if (message.toolCalls) {
    for (const tc of message.toolCalls) {
      tokens += estimateTokens(tc.function.name);
      tokens += estimateTokens(tc.function.arguments);
      tokens += 10; // structural overhead per tool call
    }
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// ContextManager Class
// ---------------------------------------------------------------------------

/**
 * Manages context window budget and auto-compaction decisions.
 *
 * Create one instance per agent session. The manager does not hold
 * conversation state itself -- it operates on message arrays passed in
 * by the caller.
 */
export class ContextManager {
  private maxContextTokens: number;
  private autoCompactThreshold: number;
  private preserveRecentMessages: number;
  private alwaysInContext: string[];

  constructor(options?: ContextManagerOptions) {
    // Try loading from config DB, fall back to options/defaults
    const configThreshold = getConfigSafe('context.auto_compact_threshold');

    this.maxContextTokens = options?.maxContextTokens ?? 200_000;
    this.autoCompactThreshold =
      configThreshold ?? options?.autoCompactThreshold ?? 0.85;
    this.preserveRecentMessages = options?.preserveRecentMessages ?? 5;
    this.alwaysInContext = options?.alwaysInContext ?? [];
  }

  /**
   * Check whether auto-compaction should be triggered.
   *
   * Returns `true` if the estimated token usage is at or above the
   * configured threshold percentage of the context window.
   *
   * @param systemPrompt - The full system prompt string.
   * @param messages - Current conversation messages.
   * @param toolDefinitionsTokens - Pre-computed token count for tool schemas.
   * @returns `true` if compaction should run.
   */
  shouldCompact(
    systemPrompt: string,
    messages: LLMMessage[],
    toolDefinitionsTokens: number,
  ): boolean {
    const usage = this.calculateUsage(
      systemPrompt,
      messages,
      toolDefinitionsTokens,
    );
    return usage.usagePercent >= this.autoCompactThreshold * 100;
  }

  /**
   * Calculate a detailed context usage breakdown.
   *
   * Separates the system prompt into base instructions and NIMBUS.md
   * content (if present), and sums up messages and tool definitions
   * to produce a full picture of context window consumption.
   *
   * @param systemPrompt - The full system prompt string.
   * @param messages - Current conversation messages.
   * @param toolDefinitionsTokens - Pre-computed token count for tool schemas.
   * @returns A {@link ContextBreakdown} with per-category token counts.
   */
  calculateUsage(
    systemPrompt: string,
    messages: LLMMessage[],
    toolDefinitionsTokens: number,
  ): ContextBreakdown {
    const systemPromptTokens = estimateTokens(systemPrompt);

    // Separate NIMBUS.md instructions if they appear in system prompt
    const nimbusMarker = '# NIMBUS.md';
    const nimbusIdx = systemPrompt.indexOf(nimbusMarker);
    let nimbusInstructionsTokens = 0;
    let baseSystemTokens = systemPromptTokens;

    if (nimbusIdx >= 0) {
      const nimbusContent = systemPrompt.slice(nimbusIdx);
      nimbusInstructionsTokens = estimateTokens(nimbusContent);
      baseSystemTokens = systemPromptTokens - nimbusInstructionsTokens;
    }

    const messagesTokens = messages.reduce(
      (sum, msg) => sum + estimateMessageTokens(msg),
      0,
    );

    const total = systemPromptTokens + messagesTokens + toolDefinitionsTokens;
    const usagePercent =
      this.maxContextTokens > 0
        ? Math.round((total / this.maxContextTokens) * 100)
        : 0;

    return {
      systemPrompt: baseSystemTokens,
      nimbusInstructions: nimbusInstructionsTokens,
      messages: messagesTokens,
      toolDefinitions: toolDefinitionsTokens,
      total,
      budget: this.maxContextTokens,
      usagePercent,
    };
  }

  /**
   * Select which messages to preserve during compaction.
   *
   * Preservation rules:
   * - The first message is always kept (initial user context).
   * - The last N messages are always kept (recent conversation).
   * - Tool messages near the recent window are kept (active tool state).
   * - Previous compaction summary blocks are always kept.
   * - Everything else is marked for summarization.
   *
   * @param messages - The full conversation message array.
   * @returns An object with `preserved` and `toSummarize` arrays.
   */
  selectPreservedMessages(messages: LLMMessage[]): {
    preserved: LLMMessage[];
    toSummarize: LLMMessage[];
  } {
    if (messages.length <= this.preserveRecentMessages + 1) {
      return { preserved: [...messages], toSummarize: [] };
    }

    const preserved: LLMMessage[] = [];
    const toSummarize: LLMMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const isFirst = i === 0;
      const isRecent = i >= messages.length - this.preserveRecentMessages;
      const hasActiveTools =
        msg.role === 'tool' &&
        i >= messages.length - this.preserveRecentMessages - 2;

      // Always preserve summary blocks (from previous compactions)
      const isSummary =
        typeof msg.content === 'string' &&
        msg.content.startsWith('[Context Summary]');

      if (isFirst || isRecent || hasActiveTools || isSummary) {
        preserved.push(msg);
      } else {
        toSummarize.push(msg);
      }
    }

    return { preserved, toSummarize };
  }

  /**
   * Build the compacted message array by inserting a summary.
   *
   * Places the summary as a user message immediately after the first
   * preserved message, then appends all remaining preserved messages.
   * The summary is wrapped with `[Context Summary]` markers so future
   * compaction passes can identify and preserve it.
   *
   * @param preserved - Messages to keep verbatim.
   * @param summary - The LLM-generated (or fallback) summary text.
   * @returns A new message array ready to replace the original.
   */
  buildCompactedMessages(
    preserved: LLMMessage[],
    summary: string,
  ): LLMMessage[] {
    const result: LLMMessage[] = [];

    // Keep the first preserved message (typically the first user message)
    if (preserved.length > 0) {
      result.push(preserved[0]);
    }

    // Insert the summary as a user message with a clear marker
    result.push({
      role: 'user' as const,
      content: `[Context Summary] The following is a summary of the earlier conversation:\n\n${summary}\n\n---\nThe conversation continues below.`,
    });

    // Append remaining preserved messages
    for (let i = 1; i < preserved.length; i++) {
      result.push(preserved[i]);
    }

    return result;
  }

  /**
   * Get the current configuration values.
   *
   * Useful for displaying context status in the TUI.
   */
  getConfig(): {
    maxContextTokens: number;
    autoCompactThreshold: number;
    preserveRecentMessages: number;
  } {
    return {
      maxContextTokens: this.maxContextTokens,
      autoCompactThreshold: this.autoCompactThreshold,
      preserveRecentMessages: this.preserveRecentMessages,
    };
  }

  /**
   * Update the max context tokens.
   *
   * Call this when the model changes mid-session so the compaction
   * threshold adjusts to the new model's context window.
   *
   * @param tokens - The new maximum context window size.
   */
  setMaxContextTokens(tokens: number): void {
    this.maxContextTokens = tokens;
  }
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Safely read a config value without crashing if the DB is not ready.
 *
 * During early initialization the SQLite database may not yet be open.
 * This wrapper catches any error and returns `null` so the constructor
 * can fall back to provided options or built-in defaults.
 */
function getConfigSafe(key: string): any | null {
  try {
    return getConfig(key);
  } catch {
    return null;
  }
}
