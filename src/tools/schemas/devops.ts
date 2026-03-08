/**
 * DevOps Tool Definitions
 *
 * Defines the 12 DevOps-specific tools available to the Nimbus agentic loop.
 * Each tool wraps existing infrastructure operations from `src/tools/` modules
 * or invokes the appropriate CLI via child_process.
 *
 * Tools:
 *   terraform, kubectl, helm, cloud_discover, cost_estimate,
 *   drift_detect, deploy_preview, terraform_plan_analyze,
 *   kubectl_context, helm_values, git, task
 *
 * @module tools/schemas/devops
 */

import { z } from 'zod';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, unlinkSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import type { ToolDefinition, ToolResult } from './types';
import { spawnExec } from '../spawn-exec';

const execAsync = promisify(exec);

/** GAP-20: Default timeout for spawnExec calls (10 minutes). */
const DEFAULT_TIMEOUT = 600_000;

/** GAP-26: Map from cwd → plan file path, for terraform plan → apply workflow */
const terraformPlanFiles = new Map<string, string>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a successful ToolResult. */
function ok(output: string): ToolResult {
  return { output, isError: false };
}

/** Build an error ToolResult. */
function err(message: string): ToolResult {
  return { output: '', error: message, isError: true };
}

/**
 * Extract a readable message from an unknown error value. If the error
 * originates from `child_process.exec` it may carry `stdout` / `stderr`
 * properties that provide richer context than `message` alone.
 */
function errorMessage(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'stdout' in error) {
    const execErr = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    const combined = [execErr.stdout, execErr.stderr].filter(Boolean).join('\n');
    return combined || execErr.message || 'Command failed';
  }
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// H6: Output formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format `kubectl get pods` tabular output with status emoji indicators.
 * Prefixes each pod row with [OK] (Running), [!!](Pending/Init), [XX] (Error/CrashLoop).
 */
export function formatKubectlPodsOutput(raw: string): string {
  const lines = raw.split('\n');
  const result: string[] = [];
  for (const line of lines) {
    if (!line.trim() || line.startsWith('NAME')) {
      result.push(line);
      continue;
    }
    const cols = line.trim().split(/\s+/);
    // Status is typically the 3rd column in `kubectl get pods` output
    const status = cols[2] ?? '';
    let emoji: string;
    if (/Running/i.test(status)) {
      emoji = '[OK]';
    } else if (/Pending|Init:|ContainerCreating|PodInitializing/i.test(status)) {
      emoji = '[!!]';
    } else if (/Error|CrashLoop|OOMKilled|Evicted|Failed|ImagePullBackOff|ErrImagePull/i.test(status)) {
      emoji = '[XX]';
    } else if (/Completed|Succeeded/i.test(status)) {
      emoji = '[OK]';
    } else if (/Terminating/i.test(status)) {
      emoji = '[!!]';
    } else {
      emoji = '  ';
    }
    result.push(`${emoji} ${line}`);
  }
  return result.join('\n');
}

/**
 * Format `helm list -o json` output into a human-readable list with ASCII status icons.
 */
export function formatHelmListOutput(raw: string): string {
  try {
    const releases = JSON.parse(raw) as Array<{
      name: string;
      namespace: string;
      revision: string;
      status: string;
      chart: string;
      app_version: string;
      updated: string;
    }>;
    if (!Array.isArray(releases) || releases.length === 0) return 'No Helm releases found.';
    const lines = releases.map(r => {
      let emoji: string;
      const s = r.status?.toLowerCase() ?? '';
      if (s === 'deployed') emoji = '[OK]';
      else if (s === 'pending-install' || s === 'pending-upgrade') emoji = '[!!]';
      else if (s === 'failed') emoji = '[XX]';
      else if (s === 'superseded') emoji = '[~~]';
      else emoji = '  ';
      return `${emoji} ${r.name} (${r.namespace}) — ${r.chart} rev.${r.revision} [${r.status}]`;
    });
    return lines.join('\n');
  } catch {
    return raw;
  }
}

/**
 * Check if a Terraform workdir uses a remote backend (cloud {} or backend "remote").
 * If so, returns a warning message; otherwise null.
 */
async function checkRemoteBackend(workdir: string): Promise<string | null> {
  try {
    const { readdir, readFile } = await import('node:fs/promises');
    const { join: joinPath } = await import('node:path');
    const entries = await readdir(workdir);
    const tfFiles = entries.filter(f => f.endsWith('.tf'));
    for (const file of tfFiles) {
      const fileContent = await readFile(joinPath(workdir, file), 'utf-8');
      if (/^\s*(cloud|backend\s+"remote")\s*\{/m.test(fileContent)) {
        return 'Remote backend detected — this operation affects shared state. Ensure you have the correct permissions and workspace selected.';
      }
    }
  } catch { /* ignore FS errors */ }
  return null;
}

// ---------------------------------------------------------------------------
// 1. terraform
// ---------------------------------------------------------------------------

const terraformSchema = z.object({
  action: z
    .enum([
      'init', 'plan', 'apply', 'validate', 'fmt', 'destroy', 'import',
      'state', 'state-list', 'state-show', 'state-rm', 'state-mv',
      'output', 'workspace-list', 'workspace-select', 'workspace-new',
      'providers', 'graph', 'force-unlock',
    ])
    .describe('The Terraform sub-command to run'),
  workdir: z.string().describe('Working directory containing the Terraform configuration'),
  args: z.string().optional().describe('Additional CLI arguments'),
  var_file: z.string().optional().describe('Path to a .tfvars variable file'),
  state_address: z.string().optional().describe('Resource address for state operations (e.g., "aws_instance.example")'),
  workspace: z.string().optional().describe('Workspace name for workspace-select/workspace-new'),
  output_name: z.string().optional().describe('Output name for terraform output (omit for all outputs)'),
  lock_id: z.string().optional().describe('Lock ID for force-unlock'),
  env: z.record(z.string(), z.string()).optional().describe('Extra environment variables (e.g., AWS_PROFILE, TF_WORKSPACE)'),
});

export const terraformTool: ToolDefinition = {
  name: 'terraform',
  description:
    'Execute Terraform operations. Supports init, plan, apply, validate, fmt, destroy, import, state, output, workspace, providers, graph, and force-unlock commands.',
  inputSchema: terraformSchema,
  permissionTier: 'always_ask',
  category: 'devops',
  isDestructive: true,

  async execute(raw: unknown, ctx?: import('./types').ToolExecuteContext): Promise<ToolResult> {
    try {
      const input = terraformSchema.parse(raw);

      // C2: If no workspace specified but session has a workspace context, note it in output
      const sessionWorkspace = ctx?.infraContext?.terraformWorkspace;

      // C3: Auto-apply session terraform workspace if set and user didn't specify one
      const WORKSPACE_STATEFUL_ACTIONS = ['plan', 'apply', 'validate', 'show', 'output'];
      if (sessionWorkspace && !input.workspace && WORKSPACE_STATEFUL_ACTIONS.includes(input.action)) {
        try {
          await execAsync(
            `terraform -chdir=${input.workdir} workspace select ${sessionWorkspace}`,
            { timeout: 30_000, maxBuffer: 1024 * 1024 }
          );
        } catch {
          // Workspace may not exist yet — ignore and continue
        }
      }

      // For apply: run validate → plan first to catch errors early
      if (input.action === 'apply') {
        // Step 1: validate
        try {
          const { stdout: valOut, stderr: valErr } = await execAsync(
            `terraform -chdir=${input.workdir} validate -no-color`,
            { timeout: 60_000, maxBuffer: 2 * 1024 * 1024 }
          );
          const valCombined = [valOut, valErr].filter(Boolean).join('\n');
          if (valCombined.includes('Error:')) {
            return err(`Terraform validate failed — fix errors before applying:\n${valCombined}`);
          }
        } catch (valErr: unknown) {
          return err(`Terraform validate failed:\n${errorMessage(valErr)}`);
        }
      }

      // For destroy: require explicit confirmation keyword in args to prevent accidents
      if (input.action === 'destroy') {
        const prodIndicators = ['prod', 'production', 'prd', 'live'];
        const workdirLower = input.workdir.toLowerCase();
        const isProd = prodIndicators.some(p => workdirLower.includes(p));
        if (isProd && !input.args?.includes('--confirmed-destroy')) {
          return err(
            `SAFETY CHECK: Production environment detected in workdir "${input.workdir}".\n` +
            `To proceed with destroy, add "--confirmed-destroy" to args.\n` +
            `This is a safety guard against accidental production teardowns.`
          );
        }
      }

      // Build the terraform command
      let command: string;

      if (input.action === 'state-list') {
        command = `terraform -chdir=${input.workdir} state list${input.args ? ' ' + input.args : ''}`;
      } else if (input.action === 'state-show') {
        if (!input.state_address) return err('state-show requires state_address');
        command = `terraform -chdir=${input.workdir} state show "${input.state_address}"`;
      } else if (input.action === 'state-rm') {
        if (!input.state_address) return err('state-rm requires state_address');
        command = `terraform -chdir=${input.workdir} state rm "${input.state_address}"`;
      } else if (input.action === 'state-mv') {
        if (!input.state_address) return err('state-mv requires state_address (format: "source dest")');
        command = `terraform -chdir=${input.workdir} state mv ${input.state_address}`;
      } else if (input.action === 'state') {
        command = `terraform -chdir=${input.workdir} state${input.args ? ' ' + input.args : ' list'}`;
      } else if (input.action === 'output') {
        command = `terraform -chdir=${input.workdir} output -json${input.output_name ? ' ' + input.output_name : ''}`;
      } else if (input.action === 'workspace-list') {
        command = `terraform -chdir=${input.workdir} workspace list`;
      } else if (input.action === 'workspace-select') {
        if (!input.workspace) return err('workspace-select requires workspace name');
        command = `terraform -chdir=${input.workdir} workspace select "${input.workspace}"`;
      } else if (input.action === 'workspace-new') {
        if (!input.workspace) return err('workspace-new requires workspace name');
        command = `terraform -chdir=${input.workdir} workspace new "${input.workspace}"`;
      } else if (input.action === 'providers') {
        command = `terraform -chdir=${input.workdir} providers`;
      } else if (input.action === 'graph') {
        command = `terraform -chdir=${input.workdir} graph${input.args ? ' ' + input.args : ''}`;
      } else if (input.action === 'force-unlock') {
        if (!input.lock_id) return err('force-unlock requires lock_id');
        command = `terraform -chdir=${input.workdir} force-unlock -force "${input.lock_id}"`;
      } else {
        const parts: string[] = ['terraform', `-chdir=${input.workdir}`, input.action];

        if (input.var_file) {
          parts.push(`-var-file=${input.var_file}`);
        }

        // Auto-approve for apply/destroy -- the permission engine handles
        // user confirmation before execute() is ever called.
        if (input.action === 'apply' || input.action === 'destroy') {
          parts.push('-auto-approve');
        }

        // Add -no-color for cleaner output in non-TTY contexts.
        if (['plan', 'apply', 'destroy', 'init'].includes(input.action)) {
          parts.push('-no-color');
        }

        // GAP-26: For plan, save the plan to a file so apply can use it
        if (input.action === 'plan') {
          const planFilePath = pathJoin(input.workdir, '.nimbus-plan');
          parts.push(`-out=.nimbus-plan`);
          terraformPlanFiles.set(input.workdir, planFilePath);
        }

        // GAP-26: For apply, use the saved plan file if available
        if (input.action === 'apply') {
          const planFile = terraformPlanFiles.get(input.workdir);
          if (planFile && existsSync(planFile)) {
            // Replace the apply command with one that uses the plan file
            // Remove the -auto-approve flag since plan files don't need it
            const applyIdx = parts.indexOf('-auto-approve');
            if (applyIdx !== -1) parts.splice(applyIdx, 1);
            parts.push(planFile);
          }
        }

        if (input.args) {
          // Strip our internal safety flag before passing to terraform
          const cleanedArgs = input.args.replace('--confirmed-destroy', '').trim();
          if (cleanedArgs) {
            parts.push(cleanedArgs);
          }
        }
        command = parts.join(' ');
      }

      const spawnResult = await spawnExec(command, {
        cwd: input.workdir,
        env: { ...process.env, ...(input.env ?? {}) } as NodeJS.ProcessEnv,
        onChunk: ctx?.onProgress,
        timeout: ctx?.timeout ?? DEFAULT_TIMEOUT, // GAP-20: per-tool timeout from NIMBUS.md, else 10 min default
      });

      if (spawnResult.exitCode !== 0) {
        // GAP-26: Clean up plan file on apply failure
        if (input.action === 'apply') {
          const planFile = terraformPlanFiles.get(input.workdir);
          if (planFile) {
            terraformPlanFiles.delete(input.workdir);
            try { unlinkSync(planFile); } catch { /* ignore */ }
          }
        }
        const combinedErr = [spawnResult.stdout, spawnResult.stderr].filter(Boolean).join('\n');
        // Check for state lock error — extract Lock ID for force-unlock hint (M1 / G14)
        const lockMatch = combinedErr.match(/Lock Info[\s\S]*?ID:\s*([a-f0-9-]+)/);
        if (lockMatch) {
          return err(`${combinedErr}\n\nHINT: State is locked. To unlock: terraform force-unlock ${lockMatch[1]}`);
        }
        // G14: Also detect direct "Lock  ID:" line format from terraform output
        const lockIdMatch = combinedErr.match(/Lock\s+ID:\s*([a-f0-9-]{36})/i);
        if (lockIdMatch) {
          return err(`${combinedErr}\n\n[STATE LOCK DETECTED] Lock ID: ${lockIdMatch[1]}\nTo force-unlock: terraform force-unlock ${lockIdMatch[1]}\nWARNING: Only force-unlock if no other operations are running.`);
        }
        return err(`Terraform command failed:\n${combinedErr}`);
      }
      const combinedOut = [spawnResult.stdout, spawnResult.stderr].filter(Boolean).join('\n');

      // GAP-26: Clean up plan file after successful apply
      if (input.action === 'apply') {
        const planFile = terraformPlanFiles.get(input.workdir);
        if (planFile) {
          terraformPlanFiles.delete(input.workdir);
          try { unlinkSync(planFile); } catch { /* ignore */ }
        }
      }

      // Check for remote backend before mutating actions (M1)
      if (['apply', 'destroy', 'import', 'state-rm'].includes(input.action)) {
        const remoteWarning = await checkRemoteBackend(input.workdir);
        if (remoteWarning) {
          return ok(`${remoteWarning}\n\n${combinedOut || '(no output)'}`);
        }
      }

      // C3: Update session infraContext with the new workspace
      if ((input.action === 'workspace-select' || input.action === 'workspace-new') && input.workspace) {
        ctx?.updateInfraContext?.({ terraformWorkspace: input.workspace });
      }

      return ok(combinedOut || '(no output)');
    } catch (error: unknown) {
      return err(`Terraform command failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 2. kubectl
// ---------------------------------------------------------------------------

const kubectlSchema = z.object({
  action: z
    .enum([
      'get', 'apply', 'delete', 'logs', 'scale', 'rollout', 'exec', 'describe',
      'patch', 'port-forward', 'cp', 'top', 'label', 'annotate',
      'cordon', 'drain', 'taint', 'wait', 'diff', 'events', 'watch',
    ])
    .describe('The kubectl sub-command to run'),
  resource: z.string().optional().describe('Resource type and/or name (e.g., "pods my-pod")'),
  namespace: z.string().optional().describe('Kubernetes namespace'),
  args: z.string().optional().describe('Additional CLI arguments'),
  patch_type: z.enum(['strategic', 'merge', 'json']).optional().describe('Patch type for patch action'),
  patch: z.string().optional().describe('JSON patch string for patch action'),
  local_path: z.string().optional().describe('Local path for cp action'),
  container_path: z.string().optional().describe('Container path for cp action'),
  env: z.record(z.string(), z.string()).optional().describe('Extra environment variables (e.g., KUBECONFIG, AWS_PROFILE)'),
  watch_resource: z.string().optional().describe('Resource type to watch (e.g., "pods", "deployments")'),
  watch_timeout: z.string().optional().describe('Timeout for watch action (default: 5m)'),
});

export const kubectlTool: ToolDefinition = {
  name: 'kubectl',
  description: 'Execute kubectl operations against a Kubernetes cluster.',
  inputSchema: kubectlSchema,
  permissionTier: 'always_ask',
  category: 'devops',
  isDestructive: true,

  async execute(raw: unknown, ctx?: import('./types').ToolExecuteContext): Promise<ToolResult> {
    try {
      const input = kubectlSchema.parse(raw);

      // C2: Use session infraContext as kubectl context fallback
      const contextFlag = ctx?.infraContext?.kubectlContext
        ? `--context=${ctx.infraContext.kubectlContext} `
        : '';

      const parts: string[] = ['kubectl', input.action];

      // Special handling for new actions
      if (input.action === 'patch') {
        const patchType = input.patch_type ?? 'strategic';
        if (!input.patch) return err('patch action requires patch field with JSON patch string');
        if (input.resource) parts.push(input.resource);
        if (input.namespace) parts.push('-n', input.namespace);
        parts.push(`--type=${patchType}`);
        parts.push('-p', `'${input.patch}'`);
      } else if (input.action === 'port-forward') {
        if (input.resource) parts.push(input.resource);
        if (input.namespace) parts.push('-n', input.namespace);
        if (input.args) parts.push(input.args);
      } else if (input.action === 'cp') {
        if (input.local_path && input.container_path) {
          parts.push(input.local_path, input.container_path);
        } else {
          if (input.args) parts.push(input.args);
        }
      } else if (input.action === 'top') {
        if (input.resource) parts.push(input.resource);
        if (input.namespace) parts.push('-n', input.namespace);
        if (input.args) parts.push(input.args);
      } else if (input.action === 'cordon' || input.action === 'taint') {
        if (input.resource) parts.push(input.resource);
        if (input.args) parts.push(input.args);
      } else if (input.action === 'drain') {
        if (input.resource) parts.push(input.resource);
        parts.push('--ignore-daemonsets', '--delete-emptydir-data');
        if (input.args) parts.push(input.args);
      } else if (input.action === 'wait') {
        if (input.resource) parts.push(input.resource);
        if (input.namespace) parts.push('-n', input.namespace);
        if (input.args) parts.push(input.args);
        else parts.push('--for=condition=Ready', '--timeout=120s');
      } else if (input.action === 'diff') {
        // G12: kubectl diff — exit code 1 means diffs exist (not an error)
        const manifest = input.args || '-';
        const nsFlag = input.namespace ? `-n ${input.namespace}` : '';
        const diffCmd = ['kubectl', 'diff', '-f', manifest, nsFlag].filter(Boolean).join(' ');
        try {
          const { stdout: diffOut } = await execAsync(diffCmd, { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
          return ok(diffOut.trim() || 'No differences found — manifests match cluster state.');
        } catch (diffErr: unknown) {
          const execError = diffErr as { stdout?: string; stderr?: string; code?: number };
          // Exit code 1 with stdout = normal diff output (changes detected)
          if (execError.code === 1 && execError.stdout) return ok(execError.stdout.trim());
          return err(errorMessage(diffErr));
        }
      } else if (input.action === 'events') {
        const nsFlag = input.namespace ? `-n ${input.namespace}` : '--all-namespaces';
        parts.push(...['get', 'events', nsFlag, '--sort-by=.lastTimestamp'].filter(s => s !== ''));
      } else if (input.action === 'watch') {
        const resource = input.watch_resource ?? input.resource ?? 'pods';
        const nsFlag = input.namespace ? `-n ${input.namespace}` : '';
        const timeout = input.watch_timeout ?? '5m';
        const cmd = `kubectl get ${resource} ${nsFlag} --watch --timeout=${timeout} ${contextFlag}`.trim();
        try {
          const { stdout, stderr } = await execAsync(cmd, {
            timeout: 310_000,
            maxBuffer: 10 * 1024 * 1024,
          });
          return ok([stdout, stderr].filter(Boolean).join('\n') || '(watch completed)');
        } catch (e: unknown) {
          return ok(`Watch ended: ${errorMessage(e)}`);
        }
      } else {
        if (input.resource) {
          parts.push(input.resource);
        }
        if (input.namespace) {
          parts.push('-n', input.namespace);
        }
        if (input.args) {
          parts.push(input.args);
        }
      }

      const rawCommand = parts.join(' ');
      // C2: Inject kubectl context from session infraContext if not already specified
      const command = contextFlag && !rawCommand.includes('--context=')
        ? rawCommand.replace('kubectl ', `kubectl ${contextFlag}`)
        : rawCommand;
      const streamingActions = ['apply', 'delete', 'rollout', 'port-forward'];
      if (ctx?.onProgress && streamingActions.includes(input.action)) {
        const defaultKubectlTimeoutMs = input.action === 'port-forward' ? 300_000 : 120_000;
        const timeoutMs = ctx?.timeout ?? defaultKubectlTimeoutMs; // GAP-20: per-tool timeout from NIMBUS.md
        const result = await spawnExec(command, { onChunk: ctx.onProgress, timeout: timeoutMs });
        const combined = [result.stdout, result.stderr].filter(Boolean).join('\n');
        if (result.exitCode !== 0) return err(`kubectl command failed:\n${combined}`);
        return ok(combined || '(no output)');
      }
      const cmdEnv = { ...process.env, ...(input.env ?? {}) } as NodeJS.ProcessEnv;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
        env: cmdEnv,
      });

      let combined = [stdout, stderr].filter(Boolean).join('\n');
      // H6: Format pod output with status emoji for scannability
      if (input.action === 'get' && input.resource && /\bpods?\b/i.test(input.resource)) {
        combined = formatKubectlPodsOutput(combined);
      }
      return ok(combined || '(no output)');
    } catch (error: unknown) {
      return err(`kubectl command failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 3. helm
// ---------------------------------------------------------------------------

const helmSchema = z.object({
  action: z
    .enum([
      'install', 'upgrade', 'uninstall', 'list', 'rollback', 'template', 'lint',
      'secrets-encrypt', 'secrets-decrypt', 'secrets-view',
      'get-values', 'get-manifest', 'get-all', 'get-hooks', 'status', 'history',
      'test', 'repo-add', 'repo-update', 'repo-list', 'search-repo',
      'show-chart', 'show-values',
    ])
    .describe('The Helm sub-command to run'),
  release: z.string().optional().describe('Helm release name'),
  chart: z.string().optional().describe('Chart reference (e.g., "bitnami/nginx")'),
  values: z.string().optional().describe('Path to a values.yaml or SOPS-encrypted values file'),
  namespace: z.string().optional().describe('Kubernetes namespace for the release'),
  revision: z.number().optional().describe('Release revision number (for history/rollback)'),
  repo_name: z.string().optional().describe('Helm repo name (for repo-add)'),
  repo_url: z.string().optional().describe('Helm repo URL (for repo-add)'),
  env: z.record(z.string(), z.string()).optional().describe('Extra environment variables passed to helm'),
});

/** Last time `helm repo update` was auto-run (prevents repeated runs). */
let lastHelmRepoUpdate = 0;
const HELM_REPO_UPDATE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export const helmTool: ToolDefinition = {
  name: 'helm',
  description: 'Execute Helm operations for Kubernetes package management.',
  inputSchema: helmSchema,
  permissionTier: 'always_ask',
  category: 'devops',
  isDestructive: true,

  async execute(raw: unknown, ctx?: import('./types').ToolExecuteContext): Promise<ToolResult> {
    try {
      const input = helmSchema.parse(raw);

      // M5: Helm secrets plugin actions (SOPS-encrypted values)
      if (input.action === 'secrets-encrypt' || input.action === 'secrets-decrypt' || input.action === 'secrets-view') {
        const file = input.values;
        if (!file) return err('helm secrets requires a values file path (values field)');
        const secretsAction = input.action.replace('secrets-', '');
        const command = `helm secrets ${secretsAction} ${file}`;
        const { stdout, stderr } = await execAsync(command, {
          timeout: 60_000,
          maxBuffer: 5 * 1024 * 1024,
        });
        return ok([stdout, stderr].filter(Boolean).join('\n') || '(no output)');
      }

      // New introspection/repo actions
      if (['get-values', 'get-manifest', 'get-all', 'get-hooks'].includes(input.action)) {
        if (!input.release) return err(`${input.action} requires a release name`);
        const subCmd = input.action.replace('get-', 'get ');
        const nsFlag = input.namespace ? ` -n ${input.namespace}` : '';
        const { stdout: getOut, stderr: getErr } = await execAsync(
          `helm ${subCmd} ${input.release}${nsFlag}`,
          { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }
        );
        return ok([getOut, getErr].filter(Boolean).join('\n') || '(no output)');
      }
      if (input.action === 'status') {
        if (!input.release) return err('status requires a release name');
        const nsFlag = input.namespace ? ` -n ${input.namespace}` : '';
        const { stdout: statusOut, stderr: statusErr } = await execAsync(
          `helm status ${input.release}${nsFlag}`,
          { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }
        );
        return ok([statusOut, statusErr].filter(Boolean).join('\n') || '(no output)');
      }
      if (input.action === 'history') {
        if (!input.release) return err('history requires a release name');
        const nsFlag = input.namespace ? ` -n ${input.namespace}` : '';
        try {
          const { stdout: histOut } = await execAsync(
            `helm history ${input.release}${nsFlag} --max 10 --output json`,
            { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }
          );
          const histData: Array<{revision: number; updated: string; status: string; chart: string; description: string}> = JSON.parse(histOut || '[]');
          const lines = histData.map(h => `  Rev ${h.revision}: ${h.chart} [${h.status}] ${h.updated} — ${h.description}`);
          return ok(`Release history for ${input.release}:\n${lines.join('\n')}`);
        } catch {
          const { stdout: histOut2, stderr: histErr2 } = await execAsync(
            `helm history ${input.release}${nsFlag}`,
            { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }
          );
          return ok([histOut2, histErr2].filter(Boolean).join('\n') || '(no output)');
        }
      }
      if (input.action === 'test') {
        if (!input.release) return err('test requires a release name');
        const nsFlag = input.namespace ? ` -n ${input.namespace}` : '';
        const { stdout: testOut, stderr: testErr } = await execAsync(
          `helm test ${input.release}${nsFlag}`,
          { timeout: 120_000, maxBuffer: 5 * 1024 * 1024 }
        );
        return ok([testOut, testErr].filter(Boolean).join('\n') || '(no output)');
      }
      if (input.action === 'repo-add') {
        if (!input.repo_name || !input.repo_url) return err('repo-add requires repo_name and repo_url');
        const { stdout: raOut, stderr: raErr } = await execAsync(
          `helm repo add ${input.repo_name} ${input.repo_url}`,
          { timeout: 30_000, maxBuffer: 1 * 1024 * 1024 }
        );
        return ok([raOut, raErr].filter(Boolean).join('\n') || '(no output)');
      }
      if (input.action === 'repo-update') {
        const { stdout: ruOut, stderr: ruErr } = await execAsync(
          'helm repo update',
          { timeout: 60_000, maxBuffer: 2 * 1024 * 1024 }
        );
        return ok([ruOut, ruErr].filter(Boolean).join('\n') || '(no output)');
      }
      if (input.action === 'repo-list') {
        const { stdout: rlOut, stderr: rlErr } = await execAsync(
          'helm repo list --output json',
          { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 }
        );
        return ok([rlOut, rlErr].filter(Boolean).join('\n') || '(no repos configured)');
      }
      if (input.action === 'search-repo') {
        const query = input.chart ?? input.release ?? '';
        if (!query) return err('search-repo requires chart or release field as search term');
        const { stdout: srOut, stderr: srErr } = await execAsync(
          `helm search repo ${query}`,
          { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 }
        );
        return ok([srOut, srErr].filter(Boolean).join('\n') || '(no results)');
      }
      if (input.action === 'show-chart' || input.action === 'show-values') {
        const target = input.chart ?? input.release;
        if (!target) return err(`${input.action} requires chart or release field`);
        const subCmd = input.action === 'show-chart' ? 'chart' : 'values';
        const { stdout: showOut, stderr: showErr } = await execAsync(
          `helm show ${subCmd} ${target}`,
          { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }
        );
        return ok([showOut, showErr].filter(Boolean).join('\n') || '(no output)');
      }

      // H6: helm list — use JSON output for formatted display
      if (input.action === 'list') {
        const nsFlag = input.namespace ? ` -n ${input.namespace}` : ' -A';
        try {
          const { stdout: listJson } = await execAsync(`helm list -o json${nsFlag}`, {
            timeout: 30_000,
            maxBuffer: 5 * 1024 * 1024,
          });
          return ok(formatHelmListOutput(listJson));
        } catch {
          // Fall through to plain helm list
          const { stdout: listOut, stderr: listErr } = await execAsync(`helm list${nsFlag}`, {
            timeout: 30_000,
            maxBuffer: 5 * 1024 * 1024,
          });
          return ok([listOut, listErr].filter(Boolean).join('\n') || '(no releases found)');
        }
      }

      // G17: Auto-update helm repos if cache is stale (>1 hour) before install/upgrade
      if ((input.action === 'install' || input.action === 'upgrade') && Date.now() - lastHelmRepoUpdate > HELM_REPO_UPDATE_INTERVAL_MS) {
        try {
          await execAsync('helm repo update', { timeout: 30000 });
          lastHelmRepoUpdate = Date.now();
        } catch { /* non-critical — proceed with install/upgrade */ }
      }

      const parts: string[] = ['helm', input.action];

      if (input.release) {
        parts.push(input.release);
      }

      if (input.chart) {
        parts.push(input.chart);
      }

      if (input.values) {
        parts.push('-f', input.values);
      }

      if (input.namespace) {
        parts.push('-n', input.namespace);
      }

      const command = parts.join(' ');
      // G10: stream output for long-running helm actions so users see progress
      const HELM_STREAMING_ACTIONS = new Set(['install', 'upgrade', 'rollback', 'uninstall']);
      if (HELM_STREAMING_ACTIONS.has(input.action)) {
        const { stdout: sout, stderr: serr } = await spawnExec(command, {
          onChunk: ctx?.onProgress,
          timeout: ctx?.timeout ?? DEFAULT_TIMEOUT, // GAP-20: per-tool timeout from NIMBUS.md, else 10 min default
        });
        const combined = [sout, serr].filter(Boolean).join('\n');
        return ok(combined.trim() || '(no output)');
      }
      const helmEnv = { ...process.env, ...(input.env ?? {}) } as NodeJS.ProcessEnv;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 300_000, // 5 minutes
        maxBuffer: 10 * 1024 * 1024,
        env: helmEnv,
      });

      const combined = [stdout, stderr].filter(Boolean).join('\n');
      return ok(combined || '(no output)');
    } catch (error: unknown) {
      return err(`Helm command failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 4. cloud_discover
// ---------------------------------------------------------------------------

const cloudDiscoverSchema = z.object({
  provider: z.enum(['aws', 'gcp', 'azure']).describe('Cloud provider to discover resources from'),
  resource_type: z
    .string()
    .describe(
      'Full CLI service and command for the provider. AWS: "ec2 describe-instances", "s3api list-buckets", "rds describe-db-instances", "lambda list-functions", "eks list-clusters". GCP: "compute instances list", "container clusters list". Azure: "vm list".'
    ),
  region: z.string().optional().describe('Cloud region to scope the discovery'),
  regions: z.array(z.string()).optional().describe('Multiple regions for parallel discovery (max 5 concurrent)'),
});

export const cloudDiscoverTool: ToolDefinition = {
  name: 'cloud_discover',
  description:
    'Discover cloud resources across AWS, GCP, or Azure. Returns a list of resources of the specified type.',
  inputSchema: cloudDiscoverSchema,
  permissionTier: 'auto_allow',
  category: 'devops',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = cloudDiscoverSchema.parse(raw);

      // H2: Multi-region parallel discovery
      const targetRegions = input.regions && input.regions.length > 0
        ? input.regions.slice(0, 10) // cap at 10 regions
        : input.region ? [input.region] : [undefined];

      if (targetRegions.length > 1) {
        // Run up to 5 regions concurrently
        const concurrencyLimit = 5;
        const allResults: string[] = [];
        for (let i = 0; i < targetRegions.length; i += concurrencyLimit) {
          const chunk = targetRegions.slice(i, i + concurrencyLimit);
          const chunkResults = await Promise.allSettled(
            chunk.map(async (region) => {
              let cmd: string;
              switch (input.provider) {
                case 'aws': {
                  const rf = region ? ` --region ${region}` : '';
                  cmd = `aws ${input.resource_type}${rf} --output json`;
                  break;
                }
                case 'gcp': {
                  const rf = region ? ` --regions=${region}` : '';
                  cmd = `gcloud ${input.resource_type}${rf} --format json`;
                  break;
                }
                case 'azure': {
                  cmd = `az ${input.resource_type} list --output json`;
                  break;
                }
                default:
                  cmd = '';
              }
              const { stdout, stderr } = await execAsync(cmd, { timeout: 60_000, maxBuffer: 5 * 1024 * 1024 });
              return { region: region ?? 'default', output: [stdout, stderr].filter(Boolean).join('\n') };
            })
          );
          for (const res of chunkResults) {
            if (res.status === 'fulfilled') {
              allResults.push(`\n## Region: ${res.value.region}\n${res.value.output}`);
            } else {
              allResults.push(`\n## Region: ${chunk[chunkResults.indexOf(res)]} — Error: ${res.reason}`);
            }
          }
        }
        return ok(allResults.join('\n') || 'No resources found across specified regions.');
      }

      let command: string;

      switch (input.provider) {
        case 'aws': {
          const regionFlag = input.region ? ` --region ${input.region}` : '';
          // resource_type is the full service+command, e.g. "ec2 describe-instances", "s3api list-buckets"
          command = `aws ${input.resource_type}${regionFlag} --output json`;
          break;
        }
        case 'gcp': {
          const regionFlag = input.region ? ` --regions=${input.region}` : '';
          // resource_type is the full subcommand, e.g. "compute instances list", "container clusters list"
          command = `gcloud ${input.resource_type}${regionFlag} --format json`;
          break;
        }
        case 'azure': {
          command = `az ${input.resource_type} list --output json`;
          break;
        }
      }

      const { stdout, stderr } = await execAsync(command, {
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const combined = [stdout, stderr].filter(Boolean).join('\n');

      // Parse and summarize JSON output for readability
      try {
        const data = JSON.parse(combined);
        const items = Array.isArray(data) ? data : (data.Reservations ? data.Reservations.flatMap((r: { Instances?: unknown[] }) => r.Instances ?? []) : [data]);
        if (items.length === 0) {
          return ok('No resources found.');
        }

        // Build structured per-resource-type summary
        const summary = items.slice(0, 50).map((item: Record<string, unknown>) => {
          // Security flags
          const securityFlags: string[] = [];

          // EC2 instance formatter
          if (item.InstanceId || item.InstanceType) {
            const name = (item.Tags as Array<{ Key: string; Value: string }>)?.find(t => t.Key === 'Name')?.Value ?? item.InstanceId ?? '(unnamed)';
            const state = (item.State as Record<string, unknown>)?.Name ?? item.state ?? '';
            const az = (item.Placement as Record<string, unknown>)?.AvailabilityZone ?? '';
            const publicIp = item.PublicIpAddress ?? '';
            const privateIp = item.PrivateIpAddress ?? '';
            const sgs = (item.SecurityGroups as Array<Record<string, unknown>> | undefined) ?? [];
            if (sgs.length > 0) securityFlags.push('check-sg-rules');
            const flagStr = securityFlags.length > 0 ? ` [${securityFlags.join(', ')}]` : '';
            return `  - EC2: ${name} (${item.InstanceType ?? ''}) ${state}${az ? ` [${az}]` : ''}${publicIp ? ` pub:${publicIp}` : ''}${privateIp ? ` priv:${privateIp}` : ''}${flagStr}`;
          }
          // RDS formatter
          if (item.DBInstanceIdentifier) {
            const id = item.DBInstanceIdentifier as string;
            const engine = `${item.Engine ?? ''}${item.EngineVersion ? ' ' + item.EngineVersion : ''}`;
            const status = item.DBInstanceStatus ?? '';
            const multiAz = item.MultiAZ ? 'Multi-AZ' : 'Single-AZ';
            const endpoint = (item.Endpoint as Record<string, unknown>)?.Address ?? '';
            if (!item.StorageEncrypted) securityFlags.push('unencrypted');
            const flagStr = securityFlags.length > 0 ? ` [${securityFlags.join(', ')}]` : '';
            return `  - RDS: ${id} (${engine}) ${status} ${multiAz}${endpoint ? ` -> ${endpoint}` : ''}${flagStr}`;
          }
          // EKS formatter
          if ((item.arn && String(item.arn).includes(':cluster/')) || (item.ClusterName && item.kubernetesNetworkConfig)) {
            const name = item.name ?? item.ClusterName ?? '(unnamed)';
            const version = item.version ?? item.Version ?? '';
            const status = item.status ?? item.Status ?? '';
            return `  - EKS: ${name} (k8s ${version}) ${status}`;
          }
          // S3 formatter
          if (item.BucketName || (item.Name && !item.InstanceType && !item.DBInstanceIdentifier)) {
            const name = item.BucketName ?? item.Name ?? '(unnamed)';
            const region = item.LocationConstraint ?? item.region ?? '';
            if (item.PublicAccessBlockConfiguration && !(item.PublicAccessBlockConfiguration as Record<string, unknown>).BlockPublicAcls) {
              securityFlags.push('public-access');
            }
            const flagStr = securityFlags.length > 0 ? ` [${securityFlags.join(', ')}]` : '';
            return `  - S3: ${name}${region ? ` [${region}]` : ''}${flagStr}`;
          }
          // GCE formatter
          if (item.machineType || (item.kind && String(item.kind).includes('Instance'))) {
            const name = item.name ?? '(unnamed)';
            const machineType = String(item.machineType ?? '').split('/').pop() ?? '';
            const status = item.status ?? '';
            const zone = String(item.zone ?? '').split('/').pop() ?? '';
            const networkInterfaces = item.networkInterfaces as Array<Record<string, unknown>> | undefined;
            const extIp = networkInterfaces?.[0]?.accessConfigs
              ? (networkInterfaces[0].accessConfigs as Array<Record<string, unknown>>)?.[0]?.natIP ?? ''
              : '';
            return `  - GCE: ${name} (${machineType}) ${status}${zone ? ` [${zone}]` : ''}${extIp ? ` pub:${extIp}` : ''}`;
          }
          // AKS formatter
          if (item.type && String(item.type).includes('managedClusters')) {
            const name = item.name ?? '(unnamed)';
            const location = item.location ?? '';
            const k8sVersion = (item.properties as Record<string, unknown>)?.kubernetesVersion ?? '';
            const agentCount = ((item.properties as Record<string, unknown>)?.agentPoolProfiles as unknown[])?.length ?? 0;
            return `  - AKS: ${name} (k8s ${k8sVersion}) ${location ? `[${location}]` : ''} ${agentCount} agent pool(s)`;
          }
          // Generic fallback
          const name =
            (item.Tags as Array<{ Key: string; Value: string }>)?.find((t) => t.Key === 'Name')?.Value ||
            item.DBInstanceIdentifier || item.FunctionName || item.ClusterName || item.BucketName ||
            item.Name || item.name || (item.metadata as Record<string, unknown>)?.name ||
            item.InstanceId || item.id || '(unnamed)';
          const type = item.InstanceType || item.DBInstanceClass || item.Runtime || item.Status || item.state || item.status || '';
          const region = (item.Placement as Record<string, unknown>)?.AvailabilityZone || (item.DBInstanceArn as string | undefined)?.split(':')[3] || item.region || '';
          return `  - ${name}${type ? ` (${type})` : ''}${region ? ` [${region}]` : ''}`;
        });

        return ok(
          `Found ${items.length} resource(s):\n${summary.join('\n')}` +
          (items.length > 50 ? `\n\n[+${items.length - 50} more — use specific region/filter to narrow]` : '')
        );
      } catch {
        // Not JSON or failed to parse — return raw output truncated
        return ok((combined || '(no resources found)').slice(0, 10_000));
      }
    } catch (error: unknown) {
      return err(`Cloud discovery failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 5. cost_estimate
// ---------------------------------------------------------------------------

const costEstimateSchema = z.object({
  plan_file: z.string().optional().describe('Path to a saved Terraform plan file'),
  workdir: z.string().optional().describe('Working directory containing Terraform configuration'),
  action: z.enum(['estimate', 'compare', 'savings-plan', 'rightsizing', 'budget'])
    .optional().default('estimate').describe('Cost action to perform (default: estimate)'),
  provider: z.enum(['aws', 'gcp', 'azure']).optional().describe('Cloud provider for savings/rightsizing/budget actions'),
  region: z.string().optional().describe('Cloud region for budget/savings queries'),
  /** Gap 13: target compute platform for non-Terraform estimates */
  target: z.enum(['terraform', 'kubernetes', 'ecs', 'lambda', 'gcp-gke', 'azure-aks'])
    .optional().default('terraform').describe('Target platform for cost estimation (default: terraform)'),
  namespace: z.string().optional().describe('Kubernetes namespace for k8s cost estimation'),
  function_name: z.string().optional().describe('Lambda function name for serverless cost estimation'),
});

export const costEstimateTool: ToolDefinition = {
  name: 'cost_estimate',
  description: 'Estimate infrastructure costs, compare across providers, check savings plans, rightsizing, or budgets.',
  inputSchema: costEstimateSchema,
  permissionTier: 'auto_allow',
  category: 'devops',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = costEstimateSchema.parse(raw);

      // M6: multi-cloud cost actions
      if (input.action === 'savings-plan') {
        const p = input.provider ?? 'aws';
        try {
          if (p === 'aws') {
            const { stdout } = await execAsync('aws ce get-savings-plans-utilization --time-period Start=$(date -v-30d +%Y-%m-%d),End=$(date +%Y-%m-%d) --output json', { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
            return ok(`AWS Savings Plans Utilization:\n${stdout.slice(0, 5000)}`);
          } else if (p === 'gcp') {
            const { stdout } = await execAsync('gcloud billing accounts list --format=json', { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
            return ok(`GCP Billing Accounts:\n${stdout.slice(0, 5000)}`);
          }
          return err(`Savings plan query not supported for provider: ${p}`);
        } catch (error) { return err(`Savings plan query failed: ${errorMessage(error)}`); }
      }

      if (input.action === 'rightsizing') {
        try {
          const { stdout } = await execAsync('aws ce get-rightsizing-recommendation --service AmazonEC2 --output json', { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
          return ok(`AWS Rightsizing Recommendations:\n${stdout.slice(0, 5000)}`);
        } catch (error) { return err(`Rightsizing query failed: ${errorMessage(error)}`); }
      }

      if (input.action === 'budget') {
        const p = input.provider ?? 'aws';
        try {
          if (p === 'aws') {
            const acct = (await execAsync('aws sts get-caller-identity --query Account --output text', { timeout: 10_000 })).stdout.trim();
            const { stdout } = await execAsync(`aws budgets describe-budgets --account-id ${acct} --output json`, { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
            return ok(`AWS Budgets:\n${stdout.slice(0, 5000)}`);
          } else if (p === 'gcp') {
            const { stdout } = await execAsync('gcloud billing budgets list --format=json', { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
            return ok(`GCP Budgets:\n${stdout.slice(0, 5000)}`);
          }
          return err(`Budget query not supported for provider: ${p}`);
        } catch (error) { return err(`Budget query failed: ${errorMessage(error)}`); }
      }

      if (input.action === 'compare') {
        // Run infracost for current workdir and summarize
        const cwd = input.workdir ?? '.';
        try {
          const { stdout } = await execAsync(`infracost breakdown --path ${cwd} --format json`, { timeout: 60_000, maxBuffer: 5 * 1024 * 1024 });
          const ic = JSON.parse(stdout);
          const lines = ['--- Multi-cloud Cost Comparison ---', '', `Current (${cwd}): $${parseFloat(ic.totalMonthlyCost ?? '0').toFixed(2)}/month`, '', 'To compare across providers, run infracost diff with alternative configs.'];
          return ok(lines.join('\n'));
        } catch { return ok('infracost not available. Install infracost for cross-provider cost comparison.'); }
      }

      // Gap 13: non-Terraform platform cost estimation
      if (input.target === 'kubernetes') {
        const nsFlag = input.namespace ? `-n ${input.namespace}` : '--all-namespaces';
        try {
          const { stdout } = await execAsync(`kubectl get pods ${nsFlag} -o json`, { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 });
          const data = JSON.parse(stdout);
          const pods = data.items ?? [];
          let cpuMillis = 0;
          let memMiB = 0;
          for (const pod of pods) {
            for (const container of (pod.spec?.containers ?? [])) {
              const req = container.resources?.requests ?? {};
              const cpu = req.cpu ?? '0';
              const mem = req.memory ?? '0';
              cpuMillis += cpu.endsWith('m') ? parseInt(cpu) : parseInt(cpu) * 1000;
              memMiB += mem.endsWith('Mi') ? parseInt(mem) : mem.endsWith('Gi') ? parseInt(mem) * 1024 : 0;
            }
          }
          const cpuCost = (cpuMillis / 1000) * 0.048 * 730; // ~$0.048/vCPU-hour * 730h/month
          const memCost = (memMiB / 1024) * 0.006 * 730;   // ~$0.006/GB-hour * 730h/month
          return ok([
            `Kubernetes Cost Estimate (${input.namespace ?? 'all namespaces'}):`,
            `  Pods: ${pods.length}`,
            `  CPU requests: ${cpuMillis}m = ${(cpuMillis / 1000).toFixed(2)} vCPU`,
            `  Memory requests: ${memMiB} MiB`,
            `  Estimated monthly cost: $${(cpuCost + memCost).toFixed(2)}/month`,
            `    (CPU: $${cpuCost.toFixed(2)} + Memory: $${memCost.toFixed(2)})`,
            '  Note: Actual cost depends on node type, region, and spot pricing.',
          ].join('\n'));
        } catch (error) { return err(`Kubernetes cost estimate failed: ${errorMessage(error)}`); }
      }

      if (input.target === 'ecs') {
        try {
          const taskFamily = input.workdir ?? 'all';
          const cmd = taskFamily === 'all'
            ? 'aws ecs list-task-definitions --output json'
            : `aws ecs describe-task-definition --task-definition ${taskFamily} --output json`;
          const { stdout } = await execAsync(cmd, { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
          return ok(`ECS Task Definition Info:\n${stdout.slice(0, 5000)}\n\nNote: Use AWS Pricing Calculator for exact Fargate costs based on vCPU and memory.`);
        } catch (error) { return err(`ECS cost estimate failed: ${errorMessage(error)}`); }
      }

      if (input.target === 'lambda') {
        const fn = input.function_name ?? input.workdir;
        if (!fn) return err('function_name required for Lambda cost estimation');
        try {
          const { stdout } = await execAsync(`aws lambda get-function-configuration --function-name ${fn} --output json`, { timeout: 15_000 });
          const cfg = JSON.parse(stdout);
          const memMB = cfg.MemorySize ?? 128;
          const timeout = cfg.Timeout ?? 3;
          return ok([
            `Lambda Cost Estimate: ${fn}`,
            `  Memory: ${memMB} MB`,
            `  Timeout: ${timeout}s`,
            `  Cost per 1M invocations (${memMB}MB, avg ${timeout}s): $${((memMB / 1024) * timeout * 0.0000166667 * 1_000_000).toFixed(2)}`,
            '  Free tier: 1M requests + 400,000 GB-seconds/month',
            '  Note: Actual cost depends on invocation count and average duration.',
          ].join('\n'));
        } catch (error) { return err(`Lambda cost estimate failed: ${errorMessage(error)}`); }
      }

      if (!input.plan_file && !input.workdir) {
        return err('Either plan_file or workdir must be provided.');
      }

      const cwd = input.workdir ?? '.';
      const planArg = input.plan_file ?? '';

      // Try infracost first (real dollar amounts)
      try {
        const targetFlag = planArg ? `--path ${planArg}` : `--path ${cwd}`;
        const { stdout: icOut } = await execAsync(
          `infracost breakdown ${targetFlag} --format json`,
          { timeout: 60_000, maxBuffer: 5 * 1024 * 1024 }
        );
        const ic = JSON.parse(icOut);
        const totalMonthly = parseFloat(ic.totalMonthlyCost ?? '0').toFixed(2);
        const diffMonthly = parseFloat(ic.diffTotalMonthlyCost ?? '0');
        const lines = [
          '--- Cost Estimate (Infracost) ---',
          `Monthly total:  $${totalMonthly}`,
          diffMonthly !== 0 ? `Monthly change: ${diffMonthly > 0 ? '+' : ''}$${diffMonthly.toFixed(2)}` : null,
          '',
          'By resource:',
          ...(ic.projects?.[0]?.resources ?? []).slice(0, 20).map((r: { name: string; monthlyCost?: string }) =>
            `  ${r.name}: $${parseFloat(r.monthlyCost ?? '0').toFixed(2)}/month`
          ),
        ].filter(Boolean);
        return ok(lines.join('\n'));
      } catch {
        // infracost not installed or failed — fall through to resource count
      }

      // Attempt to extract resource information from a Terraform plan.
      const showCommand = planArg
        ? `terraform show -json ${planArg}`
        : `terraform -chdir=${cwd} show -json`;

      const { stdout } = await execAsync(showCommand, {
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
      });

      // Parse the plan JSON to count resources.
      let resourceCount = 0;
      let resourceTypes: string[] = [];

      try {
        const plan = JSON.parse(stdout);
        const changes = plan?.resource_changes ?? [];
        resourceCount = changes.length;
        resourceTypes = [
          ...new Set(changes.map((r: { type?: string }) => r.type).filter(Boolean)),
        ] as string[];
      } catch {
        // If JSON parsing fails, fall back to a basic output.
        return ok(
          `Cost estimate (raw plan output):\n${stdout.slice(0, 5000)}` +
            '\n\nNote: Full cost estimation requires integration with a pricing API (e.g., Infracost).'
        );
      }

      // Built-in pricing lookup for common resource types
      const RESOURCE_PRICES: Record<string, number> = {
        'aws_instance': 30, 'aws_db_instance': 50, 'aws_s3_bucket': 5,
        'aws_nat_gateway': 32, 'aws_lb': 25, 'aws_alb': 25,
        'aws_eks_cluster': 73, 'aws_elasticache_cluster': 25,
        'aws_rds_cluster': 50, 'aws_lambda_function': 2,
        'aws_cloudfront_distribution': 10, 'aws_ecs_cluster': 30,
        'google_compute_instance': 30, 'google_container_cluster': 73,
        'google_sql_database_instance': 50, 'google_storage_bucket': 5,
        'azurerm_virtual_machine': 30, 'azurerm_kubernetes_cluster': 73,
        'azurerm_sql_database': 50, 'azurerm_storage_account': 5,
      };

      let estimatedMonthly = 0;
      const priceLines: string[] = [];
      for (const rt of resourceTypes) {
        const price = RESOURCE_PRICES[rt] ?? 5; // default $5 for unknown
        estimatedMonthly += price;
        priceLines.push(`  ${rt}: ~$${price}/month`);
      }

      const lines = [
        '--- Cost Estimate (Built-in Pricing Tables) ---',
        '',
        `Total resources: ${resourceCount}`,
        `Estimated monthly cost: ~$${estimatedMonthly}/month`,
        `Estimated annual cost:  ~$${estimatedMonthly * 12}/year`,
        '',
        'Resource estimates:',
        ...priceLines.slice(0, 20),
        '',
        'Note: For accurate cost estimates install Infracost (infracost.io) or use the AWS/GCP/Azure pricing calculators.',
        'Built-in prices are approximate 2025 on-demand rates for us-east-1.',
      ];

      return ok(lines.join('\n'));
    } catch (error: unknown) {
      return err(`Cost estimation failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 6. drift_detect
// ---------------------------------------------------------------------------

const driftDetectSchema = z.object({
  workdir: z.string().describe('Working directory containing IaC configuration'),
  provider: z
    .enum(['terraform', 'kubernetes', 'helm'])
    .optional()
    .default('terraform')
    .describe('IaC provider to check for drift (default: terraform)'),
});

export const driftDetectTool: ToolDefinition = {
  name: 'drift_detect',
  description: 'Detect infrastructure drift between desired state (IaC) and actual state.',
  inputSchema: driftDetectSchema,
  permissionTier: 'auto_allow',
  category: 'devops',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = driftDetectSchema.parse(raw);

      switch (input.provider) {
        case 'terraform': {
          // Exit code 0 = no changes, 1 = error, 2 = changes detected.
          const command = `terraform -chdir=${input.workdir} plan -detailed-exitcode -no-color`;

          try {
            const { stdout, stderr } = await execAsync(command, {
              timeout: 300_000,
              maxBuffer: 10 * 1024 * 1024,
            });
            const combined = [stdout, stderr].filter(Boolean).join('\n');
            return ok(`No drift detected.\n\n${combined}`);
          } catch (planError: unknown) {
            // Exit code 2 from terraform plan means drift was detected.
            if (
              planError !== null &&
              typeof planError === 'object' &&
              'code' in planError &&
              (planError as { code: number }).code === 2
            ) {
              const execErr = planError as { stdout?: string; stderr?: string };
              const output = [execErr.stdout, execErr.stderr].filter(Boolean).join('\n');
              return ok(`DRIFT DETECTED\n\n${output}`);
            }
            throw planError;
          }
        }

        case 'kubernetes': {
          const results: string[] = [];

          // Step 1: kubectl diff for locally-tracked manifests
          try {
            const { stdout: diffOut } = await execAsync(`kubectl diff -f ${input.workdir} 2>&1 || true`, {
              timeout: 120_000, maxBuffer: 10 * 1024 * 1024,
            });
            if (diffOut.trim()) {
              results.push('## Tracked Resource Drift (kubectl diff):\n' + diffOut);
            }
          } catch { /* ignore */ }

          // Step 2: Fetch live cluster resources to find untracked items
          const clusterResources: Record<string, Set<string>> = {};
          try {
            const { stdout: clusterJson } = await execAsync(
              'kubectl get all,configmap,ingress,pvc -A -o json 2>/dev/null',
              { timeout: 60_000, maxBuffer: 20 * 1024 * 1024 }
            );
            const clusterData = JSON.parse(clusterJson);
            for (const item of (clusterData.items ?? [])) {
              const kind: string = item.kind ?? 'Unknown';
              if (!clusterResources[kind]) clusterResources[kind] = new Set();
              clusterResources[kind].add(`${item.metadata?.namespace ?? 'default'}/${item.metadata?.name}`);
            }
          } catch { /* ignore kubectl errors */ }

          // Step 3: Parse local YAML files
          const localResources: Set<string> = new Set();
          try {
            const { readdirSync, readFileSync } = await import('node:fs');
            const { join: joinPath } = await import('node:path');
            // Simple YAML scanner for kind/name
            const scanDir = (dir: string): void => {
              try {
                for (const entry of readdirSync(dir, { withFileTypes: true })) {
                  const full = joinPath(dir, entry.name);
                  if (entry.isDirectory()) scanDir(full);
                  else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
                    const fileContent = readFileSync(full, 'utf-8');
                    const kindMatch = fileContent.match(/^kind:\s*(\S+)/m);
                    const nsMatch = fileContent.match(/^\s*namespace:\s*(\S+)/m);
                    const nameMatch = fileContent.match(/^\s*name:\s*(\S+)/m);
                    if (kindMatch && nameMatch) {
                      const ns = nsMatch?.[1] ?? 'default';
                      localResources.add(`${kindMatch[1]}/${ns}/${nameMatch[1]}`);
                    }
                  }
                }
              } catch { /* ignore */ }
            };
            scanDir(input.workdir);
          } catch { /* ignore */ }

          // Step 4: Find cluster resources not in local files
          const untracked: string[] = [];
          for (const [kind, names] of Object.entries(clusterResources)) {
            for (const ns_name of names) {
              const key = `${kind}/${ns_name}`;
              if (!localResources.has(key)) {
                // Skip system resources
                const parts = ns_name.split('/');
                const ns = parts[0];
                const name = parts[1];
                if (!['kube-system', 'kube-public', 'kube-node-lease'].includes(ns ?? '') &&
                    !name?.startsWith('kube-') && !name?.startsWith('system:')) {
                  untracked.push(key);
                }
              }
            }
          }

          if (untracked.length > 0) {
            results.push(`## Untracked Cluster Resources (${untracked.length} total):\n` +
              untracked.slice(0, 100).map(r => `  - ${r}`).join('\n') +
              (untracked.length > 100 ? `\n  ... and ${untracked.length - 100} more` : ''));
          }

          if (results.length === 0) {
            return ok('No drift detected in Kubernetes resources.');
          }
          return ok(`DRIFT DETECTED\n\n${results.join('\n\n')}`);
        }

        case 'helm': {
          // Try helm-diff plugin first for real drift detection
          try {
            const release = (input as { release?: string }).release ?? '';
            const diffCmd = release
              ? `helm diff upgrade ${release} . --allow-unreleased 2>&1`
              : `helm list -A --output json`;
            const { stdout } = await execAsync(diffCmd, { timeout: 60_000, maxBuffer: 5 * 1024 * 1024 });
            if (!stdout.trim() || stdout.trim() === '[]') {
              return ok('No drift detected in Helm releases.');
            }
            return ok(`Helm drift:\n\n${stdout}`);
          } catch {
            // helm-diff not installed — list releases with install hint
            try {
              const { stdout } = await execAsync('helm list -A --output json', { timeout: 30_000 });
              const releases: Array<{ name: string; namespace: string; status: string; chart: string; updated: string }> = JSON.parse(stdout || '[]');
              if (releases.length === 0) return ok('No Helm releases found.');
              const lines = releases.map(r =>
                `  ${r.name} (${r.namespace}): ${r.status} — ${r.chart}, updated ${r.updated}`
              );
              return ok(
                `Helm releases:\n${lines.join('\n')}\n\n` +
                `Note: Install helm-diff for detailed drift: helm plugin install https://github.com/databus23/helm-diff`
              );
            } catch (e2) {
              return err(`Helm drift detection failed: ${errorMessage(e2)}`);
            }
          }
        }
      }
    } catch (error: unknown) {
      return err(`Drift detection failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 7. deploy_preview
// ---------------------------------------------------------------------------

const deployPreviewSchema = z.object({
  action: z
    .string()
    .describe('The deployment action (e.g., terraform apply, kubectl apply, helm install)'),
  workdir: z.string().describe('Working directory for the deployment'),
});

export const deployPreviewTool: ToolDefinition = {
  name: 'deploy_preview',
  description: 'Generate a dry-run preview of infrastructure changes with blast radius analysis.',
  inputSchema: deployPreviewSchema,
  permissionTier: 'auto_allow',
  category: 'devops',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = deployPreviewSchema.parse(raw);
      const actionLower = input.action.toLowerCase();

      let command: string;

      if (actionLower.includes('terraform')) {
        command = `terraform -chdir=${input.workdir} plan -no-color`;
      } else if (actionLower.includes('kubectl')) {
        command = `kubectl apply --dry-run=client -f ${input.workdir} 2>&1`;
      } else if (actionLower.includes('helm')) {
        // For helm, use template to preview rendered manifests.
        command = `helm template ${input.workdir}`;
      } else {
        return err(
          `Unsupported action: ${input.action}. ` + 'Supported keywords: terraform, kubectl, helm.'
        );
      }

      const { stdout, stderr } = await execAsync(command, {
        timeout: 300_000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const combined = [stdout, stderr].filter(Boolean).join('\n');

      // Build a summary header.
      const lines = [
        '--- Deploy Preview (Dry Run) ---',
        `Action: ${input.action}`,
        `Workdir: ${input.workdir}`,
        '',
        combined || '(no changes detected)',
      ];

      return ok(lines.join('\n'));
    } catch (error: unknown) {
      return err(`Deploy preview failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 7b. terraform_plan_analyze
// ---------------------------------------------------------------------------

const terraformPlanAnalyzeSchema = z.object({
  plan_file: z.string().optional().describe('Path to a saved .tfplan binary or .json plan file'),
  workdir: z.string().optional().describe('Working directory — runs terraform show -json on the current state'),
});

export const terraformPlanAnalyzeTool: ToolDefinition = {
  name: 'terraform_plan_analyze',
  description: 'Analyze a Terraform plan file or working directory state. Returns a structured summary of resources to add, change, and destroy with risk assessment.',
  inputSchema: terraformPlanAnalyzeSchema,
  permissionTier: 'auto_allow',
  category: 'devops',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = terraformPlanAnalyzeSchema.parse(raw);

      if (!input.plan_file && !input.workdir) {
        return err('Either plan_file or workdir must be provided.');
      }

      const showCmd = input.plan_file
        ? `terraform show -json ${input.plan_file}`
        : `terraform -chdir=${input.workdir} show -json`;

      const { stdout } = await execAsync(showCmd, {
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
      });

      let plan: Record<string, unknown>;
      try {
        plan = JSON.parse(stdout);
      } catch {
        return err('Failed to parse terraform show output as JSON. Make sure the plan file is valid.');
      }

      const changes = (plan.resource_changes as Array<{
        address: string;
        type: string;
        name: string;
        change: { actions: string[] };
      }>) ?? [];

      const toAdd = changes.filter(r => r.change?.actions?.includes('create'));
      const toChange = changes.filter(r => r.change?.actions?.includes('update'));
      const toDestroy = changes.filter(r => r.change?.actions?.includes('delete'));
      const toReplace = changes.filter(
        r =>
          r.change?.actions?.includes('create') && r.change?.actions?.includes('delete')
      );

      // Risk assessment
      const highRiskTypes = ['aws_instance', 'aws_db_instance', 'aws_rds_cluster', 'google_sql_database_instance', 'azurerm_sql_server', 'aws_eks_cluster'];
      const highRiskDestroys = toDestroy.filter(r => highRiskTypes.includes(r.type));

      const lines = [
        '=== Terraform Plan Analysis ===',
        '',
        `Resources to CREATE: ${toAdd.length}`,
        ...toAdd.slice(0, 10).map(r => `  + ${r.address}`),
        toAdd.length > 10 ? `  ... and ${toAdd.length - 10} more` : '',
        '',
        `Resources to CHANGE: ${toChange.length}`,
        ...toChange.slice(0, 10).map(r => `  ~ ${r.address}`),
        toChange.length > 10 ? `  ... and ${toChange.length - 10} more` : '',
        '',
        `Resources to DESTROY: ${toDestroy.length}`,
        ...toDestroy.slice(0, 10).map(r => `  - ${r.address}`),
        toDestroy.length > 10 ? `  ... and ${toDestroy.length - 10} more` : '',
        '',
        toReplace.length > 0 ? `Resources to REPLACE (destroy+create): ${toReplace.length}` : '',
        ...toReplace.map(r => `  ± ${r.address}`),
        '',
        '=== Risk Assessment ===',
        toDestroy.length === 0 && toReplace.length === 0
          ? 'LOW RISK: No destructive changes'
          : toDestroy.length > 0 && highRiskDestroys.length > 0
          ? `HIGH RISK: Destroying ${highRiskDestroys.length} high-risk resource(s): ${highRiskDestroys.map(r => r.address).join(', ')}`
          : toDestroy.length > 0
          ? `MEDIUM RISK: ${toDestroy.length} resource(s) will be destroyed`
          : 'LOW RISK: Changes only (no destroys)',
      ].filter(l => l !== '');

      return ok(lines.join('\n'));
    } catch (error: unknown) {
      return err(`Terraform plan analysis failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 10. kubectl_context
// ---------------------------------------------------------------------------

const kubectlContextSchema = z.object({
  action: z
    .enum(['list', 'current', 'switch', 'namespaces'])
    .describe('Action: list all contexts, show current context, switch to a context, or list namespaces'),
  context: z.string().optional().describe('Context name to switch to (required for switch action)'),
});

export const kubectlContextTool: ToolDefinition = {
  name: 'kubectl_context',
  description: 'Manage Kubernetes contexts (kubeconfig). List, inspect, or switch between cluster contexts without running raw kubectl commands.',
  inputSchema: kubectlContextSchema,
  permissionTier: 'auto_allow',
  category: 'devops',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = kubectlContextSchema.parse(raw);

      switch (input.action) {
        case 'current': {
          const { stdout } = await execAsync('kubectl config current-context', { timeout: 5000 });
          const ctx = stdout.trim();
          // Also get cluster info
          try {
            const { stdout: clusterInfo } = await execAsync(
              `kubectl config get-clusters | grep -v NAME`,
              { timeout: 5000 }
            );
            return ok(`Current context: ${ctx}\n\nAll clusters:\n${clusterInfo.trim()}`);
          } catch {
            return ok(`Current context: ${ctx}`);
          }
        }

        case 'list': {
          const { stdout } = await execAsync('kubectl config get-contexts', { timeout: 5000, maxBuffer: 1024 * 1024 });
          return ok(stdout.trim() || 'No contexts found in kubeconfig.');
        }

        case 'switch': {
          if (!input.context) {
            return err('context parameter is required for switch action');
          }
          const { stdout } = await execAsync(
            `kubectl config use-context ${input.context}`,
            { timeout: 5000 }
          );
          return ok(stdout.trim());
        }

        case 'namespaces': {
          const { stdout } = await execAsync('kubectl get namespaces -o wide', {
            timeout: 15_000,
            maxBuffer: 1024 * 1024,
          });
          return ok(stdout.trim());
        }
      }
    } catch (error: unknown) {
      return err(`kubectl_context failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 11. helm_values
// ---------------------------------------------------------------------------

const helmValuesSchema = z.object({
  action: z
    .enum(['show-defaults', 'get-release', 'diff-values'])
    .describe('Action: show default chart values, get values for a deployed release, or diff values between releases'),
  chart: z.string().optional().describe('Chart reference (e.g., bitnami/nginx) for show-defaults'),
  release: z.string().optional().describe('Release name for get-release or diff-values'),
  namespace: z.string().optional().describe('Kubernetes namespace for the release'),
});

export const helmValuesTool: ToolDefinition = {
  name: 'helm_values',
  description: 'Inspect Helm chart values. Show default values for a chart, get values for a deployed release, or diff two revisions.',
  inputSchema: helmValuesSchema,
  permissionTier: 'auto_allow',
  category: 'devops',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = helmValuesSchema.parse(raw);

      switch (input.action) {
        case 'show-defaults': {
          if (!input.chart) {
            return err('chart parameter is required for show-defaults action');
          }
          const { stdout } = await execAsync(`helm show values ${input.chart}`, {
            timeout: 60_000,
            maxBuffer: 5 * 1024 * 1024,
          });
          return ok(stdout.trim() || '(no default values)');
        }

        case 'get-release': {
          if (!input.release) {
            return err('release parameter is required for get-release action');
          }
          const nsFlag = input.namespace ? `-n ${input.namespace}` : '';
          const { stdout } = await execAsync(
            `helm get values ${input.release} ${nsFlag} --all`,
            { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }
          );
          return ok(stdout.trim() || '(no custom values — using defaults)');
        }

        case 'diff-values': {
          if (!input.release) {
            return err('release parameter is required for diff-values action');
          }
          const nsFlag = input.namespace ? `-n ${input.namespace}` : '';
          // Get history
          const { stdout: histOut } = await execAsync(
            `helm history ${input.release} ${nsFlag} --output json`,
            { timeout: 30_000, maxBuffer: 1024 * 1024 }
          );
          const history = JSON.parse(histOut || '[]') as Array<{ revision: number }>;
          if (history.length < 2) {
            return ok(`Only ${history.length} revision(s) found. Need at least 2 to diff.`);
          }
          const latest = history[history.length - 1].revision;
          const previous = history[history.length - 2].revision;
          const [latestVals, prevVals] = await Promise.all([
            execAsync(`helm get values ${input.release} ${nsFlag} --revision ${latest}`, { timeout: 30_000 }),
            execAsync(`helm get values ${input.release} ${nsFlag} --revision ${previous}`, { timeout: 30_000 }),
          ]);
          if (latestVals.stdout === prevVals.stdout) {
            return ok(`No value changes between revision ${previous} and ${latest}.`);
          }
          return ok(
            `Values diff (revision ${previous} → ${latest}):\n\n` +
            `=== Revision ${previous} ===\n${prevVals.stdout.trim()}\n\n` +
            `=== Revision ${latest} ===\n${latestVals.stdout.trim()}`
          );
        }
      }
    } catch (error: unknown) {
      return err(`helm_values failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 8. git
// ---------------------------------------------------------------------------

const gitSchema = z.object({
  action: z
    .enum(['status', 'add', 'commit', 'push', 'pull', 'branch', 'checkout', 'diff', 'log'])
    .describe('The git sub-command to run'),
  args: z.string().optional().describe('Additional CLI arguments'),
});

export const gitTool: ToolDefinition = {
  name: 'git',
  description:
    'Execute git operations. Supports status, add, commit, push, pull, branch, checkout, diff, and log.',
  inputSchema: gitSchema,
  permissionTier: 'ask_once',
  category: 'devops',
  isDestructive: true,

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = gitSchema.parse(raw);

      const parts: string[] = ['git', input.action];

      if (input.args) {
        parts.push(input.args);
      }

      const command = parts.join(' ');
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const combined = [stdout, stderr].filter(Boolean).join('\n');
      return ok(combined || '(no output)');
    } catch (error: unknown) {
      return err(`git command failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 9. task (subagent)
// ---------------------------------------------------------------------------

const taskSchema = z.object({
  prompt: z.string().describe('The task for the subagent to perform'),
  agent: z
    .enum(['explore', 'infra', 'security', 'cost', 'general'])
    .optional()
    .default('general')
    .describe('Subagent specialization to handle the task (default: general)'),
});

export const taskTool: ToolDefinition = {
  name: 'task',
  description:
    'Spawn a subagent to handle a specific task. The subagent runs with its own isolated context and returns results. Use for parallelizable research, code exploration, security audits, cost analysis, or infrastructure checks.',
  inputSchema: taskSchema,
  permissionTier: 'auto_allow',
  category: 'devops',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = taskSchema.parse(raw);

      // Get the LLM router from the app context
      const { getAppContext } = await import('../../app');
      const ctx = getAppContext();
      if (!ctx) {
        return err('App not initialised. Cannot spawn subagent.');
      }

      // Create and run the appropriate subagent
      const { createSubagent } = await import('../../agent/subagents/index');
      const subagent = createSubagent(input.agent as any);
      const result = await subagent.run(input.prompt, ctx.router);

      const header = [
        `[Subagent: ${input.agent}]`,
        `Turns: ${result.turns} | Tokens: ${result.totalTokens}`,
        result.interrupted ? '(interrupted)' : '',
        '---',
      ]
        .filter(Boolean)
        .join('\n');

      return ok(`${header}\n${result.output}`);
    } catch (error: unknown) {
      return err(`Subagent execution failed: ${errorMessage(error)}`);
    }
  },
};


// ---------------------------------------------------------------------------
// 13. docker
// ---------------------------------------------------------------------------

const dockerSchema = z.object({
  action: z.enum(['build','push','pull','run','ps','stop','rm','images',
                   'compose-up','compose-down','logs','exec','inspect','prune','scan'])
    .describe('Docker action to perform'),
  image: z.string().optional().describe('Image name (with optional tag)'),
  container: z.string().optional().describe('Container name or ID'),
  tag: z.string().optional().describe('Image tag (default: latest)'),
  file: z.string().optional().describe('Dockerfile path'),
  args: z.string().optional().describe('Additional arguments'),
  workdir: z.string().optional().describe('Working directory for build/compose'),
});

export const dockerTool: ToolDefinition = {
  name: 'docker',
  description: 'Execute Docker operations: build images, manage containers, run compose, view logs, inspect, and prune.',
  inputSchema: dockerSchema,
  permissionTier: 'always_ask',
  category: 'devops',
  isDestructive: true,

  async execute(raw: unknown, ctx?: import('./types').ToolExecuteContext): Promise<ToolResult> {
    try {
      const input = dockerSchema.parse(raw);

      // Safety: block --privileged / --network=host in run args
      if (input.action === 'run' && input.args) {
        if (input.args.includes('--privileged') || input.args.includes('--network=host')) {
          return err(
            'SAFETY CHECK: --privileged and --network=host flags are blocked by default.\n' +
            'These flags grant significant host access. Remove them or confirm intent explicitly.'
          );
        }
      }

      let command: string;
      const wdir = input.workdir ?? '.';

      switch (input.action) {
        case 'build': {
          const tag = input.tag ? `:${input.tag}` : ':latest';
          const imageRef = input.image ? `${input.image}${tag}` : 'local-build:latest';
          const fileFlag = input.file ? `-f ${input.file}` : '';
          command = `docker build -t ${imageRef} ${fileFlag} ${wdir}`.trim().replace(/\s+/g, ' ');
          break;
        }
        case 'push':
          command = `docker push ${input.image}${input.tag ? `:${input.tag}` : ''}`;
          break;
        case 'pull':
          command = `docker pull ${input.image}${input.tag ? `:${input.tag}` : ''}`;
          break;
        case 'run': {
          const imageRef = `${input.image ?? 'unknown'}${input.tag ? `:${input.tag}` : ''}`;
          command = `docker run ${input.args ?? ''} ${imageRef}`.trim();
          break;
        }
        case 'ps':
          command = `docker ps ${input.args ?? ''}`.trim();
          break;
        case 'stop':
          command = `docker stop ${input.container ?? ''}`.trim();
          break;
        case 'rm':
          command = `docker rm ${input.container ?? ''} ${input.args ?? ''}`.trim();
          break;
        case 'images':
          command = `docker images ${input.args ?? ''}`.trim();
          break;
        case 'compose-up':
          command = `docker compose -f ${input.file ?? 'docker-compose.yml'} up -d ${input.args ?? ''}`.trim();
          break;
        case 'compose-down':
          command = `docker compose -f ${input.file ?? 'docker-compose.yml'} down ${input.args ?? ''}`.trim();
          break;
        case 'logs':
          command = `docker logs ${input.container ?? ''} ${input.args ?? '--tail=100'}`.trim();
          break;
        case 'exec':
          command = `docker exec ${input.container ?? ''} ${input.args ?? '/bin/sh'}`.trim();
          break;
        case 'inspect':
          command = `docker inspect ${input.container ?? input.image ?? ''}`.trim();
          break;
        case 'prune':
          command = `docker system prune -f ${input.args ?? ''}`.trim();
          break;
        case 'scan': {
          const target = input.image ?? input.tag ?? '';
          if (!target) return err('scan action requires image or tag param');
          // Try trivy first, fall back to docker scout
          let cmd = `trivy image ${target} --format json`;
          let isTrivyJson = true;
          try {
            const { stdout: trivyCheck } = await execAsync('trivy --version', { timeout: 5000, maxBuffer: 1024 });
            void trivyCheck;
          } catch {
            cmd = `docker scout cves ${target} --format json`;
            isTrivyJson = false;
          }
          try {
            const { stdout, stderr } = await execAsync(cmd, {
              timeout: 300_000,
              maxBuffer: 50 * 1024 * 1024,
            });
            const output = stdout || stderr;
            try {
              const data = JSON.parse(output);
              // Parse trivy JSON
              const results = isTrivyJson
                ? (data.Results ?? []).flatMap((r: { Vulnerabilities?: Array<{ Severity: string }> }) => r.Vulnerabilities ?? [])
                : (data.vulnerabilities ?? []);
              const counts: Record<string, number> = {};
              for (const v of results) {
                const sev = (v.Severity ?? v.severity ?? 'UNKNOWN').toUpperCase();
                counts[sev] = (counts[sev] ?? 0) + 1;
              }
              const summary = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']
                .filter(s => counts[s])
                .map(s => `${s}: ${counts[s]}`)
                .join(', ') || 'No vulnerabilities found';
              return ok(`Image scan: ${target}\n${summary}\n\nTotal: ${results.length} vulnerabilities`);
            } catch {
              return ok(output.slice(0, 10000));
            }
          } catch (e: unknown) {
            return ok(`Scan result (exit non-zero — may indicate vulnerabilities):\n${errorMessage(e).slice(0, 5000)}`);
          }
        }
        default:
          return err(`Unknown docker action: ${input.action}`);
      }

      // Override permissionTier for read-only actions
      const readOnlyActions = ['ps', 'images', 'logs', 'inspect'];
      if (readOnlyActions.includes(input.action)) {
        // These are safe — no special gate needed
      }

      // M2: Docker build — use spawnExec with progress filter when ctx?.onProgress available
      if (input.action === 'build' && ctx?.onProgress) {
        const filteredProgress = (chunk: string) => {
          const lines = chunk.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            // Keep: Step N/M, Using cache, Successfully built, error, FROM/RUN/COPY step info
            if (/^Step\s+\d+\/\d+/i.test(trimmed) ||
                /---> Using cache/i.test(trimmed) ||
                /Successfully built/i.test(trimmed) ||
                /Successfully tagged/i.test(trimmed) ||
                /error/i.test(trimmed) ||
                /warning/i.test(trimmed)) {
              ctx.onProgress!(line + '\n');
            }
          }
        };
        const buildResult = await spawnExec(command, { onChunk: filteredProgress, timeout: ctx?.timeout ?? 300_000 });
        const combined = [buildResult.stdout, buildResult.stderr].filter(Boolean).join('\n');
        if (buildResult.exitCode !== 0) return err(`Docker build failed:\n${combined}`);
        return ok(combined || 'Build complete.');
      }

      const { stdout, stderr } = await execAsync(command, {
        timeout: 300_000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const combined = [stdout, stderr].filter(Boolean).join('\n');
      return ok(combined || '(no output)');
    } catch (error: unknown) {
      return err(`Docker command failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 14. secrets
// ---------------------------------------------------------------------------

const secretsSchema = z.object({
  action: z.enum([
    'get', 'list', 'put', 'delete', 'rotate', 'versions',
    'vault-read', 'vault-write', 'vault-rotate', 'vault-lease-renew', 'vault-list',
    'aws-get-secret', 'aws-put-secret', 'aws-rotate-secret', 'aws-list-secrets',
    'gcp-get-secret', 'gcp-create-version',
  ]).describe('Action to perform on the secret'),
  provider: z.enum(['vault','aws','gcp','azure'])
    .describe('Secrets provider to use'),
  path: z.string().describe('Secret path, ARN, or name'),
  value: z.string().optional().describe('Secret value for put action'),
  version: z.number().optional().describe('Secret version number'),
  region: z.string().optional().describe('Cloud region'),
  namespace: z.string().optional().describe('Vault namespace'),
  vault_addr: z.string().optional().describe('Vault server address (overrides VAULT_ADDR env var)'),
  secret_path: z.string().optional().describe('Vault KV secret path for vault-* actions'),
  secret_name: z.string().optional().describe('AWS/GCP secret name for provider-specific actions'),
  aws_region: z.string().optional().describe('AWS region for aws-* actions'),
  secret_value: z.string().optional().describe('Secret value for vault-write and aws-put-secret actions'),
});

export const secretsTool: ToolDefinition = {
  name: 'secrets',
  description: 'Manage secrets across Vault, AWS Secrets Manager, GCP Secret Manager, and Azure Key Vault. Secret values are always redacted in output.',
  inputSchema: secretsSchema,
  permissionTier: 'always_ask',
  category: 'devops',
  isDestructive: true,

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = secretsSchema.parse(raw);

      let command: string;

      // Handle provider-specific extended actions (vault-*, aws-*, gcp-*)
      const addrFlag = input.vault_addr ? `VAULT_ADDR=${input.vault_addr} ` : '';
      const secretPath = input.secret_path ?? input.path;
      const secretName = input.secret_name ?? input.path;
      const awsRegion = input.aws_region ?? input.region ?? '';
      const awsRegionFlag = awsRegion ? `--region ${awsRegion}` : '';
      const secretVal = input.secret_value ?? input.value ?? '';

      if (input.action === 'vault-read') {
        const { stdout, stderr } = await execAsync(`${addrFlag}vault kv get -format=json ${secretPath}`, { timeout: 30_000, maxBuffer: 1024 * 1024 });
        const raw2 = [stdout, stderr].filter(Boolean).join('\n');
        try {
          const parsed = JSON.parse(raw2);
          if (parsed.data?.data) for (const k of Object.keys(parsed.data.data)) parsed.data.data[k] = '[REDACTED]';
          return ok(JSON.stringify(parsed, null, 2));
        } catch { return ok(raw2.replace(/"value"\s*:\s*"[^"]*"/g, '"value": "[REDACTED]"')); }
      }
      if (input.action === 'vault-write') {
        if (!secretVal) return err('vault-write requires secret_value or value');
        const { stdout, stderr } = await execAsync(`${addrFlag}vault kv put ${secretPath} value=${secretVal}`, { timeout: 30_000, maxBuffer: 1024 * 1024 });
        return ok([stdout, stderr].filter(Boolean).join('\n') || 'Secret written.');
      }
      if (input.action === 'vault-rotate') {
        const { stdout, stderr } = await execAsync(`${addrFlag}vault write -force ${secretPath}/rotate`, { timeout: 30_000, maxBuffer: 1024 * 1024 });
        return ok([stdout, stderr].filter(Boolean).join('\n') || 'Secret rotated.');
      }
      if (input.action === 'vault-lease-renew') {
        const { stdout, stderr } = await execAsync(`${addrFlag}vault lease renew ${secretPath}`, { timeout: 30_000, maxBuffer: 1024 * 1024 });
        return ok([stdout, stderr].filter(Boolean).join('\n') || 'Lease renewed.');
      }
      if (input.action === 'vault-list') {
        const { stdout, stderr } = await execAsync(`${addrFlag}vault kv list ${secretPath}`, { timeout: 30_000, maxBuffer: 1024 * 1024 });
        return ok([stdout, stderr].filter(Boolean).join('\n') || '(empty)');
      }
      if (input.action === 'aws-get-secret') {
        const { stdout, stderr } = await execAsync(`aws secretsmanager get-secret-value --secret-id ${secretName} ${awsRegionFlag} --output json`, { timeout: 30_000, maxBuffer: 1024 * 1024 });
        const raw2 = [stdout, stderr].filter(Boolean).join('\n');
        try {
          const parsed = JSON.parse(raw2);
          if (parsed.SecretString) parsed.SecretString = '[REDACTED — value retrieved successfully]';
          return ok(JSON.stringify(parsed, null, 2));
        } catch { return ok(raw2.replace(/"SecretString"\s*:\s*"[^"]*"/g, '"SecretString": "[REDACTED]"')); }
      }
      if (input.action === 'aws-put-secret') {
        if (!secretVal) return err('aws-put-secret requires secret_value or value');
        const { stdout, stderr } = await execAsync(`aws secretsmanager put-secret-value --secret-id ${secretName} --secret-string '${secretVal.replace(/'/g, "'\\''")}' ${awsRegionFlag}`, { timeout: 30_000, maxBuffer: 1024 * 1024 });
        return ok([stdout, stderr].filter(Boolean).join('\n') || 'Secret updated.');
      }
      if (input.action === 'aws-rotate-secret') {
        const { stdout, stderr } = await execAsync(`aws secretsmanager rotate-secret --secret-id ${secretName} ${awsRegionFlag}`, { timeout: 30_000, maxBuffer: 1024 * 1024 });
        return ok([stdout, stderr].filter(Boolean).join('\n') || 'Rotation initiated.');
      }
      if (input.action === 'aws-list-secrets') {
        const { stdout, stderr } = await execAsync(`aws secretsmanager list-secrets ${awsRegionFlag} --output json`, { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 });
        return ok([stdout, stderr].filter(Boolean).join('\n') || '[]');
      }
      if (input.action === 'gcp-get-secret') {
        const { stdout, stderr } = await execAsync(`gcloud secrets versions access latest --secret=${secretName}`, { timeout: 30_000, maxBuffer: 1024 * 1024 });
        // Mask the raw secret output
        const raw2 = [stdout, stderr].filter(Boolean).join('\n');
        return ok(raw2 ? '[REDACTED — secret value retrieved successfully]' : '(empty)');
      }
      if (input.action === 'gcp-create-version') {
        if (!secretVal) return err('gcp-create-version requires secret_value or value');
        const { stdout, stderr } = await execAsync(`echo '${secretVal.replace(/'/g, "'\\''")}' | gcloud secrets versions add ${secretName} --data-file=-`, { timeout: 30_000, maxBuffer: 1024 * 1024 });
        return ok([stdout, stderr].filter(Boolean).join('\n') || 'New secret version created.');
      }

      switch (input.provider) {
        case 'vault': {
          const nsFlag = input.namespace ? `VAULT_NAMESPACE=${input.namespace} ` : '';
          switch (input.action) {
            case 'get':
              command = `${nsFlag}vault kv get -format=json ${input.path}`;
              break;
            case 'list':
              command = `${nsFlag}vault kv list -format=json ${input.path}`;
              break;
            case 'put':
              if (!input.value) return err('value is required for put action');
              command = `${nsFlag}vault kv put ${input.path} value=${input.value}`;
              break;
            case 'delete':
              command = `${nsFlag}vault kv delete ${input.path}`;
              break;
            case 'versions':
              command = `${nsFlag}vault kv metadata get -format=json ${input.path}`;
              break;
            case 'rotate':
              return err('rotate is not supported for Vault — use put to update the secret value');
          }
          break;
        }
        case 'aws': {
          const regionFlag = input.region ? `--region ${input.region}` : '';
          switch (input.action) {
            case 'get':
              command = `aws secretsmanager get-secret-value --secret-id ${input.path} ${regionFlag} --output json`;
              break;
            case 'list':
              command = `aws secretsmanager list-secrets ${regionFlag} --output json`;
              break;
            case 'put':
              if (!input.value) return err('value is required for put action');
              command = `aws secretsmanager put-secret-value --secret-id ${input.path} --secret-string '${input.value.replace(/'/g, "'\\''")}' ${regionFlag}`;
              break;
            case 'delete':
              command = `aws secretsmanager delete-secret --secret-id ${input.path} ${regionFlag} --force-delete-without-recovery`;
              break;
            case 'versions':
              command = `aws secretsmanager list-secret-version-ids --secret-id ${input.path} ${regionFlag} --output json`;
              break;
            case 'rotate':
              command = `aws secretsmanager rotate-secret --secret-id ${input.path} ${regionFlag}`;
              break;
          }
          break;
        }
        case 'gcp': {
          switch (input.action) {
            case 'get':
              command = `gcloud secrets versions access ${input.version ?? 'latest'} --secret=${input.path} --format=json`;
              break;
            case 'list':
              command = `gcloud secrets list --format=json`;
              break;
            case 'put':
              if (!input.value) return err('value is required for put action');
              command = `echo '${input.value.replace(/'/g, "'\\''")}' | gcloud secrets create ${input.path} --data-file=-`;
              break;
            case 'delete':
              command = `gcloud secrets delete ${input.path} --quiet`;
              break;
            case 'versions':
              command = `gcloud secrets versions list ${input.path} --format=json`;
              break;
            case 'rotate':
              return err('rotate for GCP: create a new version with put action');
          }
          break;
        }
        case 'azure': {
          const vaultFlag = input.namespace ? `--vault-name ${input.namespace}` : '';
          switch (input.action) {
            case 'get':
              command = `az keyvault secret show --name ${input.path} ${vaultFlag} --output json`;
              break;
            case 'list':
              command = `az keyvault secret list ${vaultFlag} --output json`;
              break;
            case 'put':
              if (!input.value) return err('value is required for put action');
              command = `az keyvault secret set --name ${input.path} --value '${input.value.replace(/'/g, "'\\''")}' ${vaultFlag}`;
              break;
            case 'delete':
              command = `az keyvault secret delete --name ${input.path} ${vaultFlag}`;
              break;
            case 'versions':
              command = `az keyvault secret list-versions --name ${input.path} ${vaultFlag} --output json`;
              break;
            case 'rotate':
              return err('rotate for Azure: use put to set a new secret version');
          }
          break;
        }
        default:
          return err(`Unknown provider: ${input.provider}`);
      }

      const { stdout, stderr } = await execAsync(command!, {
        timeout: 30_000,
        maxBuffer: 1 * 1024 * 1024,
      });

      const combined = [stdout, stderr].filter(Boolean).join('\n');

      // CRITICAL: Redact secret values from output
      let output = combined;
      if (input.action === 'get') {
        try {
          const parsed = JSON.parse(combined);
          // AWS: redact SecretString
          if (parsed.SecretString) {
            parsed.SecretString = '[REDACTED — value retrieved successfully]';
          }
          // Vault: redact data fields
          if (parsed.data?.data) {
            for (const key of Object.keys(parsed.data.data)) {
              parsed.data.data[key] = '[REDACTED]';
            }
          }
          // GCP: redact payload
          if (parsed.payload?.data) {
            parsed.payload.data = '[REDACTED — value retrieved successfully]';
          }
          // Azure: redact value
          if (parsed.value) {
            parsed.value = '[REDACTED — value retrieved successfully]';
          }
          output = JSON.stringify(parsed, null, 2);
        } catch {
          // Not JSON or parse failed — redact with regex
          output = combined.replace(/"(SecretString|value|data)"\s*:\s*"[^"]*"/g, '"$1": "[REDACTED]"');
        }
      }

      return ok(output || '(success)');
    } catch (error: unknown) {
      return err(`Secrets operation failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 15. cicd (CI/CD pipeline management)
// ---------------------------------------------------------------------------

const cicdSchema = z.object({
  action: z.enum(['list','get','trigger','retry','cancel','logs','status','artifacts'])
    .describe('CI/CD action to perform'),
  provider: z.enum(['github','gitlab','circleci'])
    .describe('CI/CD provider'),
  repo: z.string().optional().describe('Repository in owner/repo format'),
  workflow: z.string().optional().describe('Workflow file or pipeline ID'),
  branch: z.string().optional().describe('Branch name'),
  run_id: z.string().optional().describe('Run/pipeline ID'),
  project_slug: z.string().optional().describe('CircleCI project slug: org-type/org/repo'),
});

export const cicdTool: ToolDefinition = {
  name: 'cicd',
  description: 'Manage CI/CD pipelines across GitHub Actions, GitLab CI, and CircleCI. List, trigger, retry, cancel, and fetch logs.',
  inputSchema: cicdSchema,
  permissionTier: 'ask_once',
  category: 'devops',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = cicdSchema.parse(raw);

      let command: string;

      switch (input.provider) {
        case 'github': {
          const repoFlag = input.repo ? `--repo ${input.repo}` : '';
          switch (input.action) {
            case 'list':
              command = `gh workflow list ${repoFlag}`;
              break;
            case 'get':
              command = `gh workflow view ${input.workflow ?? ''} ${repoFlag}`;
              break;
            case 'trigger':
              command = `gh workflow run ${input.workflow ?? ''} ${repoFlag} ${input.branch ? `--ref ${input.branch}` : ''}`.trim();
              break;
            case 'retry':
              command = `gh run rerun ${input.run_id ?? ''} ${repoFlag}`;
              break;
            case 'cancel':
              command = `gh run cancel ${input.run_id ?? ''} ${repoFlag}`;
              break;
            case 'logs':
              command = `gh run view ${input.run_id ?? ''} ${repoFlag} --log 2>&1 | tail -200`;
              break;
            case 'status':
              command = `gh run list ${repoFlag} ${input.workflow ? `--workflow ${input.workflow}` : ''} --limit 10`;
              break;
            case 'artifacts':
              command = `gh run download ${input.run_id ?? ''} ${repoFlag} --dir /tmp/nimbus-artifacts`;
              break;
            default:
              return err(`Unknown action ${input.action} for GitHub Actions`);
          }
          break;
        }
        case 'gitlab': {
          switch (input.action) {
            case 'list':
              command = `glab ci list`;
              break;
            case 'get':
              command = `glab ci get ${input.run_id ?? ''}`;
              break;
            case 'trigger':
              command = `glab ci run ${input.workflow ?? ''} ${input.branch ? `--ref ${input.branch}` : ''}`.trim();
              break;
            case 'retry':
              command = `glab ci retry ${input.run_id ?? ''}`;
              break;
            case 'cancel':
              command = `glab ci cancel ${input.run_id ?? ''}`;
              break;
            case 'logs':
              command = `glab ci trace ${input.run_id ?? ''} 2>&1 | tail -200`;
              break;
            case 'status':
              command = `glab ci status`;
              break;
            case 'artifacts':
              command = `glab ci artifact ${input.run_id ?? ''}`;
              break;
            default:
              return err(`Unknown action ${input.action} for GitLab CI`);
          }
          break;
        }
        case 'circleci': {
          const token = process.env.CIRCLECI_TOKEN;
          const tokenFlag = token ? `-H "Circle-Token: ${token}"` : '';
          const slug = input.project_slug ?? input.repo?.replace('/', '/github/') ?? '';
          switch (input.action) {
            case 'list':
              command = `curl -s ${tokenFlag} "https://circleci.com/api/v2/project/github/${slug}/pipeline?limit=20"`;
              break;
            case 'get':
              command = `curl -s ${tokenFlag} "https://circleci.com/api/v2/pipeline/${input.run_id}"`;
              break;
            case 'trigger':
              command = `curl -s -X POST ${tokenFlag} -H "Content-Type: application/json" -d '{"branch":"${input.branch ?? 'main'}"}' "https://circleci.com/api/v2/project/github/${slug}/pipeline"`;
              break;
            case 'retry':
              command = `curl -s -X POST ${tokenFlag} "https://circleci.com/api/v2/workflow/${input.run_id}/rerun"`;
              break;
            case 'cancel':
              command = `curl -s -X POST ${tokenFlag} "https://circleci.com/api/v2/workflow/${input.run_id}/cancel"`;
              break;
            case 'logs':
              command = `curl -s ${tokenFlag} "https://circleci.com/api/v2/workflow/${input.run_id}/job" | head -200`;
              break;
            case 'status':
              command = `curl -s ${tokenFlag} "https://circleci.com/api/v2/project/github/${slug}/pipeline?limit=10"`;
              break;
            default:
              return err(`Unknown action ${input.action} for CircleCI`);
          }
          break;
        }
        default:
          return err(`Unknown CI/CD provider: ${input.provider}`);
      }

      const { stdout, stderr } = await execAsync(command!, {
        timeout: 60_000,
        maxBuffer: 5 * 1024 * 1024,
      });

      const combined = [stdout, stderr].filter(Boolean).join('\n');
      // Truncate logs at 200 lines
      const lines = combined.split('\n');
      const truncated = lines.length > 200;
      const output = truncated
        ? lines.slice(0, 200).join('\n') + '\n\n... truncated (showing first 200 lines)'
        : combined;

      return ok(output || '(no output)');
    } catch (error: unknown) {
      return err(`CI/CD operation failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 16. monitor (observability)
// ---------------------------------------------------------------------------

const monitorSchema = z.object({
  action: z.enum(['query','logs','metrics','alerts','dashboards','incidents','ack','resolve','on-call'])
    .describe('Observability action: query/logs/metrics/alerts/dashboards, or PagerDuty/Opsgenie: incidents/ack/resolve/on-call'),
  provider: z.enum(['prometheus','cloudwatch','grafana','datadog','newrelic','pagerduty','opsgenie'])
    .describe('Monitoring or alerting provider'),
  query: z.string().optional().describe('PromQL, CloudWatch Insights, or metric selector'),
  namespace: z.string().optional().describe('Metric namespace or Kubernetes namespace'),
  start_time: z.string().optional().describe('Start time: ISO8601 or relative (-1h, -30m)'),
  end_time: z.string().optional().describe('End time: ISO8601 or "now"'),
  region: z.string().optional().describe('Cloud region'),
  log_group: z.string().optional().describe('CloudWatch log group name'),
  incident_id: z.string().optional().describe('Incident/alert ID for ack or resolve actions'),
});

export const monitorTool: ToolDefinition = {
  name: 'monitor',
  description: 'Query observability data from Prometheus, CloudWatch, Grafana, Datadog, and New Relic. Read-only.',
  inputSchema: monitorSchema,
  permissionTier: 'auto_allow',
  category: 'devops',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = monitorSchema.parse(raw);

      // Parse relative times
      function parseTime(t: string | undefined, defaultSecs: number): number {
        if (!t) return Math.floor(Date.now() / 1000) - defaultSecs;
        if (t.startsWith('-')) {
          const val = parseInt(t.slice(1));
          const unit = t.slice(-1);
          const mult = unit === 'h' ? 3600 : unit === 'm' ? 60 : 1;
          return Math.floor(Date.now() / 1000) - val * mult;
        }
        return Math.floor(new Date(t).getTime() / 1000);
      }

      const startTs = parseTime(input.start_time, 3600);
      const endTs = parseTime(input.end_time, 0);

      switch (input.provider) {
        case 'prometheus': {
          const baseUrl = process.env.PROMETHEUS_URL ?? 'http://localhost:9090';
          const q = encodeURIComponent(input.query ?? 'up');
          const cmd = `curl -sf "${baseUrl}/api/v1/query_range?query=${q}&start=${startTs}&end=${endTs}&step=60" | head -c 50000`;
          const { stdout } = await execAsync(cmd, { timeout: 30_000 });
          try {
            const data = JSON.parse(stdout);
            const results = data?.data?.result ?? [];
            const lines = results.slice(0, 100).map((r: { metric: Record<string, string>; values: [number, string][] }) => {
              const metric = Object.entries(r.metric).map(([k, v]) => `${k}="${v}"`).join(',');
              const latest = r.values[r.values.length - 1];
              return `{${metric}} = ${latest?.[1] ?? 'N/A'} (at ${latest ? new Date(latest[0] * 1000).toISOString() : 'N/A'})`;
            });
            return ok(`Prometheus query results (${results.length} series):\n${lines.join('\n')}`);
          } catch {
            return ok(stdout.slice(0, 5000));
          }
        }

        case 'cloudwatch': {
          const regionFlag = input.region ? `--region ${input.region}` : '';
          if (input.action === 'logs' && input.log_group) {
            const cmd = `aws logs filter-log-events --log-group-name ${input.log_group} --start-time ${startTs * 1000} --end-time ${endTs * 1000} ${regionFlag} --output json`;
            const { stdout } = await execAsync(cmd, { timeout: 60_000, maxBuffer: 5 * 1024 * 1024 });
            const data = JSON.parse(stdout);
            const events = (data.events ?? []).slice(0, 100);
            return ok(events.map((e: { timestamp: number; message: string }) => `[${new Date(e.timestamp).toISOString()}] ${e.message}`).join('\n'));
          }
          const metricName = input.query ?? 'CPUUtilization';
          const ns = input.namespace ?? 'AWS/EC2';
          const cmd = `aws cloudwatch get-metric-statistics --metric-name ${metricName} --namespace ${ns} --start-time ${new Date(startTs * 1000).toISOString()} --end-time ${new Date(endTs * 1000).toISOString()} --period 300 --statistics Average ${regionFlag} --output json`;
          const { stdout } = await execAsync(cmd, { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
          return ok(stdout.slice(0, 5000));
        }

        case 'grafana': {
          const baseUrl = process.env.GRAFANA_URL ?? 'http://localhost:3000';
          const token = process.env.GRAFANA_TOKEN ?? '';
          const authFlag = token ? `-H "Authorization: Bearer ${token}"` : '';
          const cmd = `curl -sf ${authFlag} "${baseUrl}/api/dashboards/home" | head -c 10000`;
          const { stdout } = await execAsync(cmd, { timeout: 15_000 });
          return ok(stdout || '(no dashboards found)');
        }

        case 'datadog': {
          const apiKey = process.env.DD_API_KEY ?? '';
          const appKey = process.env.DD_APP_KEY ?? '';
          if (!apiKey) return err('DD_API_KEY environment variable not set');
          const q = encodeURIComponent(input.query ?? 'avg:system.cpu.user{*}');
          const cmd = `curl -sf -H "DD-API-KEY: ${apiKey}" -H "DD-APPLICATION-KEY: ${appKey}" "https://api.datadoghq.com/api/v1/query?from=${startTs}&to=${endTs}&query=${q}"`;
          const { stdout } = await execAsync(cmd, { timeout: 30_000 });
          const data = JSON.parse(stdout);
          const series = (data.series ?? []).slice(0, 100);
          return ok(`Datadog query (${series.length} series):\n` + JSON.stringify(series.map((s: { metric: string; pointlist: [number, number][] }) => ({ metric: s.metric, points: s.pointlist.length })), null, 2));
        }

        case 'newrelic': {
          const apiKey = process.env.NEW_RELIC_API_KEY ?? '';
          if (!apiKey) return err('NEW_RELIC_API_KEY environment variable not set');
          const nrqlQuery = input.query ?? `SELECT average(cpuPercent) FROM SystemSample SINCE 1 hour ago`;
          const body = JSON.stringify({ query: `{ actor { nrql(accounts: 0, query: "${nrqlQuery.replace(/"/g, '\\"')}") { results } } }` });
          const cmd = `curl -sf -X POST -H "Content-Type: application/json" -H "API-Key: ${apiKey}" -d '${body.replace(/'/g, "'\\''")}' "https://api.newrelic.com/graphql"`;
          const { stdout } = await execAsync(cmd, { timeout: 30_000 });
          return ok(stdout.slice(0, 5000));
        }

        // Gap 5: PagerDuty alert management
        case 'pagerduty': {
          const pdKey = process.env.PD_API_KEY ?? '';
          if (!pdKey) return err('PD_API_KEY environment variable not set');
          const authHeader = `-H "Authorization: Token token=${pdKey}" -H "Accept: application/vnd.pagerduty+json;version=2"`;
          switch (input.action) {
            case 'incidents':
              return ok((await execAsync(`curl -sf ${authHeader} "https://api.pagerduty.com/incidents?statuses[]=triggered&statuses[]=acknowledged&limit=25"`, { timeout: 15_000 })).stdout.slice(0, 5000));
            case 'alerts':
              return ok((await execAsync(`curl -sf ${authHeader} "https://api.pagerduty.com/alerts?limit=25"`, { timeout: 15_000 })).stdout.slice(0, 5000));
            case 'ack': {
              if (!input.incident_id) return err('incident_id required for ack action');
              const body = JSON.stringify({ incident: { type: 'incident_reference', status: 'acknowledged' } });
              return ok((await execAsync(`curl -sf -X PUT ${authHeader} -H "Content-Type: application/json" -d '${body}' "https://api.pagerduty.com/incidents/${input.incident_id}"`, { timeout: 15_000 })).stdout.slice(0, 2000));
            }
            case 'resolve': {
              if (!input.incident_id) return err('incident_id required for resolve action');
              const body = JSON.stringify({ incident: { type: 'incident_reference', status: 'resolved' } });
              return ok((await execAsync(`curl -sf -X PUT ${authHeader} -H "Content-Type: application/json" -d '${body}' "https://api.pagerduty.com/incidents/${input.incident_id}"`, { timeout: 15_000 })).stdout.slice(0, 2000));
            }
            case 'on-call':
              return ok((await execAsync(`curl -sf ${authHeader} "https://api.pagerduty.com/oncalls?limit=25"`, { timeout: 15_000 })).stdout.slice(0, 3000));
            default:
              return err(`PagerDuty action not supported: ${input.action}`);
          }
        }

        // Gap 5: Opsgenie alert management
        case 'opsgenie': {
          const ogKey = process.env.OPSGENIE_API_KEY ?? '';
          if (!ogKey) return err('OPSGENIE_API_KEY environment variable not set');
          const authHeader = `-H "Authorization: GenieKey ${ogKey}"`;
          switch (input.action) {
            case 'alerts':
            case 'incidents':
              return ok((await execAsync(`curl -sf ${authHeader} "https://api.opsgenie.com/v2/alerts?limit=25"`, { timeout: 15_000 })).stdout.slice(0, 5000));
            case 'ack': {
              if (!input.incident_id) return err('incident_id required for ack action');
              const body = JSON.stringify({ note: 'Acknowledged via Nimbus' });
              return ok((await execAsync(`curl -sf -X POST ${authHeader} -H "Content-Type: application/json" -d '${JSON.stringify(body)}' "https://api.opsgenie.com/v2/alerts/${input.incident_id}/acknowledge"`, { timeout: 15_000 })).stdout.slice(0, 2000));
            }
            case 'resolve': {
              if (!input.incident_id) return err('incident_id required for resolve action');
              const body = JSON.stringify({ note: 'Resolved via Nimbus' });
              return ok((await execAsync(`curl -sf -X POST ${authHeader} -H "Content-Type: application/json" -d '${JSON.stringify(body)}' "https://api.opsgenie.com/v2/alerts/${input.incident_id}/close"`, { timeout: 15_000 })).stdout.slice(0, 2000));
            }
            case 'on-call':
              return ok((await execAsync(`curl -sf ${authHeader} "https://api.opsgenie.com/v2/schedules/on-calls"`, { timeout: 15_000 })).stdout.slice(0, 3000));
            default:
              return err(`Opsgenie action not supported: ${input.action}`);
          }
        }

        default:
          return err(`Unknown monitoring provider: ${input.provider}`);
      }
    } catch (error: unknown) {
      return err(`Monitoring query failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 17. gitops (ArgoCD & Flux)
// ---------------------------------------------------------------------------

const gitopsSchema = z.object({
  action: z.enum(['list','get','sync','reconcile','diff','history','rollback','health','logs','argocd-status','flux-status','watch'])
    .describe('GitOps action to perform. argocd-status/flux-status: concise cluster-wide status summary. watch: live-stream application/resource status updates'),
  provider: z.enum(['argocd','flux'])
    .describe('GitOps provider'),
  app: z.string().optional().describe('Application or HelmRelease name'),
  namespace: z.string().optional().describe('Kubernetes namespace'),
  server: z.string().optional().describe('ArgoCD server URL (or use ARGOCD_SERVER env)'),
  revision: z.string().optional().describe('Revision or rollback target'),
});

export const gitopsTool: ToolDefinition = {
  name: 'gitops',
  description: 'Manage GitOps deployments via ArgoCD and Flux. Sync apps, check health, view diffs, and rollback.',
  inputSchema: gitopsSchema,
  permissionTier: 'ask_once',
  category: 'devops',
  isDestructive: false,

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = gitopsSchema.parse(raw);

      let command: string;

      if (input.provider === 'argocd') {
        const server = input.server ?? process.env.ARGOCD_SERVER ?? '';
        const serverFlag = server ? `--server ${server}` : '';
        const token = process.env.ARGOCD_TOKEN ?? '';
        const tokenFlag = token ? `--auth-token ${token}` : '';
        const flags = [serverFlag, tokenFlag, '--grpc-web'].filter(Boolean).join(' ');
        const nsFlag = input.namespace ? `-n ${input.namespace}` : '';

        switch (input.action) {
          case 'list':
            command = `argocd app list ${flags}`;
            break;
          case 'get':
            command = `argocd app get ${input.app ?? ''} ${flags}`;
            break;
          case 'sync':
            command = `argocd app sync ${input.app ?? ''} ${flags}`;
            break;
          case 'diff':
            command = `argocd app diff ${input.app ?? ''} ${flags}`;
            break;
          case 'history':
            command = `argocd app history ${input.app ?? ''} ${flags}`;
            break;
          case 'rollback':
            command = `argocd app rollback ${input.app ?? ''} ${input.revision ?? ''} ${flags}`;
            break;
          case 'health':
            command = `argocd app get ${input.app ?? ''} ${flags} -o json`;
            break;
          case 'logs':
            command = `argocd app logs ${input.app ?? ''} ${flags} ${nsFlag} --tail=200`;
            break;
          case 'argocd-status':
            command = `argocd app list ${flags} -o wide`;
            break;
          case 'flux-status':
            command = `argocd app list ${flags}`;
            break;
          case 'watch':
            command = `kubectl get applications -n argocd --watch`;
            break;
          default:
            return err(`Action ${input.action} not supported for ArgoCD`);
        }
      } else if (input.provider === 'flux') {
        const nsFlag = input.namespace ? `-n ${input.namespace}` : '';
        switch (input.action) {
          case 'list':
            command = `flux get all ${nsFlag}`;
            break;
          case 'get':
            command = `flux get kustomizations ${input.app ?? ''} ${nsFlag}`;
            break;
          case 'sync':
          case 'reconcile':
            command = `flux reconcile kustomization ${input.app ?? 'flux-system'} ${nsFlag}`;
            break;
          case 'diff':
            command = `flux diff kustomization ${input.app ?? ''} ${nsFlag}`;
            break;
          case 'history':
            command = `kubectl get events ${nsFlag} --field-selector reason=ReconcileSucceeded`;
            break;
          case 'rollback':
            return err('Flux rollback: revert the Git commit and reconcile to roll back');
          case 'health':
            command = `flux get all ${nsFlag} -o json`;
            break;
          case 'logs':
            command = `flux logs ${nsFlag} --tail=200`;
            break;
          case 'flux-status':
            command = `flux get all ${nsFlag}`;
            break;
          case 'argocd-status':
            command = `flux get all ${nsFlag} -o json`;
            break;
          case 'watch':
            command = `flux get all ${nsFlag} --watch`;
            break;
          default:
            return err(`Action ${input.action} not supported for Flux`);
        }
      } else {
        return err(`Unknown provider: ${input.provider}`);
      }

      const { stdout, stderr } = await execAsync(command!, {
        timeout: 120_000,
        maxBuffer: 5 * 1024 * 1024,
      });

      // For health action, parse and simplify ArgoCD JSON
      if (input.action === 'health' && input.provider === 'argocd') {
        try {
          const app = JSON.parse(stdout);
          const health = app?.status?.health?.status ?? 'Unknown';
          const sync = app?.status?.sync?.status ?? 'Unknown';
          const conditions = (app?.status?.conditions ?? []).map((c: { type: string; message: string }) => `  ${c.type}: ${c.message}`).join('\n');
          return ok(`App: ${app?.metadata?.name}\nHealth: ${health}\nSync: ${sync}\n${conditions ? 'Conditions:\n' + conditions : ''}`);
        } catch {
          // Fall through to raw output
        }
      }

      const combined = [stdout, stderr].filter(Boolean).join('\n');
      return ok(combined || '(no output)');
    } catch (error: unknown) {
      return err(`GitOps operation failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 18. cloud_action
// ---------------------------------------------------------------------------

const cloudActionSchema = z.object({
  action: z.enum(['start','stop','restart','create','delete','scale','describe','list'])
    .describe('Action to perform on the cloud resource'),
  provider: z.enum(['aws','gcp','azure'])
    .describe('Cloud provider'),
  service: z.string().describe('Service type: ec2, rds, eks, ecs, gce, gke, aks, functions, etc.'),
  resource_id: z.string().optional().describe('Resource ID, name, or ARN'),
  config: z.record(z.string(), z.unknown()).optional().describe('Additional configuration parameters'),
  region: z.string().optional().describe('Cloud region'),
});

export const cloudActionTool: ToolDefinition = {
  name: 'cloud_action',
  description: 'Perform actions on cloud resources (start/stop/scale/create/delete) across AWS, GCP, and Azure.',
  inputSchema: cloudActionSchema,
  permissionTier: 'ask_once',
  category: 'devops',
  isDestructive: true,

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = cloudActionSchema.parse(raw);
      const regionFlag = input.region ? `--region ${input.region}` : '';
      const id = input.resource_id ?? '';

      let command: string;

      if (input.provider === 'aws') {
        switch (`${input.service}:${input.action}`) {
          case 'ec2:start':
            command = `aws ec2 start-instances --instance-ids ${id} ${regionFlag} --output json`;
            break;
          case 'ec2:stop':
            command = `aws ec2 stop-instances --instance-ids ${id} ${regionFlag} --output json`;
            break;
          case 'ec2:describe':
          case 'ec2:list':
            command = `aws ec2 describe-instances --instance-ids ${id} ${regionFlag} --output json`;
            break;
          case 'rds:start':
            command = `aws rds start-db-instance --db-instance-identifier ${id} ${regionFlag}`;
            break;
          case 'rds:stop':
            command = `aws rds stop-db-instance --db-instance-identifier ${id} ${regionFlag}`;
            break;
          case 'ecs:scale':
            const desired = (input.config as Record<string,unknown>)?.desired ?? 1;
            command = `aws ecs update-service --service ${id} --desired-count ${desired} ${regionFlag}`;
            break;
          default:
            command = `aws ${input.service} ${input.action} ${id} ${regionFlag} --output json`;
        }
      } else if (input.provider === 'gcp') {
        switch (`${input.service}:${input.action}`) {
          case 'gce:start':
            command = `gcloud compute instances start ${id}`;
            break;
          case 'gce:stop':
            command = `gcloud compute instances stop ${id}`;
            break;
          default:
            command = `gcloud ${input.service} ${input.action} ${id} --format=json`;
        }
      } else if (input.provider === 'azure') {
        switch (`${input.service}:${input.action}`) {
          case 'vm:start':
            command = `az vm start --name ${id} --output json`;
            break;
          case 'vm:stop':
            command = `az vm stop --name ${id} --output json`;
            break;
          default:
            command = `az ${input.service} ${input.action} --name ${id} --output json`;
        }
      } else {
        return err(`Unknown provider: ${input.provider}`);
      }

      const { stdout, stderr } = await execAsync(command!, {
        timeout: 120_000,
        maxBuffer: 5 * 1024 * 1024,
      });

      const combined = [stdout, stderr].filter(Boolean).join('\n');
      return ok(combined || '(success)');
    } catch (error: unknown) {
      return err(`Cloud action failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 19. logs (log streaming)
// ---------------------------------------------------------------------------

const logsSchema = z.object({
  action: z.enum(['tail','search','download'])
    .describe('Log action to perform'),
  provider: z.enum(['cloudwatch','kubernetes','loki','elasticsearch'])
    .describe('Log provider'),
  source: z.string().describe('Log group, pod name, Loki label selector, or index'),
  filter: z.string().optional().describe('Filter expression or query string'),
  lines: z.number().optional().default(100).describe('Number of lines to retrieve (default: 100)'),
  since: z.string().optional().describe('Time range: -1h, -30m, or ISO8601'),
  namespace: z.string().optional().describe('Kubernetes namespace'),
  region: z.string().optional().describe('Cloud region'),
  follow: z.boolean().optional().default(false).describe('Follow/stream logs in real-time (only valid for kubernetes provider)'),
});

export const logsTool: ToolDefinition = {
  name: 'logs',
  description: 'Tail, search, or download logs from CloudWatch, Kubernetes pods, Loki, or Elasticsearch. Read-only.',
  inputSchema: logsSchema,
  permissionTier: 'auto_allow',
  category: 'devops',

  async execute(raw: unknown, ctx?: import('./types').ToolExecuteContext): Promise<ToolResult> {
    try {
      const input = logsSchema.parse(raw);
      const maxLines = Math.min(input.lines ?? 100, 200);

      let command: string;

      switch (input.provider) {
        case 'kubernetes': {
          const nsFlag = input.namespace ? `-n ${input.namespace}` : '';
          const sinceFlag = input.since ? `--since=${input.since.replace('-', '')}` : '';
          const followFlag = input.follow ? '-f' : `--tail=${maxLines}`;
          command = `kubectl logs ${input.source} ${nsFlag} ${sinceFlag} ${followFlag} ${input.filter ? `| grep ${input.filter}` : ''}`.trim();

          // For follow mode, use spawnExec with streaming
          if (input.follow && ctx?.onProgress) {
            const timeoutMs = ctx?.timeout ?? 300_000;
            const abortController = new AbortController();
            if (ctx?.signal) {
              ctx.signal.addEventListener('abort', () => abortController.abort());
            }
            const spawnResult = await spawnExec(command, { onChunk: ctx.onProgress, timeout: timeoutMs });
            const combined = [spawnResult.stdout, spawnResult.stderr].filter(Boolean).join('\n');
            return ok(combined || '(log stream ended)');
          }
          break;
        }
        case 'cloudwatch': {
          const regionFlag = input.region ? `--region ${input.region}` : '';
          const endMs = Date.now();
          const sinceMs = input.since
            ? (input.since.startsWith('-')
                ? Date.now() - parseInt(input.since.slice(1)) * (input.since.endsWith('h') ? 3600000 : 60000)
                : new Date(input.since).getTime())
            : endMs - 3600000;
          command = `aws logs filter-log-events --log-group-name ${input.source} --start-time ${sinceMs} --end-time ${endMs} ${input.filter ? `--filter-pattern "${input.filter}"` : ''} ${regionFlag} --output json`;
          break;
        }
        case 'loki': {
          const lokiUrl = process.env.LOKI_URL ?? 'http://localhost:3100';
          const q = encodeURIComponent(input.filter ? `{${input.source}} |= "${input.filter}"` : `{${input.source}}`);
          command = `curl -sf "${lokiUrl}/loki/api/v1/query_range?query=${q}&limit=${maxLines}" | head -c 50000`;
          break;
        }
        case 'elasticsearch': {
          const esUrl = process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200';
          const body = JSON.stringify({ query: { match_all: {} }, size: maxLines });
          command = `curl -sf -X POST "${esUrl}/${input.source}/_search" -H "Content-Type: application/json" -d '${body.replace(/'/g, "'\\''")}' | head -c 50000`;
          break;
        }
        default:
          return err(`Unknown log provider: ${input.provider}`);
      }

      const { stdout, stderr } = await execAsync(command!, {
        timeout: 60_000,
        maxBuffer: 5 * 1024 * 1024,
      });

      const combined = [stdout, stderr].filter(Boolean).join('\n');
      const lines = combined.split('\n');
      const output = lines.length > maxLines
        ? lines.slice(0, maxLines).join('\n') + `\n\n... truncated at ${maxLines} lines`
        : combined;

      return ok(output || '(no logs found)');
    } catch (error: unknown) {
      return err(`Log query failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 20. certs (certificate management)
// ---------------------------------------------------------------------------

const certsSchema = z.object({
  action: z.enum(['list','get','renew','issue','delete','status'])
    .describe('Certificate action to perform'),
  provider: z.enum(['cert-manager','acm','gcp','letsencrypt'])
    .describe('Certificate provider'),
  domain: z.string().optional().describe('Domain name'),
  namespace: z.string().optional().describe('Kubernetes namespace for cert-manager'),
  arn: z.string().optional().describe('ACM certificate ARN'),
});

export const certsTool: ToolDefinition = {
  name: 'certs',
  description: "Manage TLS certificates via cert-manager, AWS ACM, GCP Certificate Manager, and Let\'s Encrypt.",
  inputSchema: certsSchema,
  permissionTier: 'ask_once',
  category: 'devops',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = certsSchema.parse(raw);
      const nsFlag = input.namespace ? `-n ${input.namespace}` : '';

      let command: string;

      switch (input.provider) {
        case 'cert-manager':
          switch (input.action) {
            case 'list':
              command = `kubectl get certificates ${nsFlag} -o wide`;
              break;
            case 'get':
              command = `kubectl describe certificate ${input.domain ?? ''} ${nsFlag}`;
              break;
            case 'status':
              command = `kubectl get certificaterequest ${nsFlag} -o wide`;
              break;
            case 'renew':
              command = `kubectl annotate certificate ${input.domain ?? ''} ${nsFlag} cert-manager.io/issuer-name=$(kubectl get cert ${input.domain ?? ''} ${nsFlag} -o jsonpath='{.spec.issuerRef.name}') --overwrite`;
              break;
            case 'issue':
              return err('Issue via cert-manager: create a Certificate resource manifest and apply with kubectl');
            case 'delete':
              command = `kubectl delete certificate ${input.domain ?? ''} ${nsFlag}`;
              break;
          }
          break;
        case 'acm':
          switch (input.action) {
            case 'list':
              command = `aws acm list-certificates --output json`;
              break;
            case 'get':
            case 'status':
              command = `aws acm describe-certificate --certificate-arn ${input.arn ?? ''} --output json`;
              break;
            case 'renew':
              command = `aws acm renew-certificate --certificate-arn ${input.arn ?? ''}`;
              break;
            case 'issue':
              command = `aws acm request-certificate --domain-name ${input.domain ?? ''} --validation-method DNS --output json`;
              break;
            case 'delete':
              command = `aws acm delete-certificate --certificate-arn ${input.arn ?? ''}`;
              break;
          }
          break;
        case 'gcp':
          switch (input.action) {
            case 'list':
              command = `gcloud certificate-manager certificates list --format=json`;
              break;
            case 'get':
            case 'status':
              command = `gcloud certificate-manager certificates describe ${input.domain ?? ''} --format=json`;
              break;
            case 'issue':
              command = `gcloud certificate-manager certificates create ${input.domain ?? ''} --domains=${input.domain ?? ''} --format=json`;
              break;
            case 'delete':
              command = `gcloud certificate-manager certificates delete ${input.domain ?? ''} --quiet`;
              break;
            default:
              return err(`Action ${input.action} not supported for GCP Certificate Manager`);
          }
          break;
        case 'letsencrypt':
          switch (input.action) {
            case 'issue':
              command = `certbot certonly --standalone -d ${input.domain ?? ''} --non-interactive --agree-tos`;
              break;
            case 'renew':
              command = `certbot renew --cert-name ${input.domain ?? ''} --non-interactive`;
              break;
            case 'list':
              command = `certbot certificates`;
              break;
            case 'status':
              command = `certbot certificates --cert-name ${input.domain ?? ''}`;
              break;
            default:
              return err(`Action ${input.action} not supported for Let\'s Encrypt`);
          }
          break;
        default:
          return err(`Unknown certificate provider: ${input.provider}`);
      }

      const { stdout, stderr } = await execAsync(command!, {
        timeout: 120_000,
        maxBuffer: 2 * 1024 * 1024,
      });

      const combined = [stdout, stderr].filter(Boolean).join('\n');
      return ok(combined || '(success)');
    } catch (error: unknown) {
      return err(`Certificate operation failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 21. mesh (service mesh — Istio & Linkerd)
// ---------------------------------------------------------------------------

const meshSchema = z.object({
  action: z.enum(['status','traffic-split','mtls-status','virtual-service','gateway','inject','tap','routes'])
    .describe('Service mesh action to perform'),
  provider: z.enum(['istio','linkerd'])
    .describe('Service mesh provider'),
  namespace: z.string().optional().describe('Kubernetes namespace'),
  service: z.string().optional().describe('Service name'),
  args: z.string().optional().describe('Additional arguments'),
});

export const meshTool: ToolDefinition = {
  name: 'mesh',
  description: 'Manage Istio and Linkerd service mesh operations: traffic splitting, mTLS status, virtual services, and routes.',
  inputSchema: meshSchema,
  permissionTier: 'ask_once',
  category: 'devops',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = meshSchema.parse(raw);
      const nsFlag = input.namespace ? `-n ${input.namespace}` : '';

      let command: string;

      if (input.provider === 'istio') {
        switch (input.action) {
          case 'status':
            command = `istioctl proxy-status ${input.service ?? ''} ${nsFlag}`;
            break;
          case 'mtls-status':
            command = `istioctl x describe pod ${input.service ?? ''} ${nsFlag}`;
            break;
          case 'virtual-service':
            command = `kubectl get virtualservice ${input.service ?? ''} ${nsFlag} -o yaml`;
            break;
          case 'gateway':
            command = `kubectl get gateway ${nsFlag} -o yaml`;
            break;
          case 'inject':
            return err('Inject: use `kubectl label namespace <ns> istio-injection=enabled` and redeploy');
          case 'tap':
            command = `istioctl proxy-config ${input.args ?? 'cluster'} ${input.service ?? ''} ${nsFlag}`;
            break;
          case 'routes':
            command = `istioctl proxy-config routes ${input.service ?? ''} ${nsFlag}`;
            break;
          case 'traffic-split':
            command = `kubectl get virtualservice,destinationrule ${nsFlag} -o yaml`;
            break;
          default:
            return err(`Unknown action ${input.action} for Istio`);
        }
      } else if (input.provider === 'linkerd') {
        switch (input.action) {
          case 'status':
            command = `linkerd check ${nsFlag}`;
            break;
          case 'mtls-status':
            command = `linkerd edges pod ${nsFlag}`;
            break;
          case 'tap':
            command = `linkerd tap ${input.service ?? ''} ${nsFlag} ${input.args ?? ''}`.trim();
            break;
          case 'routes':
            command = `linkerd routes ${input.service ?? ''} ${nsFlag}`;
            break;
          case 'traffic-split':
            command = `kubectl get trafficsplit ${nsFlag} -o yaml`;
            break;
          default:
            return err(`Action ${input.action} not supported for Linkerd`);
        }
      } else {
        return err(`Unknown service mesh provider: ${input.provider}`);
      }

      const { stdout, stderr } = await execAsync(command!, {
        timeout: 60_000,
        maxBuffer: 5 * 1024 * 1024,
      });

      const combined = [stdout, stderr].filter(Boolean).join('\n');
      return ok(combined || '(no output)');
    } catch (error: unknown) {
      return err(`Service mesh operation failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 22. cfn (CloudFormation & CDK)
// ---------------------------------------------------------------------------

const cfnSchema = z.object({
  action: z.enum(['list','describe','create','update','delete','validate','events','drift','deploy','diff'])
    .describe('CloudFormation/CDK action'),
  stack_name: z.string().optional().describe('CloudFormation stack name'),
  template: z.string().optional().describe('Template file path or URL'),
  parameters: z.string().optional().describe('Key=Value pairs for stack parameters'),
  region: z.string().optional().describe('AWS region'),
  provider: z.enum(['cloudformation','cdk']).default('cloudformation').describe('IaC provider'),
});

export const cfnTool: ToolDefinition = {
  name: 'cfn',
  description: 'Manage AWS CloudFormation stacks and CDK applications: list, describe, create, update, delete, validate, and detect drift.',
  inputSchema: cfnSchema,
  permissionTier: 'ask_once',
  category: 'devops',
  isDestructive: true,

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = cfnSchema.parse(raw);
      const regionFlag = input.region ? `--region ${input.region}` : '';
      const stack = input.stack_name ?? '';

      let command: string;

      if (input.provider === 'cdk') {
        switch (input.action) {
          case 'list':
            command = `cdk list`;
            break;
          case 'diff':
            command = `cdk diff ${stack}`;
            break;
          case 'deploy':
            command = `cdk deploy ${stack} --require-approval never`;
            break;
          case 'delete':
            command = `cdk destroy ${stack} --force`;
            break;
          default:
            return err(`CDK does not support action: ${input.action}. Use deploy, diff, list, or delete.`);
        }
      } else {
        switch (input.action) {
          case 'list':
            command = `aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE ${regionFlag} --output json`;
            break;
          case 'describe':
            command = `aws cloudformation describe-stacks --stack-name ${stack} ${regionFlag} --output json`;
            break;
          case 'create':
            command = `aws cloudformation create-stack --stack-name ${stack} --template-body file://${input.template ?? 'template.yaml'} ${input.parameters ? `--parameters ${input.parameters}` : ''} ${regionFlag}`;
            break;
          case 'update':
            command = `aws cloudformation update-stack --stack-name ${stack} --template-body file://${input.template ?? 'template.yaml'} ${input.parameters ? `--parameters ${input.parameters}` : ''} ${regionFlag}`;
            break;
          case 'delete':
            command = `aws cloudformation delete-stack --stack-name ${stack} ${regionFlag}`;
            break;
          case 'validate':
            command = `aws cloudformation validate-template --template-body file://${input.template ?? 'template.yaml'} ${regionFlag}`;
            break;
          case 'events':
            command = `aws cloudformation describe-stack-events --stack-name ${stack} ${regionFlag} --output json`;
            break;
          case 'drift':
            command = `aws cloudformation detect-stack-drift --stack-name ${stack} ${regionFlag} --output json`;
            break;
          case 'deploy':
            command = `aws cloudformation deploy --stack-name ${stack} --template-file ${input.template ?? 'template.yaml'} ${input.parameters ? `--parameter-overrides ${input.parameters}` : ''} ${regionFlag}`;
            break;
          case 'diff':
            command = `aws cloudformation get-template --stack-name ${stack} ${regionFlag} --output json`;
            break;
          default:
            return err(`Unknown CloudFormation action: ${input.action}`);
        }
      }

      const { stdout, stderr } = await execAsync(command!, {
        timeout: 300_000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const combined = [stdout, stderr].filter(Boolean).join('\n');
      return ok(combined || '(success)');
    } catch (error: unknown) {
      return err(`CloudFormation/CDK operation failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 23. k8s_rbac (Kubernetes RBAC management)
// ---------------------------------------------------------------------------

const k8sRbacSchema = z.object({
  action: z.enum(['list','get','create','delete','bind','unbind','audit','who-can'])
    .describe('RBAC action to perform'),
  resource_type: z.enum(['serviceaccount','role','clusterrole','rolebinding','clusterrolebinding'])
    .optional()
    .describe('RBAC resource type'),
  name: z.string().optional().describe('Resource name'),
  namespace: z.string().optional().describe('Kubernetes namespace'),
  subject: z.string().optional().describe('Subject (user, group, or serviceaccount)'),
  verb: z.string().optional().describe('Verb for who-can checks (get, list, create, delete, etc.)'),
});

export const k8sRbacTool: ToolDefinition = {
  name: 'k8s_rbac',
  description: 'Manage Kubernetes RBAC: ServiceAccounts, Roles, ClusterRoles, RoleBindings. Audit permissions and check access.',
  inputSchema: k8sRbacSchema,
  permissionTier: 'ask_once',
  category: 'devops',
  isDestructive: true,

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = k8sRbacSchema.parse(raw);
      const nsFlag = input.namespace ? `-n ${input.namespace}` : '';
      const resType = input.resource_type ?? 'role';

      let command: string;

      switch (input.action) {
        case 'list':
          command = `kubectl get ${resType} ${nsFlag} -o wide`;
          break;
        case 'get':
          command = `kubectl describe ${resType} ${input.name ?? ''} ${nsFlag}`;
          break;
        case 'audit':
          command = `kubectl auth can-i --list ${nsFlag}`;
          break;
        case 'who-can':
          if (!input.verb || !input.name) {
            return err('verb and name (resource) are required for who-can checks');
          }
          command = `kubectl who-can ${input.verb} ${input.name} ${nsFlag}`;
          break;
        case 'create':
          if (resType === 'serviceaccount') {
            command = `kubectl create serviceaccount ${input.name ?? ''} ${nsFlag}`;
          } else {
            return err('For create: use kubectl with a manifest file for roles and bindings');
          }
          break;
        case 'bind':
          if (!input.subject || !input.name) {
            return err('subject and name (role) are required for bind action');
          }
          command = `kubectl create rolebinding ${input.subject}-binding --${resType === 'clusterrole' ? 'clusterrole' : 'role'}=${input.name} --user=${input.subject} ${nsFlag}`;
          break;
        case 'unbind':
          command = `kubectl delete rolebinding ${input.name ?? ''} ${nsFlag}`;
          break;
        case 'delete':
          command = `kubectl delete ${resType} ${input.name ?? ''} ${nsFlag}`;
          break;
        default:
          return err(`Unknown RBAC action: ${input.action}`);
      }

      // Warn on wildcard rules before create/bind
      if (['create', 'bind'].includes(input.action) && input.name === '*') {
        return err('SAFETY CHECK: Wildcard (*) resource names in RBAC grant excessive permissions. Use specific resource names instead.');
      }

      const { stdout, stderr } = await execAsync(command!, {
        timeout: 30_000,
        maxBuffer: 2 * 1024 * 1024,
      });

      const combined = [stdout, stderr].filter(Boolean).join('\n');
      return ok(combined || '(success)');
    } catch (error: unknown) {
      return err(`K8s RBAC operation failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// aws, gcloud, az — Cloud CLI tools (M5)
// ---------------------------------------------------------------------------

const awsSchema = z.object({
  service: z.string().describe('AWS service (e.g., "ec2", "s3", "iam", "ecs", "eks")'),
  action: z.string().describe('Service action (e.g., "describe-instances", "list-buckets")'),
  args: z.string().optional().describe('Additional CLI arguments'),
  profile: z.string().optional().describe('AWS profile name (overrides AWS_PROFILE)'),
  region: z.string().optional().describe('AWS region (overrides AWS_DEFAULT_REGION)'),
  output: z.enum(['json', 'text', 'table']).optional().default('json').describe('Output format'),
});

export const awsTool: ToolDefinition = {
  name: 'aws',
  description: 'Execute AWS CLI commands. Use for cloud resource management, IAM, EC2, S3, EKS, RDS, and all AWS services. Prefer this over bash for AWS operations.',
  inputSchema: awsSchema,
  permissionTier: 'ask_once',
  category: 'devops',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = awsSchema.parse(raw);
      const parts = ['aws', input.service, input.action];
      if (input.profile) parts.push('--profile', input.profile);
      else if (process.env.AWS_PROFILE) parts.push('--profile', process.env.AWS_PROFILE);
      if (input.region) parts.push('--region', input.region);
      parts.push('--output', input.output ?? 'json');
      if (input.args) parts.push(input.args);
      const command = parts.join(' ');
      const env = { ...process.env } as NodeJS.ProcessEnv;
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
        env,
      });
      const combined = [stdout, stderr].filter(Boolean).join('\n');
      return ok(combined || '(no output)');
    } catch (error: unknown) {
      return err(`AWS CLI failed: ${errorMessage(error)}`);
    }
  },
};

const gcloudSchema = z.object({
  service: z.string().describe('GCP service group (e.g., "compute", "container", "sql", "storage")'),
  action: z.string().describe('Service action (e.g., "instances list", "clusters get-credentials")'),
  args: z.string().optional().describe('Additional CLI arguments'),
  project: z.string().optional().describe('GCP project ID'),
  region: z.string().optional().describe('GCP region'),
  output: z.enum(['json', 'yaml', 'text', 'table']).optional().default('json').describe('Output format'),
});

export const gcloudTool: ToolDefinition = {
  name: 'gcloud',
  description: 'Execute Google Cloud CLI (gcloud) commands. Use for GCP resource management, GKE, Cloud SQL, GCS, and all GCP services. Prefer this over bash for GCP operations.',
  inputSchema: gcloudSchema,
  permissionTier: 'ask_once',
  category: 'devops',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = gcloudSchema.parse(raw);
      const parts = ['gcloud', input.service, input.action];
      if (input.project) parts.push('--project', input.project);
      if (input.region) parts.push('--region', input.region);
      parts.push('--format', input.output ?? 'json');
      if (input.args) parts.push(input.args);
      const command = parts.join(' ');
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      const combined = [stdout, stderr].filter(Boolean).join('\n');
      return ok(combined || '(no output)');
    } catch (error: unknown) {
      return err(`gcloud CLI failed: ${errorMessage(error)}`);
    }
  },
};

const azSchema = z.object({
  service: z.string().describe('Azure service group (e.g., "vm", "aks", "storage", "sql", "network")'),
  action: z.string().describe('Service action (e.g., "list", "show", "create", "delete")'),
  args: z.string().optional().describe('Additional CLI arguments'),
  subscription: z.string().optional().describe('Azure subscription ID'),
  resource_group: z.string().optional().describe('Azure resource group'),
  output: z.enum(['json', 'yaml', 'table', 'tsv']).optional().default('json').describe('Output format'),
});

export const azTool: ToolDefinition = {
  name: 'az',
  description: 'Execute Azure CLI (az) commands. Use for Azure resource management, AKS, Azure SQL, Storage, and all Azure services. Prefer this over bash for Azure operations.',
  inputSchema: azSchema,
  permissionTier: 'ask_once',
  category: 'devops',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = azSchema.parse(raw);
      const parts = ['az', input.service, input.action];
      if (input.subscription) parts.push('--subscription', input.subscription);
      if (input.resource_group) parts.push('--resource-group', input.resource_group);
      parts.push('--output', input.output ?? 'json');
      if (input.args) parts.push(input.args);
      const command = parts.join(' ');
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      const combined = [stdout, stderr].filter(Boolean).join('\n');
      return ok(combined || '(no output)');
    } catch (error: unknown) {
      return err(`az CLI failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 27. incident
// ---------------------------------------------------------------------------

const incidentSchema = z.object({
  provider: z.enum(['pagerduty', 'opsgenie']).describe('Incident management provider'),
  action: z.enum(['list', 'get', 'acknowledge', 'resolve', 'create', 'on-call']).describe('Action to perform'),
  id: z.string().optional().describe('Incident/alert ID for get/acknowledge/resolve'),
  title: z.string().optional().describe('Title for create action'),
  body: z.string().optional().describe('Description for create action'),
  urgency: z.enum(['high', 'low']).optional().describe('Urgency for create action (PagerDuty)'),
  service_id: z.string().optional().describe('Service ID for create action (PagerDuty)'),
  team_id: z.string().optional().describe('Team ID for Opsgenie alerts'),
  status: z.enum(['triggered', 'acknowledged', 'resolved']).optional().describe('Filter by status for list action'),
});

export const incidentTool: ToolDefinition = {
  name: 'incident',
  description: 'Manage incidents and alerts via PagerDuty or Opsgenie — list, acknowledge, resolve, and create incidents',
  category: 'devops',
  permissionTier: 'ask_once',
  inputSchema: incidentSchema,
  execute: async (rawInput) => {
    const input = rawInput as z.infer<typeof incidentSchema>;
    const { provider, action, id, title, body, urgency, service_id, team_id, status } = input;

    if (provider === 'pagerduty') {
      const apiKey = process.env.PD_API_KEY || process.env.PAGERDUTY_API_KEY;
      if (!apiKey) {
        return err('PagerDuty API key not found. Set PD_API_KEY or PAGERDUTY_API_KEY environment variable.');
      }
      const baseUrl = 'https://api.pagerduty.com';
      const headers = { 'Authorization': `Token token=${apiKey}`, 'Accept': 'application/vnd.pagerduty+json;version=2', 'Content-Type': 'application/json' };

      try {
        if (action === 'list') {
          const params = new URLSearchParams();
          if (status) params.set('statuses[]', status);
          params.set('limit', '20');
          const res = await fetch(`${baseUrl}/incidents?${params}`, { headers });
          if (!res.ok) return err(`PagerDuty API error: ${res.status} ${res.statusText}`);
          const data = await res.json() as { incidents: Array<{ id: string; title: string; status: string; urgency: string; created_at: string }> };
          if (!data.incidents.length) return ok('No incidents found.');
          return ok(data.incidents.map(i => `[${i.status.toUpperCase()}] ${i.id}: ${i.title} (${i.urgency}) — ${i.created_at}`).join('\n'));
        }
        if (action === 'get' && id) {
          const res = await fetch(`${baseUrl}/incidents/${id}`, { headers });
          if (!res.ok) return err(`PagerDuty API error: ${res.status} ${res.statusText}`);
          const data = await res.json() as { incident: { id: string; title: string; status: string; urgency: string; body?: { details?: string }; created_at: string } };
          const inc = data.incident;
          return ok(`ID: ${inc.id}\nTitle: ${inc.title}\nStatus: ${inc.status}\nUrgency: ${inc.urgency}\nCreated: ${inc.created_at}\n${inc.body?.details ? `Details: ${inc.body.details}` : ''}`);
        }
        if (action === 'acknowledge' && id) {
          const res = await fetch(`${baseUrl}/incidents/${id}`, {
            method: 'PUT', headers,
            body: JSON.stringify({ incident: { type: 'incident_reference', status: 'acknowledged' } }),
          });
          if (!res.ok) return err(`PagerDuty API error: ${res.status} ${res.statusText}`);
          return ok(`Incident ${id} acknowledged.`);
        }
        if (action === 'resolve' && id) {
          const res = await fetch(`${baseUrl}/incidents/${id}`, {
            method: 'PUT', headers,
            body: JSON.stringify({ incident: { type: 'incident_reference', status: 'resolved' } }),
          });
          if (!res.ok) return err(`PagerDuty API error: ${res.status} ${res.statusText}`);
          return ok(`Incident ${id} resolved.`);
        }
        if (action === 'create') {
          if (!title || !service_id) return err('create action requires title and service_id');
          const res = await fetch(`${baseUrl}/incidents`, {
            method: 'POST', headers,
            body: JSON.stringify({ incident: { type: 'incident', title, urgency: urgency ?? 'high', service: { id: service_id, type: 'service_reference' }, body: body ? { type: 'incident_body', details: body } : undefined } }),
          });
          if (!res.ok) return err(`PagerDuty API error: ${res.status} ${res.statusText}`);
          const data = await res.json() as { incident: { id: string } };
          return ok(`Incident created: ${data.incident.id}`);
        }
        if (action === 'on-call') {
          const res = await fetch(`${baseUrl}/oncalls?limit=10`, { headers });
          if (!res.ok) return err(`PagerDuty API error: ${res.status} ${res.statusText}`);
          const data = await res.json() as { oncalls: Array<{ user: { summary: string }; schedule?: { summary?: string }; start: string; end: string }> };
          return ok(data.oncalls.map(o => `${o.user.summary}${o.schedule?.summary ? ` (${o.schedule.summary})` : ''} until ${o.end}`).join('\n') || 'No on-call data found.');
        }
        return err(`Unknown action: ${action}`);
      } catch (e) {
        return err(errorMessage(e));
      }
    } else {
      // Opsgenie
      const apiKey = process.env.OPSGENIE_API_KEY;
      if (!apiKey) {
        return err('Opsgenie API key not found. Set OPSGENIE_API_KEY environment variable.');
      }
      const baseUrl = 'https://api.opsgenie.com/v2';
      const headers = { 'Authorization': `GenieKey ${apiKey}`, 'Content-Type': 'application/json' };

      try {
        if (action === 'list') {
          const params = new URLSearchParams({ limit: '20', sort: 'createdAt', order: 'desc' });
          if (status) params.set('query', `status=${status}`);
          const res = await fetch(`${baseUrl}/alerts?${params}`, { headers });
          if (!res.ok) return err(`Opsgenie API error: ${res.status} ${res.statusText}`);
          const data = await res.json() as { data: Array<{ id: string; tinyId: string; message: string; status: string; priority: string; createdAt: string }> };
          if (!data.data.length) return ok('No alerts found.');
          return ok(data.data.map(a => `[${a.status.toUpperCase()}] ${a.tinyId}: ${a.message} (${a.priority}) — ${a.createdAt}`).join('\n'));
        }
        if (action === 'get' && id) {
          const res = await fetch(`${baseUrl}/alerts/${id}`, { headers });
          if (!res.ok) return err(`Opsgenie API error: ${res.status} ${res.statusText}`);
          const data = await res.json() as { data: { id: string; message: string; status: string; priority: string; description?: string; createdAt: string } };
          const a = data.data;
          return ok(`ID: ${a.id}\nMessage: ${a.message}\nStatus: ${a.status}\nPriority: ${a.priority}\nCreated: ${a.createdAt}\n${a.description ? `Description: ${a.description}` : ''}`);
        }
        if (action === 'acknowledge' && id) {
          const res = await fetch(`${baseUrl}/alerts/${id}/acknowledge`, {
            method: 'POST', headers, body: JSON.stringify({ note: 'Acknowledged via Nimbus' }),
          });
          if (!res.ok) return err(`Opsgenie API error: ${res.status} ${res.statusText}`);
          return ok(`Alert ${id} acknowledged.`);
        }
        if (action === 'resolve' && id) {
          const res = await fetch(`${baseUrl}/alerts/${id}/close`, {
            method: 'POST', headers, body: JSON.stringify({ note: 'Resolved via Nimbus' }),
          });
          if (!res.ok) return err(`Opsgenie API error: ${res.status} ${res.statusText}`);
          return ok(`Alert ${id} resolved.`);
        }
        if (action === 'create') {
          if (!title) return err('create action requires title');
          const res = await fetch(`${baseUrl}/alerts`, {
            method: 'POST', headers,
            body: JSON.stringify({ message: title, description: body, priority: urgency === 'high' ? 'P1' : 'P3', teams: team_id ? [{ id: team_id }] : undefined }),
          });
          if (!res.ok) return err(`Opsgenie API error: ${res.status} ${res.statusText}`);
          const data = await res.json() as { requestId: string };
          return ok(`Alert created. Request ID: ${data.requestId}`);
        }
        if (action === 'on-call') {
          const res = await fetch(`${baseUrl}/schedules/on-calls`, { headers });
          if (!res.ok) return err(`Opsgenie API error: ${res.status} ${res.statusText}`);
          const data = await res.json() as { data: Array<{ _parent?: { name?: string }; onCallParticipants: Array<{ name: string }> }> };
          return ok(data.data.map(s => `${s._parent?.name}: ${s.onCallParticipants.map((p) => p.name).join(', ')}`).join('\n') || 'No on-call data.');
        }
        return err(`Unknown action: ${action}`);
      } catch (e) {
        return err(errorMessage(e));
      }
    }
  },
};

// ---------------------------------------------------------------------------
// 28. generate_infra (IaC generation from natural language)
// ---------------------------------------------------------------------------

const generateInfraSchema = z.object({
  type: z.enum(['terraform', 'kubernetes', 'helm'])
    .describe('Type of infrastructure to generate'),
  intent: z.string().describe('Natural language description of what to generate'),
  provider: z.enum(['aws', 'gcp', 'azure']).optional()
    .describe('Cloud provider (for terraform generation)'),
  outputDir: z.string().optional()
    .describe('Directory to write generated files to (default: ./generated/)'),
});

export const generateInfraTool: ToolDefinition = {
  name: 'generate_infra',
  description: 'Generate infrastructure as code (Terraform, Kubernetes manifests, or Helm charts) from natural language descriptions. Writes files to outputDir.',
  inputSchema: generateInfraSchema,
  permissionTier: 'ask_once',
  category: 'devops',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = generateInfraSchema.parse(raw);
      const { mkdirSync, writeFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const outputDir = input.outputDir ?? './generated';

      mkdirSync(outputDir, { recursive: true });

      if (input.type === 'terraform') {
        const { TerraformProjectGenerator } = await import('../../generator');
        const provider = input.provider ?? 'aws';
        const generator = new TerraformProjectGenerator();
        const projectName = input.intent.replace(/[^a-z0-9-]/gi, '-').toLowerCase().slice(0, 32) || 'nimbus-infra';
        const project = await generator.generate({
          projectName,
          provider,
          region: provider === 'aws' ? 'us-east-1' : provider === 'gcp' ? 'us-central1' : 'eastus',
          components: [],
        });
        const files: string[] = [];
        for (const file of project.files) {
          const parts = file.path.split('/').slice(0, -1).join('/');
          if (parts) mkdirSync(join(outputDir, parts), { recursive: true });
          const filePath = join(outputDir, file.path);
          writeFileSync(filePath, file.content, 'utf-8');
          files.push(file.path);
        }
        return ok(`Generated ${files.length} Terraform files in ${outputDir}:\n${files.join('\n')}`);
      }

      if (input.type === 'kubernetes') {
        const { createKubernetesGenerator } = await import('../../generator');
        const appName = input.intent.replace(/[^a-z0-9-]/gi, '-').toLowerCase().slice(0, 32) || 'app';
        const generator = createKubernetesGenerator({
          appName,
          namespace: 'default',
          workloadType: 'deployment',
          image: `${appName}:latest`,
          replicas: 2,
          containerPort: 8080,
          resources: { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '500m', memory: '512Mi' } },
        });
        const manifests = generator.generate();
        const files: string[] = [];
        for (const manifest of manifests) {
          const filename = `${manifest.kind.toLowerCase()}-${manifest.name}.yaml`;
          const filePath = join(outputDir, filename);
          writeFileSync(filePath, manifest.content, 'utf-8');
          files.push(filename);
        }
        return ok(`Generated ${files.length} Kubernetes manifests in ${outputDir}:\n${files.join('\n')}`);
      }

      if (input.type === 'helm') {
        const { createHelmGenerator } = await import('../../generator');
        const chartName = input.intent.replace(/[^a-z0-9-]/gi, '-').toLowerCase().slice(0, 32) || 'my-chart';
        const generator = createHelmGenerator({
          name: chartName,
          description: input.intent,
          version: '0.1.0',
          appVersion: '1.0.0',
          values: {
            image: { repository: chartName, tag: 'latest' },
          },
        });
        const chartFiles = generator.generate();
        const files: string[] = [];
        for (const file of chartFiles) {
          const parts = file.path.split('/').slice(0, -1).join('/');
          if (parts) mkdirSync(join(outputDir, parts), { recursive: true });
          const filePath = join(outputDir, file.path);
          writeFileSync(filePath, file.content, 'utf-8');
          files.push(file.path);
        }
        return ok(`Generated Helm chart in ${outputDir}:\n${files.join('\n')}`);
      }

      return err(`Unknown type: ${input.type}`);
    } catch (error: unknown) {
      return err(`Infrastructure generation failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 29. ansible
// ---------------------------------------------------------------------------

const ansibleSchema = z.object({
  action: z.enum([
    'playbook', 'syntax-check', 'dry-run', 'inventory-list',
    'vault-encrypt', 'vault-decrypt', 'vault-view',
    'galaxy-install', 'galaxy-search', 'facts',
  ]).describe('Ansible action to perform'),
  playbook: z.string().optional().describe('Path to the playbook .yml file'),
  inventory: z.string().optional().describe('Inventory file or host pattern'),
  vault_password_file: z.string().optional().describe('Path to vault password file'),
  extra_vars: z.record(z.string(), z.unknown()).optional().describe('Extra variables as key-value pairs'),
  tags: z.string().optional().describe('Comma-separated list of tags to run'),
  limit: z.string().optional().describe('Limit playbook run to specific hosts'),
  check: z.boolean().optional().describe('Run in check (dry-run) mode'),
  verbose: z.enum(['v', 'vv', 'vvv']).optional().describe('Verbosity level'),
  galaxy_role: z.string().optional().describe('Galaxy role name for galaxy-install/galaxy-search'),
  vault_file: z.string().optional().describe('File to encrypt/decrypt for vault actions'),
  workdir: z.string().optional().describe('Working directory for ansible commands'),
});

export const ansibleTool: ToolDefinition = {
  name: 'ansible',
  description: 'Run Ansible playbooks, manage Ansible Vault, interact with Ansible Galaxy, and gather host facts.',
  inputSchema: ansibleSchema,
  permissionTier: 'always_ask',
  category: 'devops',
  isDestructive: true,

  async execute(raw: unknown, ctx?: import('./types').ToolExecuteContext): Promise<ToolResult> {
    try {
      const input = ansibleSchema.parse(raw);

      const cwd = input.workdir ?? process.cwd();
      const env: NodeJS.ProcessEnv = { ...process.env };

      if (input.vault_password_file) {
        env.ANSIBLE_VAULT_PASSWORD_FILE = input.vault_password_file;
      }

      const buildCommonFlags = (): string[] => {
        const flags: string[] = [];
        if (input.inventory) flags.push('-i', input.inventory);
        if (input.vault_password_file) flags.push('--vault-password-file', input.vault_password_file);
        if (input.extra_vars) flags.push('-e', JSON.stringify(input.extra_vars));
        if (input.tags) flags.push('--tags', input.tags);
        if (input.limit) flags.push('--limit', input.limit);
        if (input.verbose) flags.push(`-${input.verbose}`);
        return flags;
      };

      switch (input.action) {
        case 'playbook':
        case 'dry-run': {
          if (!input.playbook) return err('playbook action requires playbook path');
          const args = ['ansible-playbook', input.playbook, ...buildCommonFlags()];
          if (input.action === 'dry-run' || input.check) args.push('--check');
          const spawnResult = await spawnExec(args.join(' '), {
            cwd,
            env,
            timeout: ctx?.timeout ?? DEFAULT_TIMEOUT,
            signal: ctx?.signal,
            onChunk: ctx?.onProgress,
            label: 'ansible-playbook',
          });
          const combined = [spawnResult.stdout, spawnResult.stderr].filter(Boolean).join('\n');
          if (spawnResult.exitCode !== 0) return err(`ansible-playbook failed:\n${combined}`);
          return ok(combined || 'Playbook completed successfully.');
        }

        case 'syntax-check': {
          if (!input.playbook) return err('syntax-check requires playbook path');
          const args = ['ansible-playbook', '--syntax-check', input.playbook, ...buildCommonFlags()];
          const { stdout, stderr } = await execAsync(args.join(' '), {
            cwd, env, timeout: 60_000, maxBuffer: 5 * 1024 * 1024,
          });
          const out = [stdout, stderr].filter(Boolean).join('\n');
          return ok(out || 'Syntax check passed.');
        }

        case 'inventory-list': {
          const invFlag = input.inventory ? `-i ${input.inventory}` : '';
          const { stdout, stderr } = await execAsync(
            `ansible-inventory ${invFlag} --list`,
            { cwd, env, timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }
          );
          return ok([stdout, stderr].filter(Boolean).join('\n') || '(no inventory output)');
        }

        case 'vault-encrypt': {
          if (!input.vault_file) return err('vault-encrypt requires vault_file');
          const pwFlag = input.vault_password_file ? `--vault-password-file ${input.vault_password_file}` : '';
          const { stdout, stderr } = await execAsync(
            `ansible-vault encrypt ${pwFlag} ${input.vault_file}`,
            { cwd, env, timeout: 30_000, maxBuffer: 1024 * 1024 }
          );
          return ok([stdout, stderr].filter(Boolean).join('\n') || `Encrypted ${input.vault_file}`);
        }

        case 'vault-decrypt': {
          if (!input.vault_file) return err('vault-decrypt requires vault_file');
          const pwFlag = input.vault_password_file ? `--vault-password-file ${input.vault_password_file}` : '';
          const { stdout, stderr } = await execAsync(
            `ansible-vault decrypt ${pwFlag} ${input.vault_file}`,
            { cwd, env, timeout: 30_000, maxBuffer: 1024 * 1024 }
          );
          return ok([stdout, stderr].filter(Boolean).join('\n') || `Decrypted ${input.vault_file}`);
        }

        case 'vault-view': {
          if (!input.vault_file) return err('vault-view requires vault_file');
          const pwFlag = input.vault_password_file ? `--vault-password-file ${input.vault_password_file}` : '';
          const { stdout } = await execAsync(
            `ansible-vault view ${pwFlag} ${input.vault_file}`,
            { cwd, env, timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }
          );
          return ok(stdout || '(empty vault file)');
        }

        case 'galaxy-install': {
          if (!input.galaxy_role) return err('galaxy-install requires galaxy_role');
          const { stdout, stderr } = await execAsync(
            `ansible-galaxy install ${input.galaxy_role}`,
            { cwd, env, timeout: 120_000, maxBuffer: 5 * 1024 * 1024 }
          );
          return ok([stdout, stderr].filter(Boolean).join('\n'));
        }

        case 'galaxy-search': {
          if (!input.galaxy_role) return err('galaxy-search requires galaxy_role (search query)');
          const { stdout } = await execAsync(
            `ansible-galaxy search ${input.galaxy_role}`,
            { cwd, env, timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }
          );
          return ok(stdout || 'No results found.');
        }

        case 'facts': {
          const host = input.limit ?? 'all';
          const invFlag = input.inventory ? `-i ${input.inventory}` : '';
          const { stdout } = await execAsync(
            `ansible ${host} ${invFlag} -m setup --tree /tmp/ansible-facts`,
            { cwd, env, timeout: 60_000, maxBuffer: 10 * 1024 * 1024 }
          );
          return ok(stdout || '(facts gathered to /tmp/ansible-facts)');
        }

        default:
          return err(`Unknown ansible action: ${(input as { action: string }).action}`);
      }
    } catch (error: unknown) {
      return err(`Ansible operation failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 30. policy_check (IaC policy scanning)
// ---------------------------------------------------------------------------

const policyCheckSchema = z.object({
  tool: z.enum(['checkov', 'tfsec', 'trivy-config', 'conftest', 'kyverno'])
    .describe('Policy checking tool to use'),
  target: z.string().describe('Path to scan (directory or file)'),
  framework: z.string().optional().describe('Checkov framework filter (e.g., terraform, kubernetes, dockerfile)'),
  policy_dir: z.string().optional().describe('Policy directory for conftest'),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional()
    .describe('Minimum severity threshold to report'),
  fail_on_violation: z.boolean().optional().describe('Exit with error if violations found'),
});

export const policyCheckTool: ToolDefinition = {
  name: 'policy_check',
  description: 'Run IaC policy checks before applies using checkov, tfsec, trivy, conftest, or kyverno. Catches misconfigurations early.',
  inputSchema: policyCheckSchema,
  permissionTier: 'auto_allow',
  category: 'devops',
  isDestructive: false,

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = policyCheckSchema.parse(raw);

      let command: string;
      let parseJson = false;

      switch (input.tool) {
        case 'checkov': {
          const frameworkFlag = input.framework ? `--framework ${input.framework}` : '';
          const severityFlag = input.severity ? `--check-threshold ${input.severity}` : '';
          command = `checkov -d ${input.target} ${frameworkFlag} ${severityFlag} -o json`.trim();
          parseJson = true;
          break;
        }
        case 'tfsec': {
          const severityFlag = input.severity ? `--minimum-severity ${input.severity.toLowerCase()}` : '';
          command = `tfsec ${input.target} ${severityFlag} --format json`.trim();
          parseJson = true;
          break;
        }
        case 'trivy-config': {
          const severityFlag = input.severity ? `--severity ${input.severity}` : '';
          command = `trivy config ${input.target} ${severityFlag} --format json`.trim();
          parseJson = true;
          break;
        }
        case 'conftest': {
          const policyFlag = input.policy_dir ? `--policy ${input.policy_dir}` : '';
          command = `conftest test ${input.target} ${policyFlag}`.trim();
          parseJson = false;
          break;
        }
        case 'kyverno': {
          command = `kyverno apply ${input.policy_dir ?? '.'} --resource ${input.target}`.trim();
          parseJson = false;
          break;
        }
        default:
          return err(`Unknown policy tool: ${input.tool}`);
      }

      try {
        const { stdout, stderr } = await execAsync(command, {
          timeout: 120_000,
          maxBuffer: 10 * 1024 * 1024,
        });
        const output = stdout || stderr || '';

        if (parseJson) {
          try {
            const data = JSON.parse(output);
            // Summarize violations by severity
            const results = data.results ?? data.Issues ?? data.Results ?? [];
            const counts: Record<string, number> = {};
            if (Array.isArray(results)) {
              for (const r of results) {
                const sev = (r.severity ?? r.severity_level ?? r.Level ?? 'UNKNOWN').toUpperCase();
                counts[sev] = (counts[sev] ?? 0) + 1;
              }
            }
            const summary = Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ') || 'No violations';
            const totalResults = Array.isArray(results) ? results.length : 0;
            if (input.fail_on_violation && totalResults > 0) {
              return err(`Policy violations found: ${summary}\n\nFull output:\n${output.slice(0, 5000)}`);
            }
            return ok(`Policy check (${input.tool}): ${summary}\n\nTarget: ${input.target}\n\nFull output:\n${output.slice(0, 5000)}`);
          } catch {
            return ok(output.slice(0, 10000));
          }
        }

        const hasViolation = output.toLowerCase().includes('fail') || output.toLowerCase().includes('violation');
        if (input.fail_on_violation && hasViolation) {
          return err(`Policy violations found:\n${output.slice(0, 10000)}`);
        }
        return ok(output.slice(0, 10000) || 'Policy check passed.');
      } catch (execErr: unknown) {
        const msg = errorMessage(execErr);
        // Some tools exit non-zero when violations found — capture stdout
        if (msg.includes('stdout:') || msg.includes('stderr:')) {
          return ok(`Policy violations found:\n${msg.slice(0, 10000)}`);
        }
        return err(`Policy check failed: ${msg}`);
      }
    } catch (error: unknown) {
      return err(`policy_check error: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 31. rollout_control (Argo Rollouts / Flagger canary)
// ---------------------------------------------------------------------------

const rolloutControlSchema = z.object({
  tool: z.enum(['argo-rollouts', 'flagger'])
    .describe('Rollout tool to use'),
  action: z.enum(['status', 'promote', 'abort', 'pause', 'resume', 'set-weight', 'analyze'])
    .describe('Action to perform on the rollout'),
  name: z.string().describe('Rollout or Canary resource name'),
  namespace: z.string().optional().describe('Kubernetes namespace'),
  weight: z.number().min(0).max(100).optional().describe('Traffic weight (0-100) for set-weight action'),
});

export const rolloutControlTool: ToolDefinition = {
  name: 'rollout_control',
  description: 'Control canary/progressive delivery rollouts via Argo Rollouts or Flagger. Promote, abort, pause, resume, and set traffic weights.',
  inputSchema: rolloutControlSchema,
  permissionTier: 'ask_once',
  category: 'devops',
  isDestructive: false,

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = rolloutControlSchema.parse(raw);
      const nsFlag = input.namespace ? `-n ${input.namespace}` : '';

      let command: string;

      if (input.tool === 'argo-rollouts') {
        switch (input.action) {
          case 'status':
            command = `kubectl argo rollouts get rollout ${input.name} ${nsFlag}`;
            break;
          case 'promote':
            command = `kubectl argo rollouts promote ${input.name} ${nsFlag}`;
            break;
          case 'abort':
            command = `kubectl argo rollouts abort ${input.name} ${nsFlag}`;
            break;
          case 'pause':
            command = `kubectl argo rollouts pause ${input.name} ${nsFlag}`;
            break;
          case 'resume':
            command = `kubectl argo rollouts resume ${input.name} ${nsFlag}`;
            break;
          case 'set-weight':
            if (input.weight === undefined) return err('set-weight requires weight parameter (0-100)');
            command = `kubectl argo rollouts set weight ${input.name} ${input.weight} ${nsFlag}`;
            break;
          case 'analyze':
            command = `kubectl argo rollouts get rollout ${input.name} ${nsFlag} -o json`;
            break;
          default:
            return err(`Unknown action: ${input.action}`);
        }
      } else if (input.tool === 'flagger') {
        switch (input.action) {
          case 'status':
            command = `kubectl get canary ${input.name} ${nsFlag} -o yaml`;
            break;
          case 'promote':
            command = `kubectl annotate canary ${input.name} ${nsFlag} flagger.app/manual-promote=true`;
            break;
          case 'abort':
            command = `kubectl annotate canary ${input.name} ${nsFlag} flagger.app/manual-abort=true`;
            break;
          case 'pause':
            command = `kubectl patch canary ${input.name} ${nsFlag} --type=json -p='[{"op":"replace","path":"/spec/skipAnalysis","value":true}]'`;
            break;
          case 'resume':
            command = `kubectl patch canary ${input.name} ${nsFlag} --type=json -p='[{"op":"replace","path":"/spec/skipAnalysis","value":false}]'`;
            break;
          case 'analyze':
            command = `kubectl get canary ${input.name} ${nsFlag} -o json`;
            break;
          default:
            return err(`Flagger does not support action: ${input.action}. Try: status, promote, abort, pause, resume, analyze`);
        }
      } else {
        return err(`Unknown tool: ${input.tool}`);
      }

      const { stdout, stderr } = await execAsync(command, {
        timeout: 60_000,
        maxBuffer: 5 * 1024 * 1024,
      });
      return ok([stdout, stderr].filter(Boolean).join('\n') || '(no output)');
    } catch (error: unknown) {
      return err(`Rollout control failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 32. db_migrate
// ---------------------------------------------------------------------------

const dbMigrateSchema = z.object({
  tool: z.enum(['flyway', 'liquibase', 'golang-migrate', 'sqitch'])
    .describe('Database migration tool'),
  action: z.enum(['info', 'migrate', 'rollback', 'validate', 'clean', 'baseline'])
    .describe('Migration action'),
  url: z.string().optional().describe('Database JDBC URL or connection string'),
  migrations_dir: z.string().optional().describe('Directory containing migration files'),
  version: z.string().optional().describe('Target version for rollback'),
});

export const dbMigrateTool: ToolDefinition = {
  name: 'db_migrate',
  description: 'Run database migrations using flyway, liquibase, golang-migrate, or sqitch. Info, migrate, rollback, validate, clean, baseline.',
  inputSchema: dbMigrateSchema,
  permissionTier: 'always_ask',
  category: 'devops',
  isDestructive: true,

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = dbMigrateSchema.parse(raw);
      let command: string;

      const urlFlag = input.url ? `-url=${input.url}` : '';
      const locFlag = input.migrations_dir ? `-locations=filesystem:${input.migrations_dir}` : '';

      switch (input.tool) {
        case 'flyway':
          command = `flyway ${urlFlag} ${locFlag} ${input.action}`.trim();
          break;
        case 'liquibase': {
          const urlLb = input.url ? `--url=${input.url}` : '';
          const chlog = input.migrations_dir ? `--changeLogFile=${input.migrations_dir}/changelog.xml` : '';
          command = `liquibase ${urlLb} ${chlog} ${input.action}`.trim();
          break;
        }
        case 'golang-migrate': {
          const urlGo = input.url ? `-database ${input.url}` : '';
          const srcFlag = input.migrations_dir ? `-path ${input.migrations_dir}` : '';
          const versionFlag = input.action === 'rollback' && input.version ? `down ${input.version}` : '';
          const actionArg = input.action === 'migrate' ? 'up' : input.action === 'rollback' ? (versionFlag || 'down 1') : input.action;
          command = `migrate ${urlGo} ${srcFlag} ${actionArg}`.trim();
          break;
        }
        case 'sqitch': {
          const actionArg = input.action === 'migrate' ? 'deploy' : input.action === 'rollback' ? 'revert' : input.action;
          command = `sqitch ${actionArg}`.trim();
          break;
        }
        default:
          return err(`Unknown migration tool: ${input.tool}`);
      }

      const { stdout, stderr } = await execAsync(command, {
        timeout: 300_000,
        maxBuffer: 10 * 1024 * 1024,
        ...(input.migrations_dir ? { cwd: input.migrations_dir } : {}),
      });
      return ok([stdout, stderr].filter(Boolean).join('\n') || `Migration ${input.action} completed.`);
    } catch (error: unknown) {
      return err(`Database migration failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 33. env_diff
// ---------------------------------------------------------------------------

const envDiffSchema = z.object({
  type: z.enum(['terraform-workspaces', 'k8s-namespaces', 'helm-releases'])
    .describe('Type of environment diff to perform'),
  source: z.string().describe('Source workspace, namespace, or release name'),
  target: z.string().describe('Target workspace, namespace, or release name'),
  show_values: z.boolean().optional().describe('Include full values in diff (may be verbose)'),
  workdir: z.string().optional().describe('Working directory for terraform operations'),
});

export const envDiffTool: ToolDefinition = {
  name: 'env_diff',
  description: 'Compare two environments: terraform workspaces, k8s namespaces, or helm releases. Shows what differs between staging and production.',
  inputSchema: envDiffSchema,
  permissionTier: 'auto_allow',
  category: 'devops',
  isDestructive: false,

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = envDiffSchema.parse(raw);

      if (input.type === 'terraform-workspaces') {
        const cwd = input.workdir ?? process.cwd();
        let srcPlan = '';
        let tgtPlan = '';
        try {
          await execAsync(`terraform -chdir=${cwd} workspace select ${input.source}`, { timeout: 30_000, maxBuffer: 1024 * 1024 });
          const { stdout: s } = await execAsync(`terraform -chdir=${cwd} plan -no-color`, { timeout: 300_000, maxBuffer: 10 * 1024 * 1024 });
          srcPlan = s;
        } catch (e) { srcPlan = `Error: ${errorMessage(e)}`; }
        try {
          await execAsync(`terraform -chdir=${cwd} workspace select ${input.target}`, { timeout: 30_000, maxBuffer: 1024 * 1024 });
          const { stdout: t } = await execAsync(`terraform -chdir=${cwd} plan -no-color`, { timeout: 300_000, maxBuffer: 10 * 1024 * 1024 });
          tgtPlan = t;
        } catch (e) { tgtPlan = `Error: ${errorMessage(e)}`; }
        return ok(`=== ${input.source} workspace ===\n${srcPlan.slice(0, 3000)}\n\n=== ${input.target} workspace ===\n${tgtPlan.slice(0, 3000)}`);

      } else if (input.type === 'k8s-namespaces') {
        const getSrc = await execAsync(`kubectl get all -n ${input.source} -o yaml`, { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 }).catch(e => ({ stdout: `Error: ${errorMessage(e)}`, stderr: '' }));
        const getTgt = await execAsync(`kubectl get all -n ${input.target} -o yaml`, { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 }).catch(e => ({ stdout: `Error: ${errorMessage(e)}`, stderr: '' }));
        const src = getSrc.stdout.slice(0, 5000);
        const tgt = getTgt.stdout.slice(0, 5000);
        return ok(`=== namespace: ${input.source} ===\n${src}\n\n=== namespace: ${input.target} ===\n${tgt}`);

      } else if (input.type === 'helm-releases') {
        const getAllFlag = input.show_values ? '--all' : '';
        const srcVals = await execAsync(`helm get values ${input.source} ${getAllFlag}`, { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }).catch(e => ({ stdout: `Error: ${errorMessage(e)}`, stderr: '' }));
        const tgtVals = await execAsync(`helm get values ${input.target} ${getAllFlag}`, { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }).catch(e => ({ stdout: `Error: ${errorMessage(e)}`, stderr: '' }));
        return ok(`=== release: ${input.source} ===\n${srcVals.stdout.slice(0, 5000)}\n\n=== release: ${input.target} ===\n${tgtVals.stdout.slice(0, 5000)}`);
      }

      return err(`Unknown diff type: ${input.type}`);
    } catch (error: unknown) {
      return err(`Environment diff failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 34. notify (Slack / PagerDuty / Teams / Webhook)
// ---------------------------------------------------------------------------

const notifySchema = z.object({
  channel: z.enum(['slack', 'pagerduty', 'teams', 'webhook'])
    .describe('Notification channel'),
  action: z.enum(['send', 'resolve-incident', 'create-incident'])
    .describe('Notification action'),
  webhook_url: z.string().optional().describe('Webhook URL (Slack/Teams/custom)'),
  message: z.string().optional().describe('Message text to send'),
  severity: z.enum(['info', 'warning', 'critical']).optional().describe('Severity level'),
  incident_id: z.string().optional().describe('PagerDuty incident ID for resolve action'),
});

export const notifyTool: ToolDefinition = {
  name: 'notify',
  description: 'Send notifications via Slack, PagerDuty, Microsoft Teams, or custom webhooks. Use after deploys or for incident alerts.',
  inputSchema: notifySchema,
  permissionTier: 'ask_once',
  category: 'devops',
  isDestructive: false,

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = notifySchema.parse(raw);

      if (input.channel === 'slack' || input.channel === 'teams') {
        const webhookUrl = input.webhook_url ?? process.env.SLACK_WEBHOOK_URL ?? process.env.TEAMS_WEBHOOK_URL ?? '';
        if (!webhookUrl) return err(`No webhook URL provided. Set ${input.channel === 'slack' ? 'SLACK_WEBHOOK_URL' : 'TEAMS_WEBHOOK_URL'} env var or pass webhook_url.`);

        const emoji = input.severity === 'critical' ? ':red_circle:' : input.severity === 'warning' ? ':warning:' : ':white_check_mark:';
        const payload = input.channel === 'teams'
          ? JSON.stringify({ text: `${emoji} ${input.message ?? 'Notification from Nimbus'}` })
          : JSON.stringify({ text: `${emoji} ${input.message ?? 'Notification from Nimbus'}` });

        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        });
        if (!res.ok) return err(`Webhook failed: ${res.status} ${res.statusText}`);
        return ok(`Notification sent to ${input.channel}.`);
      }

      if (input.channel === 'pagerduty') {
        const apiKey = process.env.PAGERDUTY_API_KEY ?? '';
        const serviceKey = process.env.PAGERDUTY_SERVICE_KEY ?? '';
        if (!apiKey && !serviceKey) return err('Set PAGERDUTY_API_KEY or PAGERDUTY_SERVICE_KEY env var.');

        if (input.action === 'create-incident') {
          const res = await fetch('https://events.pagerduty.com/v2/enqueue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              routing_key: serviceKey,
              event_action: 'trigger',
              payload: {
                summary: input.message ?? 'Nimbus alert',
                severity: input.severity ?? 'info',
                source: 'nimbus',
              },
            }),
          });
          if (!res.ok) return err(`PagerDuty enqueue failed: ${res.status}`);
          const data = await res.json() as { dedup_key?: string };
          return ok(`PagerDuty incident created. Dedup key: ${data.dedup_key ?? 'N/A'}`);
        }

        if (input.action === 'resolve-incident' && input.incident_id) {
          const res = await fetch(`https://api.pagerduty.com/incidents/${input.incident_id}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Token token=${apiKey}`,
              'Content-Type': 'application/json',
              'From': 'nimbus@localhost',
            },
            body: JSON.stringify({ incident: { type: 'incident_reference', status: 'resolved' } }),
          });
          if (!res.ok) return err(`PagerDuty resolve failed: ${res.status}`);
          return ok(`Incident ${input.incident_id} resolved.`);
        }

        return err('PagerDuty: specify action (create-incident or resolve-incident) and required params.');
      }

      if (input.channel === 'webhook') {
        const url = input.webhook_url;
        if (!url) return err('webhook channel requires webhook_url');
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: input.message, severity: input.severity, source: 'nimbus', timestamp: new Date().toISOString() }),
        });
        if (!res.ok) return err(`Webhook failed: ${res.status} ${res.statusText}`);
        return ok(`Webhook notification sent to ${url}.`);
      }

      return err(`Unknown channel: ${input.channel}`);
    } catch (error: unknown) {
      return err(`Notification failed: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 35. terraform_registry
// ---------------------------------------------------------------------------

const terraformRegistrySchema = z.object({
  action: z.enum(['search', 'show'])
    .describe('Registry action: search for modules or show details of a specific module'),
  query: z.string().optional().describe('Search query for modules'),
  provider: z.string().optional().describe('Filter by cloud provider (aws, gcp, azure, etc.)'),
  namespace: z.string().optional().describe('Module namespace (for show action)'),
  module: z.string().optional().describe('Module name (for show action)'),
});

export const terraformRegistryTool: ToolDefinition = {
  name: 'terraform_registry',
  description: 'Browse the Terraform Module Registry. Search for modules or show details of a specific module including downloads and verified status.',
  inputSchema: terraformRegistrySchema,
  permissionTier: 'auto_allow',
  category: 'devops',
  isDestructive: false,

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = terraformRegistrySchema.parse(raw);
      const baseUrl = 'https://registry.terraform.io/v1';

      if (input.action === 'search') {
        if (!input.query) return err('search action requires query parameter');
        const params = new URLSearchParams({ q: input.query, limit: '10' });
        if (input.provider) params.set('provider', input.provider);

        const res = await fetch(`${baseUrl}/modules?${params}`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return err(`Registry API error: ${res.status} ${res.statusText}`);

        const data = (await res.json()) as {
          modules: Array<{
            namespace: string;
            name: string;
            provider: string;
            downloads: number;
            verified: boolean;
            latest_version: string;
            description?: string;
          }>;
          meta?: { total_count: number };
        };

        if (!data.modules?.length) return ok(`No modules found for query: "${input.query}"`);

        const rows = data.modules.map((m) => {
          const verified = m.verified ? '[verified]' : '';
          const downloads =
            m.downloads >= 1_000_000
              ? `${(m.downloads / 1_000_000).toFixed(1)}M`
              : m.downloads >= 1000
                ? `${Math.round(m.downloads / 1000)}K`
                : String(m.downloads);
          return `${m.namespace}/${m.name}/${m.provider} v${m.latest_version} ${verified} (${downloads} downloads)${m.description ? '\n  ' + m.description.slice(0, 100) : ''}`;
        });

        return ok(
          `Terraform Registry — "${input.query}" (${data.meta?.total_count ?? data.modules.length} total)\n\n${rows.join('\n\n')}`,
        );
      }

      if (input.action === 'show') {
        const ns = input.namespace;
        const mod = input.module;
        const prov = input.provider;
        if (!ns || !mod || !prov) return err('show action requires namespace, module, and provider');

        const res = await fetch(`${baseUrl}/modules/${ns}/${mod}/${prov}`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return err(`Registry API error: ${res.status} ${res.statusText}`);

        const data = (await res.json()) as {
          namespace: string;
          name: string;
          provider: string;
          versions: Array<{ version: string }>;
          downloads: number;
          verified: boolean;
          description?: string;
          source?: string;
        };

        const versions = (data.versions ?? [])
          .slice(0, 5)
          .map((v) => v.version)
          .join(', ');
        return ok(
          [
            `Module: ${data.namespace}/${data.name}/${data.provider}`,
            `Verified: ${data.verified ? 'Yes' : 'No'}`,
            `Downloads: ${data.downloads?.toLocaleString() ?? 'N/A'}`,
            `Recent versions: ${versions || 'N/A'}`,
            data.description ? `Description: ${data.description}` : '',
            data.source ? `Source: ${data.source}` : '',
            `\nUsage:\n  module "${data.name}" {\n    source = "${data.namespace}/${data.name}/${data.provider}"\n    version = "${(data.versions?.[0]?.version) ?? 'latest'}"\n  }`,
          ]
            .filter(Boolean)
            .join('\n'),
        );
      }

      return err(`Unknown action: ${input.action}`);
    } catch (error: unknown) {
      return err(`Terraform registry error: ${errorMessage(error)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// Aggregate export
// ---------------------------------------------------------------------------

/** All 35 DevOps tools as an ordered array. */
export const devopsTools: ToolDefinition[] = [
  terraformTool,
  kubectlTool,
  helmTool,
  cloudDiscoverTool,
  costEstimateTool,
  driftDetectTool,
  deployPreviewTool,
  terraformPlanAnalyzeTool,
  kubectlContextTool,
  helmValuesTool,
  gitTool,
  taskTool,
  dockerTool,
  secretsTool,
  cicdTool,
  monitorTool,
  gitopsTool,
  cloudActionTool,
  logsTool,
  certsTool,
  meshTool,
  cfnTool,
  k8sRbacTool,
  awsTool,
  gcloudTool,
  azTool,
  incidentTool,
  generateInfraTool,
  ansibleTool,
  policyCheckTool,
  rolloutControlTool,
  dbMigrateTool,
  envDiffTool,
  notifyTool,
  terraformRegistryTool,
];
