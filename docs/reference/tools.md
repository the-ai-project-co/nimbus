---
title: Tools Reference
---

# Tools Reference

Nimbus has 35+ built-in tools divided into two groups: **standard tools** (available in all modes) and **DevOps tools** (mode-gated). The agent selects tools automatically based on your request. You can list available tools with `/tools` in the TUI.

---

## Standard Tools (12)

Available in Plan, Build, and Deploy modes.

| Tool          | Description                                                        |
|---------------|--------------------------------------------------------------------|
| `read_file`   | Read a file from disk                                              |
| `write_file`  | Write or create a file                                             |
| `edit_file`   | Make targeted edits to a file (string replace)                     |
| `multi_edit`  | Apply multiple edits to one or more files in a single call         |
| `glob`        | Find files matching a glob pattern                                 |
| `grep`        | Search file contents with regex                                    |
| `list_dir`    | List directory contents                                            |
| `bash`        | Execute a shell command (always_ask in Plan, ask_once in Build)    |
| `git`         | Git operations (status, add, commit, push, diff, log, stash, etc.)|
| `webfetch`    | Fetch and parse a URL                                              |
| `websearch`   | Web search via Brave Search API                                    |
| `task`        | Spawn a parallel sub-agent with isolated context                   |

---

## DevOps Tools (23+)

Gated by mode. Most are available in Build and Deploy; destructive actions require Deploy mode or explicit approval.

### Infrastructure

#### `terraform`

Wraps `terraform` CLI with session workspace awareness.

| Action             | Description                                                   | Permission    |
|--------------------|---------------------------------------------------------------|---------------|
| `init`             | Initialize a Terraform working directory                      | `ask_once`    |
| `plan`             | Generate and show an execution plan                           | `auto_allow`  |
| `apply`            | Apply changes (requires `terraform plan` first)               | `always_ask`  |
| `destroy`          | Destroy infrastructure (blocked in `prod` directories)        | `always_ask`  |
| `validate`         | Validate configuration files                                  | `auto_allow`  |
| `fmt`              | Reformat configuration files                                  | `auto_allow`  |
| `show`             | Show current state or a saved plan                            | `auto_allow`  |
| `output`           | Extract output values from state                              | `auto_allow`  |
| `workspace-list`   | List all workspaces                                           | `auto_allow`  |
| `workspace-select` | Switch workspace (persisted to session context)               | `ask_once`    |
| `workspace-new`    | Create a new workspace                                        | `ask_once`    |
| `import`           | Import existing resources into Terraform state                | `always_ask`  |
| `state`            | Advanced state management                                     | `always_ask`  |
| `taint`            | Mark a resource for recreation                                | `always_ask`  |

**Session workspace:** Once you select a workspace with `workspace-select`, Nimbus auto-applies it across all subsequent terraform actions in the session.

#### `terraform_plan_analyze`

Parses `terraform show -json` output and returns a structured risk assessment.

- Risk levels: `LOW` / `MEDIUM` / `HIGH`
- Breakdown by change type: `CREATE` / `CHANGE` / `DESTROY` / `REPLACE`
- Lists all affected resources with their change types

#### `terraform_registry`

Browse the Terraform module registry.

| Action   | Description                                  |
|----------|----------------------------------------------|
| `search` | Search modules by keyword and provider       |
| `show`   | Get details for a specific module            |

#### `kubectl`

Wraps `kubectl` CLI.

| Action        | Description                                     | Permission   |
|---------------|-------------------------------------------------|--------------|
| `get`         | Get resources                                   | `auto_allow` |
| `describe`    | Describe a resource                             | `auto_allow` |
| `apply`       | Apply a manifest                                | `ask_once`   |
| `delete`      | Delete resources                                | `always_ask` |
| `logs`        | Stream container logs                           | `auto_allow` |
| `exec`        | Execute a command in a container                | `ask_once`   |
| `scale`       | Scale a deployment                              | `ask_once`   |
| `rollout`     | Rollout management (status/undo/restart)        | `ask_once`   |
| `port-forward`| Forward a local port to a pod                   | `ask_once`   |
| `events`      | Show cluster events sorted by timestamp         | `auto_allow` |
| `watch`       | Watch resources with streaming output           | `auto_allow` |
| `top`         | Show resource consumption (CPU/memory)          | `auto_allow` |

#### `kubectl_context`

List and switch kubectl contexts without running `kubectl config use-context` manually.

| Action       | Description                           |
|--------------|---------------------------------------|
| `list`       | List all available contexts           |
| `current`    | Show current context                  |
| `switch`     | Switch to a different context         |
| `namespaces` | List namespaces in current context    |

#### `helm`

Wraps `helm` CLI.

| Action            | Description                                     | Permission   |
|-------------------|-------------------------------------------------|--------------|
| `list`            | List releases in a namespace                    | `auto_allow` |
| `status`          | Show release status                             | `auto_allow` |
| `get`             | Get release values, hooks, manifest, or notes   | `auto_allow` |
| `template`        | Render chart templates locally                  | `auto_allow` |
| `install`         | Install a chart                                 | `ask_once`   |
| `upgrade`         | Upgrade a release                               | `ask_once`   |
| `uninstall`       | Uninstall a release                             | `always_ask` |
| `rollback`        | Roll back a release                             | `ask_once`   |
| `history`         | Show release revision history                   | `auto_allow` |
| `repo-update`     | Update Helm chart repositories                  | `auto_allow` |
| `secrets-encrypt` | Encrypt secrets using helm-secrets plugin       | `ask_once`   |
| `secrets-decrypt` | Decrypt secrets using helm-secrets plugin       | `ask_once`   |
| `secrets-view`    | View encrypted secrets (masked)                 | `auto_allow` |

#### `helm_values`

Inspect and diff Helm chart values without the full helm tool.

| Action          | Description                                  |
|-----------------|----------------------------------------------|
| `show-defaults` | Show default values for a chart              |
| `get-release`   | Get current values for a deployed release    |
| `diff-values`   | Diff values between two releases             |

### Cloud

#### `cloud_discover`

Parallel discovery across AWS, GCP, and Azure. Returns a structured summary of resources (name, type, region), capped at 50 items per provider.

#### `cloud_action`

Run provider-specific operations.

| Provider  | Supported operations                               |
|-----------|----------------------------------------------------|
| AWS       | EC2, S3, Lambda, RDS, EKS, IAM, Route53, CloudWatch|
| GCP       | Compute, GKE, Cloud Storage, Cloud SQL, IAM        |
| Azure     | VMs, AKS, Storage, SQL, Key Vault, Monitor         |

#### `cost_estimate`

| Action          | Description                                      |
|-----------------|--------------------------------------------------|
| `estimate`      | Estimate monthly cost for current infrastructure |
| `compare`       | Compare costs between two environments           |
| `savings-plan`  | Analyze savings plan and reserved instance options|
| `rightsizing`   | Identify over-provisioned resources              |
| `budget`        | Check current spend against budget thresholds    |

#### `drift_detect`

Compare live infrastructure state against the Terraform state file and Kubernetes manifests. Reports resources that have drifted.

#### `deploy_preview`

Blast radius analysis before an apply. Shows: number of resources changing, estimated cost delta, and risk level.

### Containers & Docker

#### `docker`

| Action          | Description                                     | Permission   |
|-----------------|-------------------------------------------------|--------------|
| `build`         | Build an image (streams build progress)         | `ask_once`   |
| `push`          | Push an image to a registry                     | `ask_once`   |
| `pull`          | Pull an image                                   | `auto_allow` |
| `run`           | Run a container                                 | `ask_once`   |
| `exec`          | Execute a command in a running container        | `ask_once`   |
| `ps`            | List running containers                         | `auto_allow` |
| `logs`          | Stream container logs                           | `auto_allow` |
| `stop`          | Stop a container                                | `ask_once`   |
| `rm`            | Remove a container                              | `ask_once`   |
| `rmi`           | Remove an image                                 | `ask_once`   |
| `scan`          | Scan image or filesystem with Trivy (CRITICAL/HIGH/MEDIUM/LOW) | `auto_allow` |
| `compose-up`    | Start services with docker-compose              | `ask_once`   |
| `compose-down`  | Stop services with docker-compose               | `ask_once`   |

### Secrets & Security

#### `secrets`

| Action              | Description                                           | Permission   |
|---------------------|-------------------------------------------------------|--------------|
| `vault-read`        | Read a secret from HashiCorp Vault                    | `always_ask` |
| `vault-write`       | Write a secret to Vault                               | `always_ask` |
| `vault-rotate`      | Rotate a Vault secret                                 | `always_ask` |
| `vault-lease-renew` | Renew a Vault lease                                   | `ask_once`   |
| `vault-list`        | List secrets at a Vault path                          | `auto_allow` |
| `aws-get-secret`    | Get a secret from AWS Secrets Manager                 | `always_ask` |
| `aws-put-secret`    | Put a secret into AWS Secrets Manager                 | `always_ask` |
| `aws-rotate-secret` | Rotate an AWS Secrets Manager secret                  | `always_ask` |
| `aws-list-secrets`  | List secrets in AWS Secrets Manager                   | `auto_allow` |
| `gcp-get-secret`    | Get a secret version from GCP Secret Manager          | `always_ask` |
| `gcp-create-version`| Create a new secret version in GCP                   | `always_ask` |

Secret values are masked as `[REDACTED]` in all tool output.

#### `policy_check`

Run IaC policy scanning before applies.

| Action       | Description                                            | Permission   |
|--------------|--------------------------------------------------------|--------------|
| `checkov`    | Checkov scan (`-d <target> --framework <framework>`)   | `auto_allow` |
| `tfsec`      | tfsec scan of Terraform code                           | `auto_allow` |
| `trivy-config`| Trivy config scan                                     | `auto_allow` |
| `conftest`   | OPA/Conftest policy evaluation                         | `auto_allow` |
| `kyverno`    | Kyverno policy check                                   | `auto_allow` |

Results are grouped by severity: CRITICAL → HIGH → MEDIUM → LOW.

#### `certs`

Inspect TLS certificates (expiry, SANs, chain validation) via `openssl` or Kubernetes secret.

#### `k8s_rbac`

Inspect and validate Kubernetes RBAC roles, bindings, and service account permissions.

### GitOps & Delivery

#### `gitops`

| Action         | Description                                         |
|----------------|-----------------------------------------------------|
| `argocd-status`| Show ArgoCD application status (parsed JSON table)  |
| `argocd-sync`  | Trigger sync for an ArgoCD application              |
| `flux-status`  | Show Flux reconciliation status                     |
| `flux-reconcile`| Trigger a Flux reconciliation                      |
| `watch`        | Stream `kubectl get applications --watch` output    |

#### `rollout_control`

Progressive delivery control for Argo Rollouts and Flagger.

| Action       | Description                                      |
|--------------|--------------------------------------------------|
| `status`     | Show rollout status                              |
| `promote`    | Promote a canary rollout to the next step        |
| `abort`      | Abort a rollout                                  |
| `pause`      | Pause a rollout                                  |
| `resume`     | Resume a paused rollout                          |
| `set-weight` | Set canary traffic weight (0–100%)               |
| `analyze`    | Show analysis run results                        |

#### `cicd`

Manage CI/CD pipelines across GitHub Actions, GitLab CI, and CircleCI.

### Monitoring & Observability

#### `monitor`

Query metrics and alerts from Prometheus, Grafana, and Datadog.

#### `logs`

Stream logs from Kubernetes pods, containers, and cloud log groups with real-time output via `spawnExec`.

#### `mesh`

Service mesh operations for Istio and Linkerd (traffic management, observability, mTLS status).

| Additional actions | `metrics`, `error-budget`, `traffic-split` |

### Database

#### `db_migrate`

Run database migrations. Supports Flyway, Liquibase, golang-migrate, and Sqitch.

| Action      | Description                          | Permission   |
|-------------|--------------------------------------|--------------|
| `info`      | Show migration status                | `auto_allow` |
| `migrate`   | Apply pending migrations             | `always_ask` |
| `rollback`  | Roll back the last migration         | `always_ask` |
| `validate`  | Validate migration checksums         | `auto_allow` |
| `clean`     | Drop all database objects            | `always_ask` |
| `baseline`  | Baseline an existing schema          | `always_ask` |

### Infra Generation & Analysis

#### `generate_infra`

Generate Terraform, Kubernetes manifests, or Helm charts from a natural-language description. Uses best-practice templates and injects NIMBUS.md context.

#### `cfn`

AWS CloudFormation stack management (deploy, describe, delete, events, outputs).

#### `ansible`

Run Ansible operations.

| Action            | Description                                        | Permission   |
|-------------------|----------------------------------------------------|--------------|
| `playbook`        | Run a playbook (streams output via `spawnExec`)    | `always_ask` |
| `syntax-check`    | Validate playbook syntax                           | `auto_allow` |
| `dry-run`         | Run playbook in check mode (no changes)            | `ask_once`   |
| `inventory-list`  | List inventory hosts and groups                    | `auto_allow` |
| `vault-encrypt`   | Encrypt a file with Ansible Vault                  | `ask_once`   |
| `vault-decrypt`   | Decrypt a file with Ansible Vault                  | `ask_once`   |
| `vault-view`      | View encrypted content                             | `auto_allow` |
| `galaxy-install`  | Install a role from Ansible Galaxy                 | `ask_once`   |
| `galaxy-search`   | Search Ansible Galaxy                              | `auto_allow` |
| `facts`           | Gather host facts                                  | `auto_allow` |

### Utilities

#### `env_diff`

Side-by-side comparison between environments.

| Type                  | Description                                          |
|-----------------------|------------------------------------------------------|
| `terraform-workspaces`| Diff Terraform plan outputs across workspaces        |
| `k8s-namespaces`      | Diff all resources across two Kubernetes namespaces  |
| `helm-releases`       | Diff Helm values between two releases                |

#### `notify`

Send notifications to Slack, PagerDuty, Microsoft Teams, or a generic webhook.

| Action             | Description                               |
|--------------------|-------------------------------------------|
| `send`             | Send a message                            |
| `create-incident`  | Create a PagerDuty/Opsgenie incident      |
| `resolve-incident` | Resolve an open incident                  |

Auto-fires after successful `terraform apply` if `NIMBUS.md` has a `## Notifications` section with `slack_webhook:`.

---

## Permission Tiers

| Tier          | Behavior                                                                 |
|---------------|--------------------------------------------------------------------------|
| `auto_allow`  | Executes immediately, no prompt (read-only and safe operations)          |
| `ask_once`    | Asks once per session; subsequent calls auto-approved                    |
| `always_ask`  | Asks every time (destructive operations: apply, delete, destroy)         |
| `blocked`     | Never executes (configurable per tool in hooks or config)                |

Switching modes resets the `ask_once` session state — tools previously approved need re-approval in the new mode.
