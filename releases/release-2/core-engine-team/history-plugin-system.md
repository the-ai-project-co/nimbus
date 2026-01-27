# Core Engine Team - Release 2 Specification

> **Team**: Core Engine Team
> **Phase**: Release 2 (Months 4-6)
> **Dependencies**: State Layer, MCP Tools

---

## Overview

Release 2 extends the Core Engine with operation history management, the plugin/extension system architecture, and persona mode handling.

---

## New Features

### 1. Operation History System

#### 1.1 History Manager

**File**: `packages/core/src/history/manager.ts`

```typescript
interface OperationRecord {
  id: string;
  timestamp: Date;
  type: 'chat' | 'generate' | 'apply' | 'k8s' | 'helm' | 'cicd';
  command: string;
  input: string;
  output: string;
  status: 'success' | 'error' | 'cancelled';
  durationMs: number;
  model?: string;
  tokensUsed?: number;
  costUsd?: number;
  metadata?: Record<string, unknown>;
}

export class HistoryManager {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async record(operation: Omit<OperationRecord, 'id' | 'timestamp'>): Promise<string> {
    const record: OperationRecord = {
      id: generateId(),
      timestamp: new Date(),
      ...operation,
    };

    await this.db.operations.insert(record);
    return record.id;
  }

  async query(filter: HistoryFilter): Promise<OperationRecord[]> {
    let query = this.db.operations.select();

    if (filter.type) {
      query = query.where('type', '=', filter.type);
    }

    if (filter.since) {
      query = query.where('timestamp', '>=', filter.since);
    }

    if (filter.search) {
      query = query.where(
        sql`input LIKE ${`%${filter.search}%`} OR output LIKE ${`%${filter.search}%`}`
      );
    }

    return query
      .orderBy('timestamp', 'desc')
      .limit(filter.limit || 50)
      .execute();
  }

  async getById(id: string): Promise<OperationRecord | null> {
    return this.db.operations.findOne({ id });
  }

  async export(filter: HistoryFilter, format: 'json' | 'csv'): Promise<string> {
    const records = await this.query(filter);

    if (format === 'json') {
      return JSON.stringify(records, null, 2);
    }

    return this.toCsv(records);
  }
}
```

#### 1.2 Checkpoint System

**File**: `packages/core/src/history/checkpoint.ts`

```typescript
interface Checkpoint {
  id: string;
  operationId: string;
  step: number;
  state: Record<string, unknown>;
  createdAt: Date;
}

export class CheckpointManager {
  private db: Database;

  async createCheckpoint(operationId: string, step: number, state: unknown): Promise<string> {
    const checkpoint: Checkpoint = {
      id: generateId(),
      operationId,
      step,
      state: JSON.parse(JSON.stringify(state)),
      createdAt: new Date(),
    };

    await this.db.checkpoints.insert(checkpoint);
    return checkpoint.id;
  }

  async restore(checkpointId: string): Promise<Checkpoint> {
    const checkpoint = await this.db.checkpoints.findOne({ id: checkpointId });
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }
    return checkpoint;
  }

  async getForOperation(operationId: string): Promise<Checkpoint[]> {
    return this.db.checkpoints
      .select()
      .where('operationId', '=', operationId)
      .orderBy('step', 'asc')
      .execute();
  }
}
```

#### 1.3 Replay System

**File**: `packages/core/src/history/replay.ts`

```typescript
interface ReplayOptions {
  modifyConfig?: boolean;
  dryRun?: boolean;
}

export class ReplayManager {
  private historyManager: HistoryManager;
  private orchestrator: AgentOrchestrator;

  async replay(operationId: string, options: ReplayOptions = {}): Promise<AgentResponse> {
    // Get original operation
    const original = await this.historyManager.getById(operationId);
    if (!original) {
      throw new Error(`Operation ${operationId} not found`);
    }

    // Reconstruct request
    const request: UserRequest = {
      input: original.input,
      context: original.metadata?.context,
      options: {
        dryRun: options.dryRun ?? false,
      },
    };

    // Allow modification if requested
    if (options.modifyConfig) {
      request.context = await this.promptForModifications(original.metadata?.config);
    }

    // Execute
    return this.orchestrator.processRequest(request);
  }

  async getReplayConfig(operationId: string): Promise<Record<string, unknown>> {
    const operation = await this.historyManager.getById(operationId);
    return operation?.metadata?.config || {};
  }
}
```

---

### 2. Plugin/Extension System

#### 2.1 Plugin Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Plugin System                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │   Plugin    │  │   Plugin    │  │   Plugin    │            │
│  │   Loader    │  │  Registry   │  │  Sandbox    │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                    Plugin Interface                        │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────┐  │ │
│  │  │ Tools   │  │Templates│  │ Commands│  │  Hooks      │  │ │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────────┘  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 2.2 Plugin Interface

**File**: `packages/core/src/plugins/interface.ts`

```typescript
import { MCPTool } from '../mcp/types';

interface NimbusPlugin {
  // Metadata
  name: string;
  version: string;
  description: string;
  author?: string;

  // Capabilities
  tools?: MCPTool[];
  templates?: TemplateDefinition[];
  commands?: CommandDefinition[];
  hooks?: PluginHooks;

  // Lifecycle
  initialize?: (context: PluginContext) => Promise<void>;
  destroy?: () => Promise<void>;
}

interface TemplateDefinition {
  type: 'terraform' | 'kubernetes' | 'cicd' | 'monitoring';
  name: string;
  path: string;
  variables?: Record<string, VariableDefinition>;
}

interface CommandDefinition {
  name: string;
  description: string;
  handler: (args: unknown) => Promise<void>;
}

interface PluginHooks {
  beforePlan?: (plan: Plan) => Promise<Plan>;
  afterPlan?: (plan: Plan) => Promise<void>;
  beforeExecute?: (step: PlanStep) => Promise<PlanStep>;
  afterExecute?: (step: PlanStep, result: ExecutionResult) => Promise<void>;
}

interface PluginContext {
  config: NimbusConfig;
  logger: Logger;
  eventEmitter: EventEmitter;
}
```

#### 2.3 Plugin Loader

**File**: `packages/core/src/plugins/loader.ts`

```typescript
export class PluginLoader {
  private pluginDir: string;

  constructor(pluginDir: string = '~/.nimbus/plugins') {
    this.pluginDir = expandPath(pluginDir);
  }

  async loadAll(): Promise<NimbusPlugin[]> {
    const plugins: NimbusPlugin[] = [];

    // Load official plugins
    const officialDir = path.join(this.pluginDir, 'official');
    plugins.push(...await this.loadFromDirectory(officialDir));

    // Load community plugins
    const communityDir = path.join(this.pluginDir, 'community');
    plugins.push(...await this.loadFromDirectory(communityDir));

    // Load local plugins
    const localDir = path.join(this.pluginDir, 'local');
    plugins.push(...await this.loadFromDirectory(localDir));

    return plugins;
  }

  async loadFromDirectory(dir: string): Promise<NimbusPlugin[]> {
    if (!await exists(dir)) return [];

    const entries = await readdir(dir, { withFileTypes: true });
    const plugins: NimbusPlugin[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const plugin = await this.loadPlugin(path.join(dir, entry.name));
        if (plugin) plugins.push(plugin);
      }
    }

    return plugins;
  }

  async loadPlugin(pluginPath: string): Promise<NimbusPlugin | null> {
    const manifestPath = path.join(pluginPath, 'package.json');

    if (!await exists(manifestPath)) {
      return null;
    }

    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    const entryPoint = path.join(pluginPath, manifest.main || 'index.js');

    // Dynamic import
    const module = await import(entryPoint);
    return module.default || module;
  }

  async install(source: string): Promise<void> {
    // Handle npm packages, git repos, local paths
    if (source.startsWith('@nimbus/') || source.includes('/')) {
      await this.installFromNpm(source);
    } else if (source.startsWith('git+')) {
      await this.installFromGit(source);
    } else {
      await this.installFromLocal(source);
    }
  }

  async uninstall(name: string): Promise<void> {
    const pluginPath = await this.findPlugin(name);
    if (pluginPath) {
      await rm(pluginPath, { recursive: true });
    }
  }
}
```

#### 2.4 Plugin Registry

**File**: `packages/core/src/plugins/registry.ts`

```typescript
export class PluginRegistry {
  private plugins: Map<string, NimbusPlugin> = new Map();
  private tools: Map<string, MCPTool> = new Map();
  private templates: Map<string, TemplateDefinition> = new Map();
  private commands: Map<string, CommandDefinition> = new Map();
  private hooks: PluginHooks[] = [];

  async register(plugin: NimbusPlugin, context: PluginContext): Promise<void> {
    // Initialize plugin
    if (plugin.initialize) {
      await plugin.initialize(context);
    }

    // Register plugin
    this.plugins.set(plugin.name, plugin);

    // Register tools
    if (plugin.tools) {
      for (const tool of plugin.tools) {
        this.tools.set(`${plugin.name}:${tool.name}`, tool);
      }
    }

    // Register templates
    if (plugin.templates) {
      for (const template of plugin.templates) {
        this.templates.set(`${plugin.name}:${template.name}`, template);
      }
    }

    // Register commands
    if (plugin.commands) {
      for (const command of plugin.commands) {
        this.commands.set(`${plugin.name}:${command.name}`, command);
      }
    }

    // Register hooks
    if (plugin.hooks) {
      this.hooks.push(plugin.hooks);
    }
  }

  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  getTemplate(name: string): TemplateDefinition | undefined {
    return this.templates.get(name);
  }

  getCommand(name: string): CommandDefinition | undefined {
    return this.commands.get(name);
  }

  async runHook<K extends keyof PluginHooks>(
    hookName: K,
    ...args: Parameters<NonNullable<PluginHooks[K]>>
  ): Promise<void> {
    for (const hooks of this.hooks) {
      const hook = hooks[hookName];
      if (hook) {
        await (hook as Function)(...args);
      }
    }
  }
}
```

---

### 3. Persona Mode Integration

#### 3.1 Persona Configuration

**File**: `packages/core/src/persona/manager.ts`

```typescript
interface Persona {
  id: string;
  name: string;
  mode: 'professional' | 'assistant' | 'expert' | 'custom';
  systemPrompt: string;
  verbosity: 'minimal' | 'normal' | 'detailed';
  showExplanations: boolean;
  showAlternatives: boolean;
  customBehaviors?: string[];
}

const defaultPersonas: Record<string, Persona> = {
  professional: {
    id: 'professional',
    name: 'Professional',
    mode: 'professional',
    systemPrompt: `You are Nimbus, a professional cloud engineering assistant.
Be concise and direct. Provide minimal explanation unless asked.
Focus on getting the job done efficiently.`,
    verbosity: 'minimal',
    showExplanations: false,
    showAlternatives: false,
  },
  assistant: {
    id: 'assistant',
    name: 'Assistant',
    mode: 'assistant',
    systemPrompt: `You are Nimbus, a friendly and helpful cloud engineering assistant.
Explain your reasoning and offer alternatives when relevant.
Be helpful and educational while getting the job done.`,
    verbosity: 'normal',
    showExplanations: true,
    showAlternatives: true,
  },
  expert: {
    id: 'expert',
    name: 'Expert',
    mode: 'expert',
    systemPrompt: `You are Nimbus, an expert cloud engineering assistant.
Provide deep technical detail and advanced options.
Assume the user is experienced and show all available configurations.`,
    verbosity: 'detailed',
    showExplanations: true,
    showAlternatives: true,
  },
};

export class PersonaManager {
  private currentPersona: Persona;
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.currentPersona = defaultPersonas.professional;
  }

  async setPersona(mode: string): Promise<void> {
    if (mode in defaultPersonas) {
      this.currentPersona = defaultPersonas[mode];
    } else {
      // Load custom persona from DB
      const custom = await this.db.personas.findOne({ id: mode });
      if (custom) {
        this.currentPersona = custom;
      }
    }
  }

  getSystemPrompt(): string {
    return this.currentPersona.systemPrompt;
  }

  shouldShowExplanation(): boolean {
    return this.currentPersona.showExplanations;
  }

  shouldShowAlternatives(): boolean {
    return this.currentPersona.showAlternatives;
  }

  getVerbosity(): string {
    return this.currentPersona.verbosity;
  }

  async createCustomPersona(config: Partial<Persona>): Promise<Persona> {
    const persona: Persona = {
      id: generateId(),
      name: config.name || 'Custom',
      mode: 'custom',
      systemPrompt: this.buildCustomPrompt(config),
      verbosity: config.verbosity || 'normal',
      showExplanations: config.showExplanations ?? true,
      showAlternatives: config.showAlternatives ?? true,
      customBehaviors: config.customBehaviors,
    };

    await this.db.personas.insert(persona);
    return persona;
  }

  private buildCustomPrompt(config: Partial<Persona>): string {
    let prompt = `You are Nimbus, a ${config.name || 'custom'} cloud engineering assistant.\n`;

    if (config.customBehaviors) {
      prompt += '\nBehavior guidelines:\n';
      for (const behavior of config.customBehaviors) {
        prompt += `- ${behavior}\n`;
      }
    }

    return prompt;
  }
}
```

---

## User Stories

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-100 | As a user, I want to view operation history | History query returns correct records | Sprint 7-8 |
| US-101 | As a user, I want to replay past operations | Replay executes with original config | Sprint 7-8 |
| US-102 | As a developer, I want to create plugins | Plugin SDK allows tool registration | Sprint 9-10 |
| US-103 | As a user, I want to install plugins | Plugin install command works | Sprint 9-10 |
| US-104 | As a user, I want different persona modes | Persona affects LLM responses | Sprint 11-12 |

---

## Sprint Breakdown

### Sprint 7-8 (Weeks 1-4)

| Task | Effort | Deliverable |
|------|--------|-------------|
| History Manager | 3 days | Record & query operations |
| Checkpoint System | 2 days | Save/restore state |
| Replay System | 3 days | Replay operations |
| Database schema updates | 2 days | New tables |

### Sprint 9-10 (Weeks 5-8)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Plugin Interface design | 2 days | Plugin API defined |
| Plugin Loader | 3 days | Load from directories |
| Plugin Registry | 3 days | Register tools/templates |
| Plugin SDK documentation | 2 days | Developer docs |

### Sprint 11-12 (Weeks 9-12)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Persona Manager | 3 days | Persona handling |
| Default personas | 2 days | 3 built-in personas |
| Custom persona support | 2 days | User-defined personas |
| Integration testing | 3 days | Full system tests |

---

## Acceptance Criteria

- [ ] Operation history accurately recorded
- [ ] History filterable by type, date, search
- [ ] Replay recreates original operation
- [ ] Plugins can register new tools
- [ ] Plugins can add templates
- [ ] Plugin hooks called at appropriate times
- [ ] Persona mode affects LLM prompts
- [ ] Custom personas can be created

---

*Document Version: 1.0*
*Last Updated: January 2026*
