# CLI Team - Release 2 Specification

> **Team**: CLI/Frontend Team
> **Phase**: Release 2 (Months 4-6)
> **Dependencies**: Core Engine, Plugin System, MCP Tools (GitHub/Docker)

---

## Overview

Release 2 focuses on enhanced terminal UI, persona modes, advanced GitHub/PR workflows, Docker operations, and the foundation for the plugin UI system.

---

## New Commands (Release 2)

### Advanced Git/GitHub Commands

```bash
# Advanced PR Operations
nimbus pr read <number>           # Read PR details with diff, comments, reviews
nimbus pr comment <number>        # Add comment to a PR
nimbus pr review <number>         # Submit a PR review (approve/request changes)
nimbus pr merge <number>          # Merge a pull request
nimbus pr checkout <number>       # Checkout PR branch locally
nimbus pr analyze <number>        # AI-powered PR analysis and suggestions

# Issue Operations
nimbus issue read <number>        # Read issue details with comments
nimbus issue comment <number>     # Add comment to an issue
nimbus issue close <number>       # Close an issue
nimbus issue analyze <number>     # AI-powered issue analysis

# AI-Assisted Git Operations
nimbus commit                     # Generate AI-powered commit message
nimbus commit --staged            # Commit only staged changes with AI message
nimbus commit -m "message"        # Traditional commit with custom message

# Codebase Analysis
nimbus analyze                    # Analyze entire codebase
nimbus analyze <path>             # Analyze specific file/directory
nimbus analyze --security         # Security-focused analysis
nimbus analyze --performance      # Performance-focused analysis
```

### Docker Commands

```bash
# Docker Build & Push
nimbus docker build               # Build Docker image from Dockerfile
nimbus docker build -t <tag>      # Build with specific tag
nimbus docker push <image>        # Push image to registry

# Docker Run & Manage
nimbus docker run <image>         # Run a Docker container
nimbus docker ps                  # List running containers
nimbus docker logs <container>    # View container logs
nimbus docker stop <container>    # Stop a container

# Docker Compose
nimbus docker compose up          # Start services from docker-compose.yml
nimbus docker compose down        # Stop and remove services
nimbus docker compose logs        # View compose logs

# Dockerfile Generation
nimbus docker init                # Generate Dockerfile interactively
nimbus docker init --from <lang>  # Generate Dockerfile for specific language
```

### Project Scaffolding Command

```bash
# Interactive Project Scaffolding
nimbus scaffold                   # Interactive project scaffolding wizard
nimbus scaffold --template <name> # Use a specific template
nimbus scaffold --list            # List available templates

# Templates include:
# - full-stack-web     : Frontend + Backend + Infrastructure
# - api-service        : REST/GraphQL API with database
# - static-site        : Static website with CDN deployment
# - data-pipeline      : ETL/Data processing infrastructure
# - ml-platform        : ML/AI project with serving infrastructure
# - microservices      : Microservices architecture scaffold
```

---

## New Features

### 1. Rich Output Formatting

#### 1.1 Enhanced Tables

```bash
┌─────────────────┬──────────────┬─────────────┬──────────┐
│ Instance ID     │ Name         │ Type        │ Status   │
├─────────────────┼──────────────┼─────────────┼──────────┤
│ i-0abc123def    │ web-server   │ t3.medium   │ running  │
│ i-0def456ghi    │ api-server   │ t3.large    │ running  │
└─────────────────┴──────────────┴─────────────┴──────────┘
```

**File**: `packages/cli/src/ui/Table.tsx`

```tsx
interface TableProps {
  columns: Column[];
  data: Record<string, unknown>[];
  sortable?: boolean;
  filterable?: boolean;
  maxHeight?: number;
}

export const Table: React.FC<TableProps> = ({
  columns,
  data,
  sortable,
  filterable,
  maxHeight,
}) => {
  // Scrollable table with column sorting
};
```

#### 1.2 Progress Bars

```bash
Generating Terraform... ████████████████████░░░░ 80%
```

**File**: `packages/cli/src/ui/ProgressBar.tsx`

```tsx
interface ProgressBarProps {
  value: number;      // 0-100
  label: string;
  width?: number;     // Characters
  color?: string;
}
```

#### 1.3 Tree Views

```bash
infrastructure/
├── main.tf
├── variables.tf
├── modules/
│   ├── vpc/
│   └── eks/
└── environments/
    ├── dev/
    └── prod/
```

**File**: `packages/cli/src/ui/Tree.tsx`

```tsx
interface TreeNode {
  name: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

export const Tree: React.FC<{ root: TreeNode }> = ({ root }) => {
  // Recursive tree rendering
};
```

#### 1.4 Diff Views

```bash
- resource "aws_instance" "old" {
+ resource "aws_instance" "new" {
    instance_type = "t3.medium"
-   ami           = "ami-old123"
+   ami           = "ami-new456"
  }
```

**File**: `packages/cli/src/ui/Diff.tsx`

```tsx
interface DiffProps {
  oldContent: string;
  newContent: string;
  filename?: string;
  context?: number;   // Lines of context
}
```

---

### 2. Interactive Elements

#### 2.1 Multi-Select Component

```bash
  Which components do you need?
  ☑ VPC
  ☑ EKS
  ☐ RDS
  ☑ S3
  ☐ ElastiCache
```

**File**: `packages/cli/src/ui/MultiSelect.tsx`

```tsx
interface MultiSelectProps {
  items: { label: string; value: string; selected?: boolean }[];
  onSubmit: (selected: string[]) => void;
  max?: number;
  min?: number;
}
```

#### 2.2 Autocomplete Input

```bash
$ nimbus k8s get [TAB]
  pods          deployments   services      configmaps
  secrets       ingresses     namespaces    nodes
```

**File**: `packages/cli/src/ui/Autocomplete.tsx`

```tsx
interface AutocompleteProps {
  suggestions: string[];
  onSelect: (value: string) => void;
  placeholder?: string;
  fuzzyMatch?: boolean;
}
```

#### 2.3 Action Buttons

```bash
  [View Files] [Apply Now] [Modify] [Cancel]
```

**File**: `packages/cli/src/ui/ActionButtons.tsx`

```tsx
interface ActionButton {
  label: string;
  action: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  shortcut?: string;  // e.g., 'v' for View
}
```

---

### 3. Persona Mode UI

#### 3.1 Persona Configuration Command

```bash
$ nimbus config persona

  ╭─ Persona Settings ───────────────────────────────────────╮
  │                                                          │
  │  Active Persona: Professional                            │
  │                                                          │
  │  Available Personas:                                     │
  │                                                          │
  │  › Professional (Current)                                │
  │    Concise, direct responses. Minimal explanation.       │
  │                                                          │
  │    Assistant                                             │
  │    Friendly, explains reasoning, offers alternatives.    │
  │                                                          │
  │    Expert                                                │
  │    Deep technical detail, advanced options shown.        │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

#### 3.2 Persona Display in Chat Header

```bash
  ╭─────────────────────────────────────────────────────────╮
  │  Nimbus v0.2.0 - Cloud Engineering Agent                │
  │  Model: gpt-4o | Persona: Expert 🧠                     │
  │  Type 'help' for commands, '/persona' to switch         │
  ╰─────────────────────────────────────────────────────────╯
```

---

### 4. Operation History UI

#### 4.1 History List View

```bash
$ nimbus history

  ╭─ Operation History ──────────────────────────────────────╮
  │                                                          │
  │  Today                                                   │
  │  ├─ 14:32  nimbus generate terraform (eks-cluster)      │
  │  │         ✓ Generated 12 files in ./infrastructure     │
  │  │                                                       │
  │  ├─ 13:15  nimbus k8s apply deployment.yaml             │
  │  │         ✓ Created deployment/api (3 replicas)        │
  │  │                                                       │
  │  └─ 11:45  nimbus chat                                  │
  │            "How do I scale my deployment?"               │
  │                                                          │
  │  Yesterday                                               │
  │  ├─ 16:20  nimbus helm install redis                    │
  │  │         ✓ Installed redis-17.3.0                     │
  │  ...                                                     │
  │                                                          │
  │  [View Details] [Replay] [Export] [Search]              │
  ╰──────────────────────────────────────────────────────────╯
```

#### 4.2 History Detail View

**File**: `packages/cli/src/ui/HistoryDetail.tsx`

```tsx
interface HistoryDetailProps {
  operation: Operation;
  onReplay: () => void;
  onExport: () => void;
}
```

---

### 5. GitHub PR/Issue UI Components

#### 5.1 PR Detail View

```bash
$ nimbus pr read 42

╭─ Pull Request #42 ────────────────────────────────────────────╮
│                                                                │
│  Title: Add user authentication middleware                     │
│  Author: @johndoe  |  Branch: feature/auth → main             │
│  Status: Open  |  Created: 2 days ago  |  Updated: 3 hours    │
│                                                                │
│  ─────────────────────────────────────────────────────────────│
│                                                                │
│  Description:                                                  │
│  This PR adds JWT-based authentication middleware to the       │
│  API routes. Includes rate limiting and refresh token logic.  │
│                                                                │
│  ─────────────────────────────────────────────────────────────│
│                                                                │
│  Files Changed: 8  |  +245  -32                               │
│  ├── src/middleware/auth.ts           (+120 -0)               │
│  ├── src/routes/api.ts                (+45 -12)               │
│  ├── src/utils/jwt.ts                 (+80 -0)                │
│  └── tests/auth.test.ts               (+0 -20)                │
│                                                                │
│  Reviews: ✓ Approved (2)  ⏳ Pending (1)                       │
│  Checks: ✓ CI/CD passed  ✓ Tests passed                       │
│                                                                │
│  [View Diff] [Add Comment] [Review] [Merge] [Checkout]        │
╰────────────────────────────────────────────────────────────────╯
```

**File**: `packages/cli/src/ui/PRDetail.tsx`

```tsx
interface PRDetailProps {
  prNumber: number;
  title: string;
  author: string;
  branch: { head: string; base: string };
  status: 'open' | 'closed' | 'merged';
  description: string;
  files: FileChange[];
  reviews: Review[];
  checks: Check[];
  onViewDiff: () => void;
  onComment: () => void;
  onReview: () => void;
  onMerge: () => void;
  onCheckout: () => void;
}

export const PRDetail: React.FC<PRDetailProps> = (props) => {
  // Rich PR detail rendering with actions
};
```

#### 5.2 PR Analysis View

```bash
$ nimbus pr analyze 42

╭─ AI Analysis: PR #42 ─────────────────────────────────────────╮
│                                                                │
│  📊 Summary                                                    │
│  This PR adds authentication middleware with JWT tokens.       │
│  Overall quality score: 8.5/10                                 │
│                                                                │
│  ✅ Strengths                                                  │
│  • Well-structured middleware pattern                          │
│  • Good error handling in JWT validation                       │
│  • Rate limiting included for security                         │
│                                                                │
│  ⚠️  Suggestions                                               │
│  • Consider adding refresh token rotation                      │
│  • Missing test for expired token edge case                    │
│  • JWT secret should use env variable, not hardcoded          │
│                                                                │
│  🔒 Security Notes                                             │
│  • Token expiry set to 1h (recommended: reduce to 15m)        │
│  • Consider adding CSRF protection                             │
│                                                                │
│  [Apply Suggestions] [Copy Analysis] [Add to Review]          │
╰────────────────────────────────────────────────────────────────╯
```

**File**: `packages/cli/src/ui/PRAnalysis.tsx`

```tsx
interface PRAnalysisProps {
  summary: string;
  qualityScore: number;
  strengths: string[];
  suggestions: Suggestion[];
  securityNotes: string[];
  onApplySuggestions: () => void;
  onCopyAnalysis: () => void;
  onAddToReview: () => void;
}
```

#### 5.3 Commit Message Generator

```bash
$ nimbus commit

╭─ AI Commit Message Generator ─────────────────────────────────╮
│                                                                │
│  Analyzing staged changes...                                   │
│                                                                │
│  Files staged: 3                                               │
│  ├── src/auth/middleware.ts (+45 -2)                          │
│  ├── src/auth/jwt.ts (+12 -0)                                 │
│  └── tests/auth.test.ts (+28 -0)                              │
│                                                                │
│  ─────────────────────────────────────────────────────────────│
│                                                                │
│  Generated Commit Message:                                     │
│                                                                │
│  feat(auth): add JWT token refresh functionality              │
│                                                                │
│  - Add refreshToken method to JWT utility                      │
│  - Update middleware to handle token refresh                   │
│  - Add unit tests for refresh token flow                       │
│                                                                │
│  ─────────────────────────────────────────────────────────────│
│                                                                │
│  › Use this message                                            │
│    Edit message                                                │
│    Regenerate                                                  │
│    Cancel                                                      │
│                                                                │
╰────────────────────────────────────────────────────────────────╯
```

**File**: `packages/cli/src/ui/CommitMessageGenerator.tsx`

```tsx
interface CommitMessageGeneratorProps {
  stagedFiles: StagedFile[];
  generatedMessage: {
    title: string;
    body: string[];
  };
  onAccept: () => void;
  onEdit: (message: string) => void;
  onRegenerate: () => void;
  onCancel: () => void;
}
```

#### 5.4 Codebase Analysis View

```bash
$ nimbus analyze

╭─ Codebase Analysis ───────────────────────────────────────────╮
│                                                                │
│  📁 Project: nimbus-backend                                   │
│  📊 Files Analyzed: 127  |  Lines: 15,432                     │
│                                                                │
│  ─────────────────────────────────────────────────────────────│
│                                                                │
│  🏗️  Architecture                                             │
│  • Pattern: Layered Architecture (Controller → Service → Repo)│
│  • Framework: Express.js with TypeScript                       │
│  • Database: PostgreSQL with Prisma ORM                        │
│                                                                │
│  📈 Code Quality                                               │
│  • Maintainability: 85/100                                     │
│  • Test Coverage: 72%                                          │
│  • Documentation: 45% (needs improvement)                      │
│                                                                │
│  🔒 Security                                                   │
│  • 2 potential issues found                                    │
│  • SQL injection: 0  |  XSS: 0  |  Auth: 2 warnings           │
│                                                                │
│  ⚡ Performance                                                │
│  • N+1 queries detected in: UserService.ts:45                 │
│  • Large bundle detected: utils/helpers.ts (optimize)         │
│                                                                │
│  [View Details] [Export Report] [Fix Issues]                  │
╰────────────────────────────────────────────────────────────────╯
```

**File**: `packages/cli/src/ui/CodebaseAnalysis.tsx`

```tsx
interface CodebaseAnalysisProps {
  projectName: string;
  stats: { files: number; lines: number };
  architecture: ArchitectureInfo;
  quality: QualityMetrics;
  security: SecurityReport;
  performance: PerformanceReport;
  onViewDetails: () => void;
  onExportReport: () => void;
  onFixIssues: () => void;
}
```

---

### 6. Docker UI Components

#### 6.1 Docker Build Progress

```bash
$ nimbus docker build -t myapp:latest

╭─ Docker Build ────────────────────────────────────────────────╮
│                                                                │
│  Image: myapp:latest                                           │
│  Dockerfile: ./Dockerfile                                      │
│                                                                │
│  Step 1/8: FROM node:18-alpine                                │
│  ████████████████████████████████████████ 100%                │
│                                                                │
│  Step 2/8: WORKDIR /app                                       │
│  ████████████████████████████████████████ 100%                │
│                                                                │
│  Step 3/8: COPY package*.json ./                              │
│  ████████████████████████████████████████ 100%                │
│                                                                │
│  Step 4/8: RUN npm ci --only=production                       │
│  ████████████████████░░░░░░░░░░░░░░░░░░░░ 52%                 │
│  Installing dependencies... (245/472)                          │
│                                                                │
│  Layers: 3/8 cached  |  Size: 245 MB                          │
│                                                                │
╰────────────────────────────────────────────────────────────────╯
```

**File**: `packages/cli/src/ui/DockerBuild.tsx`

```tsx
interface DockerBuildProps {
  imageName: string;
  dockerfile: string;
  steps: BuildStep[];
  currentStep: number;
  progress: number;
  layersCached: number;
  totalSize: string;
}
```

#### 6.2 Docker Compose Status

```bash
$ nimbus docker compose up

╭─ Docker Compose ──────────────────────────────────────────────╮
│                                                                │
│  Project: nimbus-app                                           │
│                                                                │
│  Service         Status      Ports           Health           │
│  ───────────────────────────────────────────────────────────  │
│  api             Running     3000:3000       ● Healthy        │
│  postgres        Running     5432:5432       ● Healthy        │
│  redis           Running     6379:6379       ● Healthy        │
│  worker          Running     -               ● Healthy        │
│  nginx           Starting    80:80, 443:443  ○ Starting...    │
│                                                                │
│  Logs: Streaming...                                            │
│  ─────────────────────────────────────────────────────────────│
│  [api]    Server listening on port 3000                       │
│  [worker] Connected to Redis                                   │
│  [nginx]  Starting nginx...                                    │
│                                                                │
│  [Stop All] [Restart] [View Logs] [Shell]                     │
╰────────────────────────────────────────────────────────────────╯
```

**File**: `packages/cli/src/ui/DockerCompose.tsx`

```tsx
interface DockerComposeProps {
  projectName: string;
  services: Service[];
  logs: LogEntry[];
  onStop: () => void;
  onRestart: () => void;
  onViewLogs: (service: string) => void;
  onShell: (service: string) => void;
}

interface Service {
  name: string;
  status: 'running' | 'starting' | 'stopped' | 'error';
  ports: string[];
  health: 'healthy' | 'unhealthy' | 'starting' | 'none';
}
```

#### 6.3 Dockerfile Generator

```bash
$ nimbus docker init

╭─ Dockerfile Generator ────────────────────────────────────────╮
│                                                                │
│  Detected: Node.js (TypeScript) project                        │
│                                                                │
│  ─────────────────────────────────────────────────────────────│
│                                                                │
│  Base Image:                                                   │
│  › node:18-alpine (Recommended)                                │
│    node:18                                                     │
│    node:20-alpine                                              │
│                                                                │
│  Build Type:                                                   │
│  › Multi-stage (Recommended - smaller image)                   │
│    Single-stage                                                │
│                                                                │
│  Features to include:                                          │
│  ☑ Health check                                                │
│  ☑ Non-root user                                               │
│  ☑ .dockerignore generation                                    │
│  ☐ Docker Compose file                                         │
│                                                                │
│  [Generate] [Preview] [Cancel]                                │
╰────────────────────────────────────────────────────────────────╯
```

**File**: `packages/cli/src/ui/DockerfileGenerator.tsx`

```tsx
interface DockerfileGeneratorProps {
  detectedLanguage: string;
  baseImages: string[];
  selectedBaseImage: string;
  buildType: 'single' | 'multi-stage';
  features: Feature[];
  onGenerate: () => void;
  onPreview: () => void;
  onCancel: () => void;
}
```

---

### 7. Project Scaffolding UI

The `nimbus scaffold` command provides an interactive wizard for creating new projects with complete infrastructure setup.

#### 7.1 Scaffold Wizard Flow

```bash
$ nimbus scaffold

╭─ Project Scaffolding ─────────────────────────────────────────╮
│                                                                │
│  What type of project are you creating?                        │
│                                                                │
│  › Full-Stack Web Application                                  │
│    API Service (Backend only)                                  │
│    Static Website                                              │
│    Data Pipeline                                               │
│    ML/AI Platform                                              │
│    Microservices Architecture                                  │
│    Custom (from template)                                      │
│                                                                │
│  [↑/↓] Navigate  [Enter] Select  [Esc] Cancel                 │
╰────────────────────────────────────────────────────────────────╯

# After selecting "Full-Stack Web Application"

╭─ Full-Stack Configuration ────────────────────────────────────╮
│                                                                │
│  Project Name: my-awesome-app                                  │
│                                                                │
│  Frontend Framework:                                           │
│  › Next.js (Recommended)                                       │
│    React + Vite                                                │
│    Vue.js                                                      │
│    SvelteKit                                                   │
│                                                                │
│  Backend Framework:                                            │
│  › Node.js + Express                                           │
│    Node.js + Fastify                                           │
│    Python + FastAPI                                            │
│    Go + Fiber                                                  │
│                                                                │
│  Database:                                                     │
│  › PostgreSQL (Recommended)                                    │
│    MySQL                                                       │
│    MongoDB                                                     │
│    SQLite                                                      │
│                                                                │
│  [Continue] [Back] [Cancel]                                    │
╰────────────────────────────────────────────────────────────────╯

# Infrastructure configuration

╭─ Infrastructure Setup ────────────────────────────────────────╮
│                                                                │
│  Cloud Provider:                                               │
│  › AWS (Recommended)                                           │
│    Google Cloud                                                │
│    Azure                                                       │
│    None (local only)                                           │
│                                                                │
│  What infrastructure components do you need?                   │
│  ☑ Terraform modules                                           │
│  ☑ Kubernetes manifests                                        │
│  ☑ Docker configuration                                        │
│  ☑ CI/CD pipeline (GitHub Actions)                             │
│  ☑ Monitoring (Prometheus + Grafana)                           │
│  ☐ CDN configuration                                           │
│  ☐ WAF/Security                                                │
│                                                                │
│  [Generate] [Back] [Cancel]                                    │
╰────────────────────────────────────────────────────────────────╯

# Generation output

╭─ Generating Project ──────────────────────────────────────────╮
│                                                                │
│  Creating project structure...                                 │
│                                                                │
│  ✓ Application Code                                            │
│    ├── frontend/                    (Next.js app)              │
│    └── backend/                     (Express API)              │
│                                                                │
│  ✓ Infrastructure                                              │
│    ├── terraform/                   (12 files)                 │
│    │   ├── main.tf                                             │
│    │   ├── variables.tf                                        │
│    │   ├── modules/vpc/                                        │
│    │   ├── modules/eks/                                        │
│    │   └── modules/rds/                                        │
│    └── k8s/                         (8 manifests)              │
│                                                                │
│  ✓ Docker                                                      │
│    ├── frontend/Dockerfile                                     │
│    ├── backend/Dockerfile                                      │
│    └── docker-compose.yaml                                     │
│                                                                │
│  ✓ CI/CD                                                       │
│    └── .github/workflows/ci.yml                                │
│                                                                │
│  ✓ Monitoring                                                  │
│    ├── prometheus/rules.yaml                                   │
│    └── grafana/dashboards/                                     │
│                                                                │
│  ───────────────────────────────────────────────────────────   │
│                                                                │
│  Project 'my-awesome-app' created successfully!                │
│                                                                │
│  Next steps:                                                   │
│  1. cd my-awesome-app                                          │
│  2. npm install (in frontend/ and backend/)                    │
│  3. docker-compose up (for local development)                  │
│  4. nimbus chat (to continue with AI assistance)               │
│                                                                │
│  [Open in Editor] [View README] [Done]                         │
╰────────────────────────────────────────────────────────────────╯
```

#### 7.2 Scaffold Command Implementation

**File**: `packages/cli/src/commands/scaffold.ts`

```typescript
import { z } from 'zod';
import { render } from 'ink';
import { ScaffoldWizard } from '../ui/ScaffoldWizard';

const templateSchema = z.enum([
  'full-stack-web',
  'api-service',
  'static-site',
  'data-pipeline',
  'ml-platform',
  'microservices',
  'custom',
]);

interface ScaffoldOptions {
  template?: string;
  list?: boolean;
  name?: string;
  output?: string;
}

export async function scaffoldCommand(options: ScaffoldOptions) {
  if (options.list) {
    listTemplates();
    return;
  }

  if (options.template) {
    // Direct template usage
    await scaffoldFromTemplate(options.template, options);
    return;
  }

  // Interactive wizard
  const { waitUntilExit } = render(
    <ScaffoldWizard onComplete={handleComplete} />
  );
  await waitUntilExit();
}

function listTemplates() {
  console.log(`
Available Templates:

  full-stack-web    Full-Stack Web Application
                    Frontend + Backend + Database + Infrastructure

  api-service       API Service
                    REST/GraphQL API with database and auth

  static-site       Static Website
                    Static site with CDN and SSL

  data-pipeline     Data Pipeline
                    ETL/Data processing with orchestration

  ml-platform       ML/AI Platform
                    Training + Serving infrastructure

  microservices     Microservices Architecture
                    Multiple services with service mesh

Use: nimbus scaffold --template <name>
  `);
}
```

#### 7.3 Scaffold Wizard Component

**File**: `packages/cli/src/ui/ScaffoldWizard.tsx`

```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import MultiSelect from 'ink-multi-select';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';

type WizardStep =
  | 'project-type'
  | 'project-name'
  | 'frontend'
  | 'backend'
  | 'database'
  | 'cloud'
  | 'infrastructure'
  | 'generating'
  | 'done';

interface ScaffoldConfig {
  projectType: string;
  projectName: string;
  frontend: string | null;
  backend: string | null;
  database: string | null;
  cloud: string | null;
  infrastructure: string[];
}

export const ScaffoldWizard: React.FC<{ onComplete: (config: ScaffoldConfig) => void }> = ({ onComplete }) => {
  const [step, setStep] = useState<WizardStep>('project-type');
  const [config, setConfig] = useState<ScaffoldConfig>({
    projectType: '',
    projectName: '',
    frontend: null,
    backend: null,
    database: null,
    cloud: null,
    infrastructure: [],
  });
  const [generatedFiles, setGeneratedFiles] = useState<string[]>([]);

  const projectTypes = [
    { label: 'Full-Stack Web Application', value: 'full-stack-web' },
    { label: 'API Service (Backend only)', value: 'api-service' },
    { label: 'Static Website', value: 'static-site' },
    { label: 'Data Pipeline', value: 'data-pipeline' },
    { label: 'ML/AI Platform', value: 'ml-platform' },
    { label: 'Microservices Architecture', value: 'microservices' },
    { label: 'Custom (from template)', value: 'custom' },
  ];

  const frontendOptions = [
    { label: 'Next.js (Recommended)', value: 'nextjs' },
    { label: 'React + Vite', value: 'react-vite' },
    { label: 'Vue.js', value: 'vue' },
    { label: 'SvelteKit', value: 'sveltekit' },
  ];

  const backendOptions = [
    { label: 'Node.js + Express', value: 'express' },
    { label: 'Node.js + Fastify', value: 'fastify' },
    { label: 'Python + FastAPI', value: 'fastapi' },
    { label: 'Go + Fiber', value: 'go-fiber' },
  ];

  const databaseOptions = [
    { label: 'PostgreSQL (Recommended)', value: 'postgresql' },
    { label: 'MySQL', value: 'mysql' },
    { label: 'MongoDB', value: 'mongodb' },
    { label: 'SQLite', value: 'sqlite' },
  ];

  const cloudOptions = [
    { label: 'AWS (Recommended)', value: 'aws' },
    { label: 'Google Cloud', value: 'gcp' },
    { label: 'Azure', value: 'azure' },
    { label: 'None (local only)', value: 'none' },
  ];

  const infrastructureOptions = [
    { label: 'Terraform modules', value: 'terraform', checked: true },
    { label: 'Kubernetes manifests', value: 'kubernetes', checked: true },
    { label: 'Docker configuration', value: 'docker', checked: true },
    { label: 'CI/CD pipeline (GitHub Actions)', value: 'cicd', checked: true },
    { label: 'Monitoring (Prometheus + Grafana)', value: 'monitoring', checked: true },
    { label: 'CDN configuration', value: 'cdn', checked: false },
    { label: 'WAF/Security', value: 'security', checked: false },
  ];

  const handleProjectTypeSelect = (item: { value: string }) => {
    setConfig({ ...config, projectType: item.value });
    setStep('project-name');
  };

  // ... other handlers for each step

  return (
    <Box flexDirection="column" borderStyle="round" padding={1}>
      {step === 'project-type' && (
        <>
          <Text bold>What type of project are you creating?</Text>
          <Text> </Text>
          <SelectInput items={projectTypes} onSelect={handleProjectTypeSelect} />
        </>
      )}

      {step === 'project-name' && (
        <>
          <Text bold>Project Name:</Text>
          <TextInput
            value={config.projectName}
            onChange={(value) => setConfig({ ...config, projectName: value })}
            onSubmit={() => setStep('frontend')}
          />
        </>
      )}

      {/* Similar components for other steps */}

      {step === 'generating' && (
        <>
          <Text>
            <Spinner type="dots" /> Generating project structure...
          </Text>
          <Text> </Text>
          {generatedFiles.map((file, i) => (
            <Text key={i} color="green">✓ {file}</Text>
          ))}
        </>
      )}

      {step === 'done' && (
        <>
          <Text color="green" bold>
            Project '{config.projectName}' created successfully!
          </Text>
          <Text> </Text>
          <Text>Next steps:</Text>
          <Text>  1. cd {config.projectName}</Text>
          <Text>  2. npm install (in frontend/ and backend/)</Text>
          <Text>  3. docker-compose up (for local development)</Text>
          <Text>  4. nimbus chat (to continue with AI assistance)</Text>
        </>
      )}

      <Text> </Text>
      <Text color="gray">[↑/↓] Navigate  [Enter] Select  [Esc] Cancel</Text>
    </Box>
  );
};
```

#### 7.4 Template Definitions

**File**: `packages/cli/src/templates/index.ts`

```typescript
export interface TemplateDefinition {
  name: string;
  description: string;
  questions: Question[];
  generate: (answers: Record<string, any>) => Promise<GeneratedFile[]>;
}

export const templates: Record<string, TemplateDefinition> = {
  'full-stack-web': {
    name: 'Full-Stack Web Application',
    description: 'Complete web application with frontend, backend, and infrastructure',
    questions: [
      { id: 'frontend', type: 'select', label: 'Frontend Framework', options: [...] },
      { id: 'backend', type: 'select', label: 'Backend Framework', options: [...] },
      { id: 'database', type: 'select', label: 'Database', options: [...] },
      { id: 'cloud', type: 'select', label: 'Cloud Provider', options: [...] },
      { id: 'infrastructure', type: 'multiselect', label: 'Infrastructure', options: [...] },
    ],
    generate: async (answers) => {
      const files: GeneratedFile[] = [];

      // Generate application code
      files.push(...await generateFrontend(answers.frontend, answers));
      files.push(...await generateBackend(answers.backend, answers));

      // Generate infrastructure
      if (answers.infrastructure.includes('terraform')) {
        files.push(...await generateTerraform(answers));
      }
      if (answers.infrastructure.includes('kubernetes')) {
        files.push(...await generateKubernetes(answers));
      }
      if (answers.infrastructure.includes('docker')) {
        files.push(...await generateDocker(answers));
      }
      if (answers.infrastructure.includes('cicd')) {
        files.push(...await generateCICD(answers));
      }
      if (answers.infrastructure.includes('monitoring')) {
        files.push(...await generateMonitoring(answers));
      }

      return files;
    },
  },
  // ... other template definitions
};
```

---

### 8. Plugin UI Integration

#### 5.1 Plugin Browser

```bash
$ nimbus plugins search terraform

  ╭─ Available Plugins ──────────────────────────────────────╮
  │                                                          │
  │  Official                                                │
  │  ├─ @nimbus/terraform-aws         ★★★★★  (installed)    │
  │  ├─ @nimbus/terraform-gcp         ★★★★★                 │
  │  └─ @nimbus/terraform-azure       ★★★★☆                 │
  │                                                          │
  │  Community                                               │
  │  ├─ terraform-modules-library     ★★★★☆  by @cloudguru  │
  │  └─ terraform-cost-estimator      ★★★☆☆  by @finops    │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

#### 5.2 Plugin Commands

```bash
nimbus plugins list              # List installed
nimbus plugins search <query>    # Search marketplace
nimbus plugins install <name>    # Install plugin
nimbus plugins remove <name>     # Remove plugin
nimbus plugins update            # Update all
```

---

## User Stories

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-120 | As a user, I want to browse and install plugins | Plugin marketplace browsable | Sprint 9-10 |
| US-121 | As a user, I want to switch persona modes | Persona selector working | Sprint 11-12 |
| US-122 | As a user, I want rich table output | Sortable, scrollable tables | Sprint 9-10 |
| US-123 | As a user, I want diff views for changes | Side-by-side diff display | Sprint 9-10 |
| US-124 | As a user, I want autocomplete in commands | Tab completion working | Sprint 11-12 |
| US-125 | As a user, I want to read PR details with rich formatting | PR detail view shows diff, comments, reviews | Sprint 7-8 |
| US-126 | As a user, I want AI-powered PR analysis | Analysis shows quality, security, suggestions | Sprint 7-8 |
| US-127 | As a user, I want AI-generated commit messages | Commit generator analyzes staged changes | Sprint 7-8 |
| US-128 | As a user, I want to review and merge PRs from CLI | Review workflow with approve/request changes | Sprint 7-8 |
| US-129 | As a user, I want to analyze my codebase | Analysis shows architecture, quality, security | Sprint 9-10 |
| US-130 | As a user, I want to build Docker images | Build progress with layer caching info | Sprint 9-10 |
| US-131 | As a user, I want to manage Docker Compose services | Compose status, logs, actions | Sprint 9-10 |
| US-132 | As a user, I want to generate Dockerfiles interactively | Generator wizard with best practices | Sprint 9-10 |
| US-133 | As a user, I want to scaffold new projects interactively | Scaffold wizard creates full project structure | Sprint 9-10 |
| US-134 | As a user, I want to use predefined project templates | Templates for common project types | Sprint 9-10 |
| US-135 | As a user, I want scaffold to generate complete infrastructure | Terraform, K8s, Docker, CI/CD generated | Sprint 9-10 |

---

## Technical Requirements

### New Dependencies

```json
{
  "dependencies": {
    "ink-table": "^3.0.0",
    "diff": "^5.1.0",
    "fuse.js": "^7.0.0"    // Fuzzy search for autocomplete
  }
}
```

### New Project Structure

```
packages/cli/src/
├── ui/
│   ├── Table.tsx              # Enhanced tables
│   ├── ProgressBar.tsx        # Progress bars
│   ├── Tree.tsx               # File trees
│   ├── Diff.tsx               # Diff views
│   ├── MultiSelect.tsx        # Multi-select
│   ├── Autocomplete.tsx       # Autocomplete input
│   ├── ActionButtons.tsx      # Action buttons
│   ├── HistoryList.tsx        # History list
│   ├── HistoryDetail.tsx      # History detail
│   ├── PluginBrowser.tsx      # Plugin browser
│   ├── PersonaSelector.tsx    # Persona selector
│   ├── PRDetail.tsx           # PR detail view (NEW)
│   ├── PRAnalysis.tsx         # AI PR analysis (NEW)
│   ├── CommitMessageGenerator.tsx  # AI commit message (NEW)
│   ├── CodebaseAnalysis.tsx   # Codebase analysis (NEW)
│   ├── DockerBuild.tsx        # Docker build progress (NEW)
│   ├── DockerCompose.tsx      # Docker compose status (NEW)
│   ├── DockerfileGenerator.tsx # Dockerfile wizard (NEW)
│   └── ScaffoldWizard.tsx     # Project scaffold wizard (NEW)
├── templates/                  # Scaffold templates (NEW)
│   ├── index.ts               # Template registry
│   ├── full-stack-web/        # Full-stack web template
│   ├── api-service/           # API service template
│   ├── static-site/           # Static site template
│   ├── data-pipeline/         # Data pipeline template
│   ├── ml-platform/           # ML platform template
│   └── microservices/         # Microservices template
└── commands/
    ├── history.ts             # Enhanced history
    ├── plugins/
    │   ├── list.ts
    │   ├── search.ts
    │   ├── install.ts
    │   └── remove.ts
    ├── config/
    │   └── persona.ts
    ├── pr/                    # PR commands (NEW)
    │   ├── read.ts
    │   ├── comment.ts
    │   ├── review.ts
    │   ├── merge.ts
    │   ├── checkout.ts
    │   └── analyze.ts
    ├── issue/                 # Issue commands (NEW)
    │   ├── read.ts
    │   ├── comment.ts
    │   ├── close.ts
    │   └── analyze.ts
    ├── commit.ts              # AI commit command (NEW)
    ├── analyze.ts             # Codebase analysis (NEW)
    └── docker/                # Docker commands (NEW)
        ├── build.ts
        ├── push.ts
        ├── run.ts
        ├── ps.ts
        ├── logs.ts
        ├── stop.ts
        ├── compose/
        │   ├── up.ts
        │   ├── down.ts
        │   └── logs.ts
        └── init.ts
    └── scaffold.ts            # Project scaffolding command (NEW)
```

---

## Sprint Breakdown

### Sprint 7-8 (Weeks 1-4) - GitHub & Git Operations

| Task | Effort | Deliverable |
|------|--------|-------------|
| PR detail view component | 3 days | Rich PR display |
| PR analysis UI component | 3 days | AI analysis display |
| Commit message generator UI | 2 days | AI commit workflow |
| PR commands (read, comment, review) | 4 days | Full PR workflow |
| PR merge and checkout commands | 2 days | PR actions |
| Issue commands (read, comment, close) | 2 days | Issue management |
| Issue/PR analyze commands | 2 days | AI analysis |

### Sprint 9-10 (Weeks 5-8) - Docker, Scaffold & Enhanced UI

| Task | Effort | Deliverable |
|------|--------|-------------|
| Enhanced table component | 3 days | Sortable tables |
| Progress bar component | 1 day | Visual progress |
| Tree view component | 2 days | File structure display |
| Diff view component | 3 days | Change visualization |
| Multi-select component | 2 days | Checkbox lists |
| Docker build UI component | 2 days | Build progress display |
| Docker compose UI component | 2 days | Service status display |
| Dockerfile generator UI | 2 days | Interactive generator |
| Docker commands (build, push, run) | 3 days | Docker operations |
| Docker compose commands | 2 days | Compose operations |
| Codebase analysis UI | 3 days | Analysis dashboard |
| Codebase analyze command | 2 days | Analysis command |
| **Scaffold wizard UI** | 3 days | Interactive project scaffolding |
| **Scaffold templates** | 3 days | Full-stack, API, ML platform templates |
| **Scaffold generation engine** | 2 days | Template-based file generation |

### Sprint 11-12 (Weeks 9-12) - Plugins & Polish

| Task | Effort | Deliverable |
|------|--------|-------------|
| Autocomplete component | 3 days | Tab completion |
| History UI overhaul | 4 days | Rich history view |
| Plugin browser UI | 4 days | Plugin marketplace |
| Persona selector | 2 days | Persona switching |
| Polish and testing | 4 days | Beta-ready |

---

## Acceptance Criteria

### Core UI Components
- [ ] All table outputs are sortable and scrollable
- [ ] Diff views show clear additions/deletions
- [ ] Multi-select works with keyboard navigation
- [ ] Autocomplete responds in < 50ms
- [ ] History shows detailed operation info
- [ ] Plugin browser shows ratings and descriptions
- [ ] Persona mode affects chat UI styling
- [ ] All new components have unit tests

### GitHub/PR Operations
- [ ] `nimbus pr read` displays full PR details with diff
- [ ] `nimbus pr analyze` shows AI-powered insights
- [ ] `nimbus pr review` supports approve/request changes
- [ ] `nimbus pr merge` handles merge with options
- [ ] `nimbus commit` generates contextual commit messages
- [ ] `nimbus analyze` provides codebase insights

### Docker Operations
- [ ] `nimbus docker build` shows layer-by-layer progress
- [ ] `nimbus docker compose up` displays service status
- [ ] `nimbus docker init` generates best-practice Dockerfiles
- [ ] Docker commands handle errors gracefully

---

## Integration Points

### With MCP Tools Team
- PR operations use `github_pr_read`, `github_pr_review`, `github_pr_merge` tools
- Commit message uses `github_commit_message_generate` tool
- Analysis uses `github_pr_analyze`, `github_issue_analyze` tools
- Docker uses `docker_build`, `docker_push`, `docker_run`, `docker_compose_up` tools

### With Core Engine
- AI analysis routed through LLM abstraction layer
- Codebase analysis uses file system tools for traversal
- Results cached in state layer for history

### With LLM Integration
- Commit message generation uses structured prompts
- PR/Issue analysis uses context-aware prompts
- Codebase analysis uses multi-pass analysis

---

*Document Version: 2.0*
*Last Updated: January 2026*
