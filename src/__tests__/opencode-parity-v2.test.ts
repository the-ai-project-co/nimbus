/**
 * OpenCode Parity v2 — Source-level assertions
 *
 * Verifies that the second round of OpenCode parity gaps have been implemented.
 * All gaps identified in the second investigation:
 *   L4 — HelpModal categories + all commands
 *   H4 — Help hint visible in InputBox placeholder
 *   C1/C2 — Onboarding transition message
 *   M6 — doctor --fix already wired (verified)
 *   C3/H2 — Welcome message with infra context (already in index.ts)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../..');

function src(relPath: string): string {
  return readFileSync(join(root, relPath), 'utf-8');
}

describe('OpenCode Parity v2 — HelpModal (L4)', () => {
  it('HelpModal has DevOps Commands category', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('DevOps Commands');
  });

  it('HelpModal has Session category', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('Session');
  });

  it('HelpModal has Navigation category', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('Navigation');
  });

  it('HelpModal has Settings category', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('Settings');
  });

  it('HelpModal has Keyboard Shortcuts category', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('Keyboard Shortcuts');
  });

  it('HelpModal lists /plan command', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('/plan');
  });

  it('HelpModal lists /apply command', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('/apply');
  });

  it('HelpModal lists /drift command', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('/drift');
  });

  it('HelpModal lists /rollback command', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('/rollback');
  });

  it('HelpModal lists /k8s-ctx command', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('/k8s-ctx');
  });

  it('HelpModal lists /tf-ws command', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('/tf-ws');
  });

  it('HelpModal lists /auth-refresh command', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('/auth-refresh');
  });

  it('HelpModal lists /incident command', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('/incident');
  });

  it('HelpModal lists /runbook command', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('/runbook');
  });

  it('HelpModal lists /search command', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('/search');
  });

  it('HelpModal lists /tree command', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('/tree');
  });

  it('HelpModal lists /terminal command', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('/terminal');
  });

  it('HelpModal lists /plugin command', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('/plugin');
  });

  it('HelpModal lists /tools command', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('/tools');
  });

  it('HelpModal lists /remember command', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('/remember');
  });

  it('HelpModal lists /share command', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('/share');
  });

  it('HelpModal has Tab shortcut description', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('Cycle mode');
  });

  it('HelpModal has Ctrl+C shortcut description', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('Ctrl+C');
  });
});

describe('OpenCode Parity v2 — InputBox help hint (H4)', () => {
  it('InputBox placeholder mentions ? for help', () => {
    expect(src('src/ui/InputBox.tsx')).toContain('? for help');
  });

  it('InputBox placeholder mentions /help for commands', () => {
    expect(src('src/ui/InputBox.tsx')).toContain('/help for commands');
  });

  it('InputBox has /deploy in SLASH_COMMANDS', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'/deploy'");
  });

  it('InputBox has /rollback in SLASH_COMMANDS', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'/rollback'");
  });

  it('InputBox has /incident in SLASH_COMMANDS', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'/incident'");
  });

  it('InputBox has /runbook in SLASH_COMMANDS', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'/runbook'");
  });

  it('InputBox has /logs in SLASH_COMMANDS', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'/logs'");
  });

  it('InputBox has /share in SLASH_COMMANDS', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'/share'");
  });
});

describe('OpenCode Parity v2 — Onboarding transition (C1/C2)', () => {
  it('onboarding.ts shows transition message before TUI launches', () => {
    expect(src('src/commands/onboarding.ts')).toContain('Launching Nimbus DevOps Agent');
  });

  it('onboarding.ts shows Tab/help hint', () => {
    expect(src('src/commands/onboarding.ts')).toContain('Type ? for help');
  });

  it('nimbus.ts launches chat after onboarding completes', () => {
    expect(src('src/nimbus.ts')).toContain("runCommand(['chat'])");
  });
});

describe('OpenCode Parity v2 — Doctor --fix (M6)', () => {
  it('cli.ts parses --fix flag for doctor', () => {
    expect(src('src/cli.ts')).toContain("options.fix = true");
  });

  it('doctor.ts has runFix handler for DevOps tools', () => {
    expect(src('src/commands/doctor.ts')).toContain('runFix');
  });

  it('doctor.ts has platform-specific macOS brew install', () => {
    expect(src('src/commands/doctor.ts')).toContain("platform === 'darwin'");
  });

  it('doctor.ts has brew install command for macOS', () => {
    expect(src('src/commands/doctor.ts')).toContain('brew install');
  });

  it('doctor.ts calls runFix when options.fix is true', () => {
    expect(src('src/commands/doctor.ts')).toContain('options.fix && result.runFix');
  });
});

describe('OpenCode Parity v2 — Welcome with infra context (C3/H2)', () => {
  it('ink/index.ts shows welcome message with infra context on new session', () => {
    expect(src('src/ui/ink/index.ts')).toContain('Welcome to Nimbus');
  });

  it('ink/index.ts shows detected infrastructure section', () => {
    expect(src('src/ui/ink/index.ts')).toContain('Detected infrastructure');
  });

  it('ink/index.ts shows terraform workspace in welcome', () => {
    expect(src('src/ui/ink/index.ts')).toContain('infraHintLine');
  });

  it('ink/index.ts shows kubectl context in welcome', () => {
    expect(src('src/ui/ink/index.ts')).toContain('kubectlContext');
  });

  it('ink/index.ts shows DevOps quick-start examples', () => {
    expect(src('src/ui/ink/index.ts')).toContain('Quick-start examples');
  });

  it('ink/index.ts shows context-aware suggestions based on infra', () => {
    expect(src('src/ui/ink/index.ts')).toContain('Suggested:');
  });
});
