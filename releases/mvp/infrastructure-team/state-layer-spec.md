# Infrastructure Team - MVP Specification

> **Team**: Infrastructure Team
> **Phase**: MVP (Months 1-3)
> **Dependencies**: None (foundational)

---

## Overview

The Infrastructure Team is responsible for the State Layer (SQLite, configuration management, credentials), build system, CI/CD pipeline, and distribution channels (npm, Homebrew, curl installer).

---

## State Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        State Layer                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │    SQLite      │  │  Config Files  │  │   Credentials  │    │
│  │                │  │                │  │                │    │
│  │ - History      │  │ - nimbus.yaml  │  │ - AWS creds    │    │
│  │ - Checkpoints  │  │ - Templates    │  │ - GCP keys     │    │
│  │ - Preferences  │  │ - Personas     │  │ - Azure tokens │    │
│  └────────────────┘  └────────────────┘  └────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. SQLite Database

#### 1.1 Database Manager

**File**: `packages/state/src/db.ts`

```typescript
import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';

const NIMBUS_DIR = path.join(os.homedir(), '.nimbus');
const DB_PATH = path.join(NIMBUS_DIR, 'nimbus.db');

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string = DB_PATH) {
    // Ensure directory exists
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.migrate();
  }

  private migrate(): void {
    const migrations = [
      this.createOperationsTable,
      this.createCheckpointsTable,
      this.createTemplatesTable,
      this.createIndexes,
    ];

    const version = this.db.pragma('user_version', { simple: true }) as number;

    for (let i = version; i < migrations.length; i++) {
      migrations[i].call(this);
      this.db.pragma(`user_version = ${i + 1}`);
    }
  }

  private createOperationsTable(): void {
    this.db.exec(`
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
      )
    `);
  }

  private createCheckpointsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        operation_id TEXT REFERENCES operations(id),
        step INTEGER,
        state TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  private createTemplatesTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        variables TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
      )
    `);
  }

  private createIndexes(): void {
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_operations_timestamp ON operations(timestamp);
      CREATE INDEX IF NOT EXISTS idx_operations_type ON operations(type);
      CREATE INDEX IF NOT EXISTS idx_checkpoints_operation ON checkpoints(operation_id);
    `);
  }

  // Query methods
  operations = {
    insert: (record: OperationRecord) => {
      const stmt = this.db.prepare(`
        INSERT INTO operations (id, type, command, input, output, status, duration_ms, model, tokens_used, cost_usd, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        record.id,
        record.type,
        record.command,
        record.input,
        record.output,
        record.status,
        record.durationMs,
        record.model,
        record.tokensUsed,
        record.costUsd,
        JSON.stringify(record.metadata)
      );
    },

    findMany: (filter: OperationFilter) => {
      let sql = 'SELECT * FROM operations WHERE 1=1';
      const params: unknown[] = [];

      if (filter.type) {
        sql += ' AND type = ?';
        params.push(filter.type);
      }

      if (filter.since) {
        sql += ' AND timestamp >= ?';
        params.push(filter.since.toISOString());
      }

      if (filter.search) {
        sql += ' AND (input LIKE ? OR output LIKE ?)';
        params.push(`%${filter.search}%`, `%${filter.search}%`);
      }

      sql += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(filter.limit || 50);

      return this.db.prepare(sql).all(...params) as OperationRecord[];
    },

    findOne: (id: string) => {
      return this.db.prepare('SELECT * FROM operations WHERE id = ?').get(id) as OperationRecord | undefined;
    },
  };

  close(): void {
    this.db.close();
  }
}
```

---

### 2. Configuration Manager

#### 2.1 Config Schema

**File**: `packages/state/src/config/schema.ts`

```typescript
import { z } from 'zod';

export const configSchema = z.object({
  version: z.number().default(1),
  telemetry: z.boolean().default(false),

  llm: z.object({
    default_provider: z.string().default('anthropic'),
    default_model: z.string().default('claude-sonnet-4-20250514'),
    providers: z.record(z.object({
      api_key: z.string().optional(),
      base_url: z.string().optional(),
      models: z.array(z.string()).optional(),
    })).optional(),
    cost_optimization: z.object({
      enabled: z.boolean().default(true),
      use_cheap_model_for: z.array(z.string()).default(['simple_queries']),
      use_expensive_model_for: z.array(z.string()).default(['code_generation']),
    }).optional(),
  }).default({}),

  persona: z.object({
    mode: z.enum(['professional', 'assistant', 'expert', 'custom']).default('professional'),
    verbosity: z.enum(['minimal', 'normal', 'detailed']).default('normal'),
  }).default({}),

  safety: z.object({
    dry_run: z.boolean().default(false),
    require_confirmation: z.boolean().default(true),
    auto_approve: z.object({
      read: z.boolean().default(true),
      generate: z.boolean().default(true),
      create: z.boolean().default(false),
      update: z.boolean().default(false),
      delete: z.boolean().default(false),
    }).default({}),
  }).default({}),

  cloud: z.object({
    default_provider: z.enum(['aws', 'gcp', 'azure']).default('aws'),
    aws: z.object({
      default_region: z.string().default('us-east-1'),
      default_profile: z.string().default('default'),
    }).optional(),
    gcp: z.object({
      default_project: z.string().optional(),
      default_region: z.string().default('us-central1'),
    }).optional(),
    azure: z.object({
      default_subscription: z.string().optional(),
      default_region: z.string().default('eastus'),
    }).optional(),
  }).default({}),

  terraform: z.object({
    default_backend: z.enum(['s3', 'gcs', 'azurerm', 'local']).default('s3'),
    state_bucket: z.string().optional(),
    lock_table: z.string().optional(),
  }).optional(),

  kubernetes: z.object({
    default_context: z.string().optional(),
    default_namespace: z.string().default('default'),
  }).optional(),

  ui: z.object({
    theme: z.enum(['dark', 'light', 'auto']).default('auto'),
    colors: z.boolean().default(true),
    spinner: z.enum(['dots', 'line', 'simple']).default('dots'),
  }).default({}),
});

export type NimbusConfig = z.infer<typeof configSchema>;
```

#### 2.2 Config Manager

**File**: `packages/state/src/config/manager.ts`

```typescript
import * as yaml from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import { configSchema, NimbusConfig } from './schema';

const CONFIG_PATH = path.join(os.homedir(), '.nimbus', 'config.yaml');

export class ConfigManager {
  private config: NimbusConfig;
  private configPath: string;

  constructor(configPath: string = CONFIG_PATH) {
    this.configPath = configPath;
    this.config = this.load();
  }

  private load(): NimbusConfig {
    if (!fs.existsSync(this.configPath)) {
      const defaultConfig = configSchema.parse({});
      this.save(defaultConfig);
      return defaultConfig;
    }

    const content = fs.readFileSync(this.configPath, 'utf-8');
    const parsed = yaml.parse(content);

    // Resolve environment variables
    const resolved = this.resolveEnvVars(parsed);

    return configSchema.parse(resolved);
  }

  private resolveEnvVars(obj: unknown): unknown {
    if (typeof obj === 'string') {
      return obj.replace(/\$\{(\w+)\}/g, (_, key) => process.env[key] || '');
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.resolveEnvVars(item));
    }
    if (typeof obj === 'object' && obj !== null) {
      return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [k, this.resolveEnvVars(v)])
      );
    }
    return obj;
  }

  private save(config: NimbusConfig): void {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    fs.writeFileSync(this.configPath, yaml.stringify(config));
  }

  get<K extends keyof NimbusConfig>(key: K): NimbusConfig[K] {
    return this.config[key];
  }

  set(path: string, value: unknown): void {
    const parts = path.split('.');
    let current: Record<string, unknown> = this.config as Record<string, unknown>;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;

    // Validate
    this.config = configSchema.parse(this.config);
    this.save(this.config);
  }

  getAll(): NimbusConfig {
    return { ...this.config };
  }
}
```

---

### 3. Credentials Manager

**File**: `packages/state/src/credentials/manager.ts`

```typescript
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface CloudCredentials {
  aws?: {
    profiles: Record<string, AWSProfile>;
    defaultProfile: string;
  };
  gcp?: {
    projects: Record<string, GCPProject>;
    defaultProject: string;
  };
  azure?: {
    subscriptions: Record<string, AzureSubscription>;
    defaultSubscription: string;
  };
}

export class CredentialsManager {
  // AWS credentials from ~/.aws/credentials and ~/.aws/config
  async getAWSCredentials(profile: string = 'default'): Promise<AWSCredentials> {
    const credentialsPath = path.join(os.homedir(), '.aws', 'credentials');
    const configPath = path.join(os.homedir(), '.aws', 'config');

    // Parse credentials file
    const credentials = this.parseINI(credentialsPath);
    const config = this.parseINI(configPath);

    const profileCreds = credentials[profile] || credentials.default;
    const profileConfig = config[`profile ${profile}`] || config.default;

    return {
      accessKeyId: profileCreds?.aws_access_key_id,
      secretAccessKey: profileCreds?.aws_secret_access_key,
      region: profileConfig?.region || 'us-east-1',
    };
  }

  // GCP credentials from environment or gcloud config
  async getGCPCredentials(project?: string): Promise<GCPCredentials> {
    // Check for GOOGLE_APPLICATION_CREDENTIALS env var
    const envCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (envCredentials && fs.existsSync(envCredentials)) {
      const serviceAccount = JSON.parse(fs.readFileSync(envCredentials, 'utf-8'));
      return {
        projectId: project || serviceAccount.project_id,
        keyFile: envCredentials,
      };
    }

    // Fall back to gcloud config
    const gcloudConfig = await this.runCommand('gcloud', ['config', 'list', '--format=json']);
    const config = JSON.parse(gcloudConfig);

    return {
      projectId: project || config.core?.project,
    };
  }

  // Azure credentials from az CLI
  async getAzureCredentials(subscription?: string): Promise<AzureCredentials> {
    const accountInfo = await this.runCommand('az', ['account', 'show', '--output=json']);
    const account = JSON.parse(accountInfo);

    return {
      subscriptionId: subscription || account.id,
      tenantId: account.tenantId,
    };
  }

  async validateCredentials(provider: 'aws' | 'gcp' | 'azure'): Promise<ValidationResult> {
    try {
      switch (provider) {
        case 'aws':
          await this.runCommand('aws', ['sts', 'get-caller-identity']);
          return { valid: true };
        case 'gcp':
          await this.runCommand('gcloud', ['auth', 'print-access-token']);
          return { valid: true };
        case 'azure':
          await this.runCommand('az', ['account', 'show']);
          return { valid: true };
      }
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  private parseINI(filePath: string): Record<string, Record<string, string>> {
    if (!fs.existsSync(filePath)) return {};

    const content = fs.readFileSync(filePath, 'utf-8');
    const result: Record<string, Record<string, string>> = {};
    let currentSection = 'default';

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        currentSection = trimmed.slice(1, -1);
        result[currentSection] = {};
      } else if (trimmed.includes('=')) {
        const [key, value] = trimmed.split('=').map(s => s.trim());
        if (!result[currentSection]) result[currentSection] = {};
        result[currentSection][key] = value;
      }
    }

    return result;
  }
}
```

---

### 4. Build System

#### 4.1 Build Configuration

**File**: `tsup.config.ts`

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'packages/cli/src/index.ts',
  },
  format: ['cjs'],
  target: 'node18',
  clean: true,
  dts: false,
  splitting: false,
  treeshake: true,
  minify: process.env.NODE_ENV === 'production',
  banner: {
    js: '#!/usr/bin/env node',
  },
  outDir: 'dist',
  external: [
    // Native modules
    'better-sqlite3',
  ],
});
```

#### 4.2 Monorepo Structure

**File**: `pnpm-workspace.yaml`

```yaml
packages:
  - packages/*
  - templates
```

**File**: `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^typecheck"],
      "outputs": []
    }
  }
}
```

---

### 5. CI/CD Pipeline

**File**: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install

      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm build
      - run: pnpm test

  e2e:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm build
      - run: pnpm test:e2e

  release:
    if: github.ref == 'refs/heads/main'
    needs: [build, e2e]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - run: pnpm install
      - run: pnpm build

      - name: Publish to npm
        run: pnpm publish --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

### 6. Distribution

#### 6.1 npm Package

**File**: `package.json`

```json
{
  "name": "nimbus-cli",
  "version": "0.1.0",
  "description": "AI-powered Cloud Engineering Agent",
  "bin": {
    "nimbus": "./dist/index.js"
  },
  "files": [
    "dist",
    "templates"
  ],
  "engines": {
    "node": ">=18"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

#### 6.2 Homebrew Formula

**File**: `homebrew/nimbus.rb`

```ruby
class Nimbus < Formula
  desc "AI-powered Cloud Engineering Agent"
  homepage "https://nimbus.dev"
  url "https://github.com/nimbus-dev/nimbus/releases/download/v0.1.0/nimbus-0.1.0.tar.gz"
  sha256 "..."

  depends_on "node@20"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    system "#{bin}/nimbus", "--version"
  end
end
```

#### 6.3 curl Installer

**File**: `scripts/install.sh`

```bash
#!/bin/bash
set -e

NIMBUS_VERSION="${NIMBUS_VERSION:-latest}"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

echo "Installing Nimbus..."

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case $ARCH in
  x86_64) ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
esac

# Download
URL="https://github.com/nimbus-dev/nimbus/releases/download/${NIMBUS_VERSION}/nimbus-${OS}-${ARCH}"
curl -fsSL "$URL" -o /tmp/nimbus

# Install
chmod +x /tmp/nimbus
sudo mv /tmp/nimbus "$INSTALL_DIR/nimbus"

echo "Nimbus installed successfully!"
echo "Run 'nimbus --help' to get started."
```

---

## Project Structure

```
packages/state/
├── src/
│   ├── db.ts                 # SQLite database
│   ├── config/
│   │   ├── schema.ts         # Config schema
│   │   └── manager.ts        # Config management
│   ├── credentials/
│   │   └── manager.ts        # Cloud credentials
│   └── index.ts
├── package.json
└── tsconfig.json
```

---

## User Stories

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-070 | As a user, I want persistent operation history | SQLite stores history | Sprint 1-2 |
| US-071 | As a user, I want YAML configuration | Config file works | Sprint 1-2 |
| US-072 | As a user, I want cloud credential detection | AWS/GCP/Azure detected | Sprint 1-2 |
| US-073 | As a user, I want to install via npm | npm install works | Sprint 5-6 |
| US-074 | As a user, I want to install via Homebrew | brew install works | Sprint 5-6 |

---

## Sprint Breakdown

### Sprint 1-2 (Weeks 1-4)

| Task | Effort | Deliverable |
|------|--------|-------------|
| SQLite setup | 2 days | Database working |
| Schema migrations | 1 day | Migration system |
| Config manager | 2 days | YAML config |
| Credentials manager | 2 days | Cloud creds |
| Build system (tsup) | 1 day | Build pipeline |

### Sprint 5-6 (Weeks 9-12)

| Task | Effort | Deliverable |
|------|--------|-------------|
| CI/CD pipeline | 2 days | GitHub Actions |
| npm publishing | 1 day | npm package |
| Homebrew formula | 1 day | brew install |
| curl installer | 1 day | Quick install |

---

## Acceptance Criteria

- [ ] SQLite database persists across sessions
- [ ] Config file supports all settings
- [ ] Environment variable expansion works
- [ ] Cloud credentials auto-detected
- [ ] Build produces single binary
- [ ] npm install works globally
- [ ] CI passes all checks

---

*Document Version: 1.0*
*Last Updated: January 2026*
