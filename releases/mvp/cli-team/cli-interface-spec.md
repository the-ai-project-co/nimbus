# CLI Team - MVP Specification

> **Team**: CLI/Frontend Team
> **Phase**: MVP (Months 1-3)
> **Dependencies**: Core Engine, LLM Integration

---

## Overview

The CLI Team is responsible for building the terminal interface using Ink (React for CLI). This includes command routing, user interface components, and terminal UX.

---

## Responsibilities

### 1. Command Structure Implementation

```bash
nimbus <command> [subcommand] [options]

# Core Commands (MVP)
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

# Git Commands (MVP)
nimbus git clone <url>         # Clone a repository
nimbus git status              # Show working tree status
nimbus git add <files>         # Stage files for commit
nimbus git commit              # Create a commit (AI-assisted message)
nimbus git push                # Push commits to remote
nimbus git pull                # Pull changes from remote
nimbus git branch [name]       # List or create branches
nimbus git checkout <branch>   # Switch branches
nimbus git diff                # Show changes
nimbus git log                 # View commit history
nimbus git merge <branch>      # Merge branches
nimbus git stash               # Stash changes

# GitHub Commands (MVP - Basic)
nimbus pr list                 # List pull requests
nimbus pr create               # Create a pull request
nimbus issue list              # List issues
nimbus issue create            # Create an issue

# File System Commands (MVP)
nimbus read <file>             # Read file contents
nimbus tree [path]             # Display directory tree
nimbus search <pattern>        # Search for patterns in files

# Utility
nimbus init                    # Initialize in current directory (Enhanced)
nimbus auth                    # Manage cloud credentials
nimbus doctor                  # Check system health
nimbus version                 # Show version
nimbus help                    # Show help
```

---

## Enhanced Init Command

The `nimbus init` command is critical for providing project-aware context (similar to Claude Code's CLAUDE.md). It scans the current directory, detects project structure, and creates a `.nimbus/` configuration directory with project context.

### Init Command Flow

```bash
$ nimbus init

╭─ Nimbus Project Initialization ────────────────────────────────╮
│                                                                 │
│  Scanning project structure...                                  │
│                                                                 │
│  ✓ Detected: Git repository                                    │
│  ✓ Detected: Terraform project (modules/, environments/)       │
│  ✓ Detected: Kubernetes manifests (k8s/)                       │
│  ✓ Detected: Docker configuration                               │
│  ✓ Detected: GitHub Actions CI/CD                               │
│                                                                 │
│  Creating .nimbus/ directory...                                 │
│  ✓ Created .nimbus/project.yaml                                 │
│  ✓ Created .nimbus/context.db                                   │
│                                                                 │
│  Project initialized successfully!                              │
│  Run 'nimbus chat' to start working with your project.          │
│                                                                 │
╰─────────────────────────────────────────────────────────────────╯
```

### Init Command Implementation

**File**: `packages/cli/src/commands/init.ts`

```typescript
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { render } from 'ink';
import { InitUI } from '../ui/Init';

interface ProjectContext {
  project: {
    name: string;
    path: string;
    detected_at: string;
  };
  structure: {
    type: string;
    languages: string[];
    frameworks: Framework[];
  };
  files: {
    terraform: string[];
    kubernetes: string[];
    docker: string[];
    cicd: string[];
  };
  git: {
    remote: string | null;
    branch: string;
    isRepo: boolean;
  };
  cicd: {
    platform: string | null;
    workflows: string[];
  };
  cloud: {
    providers: string[];
    regions: string[];
  };
  context: {
    last_operation: string | null;
    conversation_history: boolean;
  };
}

export async function initCommand(options: { force?: boolean }) {
  const cwd = process.cwd();
  const nimbusDir = path.join(cwd, '.nimbus');

  // Check if already initialized
  if (await exists(nimbusDir) && !options.force) {
    console.log('Project already initialized. Use --force to reinitialize.');
    return;
  }

  // Render interactive UI
  const { waitUntilExit } = render(<InitUI cwd={cwd} />);
  await waitUntilExit();
}

async function scanProject(cwd: string): Promise<ProjectContext> {
  const context: ProjectContext = {
    project: {
      name: path.basename(cwd),
      path: cwd,
      detected_at: new Date().toISOString(),
    },
    structure: {
      type: 'unknown',
      languages: [],
      frameworks: [],
    },
    files: {
      terraform: [],
      kubernetes: [],
      docker: [],
      cicd: [],
    },
    git: {
      remote: null,
      branch: 'main',
      isRepo: false,
    },
    cicd: {
      platform: null,
      workflows: [],
    },
    cloud: {
      providers: [],
      regions: [],
    },
    context: {
      last_operation: null,
      conversation_history: true,
    },
  };

  // Detect Git repository
  context.git = await detectGit(cwd);

  // Scan for Terraform files
  context.files.terraform = await globFiles(cwd, '**/*.tf');
  if (context.files.terraform.length > 0) {
    context.structure.languages.push('hcl');
    context.structure.frameworks.push({ name: 'terraform', version: await detectTerraformVersion(cwd) });
  }

  // Scan for Kubernetes manifests
  context.files.kubernetes = await globFiles(cwd, '**/k8s/**/*.yaml', '**/*.k8s.yaml');
  if (context.files.kubernetes.length > 0) {
    context.structure.frameworks.push({ name: 'kubernetes', version: await detectK8sVersion(context.files.kubernetes) });
  }

  // Detect Docker
  const dockerfiles = await globFiles(cwd, '**/Dockerfile', '**/docker-compose*.yaml', '**/docker-compose*.yml');
  if (dockerfiles.length > 0) {
    context.files.docker = dockerfiles;
    context.structure.frameworks.push({ name: 'docker', version: null });
  }

  // Detect CI/CD
  context.cicd = await detectCICD(cwd);
  context.files.cicd = context.cicd.workflows;

  // Detect cloud providers from Terraform
  context.cloud.providers = await detectCloudProviders(context.files.terraform);

  // Determine project type
  context.structure.type = determineProjectType(context);

  return context;
}

async function detectGit(cwd: string): Promise<ProjectContext['git']> {
  const gitDir = path.join(cwd, '.git');
  const isRepo = await exists(gitDir);

  if (!isRepo) {
    return { remote: null, branch: 'main', isRepo: false };
  }

  try {
    const { stdout: remote } = await exec('git remote get-url origin', { cwd });
    const { stdout: branch } = await exec('git branch --show-current', { cwd });
    return {
      remote: remote.trim(),
      branch: branch.trim() || 'main',
      isRepo: true,
    };
  } catch {
    return { remote: null, branch: 'main', isRepo: true };
  }
}

async function detectCICD(cwd: string): Promise<ProjectContext['cicd']> {
  // GitHub Actions
  const ghWorkflows = await globFiles(cwd, '.github/workflows/*.yml', '.github/workflows/*.yaml');
  if (ghWorkflows.length > 0) {
    return { platform: 'github-actions', workflows: ghWorkflows };
  }

  // GitLab CI
  const gitlabCI = await globFiles(cwd, '.gitlab-ci.yml');
  if (gitlabCI.length > 0) {
    return { platform: 'gitlab-ci', workflows: gitlabCI };
  }

  // Jenkins
  const jenkinsfile = await globFiles(cwd, 'Jenkinsfile', 'jenkinsfile');
  if (jenkinsfile.length > 0) {
    return { platform: 'jenkins', workflows: jenkinsfile };
  }

  // Azure DevOps
  const azurePipelines = await globFiles(cwd, 'azure-pipelines.yml', '.azure-pipelines/*.yml');
  if (azurePipelines.length > 0) {
    return { platform: 'azure-devops', workflows: azurePipelines };
  }

  return { platform: null, workflows: [] };
}

async function detectCloudProviders(terraformFiles: string[]): Promise<string[]> {
  const providers = new Set<string>();

  for (const file of terraformFiles) {
    const content = await fs.readFile(file, 'utf-8');

    if (content.includes('provider "aws"') || content.includes('aws_')) {
      providers.add('aws');
    }
    if (content.includes('provider "google"') || content.includes('google_')) {
      providers.add('gcp');
    }
    if (content.includes('provider "azurerm"') || content.includes('azurerm_')) {
      providers.add('azure');
    }
  }

  return Array.from(providers);
}

function determineProjectType(context: ProjectContext): string {
  const { terraform, kubernetes, docker } = context.files;

  if (terraform.length > 0 && kubernetes.length > 0) {
    return 'infrastructure-monorepo';
  }
  if (terraform.length > 0) {
    return 'terraform-project';
  }
  if (kubernetes.length > 0 && docker.length > 0) {
    return 'kubernetes-app';
  }
  if (kubernetes.length > 0) {
    return 'kubernetes-manifests';
  }
  if (docker.length > 0) {
    return 'dockerized-app';
  }

  return 'generic';
}
```

### Project Configuration File

**File**: `.nimbus/project.yaml` (auto-generated)

```yaml
# Nimbus Project Configuration
# Auto-generated by 'nimbus init' - modify as needed

project:
  name: my-infrastructure
  detected_at: 2026-01-23T10:00:00Z

structure:
  type: infrastructure-monorepo
  languages:
    - hcl
    - yaml
    - json
  frameworks:
    - name: terraform
      version: "1.5.0"
    - name: kubernetes
      version: "1.28"
    - name: helm
      version: "3.12"
    - name: docker
      version: null

files:
  terraform:
    - "./modules/**/*.tf"
    - "./environments/**/*.tf"
  kubernetes:
    - "./k8s/**/*.yaml"
  docker:
    - "./Dockerfile"
    - "./docker-compose.yaml"
  cicd:
    - ".github/workflows/*.yml"

git:
  remote: git@github.com:org/repo.git
  branch: main
  isRepo: true

cicd:
  platform: github-actions
  workflows:
    - ".github/workflows/ci.yml"
    - ".github/workflows/deploy.yml"

cloud:
  providers:
    - aws
  regions:
    - us-east-1
    - us-west-2

context:
  last_operation: null
  conversation_history: true

# Custom instructions for Nimbus (like CLAUDE.md)
# Add project-specific guidance here
instructions: |
  - This is a multi-environment Terraform project
  - Use workspace-based environment separation
  - Always run terraform plan before apply
  - Follow the existing module structure in ./modules/
```

### Init UI Component

**File**: `packages/cli/src/ui/Init.tsx`

```tsx
import React, { useState, useEffect } from 'react';
import { Box, Text, Spinner } from 'ink';

interface InitUIProps {
  cwd: string;
}

interface Detection {
  name: string;
  status: 'pending' | 'detected' | 'not_found';
  details?: string;
}

export const InitUI: React.FC<InitUIProps> = ({ cwd }) => {
  const [phase, setPhase] = useState<'scanning' | 'creating' | 'done'>('scanning');
  const [detections, setDetections] = useState<Detection[]>([
    { name: 'Git repository', status: 'pending' },
    { name: 'Terraform project', status: 'pending' },
    { name: 'Kubernetes manifests', status: 'pending' },
    { name: 'Docker configuration', status: 'pending' },
    { name: 'CI/CD pipelines', status: 'pending' },
  ]);
  const [files, setFiles] = useState<string[]>([]);

  useEffect(() => {
    performScan();
  }, []);

  const performScan = async () => {
    // Scan and update detections...
    // This is a simplified version - actual implementation would be more thorough
  };

  return (
    <Box flexDirection="column" borderStyle="round" padding={1}>
      <Text bold>Nimbus Project Initialization</Text>
      <Text> </Text>

      {phase === 'scanning' && (
        <>
          <Text>
            <Spinner type="dots" /> Scanning project structure...
          </Text>
          <Text> </Text>
        </>
      )}

      {detections.map((detection, i) => (
        <Text key={i}>
          {detection.status === 'detected' && '  ✓ '}
          {detection.status === 'not_found' && '  ✗ '}
          {detection.status === 'pending' && '  ○ '}
          <Text color={detection.status === 'detected' ? 'green' : detection.status === 'not_found' ? 'gray' : undefined}>
            {detection.status === 'detected' ? 'Detected: ' : detection.status === 'not_found' ? 'Not found: ' : ''}
            {detection.name}
          </Text>
          {detection.details && <Text color="gray"> ({detection.details})</Text>}
        </Text>
      ))}

      {phase === 'creating' && (
        <>
          <Text> </Text>
          <Text>Creating .nimbus/ directory...</Text>
          {files.map((file, i) => (
            <Text key={i} color="green">  ✓ Created {file}</Text>
          ))}
        </>
      )}

      {phase === 'done' && (
        <>
          <Text> </Text>
          <Text color="green" bold>Project initialized successfully!</Text>
          <Text>Run 'nimbus chat' to start working with your project.</Text>
        </>
      )}
    </Box>
  );
};
```

### Init Command Options

```bash
nimbus init [options]

Options:
  --force, -f       Reinitialize even if already initialized
  --no-scan         Skip project scanning, create minimal config
  --template <type> Use a specific project template
  --instructions    Open editor to add custom instructions
```

---

## Components to Build

### 2.1 Main CLI Entry Point

**File**: `packages/cli/src/index.ts`

```typescript
#!/usr/bin/env node
import { program } from 'commander';
import { render } from 'ink';
import { ChatCommand } from './commands/chat';
import { GenerateCommand } from './commands/generate';
// ... other imports

program
  .name('nimbus')
  .description('AI-powered Cloud Engineering Agent')
  .version('0.1.0');

program
  .command('chat')
  .description('Interactive chat mode')
  .option('--model <model>', 'LLM model to use')
  .option('--persona <persona>', 'Persona mode')
  .action(ChatCommand);

// ... register other commands

program.parse();
```

### 2.2 Interactive Chat Mode UI

**File**: `packages/cli/src/ui/Chat.tsx`

```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';

interface ChatProps {
  model: string;
  persona: string;
}

export const Chat: React.FC<ChatProps> = ({ model, persona }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Implementation...
  return (
    <Box flexDirection="column">
      <Header model={model} persona={persona} />
      <MessageList messages={messages} />
      {isLoading && <Spinner type="dots" />}
      <InputArea value={input} onChange={setInput} onSubmit={handleSubmit} />
    </Box>
  );
};
```

### 2.3 Header Component

```
╭─────────────────────────────────────────────────────────╮
│  Nimbus v0.1.0 - Cloud Engineering Agent                │
│  Model: claude-sonnet-4-20250514 | Persona: Professional     │
│  Type 'help' for commands, 'exit' to quit              │
╰─────────────────────────────────────────────────────────╯
```

### 2.4 Confirmation Dialog Component

**File**: `packages/cli/src/ui/Confirmation.tsx`

```tsx
export const Confirmation: React.FC<ConfirmationProps> = ({
  title,
  message,
  type, // 'create' | 'update' | 'delete'
  onConfirm,
  onCancel,
}) => {
  return (
    <Box borderStyle="round" flexDirection="column" padding={1}>
      <Text color={getColorForType(type)}>{title}</Text>
      <Text>{message}</Text>
      <Box marginTop={1}>
        <SelectInput items={[
          { label: 'Yes, proceed', value: 'yes' },
          { label: 'No, cancel', value: 'no' },
        ]} onSelect={handleSelect} />
      </Box>
    </Box>
  );
};
```

### 2.5 Progress/Spinner Component

**File**: `packages/cli/src/ui/Progress.tsx`

```tsx
export const Progress: React.FC<ProgressProps> = ({
  message,
  type, // 'spinner' | 'bar' | 'steps'
  current,
  total,
}) => {
  if (type === 'spinner') {
    return (
      <Box>
        <Spinner type="dots" />
        <Text> {message}</Text>
      </Box>
    );
  }
  // ... other types
};
```

---

## User Stories to Implement

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-001 | As a user, I want to start a chat session | Chat mode launches, accepts input, streams responses | Sprint 1-2 |
| US-002 | As a user, I want to ask one-off questions | `nimbus ask` returns answer and exits | Sprint 1-2 |
| US-003 | As a user, I want to see my command history | `nimbus history` shows past operations | Sprint 5-6 |
| US-004 | As a user, I want to configure my LLM provider | `nimbus config` allows provider selection | Sprint 5-6 |
| US-005 | As a user, I want to see loading indicators | Spinner/progress shown during LLM calls | Sprint 1-2 |
| US-006 | As a user, I want to run git commands | Git operations work via CLI | Sprint 3-4 |
| US-007 | As a user, I want to list/create PRs | PR list and create work | Sprint 5-6 |
| US-008 | As a user, I want to list/create issues | Issue list and create work | Sprint 5-6 |
| US-009 | As a user, I want to read files | File contents displayed | Sprint 3-4 |
| US-010 | As a user, I want to see directory tree | Tree structure displayed | Sprint 3-4 |
| US-011 | As a user, I want to search in files | Search results displayed | Sprint 3-4 |

---

## Technical Requirements

### CLI Service Architecture

The CLI Service is built as a **microservice** using **Bun** as the runtime and package manager. It communicates with other Nimbus services via REST APIs and WebSockets.

**Service Responsibilities:**
- Terminal user interface (TUI) using Ink
- Command parsing and routing
- User input validation
- REST API client for backend services
- WebSocket client for streaming responses
- Local state caching for performance

**Communication Patterns:**
- **REST API**: For synchronous operations (config, history, one-shot commands)
- **WebSocket**: For streaming responses (LLM chat, generation progress, logs)

**Deployment:**
- **Local Development**: Bun process (`bun run src/index.ts`)
- **Staging**: Docker container orchestrated with docker-compose
- **Production**: Kubernetes pod with service mesh

**Service Discovery:**
- **Local**: Environment variables for service URLs
- **Staging/Production**: Service names resolved via Docker network / K8s DNS

### Dependencies

**File**: `services/cli-service/package.json`

```json
{
  "name": "@nimbus/cli-service",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "ink": "^4.4.1",
    "ink-text-input": "^5.0.1",
    "ink-spinner": "^5.0.0",
    "ink-select-input": "^5.0.0",
    "commander": "^11.1.0",
    "chalk": "^5.3.0",
    "ora": "^7.0.1",
    "boxen": "^7.1.1",
    "@nimbus/shared-types": "workspace:*",
    "@nimbus/shared-utils": "workspace:*"
  },
  "devDependencies": {
    "bun-types": "latest"
  }
}
```

### Microservice Structure

```
services/
├── cli-service/              # CLI Service (User Interface)
│   ├── src/
│   │   ├── index.ts          # Entry point
│   │   ├── server.ts         # REST API server (Bun.serve)
│   │   ├── websocket.ts      # WebSocket server for streaming
│   │   ├── commands/
│   │   │   ├── chat.ts       # Chat command
│   │   │   ├── generate.ts   # Generate command
│   │   │   ├── plan.ts       # Plan command
│   │   │   ├── apply.ts      # Apply command
│   │   │   ├── history.ts    # History command
│   │   │   ├── config.ts     # Config command
│   │   │   ├── auth.ts       # Auth command
│   │   │   ├── k8s/          # K8s subcommands
│   │   │   │   ├── index.ts
│   │   │   │   ├── list.ts
│   │   │   │   ├── get.ts
│   │   │   │   └── apply.ts
│   │   │   ├── git/          # Git subcommands
│   │   │   │   ├── index.ts
│   │   │   │   ├── clone.ts
│   │   │   │   ├── status.ts
│   │   │   │   ├── commit.ts
│   │   │   │   ├── push.ts
│   │   │   │   ├── pull.ts
│   │   │   │   ├── branch.ts
│   │   │   │   └── merge.ts
│   │   │   ├── pr/           # PR subcommands
│   │   │   │   ├── index.ts
│   │   │   │   ├── list.ts
│   │   │   │   └── create.ts
│   │   │   ├── issue/        # Issue subcommands
│   │   │   │   ├── index.ts
│   │   │   │   ├── list.ts
│   │   │   │   └── create.ts
│   │   │   └── file/         # File subcommands
│   │   │       ├── read.ts
│   │   │       ├── tree.ts
│   │   │       └── search.ts
│   │   ├── ui/
│   │   │   ├── Chat.tsx      # Chat interface
│   │   │   ├── Questionnaire.tsx # Questionnaire wizard
│   │   │   ├── Confirmation.tsx  # Confirmation dialogs
│   │   │   ├── Progress.tsx  # Progress indicators
│   │   │   ├── Table.tsx     # Data tables
│   │   │   ├── Tree.tsx      # File trees
│   │   │   ├── Diff.tsx      # Diff views
│   │   │   ├── PRList.tsx    # Pull request list
│   │   │   ├── IssueList.tsx # Issue list
│   │   │   └── GitStatus.tsx # Git status display
│   │   ├── clients/
│   │   │   ├── core-engine.ts    # REST client for Core Engine Service
│   │   │   ├── llm.ts            # REST client for LLM Service
│   │   │   ├── generator.ts      # REST client for Generator Service
│   │   │   ├── mcp-tools.ts      # REST client for MCP Tools Service
│   │   │   └── state.ts          # REST client for State Service
│   │   └── utils/
│   │       ├── formatting.ts
│   │       └── colors.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile            # For staging/production
│   └── docker-compose.yml    # Local development with Docker
```

---

## Sprint Breakdown

### Sprint 1-2 (Weeks 1-4)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Project setup, CLI framework | 3 days | Working build |
| Command router implementation | 2 days | Basic commands |
| Chat UI component | 5 days | Interactive chat |
| Spinner/progress components | 2 days | Loading states |
| Integration with Core Engine | 3 days | End-to-end flow |

### Sprint 3-4 (Weeks 5-8)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Questionnaire component | 4 days | Step-by-step wizard |
| Confirmation dialogs | 2 days | Safety prompts |
| K8s command structure | 3 days | kubectl wrapper |
| Helm command structure | 2 days | Helm integration |
| Table/Tree/Diff views | 4 days | Rich output |
| **Git command structure** | 3 days | Git subcommands (clone, status, commit, push, pull) |
| **File read/tree/search commands** | 2 days | File system commands |

### Sprint 5-6 (Weeks 9-12)

| Task | Effort | Deliverable |
|------|--------|-------------|
| History command | 3 days | Operation history |
| Config command | 2 days | User preferences |
| Auth command | 3 days | Credential management |
| **PR list/create commands** | 2 days | GitHub PR integration |
| **Issue list/create commands** | 2 days | GitHub Issue integration |
| **GitStatus.tsx component** | 1 day | Rich git status display |
| **PRList.tsx component** | 1 day | Rich PR list display |
| Polish and bug fixes | 3 days | Demo-ready |
| Documentation | 2 days | User guide |

---

## Integration Points (Microservices)

### With Core Engine Service
- **REST API**: `POST /api/core/execute` - Send user input, receive operation results
- **WebSocket**: `ws://core-engine-service:3001/stream` - Receive streaming responses
- **REST API**: `POST /api/core/plan` - Request operation planning
- **REST API**: `POST /api/core/validate` - Validate planned operations

### With LLM Service
- **REST API**: `POST /api/llm/chat` - Send messages to LLM
- **WebSocket**: `ws://llm-service:3002/stream` - Receive streaming LLM responses
- **REST API**: `GET /api/llm/models` - List available models
- **REST API**: `POST /api/llm/provider/select` - Select LLM provider

### With State Service
- **REST API**: `GET /api/state/config` - Read configuration
- **REST API**: `PUT /api/state/config` - Write configuration
- **REST API**: `GET /api/state/history` - Query operation history
- **REST API**: `POST /api/state/credentials` - Manage cloud credentials
- **REST API**: `GET /api/state/conversations` - Get conversation history

### With Generator Service
- **REST API**: `POST /api/generator/terraform` - Generate Terraform code
- **REST API**: `POST /api/generator/kubernetes` - Generate Kubernetes manifests
- **WebSocket**: `ws://generator-service:3003/stream` - Stream generation progress

### With MCP Tools Services
- **Git Tools**: `POST /api/mcp/git/{operation}` - Git operations
- **File Tools**: `POST /api/mcp/fs/{operation}` - File system operations
- **Terraform Tools**: `POST /api/mcp/terraform/{operation}` - Terraform operations
- **Kubernetes Tools**: `POST /api/mcp/k8s/{operation}` - Kubernetes operations
- **Helm Tools**: `POST /api/mcp/helm/{operation}` - Helm operations

---

## Acceptance Criteria

- [ ] All core commands functional
- [ ] Chat mode with streaming responses
- [ ] Questionnaire wizard for Terraform generation
- [ ] Confirmation dialogs for mutating operations
- [ ] Rich output formatting (tables, trees, diffs)
- [ ] < 100ms command startup time
- [ ] Accessible (keyboard navigation, screen reader)
- [ ] Works on macOS, Linux, Windows

---

*Document Version: 1.0*
*Last Updated: January 2026*
