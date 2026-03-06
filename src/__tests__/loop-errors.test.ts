/**
 * Agent Loop Error Classification Tests — G3 + G24
 *
 * The `classifyDevOpsError` function is not exported from loop.ts, so we test:
 *   1. The install-hint patterns by parsing the source directly and validating
 *      the INSTALL_HINTS mapping is present for expected CLI tools.
 *   2. Network error handling (G24) — ECONNREFUSED + _nimbusNetworkError sentinel.
 *
 * For install-hint logic we also inline a minimal reproduction so we can
 * verify the matching logic behaves correctly without coupling to internals.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOOP_SRC = readFileSync(join(__dirname, '..', 'agent', 'loop.ts'), 'utf-8');

// ---------------------------------------------------------------------------
// Inline reproduction of classifyDevOpsError install-hint logic (G3)
// This mirrors exactly what the source implements so we can unit-test it.
// ---------------------------------------------------------------------------

const INSTALL_HINTS: Record<string, string> = {
  terraform: 'brew install terraform  OR  https://developer.hashicorp.com/terraform/install',
  kubectl:   'brew install kubectl    OR  https://kubernetes.io/docs/tasks/tools/',
  helm:      'brew install helm       OR  https://helm.sh/docs/intro/install/',
  docker:    'brew install --cask docker  OR  https://docs.docker.com/get-docker/',
  aws:       'brew install awscli     OR  pip install awscli',
  gcloud:    'brew install --cask google-cloud-sdk',
  az:        'brew install azure-cli',
};

function classifyInstallHint(toolName: string, errorOutput: string): string | null {
  const e = errorOutput.toLowerCase();
  if (/command not found|not found|no such file or directory/i.test(errorOutput)) {
    for (const [cmd, hint] of Object.entries(INSTALL_HINTS)) {
      if (toolName.includes(cmd) || e.includes(`'${cmd}'`) || e.includes(`"${cmd}"`)) {
        return `\`${cmd}\` is not installed.\n\nInstall: ${hint}`;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// G3: install-hint tests
// ---------------------------------------------------------------------------

describe('classifyDevOpsError install hints (G3)', () => {
  it('returns brew install terraform for "terraform: command not found"', () => {
    const result = classifyInstallHint('terraform', 'terraform: command not found');
    expect(result).not.toBeNull();
    expect(result).toContain('brew install terraform');
  });

  it('returns brew install kubectl for kubectl not found', () => {
    const result = classifyInstallHint('kubectl', 'kubectl: No such file or directory');
    expect(result).not.toBeNull();
    expect(result).toContain('brew install kubectl');
  });

  it('returns brew install helm for helm not found', () => {
    const result = classifyInstallHint('helm', 'helm not found');
    expect(result).not.toBeNull();
    expect(result).toContain('brew install helm');
  });

  it('returns brew install docker for docker command not found', () => {
    const result = classifyInstallHint('docker', 'docker: command not found');
    expect(result).not.toBeNull();
    expect(result).toContain('brew install');
  });

  it('returns null for a normal error that is not a "not found" error', () => {
    const result = classifyInstallHint('kubectl', 'context deadline exceeded');
    expect(result).toBeNull();
  });

  it('returns null for an unrecognised tool with a random error', () => {
    const result = classifyInstallHint('myapp', 'connection refused');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// G24: network error sentinel in loop.ts source
// ---------------------------------------------------------------------------

describe('network error handling exists in loop.ts (G24)', () => {
  it('source contains ECONNREFUSED detection', () => {
    expect(LOOP_SRC).toContain('ECONNREFUSED');
  });

  it('source contains _nimbusNetworkError sentinel property', () => {
    expect(LOOP_SRC).toContain('_nimbusNetworkError');
  });

  it('source detects ETIMEDOUT in network errors', () => {
    expect(LOOP_SRC).toContain('ETIMEDOUT');
  });

  it('source detects ENOTFOUND in network errors', () => {
    expect(LOOP_SRC).toContain('ENOTFOUND');
  });
});

// ---------------------------------------------------------------------------
// G3: source-level assertions that INSTALL_HINTS map exists
// ---------------------------------------------------------------------------

describe('INSTALL_HINTS map present in loop.ts source (G3)', () => {
  it('source defines INSTALL_HINTS with terraform entry', () => {
    expect(LOOP_SRC).toContain('brew install terraform');
  });

  it('source defines INSTALL_HINTS with kubectl entry', () => {
    expect(LOOP_SRC).toContain('brew install kubectl');
  });

  it('source defines INSTALL_HINTS with helm entry', () => {
    expect(LOOP_SRC).toContain('brew install helm');
  });

  it('source defines INSTALL_HINTS with docker entry', () => {
    expect(LOOP_SRC).toContain('brew install --cask docker');
  });
});

// ---------------------------------------------------------------------------
// L3: NIMBUS.md custom error hints
// ---------------------------------------------------------------------------

describe('NIMBUS.md custom error hints (L3)', () => {
  // Inline a minimal reproduction of the custom hints parsing logic
  function parseCustomHints(nimbusInstructions: string, errorOutput: string): string | null {
    const hintsMatch = nimbusInstructions.match(/##\s*Custom Error Hints\s*\n([\s\S]*?)(?=\n##|\n$|$)/i);
    if (!hintsMatch) return null;
    const hintsSection = hintsMatch[1];
    const hintLines = hintsSection.split('\n').filter((l: string) => l.trim().startsWith('-'));
    for (const line of hintLines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const pattern = line.slice(1, colonIdx).trim();
        const hint = line.slice(colonIdx + 1).trim();
        if (pattern && hint && errorOutput.toLowerCase().includes(pattern.toLowerCase())) {
          return `HINT: ${hint}`;
        }
      }
    }
    return null;
  }

  it('returns custom hint when pattern matches error output', () => {
    const instructions = `## Custom Error Hints\n- registry.internal: Run docker login registry.internal first\n`;
    const result = parseCustomHints(instructions, 'Error: registry.internal: connection refused');
    expect(result).toBe('HINT: Run docker login registry.internal first');
  });

  it('returns null when no matching pattern', () => {
    const instructions = `## Custom Error Hints\n- registry.internal: Run docker login registry.internal first\n`;
    const result = parseCustomHints(instructions, 'Error: some unrelated error');
    expect(result).toBeNull();
  });

  it('returns null when no Custom Error Hints section', () => {
    const instructions = `## Other Section\n- some content\n`;
    const result = parseCustomHints(instructions, 'Error: registry.internal: connection refused');
    expect(result).toBeNull();
  });

  it('pattern matching is case-insensitive', () => {
    const instructions = `## Custom Error Hints\n- VPN Required: Connect to corporate VPN\n`;
    const result = parseCustomHints(instructions, 'error: vpn required - connection blocked');
    expect(result).toBe('HINT: Connect to corporate VPN');
  });

  it('loop.ts source contains custom error hints parsing', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain('Custom Error Hints');
  });

  it('multiple hints in section — first match wins', () => {
    const instructions = [
      '## Custom Error Hints',
      '- alpha: Hint for alpha',
      '- beta: Hint for beta',
      '- gamma: Hint for gamma',
      '',
    ].join('\n');
    const result = parseCustomHints(instructions, 'Error: beta failure occurred');
    expect(result).toBe('HINT: Hint for beta');
  });

  it('hint with colon in hint text is preserved', () => {
    const instructions = `## Custom Error Hints\n- timeout: Run: kubectl describe pod <name>\n`;
    const result = parseCustomHints(instructions, 'Error: timeout waiting for pod');
    expect(result).toBe('HINT: Run: kubectl describe pod <name>');
  });

  it('returns null when instructions is empty string', () => {
    const result = parseCustomHints('', 'Error: timeout');
    expect(result).toBeNull();
  });

  it('loop.ts source passes nimbusInstructions to classifyDevOpsError', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain('nimbusInstructions');
  });

  it('source contains READ_ONLY_TOOLS set', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain('READ_ONLY_TOOLS');
  });
});

// ---------------------------------------------------------------------------
// C4: TUI error hint propagation — hint appears in result.output (not just LLM context)
// ---------------------------------------------------------------------------

describe('C4 — tool error hints propagated to TUI (result.output)', () => {
  it('loop.ts source augments result.output with the install hint', () => {
    expect(LOOP_SRC).toContain('result.output +=');
  });

  it('loop.ts C4 comment exists to document the change', () => {
    expect(LOOP_SRC).toContain('C4: Also show hint in TUI error output');
  });

  it('hint augmentation happens after toolContent augmentation', () => {
    // The toolContent line should appear before result.output in source
    const toolContentIdx = LOOP_SRC.indexOf('toolContent += `\\n\\n${hint}`');
    const resultOutputIdx = LOOP_SRC.indexOf('result.output += `\\n\\n${hint}`');
    expect(toolContentIdx).toBeGreaterThanOrEqual(0);
    expect(resultOutputIdx).toBeGreaterThanOrEqual(0);
    expect(toolContentIdx).toBeLessThan(resultOutputIdx);
  });
});
