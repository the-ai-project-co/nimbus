# Nimbus MVP Specification

> **Phase 1: Investor Demo Ready**
> **Timeline: Months 1-3 (12 weeks)**
> **Team: 2-3 developers**
>
> **Architecture**: Microservices with Bun Runtime
> **Package Manager**: Bun (v1.0+)
> **Communication**: REST APIs + WebSocket Streaming
> **Deployment**: Local (Bun) → Staging (Docker Compose) → Production (Kubernetes)
> **Services**: 12 independent microservices
>
> _Last Updated: January 2026 | Version 2.0_

---

## Executive Summary

The MVP establishes Nimbus as a credible, working product that demonstrates the core value proposition to investors. It focuses on three non-negotiable capabilities: IaC Generation, Kubernetes Operations, and Cloud CLI Integration - all unified under a polished terminal experience with human-in-the-loop safety.

### MVP Goals
1. Working demo for investor presentations
2. Core user journeys fully functional
3. Polished terminal UX
4. Model-agnostic LLM support
5. Safety-first operations

---

## Feature Specification

### 1. CLI Interface & Core Commands

#### 1.1 Command Structure

```bash
nimbus <command> [subcommand] [options]

# Core Commands
nimbus chat                    # Interactive chat mode
nimbus generate <type>         # Generate IaC (terraform, k8s, helm)
nimbus plan <action>           # Plan an operation
nimbus apply                   # Execute planned operation
nimbus history                 # View operation history
nimbus config                  # Configuration management

# Quick Actions
nimbus ask "<question>"        # One-shot question
nimbus explain <file>          # Explain a file
nimbus fix <file>              # Fix issues in a file

# Utility
nimbus init                    # Initialize in current directory
nimbus auth                    # Manage cloud credentials
nimbus doctor                  # Check system health
nimbus version                 # Show version
nimbus help                    # Show help
```

#### 1.2 Interactive Chat Mode

```bash
$ nimbus chat

  ╭─────────────────────────────────────────────────────────╮
  │  Nimbus v0.1.0 - Cloud Engineering Agent                │
  │  Model: claude-sonnet-4-20250514 | Persona: Professional     │
  │  Type 'help' for commands, 'exit' to quit              │
  ╰─────────────────────────────────────────────────────────╯

  You: Create a VPC with 3 availability zones for production

  Nimbus: I'll help you create a production VPC. Let me gather
          some details:

          ┌─ Configuration ──────────────────────────────────┐
          │ Cloud Provider: AWS                              │
          │ Region: us-east-1                                │
          │ VPC CIDR: 10.0.0.0/16                           │
          │ Availability Zones: 3                            │
          │ Public Subnets: Yes                              │
          │ Private Subnets: Yes                             │
          │ NAT Gateway: Yes (HA)                            │
          └──────────────────────────────────────────────────┘

          [Generate Terraform] [Modify Config] [Cancel]
```

#### 1.3 User Stories

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| US-001 | As a user, I want to start a chat session to interact with Nimbus | Chat mode launches, accepts input, streams responses |
| US-002 | As a user, I want to ask one-off questions without entering chat mode | `nimbus ask` returns answer and exits |
| US-003 | As a user, I want to see my command history | `nimbus history` shows past operations |
| US-004 | As a user, I want to configure my preferred LLM provider | `nimbus config` allows provider selection |
| US-005 | As a user, I want to see a loading indicator while Nimbus thinks | Spinner/progress shown during LLM calls |

---

### 2. IaC Generation (Terraform)

#### 2.1 Generation Modes

**Mode A: Questionnaire Flow**
```bash
$ nimbus generate terraform

  ╭─ Terraform Infrastructure Generator ─────────────────────╮
  │                                                          │
  │  Step 1 of 6: Cloud Provider                             │
  │                                                          │
  │  Which cloud provider?                                   │
  │                                                          │
  │  › AWS                                                   │
  │    Google Cloud Platform                                 │
  │    Microsoft Azure                                       │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

**Mode B: Conversational**
```bash
$ nimbus chat
You: Create Terraform for an EKS cluster with 3 nodes,
     t3.large instances, in us-west-2

Nimbus: I'll generate a production-ready EKS configuration.

        Generating...

        ✓ modules/vpc/main.tf
        ✓ modules/vpc/variables.tf
        ✓ modules/eks/main.tf
        ✓ modules/eks/variables.tf
        ✓ modules/eks/outputs.tf
        ✓ main.tf
        ✓ variables.tf
        ✓ outputs.tf
        ✓ terraform.tfvars.example
        ✓ README.md

        Files generated in ./infrastructure/

        [View Files] [Apply Now] [Modify]
```

#### 2.2 Generated Structure

```
infrastructure/
├── README.md                    # Setup instructions
├── main.tf                      # Root module
├── variables.tf                 # Input variables
├── outputs.tf                   # Outputs
├── versions.tf                  # Provider versions
├── terraform.tfvars.example     # Example values
├── backend.tf                   # Remote state config
├── modules/
│   ├── vpc/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── eks/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── node-groups.tf
│   └── security/
│       ├── main.tf
│       └── variables.tf
└── environments/
    ├── dev/
    │   ├── main.tf
    │   └── terraform.tfvars
    ├── staging/
    └── prod/
```

#### 2.3 Supported Components (MVP)

| Category | Components |
|----------|------------|
| **Networking** | VPC, Subnets, Security Groups, NAT Gateway, Internet Gateway |
| **Compute** | EC2 (basic), EKS, ECS (Fargate) |
| **Storage** | S3 buckets |
| **Database** | RDS (PostgreSQL, MySQL) |
| **Security** | IAM Roles, IAM Policies, KMS Keys |
| **State** | S3 backend, DynamoDB locking |

#### 2.4 Best Practices (Auto-Applied)

| Practice | Implementation |
|----------|----------------|
| Remote State | S3 + DynamoDB locking |
| Version Pinning | Provider & Terraform versions locked |
| Tagging | Consistent resource tagging |
| Encryption | KMS encryption enabled by default |
| Least Privilege | Minimal IAM permissions |
| Multi-AZ | High availability configurations |
| Naming | Consistent naming conventions |

#### 2.5 User Stories

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| US-010 | As a user, I want to generate Terraform via questionnaire | Step-by-step wizard generates valid Terraform |
| US-011 | As a user, I want to describe infrastructure in natural language | Conversational input generates Terraform |
| US-012 | As a user, I want generated code to follow best practices | Generated code passes tflint, checkov |
| US-013 | As a user, I want to customize generated infrastructure | Modify config before generation |
| US-014 | As a user, I want environment separation (dev/staging/prod) | Separate tfvars per environment |

---

### 3. Kubernetes Operations

#### 3.1 Supported Operations

```bash
# Resource Discovery
nimbus k8s list pods -n default
nimbus k8s get deployment nginx
nimbus k8s describe service api

# Logs & Debugging
nimbus k8s logs pod/nginx-xxx
nimbus k8s exec pod/nginx-xxx -- /bin/sh
nimbus k8s events -n production

# Resource Management (with approval)
nimbus k8s apply -f deployment.yaml      # Requires confirmation
nimbus k8s delete pod nginx-xxx          # Requires confirmation
nimbus k8s scale deployment nginx --replicas=5

# Generation
nimbus k8s generate deployment           # Interactive generator
nimbus k8s generate service
nimbus k8s generate ingress

# Conversational
nimbus chat
You: Show me all pods that are not running in production namespace
You: Create a deployment for redis with 3 replicas
You: Why is my pod crashlooping?
```

#### 3.2 Helm Operations

```bash
# Repository Management
nimbus helm repo add bitnami https://charts.bitnami.com/bitnami
nimbus helm repo update

# Chart Operations
nimbus helm search redis
nimbus helm show values bitnami/redis

# Installation (with approval)
nimbus helm install redis bitnami/redis --dry-run   # Preview
nimbus helm install redis bitnami/redis             # Requires confirmation
nimbus helm upgrade redis bitnami/redis
nimbus helm rollback redis 1

# Conversational
You: Install nginx ingress controller with custom values
You: What Helm releases are installed in the cluster?
You: Rollback the redis release to the previous version
```

#### 3.3 Safety Controls

| Operation Type | Safety Measure |
|----------------|----------------|
| **Read** (get, list, describe, logs) | No confirmation needed |
| **Create** (apply, install) | Preview + confirmation |
| **Update** (apply, upgrade, scale) | Diff + confirmation |
| **Delete** (delete, uninstall) | Explicit confirmation with resource name |

```bash
$ nimbus k8s delete deployment nginx

  ╭─ Confirmation Required ──────────────────────────────────╮
  │                                                          │
  │  ⚠️  DELETE OPERATION                                    │
  │                                                          │
  │  Resource: deployment/nginx                              │
  │  Namespace: default                                      │
  │  Cluster: production-eks                                 │
  │                                                          │
  │  This will permanently delete the resource.              │
  │                                                          │
  │  Type 'nginx' to confirm deletion:                       │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

#### 3.4 User Stories

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| US-020 | As a user, I want to query K8s resources naturally | "Show me failing pods" returns relevant pods |
| US-021 | As a user, I want to generate K8s manifests | Interactive generator creates valid YAML |
| US-022 | As a user, I want to see diffs before applying changes | Diff shown before confirmation |
| US-023 | As a user, I want to debug pod issues with AI help | AI analyzes logs, suggests fixes |
| US-024 | As a user, I want to manage Helm releases | Install, upgrade, rollback work correctly |

---

### 4. Cloud CLI Integration

#### 4.1 Supported Providers (MVP)

| Provider | CLI | Supported Operations |
|----------|-----|---------------------|
| **AWS** | aws | EC2, S3, IAM, EKS, RDS, CloudWatch |
| **GCP** | gcloud | Compute, Storage, IAM, GKE, Cloud SQL |
| **Azure** | az | VMs, Storage, IAM, AKS, Azure SQL |

#### 4.2 AI-Assisted Operations

```bash
$ nimbus chat
You: List all EC2 instances that are stopped in us-east-1

Nimbus: I'll query your AWS account for stopped EC2 instances.

        Running: aws ec2 describe-instances \
                 --region us-east-1 \
                 --filters "Name=instance-state-name,Values=stopped"

        Found 3 stopped instances:

        ┌─────────────────┬──────────────┬─────────────┬──────────┐
        │ Instance ID     │ Name         │ Type        │ Stopped  │
        ├─────────────────┼──────────────┼─────────────┼──────────┤
        │ i-0abc123def    │ dev-server   │ t3.medium   │ 3 days   │
        │ i-0def456ghi    │ test-db      │ t3.large    │ 1 week   │
        │ i-0ghi789jkl    │ staging-api  │ t3.small    │ 2 weeks  │
        └─────────────────┴──────────────┴─────────────┴──────────┘

        [Start All] [Start Selected] [Terminate] [Details]

You: Start dev-server

Nimbus: ⚠️  This will start instance i-0abc123def (dev-server)
        Estimated cost: ~$0.0416/hour ($30/month)

        [Confirm Start] [Cancel]
```

#### 4.3 Credential Management

```bash
$ nimbus auth

  ╭─ Cloud Credentials ──────────────────────────────────────╮
  │                                                          │
  │  AWS                                                     │
  │  └─ Profile: default ✓                                   │
  │     Region: us-east-1                                    │
  │     Account: 123456789012                                │
  │                                                          │
  │  GCP                                                     │
  │  └─ Project: my-project ✓                                │
  │     Region: us-central1                                  │
  │                                                          │
  │  Azure                                                   │
  │  └─ Not configured                                       │
  │     Run: nimbus auth azure                               │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯

$ nimbus auth aws --profile production
$ nimbus auth gcp --project my-prod-project
$ nimbus auth azure --subscription xxx
```

#### 4.4 User Stories

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| US-030 | As a user, I want to query cloud resources naturally | Natural language queries return accurate results |
| US-031 | As a user, I want to manage multiple cloud accounts | Switch between profiles/projects easily |
| US-032 | As a user, I want cost warnings before operations | Cost estimate shown before expensive ops |
| US-033 | As a user, I want to avoid accidental resource deletion | Confirmation required for destructive ops |
| US-034 | As a user, I want to see operation explanations | AI explains what commands do before running |

---

### 5. LLM Provider Support

#### 5.1 Supported Providers (MVP)

| Provider | Models | Setup |
|----------|--------|-------|
| **Anthropic** | Claude Sonnet, Claude Haiku | API key |
| **OpenAI** | GPT-4o, GPT-4o-mini | API key |
| **Google** | Gemini Pro, Gemini Flash | API key |
| **Ollama** | Llama, Mistral, CodeLlama | Local install |
| **OpenRouter** | Multiple models | API key |

#### 5.2 Configuration

```yaml
# ~/.nimbus/config.yaml

llm:
  default_provider: anthropic
  default_model: claude-sonnet-4-20250514

  providers:
    anthropic:
      api_key: ${ANTHROPIC_API_KEY}
      models:
        - claude-sonnet-4-20250514
        - claude-haiku-4-20250514

    openai:
      api_key: ${OPENAI_API_KEY}
      models:
        - gpt-4o
        - gpt-4o-mini

    ollama:
      base_url: http://localhost:11434
      models:
        - llama3.2
        - codellama

  cost_optimization:
    enabled: true
    use_cheap_model_for: [simple_queries, explanations]
    use_expensive_model_for: [code_generation, complex_reasoning]
```

#### 5.3 Model Switching

```bash
# Global default
nimbus config set llm.default_model gpt-4o

# Per-session
nimbus chat --model claude-sonnet-4-20250514
nimbus chat --model ollama/llama3.2

# Interactive switch
$ nimbus chat
You: /model gpt-4o
Switched to gpt-4o
```

---

### 6. Human-in-the-Loop Safety

#### 6.1 Operation Classification

| Category | Examples | Confirmation |
|----------|----------|--------------|
| **Read** | list, get, describe, logs, explain | None |
| **Generate** | generate terraform, create manifests | Preview only |
| **Create** | apply, install, create resource | Yes |
| **Update** | upgrade, scale, modify | Yes + Diff |
| **Delete** | delete, destroy, uninstall | Yes + Type name |

#### 6.2 Dry-Run Mode

```bash
# Global dry-run mode
nimbus config set safety.dry_run true

# Per-command
nimbus k8s apply -f deployment.yaml --dry-run
nimbus helm install redis bitnami/redis --dry-run

# Preview shows:
# - What would be created/changed/deleted
# - Estimated cost impact
# - Potential risks
```

#### 6.3 Auto-Approve (Power Users)

```bash
# Enable for trusted operations
nimbus k8s apply -f deployment.yaml --yes

# Or configure per-operation-type
nimbus config set safety.auto_approve.scale true
nimbus config set safety.auto_approve.delete false  # Never auto-approve deletes
```

---

### 7. Configuration & Personalization

#### 7.1 Config File Structure

```yaml
# ~/.nimbus/config.yaml

# Core Settings
version: 1
telemetry: false  # Opt-in telemetry

# LLM Configuration
llm:
  default_provider: anthropic
  default_model: claude-sonnet-4-20250514

# Persona Settings
persona:
  mode: professional  # professional | assistant | expert
  verbosity: normal   # minimal | normal | detailed

# Safety Settings
safety:
  dry_run: false
  require_confirmation: true
  auto_approve:
    read: true
    generate: true
    create: false
    update: false
    delete: false

# Cloud Defaults
cloud:
  default_provider: aws
  aws:
    default_region: us-east-1
    default_profile: default
  gcp:
    default_project: my-project
    default_region: us-central1

# Terraform Defaults
terraform:
  default_backend: s3
  state_bucket: my-terraform-state
  lock_table: terraform-locks

# Kubernetes Defaults
kubernetes:
  default_context: production-eks
  default_namespace: default

# UI Settings
ui:
  theme: dark
  colors: true
  spinner: dots
```

#### 7.2 Persona Modes

| Mode | Behavior |
|------|----------|
| **Professional** | Concise, direct, minimal explanation |
| **Assistant** | Friendly, explains reasoning, offers alternatives |
| **Expert** | Technical depth, advanced options, power user focus |

---

## Technical Architecture

> **Architecture**: Microservices with Bun Runtime
> **Communication**: REST APIs + WebSocket Streaming
> **Deployment**: Local (Bun) → Staging (Docker Compose) → Production (Kubernetes)

### 8. System Architecture

**Microservices Overview (12 Services)**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CLI Service (Port 3000/3100)                      │
│                        Terminal User Interface                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   Ink UI    │  │   Prompts   │  │  Spinners   │                 │
│  │ (React CLI) │  │  (Inquirer) │  │   (Ora)     │                 │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
│         └────────────────┼────────────────┘                         │
│                          │                                          │
│  ┌───────────────────────▼───────────────────────────────────────┐ │
│  │                    Command Router                              │ │
│  │  chat | generate | plan | apply | history | config | k8s | ... │ │
│  └──────────────────────┬────────────────────────────────────────┘ │
└─────────────────────────┼────────────────────────────────────────────┘
                          │ REST + WebSocket
┌─────────────────────────┼────────────────────────────────────────────┐
│           Core Engine Service (Port 3001/3101)                       │
│                   Agent Orchestration & Execution                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     Agent Orchestrator                       │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐ │   │
│  │  │  Planner  │  │ Executor  │  │ Verifier  │  │  Safety   │ │   │
│  │  │           │  │           │  │           │  │  Manager  │ │   │
│  │  │ - Parse   │  │ - Run     │  │ - Check   │  │           │ │   │
│  │  │ - Plan    │  │ - Stream  │  │ - Validate│  │ - Confirm │ │   │
│  │  │ - Steps   │  │ - Retry   │  │ - Report  │  │ - Audit   │ │   │
│  │  └───────────┘  └───────────┘  └───────────┘  └───────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────┬────────────────────────────────────────────┘
                          │ REST API
        ┌─────────────────┼─────────────────────┐
        │                 │                     │
        v                 v                     v
┌───────────────┐ ┌───────────────────┐ ┌──────────────────┐
│  LLM Service  │ │ Generator Service │ │  State Service   │
│ (Port 3002/   │ │ (Port 3003/3103)  │ │  (Port 3011)     │
│  3102)        │ │  IaC Generation   │ │  Persistence     │
│               │ │                   │ │                  │
│ ┌─────────┐   │ │ ┌─────────────┐   │ │ ┌──────────────┐ │
│ │Anthropic│   │ │ │ Terraform   │   │ │ │ Config       │ │
│ │OpenAI   │   │ │ │ Kubernetes  │   │ │ │ History      │ │
│ │Google   │   │ │ │ Helm        │   │ │ │ Artifacts    │ │
│ │Ollama   │   │ │ │ Templates   │   │ │ │ Credentials  │ │
│ └─────────┘   │ │ └─────────────┘   │ │ └──────────────┘ │
└───────────────┘ └───────────────────┘ └──────────────────┘
                          │
        ┌─────────────────┴──────────────────────────┐
        │                                            │
        v                                            v
┌───────────────────────────────────────┐ ┌────────────────────────┐
│      MCP Tools Services (Ports 3004-3010)                         │
│                                                                   │
│ ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│ │Git Tools   │  │ FS Tools   │  │ Terraform  │  │ K8s Tools  │  │
│ │(Port 3004) │  │(Port 3005) │  │ Tools      │  │(Port 3007) │  │
│ │            │  │            │  │(Port 3006) │  │            │  │
│ │ - clone    │  │ - read     │  │ - init     │  │ - kubectl  │  │
│ │ - commit   │  │ - write    │  │ - plan     │  │ - apply    │  │
│ │ - push     │  │ - search   │  │ - apply    │  │ - logs     │  │
│ └────────────┘  └────────────┘  └────────────┘  └────────────┘  │
│                                                                   │
│ ┌────────────┐  ┌────────────┐  ┌────────────┐                  │
│ │Helm Tools  │  │AWS Tools   │  │GitHub Tools│                  │
│ │(Port 3008) │  │(Port 3009) │  │(Port 3010) │                  │
│ │            │  │            │  │            │                  │
│ │ - install  │  │ - EC2/S3   │  │ - PR/Issue │                  │
│ │ - upgrade  │  │ - IAM      │  │            │                  │
│ │ - rollback │  │            │  │            │                  │
│ └────────────┘  └────────────┘  └────────────┘                  │
└───────────────────────────────────────────────────────────────────┘
```

**Service Communication:**
- **REST APIs**: Synchronous operations (config, commands, queries)
- **WebSocket**: Streaming (LLM responses, generation progress, logs)
- **Service Discovery**: Environment variables (local), Docker DNS (staging), Kubernetes DNS (production)

### 9. Database Schema (SQLite)

```sql
-- Operation History
CREATE TABLE operations (
    id TEXT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    type TEXT NOT NULL,           -- 'chat', 'generate', 'apply', 'k8s', etc.
    command TEXT NOT NULL,        -- Full command executed
    input TEXT,                   -- User input/prompt
    output TEXT,                  -- Result/output
    status TEXT DEFAULT 'success', -- 'success', 'error', 'cancelled'
    duration_ms INTEGER,
    model TEXT,                   -- LLM model used
    tokens_used INTEGER,
    cost_usd REAL,
    metadata TEXT                 -- JSON blob for additional data
);

-- Checkpoints (for resumable operations)
CREATE TABLE checkpoints (
    id TEXT PRIMARY KEY,
    operation_id TEXT REFERENCES operations(id),
    step INTEGER,
    state TEXT,                   -- JSON state blob
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Templates (user-saved)
CREATE TABLE templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,           -- 'terraform', 'k8s', 'helm'
    content TEXT NOT NULL,
    variables TEXT,               -- JSON variables
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

-- Indexes
CREATE INDEX idx_operations_timestamp ON operations(timestamp);
CREATE INDEX idx_operations_type ON operations(type);
CREATE INDEX idx_checkpoints_operation ON checkpoints(operation_id);
```

### 10. API Contracts

#### 10.1 MCP Tool Interface

```typescript
// Tool Definition
interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  handler: (input: unknown) => Promise<ToolResult>;
}

// Tool Result
interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

// Example: Terraform Plan Tool
const terraformPlanTool: MCPTool = {
  name: 'terraform_plan',
  description: 'Run terraform plan and return the execution plan',
  inputSchema: {
    type: 'object',
    properties: {
      directory: { type: 'string', description: 'Terraform directory' },
      varFile: { type: 'string', description: 'Path to tfvars file' },
    },
    required: ['directory'],
  },
  handler: async (input) => {
    // Implementation
  },
};
```

#### 10.2 Generator Interface

```typescript
// Generation Request
interface GenerateRequest {
  type: 'terraform' | 'kubernetes' | 'helm';
  mode: 'questionnaire' | 'conversational';
  input: QuestionnaireAnswers | string;
  options: GenerateOptions;
}

// Generation Result
interface GenerateResult {
  success: boolean;
  files: GeneratedFile[];
  summary: string;
  warnings: string[];
}

interface GeneratedFile {
  path: string;
  content: string;
  type: 'hcl' | 'yaml' | 'json' | 'md';
}
```

---

## Project Structure

> **Architecture**: Microservices with Bun Workspace
> **Package Manager**: Bun (replaces pnpm)
> **Services**: 12 independent deployable services

```
nimbus/
├── services/                      # Microservices (12 services)
│   ├── cli-service/               # CLI Service (Port 3000/3100)
│   │   ├── src/
│   │   │   ├── index.ts           # Entry point
│   │   │   ├── server.ts          # Bun HTTP server (optional)
│   │   │   ├── commands/          # Command implementations
│   │   │   │   ├── chat.ts
│   │   │   │   ├── generate.ts
│   │   │   │   ├── plan.ts
│   │   │   │   ├── apply.ts
│   │   │   │   ├── history.ts
│   │   │   │   ├── config.ts
│   │   │   │   └── k8s/
│   │   │   ├── ui/                # Terminal UI components
│   │   │   │   ├── Chat.tsx
│   │   │   │   ├── Questionnaire.tsx
│   │   │   │   ├── Confirmation.tsx
│   │   │   │   └── Progress.tsx
│   │   │   ├── clients/           # REST clients for backend services
│   │   │   │   ├── core-engine.ts
│   │   │   │   ├── llm.ts
│   │   │   │   ├── generator.ts
│   │   │   │   └── state.ts
│   │   │   └── utils/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   ├── core-engine-service/       # Core Engine (Port 3001/3101)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── server.ts          # Bun HTTP + WebSocket server
│   │   │   ├── routes/
│   │   │   │   ├── health.ts
│   │   │   │   ├── plan.ts
│   │   │   │   ├── execute.ts
│   │   │   │   └── validate.ts
│   │   │   ├── agent/
│   │   │   │   ├── orchestrator.ts
│   │   │   │   ├── planner.ts
│   │   │   │   ├── executor.ts
│   │   │   │   └── verifier.ts
│   │   │   ├── safety/
│   │   │   │   ├── manager.ts
│   │   │   │   └── policies.ts
│   │   │   ├── clients/           # REST clients
│   │   │   │   ├── llm.ts
│   │   │   │   └── mcp-tools.ts
│   │   │   └── types/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   ├── llm-service/               # LLM Service (Port 3002/3102)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── server.ts          # Bun HTTP + WebSocket server
│   │   │   ├── routes/
│   │   │   │   ├── health.ts
│   │   │   │   ├── chat.ts
│   │   │   │   └── models.ts
│   │   │   ├── providers/
│   │   │   │   ├── base.ts
│   │   │   │   ├── anthropic.ts
│   │   │   │   ├── openai.ts
│   │   │   │   ├── google.ts
│   │   │   │   └── ollama.ts
│   │   │   └── websocket.ts       # Streaming
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   ├── generator-service/         # Generator (Port 3003/3103)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── server.ts          # Bun HTTP + WebSocket server
│   │   │   ├── routes/
│   │   │   │   ├── terraform.ts
│   │   │   │   ├── kubernetes.ts
│   │   │   │   └── helm.ts
│   │   │   ├── terraform/
│   │   │   │   └── generator.ts
│   │   │   ├── kubernetes/
│   │   │   │   └── generator.ts
│   │   │   ├── templates/
│   │   │   │   ├── terraform/
│   │   │   │   │   ├── aws/
│   │   │   │   │   ├── gcp/
│   │   │   │   │   └── azure/
│   │   │   │   └── kubernetes/
│   │   │   └── best-practices/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   ├── git-tools-service/         # Git Tools (Port 3004)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── server.ts          # Bun HTTP server
│   │   │   ├── routes/
│   │   │   └── git/               # Git operations
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   ├── fs-tools-service/          # File System Tools (Port 3005)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── server.ts
│   │   │   └── fs/                # File operations
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   ├── terraform-tools-service/   # Terraform Tools (Port 3006)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── server.ts
│   │   │   └── terraform/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   ├── k8s-tools-service/         # Kubernetes Tools (Port 3007)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── server.ts
│   │   │   └── k8s/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   ├── helm-tools-service/        # Helm Tools (Port 3008)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── server.ts
│   │   │   └── helm/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   ├── aws-tools-service/         # AWS Tools (Port 3009)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── server.ts
│   │   │   └── aws/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   ├── github-tools-service/      # GitHub Tools (Port 3010)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── server.ts
│   │   │   └── github/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   └── state-service/             # State Service (Port 3011)
│       ├── src/
│       │   ├── index.ts
│       │   ├── server.ts          # Bun HTTP server
│       │   ├── routes/
│       │   │   ├── health.ts
│       │   │   ├── config.ts
│       │   │   ├── history.ts
│       │   │   ├── artifacts.ts
│       │   │   └── credentials.ts
│       │   ├── storage/
│       │   │   ├── file-adapter.ts
│       │   │   └── sqlite-adapter.ts
│       │   └── db.ts
│       ├── package.json
│       ├── tsconfig.json
│       └── Dockerfile
│
├── shared/                        # Shared workspace libraries
│   ├── types/                     # @nimbus/shared-types
│   │   ├── src/
│   │   │   ├── request.ts
│   │   │   ├── response.ts
│   │   │   ├── plan.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── utils/                     # @nimbus/shared-utils
│   │   ├── src/
│   │   │   ├── logger.ts
│   │   │   ├── errors.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── clients/                   # @nimbus/shared-clients
│       ├── src/
│       │   ├── rest-client.ts
│       │   ├── ws-client.ts
│       │   └── index.ts
│       └── package.json
│
├── tests/
│   ├── unit/                      # Unit tests per service
│   ├── integration/               # Integration tests
│   └── e2e/                       # End-to-end tests
│
├── docs/                          # Documentation
│   ├── api/                       # OpenAPI specs per service
│   ├── deployment/                # Deployment guides
│   └── architecture/              # Architecture diagrams
│
├── scripts/                       # Build & deployment scripts
│   ├── create-service.ts          # Service generator
│   ├── start-all.sh               # Start all services locally
│   └── setup-demo-env.sh          # Demo environment setup
│
├── bunfig.toml                    # Bun workspace configuration
├── docker-compose.yml             # Staging orchestration
├── .github/workflows/             # CI/CD pipelines
│   └── ci.yml
└── README.md
```

---

## Development Timeline

> **Note**: For detailed task breakdowns, see `releases/mvp/IMPLEMENTATION_PLAN.md`

### Sprint 1-2 (Weeks 1-4): Foundation & Shared Infrastructure

| Week | Tasks | Deliverables |
|------|-------|--------------|
| 1 | Bun workspace setup, shared libraries, CI/CD | Working build pipeline, @nimbus/shared-* packages |
| 2 | State Service, LLM Service foundation | Data persistence, LLM provider abstraction |
| 3 | Core Engine Service (agents) | Planner, Executor, Verifier, Safety Manager |
| 4 | Basic CLI Service | Command routing, REST/WebSocket clients |

**Key Services**: State Service, LLM Service, Core Engine Service (partial)

### Sprint 3-4 (Weeks 5-8): Core Services & MCP Tools

| Week | Tasks | Deliverables |
|------|-------|--------------|
| 5 | Core Engine completion, Git Tools, FS Tools | Agent orchestration, file/git operations |
| 6 | Generator Service, Terraform Tools | Terraform generation, templates |
| 7 | Kubernetes Tools, Helm Tools | kubectl wrapper, Helm integration |
| 8 | GitHub Tools, AWS Tools | PR/Issue management, AWS CLI operations |

**Key Services**: Generator Service, Git Tools, FS Tools, Terraform Tools, K8s Tools, Helm Tools, GitHub Tools, AWS Tools

### Sprint 5-6 (Weeks 9-12): CLI Integration & Polish

| Week | Tasks | Deliverables |
|------|-------|--------------|
| 9 | CLI Service commands, UI components | Full command set, Ink TUI components |
| 10 | Docker Compose setup, integration testing | All services orchestrated, end-to-end tests |
| 11 | Documentation, demo preparation | API docs, user guides, demo scripts |
| 12 | Testing, bug fixes, demo polish | Investor-ready demo, 5 successful runs |

**Key Deliverables**: Complete CLI, Docker Compose orchestration, comprehensive documentation

---

## Implementation Phases

The MVP is delivered in 3 phases aligned with microservices architecture:

1. **Phase 1** (Weeks 1-4): Foundation with shared libraries + State, LLM, Core Engine services
2. **Phase 2** (Weeks 5-8): Generator + all 7 MCP tool services
3. **Phase 3** (Weeks 9-12): CLI service + integration + testing + demo

📖 **Detailed Implementation**: See `releases/mvp/IMPLEMENTATION_PLAN.md` for:
- Specific task breakdowns per service
- Code examples and file paths
- Service dependencies and critical path
- Acceptance criteria and team coordination

---

## Testing Strategy

> **Detailed Testing Spec**: See `releases/mvp/devrel-qa-team/testing-documentation-spec.md`

### Unit Tests (Target: 80% Coverage)

**Per Service**:
- CLI Service: Command handlers, UI components
- Core Engine Service: Agents (Planner, Executor, Verifier), Safety Manager
- LLM Service: Provider implementations, streaming
- Generator Service: Template engine, best practices
- MCP Tools Services: Individual tool operations

**Framework**: Bun test + MSW for API mocking

### Integration Tests

**Service-to-Service**:
- CLI → Core Engine → LLM (chat flow)
- Core Engine → Generator (code generation)
- Core Engine → MCP Tools (operations)
- All services → State Service (persistence)

**Validation**:
- Terraform generation → `terraform validate`, `tflint`
- Kubernetes manifests → `kubectl apply --dry-run`
- REST API contracts → request/response validation

### E2E Tests (Playwright)

**User Journeys**:
1. Terraform generation (questionnaire mode) - 5min flow
2. Terraform generation (conversational mode) - Natural language
3. Kubernetes operations - kubectl wrapper + AI assistance
4. Git operations - Full commit workflow

**Demo Scenarios**:
- Hello World (2min)
- Terraform VPC (5min)
- K8s Operations (5min)
- Full Journey (10min)

### Quality Metrics

| Metric | Target |
|--------|--------|
| Unit Test Coverage | >80% |
| E2E Test Pass Rate | 100% |
| Response Time P95 | <5s |
| Error Rate | <5% |
| Demo Success Rate | 100% (5 consecutive runs) |

---

## Success Criteria (MVP)

| Criteria | Target |
|----------|--------|
| Core commands working | 100% |
| Terraform generation (AWS VPC + EKS) | Working |
| K8s basic operations | Working |
| Cloud CLI (AWS) | Working |
| Multi-provider LLM | 3+ providers |
| Response time (P95) | < 5 seconds |
| Demo quality | Investor-ready |

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| LLM response quality | Medium | High | Extensive prompt engineering, fallbacks |
| Terraform template coverage | Medium | Medium | Start small, iterate |
| Timeline slip | Medium | High | Prioritize ruthlessly, cut scope |
| Cloud credential complexity | Low | Medium | Support standard auth methods only |

---

## Capability Coverage (MVP)

This section tracks the implementation status of core capabilities in the MVP release.

### MVP Capability Matrix

| Category | Status | Coverage | Implementation Details |
|----------|--------|----------|------------------------|
| **CLI Interface** | ✅ Complete | 98% | 40+ commands, chat mode with personas, config, auth, cost, drift |
| **Terraform Generation** | ✅ Complete | 95% | AWS/GCP/Azure templates; questionnaire + conversational; environment separation (dev/staging/prod); post-gen validation |
| **Kubernetes Operations** | ✅ Complete | 98% | kubectl wrapper, Helm, manifest generation, type-name-to-delete safety |
| **Cloud CLI Integration** | ✅ Complete | 95% | AWS, GCP, Azure full subcommands + credential management (`nimbus auth aws/gcp/azure`) |
| **LLM Provider Support** | ✅ Complete | 95% | Anthropic, OpenAI, Google, Ollama, OpenRouter (5 providers) |
| **Human-in-the-Loop Safety** | ✅ Complete | 95% | Confirmations, dry-run, --yes, type-name-to-delete, safety policy evaluation, cost warnings |
| **Git Operations** | ✅ Complete | 95% | Clone, push, pull, commit, branch, merge, stash + tag, remote, blame (See: `releases/mvp/mcp-tools-team/git-filesystem-tools.md`) |
| **File System Tools** | ✅ Complete | 95% | Read, write, list, search, tree, diff (See: `releases/mvp/mcp-tools-team/git-filesystem-tools.md`) |
| **GitHub Basic** | ✅ Complete | 90% | PR list/create/merge/review, Issue list/create/comment, Octokit integration (See: `releases/mvp/mcp-tools-team/git-filesystem-tools.md`) |
| **Enhanced Init** | ✅ Complete | 95% | Project scanning, framework detection, context persistence with SQLite context.db (See: `releases/mvp/cli-team/cli-interface-spec.md`) |

### Key MVP Deliverables

1. **IaC Generation**
   - Terraform (AWS VPC, EKS, RDS, S3)
   - Kubernetes manifests
   - Helm chart management

2. **Operations**
   - kubectl wrapper with safety controls
   - Cloud CLI integration (AWS, GCP, Azure)
   - Git operations (clone, push, pull, commit, etc.)

3. **Developer Experience**
   - Interactive chat mode with streaming
   - Multi-provider LLM support
   - Project initialization with context awareness
   - File system access (read, write, search)

### Detailed Team Specifications

For detailed implementation specifications, see:
- **CLI Team**: `releases/mvp/cli-team/cli-interface-spec.md`
- **MCP Tools Team**:
  - `releases/mvp/mcp-tools-team/terraform-kubernetes-tools.md`
  - `releases/mvp/mcp-tools-team/git-filesystem-tools.md`
- **Core Engine Team**: `releases/mvp/core-engine-team/agent-orchestration-spec.md`
- **Generator Engine Team**: `releases/mvp/generator-engine-team/terraform-generator-spec.md`
- **LLM Integration Team**: `releases/mvp/llm-integration-team/llm-abstraction-layer.md`
- **Infrastructure Team**: `releases/mvp/infrastructure-team/state-layer-spec.md`
- **DevRel & QA Team**: `releases/mvp/devrel-qa-team/testing-documentation-spec.md`

---

## Implementation Resources

This high-level specification is supported by detailed implementation documentation:

### Architecture & Planning
- **Microservices Architecture**: `releases/mvp/MICROSERVICES_ARCHITECTURE.md`
  - 12 microservices overview
  - Service communication patterns (REST + WebSocket)
  - Deployment strategies (Local → Staging → Production)
  - Service templates and examples

- **Implementation Plan**: `releases/mvp/IMPLEMENTATION_PLAN.md`
  - Phase 1: Foundation & Shared Infrastructure (Weeks 1-4)
  - Phase 2: Core Services & MCP Tools (Weeks 5-8)
  - Phase 3: CLI Service & Integration (Weeks 9-12)
  - Detailed task breakdowns with file paths and code examples
  - Acceptance criteria and team coordination

### Team-Specific Specifications
All team specifications have been updated to reflect the microservices architecture with Bun runtime.

**Relationship Between Documents:**
- **This Document** (`docs/01-mvp-spec.md`): High-level product specification, user stories, and success criteria
- **releases/mvp/MICROSERVICES_ARCHITECTURE.md**: Technical architecture deep-dive
- **releases/mvp/IMPLEMENTATION_PLAN.md**: Step-by-step implementation guide with tasks
- **Team Specs** (in `releases/mvp/*/`): Detailed technical specifications per team

---

*Document Version: 2.0*
*Last Updated: January 2026*
*Updates:
- Version 2.0: Updated to microservices architecture with Bun runtime
- Added comprehensive cross-references to implementation documentation
- Aligned with detailed team specifications in releases/mvp/*
