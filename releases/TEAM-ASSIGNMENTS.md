# Nimbus Team Assignments & Dependencies

> **Document Purpose**: Comprehensive overview of team responsibilities, dependencies, and delivery schedules across all releases
> **Last Updated**: January 2026

---

## Team Overview

| Team | Primary Focus | Key Skills |
|------|---------------|------------|
| **CLI Team** | User interface, terminal experience | TypeScript, Ink/React, Terminal UX |
| **Core Engine Team** | Business logic, orchestration | TypeScript, LLM integration, State management |
| **LLM Integration Team** | AI provider abstraction | TypeScript, LLM APIs, Prompt engineering |
| **MCP Tools Team** | External tool integrations | TypeScript, Cloud CLIs, APIs |
| **Generator Engine Team** | Code generation, templates | TypeScript, HCL, YAML, Templating |
| **DevRel/QA Team** | Testing, documentation, community | Testing frameworks, Documentation, Community |
| **Infrastructure Team** | Database, state, deployment | SQLite, PostgreSQL, Kubernetes |
| **Enterprise Backend Team** | Auth, billing, compliance | Node.js, Stripe, SAML, Security |

---

## Release Timeline

```
Month 1-3 (MVP)        Month 4-6 (R2)         Month 7-9 (R3)         Month 10-12 (R4)
├── Private Beta       ├── Public Beta        ├── Paid Customers     ├── Market Leader
├── Core Features      ├── CI/CD, Monitoring  ├── MLOps, Enterprise  ├── Autonomous Ops
└── 100 users          └── 1,000 users        └── 10 paying          └── 50+ paying
```

---

## MVP (Months 1-3)

### Team Responsibilities

| Team | Document | Key Deliverables | FTE |
|------|----------|------------------|-----|
| CLI Team | [cli-interface-spec.md](./mvp/cli-team/cli-interface-spec.md) | CLI framework, chat interface, command structure | 1.0 |
| Core Engine Team | [agent-orchestration-spec.md](./mvp/core-engine-team/agent-orchestration-spec.md) | Orchestration engine, safety controls, approval system | 1.5 |
| LLM Integration Team | [llm-abstraction-layer.md](./mvp/llm-integration-team/llm-abstraction-layer.md) | Multi-provider LLM support, streaming, tool calls | 0.5 |
| MCP Tools Team | [terraform-kubernetes-tools.md](./mvp/mcp-tools-team/terraform-kubernetes-tools.md) | Terraform, kubectl, Helm, AWS CLI tools | 0.5 |
| MCP Tools Team | [git-filesystem-tools.md](./mvp/mcp-tools-team/git-filesystem-tools.md) | Git operations, file system, GitHub basic | 0.5 |
| Generator Engine Team | [terraform-generator-spec.md](./mvp/generator-engine-team/terraform-generator-spec.md) | Terraform generation, questionnaire engine | 1.0 |
| DevRel/QA Team | [testing-documentation-spec.md](./mvp/devrel-qa-team/testing-documentation-spec.md) | Test framework, documentation, README | 0.5 |
| Infrastructure Team | [state-layer-spec.md](./mvp/infrastructure-team/state-layer-spec.md) | SQLite schema, state management | 0.5 |
| **Total** | | | **6.0** |

### Dependency Graph

```
┌──────────────┐
│Infrastructure│──────┐
│    Team      │      │
└──────────────┘      │
       │              │
       ▼              │
┌──────────────┐      │     ┌──────────────┐
│     LLM      │──────┼────▶│    Core      │
│ Integration  │      │     │   Engine     │
└──────────────┘      │     └──────────────┘
       │              │            │
       │              │            ▼
┌──────────────┐      │     ┌──────────────┐
│     MCP      │──────┘     │     CLI      │
│    Tools     │────────────│    Team      │
└──────────────┘            └──────────────┘
       │                           │
       ▼                           │
┌──────────────┐                   │
│  Generator   │───────────────────┘
│   Engine     │
└──────────────┘
       │
       ▼
┌──────────────┐
│   DevRel/    │
│     QA       │
└──────────────┘
```

### Critical Path
1. **Infrastructure Team** → SQLite schema (Week 1)
2. **LLM Integration Team** → Provider abstraction (Week 2)
3. **MCP Tools Team** → Terraform, K8s tools (Weeks 1-4)
4. **Core Engine Team** → Orchestration (Weeks 2-6)
5. **CLI Team** → User interface (Weeks 4-8)
6. **Generator Engine Team** → Terraform generation (Weeks 6-10)
7. **DevRel/QA Team** → Testing, docs (Weeks 8-12)

---

## Release 2 (Months 4-6)

### Team Responsibilities

| Team | Document | Key Deliverables | FTE |
|------|----------|------------------|-----|
| CLI Team | [enhanced-ui-spec.md](./release-2/cli-team/enhanced-ui-spec.md) | Tables, diffs, autocomplete, personas | 0.5 |
| Core Engine Team | [history-plugin-system.md](./release-2/core-engine-team/history-plugin-system.md) | History, replay, plugin system, personas | 1.0 |
| MCP Tools Team | [cicd-monitoring-tools.md](./release-2/mcp-tools-team/cicd-monitoring-tools.md) | GitHub Actions, GitLab CI, ArgoCD, Prometheus, Grafana | 0.25 |
| MCP Tools Team | [github-docker-tools.md](./release-2/mcp-tools-team/github-docker-tools.md) | GitHub PR operations, Docker build/run, AI commit messages | 0.25 |
| Generator Engine Team | [cicd-generation-spec.md](./release-2/generator-engine-team/cicd-generation-spec.md) | CI/CD questionnaire, intent parsing, pipeline templates | 0.5 |
| Infrastructure Team | [database-plugin-schema.md](./release-2/infrastructure-team/database-plugin-schema.md) | Operations history tables, plugin tables, persona tables | 0.5 |
| DevRel/QA Team | [beta-launch-testing-spec.md](./release-2/devrel-qa-team/beta-launch-testing-spec.md) | CI/CD tests, monitoring tests, community setup, beta launch | 0.5 |
| **Total** | | | **3.5** |

### Dependency Graph

```
┌──────────────┐
│Infrastructure│──────┐
│(Schema Adds) │      │
└──────────────┘      │
       │              │
       ▼              │
┌──────────────┐      │     ┌──────────────┐
│     MCP      │──────┼────▶│    Core      │
│ (CI/CD, Mon) │      │     │  (History)   │
└──────────────┘      │     └──────────────┘
       │              │            │
       ▼              │            ▼
┌──────────────┐      │     ┌──────────────┐
│  Generator   │──────┘     │     CLI      │
│ (CI/CD Gen)  │────────────│  (UI, Pers)  │
└──────────────┘            └──────────────┘
                                   │
                                   ▼
                            ┌──────────────┐
                            │   DevRel/    │
                            │ (Beta Launch)│
                            └──────────────┘
```

### Critical Path
1. **Infrastructure Team** → Schema additions (Week 1)
2. **MCP Tools Team** → CI/CD + Monitoring tools (Weeks 1-6)
3. **Core Engine Team** → History + Plugin system (Weeks 2-8)
4. **Generator Engine Team** → CI/CD generation (Weeks 4-10)
5. **CLI Team** → Enhanced UI + Personas (Weeks 6-12)
6. **DevRel/QA Team** → Testing + Beta launch (Weeks 8-12)

---

## Release 3 (Months 7-9)

### Team Responsibilities

| Team | Document | Key Deliverables | FTE |
|------|----------|------------------|-----|
| CLI Team | [team-collaboration-ui.md](./release-3/cli-team/team-collaboration-ui.md) | Team management, SSO login, usage dashboard | 0.5 |
| Core Engine Team | [cost-estimation-engine.md](./release-3/core-engine-team/cost-estimation-engine.md) | Cost estimation, usage tracking, policies | 1.0 |
| MCP Tools Team | [mlops-llmops-tools.md](./release-3/mcp-tools-team/mlops-llmops-tools.md) | SageMaker, KServe, Kubeflow, MLflow, vLLM, TGI, Evidently | 0.25 |
| MCP Tools Team | [codebase-analysis-tools.md](./release-3/mcp-tools-team/codebase-analysis-tools.md) | AST parsing, architecture detection, security scanning | 0.25 |
| Enterprise Backend Team | [auth-billing-audit-spec.md](./release-3/enterprise-backend-team/auth-billing-audit-spec.md) | SSO, Stripe billing, audit logging, team management | 1.0 |
| DevRel/QA Team | [enterprise-testing-docs-spec.md](./release-3/devrel-qa-team/enterprise-testing-docs-spec.md) | MLOps tests, enterprise tests, admin documentation | 0.5 |
| **Total** | | | **3.5** |

### Dependency Graph

```
┌──────────────┐     ┌──────────────┐
│  Enterprise  │────▶│    Core      │
│  Backend     │     │  (Cost Est)  │
│ (SSO, Bill)  │     └──────────────┘
└──────────────┘            │
       │                    │
       │                    ▼
       │             ┌──────────────┐
       └────────────▶│     CLI      │
                     │ (Team, SSO)  │
                     └──────────────┘
                            │
┌──────────────┐            │
│     MCP      │────────────┘
│(MLOps/LLMOps)│
└──────────────┘
       │
       ▼
┌──────────────┐
│   DevRel/    │
│(Ent Testing) │
└──────────────┘
```

### Critical Path
1. **Enterprise Backend Team** → Auth + Billing (Weeks 1-8)
2. **Core Engine Team** → Cost estimation (Weeks 2-8)
3. **MCP Tools Team** → MLOps/LLMOps tools (Weeks 1-10)
4. **CLI Team** → Team collaboration UI (Weeks 6-12)
5. **DevRel/QA Team** → Enterprise testing + docs (Weeks 8-12)

---

## Release 4 (Months 10-12)

### Team Responsibilities

| Team | Document | Key Deliverables | FTE |
|------|----------|------------------|-----|
| CLI Team | [marketplace-autonomous-ui.md](./release-4/cli-team/marketplace-autonomous-ui.md) | Marketplace UI, autonomous ops UI, compliance dashboard | 1.0 |
| Core Engine Team | [autonomous-operations-engine.md](./release-4/core-engine-team/autonomous-operations-engine.md) | Self-healing, drift detection, scheduled operations | 1.5 |
| MCP Tools Team | [multicloud-advanced-mlops.md](./release-4/mcp-tools-team/multicloud-advanced-mlops.md) | Multi-cloud orchestration, Ray, Feast, W&B, Datadog | 0.5 |
| Enterprise Backend Team | [compliance-marketplace-spec.md](./release-4/enterprise-backend-team/compliance-marketplace-spec.md) | SOC2/HIPAA/PCI-DSS compliance, marketplace backend, SDK, on-prem | 1.0 |
| DevRel/QA Team | [market-leader-testing-docs-spec.md](./release-4/devrel-qa-team/market-leader-testing-docs-spec.md) | Autonomous ops tests, compliance tests, SDK docs, Series A materials | 1.0 |
| **Total** | | | **5.0** |

### Dependency Graph

```
┌──────────────┐     ┌──────────────┐
│  Enterprise  │────▶│    Core      │
│ (Compliance, │     │(Autonomous)  │
│ Marketplace) │     └──────────────┘
└──────────────┘            │
       │                    │
       ▼                    ▼
┌──────────────┐     ┌──────────────┐
│     MCP      │────▶│     CLI      │
│(Multi-cloud, │     │(Marketplace, │
│ Adv MLOps)   │     │ Autonomous)  │
└──────────────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │   DevRel/    │
                     │(Market Lead) │
                     └──────────────┘
```

### Critical Path
1. **Core Engine Team** → Autonomous operations (Weeks 1-8)
2. **Enterprise Backend Team** → Compliance + Marketplace (Weeks 1-10)
3. **MCP Tools Team** → Multi-cloud + Advanced MLOps (Weeks 1-8)
4. **CLI Team** → Marketplace + Autonomous UI (Weeks 6-12)
5. **DevRel/QA Team** → Testing + Series A docs (Weeks 8-12)

---

## Cross-Release Dependencies

### Shared Components

| Component | Owner | Used By |
|-----------|-------|---------|
| State Layer (SQLite) | Infrastructure | All teams |
| LLM Abstraction | LLM Integration | Core Engine, Generator |
| MCP Tool Interface | MCP Tools | Core Engine, CLI |
| Authentication | Enterprise Backend | CLI, Core Engine |
| Database Migrations | Infrastructure | All database-using teams |

### Integration Points

```
┌─────────────────────────────────────────────────────────────┐
│                      CLI Layer                               │
├─────────────────────────────────────────────────────────────┤
│  All user interactions flow through CLI                     │
│  CLI Team owns: commands, UI, user experience               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Core Engine                               │
├─────────────────────────────────────────────────────────────┤
│  Central orchestration and business logic                   │
│  Core Engine Team owns: workflows, approval, policies       │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ LLM Providers │  │   MCP Tools   │  │   Generator   │
├───────────────┤  ├───────────────┤  ├───────────────┤
│ Claude, GPT,  │  │ TF, K8s, CI/  │  │ Terraform,    │
│ Ollama        │  │ CD, MLOps     │  │ K8s, CI/CD    │
└───────────────┘  └───────────────┘  └───────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    State Layer                               │
├─────────────────────────────────────────────────────────────┤
│  Persistence, history, configuration                        │
│  Infrastructure Team owns: schema, migrations               │
└─────────────────────────────────────────────────────────────┘
```

---

## Team Staffing Summary

### By Release

| Team | MVP | R2 | R3 | R4 | Total Person-Months |
|------|-----|----|----|----|--------------------|
| CLI Team | 1.0 | 0.5 | 0.5 | 1.0 | 9.0 |
| Core Engine Team | 1.5 | 1.0 | 1.0 | 1.5 | 15.0 |
| LLM Integration Team | 0.5 | - | - | - | 1.5 |
| MCP Tools Team | 1.0 | 0.5 | 0.5 | 0.5 | 7.5 |
| Generator Engine Team | 1.0 | 0.5 | - | - | 4.5 |
| DevRel/QA Team | 0.5 | 0.5 | 0.5 | 1.0 | 7.5 |
| Infrastructure Team | 0.5 | 0.5 | - | - | 3.0 |
| Enterprise Backend Team | - | - | 1.0 | 1.0 | 6.0 |
| **Total** | **6.0** | **3.5** | **3.5** | **5.0** | **54.0** |

### Skill Requirements

| Role | Skills | Releases |
|------|--------|----------|
| Senior TypeScript Engineer | TypeScript, Node.js, Testing | All |
| CLI/UX Engineer | Ink, Terminal UX, React | MVP, R2, R4 |
| LLM Engineer | LLM APIs, Prompt Engineering | MVP |
| Cloud Engineer | AWS/GCP/Azure, Terraform, K8s | All |
| Backend Engineer | Node.js, PostgreSQL, Auth | R3, R4 |
| QA Engineer | Vitest, E2E Testing | All |
| Technical Writer | Documentation, Tutorials | All |

---

## Risk Mitigation

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM API rate limits | High | Multi-provider fallback, caching |
| Cloud API changes | Medium | Abstraction layer, integration tests |
| Database scaling | Medium | PostgreSQL migration path ready |
| Third-party dependencies | Medium | Pin versions, audit regularly |

### Schedule Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Feature creep | High | Strict scope management, MVP focus |
| Integration delays | Medium | Early integration testing, CI/CD |
| Team availability | Medium | Cross-training, documentation |
| External dependencies | Low | Mock services for development |

---

## Document Index

### MVP
- [CLI Interface Spec](./mvp/cli-team/cli-interface-spec.md)
- [Agent Orchestration Spec](./mvp/core-engine-team/agent-orchestration-spec.md)
- [LLM Abstraction Layer](./mvp/llm-integration-team/llm-abstraction-layer.md)
- [Terraform & Kubernetes Tools](./mvp/mcp-tools-team/terraform-kubernetes-tools.md)
- [Git & Filesystem Tools](./mvp/mcp-tools-team/git-filesystem-tools.md)
- [Terraform Generator Spec](./mvp/generator-engine-team/terraform-generator-spec.md)
- [Testing & Documentation Spec](./mvp/devrel-qa-team/testing-documentation-spec.md)
- [State Layer Spec](./mvp/infrastructure-team/state-layer-spec.md)

### Release 2
- [Enhanced UI Spec](./release-2/cli-team/enhanced-ui-spec.md)
- [History & Plugin System](./release-2/core-engine-team/history-plugin-system.md)
- [CI/CD & Monitoring Tools](./release-2/mcp-tools-team/cicd-monitoring-tools.md)
- [GitHub & Docker Tools](./release-2/mcp-tools-team/github-docker-tools.md)
- [CI/CD Generation Spec](./release-2/generator-engine-team/cicd-generation-spec.md)
- [Database & Plugin Schema](./release-2/infrastructure-team/database-plugin-schema.md)
- [Beta Launch & Testing Spec](./release-2/devrel-qa-team/beta-launch-testing-spec.md)

### Release 3
- [Team Collaboration UI](./release-3/cli-team/team-collaboration-ui.md)
- [Cost Estimation Engine](./release-3/core-engine-team/cost-estimation-engine.md)
- [MLOps/LLMOps Tools](./release-3/mcp-tools-team/mlops-llmops-tools.md)
- [Codebase Analysis Tools](./release-3/mcp-tools-team/codebase-analysis-tools.md)
- [Auth, Billing, Audit Spec](./release-3/enterprise-backend-team/auth-billing-audit-spec.md)
- [Enterprise Testing & Docs Spec](./release-3/devrel-qa-team/enterprise-testing-docs-spec.md)

### Release 4
- [Marketplace & Autonomous UI](./release-4/cli-team/marketplace-autonomous-ui.md)
- [Autonomous Operations Engine](./release-4/core-engine-team/autonomous-operations-engine.md)
- [Multi-cloud & Advanced MLOps](./release-4/mcp-tools-team/multicloud-advanced-mlops.md)
- [Compliance & Marketplace Spec](./release-4/enterprise-backend-team/compliance-marketplace-spec.md)
- [Market Leader Testing & Docs Spec](./release-4/devrel-qa-team/market-leader-testing-docs-spec.md)

---

*Document Version: 1.0*
*Last Updated: January 2026*
