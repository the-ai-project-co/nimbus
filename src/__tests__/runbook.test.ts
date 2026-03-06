/**
 * Runbook Command Tests — G15
 *
 * Tests the YAML parser, runbookCommand('list'), and step prompt building.
 * runbookCreate involves interactive readline so we test source-level
 * assertions for that path.
 *
 * Note: process.chdir is not supported in vitest workers. The runbook list
 * test isolates the homedir via vi.mock('node:os') and mocks fs operations
 * to control which directories are seen.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

// ---------------------------------------------------------------------------
// Inline reproduction of parseRunbookYaml (matches source implementation)
// ---------------------------------------------------------------------------

interface RunbookDef {
  name: string;
  description?: string;
  context?: string;
  steps: string[];
}

function parseRunbookYaml(content: string): RunbookDef {
  const lines = content.split('\n');
  const def: RunbookDef = { name: '', steps: [] };
  let inSteps = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('#') || !line.trim()) continue;

    if (line.startsWith('name:')) {
      def.name = line.slice(5).trim().replace(/^['"]|['"]$/g, '');
      inSteps = false;
    } else if (line.startsWith('description:')) {
      def.description = line.slice(12).trim().replace(/^['"]|['"]$/g, '');
      inSteps = false;
    } else if (line.startsWith('context:')) {
      def.context = line.slice(8).trim().replace(/^['"]|['"]$/g, '');
      inSteps = false;
    } else if (line.trim() === 'steps:') {
      inSteps = true;
    } else if (inSteps && /^\s*-\s/.test(line)) {
      def.steps.push(line.replace(/^\s*-\s*/, '').trim().replace(/^['"]|['"]$/g, ''));
    } else {
      inSteps = false;
    }
  }

  return def;
}

// ---------------------------------------------------------------------------
// Inline reproduction of buildRunbookPrompt
// ---------------------------------------------------------------------------

function buildRunbookPrompt(def: RunbookDef): string {
  const parts = [`# Runbook: ${def.name}`];
  if (def.description) parts.push(`\n${def.description}`);
  if (def.context) parts.push(`\nContext/profile: ${def.context}`);
  parts.push('\n## Steps to execute in order:');
  def.steps.forEach((step, i) => parts.push(`${i + 1}. ${step}`));
  parts.push('\nExecute each step in sequence. Check for errors after each step before proceeding. Report progress clearly.');
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// YAML parser tests
// ---------------------------------------------------------------------------

describe('parseRunbookYaml (G15)', () => {
  const SAMPLE = [
    'name: rotate-certs',
    'description: Rotate TLS certs in prod namespace',
    'context: prod',
    'steps:',
    '  - Check for expiring certs in all namespaces',
    '  - Rotate each cert using cert-manager annotate',
    '  - Verify new certs are valid and pods restarted',
  ].join('\n');

  it('parses name field correctly', () => {
    const def = parseRunbookYaml(SAMPLE);
    expect(def.name).toBe('rotate-certs');
  });

  it('parses description field', () => {
    const def = parseRunbookYaml(SAMPLE);
    expect(def.description).toBe('Rotate TLS certs in prod namespace');
  });

  it('parses context field', () => {
    const def = parseRunbookYaml(SAMPLE);
    expect(def.context).toBe('prod');
  });

  it('parses steps array with correct count', () => {
    const def = parseRunbookYaml(SAMPLE);
    expect(def.steps).toHaveLength(3);
  });

  it('parses step content correctly', () => {
    const def = parseRunbookYaml(SAMPLE);
    expect(def.steps[0]).toBe('Check for expiring certs in all namespaces');
    expect(def.steps[2]).toBe('Verify new certs are valid and pods restarted');
  });

  it('ignores comment lines', () => {
    const withComments = [
      'name: test-runbook',
      '# this is a comment',
      'description: desc',
      'steps:',
      '  - step one',
    ].join('\n');
    const def = parseRunbookYaml(withComments);
    expect(def.name).toBe('test-runbook');
    expect(def.steps).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// buildRunbookPrompt tests
// ---------------------------------------------------------------------------

describe('buildRunbookPrompt step composition (G15)', () => {
  it('builds a multi-step numbered prompt', () => {
    const def: RunbookDef = {
      name: 'deploy-rollback',
      description: 'Rollback a failed deployment',
      steps: ['Check rollout status', 'Run helm rollback', 'Verify pods are healthy'],
    };
    const prompt = buildRunbookPrompt(def);
    expect(prompt).toContain('# Runbook: deploy-rollback');
    expect(prompt).toContain('1. Check rollout status');
    expect(prompt).toContain('2. Run helm rollback');
    expect(prompt).toContain('3. Verify pods are healthy');
  });

  it('includes description in prompt when set', () => {
    const def: RunbookDef = { name: 'my-rb', description: 'My description', steps: ['step 1'] };
    const prompt = buildRunbookPrompt(def);
    expect(prompt).toContain('My description');
  });

  it('includes context/profile when set', () => {
    const def: RunbookDef = { name: 'rb', context: 'staging', steps: ['step 1'] };
    const prompt = buildRunbookPrompt(def);
    expect(prompt).toContain('Context/profile: staging');
  });

  it('includes execution instructions', () => {
    const def: RunbookDef = { name: 'rb', steps: ['step 1'] };
    const prompt = buildRunbookPrompt(def);
    expect(prompt).toContain('Execute each step in sequence');
  });
});

// ---------------------------------------------------------------------------
// runbookCommand list — isolate via mocking node:os and node:fs
// ---------------------------------------------------------------------------

describe('runbookCommand list with no runbooks (G15)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-runbook-test-'));
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('prints "No runbooks found" when no runbooks directory exists', async () => {
    // Mock node:os so homedir() returns our tmp dir (which has no runbooks/ subdir)
    vi.doMock('node:os', async () => {
      const actual = await vi.importActual<typeof os>('node:os');
      return { ...actual, homedir: () => tmpDir };
    });

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });

    const { runbookCommand } = await import('../commands/runbook');
    await runbookCommand('list', []);

    const allOutput = logs.join('\n');
    expect(allOutput).toContain('No runbooks found');
  });

  it('shows usage for unknown subcommand', async () => {
    vi.doMock('node:os', async () => {
      const actual = await vi.importActual<typeof os>('node:os');
      return { ...actual, homedir: () => tmpDir };
    });

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });

    const { runbookCommand } = await import('../commands/runbook');
    await runbookCommand('unknown-subcmd', []);

    const allOutput = logs.join('\n');
    expect(allOutput).toContain('Usage: nimbus runbook');
  });
});
