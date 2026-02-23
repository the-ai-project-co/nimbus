/**
 * Compaction Agent
 *
 * Uses a fast LLM model (haiku) to summarize earlier conversation context
 * while preserving key information needed for continuity.
 *
 * The compaction agent is invoked automatically by the context manager
 * when the conversation exceeds the configured threshold, or manually
 * by the user via a `/compact` command in the TUI.
 *
 * Key design decisions:
 * - Uses the cheapest available model (haiku alias) to minimize cost.
 * - Truncates very long tool outputs before sending to the summarizer.
 * - Falls back to a simple extractive summary if the LLM call fails.
 * - Preserves all technical details, file paths, and decisions.
 *
 * @module agent/compaction-agent
 */

import type { LLMRouter } from '../llm/router';
import type { LLMMessage } from '../llm/types';
import { ContextManager, estimateTokens } from './context-manager';
import type { CompactionResult } from './context-manager';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

/** Options for running compaction. */
export interface CompactionOptions {
  /** LLM Router instance for making summary calls. */
  router: LLMRouter;
  /** Optional focus area for the summary (e.g. "terraform changes"). */
  focusArea?: string;
  /** Model to use for compaction (default: haiku). */
  model?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The system prompt given to the compaction model. */
const COMPACTION_SYSTEM_PROMPT = `You are a conversation summarizer for the Nimbus CLI agent. Your job is to create a concise summary of a conversation between a user and an AI assistant that helps with cloud infrastructure and DevOps tasks.

Rules:
1. Preserve ALL important technical details: file paths, resource names, configuration values, error messages, decisions made.
2. Preserve the user's original intent and any requirements they specified.
3. Preserve the current state of any ongoing work (what was done, what remains).
4. Remove conversational filler, repeated information, and verbose tool outputs.
5. Use bullet points for clarity.
6. Keep the summary under 2000 tokens.
7. Structure the summary as:
   - **User's Goal**: What the user is trying to accomplish
   - **Key Decisions**: Important choices that were made
   - **Work Completed**: What actions were taken and their results
   - **Current State**: Where things stand now
   - **Pending Items**: What still needs to be done (if any)`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the compaction agent to summarize a set of messages.
 *
 * Splits the conversation into messages to preserve and messages to
 * summarize (using the context manager's selection logic), sends the
 * latter to a fast LLM for summarization, then reassembles a compacted
 * message array.
 *
 * @param messages - The full conversation message array.
 * @param contextManager - The context manager instance (provides selection logic).
 * @param options - Compaction options (router, model, focus area).
 * @returns The compacted messages and a result summary.
 */
export async function runCompaction(
  messages: LLMMessage[],
  contextManager: ContextManager,
  options: CompactionOptions,
): Promise<{ messages: LLMMessage[]; result: CompactionResult }> {
  const { preserved, toSummarize } =
    contextManager.selectPreservedMessages(messages);

  // Nothing to summarize -- return early
  if (toSummarize.length === 0) {
    const totalTokens = messages.reduce(
      (sum, m) =>
        sum + estimateTokens(typeof m.content === 'string' ? m.content : ''),
      0,
    );
    return {
      messages,
      result: {
        originalTokens: totalTokens,
        compactedTokens: totalTokens,
        savedTokens: 0,
        summaryPreserved: false,
      },
    };
  }

  // Format messages for the summarizer
  const conversationText = formatMessagesForSummary(toSummarize);
  const originalTokens = estimateTokens(conversationText);

  // Build the user prompt for the summarizer
  let userPrompt = `Please summarize the following conversation between a user and the Nimbus AI assistant:\n\n${conversationText}`;
  if (options.focusArea) {
    userPrompt += `\n\nPay special attention to: ${options.focusArea}`;
  }

  // Call the LLM for summarization using a fast, cheap model
  const model = options.model ?? 'haiku';
  let summary: string;

  try {
    const response = await options.router.route({
      messages: [
        { role: 'system', content: COMPACTION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      model,
      maxTokens: 2048,
    });
    summary = response.content;
  } catch {
    // If LLM call fails, fall back to a simple extractive summary
    summary = fallbackSummary(toSummarize);
  }

  // Reassemble the compacted message array
  const compactedMessages = contextManager.buildCompactedMessages(
    preserved,
    summary,
  );
  const compactedTokens = compactedMessages.reduce(
    (sum, m) =>
      sum + estimateTokens(typeof m.content === 'string' ? m.content : ''),
    0,
  );

  return {
    messages: compactedMessages,
    result: {
      originalTokens,
      compactedTokens,
      savedTokens: originalTokens - estimateTokens(summary),
      summaryPreserved: true,
    },
  };
}

/**
 * Run manual compaction from a `/compact` command.
 *
 * Creates a temporary context manager with default settings and
 * delegates to {@link runCompaction}.
 *
 * @param messages - The full conversation message array.
 * @param options - Compaction options plus an optional max token override.
 * @returns The compacted messages and a result summary.
 */
export async function runManualCompaction(
  messages: LLMMessage[],
  options: CompactionOptions & { maxContextTokens?: number },
): Promise<{ messages: LLMMessage[]; result: CompactionResult }> {
  const contextManager = new ContextManager({
    maxContextTokens: options.maxContextTokens,
    preserveRecentMessages: 5,
  });
  return runCompaction(messages, contextManager, options);
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Format messages into a readable conversation transcript.
 *
 * Each message is labelled with its role. Very long tool outputs are
 * truncated to avoid overwhelming the summarizer model. Tool call
 * metadata is included inline for context.
 */
function formatMessagesForSummary(messages: LLMMessage[]): string {
  const parts: string[] = [];

  for (const msg of messages) {
    const role =
      msg.role === 'user'
        ? 'User'
        : msg.role === 'assistant'
          ? 'Assistant'
          : 'Tool';
    const content =
      typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content);

    // Truncate very long tool outputs to keep summarizer input manageable
    const truncated =
      content.length > 2000
        ? content.slice(0, 2000) + '... [truncated]'
        : content;

    parts.push(`[${role}]: ${truncated}`);

    // Include tool call info if present
    if (msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        parts.push(
          `  [Tool Call: ${tc.function.name}(${tc.function.arguments.slice(0, 200)})]`,
        );
      }
    }
  }

  return parts.join('\n\n');
}

/**
 * Fallback summary when the LLM is unavailable.
 *
 * Produces a simple extractive summary by listing message counts
 * and the first few user messages. This is better than nothing when
 * the compaction model cannot be reached.
 */
function fallbackSummary(messages: LLMMessage[]): string {
  const userMessages = messages.filter((m) => m.role === 'user');
  const assistantMessages = messages.filter((m) => m.role === 'assistant');

  const parts: string[] = ['**Conversation Summary (auto-generated)**\n'];
  parts.push(
    `- ${userMessages.length} user messages and ${assistantMessages.length} assistant responses`,
  );

  // Extract key topics from user messages
  for (const msg of userMessages.slice(0, 5)) {
    const content = typeof msg.content === 'string' ? msg.content : '';
    if (content.length > 0) {
      parts.push(
        `- User asked: "${content.slice(0, 150)}${content.length > 150 ? '...' : ''}"`,
      );
    }
  }

  return parts.join('\n');
}
