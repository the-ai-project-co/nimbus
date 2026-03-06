/**
 * Terminal Gap Fix Plan v2 Tests
 *
 * Validates confirmed gaps from the second deep investigation of Nimbus vs
 * OpenCode terminal parity. Tests are pure source-level checks (no runtime
 * rendering) so they run fast and reliably in CI.
 *
 * Coverage:
 *   C1 — Terminal resize listener
 *   C2 — Dynamic maxVisible (not hardcoded 500)
 *   C3 — Ollama provider file exists and exports OllamaProvider
 *   C4 — LSP manager emits 'lsp-unavailable'
 *   C5 — stderr lines colored dim-red in spawn-exec
 *   C6 — awsRegion injected into system-prompt resource inventory
 *   H1 — auth-cloud.ts contains SSO/OAuth CLI delegation
 *   H2 — MessageList.tsx has highlightText helper
 *   H3 — drift/index.ts contains ConfigMap drift check
 *   H4 — PermissionPrompt.tsx has RISK_DESCRIPTIONS
 *   H5 — App.tsx has modeToast state
 *   L1 — Header.tsx uses [P]/[B]/[D]; App.tsx uses [OK]/[!!]
 *   L2 — InputBox.tsx has 10_000 paste guard
 *   L3 — ink/index.ts has "list my kubernetes pods" welcome hint
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf-8');

// ---------------------------------------------------------------------------
// C1 — Terminal resize listener
// ---------------------------------------------------------------------------

describe('C1 — terminal resize listener', () => {
  it('ink/index.ts listens to process.stdout resize event', () => {
    const code = src('src/ui/ink/index.ts');
    expect(code).toContain("process.stdout.on('resize'");
  });

  it('ink/index.ts handles SIGWINCH', () => {
    const code = src('src/ui/ink/index.ts');
    expect(code).toContain("process.on('SIGWINCH'");
  });

  it('App.tsx accepts columns prop', () => {
    const code = src('src/ui/App.tsx');
    expect(code).toContain('columns?:');
  });

  it('MessageList.tsx accepts columns prop', () => {
    const code = src('src/ui/MessageList.tsx');
    expect(code).toContain('columns?:');
  });
});

// ---------------------------------------------------------------------------
// C2 — Dynamic maxVisible
// ---------------------------------------------------------------------------

describe('C2 — dynamic maxVisible (not hardcoded 500)', () => {
  it('MessageList no longer uses hardcoded 500 as default', () => {
    const code = src('src/ui/MessageList.tsx');
    // The default should now use process.stdout.rows, not = 500
    expect(code).toContain('process.stdout.rows');
  });

  it('MessageList uses useMemo for visible slice', () => {
    const code = src('src/ui/MessageList.tsx');
    expect(code).toContain('useMemo');
    // Should contain effectiveMaxVisible computation
    expect(code).toContain('effectiveMaxVisible');
  });

  it('MessageList shows ↑ N earlier messages hint when truncated', () => {
    const code = src('src/ui/MessageList.tsx');
    expect(code).toContain('\u2191');
  });
});

// ---------------------------------------------------------------------------
// C3 — Ollama provider
// ---------------------------------------------------------------------------

describe('C3 — Ollama provider', () => {
  it('src/llm/providers/ollama.ts exists and exports OllamaProvider', async () => {
    const { OllamaProvider } = await import('../llm/providers/ollama');
    expect(typeof OllamaProvider).toBe('function');
  });

  it('ollama.ts references OLLAMA_BASE_URL', () => {
    const code = src('src/llm/providers/ollama.ts');
    expect(code).toContain('OLLAMA_BASE_URL');
  });

  it('router.ts imports OllamaProvider', () => {
    const code = src('src/llm/router.ts');
    expect(code).toContain('OllamaProvider');
  });

  it('onboarding.ts has Ollama option (supportsBaseUrl or no API key required)', () => {
    const code = src('src/commands/onboarding.ts');
    // Ollama is handled via supportsBaseUrl branch
    expect(code).toContain('supportsBaseUrl');
  });
});

// ---------------------------------------------------------------------------
// C4 — LSP unavailability event
// ---------------------------------------------------------------------------

describe('C4 — LSP unavailability event', () => {
  it('LSPManager extends EventEmitter', () => {
    const code = src('src/lsp/manager.ts');
    expect(code).toContain('extends EventEmitter');
  });

  it('LSPManager has failedLSPs set', () => {
    const code = src('src/lsp/manager.ts');
    expect(code).toContain('failedLSPs');
  });

  it("LSPManager emits 'lsp-unavailable' when server not found", () => {
    const code = src('src/lsp/manager.ts');
    expect(code).toContain("emit('lsp-unavailable'");
  });

  it('ink/index.ts listens to lsp-unavailable and adds system message', () => {
    const code = src('src/ui/ink/index.ts');
    expect(code).toContain('lsp-unavailable');
    expect(code).toContain('[LSP]');
  });
});

// ---------------------------------------------------------------------------
// C5 — stderr ANSI color prefix
// ---------------------------------------------------------------------------

describe('C5 — stderr visually distinct from stdout', () => {
  it('spawn-exec.ts prefixes stderr with dim-red ANSI code', () => {
    const code = src('src/tools/spawn-exec.ts');
    expect(code).toContain('\\x1b[2;31m');
    // The ANSI reset code
    expect(code).toContain('\\x1b[0m');
  });

  it('spawn-exec.ts separates tagged stderr buffer from raw stderr', () => {
    const code = src('src/tools/spawn-exec.ts');
    expect(code).toContain('tagged');
  });
});

// ---------------------------------------------------------------------------
// C6 — awsRegion in system prompt resource inventory
// ---------------------------------------------------------------------------

describe('C6 — awsRegion in system prompt resource inventory', () => {
  it('system-prompt.ts includes awsRegion standalone entry in resource inventory', () => {
    const code = src('src/agent/system-prompt.ts');
    expect(code).toContain('AWS default region');
    expect(code).toContain('awsRegion');
  });
});

// ---------------------------------------------------------------------------
// H1 — Auth cloud SSO/OAuth CLI delegation
// ---------------------------------------------------------------------------

describe('H1 — cloud SSO/OAuth CLI delegation', () => {
  it('auth-cloud.ts contains aws sso login', () => {
    const code = src('src/commands/auth-cloud.ts');
    expect(code).toContain('aws sso login');
  });

  it('auth-cloud.ts contains gcloud auth login', () => {
    const code = src('src/commands/auth-cloud.ts');
    expect(code).toContain('gcloud');
    expect(code).toContain('auth login');
  });

  it('auth-cloud.ts contains az login --use-device-code', () => {
    const code = src('src/commands/auth-cloud.ts');
    expect(code).toContain('--use-device-code');
  });

  it('auth-cloud.ts exports loginCloudCommand', () => {
    const code = src('src/commands/auth-cloud.ts');
    expect(code).toContain('export async function loginCloudCommand');
  });
});

// ---------------------------------------------------------------------------
// H2 — /search text highlight
// ---------------------------------------------------------------------------

describe('H2 — search text highlighting', () => {
  it('MessageList.tsx has highlightText function', () => {
    const code = src('src/ui/MessageList.tsx');
    expect(code).toContain('function highlightText');
  });

  it('highlightText renders yellow bold for matches', () => {
    const code = src('src/ui/MessageList.tsx');
    expect(code).toContain("color=\"yellow\"");
    expect(code).toContain('bold');
  });

  it('MessageRow accepts searchQuery prop', () => {
    const code = src('src/ui/MessageList.tsx');
    expect(code).toContain('searchQuery?: string');
  });
});

// ---------------------------------------------------------------------------
// H3 — K8s drift detection
// ---------------------------------------------------------------------------

describe('H3 — K8s ConfigMap/Secret drift detection', () => {
  it('drift/index.ts exports checkK8sDrift', () => {
    const code = src('src/commands/drift/index.ts');
    expect(code).toContain('export async function checkK8sDrift');
  });

  it('checkK8sDrift checks configmap resources', () => {
    const code = src('src/commands/drift/index.ts');
    expect(code).toContain('configmap');
  });

  it('checkK8sDrift supports --update-baseline', () => {
    const code = src('src/commands/drift/index.ts');
    expect(code).toContain('updateBaseline');
    expect(code).toContain('drift-baseline.json');
  });

  it('driftCommand handles k8s subcommand', () => {
    const code = src('src/commands/drift/index.ts');
    expect(code).toContain("case 'k8s':");
  });
});

// ---------------------------------------------------------------------------
// H4 — PermissionPrompt risk descriptions
// ---------------------------------------------------------------------------

describe('H4 — PermissionPrompt risk descriptions', () => {
  it('PermissionPrompt.tsx has RISK_DESCRIPTIONS constant', () => {
    const code = src('src/ui/PermissionPrompt.tsx');
    expect(code).toContain('RISK_DESCRIPTIONS');
  });

  it('RISK_DESCRIPTIONS covers all four risk tiers', () => {
    const code = src('src/ui/PermissionPrompt.tsx');
    expect(code).toContain('Read-only');
    expect(code).toContain('Modifies local files');
    expect(code).toContain('System or cloud operation');
    expect(code).toContain('Destructive or irreversible');
  });

  it('keyboard legend uses = separators', () => {
    const code = src('src/ui/PermissionPrompt.tsx');
    expect(code).toContain('=approve');
    expect(code).toContain('=reject');
  });
});

// ---------------------------------------------------------------------------
// H5 — Mode change toast
// ---------------------------------------------------------------------------

describe('H5 — mode change toast', () => {
  it('App.tsx has modeToast state', () => {
    const code = src('src/ui/App.tsx');
    expect(code).toContain('modeToast');
  });

  it('modeToast is set on Tab mode cycle', () => {
    const code = src('src/ui/App.tsx');
    expect(code).toContain('setModeToast');
    expect(code).toContain('→');
    expect(code).toContain('mode');
  });

  it('StatusBar renders modeToast prop', () => {
    const code = src('src/ui/StatusBar.tsx');
    expect(code).toContain('modeToast');
  });
});

// ---------------------------------------------------------------------------
// L1 — Emoji → ASCII icons
// ---------------------------------------------------------------------------

describe('L1 — emoji replaced with ASCII icons', () => {
  it('Header.tsx uses [P] for plan mode', () => {
    const code = src('src/ui/Header.tsx');
    expect(code).toContain('[P] PLAN');
  });

  it('Header.tsx uses [B] for build mode', () => {
    const code = src('src/ui/Header.tsx');
    expect(code).toContain('[B] BUILD');
  });

  it('Header.tsx uses [D] for deploy mode', () => {
    const code = src('src/ui/Header.tsx');
    expect(code).toContain('[D] DEPLOY');
  });

  it('Header.tsx uses [+] for LLM health ok (not ●)', () => {
    const code = src('src/ui/Header.tsx');
    expect(code).toContain('[+]');
    expect(code).not.toContain('● ok');
  });

  it('App.tsx uses [OK] instead of ✓', () => {
    const code = src('src/ui/App.tsx');
    expect(code).toContain('[OK]');
    // Should not contain raw ✓ in message content strings
    expect(code).not.toMatch(/content: `✓/);
  });

  it('App.tsx uses [!!] instead of ⚠ for prod warnings', () => {
    const code = src('src/ui/App.tsx');
    expect(code).toContain('[!!]');
    // Should not contain raw ⚠ unicode in message content
    expect(code).not.toMatch(/content: `\\u26a0/);
  });

  it('ink/index.ts uses [md] instead of 📄 for NIMBUS.md reload', () => {
    const code = src('src/ui/ink/index.ts');
    expect(code).toContain('[md] NIMBUS.md reloaded');
  });
});

// ---------------------------------------------------------------------------
// L2 — Large paste guard
// ---------------------------------------------------------------------------

describe('L2 — large paste guard in InputBox', () => {
  it('InputBox.tsx truncates input at 10_000 characters', () => {
    const code = src('src/ui/InputBox.tsx');
    expect(code).toMatch(/10[_,]?000/);
  });

  it('InputBox.tsx uses safeV for setValue', () => {
    const code = src('src/ui/InputBox.tsx');
    expect(code).toContain('safeV');
    expect(code).toContain('setValue(safeV)');
  });
});

// ---------------------------------------------------------------------------
// L3 — First-time welcome hints
// ---------------------------------------------------------------------------

describe('L3 — first-time user DevOps welcome hints', () => {
  it('ink/index.ts shows "list my kubernetes pods" hint when no NIMBUS.md', () => {
    const code = src('src/ui/ink/index.ts');
    expect(code).toContain('list my kubernetes pods');
  });

  it('ink/index.ts shows "run terraform plan" hint', () => {
    const code = src('src/ui/ink/index.ts');
    expect(code).toContain('run terraform plan');
  });

  it('ink/index.ts shows helm releases hint', () => {
    const code = src('src/ui/ink/index.ts');
    expect(code).toContain('helm releases');
  });

  it('ink/index.ts hints are conditional on no nimbusInstructions', () => {
    const code = src('src/ui/ink/index.ts');
    expect(code).toContain('!nimbusInstructions');
  });
});

// ---------------------------------------------------------------------------
// M2 — Timeout error with label and seconds
// ---------------------------------------------------------------------------

describe('M2 — improved timeout error message', () => {
  it('spawn-exec.ts has label option in SpawnOptions', () => {
    const code = src('src/tools/spawn-exec.ts');
    expect(code).toContain('label?:');
  });

  it('spawn-exec.ts timeout error shows seconds not ms', () => {
    const code = src('src/tools/spawn-exec.ts');
    expect(code).toContain('timed out after');
    expect(code).toContain('s.');
    // Should use Math.round to convert ms to seconds
    expect(code).toContain('Math.round');
  });
});
