# Infrastructure Team - Release 2 Specification

> **Team**: Infrastructure Team
> **Phase**: Release 2 (Months 4-6)
> **Dependencies**: Core Engine Team

---

## Overview

In Release 2, the Infrastructure Team extends the state layer with database schema additions to support operation history/replay, plugins, personas, and enhanced configuration management.

---

## Database Schema Additions

### 1. Operation History Tables

```sql
-- Operation history for replay functionality
CREATE TABLE operations (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL,           -- 'chat', 'generate', 'deploy', 'query'
    input TEXT NOT NULL,          -- JSON: user input and context
    output TEXT,                  -- JSON: operation result
    plan TEXT,                    -- JSON: execution plan
    status TEXT DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed', 'cancelled'
    error TEXT,                   -- Error message if failed
    duration_ms INTEGER,
    tokens_used INTEGER,
    cost_cents INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,

    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_operations_session ON operations(session_id);
CREATE INDEX idx_operations_status ON operations(status);
CREATE INDEX idx_operations_created ON operations(created_at);

-- Sessions for grouping related operations
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT,
    context TEXT,                 -- JSON: session context (directory, env, etc.)
    persona_id TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,

    FOREIGN KEY (persona_id) REFERENCES personas(id)
);

-- Operation steps for detailed tracking
CREATE TABLE operation_steps (
    id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL,
    step_number INTEGER NOT NULL,
    type TEXT NOT NULL,           -- 'llm_call', 'tool_call', 'user_input', 'verification'
    tool_name TEXT,
    input TEXT,                   -- JSON
    output TEXT,                  -- JSON
    status TEXT DEFAULT 'pending',
    duration_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (operation_id) REFERENCES operations(id)
);

CREATE INDEX idx_steps_operation ON operation_steps(operation_id);

-- Checkpoints for operation replay
CREATE TABLE checkpoints (
    id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    name TEXT,
    state TEXT NOT NULL,          -- JSON: complete state snapshot
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (operation_id) REFERENCES operations(id),
    FOREIGN KEY (step_id) REFERENCES operation_steps(id)
);

CREATE INDEX idx_checkpoints_operation ON checkpoints(operation_id);
```

### 2. Plugin System Tables

```sql
-- Installed plugins
CREATE TABLE plugins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    version TEXT NOT NULL,
    description TEXT,
    author TEXT,
    homepage TEXT,
    repository TEXT,
    type TEXT NOT NULL,           -- 'tool', 'provider', 'generator', 'ui', 'integration'
    entry_point TEXT NOT NULL,    -- Path to main module
    config_schema TEXT,           -- JSON Schema for plugin config
    dependencies TEXT,            -- JSON: list of dependencies
    permissions TEXT,             -- JSON: required permissions
    enabled BOOLEAN DEFAULT true,
    installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

CREATE INDEX idx_plugins_type ON plugins(type);
CREATE INDEX idx_plugins_enabled ON plugins(enabled);

-- Plugin configurations
CREATE TABLE plugin_configs (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    config TEXT NOT NULL,         -- JSON: plugin configuration
    profile TEXT DEFAULT 'default', -- Config profile name
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (plugin_id) REFERENCES plugins(id),
    UNIQUE (plugin_id, profile)
);

-- Plugin hooks
CREATE TABLE plugin_hooks (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    hook_name TEXT NOT NULL,      -- 'pre_execute', 'post_execute', 'on_error', etc.
    priority INTEGER DEFAULT 100, -- Lower = higher priority
    enabled BOOLEAN DEFAULT true,

    FOREIGN KEY (plugin_id) REFERENCES plugins(id)
);

CREATE INDEX idx_hooks_name ON plugin_hooks(hook_name);

-- Plugin registry cache (for marketplace)
CREATE TABLE plugin_registry (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    latest_version TEXT NOT NULL,
    description TEXT,
    author TEXT,
    downloads INTEGER DEFAULT 0,
    rating REAL,
    categories TEXT,              -- JSON: list of categories
    metadata TEXT,                -- JSON: additional metadata
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3. Persona System Tables

```sql
-- Persona definitions
CREATE TABLE personas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT NOT NULL,
    temperature REAL DEFAULT 0.7,
    model_preference TEXT,        -- Preferred model for this persona
    response_style TEXT,          -- JSON: style configuration
    capabilities TEXT,            -- JSON: enabled/disabled capabilities
    is_builtin BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

-- Built-in personas
INSERT INTO personas (id, name, display_name, description, system_prompt, temperature, is_builtin) VALUES
('persona_professional', 'professional', 'Professional',
 'Formal, detailed responses with comprehensive explanations',
 'You are a professional cloud infrastructure consultant. Provide detailed, formal responses with thorough explanations. Always explain the reasoning behind recommendations and include relevant documentation references.',
 0.5, true),

('persona_concise', 'concise', 'Concise',
 'Brief, to-the-point responses focusing on commands and code',
 'You are a concise infrastructure assistant. Provide brief, actionable responses. Focus on commands and code. Minimize explanations unless asked. Use bullet points.',
 0.3, true),

('persona_educational', 'educational', 'Educational',
 'Teaching-focused responses that explain concepts in depth',
 'You are an educational infrastructure mentor. Explain concepts thoroughly, use analogies, and teach best practices. Include "why" explanations and common pitfalls to avoid.',
 0.7, true),

('persona_cautious', 'cautious', 'Cautious',
 'Safety-focused responses with extra warnings and confirmations',
 'You are a safety-conscious infrastructure advisor. Always highlight potential risks, suggest dry-run options first, and emphasize backup procedures. Err on the side of caution.',
 0.3, true),

('persona_devops', 'devops', 'DevOps Expert',
 'CI/CD and automation focused',
 'You are a DevOps automation expert. Focus on CI/CD pipelines, GitOps practices, and infrastructure automation. Emphasize repeatability, idempotency, and automation best practices.',
 0.5, true),

('persona_security', 'security', 'Security Focused',
 'Security and compliance oriented responses',
 'You are a cloud security specialist. Prioritize security best practices, compliance requirements, and threat mitigation. Always suggest security hardening options and audit logging.',
 0.4, true);

-- Persona usage tracking
CREATE TABLE persona_usage (
    id TEXT PRIMARY KEY,
    persona_id TEXT NOT NULL,
    session_id TEXT,
    used_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (persona_id) REFERENCES personas(id),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_persona_usage ON persona_usage(persona_id, used_at);
```

### 4. Enhanced Configuration Tables

```sql
-- User preferences with versioning
CREATE TABLE preferences (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,          -- JSON value
    type TEXT NOT NULL,           -- 'string', 'number', 'boolean', 'object', 'array'
    description TEXT,
    default_value TEXT,
    version INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default preferences
INSERT INTO preferences (id, key, value, type, description, default_value) VALUES
('pref_theme', 'ui.theme', '"auto"', 'string', 'Color theme', '"auto"'),
('pref_confirm', 'safety.require_confirmation', 'true', 'boolean', 'Require confirmation for mutations', 'true'),
('pref_dry_run', 'safety.default_dry_run', 'false', 'boolean', 'Default to dry-run mode', 'false'),
('pref_telemetry', 'telemetry.enabled', 'false', 'boolean', 'Enable anonymous telemetry', 'false'),
('pref_model', 'llm.default_model', '"claude-sonnet-4-20250514"', 'string', 'Default LLM model', '"claude-sonnet-4-20250514"'),
('pref_persona', 'agent.default_persona', '"professional"', 'string', 'Default persona', '"professional"'),
('pref_history_limit', 'history.max_entries', '1000', 'number', 'Max history entries', '1000'),
('pref_output_dir', 'generator.output_directory', '"./infrastructure"', 'string', 'Default output directory', '"./infrastructure"');

-- Configuration profiles for different environments
CREATE TABLE config_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    config TEXT NOT NULL,         -- JSON: complete config override
    is_active BOOLEAN DEFAULT false,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

-- Environment-specific configurations
CREATE TABLE environment_configs (
    id TEXT PRIMARY KEY,
    environment TEXT NOT NULL,    -- 'development', 'staging', 'production'
    cloud_provider TEXT NOT NULL, -- 'aws', 'gcp', 'azure'
    config TEXT NOT NULL,         -- JSON: environment-specific config
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,

    UNIQUE (environment, cloud_provider)
);
```

### 5. Secrets Management Tables

```sql
-- Encrypted credentials storage
CREATE TABLE credentials (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,       -- 'aws', 'gcp', 'azure', 'github', 'gitlab', etc.
    type TEXT NOT NULL,           -- 'api_key', 'access_key', 'service_account', 'oauth'
    encrypted_data TEXT NOT NULL, -- Encrypted JSON with credentials
    metadata TEXT,                -- JSON: non-sensitive metadata
    expires_at DATETIME,
    last_used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

CREATE INDEX idx_credentials_provider ON credentials(provider);

-- Credential profiles for different contexts
CREATE TABLE credential_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    credentials TEXT NOT NULL,    -- JSON: mapping of provider -> credential_id
    is_default BOOLEAN DEFAULT false,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Migration System

### Migration Manager

**File**: `packages/core/src/database/migrations.ts`

```typescript
interface Migration {
  version: number;
  name: string;
  up: string;    // SQL to apply
  down: string;  // SQL to rollback
}

export class MigrationManager {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.ensureMigrationTable();
  }

  private ensureMigrationTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async getCurrentVersion(): Promise<number> {
    const result = this.db.prepare(
      'SELECT MAX(version) as version FROM migrations'
    ).get();
    return result?.version || 0;
  }

  async migrate(targetVersion?: number): Promise<void> {
    const currentVersion = await this.getCurrentVersion();
    const target = targetVersion ?? this.getLatestVersion();

    if (target > currentVersion) {
      await this.migrateUp(currentVersion, target);
    } else if (target < currentVersion) {
      await this.migrateDown(currentVersion, target);
    }
  }

  private async migrateUp(from: number, to: number): Promise<void> {
    const migrations = this.getMigrations()
      .filter(m => m.version > from && m.version <= to)
      .sort((a, b) => a.version - b.version);

    for (const migration of migrations) {
      console.log(`Applying migration ${migration.version}: ${migration.name}`);

      this.db.transaction(() => {
        this.db.exec(migration.up);
        this.db.prepare(
          'INSERT INTO migrations (version, name) VALUES (?, ?)'
        ).run(migration.version, migration.name);
      })();
    }
  }

  private async migrateDown(from: number, to: number): Promise<void> {
    const migrations = this.getMigrations()
      .filter(m => m.version <= from && m.version > to)
      .sort((a, b) => b.version - a.version);

    for (const migration of migrations) {
      console.log(`Rolling back migration ${migration.version}: ${migration.name}`);

      this.db.transaction(() => {
        this.db.exec(migration.down);
        this.db.prepare(
          'DELETE FROM migrations WHERE version = ?'
        ).run(migration.version);
      })();
    }
  }

  private getMigrations(): Migration[] {
    return [
      {
        version: 1,
        name: 'initial_schema',
        up: INITIAL_SCHEMA_SQL,
        down: 'DROP TABLE IF EXISTS config; DROP TABLE IF EXISTS credentials; ...',
      },
      {
        version: 2,
        name: 'add_operations_history',
        up: OPERATIONS_HISTORY_SQL,
        down: 'DROP TABLE IF EXISTS checkpoints; DROP TABLE IF EXISTS operation_steps; DROP TABLE IF EXISTS operations; DROP TABLE IF EXISTS sessions;',
      },
      {
        version: 3,
        name: 'add_plugin_system',
        up: PLUGIN_SYSTEM_SQL,
        down: 'DROP TABLE IF EXISTS plugin_registry; DROP TABLE IF EXISTS plugin_hooks; DROP TABLE IF EXISTS plugin_configs; DROP TABLE IF EXISTS plugins;',
      },
      {
        version: 4,
        name: 'add_personas',
        up: PERSONA_SYSTEM_SQL,
        down: 'DROP TABLE IF EXISTS persona_usage; DROP TABLE IF EXISTS personas;',
      },
      {
        version: 5,
        name: 'enhanced_config',
        up: ENHANCED_CONFIG_SQL,
        down: 'DROP TABLE IF EXISTS environment_configs; DROP TABLE IF EXISTS config_profiles; DROP TABLE IF EXISTS preferences;',
      },
    ];
  }

  private getLatestVersion(): number {
    return Math.max(...this.getMigrations().map(m => m.version));
  }
}
```

---

## Data Access Layer

### History Repository

**File**: `packages/core/src/database/repositories/history.ts`

```typescript
interface CreateOperationInput {
  sessionId: string;
  type: string;
  input: Record<string, unknown>;
  plan?: Plan;
}

export class HistoryRepository {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  createSession(name?: string, context?: Record<string, unknown>): string {
    const id = generateId();
    this.db.prepare(`
      INSERT INTO sessions (id, name, context)
      VALUES (?, ?, ?)
    `).run(id, name, JSON.stringify(context || {}));
    return id;
  }

  createOperation(input: CreateOperationInput): string {
    const id = generateId();
    this.db.prepare(`
      INSERT INTO operations (id, session_id, type, input, plan, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(
      id,
      input.sessionId,
      input.type,
      JSON.stringify(input.input),
      input.plan ? JSON.stringify(input.plan) : null
    );
    return id;
  }

  updateOperationStatus(
    operationId: string,
    status: string,
    output?: unknown,
    error?: string
  ): void {
    this.db.prepare(`
      UPDATE operations
      SET status = ?, output = ?, error = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, output ? JSON.stringify(output) : null, error, operationId);
  }

  addOperationStep(
    operationId: string,
    step: {
      type: string;
      toolName?: string;
      input?: unknown;
    }
  ): string {
    const id = generateId();
    const stepNumber = this.getNextStepNumber(operationId);

    this.db.prepare(`
      INSERT INTO operation_steps (id, operation_id, step_number, type, tool_name, input, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(id, operationId, stepNumber, step.type, step.toolName, JSON.stringify(step.input || {}));

    return id;
  }

  completeOperationStep(stepId: string, output: unknown, durationMs: number): void {
    this.db.prepare(`
      UPDATE operation_steps
      SET status = 'completed', output = ?, duration_ms = ?
      WHERE id = ?
    `).run(JSON.stringify(output), durationMs, stepId);
  }

  createCheckpoint(operationId: string, stepId: string, name: string, state: unknown): string {
    const id = generateId();
    this.db.prepare(`
      INSERT INTO checkpoints (id, operation_id, step_id, name, state)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, operationId, stepId, name, JSON.stringify(state));
    return id;
  }

  getOperationHistory(options: {
    sessionId?: string;
    type?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Operation[] {
    let query = 'SELECT * FROM operations WHERE 1=1';
    const params: any[] = [];

    if (options.sessionId) {
      query += ' AND session_id = ?';
      params.push(options.sessionId);
    }
    if (options.type) {
      query += ' AND type = ?';
      params.push(options.type);
    }
    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY created_at DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    if (options.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const rows = this.db.prepare(query).all(...params);
    return rows.map(row => this.mapOperation(row));
  }

  getOperationWithSteps(operationId: string): OperationWithSteps | null {
    const operation = this.db.prepare(
      'SELECT * FROM operations WHERE id = ?'
    ).get(operationId);

    if (!operation) return null;

    const steps = this.db.prepare(
      'SELECT * FROM operation_steps WHERE operation_id = ? ORDER BY step_number'
    ).all(operationId);

    const checkpoints = this.db.prepare(
      'SELECT * FROM checkpoints WHERE operation_id = ?'
    ).all(operationId);

    return {
      ...this.mapOperation(operation),
      steps: steps.map(s => this.mapStep(s)),
      checkpoints: checkpoints.map(c => this.mapCheckpoint(c)),
    };
  }

  private getNextStepNumber(operationId: string): number {
    const result = this.db.prepare(
      'SELECT MAX(step_number) as max FROM operation_steps WHERE operation_id = ?'
    ).get(operationId);
    return (result?.max || 0) + 1;
  }

  private mapOperation(row: any): Operation {
    return {
      id: row.id,
      sessionId: row.session_id,
      type: row.type,
      input: JSON.parse(row.input),
      output: row.output ? JSON.parse(row.output) : null,
      plan: row.plan ? JSON.parse(row.plan) : null,
      status: row.status,
      error: row.error,
      durationMs: row.duration_ms,
      tokensUsed: row.tokens_used,
      costCents: row.cost_cents,
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
    };
  }

  private mapStep(row: any): OperationStep {
    return {
      id: row.id,
      operationId: row.operation_id,
      stepNumber: row.step_number,
      type: row.type,
      toolName: row.tool_name,
      input: JSON.parse(row.input),
      output: row.output ? JSON.parse(row.output) : null,
      status: row.status,
      durationMs: row.duration_ms,
      createdAt: new Date(row.created_at),
    };
  }

  private mapCheckpoint(row: any): Checkpoint {
    return {
      id: row.id,
      operationId: row.operation_id,
      stepId: row.step_id,
      name: row.name,
      state: JSON.parse(row.state),
      createdAt: new Date(row.created_at),
    };
  }
}
```

### Plugin Repository

**File**: `packages/core/src/database/repositories/plugins.ts`

```typescript
export class PluginRepository {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  installPlugin(plugin: {
    name: string;
    version: string;
    description?: string;
    author?: string;
    type: string;
    entryPoint: string;
    configSchema?: object;
    dependencies?: string[];
    permissions?: string[];
  }): string {
    const id = generateId();

    this.db.prepare(`
      INSERT INTO plugins (id, name, version, description, author, type, entry_point, config_schema, dependencies, permissions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      plugin.name,
      plugin.version,
      plugin.description,
      plugin.author,
      plugin.type,
      plugin.entryPoint,
      plugin.configSchema ? JSON.stringify(plugin.configSchema) : null,
      plugin.dependencies ? JSON.stringify(plugin.dependencies) : null,
      plugin.permissions ? JSON.stringify(plugin.permissions) : null
    );

    return id;
  }

  getInstalledPlugins(type?: string): Plugin[] {
    let query = 'SELECT * FROM plugins WHERE 1=1';
    const params: any[] = [];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    query += ' ORDER BY name';
    return this.db.prepare(query).all(...params).map(row => this.mapPlugin(row));
  }

  getPluginByName(name: string): Plugin | null {
    const row = this.db.prepare('SELECT * FROM plugins WHERE name = ?').get(name);
    return row ? this.mapPlugin(row) : null;
  }

  updatePluginConfig(pluginId: string, config: object, profile: string = 'default'): void {
    const existing = this.db.prepare(
      'SELECT id FROM plugin_configs WHERE plugin_id = ? AND profile = ?'
    ).get(pluginId, profile);

    if (existing) {
      this.db.prepare(`
        UPDATE plugin_configs
        SET config = ?, updated_at = CURRENT_TIMESTAMP
        WHERE plugin_id = ? AND profile = ?
      `).run(JSON.stringify(config), pluginId, profile);
    } else {
      this.db.prepare(`
        INSERT INTO plugin_configs (id, plugin_id, config, profile)
        VALUES (?, ?, ?, ?)
      `).run(generateId(), pluginId, JSON.stringify(config), profile);
    }
  }

  enablePlugin(pluginId: string): void {
    this.db.prepare('UPDATE plugins SET enabled = true WHERE id = ?').run(pluginId);
  }

  disablePlugin(pluginId: string): void {
    this.db.prepare('UPDATE plugins SET enabled = false WHERE id = ?').run(pluginId);
  }

  uninstallPlugin(pluginId: string): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM plugin_hooks WHERE plugin_id = ?').run(pluginId);
      this.db.prepare('DELETE FROM plugin_configs WHERE plugin_id = ?').run(pluginId);
      this.db.prepare('DELETE FROM plugins WHERE id = ?').run(pluginId);
    })();
  }

  private mapPlugin(row: any): Plugin {
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      description: row.description,
      author: row.author,
      homepage: row.homepage,
      repository: row.repository,
      type: row.type,
      entryPoint: row.entry_point,
      configSchema: row.config_schema ? JSON.parse(row.config_schema) : null,
      dependencies: row.dependencies ? JSON.parse(row.dependencies) : [],
      permissions: row.permissions ? JSON.parse(row.permissions) : [],
      enabled: row.enabled,
      installedAt: new Date(row.installed_at),
      updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    };
  }
}
```

---

## Project Structure

```
packages/core/src/database/
├── index.ts                      # Database initialization
├── migrations.ts                 # Migration manager
├── schema/
│   ├── v1-initial.sql           # MVP schema
│   ├── v2-operations.sql        # History tables
│   ├── v3-plugins.sql           # Plugin tables
│   ├── v4-personas.sql          # Persona tables
│   └── v5-config.sql            # Enhanced config
├── repositories/
│   ├── config.ts                # Config repository
│   ├── credentials.ts           # Credentials repository
│   ├── history.ts               # History repository
│   ├── plugins.ts               # Plugin repository
│   └── personas.ts              # Persona repository
└── types.ts                     # Type definitions
```

---

## User Stories

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-120 | As a user, I want operation history stored | All operations persisted | Sprint 7-8 |
| US-121 | As a user, I want to replay past operations | Replay from checkpoint works | Sprint 7-8 |
| US-122 | As a developer, I want to install plugins | Plugin CRUD operations work | Sprint 9-10 |
| US-123 | As a user, I want multiple personas | Persona switching works | Sprint 9-10 |
| US-124 | As a user, I want config profiles | Profile switching works | Sprint 9-10 |

---

## Sprint Breakdown

### Sprint 7-8 (Weeks 1-4)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Migration system | 2 days | Version control for schema |
| Operations history tables | 3 days | Full schema + repositories |
| Checkpoint system | 2 days | State snapshots |
| History CLI integration | 3 days | `nimbus history` command |

### Sprint 9-10 (Weeks 5-8)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Plugin system tables | 2 days | Schema + repository |
| Persona system tables | 2 days | Schema + built-ins |
| Enhanced config tables | 2 days | Profiles + preferences |
| Data access testing | 2 days | All repositories tested |

---

## Acceptance Criteria

- [ ] Migration system works forward and backward
- [ ] Operation history captures all details
- [ ] Checkpoints enable operation replay
- [ ] Plugin tables support full lifecycle
- [ ] Persona tables with built-in personas
- [ ] Config profiles work correctly
- [ ] All repositories have unit tests
- [ ] No data loss on migrations

---

*Document Version: 1.0*
*Last Updated: January 2026*
