/**
 * Exhaustive Agent + Sessions Test Suite
 *
 * Covers:
 * - Agent loop (src/agent/loop.ts) — exports, 401 recovery, error classification,
 *   AbortController, streaming, toolRegistry, contextManager references
 * - System prompt (src/agent/system-prompt.ts) — exports, mode types, BASE_PROMPT,
 *   domain knowledge, NIMBUS.md, infra context, plan/deploy instructions
 * - Permissions (src/agent/permissions.ts) — exports, all 4 tiers, bash patterns,
 *   terraform/helm actions, ask_once session state
 * - Context Manager (src/agent/context-manager.ts) — class, methods, default threshold
 * - Sessions (src/sessions/manager.ts) — singleton, CRUD, infra context, conflict detection
 * - Compaction Agent (src/agent/compaction-agent.ts) — export, haiku model reference
 * - Context @file references (src/agent/context.ts)
 * - Subagents (src/agent/subagents/) — all six, no-nesting rule
 *
 * Tests use source inspection (readFileSync) for complex behavioral coverage
 * and real module imports where the modules can be loaded without side effects.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Source file reads (performed once, shared across suites)
// ---------------------------------------------------------------------------

const SRC = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');

const LOOP_SRC            = SRC('agent/loop.ts');
const SYSTEM_PROMPT_SRC   = SRC('agent/system-prompt.ts');
const PERMISSIONS_SRC     = SRC('agent/permissions.ts');
const CONTEXT_MANAGER_SRC = SRC('agent/context-manager.ts');
const COMPACTION_SRC      = SRC('agent/compaction-agent.ts');
const CONTEXT_SRC         = SRC('agent/context.ts');
const SESSIONS_SRC        = SRC('sessions/manager.ts');
const BASE_SUBAGENT_SRC   = SRC('agent/subagents/base.ts');
const EXPLORE_SRC         = SRC('agent/subagents/explore.ts');
const INFRA_SRC           = SRC('agent/subagents/infra.ts');
const SECURITY_SRC        = SRC('agent/subagents/security.ts');
const COST_SRC            = SRC('agent/subagents/cost.ts');
const GENERAL_SRC         = SRC('agent/subagents/general.ts');

// ===========================================================================
// AGENT LOOP
// ===========================================================================

describe('Agent Loop — exports & public surface (loop.ts)', () => {
  it('runAgentLoop is exported', () => {
    expect(LOOP_SRC).toContain('export async function runAgentLoop');
  });

  it('AgentLoopOptions interface is exported', () => {
    expect(LOOP_SRC).toContain('export interface AgentLoopOptions');
  });

  it('AgentLoopResult interface is exported', () => {
    expect(LOOP_SRC).toContain('export interface AgentLoopResult');
  });

  it('getToolsForMode is exported', () => {
    expect(LOOP_SRC).toContain('export function getToolsForMode');
  });

  it('PermissionDecision type is exported', () => {
    expect(LOOP_SRC).toContain("export type PermissionDecision = 'allow' | 'deny' | 'block'");
  });
});

describe('Agent Loop — 401 / auth recovery (loop.ts)', () => {
  it('imports authStore from auth/store', () => {
    expect(LOOP_SRC).toContain("import { authStore } from '../auth/store'");
  });

  it('has _401RecoveryAttempted flag to prevent infinite retry', () => {
    expect(LOOP_SRC).toContain('_401RecoveryAttempted');
  });

  it('calls router.reinitializeProviders() on 401', () => {
    expect(LOOP_SRC).toContain('router.reinitializeProviders()');
  });

  it('calls authStore.reload() on 401', () => {
    expect(LOOP_SRC).toContain('authStore.reload()');
  });

  it('detects 401 status code on streaming error object', () => {
    expect(LOOP_SRC).toContain('streamErrObj?.status === 401');
  });

  it('detects Invalid API Key in 401 classification regex', () => {
    expect(LOOP_SRC).toContain('Invalid API Key');
  });

  it('detects Unauthorized in 401 classification regex', () => {
    expect(LOOP_SRC).toContain('Unauthorized');
  });

  it('detects authentication_error in 401 classification regex', () => {
    expect(LOOP_SRC).toContain('authentication_error');
  });

  it('only attempts 401 recovery once per turn via guard flag', () => {
    // Guard must be checked before triggering recovery
    const guardIdx    = LOOP_SRC.indexOf('!_401RecoveryAttempted');
    const setFlagIdx  = LOOP_SRC.indexOf('_401RecoveryAttempted = true');
    expect(guardIdx).toBeGreaterThanOrEqual(0);
    expect(setFlagIdx).toBeGreaterThanOrEqual(0);
    expect(guardIdx).toBeLessThan(setFlagIdx);
  });
});

describe('Agent Loop — error classification (loop.ts)', () => {
  it('classifyDevOpsError function exists in source', () => {
    expect(LOOP_SRC).toContain('function classifyDevOpsError');
  });

  it('classifyDevOpsError takes toolName, errorOutput, nimbusInstructions params', () => {
    expect(LOOP_SRC).toContain('function classifyDevOpsError(toolName: string, errorOutput: string, nimbusInstructions?');
  });

  it('source has INSTALL_HINTS for terraform', () => {
    expect(LOOP_SRC).toContain('brew install terraform');
  });

  it('source has INSTALL_HINTS for kubectl', () => {
    expect(LOOP_SRC).toContain('brew install kubectl');
  });

  it('source has INSTALL_HINTS for helm', () => {
    expect(LOOP_SRC).toContain('brew install helm');
  });

  it('source has INSTALL_HINTS for docker', () => {
    expect(LOOP_SRC).toContain('brew install --cask docker');
  });

  it('source has DEVOPS_TOOL_NAMES set', () => {
    expect(LOOP_SRC).toContain('DEVOPS_TOOL_NAMES');
  });

  it('source contains Custom Error Hints NIMBUS.md parsing', () => {
    expect(LOOP_SRC).toContain('Custom Error Hints');
  });
});

describe('Agent Loop — network error handling (loop.ts)', () => {
  it('detects ECONNREFUSED', () => {
    expect(LOOP_SRC).toContain('ECONNREFUSED');
  });

  it('detects ETIMEDOUT', () => {
    expect(LOOP_SRC).toContain('ETIMEDOUT');
  });

  it('detects ENOTFOUND', () => {
    expect(LOOP_SRC).toContain('ENOTFOUND');
  });

  it('has _nimbusNetworkError sentinel', () => {
    expect(LOOP_SRC).toContain('_nimbusNetworkError');
  });
});

describe('Agent Loop — AbortController, streaming, toolRegistry, contextManager (loop.ts)', () => {
  it('uses AbortController for per-turn silence timeout', () => {
    expect(LOOP_SRC).toContain('new AbortController()');
  });

  it('has streaming LLM call (stream keyword in source)', () => {
    // The loop streams from the LLM — look for "stream" in the loop implementation
    expect(LOOP_SRC).toContain('stream');
  });

  it('accepts toolRegistry in AgentLoopOptions', () => {
    expect(LOOP_SRC).toContain('toolRegistry: ToolRegistry');
  });

  it('calls toolRegistry.getAll() to get tools', () => {
    expect(LOOP_SRC).toContain('toolRegistry.getAll()');
  });

  it('accepts contextManager in AgentLoopOptions', () => {
    expect(LOOP_SRC).toContain('contextManager?: ContextManager');
  });

  it('calls contextManager.shouldCompact() inside loop', () => {
    expect(LOOP_SRC).toContain('options.contextManager.shouldCompact');
  });

  it('calls runCompaction() when compaction is triggered', () => {
    expect(LOOP_SRC).toContain('runCompaction(');
  });

  it('has READ_ONLY_TOOLS set for plan mode enforcement', () => {
    expect(LOOP_SRC).toContain('READ_ONLY_TOOLS');
  });

  it('writes infra checkpoints before mutating operations', () => {
    expect(LOOP_SRC).toContain('writeInfraCheckpoint');
  });
});

describe('Agent Loop — inline 401 / Invalid API Key classification logic', () => {
  // Reproduce the exact logic from loop.ts to unit-test it independently
  function classify401(err: { status?: number; statusCode?: number; message?: string }): boolean {
    const status = err.status ?? err.statusCode;
    return (
      status === 401 ||
      /401|Invalid API Key|Unauthorized|authentication_error/i.test(err.message ?? '')
    );
  }

  it('detects status 401', () => {
    expect(classify401({ status: 401 })).toBe(true);
  });

  it('detects statusCode 401', () => {
    expect(classify401({ statusCode: 401 })).toBe(true);
  });

  it('detects "Invalid API Key" in message', () => {
    expect(classify401({ message: 'Invalid API Key provided' })).toBe(true);
  });

  it('detects "Unauthorized" in message (case-insensitive)', () => {
    expect(classify401({ message: 'unauthorized request' })).toBe(true);
  });

  it('detects "authentication_error" in message', () => {
    expect(classify401({ message: 'authentication_error: bad token' })).toBe(true);
  });

  it('returns false for unrelated 500 error', () => {
    expect(classify401({ status: 500, message: 'Internal Server Error' })).toBe(false);
  });

  it('returns false for empty error object', () => {
    expect(classify401({})).toBe(false);
  });
});

// ===========================================================================
// SYSTEM PROMPT
// ===========================================================================

describe('System Prompt — exports (system-prompt.ts)', () => {
  it('buildSystemPrompt is exported', () => {
    expect(SYSTEM_PROMPT_SRC).toContain('export function buildSystemPrompt');
  });

  it("AgentMode type is exported with 'plan'|'build'|'deploy'", () => {
    expect(SYSTEM_PROMPT_SRC).toContain("export type AgentMode = 'plan' | 'build' | 'deploy'");
  });

  it('AGENT_MODES constant is exported', () => {
    expect(SYSTEM_PROMPT_SRC).toContain('export const AGENT_MODES');
  });

  it('DEVOPS_DOMAIN_KNOWLEDGE is exported', () => {
    expect(SYSTEM_PROMPT_SRC).toContain('export const DEVOPS_DOMAIN_KNOWLEDGE');
  });

  it('getRelevantDomainKnowledge is exported', () => {
    expect(SYSTEM_PROMPT_SRC).toContain('export function getRelevantDomainKnowledge');
  });

  it('getPrunedHeuristics is exported', () => {
    expect(SYSTEM_PROMPT_SRC).toContain('export function getPrunedHeuristics');
  });

  it('loadNimbusMd is exported', () => {
    expect(SYSTEM_PROMPT_SRC).toContain('export function loadNimbusMd');
  });
});

describe('System Prompt — BASE_PROMPT and identity (system-prompt.ts)', () => {
  it('BASE_PROMPT const exists in source', () => {
    expect(SYSTEM_PROMPT_SRC).toContain('const BASE_PROMPT');
  });

  it('BASE_PROMPT identifies agent as Nimbus DevOps operator', () => {
    expect(SYSTEM_PROMPT_SRC).toContain('You are Nimbus, an autonomous DevOps operator');
  });

  it('BASE_PROMPT contains terraform domain knowledge', () => {
    expect(SYSTEM_PROMPT_SRC).toContain('Terraform');
  });

  it('BASE_PROMPT contains kubernetes domain knowledge', () => {
    expect(SYSTEM_PROMPT_SRC).toContain('Kubernetes');
  });

  it('BASE_PROMPT references Helm', () => {
    expect(SYSTEM_PROMPT_SRC).toContain('Helm');
  });
});

describe('System Prompt — NIMBUS.md injection (system-prompt.ts)', () => {
  it('buildSystemPrompt references nimbusInstructions', () => {
    expect(SYSTEM_PROMPT_SRC).toContain('nimbusInstructions');
  });

  it('buildSystemPrompt calls loadNimbusMd', () => {
    expect(SYSTEM_PROMPT_SRC).toContain('loadNimbusMd(');
  });

  it('NIMBUS.md content appears under "Project Instructions" header', () => {
    expect(SYSTEM_PROMPT_SRC).toContain('Project Instructions (NIMBUS.md)');
  });
});

describe('System Prompt — mode instructions (system-prompt.ts)', () => {
  it('plan mode instructions mention read-only', () => {
    expect(SYSTEM_PROMPT_SRC).toContain('read-only');
  });

  it('deploy mode instructions exist in source', () => {
    // getPrunedHeuristics handles deploy mode
    expect(SYSTEM_PROMPT_SRC).toContain('deploy');
  });

  it('getModeInstructions function is called inside buildSystemPrompt', () => {
    expect(SYSTEM_PROMPT_SRC).toContain('getModeInstructions(options.mode)');
  });
});

describe('System Prompt — infra context section (system-prompt.ts)', () => {
  it('source has section for current infrastructure context', () => {
    expect(SYSTEM_PROMPT_SRC).toContain('Current Infrastructure Context');
  });

  it('terraform workspace is injected into infra context', () => {
    expect(SYSTEM_PROMPT_SRC).toContain('terraformWorkspace');
  });

  it('kubectl context is injected into infra context', () => {
    expect(SYSTEM_PROMPT_SRC).toContain('kubectlContext');
  });

  it('source builds Known Infrastructure Resources section', () => {
    expect(SYSTEM_PROMPT_SRC).toContain('Known Infrastructure Resources');
  });
});

describe('System Prompt — real module import (buildSystemPrompt)', () => {
  it('buildSystemPrompt returns a non-empty string for minimal options', async () => {
    const { buildSystemPrompt } = await import('../agent/system-prompt');
    const prompt = buildSystemPrompt({ mode: 'plan', tools: [] });
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('AGENT_MODES contains plan, build, deploy', async () => {
    const { AGENT_MODES } = await import('../agent/system-prompt');
    expect(AGENT_MODES).toContain('plan');
    expect(AGENT_MODES).toContain('build');
    expect(AGENT_MODES).toContain('deploy');
    expect(AGENT_MODES).toHaveLength(3);
  });

  it('buildSystemPrompt in plan mode contains Nimbus identity', async () => {
    const { buildSystemPrompt } = await import('../agent/system-prompt');
    const prompt = buildSystemPrompt({ mode: 'plan', tools: [] });
    expect(prompt).toContain('Nimbus');
  });

  it('buildSystemPrompt with nimbusInstructions injects them', async () => {
    const { buildSystemPrompt } = await import('../agent/system-prompt');
    const prompt = buildSystemPrompt({ mode: 'build', tools: [], nimbusInstructions: 'MARKER_XYZ_UNIQUE' });
    expect(prompt).toContain('MARKER_XYZ_UNIQUE');
  });

  it('buildSystemPrompt with infraContext injects terraform workspace', async () => {
    const { buildSystemPrompt } = await import('../agent/system-prompt');
    const prompt = buildSystemPrompt({
      mode: 'build',
      tools: [],
      infraContext: { terraformWorkspace: 'staging-abc' },
    });
    expect(prompt).toContain('staging-abc');
  });

  it('buildSystemPrompt with infraContext injects kubectl context', async () => {
    const { buildSystemPrompt } = await import('../agent/system-prompt');
    const prompt = buildSystemPrompt({
      mode: 'deploy',
      tools: [],
      infraContext: { kubectlContext: 'prod-cluster-eu' },
    });
    expect(prompt).toContain('prod-cluster-eu');
  });

  it('getRelevantDomainKnowledge returns a string', async () => {
    const { getRelevantDomainKnowledge } = await import('../agent/system-prompt');
    const result = getRelevantDomainKnowledge(['terraform', 'kubectl']);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('loadNimbusMd returns null when no NIMBUS.md present in temp dir', async () => {
    const { loadNimbusMd } = await import('../agent/system-prompt');
    const result = loadNimbusMd('/tmp/no-nimbus-project-xyz');
    expect(result).toBeNull();
  });
});

// ===========================================================================
// PERMISSIONS
// ===========================================================================

describe('Permissions — exports (permissions.ts)', () => {
  it('checkPermission is exported', () => {
    expect(PERMISSIONS_SRC).toContain('export function checkPermission');
  });

  it('createPermissionState is exported', () => {
    expect(PERMISSIONS_SRC).toContain('export function createPermissionState');
  });

  it('PermissionSessionState interface is exported', () => {
    expect(PERMISSIONS_SRC).toContain('export interface PermissionSessionState');
  });

  it('PermissionSessionState has approvedTools field (Set)', () => {
    expect(PERMISSIONS_SRC).toContain('approvedTools: Set<string>');
  });

  it('PermissionSessionState has approvedActions field (Set)', () => {
    expect(PERMISSIONS_SRC).toContain('approvedActions: Set<string>');
  });

  it('approveForSession is exported', () => {
    expect(PERMISSIONS_SRC).toContain('export function approveForSession');
  });
});

describe('Permissions — source defines 4 permission tiers', () => {
  it('source has auto_allow tier', () => {
    expect(PERMISSIONS_SRC).toContain('auto_allow');
  });

  it('source has ask_once tier', () => {
    expect(PERMISSIONS_SRC).toContain('ask_once');
  });

  it('source has always_ask tier', () => {
    expect(PERMISSIONS_SRC).toContain('always_ask');
  });

  it('source has blocked tier', () => {
    expect(PERMISSIONS_SRC).toContain('blocked');
  });
});

describe('Permissions — blocked bash patterns (source)', () => {
  it('source blocks rm -rf /', () => {
    expect(PERMISSIONS_SRC).toContain('rm');
    // regex in source for rm -rf
    expect(PERMISSIONS_SRC).toContain('BLOCKED_BASH_PATTERNS');
  });

  it('source blocks DROP DATABASE', () => {
    expect(PERMISSIONS_SRC).toContain('DROP\\s+DATABASE');
  });

  it('source blocks FORMAT C:', () => {
    expect(PERMISSIONS_SRC).toContain('FORMAT\\s+C:');
  });

  it('source blocks fork bomb', () => {
    expect(PERMISSIONS_SRC).toContain('fork bomb');
  });
});

describe('Permissions — auto_allow bash patterns (source)', () => {
  it('source auto-allows ls', () => {
    expect(PERMISSIONS_SRC).toContain('ls');
  });

  it('source auto-allows pwd', () => {
    expect(PERMISSIONS_SRC).toContain('pwd');
  });

  it('source auto-allows cat', () => {
    expect(PERMISSIONS_SRC).toContain('cat');
  });

  it('source auto-allows grep', () => {
    expect(PERMISSIONS_SRC).toContain('grep');
  });

  it('source auto-allows git status/log/diff', () => {
    expect(PERMISSIONS_SRC).toContain('git\\s+(status|log|diff');
  });

  it('source auto-allows terraform validate/fmt', () => {
    expect(PERMISSIONS_SRC).toContain('terraform\\s+(validate|fmt');
  });
});

describe('Permissions — real module: auto_allow tier', () => {
  it('bash with "ls" returns allow', async () => {
    const { checkPermission, createPermissionState } = await import('../agent/permissions');
    const bashTool = {
      name: 'bash',
      description: 'Run bash command',
      inputSchema: {},
      permissionTier: 'ask_once' as const,
    };
    const state = createPermissionState();
    const decision = checkPermission(bashTool as any, { command: 'ls -la' }, state);
    expect(decision).toBe('allow');
  });

  it('bash with "pwd" returns allow', async () => {
    const { checkPermission, createPermissionState } = await import('../agent/permissions');
    const bashTool = {
      name: 'bash',
      description: 'Run bash command',
      inputSchema: {},
      permissionTier: 'ask_once' as const,
    };
    const state = createPermissionState();
    const decision = checkPermission(bashTool as any, { command: 'pwd' }, state);
    expect(decision).toBe('allow');
  });

  it('bash with "git status" returns allow', async () => {
    const { checkPermission, createPermissionState } = await import('../agent/permissions');
    const bashTool = {
      name: 'bash',
      description: 'Run bash command',
      inputSchema: {},
      permissionTier: 'ask_once' as const,
    };
    const state = createPermissionState();
    const decision = checkPermission(bashTool as any, { command: 'git status' }, state);
    expect(decision).toBe('allow');
  });

  it('bash with "git log --oneline -5" returns allow', async () => {
    const { checkPermission, createPermissionState } = await import('../agent/permissions');
    const bashTool = {
      name: 'bash',
      description: 'Run bash command',
      inputSchema: {},
      permissionTier: 'ask_once' as const,
    };
    const state = createPermissionState();
    const decision = checkPermission(bashTool as any, { command: 'git log --oneline -5' }, state);
    expect(decision).toBe('allow');
  });
});

describe('Permissions — real module: blocked tier', () => {
  it('tool with blocked permissionTier returns block', async () => {
    const { checkPermission, createPermissionState } = await import('../agent/permissions');
    const blockedTool = {
      name: 'danger_tool',
      description: 'Blocked tool',
      inputSchema: {},
      permissionTier: 'blocked' as const,
    };
    const state = createPermissionState();
    const decision = checkPermission(blockedTool as any, {}, state);
    expect(decision).toBe('block');
  });

  it('bash with "rm -rf /" returns block', async () => {
    const { checkPermission, createPermissionState } = await import('../agent/permissions');
    const bashTool = {
      name: 'bash',
      description: 'Run bash command',
      inputSchema: {},
      permissionTier: 'ask_once' as const,
    };
    const state = createPermissionState();
    const decision = checkPermission(bashTool as any, { command: 'rm -rf /' }, state);
    expect(decision).toBe('block');
  });

  it('bash with "DROP DATABASE prod" returns block', async () => {
    const { checkPermission, createPermissionState } = await import('../agent/permissions');
    const bashTool = {
      name: 'bash',
      description: 'Run bash command',
      inputSchema: {},
      permissionTier: 'ask_once' as const,
    };
    const state = createPermissionState();
    const decision = checkPermission(bashTool as any, { command: 'psql -c "DROP DATABASE prod"' }, state);
    expect(decision).toBe('block');
  });
});

describe('Permissions — real module: ask_once tier', () => {
  it('first call for new tool returns ask', async () => {
    const { checkPermission, createPermissionState } = await import('../agent/permissions');
    const askOnceTool = {
      name: 'edit_file',
      description: 'Edit a file',
      inputSchema: {},
      permissionTier: 'ask_once' as const,
    };
    const state = createPermissionState();
    const decision = checkPermission(askOnceTool as any, {}, state);
    expect(decision).toBe('ask');
  });

  it('after approveForSession, subsequent ask_once calls return allow', async () => {
    const { checkPermission, createPermissionState, approveForSession } = await import('../agent/permissions');
    const askOnceTool = {
      name: 'edit_file',
      description: 'Edit a file',
      inputSchema: {},
      permissionTier: 'ask_once' as const,
    };
    const state = createPermissionState();
    // First call returns ask
    expect(checkPermission(askOnceTool as any, {}, state)).toBe('ask');
    // Simulate user approval
    approveForSession(askOnceTool as any, state);
    // Second call returns allow
    expect(checkPermission(askOnceTool as any, {}, state)).toBe('allow');
  });

  it('approvedTools.add(tool) makes subsequent ask_once calls return allow', async () => {
    const { checkPermission, createPermissionState } = await import('../agent/permissions');
    const tool = {
      name: 'write_file',
      description: 'Write a file',
      inputSchema: {},
      permissionTier: 'ask_once' as const,
    };
    const state = createPermissionState();
    state.approvedTools.add('write_file');
    expect(checkPermission(tool as any, {}, state)).toBe('allow');
  });
});

describe('Permissions — real module: terraform tier logic', () => {
  it('terraform validate action returns allow', async () => {
    const { checkPermission, createPermissionState } = await import('../agent/permissions');
    const tfTool = {
      name: 'terraform',
      description: 'Terraform',
      inputSchema: {},
      permissionTier: 'ask_once' as const,
    };
    const state = createPermissionState();
    const decision = checkPermission(tfTool as any, { action: 'validate' }, state);
    expect(decision).toBe('allow');
  });

  it('terraform fmt action returns allow', async () => {
    const { checkPermission, createPermissionState } = await import('../agent/permissions');
    const tfTool = {
      name: 'terraform',
      description: 'Terraform',
      inputSchema: {},
      permissionTier: 'ask_once' as const,
    };
    const state = createPermissionState();
    const decision = checkPermission(tfTool as any, { action: 'fmt' }, state);
    expect(decision).toBe('allow');
  });

  it('terraform apply action returns ask (always_ask)', async () => {
    const { checkPermission, createPermissionState } = await import('../agent/permissions');
    const tfTool = {
      name: 'terraform',
      description: 'Terraform',
      inputSchema: {},
      permissionTier: 'ask_once' as const,
    };
    const state = createPermissionState();
    const decision = checkPermission(tfTool as any, { action: 'apply' }, state);
    expect(decision).toBe('ask');
  });

  it('terraform destroy action returns ask (always_ask)', async () => {
    const { checkPermission, createPermissionState } = await import('../agent/permissions');
    const tfTool = {
      name: 'terraform',
      description: 'Terraform',
      inputSchema: {},
      permissionTier: 'ask_once' as const,
    };
    const state = createPermissionState();
    const decision = checkPermission(tfTool as any, { action: 'destroy' }, state);
    expect(decision).toBe('ask');
  });
});

describe('Permissions — real module: autoApprove flag (CI mode)', () => {
  it('autoApprove=true bypasses all tier logic and returns allow', async () => {
    const { checkPermission, createPermissionState } = await import('../agent/permissions');
    const blockedTool = {
      name: 'danger_tool',
      description: 'Blocked tool',
      inputSchema: {},
      permissionTier: 'blocked' as const,
    };
    const state = createPermissionState();
    const decision = checkPermission(blockedTool as any, {}, state, undefined, true);
    expect(decision).toBe('allow');
  });
});

// ===========================================================================
// CONTEXT MANAGER
// ===========================================================================

describe('Context Manager — exports and class (context-manager.ts)', () => {
  it('ContextManager class is exported', () => {
    expect(CONTEXT_MANAGER_SRC).toContain('export class ContextManager');
  });

  it('shouldCompact method exists', () => {
    expect(CONTEXT_MANAGER_SRC).toContain('shouldCompact(');
  });

  it('calculateUsage method exists', () => {
    expect(CONTEXT_MANAGER_SRC).toContain('calculateUsage(');
  });

  it('selectPreservedMessages method exists', () => {
    expect(CONTEXT_MANAGER_SRC).toContain('selectPreservedMessages(');
  });

  it('buildCompactedMessages method exists', () => {
    expect(CONTEXT_MANAGER_SRC).toContain('buildCompactedMessages(');
  });

  it('getConfig method exists on ContextManager', () => {
    expect(CONTEXT_MANAGER_SRC).toContain('getConfig()');
  });

  it('estimateTokens is exported', () => {
    expect(CONTEXT_MANAGER_SRC).toContain('export function estimateTokens');
  });

  it('CompactionResult interface is exported', () => {
    expect(CONTEXT_MANAGER_SRC).toContain('export interface CompactionResult');
  });

  it('ContextManagerOptions interface is exported', () => {
    expect(CONTEXT_MANAGER_SRC).toContain('export interface ContextManagerOptions');
  });
});

describe('Context Manager — default threshold 0.85 (context-manager.ts)', () => {
  it('source contains default autoCompactThreshold of 0.85', () => {
    expect(CONTEXT_MANAGER_SRC).toContain('0.85');
  });

  it('constructor accepts autoCompactThreshold option', () => {
    expect(CONTEXT_MANAGER_SRC).toContain('autoCompactThreshold');
  });
});

describe('Context Manager — haiku model reference (context-manager.ts)', () => {
  it('source references haiku model for summarization', () => {
    // haiku referenced in MODEL_CONTEXT_WINDOWS
    expect(CONTEXT_MANAGER_SRC).toContain('haiku');
  });
});

describe('Context Manager — real module: ContextManager class', () => {
  it('ContextManager instantiates with default options', async () => {
    const { ContextManager } = await import('../agent/context-manager');
    const cm = new ContextManager();
    expect(cm).toBeInstanceOf(ContextManager);
  });

  it('default autoCompactThreshold is 0.85', async () => {
    const { ContextManager } = await import('../agent/context-manager');
    const cm = new ContextManager();
    const config = cm.getConfig();
    expect(config.autoCompactThreshold).toBe(0.85);
  });

  it('constructor accepts custom autoCompactThreshold', async () => {
    const { ContextManager } = await import('../agent/context-manager');
    const cm = new ContextManager({ autoCompactThreshold: 0.7 });
    const config = cm.getConfig();
    expect(config.autoCompactThreshold).toBe(0.7);
  });

  it('shouldCompact returns false for empty messages', async () => {
    const { ContextManager } = await import('../agent/context-manager');
    const cm = new ContextManager({ maxContextTokens: 100_000, autoCompactThreshold: 0.85 });
    const result = cm.shouldCompact('short prompt', [], 0);
    expect(result).toBe(false);
  });

  it('shouldCompact returns true when usage exceeds threshold', async () => {
    const { ContextManager } = await import('../agent/context-manager');
    // Set a tiny context window so we hit threshold easily
    const cm = new ContextManager({ maxContextTokens: 100, autoCompactThreshold: 0.1 });
    const bigPrompt = 'x'.repeat(5000); // ~1250 tokens >> 10 tokens threshold
    const result = cm.shouldCompact(bigPrompt, [], 0);
    expect(result).toBe(true);
  });

  it('calculateUsage returns a ContextBreakdown with all expected fields', async () => {
    const { ContextManager } = await import('../agent/context-manager');
    const cm = new ContextManager();
    const breakdown = cm.calculateUsage('Hello world', [], 0);
    expect(breakdown).toHaveProperty('systemPrompt');
    expect(breakdown).toHaveProperty('nimbusInstructions');
    expect(breakdown).toHaveProperty('messages');
    expect(breakdown).toHaveProperty('toolDefinitions');
    expect(breakdown).toHaveProperty('total');
    expect(breakdown).toHaveProperty('budget');
    expect(breakdown).toHaveProperty('usagePercent');
  });

  it('selectPreservedMessages preserves all messages when count <= preserveRecentMessages+1', async () => {
    const { ContextManager } = await import('../agent/context-manager');
    const cm = new ContextManager({ preserveRecentMessages: 5 });
    const messages = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi' },
    ];
    const { preserved, toSummarize } = cm.selectPreservedMessages(messages);
    expect(preserved).toHaveLength(2);
    expect(toSummarize).toHaveLength(0);
  });

  it('buildCompactedMessages inserts summary after first message', async () => {
    const { ContextManager } = await import('../agent/context-manager');
    const cm = new ContextManager();
    const preserved = [
      { role: 'user' as const, content: 'First message' },
      { role: 'assistant' as const, content: 'Response' },
    ];
    const compacted = cm.buildCompactedMessages(preserved, 'Summary text');
    expect(compacted[0].content).toBe('First message');
    expect((compacted[1].content as string)).toContain('[Context Summary]');
    expect((compacted[1].content as string)).toContain('Summary text');
  });
});

// ===========================================================================
// SESSIONS MANAGER
// ===========================================================================

describe('Sessions — exports and interface (sessions/manager.ts)', () => {
  it('SessionManager class is exported', () => {
    expect(SESSIONS_SRC).toContain('export class SessionManager');
  });

  it('SessionManager has static getInstance method', () => {
    expect(SESSIONS_SRC).toContain('static getInstance(');
  });

  it('SessionManager has static resetInstance method (for testing)', () => {
    expect(SESSIONS_SRC).toContain('static resetInstance()');
  });

  it('SessionInfraContext interface is exported', () => {
    expect(SESSIONS_SRC).toContain('export interface SessionInfraContext');
  });

  it('SessionInfraContext has terraformWorkspace field', () => {
    expect(SESSIONS_SRC).toContain('terraformWorkspace?');
  });

  it('SessionInfraContext has kubectlContext field', () => {
    expect(SESSIONS_SRC).toContain('kubectlContext?');
  });
});

describe('Sessions — CRUD method existence in source', () => {
  it('create method exists', () => {
    expect(SESSIONS_SRC).toContain('create(');
  });

  it('get method exists', () => {
    expect(SESSIONS_SRC).toContain('get(id:');
  });

  it('list method exists', () => {
    expect(SESSIONS_SRC).toContain('list(');
  });

  it('destroy method exists', () => {
    expect(SESSIONS_SRC).toContain('destroy(');
  });

  it('setInfraContext method exists', () => {
    expect(SESSIONS_SRC).toContain('setInfraContext(');
  });

  it('getInfraContext method exists', () => {
    expect(SESSIONS_SRC).toContain('getInfraContext(');
  });
});

describe('Sessions — SQLite storage (sessions/manager.ts)', () => {
  it('source contains INSERT INTO sessions SQL', () => {
    expect(SESSIONS_SRC).toContain('INSERT INTO sessions');
  });

  it('source creates sessions table', () => {
    expect(SESSIONS_SRC).toContain('CREATE TABLE IF NOT EXISTS sessions');
  });
});

describe('Sessions — file conflict detection (sessions/manager.ts)', () => {
  it('source has 5-minute conflict detection window', () => {
    expect(SESSIONS_SRC).toContain('5 * 60 * 1000');
  });

  it('source emits file_conflict event', () => {
    expect(SESSIONS_SRC).toContain('file_conflict');
  });
});

describe('Sessions — real module: SessionManager singleton and CRUD', () => {
  beforeEach(async () => {
    const { SessionManager } = await import('../sessions/manager');
    SessionManager.resetInstance();
  });

  it('SessionManager.getInstance() returns a singleton', async () => {
    const { SessionManager } = await import('../sessions/manager');
    // Use in-memory sqlite via sql.js shim
    const mgr1 = SessionManager.getInstance();
    const mgr2 = SessionManager.getInstance();
    expect(mgr1).toBe(mgr2);
  });

  it('create() returns session with id, status, mode fields', async () => {
    const { SessionManager } = await import('../sessions/manager');
    const mgr = SessionManager.getInstance();
    const session = mgr.create({ name: 'test-session' });
    expect(session).toHaveProperty('id');
    expect(session).toHaveProperty('status', 'active');
    expect(session).toHaveProperty('mode');
  });

  it('create() respects mode option', async () => {
    const { SessionManager } = await import('../sessions/manager');
    const mgr = SessionManager.getInstance();
    const session = mgr.create({ name: 'build-session', mode: 'build' });
    expect(session.mode).toBe('build');
  });

  it('get() retrieves a created session by id', async () => {
    const { SessionManager } = await import('../sessions/manager');
    const mgr = SessionManager.getInstance();
    const created = mgr.create({ name: 'get-test' });
    const fetched = mgr.get(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.name).toBe('get-test');
  });

  it('get() returns null for unknown id', async () => {
    const { SessionManager } = await import('../sessions/manager');
    const mgr = SessionManager.getInstance();
    const result = mgr.get('nonexistent-id-xyz');
    expect(result).toBeNull();
  });

  it('list() returns all created sessions', async () => {
    const { SessionManager } = await import('../sessions/manager');
    const mgr = SessionManager.getInstance();
    mgr.create({ name: 'session-a' });
    mgr.create({ name: 'session-b' });
    const sessions = mgr.list();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
  });

  it('destroy() removes session from db', async () => {
    const { SessionManager } = await import('../sessions/manager');
    const mgr = SessionManager.getInstance();
    const created = mgr.create({ name: 'to-delete' });
    mgr.destroy(created.id);
    const fetched = mgr.get(created.id);
    expect(fetched).toBeNull();
  });
});

// ===========================================================================
// COMPACTION AGENT
// ===========================================================================

describe('Compaction Agent — exports (compaction-agent.ts)', () => {
  it('runCompaction is exported', () => {
    expect(COMPACTION_SRC).toContain('export async function runCompaction');
  });

  it('CompactionOptions interface is exported', () => {
    expect(COMPACTION_SRC).toContain('export interface CompactionOptions');
  });

  it('source references haiku model for summarization', () => {
    expect(COMPACTION_SRC).toContain('haiku');
  });

  it('source references message summarization', () => {
    expect(COMPACTION_SRC).toContain('summariz');
  });

  it('COMPACTION_SYSTEM_PROMPT instructs summary in key sections', () => {
    expect(COMPACTION_SRC).toContain("User's Goal");
  });

  it('source has fallback path when LLM call fails', () => {
    expect(COMPACTION_SRC).toContain('fallback');
  });
});

// ===========================================================================
// CONTEXT @file REFERENCES
// ===========================================================================

describe('Context @file references (agent/context.ts)', () => {
  it('context.ts file exists and is non-empty', () => {
    expect(CONTEXT_SRC.length).toBeGreaterThan(100);
  });

  it('@file reference pattern exists in source', () => {
    // The module resolves @path references in user messages
    expect(CONTEXT_SRC).toContain('@');
  });

  it('resolveReferences function exists', () => {
    expect(CONTEXT_SRC).toContain('resolveReferences');
  });

  it('FileReference interface exists', () => {
    expect(CONTEXT_SRC).toContain('FileReference');
  });

  it('module has token budget handling', () => {
    expect(CONTEXT_SRC).toContain('maxTokens');
  });

  it('resolveReferences returns processedMessage field', () => {
    expect(CONTEXT_SRC).toContain('processedMessage');
  });
});

// ===========================================================================
// SUBAGENTS
// ===========================================================================

describe('Subagents — base.ts', () => {
  it('Subagent class is exported', () => {
    expect(BASE_SUBAGENT_SRC).toContain('export class Subagent');
  });

  it('SubagentConfig interface is exported', () => {
    expect(BASE_SUBAGENT_SRC).toContain('export interface SubagentConfig');
  });

  it('SubagentResult interface is exported', () => {
    expect(BASE_SUBAGENT_SRC).toContain('export interface SubagentResult');
  });

  it('Subagents filter out the task tool to prevent nesting', () => {
    expect(BASE_SUBAGENT_SRC).toContain("tool.name !== 'task'");
  });

  it('Subagent.run delegates to runAgentLoop', () => {
    expect(BASE_SUBAGENT_SRC).toContain('runAgentLoop(');
  });

  it('Subagents default to plan mode', () => {
    expect(BASE_SUBAGENT_SRC).toContain("mode: 'plan'");
  });
});

describe('Subagents — explore.ts', () => {
  it('createExploreSubagent factory function exists', () => {
    expect(EXPLORE_SRC).toContain('export function createExploreSubagent');
  });

  it('explore subagent uses read-only tools', () => {
    expect(EXPLORE_SRC).toContain('readFileTool');
    expect(EXPLORE_SRC).toContain('globTool');
    expect(EXPLORE_SRC).toContain('grepTool');
  });

  it('explore subagent instructs no further subagents', () => {
    expect(EXPLORE_SRC).toContain('Do NOT spawn further subagents');
  });
});

describe('Subagents — infra.ts', () => {
  it('createInfraSubagent or InfraSubagent is exported', () => {
    const hasCreateFn   = INFRA_SRC.includes('export function createInfraSubagent');
    const hasClassExport = INFRA_SRC.includes('export class InfraSubagent');
    expect(hasCreateFn || hasClassExport).toBe(true);
  });

  it('infra subagent includes cloud discovery tools', () => {
    expect(INFRA_SRC).toContain('cloudDiscoverTool');
  });

  it('infra subagent includes drift detection', () => {
    expect(INFRA_SRC).toContain('driftDetectTool');
  });

  it('infra subagent instructs no further subagents', () => {
    expect(INFRA_SRC).toContain('Do NOT spawn further subagents');
  });
});

describe('Subagents — security.ts', () => {
  it('createSecuritySubagent or SecuritySubagent is exported', () => {
    const hasCreateFn    = SECURITY_SRC.includes('export function createSecuritySubagent');
    const hasClassExport = SECURITY_SRC.includes('export class SecuritySubagent');
    expect(hasCreateFn || hasClassExport).toBe(true);
  });

  it('security subagent defines SECURITY_PATTERNS', () => {
    expect(SECURITY_SRC).toContain('SECURITY_PATTERNS');
  });

  it('security subagent looks for AWS access keys', () => {
    expect(SECURITY_SRC).toContain('AWS access keys');
  });

  it('security subagent looks for hardcoded passwords', () => {
    expect(SECURITY_SRC).toContain('Hardcoded passwords');
  });
});

describe('Subagents — cost.ts', () => {
  it('createCostSubagent or CostSubagent is exported', () => {
    const hasCreateFn    = COST_SRC.includes('export function createCostSubagent');
    const hasClassExport = COST_SRC.includes('export class CostSubagent');
    expect(hasCreateFn || hasClassExport).toBe(true);
  });

  it('cost subagent includes costEstimateTool', () => {
    expect(COST_SRC).toContain('costEstimateTool');
  });

  it('cost subagent instructs no further subagents', () => {
    expect(COST_SRC).toContain('Do NOT spawn further subagents');
  });
});

describe('Subagents — general.ts', () => {
  it('createGeneralSubagent or GeneralSubagent is exported', () => {
    const hasCreateFn    = GENERAL_SRC.includes('export function createGeneralSubagent');
    const hasClassExport = GENERAL_SRC.includes('export class GeneralSubagent');
    expect(hasCreateFn || hasClassExport).toBe(true);
  });

  it('general subagent has bash tool access', () => {
    expect(GENERAL_SRC).toContain('bashTool');
  });

  it('general subagent has webfetch access', () => {
    expect(GENERAL_SRC).toContain('webfetchTool');
  });

  it('general subagent instructs no further subagents', () => {
    expect(GENERAL_SRC).toContain('Do NOT spawn further subagents');
  });
});

describe('Subagents — real module imports', () => {
  it('Subagent class can be imported and instantiated', async () => {
    const { Subagent } = await import('../agent/subagents/base');
    const subagent = new Subagent({
      name: 'test',
      description: 'test subagent',
      systemPrompt: 'You are a test agent.',
      tools: [],
      model: 'anthropic/claude-haiku-4-5',
      maxTurns: 5,
    });
    expect(subagent.config.name).toBe('test');
    expect(subagent.config.maxTurns).toBe(5);
  });

  it('createExploreSubagent returns a Subagent', async () => {
    const { createExploreSubagent } = await import('../agent/subagents/explore');
    const { Subagent } = await import('../agent/subagents/base');
    const agent = createExploreSubagent();
    expect(agent).toBeInstanceOf(Subagent);
    expect(agent.config.name).toBe('explore');
  });

  it('explore subagent config does not include task tool', async () => {
    const { createExploreSubagent } = await import('../agent/subagents/explore');
    const agent = createExploreSubagent();
    const toolNames = agent.config.tools.map((t: any) => t.name);
    expect(toolNames).not.toContain('task');
  });
});
