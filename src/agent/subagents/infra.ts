/**
 * Infrastructure Analysis Subagent
 *
 * Reads IaC files, discovers cloud resources, detects drift, and estimates
 * costs. Uses a mid-tier model for deeper reasoning on infrastructure
 * configurations.
 *
 * @module agent/subagents/infra
 */

import { Subagent, type SubagentConfig } from './base';
import {
  readFileTool,
  globTool,
  grepTool,
  listDirTool,
} from '../../tools/schemas/standard';
import {
  cloudDiscoverTool,
  costEstimateTool,
  driftDetectTool,
} from '../../tools/schemas/devops';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const infraConfig: SubagentConfig = {
  name: 'infra',
  description:
    'Infrastructure analysis — reads IaC files, discovers cloud resources, detects drift, estimates costs.',
  systemPrompt: `You are an infrastructure analysis subagent. You specialize in cloud infrastructure.

Your capabilities:
- Read Terraform, Kubernetes, and Helm configuration files
- Discover cloud resources (AWS, GCP, Azure)
- Detect infrastructure drift
- Estimate costs

Rules:
- Analyze thoroughly but efficiently
- Report findings with specific file paths and line numbers
- Flag any security concerns or misconfigurations
- Do NOT make changes — analysis only
- Do NOT spawn further subagents`,
  tools: [
    readFileTool,
    globTool,
    grepTool,
    listDirTool,
    cloudDiscoverTool,
    costEstimateTool,
    driftDetectTool,
  ],
  model: 'anthropic/claude-sonnet-4-20250514',
  maxTurns: 20,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a new infrastructure analysis subagent instance. */
export function createInfraSubagent(): Subagent {
  return new Subagent(infraConfig);
}

export { infraConfig };
