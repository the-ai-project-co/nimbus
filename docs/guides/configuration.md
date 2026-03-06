---
title: Configuration & Providers
---

# Configuration & Providers

## LLM Providers

Nimbus supports 11+ LLM providers. Set your API key via environment variable or run `nimbus login` for the interactive wizard.

| Provider     | Environment Variable(s)                   | Notes                                                  |
|--------------|-------------------------------------------|--------------------------------------------------------|
| Anthropic    | `ANTHROPIC_API_KEY`                       | Claude models (Sonnet, Opus, Haiku). Default provider. |
| OpenAI       | `OPENAI_API_KEY`                          | GPT-4o, GPT-4, GPT-3.5                                 |
| Google       | `GOOGLE_API_KEY`                          | Gemini models                                          |
| AWS Bedrock  | `AWS_REGION` + IAM credentials            | Claude, Llama, and others via AWS                      |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` + endpoint         | Azure-hosted GPT-4 and Claude                          |
| Ollama       | `OLLAMA_BASE_URL` (optional)              | Local models, no API key needed                        |
| Groq         | `GROQ_API_KEY`                            | Fast inference (Llama, Mixtral)                        |
| DeepSeek     | `DEEPSEEK_API_KEY`                        | DeepSeek models                                        |
| OpenRouter   | `OPENROUTER_API_KEY`                      | Multi-model proxy, 100+ models                         |
| Together AI  | `TOGETHER_API_KEY`                        | Llama, Mixtral, and more                               |
| Fireworks AI | `FIREWORKS_API_KEY`                       | Fast open-source model inference                       |
| Perplexity   | `PERPLEXITY_API_KEY`                      | Online search-augmented models                         |

Any OpenAI-compatible endpoint can be added via the `OpenAICompatibleProvider` class.

### Model aliases

```bash
nimbus chat --model sonnet    # claude-sonnet-4-20250514
nimbus chat --model opus      # claude-opus-4-20250514
nimbus chat --model gpt4o     # gpt-4o
nimbus chat --model gemini    # gemini-pro
```

### Cost optimization

When `ENABLE_COST_OPTIMIZATION=true`, the router selects cheaper models for simple tasks (summarization, classification) and more capable models for complex ones (code generation, planning). Circuit breaking with exponential backoff handles provider failures automatically.

### Credential storage

Credentials are stored in `~/.nimbus/credentials.json`. The router checks stored credentials first, then falls back to environment variables.

```bash
nimbus login           # interactive wizard
nimbus logout          # remove stored credentials
nimbus auth-refresh    # refresh cloud credentials (AWS SSO, GCP, Azure)
```

---

## Config Profiles

Profiles let you switch between named sets of model, mode, and tool permission settings.

```bash
nimbus profile <name>          # load a named profile
nimbus profile list            # list all profiles
```

Profiles are stored as JSON files in `~/.nimbus/profiles/`. Example profile:

```json
{
  "model": "claude-sonnet-4-20250514",
  "mode": "build",
  "autoApprove": ["read_file", "glob", "grep"]
}
```

In the TUI, use `/profile <name>` to switch profiles without leaving the session.

---

## Project Configuration (NIMBUS.md)

`nimbus init` generates a `NIMBUS.md` file that is injected into every agent session as project context. The agent uses it to give better, workspace-aware responses.

```bash
nimbus init              # auto-detect and generate
nimbus init --force      # overwrite existing NIMBUS.md
nimbus init --quiet      # suppress console output
```

Nimbus auto-detects:

- **Project type** — TypeScript, JavaScript, Go, Python, Rust, Java
- **Infrastructure tools** — Terraform workspaces, Kubernetes contexts, Helm releases, Docker setup, CI/CD config
- **Cloud providers** — AWS accounts/regions, GCP projects, Azure subscriptions
- **Package manager** — npm, yarn, pnpm, bun
- **Test framework** — jest, vitest, mocha, pytest, go test, cargo test
- **Repository status** — current branch, recent commits

If no `NIMBUS.md` exists when you start a session and Nimbus detects infrastructure files (`*.tf`, `Chart.yaml`, `docker-compose.yml`), it auto-generates one and shows a banner in the TUI.

### NIMBUS.md sections

Nimbus recognizes the following special sections in `NIMBUS.md`:

```markdown
## Notifications
slack_webhook: https://hooks.slack.com/services/...

## Terraform
workspace: staging

## Kubernetes
context: prod-cluster
namespace: default
```

Use `/remember <note>` in the TUI to append persistent notes to `NIMBUS.md` without editing it manually.

---

## MCP Servers

Configure MCP (Model Context Protocol) servers in `.nimbus/mcp.json` (project-level) or `~/.nimbus/mcp.json` (global):

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

Install MCP plugins from the TUI with `/plugin install <name>` or via CLI:

```bash
nimbus plugin install <name>
nimbus plugin list
nimbus plugin uninstall <name>
```

---

## Environment Variables — Full Reference

| Variable                    | Description                                          |
|-----------------------------|------------------------------------------------------|
| `ANTHROPIC_API_KEY`         | Anthropic API key                                    |
| `OPENAI_API_KEY`            | OpenAI API key                                       |
| `GOOGLE_API_KEY`            | Google AI (Gemini) API key                           |
| `AWS_ACCESS_KEY_ID`         | AWS credential (used with `AWS_SECRET_ACCESS_KEY`)   |
| `AWS_REGION`                | AWS region for Bedrock                               |
| `AZURE_OPENAI_API_KEY`      | Azure OpenAI API key                                 |
| `GROQ_API_KEY`              | Groq API key                                         |
| `DEEPSEEK_API_KEY`          | DeepSeek API key                                     |
| `OPENROUTER_API_KEY`        | OpenRouter API key                                   |
| `TOGETHER_API_KEY`          | Together AI API key                                  |
| `FIREWORKS_API_KEY`         | Fireworks AI API key                                 |
| `PERPLEXITY_API_KEY`        | Perplexity API key                                   |
| `OLLAMA_BASE_URL`           | Ollama server URL (default: `http://localhost:11434`)|
| `GITLAB_TOKEN`              | GitLab CI pipeline access                            |
| `CIRCLECI_TOKEN`            | CircleCI pipeline access                             |
| `PROMETHEUS_URL`            | Prometheus metrics endpoint                          |
| `GRAFANA_URL`               | Grafana dashboard URL                                |
| `GRAFANA_TOKEN`             | Grafana API token                                    |
| `DD_API_KEY`                | Datadog metrics/alerts API key                       |
| `PD_API_KEY`                | PagerDuty incident management key                    |
| `OPSGENIE_API_KEY`          | Opsgenie alert management key                        |
| `ENABLE_COST_OPTIMIZATION`  | Set to `true` to enable smart model routing          |
| `NIMBUS_DB_PATH`            | Override default SQLite path (`~/.nimbus/nimbus.db`) |
