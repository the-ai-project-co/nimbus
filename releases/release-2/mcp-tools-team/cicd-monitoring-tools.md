# MCP Tools Team - Release 2 Specification

> **Team**: MCP Tools Team
> **Phase**: Release 2 (Months 4-6)
> **Dependencies**: Core Engine, Generator Engine

---

## Overview

In Release 2, the MCP Tools Team extends the tool layer to support CI/CD platforms (GitHub Actions, GitLab CI, Jenkins, ArgoCD) and monitoring/observability tools (Prometheus, Grafana, AlertManager).

---

## New Tool Categories

### 1. CI/CD Platform Tools

```
┌─────────────────────────────────────────────────────────────────┐
│                     CI/CD Tool Layer                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   GitHub    │  │   GitLab    │  │        ArgoCD           │ │
│  │   Actions   │  │     CI      │  │       (GitOps)          │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                        Jenkins                              ││
│  │              (Pipeline/Declarative/Scripted)                ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## GitHub Actions Tools

### 1.1 github_actions_create_workflow

**File**: `packages/mcp-tools/src/github/create-workflow.ts`

```typescript
import { z } from 'zod';

const inputSchema = z.object({
  name: z.string().describe('Workflow name'),
  triggers: z.object({
    push: z.object({
      branches: z.array(z.string()).optional(),
    }).optional(),
    pull_request: z.object({
      branches: z.array(z.string()).optional(),
    }).optional(),
    schedule: z.array(z.object({
      cron: z.string(),
    })).optional(),
    workflow_dispatch: z.boolean().optional(),
  }),
  jobs: z.array(z.object({
    id: z.string(),
    name: z.string(),
    runsOn: z.string().default('ubuntu-latest'),
    steps: z.array(z.object({
      name: z.string(),
      uses: z.string().optional(),
      run: z.string().optional(),
      with: z.record(z.string()).optional(),
      env: z.record(z.string()).optional(),
    })),
    needs: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
  })),
  outputPath: z.string().default('.github/workflows'),
});

export const githubActionsCreateWorkflow: MCPTool = {
  name: 'github_actions_create_workflow',
  description: 'Create a GitHub Actions workflow file',
  inputSchema,
  handler: async (input) => {
    const workflow = {
      name: input.name,
      on: buildTriggers(input.triggers),
      jobs: buildJobs(input.jobs),
    };

    const yamlContent = yaml.stringify(workflow);
    const fileName = `${input.name.toLowerCase().replace(/\s+/g, '-')}.yml`;
    const filePath = path.join(input.outputPath, fileName);

    await fs.mkdir(input.outputPath, { recursive: true });
    await fs.writeFile(filePath, yamlContent);

    return {
      success: true,
      output: `Created workflow: ${filePath}`,
      artifacts: [{
        type: 'file',
        path: filePath,
        content: yamlContent,
      }],
      metadata: {
        workflowName: input.name,
        jobCount: input.jobs.length,
      },
    };
  },
};

function buildTriggers(triggers: any): Record<string, any> {
  const on: Record<string, any> = {};

  if (triggers.push) {
    on.push = triggers.push.branches ? { branches: triggers.push.branches } : null;
  }
  if (triggers.pull_request) {
    on.pull_request = triggers.pull_request.branches
      ? { branches: triggers.pull_request.branches }
      : null;
  }
  if (triggers.schedule) {
    on.schedule = triggers.schedule;
  }
  if (triggers.workflow_dispatch) {
    on.workflow_dispatch = null;
  }

  return on;
}

function buildJobs(jobs: any[]): Record<string, any> {
  const result: Record<string, any> = {};

  for (const job of jobs) {
    result[job.id] = {
      name: job.name,
      'runs-on': job.runsOn,
      steps: job.steps.map(step => ({
        name: step.name,
        ...(step.uses && { uses: step.uses }),
        ...(step.run && { run: step.run }),
        ...(step.with && { with: step.with }),
        ...(step.env && { env: step.env }),
      })),
      ...(job.needs && { needs: job.needs }),
      ...(job.env && { env: job.env }),
    };
  }

  return result;
}
```

### 1.2 github_actions_validate_workflow

**File**: `packages/mcp-tools/src/github/validate-workflow.ts`

```typescript
const inputSchema = z.object({
  file: z.string().describe('Path to workflow file'),
});

export const githubActionsValidateWorkflow: MCPTool = {
  name: 'github_actions_validate_workflow',
  description: 'Validate a GitHub Actions workflow file',
  inputSchema,
  handler: async (input) => {
    const content = await fs.readFile(input.file, 'utf-8');
    const workflow = yaml.parse(content);

    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!workflow.name) {
      warnings.push('Workflow name is recommended');
    }

    if (!workflow.on) {
      errors.push('Workflow must have triggers (on)');
    }

    if (!workflow.jobs || Object.keys(workflow.jobs).length === 0) {
      errors.push('Workflow must have at least one job');
    }

    // Validate jobs
    for (const [jobId, job] of Object.entries(workflow.jobs || {})) {
      if (!job['runs-on']) {
        errors.push(`Job '${jobId}' must specify runs-on`);
      }

      if (!job.steps || job.steps.length === 0) {
        errors.push(`Job '${jobId}' must have at least one step`);
      }

      // Check for common issues
      for (const step of job.steps || []) {
        if (!step.uses && !step.run) {
          errors.push(`Step '${step.name || 'unnamed'}' must have 'uses' or 'run'`);
        }

        // Check for outdated actions
        if (step.uses?.includes('@v1') || step.uses?.includes('@v2')) {
          warnings.push(`Step '${step.name}' uses outdated action version: ${step.uses}`);
        }
      }
    }

    return {
      success: errors.length === 0,
      output: errors.length === 0
        ? 'Workflow is valid'
        : `Validation failed:\n${errors.join('\n')}`,
      metadata: {
        errors,
        warnings,
        jobCount: Object.keys(workflow.jobs || {}).length,
      },
    };
  },
};
```

### 1.3 github_actions_list_workflows

```typescript
const inputSchema = z.object({
  repository: z.string().describe('Repository in owner/repo format'),
  status: z.enum(['active', 'disabled', 'all']).optional().default('all'),
});

export const githubActionsListWorkflows: MCPTool = {
  name: 'github_actions_list_workflows',
  description: 'List GitHub Actions workflows in a repository',
  inputSchema,
  handler: async (input) => {
    const result = await runCommand('gh', [
      'workflow', 'list',
      '--repo', input.repository,
      '--json', 'name,id,state,path',
    ]);

    if (result.exitCode !== 0) {
      return { success: false, output: '', error: result.stderr };
    }

    const workflows = JSON.parse(result.stdout);
    const filtered = input.status === 'all'
      ? workflows
      : workflows.filter((w: any) =>
          input.status === 'active' ? w.state === 'active' : w.state === 'disabled'
        );

    return {
      success: true,
      output: formatWorkflowList(filtered),
      metadata: {
        count: filtered.length,
        workflows: filtered,
      },
    };
  },
};
```

---

## GitLab CI Tools

### 2.1 gitlab_ci_create_pipeline

**File**: `packages/mcp-tools/src/gitlab/create-pipeline.ts`

```typescript
const inputSchema = z.object({
  stages: z.array(z.string()).describe('Pipeline stages'),
  jobs: z.array(z.object({
    name: z.string(),
    stage: z.string(),
    image: z.string().optional(),
    script: z.array(z.string()),
    before_script: z.array(z.string()).optional(),
    after_script: z.array(z.string()).optional(),
    artifacts: z.object({
      paths: z.array(z.string()),
      expire_in: z.string().optional(),
    }).optional(),
    cache: z.object({
      key: z.string(),
      paths: z.array(z.string()),
    }).optional(),
    only: z.array(z.string()).optional(),
    except: z.array(z.string()).optional(),
    rules: z.array(z.object({
      if: z.string(),
      when: z.enum(['always', 'never', 'on_success', 'manual']).optional(),
    })).optional(),
    needs: z.array(z.string()).optional(),
    variables: z.record(z.string()).optional(),
  })),
  variables: z.record(z.string()).optional(),
  include: z.array(z.object({
    template: z.string().optional(),
    local: z.string().optional(),
    remote: z.string().optional(),
  })).optional(),
  outputPath: z.string().default('.gitlab-ci.yml'),
});

export const gitlabCICreatePipeline: MCPTool = {
  name: 'gitlab_ci_create_pipeline',
  description: 'Create a GitLab CI pipeline configuration',
  inputSchema,
  handler: async (input) => {
    const pipeline: Record<string, any> = {
      stages: input.stages,
    };

    if (input.variables) {
      pipeline.variables = input.variables;
    }

    if (input.include) {
      pipeline.include = input.include;
    }

    // Add jobs
    for (const job of input.jobs) {
      pipeline[job.name] = {
        stage: job.stage,
        script: job.script,
        ...(job.image && { image: job.image }),
        ...(job.before_script && { before_script: job.before_script }),
        ...(job.after_script && { after_script: job.after_script }),
        ...(job.artifacts && { artifacts: job.artifacts }),
        ...(job.cache && { cache: job.cache }),
        ...(job.only && { only: job.only }),
        ...(job.except && { except: job.except }),
        ...(job.rules && { rules: job.rules }),
        ...(job.needs && { needs: job.needs }),
        ...(job.variables && { variables: job.variables }),
      };
    }

    const yamlContent = yaml.stringify(pipeline);
    await fs.writeFile(input.outputPath, yamlContent);

    return {
      success: true,
      output: `Created GitLab CI config: ${input.outputPath}`,
      artifacts: [{
        type: 'file',
        path: input.outputPath,
        content: yamlContent,
      }],
      metadata: {
        stages: input.stages,
        jobCount: input.jobs.length,
      },
    };
  },
};
```

### 2.2 gitlab_ci_validate_pipeline

```typescript
const inputSchema = z.object({
  file: z.string().default('.gitlab-ci.yml'),
  projectId: z.string().optional().describe('GitLab project ID for remote validation'),
});

export const gitlabCIValidatePipeline: MCPTool = {
  name: 'gitlab_ci_validate_pipeline',
  description: 'Validate a GitLab CI pipeline configuration',
  inputSchema,
  handler: async (input) => {
    // Local syntax validation
    const content = await fs.readFile(input.file, 'utf-8');
    const pipeline = yaml.parse(content);

    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for stages
    if (!pipeline.stages || pipeline.stages.length === 0) {
      warnings.push('No stages defined, using default stages');
    }

    // Validate jobs
    const jobNames = Object.keys(pipeline).filter(k =>
      !['stages', 'variables', 'include', 'default', 'workflow'].includes(k)
    );

    for (const jobName of jobNames) {
      const job = pipeline[jobName];

      if (!job.script && !job.trigger && !job.extends) {
        errors.push(`Job '${jobName}' must have a script, trigger, or extends`);
      }

      if (job.stage && pipeline.stages && !pipeline.stages.includes(job.stage)) {
        errors.push(`Job '${jobName}' references undefined stage: ${job.stage}`);
      }

      if (job.needs) {
        for (const need of job.needs) {
          const needName = typeof need === 'string' ? need : need.job;
          if (!jobNames.includes(needName)) {
            errors.push(`Job '${jobName}' needs undefined job: ${needName}`);
          }
        }
      }
    }

    // Remote validation if project ID provided
    if (input.projectId && errors.length === 0) {
      const result = await runCommand('glab', [
        'ci', 'lint',
        '--project', input.projectId,
        input.file,
      ]);

      if (result.exitCode !== 0) {
        errors.push(`GitLab lint failed: ${result.stderr}`);
      }
    }

    return {
      success: errors.length === 0,
      output: errors.length === 0
        ? 'Pipeline configuration is valid'
        : `Validation failed:\n${errors.join('\n')}`,
      metadata: { errors, warnings, jobCount: jobNames.length },
    };
  },
};
```

---

## ArgoCD Tools

### 3.1 argocd_create_application

**File**: `packages/mcp-tools/src/argocd/create-application.ts`

```typescript
const inputSchema = z.object({
  name: z.string().describe('Application name'),
  project: z.string().default('default'),
  repoURL: z.string().describe('Git repository URL'),
  path: z.string().describe('Path to manifests in repo'),
  targetRevision: z.string().default('HEAD'),
  destination: z.object({
    server: z.string().default('https://kubernetes.default.svc'),
    namespace: z.string(),
  }),
  syncPolicy: z.object({
    automated: z.object({
      prune: z.boolean().default(false),
      selfHeal: z.boolean().default(false),
    }).optional(),
    syncOptions: z.array(z.string()).optional(),
  }).optional(),
  helm: z.object({
    valueFiles: z.array(z.string()).optional(),
    values: z.string().optional(),
    parameters: z.array(z.object({
      name: z.string(),
      value: z.string(),
    })).optional(),
  }).optional(),
  kustomize: z.object({
    namePrefix: z.string().optional(),
    nameSuffix: z.string().optional(),
    images: z.array(z.string()).optional(),
  }).optional(),
  outputPath: z.string().optional(),
});

export const argocdCreateApplication: MCPTool = {
  name: 'argocd_create_application',
  description: 'Create an ArgoCD Application manifest',
  inputSchema,
  handler: async (input) => {
    const application = {
      apiVersion: 'argoproj.io/v1alpha1',
      kind: 'Application',
      metadata: {
        name: input.name,
        namespace: 'argocd',
      },
      spec: {
        project: input.project,
        source: {
          repoURL: input.repoURL,
          path: input.path,
          targetRevision: input.targetRevision,
          ...(input.helm && { helm: input.helm }),
          ...(input.kustomize && { kustomize: input.kustomize }),
        },
        destination: input.destination,
        ...(input.syncPolicy && { syncPolicy: input.syncPolicy }),
      },
    };

    const yamlContent = yaml.stringify(application);

    if (input.outputPath) {
      await fs.writeFile(input.outputPath, yamlContent);
    }

    return {
      success: true,
      output: input.outputPath
        ? `Created ArgoCD application: ${input.outputPath}`
        : yamlContent,
      artifacts: input.outputPath ? [{
        type: 'file',
        path: input.outputPath,
        content: yamlContent,
      }] : undefined,
      metadata: {
        applicationName: input.name,
        destination: input.destination,
      },
    };
  },
};
```

### 3.2 argocd_sync

```typescript
const inputSchema = z.object({
  application: z.string().describe('Application name'),
  revision: z.string().optional().describe('Sync to specific revision'),
  prune: z.boolean().optional().describe('Prune resources'),
  dryRun: z.boolean().optional(),
  force: z.boolean().optional(),
});

export const argocdSync: MCPTool = {
  name: 'argocd_sync',
  description: 'Sync an ArgoCD application',
  inputSchema,
  handler: async (input) => {
    const args = ['app', 'sync', input.application];

    if (input.revision) {
      args.push('--revision', input.revision);
    }
    if (input.prune) {
      args.push('--prune');
    }
    if (input.dryRun) {
      args.push('--dry-run');
    }
    if (input.force) {
      args.push('--force');
    }

    const result = await runCommand('argocd', args);

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        application: input.application,
        synced: result.exitCode === 0,
      },
    };
  },
};
```

### 3.3 argocd_get_status

```typescript
const inputSchema = z.object({
  application: z.string().describe('Application name'),
  output: z.enum(['json', 'yaml', 'wide']).optional().default('wide'),
});

export const argocdGetStatus: MCPTool = {
  name: 'argocd_get_status',
  description: 'Get status of an ArgoCD application',
  inputSchema,
  handler: async (input) => {
    const args = ['app', 'get', input.application, '-o', input.output];
    const result = await runCommand('argocd', args);

    if (result.exitCode !== 0) {
      return { success: false, output: '', error: result.stderr };
    }

    let status: any = {};
    if (input.output === 'json') {
      status = JSON.parse(result.stdout);
    }

    return {
      success: true,
      output: result.stdout,
      metadata: {
        application: input.application,
        syncStatus: status.status?.sync?.status,
        healthStatus: status.status?.health?.status,
      },
    };
  },
};
```

---

## Jenkins Tools

### 5.1 jenkinsfile_generate

**File**: `packages/mcp-tools/src/jenkins/jenkinsfile-generate.ts`

```typescript
import { z } from 'zod';

const inputSchema = z.object({
  pipelineType: z.enum(['declarative', 'scripted']).default('declarative'),
  agent: z.object({
    type: z.enum(['any', 'none', 'docker', 'kubernetes', 'label']),
    label: z.string().optional(),
    dockerImage: z.string().optional(),
    kubernetesYaml: z.string().optional(),
  }).default({ type: 'any' }),
  environment: z.record(z.string()).optional(),
  options: z.object({
    timeout: z.number().optional().describe('Timeout in minutes'),
    retry: z.number().optional(),
    timestamps: z.boolean().optional().default(true),
    buildDiscarder: z.object({
      daysToKeep: z.number().optional(),
      numToKeep: z.number().optional(),
    }).optional(),
    disableConcurrentBuilds: z.boolean().optional(),
  }).optional(),
  parameters: z.array(z.object({
    type: z.enum(['string', 'text', 'boolean', 'choice', 'password']),
    name: z.string(),
    defaultValue: z.string().optional(),
    description: z.string().optional(),
    choices: z.array(z.string()).optional(), // For choice type
  })).optional(),
  stages: z.array(z.object({
    name: z.string(),
    when: z.object({
      branch: z.string().optional(),
      environment: z.object({
        name: z.string(),
        value: z.string(),
      }).optional(),
      expression: z.string().optional(),
    }).optional(),
    parallel: z.array(z.object({
      name: z.string(),
      steps: z.array(z.string()),
    })).optional(),
    steps: z.array(z.string()).optional(),
    agent: z.object({
      type: z.enum(['docker', 'kubernetes', 'label']),
      label: z.string().optional(),
      dockerImage: z.string().optional(),
    }).optional(),
  })),
  post: z.object({
    always: z.array(z.string()).optional(),
    success: z.array(z.string()).optional(),
    failure: z.array(z.string()).optional(),
    cleanup: z.array(z.string()).optional(),
  }).optional(),
  outputPath: z.string().default('Jenkinsfile'),
});

export const jenkinsfileGenerate: MCPTool = {
  name: 'jenkinsfile_generate',
  description: 'Generate a Jenkinsfile for CI/CD pipeline',
  inputSchema,
  handler: async (input) => {
    let content = '';

    if (input.pipelineType === 'declarative') {
      content = generateDeclarativePipeline(input);
    } else {
      content = generateScriptedPipeline(input);
    }

    await fs.writeFile(input.outputPath, content);

    return {
      success: true,
      output: `Created Jenkinsfile: ${input.outputPath}`,
      artifacts: [{
        type: 'file',
        path: input.outputPath,
        content,
      }],
      metadata: {
        pipelineType: input.pipelineType,
        stageCount: input.stages.length,
        hasParameters: !!input.parameters?.length,
      },
    };
  },
};

function generateDeclarativePipeline(input: any): string {
  let content = 'pipeline {\n';

  // Agent
  content += generateAgent(input.agent);

  // Environment
  if (input.environment) {
    content += '    environment {\n';
    for (const [key, value] of Object.entries(input.environment)) {
      content += `        ${key} = '${value}'\n`;
    }
    content += '    }\n\n';
  }

  // Options
  if (input.options) {
    content += '    options {\n';
    if (input.options.timestamps) content += '        timestamps()\n';
    if (input.options.timeout) content += `        timeout(time: ${input.options.timeout}, unit: 'MINUTES')\n`;
    if (input.options.retry) content += `        retry(${input.options.retry})\n`;
    if (input.options.disableConcurrentBuilds) content += '        disableConcurrentBuilds()\n';
    if (input.options.buildDiscarder) {
      content += `        buildDiscarder(logRotator(`;
      const parts = [];
      if (input.options.buildDiscarder.daysToKeep) parts.push(`daysToKeepStr: '${input.options.buildDiscarder.daysToKeep}'`);
      if (input.options.buildDiscarder.numToKeep) parts.push(`numToKeepStr: '${input.options.buildDiscarder.numToKeep}'`);
      content += parts.join(', ') + '))\n';
    }
    content += '    }\n\n';
  }

  // Parameters
  if (input.parameters && input.parameters.length > 0) {
    content += '    parameters {\n';
    for (const param of input.parameters) {
      switch (param.type) {
        case 'string':
          content += `        string(name: '${param.name}', defaultValue: '${param.defaultValue || ''}', description: '${param.description || ''}')\n`;
          break;
        case 'boolean':
          content += `        booleanParam(name: '${param.name}', defaultValue: ${param.defaultValue || 'false'}, description: '${param.description || ''}')\n`;
          break;
        case 'choice':
          content += `        choice(name: '${param.name}', choices: ['${param.choices?.join("', '") || ''}'], description: '${param.description || ''}')\n`;
          break;
        case 'text':
          content += `        text(name: '${param.name}', defaultValue: '${param.defaultValue || ''}', description: '${param.description || ''}')\n`;
          break;
        case 'password':
          content += `        password(name: '${param.name}', defaultValue: '${param.defaultValue || ''}', description: '${param.description || ''}')\n`;
          break;
      }
    }
    content += '    }\n\n';
  }

  // Stages
  content += '    stages {\n';
  for (const stage of input.stages) {
    content += generateStage(stage);
  }
  content += '    }\n\n';

  // Post actions
  if (input.post) {
    content += '    post {\n';
    if (input.post.always) {
      content += '        always {\n';
      for (const step of input.post.always) {
        content += `            ${step}\n`;
      }
      content += '        }\n';
    }
    if (input.post.success) {
      content += '        success {\n';
      for (const step of input.post.success) {
        content += `            ${step}\n`;
      }
      content += '        }\n';
    }
    if (input.post.failure) {
      content += '        failure {\n';
      for (const step of input.post.failure) {
        content += `            ${step}\n`;
      }
      content += '        }\n';
    }
    if (input.post.cleanup) {
      content += '        cleanup {\n';
      for (const step of input.post.cleanup) {
        content += `            ${step}\n`;
      }
      content += '        }\n';
    }
    content += '    }\n';
  }

  content += '}\n';
  return content;
}

function generateAgent(agent: any): string {
  let content = '    agent ';
  switch (agent.type) {
    case 'any':
      content += 'any\n\n';
      break;
    case 'none':
      content += 'none\n\n';
      break;
    case 'label':
      content += `{ label '${agent.label}' }\n\n`;
      break;
    case 'docker':
      content += `{\n        docker { image '${agent.dockerImage}' }\n    }\n\n`;
      break;
    case 'kubernetes':
      content += `{\n        kubernetes {\n            yaml '''\n${agent.kubernetesYaml}\n            '''\n        }\n    }\n\n`;
      break;
  }
  return content;
}

function generateStage(stage: any): string {
  let content = `        stage('${stage.name}') {\n`;

  // When condition
  if (stage.when) {
    content += '            when {\n';
    if (stage.when.branch) {
      content += `                branch '${stage.when.branch}'\n`;
    }
    if (stage.when.environment) {
      content += `                environment name: '${stage.when.environment.name}', value: '${stage.when.environment.value}'\n`;
    }
    if (stage.when.expression) {
      content += `                expression { ${stage.when.expression} }\n`;
    }
    content += '            }\n';
  }

  // Stage-specific agent
  if (stage.agent) {
    content += generateAgent(stage.agent).replace('    agent', '            agent');
  }

  // Parallel stages
  if (stage.parallel && stage.parallel.length > 0) {
    content += '            parallel {\n';
    for (const parallelStage of stage.parallel) {
      content += `                stage('${parallelStage.name}') {\n`;
      content += '                    steps {\n';
      for (const step of parallelStage.steps) {
        content += `                        ${step}\n`;
      }
      content += '                    }\n';
      content += '                }\n';
    }
    content += '            }\n';
  } else if (stage.steps) {
    // Regular steps
    content += '            steps {\n';
    for (const step of stage.steps) {
      content += `                ${step}\n`;
    }
    content += '            }\n';
  }

  content += '        }\n';
  return content;
}

function generateScriptedPipeline(input: any): string {
  let content = 'node';
  if (input.agent?.label) {
    content += `('${input.agent.label}')`;
  }
  content += ' {\n';

  // Environment
  if (input.environment) {
    content += '    withEnv([\n';
    const envPairs = Object.entries(input.environment)
      .map(([k, v]) => `        "${k}=${v}"`);
    content += envPairs.join(',\n') + '\n';
    content += '    ]) {\n';
  }

  // Stages
  for (const stage of input.stages) {
    content += `    stage('${stage.name}') {\n`;
    if (stage.steps) {
      for (const step of stage.steps) {
        content += `        ${step}\n`;
      }
    }
    content += '    }\n';
  }

  if (input.environment) {
    content += '    }\n';
  }

  content += '}\n';
  return content;
}
```

### 5.2 jenkins_pipeline_validate

**File**: `packages/mcp-tools/src/jenkins/pipeline-validate.ts`

```typescript
const inputSchema = z.object({
  file: z.string().default('Jenkinsfile'),
  jenkinsUrl: z.string().optional().describe('Jenkins server URL for remote validation'),
  credentialsId: z.string().optional().describe('Jenkins credentials ID for auth'),
});

export const jenkinsPipelineValidate: MCPTool = {
  name: 'jenkins_pipeline_validate',
  description: 'Validate a Jenkinsfile syntax',
  inputSchema,
  handler: async (input) => {
    const content = await fs.readFile(input.file, 'utf-8');
    const errors: string[] = [];
    const warnings: string[] = [];

    // Local syntax validation
    const syntaxErrors = validateJenkinsfileSyntax(content);
    errors.push(...syntaxErrors);

    // Check for common issues
    if (!content.includes('pipeline {') && !content.includes('node')) {
      errors.push('Jenkinsfile must contain a pipeline {} block (declarative) or node {} block (scripted)');
    }

    // Declarative pipeline checks
    if (content.includes('pipeline {')) {
      if (!content.includes('agent ')) {
        errors.push('Declarative pipeline must specify an agent');
      }
      if (!content.includes('stages {')) {
        errors.push('Declarative pipeline must have stages block');
      }
      if (!content.includes('stage(')) {
        errors.push('Pipeline must have at least one stage');
      }

      // Check for deprecated syntax
      if (content.includes('$class:')) {
        warnings.push('Consider using native step syntax instead of $class');
      }
    }

    // Remote validation if Jenkins URL provided
    if (input.jenkinsUrl && errors.length === 0) {
      try {
        const remoteResult = await validateRemote(
          input.jenkinsUrl,
          content,
          input.credentialsId
        );
        if (!remoteResult.valid) {
          errors.push(...remoteResult.errors);
        }
      } catch (e: any) {
        warnings.push(`Remote validation failed: ${e.message}`);
      }
    }

    return {
      success: errors.length === 0,
      output: errors.length === 0
        ? 'Jenkinsfile syntax is valid'
        : `Validation failed:\n${errors.join('\n')}`,
      metadata: {
        errors,
        warnings,
        pipelineType: content.includes('pipeline {') ? 'declarative' : 'scripted',
      },
    };
  },
};

function validateJenkinsfileSyntax(content: string): string[] {
  const errors: string[] = [];

  // Check balanced braces
  let braceCount = 0;
  for (const char of content) {
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
    if (braceCount < 0) {
      errors.push('Unbalanced braces: extra closing brace');
      break;
    }
  }
  if (braceCount > 0) {
    errors.push(`Unbalanced braces: ${braceCount} unclosed opening brace(s)`);
  }

  // Check balanced parentheses
  let parenCount = 0;
  for (const char of content) {
    if (char === '(') parenCount++;
    if (char === ')') parenCount--;
  }
  if (parenCount !== 0) {
    errors.push('Unbalanced parentheses');
  }

  // Check for common Groovy syntax issues
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for missing quotes in strings
    if (line.includes('sh ') && !line.includes("'") && !line.includes('"') && !line.includes('"""')) {
      if (!line.includes('script:')) {
        errors.push(`Line ${i + 1}: sh command may need quotes around the command`);
      }
    }
  }

  return errors;
}

async function validateRemote(
  jenkinsUrl: string,
  content: string,
  credentialsId?: string
): Promise<{ valid: boolean; errors: string[] }> {
  // Use Jenkins Pipeline Linter API
  const linterUrl = `${jenkinsUrl}/pipeline-model-converter/validate`;

  const response = await fetch(linterUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(credentialsId && { 'Authorization': `Basic ${credentialsId}` }),
    },
    body: `jenkinsfile=${encodeURIComponent(content)}`,
  });

  const result = await response.text();

  if (result.includes('Errors encountered')) {
    return {
      valid: false,
      errors: [result],
    };
  }

  return { valid: true, errors: [] };
}
```

### 5.3 jenkins_job_create

**File**: `packages/mcp-tools/src/jenkins/job-create.ts`

```typescript
const inputSchema = z.object({
  name: z.string().describe('Job name'),
  type: z.enum(['pipeline', 'freestyle', 'multibranch']),
  jenkinsUrl: z.string().describe('Jenkins server URL'),
  credentialsId: z.string().describe('Jenkins credentials ID'),
  description: z.string().optional(),
  // Pipeline-specific options
  pipeline: z.object({
    script: z.string().optional().describe('Inline Jenkinsfile content'),
    scmUrl: z.string().optional().describe('Git repository URL'),
    branch: z.string().optional().default('*/main'),
    scriptPath: z.string().optional().default('Jenkinsfile'),
    credentialsId: z.string().optional().describe('SCM credentials'),
  }).optional(),
  // Build triggers
  triggers: z.object({
    scmPoll: z.string().optional().describe('Cron expression for SCM polling'),
    cron: z.string().optional().describe('Cron expression for timed builds'),
    githubPush: z.boolean().optional(),
  }).optional(),
  // Parameters
  parameters: z.array(z.object({
    type: z.enum(['string', 'boolean', 'choice']),
    name: z.string(),
    defaultValue: z.string().optional(),
    description: z.string().optional(),
    choices: z.array(z.string()).optional(),
  })).optional(),
});

export const jenkinsJobCreate: MCPTool = {
  name: 'jenkins_job_create',
  description: 'Create a Jenkins job',
  inputSchema,
  handler: async (input) => {
    // Generate job config XML
    const configXml = generateJobConfigXml(input);

    // Create job via Jenkins API
    const result = await fetch(
      `${input.jenkinsUrl}/createItem?name=${encodeURIComponent(input.name)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          'Authorization': `Basic ${input.credentialsId}`,
        },
        body: configXml,
      }
    );

    if (!result.ok) {
      const error = await result.text();
      return {
        success: false,
        output: '',
        error: `Failed to create job: ${error}`,
      };
    }

    return {
      success: true,
      output: `Created Jenkins job: ${input.name}`,
      metadata: {
        jobName: input.name,
        jobType: input.type,
        url: `${input.jenkinsUrl}/job/${encodeURIComponent(input.name)}`,
      },
    };
  },
};

function generateJobConfigXml(input: any): string {
  if (input.type === 'pipeline') {
    return generatePipelineJobXml(input);
  } else if (input.type === 'multibranch') {
    return generateMultibranchJobXml(input);
  }
  return generateFreestyleJobXml(input);
}

function generatePipelineJobXml(input: any): string {
  const pipeline = input.pipeline || {};

  let xml = `<?xml version='1.1' encoding='UTF-8'?>
<flow-definition plugin="workflow-job">
  <description>${input.description || ''}</description>
  <keepDependencies>false</keepDependencies>
  <properties>`;

  // Parameters
  if (input.parameters && input.parameters.length > 0) {
    xml += `
    <hudson.model.ParametersDefinitionProperty>
      <parameterDefinitions>`;
    for (const param of input.parameters) {
      xml += generateParameterXml(param);
    }
    xml += `
      </parameterDefinitions>
    </hudson.model.ParametersDefinitionProperty>`;
  }

  xml += `
  </properties>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition" plugin="workflow-cps">`;

  if (pipeline.script) {
    xml += `
    <script><![CDATA[${pipeline.script}]]></script>
    <sandbox>true</sandbox>`;
  }

  xml += `
  </definition>
  <triggers>`;

  // Triggers
  if (input.triggers?.scmPoll) {
    xml += `
    <hudson.triggers.SCMTrigger>
      <spec>${input.triggers.scmPoll}</spec>
    </hudson.triggers.SCMTrigger>`;
  }
  if (input.triggers?.cron) {
    xml += `
    <hudson.triggers.TimerTrigger>
      <spec>${input.triggers.cron}</spec>
    </hudson.triggers.TimerTrigger>`;
  }

  xml += `
  </triggers>
  <disabled>false</disabled>
</flow-definition>`;

  return xml;
}

function generateParameterXml(param: any): string {
  switch (param.type) {
    case 'string':
      return `
        <hudson.model.StringParameterDefinition>
          <name>${param.name}</name>
          <description>${param.description || ''}</description>
          <defaultValue>${param.defaultValue || ''}</defaultValue>
        </hudson.model.StringParameterDefinition>`;
    case 'boolean':
      return `
        <hudson.model.BooleanParameterDefinition>
          <name>${param.name}</name>
          <description>${param.description || ''}</description>
          <defaultValue>${param.defaultValue === 'true'}</defaultValue>
        </hudson.model.BooleanParameterDefinition>`;
    case 'choice':
      return `
        <hudson.model.ChoiceParameterDefinition>
          <name>${param.name}</name>
          <description>${param.description || ''}</description>
          <choices class="java.util.Arrays$ArrayList">
            <a class="string-array">
              ${param.choices?.map((c: string) => `<string>${c}</string>`).join('\n              ') || ''}
            </a>
          </choices>
        </hudson.model.ChoiceParameterDefinition>`;
    default:
      return '';
  }
}

function generateMultibranchJobXml(input: any): string {
  // Multibranch pipeline XML generation
  return `<?xml version='1.1' encoding='UTF-8'?>
<org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject plugin="workflow-multibranch">
  <description>${input.description || ''}</description>
  <properties/>
  <folderViews class="jenkins.branch.MultiBranchProjectViewHolder" plugin="branch-api"/>
  <healthMetrics/>
  <icon class="jenkins.branch.MetadataActionFolderIcon" plugin="branch-api"/>
  <orphanedItemStrategy class="com.cloudbees.hudson.plugins.folder.computed.DefaultOrphanedItemStrategy" plugin="cloudbees-folder">
    <pruneDeadBranches>true</pruneDeadBranches>
    <daysToKeep>-1</daysToKeep>
    <numToKeep>-1</numToKeep>
  </orphanedItemStrategy>
  <triggers/>
  <disabled>false</disabled>
  <sources class="jenkins.branch.MultiBranchProject$BranchSourceList" plugin="branch-api">
    <data>
      <jenkins.branch.BranchSource>
        <source class="jenkins.plugins.git.GitSCMSource" plugin="git">
          <remote>${input.pipeline?.scmUrl || ''}</remote>
          <credentialsId>${input.pipeline?.credentialsId || ''}</credentialsId>
        </source>
      </jenkins.branch.BranchSource>
    </data>
  </sources>
  <factory class="org.jenkinsci.plugins.workflow.multibranch.WorkflowBranchProjectFactory">
    <owner class="org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject" reference="../.."/>
    <scriptPath>${input.pipeline?.scriptPath || 'Jenkinsfile'}</scriptPath>
  </factory>
</org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject>`;
}

function generateFreestyleJobXml(input: any): string {
  return `<?xml version='1.1' encoding='UTF-8'?>
<project>
  <description>${input.description || ''}</description>
  <keepDependencies>false</keepDependencies>
  <properties/>
  <scm class="hudson.scm.NullSCM"/>
  <canRoam>true</canRoam>
  <disabled>false</disabled>
  <blockBuildWhenDownstreamBuilding>false</blockBuildWhenDownstreamBuilding>
  <blockBuildWhenUpstreamBuilding>false</blockBuildWhenUpstreamBuilding>
  <triggers/>
  <concurrentBuild>false</concurrentBuild>
  <builders/>
  <publishers/>
  <buildWrappers/>
</project>`;
}
```

### 5.4 jenkins_job_trigger

**File**: `packages/mcp-tools/src/jenkins/job-trigger.ts`

```typescript
const inputSchema = z.object({
  name: z.string().describe('Job name'),
  jenkinsUrl: z.string().describe('Jenkins server URL'),
  credentialsId: z.string().describe('Jenkins credentials ID'),
  parameters: z.record(z.string()).optional().describe('Build parameters'),
  cause: z.string().optional().describe('Build cause/reason'),
});

export const jenkinsJobTrigger: MCPTool = {
  name: 'jenkins_job_trigger',
  description: 'Trigger a Jenkins job build',
  inputSchema,
  handler: async (input) => {
    let url = `${input.jenkinsUrl}/job/${encodeURIComponent(input.name)}`;

    if (input.parameters && Object.keys(input.parameters).length > 0) {
      url += '/buildWithParameters?';
      const params = new URLSearchParams(input.parameters);
      url += params.toString();
    } else {
      url += '/build';
    }

    const result = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${input.credentialsId}`,
      },
    });

    if (!result.ok) {
      const error = await result.text();
      return {
        success: false,
        output: '',
        error: `Failed to trigger build: ${error}`,
      };
    }

    // Get queue item location from response header
    const queueLocation = result.headers.get('Location');

    return {
      success: true,
      output: `Build triggered for job: ${input.name}`,
      metadata: {
        jobName: input.name,
        queueUrl: queueLocation,
        parameters: input.parameters,
      },
    };
  },
};
```

### 5.5 jenkins_job_status

**File**: `packages/mcp-tools/src/jenkins/job-status.ts`

```typescript
const inputSchema = z.object({
  name: z.string().describe('Job name'),
  jenkinsUrl: z.string().describe('Jenkins server URL'),
  credentialsId: z.string().describe('Jenkins credentials ID'),
  buildNumber: z.number().optional().describe('Specific build number (default: lastBuild)'),
});

export const jenkinsJobStatus: MCPTool = {
  name: 'jenkins_job_status',
  description: 'Get status of a Jenkins job/build',
  inputSchema,
  handler: async (input) => {
    const buildRef = input.buildNumber ? String(input.buildNumber) : 'lastBuild';
    const url = `${input.jenkinsUrl}/job/${encodeURIComponent(input.name)}/${buildRef}/api/json`;

    const result = await fetch(url, {
      headers: {
        'Authorization': `Basic ${input.credentialsId}`,
      },
    });

    if (!result.ok) {
      if (result.status === 404) {
        return {
          success: true,
          output: 'No builds found for this job',
          metadata: { jobName: input.name, noBuild: true },
        };
      }
      const error = await result.text();
      return {
        success: false,
        output: '',
        error: `Failed to get job status: ${error}`,
      };
    }

    const buildInfo = await result.json();

    return {
      success: true,
      output: formatBuildStatus(buildInfo),
      metadata: {
        jobName: input.name,
        buildNumber: buildInfo.number,
        result: buildInfo.result,
        building: buildInfo.building,
        duration: buildInfo.duration,
        timestamp: buildInfo.timestamp,
        url: buildInfo.url,
      },
    };
  },
};

function formatBuildStatus(build: any): string {
  const status = build.building ? 'IN PROGRESS' : (build.result || 'UNKNOWN');
  const duration = build.duration ? `${Math.round(build.duration / 1000)}s` : 'N/A';
  const startTime = new Date(build.timestamp).toISOString();

  return `Build #${build.number}
Status: ${status}
Started: ${startTime}
Duration: ${duration}
URL: ${build.url}`;
}
```

### 5.6 jenkins_job_logs

**File**: `packages/mcp-tools/src/jenkins/job-logs.ts`

```typescript
const inputSchema = z.object({
  name: z.string().describe('Job name'),
  jenkinsUrl: z.string().describe('Jenkins server URL'),
  credentialsId: z.string().describe('Jenkins credentials ID'),
  buildNumber: z.number().optional().describe('Build number (default: lastBuild)'),
  tail: z.number().optional().describe('Number of lines from end'),
});

export const jenkinsJobLogs: MCPTool = {
  name: 'jenkins_job_logs',
  description: 'Get console output/logs from a Jenkins build',
  inputSchema,
  handler: async (input) => {
    const buildRef = input.buildNumber ? String(input.buildNumber) : 'lastBuild';
    const url = `${input.jenkinsUrl}/job/${encodeURIComponent(input.name)}/${buildRef}/consoleText`;

    const result = await fetch(url, {
      headers: {
        'Authorization': `Basic ${input.credentialsId}`,
      },
    });

    if (!result.ok) {
      const error = await result.text();
      return {
        success: false,
        output: '',
        error: `Failed to get logs: ${error}`,
      };
    }

    let logs = await result.text();

    // Tail logs if requested
    if (input.tail) {
      const lines = logs.split('\n');
      logs = lines.slice(-input.tail).join('\n');
    }

    return {
      success: true,
      output: logs,
      metadata: {
        jobName: input.name,
        buildNumber: buildRef,
        lineCount: logs.split('\n').length,
      },
    };
  },
};
```

---

## Monitoring Tools

### 4.1 prometheus_generate_rules

**File**: `packages/mcp-tools/src/monitoring/prometheus-rules.ts`

```typescript
const inputSchema = z.object({
  name: z.string().describe('Rule group name'),
  rules: z.array(z.object({
    alert: z.string().describe('Alert name'),
    expr: z.string().describe('PromQL expression'),
    for: z.string().optional().describe('Duration (e.g., 5m)'),
    labels: z.record(z.string()).optional(),
    annotations: z.object({
      summary: z.string(),
      description: z.string().optional(),
      runbook_url: z.string().optional(),
    }),
  })),
  outputPath: z.string().optional(),
});

export const prometheusGenerateRules: MCPTool = {
  name: 'prometheus_generate_rules',
  description: 'Generate Prometheus alerting rules',
  inputSchema,
  handler: async (input) => {
    const rulesConfig = {
      groups: [{
        name: input.name,
        rules: input.rules.map(rule => ({
          alert: rule.alert,
          expr: rule.expr,
          ...(rule.for && { for: rule.for }),
          labels: {
            severity: rule.labels?.severity || 'warning',
            ...rule.labels,
          },
          annotations: rule.annotations,
        })),
      }],
    };

    const yamlContent = yaml.stringify(rulesConfig);

    if (input.outputPath) {
      await fs.writeFile(input.outputPath, yamlContent);
    }

    return {
      success: true,
      output: input.outputPath
        ? `Created Prometheus rules: ${input.outputPath}`
        : yamlContent,
      artifacts: input.outputPath ? [{
        type: 'file',
        path: input.outputPath,
        content: yamlContent,
      }] : undefined,
      metadata: {
        groupName: input.name,
        ruleCount: input.rules.length,
      },
    };
  },
};
```

### 4.2 prometheus_validate_rules

```typescript
const inputSchema = z.object({
  file: z.string().describe('Path to rules file'),
});

export const prometheusValidateRules: MCPTool = {
  name: 'prometheus_validate_rules',
  description: 'Validate Prometheus alerting rules',
  inputSchema,
  handler: async (input) => {
    // Use promtool for validation
    const result = await runCommand('promtool', ['check', 'rules', input.file]);

    return {
      success: result.exitCode === 0,
      output: result.exitCode === 0
        ? 'Rules are valid'
        : result.stderr,
      error: result.exitCode !== 0 ? result.stderr : undefined,
    };
  },
};
```

### 4.3 grafana_create_dashboard

**File**: `packages/mcp-tools/src/monitoring/grafana-dashboard.ts`

```typescript
const inputSchema = z.object({
  title: z.string().describe('Dashboard title'),
  uid: z.string().optional(),
  tags: z.array(z.string()).optional(),
  refresh: z.string().optional().default('30s'),
  panels: z.array(z.object({
    title: z.string(),
    type: z.enum(['graph', 'stat', 'gauge', 'table', 'timeseries', 'heatmap']),
    gridPos: z.object({
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
    }),
    targets: z.array(z.object({
      expr: z.string().describe('PromQL expression'),
      legendFormat: z.string().optional(),
      refId: z.string(),
    })),
    fieldConfig: z.object({
      defaults: z.object({
        unit: z.string().optional(),
        thresholds: z.object({
          mode: z.enum(['absolute', 'percentage']),
          steps: z.array(z.object({
            color: z.string(),
            value: z.number().nullable(),
          })),
        }).optional(),
      }).optional(),
    }).optional(),
  })),
  templating: z.object({
    list: z.array(z.object({
      name: z.string(),
      type: z.enum(['query', 'custom', 'constant', 'datasource']),
      query: z.string().optional(),
      options: z.array(z.object({
        text: z.string(),
        value: z.string(),
      })).optional(),
    })),
  }).optional(),
  outputPath: z.string().optional(),
});

export const grafanaCreateDashboard: MCPTool = {
  name: 'grafana_create_dashboard',
  description: 'Create a Grafana dashboard JSON',
  inputSchema,
  handler: async (input) => {
    const dashboard = {
      id: null,
      uid: input.uid || generateUID(),
      title: input.title,
      tags: input.tags || [],
      refresh: input.refresh,
      schemaVersion: 38,
      version: 1,
      panels: input.panels.map((panel, index) => ({
        id: index + 1,
        title: panel.title,
        type: panel.type,
        gridPos: panel.gridPos,
        targets: panel.targets,
        datasource: { type: 'prometheus', uid: '${DS_PROMETHEUS}' },
        fieldConfig: panel.fieldConfig || { defaults: {}, overrides: [] },
        options: getDefaultOptions(panel.type),
      })),
      templating: input.templating || { list: [] },
      time: { from: 'now-1h', to: 'now' },
      timepicker: {},
    };

    const jsonContent = JSON.stringify(dashboard, null, 2);

    if (input.outputPath) {
      await fs.writeFile(input.outputPath, jsonContent);
    }

    return {
      success: true,
      output: input.outputPath
        ? `Created Grafana dashboard: ${input.outputPath}`
        : jsonContent,
      artifacts: input.outputPath ? [{
        type: 'file',
        path: input.outputPath,
        content: jsonContent,
      }] : undefined,
      metadata: {
        dashboardTitle: input.title,
        panelCount: input.panels.length,
        uid: dashboard.uid,
      },
    };
  },
};

function getDefaultOptions(type: string): Record<string, any> {
  const defaults: Record<string, any> = {
    timeseries: { legend: { displayMode: 'list', placement: 'bottom' } },
    stat: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false } },
    gauge: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false } },
    table: { showHeader: true },
  };
  return defaults[type] || {};
}
```

### 4.4 alertmanager_create_config

**File**: `packages/mcp-tools/src/monitoring/alertmanager-config.ts`

```typescript
const inputSchema = z.object({
  global: z.object({
    smtp_smarthost: z.string().optional(),
    smtp_from: z.string().optional(),
    slack_api_url: z.string().optional(),
    pagerduty_url: z.string().optional(),
  }).optional(),
  route: z.object({
    receiver: z.string(),
    group_by: z.array(z.string()).optional(),
    group_wait: z.string().optional(),
    group_interval: z.string().optional(),
    repeat_interval: z.string().optional(),
    routes: z.array(z.object({
      match: z.record(z.string()).optional(),
      match_re: z.record(z.string()).optional(),
      receiver: z.string(),
      continue: z.boolean().optional(),
    })).optional(),
  }),
  receivers: z.array(z.object({
    name: z.string(),
    slack_configs: z.array(z.object({
      channel: z.string(),
      send_resolved: z.boolean().optional(),
      title: z.string().optional(),
      text: z.string().optional(),
    })).optional(),
    pagerduty_configs: z.array(z.object({
      service_key: z.string(),
      severity: z.string().optional(),
    })).optional(),
    email_configs: z.array(z.object({
      to: z.string(),
      send_resolved: z.boolean().optional(),
    })).optional(),
  })),
  inhibit_rules: z.array(z.object({
    source_match: z.record(z.string()),
    target_match: z.record(z.string()),
    equal: z.array(z.string()),
  })).optional(),
  outputPath: z.string().optional(),
});

export const alertmanagerCreateConfig: MCPTool = {
  name: 'alertmanager_create_config',
  description: 'Create AlertManager configuration',
  inputSchema,
  handler: async (input) => {
    const config = {
      global: input.global,
      route: input.route,
      receivers: input.receivers,
      inhibit_rules: input.inhibit_rules,
    };

    const yamlContent = yaml.stringify(config);

    if (input.outputPath) {
      await fs.writeFile(input.outputPath, yamlContent);
    }

    return {
      success: true,
      output: input.outputPath
        ? `Created AlertManager config: ${input.outputPath}`
        : yamlContent,
      artifacts: input.outputPath ? [{
        type: 'file',
        path: input.outputPath,
        content: yamlContent,
      }] : undefined,
      metadata: {
        receiverCount: input.receivers.length,
        routeCount: (input.route.routes?.length || 0) + 1,
      },
    };
  },
};
```

---

## Project Structure

```
packages/mcp-tools/src/
├── github/
│   ├── create-workflow.ts
│   ├── validate-workflow.ts
│   ├── list-workflows.ts
│   └── trigger-workflow.ts
├── gitlab/
│   ├── create-pipeline.ts
│   ├── validate-pipeline.ts
│   └── trigger-pipeline.ts
├── jenkins/
│   ├── jenkinsfile-generate.ts
│   ├── pipeline-validate.ts
│   ├── job-create.ts
│   ├── job-trigger.ts
│   ├── job-status.ts
│   ├── job-logs.ts
│   └── index.ts
├── argocd/
│   ├── create-application.ts
│   ├── create-appset.ts
│   ├── sync.ts
│   ├── rollback.ts
│   └── get-status.ts
├── monitoring/
│   ├── prometheus-rules.ts
│   ├── prometheus-query.ts
│   ├── grafana-dashboard.ts
│   ├── grafana-import.ts
│   └── alertmanager-config.ts
└── index.ts
```

---

## User Stories

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-100 | As a user, I want to generate GitHub Actions workflows | Valid workflow YAML generated | Sprint 7-8 |
| US-101 | As a user, I want to generate GitLab CI pipelines | Valid .gitlab-ci.yml generated | Sprint 7-8 |
| US-102 | As a user, I want to set up ArgoCD applications | ArgoCD manifests generated | Sprint 7-8 |
| US-103 | As a user, I want to generate Prometheus alerting rules | Valid rule YAML generated | Sprint 9-10 |
| US-104 | As a user, I want to create Grafana dashboards | Dashboard JSON generated | Sprint 9-10 |
| US-105 | As a user, I want to configure AlertManager | Config YAML generated | Sprint 9-10 |
| US-106 | As a user, I want to generate Jenkinsfiles | Valid Jenkinsfile generated | Sprint 7-8 |
| US-107 | As a user, I want to validate Jenkinsfiles | Syntax errors detected | Sprint 7-8 |
| US-108 | As a user, I want to create Jenkins jobs via API | Jobs created in Jenkins | Sprint 9-10 |
| US-109 | As a user, I want to trigger Jenkins builds | Builds triggered with params | Sprint 9-10 |
| US-110 | As a user, I want to check Jenkins build status | Build status retrieved | Sprint 9-10 |
| US-111 | As a user, I want to view Jenkins build logs | Console output retrieved | Sprint 9-10 |

---

## Sprint Breakdown

### Sprint 7-8 (Weeks 1-4)

| Task | Effort | Deliverable |
|------|--------|-------------|
| GitHub Actions tools | 4 days | Create, validate, list workflows |
| GitLab CI tools | 3 days | Create, validate pipelines |
| ArgoCD tools | 4 days | Application, sync, status tools |
| Jenkins Jenkinsfile generation | 2 days | Declarative/scripted pipeline generation |
| Jenkins pipeline validation | 1 day | Local and remote syntax validation |
| Integration tests | 3 days | All CI/CD tools tested |

### Sprint 9-10 (Weeks 5-8)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Prometheus tools | 3 days | Rules generation, validation |
| Grafana tools | 4 days | Dashboard generation, import |
| AlertManager tools | 2 days | Config generation |
| Jenkins job management | 3 days | Create, trigger, status, logs |
| Documentation | 2 days | Tool documentation |

---

## Acceptance Criteria

- [ ] GitHub Actions workflow creation and validation working
- [ ] GitLab CI pipeline creation and validation working
- [ ] ArgoCD application management working
- [ ] Prometheus rules generation and validation working
- [ ] Grafana dashboard JSON generation working
- [ ] AlertManager config generation working
- [ ] Jenkins Jenkinsfile generation (declarative and scripted) working
- [ ] Jenkins pipeline validation (local and remote) working
- [ ] Jenkins job creation via API working
- [ ] Jenkins build triggering with parameters working
- [ ] Jenkins build status and logs retrieval working
- [ ] All tools have comprehensive input validation
- [ ] All tools return structured metadata

---

*Document Version: 1.0*
*Last Updated: January 2026*
