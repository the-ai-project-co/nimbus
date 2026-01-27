# Generator Engine Team - Release 2 Specification

> **Team**: Generator Engine Team
> **Phase**: Release 2 (Months 4-6)
> **Dependencies**: Core Engine, MCP Tools Team

---

## Overview

In Release 2, the Generator Engine Team extends the generation capabilities to support CI/CD pipelines across GitHub Actions, GitLab CI, and ArgoCD, with both questionnaire-driven and conversational modes.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CI/CD Generator Engine                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  CI/CD Intent Parser                     │   │
│  │  • Detect pipeline type (build, test, deploy, release)  │   │
│  │  • Identify target platforms (GitHub, GitLab, ArgoCD)   │   │
│  │  • Extract deployment targets (K8s, Lambda, ECS, etc.)  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Template Selector                       │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────────────┐   │   │
│  │  │  GitHub   │  │  GitLab   │  │      ArgoCD       │   │   │
│  │  │  Actions  │  │    CI     │  │     Templates     │   │   │
│  │  └───────────┘  └───────────┘  └───────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Pipeline Renderer                       │   │
│  │  • Generate YAML/JSON configurations                     │   │
│  │  • Apply best practices (caching, parallelism)          │   │
│  │  • Include security scanning stages                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. CI/CD Questionnaire Engine

**File**: `packages/generator/src/cicd/questionnaire.ts`

```typescript
import { z } from 'zod';

interface CICDQuestion {
  id: string;
  question: string;
  type: 'select' | 'multiselect' | 'input' | 'confirm';
  options?: Array<{ value: string; label: string; description?: string }>;
  default?: string | string[] | boolean;
  dependsOn?: {
    questionId: string;
    value: string | string[];
  };
}

export const cicdQuestionnaire: CICDQuestion[] = [
  {
    id: 'platform',
    question: 'Which CI/CD platform do you want to use?',
    type: 'select',
    options: [
      { value: 'github-actions', label: 'GitHub Actions', description: 'Native GitHub CI/CD' },
      { value: 'gitlab-ci', label: 'GitLab CI', description: 'GitLab native pipelines' },
      { value: 'argocd', label: 'ArgoCD', description: 'GitOps for Kubernetes' },
    ],
  },
  {
    id: 'projectType',
    question: 'What type of project is this?',
    type: 'select',
    options: [
      { value: 'nodejs', label: 'Node.js / TypeScript' },
      { value: 'python', label: 'Python' },
      { value: 'go', label: 'Go' },
      { value: 'java', label: 'Java / Kotlin' },
      { value: 'rust', label: 'Rust' },
      { value: 'dotnet', label: '.NET' },
      { value: 'docker', label: 'Docker (generic)' },
    ],
  },
  {
    id: 'stages',
    question: 'Which pipeline stages do you need?',
    type: 'multiselect',
    options: [
      { value: 'lint', label: 'Linting' },
      { value: 'test', label: 'Unit Tests' },
      { value: 'integration-test', label: 'Integration Tests' },
      { value: 'security-scan', label: 'Security Scanning' },
      { value: 'build', label: 'Build / Compile' },
      { value: 'docker-build', label: 'Docker Build' },
      { value: 'deploy-staging', label: 'Deploy to Staging' },
      { value: 'deploy-production', label: 'Deploy to Production' },
    ],
    default: ['lint', 'test', 'build'],
  },
  {
    id: 'deployTarget',
    question: 'Where do you want to deploy?',
    type: 'select',
    dependsOn: { questionId: 'stages', value: ['deploy-staging', 'deploy-production'] },
    options: [
      { value: 'kubernetes', label: 'Kubernetes (EKS/GKE/AKS)' },
      { value: 'ecs', label: 'AWS ECS' },
      { value: 'lambda', label: 'AWS Lambda' },
      { value: 'cloudrun', label: 'Google Cloud Run' },
      { value: 'vercel', label: 'Vercel' },
      { value: 'netlify', label: 'Netlify' },
      { value: 'custom', label: 'Custom / SSH' },
    ],
  },
  {
    id: 'environments',
    question: 'Which environments do you need?',
    type: 'multiselect',
    dependsOn: { questionId: 'stages', value: ['deploy-staging', 'deploy-production'] },
    options: [
      { value: 'development', label: 'Development' },
      { value: 'staging', label: 'Staging' },
      { value: 'production', label: 'Production' },
    ],
    default: ['staging', 'production'],
  },
  {
    id: 'triggers',
    question: 'When should the pipeline run?',
    type: 'multiselect',
    options: [
      { value: 'push-main', label: 'Push to main/master' },
      { value: 'push-develop', label: 'Push to develop' },
      { value: 'pull-request', label: 'Pull requests' },
      { value: 'tag', label: 'Git tags / releases' },
      { value: 'schedule', label: 'Scheduled (cron)' },
      { value: 'manual', label: 'Manual trigger' },
    ],
    default: ['push-main', 'pull-request'],
  },
  {
    id: 'dockerRegistry',
    question: 'Which container registry do you use?',
    type: 'select',
    dependsOn: { questionId: 'stages', value: 'docker-build' },
    options: [
      { value: 'ecr', label: 'AWS ECR' },
      { value: 'gcr', label: 'Google Container Registry' },
      { value: 'acr', label: 'Azure Container Registry' },
      { value: 'dockerhub', label: 'Docker Hub' },
      { value: 'ghcr', label: 'GitHub Container Registry' },
    ],
  },
  {
    id: 'securityTools',
    question: 'Which security scanning tools do you want?',
    type: 'multiselect',
    dependsOn: { questionId: 'stages', value: 'security-scan' },
    options: [
      { value: 'trivy', label: 'Trivy (Container scanning)' },
      { value: 'snyk', label: 'Snyk (Dependencies)' },
      { value: 'codeql', label: 'CodeQL (SAST)' },
      { value: 'gitleaks', label: 'Gitleaks (Secrets)' },
      { value: 'semgrep', label: 'Semgrep (SAST)' },
    ],
    default: ['trivy', 'gitleaks'],
  },
  {
    id: 'notifications',
    question: 'How do you want to be notified?',
    type: 'multiselect',
    options: [
      { value: 'slack', label: 'Slack' },
      { value: 'teams', label: 'Microsoft Teams' },
      { value: 'email', label: 'Email' },
      { value: 'none', label: 'No notifications' },
    ],
  },
  {
    id: 'caching',
    question: 'Enable dependency caching?',
    type: 'confirm',
    default: true,
  },
  {
    id: 'parallelization',
    question: 'Run tests in parallel where possible?',
    type: 'confirm',
    default: true,
  },
];

export class CICDQuestionnaireEngine {
  private answers: Map<string, any> = new Map();

  getNextQuestion(): CICDQuestion | null {
    for (const question of cicdQuestionnaire) {
      if (this.answers.has(question.id)) continue;

      if (question.dependsOn) {
        const depValue = this.answers.get(question.dependsOn.questionId);
        if (!this.matchesDependency(depValue, question.dependsOn.value)) {
          continue;
        }
      }

      return question;
    }
    return null;
  }

  setAnswer(questionId: string, value: any): void {
    this.answers.set(questionId, value);
  }

  getConfig(): CICDGenerationConfig {
    return {
      platform: this.answers.get('platform'),
      projectType: this.answers.get('projectType'),
      stages: this.answers.get('stages') || [],
      deployTarget: this.answers.get('deployTarget'),
      environments: this.answers.get('environments') || [],
      triggers: this.answers.get('triggers') || [],
      dockerRegistry: this.answers.get('dockerRegistry'),
      securityTools: this.answers.get('securityTools') || [],
      notifications: this.answers.get('notifications') || [],
      caching: this.answers.get('caching') ?? true,
      parallelization: this.answers.get('parallelization') ?? true,
    };
  }

  private matchesDependency(actual: any, expected: string | string[]): boolean {
    if (Array.isArray(expected)) {
      if (Array.isArray(actual)) {
        return expected.some(e => actual.includes(e));
      }
      return expected.includes(actual);
    }
    if (Array.isArray(actual)) {
      return actual.includes(expected);
    }
    return actual === expected;
  }
}
```

### 2. CI/CD Intent Parser

**File**: `packages/generator/src/cicd/intent-parser.ts`

```typescript
interface CICDIntent {
  platform: 'github-actions' | 'gitlab-ci' | 'argocd';
  pipelineType: 'build' | 'test' | 'deploy' | 'release' | 'full';
  projectType: string;
  stages: string[];
  deployTarget?: string;
  environments?: string[];
  additionalRequirements: string[];
}

const CICD_INTENT_PROMPT = `
You are a CI/CD pipeline configuration expert. Analyze the user request and extract:

1. platform: Which CI/CD platform (github-actions, gitlab-ci, argocd)
2. pipelineType: Type of pipeline (build, test, deploy, release, full)
3. projectType: Programming language/framework (nodejs, python, go, java, rust, dotnet, docker)
4. stages: List of pipeline stages needed
5. deployTarget: Where to deploy (kubernetes, ecs, lambda, cloudrun, vercel, etc.)
6. environments: Which environments (development, staging, production)
7. additionalRequirements: Any special requirements mentioned

Return JSON matching this structure.
`;

export class CICDIntentParser {
  private llm: LLMProvider;

  constructor(llm: LLMProvider) {
    this.llm = llm;
  }

  async parse(userInput: string): Promise<CICDIntent> {
    const response = await this.llm.complete({
      messages: [
        { role: 'system', content: CICD_INTENT_PROMPT },
        { role: 'user', content: userInput },
      ],
      responseFormat: { type: 'json_object' },
    });

    const intent = JSON.parse(response.content);

    // Apply defaults and validation
    return {
      platform: intent.platform || 'github-actions',
      pipelineType: intent.pipelineType || 'full',
      projectType: intent.projectType || 'nodejs',
      stages: intent.stages || ['lint', 'test', 'build'],
      deployTarget: intent.deployTarget,
      environments: intent.environments || ['staging', 'production'],
      additionalRequirements: intent.additionalRequirements || [],
    };
  }
}
```

### 3. Pipeline Template Library

**File**: `packages/generator/src/cicd/templates/github-actions.ts`

```typescript
interface GitHubActionsTemplate {
  name: string;
  description: string;
  projectTypes: string[];
  template: (config: CICDGenerationConfig) => GitHubActionsWorkflow;
}

export const githubActionsTemplates: GitHubActionsTemplate[] = [
  {
    name: 'nodejs-full',
    description: 'Full CI/CD for Node.js projects',
    projectTypes: ['nodejs'],
    template: (config) => ({
      name: 'CI/CD Pipeline',
      on: buildTriggers(config.triggers),
      env: {
        NODE_VERSION: '20',
        ...(config.dockerRegistry === 'ecr' && {
          ECR_REGISTRY: '${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com',
        }),
      },
      jobs: {
        ...(config.stages.includes('lint') && {
          lint: {
            'runs-on': 'ubuntu-latest',
            steps: [
              { uses: 'actions/checkout@v4' },
              { uses: 'actions/setup-node@v4', with: { 'node-version': '${{ env.NODE_VERSION }}', cache: 'npm' } },
              { run: 'npm ci' },
              { run: 'npm run lint' },
            ],
          },
        }),
        ...(config.stages.includes('test') && {
          test: {
            'runs-on': 'ubuntu-latest',
            needs: config.stages.includes('lint') ? ['lint'] : undefined,
            steps: [
              { uses: 'actions/checkout@v4' },
              { uses: 'actions/setup-node@v4', with: { 'node-version': '${{ env.NODE_VERSION }}', cache: 'npm' } },
              { run: 'npm ci' },
              { run: 'npm test -- --coverage' },
              { uses: 'codecov/codecov-action@v3', if: "github.event_name == 'push'" },
            ],
          },
        }),
        ...(config.stages.includes('security-scan') && {
          security: {
            'runs-on': 'ubuntu-latest',
            steps: [
              { uses: 'actions/checkout@v4' },
              ...(config.securityTools.includes('trivy') ? [{
                name: 'Run Trivy vulnerability scanner',
                uses: 'aquasecurity/trivy-action@master',
                with: { 'scan-type': 'fs', 'scan-ref': '.', format: 'sarif', output: 'trivy-results.sarif' },
              }] : []),
              ...(config.securityTools.includes('gitleaks') ? [{
                name: 'Run Gitleaks',
                uses: 'gitleaks/gitleaks-action@v2',
              }] : []),
              ...(config.securityTools.includes('codeql') ? [{
                name: 'Initialize CodeQL',
                uses: 'github/codeql-action/init@v2',
                with: { languages: 'javascript' },
              }, {
                name: 'Perform CodeQL Analysis',
                uses: 'github/codeql-action/analyze@v2',
              }] : []),
            ],
          },
        }),
        ...(config.stages.includes('build') && {
          build: {
            'runs-on': 'ubuntu-latest',
            needs: getNeeds(config, ['lint', 'test']),
            steps: [
              { uses: 'actions/checkout@v4' },
              { uses: 'actions/setup-node@v4', with: { 'node-version': '${{ env.NODE_VERSION }}', cache: 'npm' } },
              { run: 'npm ci' },
              { run: 'npm run build' },
              { uses: 'actions/upload-artifact@v4', with: { name: 'build', path: 'dist/' } },
            ],
          },
        }),
        ...(config.stages.includes('docker-build') && {
          'docker-build': {
            'runs-on': 'ubuntu-latest',
            needs: ['build'],
            steps: [
              { uses: 'actions/checkout@v4' },
              { uses: 'actions/download-artifact@v4', with: { name: 'build', path: 'dist/' } },
              { uses: 'docker/setup-buildx-action@v3' },
              ...getDockerLoginSteps(config.dockerRegistry),
              {
                uses: 'docker/build-push-action@v5',
                with: {
                  context: '.',
                  push: true,
                  tags: getDockerTags(config.dockerRegistry),
                  cache-from: 'type=gha',
                  'cache-to': 'type=gha,mode=max',
                },
              },
            ],
          },
        }),
        ...(config.stages.includes('deploy-staging') && {
          'deploy-staging': {
            'runs-on': 'ubuntu-latest',
            needs: config.stages.includes('docker-build') ? ['docker-build'] : ['build'],
            environment: { name: 'staging', url: '${{ steps.deploy.outputs.url }}' },
            if: "github.ref == 'refs/heads/main'",
            steps: getDeploySteps(config, 'staging'),
          },
        }),
        ...(config.stages.includes('deploy-production') && {
          'deploy-production': {
            'runs-on': 'ubuntu-latest',
            needs: ['deploy-staging'],
            environment: { name: 'production', url: '${{ steps.deploy.outputs.url }}' },
            if: "github.ref == 'refs/heads/main'",
            steps: getDeploySteps(config, 'production'),
          },
        }),
      },
    }),
  },
  // Additional templates for python, go, java, etc.
];

function buildTriggers(triggers: string[]): Record<string, any> {
  const on: Record<string, any> = {};

  if (triggers.includes('push-main')) {
    on.push = { branches: ['main', 'master'] };
  }
  if (triggers.includes('pull-request')) {
    on.pull_request = { branches: ['main', 'master'] };
  }
  if (triggers.includes('tag')) {
    on.push = { ...on.push, tags: ['v*'] };
  }
  if (triggers.includes('manual')) {
    on.workflow_dispatch = null;
  }
  if (triggers.includes('schedule')) {
    on.schedule = [{ cron: '0 0 * * 0' }]; // Weekly
  }

  return on;
}

function getNeeds(config: CICDGenerationConfig, possibleDeps: string[]): string[] | undefined {
  const needs = possibleDeps.filter(dep => config.stages.includes(dep));
  return needs.length > 0 ? needs : undefined;
}

function getDockerLoginSteps(registry?: string): any[] {
  switch (registry) {
    case 'ecr':
      return [{
        name: 'Configure AWS credentials',
        uses: 'aws-actions/configure-aws-credentials@v4',
        with: {
          'aws-access-key-id': '${{ secrets.AWS_ACCESS_KEY_ID }}',
          'aws-secret-access-key': '${{ secrets.AWS_SECRET_ACCESS_KEY }}',
          'aws-region': '${{ secrets.AWS_REGION }}',
        },
      }, {
        name: 'Login to Amazon ECR',
        uses: 'aws-actions/amazon-ecr-login@v2',
      }];
    case 'ghcr':
      return [{
        name: 'Login to GitHub Container Registry',
        uses: 'docker/login-action@v3',
        with: {
          registry: 'ghcr.io',
          username: '${{ github.actor }}',
          password: '${{ secrets.GITHUB_TOKEN }}',
        },
      }];
    case 'dockerhub':
      return [{
        name: 'Login to Docker Hub',
        uses: 'docker/login-action@v3',
        with: {
          username: '${{ secrets.DOCKERHUB_USERNAME }}',
          password: '${{ secrets.DOCKERHUB_TOKEN }}',
        },
      }];
    default:
      return [];
  }
}

function getDeploySteps(config: CICDGenerationConfig, environment: string): any[] {
  switch (config.deployTarget) {
    case 'kubernetes':
      return [
        { uses: 'actions/checkout@v4' },
        {
          name: 'Configure kubectl',
          uses: 'azure/setup-kubectl@v3',
        },
        {
          name: 'Deploy to Kubernetes',
          run: `kubectl apply -f k8s/${environment}/`,
          env: { KUBECONFIG: '${{ secrets.KUBECONFIG }}' },
        },
      ];
    case 'ecs':
      return [
        {
          name: 'Configure AWS credentials',
          uses: 'aws-actions/configure-aws-credentials@v4',
          with: {
            'aws-access-key-id': '${{ secrets.AWS_ACCESS_KEY_ID }}',
            'aws-secret-access-key': '${{ secrets.AWS_SECRET_ACCESS_KEY }}',
            'aws-region': '${{ secrets.AWS_REGION }}',
          },
        },
        {
          name: 'Deploy to ECS',
          uses: 'aws-actions/amazon-ecs-deploy-task-definition@v1',
          with: {
            'task-definition': `ecs/${environment}-task-definition.json`,
            service: `${{ secrets.ECS_SERVICE_${environment.toUpperCase()} }}`,
            cluster: `${{ secrets.ECS_CLUSTER_${environment.toUpperCase()} }}`,
            'wait-for-service-stability': true,
          },
        },
      ];
    case 'vercel':
      return [
        {
          name: 'Deploy to Vercel',
          uses: 'amondnet/vercel-action@v25',
          with: {
            'vercel-token': '${{ secrets.VERCEL_TOKEN }}',
            'vercel-org-id': '${{ secrets.VERCEL_ORG_ID }}',
            'vercel-project-id': '${{ secrets.VERCEL_PROJECT_ID }}',
            'vercel-args': environment === 'production' ? '--prod' : '',
          },
        },
      ];
    default:
      return [{ run: `echo "Deploy to ${environment}"` }];
  }
}
```

### 4. CI/CD Generator

**File**: `packages/generator/src/cicd/generator.ts`

```typescript
interface CICDGenerationResult {
  files: GeneratedFile[];
  summary: string;
  secretsRequired: string[];
  setupInstructions: string[];
}

export class CICDGenerator {
  private llm: LLMProvider;
  private templates: Map<string, any>;

  constructor(llm: LLMProvider) {
    this.llm = llm;
    this.templates = new Map();
    this.loadTemplates();
  }

  async generate(config: CICDGenerationConfig): Promise<CICDGenerationResult> {
    const files: GeneratedFile[] = [];
    const secretsRequired: string[] = [];
    const setupInstructions: string[] = [];

    switch (config.platform) {
      case 'github-actions':
        const workflow = this.generateGitHubActions(config);
        files.push({
          path: `.github/workflows/ci-cd.yml`,
          content: yaml.stringify(workflow),
        });
        secretsRequired.push(...this.getRequiredSecrets(config, 'github'));
        setupInstructions.push(
          'Add the workflow file to your repository',
          'Configure repository secrets in Settings > Secrets',
          'Enable GitHub Actions in your repository settings'
        );
        break;

      case 'gitlab-ci':
        const pipeline = this.generateGitLabCI(config);
        files.push({
          path: '.gitlab-ci.yml',
          content: yaml.stringify(pipeline),
        });
        secretsRequired.push(...this.getRequiredSecrets(config, 'gitlab'));
        setupInstructions.push(
          'Add .gitlab-ci.yml to your repository root',
          'Configure CI/CD variables in Settings > CI/CD > Variables',
          'Ensure runners are available for your project'
        );
        break;

      case 'argocd':
        const argoFiles = this.generateArgoCD(config);
        files.push(...argoFiles);
        setupInstructions.push(
          'Install ArgoCD in your cluster',
          'Apply the Application manifests',
          'Configure ArgoCD repository credentials'
        );
        break;
    }

    return {
      files,
      summary: this.generateSummary(config, files),
      secretsRequired,
      setupInstructions,
    };
  }

  private generateGitHubActions(config: CICDGenerationConfig): any {
    const template = githubActionsTemplates.find(t =>
      t.projectTypes.includes(config.projectType)
    ) || githubActionsTemplates[0];

    return template.template(config);
  }

  private generateGitLabCI(config: CICDGenerationConfig): any {
    const stages = config.stages.map(s => s.replace('-', '_'));

    const pipeline: Record<string, any> = {
      stages,
      variables: {
        DOCKER_DRIVER: 'overlay2',
      },
    };

    // Add jobs based on stages
    if (config.stages.includes('lint')) {
      pipeline.lint = {
        stage: 'lint',
        image: this.getImage(config.projectType),
        script: this.getLintScript(config.projectType),
        cache: config.caching ? this.getCache(config.projectType) : undefined,
      };
    }

    if (config.stages.includes('test')) {
      pipeline.test = {
        stage: 'test',
        image: this.getImage(config.projectType),
        script: this.getTestScript(config.projectType),
        coverage: '/Coverage: \\d+\\.\\d+%/',
        artifacts: {
          reports: { coverage_report: { coverage_format: 'cobertura', path: 'coverage/cobertura-coverage.xml' } },
        },
      };
    }

    if (config.stages.includes('build')) {
      pipeline.build = {
        stage: 'build',
        image: this.getImage(config.projectType),
        script: this.getBuildScript(config.projectType),
        artifacts: { paths: ['dist/'], expire_in: '1 week' },
      };
    }

    if (config.stages.includes('docker-build')) {
      pipeline['docker-build'] = {
        stage: 'docker_build',
        image: 'docker:24',
        services: ['docker:24-dind'],
        before_script: this.getDockerLoginScript(config.dockerRegistry, 'gitlab'),
        script: [
          'docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .',
          'docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA',
        ],
      };
    }

    if (config.stages.includes('deploy-staging')) {
      pipeline['deploy-staging'] = {
        stage: 'deploy_staging',
        environment: { name: 'staging', url: 'https://staging.example.com' },
        script: this.getDeployScript(config, 'staging'),
        rules: [{ if: '$CI_COMMIT_BRANCH == "main"' }],
      };
    }

    if (config.stages.includes('deploy-production')) {
      pipeline['deploy-production'] = {
        stage: 'deploy_production',
        environment: { name: 'production', url: 'https://example.com' },
        script: this.getDeployScript(config, 'production'),
        rules: [{ if: '$CI_COMMIT_BRANCH == "main"', when: 'manual' }],
      };
    }

    return pipeline;
  }

  private generateArgoCD(config: CICDGenerationConfig): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    for (const env of config.environments || ['staging', 'production']) {
      const application = {
        apiVersion: 'argoproj.io/v1alpha1',
        kind: 'Application',
        metadata: {
          name: `app-${env}`,
          namespace: 'argocd',
        },
        spec: {
          project: 'default',
          source: {
            repoURL: '${GIT_REPO_URL}',
            path: `k8s/overlays/${env}`,
            targetRevision: env === 'production' ? 'main' : 'HEAD',
          },
          destination: {
            server: 'https://kubernetes.default.svc',
            namespace: env,
          },
          syncPolicy: {
            automated: {
              prune: env !== 'production',
              selfHeal: true,
            },
            syncOptions: ['CreateNamespace=true'],
          },
        },
      };

      files.push({
        path: `argocd/applications/${env}.yaml`,
        content: yaml.stringify(application),
      });
    }

    // Generate ApplicationSet for multiple environments
    const appSet = {
      apiVersion: 'argoproj.io/v1alpha1',
      kind: 'ApplicationSet',
      metadata: {
        name: 'app-environments',
        namespace: 'argocd',
      },
      spec: {
        generators: [{
          list: {
            elements: config.environments?.map(env => ({
              environment: env,
              url: `https://${env}.example.com`,
            })) || [],
          },
        }],
        template: {
          metadata: { name: 'app-{{environment}}' },
          spec: {
            project: 'default',
            source: {
              repoURL: '${GIT_REPO_URL}',
              path: 'k8s/overlays/{{environment}}',
              targetRevision: 'HEAD',
            },
            destination: {
              server: 'https://kubernetes.default.svc',
              namespace: '{{environment}}',
            },
          },
        },
      },
    };

    files.push({
      path: 'argocd/applicationset.yaml',
      content: yaml.stringify(appSet),
    });

    return files;
  }

  private getImage(projectType: string): string {
    const images: Record<string, string> = {
      nodejs: 'node:20-alpine',
      python: 'python:3.11-slim',
      go: 'golang:1.21-alpine',
      java: 'eclipse-temurin:17-jdk',
      rust: 'rust:1.74',
      dotnet: 'mcr.microsoft.com/dotnet/sdk:8.0',
    };
    return images[projectType] || 'ubuntu:latest';
  }

  private getLintScript(projectType: string): string[] {
    const scripts: Record<string, string[]> = {
      nodejs: ['npm ci', 'npm run lint'],
      python: ['pip install ruff', 'ruff check .'],
      go: ['go fmt ./...', 'go vet ./...'],
      java: ['./gradlew checkstyleMain'],
      rust: ['cargo fmt --check', 'cargo clippy'],
    };
    return scripts[projectType] || ['echo "No lint configured"'];
  }

  private getTestScript(projectType: string): string[] {
    const scripts: Record<string, string[]> = {
      nodejs: ['npm ci', 'npm test -- --coverage'],
      python: ['pip install -r requirements.txt', 'pytest --cov'],
      go: ['go test -v -cover ./...'],
      java: ['./gradlew test'],
      rust: ['cargo test'],
    };
    return scripts[projectType] || ['echo "No test configured"'];
  }

  private getBuildScript(projectType: string): string[] {
    const scripts: Record<string, string[]> = {
      nodejs: ['npm ci', 'npm run build'],
      python: ['pip install build', 'python -m build'],
      go: ['go build -o app .'],
      java: ['./gradlew build'],
      rust: ['cargo build --release'],
    };
    return scripts[projectType] || ['echo "No build configured"'];
  }

  private getRequiredSecrets(config: CICDGenerationConfig, platform: string): string[] {
    const secrets: string[] = [];

    if (config.dockerRegistry === 'ecr') {
      secrets.push('AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_ACCOUNT_ID');
    } else if (config.dockerRegistry === 'dockerhub') {
      secrets.push('DOCKERHUB_USERNAME', 'DOCKERHUB_TOKEN');
    }

    if (config.deployTarget === 'kubernetes') {
      secrets.push('KUBECONFIG');
    } else if (config.deployTarget === 'ecs') {
      secrets.push('AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'ECS_CLUSTER', 'ECS_SERVICE');
    } else if (config.deployTarget === 'vercel') {
      secrets.push('VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID');
    }

    if (config.notifications.includes('slack')) {
      secrets.push('SLACK_WEBHOOK_URL');
    }

    return [...new Set(secrets)];
  }

  private generateSummary(config: CICDGenerationConfig, files: GeneratedFile[]): string {
    return `
Generated ${config.platform} pipeline with:
- Stages: ${config.stages.join(', ')}
- Project type: ${config.projectType}
- Deploy target: ${config.deployTarget || 'N/A'}
- Environments: ${config.environments?.join(', ') || 'N/A'}
- Files: ${files.map(f => f.path).join(', ')}
    `.trim();
  }
}
```

---

## User Stories

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-110 | As a user, I want to generate GitHub Actions via questionnaire | Complete workflow generated | Sprint 7-8 |
| US-111 | As a user, I want to generate GitLab CI via questionnaire | Complete .gitlab-ci.yml generated | Sprint 7-8 |
| US-112 | As a user, I want to generate ArgoCD config via questionnaire | ArgoCD manifests generated | Sprint 7-8 |
| US-113 | As a user, I want to generate CI/CD via natural language | Intent parsed, config generated | Sprint 9-10 |
| US-114 | As a user, I want security scanning in my pipelines | Trivy, Snyk, CodeQL integrated | Sprint 9-10 |
| US-115 | As a user, I want multi-environment deployment pipelines | Staging + Production with promotion | Sprint 9-10 |

---

## Sprint Breakdown

### Sprint 7-8 (Weeks 1-4)

| Task | Effort | Deliverable |
|------|--------|-------------|
| CI/CD questionnaire design | 3 days | Question flow |
| GitHub Actions templates | 4 days | Full templates |
| GitLab CI templates | 3 days | Full templates |
| ArgoCD templates | 2 days | Application manifests |

### Sprint 9-10 (Weeks 5-8)

| Task | Effort | Deliverable |
|------|--------|-------------|
| CI/CD intent parser | 3 days | NLP-based parsing |
| Security scanning integration | 3 days | Trivy, Snyk, CodeQL |
| Multi-environment support | 2 days | Env-specific configs |
| Testing and validation | 2 days | All templates tested |

---

## Acceptance Criteria

- [ ] GitHub Actions workflow generation working
- [ ] GitLab CI pipeline generation working
- [ ] ArgoCD application manifests generation working
- [ ] Both questionnaire and conversational modes supported
- [ ] Security scanning stages available
- [ ] Multi-environment deployment supported
- [ ] Generated pipelines pass validation

---

*Document Version: 1.0*
*Last Updated: January 2026*
