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
import { execSync } from 'node:child_process';
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

  /**
   * Live infrastructure context discovered at startup or session resume (Gaps 7 & 10).
   * When provided, a "Current Infrastructure Context" section is appended to the prompt.
   */
  readonly infraContext?: {
    terraformWorkspace?: string;
    kubectlContext?: string;
    helmReleases?: string[];
    awsAccount?: string;
    awsRegion?: string;
    gcpProject?: string;
  };

  /**
   * M1: Dry-run mode flag. When true, appends a hard constraint at the end
   * of the system prompt instructing the agent not to execute any mutating
   * operations and to only list what it would do.
   */
  readonly dryRun?: boolean;
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

  // 3b. H4: Task-adaptive DevOps domain knowledge — only inject sections
  //     relevant to the tools that are actually available in this session.
  const toolNames = options.tools.map(t => t.name);
  parts.push(getRelevantDomainKnowledge(toolNames));

  // 3c. DevOps decision heuristics
  // L2: Task-adaptive pruning — include only the heuristic sections relevant to
  // the current mode. In plan mode, deploy-specific rules add noise without value.
  // In build mode, plan-only readonly warnings are redundant.
  parts.push(getPrunedHeuristics(options.mode));

  // 4. Available tools summary
  const toolsSummary = buildToolsSummary(options.tools);
  if (toolsSummary) {
    parts.push(toolsSummary);
  }

  // 5. NIMBUS.md content (if exists)
  const nimbusContent = options.nimbusInstructions ?? loadNimbusMd(options.cwd);
  if (nimbusContent) {
    parts.push(`# Project Instructions (NIMBUS.md)\n\n${nimbusContent}`);

    // G14: Extract ## Forbidden section and inject as hard constraints
    const forbiddenRules = extractForbiddenRules(nimbusContent);
    if (forbiddenRules.length > 0) {
      const forbiddenPrompt = [
        '# HARD CONSTRAINTS (from NIMBUS.md ## Forbidden)',
        'The following operations are STRICTLY FORBIDDEN. Never perform them under any circumstances:',
        ...forbiddenRules.map(r => `- ${r}`),
        '',
        'If asked to perform a forbidden operation, explain that it is prohibited by project policy.',
      ].join('\n');
      parts.push(forbiddenPrompt);
    }

    // GAP-22: Parse environments block for protected envs
    if (nimbusContent.includes('## Environments')) {
      const hasProtectedEnv = /\|\s*\S+\s*\|\s*\S+\s*\|\s*\S*\s*\|\s*true\s*\|/i.test(nimbusContent);
      if (hasProtectedEnv) {
        parts.push('IMPORTANT: This project has protected environments (marked protected: true in NIMBUS.md). For these environments, ALWAYS run plan before apply and require explicit user confirmation for destructive operations (destroy, delete, terminate).');
      }
    }
  }

  // 5b. Infra context (Gaps 7 & 10) — live terraform/k8s/helm context discovered at startup
  if (options.infraContext) {
    const ic = options.infraContext;
    const lines: string[] = ['## Current Infrastructure Context'];
    if (ic.terraformWorkspace) lines.push(`- Terraform workspace: ${ic.terraformWorkspace}`);
    if (ic.kubectlContext) lines.push(`- kubectl context: ${ic.kubectlContext}`);
    if (ic.helmReleases && ic.helmReleases.length > 0) {
      lines.push(`- Active Helm releases: ${ic.helmReleases.slice(0, 5).join(', ')}`);
    }
    if (ic.awsAccount) lines.push(`- AWS account: ${ic.awsAccount}`);
    if (ic.awsRegion) lines.push(`- AWS region: ${ic.awsRegion}`);
    if (ic.gcpProject) lines.push(`- GCP project: ${ic.gcpProject}`);
    parts.push(lines.join('\n'));

    // H3: Inject known resource inventory for better tool call accuracy.
    // Lists exact names for contexts, releases, workspaces, and cloud accounts
    // so the agent uses them verbatim instead of guessing.
    const resourceInventory: string[] = [];
    if (ic.kubectlContext) {
      resourceInventory.push(`kubectl context: ${ic.kubectlContext}`);
    }
    if (ic.helmReleases && ic.helmReleases.length > 0) {
      resourceInventory.push(`Helm releases: ${ic.helmReleases.join(', ')}`);
    }
    if (ic.terraformWorkspace) {
      resourceInventory.push(`Terraform workspace: ${ic.terraformWorkspace}`);
    }
    if (ic.awsAccount) {
      resourceInventory.push(`AWS account: ${ic.awsAccount} (${ic.awsRegion ?? 'unknown region'})`);
    }
    // C6: Inject awsRegion standalone so LLM passes correct region to tool calls
    if (ic.awsRegion) {
      resourceInventory.push(`AWS default region: ${ic.awsRegion} (pass region param to target others)`);
    }
    if (ic.gcpProject) {
      resourceInventory.push(`GCP project: ${ic.gcpProject}`);
    }

    if (resourceInventory.length > 0) {
      parts.push(
        `## Known Infrastructure Resources\nUse these exact names when calling tools:\n${resourceInventory.map(r => `- ${r}`).join('\n')}`
      );
    }
  }

  // 6. Subagent instructions (if applicable)
  if (options.activeSubagent) {
    parts.push(getSubagentInstructions(options.activeSubagent));
  }

  // 7. Environment context
  parts.push(buildEnvironmentContext(options.cwd));

  // C5: Primary cloud providers section (from ~/.nimbus/config.json)
  const primaryCloudsSection = buildPrimaryCloudSection();
  if (primaryCloudsSection) {
    parts.push(primaryCloudsSection);
  }

  // M1: Dry-run mode — append hard constraint at the end so it takes priority
  if (options.dryRun) {
    parts.push(
      '# DRY-RUN MODE — ACTIVE\n\n' +
      'DRY-RUN MODE: Do not execute any mutating operations. ' +
      'List exactly what you would do step by step.\n\n' +
      'You MUST NOT:\n' +
      '- Apply, create, update, or delete any infrastructure\n' +
      '- Run terraform apply, kubectl apply, helm install/upgrade/uninstall\n' +
      '- Write or modify files\n' +
      '- Execute any destructive bash commands\n\n' +
      'Instead, describe precisely what each step would do and why.'
    );
  }

  return parts.join('\n\n---\n\n');
}

// ---------------------------------------------------------------------------
// Prompt Fragments
// ---------------------------------------------------------------------------

/**
 * Core identity and behavioral rules that apply regardless of mode.
 * @internal
 */
const BASE_PROMPT = `You are Nimbus, an autonomous DevOps operator. Your job is to keep
infrastructure healthy, deployments flowing, and production stable — through direct action.

Your PRIMARY instinct is to RUN commands and query live state first:
- When something is broken: run \`kubectl describe\`, \`terraform plan\`, \`aws logs\` BEFORE reading files
- When asked about infrastructure state: query it (\`kubectl get pods -A\`, \`terraform state list\`)
- When asked to deploy: validate → plan → show plan → confirm → apply
- Edit IaC files only as a follow-up once diagnostics reveal what must change

Your domain is DevOps: Terraform, Kubernetes, Helm, AWS, GCP, Azure, CI/CD, Docker, secrets management.

Key operational rules:
- Run diagnostics and infrastructure commands FIRST — do not start by reading files
- Always show a plan/preview and get confirmation before destructive operations
- Always run validation (terraform validate, kubectl --dry-run) before apply
- Be namespace-aware for Kubernetes; always pass \`-n <namespace>\` explicitly
- Explain what you are doing and why at each step
- If a tool call fails, classify the error and try a corrective approach before giving up
- Make precise, targeted edits to IaC files — never rewrite entire configurations

You are specialized exclusively for DevOps, infrastructure, and cloud operations. If asked to help with tasks unrelated to DevOps (e.g., building a UI, writing business logic, general algorithms unrelated to infrastructure), respond: "I'm specialized for DevOps and infrastructure. For general software development, try a general-purpose coding agent. Is there an infrastructure or deployment aspect I can help with?"`;

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
- For Kubernetes operations, be namespace-aware. Default to the current namespace context.
- Never read or search inside generated/dependency directories: \`node_modules/\`, \`dist/\`, \`build/\`, \`__pycache__/\`, \`.terraform/\`, \`.git/\`, \`coverage/\`, \`.next/\`, \`vendor/\`. These are never relevant to editing source code and will waste context window.
- Respect \`.gitignore\` patterns — do not read files that would be gitignored unless the user explicitly asks for them.`;

// ---------------------------------------------------------------------------
// H4: Task-Adaptive DevOps Domain Knowledge
//
// The domain knowledge is split into named sections. buildSystemPrompt uses
// getRelevantDomainKnowledge() to include only the sections that are relevant
// to the tools available in the current session, keeping the prompt concise.
// ---------------------------------------------------------------------------

/**
 * Per-domain knowledge sections keyed by domain name.
 * @internal
 */
const DOMAIN_SECTIONS: Record<string, string> = {
  general: `## General DevOps Principles
- Infrastructure drift: plan outputs starting with \`~\` = modify, \`-\` = destroy, \`+\` = create
- Zero-downtime deploys: rolling updates, blue/green, canary with traffic splitting
- Secret management: never hardcode secrets; use SSM Parameter Store, Secrets Manager, Vault, or sealed-secrets
- Observability: logs → \`kubectl logs\`, metrics → \`kubectl top\`, traces → service mesh
- Cost optimization: right-size instances, use spot/preemptible for stateless workloads

## Docker Best Practices
- Always use multi-stage builds to minimize image size; pin base image tags (avoid \`latest\`)
- Build: \`docker build -t myapp:v1.0 -f Dockerfile .\`
- Compose: \`docker compose up -d\` starts detached; \`docker compose down\` removes containers
- Check daemon: \`docker info\`; if not running → \`colima start\` (macOS) or \`sudo systemctl start docker\`
- Common errors:
  - \`cannot connect to the Docker daemon\` → start Docker Desktop or run \`colima start\`
  - \`manifest not found\` → verify image name/tag; check registry login (\`docker login\`)
  - \`no space left on device\` → run \`docker system prune -f\` to reclaim space
  - \`permission denied\` on socket → add user to docker group or use \`sudo\`

## Incident Management (PagerDuty & Opsgenie)
- PagerDuty: requires \`PD_API_KEY\` env var; list incidents with action=incidents, acknowledge with action=ack, resolve with action=resolve
- Opsgenie: requires \`OPSGENIE_API_KEY\` env var; list alerts with action=alerts, acknowledge with action=ack, close with action=resolve
- On-call schedule: use action=on-call with provider=pagerduty or provider=opsgenie to see who is currently on call
- Incident response workflow: acknowledge first (stops escalation) → investigate → resolve
- Common errors:
  - \`401 Unauthorized\` → verify API key is correct and not expired
  - \`403 Forbidden\` → check API key permissions (needs read+write for ack/resolve)
  - \`404 Not Found\` → verify incident/alert ID is correct (use list first)

## Web Search for DevOps
- Use \`web_search\` to look up error codes, provider limits, API endpoints, pricing
- Set \`BRAVE_API_KEY\` env var for higher-quality search results via Brave Search API`,

  terraform: `## Terraform Best Practices
- Always run \`terraform validate\` → \`terraform plan\` → \`terraform apply\` in sequence
- Use \`terraform plan -out=tfplan\` to save plan files; apply with \`terraform apply tfplan\`
- For state inspection: \`terraform state list\`, \`terraform state show <resource>\`
- Remote state: prefer S3+DynamoDB (AWS), GCS (GCP), Azure Blob. Never commit \`.tfstate\` files
- Workspaces: \`terraform workspace new <env>\`, \`terraform workspace select <env>\`
- Module structure: \`main.tf\`, \`variables.tf\`, \`outputs.tf\`, \`versions.tf\`
- Lock files (\`.terraform.lock.hcl\`) MUST be committed to version control
- Use \`count\` or \`for_each\` for resource iteration; avoid \`count\` for ordered resources
- \`depends_on\` is a last resort — prefer implicit dependencies via references

## Error Diagnosis — Terraform
- \`Error: The provider "hashicorp/aws" requires Terraform >= X\` → run \`terraform init -upgrade\`
- \`Error: configuring Terraform AWS Provider: no valid credentials\` → check AWS credentials, run \`aws configure\`
- \`Error: creating EC2 Instance: VcpuLimitExceeded\` → request quota increase in AWS Console`,

  kubernetes: `## Kubernetes Operations
- Check cluster health first: \`kubectl get nodes\`, \`kubectl get pods -A\`
- Namespace-aware commands: always pass \`-n <namespace>\` or use \`--all-namespaces\`
- Deployment rollouts: \`kubectl rollout status deploy/<name>\`, \`kubectl rollout history deploy/<name>\`
- Rollback: \`kubectl rollout undo deploy/<name>\`, or \`kubectl rollout undo deploy/<name> --to-revision=N\`
- Resource sizing: check \`kubectl top pods\`, \`kubectl top nodes\` before scaling
- Debug pods: \`kubectl exec -it <pod> -- /bin/sh\`, \`kubectl logs <pod> --previous\` for crashloops
- Dry-run before apply: \`kubectl apply --dry-run=client -f manifest.yaml\`
- Labels and selectors: always verify selectors match pod templates in Deployments

## Error Diagnosis — Kubernetes
- \`OOMKilled\` → increase memory limit in pod spec; check \`kubectl describe pod\`
- \`CrashLoopBackOff\` → \`kubectl logs <pod> --previous\`; check readiness/liveness probes
- \`ImagePullBackOff\` → verify image name/tag, check registry credentials (imagePullSecret)
- \`Pending\` pods → \`kubectl describe pod\` for events; common: insufficient resources, no matching node`,

  helm: `## Helm Operations
- Repo management: \`helm repo add <name> <url>\`, \`helm repo update\` before install/upgrade
- Template debugging: \`helm template <release> <chart> -f values.yaml\` before install
- Diff before upgrade: \`helm diff upgrade <release> <chart>\` (requires helm-diff plugin)
- Override values: \`-f values.yaml\` for files, \`--set key=value\` for single values
- Release history: \`helm history <release> -n <namespace>\`
- Rollback: \`helm rollback <release> <revision> -n <namespace>\`

## Helm Secrets (SOPS) Best Practices
- Install: \`helm plugin install https://github.com/jkroepke/helm-secrets\`
- Encrypt: \`helm secrets enc values.yaml\` (requires SOPS config \`.sops.yaml\`)
- Decrypt: \`helm secrets dec values.yaml.enc\`
- View without decrypt: \`helm secrets view values.yaml.enc\`
- Install with secrets: \`helm secrets install release chart -f values.yaml.enc\`
- Common errors:
  - \`plugin not found\` → run \`helm plugin list | grep secrets\` to verify install
  - \`sops: not found\` → install sops: \`brew install sops\``,

  aws: `## AWS Patterns
- IAM: prefer roles over long-lived credentials; use instance profiles, IRSA, workload identity
- Networking: VPC → subnets → security groups → route tables; know public vs private subnets
- EKS: use IRSA for pod-level AWS API access; node groups vs Fargate tradeoffs
- S3 versioning + lifecycle policies for state files; enable MFA delete for sensitive buckets
- Common debug: \`aws sts get-caller-identity\`, \`aws configure list\`, \`aws --debug <cmd>\``,

  secrets: `## Secrets Management Best Practices
- Never log or display raw secret values — always redact in output
- Rotation patterns: automate rotation with Lambda (AWS) or Cloud Functions (GCP)
- Kubernetes secrets: prefer external-secrets-operator or Vault Agent Injector over native k8s secrets
- SOPS (Secrets OPerationS): encrypt secrets files committed to Git using \`sops --encrypt file.yaml\`
- External Secrets Operator: syncs secrets from Vault/AWS/GCP into k8s Secrets automatically
- Vault: use \`vault kv get -format=json <path>\` and never expose SecretString in logs
- Common errors:
  - \`permission denied\` on Vault → check policy: \`vault policy read <policy-name>\`
  - \`secret not found\` → verify path and namespace: \`vault kv list <mount>\``,

  cicd: `## CI/CD Pipeline Best Practices
- GitHub Actions: workflow files live in \`.github/workflows/\`; use \`gh workflow run\` to trigger
- GitLab CI: \`.gitlab-ci.yml\` at repo root; \`glab ci run\` triggers pipelines
- CircleCI: \`.circleci/config.yml\`; use project slugs (gh/org/repo)
- Always check branch protection rules before triggering on main/production
- Common errors:
  - \`workflow not found\` → check filename in \`.github/workflows/\` and branch name
  - \`rate limited\` → wait 60s and retry; check API rate limit headers
  - \`token expired\` → refresh token or check service account permissions`,

  monitoring: `## Monitoring & Observability Best Practices
- Prometheus: use \`rate()\` for counters, \`histogram_quantile()\` for latencies; query via HTTP API
- CloudWatch: structured queries with CloudWatch Insights for efficient log searching
- Grafana: use \`$GRAFANA_URL\` env var + Bearer token for API access
- Datadog: requires both \`DD_API_KEY\` and \`DD_APP_KEY\` for query API
- Alert on: error rate, latency p99, saturation (CPU/memory), traffic (requests/sec)
- SLO pattern: \`1 - (error_rate / total_rate)\` over 30-day rolling window`,

  gitops: `## GitOps Best Practices (ArgoCD & Flux)
- ArgoCD: \`argocd app sync\` triggers reconciliation; \`argocd app diff\` shows pending changes
- Flux: \`flux reconcile kustomization flux-system\` forces immediate reconciliation
- Always check health before sync: \`argocd app get <app>\` shows health.status
- Rollback strategy: ArgoCD → \`argocd app rollback <app> <revision>\`; Flux → revert Git commit
- Common errors:
  - \`app not found\` → check \`ARGOCD_SERVER\` env var and login token
  - \`ComparisonError\` → validate manifests with \`kubectl apply --dry-run=client\``,
};

/**
 * Return the DevOps domain knowledge sections that are relevant to the given
 * set of tool names.
 *
 * The general section is always included. Domain-specific sections (terraform,
 * kubernetes, helm, aws, secrets, cicd, monitoring, gitops) are only added when
 * at least one tool in `toolNames` maps to that domain.
 *
 * This keeps the system prompt lean for sessions that only use a small subset
 * of the DevOps toolchain.
 *
 * @param toolNames - The names of the tools available in the current session.
 * @returns A markdown string containing only the relevant knowledge sections.
 */
export function getRelevantDomainKnowledge(toolNames: string[]): string {
  const sections: string[] = [`# DevOps Domain Knowledge\n\n${DOMAIN_SECTIONS.general}`];

  if (toolNames.some(t => t.includes('terraform') || t === 'drift_detect')) {
    sections.push(DOMAIN_SECTIONS.terraform);
  }
  if (toolNames.some(t => t.includes('kubectl') || t === 'k8s_rbac' || t === 'k8s')) {
    sections.push(DOMAIN_SECTIONS.kubernetes);
  }
  if (toolNames.some(t => t.includes('helm'))) {
    sections.push(DOMAIN_SECTIONS.helm);
  }
  if (toolNames.some(t => t.includes('aws') || t.includes('cloud'))) {
    sections.push(DOMAIN_SECTIONS.aws);
  }
  if (toolNames.some(t => t.includes('secret') || t.includes('vault'))) {
    sections.push(DOMAIN_SECTIONS.secrets);
  }
  if (toolNames.some(t => t.includes('cicd') || t.includes('pipeline') || t.includes('github'))) {
    sections.push(DOMAIN_SECTIONS.cicd);
  }
  if (toolNames.some(t => t.includes('monitor') || t.includes('logs') || t.includes('metric'))) {
    sections.push(DOMAIN_SECTIONS.monitoring);
  }
  if (toolNames.some(t => t.includes('gitops') || t.includes('argocd') || t.includes('flux'))) {
    sections.push(DOMAIN_SECTIONS.gitops);
  }

  return sections.join('\n\n');
}

/**
 * The full concatenated DevOps domain knowledge (all sections).
 *
 * Kept for backward-compatibility. New call sites should prefer
 * {@link getRelevantDomainKnowledge} with a tool list so only the relevant
 * sections are included in the prompt.
 *
 * @deprecated Use {@link getRelevantDomainKnowledge} instead.
 * @internal
 */
export const DEVOPS_DOMAIN_KNOWLEDGE = [
  `# DevOps Domain Knowledge\n\n${DOMAIN_SECTIONS.general}`,
  DOMAIN_SECTIONS.terraform,
  DOMAIN_SECTIONS.kubernetes,
  DOMAIN_SECTIONS.helm,
  DOMAIN_SECTIONS.aws,
  DOMAIN_SECTIONS.secrets,
  DOMAIN_SECTIONS.cicd,
  DOMAIN_SECTIONS.monitoring,
  DOMAIN_SECTIONS.gitops,
].join('\n\n');

// ---------------------------------------------------------------------------
// DevOps Decision Heuristics
// ---------------------------------------------------------------------------

/**
 * Explicit decision rules injected into every prompt to prevent common mistakes.
 * @internal
 */
const DEVOPS_HEURISTICS = `# DevOps Decision Heuristics

## Terraform Workflow Rules
- ALWAYS follow: init → validate → plan → review → apply. NEVER apply without a prior plan.
- NEVER use terraform apply if you haven't seen the plan output in this session.
- state-rm and force-unlock require EXPLICIT user confirmation — always ask before running.
- For multi-environment: check active workspace (\`terraform workspace show\`) before any operation.
- Tag every resource you create with \`managed_by = "nimbus"\` in Terraform resources.
- Prefer \`terraform output -json\` over parsing state files directly.

## Kubernetes Rules
- ALWAYS include \`-n <namespace>\` or \`--all-namespaces\`. Never assume default namespace.
- When debugging: check LOGS first, then events (\`kubectl describe\`), then resource state.
- NEVER delete a pod directly unless debugging — prefer \`kubectl rollout restart deploy/<name>\`.
- Cordon/drain before node maintenance: \`kubectl cordon\` then \`kubectl drain --ignore-daemonsets\`.
- Add label \`app.kubernetes.io/managed-by: nimbus\` to K8s resources you create.

## Helm Rules
- ALWAYS run \`helm lint\` before install or upgrade.
- ALWAYS get current values before upgrading: \`helm get values <release> -n <ns>\`.
- Use \`--atomic\` on upgrades to auto-rollback on failure.
- Check \`helm history\` before rollback to pick the correct revision.

## General DevOps Rules
- Prefer read/inspect operations before any write/mutate operations.
- In PLAN mode: NEVER apply, apply, delete, or mutate any resource.
- In DEPLOY mode: ALWAYS show deploy_preview before destructive operations (destroy/delete/state-rm).
- Use \`env\` field on terraform/kubectl/helm tools to pass \`AWS_PROFILE\`, \`KUBECONFIG\`, \`TF_WORKSPACE\`.
- Prefer dedicated cloud tools (\`aws\`, \`gcloud\`, \`az\`) over \`bash\` for cloud operations.

## Tool Selection Priority
1. Use terraform/kubectl/helm tools for IaC operations (not bash).
2. Use cloud_discover to find resources before operating on them.
3. Use drift_detect to check actual vs desired state.
4. Use cost_estimate to understand financial impact before applying.
5. Fall back to bash only when no dedicated tool covers the operation.`;

// ---------------------------------------------------------------------------
// L2: Mode-Pruned Heuristics
// ---------------------------------------------------------------------------

/**
 * Return the DevOps decision heuristics pruned to only include sections
 * relevant to the current mode. This prevents prompt bloat in restricted
 * modes where deploy-specific or plan-specific rules are irrelevant.
 *
 * - plan mode: omit deploy-related execution rules (they cannot be triggered)
 * - build mode: omit plan-only readonly reminders (build mode can write files)
 * - deploy mode: include everything
 *
 * @param mode - The current agent mode.
 * @returns A pruned markdown heuristics string.
 */
export function getPrunedHeuristics(mode: AgentMode): string {
  if (mode === 'deploy') {
    // Deploy mode: include the complete heuristics — no pruning needed.
    return DEVOPS_HEURISTICS;
  }

  // Split into lines and filter based on mode.
  const lines = DEVOPS_HEURISTICS.split('\n');

  if (mode === 'plan') {
    // Plan mode: skip lines that reference apply/deploy operations that are
    // blocked anyway. This saves ~10-15 tokens without losing useful context.
    return lines
      .filter(line => {
        const l = line.toLowerCase();
        // Remove deploy-specific execution requirements (plan mode cannot apply)
        if (l.includes('in deploy mode:') || l.includes('deploy_preview before')) return false;
        // Remove tool selection items for deploy-only tools
        if (l.includes('use drift_detect') || l.includes('use cost_estimate')) return false;
        return true;
      })
      .join('\n');
  }

  if (mode === 'build') {
    // Build mode: skip plan-only readonly reminders that contradict build mode.
    return lines
      .filter(line => {
        const l = line.toLowerCase();
        // Remove plan-mode-only readonly enforcement lines
        if (l.includes('in plan mode:') || l.includes('never apply, apply')) return false;
        return true;
      })
      .join('\n');
  }

  return DEVOPS_HEURISTICS;
}

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
- Read files, search configurations, list directories
- Analyze infrastructure configurations (Terraform, Kubernetes, Helm, CI/CD)
- Estimate costs and detect drift
- Use terraform_plan_analyze to inspect plan files
- Use kubectl_context to list cluster contexts (read-only)
- Propose changes and create task lists
- Fetch web content for research

NOT allowed:
- Editing or creating files
- Running bash commands that modify state
- Executing terraform apply, kubectl apply, helm install
- Making any state-changing operations

WORKSPACE AWARENESS: Start by checking the active Terraform workspace and kubectl context. Report the current workspace/context before making any proposals so the user knows what environment you're analyzing.

Focus on understanding the infrastructure and environment, then propose a clear, specific action plan.`;

    case 'build':
      return `# Mode: BUILD

You are in Build mode. You can read, edit, create files, and run non-destructive commands.

Allowed actions:
- All Plan mode actions
- Edit infrastructure configurations, generate IaC, fix scripts and automation code
- Edit and create files (Terraform, Kubernetes manifests, Helm charts, CI/CD configs)
- Run terraform validate, terraform fmt, terraform plan
- Run kubectl get, kubectl describe, kubectl diff
- Run linters, formatters, and validation commands

NOT allowed:
- terraform apply, terraform destroy
- kubectl apply, kubectl delete
- helm install, helm upgrade, helm uninstall
- Any infrastructure-mutating operations

Focus on generating, editing, and validating infrastructure configurations before deploying.`;

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
- Be WORKSPACE-AWARE: before applying, confirm the active Terraform workspace and kubectl context match the intended environment. State this explicitly: "Applying to workspace: X in cluster: Y"
- For multi-environment setups, use terraform_plan_analyze to confirm the scope before terraform apply

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
  if (tools.length === 0) {
    return '';
  }

  const lines = tools.map(t => `- **${t.name}**: ${t.description}`);
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
// G14: Forbidden rules extraction
// ---------------------------------------------------------------------------

/**
 * Extract bullet items from the `## Forbidden` section of a NIMBUS.md string.
 * Returns an array of rule strings (without the leading `-` or `*`).
 *
 * @param nimbusContent - The full content of a NIMBUS.md file.
 * @returns Array of forbidden rule strings, empty if section not found or empty.
 */
export function extractForbiddenRules(nimbusContent: string): string[] {
  // Find the ## Forbidden section and extract lines until the next ## heading or end of string
  const lines = nimbusContent.split('\n');
  let inForbidden = false;
  const rules: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##\s+Forbidden\s*$/.test(trimmed)) {
      inForbidden = true;
      continue;
    }
    if (inForbidden) {
      // Stop at any new ## section
      if (/^##\s/.test(trimmed)) break;
      // Skip blank lines and HTML comments
      if (!trimmed || trimmed.startsWith('<!--')) continue;
      // Collect bullet items
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        const rule = trimmed.replace(/^[-*]\s*/, '').trim();
        if (rule && !rule.startsWith('<!--')) {
          rules.push(rule);
        }
      }
    }
  }

  return rules;
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

  // Check for git repo and gather context
  const gitDir = path.join(effectiveCwd, '.git');
  if (fs.existsSync(gitDir)) {
    parts.push('- Git repository: yes');

    const execOpts = {
      cwd: effectiveCwd,
      timeout: 1000,
      encoding: 'utf-8' as const,
      stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
    };

    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', execOpts).trim();
      parts.push(`- Git branch: ${branch}`);
    } catch {
      /* ignore */
    }

    try {
      const log = execSync('git log --oneline -5 2>/dev/null', execOpts).trim();
      if (log) {
        parts.push(
          `- Recent commits:\n${log
            .split('\n')
            .map((l: string) => `    ${l}`)
            .join('\n')}`
        );
      }
    } catch {
      /* ignore */
    }

    try {
      const staged = execSync('git diff --cached --stat 2>/dev/null', execOpts).trim();
      if (staged) {
        parts.push(
          `- Staged changes:\n${staged
            .split('\n')
            .map((l: string) => `    ${l}`)
            .join('\n')}`
        );
      }
    } catch {
      /* ignore */
    }

    try {
      const unstaged = execSync('git diff --stat 2>/dev/null', execOpts).trim();
      if (unstaged) {
        parts.push(
          `- Unstaged changes:\n${unstaged
            .split('\n')
            .map((l: string) => `    ${l}`)
            .join('\n')}`
        );
      }
    } catch {
      /* ignore */
    }
  }

  // Kubernetes context
  try {
    const ctx = execSync('kubectl config current-context', { timeout: 2000, encoding: 'utf-8' }).trim();
    if (ctx) parts.push(`- Kubernetes context: ${ctx}`);
  } catch { /* ignore */ }

  // Terraform workspace (only if .terraform dir exists)
  if (fs.existsSync(path.join(effectiveCwd, '.terraform'))) {
    try {
      const ws = execSync('terraform workspace show', {
        cwd: effectiveCwd, timeout: 5000, encoding: 'utf-8',
      }).trim();
      if (ws) parts.push(`- Terraform workspace: ${ws}`);
    } catch { /* ignore */ }
  }

  // AWS identity (only if credentials are configured)
  if (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE || fs.existsSync(path.join(homedir(), '.aws', 'credentials'))) {
    try {
      const identity = execSync('aws sts get-caller-identity --output json', {
        timeout: 5000, encoding: 'utf-8',
      }).trim();
      const parsed = JSON.parse(identity);
      parts.push(`- AWS account: ${parsed.Account}`);
    } catch { /* ignore */ }
    try {
      const region = execSync('aws configure get region', { timeout: 2000, encoding: 'utf-8' }).trim();
      if (region) parts.push(`- AWS region: ${region}`);
    } catch {
      if (process.env.AWS_DEFAULT_REGION) parts.push(`- AWS region: ${process.env.AWS_DEFAULT_REGION}`);
    }
  }

  // GCP project (only if gcloud available)
  try {
    const proj = execSync('gcloud config get-value project 2>/dev/null', {
      timeout: 3000, encoding: 'utf-8',
    }).trim();
    if (proj && proj !== '(unset)') parts.push(`- GCP project: ${proj}`);
  } catch { /* ignore */ }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// C5: Primary Cloud Section
// ---------------------------------------------------------------------------

/**
 * Read the primaryClouds field from ~/.nimbus/config.json and build a section
 * that focuses the agent on those cloud providers.
 *
 * @returns A markdown section string, or `null` if not configured.
 * @internal
 */
function buildPrimaryCloudSection(): string | null {
  try {
    const configPath = path.join(homedir(), '.nimbus', 'config.json');
    if (!fs.existsSync(configPath)) return null;
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as Record<string, unknown>;
    const clouds = config.primaryClouds;
    if (!Array.isArray(clouds) || clouds.length === 0) return null;
    const cloudNames = (clouds as string[]).map(c => c.toUpperCase()).join(', ');
    return [
      '# Primary Cloud Providers',
      `Primary cloud providers: ${cloudNames}`,
      `Focus on ${cloudNames} patterns and best practices in your responses.`,
    ].join('\n');
  } catch {
    return null;
  }
}
