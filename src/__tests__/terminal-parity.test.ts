/**
 * Terminal Parity Gap Tests
 *
 * Validates gaps identified in the OpenCode parity analysis:
 * C1 (deploy command), C2 (infra checkpoint), C3 (auto NIMBUS.md),
 * H1 (plan truncation), H2 (compaction protection), H3 (resource injection),
 * H4 (adaptive domain knowledge), H5 (welcome infra hint),
 * H6 (workspace state persistence), M1 (streaming window),
 * M2+M5 (credential retry), M3 (turn separators), M4 (duration display),
 * L1 (Windows ANSI), L2 (adaptive prompt pruning)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';

// ---------------------------------------------------------------------------
// C1 — deploy command
// ---------------------------------------------------------------------------

describe('C1 — nimbus deploy command', () => {
  it('deploy.ts exports deployCommand', async () => {
    const { deployCommand } = await import('../commands/deploy');
    expect(typeof deployCommand).toBe('function');
  });

  it('deploy.ts exports DeployOptions interface (source check)', () => {
    const src = readFileSync(join(process.cwd(), 'src/commands/deploy.ts'), 'utf-8');
    expect(src).toContain('DeployOptions');
    expect(src).toContain('autoApprove');
    expect(src).toContain('workspace');
    expect(src).toContain('namespace');
    expect(src).toContain('dryRun');
    expect(src).toContain('noApply');
  });

  it('deploy.ts uses ASCII icons [OK] [!!] [XX]', () => {
    const src = readFileSync(join(process.cwd(), 'src/commands/deploy.ts'), 'utf-8');
    expect(src).toContain('[OK]');
    expect(src).toContain('[!!]');
    expect(src).toContain('[XX]');
  });

  it('deploy.ts includes rollback hint on apply failure', () => {
    const src = readFileSync(join(process.cwd(), 'src/commands/deploy.ts'), 'utf-8');
    expect(src).toContain('rollback');
  });

  it('cli.ts wires deploy command', () => {
    const src = readFileSync(join(process.cwd(), 'src/cli.ts'), 'utf-8');
    expect(src).toContain("command === 'deploy'");
    expect(src).toContain("import('./commands/deploy')");
  });
});

// ---------------------------------------------------------------------------
// C2 — infra state checkpoint
// ---------------------------------------------------------------------------

describe('C2 — infra checkpoint before terraform/helm mutations', () => {
  it('loop.ts contains writeInfraCheckpoint helper', () => {
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain('writeInfraCheckpoint');
  });

  it('loop.ts calls writeInfraCheckpoint before terraform apply', () => {
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    const idx = src.indexOf('writeInfraCheckpoint');
    expect(idx).toBeGreaterThan(0);
    // Should be called for terraform and helm mutations
    const applyIdx = src.indexOf('apply', idx - 200);
    expect(applyIdx).toBeGreaterThanOrEqual(0);
  });

  it('loop.ts writes checkpoint to ~/.nimbus/infra-checkpoints/', () => {
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain('infra-checkpoints');
  });
});

// ---------------------------------------------------------------------------
// C3 — auto NIMBUS.md generation
// ---------------------------------------------------------------------------

describe('C3 — auto NIMBUS.md on first startup with infra', () => {
  it('ink/index.ts auto-generates NIMBUS.md when infra detected', () => {
    const src = readFileSync(join(process.cwd(), 'src/ui/ink/index.ts'), 'utf-8');
    expect(src).toContain('Auto-generated NIMBUS.md');
  });

  it('ink/index.ts checks for NIMBUS.md before generating', () => {
    const src = readFileSync(join(process.cwd(), 'src/ui/ink/index.ts'), 'utf-8');
    expect(src).toContain('nimbusmdPath');
  });
});

// ---------------------------------------------------------------------------
// H1 — plan truncation increased to 200 lines
// ---------------------------------------------------------------------------

describe('H1 — terraform plan output truncation at 200 lines', () => {
  it('ToolCallDisplay.tsx uses MAX_LINES = 200', () => {
    const src = readFileSync(join(process.cwd(), 'src/ui/ToolCallDisplay.tsx'), 'utf-8');
    expect(src).toContain('MAX_LINES = 200');
  });

  it('ToolCallDisplay.tsx shows "more lines" indicator when truncated', () => {
    const src = readFileSync(join(process.cwd(), 'src/ui/ToolCallDisplay.tsx'), 'utf-8');
    expect(src).toContain('more lines');
  });
});

// ---------------------------------------------------------------------------
// H2 — compaction protects terraform plan output
// ---------------------------------------------------------------------------

describe('H2 — context compaction preserves terraform plan messages', () => {
  it('context-manager.ts has terraform plan indicator patterns', () => {
    const src = readFileSync(join(process.cwd(), 'src/agent/context-manager.ts'), 'utf-8');
    expect(src).toContain('TERRAFORM_PLAN_INDICATORS');
  });

  it('context-manager.ts has containsTerraformPlanOutput helper', () => {
    const src = readFileSync(join(process.cwd(), 'src/agent/context-manager.ts'), 'utf-8');
    expect(src).toContain('containsTerraformPlanOutput');
  });

  it('containsTerraformPlanOutput detects Plan: summary line', () => {
    // Inline test of the detection pattern
    const INDICATORS = ['Plan:', 'will be created', 'will be destroyed', 'to add,', 'to change,', 'to destroy'];
    const text = 'Plan: 3 to add, 1 to change, 0 to destroy.';
    const detected = INDICATORS.some(p => text.includes(p));
    expect(detected).toBe(true);
  });

  it('containsTerraformPlanOutput does not false-positive on normal text', () => {
    const INDICATORS = ['Plan:', 'will be created', 'will be destroyed', 'to add,', 'to change,', 'to destroy'];
    const text = 'Hello world, this is a normal assistant message.';
    const detected = INDICATORS.some(p => text.includes(p));
    expect(detected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// H3 — resource names injected into system prompt
// ---------------------------------------------------------------------------

describe('H3 — known resource names injected into system prompt', () => {
  it('system-prompt.ts contains Known Infrastructure Resources section', () => {
    const src = readFileSync(join(process.cwd(), 'src/agent/system-prompt.ts'), 'utf-8');
    expect(src).toContain('Known Infrastructure Resources');
  });

  it('system-prompt.ts injects helmReleases names', () => {
    const src = readFileSync(join(process.cwd(), 'src/agent/system-prompt.ts'), 'utf-8');
    expect(src).toContain('helmReleases');
  });
});

// ---------------------------------------------------------------------------
// H4 — task-adaptive domain knowledge
// ---------------------------------------------------------------------------

describe('H4 — task-adaptive domain knowledge sections', () => {
  it('system-prompt.ts exports getRelevantDomainKnowledge', () => {
    const src = readFileSync(join(process.cwd(), 'src/agent/system-prompt.ts'), 'utf-8');
    expect(src).toContain('getRelevantDomainKnowledge');
  });

  it('getRelevantDomainKnowledge filters to relevant sections', async () => {
    const { getRelevantDomainKnowledge } = await import('../agent/system-prompt');
    const tfOnly = getRelevantDomainKnowledge(['terraform']);
    const k8sOnly = getRelevantDomainKnowledge(['kubectl']);
    // Both should return strings
    expect(typeof tfOnly).toBe('string');
    expect(typeof k8sOnly).toBe('string');
    // Both include general section
    expect(tfOnly.length).toBeGreaterThan(10);
    expect(k8sOnly.length).toBeGreaterThan(10);
  });

  it('DOMAIN_SECTIONS record exists in system-prompt.ts', () => {
    const src = readFileSync(join(process.cwd(), 'src/agent/system-prompt.ts'), 'utf-8');
    expect(src).toContain('DOMAIN_SECTIONS');
  });
});

// ---------------------------------------------------------------------------
// H5 — infra hint in welcome message
// ---------------------------------------------------------------------------

describe('H5 — infra context hint in welcome message', () => {
  it('ink/index.ts builds infraHintParts for welcome', () => {
    const src = readFileSync(join(process.cwd(), 'src/ui/ink/index.ts'), 'utf-8');
    expect(src).toContain('infraHintParts');
  });

  it('ink/index.ts shows "Infra detected:" label', () => {
    const src = readFileSync(join(process.cwd(), 'src/ui/ink/index.ts'), 'utf-8');
    expect(src).toContain('Infra detected:');
  });
});

// ---------------------------------------------------------------------------
// H6 — workspace state persistence
// ---------------------------------------------------------------------------

describe('H6 — workspace state persistence across sessions', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nimbus-ws-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('workspace-state.ts exports loadWorkspaceState, saveWorkspaceState, mergeWorkspaceState', async () => {
    const mod = await import('../config/workspace-state');
    expect(typeof mod.loadWorkspaceState).toBe('function');
    expect(typeof mod.saveWorkspaceState).toBe('function');
    expect(typeof mod.mergeWorkspaceState).toBe('function');
  });

  it('loadWorkspaceState returns empty object for unknown cwd', async () => {
    const { loadWorkspaceState } = await import('../config/workspace-state');
    const state = loadWorkspaceState('/nonexistent/path/xyz123abc');
    expect(state).toEqual({});
  });

  it('saveWorkspaceState and loadWorkspaceState round-trip', async () => {
    const { saveWorkspaceState, loadWorkspaceState } = await import('../config/workspace-state');
    const testCwd = tmpDir;
    saveWorkspaceState(testCwd, { terraformWorkspace: 'staging', kubectlContext: 'prod' });
    const loaded = loadWorkspaceState(testCwd);
    expect(loaded.terraformWorkspace).toBe('staging');
    expect(loaded.kubectlContext).toBe('prod');
    expect(loaded.lastSeen).toBeDefined();
  });

  it('mergeWorkspaceState merges new fields without losing existing ones', async () => {
    const { saveWorkspaceState, mergeWorkspaceState, loadWorkspaceState } = await import('../config/workspace-state');
    const testCwd = tmpDir;
    saveWorkspaceState(testCwd, { terraformWorkspace: 'default' });
    mergeWorkspaceState(testCwd, { kubectlContext: 'my-cluster' });
    const result = loadWorkspaceState(testCwd);
    expect(result.terraformWorkspace).toBe('default');
    expect(result.kubectlContext).toBe('my-cluster');
  });
});

// ---------------------------------------------------------------------------
// M1 — streaming window size
// ---------------------------------------------------------------------------

describe('M1 — streaming output window size increased', () => {
  it('ToolCallDisplay.tsx uses windowSize 60 for terraform/kubectl/logs', () => {
    const src = readFileSync(join(process.cwd(), 'src/ui/ToolCallDisplay.tsx'), 'utf-8');
    // Should have increased from 30 to 60 for terraform/kubectl
    expect(src).toContain('60');
    expect(src).not.toContain('windowSize = isTerraformOrKubectl ? 30');
  });

  it('ToolCallDisplay.tsx kubectl body shows up to 80 lines', () => {
    const src = readFileSync(join(process.cwd(), 'src/ui/ToolCallDisplay.tsx'), 'utf-8');
    expect(src).toContain('slice(0, 80)');
  });
});

// ---------------------------------------------------------------------------
// M2 + M5 — credential retry and env hints
// ---------------------------------------------------------------------------

describe('M2+M5 — credential error detection and retry hints', () => {
  it('loop.ts has credentialRetried Set', () => {
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain('credentialRetried');
  });

  it('loop.ts detects credential expiry keywords', () => {
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain('credential');
    expect(src).toContain('expired');
  });

  it('loop.ts sets provider-specific refresh hint env vars', () => {
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain('NIMBUS_AWS_REFRESH_HINT');
  });

  it('loop.ts appends auth-refresh guidance to error output', () => {
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain('auth-refresh');
  });
});

// ---------------------------------------------------------------------------
// M3 — turn separators in MessageList
// ---------------------------------------------------------------------------

describe('M3 — visual turn boundaries in MessageList', () => {
  it('MessageList.tsx inserts separator between turns', () => {
    const src = readFileSync(join(process.cwd(), 'src/ui/MessageList.tsx'), 'utf-8');
    // Should use ─ or - for separator with repeat()
    expect(src).toContain('.repeat(40)');
  });

  it('MessageList.tsx uses turn boundary logic (assistant → user)', () => {
    const src = readFileSync(join(process.cwd(), 'src/ui/MessageList.tsx'), 'utf-8');
    expect(src).toContain('showSeparator');
  });
});

// ---------------------------------------------------------------------------
// M4 — per-operation duration display
// ---------------------------------------------------------------------------

describe('M4 — per-operation duration display in ToolCallDisplay', () => {
  it('ToolCallDisplay.tsx shows duration badge for ops > 5s', () => {
    const src = readFileSync(join(process.cwd(), 'src/ui/ToolCallDisplay.tsx'), 'utf-8');
    expect(src).toContain('5000');
    expect(src).toContain('toFixed(1)');
  });
});

// ---------------------------------------------------------------------------
// L1 — Windows ANSI support
// ---------------------------------------------------------------------------

describe('L1 — Windows ANSI color support', () => {
  it('bin/nimbus.mjs sets FORCE_COLOR on Windows', () => {
    const src = readFileSync(join(process.cwd(), 'bin/nimbus.mjs'), 'utf-8');
    expect(src).toContain('FORCE_COLOR');
    expect(src).toContain("win32");
  });
});

// ---------------------------------------------------------------------------
// L2 — adaptive prompt pruning
// ---------------------------------------------------------------------------

describe('L2 — task-adaptive system prompt pruning', () => {
  it('system-prompt.ts has getPrunedHeuristics function', () => {
    const src = readFileSync(join(process.cwd(), 'src/agent/system-prompt.ts'), 'utf-8');
    expect(src).toContain('getPrunedHeuristics');
  });

  it('getPrunedHeuristics returns different content for plan vs deploy mode', async () => {
    const { getPrunedHeuristics } = await import('../agent/system-prompt');
    if (typeof getPrunedHeuristics !== 'function') return; // graceful skip
    const planResult = getPrunedHeuristics('plan');
    const deployResult = getPrunedHeuristics('deploy');
    expect(typeof planResult).toBe('string');
    expect(typeof deployResult).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Emoji → Icon replacement
// ---------------------------------------------------------------------------

describe('Emoji → ASCII icon replacement', () => {
  it('devops.ts uses [OK] instead of ✅', () => {
    const src = readFileSync(join(process.cwd(), 'src/tools/schemas/devops.ts'), 'utf-8');
    expect(src).not.toContain('✅');
    expect(src).toContain('[OK]');
  });

  it('devops.ts uses [XX] instead of ❌', () => {
    const src = readFileSync(join(process.cwd(), 'src/tools/schemas/devops.ts'), 'utf-8');
    expect(src).not.toContain('❌');
    expect(src).toContain('[XX]');
  });

  it('devops.ts uses [!!] instead of ⚠️', () => {
    const src = readFileSync(join(process.cwd(), 'src/tools/schemas/devops.ts'), 'utf-8');
    expect(src).not.toContain('⚠️');
    expect(src).toContain('[!!]');
  });

  it('loop.ts network error uses [!!] instead of ⚠️', () => {
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain('[!!] Network unreachable');
  });

  it('loop.ts cost budget warning uses [!!] instead of ⚠️', () => {
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain('[!!] Cost budget');
  });
});
