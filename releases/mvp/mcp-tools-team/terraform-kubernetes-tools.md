# MCP Tools Team - MVP Specification

> **Team**: MCP Tools Team
> **Phase**: MVP (Months 1-3)
> **Dependencies**: Core Engine

---

## Overview

The MCP Tools Team builds the Model Context Protocol (MCP) tool implementations that allow the LLM to interact with infrastructure tools like Terraform, kubectl, Helm, and cloud CLIs.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Tool Layer                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Terraform  │  │ Kubernetes  │  │      Cloud CLIs         │ │
│  │   Tools     │  │   Tools     │  │    AWS/GCP/Azure        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                   Tool Registry                            │ │
│  │  - Register tools                                          │ │
│  │  - Validate inputs                                         │ │
│  │  - Execute safely                                          │ │
│  │  - Return structured results                               │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## MCP Tool Interface

**File**: `packages/mcp-tools/src/types.ts`

```typescript
import { z } from 'zod';

interface MCPTool {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
  handler: (input: unknown) => Promise<ToolResult>;
}

interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  artifacts?: Artifact[];
  metadata?: Record<string, unknown>;
}

interface Artifact {
  type: 'file' | 'url' | 'data';
  path?: string;
  content?: string;
  url?: string;
}

// Tool Registry
export class MCPToolRegistry {
  private tools: Map<string, MCPTool> = new Map();

  register(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  getAll(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  async execute(name: string, input: unknown): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, output: '', error: `Tool not found: ${name}` };
    }

    // Validate input
    const validationResult = tool.inputSchema.safeParse(input);
    if (!validationResult.success) {
      return {
        success: false,
        output: '',
        error: `Invalid input: ${validationResult.error.message}`,
      };
    }

    // Execute tool
    return tool.handler(validationResult.data);
  }
}
```

---

## Terraform Tools

### 1. terraform_init

**File**: `packages/mcp-tools/src/terraform/init.ts`

```typescript
import { z } from 'zod';
import { spawn } from 'child_process';

const inputSchema = z.object({
  directory: z.string().describe('Path to Terraform directory'),
  backend: z.object({
    type: z.enum(['s3', 'gcs', 'azurerm', 'local']).optional(),
    config: z.record(z.string()).optional(),
  }).optional(),
  upgrade: z.boolean().optional().describe('Upgrade provider plugins'),
});

export const terraformInit: MCPTool = {
  name: 'terraform_init',
  description: 'Initialize a Terraform working directory',
  inputSchema,
  handler: async (input) => {
    const args = ['init'];

    if (input.upgrade) {
      args.push('-upgrade');
    }

    if (input.backend?.config) {
      for (const [key, value] of Object.entries(input.backend.config)) {
        args.push(`-backend-config=${key}=${value}`);
      }
    }

    const result = await runCommand('terraform', args, input.directory);

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        directory: input.directory,
        providers: extractProviders(result.stdout),
      },
    };
  },
};
```

### 2. terraform_plan

**File**: `packages/mcp-tools/src/terraform/plan.ts`

```typescript
const inputSchema = z.object({
  directory: z.string().describe('Path to Terraform directory'),
  varFile: z.string().optional().describe('Path to tfvars file'),
  variables: z.record(z.string()).optional().describe('Variable overrides'),
  out: z.string().optional().describe('Save plan to file'),
  target: z.array(z.string()).optional().describe('Resource targets'),
});

export const terraformPlan: MCPTool = {
  name: 'terraform_plan',
  description: 'Generate a Terraform execution plan',
  inputSchema,
  handler: async (input) => {
    const args = ['plan', '-json'];

    if (input.varFile) {
      args.push(`-var-file=${input.varFile}`);
    }

    if (input.variables) {
      for (const [key, value] of Object.entries(input.variables)) {
        args.push(`-var=${key}=${value}`);
      }
    }

    if (input.out) {
      args.push(`-out=${input.out}`);
    }

    if (input.target) {
      for (const target of input.target) {
        args.push(`-target=${target}`);
      }
    }

    const result = await runCommand('terraform', args, input.directory);
    const planSummary = parseTerraformPlanJson(result.stdout);

    return {
      success: result.exitCode === 0 || result.exitCode === 2,
      output: formatPlanSummary(planSummary),
      metadata: {
        hasChanges: result.exitCode === 2,
        add: planSummary.add,
        change: planSummary.change,
        destroy: planSummary.destroy,
      },
    };
  },
};

function parseTerraformPlanJson(output: string): PlanSummary {
  const lines = output.split('\n').filter(Boolean);
  let add = 0, change = 0, destroy = 0;

  for (const line of lines) {
    try {
      const json = JSON.parse(line);
      if (json['@level'] === 'info' && json.changes) {
        add = json.changes.add || 0;
        change = json.changes.change || 0;
        destroy = json.changes.destroy || 0;
      }
    } catch {}
  }

  return { add, change, destroy };
}
```

### 3. terraform_apply

**File**: `packages/mcp-tools/src/terraform/apply.ts`

```typescript
const inputSchema = z.object({
  directory: z.string().describe('Path to Terraform directory'),
  planFile: z.string().optional().describe('Plan file to apply'),
  autoApprove: z.boolean().optional().describe('Skip confirmation'),
  varFile: z.string().optional(),
  variables: z.record(z.string()).optional(),
});

export const terraformApply: MCPTool = {
  name: 'terraform_apply',
  description: 'Apply Terraform changes to infrastructure',
  inputSchema,
  handler: async (input) => {
    const args = ['apply', '-json'];

    if (input.autoApprove) {
      args.push('-auto-approve');
    }

    if (input.planFile) {
      args.push(input.planFile);
    } else {
      if (input.varFile) {
        args.push(`-var-file=${input.varFile}`);
      }
      if (input.variables) {
        for (const [key, value] of Object.entries(input.variables)) {
          args.push(`-var=${key}=${value}`);
        }
      }
    }

    const result = await runCommand('terraform', args, input.directory);

    return {
      success: result.exitCode === 0,
      output: parseApplyOutput(result.stdout),
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        resourcesCreated: extractResourcesCreated(result.stdout),
        outputs: extractOutputs(result.stdout),
      },
    };
  },
};
```

---

## Kubernetes Tools

### 1. kubectl_get

**File**: `packages/mcp-tools/src/kubernetes/get.ts`

```typescript
const inputSchema = z.object({
  resource: z.string().describe('Resource type (pods, deployments, etc.)'),
  name: z.string().optional().describe('Resource name'),
  namespace: z.string().optional().describe('Kubernetes namespace'),
  selector: z.string().optional().describe('Label selector'),
  allNamespaces: z.boolean().optional().describe('Query all namespaces'),
  output: z.enum(['wide', 'yaml', 'json']).optional(),
});

export const kubectlGet: MCPTool = {
  name: 'kubectl_get',
  description: 'Get Kubernetes resources',
  inputSchema,
  handler: async (input) => {
    const args = ['get', input.resource];

    if (input.name) {
      args.push(input.name);
    }

    if (input.namespace) {
      args.push('-n', input.namespace);
    } else if (input.allNamespaces) {
      args.push('-A');
    }

    if (input.selector) {
      args.push('-l', input.selector);
    }

    args.push('-o', input.output || 'wide');

    const result = await runCommand('kubectl', args);

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        resourceType: input.resource,
        count: countResources(result.stdout),
      },
    };
  },
};
```

### 2. kubectl_apply

**File**: `packages/mcp-tools/src/kubernetes/apply.ts`

```typescript
const inputSchema = z.object({
  file: z.string().optional().describe('Path to YAML file'),
  manifest: z.string().optional().describe('YAML content'),
  namespace: z.string().optional(),
  dryRun: z.enum(['none', 'client', 'server']).optional(),
});

export const kubectlApply: MCPTool = {
  name: 'kubectl_apply',
  description: 'Apply Kubernetes manifests',
  inputSchema,
  handler: async (input) => {
    if (!input.file && !input.manifest) {
      return { success: false, output: '', error: 'Either file or manifest required' };
    }

    const args = ['apply'];

    if (input.file) {
      args.push('-f', input.file);
    } else if (input.manifest) {
      args.push('-f', '-');
    }

    if (input.namespace) {
      args.push('-n', input.namespace);
    }

    if (input.dryRun) {
      args.push(`--dry-run=${input.dryRun}`);
    }

    const result = await runCommand('kubectl', args, undefined, input.manifest);

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        applied: parseAppliedResources(result.stdout),
      },
    };
  },
};
```

### 3. kubectl_logs

**File**: `packages/mcp-tools/src/kubernetes/logs.ts`

```typescript
const inputSchema = z.object({
  pod: z.string().describe('Pod name'),
  namespace: z.string().optional(),
  container: z.string().optional().describe('Container name'),
  follow: z.boolean().optional(),
  tail: z.number().optional().describe('Number of lines'),
  since: z.string().optional().describe('Duration (e.g., 1h, 30m)'),
  previous: z.boolean().optional().describe('Get previous container logs'),
});

export const kubectlLogs: MCPTool = {
  name: 'kubectl_logs',
  description: 'Get pod logs',
  inputSchema,
  handler: async (input) => {
    const args = ['logs', input.pod];

    if (input.namespace) {
      args.push('-n', input.namespace);
    }

    if (input.container) {
      args.push('-c', input.container);
    }

    if (input.tail) {
      args.push('--tail', String(input.tail));
    }

    if (input.since) {
      args.push('--since', input.since);
    }

    if (input.previous) {
      args.push('-p');
    }

    const result = await runCommand('kubectl', args);

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined,
    };
  },
};
```

---

## Helm Tools

### 1. helm_install

**File**: `packages/mcp-tools/src/helm/install.ts`

```typescript
const inputSchema = z.object({
  name: z.string().describe('Release name'),
  chart: z.string().describe('Chart name or path'),
  namespace: z.string().optional(),
  values: z.string().optional().describe('Path to values file'),
  set: z.record(z.string()).optional().describe('Set values'),
  version: z.string().optional().describe('Chart version'),
  wait: z.boolean().optional().describe('Wait for resources'),
  timeout: z.string().optional().describe('Timeout duration'),
  dryRun: z.boolean().optional(),
});

export const helmInstall: MCPTool = {
  name: 'helm_install',
  description: 'Install a Helm chart',
  inputSchema,
  handler: async (input) => {
    const args = ['install', input.name, input.chart];

    if (input.namespace) {
      args.push('-n', input.namespace, '--create-namespace');
    }

    if (input.values) {
      args.push('-f', input.values);
    }

    if (input.set) {
      for (const [key, value] of Object.entries(input.set)) {
        args.push('--set', `${key}=${value}`);
      }
    }

    if (input.version) {
      args.push('--version', input.version);
    }

    if (input.wait) {
      args.push('--wait');
      args.push('--timeout', input.timeout || '5m');
    }

    if (input.dryRun) {
      args.push('--dry-run');
    }

    const result = await runCommand('helm', args);

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        release: input.name,
        chart: input.chart,
        namespace: input.namespace,
      },
    };
  },
};
```

---

## Cloud CLI Tools

### 1. AWS EC2 Describe Instances

**File**: `packages/mcp-tools/src/aws/ec2.ts`

```typescript
const describeInstancesSchema = z.object({
  region: z.string().optional(),
  instanceIds: z.array(z.string()).optional(),
  filters: z.array(z.object({
    name: z.string(),
    values: z.array(z.string()),
  })).optional(),
});

export const awsDescribeInstances: MCPTool = {
  name: 'aws_ec2_describe_instances',
  description: 'Describe EC2 instances',
  inputSchema: describeInstancesSchema,
  handler: async (input) => {
    const args = ['ec2', 'describe-instances', '--output', 'json'];

    if (input.region) {
      args.push('--region', input.region);
    }

    if (input.instanceIds) {
      args.push('--instance-ids', ...input.instanceIds);
    }

    if (input.filters) {
      args.push('--filters', ...input.filters.map(f =>
        `Name=${f.name},Values=${f.values.join(',')}`
      ));
    }

    const result = await runCommand('aws', args);

    if (result.exitCode === 0) {
      const data = JSON.parse(result.stdout);
      return {
        success: true,
        output: formatInstances(data.Reservations),
        metadata: {
          instanceCount: countInstances(data.Reservations),
        },
      };
    }

    return {
      success: false,
      output: '',
      error: result.stderr,
    };
  },
};

function formatInstances(reservations: any[]): string {
  const instances = reservations.flatMap(r => r.Instances);
  const lines = ['Instance ID\tName\tType\tState\tPublic IP'];

  for (const inst of instances) {
    const name = inst.Tags?.find((t: any) => t.Key === 'Name')?.Value || '-';
    lines.push(`${inst.InstanceId}\t${name}\t${inst.InstanceType}\t${inst.State.Name}\t${inst.PublicIpAddress || '-'}`);
  }

  return lines.join('\n');
}
```

---

## Project Structure

```
packages/mcp-tools/
├── src/
│   ├── types.ts              # MCPTool interface
│   ├── registry.ts           # Tool registry
│   ├── utils.ts              # Command execution
│   ├── terraform/
│   │   ├── init.ts
│   │   ├── plan.ts
│   │   ├── apply.ts
│   │   ├── destroy.ts
│   │   └── output.ts
│   ├── kubernetes/
│   │   ├── get.ts
│   │   ├── apply.ts
│   │   ├── delete.ts
│   │   ├── logs.ts
│   │   ├── exec.ts
│   │   └── describe.ts
│   ├── helm/
│   │   ├── install.ts
│   │   ├── upgrade.ts
│   │   ├── uninstall.ts
│   │   ├── list.ts
│   │   └── rollback.ts
│   ├── aws/
│   │   ├── ec2.ts
│   │   ├── s3.ts
│   │   ├── iam.ts
│   │   └── eks.ts
│   ├── gcp/
│   │   ├── compute.ts
│   │   ├── storage.ts
│   │   └── gke.ts
│   └── azure/
│       ├── vm.ts
│       ├── storage.ts
│       └── aks.ts
├── package.json
└── tsconfig.json
```

---

## User Stories

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-060 | As a user, I want to run terraform plan | Plan output parsed correctly | Sprint 3-4 |
| US-061 | As a user, I want to get K8s resources | kubectl get works | Sprint 3-4 |
| US-062 | As a user, I want to install Helm charts | Helm install works | Sprint 3-4 |
| US-063 | As a user, I want to query AWS resources | AWS CLI tools work | Sprint 5-6 |
| US-064 | As a user, I want structured tool output | Metadata extracted | Sprint 3-4 |

---

## Sprint Breakdown

### Sprint 3-4 (Weeks 5-8)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Tool registry | 2 days | Registration system |
| Terraform tools (init, plan, apply) | 4 days | 3 tools |
| Kubernetes tools (get, apply, logs) | 4 days | 5 tools |
| Helm tools (install, upgrade) | 3 days | 4 tools |

### Sprint 5-6 (Weeks 9-12)

| Task | Effort | Deliverable |
|------|--------|-------------|
| AWS CLI tools | 3 days | EC2, S3, IAM |
| GCP CLI tools | 2 days | Compute, GKE |
| Azure CLI tools | 2 days | VMs, AKS |
| Testing & validation | 3 days | All tools tested |

---

## Acceptance Criteria

- [ ] All Terraform commands work (init, plan, apply)
- [ ] All kubectl commands work (get, apply, delete, logs)
- [ ] All Helm commands work (install, upgrade, rollback)
- [ ] AWS, GCP, Azure basic operations work
- [ ] All tools validate input with Zod
- [ ] All tools return structured metadata
- [ ] Error handling graceful and informative

---

*Document Version: 1.0*
*Last Updated: January 2026*
