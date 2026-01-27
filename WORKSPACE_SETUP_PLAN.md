# Nimbus Workspace Setup - Implementation Plan

> **Status**: Awaiting Approval
> **Created**: January 2026
> **Based on**: releases/mvp/MICROSERVICES_ARCHITECTURE.md & IMPLEMENTATION_PLAN.md

---

## Executive Summary

This plan establishes the complete Bun workspace structure for Nimbus with all 12 microservices scaffolded and ready for development. The implementation creates a production-ready foundation with working health endpoints, shared libraries, CI/CD, and development tooling.

### Key Decisions (Based on Requirements)
- ✅ **Scope**: Full workspace + all 12 services (scaffolded)
- ✅ **Deployment**: Local Bun development (Docker/K8s later)
- ✅ **Code Level**: Working skeleton with health endpoints
- ✅ **CI/CD**: Basic GitHub Actions workflows
- ✅ **Testing**: Bun test with example test files
- ✅ **Shared Libs**: Working implementations (logger, clients, types)
- ✅ **Existing Code**: Keep alongside new structure
- ✅ **Config**: .env.example files per service
- ✅ **Ports**: 3000-3011 as per specs
- ✅ **Dev Scripts**: start-all, create-service, dev-setup, check-health
- ✅ **Database**: SQLite with schema from specs
- ✅ **CLI**: Installable with 'bun link'

---

## Implementation Phases

### Phase 1: Workspace Foundation (30 minutes)
1. Initialize Bun workspace
2. Create root configuration files
3. Setup shared libraries structure
4. Configure CI/CD basics

### Phase 2: Service Scaffolding (60 minutes)
1. Create all 12 service directories
2. Generate package.json for each service
3. Implement HTTP servers with health endpoints
4. Create .env.example files

### Phase 3: Shared Libraries Implementation (45 minutes)
1. @nimbus/shared-types - TypeScript types and interfaces
2. @nimbus/shared-utils - Logger, errors, helpers
3. @nimbus/shared-clients - REST and WebSocket clients

### Phase 4: State Service with SQLite (30 minutes)
1. Database schema implementation
2. Migration system
3. Storage adapters (SQLite + in-memory for tests)

### Phase 5: Development Tooling (30 minutes)
1. Helper scripts (start-all, check-health, dev-setup, create-service)
2. CLI binary setup with 'bun link'
3. VS Code workspace configuration

### Phase 6: Testing & CI/CD (30 minutes)
1. Bun test setup with example tests
2. GitHub Actions workflows
3. Pre-commit hooks

**Total Estimated Time**: ~3.5 hours

---

## Detailed File Structure

```
nimbus/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Lint, type-check, test, build
│       └── codeql.yml                # Security scanning
│
├── services/                         # 12 Microservices
│   ├── cli-service/                  # Port 3000/3100
│   │   ├── src/
│   │   │   ├── index.ts              # Entry point + bin
│   │   │   ├── server.ts             # HTTP server (optional)
│   │   │   ├── commands/             # Command handlers
│   │   │   │   ├── chat.ts
│   │   │   │   ├── generate.ts
│   │   │   │   └── index.ts
│   │   │   ├── ui/                   # Ink components (to be implemented)
│   │   │   └── clients/              # Service clients
│   │   ├── tests/
│   │   │   └── health.test.ts
│   │   ├── .env.example
│   │   ├── package.json              # With "bin" field
│   │   └── tsconfig.json
│   │
│   ├── core-engine-service/          # Port 3001/3101
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── server.ts             # HTTP + WebSocket
│   │   │   ├── routes/
│   │   │   │   ├── health.ts
│   │   │   │   ├── plan.ts
│   │   │   │   └── execute.ts
│   │   │   ├── agent/                # (to be implemented)
│   │   │   │   ├── orchestrator.ts
│   │   │   │   ├── planner.ts
│   │   │   │   └── executor.ts
│   │   │   └── types/
│   │   ├── tests/
│   │   ├── .env.example
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── llm-service/                  # Port 3002/3102
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── server.ts             # HTTP + WebSocket
│   │   │   ├── routes/
│   │   │   │   ├── health.ts
│   │   │   │   ├── chat.ts
│   │   │   │   └── models.ts
│   │   │   ├── providers/            # (to be implemented)
│   │   │   │   ├── base.ts
│   │   │   │   ├── anthropic.ts
│   │   │   │   └── openai.ts
│   │   │   └── websocket.ts
│   │   ├── tests/
│   │   ├── .env.example
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── generator-service/            # Port 3003/3103
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── server.ts
│   │   │   ├── routes/
│   │   │   │   ├── health.ts
│   │   │   │   └── terraform.ts
│   │   │   ├── templates/            # (to be populated)
│   │   │   │   └── terraform/
│   │   │   │       └── aws/
│   │   │   └── best-practices/
│   │   ├── tests/
│   │   ├── .env.example
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── git-tools-service/            # Port 3004
│   ├── fs-tools-service/             # Port 3005
│   ├── terraform-tools-service/      # Port 3006
│   ├── k8s-tools-service/            # Port 3007
│   ├── helm-tools-service/           # Port 3008
│   ├── aws-tools-service/            # Port 3009
│   ├── github-tools-service/         # Port 3010
│   │
│   └── state-service/                # Port 3011
│       ├── src/
│       │   ├── index.ts
│       │   ├── server.ts
│       │   ├── routes/
│       │   │   ├── health.ts
│       │   │   ├── config.ts
│       │   │   ├── history.ts
│       │   │   └── credentials.ts
│       │   ├── storage/
│       │   │   ├── file-adapter.ts
│       │   │   ├── sqlite-adapter.ts
│       │   │   └── memory-adapter.ts
│       │   ├── db/
│       │   │   ├── schema.sql        # From specs
│       │   │   └── migrations/
│       │   └── types/
│       ├── data/                     # SQLite database files
│       ├── tests/
│       ├── .env.example
│       ├── package.json
│       └── tsconfig.json
│
├── shared/                           # Shared Libraries
│   ├── types/                        # @nimbus/shared-types
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── service.ts            # Service types
│   │   │   ├── request.ts            # Request types
│   │   │   ├── response.ts           # Response types
│   │   │   ├── plan.ts               # Plan types
│   │   │   └── config.ts             # Config types
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── utils/                        # @nimbus/shared-utils
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── logger.ts             # Pino-based logger
│   │   │   ├── errors.ts             # Error classes
│   │   │   ├── validation.ts         # Zod helpers
│   │   │   └── env.ts                # Env var helpers
│   │   ├── tests/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── clients/                      # @nimbus/shared-clients
│       ├── src/
│       │   ├── index.ts
│       │   ├── rest-client.ts        # HTTP client
│       │   ├── ws-client.ts          # WebSocket client
│       │   └── service-discovery.ts  # Service URLs
│       ├── tests/
│       ├── package.json
│       └── tsconfig.json
│
├── scripts/                          # Development Scripts
│   ├── start-all.sh                  # Start all services in parallel
│   ├── check-health.sh               # Health check all services
│   ├── dev-setup.sh                  # Initial setup automation
│   ├── create-service.ts             # Service generator template
│   └── clean.sh                      # Clean build artifacts
│
├── tests/
│   ├── integration/                  # Cross-service tests
│   ├── e2e/                          # End-to-end tests
│   └── fixtures/                     # Test data
│
├── .vscode/
│   ├── settings.json                 # Workspace settings
│   ├── launch.json                   # Debug configurations
│   └── extensions.json               # Recommended extensions
│
├── bunfig.toml                       # Bun workspace config
├── package.json                      # Root package
├── tsconfig.json                     # Root TypeScript config
├── .gitignore
├── .env.example                      # Global env vars
├── README.md                         # Project README
└── CONTRIBUTING.md                   # Contribution guide

# Existing (preserved)
├── docs/                             # Product documentation
├── releases/                         # Release specifications
└── assets/                           # Logos and branding
```

---

## Implementation Details

### 1. Workspace Configuration

#### `bunfig.toml`
```toml
[install]
# Bun workspace configuration
# Install dependencies for all packages
optional = true
dev = true
peer = true

[install.cache]
# Cache location
dir = ".bun-cache"

[test]
# Test runner configuration
coverage = true
coverageDir = "coverage"
```

#### Root `package.json`
```json
{
  "name": "nimbus",
  "version": "0.1.0",
  "private": true,
  "workspaces": [
    "services/*",
    "shared/*"
  ],
  "scripts": {
    "dev": "./scripts/start-all.sh",
    "health": "./scripts/check-health.sh",
    "setup": "./scripts/dev-setup.sh",
    "clean": "./scripts/clean.sh",
    "test": "bun test",
    "test:coverage": "bun test --coverage",
    "lint": "bun run --filter '*' lint",
    "type-check": "bun run --filter '*' type-check",
    "build": "bun run --filter '*' build"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.3.3"
  }
}
```

#### Root `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "types": ["bun-types"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "paths": {
      "@nimbus/shared-types": ["./shared/types/src"],
      "@nimbus/shared-utils": ["./shared/utils/src"],
      "@nimbus/shared-clients": ["./shared/clients/src"]
    }
  },
  "exclude": ["node_modules", "dist", "coverage"]
}
```

---

### 2. Service Template Structure

Each service follows this pattern:

#### `services/[service-name]/package.json`
```json
{
  "name": "@nimbus/[service-name]",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "start": "bun src/index.ts",
    "test": "bun test",
    "lint": "eslint src",
    "type-check": "tsc --noEmit",
    "build": "bun build src/index.ts --outdir=dist --target=bun"
  },
  "dependencies": {
    "@nimbus/shared-types": "workspace:*",
    "@nimbus/shared-utils": "workspace:*",
    "@nimbus/shared-clients": "workspace:*"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.3.3"
  }
}
```

#### `services/[service-name]/src/index.ts`
```typescript
import { logger } from '@nimbus/shared-utils';
import { startServer } from './server';

const PORT = parseInt(process.env.PORT || '3000');
const WS_PORT = parseInt(process.env.WS_PORT || '3100');

async function main() {
  try {
    await startServer(PORT, WS_PORT);
    logger.info(`[service-name] started on port ${PORT} (WS: ${WS_PORT})`);
  } catch (error) {
    logger.error('Failed to start service', error);
    process.exit(1);
  }
}

main();
```

#### `services/[service-name]/src/server.ts`
```typescript
import { logger } from '@nimbus/shared-utils';

export async function startServer(port: number, wsPort: number) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      // Health check endpoint
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({
          status: 'healthy',
          service: '[service-name]',
          timestamp: new Date().toISOString(),
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 404 for other routes
      return new Response('Not Found', { status: 404 });
    },
  });

  logger.info(`HTTP server listening on port ${port}`);
  return server;
}
```

#### `services/[service-name]/src/routes/health.ts`
```typescript
export function healthHandler() {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
  };
}
```

#### `services/[service-name]/.env.example`
```bash
# Service Configuration
PORT=3000
WS_PORT=3100
LOG_LEVEL=info

# Service Discovery (other services)
STATE_SERVICE_URL=http://localhost:3011
LLM_SERVICE_URL=http://localhost:3002
CORE_ENGINE_SERVICE_URL=http://localhost:3001
```

---

### 3. Shared Libraries Implementation

#### `shared/types/src/service.ts`
```typescript
export interface ServiceConfig {
  port: number;
  wsPort?: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  service: string;
  timestamp: string;
  uptime?: number;
}

export interface ServiceError {
  code: string;
  message: string;
  details?: unknown;
}
```

#### `shared/utils/src/logger.ts`
```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  private log(level: LogLevel, message: string, ...args: any[]) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    console[level === 'error' ? 'error' : 'log'](logMessage, ...args);
  }

  debug(message: string, ...args: any[]) {
    if (this.shouldLog('debug')) this.log('debug', message, ...args);
  }

  info(message: string, ...args: any[]) {
    if (this.shouldLog('info')) this.log('info', message, ...args);
  }

  warn(message: string, ...args: any[]) {
    if (this.shouldLog('warn')) this.log('warn', message, ...args);
  }

  error(message: string, ...args: any[]) {
    if (this.shouldLog('error')) this.log('error', message, ...args);
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }
}

export const logger = new Logger(
  (process.env.LOG_LEVEL as LogLevel) || 'info'
);
```

#### `shared/clients/src/rest-client.ts`
```typescript
export class RestClient {
  constructor(private baseUrl: string) {}

  async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }
}
```

---

### 4. State Service Database

#### `services/state-service/src/db/schema.sql`
```sql
-- From releases/mvp/docs/01-mvp-spec.md

-- Operation History
CREATE TABLE IF NOT EXISTS operations (
    id TEXT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    type TEXT NOT NULL,
    command TEXT NOT NULL,
    input TEXT,
    output TEXT,
    status TEXT DEFAULT 'success',
    duration_ms INTEGER,
    model TEXT,
    tokens_used INTEGER,
    cost_usd REAL,
    metadata TEXT
);

-- Checkpoints
CREATE TABLE IF NOT EXISTS checkpoints (
    id TEXT PRIMARY KEY,
    operation_id TEXT REFERENCES operations(id),
    step INTEGER,
    state TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Templates
CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    variables TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_operations_timestamp ON operations(timestamp);
CREATE INDEX IF NOT EXISTS idx_operations_type ON operations(type);
CREATE INDEX IF NOT EXISTS idx_checkpoints_operation ON checkpoints(operation_id);
```

---

### 5. Development Scripts

#### `scripts/start-all.sh`
```bash
#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Starting all Nimbus services...${NC}"

# Array of services with their ports
services=(
  "state-service:3011"
  "llm-service:3002"
  "core-engine-service:3001"
  "generator-service:3003"
  "git-tools-service:3004"
  "fs-tools-service:3005"
  "terraform-tools-service:3006"
  "k8s-tools-service:3007"
  "helm-tools-service:3008"
  "aws-tools-service:3009"
  "github-tools-service:3010"
  "cli-service:3000"
)

# Start each service in background
for service_port in "${services[@]}"; do
  IFS=':' read -r service port <<< "$service_port"
  echo -e "${YELLOW}Starting $service on port $port...${NC}"
  cd "services/$service" && PORT=$port bun dev &
  cd ../..
done

echo -e "${GREEN}All services started!${NC}"
echo "Run './scripts/check-health.sh' to verify"
echo "Press Ctrl+C to stop all services"

# Wait for Ctrl+C
wait
```

#### `scripts/check-health.sh`
```bash
#!/bin/bash

services=(
  "CLI Service:3000"
  "Core Engine:3001"
  "LLM Service:3002"
  "Generator:3003"
  "Git Tools:3004"
  "FS Tools:3005"
  "Terraform Tools:3006"
  "K8s Tools:3007"
  "Helm Tools:3008"
  "AWS Tools:3009"
  "GitHub Tools:3010"
  "State Service:3011"
)

echo "Checking health of all services..."
echo ""

for service_port in "${services[@]}"; do
  IFS=':' read -r service port <<< "$service_port"
  status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$port/health 2>/dev/null)

  if [ "$status" = "200" ]; then
    echo "✓ $service (port $port): healthy"
  else
    echo "✗ $service (port $port): unhealthy (HTTP $status)"
  fi
done
```

#### `scripts/dev-setup.sh`
```bash
#!/bin/bash

echo "Setting up Nimbus development environment..."

# Install Bun if not present
if ! command -v bun &> /dev/null; then
  echo "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
fi

# Install dependencies
echo "Installing dependencies..."
bun install

# Create .env files if they don't exist
echo "Creating .env files..."
for service in services/*/; do
  if [ -f "${service}.env.example" ] && [ ! -f "${service}.env" ]; then
    cp "${service}.env.example" "${service}.env"
  fi
done

# Initialize database
echo "Initializing State Service database..."
cd services/state-service
mkdir -p data
bun run src/db/init.ts
cd ../..

# Make scripts executable
chmod +x scripts/*.sh

echo "✓ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Review and update .env files in each service"
echo "  2. Run 'bun dev' to start all services"
echo "  3. Run './scripts/check-health.sh' to verify"
```

---

### 6. CI/CD Configuration

#### `.github/workflows/ci.yml`
```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Lint
        run: bun run lint

      - name: Type check
        run: bun run type-check

      - name: Run tests
        run: bun test --coverage

      - name: Build all services
        run: bun run build
```

---

### 7. CLI Service Binary Setup

#### `services/cli-service/package.json` (with bin field)
```json
{
  "name": "@nimbus/cli-service",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "nimbus": "./src/index.ts"
  },
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "start": "bun src/index.ts",
    "link": "bun link",
    "test": "bun test"
  }
}
```

#### Install CLI locally
```bash
cd services/cli-service
bun link

# Now 'nimbus' command is available globally
nimbus --help
```

---

## Testing Strategy

### Example Test File

#### `services/state-service/tests/health.test.ts`
```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startServer } from '../src/server';

describe('State Service', () => {
  let server: any;
  const PORT = 3011;

  beforeAll(async () => {
    server = await startServer(PORT, 3111);
  });

  afterAll(() => {
    server.stop();
  });

  test('health endpoint returns healthy status', async () => {
    const response = await fetch(`http://localhost:${PORT}/health`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.service).toBe('state-service');
  });
});
```

---

## Success Criteria

After implementation, we should have:

- [ ] ✅ All 12 services with working HTTP servers
- [ ] ✅ Health endpoints responding on all services
- [ ] ✅ Shared libraries (@nimbus/shared-*) working
- [ ] ✅ SQLite database initialized with schema
- [ ] ✅ All services start with `bun dev`
- [ ] ✅ CLI installable with `bun link`
- [ ] ✅ GitHub Actions CI passing
- [ ] ✅ All helper scripts working
- [ ] ✅ Example tests passing
- [ ] ✅ TypeScript compilation successful
- [ ] ✅ .env.example files in all services
- [ ] ✅ Documentation (README.md) complete

---

## Post-Implementation Next Steps

After this workspace setup is complete, teams can begin implementing:

1. **Week 1-2**: LLM Service provider implementations
2. **Week 2-3**: State Service API routes
3. **Week 3-4**: Core Engine agent orchestration
4. **Week 5+**: Service-specific implementations per team specs

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Bun compatibility issues | Test on macOS/Linux, document workarounds |
| Port conflicts | Use standard ports 3000-3011, document conflicts |
| Service dependencies | Services work independently, graceful failure |
| SQLite file permissions | Use proper permissions, document setup |

---

## Approval Checklist

Before proceeding with implementation, please confirm:

- [ ] Directory structure is acceptable
- [ ] Port allocation (3000-3011) is correct
- [ ] Shared library approach is appropriate
- [ ] Testing strategy is sufficient
- [ ] CI/CD configuration meets requirements
- [ ] Development scripts are useful
- [ ] SQLite schema matches specifications
- [ ] CLI installation method is correct
- [ ] Existing docs/assets preservation is acceptable

---

**Status**: ⏳ Awaiting Approval

Once approved, implementation will begin immediately with estimated completion in ~3.5 hours.
