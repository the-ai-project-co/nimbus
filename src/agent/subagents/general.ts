/**
 * General-Purpose Research Subagent
 *
 * Broad-access subagent with code search, shell commands, and web fetch
 * capabilities. Suitable for open-ended research tasks that do not fit
 * neatly into a specialized category.
 *
 * @module agent/subagents/general
 */

import { Subagent, type SubagentConfig } from './base';
import {
  readFileTool,
  globTool,
  grepTool,
  listDirTool,
  bashTool,
  webfetchTool,
} from '../../tools/schemas/standard';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const generalConfig: SubagentConfig = {
  name: 'general',
  description: 'General-purpose research agent with broad tool access.',
  systemPrompt: `You are a general-purpose research subagent. You can search code, run commands, and fetch web content.

Your job:
- Answer questions by searching the codebase and running commands
- Research topics by fetching web content
- Provide thorough, well-documented answers

Rules:
- Be thorough but efficient
- Cite sources (file paths, URLs) for all findings
- Run non-destructive commands only
- Do NOT spawn further subagents`,
  tools: [readFileTool, globTool, grepTool, listDirTool, bashTool, webfetchTool],
  model: 'anthropic/claude-sonnet-4-20250514',
  maxTurns: 20,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a new general-purpose research subagent instance. */
export function createGeneralSubagent(): Subagent {
  return new Subagent(generalConfig);
}

export { generalConfig };
