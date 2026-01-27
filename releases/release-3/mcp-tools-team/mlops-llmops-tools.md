# MCP Tools Team - Release 3 Specification

> **Team**: MCP Tools Team
> **Phase**: Release 3 (Months 7-9)
> **Dependencies**: Core Engine, LLM Integration Team

---

## Overview

In Release 3, the MCP Tools Team implements MLOps and LLMOps tools to support machine learning model deployment, training pipelines, LLM infrastructure management, and ML monitoring.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MLOps / LLMOps Tool Layer                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Model Deployment                       │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────────┐  │   │
│  │  │SageMaker│  │Vertex AI│  │ KServe  │  │  BentoML  │  │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └───────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Training Pipelines                      │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────────────────────┐ │   │
│  │  │Kubeflow │  │  MLflow │  │    SageMaker Pipelines  │ │   │
│  │  └─────────┘  └─────────┘  └─────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  LLM Infrastructure                      │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────────┐  │   │
│  │  │  vLLM   │  │   TGI   │  │  Ollama │  │   Triton  │  │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └───────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   ML Monitoring                          │   │
│  │  ┌───────────┐  ┌─────────────┐  ┌───────────────────┐ │   │
│  │  │ Evidently │  │  WhyLabs    │  │  Custom Metrics   │ │   │
│  │  └───────────┘  └─────────────┘  └───────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Model Deployment Tools

### 1. SageMaker Tools

**File**: `packages/mcp-tools/src/mlops/sagemaker.ts`

```typescript
import { z } from 'zod';

// Deploy a model to SageMaker endpoint
const deployModelSchema = z.object({
  modelName: z.string().describe('Name for the model'),
  modelData: z.string().describe('S3 URI to model artifacts'),
  image: z.string().describe('Docker image URI for inference'),
  instanceType: z.string().default('ml.m5.large'),
  instanceCount: z.number().default(1),
  endpointName: z.string().describe('Name for the endpoint'),
  variants: z.array(z.object({
    name: z.string(),
    weight: z.number(),
    instanceType: z.string().optional(),
  })).optional(),
  autoScaling: z.object({
    minCapacity: z.number(),
    maxCapacity: z.number(),
    targetValue: z.number().describe('Target invocations per instance'),
  }).optional(),
  serverlessConfig: z.object({
    memorySizeInMB: z.number(),
    maxConcurrency: z.number(),
  }).optional(),
  tags: z.record(z.string()).optional(),
});

export const sagemakerDeployModel: MCPTool = {
  name: 'sagemaker_deploy_model',
  description: 'Deploy a machine learning model to SageMaker endpoint',
  inputSchema: deployModelSchema,
  handler: async (input) => {
    const args = ['sagemaker'];

    // Create model
    const createModelArgs = [
      'create-model',
      '--model-name', input.modelName,
      '--primary-container', JSON.stringify({
        Image: input.image,
        ModelDataUrl: input.modelData,
      }),
      '--execution-role-arn', '${SAGEMAKER_EXECUTION_ROLE}',
    ];

    let result = await runCommand('aws', [...args, ...createModelArgs]);
    if (result.exitCode !== 0) {
      return { success: false, output: '', error: result.stderr };
    }

    // Create endpoint config
    const endpointConfigName = `${input.endpointName}-config`;
    const variants = input.variants || [{
      name: 'primary',
      weight: 1,
      instanceType: input.instanceType,
    }];

    const productionVariants = variants.map(v => ({
      VariantName: v.name,
      ModelName: input.modelName,
      InitialInstanceCount: input.instanceCount,
      InstanceType: v.instanceType || input.instanceType,
      InitialVariantWeight: v.weight,
      ...(input.serverlessConfig && {
        ServerlessConfig: {
          MemorySizeInMB: input.serverlessConfig.memorySizeInMB,
          MaxConcurrency: input.serverlessConfig.maxConcurrency,
        },
      }),
    }));

    const createConfigArgs = [
      'create-endpoint-config',
      '--endpoint-config-name', endpointConfigName,
      '--production-variants', JSON.stringify(productionVariants),
    ];

    result = await runCommand('aws', [...args, ...createConfigArgs]);
    if (result.exitCode !== 0) {
      return { success: false, output: '', error: result.stderr };
    }

    // Create endpoint
    const createEndpointArgs = [
      'create-endpoint',
      '--endpoint-name', input.endpointName,
      '--endpoint-config-name', endpointConfigName,
    ];

    if (input.tags) {
      createEndpointArgs.push('--tags', JSON.stringify(
        Object.entries(input.tags).map(([k, v]) => ({ Key: k, Value: v }))
      ));
    }

    result = await runCommand('aws', [...args, ...createEndpointArgs]);

    return {
      success: result.exitCode === 0,
      output: result.exitCode === 0
        ? `Endpoint ${input.endpointName} created. Status: Creating`
        : '',
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        modelName: input.modelName,
        endpointName: input.endpointName,
        endpointConfigName,
      },
    };
  },
};

// Get endpoint status
const getEndpointSchema = z.object({
  endpointName: z.string(),
});

export const sagemakerGetEndpoint: MCPTool = {
  name: 'sagemaker_get_endpoint',
  description: 'Get SageMaker endpoint status and details',
  inputSchema: getEndpointSchema,
  handler: async (input) => {
    const result = await runCommand('aws', [
      'sagemaker', 'describe-endpoint',
      '--endpoint-name', input.endpointName,
      '--output', 'json',
    ]);

    if (result.exitCode !== 0) {
      return { success: false, output: '', error: result.stderr };
    }

    const endpoint = JSON.parse(result.stdout);

    return {
      success: true,
      output: formatEndpointStatus(endpoint),
      metadata: {
        status: endpoint.EndpointStatus,
        creationTime: endpoint.CreationTime,
        lastModifiedTime: endpoint.LastModifiedTime,
        productionVariants: endpoint.ProductionVariants,
      },
    };
  },
};

// Invoke endpoint
const invokeEndpointSchema = z.object({
  endpointName: z.string(),
  body: z.string().describe('JSON payload'),
  contentType: z.string().default('application/json'),
});

export const sagemakerInvoke: MCPTool = {
  name: 'sagemaker_invoke',
  description: 'Invoke a SageMaker endpoint for inference',
  inputSchema: invokeEndpointSchema,
  handler: async (input) => {
    const result = await runCommand('aws', [
      'sagemaker-runtime', 'invoke-endpoint',
      '--endpoint-name', input.endpointName,
      '--body', input.body,
      '--content-type', input.contentType,
      '/dev/stdout',
    ]);

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined,
    };
  },
};
```

### 2. KServe Tools

**File**: `packages/mcp-tools/src/mlops/kserve.ts`

```typescript
const deployInferenceServiceSchema = z.object({
  name: z.string().describe('Service name'),
  namespace: z.string().default('default'),
  predictor: z.object({
    framework: z.enum(['sklearn', 'tensorflow', 'pytorch', 'xgboost', 'triton', 'custom']),
    storageUri: z.string().describe('Model storage URI (s3://, gs://, etc.)'),
    runtimeVersion: z.string().optional(),
    resources: z.object({
      requests: z.object({
        cpu: z.string().optional(),
        memory: z.string().optional(),
        'nvidia.com/gpu': z.string().optional(),
      }).optional(),
      limits: z.object({
        cpu: z.string().optional(),
        memory: z.string().optional(),
        'nvidia.com/gpu': z.string().optional(),
      }).optional(),
    }).optional(),
  }),
  transformer: z.object({
    image: z.string(),
    resources: z.object({
      requests: z.object({ cpu: z.string(), memory: z.string() }).optional(),
    }).optional(),
  }).optional(),
  explainer: z.object({
    type: z.enum(['alibi', 'art']),
    storageUri: z.string().optional(),
  }).optional(),
  canaryTrafficPercent: z.number().optional(),
  minReplicas: z.number().default(1),
  maxReplicas: z.number().default(3),
});

export const kserveDeployService: MCPTool = {
  name: 'kserve_deploy_service',
  description: 'Deploy an inference service using KServe',
  inputSchema: deployInferenceServiceSchema,
  handler: async (input) => {
    const inferenceService = {
      apiVersion: 'serving.kserve.io/v1beta1',
      kind: 'InferenceService',
      metadata: {
        name: input.name,
        namespace: input.namespace,
      },
      spec: {
        predictor: buildPredictorSpec(input.predictor),
        ...(input.transformer && { transformer: buildTransformerSpec(input.transformer) }),
        ...(input.explainer && { explainer: buildExplainerSpec(input.explainer) }),
      },
    };

    const yamlContent = yaml.stringify(inferenceService);

    const result = await runCommand('kubectl', [
      'apply', '-f', '-',
      '-n', input.namespace,
    ], undefined, yamlContent);

    return {
      success: result.exitCode === 0,
      output: result.exitCode === 0
        ? `InferenceService ${input.name} deployed`
        : result.stderr,
      artifacts: [{
        type: 'file',
        path: `kserve/${input.name}.yaml`,
        content: yamlContent,
      }],
      metadata: {
        serviceName: input.name,
        namespace: input.namespace,
        framework: input.predictor.framework,
      },
    };
  },
};

function buildPredictorSpec(predictor: any): any {
  const frameworkMap: Record<string, string> = {
    sklearn: 'sklearn',
    tensorflow: 'tensorflow',
    pytorch: 'pytorch',
    xgboost: 'xgboost',
    triton: 'triton',
  };

  if (predictor.framework === 'custom') {
    return {
      containers: [{
        image: predictor.storageUri,
        resources: predictor.resources,
      }],
    };
  }

  return {
    [frameworkMap[predictor.framework]]: {
      storageUri: predictor.storageUri,
      runtimeVersion: predictor.runtimeVersion,
      resources: predictor.resources,
    },
  };
}

// Get inference service status
const getServiceSchema = z.object({
  name: z.string(),
  namespace: z.string().default('default'),
});

export const kserveGetService: MCPTool = {
  name: 'kserve_get_service',
  description: 'Get KServe inference service status',
  inputSchema: getServiceSchema,
  handler: async (input) => {
    const result = await runCommand('kubectl', [
      'get', 'inferenceservice', input.name,
      '-n', input.namespace,
      '-o', 'json',
    ]);

    if (result.exitCode !== 0) {
      return { success: false, output: '', error: result.stderr };
    }

    const service = JSON.parse(result.stdout);
    const status = service.status || {};

    return {
      success: true,
      output: formatKServeStatus(service),
      metadata: {
        ready: status.conditions?.find((c: any) => c.type === 'Ready')?.status === 'True',
        url: status.url,
        traffic: status.traffic,
        components: status.components,
      },
    };
  },
};
```

---

## Training Pipeline Tools

### 3. Kubeflow Pipelines Tools

**File**: `packages/mcp-tools/src/mlops/kubeflow.ts`

```typescript
const createPipelineSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  pipelineFile: z.string().describe('Path to pipeline YAML or Python file'),
  namespace: z.string().default('kubeflow'),
});

export const kubeflowCreatePipeline: MCPTool = {
  name: 'kubeflow_create_pipeline',
  description: 'Create a Kubeflow pipeline',
  inputSchema: createPipelineSchema,
  handler: async (input) => {
    // Upload pipeline
    const result = await runCommand('kfp', [
      'pipeline', 'create',
      '--pipeline-name', input.name,
      '--description', input.description || '',
      input.pipelineFile,
    ]);

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        pipelineName: input.name,
      },
    };
  },
};

const runPipelineSchema = z.object({
  pipelineName: z.string(),
  runName: z.string(),
  experimentName: z.string().default('Default'),
  parameters: z.record(z.string()).optional(),
  namespace: z.string().default('kubeflow'),
});

export const kubeflowRunPipeline: MCPTool = {
  name: 'kubeflow_run_pipeline',
  description: 'Run a Kubeflow pipeline',
  inputSchema: runPipelineSchema,
  handler: async (input) => {
    const args = [
      'run', 'submit',
      '--pipeline-name', input.pipelineName,
      '--run-name', input.runName,
      '--experiment-name', input.experimentName,
    ];

    if (input.parameters) {
      for (const [key, value] of Object.entries(input.parameters)) {
        args.push('--parameter', `${key}=${value}`);
      }
    }

    const result = await runCommand('kfp', args);

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        runName: input.runName,
        experimentName: input.experimentName,
      },
    };
  },
};

const getRunStatusSchema = z.object({
  runId: z.string(),
  namespace: z.string().default('kubeflow'),
});

export const kubeflowGetRunStatus: MCPTool = {
  name: 'kubeflow_get_run',
  description: 'Get Kubeflow pipeline run status',
  inputSchema: getRunStatusSchema,
  handler: async (input) => {
    const result = await runCommand('kfp', [
      'run', 'get',
      '--run-id', input.runId,
    ]);

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined,
    };
  },
};
```

### 4. MLflow Tools

**File**: `packages/mcp-tools/src/mlops/mlflow.ts`

```typescript
const registerModelSchema = z.object({
  name: z.string().describe('Model name in registry'),
  source: z.string().describe('Model artifact URI'),
  runId: z.string().optional().describe('MLflow run ID'),
  tags: z.record(z.string()).optional(),
  description: z.string().optional(),
});

export const mlflowRegisterModel: MCPTool = {
  name: 'mlflow_register_model',
  description: 'Register a model in MLflow Model Registry',
  inputSchema: registerModelSchema,
  handler: async (input) => {
    // Using MLflow CLI
    const args = [
      'models', 'register',
      '--name', input.name,
      '--source', input.source,
    ];

    if (input.runId) {
      args.push('--run-id', input.runId);
    }

    const result = await runCommand('mlflow', args);

    return {
      success: result.exitCode === 0,
      output: result.exitCode === 0
        ? `Model ${input.name} registered successfully`
        : result.stderr,
      metadata: {
        modelName: input.name,
        source: input.source,
      },
    };
  },
};

const transitionModelStageSchema = z.object({
  name: z.string(),
  version: z.string(),
  stage: z.enum(['Staging', 'Production', 'Archived']),
  archiveExistingVersions: z.boolean().default(false),
});

export const mlflowTransitionStage: MCPTool = {
  name: 'mlflow_transition_stage',
  description: 'Transition model version to a new stage',
  inputSchema: transitionModelStageSchema,
  handler: async (input) => {
    const args = [
      'models', 'transition-stage',
      '--name', input.name,
      '--version', input.version,
      '--stage', input.stage,
    ];

    if (input.archiveExistingVersions) {
      args.push('--archive-existing-versions');
    }

    const result = await runCommand('mlflow', args);

    return {
      success: result.exitCode === 0,
      output: result.exitCode === 0
        ? `Model ${input.name} v${input.version} transitioned to ${input.stage}`
        : result.stderr,
      metadata: {
        modelName: input.name,
        version: input.version,
        stage: input.stage,
      },
    };
  },
};

const serveModelSchema = z.object({
  modelUri: z.string().describe('Model URI (models:/name/version or runs:/id/path)'),
  port: z.number().default(5000),
  host: z.string().default('0.0.0.0'),
  workers: z.number().default(1),
  noCondaDeps: z.boolean().default(false),
});

export const mlflowServeModel: MCPTool = {
  name: 'mlflow_serve_model',
  description: 'Serve a model using MLflow model serving',
  inputSchema: serveModelSchema,
  handler: async (input) => {
    const args = [
      'models', 'serve',
      '--model-uri', input.modelUri,
      '--port', String(input.port),
      '--host', input.host,
      '--workers', String(input.workers),
    ];

    if (input.noCondaDeps) {
      args.push('--no-conda');
    }

    // Run in background
    const result = await runCommand('mlflow', args, undefined, undefined, { background: true });

    return {
      success: true,
      output: `MLflow model server started on ${input.host}:${input.port}`,
      metadata: {
        modelUri: input.modelUri,
        endpoint: `http://${input.host}:${input.port}/invocations`,
      },
    };
  },
};
```

---

## LLM Infrastructure Tools

### 5. vLLM Tools

**File**: `packages/mcp-tools/src/llmops/vllm.ts`

```typescript
const deployVLLMSchema = z.object({
  name: z.string().describe('Deployment name'),
  namespace: z.string().default('default'),
  model: z.string().describe('HuggingFace model ID'),
  replicas: z.number().default(1),
  gpu: z.object({
    type: z.string().default('nvidia.com/gpu'),
    count: z.number().default(1),
  }),
  tensorParallelSize: z.number().optional(),
  maxModelLen: z.number().optional(),
  quantization: z.enum(['awq', 'gptq', 'squeezellm', 'none']).optional(),
  resources: z.object({
    memory: z.string().default('32Gi'),
    cpu: z.string().default('4'),
  }).optional(),
  serviceType: z.enum(['ClusterIP', 'LoadBalancer', 'NodePort']).default('ClusterIP'),
});

export const vllmDeploy: MCPTool = {
  name: 'vllm_deploy',
  description: 'Deploy a vLLM server for LLM inference',
  inputSchema: deployVLLMSchema,
  handler: async (input) => {
    const deployment = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: input.name,
        namespace: input.namespace,
      },
      spec: {
        replicas: input.replicas,
        selector: { matchLabels: { app: input.name } },
        template: {
          metadata: { labels: { app: input.name } },
          spec: {
            containers: [{
              name: 'vllm',
              image: 'vllm/vllm-openai:latest',
              args: [
                '--model', input.model,
                ...(input.tensorParallelSize ? ['--tensor-parallel-size', String(input.tensorParallelSize)] : []),
                ...(input.maxModelLen ? ['--max-model-len', String(input.maxModelLen)] : []),
                ...(input.quantization && input.quantization !== 'none' ? ['--quantization', input.quantization] : []),
              ],
              ports: [{ containerPort: 8000 }],
              resources: {
                limits: {
                  [input.gpu.type]: String(input.gpu.count),
                  memory: input.resources?.memory || '32Gi',
                  cpu: input.resources?.cpu || '4',
                },
              },
              env: [
                { name: 'HF_TOKEN', valueFrom: { secretKeyRef: { name: 'hf-token', key: 'token', optional: true } } },
              ],
            }],
          },
        },
      },
    };

    const service = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: input.name,
        namespace: input.namespace,
      },
      spec: {
        type: input.serviceType,
        selector: { app: input.name },
        ports: [{ port: 8000, targetPort: 8000 }],
      },
    };

    const yamlContent = yaml.stringify(deployment) + '---\n' + yaml.stringify(service);

    const result = await runCommand('kubectl', ['apply', '-f', '-'], undefined, yamlContent);

    return {
      success: result.exitCode === 0,
      output: result.exitCode === 0
        ? `vLLM deployment ${input.name} created`
        : result.stderr,
      artifacts: [{
        type: 'file',
        path: `vllm/${input.name}.yaml`,
        content: yamlContent,
      }],
      metadata: {
        deploymentName: input.name,
        model: input.model,
        endpoint: `http://${input.name}.${input.namespace}:8000/v1`,
      },
    };
  },
};
```

### 6. Text Generation Inference (TGI) Tools

**File**: `packages/mcp-tools/src/llmops/tgi.ts`

```typescript
const deployTGISchema = z.object({
  name: z.string(),
  namespace: z.string().default('default'),
  model: z.string().describe('HuggingFace model ID'),
  replicas: z.number().default(1),
  gpu: z.object({
    type: z.string().default('nvidia.com/gpu'),
    count: z.number().default(1),
  }),
  quantize: z.enum(['bitsandbytes', 'bitsandbytes-nf4', 'bitsandbytes-fp4', 'gptq', 'awq', 'none']).optional(),
  maxInputLength: z.number().default(1024),
  maxTotalTokens: z.number().default(2048),
  maxBatchPrefillTokens: z.number().optional(),
  shardedModel: z.boolean().default(false),
  numShard: z.number().optional(),
});

export const tgiDeploy: MCPTool = {
  name: 'tgi_deploy',
  description: 'Deploy Text Generation Inference server',
  inputSchema: deployTGISchema,
  handler: async (input) => {
    const args = [
      '--model-id', input.model,
      '--max-input-length', String(input.maxInputLength),
      '--max-total-tokens', String(input.maxTotalTokens),
    ];

    if (input.quantize && input.quantize !== 'none') {
      args.push('--quantize', input.quantize);
    }

    if (input.shardedModel) {
      args.push('--sharded', 'true');
      if (input.numShard) {
        args.push('--num-shard', String(input.numShard));
      }
    }

    const deployment = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: input.name,
        namespace: input.namespace,
      },
      spec: {
        replicas: input.replicas,
        selector: { matchLabels: { app: input.name } },
        template: {
          metadata: { labels: { app: input.name } },
          spec: {
            containers: [{
              name: 'tgi',
              image: 'ghcr.io/huggingface/text-generation-inference:latest',
              args,
              ports: [{ containerPort: 80 }],
              resources: {
                limits: {
                  [input.gpu.type]: String(input.gpu.count),
                  memory: '32Gi',
                },
              },
              env: [
                { name: 'HUGGING_FACE_HUB_TOKEN', valueFrom: { secretKeyRef: { name: 'hf-token', key: 'token', optional: true } } },
              ],
              volumeMounts: [
                { name: 'model-cache', mountPath: '/data' },
                { name: 'shm', mountPath: '/dev/shm' },
              ],
            }],
            volumes: [
              { name: 'model-cache', persistentVolumeClaim: { claimName: `${input.name}-cache` } },
              { name: 'shm', emptyDir: { medium: 'Memory', sizeLimit: '1Gi' } },
            ],
          },
        },
      },
    };

    const service = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: input.name, namespace: input.namespace },
      spec: {
        selector: { app: input.name },
        ports: [{ port: 80, targetPort: 80 }],
      },
    };

    const pvc = {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: { name: `${input.name}-cache`, namespace: input.namespace },
      spec: {
        accessModes: ['ReadWriteOnce'],
        resources: { requests: { storage: '100Gi' } },
      },
    };

    const yamlContent = [deployment, service, pvc].map(r => yaml.stringify(r)).join('---\n');

    const result = await runCommand('kubectl', ['apply', '-f', '-'], undefined, yamlContent);

    return {
      success: result.exitCode === 0,
      output: result.exitCode === 0
        ? `TGI deployment ${input.name} created`
        : result.stderr,
      artifacts: [{
        type: 'file',
        path: `tgi/${input.name}.yaml`,
        content: yamlContent,
      }],
      metadata: {
        deploymentName: input.name,
        model: input.model,
        endpoint: `http://${input.name}.${input.namespace}`,
      },
    };
  },
};
```

---

## ML Monitoring Tools

### 7. Evidently Tools

**File**: `packages/mcp-tools/src/mlops/evidently.ts`

```typescript
const generateReportSchema = z.object({
  referenceData: z.string().describe('Path to reference dataset (CSV/Parquet)'),
  currentData: z.string().describe('Path to current dataset'),
  reportType: z.enum(['data_drift', 'data_quality', 'target_drift', 'classification', 'regression']),
  columnMapping: z.object({
    target: z.string().optional(),
    prediction: z.string().optional(),
    datetime: z.string().optional(),
    numericalFeatures: z.array(z.string()).optional(),
    categoricalFeatures: z.array(z.string()).optional(),
  }).optional(),
  outputPath: z.string().default('./reports'),
  outputFormat: z.enum(['html', 'json']).default('html'),
});

export const evidentlyGenerateReport: MCPTool = {
  name: 'evidently_generate_report',
  description: 'Generate ML monitoring report with Evidently',
  inputSchema: generateReportSchema,
  handler: async (input) => {
    // Generate Python script for Evidently
    const pythonScript = `
import pandas as pd
from evidently import ColumnMapping
from evidently.report import Report
from evidently.metric_preset import ${getPresetImport(input.reportType)}

reference = pd.read_csv("${input.referenceData}") if "${input.referenceData}".endswith('.csv') else pd.read_parquet("${input.referenceData}")
current = pd.read_csv("${input.currentData}") if "${input.currentData}".endswith('.csv') else pd.read_parquet("${input.currentData}")

column_mapping = ColumnMapping(
    target=${input.columnMapping?.target ? `"${input.columnMapping.target}"` : 'None'},
    prediction=${input.columnMapping?.prediction ? `"${input.columnMapping.prediction}"` : 'None'},
    datetime=${input.columnMapping?.datetime ? `"${input.columnMapping.datetime}"` : 'None'},
    numerical_features=${input.columnMapping?.numericalFeatures ? JSON.stringify(input.columnMapping.numericalFeatures) : 'None'},
    categorical_features=${input.columnMapping?.categoricalFeatures ? JSON.stringify(input.columnMapping.categoricalFeatures) : 'None'},
)

report = Report(metrics=[${getPresetClass(input.reportType)}()])
report.run(reference_data=reference, current_data=current, column_mapping=column_mapping)

report.save_${input.outputFormat}("${input.outputPath}/report.${input.outputFormat}")
print("Report generated successfully")
`;

    // Write and execute script
    const scriptPath = '/tmp/evidently_report.py';
    await fs.writeFile(scriptPath, pythonScript);

    const result = await runCommand('python', [scriptPath]);

    return {
      success: result.exitCode === 0,
      output: result.exitCode === 0
        ? `Report generated at ${input.outputPath}/report.${input.outputFormat}`
        : result.stderr,
      artifacts: [{
        type: 'file',
        path: `${input.outputPath}/report.${input.outputFormat}`,
      }],
      metadata: {
        reportType: input.reportType,
        outputPath: input.outputPath,
      },
    };
  },
};

function getPresetImport(reportType: string): string {
  const imports: Record<string, string> = {
    data_drift: 'DataDriftPreset',
    data_quality: 'DataQualityPreset',
    target_drift: 'TargetDriftPreset',
    classification: 'ClassificationPreset',
    regression: 'RegressionPreset',
  };
  return imports[reportType];
}

function getPresetClass(reportType: string): string {
  return getPresetImport(reportType) + '()';
}

// Deploy Evidently UI
const deployEvidentlyUISchema = z.object({
  name: z.string().default('evidently-ui'),
  namespace: z.string().default('monitoring'),
  workspacePath: z.string().describe('Path to Evidently workspace'),
  serviceType: z.enum(['ClusterIP', 'LoadBalancer', 'NodePort']).default('ClusterIP'),
});

export const evidentlyDeployUI: MCPTool = {
  name: 'evidently_deploy_ui',
  description: 'Deploy Evidently UI service',
  inputSchema: deployEvidentlyUISchema,
  handler: async (input) => {
    const deployment = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: input.name, namespace: input.namespace },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: input.name } },
        template: {
          metadata: { labels: { app: input.name } },
          spec: {
            containers: [{
              name: 'evidently',
              image: 'evidentlyai/evidently-ui:latest',
              ports: [{ containerPort: 8000 }],
              env: [
                { name: 'EVIDENTLY_WORKSPACE', value: input.workspacePath },
              ],
              volumeMounts: [
                { name: 'workspace', mountPath: input.workspacePath },
              ],
            }],
            volumes: [
              { name: 'workspace', persistentVolumeClaim: { claimName: `${input.name}-workspace` } },
            ],
          },
        },
      },
    };

    const yamlContent = yaml.stringify(deployment);
    const result = await runCommand('kubectl', ['apply', '-f', '-'], undefined, yamlContent);

    return {
      success: result.exitCode === 0,
      output: result.exitCode === 0 ? `Evidently UI deployed` : result.stderr,
      metadata: { deploymentName: input.name },
    };
  },
};
```

---

## Project Structure

```
packages/mcp-tools/src/
├── mlops/
│   ├── sagemaker.ts         # AWS SageMaker tools
│   ├── vertex-ai.ts         # Google Vertex AI tools
│   ├── kserve.ts            # KServe tools
│   ├── bentoml.ts           # BentoML tools
│   ├── kubeflow.ts          # Kubeflow Pipelines tools
│   ├── mlflow.ts            # MLflow tools
│   └── evidently.ts         # Evidently monitoring
├── llmops/
│   ├── vllm.ts              # vLLM deployment
│   ├── tgi.ts               # Text Generation Inference
│   ├── ollama.ts            # Ollama K8s deployment
│   └── triton.ts            # NVIDIA Triton server
└── index.ts
```

---

## User Stories

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-200 | As an ML engineer, I want to deploy models to SageMaker | Endpoint creation works | Sprint 13-14 |
| US-201 | As an ML engineer, I want to deploy models to KServe | InferenceService created | Sprint 13-14 |
| US-202 | As an ML engineer, I want to run Kubeflow pipelines | Pipeline runs execute | Sprint 13-14 |
| US-203 | As an ML engineer, I want to manage MLflow models | Model registry operations work | Sprint 13-14 |
| US-204 | As an ML engineer, I want to deploy vLLM for LLM serving | vLLM deployment works | Sprint 15-16 |
| US-205 | As an ML engineer, I want to monitor model drift | Evidently reports generated | Sprint 15-16 |

---

## Sprint Breakdown

### Sprint 13-14 (Weeks 1-4)

| Task | Effort | Deliverable |
|------|--------|-------------|
| SageMaker tools | 4 days | Deploy, invoke, status |
| KServe tools | 3 days | Deploy, scale, status |
| Kubeflow tools | 3 days | Pipeline CRUD |
| MLflow tools | 3 days | Registry, serve |

### Sprint 15-16 (Weeks 5-8)

| Task | Effort | Deliverable |
|------|--------|-------------|
| vLLM deployment tools | 3 days | K8s deployment |
| TGI deployment tools | 2 days | K8s deployment |
| Evidently tools | 3 days | Reports, UI |
| Integration tests | 3 days | All tools tested |

---

## Acceptance Criteria

- [ ] SageMaker model deployment and invocation working
- [ ] KServe InferenceService deployment working
- [ ] Kubeflow pipeline creation and execution working
- [ ] MLflow model registry operations working
- [ ] vLLM Kubernetes deployment working
- [ ] TGI Kubernetes deployment working
- [ ] Evidently drift reports generated
- [ ] All tools have proper error handling

---

*Document Version: 1.0*
*Last Updated: January 2026*
