# Nimbus

[![npm version](https://img.shields.io/npm/v/@nimbus-ai/cli.svg)](https://www.npmjs.com/package/@nimbus-ai/cli)
[![license](https://img.shields.io/npm/l/nimbus.svg)](https://github.com/the-ai-project-co/nimbus/blob/main/LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/the-ai-project-co/nimbus)](https://github.com/the-ai-project-co/nimbus/releases)
[![CI](https://github.com/the-ai-project-co/nimbus/actions/workflows/ci.yml/badge.svg)](https://github.com/the-ai-project-co/nimbus/actions)

> AI-Powered Cloud Engineering Agent

Nimbus is an intelligent cloud engineering assistant that helps you generate Infrastructure as Code, manage Kubernetes clusters, and interact with cloud providers using natural language. It ships as a single self-contained binary.

## Features

- **IaC Generation** -- Generate Terraform, Kubernetes manifests, and Helm charts from natural language
- **Multi-Provider LLM Support** -- Anthropic, OpenAI, Google, Ollama, OpenRouter, AWS Bedrock, Azure OpenAI
- **70+ CLI Commands** -- Terraform, Kubernetes, Helm, Git, and file system operations
- **Cloud CLI Integration** -- AWS, GCP, Azure operations with credential management
- **Human-in-the-Loop Safety** -- Confirmations for destructive operations
- **Cost Estimation and Drift Detection** -- Track spending and detect configuration drift
- **Project-Aware Context** -- Understands your codebase and infrastructure
- **Interactive TUI** -- Rich terminal UI with Ink/React
- **Web UI** -- Browser-based interface via `nimbus web`
- **Team and Enterprise** -- Teams, billing, audit logs, and usage tracking

## Install

### Bun (recommended — includes rich TUI)

```bash
bun install -g @nimbus-ai/cli
```

### npm

```bash
npm install -g @nimbus-ai/cli
```

### Homebrew (macOS / Linux)

```bash
brew tap astron/tap && brew install nimbus
```

### Shell script (auto-detects best method)

```bash
curl -fsSL https://raw.githubusercontent.com/the-ai-project-co/nimbus/main/scripts/install.sh | bash
```

### Binary download

Pre-built standalone binaries for macOS, Linux, and Windows are available on the
[GitHub Releases](https://github.com/the-ai-project-co/nimbus/releases) page.
Standalone binaries bundle the Bun runtime so no extra dependencies are needed.
Note: binaries use the readline chat interface; install via Bun/npm for the full Ink TUI.

## Quick Start

```bash
# Launch interactive AI chat (first run triggers onboarding)
nimbus

# Or ask a one-off question
nimbus ask "How do I set up an S3 bucket with versioning?"

# Generate Terraform from AI
nimbus generate terraform

# Initialize a workspace in your project
nimbus init

# Check your environment
nimbus doctor

# Start the web UI
nimbus web
```

## Command Highlights

| Category | Commands |
|----------|----------|
| **Chat and AI** | `chat`, `ask`, `explain`, `fix`, `analyze` |
| **Generation** | `generate terraform`, `generate k8s`, `generate helm` |
| **Terraform** | `tf init`, `tf plan`, `tf apply`, `tf validate`, `tf destroy`, `tf fmt`, ... |
| **Kubernetes** | `k8s get`, `k8s apply`, `k8s delete`, `k8s logs`, `k8s scale`, `k8s exec`, ... |
| **Helm** | `helm list`, `helm install`, `helm upgrade`, `helm uninstall`, `helm rollback`, ... |
| **Git** | `git status`, `git add`, `git commit`, `git push`, `git merge`, `git stash`, ... |
| **Cloud Providers** | `aws <service>`, `gcp <service>`, `azure <service>` |
| **GitHub** | `gh pr list`, `gh pr create`, `gh issue list`, `gh issue create`, ... |
| **Cost and Drift** | `cost estimate`, `cost history`, `drift detect`, `drift fix` |
| **Enterprise** | `team`, `billing`, `usage`, `audit` |
| **Server** | `serve`, `web` |

Run `nimbus help` for the full command list, or `nimbus help <command>` for details on any command.

## Architecture

Nimbus is a single embedded binary built with [Bun](https://bun.sh/). All functionality lives in `src/`:

```
src/
├── nimbus.ts          # Entry point (shebang: #!/usr/bin/env bun)
├── cli.ts             # CLI command router
├── app.ts             # App lifecycle (lazy DB + LLM router init)
├── commands/          # 70+ CLI command implementations
├── agent/             # Agent loop, system prompt, permissions, modes, subagents
├── engine/            # Planner, executor, orchestrator, verifier, safety, drift, cost
├── generator/         # Terraform, Kubernetes, Helm generators
├── llm/               # LLM router, 7 providers, model aliases, cost calculator
├── tools/             # Tool implementations (file, git, terraform, k8s, helm, cloud)
├── state/             # SQLite WAL database (16 tables at ~/.nimbus/nimbus.db)
├── enterprise/        # Auth, teams, billing, audit
├── ui/                # Ink/React TUI components
├── utils/             # Logger, analytics, errors, validation, env helpers
├── types/             # Shared type definitions
├── clients/           # Service clients (REST, WebSocket, tools)
├── auth/              # Authentication (OAuth, SSO, credential store)
├── hooks/             # Pre/post tool-use hooks
├── snapshots/         # Git write-tree undo/redo
├── audit/             # Security scanner, compliance checker, cost tracker
├── lsp/               # Language server protocol (6 languages)
├── sessions/          # Multi-session management with conflict detection
├── sharing/           # Session sharing (URL-safe IDs, 30-day TTL)
├── mcp/               # MCP client (JSON-RPC over stdio/HTTP)
├── cli/               # Non-interactive run mode, serve, web, init commands
├── build.ts           # Binary build script
└── __tests__/         # 510+ tests
```

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

### Run

```bash
# Run directly
bun src/nimbus.ts --help

# Or use the npm script
bun run nimbus -- --help
```

### Test

```bash
# Run all tests
bun test src/__tests__/

# Run with coverage
bun test src/__tests__/ --coverage

# Watch mode
bun test src/__tests__/ --watch
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

The binary is output to `dist/nimbus` (~68MB, bundles the Bun runtime).

## License

[MIT](LICENSE)

## Links

- [npm Package](https://www.npmjs.com/package/@nimbus-ai/cli)
- [GitHub](https://github.com/the-ai-project-co/nimbus)
- [Issues](https://github.com/the-ai-project-co/nimbus/issues)
