# Nimbus MVP — Gap Resolution Plan

> **Date**: February 2026 (Updated)
> **Reference**: `MVP-GAPS.md` (15 total gaps — 7 resolved, 8 open)
> **Constraint**: Existing test suite (3,498 pass, 14 skip, 0 fail) must remain green

---

## Solution Overview

### Resolved (Round 1)

| Gap | Solution Summary | Status |
|-----|-----------------|--------|
| 1 | Enabled GCP/Azure in CLI wizard + wired to discovery backends | **RESOLVED** |
| 2 | Replaced placeholder remediation with real kubectl/helm calls | **RESOLVED** |
| 3 | Added WebSocket server to generator service | **RESOLVED** |
| 4 | Implemented real `--wait` with rollout status polling | **RESOLVED** |
| 5 | Wired questionnaire command to generator service with fallback | **RESOLVED** |
| 6 | Implemented non-interactive terraform flow end-to-end | **RESOLVED** |
| 7 | Added Swagger to generator/state/llm services + OpenAPI specs | **RESOLVED** |

### Open (Round 2)

| Gap | Solution Summary | Files Changed | New Files | Est. Complexity |
|-----|-----------------|---------------|-----------|-----------------|
| 8 | Register persona keys in CONFIG_KEYS + migrate chat-ui reads | 2 modified | 0 | Low |
| 9 | Enable LLM fallback by default + add streaming fallback | 1 modified | 0 | Medium |
| 10 | Add cost warning hooks before destructive CLI operations | 3 modified | 1 new | Medium |
| 11 | Persist LLM token usage to state service after each request | 2 modified | 0 | Low |
| 12 | Create OpenAPI YAML specs for 6 tool services | 0 modified | 6 new | Low |
| 13 | Add `@elysiajs/swagger` to 6 tool services | 6 modified | 0 | Low |
| 14 | Configure coverage reporting + add tests to reach 80% | 1 modified | ~10 new | High |
| 15 | Add E2E tests for conversational Terraform generation flow | 0 modified | 1 new | Medium |

---

## RESOLVED — Gaps 1–7

<details>
<summary>Click to expand resolved gap details</summary>

### Gap 1: Enable GCP & Azure in Terraform Generation Wizard — RESOLVED
- Removed `disabled: true` from GCP and Azure provider options
- Added `gcpConfigStep`, `gcpServiceSelectionStep`, `azureConfigStep`, `azureServiceSelectionStep`
- Added GCP/Azure fields to `TerraformWizardContext` in `wizard/types.ts`
- Wired discovery to `gcp-tools-service:3016` and `azure-tools-service:3017`
- Extracted `pollDiscovery()` helper for provider-agnostic discovery polling

### Gap 2: Implement Real K8s & Helm Drift Remediation — RESOLVED
- `remediateKubernetes()` calls `POST /api/k8s/apply` per resource via k8s-tools-service
- `remediateHelm()` calls `POST /api/helm/upgrade` per release via helm-tools-service
- Both handle dry-run mode and service unavailability errors

### Gap 3: Add WebSocket Streaming to Generator Service — RESOLVED
- Created `services/generator-service/src/websocket.ts` with Bun WebSocket server
- Supports `generate`, `questionnaire:start`, `questionnaire:answer` messages
- Progress events: `analyzing` → `generating` → `validating` → `done`
- Health check endpoint on WebSocket port

### Gap 4: Implement Real K8s `--wait` Logic — RESOLVED
- `waitForResources()` polls `k8sClient.rollout()` for Deployments/StatefulSets/DaemonSets
- 120s timeout, 2s poll interval, spinner updates with real-time progress
- Handles timeout gracefully with resource-specific failure messages

### Gap 5: Wire Questionnaire Command to Generator Service — RESOLVED
- Checks `generatorClient.isAvailable()` at command start
- Delegates to generator service session API when available
- Falls back to `runLocal()` with warning on service unavailability or errors

### Gap 6: Implement Non-Interactive Terraform Generation — RESOLVED
- Validates required flags per provider (AWS: `--profile`, GCP: `--gcp-project`, Azure: `--azure-subscription`)
- Runs full discovery → generation pipeline without interactive prompts
- Supports `--json` flag for machine-readable output

### Gap 7: Add Swagger UI to Remaining Services — RESOLVED
- Generator service: `@elysiajs/swagger` plugin wired in `server.ts`
- State service: CDN-based Swagger UI at `/swagger`, OpenAPI at `/api/openapi.json`
- LLM service: CDN-based Swagger UI at `/swagger`, OpenAPI at `/api/openapi.json`
- Created `docs/openapi/llm-service.yaml` and `docs/openapi/generator-service.yaml`

</details>

---

## Gap 8: Register Persona Config Keys in CONFIG_KEYS

### Problem
`persona.mode` and `persona.verbosity` are read directly from `~/.nimbus/config.json` via raw `JSON.parse` in `chat-ui.ts`, bypassing the `ConfigManager` / `CONFIG_KEYS` system. Users cannot use `nimbus config set persona.mode expert` — the key is unregistered and rejected.

### Solution

**Files to modify**:
- `services/cli-service/src/config/types.ts`
- `services/cli-service/src/ui/chat-ui.ts`

**Changes**:

1. **Add persona section to `CONFIG_KEYS`** (in `types.ts`):
   - Add `persona.mode` with type `string`, default `'professional'`, description `'Chat persona mode'`, allowed values `['professional', 'assistant', 'expert']`
   - Add `persona.verbosity` with type `string`, default `'normal'`, description `'Output verbosity level'`, allowed values `['minimal', 'normal', 'detailed']`

2. **Add to `ConfigKey` union type**: Add `'persona.mode' | 'persona.verbosity'`

3. **Update `chat-ui.ts`** to read persona settings via `ConfigManager.get('persona.mode')` and `ConfigManager.get('persona.verbosity')` instead of raw `JSON.parse` of the config file

### Checkpoints

- [ ] **CP-8.1**: Add `persona.mode` to `CONFIG_KEYS` array with type `string`, default `'professional'`, and allowed values `['professional', 'assistant', 'expert']`
- [ ] **CP-8.2**: Add `persona.verbosity` to `CONFIG_KEYS` array with type `string`, default `'normal'`, and allowed values `['minimal', 'normal', 'detailed']`
- [ ] **CP-8.3**: Add `'persona.mode' | 'persona.verbosity'` to the `ConfigKey` union type
- [ ] **CP-8.4**: Update `chat-ui.ts` to read persona settings via `ConfigManager` instead of raw JSON.parse
- [ ] **CP-8.5**: Verify `nimbus config set persona.mode expert` works correctly
- [ ] **CP-8.6**: Verify `nimbus config list` shows persona keys
- [ ] **CP-8.7**: Add unit tests for persona config get/set through ConfigManager

---

## Gap 9: Enable LLM Provider Fallback by Default + Streaming Fallback

### Problem
LLM provider fallback is opt-in (`ENABLE_FALLBACK=true` env var) and disabled by default. Streaming requests have no fallback logic at all — if the provider fails mid-stream, the request dies.

### Solution

**File to modify**: `services/llm-service/src/router.ts`

**Changes**:

1. **Change default**: Set `fallback.enabled` default to `true` (instead of requiring `ENABLE_FALLBACK=true`)
   - Allow opt-out via `DISABLE_FALLBACK=true` for users who want single-provider mode

2. **Add streaming fallback** to `routeStream()`:
   - Wrap `provider.stream()` in a try/catch
   - On failure, if fallback is enabled, iterate through fallback providers
   - For each fallback provider, attempt `provider.stream()` and yield chunks
   - If all providers fail, throw the aggregate error
   - Log a warning when falling back: `'Primary provider failed, falling back to {provider}'`

3. **Add retry delay**: 100ms between fallback attempts to avoid thundering herd

### Checkpoints

- [ ] **CP-9.1**: Change `fallback.enabled` default from `process.env.ENABLE_FALLBACK === 'true'` to `process.env.DISABLE_FALLBACK !== 'true'` (enabled by default)
- [ ] **CP-9.2**: Add `routeStreamWithFallback()` method that wraps `routeStream()` with try/catch and provider iteration
- [ ] **CP-9.3**: Update `routeStream()` to call `routeStreamWithFallback()` when fallback is enabled
- [ ] **CP-9.4**: Add 100ms delay between fallback attempts
- [ ] **CP-9.5**: Log fallback events at warning level with provider names
- [ ] **CP-9.6**: Add unit tests: primary fails → fallback succeeds (completion), primary fails → fallback succeeds (streaming)
- [ ] **CP-9.7**: Add unit test: all providers fail → meaningful error message with all attempted providers listed

---

## Gap 10: Add Cost Warnings Before Destructive Operations

### Problem
`k8s delete`, `helm uninstall`, and `terraform destroy` operations proceed after a simple yes/no confirmation but never show the cost impact of what will be destroyed.

### Solution

**Files to modify**:
- `services/cli-service/src/commands/apply/k8s.ts`
- `services/cli-service/src/commands/helm.ts`
- `services/cli-service/src/commands/generate-terraform.ts` (for `terraform destroy` path)

**New file**:
- `services/cli-service/src/utils/cost-warning.ts`

**Changes**:

1. **Create `cost-warning.ts`** utility:
   - `showCostWarning(operation: string, resources: Resource[])`: Estimates cost impact of destroying resources
   - Uses the existing cost estimator (`services/cli-service/src/commands/cost/estimator.ts`) to calculate monthly cost of resources being destroyed
   - Displays a formatted warning: `"Estimated monthly cost of resources being destroyed: $X,XXX.XX"`
   - Returns a confirmation result (user can proceed or cancel)

2. **Wire into K8s delete** (`apply/k8s.ts`):
   - Before the existing confirmation prompt for `k8s delete`, call `showCostWarning('k8s delete', parsedResources)`
   - Parse the manifest to identify resource types for cost lookup

3. **Wire into Helm uninstall** (`helm.ts`):
   - Before the existing confirmation prompt for `helm uninstall`, call `showCostWarning('helm uninstall', releaseResources)`
   - Query the release's resources via `helm get manifest` to identify what will be destroyed

4. **Wire into Terraform destroy** (`generate-terraform.ts` or wherever destroy is handled):
   - Before destroying, parse the Terraform state to identify resources and their estimated costs
   - Display cost warning

### Checkpoints

- [ ] **CP-10.1**: Create `services/cli-service/src/utils/cost-warning.ts` with `showCostWarning()` function
- [ ] **CP-10.2**: Integrate cost estimator module to calculate monthly cost of resources being destroyed
- [ ] **CP-10.3**: Format warning output: resource list, individual costs, total monthly cost impact
- [ ] **CP-10.4**: Wire `showCostWarning()` into `k8s delete` command before confirmation prompt
- [ ] **CP-10.5**: Wire `showCostWarning()` into `helm uninstall` command before confirmation prompt
- [ ] **CP-10.6**: Wire `showCostWarning()` into `terraform destroy` flow before confirmation prompt
- [ ] **CP-10.7**: Add `--skip-cost-warning` flag for CI/CD usage where warnings should be suppressed
- [ ] **CP-10.8**: Add unit tests for cost warning formatting and resource parsing
- [ ] **CP-10.9**: Add integration test: destructive command → cost warning shown → user confirms → operation proceeds

---

## Gap 11: Persist LLM Token Usage to State Service

### Problem
LLM token counts are calculated per-request but never persisted. There is no historical record of LLM consumption, blocking usage dashboards and cost tracking.

### Solution

**Files to modify**:
- `services/llm-service/src/router.ts`
- `services/llm-service/src/websocket.ts`

**Changes**:

1. **Add usage persistence to `router.ts`**:
   - After each `route()` call completes, `POST` the usage data to the state service:
     ```
     POST http://localhost:3011/api/state/history
     {
       command: 'llm.completion',
       args: [model, taskType],
       status: 'success',
       duration_ms: elapsed,
       output_summary: JSON.stringify({
         promptTokens, completionTokens, totalTokens, model, provider
       })
     }
     ```
   - Fire-and-forget (don't block the response on persistence)
   - Catch and log errors silently (state service down shouldn't break LLM)

2. **Add usage persistence to `websocket.ts`**:
   - After the `done` chunk is sent, post the same usage data to state service
   - Use the `finalUsage` object already captured in the streaming handler

3. **State service URL**: Use `process.env.STATE_SERVICE_URL || 'http://localhost:3011'`

### Checkpoints

- [ ] **CP-11.1**: Add `persistUsage(model, provider, usage, durationMs)` helper function in router.ts
- [ ] **CP-11.2**: Call `persistUsage()` after `route()` completes successfully (fire-and-forget)
- [ ] **CP-11.3**: Call `persistUsage()` after streaming `done` chunk in websocket.ts (fire-and-forget)
- [ ] **CP-11.4**: Handle errors silently — log warning but don't throw
- [ ] **CP-11.5**: Add unit test: verify `fetch` is called to state service with correct payload after completion
- [ ] **CP-11.6**: Add unit test: verify persistence failure doesn't break LLM response

---

## Gap 12: Create OpenAPI Specs for 6 Tool Services

### Problem
No OpenAPI YAML specs exist in `docs/openapi/` for git-tools, fs-tools, terraform-tools, k8s-tools, helm-tools, or github-tools services.

### Solution

**New files** (6):
- `docs/openapi/git-tools.yaml`
- `docs/openapi/fs-tools.yaml`
- `docs/openapi/terraform-tools.yaml`
- `docs/openapi/k8s-tools.yaml`
- `docs/openapi/helm-tools.yaml`
- `docs/openapi/github-tools.yaml`

**Changes**:

For each service, create an OpenAPI 3.0.3 spec by reading the service's route definitions:

1. **git-tools-service** (port 3004): Document routes from `services/git-tools-service/src/routes.ts`:
   - `POST /api/git/clone`, `POST /api/git/status`, `POST /api/git/diff`, `POST /api/git/commit`, `POST /api/git/push`, `POST /api/git/pull`, `POST /api/git/branch`, `POST /api/git/log`
   - Health check at `/health`

2. **fs-tools-service** (port 3005): Document routes from `services/fs-tools-service/src/routes.ts`:
   - `POST /api/fs/read`, `POST /api/fs/write`, `POST /api/fs/list`, `POST /api/fs/mkdir`, `POST /api/fs/delete`, `POST /api/fs/copy`, `POST /api/fs/move`, `POST /api/fs/exists`
   - Health check at `/health`

3. **terraform-tools-service** (port 3006): Document routes:
   - `POST /api/terraform/init`, `POST /api/terraform/plan`, `POST /api/terraform/apply`, `POST /api/terraform/destroy`, `POST /api/terraform/validate`, `POST /api/terraform/output`, `POST /api/terraform/state`
   - Health check at `/health`

4. **k8s-tools-service** (port 3007): Document routes:
   - `POST /api/k8s/apply`, `POST /api/k8s/delete`, `POST /api/k8s/get`, `POST /api/k8s/describe`, `POST /api/k8s/logs`, `POST /api/k8s/exec`, `POST /api/k8s/scale`, `POST /api/k8s/rollout`, `POST /api/k8s/diff`
   - Health check at `/health`

5. **helm-tools-service** (port 3008): Document routes:
   - `POST /api/helm/install`, `POST /api/helm/upgrade`, `POST /api/helm/uninstall`, `POST /api/helm/list`, `POST /api/helm/status`, `POST /api/helm/rollback`, `POST /api/helm/repo`
   - Health check at `/health`

6. **github-tools-service** (port 3010): Document routes:
   - `POST /api/github/repos`, `POST /api/github/issues`, `POST /api/github/pulls`, `POST /api/github/actions`, `POST /api/github/releases`
   - Health check at `/health`

### Checkpoints

- [ ] **CP-12.1**: Read route definitions for all 6 services to confirm exact endpoints and request/response schemas
- [ ] **CP-12.2**: Create `docs/openapi/git-tools.yaml` with full endpoint documentation
- [ ] **CP-12.3**: Create `docs/openapi/fs-tools.yaml` with full endpoint documentation
- [ ] **CP-12.4**: Create `docs/openapi/terraform-tools.yaml` with full endpoint documentation
- [ ] **CP-12.5**: Create `docs/openapi/k8s-tools.yaml` with full endpoint documentation
- [ ] **CP-12.6**: Create `docs/openapi/helm-tools.yaml` with full endpoint documentation
- [ ] **CP-12.7**: Create `docs/openapi/github-tools.yaml` with full endpoint documentation
- [ ] **CP-12.8**: Validate all YAML specs parse correctly (use a YAML linter or OpenAPI validator)

---

## Gap 13: Add Swagger UI to 6 Tool Services

### Problem
The 6 MCP tool services (git, fs, terraform, k8s, helm, github) have no interactive API documentation endpoint. All 6 use Elysia, making `@elysiajs/swagger` integration straightforward.

### Solution

**Files to modify** (6):
- `services/git-tools-service/src/server.ts`
- `services/fs-tools-service/src/server.ts`
- `services/terraform-tools-service/src/server.ts`
- `services/k8s-tools-service/src/server.ts`
- `services/helm-tools-service/src/server.ts`
- `services/github-tools-service/src/server.ts`

**Also modify** (6 package.json files to add dependency):
- `services/git-tools-service/package.json`
- `services/fs-tools-service/package.json`
- `services/terraform-tools-service/package.json`
- `services/k8s-tools-service/package.json`
- `services/helm-tools-service/package.json`
- `services/github-tools-service/package.json`

**Changes** (same pattern for each):

1. Add `"@elysiajs/swagger": "^1.4.1"` to `package.json` dependencies
2. Import `swagger` from `@elysiajs/swagger` in `server.ts`
3. Add `app.use(swagger({ documentation: { info: { title: 'Nimbus <Service> API', version: '0.1.0' }, tags: [...] } }))` before route setup
4. Follow the exact pattern from `services/core-engine-service/src/server.ts:16-30`

### Checkpoints

- [ ] **CP-13.1**: Add `@elysiajs/swagger` dependency to all 6 tool service `package.json` files
- [ ] **CP-13.2**: Import and wire swagger plugin in `git-tools-service/src/server.ts`
- [ ] **CP-13.3**: Import and wire swagger plugin in `fs-tools-service/src/server.ts`
- [ ] **CP-13.4**: Import and wire swagger plugin in `terraform-tools-service/src/server.ts`
- [ ] **CP-13.5**: Import and wire swagger plugin in `k8s-tools-service/src/server.ts`
- [ ] **CP-13.6**: Import and wire swagger plugin in `helm-tools-service/src/server.ts`
- [ ] **CP-13.7**: Import and wire swagger plugin in `github-tools-service/src/server.ts`
- [ ] **CP-13.8**: Run `bun install` to resolve new dependencies
- [ ] **CP-13.9**: Verify `/swagger` endpoint returns 200 on each service
- [ ] **CP-13.10**: Add smoke tests that verify the swagger endpoints

---

## Gap 14: Configure Coverage Reporting + Increase Unit Test Coverage to 80%

### Problem
The testing spec requires 80% unit test coverage but coverage reporting is not configured, so the actual percentage is unknown. Many services have route-level tests but lack deep unit tests for internal logic.

### Solution

**Files to modify**:
- `bunfig.toml` (add coverage configuration)

**New test files** (approximately 10, based on coverage gaps):
- Tests for safety policy edge cases
- Tests for drift detector parsing logic
- Tests for individual provider implementations in LLM service
- Tests for template renderer edge cases
- Tests for cost estimator parsers
- Tests for CLI config manager operations
- Tests for WebSocket message handling
- Additional tool service internal function tests

**Changes**:

1. **Configure coverage in `bunfig.toml`**:
   ```toml
   [test]
   coverage = true
   coverageThreshold = { line = 80, function = 80, statement = 80 }
   coverageReporter = ["text", "lcov"]
   ```

2. **Run coverage report** to identify specific files below 80%

3. **Add targeted tests** for uncovered code paths (prioritize by service importance):
   - Core engine: safety policy evaluation branches, drift detector manifest parsing
   - LLM service: provider-specific error handling, token counting edge cases
   - Generator service: template rendering errors, best practices rule evaluation
   - CLI service: config manager validation, command parsing edge cases
   - Tool services: internal function logic (not just route handlers)

### Checkpoints

- [ ] **CP-14.1**: Add coverage configuration to `bunfig.toml`
- [ ] **CP-14.2**: Run initial coverage report to identify files below 80%
- [ ] **CP-14.3**: Add unit tests for core-engine safety policy edge cases
- [ ] **CP-14.4**: Add unit tests for drift detector manifest parsing
- [ ] **CP-14.5**: Add unit tests for LLM provider error handling paths
- [ ] **CP-14.6**: Add unit tests for generator template renderer edge cases
- [ ] **CP-14.7**: Add unit tests for CLI config manager validation
- [ ] **CP-14.8**: Add unit tests for cost estimator parser edge cases
- [ ] **CP-14.9**: Add unit tests for tool service internal functions
- [ ] **CP-14.10**: Re-run coverage report — verify all services at or above 80%
- [ ] **CP-14.11**: Add coverage check to CI pipeline (`.github/workflows/ci.yml`)

---

## Gap 15: Add E2E Tests for Conversational Terraform Generation

### Problem
The conversational Terraform generation flow (chat → LLM → generator → file output) has no automated E2E test. This is the primary "AI-powered" differentiator and regressions would go undetected.

### Solution

**New file**:
- `tests/e2e/conversational-terraform.test.ts`

**Changes**:

1. **Create E2E test file** that tests the full pipeline:
   - Mock the LLM service to return deterministic responses (avoid real API calls in CI)
   - Send a conversational request: `"Create a VPC with 3 subnets in us-east-1"`
   - Verify the generator service receives the structured intent
   - Verify Terraform files are generated with correct content:
     - `main.tf` with VPC resource and 3 subnet resources
     - `variables.tf` with region variable
     - `outputs.tf` with VPC ID output
   - Verify the generated Terraform is syntactically valid

2. **Test scenarios**:
   - Basic VPC generation from natural language
   - Multi-step conversation (follow-up: "add a NAT gateway")
   - Error handling: invalid request returns meaningful error
   - Provider switching: "Create the same in GCP" generates GCP-specific Terraform

3. **Test infrastructure**:
   - Start generator service and LLM service (with mock provider) in test setup
   - Use the existing `generatorClient` and `llmClient` from `@nimbus/shared-clients`
   - Clean up generated files in test teardown

### Checkpoints

- [ ] **CP-15.1**: Create `tests/e2e/conversational-terraform.test.ts` with test scaffold
- [ ] **CP-15.2**: Set up test infrastructure: start generator + mock LLM services in `beforeAll`
- [ ] **CP-15.3**: Test: basic VPC generation — send natural language → verify Terraform output files
- [ ] **CP-15.4**: Test: multi-step conversation — initial request + follow-up → verify combined output
- [ ] **CP-15.5**: Test: error case — invalid/ambiguous request → verify error response
- [ ] **CP-15.6**: Test: provider switching — request GCP generation → verify GCP-specific Terraform
- [ ] **CP-15.7**: Clean up generated files in `afterAll`
- [ ] **CP-15.8**: Verify tests pass in CI environment (no external API dependencies)

---

## Execution Strategy

### Priority Order (recommended)

| Priority | Gap | Rationale |
|----------|-----|-----------|
| P0 | Gap 8 (Persona config keys) | Quick fix; blocks user-facing configuration; 2 files |
| P0 | Gap 9 (LLM fallback default) | Resilience fix; 1 file; high user impact |
| P1 | Gap 10 (Cost warnings) | Safety feature; medium complexity; investor-visible |
| P1 | Gap 13 (Swagger on tool services) | Mechanical change; 6 services same pattern; developer experience |
| P1 | Gap 12 (OpenAPI specs) | Pairs with Gap 13; documentation completeness |
| P2 | Gap 11 (Token persistence) | Low severity; enables future cost dashboards |
| P2 | Gap 15 (E2E conv. tests) | Test coverage; low severity but high value |
| P3 | Gap 14 (Coverage 80%) | Largest effort; valuable but not user-facing |

### Parallelism

These gaps have **no dependencies** on each other and can be worked simultaneously:

```
Gap 8  (Persona config)     — touches: cli-service/config/types.ts, cli-service/ui/chat-ui.ts
Gap 9  (LLM fallback)       — touches: llm-service/src/router.ts
Gap 10 (Cost warnings)      — touches: cli-service/commands/apply/k8s.ts, helm.ts, new utils/cost-warning.ts
Gap 11 (Token persistence)  — touches: llm-service/src/router.ts, llm-service/src/websocket.ts
Gap 12 (OpenAPI specs)      — touches: docs/openapi/ (new files only)
Gap 13 (Swagger tool svcs)  — touches: 6 tool service server.ts + package.json files
Gap 14 (Test coverage)      — touches: bunfig.toml + new test files across services
Gap 15 (E2E conv. tests)    — touches: tests/e2e/ (new file only)
```

**Dependency note**: Gap 9 and Gap 11 both modify `llm-service/src/router.ts` — they touch different functions but should be coordinated to avoid merge conflicts. Gap 12 and Gap 13 are complementary (specs + Swagger) and are most efficient done together.

### Verification

After all gaps are resolved:
1. `bun test` — must remain 3,498+ pass, 0 fail (plus new tests from each gap)
2. `bun run type-check` — 0 errors
3. Coverage report shows all services ≥ 80%
4. Manual verification:
   - Gap 8: `nimbus config set persona.mode expert` → `nimbus config get persona.mode` → `expert`
   - Gap 9: Kill primary LLM provider → send chat request → fallback provider responds
   - Gap 10: `nimbus k8s delete -f deployment.yaml` → cost warning displayed → confirm → delete
   - Gap 11: Send chat request → check `nimbus history` → LLM usage recorded
   - Gap 12: All 13 OpenAPI YAML files in `docs/openapi/` parse correctly
   - Gap 13: `/swagger` returns 200 on all 10 services (4 existing + 6 new)
   - Gap 14: `bun test --coverage` shows ≥ 80% across all services
   - Gap 15: `bun test tests/e2e/conversational-terraform.test.ts` passes
5. Demo scenarios still complete successfully
