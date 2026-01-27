# Core Engine Team - MVP Specification

> **Team**: Core Engine Team
> **Phase**: MVP (Months 1-3)
> **Dependencies**: LLM Integration, MCP Tools

---

## Overview

The Core Engine Team is responsible for the central orchestration layer that connects user intent to tool execution. This includes the Planner, Executor, Verifier, and Safety Manager components.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Core Engine                                │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                     Agent Orchestrator                       │  │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐ │  │
│  │  │  Planner  │  │ Executor  │  │ Verifier  │  │  Safety   │ │  │
│  │  │           │  │           │  │           │  │  Manager  │ │  │
│  │  │ - Parse   │  │ - Run     │  │ - Check   │  │           │ │  │
│  │  │ - Plan    │  │ - Stream  │  │ - Validate│  │ - Confirm │ │  │
│  │  │ - Steps   │  │ - Retry   │  │ - Report  │  │ - Audit   │ │  │
│  │  └───────────┘  └───────────┘  └───────────┘  └───────────┘ │  │
│  └─────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Components to Build

### 1. Agent Orchestrator

**File**: `packages/core/src/agent/orchestrator.ts`

```typescript
import { Planner } from './planner';
import { Executor } from './executor';
import { Verifier } from './verifier';
import { SafetyManager } from '../safety/manager';

interface OrchestratorConfig {
  llmProvider: LLMProvider;
  mcpTools: MCPToolRegistry;
  safetyConfig: SafetyConfig;
}

export class AgentOrchestrator {
  private planner: Planner;
  private executor: Executor;
  private verifier: Verifier;
  private safetyManager: SafetyManager;

  constructor(config: OrchestratorConfig) {
    this.planner = new Planner(config.llmProvider);
    this.executor = new Executor(config.mcpTools);
    this.verifier = new Verifier();
    this.safetyManager = new SafetyManager(config.safetyConfig);
  }

  async processRequest(input: UserRequest): Promise<AgentResponse> {
    // 1. Plan the operation
    const plan = await this.planner.createPlan(input);

    // 2. Check safety requirements
    const safetyCheck = await this.safetyManager.checkPlan(plan);
    if (safetyCheck.requiresConfirmation) {
      const confirmed = await this.requestConfirmation(safetyCheck);
      if (!confirmed) {
        return { status: 'cancelled', reason: 'User declined' };
      }
    }

    // 3. Execute the plan
    const result = await this.executor.execute(plan);

    // 4. Verify the result
    const verification = await this.verifier.verify(plan, result);

    return {
      status: verification.success ? 'success' : 'failed',
      result,
      verification,
    };
  }
}
```

---

### 2. Planner Component

**File**: `packages/core/src/agent/planner.ts`

```typescript
interface Plan {
  id: string;
  intent: string;
  steps: PlanStep[];
  context: Record<string, unknown>;
  estimatedDuration: number;
}

interface PlanStep {
  id: string;
  type: 'tool_call' | 'llm_query' | 'user_interaction';
  tool?: string;
  parameters?: Record<string, unknown>;
  dependsOn?: string[];
}

export class Planner {
  private llm: LLMProvider;

  constructor(llm: LLMProvider) {
    this.llm = llm;
  }

  async createPlan(request: UserRequest): Promise<Plan> {
    // 1. Parse user intent
    const intent = await this.parseIntent(request);

    // 2. Determine required steps
    const steps = await this.determineSteps(intent);

    // 3. Optimize execution order
    const optimizedSteps = this.optimizeExecution(steps);

    return {
      id: generateId(),
      intent: intent.description,
      steps: optimizedSteps,
      context: intent.context,
      estimatedDuration: this.estimateDuration(optimizedSteps),
    };
  }

  private async parseIntent(request: UserRequest): Promise<Intent> {
    const response = await this.llm.complete({
      messages: [
        { role: 'system', content: INTENT_PARSER_PROMPT },
        { role: 'user', content: request.input },
      ],
      responseFormat: { type: 'json_object' },
    });

    return JSON.parse(response.content);
  }

  private async determineSteps(intent: Intent): Promise<PlanStep[]> {
    // Map intent to required tool calls
    const tools = await this.llm.selectTools(intent, this.availableTools);
    return tools.map(tool => this.toolToPlanStep(tool));
  }

  private optimizeExecution(steps: PlanStep[]): PlanStep[] {
    // Build dependency graph and determine parallel execution
    const graph = this.buildDependencyGraph(steps);
    return this.topologicalSort(graph);
  }
}
```

---

### 3. Executor Component

**File**: `packages/core/src/agent/executor.ts`

```typescript
interface ExecutionResult {
  success: boolean;
  output: string;
  artifacts?: Artifact[];
  error?: ExecutionError;
  duration: number;
}

export class Executor {
  private tools: MCPToolRegistry;
  private maxRetries: number = 3;

  constructor(tools: MCPToolRegistry) {
    this.tools = tools;
  }

  async execute(plan: Plan): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    const completed = new Map<string, ExecutionResult>();

    for (const step of plan.steps) {
      // Wait for dependencies
      await this.waitForDependencies(step, completed);

      // Execute with retry logic
      const result = await this.executeStep(step);
      completed.set(step.id, result);
      results.push(result);

      // Stream progress to user
      this.emitProgress(step, result);

      // Stop on critical failure
      if (!result.success && this.isCritical(step)) {
        break;
      }
    }

    return results;
  }

  private async executeStep(step: PlanStep): Promise<ExecutionResult> {
    const startTime = Date.now();

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const tool = this.tools.get(step.tool!);
        const output = await tool.execute(step.parameters);

        return {
          success: true,
          output,
          duration: Date.now() - startTime,
        };
      } catch (error) {
        if (attempt === this.maxRetries) {
          return {
            success: false,
            output: '',
            error: this.wrapError(error),
            duration: Date.now() - startTime,
          };
        }
        await this.delay(attempt * 1000); // Exponential backoff
      }
    }

    throw new Error('Unexpected executor state');
  }

  private async waitForDependencies(
    step: PlanStep,
    completed: Map<string, ExecutionResult>
  ): Promise<void> {
    if (!step.dependsOn) return;

    for (const depId of step.dependsOn) {
      while (!completed.has(depId)) {
        await this.delay(100);
      }
    }
  }
}
```

---

### 4. Verifier Component

**File**: `packages/core/src/agent/verifier.ts`

```typescript
interface Verification {
  success: boolean;
  checks: VerificationCheck[];
  summary: string;
}

interface VerificationCheck {
  name: string;
  passed: boolean;
  message: string;
}

export class Verifier {
  async verify(plan: Plan, results: ExecutionResult[]): Promise<Verification> {
    const checks: VerificationCheck[] = [];

    // Check all steps completed
    checks.push(this.checkAllStepsCompleted(plan, results));

    // Check no errors
    checks.push(this.checkNoErrors(results));

    // Domain-specific checks
    if (plan.intent.includes('terraform')) {
      checks.push(await this.checkTerraformValid(results));
    }

    if (plan.intent.includes('kubernetes')) {
      checks.push(await this.checkKubernetesValid(results));
    }

    return {
      success: checks.every(c => c.passed),
      checks,
      summary: this.generateSummary(checks),
    };
  }

  private checkAllStepsCompleted(
    plan: Plan,
    results: ExecutionResult[]
  ): VerificationCheck {
    const completed = results.filter(r => r.success).length;
    const total = plan.steps.length;

    return {
      name: 'All steps completed',
      passed: completed === total,
      message: `${completed}/${total} steps completed successfully`,
    };
  }

  private async checkTerraformValid(
    results: ExecutionResult[]
  ): VerificationCheck {
    // Run terraform validate on generated files
    const terraformResults = results.filter(r =>
      r.artifacts?.some(a => a.path.endsWith('.tf'))
    );

    // Validation logic...
    return {
      name: 'Terraform validation',
      passed: true,
      message: 'Generated Terraform is valid',
    };
  }
}
```

---

### 5. Safety Manager

**File**: `packages/core/src/safety/manager.ts`

```typescript
interface SafetyCheck {
  requiresConfirmation: boolean;
  level: 'read' | 'create' | 'update' | 'delete';
  resources: string[];
  message: string;
}

interface SafetyConfig {
  dryRun: boolean;
  requireConfirmation: boolean;
  autoApprove: {
    read: boolean;
    generate: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
  };
}

export class SafetyManager {
  private config: SafetyConfig;

  constructor(config: SafetyConfig) {
    this.config = config;
  }

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

  private classifyOperation(plan: Plan): SafetyCheck['level'] {
    // Analyze plan steps to determine operation type
    const hasDelete = plan.steps.some(s =>
      ['terraform_destroy', 'k8s_delete', 'helm_uninstall'].includes(s.tool!)
    );
    if (hasDelete) return 'delete';

    const hasUpdate = plan.steps.some(s =>
      ['terraform_apply', 'k8s_apply', 'helm_upgrade'].includes(s.tool!)
    );
    if (hasUpdate) return 'update';

    const hasCreate = plan.steps.some(s =>
      s.type === 'tool_call' && s.tool?.includes('create')
    );
    if (hasCreate) return 'create';

    return 'read';
  }

  private needsConfirmation(level: SafetyCheck['level']): boolean {
    if (this.config.dryRun) return true;
    if (!this.config.requireConfirmation) return false;
    return !this.config.autoApprove[level];
  }

  private generateSafetyMessage(
    level: SafetyCheck['level'],
    resources: string[]
  ): string {
    const messages = {
      read: 'This operation will read resources.',
      create: `This will create ${resources.length} resources.`,
      update: `This will modify ${resources.length} resources.`,
      delete: `⚠️ This will DELETE ${resources.length} resources permanently!`,
    };
    return messages[level];
  }
}
```

---

### 6. Safety Policies

**File**: `packages/core/src/safety/policies.ts`

```typescript
interface Policy {
  name: string;
  check: (plan: Plan) => Promise<PolicyResult>;
}

interface PolicyResult {
  allowed: boolean;
  reason?: string;
  suggestions?: string[];
}

export const defaultPolicies: Policy[] = [
  {
    name: 'no_production_delete_without_backup',
    check: async (plan) => {
      const deletesProduction = plan.steps.some(
        s => s.tool === 'terraform_destroy' &&
             s.parameters?.environment === 'production'
      );

      if (deletesProduction) {
        return {
          allowed: false,
          reason: 'Cannot delete production resources without backup',
          suggestions: ['Create a backup first', 'Use staging environment'],
        };
      }
      return { allowed: true };
    },
  },

  {
    name: 'require_dry_run_first',
    check: async (plan) => {
      const hasApply = plan.steps.some(s =>
        ['terraform_apply', 'helm_install'].includes(s.tool!)
      );

      if (hasApply && !plan.context.dryRunCompleted) {
        return {
          allowed: false,
          reason: 'Dry run required before apply',
          suggestions: ['Run with --dry-run first'],
        };
      }
      return { allowed: true };
    },
  },
];
```

---

## API Contracts

### Request/Response Types

```typescript
// User Request
interface UserRequest {
  input: string;
  context?: {
    currentDirectory?: string;
    cloudProvider?: string;
    kubeContext?: string;
  };
  options?: {
    dryRun?: boolean;
    autoApprove?: boolean;
    verbose?: boolean;
  };
}

// Agent Response
interface AgentResponse {
  status: 'success' | 'failed' | 'cancelled';
  result?: ExecutionResult[];
  verification?: Verification;
  reason?: string;
  artifacts?: Artifact[];
}

// Artifact (generated files, etc.)
interface Artifact {
  type: 'file' | 'url' | 'data';
  path?: string;
  content?: string;
  url?: string;
}
```

---

## Core Engine Service Architecture

The Core Engine is built as a **microservice** using **Bun** as the runtime and package manager. It exposes REST APIs and WebSocket endpoints for agent orchestration.

**Service Responsibilities:**
- Agent orchestration (Planner, Executor, Verifier)
- Safety management and policy enforcement
- Plan creation and optimization
- Execution coordination across MCP tool services
- Real-time progress streaming via WebSockets

**Communication Patterns:**
- **REST API**: For plan creation, execution requests, and status queries
- **WebSocket**: For streaming execution progress and real-time updates
- **Service-to-Service**: REST calls to LLM Service and MCP Tools Services

**Deployment:**
- **Local Development**: Bun process on port 3001
- **Staging**: Docker container orchestrated with docker-compose
- **Production**: Kubernetes pod with horizontal scaling

## Project Structure

```
services/
├── core-engine-service/          # Core Engine Service
│   ├── src/
│   │   ├── index.ts              # Entry point
│   │   ├── server.ts             # REST API server (Bun.serve)
│   │   ├── websocket.ts          # WebSocket server for streaming
│   │   ├── routes/
│   │   │   ├── plan.ts           # POST /api/core/plan
│   │   │   ├── execute.ts        # POST /api/core/execute
│   │   │   ├── validate.ts       # POST /api/core/validate
│   │   │   └── status.ts         # GET /api/core/status/:id
│   │   ├── agent/
│   │   │   ├── orchestrator.ts   # Agent orchestrator
│   │   │   ├── planner.ts        # Planner agent
│   │   │   ├── executor.ts       # Executor agent
│   │   │   ├── verifier.ts       # Verifier agent
│   │   │   └── types.ts          # Agent types
│   │   ├── safety/
│   │   │   ├── manager.ts        # Safety manager
│   │   │   └── policies.ts       # Safety policies
│   │   ├── clients/
│   │   │   ├── llm.ts            # REST client for LLM Service
│   │   │   ├── mcp-tools.ts      # REST client for MCP Tools Services
│   │   │   └── state.ts          # REST client for State Service
│   │   ├── types/
│   │   │   ├── request.ts        # Request types
│   │   │   ├── response.ts       # Response types
│   │   │   └── plan.ts           # Plan types
│   │   └── utils/
│   │       ├── logger.ts         # Logging utility
│   │       └── errors.ts         # Error handling
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile                # For staging/production
│   └── docker-compose.yml        # Local development with Docker
```

### REST API Endpoints

**File**: `services/core-engine-service/src/routes/plan.ts`

```typescript
// POST /api/core/plan
// Create an execution plan from user request
export async function createPlan(req: Request): Promise<Response> {
  const { input, context, options } = await req.json();

  const orchestrator = new AgentOrchestrator(config);
  const plan = await orchestrator.planner.createPlan({ input, context, options });

  return Response.json({ plan });
}

// POST /api/core/execute
// Execute a plan
export async function executePlan(req: Request): Promise<Response> {
  const { planId } = await req.json();

  const plan = await stateSe.getPlan(planId);
  const orchestrator = new AgentOrchestrator(config);
  const result = await orchestrator.processRequest(plan);

  return Response.json({ result });
}

// GET /api/core/status/:id
// Get execution status
export async function getStatus(req: Request): Promise<Response> {
  const { id } = req.params;
  const status = await getExecutionStatus(id);

  return Response.json({ status });
}
```

### WebSocket Streaming

**File**: `services/core-engine-service/src/websocket.ts`

```typescript
// WebSocket endpoint: ws://core-engine-service:3001/stream
export function handleWebSocket(ws: WebSocket) {
  ws.on('message', async (data) => {
    const { type, payload } = JSON.parse(data);

    if (type === 'execute') {
      const orchestrator = new AgentOrchestrator(config);

      // Stream progress updates
      orchestrator.on('progress', (update) => {
        ws.send(JSON.stringify({ type: 'progress', data: update }));
      });

      const result = await orchestrator.processRequest(payload);
      ws.send(JSON.stringify({ type: 'complete', data: result }));
    }
  });
}
```

---

## User Stories

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-040 | As a developer, I want the engine to plan operations | Planner creates valid execution plans | Sprint 1-2 |
| US-041 | As a developer, I want the engine to execute plans | Executor runs tool calls correctly | Sprint 3-4 |
| US-042 | As a developer, I want execution results verified | Verifier checks operation success | Sprint 5-6 |
| US-043 | As a user, I want safety checks before mutations | Safety Manager prompts for confirmation | Sprint 5-6 |
| US-044 | As a user, I want dry-run mode | Operations can preview without executing | Sprint 5-6 |

---

## Sprint Breakdown

### Sprint 1-2 (Weeks 1-4)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Orchestrator skeleton | 3 days | Basic flow working |
| Planner implementation | 5 days | Intent parsing + planning |
| Integration with LLM layer | 3 days | LLM-powered planning |
| Unit tests | 2 days | Test coverage |

### Sprint 3-4 (Weeks 5-8)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Executor implementation | 5 days | Tool execution |
| Retry logic & error handling | 3 days | Robust execution |
| Streaming progress | 2 days | Real-time updates |
| Integration with MCP tools | 3 days | Tools callable |

### Sprint 5-6 (Weeks 9-12)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Verifier implementation | 3 days | Result verification |
| Safety Manager | 4 days | Confirmation workflow |
| Safety policies | 2 days | Default policies |
| End-to-end testing | 3 days | Full flow working |

---

## Acceptance Criteria

- [ ] Orchestrator processes requests end-to-end
- [ ] Planner creates valid multi-step plans
- [ ] Executor handles tool calls with retry logic
- [ ] Verifier validates Terraform and K8s outputs
- [ ] Safety Manager prompts for dangerous operations
- [ ] Dry-run mode prevents actual execution
- [ ] All components have >80% test coverage
- [ ] Response time < 5s for simple operations

---

*Document Version: 1.0*
*Last Updated: January 2026*
