# Generator Engine Team - MVP Specification

> **Team**: Generator Engine Team
> **Phase**: MVP (Months 1-3)
> **Dependencies**: LLM Integration, Templates

---

## Overview

The Generator Engine Team builds the infrastructure code generation system, including both questionnaire-based and conversational generation modes for Terraform and Kubernetes manifests.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Generator Engine                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐  │
│  │   Questionnaire Flow    │  │    Conversational Mode      │  │
│  │                         │  │                             │  │
│  │ - Step definitions      │  │ - Intent parsing            │  │
│  │ - Validation rules      │  │ - Context extraction        │  │
│  │ - Conditional logic     │  │ - Template selection        │  │
│  └─────────────────────────┘  └─────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                   Template Engine                          │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────┐  │ │
│  │  │   VPC   │  │   EKS   │  │   RDS   │  │   S3        │  │ │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────────┘  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                  Best Practices Engine                     │ │
│  │  - Security defaults  - Tagging  - State management       │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Questionnaire Flow System

### 1. Questionnaire Definition

**File**: `packages/generator/src/questionnaire/definition.ts`

```typescript
interface QuestionnaireStep {
  id: string;
  title: string;
  description?: string;
  questions: Question[];
  condition?: (answers: Record<string, unknown>) => boolean;
}

interface Question {
  id: string;
  type: 'select' | 'multiselect' | 'text' | 'number' | 'confirm';
  label: string;
  description?: string;
  options?: Option[];
  default?: unknown;
  validation?: ValidationRule[];
  dependsOn?: {
    questionId: string;
    value: unknown;
  };
}

interface Option {
  value: string;
  label: string;
  description?: string;
}

interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'pattern' | 'custom';
  value?: unknown;
  message: string;
}
```

### 2. Terraform Questionnaire

**File**: `packages/generator/src/questionnaire/terraform.ts`

```typescript
export const terraformQuestionnaire: QuestionnaireStep[] = [
  {
    id: 'provider',
    title: 'Cloud Provider',
    questions: [
      {
        id: 'cloud',
        type: 'select',
        label: 'Which cloud provider?',
        options: [
          { value: 'aws', label: 'AWS', description: 'Amazon Web Services' },
          { value: 'gcp', label: 'Google Cloud Platform' },
          { value: 'azure', label: 'Microsoft Azure' },
        ],
        default: 'aws',
      },
      {
        id: 'region',
        type: 'select',
        label: 'Which region?',
        options: [], // Dynamically populated based on cloud
        dependsOn: { questionId: 'cloud', value: '*' },
      },
    ],
  },
  {
    id: 'components',
    title: 'Infrastructure Components',
    questions: [
      {
        id: 'components',
        type: 'multiselect',
        label: 'What components do you need?',
        options: [
          { value: 'vpc', label: 'VPC / Network', description: 'Virtual Private Cloud' },
          { value: 'eks', label: 'Kubernetes (EKS)', description: 'Managed Kubernetes' },
          { value: 'rds', label: 'Database (RDS)', description: 'Managed Database' },
          { value: 's3', label: 'Object Storage (S3)', description: 'S3 Buckets' },
          { value: 'ecs', label: 'Container Service (ECS)' },
        ],
      },
    ],
  },
  {
    id: 'vpc_config',
    title: 'VPC Configuration',
    condition: (answers) => (answers.components as string[])?.includes('vpc'),
    questions: [
      {
        id: 'vpc_cidr',
        type: 'text',
        label: 'VPC CIDR block',
        default: '10.0.0.0/16',
        validation: [
          { type: 'pattern', value: /^\d+\.\d+\.\d+\.\d+\/\d+$/, message: 'Invalid CIDR format' },
        ],
      },
      {
        id: 'availability_zones',
        type: 'number',
        label: 'Number of availability zones',
        default: 3,
        validation: [
          { type: 'min', value: 1, message: 'At least 1 AZ required' },
          { type: 'max', value: 6, message: 'Maximum 6 AZs supported' },
        ],
      },
      {
        id: 'nat_gateway',
        type: 'select',
        label: 'NAT Gateway configuration',
        options: [
          { value: 'single', label: 'Single NAT (~$32/month)' },
          { value: 'ha', label: 'HA NAT (one per AZ)', description: 'Higher availability, more cost' },
          { value: 'none', label: 'No NAT Gateway' },
        ],
        default: 'single',
      },
    ],
  },
  {
    id: 'eks_config',
    title: 'Kubernetes Configuration',
    condition: (answers) => (answers.components as string[])?.includes('eks'),
    questions: [
      {
        id: 'eks_version',
        type: 'select',
        label: 'Kubernetes version',
        options: [
          { value: '1.29', label: 'v1.29 (Latest)' },
          { value: '1.28', label: 'v1.28' },
          { value: '1.27', label: 'v1.27' },
        ],
        default: '1.29',
      },
      {
        id: 'node_instance_type',
        type: 'select',
        label: 'Node instance type',
        options: [
          { value: 't3.medium', label: 't3.medium (2 vCPU, 4GB)' },
          { value: 't3.large', label: 't3.large (2 vCPU, 8GB)' },
          { value: 't3.xlarge', label: 't3.xlarge (4 vCPU, 16GB)' },
          { value: 'm5.large', label: 'm5.large (2 vCPU, 8GB)' },
        ],
        default: 't3.large',
      },
      {
        id: 'node_count',
        type: 'number',
        label: 'Number of nodes',
        default: 3,
        validation: [
          { type: 'min', value: 1, message: 'At least 1 node required' },
        ],
      },
    ],
  },
  {
    id: 'environments',
    title: 'Environments',
    questions: [
      {
        id: 'environments',
        type: 'multiselect',
        label: 'Which environments?',
        options: [
          { value: 'dev', label: 'Development' },
          { value: 'staging', label: 'Staging' },
          { value: 'prod', label: 'Production' },
        ],
        default: ['dev', 'staging', 'prod'],
      },
    ],
  },
  {
    id: 'state',
    title: 'State Management',
    questions: [
      {
        id: 'backend_type',
        type: 'select',
        label: 'Terraform backend',
        options: [
          { value: 's3', label: 'S3 (AWS)', description: 'S3 + DynamoDB locking' },
          { value: 'gcs', label: 'GCS (GCP)' },
          { value: 'azurerm', label: 'Azure Blob' },
          { value: 'local', label: 'Local (not recommended)' },
        ],
      },
      {
        id: 'state_bucket_name',
        type: 'text',
        label: 'State bucket name',
        dependsOn: { questionId: 'backend_type', value: 's3' },
        validation: [
          { type: 'pattern', value: /^[a-z0-9-]+$/, message: 'Only lowercase letters, numbers, hyphens' },
        ],
      },
    ],
  },
];
```

### 3. Questionnaire Engine

**File**: `packages/generator/src/questionnaire/engine.ts`

```typescript
export class QuestionnaireEngine {
  private steps: QuestionnaireStep[];
  private answers: Record<string, unknown> = {};
  private currentStepIndex = 0;

  constructor(steps: QuestionnaireStep[]) {
    this.steps = steps;
  }

  getCurrentStep(): QuestionnaireStep | null {
    while (this.currentStepIndex < this.steps.length) {
      const step = this.steps[this.currentStepIndex];

      // Check if step should be shown
      if (step.condition && !step.condition(this.answers)) {
        this.currentStepIndex++;
        continue;
      }

      // Filter questions based on dependencies
      const visibleQuestions = step.questions.filter(q =>
        !q.dependsOn || this.answers[q.dependsOn.questionId] === q.dependsOn.value ||
        q.dependsOn.value === '*'
      );

      if (visibleQuestions.length > 0) {
        return { ...step, questions: visibleQuestions };
      }

      this.currentStepIndex++;
    }

    return null;
  }

  submitAnswer(questionId: string, value: unknown): ValidationResult {
    const step = this.steps[this.currentStepIndex];
    const question = step.questions.find(q => q.id === questionId);

    if (!question) {
      return { valid: false, error: 'Question not found' };
    }

    // Validate
    for (const rule of question.validation || []) {
      const result = this.validateRule(rule, value);
      if (!result.valid) return result;
    }

    this.answers[questionId] = value;
    return { valid: true };
  }

  nextStep(): void {
    this.currentStepIndex++;
  }

  previousStep(): void {
    this.currentStepIndex = Math.max(0, this.currentStepIndex - 1);
  }

  getAnswers(): Record<string, unknown> {
    return { ...this.answers };
  }

  isComplete(): boolean {
    return this.getCurrentStep() === null;
  }

  private validateRule(rule: ValidationRule, value: unknown): ValidationResult {
    switch (rule.type) {
      case 'required':
        if (!value) return { valid: false, error: rule.message };
        break;
      case 'min':
        if (typeof value === 'number' && value < (rule.value as number)) {
          return { valid: false, error: rule.message };
        }
        break;
      case 'max':
        if (typeof value === 'number' && value > (rule.value as number)) {
          return { valid: false, error: rule.message };
        }
        break;
      case 'pattern':
        if (typeof value === 'string' && !(rule.value as RegExp).test(value)) {
          return { valid: false, error: rule.message };
        }
        break;
    }
    return { valid: true };
  }
}
```

---

## Conversational Generation

### 1. Intent Parser

**File**: `packages/generator/src/conversational/intent.ts`

```typescript
interface GenerationIntent {
  type: 'terraform' | 'kubernetes' | 'helm';
  components: string[];
  provider: string;
  region?: string;
  specifications: Record<string, unknown>;
  constraints: string[];
}

export class IntentParser {
  private llm: LLMProvider;

  constructor(llm: LLMProvider) {
    this.llm = llm;
  }

  async parse(userInput: string, context?: ConversationContext): Promise<GenerationIntent> {
    const prompt = `
You are an infrastructure intent parser. Extract the user's infrastructure requirements.

User input: "${userInput}"

${context ? `Previous context: ${JSON.stringify(context)}` : ''}

Extract:
1. Infrastructure type (terraform/kubernetes/helm)
2. Cloud provider (aws/gcp/azure)
3. Components needed (vpc, eks, rds, s3, etc.)
4. Specific requirements (instance types, sizes, counts)
5. Constraints (budget, compliance, etc.)

Respond in JSON format:
{
  "type": "terraform",
  "provider": "aws",
  "components": ["vpc", "eks"],
  "specifications": {
    "eks_node_count": 3,
    "eks_instance_type": "t3.large",
    "vpc_cidr": "10.0.0.0/16"
  },
  "constraints": []
}
`;

    const response = await this.llm.complete({
      messages: [
        { role: 'system', content: 'You are an infrastructure intent parser.' },
        { role: 'user', content: prompt },
      ],
      responseFormat: { type: 'json_object' },
    });

    return JSON.parse(response.content);
  }
}
```

### 2. Template Selector

**File**: `packages/generator/src/conversational/selector.ts`

```typescript
export class TemplateSelector {
  private templates: Map<string, Template>;

  async selectTemplates(intent: GenerationIntent): Promise<Template[]> {
    const selected: Template[] = [];

    for (const component of intent.components) {
      const templateKey = `${intent.provider}/${component}`;
      const template = this.templates.get(templateKey);

      if (template) {
        selected.push(template);
      }
    }

    // Add dependent templates
    for (const template of selected) {
      for (const dep of template.dependencies || []) {
        if (!selected.find(t => t.id === dep)) {
          const depTemplate = this.templates.get(dep);
          if (depTemplate) selected.push(depTemplate);
        }
      }
    }

    return this.sortByDependencies(selected);
  }

  private sortByDependencies(templates: Template[]): Template[] {
    const sorted: Template[] = [];
    const pending = [...templates];

    while (pending.length > 0) {
      const index = pending.findIndex(t =>
        !t.dependencies || t.dependencies.every(d =>
          sorted.some(s => s.id === d)
        )
      );

      if (index === -1) {
        throw new Error('Circular dependency detected');
      }

      sorted.push(pending.splice(index, 1)[0]);
    }

    return sorted;
  }
}
```

---

## Template Engine

### 1. Template Format

**File**: `templates/aws/vpc/main.tf.hbs`

```hcl
# VPC Configuration
# Generated by Nimbus

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-vpc"
  })
}

{{#each availability_zones}}
resource "aws_subnet" "public_{{@index}}" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, {{@index}})
  availability_zone       = "{{this}}"
  map_public_ip_on_launch = true

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-public-{{@index}}"
    Tier = "public"
  })
}

resource "aws_subnet" "private_{{@index}}" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, {{add @index 10}})
  availability_zone = "{{this}}"

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-private-{{@index}}"
    Tier = "private"
  })
}
{{/each}}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-igw"
  })
}

{{#if nat_gateway}}
{{#if nat_gateway_ha}}
{{#each availability_zones}}
resource "aws_eip" "nat_{{@index}}" {
  domain = "vpc"

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-nat-eip-{{@index}}"
  })
}

resource "aws_nat_gateway" "main_{{@index}}" {
  allocation_id = aws_eip.nat_{{@index}}.id
  subnet_id     = aws_subnet.public_{{@index}}.id

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-nat-{{@index}}"
  })
}
{{/each}}
{{else}}
resource "aws_eip" "nat" {
  domain = "vpc"

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-nat-eip"
  })
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public_0.id

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-nat"
  })
}
{{/if}}
{{/if}}
```

### 2. Template Renderer

**File**: `packages/generator/src/template/renderer.ts`

```typescript
import Handlebars from 'handlebars';
import * as fs from 'fs/promises';
import * as path from 'path';

export class TemplateRenderer {
  private handlebars: typeof Handlebars;

  constructor() {
    this.handlebars = Handlebars.create();
    this.registerHelpers();
  }

  private registerHelpers(): void {
    this.handlebars.registerHelper('add', (a: number, b: number) => a + b);
    this.handlebars.registerHelper('subtract', (a: number, b: number) => a - b);
    this.handlebars.registerHelper('json', (obj: unknown) => JSON.stringify(obj, null, 2));
    this.handlebars.registerHelper('lowercase', (str: string) => str.toLowerCase());
    this.handlebars.registerHelper('uppercase', (str: string) => str.toUpperCase());
  }

  async render(templatePath: string, variables: Record<string, unknown>): Promise<string> {
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    const template = this.handlebars.compile(templateContent);
    return template(variables);
  }

  async renderModule(
    modulePath: string,
    variables: Record<string, unknown>,
    outputDir: string
  ): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];
    const entries = await fs.readdir(modulePath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.hbs')) {
        const templatePath = path.join(modulePath, entry.name);
        const outputName = entry.name.replace('.hbs', '');
        const content = await this.render(templatePath, variables);

        files.push({
          path: path.join(outputDir, outputName),
          content,
          type: this.getFileType(outputName),
        });
      }
    }

    return files;
  }

  private getFileType(filename: string): 'hcl' | 'yaml' | 'json' | 'md' {
    if (filename.endsWith('.tf')) return 'hcl';
    if (filename.endsWith('.yaml') || filename.endsWith('.yml')) return 'yaml';
    if (filename.endsWith('.json')) return 'json';
    if (filename.endsWith('.md')) return 'md';
    return 'hcl';
  }
}
```

---

## Best Practices Engine

**File**: `packages/generator/src/best-practices/engine.ts`

```typescript
interface BestPractice {
  id: string;
  name: string;
  description: string;
  apply: (config: GenerationConfig) => GenerationConfig;
}

export const awsBestPractices: BestPractice[] = [
  {
    id: 'remote_state',
    name: 'Remote State',
    description: 'Use S3 backend with DynamoDB locking',
    apply: (config) => ({
      ...config,
      backend: {
        type: 's3',
        config: {
          encrypt: true,
          dynamodb_table: `${config.projectName}-terraform-locks`,
        },
      },
    }),
  },
  {
    id: 'version_pinning',
    name: 'Version Pinning',
    description: 'Pin provider and Terraform versions',
    apply: (config) => ({
      ...config,
      versions: {
        terraform: '~> 1.6',
        aws: '~> 5.0',
      },
    }),
  },
  {
    id: 'encryption_default',
    name: 'Encryption by Default',
    description: 'Enable encryption for all storage',
    apply: (config) => ({
      ...config,
      s3: {
        ...config.s3,
        encryption: 'aws:kms',
        versioning: true,
      },
      rds: {
        ...config.rds,
        storage_encrypted: true,
      },
    }),
  },
  {
    id: 'consistent_tagging',
    name: 'Consistent Tagging',
    description: 'Apply standard tags to all resources',
    apply: (config) => ({
      ...config,
      common_tags: {
        Project: config.projectName,
        Environment: '${var.environment}',
        ManagedBy: 'terraform',
        CreatedBy: 'nimbus',
      },
    }),
  },
  {
    id: 'least_privilege',
    name: 'Least Privilege IAM',
    description: 'Generate minimal IAM permissions',
    apply: (config) => ({
      ...config,
      iam: {
        ...config.iam,
        least_privilege: true,
      },
    }),
  },
];

export class BestPracticesEngine {
  private practices: BestPractice[];

  constructor(practices: BestPractice[] = awsBestPractices) {
    this.practices = practices;
  }

  apply(config: GenerationConfig, practiceIds?: string[]): GenerationConfig {
    const toApply = practiceIds
      ? this.practices.filter(p => practiceIds.includes(p.id))
      : this.practices;

    return toApply.reduce((cfg, practice) => practice.apply(cfg), config);
  }

  list(): { id: string; name: string; description: string }[] {
    return this.practices.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
    }));
  }
}
```

---

## Project Structure

```
packages/generator/
├── src/
│   ├── questionnaire/
│   │   ├── definition.ts
│   │   ├── engine.ts
│   │   └── terraform.ts
│   ├── conversational/
│   │   ├── intent.ts
│   │   └── selector.ts
│   ├── template/
│   │   └── renderer.ts
│   ├── best-practices/
│   │   └── engine.ts
│   └── index.ts
├── package.json
└── tsconfig.json

templates/
├── aws/
│   ├── vpc/
│   │   ├── main.tf.hbs
│   │   ├── variables.tf.hbs
│   │   └── outputs.tf.hbs
│   ├── eks/
│   ├── rds/
│   └── s3/
├── gcp/
└── azure/
```

---

## User Stories

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-010 | As a user, I want questionnaire generation | Wizard creates Terraform | Sprint 3-4 |
| US-011 | As a user, I want conversational generation | Natural language works | Sprint 3-4 |
| US-012 | As a user, I want best practices applied | Generated code passes linters | Sprint 3-4 |
| US-013 | As a user, I want multiple environments | dev/staging/prod generated | Sprint 5-6 |
| US-014 | As a user, I want modular Terraform | Reusable modules created | Sprint 5-6 |

---

## Acceptance Criteria

- [ ] Questionnaire generates valid Terraform
- [ ] Conversational mode understands intent
- [ ] Templates render correctly
- [ ] Best practices applied by default
- [ ] Generated code passes tflint
- [ ] Generated code passes checkov

---

*Document Version: 1.0*
*Last Updated: January 2026*
