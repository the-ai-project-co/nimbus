# CLI Team - Release 4 Specification

> **Team**: CLI/Frontend Team
> **Phase**: Release 4 (Months 10-12)
> **Dependencies**: Marketplace Service, Autonomous Engine

---

## Overview

Release 4 adds the marketplace browsing experience, autonomous operations UI, multi-cloud dashboard, and compliance scan displays.

---

## New Features

### 1. Marketplace UI

#### 1.1 Marketplace Browser

```bash
$ nimbus marketplace browse

  ╭─ Nimbus Marketplace ─────────────────────────────────────╮
  │                                                          │
  │  🔥 Trending This Week                                   │
  │                                                          │
  │  production-eks-complete          ★★★★★ (234 installs)  │
  │  └─ Complete EKS setup with best practices              │
  │     by: @cloudguru | Free                               │
  │                                                          │
  │  ml-platform-aws                  ★★★★☆ (156 installs)  │
  │  └─ Full MLOps platform: SageMaker + MLflow + Feast    │
  │     by: @mlops-team | $49                               │
  │                                                          │
  │  llm-serving-stack                ★★★★★ (128 installs)  │
  │  └─ vLLM + TGI + monitoring + auto-scaling             │
  │     by: @ai-infra | $29                                 │
  │                                                          │
  │  Categories: [IaC] [Kubernetes] [MLOps] [Security]      │
  │                                                          │
  │  [Install] [Preview] [Reviews] [Search]                 │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

#### 1.2 Marketplace Commands

```bash
nimbus marketplace browse [--category <cat>]   # Browse templates
nimbus marketplace search <query>              # Search marketplace
nimbus marketplace install <name>              # Install template/plugin
nimbus marketplace publish <path>              # Publish your template
nimbus marketplace reviews <name>              # View reviews
nimbus marketplace rate <name> <stars>         # Rate a template
```

#### 1.3 Template Detail View

```bash
$ nimbus marketplace info production-eks-complete

  ╭─ production-eks-complete ────────────────────────────────╮
  │                                                          │
  │  Complete EKS Setup with Best Practices                  │
  │  by: @cloudguru                                          │
  │                                                          │
  │  ★★★★★ (4.8/5) · 234 installs · Free                   │
  │                                                          │
  │  Description:                                            │
  │  Production-ready EKS cluster with:                      │
  │  • Multi-AZ VPC with private subnets                    │
  │  • Managed node groups with auto-scaling                │
  │  • AWS Load Balancer Controller                          │
  │  • External DNS integration                              │
  │  • Cluster Autoscaler                                    │
  │  • Fluent Bit logging                                    │
  │                                                          │
  │  Includes:                                               │
  │  • 12 Terraform modules                                  │
  │  • Helm value files                                      │
  │  • Documentation                                         │
  │                                                          │
  │  [Install] [Preview Files] [View Reviews]               │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

---

### 2. Autonomous Operations UI

#### 2.1 Autonomous Dashboard

```bash
$ nimbus autonomous status

  ╭─ Autonomous Operations ──────────────────────────────────╮
  │                                                          │
  │  Cluster: production-eks                                 │
  │  Mode: Observe & Recommend                               │
  │  Status: ✓ Active                                        │
  │                                                          │
  │  Last 24 Hours:                                          │
  │  ├─ Auto-healed: 3 issues                               │
  │  ├─ Pending approval: 1 action                          │
  │  └─ Drift detected: 2 resources                         │
  │                                                          │
  │  Enabled Capabilities:                                   │
  │  ✓ Pod restart on crash loop (auto)                     │
  │  ✓ Node replacement on failure (approval)               │
  │  ✓ Horizontal scaling on load (auto)                    │
  │  ✓ Certificate renewal (auto)                           │
  │  ✓ Secret rotation (approval)                           │
  │                                                          │
  │  [View History] [Configure] [Disable]                   │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

#### 2.2 Autonomous Actions History

```bash
$ nimbus autonomous history

  ╭─ Autonomous Actions (Last 24h) ──────────────────────────╮
  │                                                          │
  │  ✓ 03:42 Auto-healed: pod/api-7d8f9 restarted           │
  │          Reason: OOMKilled                               │
  │          Action: Restarted with increased memory limit   │
  │                                                          │
  │  ✓ 08:15 Auto-scaled: deployment/api 3→5 replicas       │
  │          Reason: CPU > 80% for 5 minutes                │
  │                                                          │
  │  ⏳ 14:22 Pending approval: node/ip-10-0-1-42           │
  │          Issue: Node NotReady for 10 minutes            │
  │          Recommendation: Replace node                    │
  │          [Approve] [Deny] [Investigate]                 │
  │                                                          │
  │  [Filter] [Export] [Configure Rules]                    │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

#### 2.3 Approval Workflow UI

```bash
  ╭─ Approval Required ──────────────────────────────────────╮
  │                                                          │
  │  ⚠️  Node Replacement Recommended                        │
  │                                                          │
  │  Node: ip-10-0-1-42 (i-0abc123def456)                   │
  │  Issue: Node NotReady for 10+ minutes                    │
  │  Impact: 5 pods will be rescheduled                      │
  │                                                          │
  │  Proposed Action:                                        │
  │  1. Cordon node (prevent new pods)                       │
  │  2. Drain existing pods (graceful)                       │
  │  3. Terminate EC2 instance                               │
  │  4. ASG will launch replacement                          │
  │                                                          │
  │  Estimated Downtime: ~2 minutes (pods rescheduling)      │
  │                                                          │
  │  [Approve] [Deny] [Investigate First]                   │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

---

### 3. Drift Detection UI

#### 3.1 Drift Report

```bash
$ nimbus drift detect --all

  ╭─ Drift Detection Report ─────────────────────────────────╮
  │                                                          │
  │  Scanned: 3 Terraform states, 2 K8s clusters            │
  │  Drift Detected: 7 resources                             │
  │                                                          │
  │  Critical (Manual Change in Production):                 │
  │  ├─ aws_security_group.api                              │
  │  │  └─ Ingress rule added: 0.0.0.0/0:22 ⚠️ SECURITY    │
  │  │                                                       │
  │  Warning (Configuration Mismatch):                       │
  │  ├─ aws_instance.web[0]                                 │
  │  │  └─ instance_type: t3.large → t3.xlarge             │
  │  ├─ kubernetes_deployment.api                           │
  │  │  └─ replicas: 3 → 5 (manual scale)                  │
  │  │                                                       │
  │  Info (Expected Drift):                                  │
  │  ├─ aws_autoscaling_group.workers                       │
  │  │  └─ desired_capacity: varies (auto-scaling)         │
  │  │                                                       │
  │  [Fix All] [Fix Selected] [Ignore] [Add to Baseline]   │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

#### 3.2 Drift Fix Confirmation

```bash
$ nimbus drift fix --resource aws_security_group.api

  ╭─ Drift Fix Confirmation ─────────────────────────────────╮
  │                                                          │
  │  Resource: aws_security_group.api                        │
  │  Change Type: Revert to Terraform state                  │
  │                                                          │
  │  Changes to apply:                                       │
  │  - Removing ingress rule: 0.0.0.0/0:22 (SSH anywhere)   │
  │                                                          │
  │  ⚠️  This removes potentially unauthorized access        │
  │                                                          │
  │  [Confirm Fix] [Cancel] [View Full Diff]                │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

---

### 4. Multi-Cloud Dashboard

#### 4.1 Cloud Overview

```bash
$ nimbus cloud status

  ╭─ Multi-Cloud Overview ───────────────────────────────────╮
  │                                                          │
  │  AWS (us-east-1)                         $4,250/month   │
  │  ├─ EKS: production-cluster (healthy)                   │
  │  ├─ RDS: main-database (healthy)                        │
  │  ├─ S3: 12 buckets                                      │
  │  └─ EC2: 15 instances                                   │
  │                                                          │
  │  GCP (us-central1)                       $1,890/month   │
  │  ├─ GKE: ml-cluster (healthy)                          │
  │  ├─ Cloud SQL: analytics-db (healthy)                  │
  │  └─ GCS: 5 buckets                                     │
  │                                                          │
  │  Azure (eastus)                          $980/month    │
  │  ├─ AKS: dev-cluster (1 node unhealthy)               │
  │  └─ Blob Storage: 3 containers                         │
  │                                                          │
  │  Total Monthly Spend: $7,120                           │
  │  [View Details] [Cost Breakdown] [Optimize]            │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

#### 4.2 Cloud Comparison

```bash
  ╭─ Multi-Cloud Comparison ─────────────────────────────────╮
  │                                                          │
  │  Creating: GPU Kubernetes Cluster for ML                 │
  │                                                          │
  │  AWS EKS (us-east-1)                                    │
  │  • GPU: NVIDIA A10G (g5.xlarge)                         │
  │  • Cost: $1,890/month                                   │
  │  • Availability: ✓ Immediate                            │
  │                                                          │
  │  GCP GKE (us-central1) ⭐ Recommended                   │
  │  • GPU: NVIDIA T4 (n1-standard-8 + T4)                 │
  │  • Cost: $1,420/month (25% cheaper)                    │
  │  • Bonus: Better ML tooling integration                 │
  │                                                          │
  │  Azure AKS (eastus)                                     │
  │  • GPU: NVIDIA T4 (Standard_NC4as_T4_v3)               │
  │  • Cost: $1,650/month                                   │
  │  • Availability: ⚠️ 2-day lead time                    │
  │                                                          │
  │  [Deploy to GCP] [Deploy to AWS] [Compare More]         │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

---

### 5. Compliance UI

#### 5.1 Compliance Scan Results

```bash
$ nimbus compliance scan --standard hipaa

  ╭─ HIPAA Compliance Scan ──────────────────────────────────╮
  │                                                          │
  │  Scanning: AWS Account + GCP Project + K8s Cluster       │
  │                                                          │
  │  Results:                                                │
  │  ✓ Passed: 142 controls                                 │
  │  ⚠️ Warning: 8 controls                                 │
  │  ✗ Failed: 3 controls                                   │
  │                                                          │
  │  Critical Failures:                                      │
  │  ├─ §164.312(a)(1) - Access Control                     │
  │  │  └─ S3 bucket 'patient-data' public access enabled  │
  │  │     Fix: nimbus fix hipaa-001                        │
  │  │                                                       │
  │  ├─ §164.312(e)(1) - Transmission Security              │
  │  │  └─ RDS instance without SSL enforcement            │
  │  │     Fix: nimbus fix hipaa-002                        │
  │  │                                                       │
  │  └─ §164.312(c)(1) - Integrity                         │
  │     └─ CloudTrail not enabled in us-west-2             │
  │        Fix: nimbus fix hipaa-003                        │
  │                                                          │
  │  [Fix All] [Generate Report] [Export]                   │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

#### 5.2 Compliance Report Export

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
  │  [Export PDF] [Export JSON] [View Details]              │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

---

### 6. Unified Observability View

```bash
  ╭─ Production Health Dashboard ────────────────────────────╮
  │                                                          │
  │  Services (via Datadog)                                  │
  │  ├─ api-gateway        ✓ Healthy   P99: 45ms           │
  │  ├─ user-service       ✓ Healthy   P99: 32ms           │
  │  ├─ order-service      ⚠️ Degraded P99: 890ms          │
  │  └─ payment-service    ✓ Healthy   P99: 120ms          │
  │                                                          │
  │  Infrastructure (via Prometheus)                         │
  │  ├─ EKS Cluster        ✓ Healthy   CPU: 45%            │
  │  ├─ RDS Database       ✓ Healthy   Conn: 23/100        │
  │  └─ Redis Cache        ✓ Healthy   Mem: 2.1GB          │
  │                                                          │
  │  ML Models (via Evidently)                               │
  │  ├─ recommendation-v2  ✓ No Drift  Acc: 94.2%          │
  │  └─ fraud-detection    ⚠️ Drift    Acc: 91.8%          │
  │                                                          │
  │  [Investigate order-service] [View All Alerts]          │
  │                                                          │
  ╰──────────────────────────────────────────────────────────╯
```

---

## User Stories

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-300 | As a user, I want to browse the marketplace | Marketplace browser functional | Sprint 23-24 |
| US-301 | As a user, I want to view autonomous actions | Autonomous history displayed | Sprint 19-20 |
| US-302 | As a user, I want to approve/deny autonomous actions | Approval workflow working | Sprint 19-20 |
| US-303 | As a user, I want to see drift reports | Drift detection UI complete | Sprint 19-20 |
| US-304 | As a user, I want multi-cloud overview | Cloud dashboard functional | Sprint 21-22 |
| US-305 | As a user, I want compliance scan results | Compliance UI complete | Sprint 21-22 |

---

## Technical Requirements

### New Commands Structure

```
packages/cli/src/commands/
├── marketplace/
│   ├── browse.ts
│   ├── search.ts
│   ├── install.ts
│   ├── publish.ts
│   └── reviews.ts
├── autonomous/
│   ├── enable.ts
│   ├── status.ts
│   ├── history.ts
│   └── configure.ts
├── drift/
│   ├── detect.ts
│   └── fix.ts
├── cloud/
│   ├── status.ts
│   └── compare.ts
└── compliance/
    ├── scan.ts
    └── report.ts
```

### New UI Components

```
packages/cli/src/ui/
├── MarketplaceBrowser.tsx
├── MarketplaceDetail.tsx
├── AutonomousDashboard.tsx
├── AutonomousHistory.tsx
├── ApprovalWorkflow.tsx
├── DriftReport.tsx
├── DriftFixConfirm.tsx
├── MultiCloudDashboard.tsx
├── CloudComparison.tsx
├── ComplianceScan.tsx
├── ComplianceReport.tsx
└── UnifiedHealthDashboard.tsx
```

---

## Sprint Breakdown

### Sprint 19-20 (Weeks 1-4)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Autonomous dashboard UI | 3 days | Status display |
| Autonomous history view | 2 days | Action history |
| Approval workflow UI | 4 days | Approve/deny flow |
| Drift detection display | 3 days | Drift report |
| Drift fix confirmation | 2 days | Fix workflow |

### Sprint 21-22 (Weeks 5-8)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Multi-cloud dashboard | 4 days | Cloud overview |
| Cloud comparison view | 3 days | Side-by-side compare |
| Compliance scan UI | 3 days | Scan results |
| Compliance report view | 2 days | Report display |
| Unified health dashboard | 3 days | Combined view |

### Sprint 23-24 (Weeks 9-12)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Marketplace browser | 4 days | Browse/search |
| Marketplace detail view | 2 days | Template info |
| Marketplace install flow | 2 days | Install workflow |
| Marketplace publish flow | 3 days | Publish UI |
| Polish and testing | 4 days | Launch-ready |

---

## Acceptance Criteria

- [ ] Marketplace browser shows categories and trending
- [ ] Template details show full description, reviews, files
- [ ] Install flow handles free and paid templates
- [ ] Autonomous dashboard shows real-time status
- [ ] Approval workflow captures user decisions
- [ ] Drift report clearly shows severity levels
- [ ] Multi-cloud dashboard aggregates all accounts
- [ ] Compliance scan shows pass/fail/warning counts
- [ ] All components handle loading and error states
- [ ] Keyboard navigation works throughout

---

*Document Version: 1.0*
*Last Updated: January 2026*
