# Nimbus MVP - Microservices Architecture

> **Version**: 2.0
> **Last Updated**: January 2026
> **Architecture**: Microservices with Bun Runtime
> **Replaces**: Monorepo architecture (v1.0)
>
> **🚀 Implementation Guide**: For sprint-by-sprint implementation tasks, team coordination, and acceptance criteria, see [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)

---

## Overview

Nimbus MVP uses a **granular microservices architecture** with **Bun** as the runtime and package manager. Services communicate via **REST APIs** for synchronous operations and **WebSockets** for real-time streaming.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Interface Layer                         │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  CLI Service (Bun + Ink)                                      │   │
│  │  - Terminal UI                                                │   │
│  │  - Command routing                                            │   │
│  │  - WebSocket client for streaming                            │   │
│  └──────────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ REST + WebSocket
┌───────────────────────────────┴─────────────────────────────────────┐
│                       Core Orchestration Layer                       │
│                                                                       │
│  ┌────────────────────────┐          ┌─────────────────────────┐    │
│  │  Core Engine Service   │          │   LLM Service           │    │
│  │  - Agent orchestration │◄────────►│  - Provider abstraction │    │
│  │  - Planning            │  REST    │  - Model routing        │    │
│  │  - Execution           │          │  - Streaming            │    │
│  │  - Verification        │          │  - Cost tracking        │    │
│  └────────────────────────┘          └─────────────────────────┘    │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ REST
┌───────────────────────────────┴─────────────────────────────────────┐
│                        Generation & Tools Layer                      │
│                                                                       │
│  ┌─────────────────┐  ┌──────────────┐  ┌─────────────────────┐    │
│  │ Generator       │  │ Git Tools    │  │ File System Tools   │    │
│  │ Service         │  │ Service      │  │ Service             │    │
│  │ - Terraform     │  │ - Clone      │  │ - Read/Write        │    │
│  │ - Kubernetes    │  │ - Commit     │  │ - Tree/Search       │    │
│  │ - Helm          │  │ - Push/Pull  │  │ - Diff              │    │
│  └─────────────────┘  └──────────────┘  └─────────────────────┘    │
│                                                                       │
│  ┌─────────────────┐  ┌──────────────┐  ┌─────────────────────┐    │
│  │ Terraform Tools │  │ Kubernetes   │  │ Helm Tools          │    │
│  │ Service         │  │ Tools Service│  │ Service             │    │
│  │ - Init/Plan     │  │ - Get/Apply  │  │ - Install/Upgrade   │    │
│  │ - Apply/Destroy │  │ - Logs/Exec  │  │ - List/Rollback     │    │
│  └─────────────────┘  └──────────────┘  └─────────────────────┘    │
│                                                                       │
│  ┌─────────────────┐  ┌──────────────┐                              │
│  │ Cloud CLI (AWS) │  │ GitHub Tools │                              │
│  │ Service         │  │ Service      │                              │
│  │ - EC2/S3/IAM    │  │ - PR/Issues  │                              │
│  └─────────────────┘  └──────────────┘                              │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ REST
┌───────────────────────────────┴─────────────────────────────────────┐
│                          Persistence Layer                           │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  State Service                                               │    │
│  │  - Conversation history                                      │    │
│  │  - Artifacts storage                                         │    │
│  │  - Configuration management                                  │    │
│  │  - Credentials (encrypted)                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Microservices Inventory

### 1. **CLI Service**
- **Port**: 3000 (HTTP), 3100 (WebSocket)
- **Technology**: Bun + Ink (React for CLI)
- **Purpose**: User interface layer
- **Exposes**: CLI commands to users
- **Consumes**: All other services via REST/WebSocket

### 2. **Core Engine Service**
- **Port**: 3001 (HTTP), 3101 (WebSocket)
- **Technology**: Bun
- **Purpose**: Agent orchestration and execution
- **Exposes**: Plan, Execute, Validate APIs
- **Consumes**: LLM Service, MCP Tools Services, State Service

### 3. **LLM Service**
- **Port**: 3002 (HTTP), 3102 (WebSocket)
- **Technology**: Bun
- **Purpose**: LLM provider abstraction
- **Exposes**: Chat, Completion, Streaming APIs
- **Consumes**: External LLM providers (Anthropic, OpenAI, Ollama, Google)

### 4. **Generator Service**
- **Port**: 3003 (HTTP), 3103 (WebSocket)
- **Technology**: Bun + Handlebars
- **Purpose**: Infrastructure code generation
- **Exposes**: Generate Terraform/K8s/Helm APIs
- **Consumes**: LLM Service

### 5. **Git Tools Service**
- **Port**: 3004 (HTTP)
- **Technology**: Bun
- **Purpose**: Git operations
- **Exposes**: Clone, Commit, Push, Pull, Branch, Merge APIs
- **Consumes**: None (direct Git CLI)

### 6. **File System Tools Service**
- **Port**: 3005 (HTTP)
- **Technology**: Bun
- **Purpose**: File system operations
- **Exposes**: Read, Write, List, Search, Tree, Diff APIs
- **Consumes**: None (direct filesystem access)

### 7. **Terraform Tools Service**
- **Port**: 3006 (HTTP)
- **Technology**: Bun
- **Purpose**: Terraform operations
- **Exposes**: Init, Plan, Apply, Destroy, Output APIs
- **Consumes**: None (direct Terraform CLI)

### 8. **Kubernetes Tools Service**
- **Port**: 3007 (HTTP)
- **Technology**: Bun
- **Purpose**: Kubernetes operations
- **Exposes**: Get, Apply, Delete, Logs, Exec, Describe APIs
- **Consumes**: None (direct kubectl CLI)

### 9. **Helm Tools Service**
- **Port**: 3008 (HTTP)
- **Technology**: Bun
- **Purpose**: Helm operations
- **Exposes**: Install, Upgrade, Uninstall, List, Rollback APIs
- **Consumes**: None (direct Helm CLI)

### 10. **Cloud CLI Service (AWS)**
- **Port**: 3009 (HTTP)
- **Technology**: Bun
- **Purpose**: AWS CLI operations
- **Exposes**: EC2, S3, IAM APIs
- **Consumes**: None (direct AWS CLI)

### 11. **GitHub Tools Service**
- **Port**: 3010 (HTTP)
- **Technology**: Bun
- **Purpose**: GitHub operations
- **Exposes**: PR List/Create, Issue List/Create APIs
- **Consumes**: GitHub REST API

### 12. **State Service**
- **Port**: 3011 (HTTP)
- **Technology**: Bun + SQLite/PostgreSQL
- **Purpose**: Data persistence
- **Exposes**: Config, History, Artifacts, Credentials APIs
- **Consumes**: None (database)

---

## Communication Protocols

### REST API
- **Use Case**: Synchronous operations (CRUD, queries, commands)
- **Format**: JSON
- **Framework**: Bun.serve with routing
- **Example**: `POST /api/core/plan`, `GET /api/state/config`

### WebSocket
- **Use Case**: Real-time streaming (LLM responses, generation progress, logs)
- **Format**: JSON messages
- **Framework**: Native Bun WebSocket support
- **Example**: `ws://llm-service:3102/stream`

---

## Shared Libraries

Shared code is published as **internal Bun packages** within a workspace:

```
shared/
├── types/                    # @nimbus/shared-types
│   ├── src/
│   │   ├── request.ts
│   │   ├── response.ts
│   │   ├── plan.ts
│   │   ├── artifact.ts
│   │   └── index.ts
│   └── package.json
│
├── utils/                    # @nimbus/shared-utils
│   ├── src/
│   │   ├── logger.ts
│   │   ├── errors.ts
│   │   ├── validation.ts
│   │   └── index.ts
│   └── package.json
│
└── clients/                  # @nimbus/shared-clients
    ├── src/
    │   ├── rest-client.ts    # Base REST client
    │   ├── ws-client.ts      # Base WebSocket client
    │   └── index.ts
    └── package.json
```

Services import shared libraries via:

```json
{
  "dependencies": {
    "@nimbus/shared-types": "workspace:*",
    "@nimbus/shared-utils": "workspace:*",
    "@nimbus/shared-clients": "workspace:*"
  }
}
```

---

## Deployment Strategies

### Local Development
- **Runtime**: Bun processes
- **Orchestration**: None (manual start) or Bun scripts
- **Service Discovery**: Environment variables

```bash
# Start all services
bun run dev:all

# Or start individually
cd services/cli-service && bun run dev
cd services/core-engine-service && bun run dev
cd services/llm-service && bun run dev
# etc.
```

**Environment Variables** (`.env.local`):
```bash
CORE_ENGINE_URL=http://localhost:3001
LLM_SERVICE_URL=http://localhost:3002
GENERATOR_SERVICE_URL=http://localhost:3003
STATE_SERVICE_URL=http://localhost:3011
# etc.
```

### Staging
- **Runtime**: Docker containers
- **Orchestration**: Docker Compose
- **Service Discovery**: Docker network DNS

```yaml
# docker-compose.staging.yml
version: '3.9'

services:
  cli-service:
    build: ./services/cli-service
    ports:
      - "3000:3000"
    environment:
      - CORE_ENGINE_URL=http://core-engine-service:3001
    depends_on:
      - core-engine-service

  core-engine-service:
    build: ./services/core-engine-service
    ports:
      - "3001:3001"
    environment:
      - LLM_SERVICE_URL=http://llm-service:3002

  llm-service:
    build: ./services/llm-service
    ports:
      - "3002:3002"

  # ... other services
```

```bash
# Start staging environment
docker-compose -f docker-compose.staging.yml up -d
```

### Production
- **Runtime**: Docker containers
- **Orchestration**: Kubernetes
- **Service Discovery**: Kubernetes DNS
- **Scaling**: Horizontal Pod Autoscaler (HPA)

```yaml
# k8s/core-engine-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: core-engine-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: core-engine-service
  template:
    metadata:
      labels:
        app: core-engine-service
    spec:
      containers:
      - name: core-engine
        image: nimbus/core-engine-service:latest
        ports:
        - containerPort: 3001
        env:
        - name: LLM_SERVICE_URL
          value: "http://llm-service:3002"
---
apiVersion: v1
kind: Service
metadata:
  name: core-engine-service
spec:
  selector:
    app: core-engine-service
  ports:
  - port: 3001
    targetPort: 3001
```

---

## Service Template

Each microservice follows this structure:

```
services/<service-name>/
├── src/
│   ├── index.ts              # Entry point (starts Bun server)
│   ├── server.ts             # HTTP server (Bun.serve)
│   ├── websocket.ts          # WebSocket server (if needed)
│   ├── routes/               # API route handlers
│   │   ├── health.ts         # GET /health
│   │   └── <operation>.ts    # Service-specific routes
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

**Example `package.json`**:
```json
{
  "name": "@nimbus/<service-name>",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "build": "bun build src/index.ts --outdir=dist --target=bun",
    "start": "bun run dist/index.js",
    "test": "bun test",
    "test:watch": "bun test --watch"
  },
  "dependencies": {
    "@nimbus/shared-types": "workspace:*",
    "@nimbus/shared-utils": "workspace:*"
  },
  "devDependencies": {
    "bun-types": "latest",
    "@types/node": "^20.0.0"
  }
}
```

**Example `Dockerfile`**:
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

EXPOSE 3000

CMD ["bun", "run", "dist/index.js"]
```

---

## Service-to-Service Communication

### REST Client Example

**File**: `shared/clients/src/rest-client.ts`

```typescript
export class RestClient {
  constructor(private baseURL: string) {}

  async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseURL}${path}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseURL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
}
```

**Usage in Core Engine Service**:
```typescript
// services/core-engine-service/src/clients/llm.ts
import { RestClient } from '@nimbus/shared-clients';

export class LLMServiceClient {
  private client: RestClient;

  constructor() {
    this.client = new RestClient(process.env.LLM_SERVICE_URL!);
  }

  async chat(messages: Message[]): Promise<ChatResponse> {
    return this.client.post('/api/llm/chat', { messages });
  }
}
```

### WebSocket Client Example

**File**: `shared/clients/src/ws-client.ts`

```typescript
export class WebSocketClient {
  private ws: WebSocket;

  constructor(url: string) {
    this.ws = new WebSocket(url);
  }

  on(event: string, handler: (data: any) => void) {
    this.ws.on('message', (msg) => {
      const { type, data } = JSON.parse(msg);
      if (type === event) handler(data);
    });
  }

  send(type: string, data: any) {
    this.ws.send(JSON.stringify({ type, data }));
  }
}
```

---

## API Gateway (Future)

For production, consider adding an **API Gateway** service:

```
┌─────────────────────────────────────┐
│         API Gateway Service          │
│  - Rate limiting                     │
│  - Authentication                    │
│  - Request routing                   │
│  - Load balancing                    │
└─────────────┬───────────────────────┘
              │
    ┌─────────┴──────────┬───────────────┐
    │                    │               │
┌───▼───┐          ┌────▼────┐    ┌────▼────┐
│  CLI  │          │  Core   │    │   LLM   │
│Service│          │ Engine  │    │ Service │
└───────┘          └─────────┘    └─────────┘
```

---

## Service Health Checks

Every service implements a `/health` endpoint:

```typescript
// All services: src/routes/health.ts
export async function healthCheck(req: Request): Promise<Response> {
  return Response.json({
    status: 'healthy',
    service: process.env.SERVICE_NAME,
    version: process.env.SERVICE_VERSION,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
```

---

## Monitoring & Logging

### Structured Logging

**File**: `shared/utils/src/logger.ts`

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
}
```

### Distributed Tracing (Future)

Use OpenTelemetry for distributed tracing across services.

---

## Security Considerations

1. **Service-to-Service Auth**: Use API keys or JWT tokens
2. **TLS/HTTPS**: Enable in production for all services
3. **Secrets Management**: Use environment variables, never commit secrets
4. **Network Isolation**: Use Docker networks / K8s NetworkPolicies
5. **Rate Limiting**: Implement per-service rate limits

---

## Migration from Monorepo

**Changes**:
1. ~~`packages/`~~ → `services/` (separate deployable units)
2. ~~`pnpm`~~ → `bun` (package manager)
3. ~~Direct function calls~~ → REST/WebSocket APIs
4. ~~Shared monorepo packages~~ → Internal workspace packages

**Benefits**:
- **Independent scaling**: Scale services based on load
- **Technology flexibility**: Different services can use different tech (though all use Bun for MVP)
- **Fault isolation**: One service failure doesn't bring down the entire system
- **Team autonomy**: Teams can develop, test, and deploy independently

**Trade-offs**:
- **Network latency**: Service-to-service calls over network vs in-process
- **Complexity**: More moving parts, requires orchestration
- **Debugging**: Distributed tracing needed for cross-service debugging

---

## Acceptance Criteria

- [ ] All services run independently with Bun runtime
- [ ] Services communicate via REST APIs successfully
- [ ] WebSocket streaming works for LLM responses and progress updates
- [ ] Shared libraries used across services via workspace dependencies
- [ ] Docker Compose orchestration works for staging
- [ ] Health checks implemented for all services
- [ ] Service discovery works in all environments (local, staging, production)
- [ ] API contracts documented and versioned

---

*Document Version: 2.0*
*Last Updated: January 2026*
