/**
 * System Prompt Tests
 *
 * Validates that buildSystemPrompt assembles the correct prompt sections
 * based on mode, tools, NIMBUS.md, subagent state, and environment context.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { buildSystemPrompt, loadNimbusMd, type AgentMode } from '../agent/system-prompt';
import type { ToolDefinition } from '../tools/schemas/types';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal ToolDefinition for prompt tests. */
function makeTool(name: string): ToolDefinition {
  return {
    name,
    description: `Description of ${name}`,
    inputSchema: z.object({}),
    execute: async () => ({ output: 'ok', isError: false }),
    permissionTier: 'auto_allow',
    category: 'standard',
  };
}

// ---------------------------------------------------------------------------
// Temp directory for NIMBUS.md tests
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-prompt-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ===========================================================================
// buildSystemPrompt
// ===========================================================================

describe('buildSystemPrompt', () => {
  test('includes base identity', () => {
    const prompt = buildSystemPrompt({ mode: 'build', tools: [] });
    expect(prompt).toContain('You are Nimbus');
    expect(prompt).toContain('AI-powered DevOps');
  });

  test('includes mode-specific instructions for "plan"', () => {
    const prompt = buildSystemPrompt({ mode: 'plan', tools: [] });
    expect(prompt).toContain('Mode: PLAN');
    expect(prompt).toContain('NOT allowed');
  });

  test('includes mode-specific instructions for "build"', () => {
    const prompt = buildSystemPrompt({ mode: 'build', tools: [] });
    expect(prompt).toContain('Mode: BUILD');
    expect(prompt).toContain('Edit and create files');
  });

  test('includes mode-specific instructions for "deploy"', () => {
    const prompt = buildSystemPrompt({ mode: 'deploy', tools: [] });
    expect(prompt).toContain('Mode: DEPLOY');
    expect(prompt).toContain('terraform apply');
  });

  test('includes tool-use guidelines', () => {
    const prompt = buildSystemPrompt({ mode: 'build', tools: [] });
    expect(prompt).toContain('Tool-Use Guidelines');
    expect(prompt).toContain('read_file');
  });

  test('includes tools summary with correct count', () => {
    const tools = [makeTool('alpha'), makeTool('beta'), makeTool('gamma')];
    const prompt = buildSystemPrompt({ mode: 'build', tools });
    expect(prompt).toContain('Available Tools (3)');
    expect(prompt).toContain('**alpha**');
    expect(prompt).toContain('**beta**');
    expect(prompt).toContain('**gamma**');
  });

  test('includes NIMBUS.md content when provided', () => {
    const prompt = buildSystemPrompt({
      mode: 'build',
      tools: [],
      nimbusInstructions: 'Always use TypeScript strict mode.',
    });
    expect(prompt).toContain('Project Instructions (NIMBUS.md)');
    expect(prompt).toContain('Always use TypeScript strict mode.');
  });

  test('includes environment context', () => {
    const prompt = buildSystemPrompt({
      mode: 'build',
      tools: [],
      cwd: tmpDir,
    });
    expect(prompt).toContain('# Environment');
    expect(prompt).toContain(`Working directory: ${tmpDir}`);
    expect(prompt).toContain(`Platform: ${process.platform}`);
  });

  test('includes subagent instructions when activeSubagent set', () => {
    const prompt = buildSystemPrompt({
      mode: 'build',
      tools: [],
      activeSubagent: 'explore',
    });
    expect(prompt).toContain('Subagent Mode: explore');
    expect(prompt).toContain('Do NOT spawn further subagents');
  });

  test('does not include subagent section when activeSubagent is not set', () => {
    const prompt = buildSystemPrompt({ mode: 'build', tools: [] });
    expect(prompt).not.toContain('Subagent Mode');
  });

  test('includes date in environment context', () => {
    const prompt = buildSystemPrompt({ mode: 'build', tools: [] });
    // Should contain a date-like string YYYY-MM-DD
    expect(prompt).toMatch(/Date: \d{4}-\d{2}-\d{2}/);
  });
});

// ===========================================================================
// loadNimbusMd
// ===========================================================================

describe('loadNimbusMd', () => {
  test('returns null when no file exists', () => {
    const result = loadNimbusMd(tmpDir);
    expect(result).toBeNull();
  });

  test('loads NIMBUS.md from cwd', () => {
    const content = '# Custom Instructions\nDo the thing.';
    fs.writeFileSync(path.join(tmpDir, 'NIMBUS.md'), content, 'utf-8');
    const result = loadNimbusMd(tmpDir);
    expect(result).toBe(content);
  });

  test('loads NIMBUS.md from .nimbus subdirectory', () => {
    const nimbusDir = path.join(tmpDir, '.nimbus');
    fs.mkdirSync(nimbusDir, { recursive: true });
    const content = 'Sub-dir instructions';
    fs.writeFileSync(path.join(nimbusDir, 'NIMBUS.md'), content, 'utf-8');
    const result = loadNimbusMd(tmpDir);
    expect(result).toBe(content);
  });

  test('prefers cwd NIMBUS.md over .nimbus subdirectory', () => {
    // Write both
    fs.writeFileSync(path.join(tmpDir, 'NIMBUS.md'), 'root-level', 'utf-8');
    const nimbusDir = path.join(tmpDir, '.nimbus');
    fs.mkdirSync(nimbusDir, { recursive: true });
    fs.writeFileSync(path.join(nimbusDir, 'NIMBUS.md'), 'sub-level', 'utf-8');

    const result = loadNimbusMd(tmpDir);
    expect(result).toBe('root-level');
  });
});
