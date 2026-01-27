# Nimbus Team Documentation Index

> **Organization**: Release-Based Breakdown with Team Subfolders
> **Last Updated**: January 2026

---

## Overview

This directory contains detailed specifications organized by release phase. Each release folder contains team-specific documentation that can be assigned to different engineering teams.

---

## Folder Structure

```
teams/
├── README.md                          # This file
├── mvp/                               # Months 1-3: Investor Demo Ready
│   ├── cli-team/
│   │   └── cli-interface-spec.md
│   ├── core-engine-team/
│   │   └── agent-orchestration-spec.md
│   ├── llm-integration-team/
│   │   └── llm-abstraction-layer.md
│   ├── mcp-tools-team/
│   │   ├── terraform-kubernetes-tools.md
│   │   └── git-filesystem-tools.md
│   ├── generator-engine-team/
│   │   └── terraform-generator-spec.md
│   ├── devrel-qa-team/
│   │   └── testing-documentation-spec.md
│   └── infrastructure-team/
│       └── state-layer-spec.md
├── release-2/                         # Months 4-6: Public Beta Release
│   ├── cli-team/
│   │   └── enhanced-ui-spec.md
│   ├── core-engine-team/
│   │   └── history-plugin-system.md
│   ├── mcp-tools-team/
│   │   ├── cicd-monitoring-tools.md
│   │   └── github-docker-tools.md
│   ├── generator-engine-team/
│   │   └── cicd-generation-spec.md
│   ├── infrastructure-team/
│   │   └── database-plugin-schema.md
│   └── devrel-qa-team/
│       └── beta-launch-testing-spec.md
├── release-3/                         # Months 7-9: Paid Customers
│   ├── cli-team/
│   │   └── team-collaboration-ui.md
│   ├── core-engine-team/
│   │   └── cost-estimation-engine.md
│   ├── enterprise-backend-team/
│   │   └── auth-billing-audit-spec.md
│   ├── mcp-tools-team/
│   │   ├── mlops-llmops-tools.md
│   │   └── codebase-analysis-tools.md
│   └── devrel-qa-team/
│       └── enterprise-testing-docs-spec.md
├── release-4/                         # Months 10-12: Market Leader Position
│   ├── cli-team/
│   │   └── marketplace-autonomous-ui.md
│   ├── core-engine-team/
│   │   └── autonomous-operations-engine.md
│   ├── mcp-tools-team/
│   │   └── multicloud-advanced-mlops.md
│   ├── enterprise-backend-team/
│   │   └── compliance-marketplace-spec.md
│   └── devrel-qa-team/
│       └── market-leader-testing-docs-spec.md
└── TEAM-ASSIGNMENTS.md                # Team assignments, dependencies, staffing summary
```

---

## Release Timeline

```
Month:  1    2    3    4    5    6    7    8    9   10   11   12
        |------MVP------|---Release 2---|---Release 3---|--Release 4--|

MVP (M1-M3):        Investor Demo Ready
Release 2 (M4-M6):  Public Beta Release
Release 3 (M7-M9):  Paid Customers
Release 4 (M10-M12): Market Leader Position
```

---

## Document Index by Release

### MVP (Months 1-3)

| Team | Document | Key Deliverables |
|------|----------|------------------|
| CLI Team | [cli-interface-spec.md](./mvp/cli-team/cli-interface-spec.md) | Commands, chat UI, confirmations |
| Core Engine Team | [agent-orchestration-spec.md](./mvp/core-engine-team/agent-orchestration-spec.md) | Orchestrator, planner, executor, safety |
| LLM Integration Team | [llm-abstraction-layer.md](./mvp/llm-integration-team/llm-abstraction-layer.md) | Provider interface, Anthropic, OpenAI, Ollama, router |
| MCP Tools Team | [terraform-kubernetes-tools.md](./mvp/mcp-tools-team/terraform-kubernetes-tools.md) | Terraform, kubectl, Helm, AWS/GCP/Azure tools |
| MCP Tools Team | [git-filesystem-tools.md](./mvp/mcp-tools-team/git-filesystem-tools.md) | Git operations, file system tools, GitHub basic integration |
| Generator Engine Team | [terraform-generator-spec.md](./mvp/generator-engine-team/terraform-generator-spec.md) | Questionnaire, conversational, templates, best practices |
| DevRel/QA Team | [testing-documentation-spec.md](./mvp/devrel-qa-team/testing-documentation-spec.md) | Test strategy, docs, demos, feedback |
| Infrastructure Team | [state-layer-spec.md](./mvp/infrastructure-team/state-layer-spec.md) | SQLite, config, credentials, CI/CD, npm/Homebrew |

**MVP Team Allocation:**
| Team | FTE |
|------|-----|
| CLI Team | 0.5 |
| Core Engine Team | 1.0 |
| LLM Integration Team | 0.5 |
| MCP Tools Team | 0.5 |
| Generator Engine Team | 0.5 |
| Infrastructure Team | 0.5 |
| DevRel/QA Team | 0.5 |
| **Total** | **4.0** |

---

### Release 2 (Months 4-6)

| Team | Document | Key Deliverables |
|------|----------|------------------|
| CLI Team | [enhanced-ui-spec.md](./release-2/cli-team/enhanced-ui-spec.md) | Tables, diffs, autocomplete, personas |
| Core Engine Team | [history-plugin-system.md](./release-2/core-engine-team/history-plugin-system.md) | History, replay, plugin system, personas |
| MCP Tools Team | [cicd-monitoring-tools.md](./release-2/mcp-tools-team/cicd-monitoring-tools.md) | GitHub Actions, GitLab CI, ArgoCD, Prometheus, Grafana |
| MCP Tools Team | [github-docker-tools.md](./release-2/mcp-tools-team/github-docker-tools.md) | GitHub PR operations, Docker build/run, commit messages |
| Generator Engine Team | [cicd-generation-spec.md](./release-2/generator-engine-team/cicd-generation-spec.md) | CI/CD questionnaire, intent parsing, pipeline templates |
| Infrastructure Team | [database-plugin-schema.md](./release-2/infrastructure-team/database-plugin-schema.md) | Operations history, plugin system, personas DB schema |
| DevRel/QA Team | [beta-launch-testing-spec.md](./release-2/devrel-qa-team/beta-launch-testing-spec.md) | CI/CD tests, monitoring tests, beta launch, community |

**Release 2 Team Allocation:**
| Team | FTE |
|------|-----|
| CLI Team | 0.5 |
| Core Engine Team | 1.0 |
| MCP Tools Team | 0.5 |
| Generator Engine Team | 0.5 |
| Infrastructure Team | 0.5 |
| DevRel/QA Team | 0.5 |
| **Total** | **3.5** |

---

### Release 3 (Months 7-9)

| Team | Document | Key Deliverables |
|------|----------|------------------|
| CLI Team | [team-collaboration-ui.md](./release-3/cli-team/team-collaboration-ui.md) | Team management, SSO login, usage dashboard |
| Core Engine Team | [cost-estimation-engine.md](./release-3/core-engine-team/cost-estimation-engine.md) | Cost estimation, usage tracking, policies |
| Enterprise Backend Team | [auth-billing-audit-spec.md](./release-3/enterprise-backend-team/auth-billing-audit-spec.md) | SSO, Stripe, audit logging, team management |
| MCP Tools Team | [mlops-llmops-tools.md](./release-3/mcp-tools-team/mlops-llmops-tools.md) | SageMaker, KServe, Kubeflow, MLflow, vLLM, TGI, Evidently |
| MCP Tools Team | [codebase-analysis-tools.md](./release-3/mcp-tools-team/codebase-analysis-tools.md) | AST parsing, architecture detection, security scanning |
| DevRel/QA Team | [enterprise-testing-docs-spec.md](./release-3/devrel-qa-team/enterprise-testing-docs-spec.md) | MLOps tests, enterprise tests, admin documentation |

**Release 3 Team Allocation:**
| Team | FTE |
|------|-----|
| CLI Team | 0.5 |
| Core Engine Team | 1.0 |
| MCP Tools Team | 0.5 |
| Enterprise Backend Team | 1.0 |
| DevRel/QA Team | 0.5 |
| **Total** | **3.5** |

---

### Release 4 (Months 10-12)

| Team | Document | Key Deliverables |
|------|----------|------------------|
| CLI Team | [marketplace-autonomous-ui.md](./release-4/cli-team/marketplace-autonomous-ui.md) | Marketplace, autonomous ops UI, compliance |
| Core Engine Team | [autonomous-operations-engine.md](./release-4/core-engine-team/autonomous-operations-engine.md) | Self-healing, drift detection, remediation |
| MCP Tools Team | [multicloud-advanced-mlops.md](./release-4/mcp-tools-team/multicloud-advanced-mlops.md) | Multi-cloud orchestration, Ray, Feast, W&B, Datadog |
| Enterprise Backend Team | [compliance-marketplace-spec.md](./release-4/enterprise-backend-team/compliance-marketplace-spec.md) | SOC2/HIPAA/PCI-DSS compliance, marketplace, SDK, on-prem |
| DevRel/QA Team | [market-leader-testing-docs-spec.md](./release-4/devrel-qa-team/market-leader-testing-docs-spec.md) | Autonomous ops tests, compliance tests, SDK docs, Series A |

**Release 4 Team Allocation:**
| Team | FTE |
|------|-----|
| CLI Team | 1.0 |
| Core Engine Team | 1.5 |
| MCP Tools Team | 0.5 |
| Enterprise Backend Team | 1.0 |
| DevRel/QA Team | 1.0 |
| **Total** | **5.0** |

---

## Team Responsibilities

| Team | Primary Responsibilities | Releases Active |
|------|-------------------------|-----------------|
| **CLI Team** | Terminal UI, commands, user interface | MVP → R4 |
| **Core Engine Team** | Agent orchestration, planning, execution, safety | MVP → R4 |
| **LLM Integration Team** | Multi-provider LLM support, routing | MVP → R2 |
| **MCP Tools Team** | Terraform, Kubernetes, Helm, Cloud CLI tools | MVP → R4 |
| **Generator Engine Team** | IaC generation, templates, questionnaires | MVP → R4 |
| **DevRel/QA Team** | Testing, documentation, demos, community | MVP → R4 |
| **Infrastructure Team** | State layer, build system, CI/CD, distribution | MVP → R4 |
| **Enterprise Backend Team** | Auth, billing, audit, team management | R3 → R4 |

---

## Cross-Team Dependencies

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Dependencies Graph                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Infrastructure ─────► Core Engine ─────► CLI                       │
│       │                    │   │                                    │
│       │                    │   └──────────► Generator Engine        │
│       │                    │                     │                  │
│       │                    └──► MCP Tools ◄──────┘                  │
│       │                         │                                   │
│       └──► LLM Integration ◄────┘                                   │
│                                                                     │
│  Enterprise Backend ◄──── Core Engine                               │
│                                                                     │
│  DevRel/QA ◄──── All Teams                                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## How to Use This Documentation

### For Team Leads
1. Navigate to your release folder (e.g., `mvp/`, `release-2/`)
2. Find your team's subfolder
3. Review the specification document for that release
4. Break down into sprint tasks
5. Identify dependencies on other teams

### For Individual Contributors
1. Read the specification for your assigned component
2. Understand the interfaces with other components
3. Implement according to the code examples
4. Ensure acceptance criteria are met

### For Product/Management
1. Use this index for release planning
2. Track progress across teams within each release
3. Adjust priorities based on dependencies
4. Prepare demos and investor updates

---

## Quick Links

### Team Planning
- [Team Assignments & Dependencies](./TEAM-ASSIGNMENTS.md) - Comprehensive overview of team responsibilities, dependencies, and staffing

### Original Specifications
- [Master Roadmap](../nimbus-product-roadmap.md)
- [MVP Specification](../01-mvp-spec.md)
- [Release 2 Specification](../02-release-2-spec.md)
- [Release 3 Specification](../03-release-3-spec.md)
- [Release 4 Specification](../04-release-4-spec.md)

### External Resources
- GitHub Repository: `github.com/nimbus-dev/nimbus`
- Documentation Site: `docs.nimbus.dev`
- Discord Community: `discord.gg/nimbus`

---

*Document Version: 2.0*
*Last Updated: January 2026*
*Authors: Product Team*
