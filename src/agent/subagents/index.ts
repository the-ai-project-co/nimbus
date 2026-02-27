/**
 * Subagent System -- Barrel Re-exports
 *
 * Central entry point for the Nimbus subagent system. Provides factory
 * functions for each specialized subagent, a type-safe factory by name,
 * and a parser for the `@agent` mention syntax.
 *
 * @module agent/subagents
 */

// ---------------------------------------------------------------------------
// Named Re-exports
// ---------------------------------------------------------------------------

export { Subagent, type SubagentConfig, type SubagentResult } from './base';
export { createExploreSubagent, exploreConfig } from './explore';
export { createInfraSubagent, infraConfig } from './infra';
export { createSecuritySubagent, securityConfig } from './security';
export { createCostSubagent, costConfig } from './cost';
export { createGeneralSubagent, generalConfig } from './general';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

import type { Subagent } from './base';
import { createExploreSubagent } from './explore';
import { createInfraSubagent } from './infra';
import { createSecuritySubagent } from './security';
import { createCostSubagent } from './cost';
import { createGeneralSubagent } from './general';

/** Union of all built-in subagent type identifiers. */
export type SubagentType = 'explore' | 'infra' | 'security' | 'cost' | 'general';

/**
 * Create a subagent by type name.
 *
 * Uses an exhaustive switch so that adding a new {@link SubagentType}
 * variant without a corresponding case produces a compile-time error.
 *
 * @param type - The subagent specialization to instantiate.
 * @returns A configured {@link Subagent} instance.
 *
 * @example
 * ```ts
 * const agent = createSubagent('explore');
 * const result = await agent.run('Find all TODO comments', router);
 * ```
 */
export function createSubagent(type: SubagentType): Subagent {
  switch (type) {
    case 'explore':
      return createExploreSubagent();
    case 'infra':
      return createInfraSubagent();
    case 'security':
      return createSecuritySubagent();
    case 'cost':
      return createCostSubagent();
    case 'general':
      return createGeneralSubagent();
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown subagent type: ${_exhaustive}`);
    }
  }
}

// ---------------------------------------------------------------------------
// @agent Mention Parser
// ---------------------------------------------------------------------------

/**
 * Parse `@agent` syntax from user input.
 *
 * Returns an object with the matched agent type and the remaining prompt
 * if the input starts with a recognized `@<agent>` prefix, or `null` if
 * the input does not match the pattern.
 *
 * @param input - Raw user input string.
 * @returns Parsed agent mention, or `null` if no match.
 *
 * @example
 * ```ts
 * parseAgentMention('@explore find all TODO comments');
 * // => { agent: 'explore', prompt: 'find all TODO comments' }
 *
 * parseAgentMention('@infra check EKS autoscaling');
 * // => { agent: 'infra', prompt: 'check EKS autoscaling' }
 *
 * parseAgentMention('normal message');
 * // => null
 * ```
 */
export function parseAgentMention(input: string): { agent: SubagentType; prompt: string } | null {
  const match = input.match(/^@(explore|infra|security|cost|general)\s+(.+)$/s);
  if (!match) {
    return null;
  }
  return { agent: match[1] as SubagentType, prompt: match[2] };
}
