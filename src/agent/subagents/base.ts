/**
 * Base Subagent
 *
 * Provides the foundation for specialized subagents. Each subagent runs
 * with its own isolated conversation, restricted tool set, and permissions.
 * Subagents cannot spawn further subagents (no nesting).
 *
 * @module agent/subagents/base
 */

import type { LLMRouter } from '../../llm/router';
import { ToolRegistry, type ToolDefinition } from '../../tools/schemas/types';
import { runAgentLoop, type AgentLoopResult } from '../loop';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

/** Configuration for a specialized subagent. */
export interface SubagentConfig {
  /** Unique name for this subagent type. */
  name: string;

  /** Description shown to the parent agent when selecting a subagent. */
  description: string;

  /** System prompt specific to this subagent. */
  systemPrompt: string;

  /** Tools available to this subagent. */
  tools: ToolDefinition[];

  /** Model to use (e.g. `'anthropic/claude-haiku-4-5'` for fast/cheap). */
  model: string;

  /** Maximum turns for subagent execution. */
  maxTurns: number;
}

/** Result returned after a subagent completes execution. */
export interface SubagentResult {
  /** The final text output from the subagent. */
  output: string;

  /** Number of LLM turns taken. */
  turns: number;

  /** Total tokens used across all turns. */
  totalTokens: number;

  /** Whether the subagent was interrupted before completion. */
  interrupted: boolean;
}

// ---------------------------------------------------------------------------
// Subagent Class
// ---------------------------------------------------------------------------

/**
 * Base class for all Nimbus subagents.
 *
 * A subagent is a lightweight, scoped agent that runs within the parent
 * agent's process. It has its own conversation history, tool registry,
 * and system prompt, but shares the parent's LLM router.
 *
 * Subagents are intentionally prevented from spawning further subagents
 * by filtering out the `task` tool from their registry.
 */
export class Subagent {
  readonly config: SubagentConfig;

  constructor(config: SubagentConfig) {
    this.config = config;
  }

  /**
   * Run the subagent with a given prompt.
   *
   * Creates an isolated tool registry (excluding the `task` tool to
   * prevent nesting), then delegates to {@link runAgentLoop} with the
   * subagent's own system prompt, model, and turn limit.
   *
   * @param prompt - The task description for the subagent.
   * @param router - The shared LLM router instance.
   * @returns The subagent's final output, turn count, token usage, and
   *   whether it was interrupted.
   */
  async run(prompt: string, router: LLMRouter): Promise<SubagentResult> {
    // Create isolated tool registry (no task tool -- prevent nesting)
    const registry = new ToolRegistry();
    for (const tool of this.config.tools) {
      if (tool.name !== 'task') {
        registry.register(tool);
      }
    }

    const result: AgentLoopResult = await runAgentLoop(prompt, [], {
      router,
      toolRegistry: registry,
      mode: 'plan', // Subagents default to plan mode (read-only unless configured otherwise)
      maxTurns: this.config.maxTurns,
      model: this.config.model,
      nimbusInstructions: this.config.systemPrompt,
    });

    // Extract the final assistant message
    const lastAssistant = [...result.messages].reverse().find(m => m.role === 'assistant');

    return {
      output: (lastAssistant?.content as string) ?? '(no output)',
      turns: result.turns,
      totalTokens: result.usage.totalTokens,
      interrupted: result.interrupted,
    };
  }
}
