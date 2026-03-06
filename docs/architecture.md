---
title: Architecture
---

# Architecture

Nimbus runs entirely in a single Node.js process. No HTTP microservices, no Docker containers, no external orchestrators. LLM calls, tool execution, SQLite state writes, and the TUI all happen in the same event loop.

---

## High-Level Flow

```
nimbus (CLI)
  └── src/nimbus.ts           Entry point: update check, first-run detection
        └── src/cli.ts         Command router (50+ commands)
              └── nimbus chat
                    └── src/ui/ink/index.ts   startInkChat()
                          ├── discoverInfraContext()   Terraform/K8s/cloud auto-discovery
                          ├── loadSession()            SQLite session restore
                          └── render(<App />)          Ink v6 + React 19 TUI
                                └── src/agent/loop.ts  runAgentLoop()
                                      ├── LLM streaming (11+ providers)
                                      ├── Tool execution (35+ tools)
                                      └── Permission engine (4 tiers)
```

---

## Components

### Entry & CLI (`src/nimbus.ts`, `src/cli.ts`)

`nimbus.ts` handles the shebang launch, runs a background update check, detects first-run (no credentials), and delegates to `cli.ts`. The CLI router handles 50+ subcommands — each maps to a file in `src/commands/`.

### TUI (`src/ui/`)

Built with **Ink v6 + React 19**. All components use React hooks (`useState`, `useEffect`, `useInput`). The root `App.tsx` owns all application state and passes props down.

```
App.tsx
  ├── Header.tsx           Mode badge, terraform workspace, kubectl context, [PROD] warning
  ├── MessageList.tsx      Conversation history, syntax highlighting, search filter
  ├── ToolCallDisplay.tsx  Live tool output, elapsed timer, LIVE indicator for streaming tools
  ├── InputBox.tsx         Slash-command autocomplete, @file injection, input history
  ├── StatusBar.tsx        Token count, cost per turn, scroll hint, runbook step progress
  ├── PermissionPrompt.tsx 4-tier approval modal
  ├── FileDiffModal.tsx    Inline diff review before file edits apply
  ├── HelpModal.tsx        5-category slash command reference
  ├── DeployPreview.tsx    Blast radius analysis before apply
  ├── TerminalPane.tsx     Side panel showing raw tool output history (/terminal)
  └── TreePane.tsx         File tree sidebar with @file injection (/tree)
```

**Key TUI behaviors:**

- **Scroll lock** — Message list pins to the bottom while the agent is responding. Up/Down unlocks scroll; `G` snaps back.
- **Per-tool Ctrl+C** — First Ctrl+C fires `toolAbortController.abort()` (cancels only the running tool). Agent loop continues with a synthetic `"Tool cancelled"` result. Second Ctrl+C exits the session.
- **Mode switching** — `Tab` cycles Plan → Build → Deploy → Plan. Switching resets `ask_once` permission state to prevent privilege escalation.
- **Streaming tool output** — `ToolCallDisplay` shows the last 10 lines of live `onChunk` output while a tool is running.

### Agent Loop (`src/agent/loop.ts`)

`runAgentLoop()` is the core agentic loop:

1. Build LLM messages array (system prompt + conversation history)
2. Check context window — if > 85%, fire async compaction before next turn
3. Stream LLM response token-by-token via `onText` callback
4. Parse tool calls from the response
5. For each tool call:
   - Create per-tool `AbortController`
   - Check permission tier
   - Execute tool with `ctx.signal = toolAbortController.signal`
   - Classify errors with `classifyDevOpsError()` (20+ patterns)
   - Append result to messages
6. If no tool calls, loop ends (final response delivered)

**Callbacks interface (`AgentLoopCallbacks`):**

| Callback                | When it fires                                     |
|-------------------------|---------------------------------------------------|
| `onText`                | Each streamed token                               |
| `onToolStart`           | Tool call begins                                  |
| `onToolEnd`             | Tool call completes                               |
| `onPermissionRequest`   | Permission engine pauses for user input           |
| `onCancelCurrentTool`   | User pressed Ctrl+C during a tool call            |
| `onRequestDiffApproval` | `edit_file`/`multi_edit` in build/deploy mode     |
| `onAbort`               | User pressed Ctrl+C with no tool running (exit)   |

### Tool System (`src/tools/`)

Tools are defined as Zod schemas in `src/tools/schemas/`. Each tool has:

- **Schema** — Zod object for input validation
- **`execute(input, ctx)`** — async function returning `{ output: string, isError?: boolean }`
- **Permission tier** — `auto_allow | ask_once | always_ask | blocked`

`ToolRegistry` holds all registered tools. `defaultToolRegistry` is the app-wide singleton. Tools are filtered per mode before being passed to the LLM as available tools.

Long-running tools use `spawnExec()` with `onChunk: ctx?.onProgress` to stream output token-by-token to `ToolCallDisplay`.

### LLM Router (`src/llm/`)

Routes requests to the active provider. Features:

- **Circuit breaker** — tracks provider failures, opens circuit after N errors
- **Exponential backoff** — retries with increasing delays
- **Automatic failover** — switches to next configured provider on circuit open
- **Cost tracking** — token counts and estimated cost per turn emitted via `onText`
- **Model aliases** — `sonnet`, `opus`, `gpt4o`, `gemini` map to current model IDs

### State (`src/state/`, `src/compat/`)

All state lives in a single SQLite database at `~/.nimbus/nimbus.db` (WAL mode, 16 tables).

```
Sessions          — conversation metadata, infra context, workspace state
Messages          — message history per session
ToolCalls         — tool execution log
UsageStats        — token/cost tracking per session
AuditLog          — security and compliance event log
TeamMembers       — enterprise team management
ShareLinks        — session sharing (URL-safe IDs, 30-day TTL)
...
```

**SQLite compatibility shim** (`src/compat/sqlite.ts`): tries `better-sqlite3` (native Node.js bindings) first. If native compilation fails (ARM Linux, some CI environments), falls back to `sql.js` (pure JavaScript) with full file persistence via Node.js `fs`.

### Context Management (`src/agent/context-manager.ts`)

Auto-compaction fires when the context window reaches 85% usage:

1. `runCompaction()` is started in the background (non-blocking)
2. Agent loop continues; the result is awaited at the start of the next turn
3. Compaction uses a cheap model (haiku) to summarize the middle portion of the conversation
4. Preserved: first message, last 5 messages, tool states, `infraContext`

### Session Infra Context

Each session stores `SessionInfraContext` in SQLite:

```typescript
interface SessionInfraContext {
  terraformWorkspace?: string;
  kubectlContext?: string;
  awsAccount?: string;
  gcpProject?: string;
  azureSubscription?: string;
}
```

This flows into `ToolExecuteContext` so every tool receives the live workspace/context without the user having to repeat it. The Header displays the active context with [PROD] warnings.

### Snapshot System (`src/snapshots/`)

`/undo` and `/redo` in the TUI use:

- **Git projects** — `git write-tree` to snapshot and `git read-tree` to restore
- **Non-git projects** — `fs.cpSync` for full directory copy

### Session Sharing (`src/sharing/`)

`/share` generates a URL-safe base64 share ID. Shares are stored in SQLite with a 30-day TTL. Live shares broadcast new messages to connected WebSocket clients (`/ws/share/:id` endpoint in `src/cli/serve.ts`).

### LSP Integration (`src/lsp/`)

Language servers are lazy-loaded on first diagnostic request and auto-stopped after 5 minutes of idle time. Supported languages: TypeScript, Go, Python, HCL (Terraform), YAML, Dockerfile.

---

## Key Design Decisions

### Single process

No IPC overhead. LLM streaming, tool execution, SQLite writes, and TUI rendering all share the same Node.js event loop. This makes the binary small (~68 MB including the pre-bundled runtime) and eliminates a whole class of distributed-system bugs.

### Streaming-first

Every LLM token streams through `onText` to the TUI immediately. Tool calls appear inline as they execute. Long-running tools (`terraform apply`, `kubectl logs`) stream output line-by-line via `spawnExec` + `onChunk`.

### Progressive trust (modes)

Plan → Build → Deploy expands tool access incrementally. Mode switching resets the `ask_once` permission state, so approvals don't carry over between modes. Deploy mode requires an explicit Tab-confirm prompt to enter, and turns the header red as a permanent visual warning.

### Per-tool Ctrl+C

The standard behavior of Ctrl+C killing the whole process is unacceptable when Terraform is mid-apply. Each tool call gets its own `AbortController`. The first Ctrl+C cancels only the tool subprocess (SIGTERM to process group). The agent loop receives a synthetic `"Tool cancelled"` result and continues. A second Ctrl+C exits the session.

### DevOps-only system prompt

`BASE_PROMPT` in `src/agent/system-prompt.ts` instructs the agent to refuse non-DevOps requests, always query live state before proposing changes, show a plan before every destructive operation, and warn loudly on production environments. `NIMBUS.md` is appended to every session's system prompt.

### sql.js fallback

Native `better-sqlite3` bindings fail on some ARM Linux builds and CI environments. When they fail, Nimbus automatically falls back to `sql.js` (pure JavaScript SQLite) with file persistence via Node.js `fs`. No data is lost; no user action is required.

---

## Source Tree

```
src/
  nimbus.ts              Entry point (shebang, update check, routing)
  cli.ts                 CLI command router (50+ commands)
  app.ts                 App lifecycle (lazy DB + LLM router init)

  agent/
    loop.ts              Core agentic loop: streaming LLM + tool execution
    system-prompt.ts     DevOps-focused BASE_PROMPT + NIMBUS.md injection
    permissions.ts       4-tier permission engine
    context-manager.ts   Auto-compaction at 85% context usage
    compaction-agent.ts  Haiku-based context summarization
    subagents/           Parallel sub-task agents (explore, infra, security, cost)

  llm/                   LLM router, 11+ providers, model aliases, cost calculator
  tools/
    schemas/
      standard.ts        12 standard tools (file, git, bash, web, subagent)
      devops.ts          23+ DevOps tools (terraform, kubectl, helm, docker, etc.)
      types.ts           ToolExecuteContext and shared type definitions
    registry.ts          ToolRegistry class; defaultToolRegistry singleton

  state/                 SQLite WAL schema (16 tables at ~/.nimbus/nimbus.db)
  ui/                    Ink v6 + React 19 TUI components
  commands/              CLI command implementations (one file per command)
  engine/                Planner, executor, orchestrator, verifier, safety, drift, cost
  generator/             Terraform, Kubernetes, Helm generators with best-practice templates
  enterprise/            Auth, teams, billing, audit
  auth/                  OAuth, SSO, credential store, keychain
  hooks/                 Pre/post tool-use hooks (YAML config, process-group kill)
  snapshots/             Git write-tree + filesystem undo/redo
  audit/                 Security scanner, compliance checker, cost tracker, activity log
  lsp/                   LSP client (6 languages, lazy-loaded, auto-stop after 5min idle)
  sessions/              Multi-session management with file conflict detection
  sharing/               Session sharing (URL-safe IDs, 30-day TTL, live WebSocket)
  mcp/                   MCP client (JSON-RPC over stdio/HTTP, plugin manager)
  cli/                   Non-interactive run, serve, web, init commands
  compat/                Runtime compatibility (better-sqlite3 → sql.js fallback)
  config/                Mode persistence, profile system, workspace state
  watcher/               Filesystem watcher with DevOps-file filtering

  __tests__/             53 test files, 1529 tests
```

---

## Development

```bash
git clone https://github.com/the-ai-project-co/nimbus.git
cd nimbus
npm install

npm run nimbus                        # run TUI from source
npm test                              # run all 1529 tests
npm test -- src/__tests__/foo.test.ts # run a single test file
npm run type-check                    # must return 0 errors
npm run lint && npm run format
npm run build                         # build standalone binary (~68 MB)
```
