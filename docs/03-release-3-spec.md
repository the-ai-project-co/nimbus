# Nimbus Release 3 Specification

> **Phase 3: Paid Customers & Revenue**
> **Timeline: Months 7-9 (12 weeks)**
> **Team: 3-4 developers (expanding)**
>
> **Architecture**: Microservices with Bun Runtime
> **Package Manager**: Bun (v1.0+)
> **Communication**: REST APIs + WebSocket Streaming
> **Deployment**: Local (Bun) → Staging (Docker Compose) → Production (Kubernetes)
> **Services**: 15+ microservices (adding MLOps/LLMOps services)
>
> _Last Updated: January 2026 | Version 2.0_

---

## Executive Summary

Release 3 transforms Nimbus from a free beta tool into a revenue-generating product. The focus is on MLOps/LLMOps capabilities (the key differentiator), enterprise features (SSO, audit logs), team collaboration, and cost optimization tools. This release targets enterprise pilots and establishes the first paying customers.

### Release 3 Goals
1. First 10+ paying customers
2. $10K+ Monthly Recurring Revenue (MRR)
3. 2+ enterprise pilot programs
4. MLOps/LLMOps differentiation
5. Team collaboration features

---

## New Features

### 1. MLOps: Model Deployment & Management

#### 1.1 AWS SageMaker Support

```bash
$ nimbus mlops deploy

  ╭─ ML Model Deployment ────────────────────────────────────╮
  │                                                          │
  │  Step 1 of 5: Platform                                   │
  │                                                          │
  │  Where do you want to deploy?                            │
  │                                                          │
  │  › AWS SageMaker                                         │
  │    Google Vertex AI                                      │
  │    Azure ML                                              │
  │    Kubernetes (KServe/Seldon)                           │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

**Supported SageMaker Operations**:
```bash
# Endpoint Management
nimbus mlops sagemaker endpoints list
nimbus mlops sagemaker endpoints create --model my-model --instance ml.m5.large
nimbus mlops sagemaker endpoints update --name my-endpoint --instance ml.m5.xlarge
nimbus mlops sagemaker endpoints delete --name my-endpoint

# Model Registry
nimbus mlops sagemaker models list
nimbus mlops sagemaker models register --name my-model --artifact s3://...
nimbus mlops sagemaker models describe --name my-model

# Training Jobs
nimbus mlops sagemaker training list
nimbus mlops sagemaker training create --config training.yaml
nimbus mlops sagemaker training logs --job my-training-job

# Conversational
You: Deploy my PyTorch model to SageMaker with auto-scaling

Nimbus: I'll set up a SageMaker endpoint with auto-scaling.

        Configuration:
        ┌─────────────────────────────────────────────────────┐
        │ Endpoint: my-model-endpoint                         │
        │ Instance: ml.m5.large (2 vCPU, 8GB RAM)            │
        │ Initial Count: 1                                    │
        │ Auto-scaling: 1-5 instances                         │
        │ Scale-out: CPU > 70% for 3 minutes                 │
        │ Scale-in: CPU < 30% for 10 minutes                 │
        │                                                     │
        │ Estimated Cost: $0.115/hour (~$83/month base)      │
        └─────────────────────────────────────────────────────┘

        Generated:
        ✓ terraform/sagemaker-endpoint.tf
        ✓ terraform/sagemaker-model.tf
        ✓ terraform/auto-scaling.tf
        ✓ scripts/deploy-model.sh

        [Deploy Now] [View Files] [Modify Config]
```

#### 1.2 Google Vertex AI Support

```bash
$ nimbus mlops vertex deploy --model gs://my-bucket/model

  Deploying to Vertex AI...

  ✓ Created Model: projects/my-project/models/my-model
  ✓ Created Endpoint: projects/my-project/endpoints/my-endpoint
  ✓ Deployed Model to Endpoint

  Endpoint URL: https://us-central1-aiplatform.googleapis.com/v1/...

  Test with:
  $ curl -X POST $ENDPOINT_URL \
      -H "Authorization: Bearer $(gcloud auth print-access-token)" \
      -H "Content-Type: application/json" \
      -d '{"instances": [{"input": "test"}]}'
```

#### 1.3 Kubernetes ML Serving (KServe/Seldon)

```bash
$ nimbus mlops generate kserve

  ╭─ KServe Configuration ───────────────────────────────────╮
  │                                                          │
  │  Model Configuration                                     │
  │                                                          │
  │  Model Name: sentiment-model                             │
  │  Framework: PyTorch                                      │
  │  Model URI: s3://models/sentiment/v1                     │
  │                                                          │
  │  Serving Configuration                                   │
  │                                                          │
  │  Runtime: triton                                         │
  │  GPU: nvidia.com/gpu: 1                                  │
  │  Min Replicas: 1                                         │
  │  Max Replicas: 5                                         │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯

  Generated:
  ✓ kserve/inference-service.yaml
  ✓ kserve/transformer.yaml (optional preprocessing)
  ✓ kserve/hpa.yaml (horizontal pod autoscaler)
  ✓ kserve/pdb.yaml (pod disruption budget)
```

**Generated InferenceService**:
```yaml
apiVersion: serving.kserve.io/v1beta1
kind: InferenceService
metadata:
  name: sentiment-model
  annotations:
    sidecar.istio.io/inject: "true"
spec:
  predictor:
    pytorch:
      storageUri: s3://models/sentiment/v1
      resources:
        limits:
          nvidia.com/gpu: 1
          memory: 8Gi
        requests:
          cpu: 2
          memory: 4Gi
    minReplicas: 1
    maxReplicas: 5
    scaleTarget: 10
    scaleMetric: concurrency
```

#### 1.4 User Stories

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| US-200 | As an MLOps engineer, I want to deploy models to SageMaker | End-to-end deployment working |
| US-201 | As an MLOps engineer, I want to manage model endpoints | CRUD operations on endpoints |
| US-202 | As an MLOps engineer, I want auto-scaling for my models | Auto-scaling configured correctly |
| US-203 | As an MLOps engineer, I want to deploy to Kubernetes | KServe manifests generated |
| US-204 | As an MLOps engineer, I want cost estimates for ML infra | Cost shown before deployment |

---

### 2. MLOps: Training Pipelines

#### 2.1 Kubeflow Pipelines

```bash
$ nimbus mlops generate kubeflow-pipeline

  ╭─ Kubeflow Pipeline Generator ────────────────────────────╮
  │                                                          │
  │  Pipeline Type:                                          │
  │                                                          │
  │  › Training Pipeline                                     │
  │    Inference Pipeline                                    │
  │    Feature Engineering Pipeline                          │
  │    Full ML Pipeline (data → train → deploy)             │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯

  Generated:
  ✓ pipelines/training_pipeline.py
  ✓ pipelines/components/data_prep.py
  ✓ pipelines/components/train.py
  ✓ pipelines/components/evaluate.py
  ✓ pipelines/components/deploy.py
  ✓ pipelines/pipeline.yaml (compiled)
```

**Generated Pipeline**:
```python
# pipelines/training_pipeline.py
from kfp import dsl
from kfp.dsl import component, pipeline

@component(base_image='python:3.9')
def data_preparation(
    input_path: str,
    output_path: str,
):
    # Data preparation logic
    pass

@component(base_image='pytorch/pytorch:2.0-cuda11.7')
def train_model(
    data_path: str,
    model_path: str,
    epochs: int = 10,
    learning_rate: float = 0.001,
):
    # Training logic
    pass

@component(base_image='python:3.9')
def evaluate_model(
    model_path: str,
    test_data_path: str,
) -> float:
    # Evaluation logic
    return accuracy

@pipeline(name='training-pipeline')
def training_pipeline(
    input_data: str,
    model_name: str,
):
    data_prep = data_preparation(input_path=input_data)
    train = train_model(data_path=data_prep.output)
    evaluate = evaluate_model(model_path=train.output)
```

#### 2.2 MLflow Integration

```bash
$ nimbus mlops mlflow setup

  ╭─ MLflow Setup ───────────────────────────────────────────╮
  │                                                          │
  │  Deployment Target:                                      │
  │                                                          │
  │  › Kubernetes (Helm)                                     │
  │    AWS (ECS + RDS + S3)                                  │
  │    GCP (Cloud Run + Cloud SQL + GCS)                     │
  │    Docker Compose (local/dev)                            │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯

  Generated:
  ✓ mlflow/helm-values.yaml
  ✓ mlflow/terraform/main.tf (backend infrastructure)
  ✓ mlflow/terraform/rds.tf (PostgreSQL for tracking)
  ✓ mlflow/terraform/s3.tf (artifact storage)
  ✓ scripts/mlflow-setup.sh
```

**Conversational**:
```bash
You: Set up MLflow with PostgreSQL backend and S3 artifact store

Nimbus: I'll configure MLflow with production-ready storage.

        Architecture:
        ┌─────────────────────────────────────────────────────┐
        │                   MLflow Server                      │
        │              (Kubernetes / 2 replicas)              │
        │                        │                            │
        │         ┌──────────────┼──────────────┐            │
        │         ▼              ▼              ▼            │
        │   ┌──────────┐  ┌──────────┐  ┌──────────┐        │
        │   │ PostgreSQL│  │    S3    │  │  Redis   │        │
        │   │ (tracking)│  │(artifacts)│  │ (cache)  │        │
        │   └──────────┘  └──────────┘  └──────────┘        │
        └─────────────────────────────────────────────────────┘

        Components:
        • MLflow Server: 2 replicas, 2 vCPU, 4GB RAM
        • PostgreSQL: db.t3.medium, 100GB storage
        • S3 Bucket: mlflow-artifacts-{account-id}
        • Redis: cache.t3.micro (optional caching)

        Estimated Cost: ~$150/month

        [Deploy] [View Terraform] [Customize]
```

---

### 3. LLMOps: LLM Infrastructure

#### 3.1 vLLM Deployment

```bash
$ nimbus llmops deploy vllm

  ╭─ vLLM Deployment ────────────────────────────────────────╮
  │                                                          │
  │  Model Selection:                                        │
  │                                                          │
  │  › meta-llama/Llama-3.2-8B-Instruct                     │
  │    mistralai/Mistral-7B-Instruct-v0.2                   │
  │    Custom Model (provide HuggingFace path)              │
  │                                                          │
  │  Infrastructure:                                         │
  │                                                          │
  │  GPU Type: › NVIDIA A10G                                │
  │            NVIDIA A100 (40GB)                           │
  │            NVIDIA H100                                   │
  │                                                          │
  │  Replicas: 2                                            │
  │  Max Concurrent Requests: 100                           │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯

  Generated:
  ✓ kubernetes/vllm-deployment.yaml
  ✓ kubernetes/vllm-service.yaml
  ✓ kubernetes/vllm-hpa.yaml
  ✓ kubernetes/vllm-pvc.yaml (model cache)
  ✓ terraform/gpu-node-pool.tf
```

**Generated Deployment**:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vllm-llama
spec:
  replicas: 2
  selector:
    matchLabels:
      app: vllm-llama
  template:
    metadata:
      labels:
        app: vllm-llama
    spec:
      containers:
        - name: vllm
          image: vllm/vllm-openai:latest
          args:
            - --model=meta-llama/Llama-3.2-8B-Instruct
            - --tensor-parallel-size=1
            - --max-model-len=4096
            - --gpu-memory-utilization=0.9
          ports:
            - containerPort: 8000
          resources:
            limits:
              nvidia.com/gpu: 1
              memory: 24Gi
            requests:
              nvidia.com/gpu: 1
              memory: 16Gi
          volumeMounts:
            - name: model-cache
              mountPath: /root/.cache/huggingface
      volumes:
        - name: model-cache
          persistentVolumeClaim:
            claimName: vllm-model-cache
      nodeSelector:
        cloud.google.com/gke-accelerator: nvidia-tesla-a10g
      tolerations:
        - key: nvidia.com/gpu
          operator: Exists
          effect: NoSchedule
```

#### 3.2 Text Generation Inference (TGI)

```bash
You: Deploy Mistral-7B using TGI with 3 replicas for production

Nimbus: I'll set up TGI for Mistral-7B with production configuration.

        Deployment Configuration:
        ┌─────────────────────────────────────────────────────┐
        │ Model: mistralai/Mistral-7B-Instruct-v0.2          │
        │ Runtime: Text Generation Inference (TGI)           │
        │ Replicas: 3                                         │
        │ GPU: NVIDIA A10G per replica                       │
        │ Max Batch Size: 32                                  │
        │ Max Input Length: 4096                              │
        │ Max Total Tokens: 8192                              │
        └─────────────────────────────────────────────────────┘

        Features Enabled:
        ✓ Continuous batching
        ✓ Flash Attention 2
        ✓ Quantization: bitsandbytes (8-bit)
        ✓ Prometheus metrics endpoint
        ✓ Health checks

        Estimated Cost:
        • 3x g5.xlarge (A10G): $1.006/hr × 3 = $3.02/hr
        • Monthly (730 hrs): ~$2,200

        [Deploy] [View Manifests] [Reduce Cost]
```

#### 3.3 Ollama on Kubernetes

```bash
$ nimbus llmops generate ollama

  Generated Ollama deployment for Kubernetes:

  ✓ kubernetes/ollama-deployment.yaml
  ✓ kubernetes/ollama-service.yaml
  ✓ kubernetes/ollama-configmap.yaml
  ✓ kubernetes/ollama-pvc.yaml (model storage)

  Pre-pulled models:
  • llama3.2:8b
  • codellama:13b
  • mistral:7b

  Endpoint: http://ollama.default.svc.cluster.local:11434
```

#### 3.4 User Stories

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| US-210 | As an LLMOps engineer, I want to deploy vLLM | vLLM deployment with GPU working |
| US-211 | As an LLMOps engineer, I want to deploy TGI | TGI deployment with batching |
| US-212 | As an LLMOps engineer, I want GPU auto-scaling | HPA based on GPU metrics |
| US-213 | As an LLMOps engineer, I want cost-optimized LLM infra | Spot instances, right-sizing |
| US-214 | As an LLMOps engineer, I want multi-model serving | Multiple models on same cluster |

---

### 4. ML Monitoring & Observability

#### 4.1 Model Monitoring (Evidently)

```bash
$ nimbus mlops monitoring setup evidently

  ╭─ ML Monitoring Setup ────────────────────────────────────╮
  │                                                          │
  │  What do you want to monitor?                            │
  │                                                          │
  │  ☑ Data drift detection                                  │
  │  ☑ Prediction drift                                      │
  │  ☑ Model performance metrics                             │
  │  ☐ Feature importance tracking                           │
  │  ☑ Data quality checks                                   │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯

  Generated:
  ✓ monitoring/evidently-config.yaml
  ✓ monitoring/drift-detection-job.yaml (K8s CronJob)
  ✓ monitoring/grafana-dashboard.json
  ✓ monitoring/alerting-rules.yaml
  ✓ scripts/evidently-report.py
```

**Drift Detection Dashboard**:
```bash
Nimbus: I've created a drift monitoring dashboard.

        ┌─────────────────────────────────────────────────────┐
        │           Model: sentiment-classifier               │
        │           Status: ⚠️ Drift Detected                 │
        ├─────────────────────────────────────────────────────┤
        │                                                     │
        │  Data Drift Score: 0.34 (threshold: 0.25)          │
        │  ████████████████░░░░░░░░ 68%                      │
        │                                                     │
        │  Drifted Features:                                  │
        │  • text_length      0.42 ⚠️                        │
        │  • word_count       0.38 ⚠️                        │
        │  • sentiment_score  0.12 ✓                         │
        │                                                     │
        │  Prediction Drift: 0.18 ✓                          │
        │                                                     │
        │  Recommended Actions:                               │
        │  1. Investigate text_length distribution change    │
        │  2. Consider retraining with recent data           │
        │  3. Review data pipeline for anomalies             │
        │                                                     │
        └─────────────────────────────────────────────────────┘
```

#### 4.2 LLM-Specific Monitoring

```bash
You: Set up monitoring for my vLLM deployment

Nimbus: I'll configure comprehensive LLM monitoring.

        Metrics Collected:
        ┌─────────────────────────────────────────────────────┐
        │ Performance                                         │
        │ • Request latency (P50, P95, P99)                  │
        │ • Time to first token (TTFT)                       │
        │ • Tokens per second (throughput)                   │
        │ • Queue depth                                       │
        │                                                     │
        │ Resource Utilization                                │
        │ • GPU memory usage                                  │
        │ • GPU compute utilization                          │
        │ • CPU/Memory per pod                               │
        │ • KV cache usage                                    │
        │                                                     │
        │ Quality (optional)                                  │
        │ • Response length distribution                     │
        │ • Error rate by type                               │
        │ • Timeout rate                                      │
        └─────────────────────────────────────────────────────┘

        Alerts Configured:
        • P99 latency > 5s → Warning
        • GPU memory > 95% → Critical
        • Error rate > 5% → Critical
        • Queue depth > 100 → Warning

        [Apply] [Customize Thresholds] [View Dashboard]
```

---

### 5. Team Collaboration Features

#### 5.1 Team Workspaces

```bash
$ nimbus team create my-team

  ╭─ Team Created ───────────────────────────────────────────╮
  │                                                          │
  │  Team: my-team                                           │
  │  ID: team_abc123                                         │
  │                                                          │
  │  Invite members:                                         │
  │  $ nimbus team invite user@example.com                   │
  │                                                          │
  │  Features enabled:                                       │
  │  ✓ Shared operation history                              │
  │  ✓ Shared templates                                      │
  │  ✓ Audit logging                                         │
  │  ✓ Role-based access control                             │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯

$ nimbus team members
$ nimbus team invite alice@company.com --role admin
$ nimbus team invite bob@company.com --role member
$ nimbus team remove bob@company.com
```

#### 5.2 Shared Templates

```bash
$ nimbus templates share my-eks-template --team my-team

  Template shared with team: my-team

  Team members can now use:
  $ nimbus generate terraform --template team:my-eks-template

$ nimbus templates list --team

  ╭─ Team Templates ─────────────────────────────────────────╮
  │                                                          │
  │  my-eks-template          by: alice@company.com         │
  │  └─ EKS cluster with company standards                  │
  │                                                          │
  │  production-vpc           by: bob@company.com           │
  │  └─ VPC with compliance requirements                    │
  │                                                          │
  │  ml-training-cluster      by: charlie@company.com       │
  │  └─ GPU cluster for ML training                         │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

#### 5.3 Role-Based Access Control

| Role | Permissions |
|------|-------------|
| **Owner** | Full access, billing, delete team |
| **Admin** | Manage members, shared resources, audit logs |
| **Member** | Use shared resources, view history |
| **Viewer** | Read-only access to shared resources |

```yaml
# Team configuration
team:
  id: team_abc123
  name: my-team
  members:
    - email: alice@company.com
      role: owner
    - email: bob@company.com
      role: admin
    - email: charlie@company.com
      role: member

  policies:
    require_approval_for:
      - production deployments
      - resource deletion
    allowed_clouds:
      - aws
      - gcp
    cost_limit_monthly: 10000
```

---

### 6. Audit Logging & Compliance

#### 6.1 Audit Log

```bash
$ nimbus audit

  ╭─ Audit Log ──────────────────────────────────────────────╮
  │                                                          │
  │  2026-01-20 14:32:15                                     │
  │  User: alice@company.com                                 │
  │  Action: terraform_apply                                 │
  │  Resources: aws_eks_cluster.production                   │
  │  Status: approved by bob@company.com                     │
  │  IP: 192.168.1.100                                       │
  │                                                          │
  │  2026-01-20 14:15:03                                     │
  │  User: charlie@company.com                               │
  │  Action: k8s_delete                                      │
  │  Resources: deployment/api-server                        │
  │  Status: denied (production protection)                  │
  │  IP: 192.168.1.101                                       │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯

$ nimbus audit --user alice@company.com --since 7d
$ nimbus audit --action terraform_apply
$ nimbus audit export --format csv --output audit.csv
```

#### 6.2 Compliance Reports

```bash
$ nimbus compliance report --standard soc2

  ╭─ SOC2 Compliance Report ─────────────────────────────────╮
  │                                                          │
  │  Generated: 2026-01-20                                   │
  │  Period: 2025-12-01 to 2026-01-20                       │
  │                                                          │
  │  Access Control                                          │
  │  ✓ All operations authenticated                         │
  │  ✓ MFA enabled for all users                            │
  │  ✓ Role-based access enforced                           │
  │                                                          │
  │  Change Management                                       │
  │  ✓ All changes logged with user attribution             │
  │  ✓ Production changes require approval                  │
  │  ⚠️ 3 emergency changes without approval                │
  │                                                          │
  │  Data Protection                                         │
  │  ✓ Credentials encrypted at rest                        │
  │  ✓ API keys not logged                                  │
  │  ✓ PII not stored in operation logs                     │
  │                                                          │
  │  [Export PDF] [Export JSON] [View Details]              │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

---

### 7. Cost Estimation & Optimization

#### 7.1 Pre-Operation Cost Estimates

```bash
You: Create an EKS cluster with 5 nodes

Nimbus: I'll create the EKS configuration. Here's the cost estimate:

        ┌─────────────────────────────────────────────────────┐
        │              Monthly Cost Estimate                   │
        ├─────────────────────────────────────────────────────┤
        │                                                     │
        │  EKS Control Plane        $73.00                   │
        │  EC2 Instances (5x t3.large)                       │
        │    └─ On-Demand           $304.00                  │
        │    └─ Spot (estimated)    $91.20  ← 70% savings   │
        │  NAT Gateway              $32.40                   │
        │  Load Balancer            $16.20                   │
        │  EBS Storage (100GB × 5)  $50.00                   │
        │                           ─────────                │
        │  Total (On-Demand)        $475.60/month           │
        │  Total (with Spot)        $262.80/month           │
        │                                                     │
        └─────────────────────────────────────────────────────┘

        Cost Optimization Suggestions:
        💡 Use Spot instances for worker nodes (70% savings)
        💡 Consider Graviton instances (20% cheaper)
        💡 Right-size: current config may be over-provisioned

        [Apply On-Demand] [Apply with Spot] [Optimize Further]
```

#### 7.2 Cost Analysis Command

```bash
$ nimbus cost analyze

  ╭─ Infrastructure Cost Analysis ───────────────────────────╮
  │                                                          │
  │  Current Monthly Spend: $2,340.50                        │
  │  Projected (if unchanged): $2,340.50                     │
  │  Potential Savings: $780.00 (33%)                       │
  │                                                          │
  │  Top Cost Drivers:                                       │
  │  1. EKS Cluster (production)     $890.00                │
  │  2. RDS PostgreSQL               $420.00                │
  │  3. NAT Gateways (3)             $324.00                │
  │  4. EC2 Instances (dev)          $280.00                │
  │  5. S3 Storage                   $156.00                │
  │                                                          │
  │  Optimization Opportunities:                             │
  │  • Convert dev EC2 to Spot       Save $196/month        │
  │  • Reduce NAT to 1 (dev)         Save $216/month        │
  │  • Right-size RDS                Save $168/month        │
  │  • Reserved Instances (1yr)      Save $200/month        │
  │                                                          │
  │  [Apply Optimizations] [Generate Report] [Ignore]       │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

---

### 8. Enterprise SSO

#### 8.1 SSO Configuration

```bash
$ nimbus auth sso setup

  ╭─ SSO Configuration ──────────────────────────────────────╮
  │                                                          │
  │  Identity Provider:                                      │
  │                                                          │
  │  › Okta                                                  │
  │    Azure AD                                              │
  │    Google Workspace                                      │
  │    Generic SAML 2.0                                      │
  │    Generic OIDC                                          │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯

  Okta Configuration:

  1. Create SAML App in Okta Admin Console
  2. Set ACS URL: https://api.nimbus.dev/auth/saml/callback
  3. Set Entity ID: nimbus-{team-id}
  4. Download metadata XML

  $ nimbus auth sso configure \
      --provider okta \
      --metadata-url https://your-org.okta.com/app/.../sso/saml/metadata

  SSO configured successfully!
  Team members can now login with: nimbus auth login --sso
```

#### 8.2 SSO User Stories

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| US-250 | As an admin, I want to configure Okta SSO | SAML integration working |
| US-251 | As an admin, I want to configure Azure AD | OIDC integration working |
| US-252 | As a user, I want to login with SSO | `nimbus auth login --sso` works |
| US-253 | As an admin, I want to enforce SSO-only login | Password login disabled |
| US-254 | As an admin, I want auto-provisioning from IdP | New users auto-created |

---

## Pricing Implementation

### Tier Enforcement

```typescript
// Tier limits
const tiers = {
  free: {
    operations_per_month: 50,
    clouds: ['aws'],
    team_members: 1,
    history_retention_days: 7,
    features: ['basic_generation', 'basic_k8s'],
  },
  pro: {
    operations_per_month: -1, // unlimited
    clouds: ['aws', 'gcp', 'azure'],
    team_members: 1,
    history_retention_days: 90,
    features: ['all_generation', 'all_k8s', 'cicd', 'monitoring'],
  },
  team: {
    operations_per_month: -1,
    clouds: ['aws', 'gcp', 'azure'],
    team_members: -1, // unlimited
    history_retention_days: 365,
    features: ['all', 'team_features', 'audit_logs', 'sso'],
  },
  enterprise: {
    operations_per_month: -1,
    clouds: ['aws', 'gcp', 'azure'],
    team_members: -1,
    history_retention_days: -1, // unlimited
    features: ['all', 'enterprise_features', 'compliance', 'support'],
  },
};
```

### Usage Tracking

```bash
$ nimbus usage

  ╭─ Usage This Month ───────────────────────────────────────╮
  │                                                          │
  │  Plan: Pro ($29/month)                                   │
  │  Billing Period: Jan 1 - Jan 31, 2026                   │
  │                                                          │
  │  Operations Used: 127 / Unlimited                       │
  │  ████████░░░░░░░░░░░░                                   │
  │                                                          │
  │  By Category:                                            │
  │  • Terraform generation: 45                              │
  │  • K8s operations: 52                                    │
  │  • CI/CD generation: 18                                  │
  │  • Chat queries: 12                                      │
  │                                                          │
  │  [Upgrade to Team] [View Invoice] [Manage Billing]      │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

---

## Development Timeline

### Sprint 13-14 (Weeks 1-4): MLOps Foundation

**MCP Tools Team** ([mlops-llmops-tools.md](../releases/release-3/mcp-tools-team/mlops-llmops-tools.md)):
- AWS SageMaker integration (endpoints, model registry, training jobs)
- Google Vertex AI deployment and model management
- KServe InferenceService deployment for Kubernetes
- Kubeflow pipeline creation and execution
- MLflow model registry and serving setup

**Core Engine Team** ([cost-estimation-engine.md](../releases/release-3/core-engine-team/cost-estimation-engine.md)):
- Cost Estimator core with AWS pricing provider
- GCP and Azure pricing providers
- Resource cost calculation engine
- Optimization suggestion system

**DevRel/QA Team** ([enterprise-testing-docs-spec.md](../releases/release-3/devrel-qa-team/enterprise-testing-docs-spec.md)):
- MLOps integration test suite (SageMaker, Vertex AI, KServe)
- Cost estimation unit tests
- MLflow integration tests

### Sprint 15-16 (Weeks 5-8): LLMOps & Advanced ML Monitoring

**MCP Tools Team** ([mlops-llmops-tools.md](../releases/release-3/mcp-tools-team/mlops-llmops-tools.md)):
- vLLM deployment with GPU optimization and auto-scaling
- Text Generation Inference (TGI) with batching and quantization
- Ollama on Kubernetes for multi-model serving
- Evidently for drift detection and model monitoring
- LLM-specific metrics (TTFT, throughput, GPU utilization)

**Core Engine Team** ([cost-estimation-engine.md](../releases/release-3/core-engine-team/cost-estimation-engine.md)):
- Usage Tracker with tier enforcement
- Team Policy Manager with approval workflows
- Real-time cost monitoring and alerts

**DevRel/QA Team** ([enterprise-testing-docs-spec.md](../releases/release-3/devrel-qa-team/enterprise-testing-docs-spec.md)):
- LLMOps integration tests (vLLM, TGI, Ollama)
- Evidently monitoring tests
- Performance and load testing for ML workloads

### Sprint 17-18 (Weeks 9-12): Enterprise Features & Codebase Analysis

**CLI Team** ([team-collaboration-ui.md](../releases/release-3/cli-team/team-collaboration-ui.md)):
- Team management commands (create, invite, manage roles)
- Shared templates UI with discovery and usage
- Usage and billing dashboard display
- SSO login flow for CLI (device code flow)
- Audit log viewer with filtering and search
- Cost estimation display in UI

**Enterprise Backend Team** ([auth-billing-audit-spec.md](../releases/release-3/enterprise-backend-team/auth-billing-audit-spec.md)):
- SSO integration (SAML 2.0, OIDC) with Okta and Azure AD
- Device code flow for CLI authentication
- Stripe billing integration (subscriptions, invoicing, webhooks)
- Audit logging service with PostgreSQL storage
- Team and user management APIs
- Usage tracking and tier enforcement backend

**MCP Tools Team** ([codebase-analysis-tools.md](../releases/release-3/mcp-tools-team/codebase-analysis-tools.md)):
- Codebase overview tool (language detection, statistics)
- AST analysis for multiple languages (TypeScript, Python, Go, Java, Rust)
- Dependency analysis with vulnerability detection
- Security scanning (secret detection, OWASP compliance)
- Architecture pattern detection and anti-pattern identification
- AI-powered code explanations and refactoring suggestions

**DevRel/QA Team** ([enterprise-testing-docs-spec.md](../releases/release-3/devrel-qa-team/enterprise-testing-docs-spec.md)):
- SSO integration tests (Okta, Azure AD, device flow)
- Billing system tests (Stripe webhooks, subscription lifecycle)
- Audit logging tests (compliance, retention, query performance)
- Team collaboration tests (RBAC, permissions)
- Codebase analysis tests (AST parsing, security scanning)
- Admin guides and onboarding documentation

---

## Testing Strategy

Release 3 includes comprehensive testing across MLOps/LLMOps, enterprise features, and codebase analysis. Detailed testing specifications are in [enterprise-testing-docs-spec.md](../releases/release-3/devrel-qa-team/enterprise-testing-docs-spec.md).

### MLOps/LLMOps Testing

**SageMaker Integration Tests** (releases/release-3/devrel-qa-team/enterprise-testing-docs-spec.md:50-120):
- Endpoint deployment and configuration
- Model registry operations (register, version, promote)
- Training job creation and monitoring
- Auto-scaling validation
- Error handling and rollback

**Vertex AI Integration Tests** (releases/release-3/devrel-qa-team/enterprise-testing-docs-spec.md:122-180):
- Model deployment to Vertex AI endpoints
- Batch prediction job creation
- Model monitoring setup
- Multi-region deployment

**KServe Integration Tests** (releases/release-3/devrel-qa-team/enterprise-testing-docs-spec.md:182-240):
- InferenceService deployment
- Custom transformer configuration
- Auto-scaling behavior
- Model versioning and canary deployments

**LLMOps Integration Tests** (releases/release-3/devrel-qa-team/enterprise-testing-docs-spec.md:242-350):
- vLLM deployment with GPU optimization
- TGI batching and quantization
- Ollama multi-model serving
- Performance benchmarks (TTFT, throughput, latency)
- GPU memory utilization validation

**ML Monitoring Tests** (releases/release-3/devrel-qa-team/enterprise-testing-docs-spec.md:352-420):
- Evidently drift detection
- Alert configuration and triggering
- Dashboard generation
- Data quality checks

### Enterprise Feature Testing

**SSO Integration Tests** (releases/release-3/devrel-qa-team/enterprise-testing-docs-spec.md:422-520):
- SAML 2.0 authentication flow
- OIDC authentication with Okta and Azure AD
- Device code flow for CLI
- Token validation and refresh
- SSO configuration management

**Billing System Tests** (releases/release-3/devrel-qa-team/enterprise-testing-docs-spec.md:522-600):
- Stripe subscription lifecycle (create, update, cancel)
- Webhook handling (payment success, failure, subscription changes)
- Invoice generation and retrieval
- Usage-based billing calculations
- Tier enforcement and limits

**Audit Logging Tests** (releases/release-3/devrel-qa-team/enterprise-testing-docs-spec.md:602-680):
- Log creation for all auditable events
- Query performance with large datasets
- Filtering and search functionality
- Compliance report generation
- Retention policy enforcement
- Export capabilities

**Team Collaboration Tests** (releases/release-3/devrel-qa-team/enterprise-testing-docs-spec.md:682-750):
- Team creation and management
- Member invitation and role assignment
- RBAC permission validation
- Shared template access control
- Team-scoped resource isolation

### Codebase Analysis Testing

**AST Analysis Tests** (releases/release-3/devrel-qa-team/enterprise-testing-docs-spec.md:752-810):
- Multi-language parsing (TypeScript, Python, Go, Java, Rust)
- Symbol extraction accuracy
- Dependency graph generation
- Code complexity metrics

**Security Scanning Tests** (releases/release-3/devrel-qa-team/enterprise-testing-docs-spec.md:812-870):
- Secret detection (API keys, tokens, credentials)
- OWASP vulnerability identification
- SQL injection detection
- XSS vulnerability scanning
- Dependency vulnerability checking

**Architecture Analysis Tests** (releases/release-3/devrel-qa-team/enterprise-testing-docs-spec.md:872-920):
- Pattern detection accuracy
- Anti-pattern identification
- Architecture quality scoring
- Refactoring suggestion validation

### Performance & Load Testing

**MLOps Performance Tests** (releases/release-3/devrel-qa-team/enterprise-testing-docs-spec.md:922-980):
- Concurrent model deployments
- Large model handling
- Pipeline execution at scale
- Cost estimation performance

**Enterprise Backend Load Tests**:
- Concurrent user authentication
- High-volume audit log writes
- Team operation throughput
- Billing webhook processing under load

---

## Success Criteria (Release 3)

| Criteria | Target |
|----------|--------|
| Paying customers | 10+ |
| MRR | $10K+ |
| Enterprise pilots | 2+ |
| NPS | 40+ |
| MLOps deployments | 50+ |
| Team accounts | 5+ |

---

## Capability Coverage (Release 3)

This section tracks the implementation status of capabilities added in Release 3.

### Release 3 Capability Matrix

| Category | Status | Coverage | Implementation Details |
|----------|--------|----------|------------------------|
| **AWS SageMaker** | ✅ Complete | 90% | Endpoints, models, training jobs |
| **Google Vertex AI** | ✅ Complete | 85% | Model deployment, endpoints |
| **KServe/Seldon** | ✅ Complete | 90% | InferenceService, transformers |
| **Kubeflow Pipelines** | ✅ Complete | 85% | Training/inference pipelines |
| **MLflow** | ✅ Complete | 90% | Tracking, registry, artifacts |
| **vLLM Deployment** | ✅ Complete | 90% | GPU serving, auto-scaling |
| **TGI Deployment** | ✅ Complete | 85% | Batching, quantization |
| **Ollama on K8s** | ✅ Complete | 90% | Multi-model serving |
| **ML Monitoring (Evidently)** | ✅ Complete | 85% | Drift detection, quality |
| **LLM Monitoring** | ✅ Complete | 85% | Latency, throughput, GPU |
| **Team Workspaces** | ✅ Complete | 90% | RBAC, shared resources |
| **Audit Logging** | ✅ Complete | 90% | SOC2 compliance |
| **Cost Estimation** | ✅ Complete | 85% | Pre-operation estimates |
| **Enterprise SSO** | ✅ Complete | 90% | Okta, Azure AD, SAML |
| **Codebase Analysis** | ✅ Complete | 90% | AST, security, architecture (See: `releases/release-3/mcp-tools-team/codebase-analysis-tools.md`) |

### Key Release 3 Deliverables

1. **MLOps Platform**
   - AWS SageMaker integration (endpoints, training, registry)
   - Google Vertex AI deployment
   - KServe/Seldon for Kubernetes ML serving
   - Kubeflow pipeline generation
   - MLflow infrastructure setup

2. **LLMOps Platform**
   - vLLM deployment with GPU auto-scaling
   - Text Generation Inference (TGI) setup
   - Ollama on Kubernetes
   - LLM-specific monitoring (TTFT, throughput)

3. **ML Monitoring**
   - Evidently for drift detection
   - Model performance dashboards
   - Alert configuration

4. **Enterprise Features**
   - Team workspaces with RBAC
   - Audit logging
   - Compliance reports (SOC2)
   - Enterprise SSO (Okta, Azure AD)

5. **Advanced Codebase Analysis**
   - Architecture pattern detection
   - Security vulnerability scanning
   - OWASP compliance analysis
   - AI-powered refactoring suggestions

### Detailed Team Specifications

For detailed implementation specifications, see:
- **MCP Tools Team**: `releases/release-3/mcp-tools-team/codebase-analysis-tools.md`

---

## Implementation Resources

### Team-Specific Specifications

**CLI Team**:
- **Team Collaboration UI**: `releases/release-3/cli-team/team-collaboration-ui.md`
  - Team management commands (create, invite, manage roles)
  - Shared templates UI with discovery and publishing
  - Usage and billing dashboard display
  - SSO login flow for CLI (device code flow)
  - Audit log viewer with filtering
  - Cost estimation display in CLI

**Core Engine Team**:
- **Cost Estimation Engine**: `releases/release-3/core-engine-team/cost-estimation-engine.md`
  - Cost Estimator with AWS/GCP/Azure pricing providers
  - Optimization engine for cost suggestions
  - Usage Tracker with tier enforcement
  - Team Policy Manager with approval workflows
  - Real-time cost monitoring and alerts

**Enterprise Backend Team**:
- **Auth, Billing & Audit**: `releases/release-3/enterprise-backend-team/auth-billing-audit-spec.md`
  - SSO integration (SAML 2.0, OIDC) with Okta and Azure AD
  - Device code flow for CLI authentication
  - Stripe billing integration (subscriptions, invoicing, webhooks)
  - Audit logging service with PostgreSQL storage
  - Team and user management APIs
  - Database schemas for teams, users, audit logs

**MCP Tools Team**:
- **MLOps/LLMOps Tools**: `releases/release-3/mcp-tools-team/mlops-llmops-tools.md`
  - AWS SageMaker (endpoints, model registry, training jobs)
  - Google Vertex AI (deployment, batch prediction)
  - KServe (InferenceService, transformers, auto-scaling)
  - Kubeflow (pipeline creation and execution)
  - MLflow (tracking, registry, artifacts, serving)
  - vLLM (GPU-based LLM deployment with auto-scaling)
  - TGI (Text Generation Inference with batching)
  - Ollama (multi-model serving on Kubernetes)
  - Evidently (drift detection, model monitoring)
  - LLM monitoring (TTFT, throughput, GPU metrics)

- **Codebase Analysis Tools**: `releases/release-3/mcp-tools-team/codebase-analysis-tools.md`
  - Codebase overview (language detection, statistics)
  - AST analysis (TypeScript, Python, Go, Java, Rust)
  - Dependency analysis with vulnerability detection
  - Security scanning (secret detection, OWASP compliance)
  - Architecture pattern detection
  - AI-powered code explanations and refactoring

**DevRel/QA Team**:
- **Enterprise Testing & Docs**: `releases/release-3/devrel-qa-team/enterprise-testing-docs-spec.md`
  - MLOps/LLMOps integration test suite
  - SSO integration tests (Okta, Azure AD, device flow)
  - Billing system tests (Stripe, webhooks)
  - Audit logging tests (compliance, performance)
  - Team collaboration tests (RBAC, permissions)
  - Codebase analysis tests (AST, security)
  - Admin guides and onboarding documentation
  - Performance and load testing

### Document Relationship

```
docs/03-release-3-spec.md (High-Level Product Spec)
│
├── MLOps/LLMOps
│   ├── releases/release-3/mcp-tools-team/mlops-llmops-tools.md
│   └── releases/release-3/core-engine-team/cost-estimation-engine.md
│
├── Enterprise Features
│   ├── releases/release-3/cli-team/team-collaboration-ui.md
│   ├── releases/release-3/enterprise-backend-team/auth-billing-audit-spec.md
│   └── releases/release-3/core-engine-team/cost-estimation-engine.md
│
├── Codebase Analysis
│   └── releases/release-3/mcp-tools-team/codebase-analysis-tools.md
│
└── Testing & Documentation
    └── releases/release-3/devrel-qa-team/enterprise-testing-docs-spec.md
```

### Architecture Context

Release 3 builds on the microservices architecture established in MVP and Release 2:

**Core Services** (from MVP):
- CLI Service (Port 3000/3001)
- Chat Service (Port 3002/3003)
- Terraform Generator (Port 3004/3005)
- Kubernetes Generator (Port 3006/3007)
- Docker Generator (Port 3008/3009)
- History Service (Port 3010/3011)

**Release 2 Additions**:
- Plugin Service
- CI/CD Generator
- GitHub Tools Service
- Docker Tools Service
- Monitoring Service

**Release 3 Additions**:
- MLOps Service (SageMaker, Vertex AI, KServe, Kubeflow, MLflow)
- LLMOps Service (vLLM, TGI, Ollama)
- ML Monitoring Service (Evidently)
- Authentication Service (SSO, device flow)
- Billing Service (Stripe integration)
- Audit Service (logging and compliance)
- Cost Estimation Service
- Codebase Analysis Service (AST, security, architecture)

All services built with **Bun v1.0+** runtime and **Bun Workspaces** for package management.

---

*Document Version: 2.0*
*Last Updated: January 2026*
*Updates: Enhanced Development Timeline with team-specific sprint breakdowns, added comprehensive Testing Strategy section, added Implementation Resources with cross-references to all team specifications*
