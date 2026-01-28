# Nimbus MVP - Implementation Plan

> **Version**: 2.1 (Microservices Architecture)
> **Last Updated**: January 28, 2026
> **Timeline**: 12 weeks (3 months)
> **Architecture**: Microservices with Bun Runtime
> **Status**: 🚧 IN PROGRESS (Week 5-6 Sprint 3)
> **Completion**: ~35% (4/12 services fully implemented)
>
> **📋 Architecture Reference**: For detailed architecture patterns, deployment strategies, and service templates, see [MICROSERVICES_ARCHITECTURE.md](./MICROSERVICES_ARCHITECTURE.md)
>
> **🎯 Current Phase**: Phase 2 - Core Services & MCP Tools (Sprint 3)

---

## 📊 Executive Summary (as of January 28, 2026)

### Current Progress: Week 5-6 (Sprint 3)

**Overall Completion: ~35% (4/12 services fully implemented)**

### ✅ Completed Services (Production Ready)

| Service | Routes | Features | Tests | Status |
|---------|--------|----------|-------|--------|
| **LLM Service** | 5 | Multi-provider routing (Anthropic, OpenAI, Google, Ollama), cost optimization, fallback logic | ✅ | ✅ READY |
| **State Service** | 6 modules | Configuration, credentials, conversations, artifacts, templates, history | ✅ | ✅ READY |
| **Generator Service** | 15 | Questionnaire engine, template rendering, best practices (50+ rules), conversational mode | ✅ | ✅ READY |
| **Core Engine Service** | 6 modules | Task orchestration, planner, executor, verifier, safety checks, statistics | ✅ | ✅ READY |

### ⚠️ Scaffold Services (Health Endpoint Only)

| Service | Status | Priority |
|---------|--------|----------|
| Git Tools Service | Health endpoint only | HIGH |
| Filesystem Tools Service | Health endpoint only | HIGH |
| Terraform Tools Service | Health endpoint only | HIGH |
| Kubernetes Tools Service | Health endpoint only | MEDIUM |
| Helm Tools Service | Health endpoint only | MEDIUM |
| AWS Tools Service | Health endpoint only | MEDIUM |
| GitHub Tools Service | Health endpoint only | LOW |
| CLI Service | Health endpoint only | HIGH |

### 🎯 Key Achievements

1. **Shared Libraries Foundation** ✅
   - Types, Utils, Clients packages fully implemented
   - Standardized REST/WebSocket communication
   - Centralized logging and error handling

2. **AI/LLM Infrastructure** ✅
   - 4 LLM providers integrated
   - Intelligent routing with cost optimization
   - Provider fallback on failure

3. **State Management** ✅
   - SQLite + in-memory storage
   - Configuration management with Zod validation
   - Secure credential handling

4. **Code Generation** ✅
   - Questionnaire-based generation
   - 50+ best practice rules with autofixes
   - Template engine with Handlebars

5. **Agent Orchestration** ✅
   - Plan-Execute-Verify cycle
   - Safety checks (pre/during/post execution)
   - Real-time event streaming via WebSocket

### 🚧 Next Priorities (Sprint 4-5)

1. **Implement MCP Tools Services**
   - Git, FS, Terraform operations (HIGH priority)
   - K8s, Helm, AWS operations (MEDIUM priority)

2. **Implement CLI Service**
   - Interactive terminal UI with Ink
   - Command structure with Commander
   - Integration with Core Engine

3. **Docker Compose Setup**
   - Service orchestration
   - Health checks
   - Environment configuration

### 📈 Technical Metrics

- **Total Services**: 12
- **Fully Implemented**: 4 (33%)
- **Scaffold Only**: 8 (67%)
- **Total API Routes**: 60+ (implemented in 4 services)
- **LLM Providers**: 4 (Anthropic, OpenAI, Google, Ollama)
- **Best Practice Rules**: 50+
- **Test Coverage**: 80%+ for implemented services
- **CI/CD**: GitHub Actions (type-check, test, build)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Phase 1: Foundation & Shared Infrastructure](#phase-1-foundation--shared-infrastructure-sprints-1-2-weeks-1-4)
4. [Phase 2: Core Services & MCP Tools](#phase-2-core-services--mcp-tools-sprints-3-4-weeks-5-8)
5. [Phase 3: CLI Service & Integration](#phase-3-cli-service--integration-sprints-5-6-weeks-9-12)
6. [Critical Path](#critical-path-items)
7. [Service Dependencies](#service-dependency-graph)
8. [Acceptance Criteria](#acceptance-criteria)
9. [Team Coordination](#team-coordination)

---

## Architecture Overview

### Core Principles

- **Architecture**: Granular microservices (12 independent services)
- **Runtime**: Bun for all services
- **Package Manager**: Bun workspaces
- **Communication**: REST APIs + WebSocket streaming
- **Deployment**:
  - **Local**: Bun processes (ports 3000-3011)
  - **Staging**: Docker + Docker Compose
  - **Production**: Docker + Kubernetes

### Services Inventory

| Service | Port | Technology | Purpose |
|---------|------|------------|---------|
| CLI Service | 3000, 3100 | Bun + Ink | Terminal user interface |
| Core Engine Service | 3001, 3101 | Bun | Agent orchestration & execution |
| LLM Service | 3002, 3102 | Bun | LLM provider abstraction |
| Generator Service | 3003, 3103 | Bun + Handlebars | Infrastructure code generation |
| Git Tools Service | 3004 | Bun | Git operations |
| File System Tools Service | 3005 | Bun | File system operations |
| Terraform Tools Service | 3006 | Bun | Terraform operations |
| Kubernetes Tools Service | 3007 | Bun | Kubernetes operations |
| Helm Tools Service | 3008 | Bun | Helm operations |
| Cloud CLI Service (AWS) | 3009 | Bun | AWS CLI operations |
| GitHub Tools Service | 3010 | Bun | GitHub PR/Issue operations |
| State Service | 3011 | Bun + SQLite | Data persistence |

**Note**: Even-numbered ports (300x) are HTTP REST APIs, odd-numbered ports (310x) are WebSocket endpoints.

---

## Project Structure

```
nimbus/
├── services/                         # 12 microservices
│   ├── cli-service/
│   ├── core-engine-service/
│   ├── llm-service/
│   ├── generator-service/
│   ├── git-tools-service/
│   ├── fs-tools-service/
│   ├── terraform-tools-service/
│   ├── k8s-tools-service/
│   ├── helm-tools-service/
│   ├── aws-tools-service/
│   ├── github-tools-service/
│   └── state-service/
│
├── shared/                           # Shared workspace libraries
│   ├── types/                        # @nimbus/shared-types
│   ├── utils/                        # @nimbus/shared-utils
│   └── clients/                      # @nimbus/shared-clients
│
├── docs/                             # Documentation
├── tests/                            # E2E tests
├── scripts/                          # Build & deployment scripts
├── bunfig.toml                       # Bun workspace config
├── docker-compose.yml                # Staging orchestration
├── .github/workflows/                # CI/CD pipelines
└── README.md
```

### Service Template Structure

Each service follows this structure:

```
services/<service-name>/
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # Bun.serve HTTP server
│   ├── websocket.ts          # WebSocket server (if needed)
│   ├── routes/               # API route handlers
│   │   ├── health.ts         # GET /health
│   │   └── ...               # Service-specific routes
│   ├── core/                 # Business logic
│   ├── clients/              # REST clients for other services
│   └── utils/                # Utilities
├── tests/
│   ├── unit/
│   └── integration/
├── package.json              # Bun package config
├── tsconfig.json
├── Dockerfile
├── .env.example
└── README.md
```

---

## PHASE 1: Foundation & Shared Infrastructure (Sprints 1-2, Weeks 1-4)

### Sprint 1 (Week 1-2): Project Setup & Shared Libraries ✅ COMPLETED

#### Infrastructure Setup

**1. Initialize Workspace Structure** ✅

- [x] Create root directory structure
  ```bash
  mkdir -p nimbus/{services,shared/{types,utils,clients},docs,tests,scripts}
  ```

- [x] Initialize Bun workspace
  ```bash
  cd nimbus
  bun init
  ```

- [x] Create `bunfig.toml`
  ```toml
  [workspace]
  members = [
    "services/*",
    "shared/*"
  ]

  [install]
  cache = ".bun-cache"
  lockfile = true

  [test]
  coverage = true
  ```

**2. Version Control & CI/CD** ✅

- [x] Initialize Git repository
  ```bash
  git init
  git add .
  git commit -m "Initial commit: Workspace structure"
  ```

- [x] Create `.gitignore`
  ```
  node_modules/
  .bun-cache/
  dist/
  *.log
  .env
  .env.local
  coverage/
  ```

- [x] Set up GitHub repository and push

- [x] Create GitHub Actions CI/CD pipeline (`.github/workflows/ci.yml` and `codeql.yml`)
  ```yaml
  name: CI

  on: [push, pull_request]

  jobs:
    build:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v3
        - uses: oven-sh/setup-bun@v1
        - run: bun install
        - run: bun test
        - run: bun run build:all
  ```

**3. TypeScript Configuration** ✅

- [x] Create `tsconfig.base.json` (root)
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "ESNext",
      "moduleResolution": "bundler",
      "lib": ["ES2022"],
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "forceConsistentCasingInFileNames": true,
      "resolveJsonModule": true,
      "allowSyntheticDefaultImports": true,
      "types": ["bun-types"]
    }
  }
  ```

- [x] Each service extends this with:
  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "outDir": "./dist",
      "rootDir": "./src"
    },
    "include": ["src/**/*"],
    "exclude": ["node_modules", "dist", "tests"]
  }
  ```

**4. Code Quality Tools** ⚠️ PARTIAL

- [ ] Install ESLint + Prettier (Not yet implemented)
  ```bash
  bun add -D eslint prettier @typescript-eslint/parser @typescript-eslint/eslint-plugin
  ```

- [ ] Create `.eslintrc.json` (Not yet implemented)
  ```json
  {
    "parser": "@typescript-eslint/parser",
    "extends": [
      "eslint:recommended",
      "plugin:@typescript-eslint/recommended"
    ],
    "rules": {
      "@typescript-eslint/no-explicit-any": "warn"
    }
  }
  ```

- [ ] Create `.prettierrc`
  ```json
  {
    "semi": true,
    "trailingComma": "es5",
    "singleQuote": true,
    "printWidth": 100,
    "tabWidth": 2
  }
  ```

#### Shared Libraries

**1. @nimbus/shared-types** ✅ COMPLETED

- [x] Initialize package
  ```bash
  cd shared/types
  bun init
  ```

- [x] Create `package.json`
  ```json
  {
    "name": "@nimbus/shared-types",
    "version": "0.1.0",
    "type": "module",
    "main": "./src/index.ts",
    "types": "./src/index.ts",
    "exports": {
      ".": "./src/index.ts"
    }
  }
  ```

- [x] Create type definitions:
  - [x] `src/service.ts` - Service health, status types
  - [x] `src/request.ts` - RequestEnvelope, UserRequest, RequestContext
  - [x] `src/response.ts` - ResponseEnvelope, AgentResponse, ErrorResponse
  - [x] `src/plan.ts` - Plan, PlanStep, ExecutionPlan types
  - [x] `src/config.ts` - Configuration, Environment, Provider types
  - [x] `src/index.ts` - Export all types

**Example** `src/request.ts`:
```typescript
export interface UserRequest {
  input: string;
  context?: RequestContext;
  options?: RequestOptions;
}

export interface RequestContext {
  currentDirectory?: string;
  cloudProvider?: 'aws' | 'gcp' | 'azure';
  kubeContext?: string;
  gitBranch?: string;
}

export interface RequestOptions {
  dryRun?: boolean;
  autoApprove?: boolean;
  verbose?: boolean;
}
```

**2. @nimbus/shared-utils** ✅ COMPLETED

- [x] Initialize package
  ```bash
  cd shared/utils
  bun init
  ```

- [x] Create utilities:
  - [x] `src/logger.ts` - Structured logging utility with multiple log levels
  - [x] `src/errors.ts` - Custom error classes (ServiceUnavailableError, TimeoutError, ValidationError)
  - [x] `src/validation.ts` - Input validation helpers with Zod integration
  - [x] `src/env.ts` - Environment variable helpers with type safety
  - [x] `src/index.ts` - Export all utilities

**Example** `src/logger.ts`:
```typescript
export class Logger {
  constructor(private serviceName: string) {}

  info(message: string, meta?: Record<string, unknown>) {
    console.log(JSON.stringify({
      level: 'info',
      service: this.serviceName,
      message,
      ...meta,
      timestamp: new Date().toISOString(),
    }));
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>) {
    console.error(JSON.stringify({
      level: 'error',
      service: this.serviceName,
      message,
      error: error?.message,
      stack: error?.stack,
      ...meta,
      timestamp: new Date().toISOString(),
    }));
  }

  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(JSON.stringify({
      level: 'warn',
      service: this.serviceName,
      message,
      ...meta,
      timestamp: new Date().toISOString(),
    }));
  }
}
```

**3. @nimbus/shared-clients** ✅ COMPLETED

- [x] Initialize package
  ```bash
  cd shared/clients
  bun init
  ```

- [x] Create client abstractions:
  - [x] `src/rest-client.ts` - Base REST client with retry logic, timeouts, error handling
  - [x] `src/ws-client.ts` - Base WebSocket client with reconnection logic
  - [x] `src/service-discovery.ts` - Dynamic service URL resolution
  - [x] `src/index.ts` - Export all clients

**Example** `src/rest-client.ts`:
```typescript
export class RestClient {
  constructor(private baseURL: string) {}

  async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseURL}${path}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseURL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseURL}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }

  async delete<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseURL}${path}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }
}
```

**4. Service Template Generator** ⚠️ DEFERRED

- [ ] Create `scripts/create-service.ts` (Not yet implemented, services created manually)
  ```typescript
  #!/usr/bin/env bun

  const serviceName = process.argv[2];
  if (!serviceName) {
    console.error('Usage: bun run create-service <service-name>');
    process.exit(1);
  }

  // Generate service structure...
  ```

- [x] All 12 services created with:
  - Basic service structure
  - Health check endpoint
  - package.json with Bun scripts
  - README.md placeholder
- [ ] Dockerfile (Deferred to Sprint 5)

### Sprint 2 (Week 3-4): Core Services Foundation ✅ COMPLETED

#### State Service (`services/state-service/`) ✅ FULLY IMPLEMENTED

**1. Initialize Service** ✅

- [x] Create service directory and initialize
  ```bash
  cd services
  bun run ../scripts/create-service state-service
  cd state-service
  ```

- [x] Install dependencies
  ```bash
  bun add @nimbus/shared-types @nimbus/shared-utils
  bun add better-sqlite3  # For local/staging
  ```

**2. Implement HTTP Server** ✅

- [x] Create `src/server.ts` with Bun.serve
  ```typescript
  import { Logger } from '@nimbus/shared-utils';
  import { router } from './routes';

  const logger = new Logger('state-service');
  const PORT = process.env.PORT || 3011;

  Bun.serve({
    port: PORT,
    fetch: async (req) => {
      logger.info(`${req.method} ${new URL(req.url).pathname}`);
      return router.handle(req);
    },
  });

  logger.info(`State Service running on port ${PORT}`);
  ```

**3. Implement Routes** ✅

- [x] `src/routes/health.ts` - Health check endpoint
  ```typescript
  export async function healthCheck(req: Request): Promise<Response> {
    return Response.json({
      status: 'healthy',
      service: 'state-service',
      version: '0.1.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }
  ```

- [x] `src/routes/config.ts` - Configuration management
  - `GET /api/state/config` - Read full configuration
  - `GET /api/state/config/:key` - Read specific key
  - `PUT /api/state/config` - Update configuration
  - `POST /api/state/config/validate` - Validate configuration

- [x] `src/routes/credentials.ts` - Provider credentials
  - `GET /api/state/credentials` - List all providers
  - `GET /api/state/credentials/:provider` - Get credentials for provider
  - `PUT /api/state/credentials/:provider` - Update credentials
  - `DELETE /api/state/credentials/:provider` - Delete credentials

- [x] `src/routes/conversations.ts` - Conversation history
  - `POST /api/state/conversations` - Save conversation
  - `GET /api/state/conversations/:id` - Get conversation
  - `GET /api/state/conversations` - List conversations

- [x] `src/routes/artifacts.ts` - Generated artifacts
  - `POST /api/state/artifacts` - Save artifact
  - `GET /api/state/artifacts/:id` - Get artifact
  - `GET /api/state/artifacts` - List artifacts

- [x] `src/routes/templates.ts` - Template management
  - `GET /api/state/templates` - List templates
  - `GET /api/state/templates/:id` - Get template
  - `POST /api/state/templates` - Save template

- [x] `src/routes/history.ts` - Execution history
  - `GET /api/state/history` - Query operation history
  - `POST /api/state/history` - Save operation

**4. Implement Storage Layer** ✅

- [x] Create `src/storage/sqlite-adapter.ts` - SQLite storage for persistent data
  ```typescript
  import * as fs from 'fs/promises';
  import * as path from 'path';

  export class FileStorageAdapter {
    constructor(private basePath: string = '~/.nimbus') {}

    async save(key: string, data: unknown): Promise<void> {
      const filePath = path.join(this.basePath, `${key}.json`);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    }

    async load(key: string): Promise<unknown> {
      const filePath = path.join(this.basePath, `${key}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    }
  }
  ```

- [x] Create `src/storage/memory-adapter.ts` - In-memory storage for testing
- [x] Create `src/config/configuration-manager.ts` - Configuration management with YAML support
- [x] Create `src/config/configuration-schema.ts` - Zod validation schemas
- [x] Create `src/credentials/credentials-manager.ts` - Secure credential handling
  ```typescript
  import Database from 'better-sqlite3';

  export class SQLiteStorageAdapter {
    private db: Database.Database;

    constructor(dbPath: string = '~/.nimbus/nimbus.db') {
      this.db = new Database(dbPath);
      this.initialize();
    }

    private initialize() {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS artifacts (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          path TEXT,
          content TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS credentials (
          provider TEXT PRIMARY KEY,
          encrypted_data TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
    }
  }
  ```

**5. Create Dockerfile** ⚠️ DEFERRED

- [ ] Create `Dockerfile` (Deferred to Sprint 5 - Docker Compose setup)
  ```dockerfile
  FROM oven/bun:1 as base
  WORKDIR /app

  # Install dependencies
  COPY package.json bun.lockb ./
  RUN bun install --frozen-lockfile

  # Copy source
  COPY src ./src
  COPY tsconfig.json ./

  # Build
  RUN bun build src/index.ts --outdir=dist --target=bun

  # Production stage
  FROM oven/bun:1-slim
  WORKDIR /app

  COPY --from=base /app/dist ./dist
  COPY --from=base /app/node_modules ./node_modules

  EXPOSE 3011

  CMD ["bun", "run", "dist/index.js"]
  ```

**6. Testing** ✅

- [x] Write tests (`tests/`)
  - [x] Health endpoint tests
  - [x] Configuration manager tests
  - [x] Storage adapter tests

- [x] Target: 80% code coverage (ACHIEVED)

#### LLM Service (`services/llm-service/`) ✅ FULLY IMPLEMENTED

**1. Initialize Service** ✅

- [x] Create service and install dependencies
  ```bash
  bun run ../scripts/create-service llm-service
  cd llm-service
  bun add @anthropic-ai/sdk openai @google/generative-ai ollama
  bun add @nimbus/shared-types @nimbus/shared-utils @nimbus/shared-clients
  ```

**2. Implement Provider Interface** ✅

- [x] Create `src/providers/base.ts` with message/response conversion
  ```typescript
  import type { LLMMessage, LLMResponse, ModelConfig } from '@nimbus/shared-types';

  export interface LLMProvider {
    chat(messages: LLMMessage[], config?: ModelConfig): Promise<LLMResponse>;
    stream(messages: LLMMessage[], config?: ModelConfig): AsyncIterator<string>;
    listModels(): Promise<string[]>;
  }
  ```

- [x] Create `src/providers/anthropic.ts` (Claude Sonnet 4, Haiku 4, Opus 4)
  ```typescript
  import Anthropic from '@anthropic-ai/sdk';
  import type { LLMProvider } from './base';

  export class AnthropicProvider implements LLMProvider {
    private client: Anthropic;

    constructor(apiKey: string) {
      this.client = new Anthropic({ apiKey });
    }

    async chat(messages, config) {
      const response = await this.client.messages.create({
        model: config?.model || 'claude-sonnet-4-20250514',
        messages,
        max_tokens: config?.maxTokens || 4096,
      });

      return {
        content: response.content[0].text,
        model: response.model,
        usage: response.usage,
      };
    }

    async *stream(messages, config) {
      const stream = await this.client.messages.create({
        model: config?.model || 'claude-sonnet-4-20250514',
        messages,
        max_tokens: config?.maxTokens || 4096,
        stream: true,
      });

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta') {
          yield chunk.delta.text;
        }
      }
    }

    async listModels() {
      return [
        'claude-opus-4-20250514',
        'claude-sonnet-4-20250514',
        'claude-haiku-4-20250514',
      ];
    }
  }
  ```

- [x] Create `src/providers/openai.ts` - OpenAI provider (GPT-4, GPT-3.5)
- [x] Create `src/providers/ollama.ts` - Ollama provider (local models)
- [x] Create `src/providers/google.ts` - Google AI provider (Gemini models)

**3. Implement Intelligent Router** ✅

- [x] Create `src/router/llm-router.ts` with:
  - Cost optimization logic
  - Provider fallback on failure
  - Model selection based on task complexity
  - Usage tracking
  ```typescript
  import { AnthropicProvider } from './providers/anthropic';
  import { OpenAIProvider } from './providers/openai';
  import type { LLMProvider } from './providers/base';

  export class ProviderFactory {
    static create(provider: string): LLMProvider {
      switch (provider) {
        case 'anthropic':
          return new AnthropicProvider(process.env.ANTHROPIC_API_KEY!);
        case 'openai':
          return new OpenAIProvider(process.env.OPENAI_API_KEY!);
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }
    }
  }
  ```

**4. Implement Routes** ✅

- [x] `src/routes/chat.ts`
  - `POST /api/llm/chat` - Non-streaming chat completions
  - `POST /api/llm/chat/tools` - Tool calling support
  ```typescript
  // Fully implemented with LLMRouter for intelligent routing
  export async function chat(req: Request): Promise<Response> {
    const { messages, provider, config } = await req.json();
    const router = new LLMRouter();
    const response = await router.route(messages, { provider, ...config });
    return Response.json(response);
  }
  ```

- [x] `src/routes/models.ts`
  - `GET /api/llm/models` - List available models for all providers

- [x] `src/routes/tokens.ts`
  - `POST /api/llm/tokens/count` - Token counting for messages

- [x] `src/routes/health.ts`
  - `GET /health` - Service health check

**5. Implement WebSocket Streaming** ⚠️ PARTIAL

- [x] Create `src/websocket.ts` (Basic structure, needs full implementation)
  ```typescript
  import { ProviderFactory } from './provider-factory';

  export function handleWebSocket(ws: WebSocket) {
    ws.on('message', async (data) => {
      const { type, payload } = JSON.parse(data.toString());

      if (type === 'stream') {
        const { messages, provider, config } = payload;
        const llm = ProviderFactory.create(provider || 'anthropic');

        for await (const chunk of llm.stream(messages, config)) {
          ws.send(JSON.stringify({ type: 'chunk', data: chunk }));
        }

        ws.send(JSON.stringify({ type: 'done' }));
      }
    });
  }
  ```

- [ ] Add WebSocket server to `src/server.ts`
  ```typescript
  const server = Bun.serve({
    port: 3002,
    fetch: router.handle,
    websocket: {
      open: handleWebSocket,
      message: handleWebSocket,
    },
  });
  ```

**6. Create Dockerfile** ⚠️ DEFERRED

- [ ] Create Dockerfile (Deferred to Sprint 5)

**7. Testing** ✅

- [x] Write integration tests
  - [x] Health endpoint tests
  - [x] Provider initialization tests
  - [x] Router logic tests
- [x] Target: 80% coverage (ACHIEVED)

---

## PHASE 2: Core Services & MCP Tools (Sprints 3-4, Weeks 5-8) 🚧 IN PROGRESS

### Sprint 3 (Week 5-6): Core Engine & MCP Tools (Part 1) ✅ CORE ENGINE COMPLETED

#### Core Engine Service (`services/core-engine-service/`) ✅ FULLY IMPLEMENTED

**1. Initialize Service** ✅

- [x] Create service structure
- [x] Install dependencies
  ```bash
  bun add @nimbus/shared-types @nimbus/shared-utils @nimbus/shared-clients elysia
  ```

**2. Implement Agents** ✅

- [x] Create `src/agents/planner.ts` with:
  - Multi-step plan generation
  - Risk assessment
  - Plan validation and optimization
  ```typescript
  import type { UserRequest, Plan } from '@nimbus/shared-types';
  import { RestClient } from '@nimbus/shared-clients';

  export class Planner {
    private llmClient: RestClient;

    constructor(llmServiceUrl: string) {
      this.llmClient = new RestClient(llmServiceUrl);
    }

    async createPlan(request: UserRequest): Promise<Plan> {
      // 1. Parse user intent using LLM
      const intent = await this.parseIntent(request);

      // 2. Determine required steps
      const steps = await this.determineSteps(intent);

      // 3. Optimize execution order
      const optimizedSteps = this.optimizeExecution(steps);

      return {
        id: crypto.randomUUID(),
        intent: intent.description,
        steps: optimizedSteps,
        context: intent.context,
        estimatedDuration: this.estimateDuration(optimizedSteps),
      };
    }

    private async parseIntent(request: UserRequest) {
      const response = await this.llmClient.post('/api/llm/chat', {
        messages: [
          { role: 'system', content: INTENT_PARSER_PROMPT },
          { role: 'user', content: request.input },
        ],
      });
      return response;
    }
  }
  ```

- [x] Create `src/agents/executor.ts` - Execute plan steps with error handling
- [x] Create `src/agents/verifier.ts` - Verify execution results
- [x] Create `src/orchestrator/agent-orchestrator.ts` - Coordinate all agents with:
  - Task management
  - Plan-Execute-Verify cycle
  - Event emission
  - Statistics collection

**3. Implement Safety Manager** ✅

- [x] Create `src/safety/safety-manager.ts` with:
  - Pre-execution checks (cost boundaries, resource quotas)
  - During-execution monitoring
  - Post-execution verification
  - Rollback capability assessment
  ```typescript
  import type { Plan, SafetyCheck } from '@nimbus/shared-types';

  export class SafetyManager {
    async checkPlan(plan: Plan): Promise<SafetyCheck> {
      const operationType = this.classifyOperation(plan);
      const resources = this.extractResources(plan);

      return {
        requiresConfirmation: this.needsConfirmation(operationType),
        level: operationType,
        resources,
        message: this.generateSafetyMessage(operationType, resources),
      };
    }

    private classifyOperation(plan: Plan): 'read' | 'create' | 'update' | 'delete' {
      // Analyze plan steps to determine operation type
      const hasDelete = plan.steps.some(s =>
        ['terraform_destroy', 'k8s_delete'].includes(s.tool!)
      );
      if (hasDelete) return 'delete';

      // ... more classification logic
      return 'read';
    }
  }
  ```

**4. Implement REST Clients** ⚠️ DEFERRED

- [ ] Create `src/clients/llm.ts` (Will use @nimbus/shared-clients)
  ```typescript
  import { RestClient } from '@nimbus/shared-clients';

  export class LLMServiceClient {
    private client: RestClient;

    constructor() {
      this.client = new RestClient(process.env.LLM_SERVICE_URL!);
    }

    async chat(messages) {
      return this.client.post('/api/llm/chat', { messages });
    }
  }
  ```

- [ ] Create `src/clients/state.ts` (Will use @nimbus/shared-clients)
- [ ] Create `src/clients/mcp-tools.ts` (Will use @nimbus/shared-clients)

**5. Implement Routes** ✅

- [x] `src/routes/task.ts`
  - `POST /api/core/tasks` - Create new task
  - `GET /api/core/tasks/:id` - Get task status
  - `GET /api/core/tasks` - List all tasks
  - `POST /api/core/tasks/:id/execute` - Execute task
  - `POST /api/core/tasks/:id/cancel` - Cancel task
  - `GET /api/core/tasks/:id/events` - Get task events

- [x] `src/routes/plan.ts`
  - `POST /api/core/plans/generate` - Generate execution plan
  - `POST /api/core/plans/validate` - Validate plan
  - `POST /api/core/plans/optimize` - Optimize plan
  ```typescript
  // POST /api/core/plan
  export async function createPlan(req: Request): Promise<Response> {
    const userRequest = await req.json();
    const orchestrator = new AgentOrchestrator(config);
    const plan = await orchestrator.planner.createPlan(userRequest);

    // Save plan to state service
    await stateClient.post('/api/state/plans', { plan });

    return Response.json({ plan });
  }
  ```

- [x] `src/routes/safety.ts`
  - `POST /api/core/safety/pre-check` - Pre-execution safety check
  - `POST /api/core/safety/during-check` - During-execution check
  - `POST /api/core/safety/post-check` - Post-execution check

- [x] `src/routes/statistics.ts`
  - `GET /api/core/statistics` - Get system statistics
  - `GET /api/core/statistics/events` - Get recent events

- [x] `src/routes/health.ts`
  - `GET /health` - Service health check

**6. Implement WebSocket Streaming** ✅

- [x] Create `src/websocket/ws-server.ts` for real-time event streaming
  - Task progress updates
  - Plan generation status
  - Execution events

**7. Create Dockerfile** ⚠️ DEFERRED

- [ ] Create Dockerfile (Deferred to Sprint 5)

**8. Testing** ✅

- [x] Unit tests for all agents
  - [x] Planner tests
  - [x] Executor tests
  - [x] Verifier tests
  - [x] Orchestrator tests
  - [x] Safety manager tests
- [x] Target: 80% coverage (ACHIEVED)

#### Git Tools Service (`services/git-tools-service/`) ⚠️ SCAFFOLD ONLY

**1. Initialize Service** ✅

- [x] Create service structure (scaffold with health endpoint)
- [ ] Install dependencies (TODO: Add git operation libraries)

**2. Implement Git Operations** ❌ NOT STARTED

- [ ] Create `src/git/clone.ts` (TODO)
  ```typescript
  import { exec } from 'child_process';
  import { promisify } from 'util';

  const execAsync = promisify(exec);

  export async function clone(url: string, path?: string): Promise<void> {
    const command = path ? `git clone ${url} ${path}` : `git clone ${url}`;
    await execAsync(command);
  }
  ```

- [ ] Create `src/git/status.ts` (TODO)
- [ ] Create `src/git/add.ts` (TODO)
- [ ] Create `src/git/commit.ts` (TODO)
- [ ] Create `src/git/push.ts` (TODO)
- [ ] Create `src/git/pull.ts` (TODO)
- [ ] Create `src/git/branch.ts` (TODO)
- [ ] Create `src/git/checkout.ts` (TODO)
- [ ] Create `src/git/diff.ts` (TODO)
- [ ] Create `src/git/log.ts` (TODO)
- [ ] Create `src/git/merge.ts` (TODO)
- [ ] Create `src/git/stash.ts` (TODO)

**3. Implement Routes** ❌ NOT STARTED

- [x] `GET /health` (only endpoint implemented)
- [ ] All Git operation routes (TODO)

**4. Create Dockerfile** ⚠️ DEFERRED

- [ ] Create Dockerfile (Deferred to Sprint 5)

**5. Testing** ❌ NOT STARTED

- [x] Health endpoint test only
- [ ] Integration tests with real Git repositories (TODO)
- [ ] Target: 80% coverage

#### File System Tools Service (`services/fs-tools-service/`) ⚠️ SCAFFOLD ONLY

**1. Initialize Service** ✅

- [x] Create service structure (scaffold with health endpoint)

**2. Implement File Operations** ❌ NOT STARTED

- [ ] Create `src/fs/read.ts` (TODO)
  ```typescript
  import * as fs from 'fs/promises';

  export async function readFile(path: string): Promise<string> {
    return fs.readFile(path, 'utf-8');
  }
  ```

- [ ] Create `src/fs/write.ts` (TODO)
- [ ] Create `src/fs/list.ts` (TODO)
- [ ] Create `src/fs/search.ts` (TODO - using ripgrep)
- [ ] Create `src/fs/tree.ts` (TODO)
- [ ] Create `src/fs/diff.ts` (TODO)

**3. Implement Routes** ❌ NOT STARTED

- [x] `GET /health` (only endpoint implemented)
- [ ] All file system operation routes (TODO)

**4. Create Dockerfile** ⚠️ DEFERRED

- [ ] Create Dockerfile (Deferred to Sprint 5)

**5. Testing** ❌ NOT STARTED

- [x] Health endpoint test only
- [ ] Unit tests for all file operations (TODO)
- [ ] Target: 80% coverage

### Sprint 4 (Week 7-8): Generator Service & MCP Tools (Part 2) ✅ GENERATOR COMPLETED

#### Generator Service (`services/generator-service/`) ✅ FULLY IMPLEMENTED

**1. Initialize Service** ✅

- [x] Create service structure
- [x] Install dependencies
  ```bash
  bun add handlebars @nimbus/shared-types @nimbus/shared-utils @nimbus/shared-clients elysia
  ```

**2. Implement Template Engine** ✅

- [x] Create `src/templates/template-loader.ts` - Load templates from filesystem
- [x] Create `src/templates/template-renderer.ts` - Handlebars-based rendering
  - Variable extraction
  - Syntax validation
  - Dynamic rendering
  ```typescript
  import Handlebars from 'handlebars';
  import * as fs from 'fs/promises';

  export class TemplateEngine {
    private handlebars: typeof Handlebars;

    constructor() {
      this.handlebars = Handlebars.create();
      this.registerHelpers();
    }

    async render(templatePath: string, data: unknown): Promise<string> {
      const templateSource = await fs.readFile(templatePath, 'utf-8');
      const template = this.handlebars.compile(templateSource);
      return template(data);
    }

    private registerHelpers() {
      this.handlebars.registerHelper('upper', (str) => str.toUpperCase());
      // More helpers...
    }
  }
  ```

**3. Create Terraform Templates** ⚠️ PARTIAL

- [ ] Create `templates/aws/vpc.hbs` (TODO - will be created during feature implementation)
  ```hcl
  resource "aws_vpc" "{{name}}" {
    cidr_block           = "{{cidr}}"
    enable_dns_hostnames = true
    enable_dns_support   = true

    tags = {
      Name        = "{{name}}"
      Environment = "{{environment}}"
      ManagedBy   = "Nimbus"
    }
  }

  {{#each availability_zones}}
  resource "aws_subnet" "{{../name}}_{{@index}}" {
    vpc_id            = aws_vpc.{{../name}}.id
    cidr_block        = "{{cidr}}"
    availability_zone = "{{zone}}"

    tags = {
      Name = "{{../name}}-subnet-{{@index}}"
    }
  }
  {{/each}}
  ```

- [ ] Create `templates/aws/eks.hbs` (TODO)
- [ ] Create `templates/aws/rds.hbs` (TODO)
- [ ] Create `templates/aws/s3.hbs` (TODO)

**4. Implement Generation Engines** ✅

- [x] Create `src/engines/generation-engine.ts` - Main generation orchestrator
- [x] Create `src/engines/questionnaire-engine.ts` - Multi-type questionnaire support
  - Terraform questionnaire
  - Kubernetes questionnaire
  - Session management
  - Answer validation
  ```typescript
  import { TemplateEngine } from '../templates/engine';

  export class TerraformGenerator {
    private templateEngine: TemplateEngine;

    constructor() {
      this.templateEngine = new TemplateEngine();
    }

    async generate(spec: TerraformSpec): Promise<GeneratedFiles> {
      const files: GeneratedFile[] = [];

      // Generate main.tf
      const main = await this.templateEngine.render(
        `templates/${spec.provider}/${spec.resource}.hbs`,
        spec.config
      );
      files.push({ path: 'main.tf', content: main });

      // Generate variables.tf
      const variables = await this.generateVariables(spec);
      files.push({ path: 'variables.tf', content: variables });

      // Generate outputs.tf
      const outputs = await this.generateOutputs(spec);
      files.push({ path: 'outputs.tf', content: outputs });

      return { files };
    }
  }
  ```

- [x] Create `src/engines/conversational-engine.ts` - Intent parsing and conversation tracking
  - Context extraction
  - Infrastructure stack inference

**5. Implement Best Practices Engine** ✅

- [x] Create `src/engines/best-practices-engine.ts` - 50+ rules across categories:
  - Security (encryption, flow logs, IAM, etc.)
  - Tagging (required tags enforcement)
  - Cost optimization
  - Reliability
  - Performance
  - Autofixes for applicable violations
  - Markdown report generation
  ```typescript
  export class TerraformBestPractices {
    apply(spec: TerraformSpec): TerraformSpec {
      // Add encryption by default
      if (spec.resource === 's3') {
        spec.config.encryption = spec.config.encryption ?? {
          enabled: true,
          algorithm: 'AES256',
        };
      }

      // Add tags
      spec.config.tags = {
        ...spec.config.tags,
        ManagedBy: 'Nimbus',
        CreatedAt: new Date().toISOString(),
      };

      return spec;
    }
  }
  ```

**6. Implement Routes** ✅

- [x] `POST /api/generator/questionnaire/start` - Start questionnaire session
- [x] `POST /api/generator/questionnaire/submit` - Submit answers
- [x] `GET /api/generator/questionnaire/:sessionId` - Get session status
- [x] `GET /api/generator/templates` - List available templates
- [x] `POST /api/generator/templates/render` - Render template
- [x] `POST /api/generator/templates/validate` - Validate template
- [x] `POST /api/generator/templates/:id/variables` - Extract variables
- [x] `POST /api/generator/best-practices/analyze` - Analyze code
- [x] `POST /api/generator/best-practices/autofix` - Apply autofixes
- [x] `GET /api/generator/best-practices/rules` - List rules
- [x] `POST /api/generator/best-practices/report` - Generate markdown report
- [x] `POST /api/generator/conversational/message` - Process conversation
- [x] `GET /api/generator/conversational/:sessionId` - Get conversation
- [x] `POST /api/generator/generate/from-questionnaire` - Generate from questionnaire
- [x] `POST /api/generator/generate/from-conversation` - Generate from conversation
  ```typescript
  export async function generateTerraform(req: Request): Promise<Response> {
    const spec = await req.json();

    // Apply best practices
    const enhancedSpec = bestPractices.apply(spec);

    // Generate files
    const generator = new TerraformGenerator();
    const result = await generator.generate(enhancedSpec);

    // Validate generated code
    await validateTerraform(result.files);

    return Response.json({ result });
  }
  ```

- [x] `GET /health` - Service health check

**7. Implement WebSocket Streaming** ⚠️ DEFERRED

- [ ] Stream generation progress (TODO - will implement when needed)

**8. Create Dockerfile** ⚠️ DEFERRED

- [ ] Create Dockerfile (Deferred to Sprint 5)

**9. Testing** ✅

- [x] Unit tests for engines
  - [x] BestPracticesEngine tests
  - [x] QuestionnaireEngine tests
  - [x] TemplateRenderer tests
  - [x] ConversationalEngine tests
- [ ] Integration tests with terraform validate (TODO)
- [ ] Integration tests with tflint (TODO)
- [x] Target: 85% coverage (ACHIEVED for engine logic)

#### Terraform Tools Service (`services/terraform-tools-service/`) ⚠️ SCAFFOLD ONLY

**1. Initialize Service** ✅

- [x] Create service structure (scaffold with health endpoint)

**2. Implement Terraform Operations** ❌ NOT STARTED

- [ ] Create `src/terraform/init.ts` (TODO)
  ```typescript
  import { exec } from 'child_process';
  import { promisify } from 'util';

  const execAsync = promisify(exec);

  export async function init(directory: string): Promise<void> {
    await execAsync(`terraform init`, { cwd: directory });
  }
  ```

- [ ] Create `src/terraform/plan.ts` (TODO)
- [ ] Create `src/terraform/apply.ts` (TODO)
- [ ] Create `src/terraform/destroy.ts` (TODO)
- [ ] Create `src/terraform/output.ts` (TODO)
- [ ] Create `src/terraform/show.ts` (TODO)

**3. Implement Routes** ❌ NOT STARTED

- [x] `GET /health` (only endpoint implemented)
- [ ] All Terraform operation routes (TODO)

**4. Create Dockerfile** ⚠️ DEFERRED

- [ ] Create Dockerfile (Deferred to Sprint 5)

**5. Testing** ❌ NOT STARTED

- [x] Health endpoint test only
- [ ] Integration tests with Terraform CLI (TODO)
- [ ] Target: 80% coverage

#### Kubernetes Tools Service (`services/k8s-tools-service/`) ⚠️ SCAFFOLD ONLY

**1. Initialize Service** ✅

- [x] Create service structure (scaffold with health endpoint)

**2. Implement Kubernetes Operations** ❌ NOT STARTED

- [ ] Create `src/k8s/get.ts` (TODO)
  ```typescript
  import { exec } from 'child_process';
  import { promisify } from 'util';

  const execAsync = promisify(exec);

  export async function get(resource: string, name?: string): Promise<string> {
    const command = name
      ? `kubectl get ${resource} ${name} -o json`
      : `kubectl get ${resource} -o json`;
    const { stdout } = await execAsync(command);
    return stdout;
  }
  ```

- [ ] Create `src/k8s/apply.ts` (TODO)
- [ ] Create `src/k8s/delete.ts` (TODO)
- [ ] Create `src/k8s/logs.ts` (TODO)
- [ ] Create `src/k8s/exec.ts` (TODO)
- [ ] Create `src/k8s/describe.ts` (TODO)
- [ ] Create `src/k8s/port-forward.ts` (TODO)
- [ ] Create `src/k8s/scale.ts` (TODO)

**3. Implement Routes** ❌ NOT STARTED

- [x] `GET /health` (only endpoint implemented)
- [ ] All Kubernetes operation routes (TODO)

**4. Create Dockerfile** ⚠️ DEFERRED

- [ ] Create Dockerfile (Deferred to Sprint 5)

**5. Testing** ❌ NOT STARTED

- [x] Health endpoint test only
- [ ] Integration tests with minikube or kind (TODO)
- [ ] Target: 80% coverage

#### Helm Tools Service (`services/helm-tools-service/`) ⚠️ SCAFFOLD ONLY

**1. Initialize Service** ✅

- [x] Create service structure (scaffold with health endpoint)

**2. Implement Helm Operations** ❌ NOT STARTED

- [ ] Create `src/helm/install.ts` (TODO)
- [ ] Create `src/helm/upgrade.ts` (TODO)
- [ ] Create `src/helm/uninstall.ts` (TODO)
- [ ] Create `src/helm/list.ts` (TODO)
- [ ] Create `src/helm/rollback.ts` (TODO)
- [ ] Create `src/helm/get-values.ts` (TODO)

**3. Implement Routes** ❌ NOT STARTED

- [x] `GET /health` (only endpoint implemented)
- [ ] All Helm operation routes (TODO)

**4. Create Dockerfile** ⚠️ DEFERRED

- [ ] Create Dockerfile (Deferred to Sprint 5)

**5. Testing** ❌ NOT STARTED

- [x] Health endpoint test only
- [ ] Integration tests with Helm CLI (TODO)
- [ ] Target: 80% coverage

#### GitHub Tools Service (`services/github-tools-service/`) ⚠️ SCAFFOLD ONLY

**1. Initialize Service** ✅

- [x] Create service structure (scaffold with health endpoint)
- [ ] Install GitHub SDK (TODO)
  ```bash
  bun add @octokit/rest
  ```

**2. Implement GitHub Operations** ❌ NOT STARTED

- [ ] Create `src/github/pr.ts` (TODO)
  ```typescript
  import { Octokit } from '@octokit/rest';

  export class GitHubPRService {
    private octokit: Octokit;

    constructor(token: string) {
      this.octokit = new Octokit({ auth: token });
    }

    async list(owner: string, repo: string) {
      const { data } = await this.octokit.pulls.list({ owner, repo });
      return data;
    }

    async create(owner: string, repo: string, params: CreatePRParams) {
      const { data } = await this.octokit.pulls.create({
        owner,
        repo,
        ...params,
      });
      return data;
    }
  }
  ```

- [ ] Create `src/github/issue.ts` (TODO)

**3. Implement Routes** ❌ NOT STARTED

- [x] `GET /health` (only endpoint implemented)
- [ ] All GitHub operation routes (TODO)

**4. Create Dockerfile** ⚠️ DEFERRED

- [ ] Create Dockerfile (Deferred to Sprint 5)

**5. Testing** ❌ NOT STARTED

- [x] Health endpoint test only
- [ ] Integration tests with GitHub API (TODO)
- [ ] Target: 80% coverage

#### Cloud CLI Service (AWS) (`services/aws-tools-service/`) ⚠️ SCAFFOLD ONLY

**1. Initialize Service** ✅

- [x] Create service structure (scaffold with health endpoint)
- [ ] Install AWS SDK (TODO)
  ```bash
  bun add @aws-sdk/client-ec2 @aws-sdk/client-s3 @aws-sdk/client-iam
  ```

**2. Implement AWS Operations** ❌ NOT STARTED

- [ ] Create `src/aws/ec2.ts` (TODO)
- [ ] Create `src/aws/s3.ts` (TODO)
- [ ] Create `src/aws/iam.ts` (TODO)

**3. Implement Routes** ❌ NOT STARTED

- [x] `GET /health` (only endpoint implemented)
- [ ] All AWS operation routes (TODO)

**4. Create Dockerfile** ⚠️ DEFERRED

- [ ] Create Dockerfile (Deferred to Sprint 5)

**5. Testing** ❌ NOT STARTED

- [x] Health endpoint test only
- [ ] Integration tests with LocalStack (TODO)
- [ ] Target: 80% coverage

---

## PHASE 3: CLI Service & Integration (Sprints 5-6, Weeks 9-12) ❌ NOT STARTED

### Sprint 5 (Week 9-10): CLI Service & Docker Compose ❌ NOT STARTED

#### CLI Service (`services/cli-service/`) ⚠️ SCAFFOLD ONLY

**1. Initialize Service** ✅

- [x] Create service structure (scaffold with health endpoint)
- [ ] Install dependencies (TODO)
  ```bash
  bun add ink ink-text-input ink-spinner ink-select-input commander chalk ora boxen
  bun add @nimbus/shared-types @nimbus/shared-utils @nimbus/shared-clients
  ```

**2. Implement CLI Framework** ❌ NOT STARTED

- [ ] Create `src/index.ts` (TODO - full implementation needed)
  ```typescript
  #!/usr/bin/env bun

  import { program } from 'commander';
  import { render } from 'ink';
  import { ChatCommand } from './commands/chat';
  import { GenerateCommand } from './commands/generate';

  program
    .name('nimbus')
    .description('AI-powered Cloud Engineering Agent')
    .version('0.1.0');

  program
    .command('chat')
    .description('Interactive chat mode')
    .action(ChatCommand);

  program
    .command('generate <type>')
    .description('Generate infrastructure code')
    .option('--mode <mode>', 'Generation mode', 'questionnaire')
    .action(GenerateCommand);

  // ... more commands

  program.parse();
  ```

**3. Implement Commands** ❌ NOT STARTED

- [ ] Create `src/commands/chat.ts` (TODO)
  ```typescript
  import { render } from 'ink';
  import { Chat } from '../ui/Chat';

  export async function ChatCommand(options: ChatOptions) {
    const { waitUntilExit } = render(<Chat {...options} />);
    await waitUntilExit();
  }
  ```

- [ ] Create `src/commands/generate/terraform.ts` (TODO)
- [ ] Create `src/commands/generate/kubernetes.ts` (TODO)
- [ ] Create `src/commands/generate/helm.ts` (TODO)
- [ ] Create `src/commands/git/*.ts` (TODO)
- [ ] Create `src/commands/k8s/*.ts` (TODO)
- [ ] Create `src/commands/helm/*.ts` (TODO)
- [ ] Create `src/commands/config.ts` (TODO)
- [ ] Create `src/commands/history.ts` (TODO)
- [ ] Create `src/commands/init.ts` (TODO)

**4. Implement UI Components** ❌ NOT STARTED

- [ ] Create `src/ui/Chat.tsx` (TODO)
  ```tsx
  import React, { useState } from 'react';
  import { Box, Text, useInput } from 'ink';
  import TextInput from 'ink-text-input';
  import Spinner from 'ink-spinner';

  export const Chat: React.FC<ChatProps> = ({ model }) => {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async () => {
      setIsLoading(true);

      // Call Core Engine Service via WebSocket
      const ws = new WebSocket('ws://localhost:3101/stream');
      ws.onmessage = (event) => {
        const { type, data } = JSON.parse(event.data);
        if (type === 'chunk') {
          // Append chunk to current message
        } else if (type === 'done') {
          setIsLoading(false);
        }
      };
      ws.send(JSON.stringify({ type: 'execute', payload: { input } }));
    };

    return (
      <Box flexDirection="column">
        <Header model={model} />
        <MessageList messages={messages} />
        {isLoading && <Spinner type="dots" />}
        <InputArea value={input} onChange={setInput} onSubmit={handleSubmit} />
      </Box>
    );
  };
  ```

- [ ] Create `src/ui/Questionnaire.tsx`
- [ ] Create `src/ui/Confirmation.tsx`
- [ ] Create `src/ui/Progress.tsx`
- [ ] Create `src/ui/Table.tsx`
- [ ] Create `src/ui/Tree.tsx`
- [ ] Create `src/ui/Diff.tsx`
- [ ] Create `src/ui/PRList.tsx`
- [ ] Create `src/ui/IssueList.tsx`
- [ ] Create `src/ui/GitStatus.tsx`

**5. Implement REST Clients**

- [ ] Create `src/clients/core-engine.ts`
  ```typescript
  import { RestClient } from '@nimbus/shared-clients';

  export class CoreEngineClient {
    private client: RestClient;

    constructor() {
      this.client = new RestClient(
        process.env.CORE_ENGINE_URL || 'http://localhost:3001'
      );
    }

    async createPlan(request: UserRequest) {
      return this.client.post('/api/core/plan', request);
    }

    async executePlan(planId: string) {
      return this.client.post('/api/core/execute', { planId });
    }
  }
  ```

- [ ] Create `src/clients/llm.ts`
- [ ] Create `src/clients/generator.ts`
- [ ] Create `src/clients/mcp-tools.ts`
- [ ] Create `src/clients/state.ts`

**6. Implement WebSocket Clients**

- [ ] Create `src/clients/llm-stream.ts`
  ```typescript
  export class LLMStreamClient {
    private ws: WebSocket;

    constructor(url: string = 'ws://localhost:3102/stream') {
      this.ws = new WebSocket(url);
    }

    onChunk(handler: (chunk: string) => void) {
      this.ws.on('message', (msg) => {
        const { type, data } = JSON.parse(msg.toString());
        if (type === 'chunk') handler(data);
      });
    }

    stream(messages: Message[]) {
      this.ws.send(JSON.stringify({ type: 'stream', payload: { messages } }));
    }
  }
  ```

- [ ] Create `src/clients/generator-stream.ts`

**7. Testing**

- [ ] Write E2E tests with Playwright
- [ ] Test all command flows
- [ ] Target: 80% coverage

#### Docker Compose Setup

**1. Create docker-compose.yml**

```yaml
version: '3.9'

services:
  state-service:
    build: ./services/state-service
    ports:
      - "3011:3011"
    volumes:
      - nimbus-data:/data
    environment:
      - NODE_ENV=staging
      - DB_PATH=/data/nimbus.db
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3011/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  llm-service:
    build: ./services/llm-service
    ports:
      - "3002:3002"
      - "3102:3102"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - STATE_SERVICE_URL=http://state-service:3011
    depends_on:
      state-service:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3002/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  core-engine-service:
    build: ./services/core-engine-service
    ports:
      - "3001:3001"
      - "3101:3101"
    environment:
      - LLM_SERVICE_URL=http://llm-service:3002
      - STATE_SERVICE_URL=http://state-service:3011
    depends_on:
      llm-service:
        condition: service_healthy
      state-service:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  generator-service:
    build: ./services/generator-service
    ports:
      - "3003:3003"
      - "3103:3103"
    environment:
      - LLM_SERVICE_URL=http://llm-service:3002
    depends_on:
      llm-service:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3003/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  git-tools-service:
    build: ./services/git-tools-service
    ports:
      - "3004:3004"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3004/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  fs-tools-service:
    build: ./services/fs-tools-service
    ports:
      - "3005:3005"
    volumes:
      - /tmp:/tmp  # For temporary file operations
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3005/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  terraform-tools-service:
    build: ./services/terraform-tools-service
    ports:
      - "3006:3006"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3006/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  k8s-tools-service:
    build: ./services/k8s-tools-service
    ports:
      - "3007:3007"
    volumes:
      - ~/.kube:/root/.kube:ro  # Mount kubeconfig
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3007/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  helm-tools-service:
    build: ./services/helm-tools-service
    ports:
      - "3008:3008"
    volumes:
      - ~/.kube:/root/.kube:ro  # Mount kubeconfig
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3008/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  aws-tools-service:
    build: ./services/aws-tools-service
    ports:
      - "3009:3009"
    environment:
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - AWS_REGION=${AWS_REGION}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3009/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  github-tools-service:
    build: ./services/github-tools-service
    ports:
      - "3010:3010"
    environment:
      - GITHUB_TOKEN=${GITHUB_TOKEN}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3010/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  cli-service:
    build: ./services/cli-service
    stdin_open: true
    tty: true
    environment:
      - CORE_ENGINE_URL=http://core-engine-service:3001
      - LLM_SERVICE_URL=http://llm-service:3002
      - GENERATOR_SERVICE_URL=http://generator-service:3003
      - STATE_SERVICE_URL=http://state-service:3011
    depends_on:
      core-engine-service:
        condition: service_healthy
      generator-service:
        condition: service_healthy

volumes:
  nimbus-data:

networks:
  default:
    name: nimbus-network
```

**2. Create .env.example**

```bash
# LLM Provider API Keys
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
GOOGLE_AI_API_KEY=your-google-key

# Cloud Provider Credentials
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
AWS_REGION=us-east-1

# GitHub
GITHUB_TOKEN=your-github-token

# Service URLs (for local development)
CORE_ENGINE_URL=http://localhost:3001
LLM_SERVICE_URL=http://localhost:3002
GENERATOR_SERVICE_URL=http://localhost:3003
STATE_SERVICE_URL=http://localhost:3011
```

**3. Create deployment scripts**

- [ ] Create `scripts/start-all.sh`
  ```bash
  #!/bin/bash
  docker-compose up -d
  docker-compose logs -f
  ```

- [ ] Create `scripts/stop-all.sh`
  ```bash
  #!/bin/bash
  docker-compose down
  ```

- [ ] Create `scripts/rebuild.sh`
  ```bash
  #!/bin/bash
  docker-compose down
  docker-compose build
  docker-compose up -d
  ```

**4. Test Docker Compose**

- [ ] Start all services
- [ ] Verify health checks pass
- [ ] Test service-to-service communication
- [ ] Test CLI → Core Engine → LLM flow

### Sprint 6 (Week 11-12): Testing, Documentation & Demo

#### Integration Testing

**1. Service-to-Service Communication Tests**

- [ ] Test CLI → Core Engine → LLM Service
  ```typescript
  // tests/integration/chat-flow.test.ts
  import { describe, it, expect } from 'bun:test';

  describe('Chat Flow Integration', () => {
    it('should complete chat flow end-to-end', async () => {
      // 1. Send request to Core Engine
      const planResponse = await fetch('http://localhost:3001/api/core/plan', {
        method: 'POST',
        body: JSON.stringify({ input: 'Create a VPC' }),
      });
      const { plan } = await planResponse.json();

      // 2. Execute plan
      const executeResponse = await fetch('http://localhost:3001/api/core/execute', {
        method: 'POST',
        body: JSON.stringify({ planId: plan.id }),
      });
      const { result } = await executeResponse.json();

      expect(result.status).toBe('success');
    });
  });
  ```

- [ ] Test Core Engine → Generator Service
- [ ] Test Core Engine → MCP Tools Services
- [ ] Test All Services → State Service

**2. REST API Contract Tests**

- [ ] Request/response validation
- [ ] Error handling
- [ ] Timeouts and retries

**3. WebSocket Streaming Tests**

- [ ] LLM response streaming
- [ ] Generation progress streaming
- [ ] Connection handling

#### E2E Testing

**1. User Journey Tests**

- [ ] Terraform generation (questionnaire mode)
  ```typescript
  // tests/e2e/terraform-questionnaire.test.ts
  import { test, expect } from '@playwright/test';

  test('Terraform questionnaire generation', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Type command
    await page.keyboard.type('nimbus generate terraform');
    await page.keyboard.press('Enter');

    // Select AWS
    await page.keyboard.press('Enter');

    // Select region
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // Wait for generation
    await page.waitForSelector('text=Files generated');

    // Verify output
    const output = await page.textContent('text=main.tf');
    expect(output).toContain('resource "aws_vpc"');
  });
  ```

- [ ] Terraform generation (conversational mode)
- [ ] Kubernetes operations
- [ ] Git operations

**2. Verify All Tests Pass Consistently**

- [ ] Run tests 10 times consecutively
- [ ] All tests must pass 100% of the time

#### Documentation

**1. API Documentation**

- [ ] Create OpenAPI specs for each service
  ```yaml
  # docs/api/core-engine-service.yaml
  openapi: 3.0.0
  info:
    title: Core Engine Service API
    version: 0.1.0

  paths:
    /api/core/plan:
      post:
        summary: Create execution plan
        requestBody:
          required: true
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserRequest'
        responses:
          '200':
            description: Plan created successfully
            content:
              application/json:
                schema:
                  $ref: '#/components/schemas/Plan'
  ```

- [ ] Generate API docs with Swagger UI

**2. Deployment Guides**

- [ ] Create `docs/deployment/local.md`
  ```markdown
  # Local Development Setup

  ## Prerequisites
  - Bun 1.0+
  - Git

  ## Steps
  1. Clone repository
  2. Install dependencies: `bun install`
  3. Copy `.env.example` to `.env.local`
  4. Start all services: `bun run dev:all`
  ```

- [ ] Create `docs/deployment/staging.md` (Docker Compose)
- [ ] Create `docs/deployment/production.md` (Kubernetes)

**3. Service-Specific READMEs**

- [ ] Write README for each service with:
  - Service description
  - API endpoints
  - Environment variables
  - Development setup
  - Testing instructions

**4. Architecture Documentation**

- [ ] Update MICROSERVICES_ARCHITECTURE.md with final details
- [ ] Create architecture diagrams (use Mermaid or draw.io)
- [ ] Document data flows
- [ ] Document error handling strategies

**5. User Guides**

- [ ] `docs/getting-started/installation.md`
- [ ] `docs/getting-started/quickstart.md`
- [ ] `docs/getting-started/configuration.md`
- [ ] `docs/commands/` (all command references)
- [ ] `docs/guides/terraform-generation.md`
- [ ] `docs/guides/kubernetes-operations.md`
- [ ] `docs/guides/cloud-credentials.md`
- [ ] `docs/guides/llm-providers.md`
- [ ] `docs/examples/vpc-eks-rds.md`
- [ ] `docs/examples/kubernetes-deployment.md`
- [ ] `docs/examples/multi-environment.md`

#### Demo Preparation

**1. Set Up Demo Environment**

- [ ] Create `scripts/setup-demo-env.sh`
  ```bash
  #!/bin/bash

  # Pre-requisites check
  command -v bun >/dev/null 2>&1 || { echo "bun required"; exit 1; }
  command -v docker >/dev/null 2>&1 || { echo "docker required"; exit 1; }

  # Start services
  docker-compose up -d

  # Wait for health checks
  ./scripts/wait-for-health.sh

  # Pre-load demo data
  bun run scripts/seed-demo-data.ts

  echo "Demo environment ready!"
  ```

**2. Create Demo Scripts**

- [ ] `scripts/demos/01-hello-world.md` (2 min)
  ```markdown
  # Demo: Hello World (2 minutes)

  ## Opening (15 sec)
  "Let me show you Nimbus - an AI-powered cloud engineering agent."

  ## Step 1: Start Chat (30 sec)
  ```bash
  nimbus chat
  ```

  "Notice the clean interface. Let me ask a simple question."

  ## Step 2: Ask Question (1 min)
  You: "What's the best way to set up a VPC in AWS?"

  Nimbus: [Streams response with recommendations]

  ## Closing (15 sec)
  "That's the basics - natural language interaction with cloud expertise."
  ```

- [ ] `scripts/demos/02-terraform-vpc.md` (5 min)
- [ ] `scripts/demos/03-k8s-ops.md` (5 min)
- [ ] `scripts/demos/04-full-journey.md` (10 min)

**3. Practice Demo Scenarios**

- [ ] Practice Hello World demo 5 times
- [ ] Practice Terraform VPC demo 5 times
- [ ] Practice K8s Operations demo 5 times
- [ ] Practice Full Journey demo 5 times

**4. Record Demo Videos**

- [ ] Record all 4 demo scenarios
- [ ] Upload to project repository

**5. Achieve Consistent Success**

- [ ] Run all demos 5 times consecutively
- [ ] All demos must complete without errors

---

## Critical Path Items

**These tasks must be completed in order:**

1. ✅ Workspace setup (Week 1)
2. ✅ Shared libraries (Week 1-2)
3. ✅ State Service (Week 3-4)
4. ✅ LLM Service (Week 3-4)
5. ✅ Core Engine Service (Week 5-6)
6. ✅ MCP Tools Services (Week 5-8)
7. ✅ Generator Service (Week 7-8)
8. ✅ CLI Service (Week 9-10)
9. ✅ Docker Compose setup (Week 9-10)
10. ✅ Integration testing (Week 11-12)
11. ✅ Documentation (Week 11-12)
12. ✅ Demo preparation (Week 11-12)

**Implementation Status:**
1. ✅ Workspace setup (Week 1) - COMPLETED
2. ✅ Shared libraries (Week 1-2) - COMPLETED
3. ✅ State Service (Week 3-4) - COMPLETED
4. ✅ LLM Service (Week 3-4) - COMPLETED
5. ✅ Core Engine Service (Week 5-6) - COMPLETED
6. ⚠️ MCP Tools Services (Week 5-8) - 8 SCAFFOLD SERVICES (health endpoints only)
7. ✅ Generator Service (Week 7-8) - COMPLETED
8. ❌ CLI Service (Week 9-10) - NOT STARTED (scaffold only)
9. ❌ Docker Compose setup (Week 9-10) - NOT STARTED
10. ❌ Integration testing (Week 11-12) - NOT STARTED
11. ❌ Documentation (Week 11-12) - PARTIAL (architecture docs exist)
12. ❌ Demo preparation (Week 11-12) - NOT STARTED

**Critical Dependencies:**
- ✅ Shared libraries implemented and working
- ✅ Core Engine ← LLM ← State (fully connected)
- ✅ Generator ← LLM (fully connected)
- ⚠️ Core Engine ← MCP Tools (scaffolds exist, need implementation)
- ❌ CLI ← Core Engine (CLI needs full implementation)

---

## Service Dependency Graph

```
┌─────────────────┐
│  CLI Service    │
└────────┬────────┘
         │
         ├──────────────────────────────┐
         │                              │
         v                              v
┌────────────────────┐        ┌────────────────┐
│ Core Engine Service│        │ State Service  │
└────────┬───────────┘        └────────────────┘
         │                              ▲
         ├──────────────────────────────┤
         │                              │
         v                              │
┌────────────────────┐                  │
│   LLM Service      │──────────────────┘
└────────────────────┘
         ▲
         │
         ├──────────────┐
         │              │
         v              v
┌────────────────────┐  │
│ Generator Service  │  │
└────────────────────┘  │
                        │
         ┌──────────────┴───────────┐
         │                          │
         v                          v
┌───────────────────┐    ┌────────────────────┐
│ Git Tools Service │    │ FS Tools Service   │
└───────────────────┘    └────────────────────┘
         │                          │
         v                          v
┌────────────────────────┐  ┌──────────────────────┐
│ Terraform Tools Service│  │ K8s Tools Service    │
└────────────────────────┘  └──────────────────────┘
         │                          │
         v                          v
┌────────────────────┐    ┌────────────────────┐
│ Helm Tools Service │    │ AWS Tools Service  │
└────────────────────┘    └────────────────────┘
         │
         v
┌────────────────────────┐
│ GitHub Tools Service   │
└────────────────────────┘
```

---

## Acceptance Criteria

### Infrastructure
- [ ] All 12 services run independently with Bun runtime
- [ ] Services communicate via REST APIs successfully
- [ ] WebSocket streaming works for LLM responses and progress
- [ ] Shared libraries imported via workspace dependencies
- [ ] Docker Compose orchestrates all services correctly
- [ ] Health checks implemented for all services
- [ ] Service discovery works in local, staging, production

### CLI Service
- [ ] All commands functional (chat, generate, k8s, helm, git, config)
- [ ] TUI renders correctly
- [ ] WebSocket client streams LLM responses smoothly
- [ ] REST clients communicate with backend services
- [ ] < 100ms command startup time

### Core Engine Service
- [ ] Agent orchestration loop works end-to-end
- [ ] Planning accuracy > 90%
- [ ] Execution success rate > 95%
- [ ] Safety confirmations work
- [ ] WebSocket streaming for execution progress

### LLM Service
- [ ] All 4 providers functional (Anthropic, OpenAI, Ollama, Google)
- [ ] Provider fallback works
- [ ] WebSocket streaming works
- [ ] Cost tracking accurate

### Generator Service
- [ ] Terraform generation produces valid code
- [ ] Generated code passes tflint
- [ ] Questionnaire mode works
- [ ] Conversational mode works
- [ ] WebSocket progress streaming

### MCP Tools Services
- [ ] All tools implemented and functional
- [ ] Error handling works
- [ ] Integration tests pass

### State Service
- [ ] Configuration persistence works
- [ ] Conversation history stored
- [ ] Artifacts saved and retrieved
- [ ] Credentials encrypted

### Testing & Documentation
- [ ] Unit test coverage > 80% for all services
- [ ] Integration tests pass
- [ ] E2E tests pass consistently
- [ ] API documentation complete (OpenAPI)
- [ ] User documentation complete
- [ ] Demo scenarios practiced and working

---

## Team Coordination

### Service Ownership

| Team | Services |
|------|----------|
| CLI Team | CLI Service |
| Core Engine Team | Core Engine Service |
| LLM Integration Team | LLM Service |
| Generator Engine Team | Generator Service |
| MCP Tools Team | Git, FS, Terraform, K8s, Helm, AWS, GitHub Tools Services |
| Infrastructure Team | State Service, Docker/K8s setup, CI/CD |
| DevRel & QA Team | Testing, Documentation, Demos |

### Coordination Practices

**1. API-First Development**
- Define OpenAPI specs before implementation
- Review API contracts in weekly syncs
- Use contract testing (Pact)

**2. Weekly Sync Meetings**
- Monday: Sprint planning
- Wednesday: Technical sync (API contracts, blockers)
- Friday: Demo & retrospective

**3. Communication Channels**
- Slack channels per service
- #integrations for cross-service work
- #blockers for immediate help

**4. Shared Library Versioning**
- Semantic versioning for all shared packages
- Breaking changes require major version bump
- Coordinate updates across teams

**5. Testing Strategy**
- Unit tests: Each team owns their service tests
- Integration tests: Joint responsibility
- E2E tests: DevRel & QA Team

**6. Code Review Policy**
- All PRs require 1 approval
- Cross-team PRs require approval from both teams
- Breaking changes require architecture review

---

## Next Steps

1. **Get approval** from all team leads
2. **Kick off Sprint 1** (Week 1)
3. **Set up workspace** and shared libraries
4. **Begin parallel development** on State and LLM services
5. **Weekly check-ins** to track progress

---

*Document Version: 2.0*
*Last Updated: January 2026*
*Status: ✅ APPROVED*
