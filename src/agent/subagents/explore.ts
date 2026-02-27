/**
 * Explore Subagent
 *
 * Fast codebase exploration and search. Uses read-only tools and a
 * small/fast model for efficient file discovery and content inspection.
 *
 * @module agent/subagents/explore
 */

import { Subagent, type SubagentConfig } from './base';
import { readFileTool, globTool, grepTool, listDirTool } from '../../tools/schemas/standard';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const exploreConfig: SubagentConfig = {
  name: 'explore',
  description: 'Fast codebase exploration and search. Read-only, uses a small/fast model.',
  systemPrompt: `You are a codebase explorer subagent. Your job is to search through code, find files, and report findings.

Rules:
- Search efficiently — use glob to find files, grep to search content, read_file for details
- Report your findings clearly and concisely
- Do NOT modify any files
- Do NOT spawn further subagents
- Focus on the specific question asked`,
  tools: [readFileTool, globTool, grepTool, listDirTool],
  model: 'anthropic/claude-haiku-4-5',
  maxTurns: 15,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a new explore subagent instance. */
export function createExploreSubagent(): Subagent {
  return new Subagent(exploreConfig);
}

export { exploreConfig };
