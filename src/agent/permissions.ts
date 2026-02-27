/**
 * Permission Engine
 *
 * 4-tier permission system that controls tool execution:
 * - Tier 1 (auto_allow): Reads, validates — no prompt needed
 * - Tier 2 (ask_once): Edits, non-destructive bash — ask once per session
 * - Tier 3 (always_ask): terraform apply, kubectl delete — always prompt
 * - Tier 4 (blocked): rm -rf /, DROP DATABASE — never allow
 *
 * The engine evaluates permissions in the following precedence order:
 *   1. User config overrides (`~/.nimbus/config.yaml`)
 *   2. Tool-specific pattern matching (bash, kubectl, terraform, helm)
 *   3. The tool's declared {@link PermissionTier}
 *
 * Session-level state tracks which tools have been approved via "ask once",
 * so users are not repeatedly prompted for the same non-destructive tool
 * within a single session.
 *
 * @module agent/permissions
 */

import type { ToolDefinition, PermissionTier } from '../tools/schemas/types';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

/** Result of a permission check. */
export type PermissionDecision = 'allow' | 'ask' | 'block';

/** Full context passed to a permission check. */
export interface PermissionContext {
  /** The tool being invoked. */
  tool: ToolDefinition;
  /** The parsed input arguments. */
  input: unknown;
  /** Session-level state for ask-once tracking. */
  sessionState: PermissionSessionState;
}

/** Tracks which tools have been approved in the current session. */
export interface PermissionSessionState {
  /** Tools that have been approved for the session (ask-once). */
  approvedTools: Set<string>;
  /** Specific tool+action combos that have been approved. */
  approvedActions: Set<string>;
}

/**
 * User permission configuration (loaded from `~/.nimbus/config.yaml`).
 *
 * Allows operators to tighten or loosen defaults without modifying code.
 */
export interface PermissionConfig {
  /** Override permission tier for specific tools. */
  toolOverrides?: Record<string, PermissionTier>;
  /** Bash commands that are auto-allowed (glob patterns). */
  autoAllowBashPatterns?: string[];
  /** Bash commands that are always blocked (glob patterns). */
  blockedBashPatterns?: string[];
  /** K8s namespaces that require always-ask. */
  protectedNamespaces?: string[];
}

// ---------------------------------------------------------------------------
// Blocked patterns -- these are NEVER allowed (Tier 4)
// ---------------------------------------------------------------------------

/** @internal */
const BLOCKED_BASH_PATTERNS: readonly RegExp[] = [
  /rm\s+(-[a-zA-Z]*)?r[a-zA-Z]*f[a-zA-Z]*\s+\//, // rm -rf /
  /rm\s+(-[a-zA-Z]*)?f[a-zA-Z]*r[a-zA-Z]*\s+\//, // rm -fr /
  /rm\s+-[a-zA-Z]*\s+\/\s*$/, // rm -* / (root)
  /DROP\s+DATABASE/i,
  /DROP\s+TABLE/i,
  /TRUNCATE\s+TABLE/i,
  /FORMAT\s+C:/i,
  /mkfs\./,
  /dd\s+if=.*of=\/dev\//,
  />\s*\/dev\/sd[a-z]/,
  /chmod\s+-R\s+777\s+\//,
  /chown\s+-R.*\s+\//,
  /:(){ :\|:& };:/, // fork bomb
];

// ---------------------------------------------------------------------------
// Always-ask patterns (Tier 3)
// ---------------------------------------------------------------------------

/** @internal */
const ALWAYS_ASK_BASH_PATTERNS: readonly RegExp[] = [
  /git\s+push\s+.*--force/,
  /git\s+push\s+-f/,
  /git\s+reset\s+--hard/,
  /git\s+clean\s+-f/,
  /npm\s+publish/,
  /docker\s+rm/,
  /docker\s+rmi/,
  /docker\s+system\s+prune/,
  /kubectl\s+delete/,
  /terraform\s+destroy/,
  /terraform\s+apply/,
  /helm\s+uninstall/,
  /curl.*\|\s*(bash|sh)/, // pipe to shell
  /wget.*\|\s*(bash|sh)/,
];

// ---------------------------------------------------------------------------
// Auto-allow patterns (Tier 1)
// ---------------------------------------------------------------------------

/** @internal */
const AUTO_ALLOW_BASH_PATTERNS: readonly RegExp[] = [
  /^(ls|pwd|echo|cat|head|tail|wc|which|whoami|hostname|date|uname)/,
  /^(node|bun|deno|python|python3|ruby|go)\s+--version/,
  /^(npm|yarn|pnpm|bun)\s+(test|lint|format|check|run\s+test)/,
  /^(npm|yarn|pnpm|bun)\s+install/,
  /^git\s+(status|log|diff|branch|remote|show|tag)/,
  /^terraform\s+(validate|fmt|version|providers|show|output)/,
  /^kubectl\s+(get|describe|logs|version|config)/,
  /^helm\s+(list|version|status|show|template|lint)/,
  /^grep\s/,
  /^find\s/,
  /^rg\s/,
];

// ---------------------------------------------------------------------------
// Protected K8s namespaces
// ---------------------------------------------------------------------------

/** @internal */
const DEFAULT_PROTECTED_NAMESPACES: ReadonlySet<string> = new Set([
  'production',
  'prod',
  'kube-system',
  'kube-public',
  'istio-system',
  'cert-manager',
  'monitoring',
]);

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a fresh permission session state.
 *
 * Call this once when a new interactive session begins. The returned object
 * is mutated in-place by {@link approveForSession} and
 * {@link approveActionForSession}.
 *
 * @returns A new, empty {@link PermissionSessionState}.
 */
export function createPermissionState(): PermissionSessionState {
  return {
    approvedTools: new Set(),
    approvedActions: new Set(),
  };
}

// ---------------------------------------------------------------------------
// Core Permission Check
// ---------------------------------------------------------------------------

/**
 * Check whether a tool invocation should be allowed, prompted, or blocked.
 *
 * Evaluation order:
 *   1. User-level tool overrides from {@link PermissionConfig.toolOverrides}.
 *   2. Tool-specific pattern matching for `bash`, `kubectl`, `terraform`,
 *      and `helm` tools.
 *   3. The tool's declared {@link ToolDefinition.permissionTier}.
 *
 * @param tool         - The tool definition.
 * @param input        - The parsed tool input.
 * @param sessionState - Session-level tracking for ask-once decisions.
 * @param config       - Optional user permission config overrides.
 * @returns A {@link PermissionDecision} indicating the action to take.
 */
export function checkPermission(
  tool: ToolDefinition,
  input: unknown,
  sessionState: PermissionSessionState,
  config?: PermissionConfig
): PermissionDecision {
  // 1. Check user overrides first
  if (config?.toolOverrides?.[tool.name]) {
    const overrideTier = config.toolOverrides[tool.name];
    return tierToDecision(overrideTier, tool, sessionState);
  }

  // 2. Special handling for bash commands
  if (tool.name === 'bash' && input && typeof input === 'object' && 'command' in input) {
    const command = (input as { command: string }).command;
    return checkBashPermission(command, sessionState, config);
  }

  // 3. Special handling for kubectl with namespace awareness
  if (tool.name === 'kubectl' && input && typeof input === 'object') {
    const kubectlInput = input as { action?: string; namespace?: string };
    return checkKubectlPermission(kubectlInput, sessionState, config);
  }

  // 4. Special handling for terraform actions
  if (tool.name === 'terraform' && input && typeof input === 'object') {
    const tfInput = input as { action?: string };
    return checkTerraformPermission(tfInput, sessionState);
  }

  // 5. Special handling for helm actions
  if (tool.name === 'helm' && input && typeof input === 'object') {
    const helmInput = input as { action?: string };
    return checkHelmPermission(helmInput, sessionState);
  }

  // 6. Default: use the tool's declared permission tier
  return tierToDecision(tool.permissionTier, tool, sessionState);
}

// ---------------------------------------------------------------------------
// Session Approval
// ---------------------------------------------------------------------------

/**
 * Record that the user approved a tool for the remainder of the session.
 *
 * After calling this, subsequent {@link checkPermission} calls for the
 * same tool with an `ask_once` tier will return `'allow'` instead of
 * `'ask'`.
 *
 * @param tool         - The tool that was approved.
 * @param sessionState - The session state to mutate.
 */
export function approveForSession(
  tool: ToolDefinition,
  sessionState: PermissionSessionState
): void {
  sessionState.approvedTools.add(tool.name);
}

/**
 * Record that the user approved a specific tool+action combination
 * for the remainder of the session.
 *
 * This is more granular than {@link approveForSession} and is used for
 * tools like `kubectl` and `terraform` where some actions (e.g. `get`)
 * are safe but others (e.g. `apply`) require continued prompting.
 *
 * @param toolName     - The tool name (e.g. `'kubectl'`).
 * @param action       - The action subcommand (e.g. `'apply'`).
 * @param sessionState - The session state to mutate.
 */
export function approveActionForSession(
  toolName: string,
  action: string,
  sessionState: PermissionSessionState
): void {
  sessionState.approvedActions.add(`${toolName}:${action}`);
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Map a {@link PermissionTier} to a {@link PermissionDecision}, taking
 * session state into account for the `ask_once` tier.
 *
 * @internal
 */
function tierToDecision(
  tier: PermissionTier,
  tool: ToolDefinition,
  sessionState: PermissionSessionState
): PermissionDecision {
  switch (tier) {
    case 'auto_allow':
      return 'allow';
    case 'ask_once':
      return sessionState.approvedTools.has(tool.name) ? 'allow' : 'ask';
    case 'always_ask':
      return 'ask';
    case 'blocked':
      return 'block';
  }
}

/**
 * Evaluate bash command permission against the three pattern tiers and
 * optional user config.
 *
 * @internal
 */
function checkBashPermission(
  command: string,
  sessionState: PermissionSessionState,
  config?: PermissionConfig
): PermissionDecision {
  const trimmed = command.trim();

  // --- Tier 4: blocked ---
  for (const pattern of BLOCKED_BASH_PATTERNS) {
    if (pattern.test(trimmed)) {
      return 'block';
    }
  }
  if (config?.blockedBashPatterns) {
    for (const glob of config.blockedBashPatterns) {
      if (new RegExp(globToRegex(glob)).test(trimmed)) {
        return 'block';
      }
    }
  }

  // --- Tier 3: always ask ---
  for (const pattern of ALWAYS_ASK_BASH_PATTERNS) {
    if (pattern.test(trimmed)) {
      return 'ask';
    }
  }

  // --- Tier 1: auto allow ---
  for (const pattern of AUTO_ALLOW_BASH_PATTERNS) {
    if (pattern.test(trimmed)) {
      return 'allow';
    }
  }
  if (config?.autoAllowBashPatterns) {
    for (const glob of config.autoAllowBashPatterns) {
      if (new RegExp(globToRegex(glob)).test(trimmed)) {
        return 'allow';
      }
    }
  }

  // --- Tier 2 (default for bash): ask once ---
  return sessionState.approvedTools.has('bash') ? 'allow' : 'ask';
}

/**
 * Evaluate kubectl permission with namespace awareness.
 *
 * Read-only actions (`get`, `describe`, `logs`) are always allowed.
 * Destructive actions in protected namespaces always prompt.
 * Destructive actions in non-protected namespaces use ask-once semantics.
 *
 * @internal
 */
function checkKubectlPermission(
  input: { action?: string; namespace?: string },
  sessionState: PermissionSessionState,
  config?: PermissionConfig
): PermissionDecision {
  const protectedNs: ReadonlySet<string> = config?.protectedNamespaces
    ? new Set(config.protectedNamespaces)
    : DEFAULT_PROTECTED_NAMESPACES;

  // Read-only actions are auto-allowed
  const readOnlyActions: ReadonlySet<string> = new Set(['get', 'describe', 'logs']);
  if (input.action && readOnlyActions.has(input.action)) {
    return 'allow';
  }

  // Destructive actions in protected namespaces -> always ask
  const destructiveActions: ReadonlySet<string> = new Set([
    'delete',
    'apply',
    'scale',
    'rollout',
    'exec',
  ]);
  if (input.action && destructiveActions.has(input.action)) {
    if (input.namespace && protectedNs.has(input.namespace)) {
      return 'ask'; // always ask for protected namespaces
    }
    // Non-protected namespace: ask once per action
    const key = `kubectl:${input.action}`;
    return sessionState.approvedActions.has(key) ? 'allow' : 'ask';
  }

  // Unknown kubectl action -> ask
  return 'ask';
}

/**
 * Evaluate terraform permission based on the subcommand.
 *
 * Read-only actions (`validate`, `fmt`, `show`, etc.) are auto-allowed.
 * Planning actions (`init`, `plan`, `state`) use ask-once semantics.
 * Mutating actions (`apply`, `destroy`, `import`) always prompt.
 *
 * @internal
 */
function checkTerraformPermission(
  input: { action?: string },
  sessionState: PermissionSessionState
): PermissionDecision {
  const readOnlyActions: ReadonlySet<string> = new Set([
    'validate',
    'fmt',
    'show',
    'output',
    'providers',
    'version',
  ]);
  if (input.action && readOnlyActions.has(input.action)) {
    return 'allow';
  }

  const planLike: ReadonlySet<string> = new Set(['init', 'plan', 'state']);
  if (input.action && planLike.has(input.action)) {
    const key = `terraform:${input.action}`;
    return sessionState.approvedActions.has(key) ? 'allow' : 'ask';
  }

  // apply, destroy, import -> always ask
  return 'ask';
}

/**
 * Evaluate helm permission based on the subcommand.
 *
 * Read-only actions (`list`, `status`, `show`, etc.) are auto-allowed.
 * Mutating actions (`install`, `upgrade`, `uninstall`, `rollback`)
 * always prompt.
 *
 * @internal
 */
function checkHelmPermission(
  input: { action?: string },
  _sessionState: PermissionSessionState
): PermissionDecision {
  const readOnlyActions: ReadonlySet<string> = new Set([
    'list',
    'status',
    'show',
    'template',
    'lint',
    'version',
  ]);
  if (input.action && readOnlyActions.has(input.action)) {
    return 'allow';
  }

  // install, upgrade, uninstall, rollback -> always ask
  return 'ask';
}

/**
 * Convert a simple glob pattern to a regex string.
 *
 * Supports `*` (any sequence of characters) and `?` (single character).
 * All other regex-significant characters are escaped.
 *
 * @param glob - The glob pattern to convert.
 * @returns A regex source string (without delimiters).
 *
 * @internal
 */
function globToRegex(glob: string): string {
  return glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex special chars
    .replace(/\*/g, '.*') // * -> .*
    .replace(/\?/g, '.'); // ? -> .
}
