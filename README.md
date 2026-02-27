# Nimbus

[![npm version](https://img.shields.io/npm/v/@nimbus-ai/cli.svg)](https://www.npmjs.com/package/@nimbus-ai/cli)
[![license](https://img.shields.io/npm/l/nimbus.svg)](https://github.com/the-ai-project-co/nimbus/blob/main/LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/the-ai-project-co/nimbus)](https://github.com/the-ai-project-co/nimbus/releases)
[![CI](https://github.com/the-ai-project-co/nimbus/actions/workflows/ci.yml/badge.svg)](https://github.com/the-ai-project-co/nimbus/actions)

> AI-powered cloud engineering agent for your terminal

Nimbus is an intelligent command-line agent that brings the power of large
language models to DevOps and cloud engineering workflows. Think of it as an AI
pair-programmer that understands Terraform, Kubernetes, Helm, and cloud
providers natively. It ships as a single self-contained binary with an
interactive terminal UI, 20 built-in tools, support for 11+ LLM providers, and a
three-mode safety system that separates reading, building, and deploying.

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [Commands](#commands)
- [Modes](#modes)
- [LLM Providers](#llm-providers)
- [MCP Support](#mcp-support)
- [Project Configuration (NIMBUS.md)](#project-configuration-nimbusmd)
- [Keyboard Shortcuts (TUI)](#keyboard-shortcuts-tui)
- [Development](#development)
- [Architecture](#architecture)
- [License](#license)

---

## Features

- **Interactive TUI** -- Rich terminal interface built with Ink and React,
  featuring syntax highlighting, markdown rendering, code blocks, and a status
  bar with mode indicators.
- **20 Built-in Tools** -- File operations (read, write, edit, glob, grep), git,
  bash, terraform, kubectl, helm, AWS/GCP/Azure cloud discovery, web search,
  cost estimation, drift detection, deploy preview, and subagent task spawning.
- **11+ LLM Providers** -- Anthropic, OpenAI, Google, AWS Bedrock, Azure OpenAI,
  Ollama, Groq, DeepSeek, OpenRouter, Together AI, Fireworks AI, and Perplexity.
  Any OpenAI-compatible endpoint can be added.
- **Three Modes** -- Plan (read-only), Build (edit/create), and Deploy (full
  infra access). Each mode progressively expands tool availability and resets
  permissions on switch.
- **Session Persistence** -- Conversations are stored in SQLite and can be
  resumed, branched, or shared. Multi-session support with file conflict
  detection.
- **MCP Server Support** -- Connect to Model Context Protocol servers to extend
  Nimbus with external tools via JSON-RPC over stdio or HTTP.
- **Subagent System** -- Spawn parallel sub-tasks (explore, infra, security,
  cost, general) with isolated context and independent model selection.
- **Context Management** -- Auto-compaction at 85% context window usage.
  Preserves first message, last 5 messages, summaries, and active tool state.
- **Snapshot / Undo / Redo** -- Uses `git write-tree` for git projects (or
  filesystem copy for non-git) to checkpoint and roll back changes.
- **Infrastructure Generation** -- Generate Terraform configurations, Kubernetes
  manifests, and Helm charts from natural language descriptions with
  best-practice templates.
- **Cost Estimation and Drift Detection** -- Estimate infrastructure costs
  before deploying and detect configuration drift across your environments.
- **Enterprise Features** -- Teams, billing, audit logs, usage tracking,
  security scanning, and compliance checking (SOC2, HIPAA, PCI-DSS, GDPR, ISO
  27001).
- **Web UI** -- Browser-based interface via `nimbus web`, backed by an Elysia
  HTTP API with SSE streaming.
- **Human-in-the-Loop Safety** -- 4-tier permission engine (auto_allow,
  ask_once, always_ask, blocked) with action-specific escalation for destructive
  operations.

---

## Quick Start

```bash
# Install
npm install -g @nimbus-ai/cli
# or
bun install -g @nimbus-ai/cli
# or via Homebrew
brew tap the-ai-project-co/tap
brew install nimbus

# Set up authentication
nimbus login

# Start the interactive AI agent
nimbus
```

On first run, Nimbus launches an onboarding flow that walks you through provider
selection and API key configuration. After that, running `nimbus` drops you into
the interactive chat.

---

## Installation

### Bun (recommended -- fastest, native SQLite)

```bash
bun install -g @nimbus-ai/cli
```

Bun provides the best experience: native `bun:sqlite` for state management,
faster startup, and the full Ink TUI out of the box.

### npm

```bash
npm install -g @nimbus-ai/cli
```

Works with Node.js >= 18. Uses `better-sqlite3` as the SQLite backend when
running under Node.

### Homebrew (macOS / Linux)

```bash
brew tap the-ai-project-co/tap
brew install nimbus
```

### Shell script (auto-detects best method)

```bash
curl -fsSL https://raw.githubusercontent.com/the-ai-project-co/nimbus/main/scripts/install.sh | bash
```

### Compiled binary (direct download)

Pre-built standalone binaries for macOS, Linux, and Windows are available on the
[GitHub Releases](https://github.com/the-ai-project-co/nimbus/releases) page.
Standalone binaries bundle the Bun runtime (~68 MB), so no extra dependencies
are needed.

> Note: compiled binaries use the readline chat interface. Install via Bun or
> npm for the full Ink TUI.

---

## Getting Started

### First run / onboarding

```bash
nimbus
```

The first time you run Nimbus, it launches an interactive onboarding that helps
you select an LLM provider and configure your API key. Credentials are stored in
`~/.nimbus/auth.json`.

### Setting up providers

You can configure providers through onboarding or by setting environment
variables directly:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Or log in interactively:

```bash
nimbus login
```

### Initialize a project

```bash
nimbus init
```

This detects your project type (TypeScript, Go, Python, Rust, Java, JavaScript),
infrastructure tooling (Terraform, Kubernetes, Helm, Docker, CI/CD), and cloud
providers (AWS, GCP, Azure), then generates a `NIMBUS.md` file with project
context that Nimbus uses to tailor its responses.

### Interactive chat

```bash
nimbus chat
```

Or just `nimbus` -- it launches the Ink TUI with the full agent loop, tool
execution, and streaming responses.

### Non-interactive mode

```bash
nimbus run "Create a Terraform module for an S3 bucket with versioning and encryption"
nimbus run "Fix the failing test in src/__tests__/router.test.ts" --auto-approve
nimbus run "Explain the architecture of this project" --format json
```

### One-off questions

```bash
nimbus ask "How do I set up an S3 bucket with versioning?"
```

### Check your environment

```bash
nimbus doctor
```

Verifies that required tools (git, terraform, kubectl, helm, cloud CLIs) are
available and that provider credentials are configured.

---

## Commands

### Chat and AI

| Command                 | Description                               |
| ----------------------- | ----------------------------------------- |
| `nimbus`                | Launch interactive chat (default)         |
| `nimbus chat`           | Interactive AI chat session               |
| `nimbus run "prompt"`   | Non-interactive mode with a single prompt |
| `nimbus ask "question"` | Ask a one-off question                    |
| `nimbus explain <file>` | Explain a file or code snippet            |
| `nimbus fix <file>`     | Analyze and fix issues in a file          |
| `nimbus analyze`        | Analyze the current project               |

### Configuration

| Command          | Description                                            |
| ---------------- | ------------------------------------------------------ |
| `nimbus init`    | Initialize a project (detect type, generate NIMBUS.md) |
| `nimbus config`  | View or set configuration                              |
| `nimbus login`   | Authenticate with an LLM provider                      |
| `nimbus logout`  | Remove stored credentials                              |
| `nimbus auth`    | Manage authentication                                  |
| `nimbus doctor`  | Check environment and provider status                  |
| `nimbus upgrade` | Self-update to the latest version                      |

### Infrastructure Generation

| Command                     | Description                                             |
| --------------------------- | ------------------------------------------------------- |
| `nimbus generate terraform` | Generate Terraform configurations from natural language |
| `nimbus generate k8s`       | Generate Kubernetes manifests                           |
| `nimbus generate helm`      | Generate Helm charts                                    |

### Cloud Providers

| Command                  | Description                            |
| ------------------------ | -------------------------------------- |
| `nimbus aws <service>`   | AWS operations (S3, EC2, Lambda, etc.) |
| `nimbus gcp <service>`   | Google Cloud operations                |
| `nimbus azure <service>` | Azure operations                       |

### Infrastructure Management

| Command                                               | Description                            |
| ----------------------------------------------------- | -------------------------------------- |
| `nimbus tf init/plan/apply/validate/destroy/fmt`      | Terraform operations                   |
| `nimbus k8s get/apply/delete/logs/scale/exec`         | Kubernetes operations                  |
| `nimbus helm list/install/upgrade/uninstall/rollback` | Helm operations                        |
| `nimbus cost estimate/history`                        | Cost estimation and tracking           |
| `nimbus drift detect/fix`                             | Configuration drift detection          |
| `nimbus preview`                                      | Deploy preview (blast radius analysis) |

### Git and Files

| Command                                         | Description            |
| ----------------------------------------------- | ---------------------- |
| `nimbus git status/add/commit/push/merge/stash` | Git operations         |
| `nimbus fs read/write/list/search`              | File system operations |

### GitHub

| Command                                  | Description             |
| ---------------------------------------- | ----------------------- |
| `nimbus gh pr list/create/view/merge`    | Pull request operations |
| `nimbus gh issue list/create/view/close` | Issue operations        |
| `nimbus gh repo view/clone`              | Repository operations   |

### Enterprise

| Command          | Description                         |
| ---------------- | ----------------------------------- |
| `nimbus team`    | Team management                     |
| `nimbus billing` | Billing and subscription management |
| `nimbus usage`   | Usage statistics and token tracking |
| `nimbus audit`   | Audit logs and compliance reports   |

### Server

| Command        | Description                                        |
| -------------- | -------------------------------------------------- |
| `nimbus serve` | Start the HTTP API server (Elysia, SSE streaming)  |
| `nimbus web`   | Start the API server and open the browser-based UI |

### Utilities

| Command                 | Description                         |
| ----------------------- | ----------------------------------- |
| `nimbus version`        | Print version and build date        |
| `nimbus help`           | Show help for all commands          |
| `nimbus help <command>` | Show help for a specific command    |
| `nimbus doctor`         | Verify environment and dependencies |
| `nimbus upgrade`        | Update Nimbus to the latest version |

Run `nimbus help` for the full command list, or `nimbus help <command>` for
details on any command.

---

## Modes

Nimbus uses a three-mode system that controls which tools are available,
enforcing a progressive trust model. Switching modes resets the permission
session so that previously approved tools require re-approval.

### Plan mode

Read-only exploration and analysis. The agent can read files, search codebases,
estimate costs, detect drift, and propose changes -- but it cannot modify
anything.

**Available tools:** `read_file`, `glob`, `grep`, `list_dir`, `webfetch`,
`cost_estimate`, `drift_detect`, `todo_read`, `todo_write`, `cloud_discover`

### Build mode (default)

Everything in Plan, plus file editing, shell access, git operations, and
non-destructive DevOps commands. The agent can generate Terraform configs, write
Kubernetes manifests, and validate them, but it cannot apply changes to live
infrastructure.

**Additional tools:** `edit_file`, `multi_edit`, `write_file`, `bash`, `git`,
`task`, `deploy_preview`, `terraform` (validate/fmt/plan only), `kubectl`
(get/describe only), `helm` (list/status/template only)

### Deploy mode

Full access to all 20 tools, including infrastructure-mutating operations.
Destructive actions still go through the permission engine and require explicit
user approval.

**Additional tools:** All terraform subcommands (apply, destroy), all kubectl
subcommands (apply, delete), all helm subcommands (install, upgrade, uninstall)

Switch modes in the TUI by pressing **Tab**, or use the `/mode` slash command.

---

## LLM Providers

Nimbus routes requests through an intelligent LLM router with automatic
fallback, cost optimization, circuit breaking, and retry with exponential
backoff.

| Provider     | Environment Variable(s)        | Notes                                                  |
| ------------ | ------------------------------ | ------------------------------------------------------ |
| Anthropic    | `ANTHROPIC_API_KEY`            | Claude models (Sonnet, Opus, Haiku). Default provider. |
| OpenAI       | `OPENAI_API_KEY`               | GPT-4o, GPT-4, GPT-3.5                                 |
| Google       | `GOOGLE_API_KEY`               | Gemini models                                          |
| AWS Bedrock  | `AWS_REGION` + IAM credentials | Claude, Llama, and others via AWS                      |
| Ollama       | `OLLAMA_BASE_URL` (optional)   | Local models, no API key needed                        |
| Groq         | `GROQ_API_KEY`                 | Fast inference (Llama, Mixtral)                        |
| DeepSeek     | `DEEPSEEK_API_KEY`             | DeepSeek models                                        |
| OpenRouter   | `OPENROUTER_API_KEY`           | Multi-model proxy, access 100+ models                  |
| Together AI  | `TOGETHER_API_KEY`             | Llama, Mixtral, and more                               |
| Fireworks AI | `FIREWORKS_API_KEY`            | Fast open-source model inference                       |
| Perplexity   | `PERPLEXITY_API_KEY`           | Online search-augmented models                         |

Any OpenAI-compatible endpoint can be added via the `OpenAICompatibleProvider`
class.

You can also configure providers through `nimbus login`, which stores
credentials in `~/.nimbus/auth.json`. The router checks `auth.json` first, then
falls back to environment variables.

### Model aliases

Nimbus supports short aliases for common models:

```bash
nimbus chat --model sonnet    # resolves to claude-sonnet-4-20250514
nimbus chat --model opus      # resolves to claude-opus-4-20250514
nimbus chat --model gpt4o     # resolves to gpt-4o
nimbus chat --model gemini    # resolves to gemini-pro
```

### Cost optimization

When enabled (`ENABLE_COST_OPTIMIZATION=true`), the router automatically selects
cheaper models for simple tasks (summarization, classification) and more capable
models for complex tasks (code generation, planning).

---

## MCP Support

Nimbus supports the [Model Context Protocol](https://modelcontextprotocol.io/)
for extending the agent with external tools. Configure MCP servers in
`.nimbus/mcp.json` (project-level) or `~/.nimbus/mcp.json` (global):

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."
      }
    },
    "remote-server": {
      "type": "http",
      "url": "https://mcp.example.com",
      "token": "your-auth-token"
    }
  }
}
```

MCP servers are discovered from three locations, searched in order:

1. `.nimbus/mcp.json` (project directory)
2. `nimbus.json` (project directory)
3. `~/.nimbus/mcp.json` (global)

Servers support two transport modes: **command** (JSON-RPC over stdio) and
**http** (JSON-RPC over HTTP). Tools from connected servers are automatically
registered into the Nimbus tool registry and become available to the agent.

---

## Project Configuration (NIMBUS.md)

Running `nimbus init` in your project directory generates a `NIMBUS.md` file
that provides project-specific context to the AI agent. Nimbus auto-detects:

- **Project type** -- TypeScript, JavaScript, Go, Python, Rust, Java
- **Infrastructure tools** -- Terraform, Kubernetes, Helm, Docker, CI/CD
  pipelines
- **Cloud providers** -- AWS, GCP, Azure (from config files and Terraform
  providers)
- **Package manager** -- npm, yarn, pnpm, bun
- **Test framework** -- jest, vitest, mocha, pytest, go test, cargo test
- **Git repository status**

The generated `NIMBUS.md` file is included in the system prompt so the agent
understands your project's technology stack, conventions, and infrastructure
setup.

```bash
nimbus init              # auto-detect and generate
nimbus init --force      # overwrite existing NIMBUS.md
nimbus init --quiet      # suppress console output
```

---

## Keyboard Shortcuts (TUI)

| Shortcut      | Action                                        |
| ------------- | --------------------------------------------- |
| **Tab**       | Cycle modes (Plan -> Build -> Deploy -> Plan) |
| **Ctrl+C**    | Interrupt current operation or exit           |
| **Escape**    | Cancel current operation                      |
| **Up / Down** | Browse input history                          |
| **Enter**     | Send message                                  |
| `/mode`       | Switch mode via slash command                 |
| `/clear`      | Clear the conversation                        |
| `/compact`    | Manually trigger context compaction           |
| `/help`       | Show available slash commands                 |

---

## Development

### Prerequisites

- [Bun](https://bun.sh/) v1.0 or higher
- Git

### Setup

```bash
git clone https://github.com/the-ai-project-co/nimbus.git
cd nimbus
bun install
```

### Run from source

```bash
# Run directly
bun src/nimbus.ts

# Run with arguments
bun src/nimbus.ts --help
bun src/nimbus.ts chat
bun src/nimbus.ts ask "explain this project"

# Or use the npm script
bun run nimbus -- --help
```

### Test

```bash
# Run all tests (510+ tests)
bun test src/__tests__/

# Run with coverage
bun test src/__tests__/ --coverage

# Watch mode
bun test src/__tests__/ --watch
```

### Lint and format

```bash
bun run lint
bun run format
bun run type-check
```

### Build

```bash
# Build standalone binary for current platform
bun src/build.ts

# Build for all platforms
bun src/build.ts --all

# Or use the shell script
./scripts/build-binary.sh
```

The binary is output to `dist/nimbus` (~68 MB, bundles the Bun runtime).

---

## Architecture

Nimbus is a single embedded binary built with [Bun](https://bun.sh/). All
functionality runs in-process -- there are no HTTP microservices, no Docker
containers, and no external orchestrators. The entire application is a single
TypeScript process that manages LLM routing, tool execution, state persistence,
and the TUI.

```
src/
  nimbus.ts          Entry point (shebang: #!/usr/bin/env bun)
  cli.ts             CLI command router
  app.ts             App lifecycle (lazy DB + LLM router init)
  version.ts         Version and build date constants

  agent/             Agent loop, system prompt, permissions, modes, subagents
  llm/               LLM router, 11+ providers, model aliases, cost calculator
  tools/             Tool implementations and schemas (11 standard + 9 DevOps)
  state/             SQLite WAL database (16 tables at ~/.nimbus/nimbus.db)
  ui/                Ink/React TUI components (8 components)
  commands/          CLI command implementations

  engine/            Planner, executor, orchestrator, verifier, safety, drift, cost
  generator/         Terraform, Kubernetes, Helm generators with best practices
  enterprise/        Auth, teams, billing, audit
  auth/              Authentication (OAuth, SSO, credential store)
  hooks/             Pre/post tool-use hooks (YAML config)
  snapshots/         Git write-tree undo/redo
  audit/             Security scanner, compliance checker, cost tracker, activity log
  lsp/               Language server protocol (6 languages: TS, Go, Python, HCL, YAML, Docker)
  sessions/          Multi-session management with conflict detection
  sharing/           Session sharing (URL-safe IDs, 30-day TTL)
  mcp/               MCP client (JSON-RPC over stdio/HTTP)
  cli/               Non-interactive run, serve, web, init commands
  compat/            Runtime compatibility layer (Bun / Node.js)
  context/           Context database for long-term memory
  watcher/           Filesystem watcher for live file tracking

  build.ts           Binary build script
  __tests__/         510+ tests
```

### Key design decisions

- **Single process** -- No IPC overhead. LLM calls, tool execution, and state
  writes all happen in the same event loop.
- **SQLite with WAL** -- All state (sessions, usage, audit, config, sharing) is
  stored in a single SQLite database at `~/.nimbus/nimbus.db` using WAL mode for
  concurrent read/write.
- **Streaming-first** -- The agent loop streams LLM responses token-by-token
  through the TUI. Tool calls appear inline as they execute.
- **Progressive trust** -- The three-mode system (Plan/Build/Deploy) combined
  with the 4-tier permission engine ensures that destructive operations always
  require explicit approval.
- **Provider fallback** -- The LLM router tries providers in order with circuit
  breakers, exponential backoff, and automatic failover.

---

## License

[MIT](LICENSE)

---

## Links

- [npm Package](https://www.npmjs.com/package/@nimbus-ai/cli)
- [GitHub](https://github.com/the-ai-project-co/nimbus)
- [Issues](https://github.com/the-ai-project-co/nimbus/issues)
- [Releases](https://github.com/the-ai-project-co/nimbus/releases)
