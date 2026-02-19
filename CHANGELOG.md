# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-06-15

### Added

#### Core Platform
- Microservices architecture with 18 services running on Bun runtime
- Core Engine Service with task management, plan generation, and execution
- LLM Service with multi-provider support (Anthropic, Google, Ollama)
- Generator Service for IaC code generation with questionnaire-driven workflows
- State Service for configuration, history, conversations, artifacts, and templates
- WebSocket support for real-time streaming on core engine, LLM, and generator services

#### CLI
- Interactive AI chat with syntax-highlighted code output
- Terraform commands: plan, apply, destroy, import, validate, fmt, state management
- Kubernetes commands: get, apply, delete, logs, exec, scale, rollout, port-forward
- Helm commands: install, upgrade, uninstall, list, rollback, template, lint
- Git commands: status, clone, add, commit, push, pull, branch, merge, tag
- File system commands: read, write, search, tree, diff, copy, move
- GitHub integration: PRs, issues, releases, Actions workflows
- AI-driven Terraform generation with conversational and questionnaire modes
- Infrastructure cost estimation for Terraform plans
- Doctor command for dependency verification
- Login/logout with device code flow authentication
- Telemetry integration (opt-in) via PostHog

#### Cloud Provider Support
- AWS Tools Service: infrastructure discovery across 10+ services, Terraform generation
- GCP Tools Service: Compute Engine, Cloud Storage, GKE, IAM, Cloud Functions, VPC operations
- Azure Tools Service: VMs, Storage, AKS, IAM, Functions, Virtual Network operations
- Infrastructure discovery with real-time progress streaming for all three providers
- Terraform code generation from discovered cloud resources

#### DevOps Tools
- Git Tools Service for local repository operations via simple-git
- GitHub Tools Service for GitHub API operations via Octokit (PRs, issues, Actions, releases)
- Terraform Tools Service for full Terraform CLI lifecycle management
- Kubernetes Tools Service for kubectl operations and cluster management
- Helm Tools Service for chart and release lifecycle management
- File System Tools Service with sensitive file protection

#### Team and Enterprise
- Auth Service with device code flow and token validation
- Team Service with CRUD operations, member invitations, and role management
- Billing Service with Stripe integration, subscriptions, and usage tracking
- Audit Service with compliance logging, filterable queries, and CSV/JSON export
- RBAC-based access control for team operations

### Security
- Service-to-service authentication middleware across all services
- Rate limiting on all HTTP endpoints (configurable per service)
- Sensitive file protection in file system operations
- Input validation and sanitization on all API routes
- Stripe webhook signature verification
- Credential encryption for stored cloud provider credentials
- No credentials logged or persisted in plain text

### Infrastructure
- Bun monorepo with workspace-based dependency management
- Docker Compose configuration for local development
- Dockerfiles for all services including GCP and Azure tools
- CI/CD pipeline via GitHub Actions with type checking, linting, and tests
- Health check endpoints on every service
- Shared packages: clients, types, and utils across all services

### Developer Experience
- Swagger UI documentation on all tool services (`/swagger`)
- OpenAPI 3.0 specs served at `/api/openapi.json` on each service
- README documentation for every service
- Distributed tracing support via shared tracing utility
- Event bus for inter-service communication
- Shared REST client with service discovery
- Consistent error response format across all services (`{ success, data/error }`)
- Start-all script for launching the full platform locally
