# Nimbus - Complete Product Roadmap

> **AI-Powered Cloud Engineering Agent for DevOps, MLOps & LLMOps Teams**

---

## Executive Summary

**Nimbus** is a terminal-native, AI-powered agentic tool designed specifically for Cloud Architects, DevOps Engineers, MLOps Engineers, and LLMOps Engineers. It combines the best aspects of Claude Code (polished UX, agentic capabilities), OpenCode (model flexibility, open architecture), and Goose (autonomous execution, multi-model optimization) into a single, domain-specialized platform.

### Vision Statement
*"The all-in-one AI agent that understands cloud infrastructure, generates production-ready code, and executes operations safely - all from your terminal."*

### Core Differentiator
**All-in-One Platform Depth** - The deepest coverage across IaC, Kubernetes, CI/CD, monitoring, and MLOps domains, eliminating the need for multiple specialized tools.

---

## Product Identity

| Attribute | Value |
|-----------|-------|
| **Name** | Nimbus |
| **Tagline** | "Cloud operations at the speed of thought" |
| **Interface** | Terminal/CLI Only |
| **Language** | TypeScript |
| **Runtime** | Bun (v1.0+) |
| **Architecture** | Microservices (12 services) |
| **Communication** | REST APIs + WebSocket Streaming |
| **License** | Proprietary with Free Tier |
| **AI Strategy** | Model Agnostic (Claude, OpenAI, Gemini, Ollama, etc.) |
| **Persona** | Customizable (Professional, Assistant, Expert) |

---

## Target Users

### Primary Personas

| Persona | Role | Pain Points | Nimbus Value |
|---------|------|-------------|--------------|
| **Cloud Architect** | Design infrastructure | Complex multi-cloud setups, keeping up with best practices | Generate compliant, best-practice IaC instantly |
| **DevOps Engineer** | Build & maintain pipelines | Tool sprawl, repetitive tasks, incident response | Single tool for all operations |
| **MLOps Engineer** | Deploy ML models | Complex infrastructure, scaling challenges | Pre-built ML infrastructure patterns |
| **LLMOps Engineer** | Deploy LLM inference | GPU orchestration, cost optimization | Specialized LLM deployment templates |
| **SRE** | Reliability & incidents | Alert fatigue, manual remediation | Autonomous issue detection & fixes |
| **Platform Engineer** | Internal platforms | Standardization, developer experience | Codified best practices |

### Team Composition
- **Skill Levels**: Mixed (Junior to Senior)
- **Team Size**: 2-50+ engineers
- **Environment**: Enterprise and startups

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

## Release Overview

### MVP (Months 1-3) - Investor Demo Ready

**Goal**: Demonstrate core value proposition with polished, working features

**Core Capabilities**:
- IaC Generation (Terraform) - Questionnaire + Conversational
- Kubernetes Operations - kubectl, Helm, manifest generation
- Cloud CLI Integration - AWS, GCP, Azure with AI assistance
- Human-in-the-loop safety for all mutating operations
- Model-agnostic LLM support
- Git Operations - clone, push, pull, commit, branch, merge, stash
- File System Tools - read, write, list, search, tree, diff
- GitHub Basic - PR list/create, Issue list/create
- Enhanced Init - project scanning, framework detection, context persistence

**Success Metrics**:
- Working demo for investor presentations
- 3 complete user journeys functional
- < 5 second response time for common operations

---

### Release 2 (Months 4-6) - Public Beta

**Goal**: Public release with community building and feedback loop

**New Capabilities**:
- CI/CD Pipeline generation (GitHub Actions, GitLab CI, Jenkins)
- Monitoring & Observability (Prometheus, Grafana, AlertManager)
- ArgoCD & GitOps workflows
- Operation history & replay
- Plugin/extension system (MCP-based)
- Multiple persona modes
- Docker Operations - build, push, run, compose, Dockerfile generation
- GitHub Advanced - PR read/comment/review/merge/analyze, Issue analyze
- AI Commit Messages - contextual commit message generation
- Interactive Scaffolding - `nimbus scaffold` full project wizard

**Success Metrics**:
- 500+ beta users
- Active Discord community
- 50+ GitHub stars
- Feedback-driven iteration

---

### Release 3 (Months 7-9) - Paid Customers

**Goal**: Revenue generation with enterprise pilots

**New Capabilities**:
- MLOps: SageMaker, Vertex AI, Kubeflow deployments
- LLMOps: vLLM, TGI, Ollama infrastructure
- Team collaboration features
- Audit logging & compliance reports
- Cost estimation & optimization
- Enterprise SSO (SAML, OIDC)
- Codebase Analysis - AST parsing, architecture detection, security scanning
- ML Monitoring - Evidently drift detection, model performance dashboards

**Success Metrics**:
- 10+ paying customers
- $10K+ MRR
- 2+ enterprise pilots
- NPS > 40

---

### Release 4 (Months 10-12) - Market Leader

**Goal**: Establish market position with differentiated depth

**New Capabilities**:
- Autonomous operations (self-healing, drift correction)
- Multi-cloud orchestration
- Compliance automation (SOC2, HIPAA, PCI-DSS)
- ML model monitoring & observability
- Marketplace for community templates
- White-label/embedding SDK

**Success Metrics**:
- 50+ paying customers
- $50K+ MRR
- Series A ready
- Clear competitive differentiation

---

## Technology Stack

> **Architecture**: Microservices (12 independent services)
> **Runtime**: Bun (v1.0+) for all services
> **Package Manager**: Bun workspaces

### Core Stack

| Layer | Technology | Justification |
|-------|------------|---------------|
| **CLI Framework** | Ink (React for CLI) | Rich terminal UI, component-based |
| **Runtime** | Bun 1.0+ | 3x faster than Node, built-in TypeScript, optimized for microservices |
| **Language** | TypeScript 5+ | Type safety, developer experience |
| **Architecture** | Microservices | Independent deployment, scaling, fault isolation |
| **Communication** | REST + WebSocket | Sync operations (REST), real-time streaming (WebSocket) |
| **LLM Abstraction** | Custom providers | Model-agnostic (Anthropic, OpenAI, Google, Ollama) |
| **MCP Framework** | Custom implementation | Distributed MCP tools across services |
| **Local Storage** | SQLite (better-sqlite3) | Operation history, checkpoints (State Service) |
| **Config** | YAML + Environment | User preferences, credentials |

### Infrastructure Stack

| Component | Technology |
|-----------|------------|
| **Package Manager** | Bun (workspaces) |
| **Build** | Bun build (native) |
| **Testing** | Bun test + Playwright |
| **CI/CD** | GitHub Actions |
| **Local Deployment** | Bun processes |
| **Staging** | Docker + Docker Compose |
| **Production** | Kubernetes (Docker containers) |
| **Distribution** | npm, Homebrew, curl installer |
| **Telemetry** | PostHog (opt-in) |

### Microservices Architecture

| Service | Port | Purpose |
|---------|------|---------|
| CLI Service | 3000/3100 | Terminal user interface |
| Core Engine Service | 3001/3101 | Agent orchestration & execution |
| LLM Service | 3002/3102 | LLM provider abstraction & streaming |
| Generator Service | 3003/3103 | IaC code generation (Terraform, K8s, Helm) |
| Git Tools Service | 3004 | Git operations |
| FS Tools Service | 3005 | File system operations |
| Terraform Tools Service | 3006 | Terraform CLI operations |
| K8s Tools Service | 3007 | Kubernetes CLI operations |
| Helm Tools Service | 3008 | Helm CLI operations |
| AWS Tools Service | 3009 | AWS CLI operations |
| GitHub Tools Service | 3010 | GitHub API operations |
| State Service | 3011 | Data persistence & configuration |

---

## Architecture Overview

> **Microservices**: 12 independent services communicating via REST APIs + WebSocket

```
┌─────────────────────────────────────────────────────────────────────┐
│                   CLI SERVICE (Port 3000/3100)                       │
│                     Terminal User Interface                          │
├─────────────────────────────────────────────────────────────────────┤
│  Commands: nimbus chat | plan | apply | generate | history | config │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ REST + WebSocket
┌────────────────────────────────▼────────────────────────────────────┐
│               CORE ENGINE SERVICE (Port 3001/3101)                   │
│                 Agent Orchestration & Execution                      │
├──────────────┬──────────────┬──────────────┬───────────────────────┤
│   Planner    │   Executor   │   Verifier   │   Safety Manager      │
│              │              │              │                       │
│ - Intent     │ - Tool calls │ - Validation │ - Confirmations       │
│ - Workflow   │ - Streaming  │ - Assertions │ - Dry-run             │
│ - Steps      │ - Retry      │ - Rollback   │ - Audit log           │
└──────────────┴──────────────┴──────────────┴───────────────────────┘
                                 │ REST API
                 ┌───────────────┼───────────────┐
                 │               │               │
                 v               v               v
┌────────────────────┐  ┌────────────────────┐  ┌──────────────────┐
│   LLM SERVICE      │  │ GENERATOR SERVICE  │  │  STATE SERVICE   │
│ (Port 3002/3102)   │  │ (Port 3003/3103)   │  │   (Port 3011)    │
│                    │  │                    │  │                  │
│ ┌────────────────┐ │  │ ┌────────────────┐ │  │ ┌──────────────┐ │
│ │ Anthropic      │ │  │ │ Terraform Gen  │ │  │ │ Config       │ │
│ │ OpenAI         │ │  │ │ Kubernetes Gen │ │  │ │ History      │ │
│ │ Google         │ │  │ │ Helm Gen       │ │  │ │ Artifacts    │ │
│ │ Ollama         │ │  │ │ Templates      │ │  │ │ Credentials  │ │
│ └────────────────┘ │  │ └────────────────┘ │  │ └──────────────┘ │
└────────────────────┘  └────────────────────┘  └──────────────────┘
                                 │
                 ┌───────────────┴──────────────────┐
                 │                                  │
                 v                                  v
┌─────────────────────────────────────────────────────────────────────┐
│             MCP TOOLS SERVICES (Ports 3004-3010)                     │
│                                                                      │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│ │   Git    │ │  FS      │ │Terraform │ │   K8s    │ │   Helm   │  │
│ │ (3004)   │ │ (3005)   │ │ (3006)   │ │ (3007)   │ │ (3008)   │  │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│                                                                      │
│ ┌──────────┐ ┌──────────┐                                           │
│ │   AWS    │ │  GitHub  │                                           │
│ │ (3009)   │ │ (3010)   │                                           │
│ └──────────┘ └──────────┘                                           │
└─────────────────────────────────────────────────────────────────────┘
```

**Service Communication:**
- **CLI → Core Engine**: REST + WebSocket (execution streaming)
- **Core Engine → LLM**: REST + WebSocket (response streaming)
- **Core Engine → Generator**: REST + WebSocket (progress streaming)
- **Core Engine → MCP Tools**: REST (tool invocation)
- **All → State**: REST (persistence)

**Deployment:**
- **Local**: Bun processes on localhost
- **Staging**: Docker containers via docker-compose
- **Production**: Kubernetes pods with service mesh

---

## Competitive Landscape

### Direct Competitors

| Tool | Strengths | Weaknesses | Nimbus Advantage |
|------|-----------|------------|------------------|
| **Claude Code** | Polished UX, IDE integration | Claude-only, general purpose | Domain-specialized, model-agnostic |
| **OpenCode** | Model flexibility, open source | General purpose, no cloud focus | Cloud/DevOps specialization |
| **Goose** | Autonomous execution, Rust perf | General purpose, complex setup | Simpler, domain-focused |
| **Skyflo** | K8s operations, safety | Web-only, limited to K8s/CI | CLI-native, broader coverage |
| **Terraform Cloud** | Official, enterprise | No AI, no generation | AI-native, conversational |
| **Pulumi Copilot** | IaC focused | Pulumi-only | Multi-IaC support |

### Competitive Positioning

```
                    Specialized ◄────────────────► General Purpose
                         │                              │
            ┌────────────┼──────────────────────────────┼────────────┐
            │            │                              │            │
   Cloud    │   NIMBUS   │                              │            │
   Focused  │   ★★★★★    │                              │ Claude Code│
            │            │         Skyflo              │ OpenCode   │
            │            │         ★★★★☆              │ Goose      │
            │            │                              │ ★★★☆☆     │
            │            │                              │            │
            └────────────┼──────────────────────────────┼────────────┘
                         │                              │
                    Terminal ◄─────────────────────► Web/GUI
```

---

## Business Model

### Pricing Tiers

| Tier | Price | Features | Target |
|------|-------|----------|--------|
| **Free** | $0 | 50 operations/month, 1 cloud, community models | Individual developers |
| **Pro** | $29/mo | Unlimited ops, all clouds, all models, history | Professional engineers |
| **Team** | $79/user/mo | Pro + collaboration, audit logs, SSO | Small teams |
| **Enterprise** | Custom | Team + compliance, on-prem, SLA, support | Large organizations |

### Revenue Projections

| Phase | MRR Target | Customers |
|-------|------------|-----------|
| Release 3 (M9) | $10K | 10-20 |
| Release 4 (M12) | $50K | 50-100 |
| Year 2 | $200K | 300-500 |

---

## Success Metrics

### Product Metrics

| Metric | MVP | R2 | R3 | R4 |
|--------|-----|----|----|-----|
| Daily Active Users | 10 | 100 | 500 | 2000 |
| Operations/Day | 100 | 1K | 10K | 50K |
| Avg Session Length | 10min | 15min | 20min | 25min |
| Feature Adoption | 3 core | 60% | 75% | 85% |

### Business Metrics

| Metric | R3 Target | R4 Target |
|--------|-----------|-----------|
| MRR | $10K | $50K |
| Paying Customers | 10 | 50 |
| Churn Rate | <10% | <5% |
| NPS | 40+ | 50+ |

### Technical Metrics

| Metric | Target |
|--------|--------|
| Response Time (P95) | <5s |
| Uptime | 99.9% |
| Error Rate | <1% |
| Generation Accuracy | >95% |

---

## Team Structure

### MVP Phase (2-3 people)

| Role | Responsibilities |
|------|------------------|
| **Tech Lead / Full-Stack** | Architecture, CLI, core engine |
| **Backend Engineer** | MCP tools, LLM integration, generators |
| **DevRel / Product** | Docs, community, feedback, testing |

### Growth Phase (5-7 people)

| Role | Addition Timeline |
|------|-------------------|
| Frontend Engineer (Web Dashboard) | Release 3 |
| DevOps/Platform Engineer | Release 3 |
| Sales/Customer Success | Release 3 |
| Designer | Release 4 |

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| LLM API costs | High | Medium | Multi-model optimization, local model support |
| Competitor feature parity | Medium | High | Focus on depth over breadth, domain expertise |
| Enterprise sales cycle | High | Medium | Self-serve first, enterprise later |
| Technical complexity | Medium | High | Modular architecture, incremental delivery |
| Team burnout | Medium | High | Realistic timelines, scope management |

---

## Document Index

| Document | Description |
|----------|-------------|
| [01-mvp-spec.md](./01-mvp-spec.md) | MVP detailed specification |
| [02-release-2-spec.md](./02-release-2-spec.md) | Release 2 detailed specification |
| [03-release-3-spec.md](./03-release-3-spec.md) | Release 3 detailed specification |
| [04-release-4-spec.md](./04-release-4-spec.md) | Release 4 detailed specification |

---

---

## Capability Gap Coverage Summary

All capability gaps identified during the comprehensive gap analysis have been addressed and integrated into the respective release specifications.

### Gap Analysis Integration

| Category | Coverage | Release | Specification Reference |
|----------|----------|---------|-------------------------|
| Local File Access | 95% | MVP | `git-filesystem-tools.md` |
| Enhanced Init Command | 90% | MVP | `cli-interface-spec.md` |
| Kubernetes Access | 95% | MVP | `terraform-kubernetes-tools.md` |
| Docker Access | 90% | R2 | `github-docker-tools.md` |
| Prometheus Integration | 90% | R2 | `cicd-monitoring-tools.md` |
| Grafana Integration | 90% | R2 | `cicd-monitoring-tools.md` |
| Git Operations | 95% | MVP | `git-filesystem-tools.md` |
| GitHub Integration | 90% | MVP/R2 | `git-filesystem-tools.md`, `github-docker-tools.md` |
| Pull Request Operations | 90% | R2 | `github-docker-tools.md`, `enhanced-ui-spec.md` |
| Code Analysis | 90% | R3 | `codebase-analysis-tools.md` |
| Jenkins Integration | 85% | R2 | `cicd-monitoring-tools.md` |
| Interactive Scaffolding | 95% | R2 | `enhanced-ui-spec.md` |

All gaps are now **COMPLETE** with 85-95% coverage across all categories.

---

*Document Version: 1.1*
*Last Updated: January 2026*
*Updates: Added gap analysis integration, expanded MVP/R2/R3 capabilities*
*Authors: Product Team*
