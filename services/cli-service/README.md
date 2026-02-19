# Nimbus CLI

[![npm version](https://img.shields.io/npm/v/@nimbus-cli/nimbus.svg)](https://www.npmjs.com/package/@nimbus-cli/nimbus)
[![license](https://img.shields.io/npm/l/@nimbus-cli/nimbus.svg)](https://github.com/the-ai-project-co/nimbus/blob/main/LICENSE)

AI-powered infrastructure assistant for Terraform, Kubernetes, Helm, Git, and cloud operations. Nimbus brings conversational AI to your DevOps workflow, helping you generate, manage, and troubleshoot infrastructure from the command line.

## Prerequisites

Nimbus requires the [Bun](https://bun.sh) runtime (>= 1.0). The npm launcher will
detect Bun automatically and provide installation instructions if it is missing.

```bash
# Install Bun (if you don't already have it)
curl -fsSL https://bun.sh/install | bash
```

## Installation

### npm (recommended)

```bash
npm install -g @nimbus-cli/nimbus
```

Or run without installing:

```bash
npx @nimbus-cli/nimbus --help
```

### Homebrew (macOS / Linux)

```bash
brew tap the-ai-project-co/tap
brew install nimbus
```

### Binary download

Pre-built standalone binaries for macOS, Linux, and Windows are available on the
[GitHub Releases](https://github.com/the-ai-project-co/nimbus/releases) page.
Standalone binaries bundle Bun internally, so no extra runtime is needed.

## Quick Start

```bash
# Set up authentication and LLM provider
nimbus login

# Check your environment
nimbus doctor

# Initialize a workspace in your project
nimbus init

# Start an interactive AI chat session
nimbus chat

# Generate Terraform from existing AWS infrastructure
nimbus generate terraform

# Ask a one-off question
nimbus ask "How do I set up an S3 bucket with versioning?"
```

## Commands

### Chat and AI

| Command | Description |
|---------|-------------|
| `nimbus chat` | Interactive AI chat session |
| `nimbus chat -m "..."` | Send a single message |
| `nimbus ask "question"` | Quick question and answer |
| `nimbus explain <file>` | Explain code or infrastructure |
| `nimbus fix <error>` | AI-assisted error fixing |

### Infrastructure Generation

| Command | Description |
|---------|-------------|
| `nimbus generate terraform` | AI-driven Terraform generation wizard |
| `nimbus generate k8s` | Generate Kubernetes manifests |
| `nimbus generate helm` | Generate Helm values files |
| `nimbus aws discover` | Discover AWS infrastructure resources |
| `nimbus aws terraform` | Generate Terraform from AWS resources |

### Infrastructure Tools

| Command | Description |
|---------|-------------|
| `nimbus tf <cmd>` | Terraform operations (init, plan, apply, validate, destroy, fmt) |
| `nimbus k8s <cmd>` | Kubernetes operations (get, apply, delete, logs, describe, scale) |
| `nimbus helm <cmd>` | Helm operations (list, install, upgrade, uninstall, rollback) |
| `nimbus git <cmd>` | Git operations (status, add, commit, push, pull, log, merge) |
| `nimbus fs <cmd>` | File system operations (list, tree, search, read, write, diff) |

### Cloud Providers

| Command | Description |
|---------|-------------|
| `nimbus aws <service> <action>` | AWS operations (ec2, s3, rds, lambda, iam, vpc) |
| `nimbus azure <service> <action>` | Azure operations (vm, storage, aks, functions) |
| `nimbus gcp <service> <action>` | GCP operations (compute, storage, gke, functions, iam) |

### Cost and Drift

| Command | Description |
|---------|-------------|
| `nimbus cost estimate` | Estimate infrastructure costs |
| `nimbus cost history` | View cost history |
| `nimbus drift detect` | Detect infrastructure drift |
| `nimbus drift fix` | Remediate detected drift |

### Utilities

| Command | Description |
|---------|-------------|
| `nimbus doctor` | Run diagnostic checks on your environment |
| `nimbus config` | View and manage configuration |
| `nimbus history` | View command history |
| `nimbus version` | Show version information |
| `nimbus help` | Show help message |

Use `nimbus help <command>` for detailed help on any command.

## Configuration

Nimbus stores configuration in `~/.nimbus/config.yaml`. You can manage it with:

```bash
# Initialize configuration interactively
nimbus config init

# Set a value
nimbus config set llm.temperature 0.5

# Get a value
nimbus config get llm.temperature

# List all configuration
nimbus config list
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CORE_ENGINE_SERVICE_URL` | Core engine service URL | `http://localhost:3001` |
| `LLM_SERVICE_URL` | LLM service URL | `http://localhost:3002` |
| `ANTHROPIC_API_KEY` | Anthropic API key | - |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `GOOGLE_API_KEY` | Google AI API key | - |

## Architecture

The Nimbus CLI is a lightweight client that connects to Nimbus backend services.
When installed via npm, you get the CLI only. The CLI communicates with backend
services over HTTP and WebSocket.

For local development or self-hosted deployments, you can run the full
microservices stack. See the
[main repository](https://github.com/the-ai-project-co/nimbus) for details.

## Requirements

- **Bun >= 1.0** (required runtime)
- Node.js >= 18 (needed only for the npm launcher; Bun handles execution)
- For Terraform commands: `terraform` CLI installed
- For Kubernetes commands: `kubectl` CLI installed
- For Helm commands: `helm` CLI installed
- For Git commands: `git` CLI installed
- For AWS commands: `aws` CLI installed and configured

Run `nimbus doctor` to verify your environment.

## Telemetry

Nimbus includes opt-in anonymous usage telemetry to help improve the product.
It is disabled by default.

```bash
# Enable telemetry
nimbus config telemetry enable

# Disable telemetry
nimbus config telemetry disable

# Check status
nimbus config telemetry status
```

## License

[MIT](https://github.com/the-ai-project-co/nimbus/blob/main/LICENSE)
