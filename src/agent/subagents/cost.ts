/**
 * Cost Analysis Subagent
 *
 * Analyzes infrastructure costs and identifies optimization opportunities.
 * Uses a small/fast model since cost analysis is largely pattern-matching
 * against resource configurations and pricing data.
 *
 * @module agent/subagents/cost
 */

import { Subagent, type SubagentConfig } from './base';
import {
  readFileTool,
  globTool,
  grepTool,
  listDirTool,
} from '../../tools/schemas/standard';
import {
  costEstimateTool,
  cloudDiscoverTool,
} from '../../tools/schemas/devops';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const costConfig: SubagentConfig = {
  name: 'cost',
  description:
    'Cost optimization specialist — analyzes infrastructure costs and suggests savings.',
  systemPrompt: `You are a cost optimization subagent. You analyze cloud infrastructure costs.

Your job:
- Read Terraform/K8s configs to understand resource sizing
- Use cost_estimate to calculate projected costs
- Use cloud_discover to find running resources
- Identify cost optimization opportunities
- Compare pricing across regions/instance types

Rules:
- Be specific with cost numbers (monthly, annual)
- Suggest concrete optimization actions
- Flag oversized or underutilized resources
- Do NOT modify any files
- Do NOT spawn further subagents`,
  tools: [
    readFileTool,
    globTool,
    grepTool,
    listDirTool,
    costEstimateTool,
    cloudDiscoverTool,
  ],
  model: 'anthropic/claude-haiku-4-5',
  maxTurns: 15,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a new cost analysis subagent instance. */
export function createCostSubagent(): Subagent {
  return new Subagent(costConfig);
}

export { costConfig };
