# DevRel & QA Team - MVP Specification

> **Team**: DevRel & QA Team
> **Phase**: MVP (Months 1-3)
> **Dependencies**: All Teams

---

## Overview

The DevRel & QA Team is responsible for testing, documentation, user feedback collection, and ensuring the product is demo-ready for investors.

---

## Responsibilities

### 1. Testing Strategy

#### 1.1 Unit Tests

| Component | Coverage Target | Framework |
|-----------|-----------------|-----------|
| CLI Commands | 80% | Vitest |
| Core Engine | 90% | Vitest |
| LLM Providers | 85% | Vitest + MSW |
| MCP Tools | 80% | Vitest |
| Generator Engine | 85% | Vitest |

**Example Unit Test**:

```typescript
// packages/core/src/agent/__tests__/planner.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Planner } from '../planner';
import { mockLLMProvider } from '../../__mocks__/llm';

describe('Planner', () => {
  it('should create a plan from user request', async () => {
    const planner = new Planner(mockLLMProvider);

    const plan = await planner.createPlan({
      input: 'Create a VPC with 3 subnets',
      context: { cloudProvider: 'aws' },
    });

    expect(plan.steps).toHaveLength(greaterThan(0));
    expect(plan.intent).toContain('VPC');
  });

  it('should handle invalid requests gracefully', async () => {
    const planner = new Planner(mockLLMProvider);

    await expect(planner.createPlan({ input: '' }))
      .rejects.toThrow('Invalid request');
  });
});
```

#### 1.2 Integration Tests

```typescript
// tests/integration/terraform-generation.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GeneratorEngine } from '@nimbus/generator';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('Terraform Generation Integration', () => {
  const outputDir = path.join(__dirname, 'output');

  beforeAll(() => {
    fs.mkdirSync(outputDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(outputDir, { recursive: true });
  });

  it('should generate valid Terraform for AWS VPC', async () => {
    const engine = new GeneratorEngine();

    const result = await engine.generate({
      type: 'terraform',
      provider: 'aws',
      components: ['vpc'],
      specifications: {
        vpc_cidr: '10.0.0.0/16',
        availability_zones: 3,
      },
    });

    // Write files
    for (const file of result.files) {
      const filePath = path.join(outputDir, file.path);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, file.content);
    }

    // Validate with terraform fmt
    execSync('terraform fmt -check', { cwd: outputDir });

    // Validate with terraform validate (requires init)
    execSync('terraform init -backend=false', { cwd: outputDir });
    execSync('terraform validate', { cwd: outputDir });
  });

  it('should generate code that passes tflint', async () => {
    // Generate Terraform
    // ...

    // Run tflint
    const result = execSync('tflint --format=json', {
      cwd: outputDir,
      encoding: 'utf-8',
    });

    const issues = JSON.parse(result);
    expect(issues.errors).toHaveLength(0);
  });
});
```

#### 1.3 E2E Tests

```typescript
// tests/e2e/user-journey-terraform.test.ts
import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';

test.describe('Terraform Generation Journey', () => {
  test('should complete questionnaire and generate files', async () => {
    const nimbus = spawn('nimbus', ['generate', 'terraform'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Simulate user selecting AWS
    nimbus.stdin.write('\n'); // Select AWS (default)
    await waitForPrompt(nimbus, 'region');

    nimbus.stdin.write('j\n'); // Move to us-east-1
    await waitForPrompt(nimbus, 'components');

    // Select VPC and EKS
    nimbus.stdin.write(' j \n'); // Space to select, j to move, space, enter
    await waitForPrompt(nimbus, 'generated');

    // Verify output
    const output = await collectOutput(nimbus);
    expect(output).toContain('Files generated');
    expect(output).toContain('main.tf');
  });

  test('should handle chat-based generation', async () => {
    const nimbus = spawn('nimbus', ['chat'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    await waitForPrompt(nimbus, 'You:');

    nimbus.stdin.write('Create a VPC with 3 AZs for production\n');
    await waitForOutput(nimbus, 'Generating');

    const output = await collectOutput(nimbus);
    expect(output).toContain('infrastructure/');
  });
});
```

---

### 2. Documentation

#### 2.1 User Documentation Structure

```
docs/
├── getting-started/
│   ├── installation.md
│   ├── quickstart.md
│   └── configuration.md
├── commands/
│   ├── nimbus-chat.md
│   ├── nimbus-generate.md
│   ├── nimbus-k8s.md
│   ├── nimbus-helm.md
│   └── nimbus-config.md
├── guides/
│   ├── terraform-generation.md
│   ├── kubernetes-operations.md
│   ├── cloud-credentials.md
│   └── llm-providers.md
├── reference/
│   ├── configuration.md
│   ├── templates.md
│   └── api.md
└── examples/
    ├── vpc-eks-rds.md
    ├── kubernetes-deployment.md
    └── multi-environment.md
```

#### 2.2 Getting Started Guide

```markdown
# Getting Started with Nimbus

## Installation

### Using npm (recommended)
```bash
npm install -g nimbus-cli
```

### Using Homebrew (macOS/Linux)
```bash
brew install nimbus
```

### Using curl
```bash
curl -fsSL https://nimbus.dev/install.sh | sh
```

## Quick Start

### 1. Configure your LLM provider
```bash
export ANTHROPIC_API_KEY=your-api-key
# or
nimbus config set llm.anthropic.api_key your-api-key
```

### 2. Generate your first infrastructure
```bash
nimbus generate terraform
```

### 3. Start chatting
```bash
nimbus chat
You: Create a VPC with 3 availability zones
```

## Next Steps

- [Configure cloud credentials](./cloud-credentials.md)
- [Explore Terraform generation](./terraform-generation.md)
- [Learn Kubernetes operations](./kubernetes-operations.md)
```

#### 2.3 Command Reference

```markdown
# nimbus generate

Generate infrastructure code from questionnaire or natural language.

## Usage
```bash
nimbus generate <type> [options]
```

## Types
- `terraform` - Generate Terraform configuration
- `kubernetes` - Generate Kubernetes manifests
- `helm` - Generate Helm values files

## Options
| Option | Description | Default |
|--------|-------------|---------|
| `--mode` | Generation mode: questionnaire, conversational | questionnaire |
| `--output` | Output directory | ./infrastructure |
| `--provider` | Cloud provider (aws, gcp, azure) | aws |
| `--no-best-practices` | Skip best practice defaults | false |

## Examples

### Questionnaire mode
```bash
nimbus generate terraform
```

### Conversational mode
```bash
nimbus generate terraform --mode conversational
```

### Specify output directory
```bash
nimbus generate terraform --output ./my-infra
```
```

---

### 3. Demo Preparation

#### 3.1 Demo Scenarios

| Scenario | Duration | Components | Purpose |
|----------|----------|------------|---------|
| **Hello World** | 2 min | Chat, basic query | First impression |
| **Terraform VPC** | 5 min | Questionnaire, generation | Core value prop |
| **K8s Operations** | 5 min | kubectl wrapper, AI assistance | DevOps use case |
| **Full Journey** | 10 min | Generation → Apply → Manage | Complete flow |

#### 3.2 Demo Script: Terraform Generation

```markdown
## Demo: Terraform Generation (5 minutes)

### Opening (30 sec)
"Let me show you how Nimbus can generate production-ready Terraform
in under a minute."

### Step 1: Start Generation (30 sec)
```bash
nimbus generate terraform
```
"Notice the clean, intuitive questionnaire interface."

### Step 2: Select Components (1 min)
- Select AWS
- Select us-east-1
- Choose VPC + EKS
"We're building a complete Kubernetes infrastructure."

### Step 3: Configure VPC (1 min)
- Accept default CIDR
- Select 3 AZs
- Choose HA NAT Gateway
"Nimbus applies best practices by default."

### Step 4: Review Generated Code (1 min)
"Look at the generated structure - modular, tagged, encrypted by default."
- Show main.tf
- Show variables.tf
- Show modules/

### Step 5: Validate (1 min)
```bash
terraform init && terraform validate
```
"Generated code passes all validations."

### Closing (30 sec)
"What used to take hours now takes under a minute,
with best practices built in."
```

#### 3.3 Demo Environment Setup

```bash
#!/bin/bash
# scripts/setup-demo-env.sh

# Pre-requisites check
command -v terraform >/dev/null 2>&1 || { echo "terraform required"; exit 1; }
command -v kubectl >/dev/null 2>&1 || { echo "kubectl required"; exit 1; }
command -v helm >/dev/null 2>&1 || { echo "helm required"; exit 1; }

# Set up demo AWS profile
export AWS_PROFILE=nimbus-demo
export AWS_REGION=us-east-1

# Pre-warm models (reduce latency during demo)
nimbus config set llm.preload true

# Clean demo directory
rm -rf ~/demo-output
mkdir -p ~/demo-output

# Set demo mode (verbose, colorful)
export NIMBUS_DEMO_MODE=true

echo "Demo environment ready!"
```

---

### 4. Feedback Collection

#### 4.1 Telemetry (Opt-in)

```typescript
// packages/cli/src/telemetry/index.ts
import PostHog from 'posthog-node';

interface TelemetryEvent {
  event: string;
  properties: Record<string, unknown>;
}

class Telemetry {
  private client: PostHog | null = null;
  private enabled: boolean = false;

  async init(config: { enabled: boolean; apiKey?: string }): Promise<void> {
    this.enabled = config.enabled;

    if (this.enabled && config.apiKey) {
      this.client = new PostHog(config.apiKey);
    }
  }

  track(event: TelemetryEvent): void {
    if (!this.enabled || !this.client) return;

    this.client.capture({
      distinctId: this.getAnonymousId(),
      event: event.event,
      properties: {
        ...event.properties,
        version: process.env.npm_package_version,
        os: process.platform,
        nodeVersion: process.version,
      },
    });
  }

  private getAnonymousId(): string {
    // Generate deterministic but anonymous ID
    return crypto
      .createHash('sha256')
      .update(os.hostname() + os.userInfo().username)
      .digest('hex')
      .slice(0, 16);
  }
}

// Events to track
const events = {
  COMMAND_EXECUTED: 'command_executed',
  GENERATION_COMPLETED: 'generation_completed',
  ERROR_OCCURRED: 'error_occurred',
  SESSION_STARTED: 'session_started',
};
```

#### 4.2 Feedback Command

```bash
$ nimbus feedback

  ╭─ Send Feedback ──────────────────────────────────────────╮
  │                                                          │
  │  How can we improve Nimbus?                              │
  │                                                          │
  │  Type: › Bug Report                                      │
  │        Feature Request                                   │
  │        General Feedback                                  │
  │                                                          │
  │  [Submit Feedback] [Cancel]                              │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

---

### 5. Quality Metrics

| Metric | Target (MVP) | Measurement |
|--------|--------------|-------------|
| Unit Test Coverage | 80% | Vitest coverage |
| E2E Test Pass Rate | 100% | Playwright |
| Documentation Coverage | All commands | Manual audit |
| Demo Success Rate | 100% | Practice runs |
| Response Time P95 | < 5s | Telemetry |
| Error Rate | < 5% | Telemetry |

---

## Sprint Breakdown

### Sprint 5-6 (Weeks 9-12)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Unit test suite | 5 days | 80% coverage |
| Integration tests | 4 days | Key flows tested |
| E2E tests | 4 days | User journeys |
| User documentation | 5 days | Complete docs |
| Demo scripts | 2 days | 4 demo scenarios |
| Demo practice | 2 days | Polish |

---

## Acceptance Criteria

- [ ] Unit test coverage > 80%
- [ ] All E2E user journeys pass
- [ ] Documentation complete and reviewed
- [ ] 4 demo scenarios scripted and practiced
- [ ] Demo runs without issues 5 times consecutively
- [ ] Feedback collection system operational
- [ ] All quality metrics met

---

*Document Version: 1.0*
*Last Updated: January 2026*
