---
title: Commands Reference
---

# Commands Reference

## CLI Commands

### Chat and AI

| Command                   | Description                                        |
|---------------------------|----------------------------------------------------|
| `nimbus`                  | Launch interactive TUI (default)                   |
| `nimbus chat`             | Interactive AI DevOps agent                        |
| `nimbus run "prompt"`     | Non-interactive mode (CI/CD friendly)              |
| `nimbus ask "question"`   | Ask a one-off question                             |
| `nimbus explain <file>`   | Explain a file or infrastructure resource          |
| `nimbus fix <file>`       | Analyze and fix issues in a file                   |
| `nimbus analyze`          | Analyze the current project                        |

**Non-interactive flags:**

```bash
nimbus run "check for drift" --auto-approve    # skip permission prompts
nimbus run "list failing pods" --format json   # machine-readable output
nimbus run "generate k8s manifest" --dry-run   # plan only, no writes
```

### Configuration

| Command                        | Description                                             |
|--------------------------------|---------------------------------------------------------|
| `nimbus init`                  | Detect stack, generate NIMBUS.md project context        |
| `nimbus config`                | View or set configuration                               |
| `nimbus login`                 | Authenticate with an LLM provider                       |
| `nimbus logout`                | Remove stored credentials                               |
| `nimbus auth-refresh`          | Refresh cloud credentials (AWS SSO, GCP, Azure)         |
| `nimbus doctor [--fix]`        | Check environment, auto-install missing CLIs with --fix |
| `nimbus upgrade`               | Self-update to the latest version                       |
| `nimbus completions install`   | Install shell tab completions (bash/zsh/fish)           |
| `nimbus profile <name>`        | Load a named config profile                             |

### Infrastructure

| Command                                                | Description                               |
|--------------------------------------------------------|-------------------------------------------|
| `nimbus tf init/plan/apply/validate/destroy/fmt`       | Terraform operations                      |
| `nimbus k8s get/apply/delete/logs/scale/exec`          | Kubernetes operations                     |
| `nimbus helm list/install/upgrade/uninstall/rollback`  | Helm chart management                     |
| `nimbus deploy`                                        | Full plan → apply → rollout workflow      |
| `nimbus rollback [resource]`                           | Safely roll back last deployment          |
| `nimbus rollout <name>`                                | Argo Rollouts / canary delivery control   |
| `nimbus drift [--notify]`                              | Detect infrastructure drift               |
| `nimbus cost estimate/compare/history`                 | Cost estimation and savings analysis      |
| `nimbus preview`                                       | Deploy preview with blast radius analysis |

### Generation

| Command                      | Description                                     |
|------------------------------|-------------------------------------------------|
| `nimbus generate terraform`  | Generate Terraform from natural language        |
| `nimbus generate k8s`        | Generate Kubernetes manifests                   |
| `nimbus generate helm`       | Generate Helm charts                            |

### Cloud Providers

| Command                   | Description                               |
|---------------------------|-------------------------------------------|
| `nimbus aws <service>`    | AWS operations (S3, EC2, Lambda, RDS...)  |
| `nimbus gcp <service>`    | Google Cloud operations                   |
| `nimbus azure <service>`  | Azure operations                          |

### DevOps Workflows

| Command                   | Description                                               |
|---------------------------|-----------------------------------------------------------|
| `nimbus incident`         | Incident response with PagerDuty/Opsgenie integration     |
| `nimbus runbook <file>`   | Execute a YAML runbook step by step                       |
| `nimbus logs`             | Stream Kubernetes/cloud logs                              |
| `nimbus pipeline`         | Manage CI/CD pipelines (GitHub Actions, GitLab, CircleCI) |
| `nimbus schedule`         | Manage scheduled agent tasks                              |
| `nimbus status`           | Show Nimbus and infrastructure status                     |
| `nimbus status --watch`   | Refresh every 30s (live dashboard)                        |

### Sessions

| Command                          | Description                          |
|----------------------------------|--------------------------------------|
| `nimbus sessions list`           | List recent sessions                 |
| `nimbus sessions resume <id>`    | Resume a previous session            |
| `nimbus sessions delete <id>`    | Delete a session                     |
| `nimbus share [--session <id>]`  | Share a session (generates URL)      |
| `nimbus export`                  | Export session as Markdown runbook   |

### Git, Files, and GitHub

| Command                                           | Description             |
|---------------------------------------------------|-------------------------|
| `nimbus git status/add/commit/push/merge/stash`   | Git operations          |
| `nimbus fs read/write/list/search`                | File system operations  |
| `nimbus gh pr list/create/view/merge`             | Pull request operations |
| `nimbus gh issue list/create/view/close`          | Issue operations        |
| `nimbus gh repo view/clone`                       | Repository operations   |

### Enterprise

| Command           | Description                          |
|-------------------|--------------------------------------|
| `nimbus team`     | Team management                      |
| `nimbus billing`  | Billing and subscription management  |
| `nimbus usage`    | Usage statistics and token tracking  |
| `nimbus audit`    | Audit logs and compliance reports    |

### Server, UI, and Utilities

| Command                    | Description                                         |
|----------------------------|-----------------------------------------------------|
| `nimbus serve`             | Start HTTP API server (Elysia, SSE streaming)       |
| `nimbus web`               | Start API server and open browser-based UI          |
| `nimbus version [--json]`  | Print version and build date                        |
| `nimbus help`              | Show help for all commands                          |
| `nimbus help <command>`    | Show help for a specific command                    |
| `nimbus plugin install`    | Install an MCP plugin                               |
| `nimbus alias list`        | Manage command aliases                              |

---

## Slash Commands (TUI)

Type these directly into the TUI input box. Press `?` or `/help` at any time to see them all.

### DevOps

| Command               | Description                                         |
|-----------------------|-----------------------------------------------------|
| `/plan`               | Run `terraform plan` for the current workspace      |
| `/apply`              | Apply pending infrastructure changes                |
| `/drift`              | Detect drift between live state and code            |
| `/deploy`             | Full plan → apply → rollout workflow                |
| `/rollback`           | Safely roll back last deployment                    |
| `/k8s-ctx [ctx]`      | List or switch kubectl context (Tab to autocomplete)|
| `/tf-ws [ws]`         | List or switch Terraform workspace                  |
| `/logs`               | Stream pod/container logs                           |
| `/auth-refresh`       | Refresh cloud credentials                           |
| `/incident`           | Launch incident response mode                       |
| `/runbook <file>`     | Execute a runbook YAML                              |

### Session

| Command             | Description                                  |
|---------------------|----------------------------------------------|
| `/sessions`         | List recent sessions                         |
| `/new [name]`       | Create a new session                         |
| `/switch <id>`      | Switch to a different session                |
| `/export`           | Export session as Markdown runbook           |
| `/share`            | Generate a shareable session URL             |
| `/cost`             | Show token usage and cost for this session   |
| `/compact`          | Compress context to free token budget        |
| `/context`          | Show context window breakdown                |
| `/clear`            | Clear conversation history                   |
| `/remember`         | Save a note to NIMBUS.md persistent context  |
| `/profile [name]`   | Load or switch a named config profile        |

### Navigation

| Command              | Description                               |
|----------------------|-------------------------------------------|
| `/search [query]`    | Filter conversation history               |
| `/tree`              | Toggle file tree sidebar                  |
| `/terminal`          | Toggle tool output terminal pane          |
| `/watch [glob]`      | Watch files (default: `*.tf`, `*.yaml`, `*.yml`, `Dockerfile`) |
| `/diff`              | Show unstaged git diff                    |
| `/undo`              | Undo last file change (snapshot)          |
| `/redo`              | Redo last undone change                   |

### Settings

| Command              | Description                                     |
|----------------------|-------------------------------------------------|
| `/mode plan`         | Switch to plan mode (read-only)                 |
| `/mode build`        | Switch to build mode                            |
| `/mode deploy`       | Switch to deploy mode (confirmation required)   |
| `/model [name]`      | Show or switch the active LLM model             |
| `/models`            | List all available provider models              |
| `/theme [name]`      | Switch color theme (dark/light/solarized)       |
| `/init`              | Regenerate NIMBUS.md project context            |
| `/tools`             | List all available agent tools                  |
| `/plugin <cmd>`      | Manage MCP plugins (install/uninstall/list)     |
| `/help`              | Show all commands                               |

---

## Keyboard Shortcuts (TUI)

| Shortcut       | Action                                          |
|----------------|-------------------------------------------------|
| `?`            | Open help panel                                 |
| `Tab`          | Cycle modes (Plan → Build → Deploy → Plan)      |
| `Ctrl+C`       | Cancel current tool call (press again to exit)  |
| `Escape`       | Cancel current operation / close modal          |
| `Up / Down`    | Browse input history                            |
| `Ctrl+R`       | Reverse-search input history                    |
| `Ctrl+E`       | Open `$EDITOR` for multi-line input             |
| `Ctrl+Z`       | Undo last file change (snapshot)                |
| `G`            | Scroll to bottom of message list                |
| `k / j`        | Scroll up / down in message list                |
| `Enter`        | Send message                                    |

---

## Modes

Nimbus uses a three-mode system with progressive trust. Switching modes resets the permission session — tools approved in Build mode need re-approval in Deploy.

### Plan mode

Read-only. The agent can query live state, read files, estimate costs, detect drift, and propose changes — but cannot modify anything.

**Tools available:** `read_file`, `glob`, `grep`, `list_dir`, `webfetch`, `cost_estimate`, `drift_detect`, `cloud_discover`, `terraform_plan_analyze`, `kubectl_context`

### Build mode (default)

Everything in Plan, plus file editing, shell access, git, and non-destructive DevOps commands. The agent can generate and validate Terraform/K8s configs but cannot apply changes to live infrastructure.

**Additional tools:** `edit_file`, `multi_edit`, `write_file`, `bash`, `git`, `task`, `deploy_preview`, `terraform` (plan/validate/fmt), `kubectl` (get/describe), `helm` (list/status/template)

### Deploy mode

Full access to all tools including infrastructure-mutating operations. Destructive actions always go through the permission engine. Header turns red. Confirmation prompt appears when entering this mode.

**Additional tools:** All terraform subcommands (apply, destroy), all kubectl subcommands (apply, delete, exec), all helm subcommands (install, upgrade, uninstall), `docker`, `secrets`, `cicd`, `cfn`, `k8s_rbac`, `ansible`, `rollout_control`, `db_migrate`, `notify`
