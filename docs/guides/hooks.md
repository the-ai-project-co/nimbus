---
title: Hooks & Extensibility
---

# Hooks & Extensibility

## Hooks

Hooks let you run shell commands automatically in response to agent events — before a tool runs, after it completes, or when a permission request is raised. This enables auditing, alerting, policy enforcement, and custom workflows without modifying Nimbus itself.

### Setup

Create `.nimbus/hooks.yaml` in your project directory (project-level) or `~/.nimbus/hooks.yaml` (global):

```yaml
hooks:
  PreToolUse:
    - match: "terraform"
      command: "echo '[nimbus] Running Terraform at $(date)' >> ~/.nimbus/audit.log"
      timeout: 5000

  PostToolUse:
    - match: ".*"
      command: "~/.nimbus/scripts/notify.sh {{tool}} {{exit_code}}"
      timeout: 10000

  PermissionRequest:
    - match: "kubectl.*delete"
      command: "~/.nimbus/scripts/slack-alert.sh 'Nimbus wants to delete: {{tool}}'"
      timeout: 5000
```

### Hook events

| Event              | When it fires                                        | Blocking?   |
|--------------------|------------------------------------------------------|-------------|
| `PreToolUse`       | Before a tool call executes                          | Yes — non-zero exit code blocks the tool |
| `PostToolUse`      | After a tool call completes (success or error)       | No          |
| `PermissionRequest`| When the permission engine pauses for user approval  | No          |

### Template variables

Available in the `command` string:

| Variable       | Value                                      |
|----------------|--------------------------------------------|
| `{{tool}}`     | Tool name (e.g. `terraform`, `kubectl`)    |
| `{{action}}`   | Tool action (e.g. `apply`, `delete`)       |
| `{{exit_code}}`| Exit code of the tool (PostToolUse only)   |
| `{{input}}`    | JSON-encoded tool input                    |
| `{{session}}`  | Current session ID                         |

### Execution model

- Each hook runs in its own process group.
- The `timeout` field (milliseconds, default: 30000) kills the process group if exceeded.
- `PreToolUse` hooks that exit with a non-zero code **block** the tool from executing. The agent receives a synthetic `"Blocked by hook"` result and continues the loop.
- Multiple hooks can match the same event — all matching hooks run in order.

### Example: Audit log for all destructive operations

```yaml
hooks:
  PreToolUse:
    - match: "terraform.*(apply|destroy)"
      command: |
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) DESTRUCTIVE {{tool}} {{action}} session={{session}}" >> ~/.nimbus/destructive.log
      timeout: 2000

  PermissionRequest:
    - match: ".*"
      command: |
        curl -s -X POST "$SLACK_WEBHOOK" \
          -H "Content-Type: application/json" \
          -d "{\"text\": \"Nimbus permission request: {{tool}} {{action}}\"}"
      timeout: 5000
```

### Example: Block production destroys

```yaml
hooks:
  PreToolUse:
    - match: "terraform.*destroy"
      command: |
        if echo "{{input}}" | grep -q '"workdir":.*prod'; then
          echo "Blocked: terraform destroy is not allowed in production" >&2
          exit 1
        fi
      timeout: 3000
```

---

## NIMBUS.md Format

`NIMBUS.md` is a Markdown file injected into every agent session as persistent project context. It tells the agent about your infrastructure, conventions, and preferences.

### Auto-generated structure

Running `nimbus init` produces a file like this:

```markdown
# NIMBUS.md

## Project
- **Type**: TypeScript / Node.js
- **Package manager**: npm
- **Test framework**: vitest

## Infrastructure
- **Terraform**: workspaces: default, staging, prod
- **Kubernetes**: contexts: prod-cluster, staging-cluster
- **Helm releases**: nginx-ingress, cert-manager, my-app
- **Docker**: Dockerfile present

## Cloud
- **AWS**: account 123456789012, region us-east-1
- **GCP**: project my-project-id

## Repository
- **Branch**: main
- **Remote**: github.com/my-org/my-repo
```

### Special sections recognized by Nimbus

```markdown
## Notifications
slack_webhook: https://hooks.slack.com/services/T.../B.../...
pagerduty_key: ...

## Terraform
workspace: staging

## Kubernetes
context: staging-cluster
namespace: my-namespace

## Team
owner: platform-team
oncall: @alice, @bob
```

### Validation

Nimbus validates `NIMBUS.md` on load and warns about:

- Unclosed code fences
- Invalid or duplicate headers
- File size > 50KB

Use `/init` in the TUI to regenerate the file. A diff is shown when re-running `nimbus init` on an existing `NIMBUS.md`.

### Persistent notes

Use `/remember <note>` in the TUI to append context without editing the file:

```
/remember always use the staging workspace for plans
/remember prod cluster is read-only — no kubectl apply
```

---

## MCP Plugins

MCP (Model Context Protocol) extends Nimbus with external tools from any compliant server. See [Configuration → MCP Servers](configuration.md#mcp-servers) for the server setup format.

### Plugin management

```bash
nimbus plugin install <name>      # install from npm or registry
nimbus plugin list                 # list installed plugins
nimbus plugin uninstall <name>    # remove a plugin
```

Or from the TUI:

```
/plugin install @modelcontextprotocol/server-github
/plugin list
/plugin uninstall server-github
```

Installed plugins are registered in `~/.nimbus/mcp.json` automatically.

### Writing a custom MCP server

Any process that speaks the MCP JSON-RPC protocol over stdio can be used as a Nimbus tool server. Nimbus connects via the `command` field in `mcp.json` and auto-converts the server's tool schemas to its internal Zod format.

---

## Web UI & HTTP API

```bash
nimbus serve     # start HTTP API on port 6001 (Elysia, SSE streaming)
nimbus web       # start API + open browser to http://localhost:6001/nimbus
```

The HTTP API exposes 10 endpoints including:
- `POST /api/chat` — streaming SSE chat
- `GET /api/sessions` — session list
- `GET /api/share/:id` — shared session viewer
- `WS /ws/share/:id` — live session sharing (WebSocket)

Basic auth is enabled when `NIMBUS_API_TOKEN` is set.

---

## Shell Completions

```bash
nimbus completions install    # auto-detect shell and install
nimbus completions bash       # print bash completion script
nimbus completions zsh        # print zsh completion script
nimbus completions fish       # print fish completion script
```

The installer writes to `~/.bash_completion.d/nimbus`, `~/.zsh/completions/_nimbus`, or `~/.config/fish/completions/nimbus.fish` depending on your shell. Source your shell config or open a new terminal to activate.
