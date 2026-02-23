/**
 * System Prompt Builder for the Nimbus Agentic Loop
 *
 * Generates the complete system prompt that is injected as the first message
 * in every LLM conversation. The prompt tells the model who it is, what mode
 * it is operating in, which tools are available, and how to behave.
 *
 * The prompt is assembled from several composable sections:
 *
 * 1. **Base identity** -- who Nimbus is and its core behavioral rules.
 * 2. **Mode instructions** -- what the current {@link AgentMode} allows.
 * 3. **Tool-use guidelines** -- general best practices for tool invocation.
 * 4. **Available tools** -- a summarized list built from {@link ToolDefinition}s.
 * 5. **NIMBUS.md** -- optional per-project or per-user custom instructions.
 * 6. **Subagent instructions** -- constraints when running as a spawned subagent.
 * 7. **Environment context** -- working directory, platform, date, git status.
 *
 * @module agent/system-prompt
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import type { ToolDefinition } from '../tools/schemas/types';

// ---------------------------------------------------------------------------
// Agent Mode
// ---------------------------------------------------------------------------

/**
 * Agent modes that control tool availability and behavior.
 *
 * | Mode     | Description                                                |
 * | -------- | ---------------------------------------------------------- |
 * | `plan`   | Read-only exploration, analysis, and proposal generation.  |
 * | `build`  | File editing, code generation, and non-destructive DevOps. |
 * | `deploy` | Full infrastructure mutation with approval gates.          |
 */
export type AgentMode = 'plan' | 'build' | 'deploy';

/**
 * Ordered list of all agent modes from least permissive to most permissive.
 * Useful for comparison and escalation logic.
 */
export const AGENT_MODES: readonly AgentMode[] = ['plan', 'build', 'deploy'] as const;

// ---------------------------------------------------------------------------
// System Prompt Options
// ---------------------------------------------------------------------------

/**
 * Options for building the system prompt via {@link buildSystemPrompt}.
 */
export interface SystemPromptOptions {
  /** Current agent mode -- controls which actions are permitted. */
  readonly mode: AgentMode;

  /** Available tools (already filtered by mode before being passed in). */
  readonly tools: ToolDefinition[];

  /**
   * Custom instructions loaded from a `NIMBUS.md` file. When provided this
   * value is used directly; when omitted the builder will attempt to
   * discover and load the file automatically via {@link loadNimbusMd}.
   */
  readonly nimbusInstructions?: string;

  /** Current working directory. Defaults to `process.cwd()`. */
  readonly cwd?: string;

  /**
   * Active subagent name. When set, the prompt includes additional
   * constraints that prevent recursive subagent spawning and encourage
   * focused, scoped execution.
   */
  readonly activeSubagent?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the complete system prompt for the agentic loop.
 *
 * The returned string is intended to be used as the `system` message (or
 * first `user`/`system` message, depending on the LLM provider) in a
 * conversation with the model.
 *
 * @param options - Configuration that controls prompt assembly.
 * @returns The fully assembled system prompt string.
 *
 * @example
 * ```ts
 * import { buildSystemPrompt } from './system-prompt';
 *
 * const prompt = buildSystemPrompt({
 *   mode: 'build',
 *   tools: registry.getAll(),
 *   cwd: '/home/user/project',
 * });
 * ```
 */
export function buildSystemPrompt(options: SystemPromptOptions): string {
  const parts: string[] = [];

  // 1. Base identity
  parts.push(BASE_PROMPT);

  // 2. Mode-specific instructions
  parts.push(getModeInstructions(options.mode));

  // 3. Tool-use guidelines
  parts.push(TOOL_USE_GUIDELINES);

  // 4. Available tools summary
  const toolsSummary = buildToolsSummary(options.tools);
  if (toolsSummary) {
    parts.push(toolsSummary);
  }

  // 5. NIMBUS.md content (if exists)
  const nimbusContent = options.nimbusInstructions ?? loadNimbusMd(options.cwd);
  if (nimbusContent) {
    parts.push(`# Project Instructions (NIMBUS.md)\n\n${nimbusContent}`);
  }

  // 6. Subagent instructions (if applicable)
  if (options.activeSubagent) {
    parts.push(getSubagentInstructions(options.activeSubagent));
  }

  // 7. Environment context
  parts.push(buildEnvironmentContext(options.cwd));

  return parts.join('\n\n---\n\n');
}

// ---------------------------------------------------------------------------
// Prompt Fragments
// ---------------------------------------------------------------------------

/**
 * Core identity and behavioral rules that apply regardless of mode.
 * @internal
 */
const BASE_PROMPT = `You are Nimbus, an AI-powered DevOps engineering agent. You help developers build, deploy, and manage cloud infrastructure through natural conversation.

You have access to tools that let you read files, edit code, run shell commands, execute Terraform/Kubernetes/Helm operations, discover cloud resources, estimate costs, and detect infrastructure drift.

You work autonomously — reading files, making edits, running commands, and iterating until the task is complete. You use tools proactively rather than asking the user to run commands themselves.

Key behaviors:
- Read files before editing them to understand the current state
- Make precise, targeted edits rather than rewriting entire files
- Run tests after making changes to verify correctness
- Show deployment previews before executing destructive infrastructure changes
- Explain what you're doing and why at each step
- If a tool call fails, analyze the error and try a different approach`;

/**
 * General best-practice guidelines for tool invocation that are included in
 * every prompt regardless of mode.
 * @internal
 */
const TOOL_USE_GUIDELINES = `# Tool-Use Guidelines

- Use the most specific tool available. Prefer \`read_file\` over \`bash cat\`, \`glob\` over \`bash find\`, \`grep\` over \`bash grep\`.
- For file edits, use \`edit_file\` for single replacements and \`multi_edit\` for multiple replacements in the same file.
- Use \`write_file\` only for creating new files or complete rewrites.
- When running bash commands, prefer specific commands over broad ones. Avoid \`rm -rf\` or other destructive patterns.
- For infrastructure operations, always run validation (terraform validate, kubectl --dry-run) before apply.
- Use \`deploy_preview\` before any destructive infrastructure change.
- Use the \`task\` tool to spawn subagents for parallel or specialized work.
- When using \`terraform\`, always run \`terraform init\` before \`plan\` or \`apply\` if not already initialized.
- For Kubernetes operations, be namespace-aware. Default to the current namespace context.`;

// ---------------------------------------------------------------------------
// Mode Instructions
// ---------------------------------------------------------------------------

/**
 * Return the mode-specific instruction block for the given {@link AgentMode}.
 *
 * Each mode defines an explicit allow-list and deny-list so the model
 * understands the boundaries of what it can do.
 *
 * @param mode - The active agent mode.
 * @returns A markdown section describing the mode's rules.
 * @internal
 */
function getModeInstructions(mode: AgentMode): string {
  switch (mode) {
    case 'plan':
      return `# Mode: PLAN

You are in Plan mode. Your role is to analyze, explore, and propose — NOT to modify.

Allowed actions:
- Read files, search code, list directories
- Analyze infrastructure configurations
- Estimate costs and detect drift
- Propose changes and create task lists
- Fetch web content for research

NOT allowed:
- Editing or creating files
- Running destructive bash commands
- Executing terraform apply, kubectl apply, helm install
- Making any state-changing operations

Focus on understanding the codebase and infrastructure, then propose a clear action plan.`;

    case 'build':
      return `# Mode: BUILD

You are in Build mode. You can read, edit, create files, and run non-destructive commands.

Allowed actions:
- All Plan mode actions
- Edit and create files
- Run tests and linters
- Generate Terraform/K8s/Helm configurations
- Run terraform validate, terraform fmt, terraform plan
- Run kubectl get, kubectl describe, kubectl diff

NOT allowed:
- terraform apply, terraform destroy
- kubectl apply, kubectl delete
- helm install, helm upgrade, helm uninstall
- Any infrastructure-mutating operations

Focus on building and testing changes before deploying.`;

    case 'deploy':
      return `# Mode: DEPLOY

You are in Deploy mode. You have full access to all tools including infrastructure mutations.

Allowed actions:
- All Build mode actions
- terraform apply, terraform destroy
- kubectl apply, kubectl delete
- helm install, helm upgrade, helm uninstall
- Cloud resource mutations

REQUIRED:
- Always run deploy_preview before any destructive operation
- Show the user what will change before executing
- Wait for explicit approval on destructive changes

Focus on safe, verified deployments with minimal blast radius.`;
  }
}

// ---------------------------------------------------------------------------
// Tools Summary
// ---------------------------------------------------------------------------

/**
 * Build a markdown summary of the available tools from their definitions.
 *
 * Returns an empty string when the tool list is empty so callers can
 * conditionally include the section.
 *
 * @param tools - The tool definitions to summarize.
 * @returns A markdown section listing each tool, or `''` if none.
 * @internal
 */
function buildToolsSummary(tools: ToolDefinition[]): string {
  if (tools.length === 0) return '';

  const lines = tools.map((t) => `- **${t.name}**: ${t.description}`);
  return `# Available Tools (${tools.length})\n\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// NIMBUS.md Loader
// ---------------------------------------------------------------------------

/**
 * Search paths for `NIMBUS.md` files, in priority order.
 * @internal
 */
function getNimbusMdSearchPaths(cwd?: string): string[] {
  return [
    cwd ? path.join(cwd, 'NIMBUS.md') : null,
    cwd ? path.join(cwd, '.nimbus', 'NIMBUS.md') : null,
    path.join(homedir(), '.nimbus', 'NIMBUS.md'),
  ].filter(Boolean) as string[];
}

/**
 * Load `NIMBUS.md` from the project directory or the user's home directory.
 *
 * The search order is:
 * 1. `<cwd>/NIMBUS.md`
 * 2. `<cwd>/.nimbus/NIMBUS.md`
 * 3. `~/.nimbus/NIMBUS.md`
 *
 * Returns `null` if no file is found or if all candidates are inaccessible.
 *
 * @param cwd - The working directory to search from. Defaults to `undefined`
 *   (skips cwd-relative paths).
 * @returns The file contents as a string, or `null`.
 */
export function loadNimbusMd(cwd?: string): string | null {
  const searchPaths = getNimbusMdSearchPaths(cwd);

  for (const p of searchPaths) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf-8');
      }
    } catch {
      // Skip inaccessible files silently
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Subagent Instructions
// ---------------------------------------------------------------------------

/**
 * Return the instruction block appended when the agent is running as a
 * spawned subagent.
 *
 * Subagents are constrained to prevent recursive spawning and to keep
 * execution focused on a single task.
 *
 * @param agentName - The name of the active subagent.
 * @returns A markdown section with subagent-specific rules.
 * @internal
 */
function getSubagentInstructions(agentName: string): string {
  return `# Subagent Mode: ${agentName}

You are running as a subagent spawned by the primary Nimbus agent. Your task is specific and focused.
- Complete the requested task and return a clear, concise result
- Do NOT spawn further subagents (no nesting)
- Stay focused on the assigned task — do not explore tangentially
- Return your findings as structured, actionable information`;
}

// ---------------------------------------------------------------------------
// Environment Context
// ---------------------------------------------------------------------------

/**
 * Build a short environment-context block that gives the model awareness of
 * the runtime environment (working directory, platform, date, git status).
 *
 * @param cwd - The working directory. Defaults to `process.cwd()`.
 * @returns A markdown section with environment metadata.
 * @internal
 */
function buildEnvironmentContext(cwd?: string): string {
  const effectiveCwd = cwd ?? process.cwd();

  const parts = [
    '# Environment',
    `- Working directory: ${effectiveCwd}`,
    `- Platform: ${process.platform}`,
    `- Date: ${new Date().toISOString().split('T')[0]}`,
  ];

  // Check for git repo
  const gitDir = path.join(effectiveCwd, '.git');
  if (fs.existsSync(gitDir)) {
    parts.push('- Git repository: yes');
  }

  return parts.join('\n');
}
