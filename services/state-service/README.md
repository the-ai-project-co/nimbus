# State Service

State management and persistence service for Nimbus. Handles configuration, operation history, conversations, artifacts, templates, and cloud credentials.

## Features

- **Configuration Management**: YAML-based configuration with environment variable resolution and Zod validation
- **Operation History**: Track all operations with detailed metadata
- **Conversations**: Store and retrieve chat conversation history
- **Artifacts**: Manage generated code, configurations, and templates
- **Templates**: User-saved templates for Terraform, Kubernetes, etc.
- **Credentials Management**: Integrate with AWS, GCP, and Azure credentials
- **SQLite Storage**: Persistent storage with automatic schema initialization
- **Memory Storage**: In-memory adapter for testing

## Installation

```bash
cd services/state-service
bun install
```

## Configuration

Create a `.env` file based on `.env.example`:

```bash
# State Service Configuration
PORT=3011
LOG_LEVEL=info

# Database
DATABASE_PATH=~/.nimbus/nimbus.db
DATABASE_TYPE=sqlite

# Config File
CONFIG_PATH=~/.nimbus/config.yaml

# Storage
STORAGE_TYPE=sqlite  # sqlite or file or memory
```

## Running

```bash
# Development mode with auto-reload
bun dev

# Production mode
bun start

# Build
bun run build
```

## API Routes

### Health Check

- `GET /health` - Service health status

### Configuration

- `GET /api/state/config` - Get all configuration
- `GET /api/state/config/:path` - Get specific config value (e.g., `/api/state/config/llm/defaultProvider`)
- `PUT /api/state/config` - Update configuration (partial update)
- `PUT /api/state/config/:path` - Set specific config value
- `POST /api/state/config/reset` - Reset configuration to defaults

**Example:**
```bash
# Get all config
curl http://localhost:3011/api/state/config

# Get specific value
curl http://localhost:3011/api/state/config/llm/defaultProvider

# Update config
curl -X PUT http://localhost:3011/api/state/config \
  -H "Content-Type: application/json" \
  -d '{"llm": {"defaultProvider": "openai"}}'

# Set specific value
curl -X PUT http://localhost:3011/api/state/config/llm/defaultModel \
  -H "Content-Type: application/json" \
  -d '{"value": "gpt-4o"}'
```

### Operation History

- `GET /api/state/history` - List all operations (supports `?limit=50&offset=0&type=chat`)
- `GET /api/state/history/:id` - Get operation by ID
- `POST /api/state/history` - Save operation

**Example:**
```bash
# List recent operations
curl http://localhost:3011/api/state/history?limit=10

# Filter by type
curl "http://localhost:3011/api/state/history?type=chat&limit=20"

# Save operation
curl -X POST http://localhost:3011/api/state/history \
  -H "Content-Type: application/json" \
  -d '{
    "id": "op-123",
    "type": "chat",
    "command": "nimbus chat",
    "input": "Create a VPC",
    "output": "Generated Terraform code...",
    "status": "success",
    "durationMs": 1500,
    "model": "claude-sonnet-4",
    "tokensUsed": 1200,
    "costUsd": 0.005
  }'
```

### Conversations

- `GET /api/state/conversations` - List all conversations
- `GET /api/state/conversations/:id` - Get conversation by ID
- `POST /api/state/conversations` - Save conversation
- `DELETE /api/state/conversations/:id` - Delete conversation

**Example:**
```bash
# Save conversation
curl -X POST http://localhost:3011/api/state/conversations \
  -H "Content-Type: application/json" \
  -d '{
    "id": "conv-123",
    "title": "VPC Setup Discussion",
    "messages": [
      {"role": "user", "content": "I need a VPC"},
      {"role": "assistant", "content": "I can help with that..."}
    ],
    "model": "claude-sonnet-4"
  }'

# List conversations
curl http://localhost:3011/api/state/conversations

# Get specific conversation
curl http://localhost:3011/api/state/conversations/conv-123
```

### Artifacts

- `GET /api/state/artifacts` - List artifacts (supports `?type=terraform&conversationId=conv-123`)
- `GET /api/state/artifacts/:id` - Get artifact by ID
- `POST /api/state/artifacts` - Save artifact
- `DELETE /api/state/artifacts/:id` - Delete artifact

**Example:**
```bash
# Save artifact
curl -X POST http://localhost:3011/api/state/artifacts \
  -H "Content-Type: application/json" \
  -d '{
    "id": "art-123",
    "conversationId": "conv-123",
    "name": "vpc.tf",
    "type": "terraform",
    "content": "resource \"aws_vpc\" \"main\" { ... }",
    "language": "hcl"
  }'

# List terraform artifacts
curl "http://localhost:3011/api/state/artifacts?type=terraform"

# List artifacts for a conversation
curl "http://localhost:3011/api/state/artifacts?conversationId=conv-123"
```

### Templates

- `GET /api/state/templates` - List templates (supports `?type=terraform`)
- `GET /api/state/templates/:id` - Get template by ID
- `POST /api/state/templates` - Save template
- `DELETE /api/state/templates/:id` - Delete template

**Example:**
```bash
# Save template
curl -X POST http://localhost:3011/api/state/templates \
  -H "Content-Type: application/json" \
  -d '{
    "id": "tpl-123",
    "name": "Basic VPC",
    "type": "terraform",
    "content": "resource \"aws_vpc\" \"{{name}}\" { ... }",
    "variables": {"name": "main"}
  }'

# List all templates
curl http://localhost:3011/api/state/templates

# List by type
curl "http://localhost:3011/api/state/templates?type=kubernetes"
```

### Cloud Credentials

- `GET /api/state/credentials/:provider` - Get credentials for provider (aws, gcp, azure)
- `POST /api/state/credentials/validate/:provider` - Validate credentials

**Example:**
```bash
# Get AWS credentials
curl http://localhost:3011/api/state/credentials/aws

# Get AWS credentials for specific profile
curl "http://localhost:3011/api/state/credentials/aws?profile=production"

# Validate AWS credentials
curl -X POST http://localhost:3011/api/state/credentials/validate/aws

# Get GCP credentials
curl http://localhost:3011/api/state/credentials/gcp

# Get Azure credentials
curl http://localhost:3011/api/state/credentials/azure
```

## Configuration Schema

The configuration file (`~/.nimbus/config.yaml`) supports the following structure:

```yaml
version: "1.0.0"

llm:
  defaultProvider: anthropic  # anthropic, openai, google, ollama
  defaultModel: claude-sonnet-4-20250514
  costOptimization: true
  enableFallback: true
  fallbackProviders:
    - anthropic
    - openai
    - google

persona:
  name: Nimbus AI
  role: DevOps Assistant
  tone: professional  # professional, friendly, technical
  expertise:
    - terraform
    - kubernetes
    - aws
    - gcp
    - azure

safety:
  requireConfirmation: true
  dryRunByDefault: true
  maxCostPerOperation: 10.0
  allowDestructiveOps: false
  restrictedCommands:
    - "rm -rf"
    - "kubectl delete"
    - "terraform destroy"

cloud:
  aws:
    region: us-east-1
    profile: default
  gcp:
    projectId: my-project
  azure:
    subscriptionId: xxx

terraform:
  version: latest
  backend: local  # local, s3, gcs, azurerm
  workingDirectory: ~/.nimbus/terraform
  autoApprove: false
  planTimeout: 300
  applyTimeout: 600

kubernetes:
  kubeconfigPath: ~/.kube/config
  defaultNamespace: default
  helmVersion: latest

ui:
  theme: auto  # light, dark, auto
  editor: vscode
  showCostEstimates: true
  verboseOutput: false
  logLevel: info  # debug, info, warn, error
```

### Environment Variable Resolution

Configuration values support environment variable substitution using `${VAR_NAME}` syntax:

```yaml
cloud:
  aws:
    region: ${AWS_REGION}
    accessKeyId: ${AWS_ACCESS_KEY_ID}
```

## Database Schema

### Operations Table
- Stores operation history with metadata

### Conversations Table
- Stores chat conversations with messages

### Artifacts Table
- Stores generated files and code

### Templates Table
- Stores user-saved templates

### Config Table
- Key-value store for configuration

## Storage Adapters

### SQLite Adapter (Default)
- Persistent storage in SQLite database
- Automatic schema initialization
- Optimized with indexes

### Memory Adapter
- In-memory storage for testing
- No persistence

## Development

### Testing

```bash
bun test
```

### Type Checking

```bash
bun run type-check
```

### Building

```bash
bun run build
```

## Architecture

```
state-service/
├── src/
│   ├── config/          # Configuration management
│   │   ├── schema.ts    # Zod schemas
│   │   └── manager.ts   # Config manager
│   ├── credentials/     # Cloud credentials
│   │   └── manager.ts   # Credentials manager
│   ├── db/              # Database initialization
│   │   ├── init.ts      # DB setup
│   │   └── schema.sql   # SQL schema
│   ├── routes/          # HTTP routes
│   │   ├── config.ts
│   │   ├── history.ts
│   │   ├── conversations.ts
│   │   ├── artifacts.ts
│   │   ├── templates.ts
│   │   └── credentials.ts
│   ├── storage/         # Storage adapters
│   │   ├── sqlite-adapter.ts
│   │   └── memory-adapter.ts
│   ├── server.ts        # HTTP server
│   └── index.ts         # Entry point
└── tests/
```

## Dependencies

- **bun:sqlite** - SQLite database
- **zod** - Schema validation
- **yaml** - YAML parsing
- **@nimbus/shared-types** - Shared type definitions
- **@nimbus/shared-utils** - Logging and utilities

## License

MIT
