/**
 * Core Agentic Loop
 *
 * Implements the autonomous agent loop:
 * 1. Build context (system prompt + history + tools)
 * 2. Send to LLM with tools enabled
 * 3. Stream text response
 * 4. If tool_use: check permissions → execute → collect results
 * 5. Append messages → loop back to LLM
 * 6. Exit when LLM returns end_turn (no more tool calls)
 *
 * This is the heart of the Nimbus agent. Every user message enters
 * {@link runAgentLoop}, which orchestrates a multi-turn conversation with
 * the LLM, executing tools on its behalf until it signals completion by
 * returning a response with no further tool calls.
 *
 * @module agent/loop
 */

import { join } from 'node:path';
import type { LLMRouter } from '../llm/router';
import type {
  LLMMessage,
  ToolCall,
  ToolCompletionRequest,
  ToolDefinition as LLMToolDefinition,
} from '../llm/types';
import {
  toOpenAITool,
  type ToolDefinition,
  type ToolExecuteContext,
  type ToolResult,
  type ToolRegistry,
} from '../tools/schemas/types';
import { buildSystemPrompt, type AgentMode } from './system-prompt';
import type { ContextManager, CompactionResult } from './context-manager';
import { runCompaction } from './compaction-agent';
import type { LSPManager } from '../lsp/manager';
import { SnapshotManager } from '../snapshots/manager';
import { calculateCost } from '../llm/cost-calculator';
import {
  HookEngine,
  runPreToolHooks,
  runPostToolHooks,
  type HookContext,
} from '../hooks/engine';
import { maskSecrets } from '../audit/security-scanner';
import { classifyTaskComplexity, routeModel } from '../llm/router';
import { mkdirSync as _cpMkdirSync, writeFileSync as _cpWriteFileSync } from 'node:fs';
import { homedir as _cpHomedir } from 'node:os';

// ---------------------------------------------------------------------------
// C2: Infra state checkpoint helper
// ---------------------------------------------------------------------------

/**
 * Write a checkpoint JSON file to ~/.nimbus/infra-checkpoints/<timestamp>.json
 * before a mutating terraform or helm operation. Non-blocking — errors are swallowed.
 */
function writeInfraCheckpoint(tool: string, action: string, input: Record<string, unknown>): void {
  try {
    const checkpointsDir = join(_cpHomedir(), '.nimbus', 'infra-checkpoints');
    _cpMkdirSync(checkpointsDir, { recursive: true });
    // Sanitize: remove any field that looks like a secret
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      const lower = k.toLowerCase();
      if (lower.includes('secret') || lower.includes('password') || lower.includes('token') || lower.includes('key')) {
        sanitized[k] = '[redacted]';
      } else {
        sanitized[k] = v;
      }
    }
    const timestamp = new Date().toISOString();
    const checkpoint = {
      timestamp,
      tool,
      action,
      input: sanitized,
      cwd: process.cwd(),
      workdir: (input.workdir as string | undefined) ?? undefined,
    };
    const fileName = timestamp.replace(/[:.]/g, '-') + '.json';
    _cpWriteFileSync(
      join(checkpointsDir, fileName),
      JSON.stringify(checkpoint, null, 2),
      'utf-8'
    );
  } catch { /* non-critical */ }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Module-level compiled regex constants for classifyDevOpsError (PERF-1d).
// Hoisted here so they compile once at module load rather than per-call.
// ---------------------------------------------------------------------------

const _RE_CREDENTIAL_EXPIRY_AWS = /ExpiredTokenException|TokenExpiredException|token.*has.*expired/i;
const _RE_CREDENTIAL_EXPIRY_GCP = /credentials.*expired|Application Default Credentials.*expired|re-authenticate/i;
const _RE_CREDENTIAL_EXPIRY_AZURE = /AADSTS70008|InteractionRequired|credential.*expired/i;
const _RE_CMD_NOT_FOUND = /command not found|not found|no such file or directory/i;

/**
 * Classify a DevOps tool error and return an actionable hint for the LLM.
 * Returns null for unrecognized errors so we don't pollute the context.
 */
function classifyDevOpsError(toolName: string, errorOutput: string, nimbusInstructions?: string): string | null {
  const e = errorOutput.toLowerCase();

  // GAP-13: Credential expiry patterns — must come first for fast matching
  const CREDENTIAL_EXPIRY = [
    { re: _RE_CREDENTIAL_EXPIRY_AWS, provider: 'aws' },
    { re: _RE_CREDENTIAL_EXPIRY_GCP, provider: 'gcp' },
    { re: _RE_CREDENTIAL_EXPIRY_AZURE, provider: 'azure' },
  ];
  for (const { re, provider } of CREDENTIAL_EXPIRY) {
    if (re.test(errorOutput)) {
      return `Your ${provider.toUpperCase()} credentials have expired.\n\nRun: \`nimbus auth-refresh --provider ${provider}\` to refresh them.`;
    }
  }

  // G3: "command not found" — provide installation hints for DevOps CLIs
  const INSTALL_HINTS: Record<string, string> = {
    terraform: 'brew install terraform  OR  https://developer.hashicorp.com/terraform/install',
    kubectl:   'brew install kubectl    OR  https://kubernetes.io/docs/tasks/tools/',
    helm:      'brew install helm       OR  https://helm.sh/docs/intro/install/',
    docker:    'brew install --cask docker  OR  https://docs.docker.com/get-docker/',
    aws:       'brew install awscli     OR  pip install awscli',
    gcloud:    'brew install --cask google-cloud-sdk',
    az:        'brew install azure-cli',
  };
  if (_RE_CMD_NOT_FOUND.test(errorOutput)) {
    for (const [cmd, hint] of Object.entries(INSTALL_HINTS)) {
      if (toolName.includes(cmd) || e.includes(`'${cmd}'`) || e.includes(`"${cmd}"`)) {
        return `\`${cmd}\` is not installed.\n\nInstall: ${hint}`;
      }
    }
  }

  // Terraform errors
  if (toolName === 'terraform' || e.includes('terraform')) {
    if (e.includes('no such file or directory') && e.includes('.terraform')) {
      return 'HINT: Run `terraform init` first — the .terraform directory is missing.';
    }
    if (e.includes('provider') && e.includes('required') && e.includes('terraform')) {
      return 'HINT: Run `terraform init -upgrade` to download or upgrade required providers.';
    }
    if (e.includes('no valid credential') || e.includes('no credentials')) {
      return 'HINT: AWS/cloud credentials are missing. Check `aws configure` or environment variables.';
    }
    if (e.includes('state lock') || e.includes('lock file')) {
      return 'HINT: Terraform state is locked. If no other operation is running, use `terraform force-unlock <lock-id>`.';
    }
    if (e.includes('module not installed') || e.includes('module source')) {
      return 'HINT: Run `terraform init` to install required modules.';
    }
    if (e.includes('quota') || e.includes('limit exceeded') || e.includes('vcpu')) {
      return 'HINT: Cloud resource quota exceeded. Request a limit increase in the cloud console.';
    }
  }

  // Kubernetes errors
  if (toolName === 'kubectl' || toolName === 'kubectl_context') {
    if (e.includes('connection refused') || e.includes('unable to connect')) {
      return 'HINT: Cannot reach the Kubernetes API server. Check `kubectl config current-context` and ensure the cluster is accessible.';
    }
    if (e.includes('unauthorized') || e.includes('forbidden')) {
      return 'HINT: Insufficient permissions. Check your kubeconfig credentials or RBAC roles.';
    }
    if (e.includes('not found') && e.includes('namespace')) {
      return 'HINT: The namespace does not exist. Create it with `kubectl create namespace <name>` first.';
    }
    if (e.includes('image') && (e.includes('not found') || e.includes('pull'))) {
      return 'HINT: Container image pull failed. Verify the image name, tag, and registry credentials (imagePullSecret).';
    }
  }

  // Helm errors
  if (toolName === 'helm' || toolName === 'helm_values') {
    if (e.includes('chart not found') || e.includes('no such chart')) {
      return 'HINT: Chart not found. Run `helm repo update` and verify the chart name.';
    }
    if (e.includes('release not found')) {
      return 'HINT: Helm release not found. Use `helm list -A` to see all releases across namespaces.';
    }
    if (e.includes('unable to build kubernetes objects') || e.includes('manifest')) {
      return 'HINT: Helm template rendering failed. Run `helm template <release> <chart>` to debug the manifests.';
    }
  }

  // Cloud CLI errors
  if (toolName === 'cloud_discover' || toolName === 'cloud_action') {
    if (e.includes('not authorized') || e.includes('access denied') || e.includes('unauthorized')) {
      return 'HINT: Cloud credentials lack required permissions. Check IAM policies/roles for the operation.';
    }
    if (e.includes('region') && e.includes('not found')) {
      return 'HINT: Invalid region. Check `aws configure get region` or pass --region explicitly.';
    }
  }

  // Docker errors
  if (toolName === 'docker') {
    if (e.includes('cannot connect to the docker daemon') || e.includes('docker daemon') || e.includes('docker.sock')) {
      return 'HINT: Docker daemon is not running. Start it with `colima start` (macOS) or `sudo systemctl start docker` (Linux).';
    }
    if (e.includes('manifest unknown') || e.includes('manifest not found') || e.includes('not found')) {
      return 'HINT: Image not found. Verify the image name and tag. Check registry credentials with `docker login`.';
    }
    if (e.includes('no space left on device') || e.includes('no space left')) {
      return 'HINT: Docker disk space exhausted. Run `docker system prune -f` to reclaim space.';
    }
    if (e.includes('permission denied') && e.includes('docker')) {
      return 'HINT: Docker permission denied. Add your user to the docker group: `sudo usermod -aG docker $USER`.';
    }
  }

  // Secrets errors
  if (toolName === 'secrets') {
    if (e.includes('permission denied') || e.includes('403') || e.includes('accessdenied')) {
      return 'HINT: Secrets access denied. Check Vault policy with `vault policy read <policy>` or IAM role permissions.';
    }
    if (e.includes('secret not found') || e.includes('no such secret') || e.includes('resourcenotfoundexception')) {
      return 'HINT: Secret not found. Verify the secret path/name and namespace. Use `vault kv list <mount>` to browse.';
    }
    if (e.includes('invalid token') || e.includes('token expired')) {
      return 'HINT: Vault/cloud token expired. Run `vault login` or refresh cloud credentials with `nimbus auth-refresh`.';
    }
  }

  // CI/CD errors
  if (toolName === 'cicd') {
    if (e.includes('workflow not found') || e.includes('could not find workflow')) {
      return 'HINT: Workflow not found. Check the workflow filename in .github/workflows/ and the branch name.';
    }
    if (e.includes('rate limit') || e.includes('429') || e.includes('too many requests')) {
      return 'HINT: API rate limited. Wait 60 seconds and retry. Check rate limit headers for reset time.';
    }
    if (e.includes('unauthorized') || e.includes('401') || e.includes('bad credentials')) {
      return 'HINT: CI/CD authentication failed. Check GITHUB_TOKEN, GITLAB_TOKEN, or CIRCLECI_TOKEN environment variables.';
    }
  }

  // GitOps errors
  if (toolName === 'gitops') {
    if (e.includes('not found') || e.includes('not logged in') || e.includes('unauthenticated')) {
      return 'HINT: ArgoCD/Flux not accessible. Check ARGOCD_SERVER and ARGOCD_TOKEN env vars, or run `argocd login`.';
    }
    if (e.includes('comparisonerror') || e.includes('sync error')) {
      return 'HINT: GitOps sync error. Validate manifests: `kubectl apply --dry-run=client -f <manifest>` to find issues.';
    }
    if (e.includes('health') && e.includes('degraded')) {
      return 'HINT: Application is degraded. Check pod logs with `kubectl logs -n <ns>` and events with `kubectl get events -n <ns>`.';
    }
  }

  // Monitoring errors
  if (toolName === 'monitor') {
    if (e.includes('connection refused') || e.includes('could not connect')) {
      return 'HINT: Cannot connect to monitoring endpoint. Check PROMETHEUS_URL, GRAFANA_URL, or cloud region configuration.';
    }
    if (e.includes('unauthorized') || e.includes('403')) {
      return 'HINT: Monitoring authentication failed. Check DD_API_KEY, GRAFANA_TOKEN, or NEW_RELIC_API_KEY environment variables.';
    }
  }

  // L3: Parse NIMBUS.md custom error hints section
  if (nimbusInstructions) {
    const hintsMatch = nimbusInstructions.match(/##\s*Custom Error Hints\s*\n([\s\S]*?)(?=\n##|\n$|$)/i);
    if (hintsMatch) {
      const hintsSection = hintsMatch[1];
      const hintLines = hintsSection.split('\n').filter(l => l.trim().startsWith('-'));
      for (const line of hintLines) {
        // Format: "- pattern: hint message"
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const pattern = line.slice(1, colonIdx).trim();
          const hint = line.slice(colonIdx + 1).trim();
          if (pattern && hint && errorOutput.toLowerCase().includes(pattern.toLowerCase())) {
            return `HINT: ${hint}`;
          }
        }
      }
    }
  }

  return null;
}

/** DevOps tool names that get self-diagnosis hints on unrecognized errors. */
const DEVOPS_TOOL_NAMES = new Set([
  'terraform', 'kubectl', 'kubectl_context', 'helm', 'helm_values',
  'bash', 'cloud_discover', 'drift_detect', 'deploy_preview',
  'docker', 'secrets', 'cicd', 'monitor', 'gitops', 'cloud_action',
  'logs', 'certs', 'mesh', 'cfn', 'k8s_rbac',
]);

/**
 * Format a Zod (or generic) tool-input validation error into a human-readable
 * message that tells the LLM exactly which fields are wrong and how to fix them.
 */
function formatToolInputError(toolName: string, err: unknown): string {
  if (err && typeof err === 'object' && 'issues' in err) {
    // ZodError
    const issues = (err as { issues: Array<{ path: (string | number)[]; message: string }> }).issues;
    const details = issues
      .map(i => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    return `Tool "${toolName}" received invalid input:\n${details}\n\nPlease correct the arguments and retry.`;
  }
  return `Tool "${toolName}" failed: ${err instanceof Error ? err.message : String(err)}`;
}

/** Determine whether a streaming error is transient and worth retrying. */
function isRetryableStreamError(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const status =
      (typeof e.status === 'number' ? e.status : undefined) ??
      (typeof e.statusCode === 'number' ? e.statusCode : undefined);
    if (status === 429 || (status !== undefined && status >= 500 && status < 600)) return true;
    const msg = typeof e.message === 'string' ? e.message : '';
    if (/rate.?limit|429|too many requests|overloaded|503/i.test(msg)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// G3: Runaway protection helpers
// ---------------------------------------------------------------------------

/** Patterns that indicate a destructive operation in tool arguments. */
const DESTRUCTIVE_PATTERNS = /\b(apply|destroy|delete|terminate|stop|remove|drop|truncate|purge)\b/i;

/** Tool names whose destructive operations should be counted at the session level. */
const DESTRUCTIVE_TOOL_NAMES = new Set([
  'terraform', 'kubectl', 'docker', 'aws', 'gcloud', 'az', 'cloud_action', 'cfn',
]);

/**
 * Returns true if the tool call looks like a destructive infrastructure operation.
 * Used to enforce the session-level destructive ops counter (G3).
 */
function isDestructiveOp(toolName: string, inputStr: string): boolean {
  return DESTRUCTIVE_TOOL_NAMES.has(toolName) && DESTRUCTIVE_PATTERNS.test(inputStr);
}

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

/** Options for running the agent loop. */
export interface AgentLoopOptions {
  /** The LLM router instance. */
  router: LLMRouter;

  /** Tool registry with available tools. */
  toolRegistry: ToolRegistry;

  /** Agent mode (plan/build/deploy). */
  mode: AgentMode;

  /** Maximum number of LLM turns before stopping (default: 50). */
  maxTurns?: number;

  /**
   * Maximum number of tool calls allowed in a single LLM turn (G3).
   * Prevents runaway tool call loops. Default: 20.
   */
  maxToolCallsPerTurn?: number;

  /**
   * Maximum number of destructive operations allowed in a single session (G3).
   * Triggers a warning in the tool result when the threshold is reached. Default: 5.
   */
  maxDestructiveOpsPerSession?: number;

  /** Model to use (e.g. `'anthropic/claude-sonnet-4-20250514'`). */
  model?: string;

  /**
   * When true, enables automatic model routing based on task complexity (Gap 18).
   * Simple queries → haiku, complex → opus, moderate → sonnet.
   * Overridden if `model` is explicitly set.
   */
  autoRouteModel?: boolean;

  /** Current working directory. */
  cwd?: string;

  /** Custom NIMBUS.md content injected into the system prompt. */
  nimbusInstructions?: string;

  /**
   * Live infrastructure context (terraform workspace, kubectl context, etc.)
   * discovered at startup. Injected into the system prompt (Gaps 7 & 10).
   */
  infraContext?: {
    terraformWorkspace?: string;
    kubectlContext?: string;
    helmReleases?: string[];
    awsAccount?: string;
    awsRegion?: string;
    gcpProject?: string;
  };

  /** Callback for streaming text output. */
  onText?: (text: string) => void;

  /** Callback when a tool call starts. */
  onToolCallStart?: (toolCall: ToolCallInfo) => void;

  /** Callback when a tool call completes. */
  onToolCallEnd?: (toolCall: ToolCallInfo, result: ToolResult) => void;

  /**
   * Callback fired for each chunk of streamed tool output (Gap 1 — live streaming).
   * Called with the tool call ID and the chunk text.
   */
  onToolOutputChunk?: (toolId: string, chunk: string) => void;

  /**
   * Callback to check permission before tool execution.
   * If omitted, all tools are executed without prompting.
   */
  checkPermission?: (tool: ToolDefinition, input: unknown) => Promise<PermissionDecision>;

  /** AbortSignal for cancellation (Ctrl+C). */
  signal?: AbortSignal;

  /** Session ID for persistence (reserved for future use). */
  sessionId?: string;

  /** Optional context manager for auto-compact. When provided, the loop
   *  checks context usage after each tool-call turn and triggers
   *  compaction if the threshold is exceeded. */
  contextManager?: ContextManager;

  /** Callback fired when auto-compact is triggered. Receives the
   *  compaction result with token savings information. */
  onCompact?: (result: CompactionResult) => void;

  /** Optional LSP manager for post-edit diagnostics. When provided,
   *  the loop queries the language server after file-editing tools
   *  and appends any diagnostics to the tool result so the LLM can
   *  self-correct type errors and other issues. */
  lspManager?: LSPManager;

  /** Optional snapshot manager for auto-capture before file-editing tools.
   *  When provided, a snapshot is captured before each file-modifying tool
   *  call so users can undo/redo changes. */
  snapshotManager?: SnapshotManager;

  /** Optional hook engine for PreToolUse/PostToolUse/PermissionRequest hooks.
   *  When provided, matching hook scripts are executed around each tool call. */
  hookEngine?: HookEngine;

  /** Callback fired after each LLM turn with accumulated usage and cost.
   *  Allows the TUI to update cost/token display in real-time during
   *  multi-turn agent loops, not just at the end. */
  onUsage?: (usage: AgentLoopUsage, costUSD: number) => void;

  /**
   * Optional callback to show a diff preview before file-mutating tools.
   * If provided, the loop calls this before edit_file/multi_edit/write_file.
   * Returning 'reject' skips the tool call; 'apply-all' disables further prompts.
   */
  requestFileDiff?: (
    path: string,
    toolName: string,
    diff: string
  ) => Promise<FileDiffDecision>;

  /**
   * Internal flag set by requestFileDiff 'apply-all' — skips remaining diff
   * prompts for the current turn. Set externally by the TUI launcher.
   */
  skipRemainingDiffPrompts?: boolean;

  /**
   * Internal flag set by requestFileDiff 'reject-all' — auto-rejects remaining
   * diff prompts for the current turn. Set externally by the TUI launcher.
   */
  rejectRemainingDiffPrompts?: boolean;

  /**
   * M1: Dry-run mode — when true, forces plan mode and prepends a hard
   * constraint to the system prompt instructing the agent not to execute
   * any mutating operations.
   */
  dryRun?: boolean;

  /**
   * G16: Maximum cost in USD per session. If the cumulative LLM cost exceeds
   * this threshold, the loop stops and returns a budget-exceeded message.
   */
  costBudgetUSD?: number;

  /**
   * G21: Override the stream silence timeout in milliseconds.
   * Defaults to config.agentTurnTimeoutSeconds * 1000, or 60_000 if not set.
   */
  streamSilenceTimeoutMs?: number;

  /**
   * GAP-20: Per-tool timeout overrides from NIMBUS.md Tool Timeouts section.
   * Maps tool name to timeout in milliseconds. When set, the value is threaded
   * into the tool's ToolExecuteContext so it can override the built-in default.
   */
  toolTimeouts?: Record<string, number>;
}

/** Information about a tool call in progress. */
export interface ToolCallInfo {
  /** Provider-assigned unique ID for this tool call. */
  id: string;

  /** Tool name as it appears in the registry. */
  name: string;

  /** Parsed input arguments. */
  input: unknown;

  /** Unix timestamp (Date.now()) when the tool call started. */
  startTime: number;
}

/**
 * Result of a permission check.
 *
 * - `allow` -- proceed with execution.
 * - `deny`  -- skip this invocation and report denial to the LLM.
 * - `block` -- skip and report that the tool is permanently blocked.
 */
export type PermissionDecision = 'allow' | 'deny' | 'block';

/**
 * Result of a per-file diff approval request.
 *
 * - `apply`     -- apply this change.
 * - `reject`    -- skip this change.
 * - `apply-all` -- apply this and all remaining changes without further prompts.
 */
export type FileDiffDecision = 'apply' | 'reject' | 'apply-all' | 'reject-all';

/** Aggregate token usage across all LLM turns. */
export interface AgentLoopUsage {
  /** Total prompt (input) tokens consumed. */
  promptTokens: number;

  /** Total completion (output) tokens consumed. */
  completionTokens: number;

  /** Sum of prompt + completion tokens. */
  totalTokens: number;
}

/** Result of running the agent loop. */
export interface AgentLoopResult {
  /** The conversation messages after the loop completes. */
  messages: LLMMessage[];

  /** Number of LLM turns taken. */
  turns: number;

  /** Whether the loop was interrupted via the AbortSignal. */
  interrupted: boolean;

  /** Total token usage across all turns. */
  usage: AgentLoopUsage;

  /** Total estimated cost in USD. */
  totalCost: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default model when none is specified. */
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-20250514';

// ---------------------------------------------------------------------------
// H5: Cost delta hint after terraform apply / helm upgrade
// ---------------------------------------------------------------------------

/**
 * Extract a lightweight cost hint from tool output for display after
 * infrastructure operations (terraform apply, helm install/upgrade).
 */
function extractCostHintFromToolOutput(toolName: string, input: Record<string, unknown>, output: string): string | null {
  // terraform apply: parse "Apply complete! Resources: N added, M changed, K destroyed."
  if (toolName === 'terraform' && String(input.action) === 'apply') {
    const m = output.match(/Resources:\s*(\d+) added,\s*(\d+) changed,\s*(\d+) destroyed/);
    if (m) {
      const added = Number(m[1]);
      const changed = Number(m[2]);
      const destroyed = Number(m[3]);
      const parts: string[] = [];
      if (added > 0) parts.push(`+${added} resources created`);
      if (changed > 0) parts.push(`${changed} updated`);
      if (destroyed > 0) parts.push(`${destroyed} destroyed`);
      return parts.length > 0
        ? `${parts.join(', ')} — run "nimbus cost" for monthly cost estimate`
        : null;
    }
  }
  // helm install/upgrade
  if (toolName === 'helm' && ['install', 'upgrade'].includes(String(input.action))) {
    const releaseName = String(input.releaseName ?? input.release ?? '');
    if (!output.includes('Error') && !output.includes('FAILED')) {
      return `Helm release "${releaseName}" deployed — run "nimbus cost" for estimated cost impact`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// M4: Session-scoped error tracking for NIMBUS.md persistence
// ---------------------------------------------------------------------------

const sessionErrorCounts = new Map<string, number>();

function trackAndPersistError(toolName: string, errorHint: string, cwd: string): void {
  const key = `${toolName}:${errorHint.slice(0, 60)}`;
  const count = (sessionErrorCounts.get(key) ?? 0) + 1;
  sessionErrorCounts.set(key, count);

  if (count === 3) {
    try {
      const { existsSync, readFileSync, writeFileSync, appendFileSync } = require('node:fs') as typeof import('node:fs');
      const { join } = require('node:path') as typeof import('node:path');
      const nimbusPath = join(cwd, 'NIMBUS.md');
      if (!existsSync(nimbusPath)) return;
      const existing = readFileSync(nimbusPath, 'utf-8');
      if (existing.includes(errorHint.slice(0, 40))) return; // already recorded
      const entry = `- ${toolName}: ${errorHint}\n`;
      if (existing.includes('## Observed Issues')) {
        writeFileSync(nimbusPath, existing.replace('## Observed Issues\n', `## Observed Issues\n${entry}`));
      } else {
        appendFileSync(nimbusPath, `\n## Observed Issues\n${entry}`);
      }
    } catch { /* non-critical */ }
  }
}

// ---------------------------------------------------------------------------
// M6: Destructive action guard — force confirmation before terraform destroy / kubectl delete
// ---------------------------------------------------------------------------

function isDestructiveAction(toolName: string, input: Record<string, unknown>): string | null {
  const action = String(input.action ?? input.command ?? '');
  if (toolName === 'terraform' && action === 'destroy') {
    return 'terraform destroy will PERMANENTLY DELETE all managed infrastructure. Explicitly confirm with the user before proceeding.';
  }
  if (toolName === 'kubectl' && action === 'delete') {
    const resource = String(input.resource ?? '');
    return `kubectl delete ${resource} is IRREVERSIBLE. Explicitly confirm with the user before proceeding.`;
  }
  if (toolName === 'helm' && action === 'uninstall') {
    return 'helm uninstall will remove the release and its resources. Explicitly confirm with the user before proceeding.';
  }
  return null;
}

/**
 * Session-scoped terraform plan cache.
 * Maps workdir → { output, timestamp } so that within one agent session,
 * a plan result can be reused for the apply call without re-running tf plan.
 * Cache expires after 10 minutes.
 */
interface TerraformPlanCacheEntry {
  output: string;
  workdir: string;
  timestamp: number;
}

const PLAN_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const terraformPlanCache = new Map<string, TerraformPlanCacheEntry>();

/** Store a terraform plan output for a workdir. */
function cacheTerraformPlan(workdir: string, output: string): void {
  terraformPlanCache.set(workdir, { output, workdir, timestamp: Date.now() });
}

/** Retrieve a cached terraform plan for a workdir, or null if expired/missing. */
function getCachedTerraformPlan(workdir: string): string | null {
  const entry = terraformPlanCache.get(workdir);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > PLAN_CACHE_TTL_MS) {
    terraformPlanCache.delete(workdir);
    return null;
  }
  return entry.output;
}

/**
 * Background interval that evicts expired terraform plan cache entries every 60s.
 * `.unref()` ensures this does not prevent the process from exiting.
 * Exported for test teardown.
 */
export const _planCacheCleanupInterval: ReturnType<typeof setInterval> = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of terraformPlanCache) {
    if (now - entry.timestamp > PLAN_CACHE_TTL_MS) {
      terraformPlanCache.delete(key);
    }
  }
}, 60_000).unref();

/** Default max output tokens per LLM call. */
const DEFAULT_MAX_TOKENS = 8192;

/** Default maximum number of agent turns. */
const DEFAULT_MAX_TURNS = 50;

/** Maximum characters of tool output to include in conversation history.
 *  Anything beyond this is truncated to prevent context window overflow. */
const MAX_TOOL_OUTPUT_CHARS = 100_000;

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Run the agentic loop.
 *
 * Takes a user message and existing conversation history, then runs
 * the LLM in a loop until it stops requesting tool calls.
 *
 * The loop terminates when any of the following conditions are met:
 * - The LLM returns a response with no tool calls (natural end).
 * - The maximum number of turns is reached.
 * - The AbortSignal fires (e.g. user presses Ctrl+C).
 * - An unrecoverable LLM API error occurs.
 *
 * @param userMessage - The new user message to process.
 * @param history - Prior conversation messages (may be empty for a fresh session).
 * @param options - Configuration for the loop.
 * @returns The final conversation state, turn count, usage, and cost.
 */
export async function runAgentLoop(
  userMessage: string,
  history: LLMMessage[],
  options: AgentLoopOptions
): Promise<AgentLoopResult> {
  const {
    router,
    toolRegistry,
    mode,
    maxTurns = DEFAULT_MAX_TURNS,
    model,
    cwd,
    nimbusInstructions,
    onText,
    onToolCallStart,
    onToolCallEnd,
    onToolOutputChunk,
    checkPermission,
    signal,
  } = options;

  // -----------------------------------------------------------------------
  // 1. Prepare tools and system prompt
  // -----------------------------------------------------------------------

  const tools = getToolsForMode(toolRegistry.getAll(), mode);

  // H3: Auto-discover infra context if not provided and cwd is set (best-effort, cached per cwd)
  let resolvedInfraContext = options.infraContext;
  if (!resolvedInfraContext && cwd) {
    try {
      const { discoverInfraContext } = await import('../cli/init');
      resolvedInfraContext = await Promise.race([
        discoverInfraContext(cwd),
        new Promise<undefined>(r => setTimeout(() => r(undefined), 5000)),
      ]);
    } catch { /* best-effort */ }
  }

  const systemPrompt = buildSystemPrompt({
    mode,
    tools,
    nimbusInstructions,
    cwd,
    infraContext: resolvedInfraContext,
    dryRun: options.dryRun,
  });

  // Convert agentic ToolDefinitions to the LLM-level format expected by
  // the router's routeWithTools() method (OpenAI function-calling shape).
  const llmTools: LLMToolDefinition[] = tools.map(toOpenAITool);

  // -----------------------------------------------------------------------
  // 2. Initialize conversation state
  // -----------------------------------------------------------------------

  // PERF-4a: Capacity-hinted pre-allocation avoids repeated V8 array reallocation
  // as messages accumulate during a long conversation.
  const messages: LLMMessage[] = new Array(Math.max(history.length + 1, 10));
  messages.length = 0;
  messages.push(...history, { role: 'user', content: userMessage });

  let turns = 0;
  let interrupted = false;
  const totalUsage: AgentLoopUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
  let totalCost = 0;

  // G3: Session-level destructive operation counter and per-turn tool call counter
  let sessionDestructiveOps = 0;
  const MAX_TOOL_CALLS_PER_TURN = options.maxToolCallsPerTurn ?? 20;
  const MAX_DESTRUCTIVE_OPS_PER_SESSION = options.maxDestructiveOpsPerSession ?? 5;

  // M2/M5: Track tool calls that have already received a credential-error retry message
  // to avoid spamming the auth-refresh hint on repeated failures.
  const credentialRetried = new Set<string>();

  // G8: Track which terraform workdirs have had a plan run in this session.
  // Used to warn when apply is run without a prior plan.
  const terraformPlannedWorkdirs = new Set<string>();

  // G10: One-time kubectl RBAC pre-flight check state.
  // kubectlRbacChecked: ensures we only run `kubectl auth can-i --list` once per session.
  // rbacPreamble: stores the RBAC output to inject into the first kubectl tool result.
  let kubectlRbacChecked = false;
  let rbacPreamble = '';

  // G10: Pre-import async exec utilities so they're available inside the loop.
  // Using async execFile avoids blocking the Node.js event loop for kubectl/terraform calls.
  const { execFile: _execFile, exec: _exec } = await import('node:child_process');
  const { promisify: _promisify } = await import('node:util');
  const _execFileAsync = _promisify(_execFile);
  const _execAsync = _promisify(_exec);

  // PERF-4a: Pre-build the system message once so it can be reused every turn
  // without allocating a new object on each loop iteration.
  const _systemMessageObj: LLMMessage = { role: 'system', content: systemPrompt };

  // Shared mutable ref: set to true by 'apply-all' diff decision to skip further prompts
  const skipRemainingDiffPrompts = { value: options.skipRemainingDiffPrompts ?? false };
  // Shared mutable ref: set to true by 'reject-all' diff decision to auto-reject further prompts
  const rejectRemainingDiffPrompts = { value: options.rejectRemainingDiffPrompts ?? false };

  // -----------------------------------------------------------------------
  // 3. Main agent loop
  // -----------------------------------------------------------------------

  while (turns < maxTurns) {
    // Check for cancellation before each turn
    if (signal?.aborted) {
      interrupted = true;
      break;
    }

    turns++;

    try {
      // Gap 18: Auto-route model based on task complexity when no explicit model set
      let effectiveModel = model ?? DEFAULT_MODEL;
      if (!model && options.autoRouteModel) {
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
        const lastMsgText = lastUserMsg
          ? typeof lastUserMsg.content === 'string'
            ? lastUserMsg.content
            : JSON.stringify(lastUserMsg.content)
          : '';
        const complexity = classifyTaskComplexity(lastMsgText);
        effectiveModel = routeModel(complexity);
        if (onText && turns === 1) {
          onText(`\n[auto: ${effectiveModel.split('/').pop()?.replace('anthropic/', '') ?? effectiveModel}]\n`);
        }
      }

      // Build the completion request with tool definitions.
      // The systemMessageObj is pre-built before the loop (PERF-4a) — reuse it.
      const allMessages: LLMMessage[] = new Array(messages.length + 1);
      allMessages.length = 0;
      allMessages.push(_systemMessageObj, ...messages);
      const request: ToolCompletionRequest = {
        messages: allMessages,
        model: effectiveModel,
        tools: llmTools,
        maxTokens: DEFAULT_MAX_TOKENS,
      };

      // Stream text tokens incrementally via routeStreamWithTools.
      // Tokens are forwarded to onText as they arrive; tool calls
      // are accumulated from the final chunk.
      let responseContent = '';
      let responseToolCalls: ToolCall[] | undefined;
      let responseUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      // A1: Retry on transient errors (rate-limit / 5xx) with exponential backoff
      const MAX_STREAM_RETRIES = 2;
      let streamAttempt = 0;
      while (true) {
        // A2: Silence timeout — abort if no chunk arrives (G21: configurable)
        const STREAM_SILENCE_MS = options.streamSilenceTimeoutMs ?? 60_000;
        const silenceAbort = new AbortController();
        let silenceTimer: ReturnType<typeof setTimeout> | undefined;
        const resetSilence = () => {
          clearTimeout(silenceTimer);
          silenceTimer = setTimeout(() => silenceAbort.abort('Stream timeout'), STREAM_SILENCE_MS);
        };
        resetSilence();

        try {
          // Pass silence abort signal via request cast (non-standard but supported by most providers)
          const requestWithSignal = { ...request, signal: silenceAbort.signal } as typeof request;
          for await (const chunk of router.routeStreamWithTools(requestWithSignal)) {
            resetSilence(); // reset on every chunk
            if (chunk.content) {
              responseContent += chunk.content;
              if (onText) {
                onText(chunk.content);
              }
            }
            if (chunk.toolCallStart && onText) {
              // Show early feedback when the LLM starts composing a tool call
              onText(`\n[Preparing tool: ${chunk.toolCallStart.name}...]\n`);
            }
            if (chunk.toolCalls) {
              responseToolCalls = chunk.toolCalls;
            }
            if (chunk.usage) {
              responseUsage = chunk.usage;
            }
          }
          clearTimeout(silenceTimer);
          break; // success — exit retry loop
        } catch (streamErr) {
          clearTimeout(silenceTimer);
          if (streamAttempt < MAX_STREAM_RETRIES && isRetryableStreamError(streamErr)) {
            const delay = 1000 * Math.pow(2, streamAttempt);
            if (onText) {
              onText(`\n[Retrying after error (attempt ${streamAttempt + 1})...]\n`);
            }
            await new Promise(r => setTimeout(r, delay));
            streamAttempt++;
            // Reset partial accumulation before retry
            responseContent = '';
            responseToolCalls = undefined;
            responseUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
            continue;
          }
          // G24: Graceful network error message instead of raw Node.js error
          const streamErrObj = streamErr as Error | null;
          const isNetworkError = /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|fetch failed|network/i.test(streamErrObj?.message ?? '');
          if (isNetworkError) {
            const netMsg = '\n[!!] Network unreachable — cannot reach the LLM API.\nCheck your internet connection and API key validity, then try again.\n';
            if (onText) onText(netMsg);
            // Re-throw a specially-marked error so the outer turn catch block can handle it
            const netErr = new Error(netMsg);
            (netErr as Error & { _nimbusNetworkError?: boolean })._nimbusNetworkError = true;
            throw netErr;
          }
          throw streamErr; // non-retryable — propagate to outer catch
        }
      }

      // Accumulate usage and cost
      totalUsage.promptTokens += responseUsage.promptTokens;
      totalUsage.completionTokens += responseUsage.completionTokens;
      totalUsage.totalTokens += responseUsage.totalTokens;

      // Estimate cost for this turn
      const resolvedModel = effectiveModel;
      const providerName = resolvedModel.includes('/') ? resolvedModel.split('/')[0] : 'anthropic';
      const modelName = resolvedModel.includes('/')
        ? resolvedModel.split('/').slice(1).join('/')
        : resolvedModel;
      const turnCost = calculateCost(
        providerName,
        modelName,
        responseUsage.promptTokens,
        responseUsage.completionTokens
      );
      totalCost += turnCost.costUSD;

      // Notify caller of accumulated usage/cost after each turn
      if (options.onUsage) {
        options.onUsage(totalUsage, totalCost);
      }

      // M2: Emit per-turn token/cost stats as a dim system message in the TUI.
      // Only emit when there was actual token usage (skip turns with 0 tokens).
      if (onText && (responseUsage.promptTokens > 0 || responseUsage.completionTokens > 0)) {
        const statsLine = `\n[${responseUsage.promptTokens} in / ${responseUsage.completionTokens} out — $${turnCost.costUSD.toFixed(4)}]\n`;
        onText(statsLine);
      }

      // G16: Cost budget enforcement — stop if cumulative cost exceeds the limit
      if (options.costBudgetUSD !== undefined && totalCost >= options.costBudgetUSD) {
        const budgetMsg = `\n\n[!!] Cost budget of $${options.costBudgetUSD.toFixed(2)} reached (used: $${totalCost.toFixed(3)}). Stopping to prevent overspend.\n`;
        if (onText) onText(budgetMsg);
        messages.push({ role: 'assistant', content: budgetMsg });
        break;
      }

      // -----------------------------------------------------------------
      // No tool calls → the LLM is done
      // -----------------------------------------------------------------
      if (!responseToolCalls || responseToolCalls.length === 0) {
        messages.push({
          role: 'assistant',
          content: responseContent,
        });
        break;
      }

      // -----------------------------------------------------------------
      // Tool calls present → execute each one
      // -----------------------------------------------------------------

      // Append the assistant message that contains the tool calls
      messages.push({
        role: 'assistant',
        content: responseContent,
        toolCalls: responseToolCalls,
      });

      // G3: Per-turn tool call counter — reset at the start of each tool-call batch
      let turnToolCallCount = 0;

      // H2: Parallel dispatch for read-only tools (safe to run concurrently)
      const READ_ONLY_TOOLS = new Set([
        'read_file', 'glob', 'grep', 'cloud_discover', 'terraform_plan_analyze',
        'kubectl_context', 'helm_values', 'cost_estimate', 'drift_detect',
      ]);
      const canRunInParallel = (tc: ToolCall): boolean => READ_ONLY_TOOLS.has(tc.function.name);
      const allReadOnly = responseToolCalls.every(canRunInParallel);

      if (allReadOnly && responseToolCalls.length > 1) {
        // All tools are read-only — dispatch in parallel
        const parallelChunkCallback = onToolOutputChunk
          ? (id: string) => (chunk: string) => onToolOutputChunk(id, chunk)
          : undefined;

        const parallelResults = await Promise.allSettled(
          responseToolCalls.map(tc =>
            executeToolCall(
              tc,
              toolRegistry,
              onToolCallStart,
              onToolCallEnd,
              checkPermission,
              options.lspManager,
              options.snapshotManager,
              options.sessionId,
              signal,
              options.hookEngine,
              mode,
              options.requestFileDiff,
              skipRemainingDiffPrompts,
              rejectRemainingDiffPrompts,
              parallelChunkCallback ? parallelChunkCallback(tc.id) : undefined,
              options.toolTimeouts,
              options.infraContext
            )
          )
        );

        for (let pi = 0; pi < responseToolCalls.length; pi++) {
          const tc = responseToolCalls[pi];
          const pResult = parallelResults[pi];
          const pContent = pResult.status === 'fulfilled'
            ? (pResult.value.isError ? `Error: ${pResult.value.error}` : pResult.value.output)
            : `Error: ${pResult.reason}`;
          messages.push({ role: 'tool', toolCallId: tc.id, name: tc.function.name, content: pContent });
        }
        // Skip sequential processing — jump directly to next LLM turn
        continue;
      }

      // Process tool calls sequentially (order may matter for side effects)
      for (const toolCall of responseToolCalls) {
        // Check for cancellation between tool calls
        if (signal?.aborted) {
          interrupted = true;
          break;
        }

        // G3: Enforce per-turn tool call limit to prevent runaway loops
        turnToolCallCount++;
        if (turnToolCallCount > MAX_TOOL_CALLS_PER_TURN) {
          messages.push({
            role: 'tool',
            toolCallId: toolCall.id,
            name: toolCall.function.name,
            content: `[Tool limit reached: ${MAX_TOOL_CALLS_PER_TURN} tool calls in this turn. Summarizing progress and stopping to avoid runaway execution.]`,
          });
          break;
        }

        // G3: Count destructive operations at the session level
        if (isDestructiveOp(toolCall.function.name, toolCall.function.arguments)) {
          sessionDestructiveOps++;
        }

        // G10: One-time kubectl RBAC pre-flight check — runs before the first kubectl call
        // in this session. Stores the RBAC permissions summary in rbacPreamble so it can
        // be injected into the first kubectl tool result (keeps conversation structure valid).
        // Uses async execFile to avoid blocking the Node.js event loop (up to 5s call).
        if (!kubectlRbacChecked && toolCall.function.name === 'kubectl') {
          kubectlRbacChecked = true;
          try {
            const { stdout: rbacOut } = await _execFileAsync('kubectl', ['auth', 'can-i', '--list'], {
              encoding: 'utf-8', timeout: 5000,
            });
            const truncated = rbacOut.length > 1500
              ? `${rbacOut.slice(0, 1500)}\n...[truncated]`
              : rbacOut;
            rbacPreamble = `[kubectl RBAC context: permissions available in current context]\n${truncated}\n\n`;
          } catch { /* non-critical — RBAC check failure does not block kubectl */ }
        }

        // M6: Destructive action guard — inject warning into LLM context before executing
        try {
          const m6Input = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
          const destructiveWarning = isDestructiveAction(toolCall.function.name, m6Input);
          if (destructiveWarning) {
            messages.push({
              role: 'tool',
              toolCallId: toolCall.id + '-guard',
              name: toolCall.function.name,
              content: `[SAFETY] ${destructiveWarning}`,
            });
          }
        } catch { /* ignore parse errors */ }

        // Build chunk callback that forwards tool output to the TUI in real-time
        const chunkCallback = onToolOutputChunk
          ? (chunk: string) => onToolOutputChunk(toolCall.id, chunk)
          : undefined;

        const result = await executeToolCall(
          toolCall,
          toolRegistry,
          onToolCallStart,
          onToolCallEnd,
          checkPermission,
          options.lspManager,
          options.snapshotManager,
          options.sessionId,
          signal,
          options.hookEngine,
          mode,
          options.requestFileDiff,
          skipRemainingDiffPrompts,
          rejectRemainingDiffPrompts,
          chunkCallback,
          options.toolTimeouts,
          options.infraContext
        );

        // Append each tool result as a separate message so the LLM can
        // match it to the corresponding tool_use block by toolCallId.
        let toolContent = result.isError ? `Error: ${result.error}` : result.output;

        // G10: Inject RBAC context preamble into the first kubectl result
        if (rbacPreamble && toolCall.function.name === 'kubectl') {
          toolContent = rbacPreamble + toolContent;
          rbacPreamble = ''; // consume once — only injected into the first kubectl result
        }

        // Inject DevOps error classification hints to guide self-correction
        if (result.isError && result.error) {
          const hint = classifyDevOpsError(toolCall.function.name, result.error, options.nimbusInstructions);
          if (hint) {
            toolContent += `\n\n${hint}`;
            // C4: Also show hint in TUI error output (not just LLM context)
            result.output += `\n\n${hint}`;

            // M2/M5: Auto-retry signal on credential expiry errors
            // If the classified hint indicates a credential/auth problem, append
            // a structured prompt so the agent knows to run auth-refresh, and
            // set provider-specific env hints for the auth-refresh command.
            const isCredentialError =
              hint.toLowerCase().includes('credential') ||
              hint.toLowerCase().includes('expired') ||
              hint.toLowerCase().includes('auth') ||
              hint.toLowerCase().includes('login required');

            if (isCredentialError && !credentialRetried.has(toolCall.id ?? toolCall.function.name)) {
              credentialRetried.add(toolCall.id ?? toolCall.function.name);

              // M5: Set provider-specific refresh hint env vars so auth-refresh
              // can surface targeted guidance when invoked by the user.
              const errorLower = (result.error ?? '').toLowerCase();
              if (errorLower.includes('aws')) {
                process.env.NIMBUS_AWS_REFRESH_HINT = '1';
              }
              if (errorLower.includes('gcp') || errorLower.includes('google')) {
                process.env.NIMBUS_GCP_REFRESH_HINT = '1';
              }
              if (errorLower.includes('azure')) {
                process.env.NIMBUS_AZURE_REFRESH_HINT = '1';
              }

              const refreshMsg = [
                '[!!] Credential expired. Run: nimbus auth-refresh',
                '[Nimbus] Credential error detected on tool: ' + toolCall.function.name,
                'Run "nimbus auth-refresh" to refresh cloud credentials, then retry.',
              ].join('\n');
              toolContent += '\n\n' + refreshMsg;
              result.output += '\n\n' + refreshMsg;
            }
          } else if (DEVOPS_TOOL_NAMES.has(toolCall.function.name)) {
            // Unknown DevOps error — provide structured self-diagnosis steps
            toolContent += [
              '\n\n--- Self-Diagnosis Steps ---',
              '1. Check tool is installed: `which terraform` / `kubectl version` / `helm version`',
              '2. Check credentials: `aws sts get-caller-identity` / `gcloud auth list` / `az account show`',
              '3. Check network connectivity to the cluster/cloud provider',
              '4. Retry with verbose flag if available (e.g., TF_LOG=DEBUG, kubectl --v=6)',
              '5. If the error persists, report the exact error message and the command that caused it.',
            ].join('\n');
          }
          // M4: Track recurring errors and persist to NIMBUS.md after 3 occurrences
          const m4Hint = classifyDevOpsError(toolCall.function.name, result.error ?? '', options.nimbusInstructions);
          if (m4Hint) {
            trackAndPersistError(toolCall.function.name, m4Hint, options.cwd ?? process.cwd());
          }
        }

        // H5: Inject cost delta hint after successful infra operations
        if (!result.isError) {
          try {
            const h5Input = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
            const costHint = extractCostHintFromToolOutput(toolCall.function.name, h5Input, result.output);
            if (costHint) {
              onText?.(`\n[cost] ${costHint}\n`);
            }
          } catch { /* ignore parse errors */ }
        }

        // L6: Auto-generate runbook after terraform apply success
        if (!result.isError && toolCall.function.name === 'terraform') {
          try {
            const l6Input = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
            if (String(l6Input.action) === 'apply') {
              const l6Match = result.output.match(/Resources:\s*(\d+) added/);
              if (l6Match && parseInt(l6Match[1] ?? '0', 10) > 0) {
                const { join: _l6Join } = require('node:path') as typeof import('node:path');
                const { homedir: _l6Homedir } = require('node:os') as typeof import('node:os');
                const { mkdirSync: _l6MkdirSync, writeFileSync: _l6WriteFileSync } = require('node:fs') as typeof import('node:fs');
                const runbookDir = _l6Join(_l6Homedir(), '.nimbus', 'runbooks');
                _l6MkdirSync(runbookDir, { recursive: true });
                const ts = new Date().toISOString().replace(/[:.]/g, '-');
                const runbookPath = _l6Join(runbookDir, `terraform-apply-${ts}.md`);
                const runbookContent = [
                  '# Terraform Apply Runbook',
                  '',
                  `Date: ${new Date().toLocaleString()}`,
                  '',
                  'Apply output:',
                  '```',
                  result.output.slice(0, 2000),
                  '```',
                  '',
                  '## Rollback',
                  '',
                  'To rollback, run `terraform destroy` or restore from a previous state.',
                ].join('\n');
                _l6WriteFileSync(runbookPath, runbookContent, 'utf-8');
                options.onText?.(`\n[runbook] Saved to ${runbookPath}\n`);
              }
            }
          } catch { /* non-critical */ }
        }

        // GAP-25: Structured audit trail for destructive operations
        if (!result.isError && isDestructiveOp(toolCall.function.name, toolCall.function.arguments)) {
          try {
            const { appendFileSync, mkdirSync } = await import('node:fs');
            const { homedir } = await import('node:os');
            const { join } = await import('node:path');
            const auditDir = join(homedir(), '.nimbus');
            mkdirSync(auditDir, { recursive: true });
            const event = JSON.stringify({
              type: 'infra-change',
              tool: toolCall.function.name,
              action: (JSON.parse(toolCall.function.arguments) as Record<string, unknown>).action,
              sessionId: options.sessionId ?? 'unknown',
              cwd: options.cwd ?? process.cwd(),
              timestamp: new Date().toISOString(),
            });
            appendFileSync(join(auditDir, 'audit.jsonl'), event + '\n', 'utf-8');
          } catch { /* audit logging is non-critical */ }
        }

        // G3: Append a warning when session-level destructive op threshold is reached
        if (sessionDestructiveOps >= MAX_DESTRUCTIVE_OPS_PER_SESSION) {
          toolContent += `\n\n[Warning: ${sessionDestructiveOps} destructive operations executed in this session. Review changes carefully.]`;
        }

        // Cache terraform plan output so a subsequent apply can reference it.
        // Also track planned workdirs (G8) and warn on unplanned applies.
        if (toolCall.function.name === 'terraform' && !result.isError) {
          try {
            const tfArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
            if (tfArgs.action === 'plan' && tfArgs.workdir) {
              cacheTerraformPlan(String(tfArgs.workdir), result.output);
              // G8: Track that a plan was run for this workdir in this session
              terraformPlannedWorkdirs.add(String(tfArgs.workdir));
            }
            // G8: Warn if apply ran without a prior plan in this session
            if (tfArgs.action === 'apply' && tfArgs.workdir && !terraformPlannedWorkdirs.has(String(tfArgs.workdir))) {
              toolContent = `[Note: terraform apply ran without a prior terraform plan in this session for ${String(tfArgs.workdir)}. Always run terraform plan first to review changes before applying.]\n\n${toolContent}`;
            }
            // Inject cached plan into apply context for the LLM
            if (tfArgs.action === 'apply' && tfArgs.workdir) {
              const cached = getCachedTerraformPlan(String(tfArgs.workdir));
              if (cached) {
                toolContent = `[Apply succeeded. This was the plan that was applied:]\n${cached.slice(0, 3000)}\n\n[Apply output:]\n${toolContent}`;
              }
            }
          } catch { /* ignore parse errors */ }
        }

        // GAP-11: trigger FileDiff UI after terraform plan shows resource changes
        if (toolCall.function.name === 'terraform' && !result.isError && options.requestFileDiff) {
          try {
            const tfArgs11 = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
            if (tfArgs11.action === 'plan') {
              const { parseTerraformPlanOutput, buildFileDiffBatchFromPlan } = await import('./deploy-preview');
              const changes = parseTerraformPlanOutput(toolContent);
              if (changes.length > 0) {
                const batchFiles = buildFileDiffBatchFromPlan({ changes } as import('./deploy-preview').DeployPreview);
                for (const file of batchFiles) {
                  const decision = await options.requestFileDiff(file.filePath, file.toolName ?? 'terraform', file.diff ?? '');
                  if (decision === 'reject-all') break;
                }
              }
            }
          } catch { /* non-critical — FileDiff UI not always available */ }
        }

        // GAP-18: auto-validate terraform files after write/edit tool calls
        if (['write_file', 'edit_file', 'multi_edit'].includes(toolCall.function.name) && !result.isError) {
          const gap18Input = JSON.parse(toolCall.function.arguments) as { path?: string; file_path?: string };
          const gap18FilePath = gap18Input.path ?? gap18Input.file_path ?? '';
          if (gap18FilePath.endsWith('.tf')) {
            try {
              // Use async exec to avoid blocking the event loop (up to 10s for terraform validate)
              const { stdout: validateOut } = await _execAsync('terraform validate -json 2>/dev/null', {
                cwd: options.cwd ?? process.cwd(),
                encoding: 'utf-8',
                timeout: 10_000,
              });
              const parsed = JSON.parse(validateOut) as { valid: boolean; diagnostics?: Array<{ severity: string; summary: string; detail: string }> };
              if (!parsed.valid && parsed.diagnostics && parsed.diagnostics.length > 0) {
                const errors = parsed.diagnostics
                  .filter(d => d.severity === 'error')
                  .map(d => `  ${d.summary}: ${d.detail}`)
                  .join('\n');
                toolContent += `\n\nTerraform validation errors (please fix):\n${errors}`;
              }
            } catch { /* terraform not available or not in tf project — ignore */ }
          }
        }

        // Truncate excessively large tool outputs to prevent context overflow
        if (toolContent.length > MAX_TOOL_OUTPUT_CHARS) {
          let head: string;
          let tail: string;
          let omitted: number;
          const lines = toolContent.split('\n');

          // C3: Smart truncation for terraform plan — preserve all diff lines
          const isTerraformPlan = toolCall.function.name === 'terraform' && (() => {
            try {
              const tfArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
              return tfArgs.action === 'plan';
            } catch { return false; }
          })();

          if (isTerraformPlan) {
            // Keep all diff lines (create/update/destroy/replace) and the plan summary
            const diffLines: string[] = [];
            const contextLines: string[] = [];
            for (const line of lines) {
              const trimmed = line.trimStart();
              const isDiffLine = trimmed.startsWith('+') || trimmed.startsWith('-') ||
                trimmed.startsWith('~') || trimmed.startsWith('!') ||
                line.includes('will be created') || line.includes('will be destroyed') ||
                line.includes('will be updated') || line.includes('will be replaced') ||
                line.includes('Plan:') || line.includes('No changes') ||
                line.includes('Error:') || line.includes('Warning:');
              if (isDiffLine) {
                diffLines.push(line);
              } else {
                contextLines.push(line);
              }
            }
            // Allow up to 500 diff lines + first 50 context lines
            const keptDiff = diffLines.slice(0, 500);
            const keptCtx = contextLines.slice(0, 50);
            omitted = Math.max(0, lines.length - keptDiff.length - keptCtx.length);
            head = [...keptCtx, ...keptDiff].join('\n');
            tail = '';
          } else {
            const headLines = 100, tailLines = 20;
            head = lines.slice(0, headLines).join('\n');
            tail = lines.slice(-tailLines).join('\n');
            omitted = Math.max(0, lines.length - headLines - tailLines);
          }

          // Save full output to disk for reference
          try {
            const { mkdirSync: _mkdirSync, writeFileSync: _writeFileSync } = await import('node:fs');
            const { homedir: _homedir } = await import('node:os');
            const outDir = join(_homedir(), '.nimbus', 'tool-outputs');
            _mkdirSync(outDir, { recursive: true });
            const outFile = join(outDir, `${Date.now()}-${toolCall.function.name}.log`);
            _writeFileSync(outFile, toolContent, 'utf-8');
            toolContent = omitted > 0
              ? `${head}${tail ? '\n\n... [' + omitted + ' lines omitted — full output saved to ' + outFile + '] ...\n\n' + tail : '\n\n... [full output saved to ' + outFile + ']'}`
              : `${head}${tail ? '\n\n' + tail : ''}`;
          } catch {
            toolContent = omitted > 0
              ? `${head}${tail ? '\n\n... [' + omitted + ' lines omitted — output too large for context] ...\n\n' + tail : '\n\n... [' + omitted + ' lines omitted]'}`
              : `${head}${tail ? '\n\n' + tail : ''}`;
          }
        }

        messages.push({
          role: 'tool',
          toolCallId: toolCall.id,
          name: toolCall.function.name,
          content: toolContent,
        });
      }

      // If we broke out of the tool-call loop due to cancellation, exit
      // the main loop as well.
      if (interrupted) {
        break;
      }

      // -----------------------------------------------------------------
      // Auto-compact check
      // -----------------------------------------------------------------
      // After tool results are appended, check whether the conversation
      // has grown past the context window threshold. If so, summarize
      // older messages to free up space for future turns.
      if (options.contextManager) {
        const toolTokens = llmTools.reduce(
          (sum, t) => sum + Math.ceil(JSON.stringify(t).length / 4),
          0
        );
        if (options.contextManager.shouldCompact(systemPrompt, messages, toolTokens)) {
          try {
            const compactResult = await runCompaction(messages, options.contextManager, {
              router,
              ...(options.infraContext ? { infraContext: options.infraContext } : {}),
            });
            // Replace messages with the compacted version
            messages.length = 0;
            messages.push(...compactResult.messages);
            // Clear the token cache after compaction — old message entries are no longer valid
            options.contextManager.clearTokenCache();
            if (options.onCompact) {
              options.onCompact(compactResult.result);
            }
          } catch (compactErr) {
            // Compaction failed — notify user visibly and continue with original messages
            const compactErrMsg =
              compactErr instanceof Error ? compactErr.message : String(compactErr);
            if (onText) {
              onText(
                `\n[Warning: Auto-compaction failed: ${compactErrMsg}. Context may exceed budget on the next turn.]\n`
              );
            }
          }
        }
      }
    } catch (error: unknown) {
      // LLM API error — report to the caller and break
      const msg = error instanceof Error ? error.message : String(error);
      // G24: Network errors already printed via onText above — skip duplicate output
      const isNetworkErr = (error instanceof Error) && (error as Error & { _nimbusNetworkError?: boolean })._nimbusNetworkError;
      if (!isNetworkErr && onText) {
        onText(`\n[Error: ${msg}]\n`);
      }
      messages.push({
        role: 'assistant',
        content: isNetworkErr ? msg : `I encountered an error: ${msg}`,
      });
      break;
    }
  }

  // -----------------------------------------------------------------------
  // 4. Post-loop bookkeeping
  // -----------------------------------------------------------------------

  if (turns >= maxTurns && !interrupted) {
    if (onText) {
      onText(`\n[Agent reached maximum turns limit (${maxTurns}). Stopping.]\n`);
    }
  }

  // GAP-19: Session summary after multi-step deploy
  if (options.mode === 'deploy' && options.onText) {
    // Collect tool calls from messages
    const allToolCalls: Array<{ name: string; input: Record<string, unknown> }> = [];
    for (const msg of messages) {
      if (msg.role === 'assistant' && Array.isArray((msg as {toolCalls?: unknown[]}).toolCalls)) {
        for (const tc of (msg as {toolCalls: Array<{function: {name: string; arguments: string}}>}).toolCalls) {
          try {
            allToolCalls.push({ name: tc.function.name, input: JSON.parse(tc.function.arguments) as Record<string, unknown> });
          } catch { /* ignore */ }
        }
      }
    }
    if (allToolCalls.length > 3) {
      const terraform = allToolCalls.filter(c => c.name === 'terraform');
      const kubectl = allToolCalls.filter(c => c.name === 'kubectl');
      const helm = allToolCalls.filter(c => c.name === 'helm');
      const summaryLines: string[] = ['---', '**Session Summary**'];
      if (terraform.length) summaryLines.push(`• Terraform: ${terraform.map(c => String(c.input.action ?? '')).join(', ')}`);
      if (kubectl.length) summaryLines.push(`• Kubectl: ${kubectl.map(c => String(c.input.action ?? '')).join(', ')}`);
      if (helm.length) summaryLines.push(`• Helm: ${helm.map(c => String(c.input.action ?? '')).join(', ')}`);
      if (summaryLines.length > 2) {
        options.onText('\n\n' + summaryLines.join('\n'));
      }
    }
  }

  return {
    messages,
    turns,
    interrupted,
    usage: totalUsage,
    totalCost,
  };
}

// ---------------------------------------------------------------------------
// Tool Execution
// ---------------------------------------------------------------------------

/** Tools that modify files and should trigger LSP diagnostics. */
const FILE_EDITING_TOOLS = new Set(['edit_file', 'multi_edit', 'write_file']);

/** Tools that mutate files and may require a pre-approval diff. */
const FILE_MUTATING_TOOLS = new Set(['edit_file', 'multi_edit', 'write_file']);

/**
 * Generate a simple unified diff between two strings.
 * Suitable for display; uses a greedy line-by-line approach.
 */
function generateUnifiedDiff(filename: string, before: string, after: string): string {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const lines: string[] = [`--- a/${filename}`, `+++ b/${filename}`];
  let i = 0;
  let j = 0;
  while (i < beforeLines.length || j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      i++;
      j++;
      continue;
    }
    const hunkBefore: string[] = [];
    const hunkAfter: string[] = [];
    const start = i;
    while (i < beforeLines.length && beforeLines[i] !== afterLines[j]) {
      hunkBefore.push(beforeLines[i++]);
    }
    while (
      j < afterLines.length &&
      (i >= beforeLines.length || beforeLines[i] !== afterLines[j])
    ) {
      hunkAfter.push(afterLines[j++]);
    }
    lines.push(
      `@@ -${start + 1},${hunkBefore.length} +${start + 1},${hunkAfter.length} @@`
    );
    hunkBefore.forEach(l => lines.push(`-${l}`));
    hunkAfter.forEach(l => lines.push(`+${l}`));
  }
  return lines.join('\n');
}

/**
 * Compute a proposed diff for a file-mutating tool call without writing to disk.
 * Returns the unified diff string, or null if it cannot be computed.
 */
async function computeProposedDiff(
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  try {
    const { readFile } = await import('node:fs/promises');
    const path = args.path as string;
    if (!path) return null;
    const currentContent = await readFile(path, 'utf-8').catch(() => '');
    let proposed = currentContent;
    if (toolName === 'edit_file') {
      proposed = currentContent.replace(args.old_string as string, args.new_string as string);
    } else if (toolName === 'multi_edit') {
      const edits = args.edits as Array<{ old_string: string; new_string: string }>;
      if (Array.isArray(edits)) {
        for (const e of edits) {
          proposed = proposed.replace(e.old_string, e.new_string);
        }
      }
    } else if (toolName === 'write_file') {
      proposed = args.content as string;
    }
    if (proposed === currentContent) return null; // no change
    return generateUnifiedDiff(path, currentContent, proposed);
  } catch {
    return null;
  }
}

/**
 * Extract the file path from a tool call's parsed arguments.
 *
 * File-editing tools all have a `path` parameter that identifies
 * the target file. Returns `null` for non-file tools.
 */
function extractFilePath(toolName: string, input: unknown): string | null {
  if (!FILE_EDITING_TOOLS.has(toolName)) {
    return null;
  }
  if (input && typeof input === 'object' && 'path' in input) {
    return (input as { path: string }).path;
  }
  return null;
}

/**
 * Execute a single tool call.
 *
 * Handles:
 * - Looking up the tool in the registry.
 * - Parsing the JSON arguments string from the LLM response.
 * - Validating input against the Zod schema.
 * - Checking permissions via the caller-supplied callback.
 * - Invoking the tool and returning the result.
 * - Notifying start/end callbacks.
 * - Querying the LSP for diagnostics after file edits.
 *
 * @param toolCall - The raw tool call from the LLM response.
 * @param registry - The tool registry to look up the tool definition.
 * @param onStart - Optional callback fired before execution.
 * @param onEnd - Optional callback fired after execution (or error).
 * @param checkPermission - Optional permission gate.
 * @param lspManager - Optional LSP manager for post-edit diagnostics.
 * @returns The tool result (always succeeds; errors are captured inside the result).
 */
async function executeToolCall(
  toolCall: ToolCall,
  registry: ToolRegistry,
  onStart?: (info: ToolCallInfo) => void,
  onEnd?: (info: ToolCallInfo, result: ToolResult) => void,
  checkPermission?: (tool: ToolDefinition, input: unknown) => Promise<PermissionDecision>,
  lspManager?: LSPManager,
  snapshotManager?: SnapshotManager,
  sessionId?: string,
  signal?: AbortSignal,
  hookEngine?: HookEngine,
  mode?: AgentMode,
  requestFileDiff?: (path: string, toolName: string, diff: string) => Promise<FileDiffDecision>,
  skipRemainingDiffPrompts?: { value: boolean },
  rejectRemainingDiffPrompts?: { value: boolean },
  onChunk?: (chunk: string) => void,
  toolTimeouts?: Record<string, number>,
  infraContext?: import('../sessions/manager').SessionInfraContext
): Promise<ToolResult> {
  const toolName = toolCall.function.name;

  // Parse the JSON arguments string from the LLM
  let parsedArgs: unknown;
  try {
    parsedArgs = JSON.parse(toolCall.function.arguments);
  } catch {
    const result: ToolResult = {
      output: '',
      error: `Tool '${toolName}' received malformed JSON arguments — please retry the tool call with valid JSON. Received: ${toolCall.function.arguments.slice(0, 200)}`,
      isError: true,
    };
    return result;
  }

  const callInfo: ToolCallInfo = {
    id: toolCall.id,
    name: toolName,
    input: parsedArgs,
    startTime: Date.now(),
  };

  // Look up the tool definition
  const tool = registry.get(toolName);
  if (!tool) {
    const result: ToolResult = {
      output: '',
      error: `Unknown tool: ${toolName}`,
      isError: true,
    };
    if (onEnd) {
      onEnd(callInfo, result);
    }
    return result;
  }

  // Notify start
  if (onStart) {
    onStart(callInfo);
  }

  // Build shared hook context for PreToolUse and PostToolUse
  const hookContext: HookContext = {
    tool: toolName,
    input: parsedArgs && typeof parsedArgs === 'object' ? (parsedArgs as Record<string, unknown>) : {},
    sessionId: sessionId ?? 'default',
    agent: mode ?? 'build',
    timestamp: new Date().toISOString(),
  };

  // PreToolUse hooks — may block the tool call
  if (hookEngine) {
    const preResult = await runPreToolHooks(hookEngine, hookContext);
    if (!preResult.allowed) {
      const result: ToolResult = {
        output: '',
        error: `Tool '${toolName}' blocked by hook: ${preResult.message ?? 'no reason given'}`,
        isError: true,
      };
      if (onEnd) {
        onEnd(callInfo, result);
      }
      return result;
    }
  }

  // Permission check
  if (checkPermission) {
    const decision = await checkPermission(tool, parsedArgs);
    if (decision === 'deny' || decision === 'block') {
      const result: ToolResult = {
        output: '',
        error:
          decision === 'block'
            ? `Tool '${toolName}' is blocked by permission policy.`
            : `User denied permission for tool '${toolName}'.`,
        isError: true,
      };
      if (onEnd) {
        onEnd(callInfo, result);
      }
      return result;
    }
  }

  // B1: Pre-approval diff — show proposed change before writing files
  if (
    FILE_MUTATING_TOOLS.has(toolName) &&
    requestFileDiff &&
    !(skipRemainingDiffPrompts?.value)
  ) {
    // Auto-reject if 'reject-all' was previously chosen
    if (rejectRemainingDiffPrompts?.value) {
      const rejResult: ToolResult = {
        output: 'User rejected this change (reject-all).',
        error: undefined,
        isError: false,
      };
      if (onEnd) onEnd(callInfo, rejResult);
      return rejResult;
    }

    const diff = await computeProposedDiff(toolName, parsedArgs as Record<string, unknown>);
    if (diff) {
      const targetPath =
        (parsedArgs as Record<string, unknown>).path as string | undefined ?? '(file)';
      const decision = await requestFileDiff(targetPath, toolName, diff);
      if (decision === 'reject') {
        const rejResult: ToolResult = {
          output: 'User rejected this change.',
          error: undefined,
          isError: false,
        };
        if (onEnd) onEnd(callInfo, rejResult);
        return rejResult;
      }
      if (decision === 'reject-all') {
        if (rejectRemainingDiffPrompts) {
          rejectRemainingDiffPrompts.value = true;
        }
        const rejResult: ToolResult = {
          output: 'User rejected this change (reject-all).',
          error: undefined,
          isError: false,
        };
        if (onEnd) onEnd(callInfo, rejResult);
        return rejResult;
      }
      if (decision === 'apply-all' && skipRemainingDiffPrompts) {
        skipRemainingDiffPrompts.value = true;
      }
    }
  }

  // Capture snapshot before file-modifying tools for undo/redo support
  if (
    snapshotManager &&
    SnapshotManager.shouldSnapshot(toolName, parsedArgs as Record<string, unknown>)
  ) {
    try {
      await snapshotManager.captureSnapshot({
        sessionId: sessionId || 'default',
        messageId: toolCall.id,
        toolCallId: toolCall.id,
        description: `${toolName}: ${extractFilePath(toolName, parsedArgs) || '(bash command)'}`,
      });
    } catch {
      // Snapshot failure should never block the tool call
    }
  }

  // Validate input against the tool's Zod schema and execute
  let result: ToolResult;
  try {
    const validatedInput = tool.inputSchema.parse(parsedArgs);

    // Thread AbortSignal into bash tool for Ctrl+C child process killing
    if (signal && toolName === 'bash' && validatedInput && typeof validatedInput === 'object') {
      (validatedInput as Record<string, unknown>)._signal = signal;
    }

    // GAP-20: Build tool execute context, including per-tool timeout from toolTimeouts map
    // C2: Also pass infraContext from session so tools can use it as fallback
    const toolCtx: ToolExecuteContext | undefined = onChunk || toolTimeouts?.[toolName] || infraContext
      ? {
          ...(onChunk ? { onProgress: onChunk } : {}),
          ...(toolTimeouts?.[toolName] !== undefined ? { timeout: toolTimeouts[toolName] } : {}),
          ...(infraContext ? { infraContext } : {}),
        }
      : undefined;
    // C2: Write infra checkpoint before mutating terraform/helm operations
    if (toolName === 'terraform' || toolName === 'helm') {
      const _cpArgs = parsedArgs && typeof parsedArgs === 'object'
        ? (parsedArgs as Record<string, unknown>)
        : {};
      const _cpAction = String(_cpArgs.action ?? '');
      const _cpNeedCheckpoint =
        (toolName === 'terraform' && _cpAction === 'apply') ||
        (toolName === 'helm' && ['install', 'upgrade', 'rollback'].includes(_cpAction));
      if (_cpNeedCheckpoint) {
        writeInfraCheckpoint(toolName, _cpAction, _cpArgs);
      }
    }
    result = await tool.execute(validatedInput, toolCtx);
  } catch (error: unknown) {
    result = {
      output: '',
      error: formatToolInputError(toolName, error),
      isError: true,
    };
  }

  // -----------------------------------------------------------------------
  // LSP diagnostics injection
  // -----------------------------------------------------------------------
  // After a successful file edit, notify the language server and collect
  // any diagnostics (type errors, lint issues). If errors exist they are
  // appended to the tool output so the LLM sees them on its next turn
  // and can self-correct.
  if (lspManager && !result.isError) {
    const filePath = extractFilePath(toolName, parsedArgs);
    if (filePath) {
      try {
        await lspManager.touchFile(filePath);
        const diagnostics = await lspManager.getDiagnostics(filePath);
        if (diagnostics.length > 0) {
          const formatted = lspManager.formatDiagnosticsForAgent(diagnostics);
          if (formatted) {
            result = {
              ...result,
              output: result.output ? `${result.output}\n\n${formatted}` : formatted,
            };
          }
        }
      } catch (lspErr) {
        // LSP errors should never block the agent loop.
        // Append a note to the tool result so the LLM (and user) can see it.
        const lspErrMsg = lspErr instanceof Error ? lspErr.message : String(lspErr);
        result = {
          ...result,
          output: result.output
            ? `${result.output}\n\n[Note: LSP diagnostics unavailable: ${lspErrMsg}]`
            : `[Note: LSP diagnostics unavailable: ${lspErrMsg}]`,
        };
      }
    }
  }

  // Gap 12: Mask secrets in tool output before forwarding to callbacks/history
  if (!result.isError && result.output) {
    result = { ...result, output: maskSecrets(result.output) };
  }

  // PostToolUse hooks — fire-and-forget (audit, auto-format, etc.)
  if (hookEngine) {
    await runPostToolHooks(hookEngine, {
      ...hookContext,
      result: {
        output: result.isError ? (result.error ?? '') : result.output,
        isError: result.isError,
      },
    });
  }

  // Notify end
  if (onEnd) {
    onEnd(callInfo, result);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Mode-Based Tool Filtering
// ---------------------------------------------------------------------------

/**
 * Set of tool names allowed in `plan` mode.
 *
 * Plan mode is strictly read-only: the agent can inspect files, search
 * the codebase, read tasks, estimate costs, and detect drift -- but it
 * cannot write files, run commands, or mutate infrastructure.
 */
const PLAN_MODE_TOOLS = new Set([
  'read_file',
  'glob',
  'grep',
  'list_dir',
  'webfetch',
  'todo_read',
  'todo_write',
  'task',
  'cost_estimate',
  'drift_detect',
  'cloud_discover',
]);

/**
 * Set of tool names blocked in `build` mode.
 *
 * Build mode allows reads and writes (file edits, code generation) but
 * blocks infrastructure-mutating operations that could affect live
 * environments.  The permission engine provides fine-grained control on
 * top of this coarse filter.
 */
const BUILD_MODE_BLOCKED_TOOLS = new Set(['terraform', 'kubectl', 'helm']);

/**
 * Filter tools based on the current agent mode.
 *
 * - **plan**: Only read-only tools + cost/drift analysis.
 * - **build**: All tools except infrastructure mutation commands.
 * - **deploy**: All tools are available.
 *
 * @param allTools - Every tool registered in the system.
 * @param mode - The active agent mode.
 * @returns The subset of tools available in the given mode.
 */
export function getToolsForMode(allTools: ToolDefinition[], mode: AgentMode): ToolDefinition[] {
  switch (mode) {
    case 'plan':
      return allTools.filter(t => PLAN_MODE_TOOLS.has(t.name));

    case 'build':
      return allTools.filter(t => !BUILD_MODE_BLOCKED_TOOLS.has(t.name));

    case 'deploy':
      // All tools available
      return allTools;

    default: {
      // Exhaustive check -- if a new mode is added this becomes a compile
      // error (assuming AgentMode is a union type).
      const _exhaustive: never = mode;
      return allTools;
    }
  }
}
