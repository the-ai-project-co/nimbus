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

import { getTextContent, type LLMMessage } from '../llm/types';
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
  /** Max context window tokens (default: auto-detected from model, fallback 200000). */
  maxContextTokens?: number;
  /** Model identifier — used to auto-detect context window size. */
  model?: string;
  /** Threshold percentage to trigger auto-compact (0.0 - 1.0, default: 0.85). */
  autoCompactThreshold?: number;
  /** Number of recent messages to always preserve during compaction (default: 5). */
  preserveRecentMessages?: number;
  /** NIMBUS.md section keys that should always remain in context. */
  alwaysInContext?: string[];
}

// ---------------------------------------------------------------------------
// Per-Model Context Window Sizes
// ---------------------------------------------------------------------------

/**
 * Known context window sizes (in tokens) for popular models.
 *
 * When a model is not listed here, the manager falls back to the
 * `maxContextTokens` option (default: 200 000).
 */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Anthropic
  'claude-opus-4-20250514': 200_000,
  'claude-sonnet-4-20250514': 200_000,
  'claude-haiku-4-20250514': 200_000,
  'claude-3-5-sonnet-20241022': 200_000,
  'claude-3-5-haiku-20241022': 200_000,
  'claude-3-opus-20240229': 200_000,
  'claude-3-sonnet-20240229': 200_000,
  'claude-3-haiku-20240307': 200_000,

  // OpenAI
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-4': 8_192,
  'gpt-3.5-turbo': 16_385,
  o1: 200_000,
  'o1-mini': 128_000,
  'o1-preview': 128_000,
  'o3-mini': 200_000,

  // Google
  'gemini-2.0-flash-exp': 1_048_576,
  'gemini-1.5-pro': 2_097_152,
  'gemini-1.5-flash': 1_048_576,

  // Groq (Llama)
  'llama-3.1-70b-versatile': 131_072,
  'llama-3.1-8b-instant': 131_072,
  'llama-3.3-70b-versatile': 131_072,

  // DeepSeek
  'deepseek-chat': 64_000,
  'deepseek-coder': 64_000,
  'deepseek-reasoner': 64_000,

  // Local (Ollama defaults — dynamic lookup can override)
  'llama3.2': 128_000,
  mistral: 32_768,
  codellama: 16_384,
};

/**
 * Look up the context window size for a model identifier.
 *
 * Tries exact match first, then prefix match (for versioned model IDs
 * like `claude-sonnet-4-20250514`), then returns `null` if unknown.
 */
export function getModelContextWindow(model: string): number | null {
  // Exact match
  if (MODEL_CONTEXT_WINDOWS[model] !== undefined) {
    return MODEL_CONTEXT_WINDOWS[model];
  }

  // Prefix match: e.g., "gpt-4o-2024-08-06" should match "gpt-4o"
  for (const [key, value] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (model.startsWith(key)) {
      return value;
    }
  }

  return null;
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

  tokens += estimateTokens(getTextContent(message.content));

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

    // Auto-detect context window from model if provided, then options, then default
    const modelWindow = options?.model ? getModelContextWindow(options.model) : null;
    this.maxContextTokens = options?.maxContextTokens ?? modelWindow ?? 200_000;
    this.autoCompactThreshold = configThreshold ?? options?.autoCompactThreshold ?? 0.85;
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
    toolDefinitionsTokens: number
  ): boolean {
    const usage = this.calculateUsage(systemPrompt, messages, toolDefinitionsTokens);
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
    toolDefinitionsTokens: number
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

    const messagesTokens = messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);

    const total = systemPromptTokens + messagesTokens + toolDefinitionsTokens;
    const usagePercent =
      this.maxContextTokens > 0 ? Math.round((total / this.maxContextTokens) * 100) : 0;

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
        msg.role === 'tool' && i >= messages.length - this.preserveRecentMessages - 2;

      // Always preserve summary blocks (from previous compactions)
      const isSummary = getTextContent(msg.content).startsWith('[Context Summary]');

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
  buildCompactedMessages(preserved: LLMMessage[], summary: string): LLMMessage[] {
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

  /**
   * Update the context window based on a model identifier.
   *
   * Looks up the model's known context window size. If the model is
   * not in the built-in map, the current budget is left unchanged.
   *
   * @param model - The model identifier (e.g., "gpt-4o", "claude-sonnet-4-20250514").
   * @returns `true` if the budget was updated, `false` if model is unknown.
   */
  setModel(model: string): boolean {
    // Strip provider prefix (e.g., "openai/gpt-4o" → "gpt-4o")
    const stripped = model.includes('/') ? model.split('/').slice(1).join('/') : model;
    const window = getModelContextWindow(stripped);
    if (window !== null) {
      this.maxContextTokens = window;
      return true;
    }
    return false;
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
