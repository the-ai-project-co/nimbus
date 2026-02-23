/**
 * Three-Mode System for the Nimbus CLI Agent
 *
 * Controls which tools are available in each operating mode, enforcing a
 * progressive trust model:
 *
 * | Mode     | Surface area                                              |
 * | -------- | --------------------------------------------------------- |
 * | `plan`   | Read-only: file reads, search, discovery, cost, drift     |
 * | `build`  | Plan + editing, bash, git, non-destructive DevOps         |
 * | `deploy` | All tools -- destructive ops still gated by permissions    |
 *
 * Switching modes resets the {@link PermissionSessionState} so that
 * previously approved ask-once tools require re-approval in the new mode.
 *
 * @module agent/modes
 */

import type { ToolDefinition } from '../tools/schemas/types';
import { standardTools } from '../tools/schemas/standard';
import { devopsTools } from '../tools/schemas/devops';
import { createPermissionState, type PermissionSessionState } from './permissions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The three operating modes, ordered from least permissive to most
 * permissive.
 *
 * - `plan`   -- Read-only exploration, analysis, and proposal generation.
 * - `build`  -- File editing, code generation, and non-destructive DevOps.
 * - `deploy` -- Full infrastructure mutation with approval gates.
 */
export type Mode = 'plan' | 'build' | 'deploy';

/**
 * Static configuration for a single operating mode.
 *
 * Each mode defines a human-readable label, a description for display in
 * the CLI status bar, a set of allowed tool names, and an addendum to the
 * system prompt that reinforces the mode's constraints to the LLM.
 */
export interface ModeConfig {
  /** The mode identifier. */
  readonly name: Mode;

  /** Human-readable label for UI display (e.g. "Plan", "Build", "Deploy"). */
  readonly label: string;

  /** Short description of the mode's purpose and constraints. */
  readonly description: string;

  /**
   * The set of tool names permitted in this mode. Tools whose names are not
   * in this set will be filtered out by {@link getToolsForMode} and rejected
   * by {@link isToolAllowedInMode}.
   */
  readonly allowedToolNames: ReadonlySet<string>;

  /**
   * Additional system prompt text injected when this mode is active.
   * Reinforces mode constraints to the LLM so it does not attempt to use
   * tools outside its allowed set.
   */
  readonly systemPromptAddition: string;
}

/**
 * Runtime state that tracks the current mode and its associated permission
 * session. Returned by {@link createModeState} and {@link switchMode}.
 */
export interface ModeState {
  /** The currently active mode. */
  readonly current: Mode;

  /**
   * Permission session tracking for the current mode. Cleared on every
   * mode switch so that ask-once approvals do not carry across modes.
   */
  readonly permissionState: PermissionSessionState;
}

// ---------------------------------------------------------------------------
// Tool Name Sets
// ---------------------------------------------------------------------------

/**
 * Tools available in Plan mode (read-only).
 *
 * These tools cannot modify files, infrastructure, or any external state.
 * @internal
 */
const PLAN_TOOL_NAMES: ReadonlySet<string> = new Set([
  'read_file',
  'glob',
  'grep',
  'list_dir',
  'webfetch',
  'cost_estimate',
  'drift_detect',
  'todo_read',
  'todo_write',
  'cloud_discover',
]);

/**
 * Tools available in Build mode (Plan tools + editing and non-destructive
 * DevOps).
 *
 * Build mode adds file mutation, shell access, git, subagent spawning,
 * and deploy previews. DevOps tools like `terraform`, `kubectl`, and
 * `helm` are included at the tool level, but their destructive subcommands
 * (apply, delete, install, etc.) are gated by the permission engine in
 * {@link ../agent/permissions}.
 *
 * @internal
 */
const BUILD_TOOL_NAMES: ReadonlySet<string> = new Set([
  // All Plan tools
  ...PLAN_TOOL_NAMES,
  // Standard editing tools
  'edit_file',
  'multi_edit',
  'write_file',
  'bash',
  // DevOps non-destructive tools
  'git',
  'task',
  'deploy_preview',
  // Included but restricted to non-destructive subcommands by permissions:
  //   terraform: validate, fmt, plan only
  //   kubectl:   get, describe only
  //   helm:      list, status, template only
  'terraform',
  'kubectl',
  'helm',
]);

/**
 * Tools available in Deploy mode (all tools).
 *
 * Deploy mode grants access to every registered tool. Destructive
 * operations still go through the permission engine and require explicit
 * user approval.
 *
 * @internal
 */
const DEPLOY_TOOL_NAMES: ReadonlySet<string> = new Set([
  ...standardTools.map((t) => t.name),
  ...devopsTools.map((t) => t.name),
]);

// ---------------------------------------------------------------------------
// Mode Configurations
// ---------------------------------------------------------------------------

/**
 * Configuration for Plan mode.
 *
 * Plan mode is strictly read-only. The agent can explore the codebase,
 * analyze infrastructure, estimate costs, and detect drift, but it cannot
 * modify any files or execute any state-changing operations.
 */
export const PLAN_MODE: ModeConfig = {
  name: 'plan',
  label: 'Plan',
  description:
    'Read-only exploration and analysis. No file edits, no infrastructure changes.',
  allowedToolNames: PLAN_TOOL_NAMES,
  systemPromptAddition: `You are in PLAN mode. You may only use read-only tools: read_file, glob, grep, list_dir, webfetch, cost_estimate, drift_detect, todo_read, todo_write, cloud_discover.

DO NOT attempt to:
- Edit, create, or delete files
- Run shell commands that modify state
- Execute terraform apply/destroy, kubectl apply/delete, or helm install/upgrade
- Spawn subagents that perform mutations

Focus on understanding the current state, analyzing configurations, estimating costs, detecting drift, and proposing a clear action plan.`,
} as const;

/**
 * Configuration for Build mode.
 *
 * Build mode extends Plan with file editing, shell access, git operations,
 * and non-destructive DevOps commands. The agent can generate Terraform
 * configurations, write Kubernetes manifests, and validate them, but it
 * cannot apply changes to live infrastructure.
 */
export const BUILD_MODE: ModeConfig = {
  name: 'build',
  label: 'Build',
  description:
    'File editing and non-destructive DevOps. No infrastructure mutations.',
  allowedToolNames: BUILD_TOOL_NAMES,
  systemPromptAddition: `You are in BUILD mode. You may read, edit, and create files, run non-destructive commands, and use git.

Additional tools beyond Plan mode: edit_file, multi_edit, write_file, bash, git, task, deploy_preview, terraform (validate/fmt/plan only), kubectl (get/describe only), helm (list/status/template only).

DO NOT attempt to:
- terraform apply or terraform destroy
- kubectl apply or kubectl delete
- helm install, helm upgrade, or helm uninstall
- Any operation that mutates live infrastructure

Focus on building, testing, and validating changes. Use deploy_preview to show what would happen before switching to Deploy mode.`,
} as const;

/**
 * Configuration for Deploy mode.
 *
 * Deploy mode grants access to all tools including infrastructure-mutating
 * operations. Destructive operations still require explicit user approval
 * through the permission engine -- this mode merely makes the tools
 * available for the agent to invoke.
 */
export const DEPLOY_MODE: ModeConfig = {
  name: 'deploy',
  label: 'Deploy',
  description:
    'Full access including infrastructure mutations. Destructive ops require approval.',
  allowedToolNames: DEPLOY_TOOL_NAMES,
  systemPromptAddition: `You are in DEPLOY mode. You have access to ALL tools including infrastructure-mutating operations.

REQUIRED before any destructive operation:
1. Run deploy_preview to show the blast radius
2. Clearly explain what will be created, modified, or destroyed
3. Wait for explicit user approval before executing

Available destructive operations: terraform apply/destroy, kubectl apply/delete, helm install/upgrade/uninstall.

Focus on safe, verified deployments. Always validate before applying. Prefer incremental changes over large-scale mutations.`,
} as const;

/**
 * Lookup map from {@link Mode} to its corresponding {@link ModeConfig}.
 *
 * Use this when you need to access mode configuration by mode name:
 * ```ts
 * const config = MODE_CONFIGS['build'];
 * console.log(config.label); // "Build"
 * ```
 */
export const MODE_CONFIGS: Readonly<Record<Mode, ModeConfig>> = {
  plan: PLAN_MODE,
  build: BUILD_MODE,
  deploy: DEPLOY_MODE,
} as const;

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * All tools from both the standard and DevOps registries, computed once
 * at module load time so that {@link getToolsForMode} does not re-allocate
 * on every call.
 *
 * @internal
 */
const ALL_TOOLS: readonly ToolDefinition[] = [...standardTools, ...devopsTools];

/**
 * Get the {@link ToolDefinition}s available for a specific mode.
 *
 * Filters the combined standard and DevOps tool arrays against the mode's
 * {@link ModeConfig.allowedToolNames} set.
 *
 * @param mode - The mode to retrieve tools for.
 * @returns An array of tool definitions allowed in the given mode.
 *
 * @example
 * ```ts
 * const planTools = getToolsForMode('plan');
 * console.log(planTools.map(t => t.name));
 * // ['read_file', 'glob', 'grep', 'list_dir', 'webfetch',
 * //  'cost_estimate', 'drift_detect', 'todo_read', 'todo_write',
 * //  'cloud_discover']
 * ```
 */
export function getToolsForMode(mode: Mode): ToolDefinition[] {
  const config = MODE_CONFIGS[mode];
  return ALL_TOOLS.filter((tool) => config.allowedToolNames.has(tool.name));
}

/**
 * Get the next mode in the cycle: plan -> build -> deploy -> plan.
 *
 * Useful for implementing a mode toggle shortcut in the CLI (e.g.,
 * pressing Tab to cycle through modes).
 *
 * @param current - The currently active mode.
 * @returns The next mode in the cycle.
 *
 * @example
 * ```ts
 * cycleMode('plan');   // 'build'
 * cycleMode('build');  // 'deploy'
 * cycleMode('deploy'); // 'plan'
 * ```
 */
export function cycleMode(current: Mode): Mode {
  const modes = getModes();
  const index = modes.indexOf(current);
  return modes[(index + 1) % modes.length];
}

/**
 * Get all modes in order from least permissive to most permissive.
 *
 * @returns An array of all three modes: `['plan', 'build', 'deploy']`.
 */
export function getModes(): Mode[] {
  return ['plan', 'build', 'deploy'];
}

/**
 * Create a new {@link ModeState} with the specified initial mode.
 *
 * The permission state is initialized fresh via {@link createPermissionState}.
 *
 * @param initialMode - The mode to start in. Defaults to `'plan'`.
 * @returns A new mode state object.
 *
 * @example
 * ```ts
 * const state = createModeState();
 * console.log(state.current); // 'plan'
 *
 * const buildState = createModeState('build');
 * console.log(buildState.current); // 'build'
 * ```
 */
export function createModeState(initialMode: Mode = 'plan'): ModeState {
  return {
    current: initialMode,
    permissionState: createPermissionState(),
  };
}

/**
 * Switch to a new mode, returning a fresh {@link ModeState}.
 *
 * The permission session state is reset so that previously approved
 * ask-once tools require re-approval in the new mode. This prevents
 * an escalation scenario where a tool approved in Plan mode (where it
 * is harmless) automatically carries approval into Deploy mode (where
 * it could be destructive).
 *
 * @param state   - The current mode state.
 * @param newMode - The mode to switch to.
 * @returns A new mode state with the updated mode and a fresh permission
 *   session.
 *
 * @example
 * ```ts
 * let state = createModeState('plan');
 * state = switchMode(state, 'build');
 * console.log(state.current); // 'build'
 * console.log(state.permissionState.approvedTools.size); // 0
 * ```
 */
export function switchMode(state: ModeState, newMode: Mode): ModeState {
  return {
    current: newMode,
    permissionState: createPermissionState(),
  };
}

/**
 * Check whether a specific tool is allowed in the given mode.
 *
 * This is a convenience wrapper around looking up the mode's
 * {@link ModeConfig.allowedToolNames} set. It does NOT check the
 * permission engine -- only mode-level availability.
 *
 * @param toolName - The tool name to check (e.g. `'terraform'`).
 * @param mode     - The mode to check against.
 * @returns `true` if the tool is available in the mode, `false` otherwise.
 *
 * @example
 * ```ts
 * isToolAllowedInMode('read_file', 'plan');    // true
 * isToolAllowedInMode('edit_file', 'plan');     // false
 * isToolAllowedInMode('edit_file', 'build');    // true
 * isToolAllowedInMode('terraform', 'deploy');   // true
 * ```
 */
export function isToolAllowedInMode(toolName: string, mode: Mode): boolean {
  return MODE_CONFIGS[mode].allowedToolNames.has(toolName);
}

/**
 * Get the human-readable display label for a mode.
 *
 * @param mode - The mode to get the label for.
 * @returns The label string (e.g. `"Plan"`, `"Build"`, `"Deploy"`).
 */
export function getModeLabel(mode: Mode): string {
  return MODE_CONFIGS[mode].label;
}

/**
 * Get the ANSI-compatible color name associated with a mode for UI display.
 *
 * The color scheme uses a traffic-light metaphor:
 * - `plan`   -> `'blue'`   (informational, read-only)
 * - `build`  -> `'yellow'` (caution, editing)
 * - `deploy` -> `'red'`    (danger, infrastructure mutations)
 *
 * @param mode - The mode to get the color for.
 * @returns A color name string suitable for use with chalk, ink, or
 *   similar terminal coloring libraries.
 *
 * @example
 * ```ts
 * import chalk from 'chalk';
 *
 * const color = getModeColor('deploy'); // 'red'
 * console.log(chalk[color](`[${getModeLabel('deploy')}]`));
 * // Prints "[Deploy]" in red
 * ```
 */
export function getModeColor(mode: Mode): string {
  const colors: Readonly<Record<Mode, string>> = {
    plan: 'blue',
    build: 'yellow',
    deploy: 'red',
  };
  return colors[mode];
}
