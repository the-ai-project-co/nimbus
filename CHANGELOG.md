# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.4.2] - 2026-03-06

### Added

- **Categorized HelpModal** — `/help` now shows 5 categories (DevOps Commands,
  Session, Navigation, Settings, Keyboard Shortcuts) with 33+ commands listed,
  including `/plan`, `/apply`, `/drift`, `/rollback`, `/incident`, `/runbook`,
  `/plugin`, `/tools`, `/remember`, `/share`, `/deploy`, `/logs`,
  `/auth-refresh`, `/search`, `/watch`, and more.
- **Help hint in InputBox** — Placeholder text updated to
  "Ask me anything DevOps... (? for help, /help for commands)" so new users
  immediately discover the help system.
- **Additional slash command completions** — `/deploy`, `/rollback`, `/incident`,
  `/runbook`, `/plugin`, `/share`, `/status`, `/remember`, `/logs` added to
  Tab-autocomplete in the InputBox.
- **Onboarding transition message** — After the setup wizard completes, a clear
  "Setup complete! Launching Nimbus DevOps Agent..." message is shown before
  the TUI opens, with keyboard hints (?, Tab, Ctrl+C).
- **sql.js SQLite fallback** — When `better-sqlite3` native bindings cannot be
  compiled (ARM Linux, Windows, some CI environments), Nimbus automatically
  falls back to `sql.js` (pure JavaScript) with full file persistence. No
  in-memory-only limitation.
- **Auto-update badge** — Background version check against npm registry; new
  version available shows `[update: vX.Y.Z] run: nimbus upgrade` in the
  StatusBar without blocking startup.
- **Human-readable session names** — Sessions are auto-renamed from the first
  user message (e.g. "check-failing-pods") instead of showing UUID strings.
- **Auto-init on fresh session** — When no `NIMBUS.md` exists and infrastructure
  files are detected (`*.tf`, `Chart.yaml`, etc.), Nimbus auto-generates
  `NIMBUS.md` silently at session start.
- **Auto-doctor on first session** — First-ever session checks for missing
  DevOps CLIs (terraform, kubectl, helm, docker) and surfaces warnings in the
  TUI as a system message.
- **OpenCode parity test suite** — `src/__tests__/opencode-parity-v2.test.ts`
  with 51 assertions covering HelpModal categories, InputBox hints, onboarding
  transition, doctor --fix wiring, and welcome-screen infra context.

### Fixed

- Removed stale `"prepare"` script from `package.json` — `tsc` no longer runs
  on `npm install`, eliminating the 5–15 second delay for global installs.
- `compat-sqlite.test.ts` updated to check for `persist` instead of `in-memory`
  (sql.js fallback now writes to disk, not memory-only).
- `devops-terminal-gaps.test.ts` placeholder assertion updated to match the new
  DevOps-focused placeholder text.

---

## [0.4.1] - 2026-02-28

### Added

- **Full 29-gap DevOps fix plan** — All gaps from the C1–C4, H1–H7, M1–M10,
  L1–L8 plan implemented (1408 → 1484 tests):
  - **C1** — Per-tool Ctrl+C: cancels the running tool only; agent loop
    continues with a synthetic "cancelled" result. Press Ctrl+C again to abort
    the session.
  - **C2** — Ansible tool with 10 actions: `playbook`, `syntax-check`,
    `dry-run`, `inventory-list`, `vault-encrypt`, `vault-decrypt`, `vault-view`,
    `galaxy-install`, `galaxy-search`, `facts`.
  - **C3** — Terraform workspace auto-applied across turns: session workspace
    stored in `ToolExecuteContext.infraContext.terraformWorkspace`; each
    stateful terraform action auto-selects the session workspace.
  - **C4** — ArgoCD/Flux GitOps `watch` action: streams
    `kubectl get applications --watch` via `spawnExec` with `onChunk`.
  - **H1** — Inline diff approval: `edit_file`/`multi_edit` in build/deploy
    mode triggers a diff preview modal; user approves or rejects before the
    write applies.
  - **H2** — Async context compaction: `runCompaction()` fires in the
    background; the result is awaited at the start of the next turn, shifting
    the 1–2s wait to the user's thinking pause.
  - **H3** — kubectl `events` and `watch` actions with streaming output.
  - **H4** — `policy_check` tool: runs Checkov, tfsec, Trivy-config, Conftest,
    or Kyverno; groups violations by severity; `auto_allow` permission tier.
  - **H5** — `rollout_control` tool: Argo Rollouts and Flagger support
    (status, promote, abort, pause, resume, set-weight, analyze).
  - **H6** — Extended `secrets` tool: HashiCorp Vault (`vault-read`,
    `vault-write`, `vault-rotate`, `vault-lease-renew`, `vault-list`) and
    AWS Secrets Manager (`aws-get-secret`, `aws-put-secret`, `aws-rotate-secret`,
    `aws-list-secrets`). Secret values masked as `[REDACTED]` in output.
  - **H7** — Runbook step-by-step progress: `[STEP_START:N]` /
    `[STEP_COMPLETE:N]` sentinels parsed from the agent stream; current step
    shown in StatusBar.
  - **M1** — Docker `scan` action: runs `trivy image` or `trivy fs`, groups
    results by severity (CRITICAL/HIGH/MEDIUM/LOW).
  - **M3** — `db_migrate` tool: Flyway, Liquibase, golang-migrate, Sqitch
    (info/migrate/rollback/validate/clean/baseline). `always_ask` permission.
  - **M5** — Pre-apply cost alert: after `terraform plan`, estimates monthly
    cost delta; warns if > $100/month before proceeding.
  - **M6** — Terraform plan truncation threshold increased to 1500 lines with
    smarter summary (first 30 + resource list + last 20 lines).
  - **M7** — `env_diff` tool: compares terraform workspaces, K8s namespaces,
    or Helm releases side-by-side.
  - **M9** — Doctor platform-aware install instructions: `brew install` on
    macOS, `apt-get` / `dnf` on Linux with distro detection.
  - **M10** — `notify` tool: Slack, PagerDuty, Microsoft Teams, or generic
    webhook. Auto-fires after successful terraform apply if `## Notifications`
    in NIMBUS.md has `slack_webhook:`.
  - **L1** — README Bun binary mention corrected.
  - **L3** — `/watch` defaults to DevOps files (`*.tf`, `*.yaml`, `*.yml`,
    `Dockerfile`).
  - **L4** — NIMBUS.md validation on load: checks for unclosed code fences,
    invalid headers, and size > 50KB.
  - **L5** — Live session sharing: `/ws/share/:id` WebSocket endpoint; all
    connected viewers receive new messages in real time.
  - **L7** — `nimbus status --watch`: refreshes every 30s, clears terminal with
    ANSI escape.
  - **L8** — Terraform module registry browser: `terraform_registry` tool with
    `search` and `show` actions against the Terraform Registry API.

---

## [0.4.0] - 2026-02-10

### Added

- **Full OpenCode parity** — 30 DevOps UX gaps resolved; Nimbus now matches
  OpenCode's terminal experience end-to-end, specialized for DevOps.
- **Ctrl+C per-tool cancel** — Cancels the running subprocess only (not the
  whole TUI). Agent loop continues. Press Ctrl+C again to exit.
- **Scroll lock** — Message list pins to bottom while the agent is responding;
  Up/Down arrows unlock scroll. `G` snaps back to the bottom.
- **Streaming tool output window** — `ToolCallDisplay` shows the last 10 lines
  of live output while a tool is running, with elapsed timer and a `LIVE`
  indicator for log-streaming tools.
- **Mode persistence** — Active mode (plan/build/deploy) is saved per working
  directory to `~/.nimbus/mode-config.json` and restored on next session.
- **Conversation search** — `/search <query>` filters the message list in real
  time; result count shown in StatusBar.
- **Per-turn token/cost stats** — After each LLM response, a compact
  `[N in / N out — $X.XXXX]` line is emitted so you can track spend per turn.
- **API-key setup banner** — If no LLM key is configured, a dismissable banner
  explains how to set up credentials. Auto-dismisses after 8 seconds or on
  first message.
- **Auto-show TerminalPane** — For long-running DevOps tools (terraform, helm,
  kubectl, docker), the terminal output pane opens automatically and closes 2
  seconds after the tool completes.
- **Shell completion auto-install** — `nimbus completions install` detects the
  shell (bash/zsh/fish) and writes the completion script to the right location.
- **Config profiles** — `nimbus profile <name>` loads a named config set
  (model, mode, tool permissions) from `~/.nimbus/profiles/`.
- **Session infra context** — Each session stores its Terraform workspace and
  kubectl context in SQLite; infra context is restored on session resume and
  shown in the Header.
- **Token usage warning** — At 70% context window usage, a yellow warning
  appears: "Context at 70% — consider /compact".

### Changed

- Empty state simplified: instead of generic tips, shows "Starting Nimbus..."
  while the agent initializes.
- Copy-to-clipboard (`pbcopy`/`xclip`/`clip`) available from MessageList code
  blocks; success shown as a toast in StatusBar.
- Deploy mode confirmation: Tab to deploy now shows a "Switch to DEPLOY mode?
  [y/N]" prompt instead of switching immediately.

---

## [0.3.0] - 2026-01-20

### Added

- **Terminal Gap Fix Plan v2** — C1–C6, H1–H5, M1–M3, L1–L2 (1259 tests):
  - Multi-cluster context display in Header with environment color coding.
  - LSP diagnostics surfaced inline (TypeScript, Go, Python, HCL, YAML, Docker).
  - Smarter context compaction: haiku model for summarization, preserves tool
    state and last 5 messages.
  - `nimbus rollout` command for canary/progressive delivery (Argo Rollouts).
  - JSON output for `nimbus run --format json` includes `planSummary` field.
  - Custom error hints for terraform/kubectl/helm/cloud errors (20+ patterns).
  - FileDiffModal for inline diff approval before file edits apply.
  - Compaction runs async (non-blocking) — result awaited at next turn start.

- **Standalone Binary Migration** — C1–C8, H1–H3, M1–M3, L1 (1293 tests):
  - Migrated from Bun to Node.js + npm for the npm distribution path.
  - Tests use vitest@2 (`npm test`) instead of `bun:test`.
  - `tsconfig.json` uses `moduleResolution: "bundler"` and `types: ["node"]`.
  - `Timer` global replaced with `ReturnType<typeof setTimeout>` in 3 files.
  - BrowserOAuthServer uses `node:http` instead of `Bun.serve()`.
  - `better-sqlite3` as primary SQLite backend (native Node.js bindings).

---

## [0.2.0] - 2025-12-15

### Added

- **DevOps Identity Gap Fix** — Help/onboarding/header/welcome overhaul (1342
  tests):
  - Header shows terraform workspace and kubectl context with [PROD] warnings.
  - Welcome screen shows detected infra context (tf/k8s/aws/gcp) with
    context-aware suggestions.
  - Onboarding wizard (11 providers): Anthropic, OpenAI, Google, Bedrock, Azure
    OpenAI, Ollama, Groq, DeepSeek, OpenRouter, Together AI, Fireworks AI.
  - Infrastructure auto-detection in onboarding (Terraform, K8s, Helm, Docker).
  - `nimbus doctor` replaces stale localhost port checks with: SQLite DB check,
    LLM auth check, DevOps CLI version checks (terraform, kubectl, helm, aws,
    gcloud, az).

- **DevOps Terminal Gap Fix** — C1–C3, H1–H5, M1–M5, L1–L3 (1328 tests):
  - Logs tool with streaming via `spawnExec` + `onChunk`; StatusBar shows
    "Esc:stop stream".
  - Infra context (`SessionInfraContext`) stored per session in SQLite; wired
    into `ToolExecuteContext` so tools receive live workspace/context.
  - Terraform plan smart truncation (500 → 1500 lines) with summary line.
  - ToolCallDisplay LIVE indicator for streaming tools.
  - Parallel cloud discovery for AWS/GCP/Azure in `cloud_discover`.
  - Compaction preserves `infraContext` across sessions.
  - `generate_infra` tool for natural-language infrastructure generation.
  - Docker build progress display in `ToolCallDisplay`.
  - `nimbus rollout` command.
  - `planSummary` field in `nimbus run --format json` output.
  - Custom DevOps error hints injected into tool results.

- **DevOps Polish Plan** — H1–H5, M1–M7, L1–L5 (1384 tests):
  - `TerminalPane` and `TreePane` side panels toggled by `/terminal` and `/tree`.
  - MCP plugin manager (`nimbus plugin install/uninstall/list`).
  - Team-context NIMBUS.md sharing (`nimbus team-context`).
  - NIMBUS.md diff shown on `nimbus init` re-run.
  - Session cost/token summary on session close.

---

## [0.1.0] - 2025-10-01

### Added

- **5-Phase transformation complete** — 18 microservices consolidated into a
  single embedded binary.
- **Phase 1** — Core infrastructure: entry point, CLI router, app lifecycle,
  LLM router (7 providers), tool schemas, SQLite state (16 tables), enterprise
  layer. 188 tests, ~62 MB binary.
- **Phase 2** — Tool system: Zod-based tool schemas, `ToolRegistry`, 4-tier
  permission engine, MCP client (JSON-RPC over stdio/HTTP), subagent system,
  agent loop with streaming. 173 new tests (361 total).
- **Phase 3** — TUI: Ink v6 + React 19, 8 components (App, Header,
  MessageList, ToolCallDisplay, InputBox, StatusBar, PermissionPrompt,
  DeployPreview). Three-mode system (plan/build/deploy). Hooks (YAML config),
  snapshots (git write-tree), audit (14 security rules, 25 compliance
  controls). `nimbus init` with 6-language + 5-infra + 3-cloud detection.
  177 new tests (538 total).
- **Phase 4** — Distribution: npm packaging, Homebrew tap, shell script
  installer, pre-built binaries for macOS/Linux/Windows, GitHub Actions CI.
- **Phase 5** — Production features: LSP (6 languages, lazy-loaded), context
  manager (auto-compact at 85%), session manager (SQLite-backed, conflict
  detection), HTTP API server (Elysia, SSE streaming), session sharing
  (URL-safe IDs, 30-day TTL), web UI integration. 109 new tests (647 total).
- **DevOps Gaps v1** — 21 gaps resolved: DEVOPS_DOMAIN_KNOWLEDGE in system
  prompt, terraform destroy guard, real DevOps CLI checks in doctor, infra
  context discovery, terraform plan analyzer, DevOps error classification,
  session infra context, auth-refresh command, kubectl_context tool,
  helm_values tool, TerraformPlanCache, cloud_discover structured output,
  stdin piping, DevOps-only file watcher, workspace-aware system prompt.
- **DevOps Gaps v2** — 29 more gaps resolved: docker tool, secrets tool (helm-
  secrets), cicd tool, auth keychain, monitor tool, gitops tool, syntax
  highlighting (YAML/JSON/Bash/SQL/Dockerfile), elapsed timer in
  ToolCallDisplay, 70% context warning, TerminalPane, cloudActionTool,
  logsTool, certsTool, meshTool, cfnTool, k8sRbacTool, NIMBUS.md live reload,
  TreePane sidebar, plugin manager, team-context, shell completions, session
  cost summary, enhanced doctor.

### Architecture

- Runtime: Node.js >= 18 (npm distribution) with Bun support for compiled
  binaries.
- Single-process design: no HTTP microservices, no Docker required.
- SQLite with WAL mode at `~/.nimbus/nimbus.db`.
- Streaming-first: LLM responses and tool output stream token-by-token.
- 4-tier permission engine: auto_allow → ask_once → always_ask → blocked.
