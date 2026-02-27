/**
 * DevOps Tool Definitions
 *
 * Defines the 9 DevOps-specific tools available to the Nimbus agentic loop.
 * Each tool wraps existing infrastructure operations from `src/tools/` modules
 * or invokes the appropriate CLI via child_process.
 *
 * Tools:
 *   terraform, kubectl, helm, cloud_discover, cost_estimate,
 *   drift_detect, deploy_preview, git, task
 *
 * @module tools/schemas/devops
 */

import { z } from 'zod';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { ToolDefinition, ToolResult } from './types';

const execAsync = promisify(exec);

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
// 1. terraform
// ---------------------------------------------------------------------------

const terraformSchema = z.object({
  action: z
    .enum(['init', 'plan', 'apply', 'validate', 'fmt', 'destroy', 'import', 'state'])
    .describe('The Terraform sub-command to run'),
  workdir: z.string().describe('Working directory containing the Terraform configuration'),
  args: z.string().optional().describe('Additional CLI arguments'),
  var_file: z.string().optional().describe('Path to a .tfvars variable file'),
});

export const terraformTool: ToolDefinition = {
  name: 'terraform',
  description:
    'Execute Terraform operations. Supports init, plan, apply, validate, fmt, destroy, import, and state commands.',
  inputSchema: terraformSchema,
  permissionTier: 'always_ask',
  category: 'devops',
  isDestructive: true,

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = terraformSchema.parse(raw);

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

      if (input.args) {
        parts.push(input.args);
      }

      const command = parts.join(' ');
      const { stdout, stderr } = await execAsync(command, {
        timeout: 600_000, // 10 minutes
        maxBuffer: 10 * 1024 * 1024,
      });

      const combined = [stdout, stderr].filter(Boolean).join('\n');
      return ok(combined || '(no output)');
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
    .enum(['get', 'apply', 'delete', 'logs', 'scale', 'rollout', 'exec', 'describe'])
    .describe('The kubectl sub-command to run'),
  resource: z.string().optional().describe('Resource type and/or name (e.g., "pods my-pod")'),
  namespace: z.string().optional().describe('Kubernetes namespace'),
  args: z.string().optional().describe('Additional CLI arguments'),
});

export const kubectlTool: ToolDefinition = {
  name: 'kubectl',
  description: 'Execute kubectl operations against a Kubernetes cluster.',
  inputSchema: kubectlSchema,
  permissionTier: 'always_ask',
  category: 'devops',
  isDestructive: true,

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = kubectlSchema.parse(raw);

      const parts: string[] = ['kubectl', input.action];

      if (input.resource) {
        parts.push(input.resource);
      }

      if (input.namespace) {
        parts.push('-n', input.namespace);
      }

      if (input.args) {
        parts.push(input.args);
      }

      const command = parts.join(' ');
      const { stdout, stderr } = await execAsync(command, {
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const combined = [stdout, stderr].filter(Boolean).join('\n');
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
    .enum(['install', 'upgrade', 'uninstall', 'list', 'rollback', 'template', 'lint'])
    .describe('The Helm sub-command to run'),
  release: z.string().optional().describe('Helm release name'),
  chart: z.string().optional().describe('Chart reference (e.g., "bitnami/nginx")'),
  values: z.string().optional().describe('Path to a values.yaml file'),
  namespace: z.string().optional().describe('Kubernetes namespace for the release'),
});

export const helmTool: ToolDefinition = {
  name: 'helm',
  description: 'Execute Helm operations for Kubernetes package management.',
  inputSchema: helmSchema,
  permissionTier: 'always_ask',
  category: 'devops',
  isDestructive: true,

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = helmSchema.parse(raw);

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
      const { stdout, stderr } = await execAsync(command, {
        timeout: 300_000, // 5 minutes
        maxBuffer: 10 * 1024 * 1024,
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
    .describe('Resource type to discover (e.g., "ec2", "compute instances", "vm")'),
  region: z.string().optional().describe('Cloud region to scope the discovery'),
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

      let command: string;

      switch (input.provider) {
        case 'aws': {
          const regionFlag = input.region ? ` --region ${input.region}` : '';
          command = `aws ${input.resource_type} describe-instances${regionFlag} --output json`;
          break;
        }
        case 'gcp': {
          const regionFlag = input.region ? ` --regions=${input.region}` : '';
          command = `gcloud ${input.resource_type} list${regionFlag} --format json`;
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
      return ok(combined || '(no resources found)');
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
});

export const costEstimateTool: ToolDefinition = {
  name: 'cost_estimate',
  description: 'Estimate infrastructure costs based on a Terraform plan or working directory.',
  inputSchema: costEstimateSchema,
  permissionTier: 'auto_allow',
  category: 'devops',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = costEstimateSchema.parse(raw);

      if (!input.plan_file && !input.workdir) {
        return err('Either plan_file or workdir must be provided.');
      }

      const cwd = input.workdir ?? '.';
      const planArg = input.plan_file ?? '';

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

      const lines = [
        '--- Cost Estimate (Placeholder) ---',
        '',
        `Total resources: ${resourceCount}`,
        `Resource types: ${resourceTypes.join(', ') || 'none'}`,
        '',
        'Note: Accurate cost estimation requires integration with a pricing API',
        'such as Infracost. This is a resource-count summary only.',
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
          // Use kubectl diff to detect drift in Kubernetes manifests.
          const command = `kubectl diff -f ${input.workdir} 2>&1 || true`;
          const { stdout } = await execAsync(command, {
            timeout: 120_000,
            maxBuffer: 10 * 1024 * 1024,
          });

          if (!stdout.trim()) {
            return ok('No drift detected in Kubernetes resources.');
          }
          return ok(`DRIFT DETECTED\n\n${stdout}`);
        }

        case 'helm': {
          // Use helm diff plugin if available, otherwise fall back to helm get.
          const command = `helm list -A --output json`;
          const { stdout } = await execAsync(command, {
            timeout: 120_000,
            maxBuffer: 10 * 1024 * 1024,
          });
          return ok(
            `Helm releases:\n${stdout}\n\nNote: Install the helm-diff plugin for detailed drift detection.`
          );
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
// Aggregate export
// ---------------------------------------------------------------------------

/** All 9 DevOps tools as an ordered array. */
export const devopsTools: ToolDefinition[] = [
  terraformTool,
  kubectlTool,
  helmTool,
  cloudDiscoverTool,
  costEstimateTool,
  driftDetectTool,
  deployPreviewTool,
  gitTool,
  taskTool,
];
