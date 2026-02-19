# Nimbus MVP — Gap Analysis Report

> **Date**: February 2026 (Updated)
> **Methodology**: Line-by-line comparison of all MVP spec documents against actual source code
> **Spec Sources**: `docs/01-mvp-spec.md` + all files in `releases/mvp/`
> **Codebase State**: 3,498 tests passing, 18 services implemented

---

## Summary

The MVP codebase is **substantially complete**. The original 7 gaps identified in the first pass have all been **resolved**. A second deep-dive analysis across all 10 spec documents uncovered **8 additional gaps** (numbered 8–15).

### Resolved Gaps (Round 1)

| # | Gap | Status |
|---|-----|--------|
| 1 | Terraform Generate: GCP & Azure disabled in CLI wizard | **RESOLVED** |
| 2 | K8s & Helm drift remediation are placeholders | **RESOLVED** |
| 3 | Generator Service WebSocket streaming not implemented | **RESOLVED** |
| 4 | K8s Apply `--wait` flag is a fake sleep | **RESOLVED** |
| 5 | Questionnaire command not integrated with Generator Service | **RESOLVED** |
| 6 | Non-interactive Terraform generation not implemented | **RESOLVED** |
| 7 | Swagger UI missing on State, LLM & Generator services | **RESOLVED** |

### Open Gaps (Round 2)

| # | Gap | Severity | Category |
|---|-----|----------|----------|
| 8 | Persona config keys not in CONFIG_KEYS registry | **Medium** | CLI / Configuration |
| 9 | LLM provider fallback disabled by default; no streaming fallback | **Medium** | LLM Service |
| 10 | No cost warnings before destructive operations | **Medium** | CLI / Safety |
| 11 | Per-operation cost/token tracking not persisted to state service | **Low** | CLI / State Service |
| 12 | OpenAPI specs missing for 6 tool services | **Low** | Documentation |
| 13 | Swagger UI missing on 6 tool services | **Low** | Documentation / API |
| 14 | Unit test coverage below 80% target in many services | **Medium** | Testing |
| 15 | E2E tests for conversational Terraform generation missing | **Low** | Testing |

---

## RESOLVED — Gap 1: Terraform Generate — GCP & Azure Disabled in CLI Wizard

> **Resolved**: GCP and Azure provider options are now enabled in the wizard. Provider-specific steps (project/subscription input, region selection, service discovery) were added. Discovery calls are wired to `gcp-tools-service:3016` and `azure-tools-service:3017`.

---

## RESOLVED — Gap 2: K8s & Helm Drift Remediation Are Placeholders

> **Resolved**: `remediateKubernetes()` now calls `POST /api/k8s/apply` on the k8s-tools-service per resource. `remediateHelm()` now calls `POST /api/helm/upgrade` on the helm-tools-service per release. Both handle dry-run and error cases.

---

## RESOLVED — Gap 3: Generator Service WebSocket Streaming Not Implemented

> **Resolved**: `services/generator-service/src/websocket.ts` created with Bun WebSocket server. Supports `generate`, `questionnaire:start`, `questionnaire:answer` message types. Streams progress events (`analyzing`, `generating`, `validating`, `done`). Health check endpoint on WebSocket port.

---

## RESOLVED — Gap 4: K8s Apply `--wait` Flag Is a Fake Sleep

> **Resolved**: `waitForResources()` function replaces the `setTimeout`. Polls `k8sClient.rollout(kind, name, 'status', {namespace})` for Deployments/StatefulSets/DaemonSets. 120s timeout, 2s poll interval, real-time spinner updates.

---

## RESOLVED — Gap 5: Questionnaire Command Not Integrated with Generator Service

> **Resolved**: `questionnaireCommand()` now checks `generatorClient.isAvailable()` first. If available, delegates session to generator service via `startQuestionnaire()` / `submitQuestionnaireAnswer()`. Falls back to local on error.

---

## RESOLVED — Gap 6: Non-Interactive Terraform Generation Not Implemented

> **Resolved**: `runNonInteractive()` now validates required flags per provider, starts discovery, polls for completion, calls generator service, writes output files. Supports `--json` for machine-readable output.

---

## RESOLVED — Gap 7: Swagger UI Missing on State, LLM & Generator Services

> **Resolved**: Generator service uses `@elysiajs/swagger`. State and LLM services serve CDN-based Swagger UI at `/swagger` with inline OpenAPI specs at `/api/openapi.json`. OpenAPI YAML specs created for both services.

---

## Gap 8: Persona Config Keys Not in CONFIG_KEYS Registry

**Severity**: Medium
**Spec Reference**: `docs/01-mvp-spec.md` Section 7.2 (Configuration), `releases/mvp/cli-team/cli-interface-spec.md` (Persona System)

### What the spec says
- `nimbus config set persona.mode <mode>` should set the persona mode (professional, assistant, expert)
- `nimbus config set persona.verbosity <level>` should set output verbosity (minimal, normal, detailed)
- `nimbus config list` should show all configuration keys including persona settings

### What actually exists
- The `CONFIG_KEYS` registry (`services/cli-service/src/config/types.ts:137-244`) defines keys for `workspace`, `llm`, `history`, `safety`, and `ui` sections — **no `persona` section exists**
- The `ConfigKey` union type (`types.ts:104-122`) does not include `persona.mode` or `persona.verbosity`
- However, `services/cli-service/src/ui/chat-ui.ts` **does read** `persona.mode` and `persona.verbosity` at startup — it reads them directly from `~/.nimbus/config.json` via raw `JSON.parse`, completely bypassing the `ConfigManager` / `CONFIG_KEYS` system
- `nimbus config set persona.mode professional` would be rejected or silently ignored because the key is unregistered

### Impact
Users cannot configure persona settings through the standard `nimbus config set/get/list` interface. The persona system works only if users manually edit `~/.nimbus/config.json`. This is inconsistent with the spec's configuration model.

---

## Gap 9: LLM Provider Fallback Disabled by Default; No Streaming Fallback

**Severity**: Medium
**Spec Reference**: `releases/mvp/llm-integration-team/llm-routing-spec.md` (Provider Failover)

### What the spec says
- The LLM router should automatically fall back to alternative providers when the primary provider fails
- Failover should be transparent to the caller
- All request types (completion, streaming, tool use) should have failover support

### What actually exists
- `services/llm-service/src/router.ts` has `RouterConfig.fallback.enabled` defaulting to `process.env.ENABLE_FALLBACK === 'true'` — **disabled by default**
- When enabled, `executeWithFallback()` (line 265) tries providers in order: `['anthropic', 'openai', 'openrouter', 'google']`
- **Streaming requests (`routeStream()`) have NO fallback logic at all** — they call `provider.stream()` directly with no retry/failover
- Tool-use requests do have fallback when enabled (`executeToolsWithFallback()`)

### Impact
- By default, if the configured LLM provider is down, all requests fail immediately with no automatic recovery
- Even when fallback is enabled, streaming chat sessions will still fail on provider errors — the most user-visible LLM interaction has the weakest resilience

---

## Gap 10: No Cost Warnings Before Destructive Operations

**Severity**: Medium
**Spec Reference**: `docs/01-mvp-spec.md` Section 6 (Safety & Guardrails), `releases/mvp/core-engine-team/agent-orchestration-spec.md` (Safety Policy)

### What the spec says
- The safety system should warn users about potential cost impact before destructive operations
- `terraform destroy`, `k8s delete`, and `helm uninstall` should show estimated cost impact
- Users should be able to confirm or cancel after seeing the cost estimate

### What actually exists
- The safety policy system (`services/core-engine-service/src/components/safety-policy.ts`) evaluates risk levels and can block HIGH_RISK operations
- However, the CLI commands for destructive operations do not call the cost estimator before execution:
  - `services/cli-service/src/commands/apply/k8s.ts` — `k8s delete` has a confirmation prompt but no cost estimate
  - `services/cli-service/src/commands/helm.ts` — `helm uninstall` has a confirmation prompt but no cost estimate
  - `services/cli-service/src/commands/generate-terraform.ts` — no cost estimate for `terraform destroy`
- The cost estimator module (`services/cli-service/src/commands/cost/estimator.ts`) exists but is only wired to the standalone `nimbus cost estimate` command — it is not called automatically before destructive operations

### Impact
Users performing destructive operations (deleting K8s resources, uninstalling Helm releases, destroying Terraform infrastructure) are not informed about the cost implications of their actions before confirming.

---

## Gap 11: Per-Operation Cost/Token Tracking Not Persisted to State Service

**Severity**: Low
**Spec Reference**: `releases/mvp/state-management-team/state-persistence-spec.md` (Usage Tracking), `docs/01-mvp-spec.md` Section 8 (Architecture — State Service)

### What the spec says
- Each LLM operation should record token usage (prompt tokens, completion tokens, total)
- Usage data should be persisted to the state service for billing, analytics, and cost dashboards
- The `nimbus cost` command should show historical usage from persisted data

### What actually exists
- The LLM service router tracks token counts in-memory during individual requests
- The WebSocket streaming handler sends `tokenCount` and `usage` in the final `done` message
- However, **no code persists these token counts to the state service** after the request completes
- The state service has `POST /api/state/history` which could store this data, but it is only called for command history (command name, args, status, duration) — not for LLM token/cost tracking
- The `nimbus cost estimate` command estimates costs from Terraform files — it does not read historical LLM usage

### Impact
There is no persistent record of LLM token consumption. Users cannot view historical cost data, and there is no foundation for usage-based billing or cost dashboards.

---

## Gap 12: OpenAPI Specs Missing for 6 Tool Services

**Severity**: Low
**Spec Reference**: `releases/mvp/devrel-qa-team/testing-documentation-spec.md` (API Documentation)

### What the spec says
- All services should have OpenAPI/Swagger documentation
- API specs should be maintained in `docs/openapi/`

### What actually exists
- `docs/openapi/` contains specs for 7 services:
  - `aws-tools.yaml`, `azure-tools.yaml`, `gcp-tools.yaml`
  - `core-engine.yaml`, `generator-service.yaml`
  - `llm-service.yaml`, `state-service.yaml`
- **No specs exist for**:
  - `git-tools-service` (port 3004)
  - `fs-tools-service` (port 3005)
  - `terraform-tools-service` (port 3006)
  - `k8s-tools-service` (port 3007)
  - `helm-tools-service` (port 3008)
  - `github-tools-service` (port 3010)

### Impact
Developers integrating with these 6 tool services have no machine-readable API contract. This makes it harder to build clients, generate SDKs, or validate API compatibility.

---

## Gap 13: Swagger UI Missing on 6 Tool Services

**Severity**: Low
**Spec Reference**: `releases/mvp/devrel-qa-team/testing-documentation-spec.md` (API Documentation)

### What the spec says
- All services should serve interactive API documentation
- Services should have Swagger UI accessible at a docs endpoint

### What actually exists
- **Services WITH Swagger UI**: core-engine (`/swagger`), generator (`/swagger`), state (`/swagger`), llm (`/swagger`)
- **Services WITHOUT any docs endpoint**:
  - `git-tools-service` (`services/git-tools-service/src/server.ts`)
  - `fs-tools-service` (`services/fs-tools-service/src/server.ts`)
  - `terraform-tools-service` (`services/terraform-tools-service/src/server.ts`)
  - `k8s-tools-service` (`services/k8s-tools-service/src/server.ts`)
  - `helm-tools-service` (`services/helm-tools-service/src/server.ts`)
  - `github-tools-service` (`services/github-tools-service/src/server.ts`)
- These 6 services use Elysia, so adding `@elysiajs/swagger` would be straightforward

### Impact
Developers cannot browse interactive API docs for any of the MCP tool services. They must read source code or static documentation to understand available endpoints.

---

## Gap 14: Unit Test Coverage Below 80% Target in Many Services

**Severity**: Medium
**Spec Reference**: `releases/mvp/devrel-qa-team/testing-documentation-spec.md` (Testing Strategy — Coverage Targets)

### What the spec says
- Unit test coverage target: **80%** for all services
- Integration test coverage target: 60%
- E2E coverage target: 40%
- Coverage reports should be generated as part of CI

### What actually exists
- Total test count is healthy: **3,498 pass, 14 skip, 0 fail**
- However, many services lack comprehensive unit tests for their internal logic:
  - Tool services (git, fs, terraform, k8s, helm, github) have route-level tests but limited unit tests for internal functions
  - The core-engine service has good coverage on orchestration but light coverage on individual components (e.g., safety policy edge cases, drift detector parsing)
  - Coverage reporting is not configured in the CI pipeline (`bunfig.toml` has no coverage settings)
- Without coverage tooling, the actual percentage is unmeasured

### Impact
The 80% unit test coverage target specified in the testing strategy cannot be verified or enforced. There may be untested code paths that could harbor bugs.

---

## Gap 15: E2E Tests for Conversational Terraform Generation Missing

**Severity**: Low
**Spec Reference**: `releases/mvp/devrel-qa-team/testing-documentation-spec.md` (E2E Test Scenarios), `releases/mvp/generator-engine-team/terraform-generator-spec.md`

### What the spec says
- E2E tests should cover the full conversational Terraform generation flow:
  1. User sends natural language request via chat
  2. LLM service processes intent
  3. Generator service produces Terraform files
  4. Files are written and validated
- E2E tests for all three generation modes: wizard, questionnaire, and conversational

### What actually exists
- E2E tests exist for the wizard flow and questionnaire flow
- **No E2E test covers the conversational flow** end-to-end (chat → LLM → generator → file output)
- Unit tests for the conversational engine exist (`tests/unit/conversational-engine.test.ts`) but they mock the LLM responses and don't test the full pipeline
- The `scripts/demos/02-terraform-vpc.sh` demo script covers this flow manually but is not part of the automated test suite

### Impact
The conversational generation path — which is the primary "AI-powered" differentiator of Nimbus — has no automated E2E validation. Regressions in the LLM-to-generator pipeline could go undetected.

---

## Verification Notes

- All gaps verified by reading actual source code, not just checking file existence
- Gaps 1-7 were resolved in the first implementation round and verified with 3,498 tests passing
- The chat slash commands (`/model`, `/persona`, `/clear`, `/history`, `/help`) were verified as implemented in `services/cli-service/src/ui/chat-ui.ts`
- The `nimbus auth` commands were verified as implemented across `auth-status.ts`, `auth-list.ts`, and `auth-cloud.ts`
- The Homebrew formula exists at `Formula/nimbus.rb` (SHA placeholder for release script)
- Demo scripts exist at `scripts/demos/` with 4 scenarios + setup + validation scripts
- Current test suite: **3,498 pass, 14 skip, 0 fail**
