# Nimbus

[![npm version](https://img.shields.io/npm/v/@build-astron-co/nimbus.svg)](https://www.npmjs.com/package/@build-astron-co/nimbus)
[![license](https://img.shields.io/github/license/the-ai-project-co/nimbus)](https://github.com/the-ai-project-co/nimbus/blob/main/LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/the-ai-project-co/nimbus)](https://github.com/the-ai-project-co/nimbus/releases)
[![CI](https://github.com/the-ai-project-co/nimbus/actions/workflows/ci.yml/badge.svg)](https://github.com/the-ai-project-co/nimbus/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-brightgreen.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-1529%20passing-brightgreen.svg)](https://github.com/the-ai-project-co/nimbus/actions)

> AI-powered DevOps terminal agent — type `nimbus`, get a live infrastructure operator

Nimbus is an intelligent command-line agent purpose-built for DevOps and cloud engineering. Type `nimbus`, describe what you want, and Nimbus plans, validates, and executes across Terraform, Kubernetes, Helm, AWS, GCP, and Azure — all from a single terminal session.

---

## Install

```bash
# npm
npm install -g @build-astron-co/nimbus

# Homebrew
brew tap the-ai-project-co/tap
brew install nimbus

# Shell script (auto-detects best method)
curl -fsSL https://raw.githubusercontent.com/the-ai-project-co/nimbus/main/scripts/install.sh | bash
```

Pre-built standalone binaries (~68 MB, no Node.js required) are on the [Releases](https://github.com/the-ai-project-co/nimbus/releases) page.

---

## Quick Start

```bash
nimbus              # launches onboarding on first run, TUI on subsequent runs
```

1. **First run** — onboarding wizard walks you through provider + API key setup
2. **Initialize your project** — `nimbus init` detects your stack and generates `NIMBUS.md`
3. **Start asking** — describe what you want in natural language

```
"Run terraform plan and show me what will change"
"Check for pod restarts in the production namespace"
"Is there any infrastructure drift in my staging workspace?"
```

If `ANTHROPIC_API_KEY` (or any [supported provider key](docs/guides/configuration.md#llm-providers)) is already set, onboarding is skipped and you go straight to the agent.

---

## Learn More

| Topic | Description |
|---|---|
| [Configuration & Providers](docs/guides/configuration.md) | LLM providers, API keys, config profiles, MCP servers |
| [Hooks & Extensibility](docs/guides/hooks.md) | Hook system, NIMBUS.md format, MCP plugins |
| [CLI Commands](docs/reference/commands.md) | Full CLI command reference with examples |
| [Tools Reference](docs/reference/tools.md) | All 33+ built-in tools with parameters |
| [Architecture](docs/architecture.md) | How Nimbus works internally, component flow, design decisions |

---

## License

[MIT](LICENSE)
