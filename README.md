# Nimbus

> AI-Powered Cloud Engineering Agent

Nimbus is an intelligent cloud engineering assistant that helps you generate Infrastructure as Code, manage Kubernetes clusters, and interact with cloud providers using natural language.

## 🚀 Features

- **IaC Generation**: Generate Terraform, Kubernetes manifests, and Helm charts
- **Multi-Provider LLM Support**: Anthropic, OpenAI, Google, Ollama, OpenRouter
- **Kubernetes Operations**: kubectl wrapper with AI assistance
- **Cloud CLI Integration**: AWS, GCP, Azure operations
- **Human-in-the-Loop Safety**: Confirmations for destructive operations
- **Project-Aware Context**: Understands your codebase and infrastructure

## 📋 Prerequisites

- [Bun](https://bun.sh/) v1.0 or higher
- Node.js v18+ (for some tools)
- Git
- (Optional) Docker for containerized deployment

## 🛠️ Quick Start

### 1. Setup

```bash
# Clone the repository
git clone https://github.com/the-ai-project-co/nimbus.git
cd nimbus

# Run setup script
./scripts/dev-setup.sh
```

The setup script will:
- Install dependencies
- Create `.env` files
- Initialize the database
- Make scripts executable
- Optionally link the CLI binary

### 2. Configure

Edit `.env` and add your API keys:

```bash
# LLM Provider API Keys
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
GOOGLE_API_KEY=your_key_here

# Cloud Provider Credentials
AWS_PROFILE=default
AWS_REGION=us-east-1
```

### 3. Start Services

```bash
# Start all 12 microservices
bun dev

# Or use the script
./scripts/start-all.sh
```

### 4. Verify

```bash
# Check service health
./scripts/check-health.sh
```

## 🏗️ Architecture

Nimbus uses a **microservices architecture** with 12 independent services:

```
┌─────────────────────────────────────────────────────────┐
│  CLI Service (3000)          Core Engine (3001)         │
│  LLM Service (3002)          Generator (3003)           │
│                                                         │
│  MCP Tools Services:                                    │
│  ├─ Git Tools (3004)         ├─ Terraform (3006)       │
│  ├─ File System (3005)       ├─ Kubernetes (3007)      │
│  ├─ Helm (3008)              ├─ AWS (3009)             │
│  ├─ GitHub (3010)            └─ State (3011)           │
└─────────────────────────────────────────────────────────┘
```

### Services

| Service | Port | Purpose |
|---------|------|---------|
| CLI Service | 3000 | Terminal interface |
| Core Engine | 3001 | Agent orchestration |
| LLM Service | 3002 | Multi-provider LLM abstraction |
| Generator | 3003 | IaC generation |
| Git Tools | 3004 | Git operations |
| File System | 3005 | File operations |
| Terraform Tools | 3006 | Terraform CLI wrapper |
| Kubernetes Tools | 3007 | kubectl wrapper |
| Helm Tools | 3008 | Helm operations |
| AWS Tools | 3009 | AWS CLI operations |
| GitHub Tools | 3010 | PR/Issue management |
| State Service | 3011 | Persistence layer |

## 🧪 Testing

```bash
# Run all tests
bun test

# Run tests with coverage
bun test --coverage

# Run tests for specific service
cd services/state-service
bun test
```

## 📚 Documentation

- [MVP Specification](docs/01-mvp-spec.md)
- [Microservices Architecture](releases/mvp/MICROSERVICES_ARCHITECTURE.md)
- [Implementation Plan](releases/mvp/IMPLEMENTATION_PLAN.md)
- [Workspace Setup Plan](WORKSPACE_SETUP_PLAN.md)

### Team Specifications

- [CLI Team](releases/mvp/cli-team/cli-interface-spec.md)
- [Core Engine Team](releases/mvp/core-engine-team/agent-orchestration-spec.md)
- [LLM Integration Team](releases/mvp/llm-integration-team/llm-abstraction-layer.md)
- [Generator Engine Team](releases/mvp/generator-engine-team/terraform-generator-spec.md)
- [MCP Tools Team](releases/mvp/mcp-tools-team/)
- [Infrastructure Team](releases/mvp/infrastructure-team/state-layer-spec.md)
- [DevRel & QA Team](releases/mvp/devrel-qa-team/testing-documentation-spec.md)

## 🛠️ Development

### Project Structure

```
nimbus/
├── services/           # 12 microservices
├── shared/            # Shared libraries
│   ├── types/         # @nimbus/shared-types
│   ├── utils/         # @nimbus/shared-utils
│   └── clients/       # @nimbus/shared-clients
├── scripts/           # Development scripts
├── tests/             # Integration and E2E tests
├── docs/              # Documentation
└── releases/          # Release specifications
```

### Useful Commands

```bash
# Development
bun dev                         # Start all services
./scripts/check-health.sh       # Check service health
./scripts/clean.sh              # Clean workspace

# Testing
bun test                        # Run tests
bun test --coverage             # Run with coverage
bun test --watch                # Watch mode

# Building
bun run build                   # Build all services
bun run type-check              # Type check all services

# CLI (if linked)
nimbus --help                   # Show help
nimbus chat                     # Start chat mode
nimbus generate terraform       # Generate Terraform
```

### Adding a New Service

Use the service generator script:

```bash
bun scripts/create-service.ts
```

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## 📝 License

[License information to be added]

## 🔗 Links

- [GitHub](https://github.com/the-ai-project-co/nimbus)
- [Documentation](docs/)
- [Issues](https://github.com/the-ai-project-co/nimbus/issues)

---

**Status**: 🚧 MVP Development (Phase 1 - Workspace Setup Complete)
