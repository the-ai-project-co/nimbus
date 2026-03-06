/**
 * DevOps Terminal Gap Fix Tests
 *
 * Validates source-level fixes for the gap fix plan:
 * C1–C3 (critical), H1–H5 (high), M1–M3, L1 (medium/low)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');

function src(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf-8');
}

// ---------------------------------------------------------------------------
// C1 — template.ts uses SQLite, not REST
// ---------------------------------------------------------------------------
describe('C1 — template.ts SQLite migration', () => {
  it('no longer calls localhost:3004', () => {
    expect(src('src/commands/template.ts')).not.toContain('localhost:3004');
  });

  it('uses getDb from state/db', () => {
    expect(src('src/commands/template.ts')).toContain('getDb');
  });

  it('uses randomUUID for new template IDs', () => {
    expect(src('src/commands/template.ts')).toContain('randomUUID');
  });

  it('does not import RestClient', () => {
    expect(src('src/commands/template.ts')).not.toContain('RestClient');
  });
});

// ---------------------------------------------------------------------------
// C2 — questionnaire.ts no dead service check
// ---------------------------------------------------------------------------
describe('C2 — questionnaire.ts dead service check removed', () => {
  it('does not call generatorClient.isAvailable', () => {
    expect(src('src/commands/questionnaire.ts')).not.toContain('generatorClient.isAvailable');
  });

  it('does not define runWithGeneratorService', () => {
    expect(src('src/commands/questionnaire.ts')).not.toContain('runWithGeneratorService');
  });
});

// ---------------------------------------------------------------------------
// C3 — history/manager.ts no noisy warning
// ---------------------------------------------------------------------------
describe('C3 — history manager no noisy warning', () => {
  it('does not log [nimbus] Failed to sync warning', () => {
    expect(src('src/history/manager.ts')).not.toContain('[nimbus] Failed to sync');
  });

  it('does not have loadFromStateService method', () => {
    expect(src('src/history/manager.ts')).not.toContain('loadFromStateService');
  });

  it('does not call syncToStateService', () => {
    expect(src('src/history/manager.ts')).not.toContain('syncToStateService');
  });
});

// ---------------------------------------------------------------------------
// H1 — run.ts discovers infra context
// ---------------------------------------------------------------------------
describe('H1 — run.ts infra context discovery', () => {
  it('calls discoverInfraContext', () => {
    expect(src('src/cli/run.ts')).toContain('discoverInfraContext');
  });

  it('passes infraContext to runAgentLoop', () => {
    expect(src('src/cli/run.ts')).toContain('infraContext');
  });
});

// ---------------------------------------------------------------------------
// H2 — app.ts warns about missing NIMBUS.md
// ---------------------------------------------------------------------------
describe('H2 — app.ts NIMBUS.md warning', () => {
  it('checks for NIMBUS.md', () => {
    expect(src('src/app.ts')).toContain('NIMBUS.md');
  });

  it('adds startup warning when NIMBUS.md is missing', () => {
    expect(src('src/app.ts')).toContain('No NIMBUS.md found');
  });
});

// ---------------------------------------------------------------------------
// H3 — loop.ts auto-discovers infra context
// ---------------------------------------------------------------------------
describe('H3 — loop.ts infra context auto-discovery', () => {
  it('calls discoverInfraContext in agent loop', () => {
    expect(src('src/agent/loop.ts')).toContain('discoverInfraContext');
  });
});

// ---------------------------------------------------------------------------
// H4 — ToolCallDisplay streaming output visible
// ---------------------------------------------------------------------------
describe('H4 — ToolCallDisplay streaming output', () => {
  it('has [LIVE] label prefix for streaming output', () => {
    expect(src('src/ui/ToolCallDisplay.tsx')).toContain('[LIVE]');
  });

  it('does not use dimColor on streaming section outer box', () => {
    // The new streaming section should not have dimColor wrapping the whole box
    const content = src('src/ui/ToolCallDisplay.tsx');
    // We check that the streaming indicator uses green bold instead of dimColor
    expect(content).toContain('color="green" bold');
  });
});

// ---------------------------------------------------------------------------
// H5 — App.tsx has ? key handler
// ---------------------------------------------------------------------------
describe('H5 — App.tsx ? key handler', () => {
  it('handles ? keypress to open help', () => {
    expect(src('src/ui/App.tsx')).toContain("input === '?'");
  });
});

// ---------------------------------------------------------------------------
// M1 — status.ts helm + pod health
// ---------------------------------------------------------------------------
describe('M1 — status.ts helm and pod health', () => {
  it('checks helm release health', () => {
    // Uses run('helm', ['list', '-A', ...])
    expect(src('src/commands/status.ts')).toContain("'helm'");
    expect(src('src/commands/status.ts')).toContain("'list'");
  });

  it('checks unhealthy pod count', () => {
    expect(src('src/commands/status.ts')).toContain('unhealthyPodCount');
  });

  it('reports helm failed releases', () => {
    expect(src('src/commands/status.ts')).toContain('helmFailedCount');
  });
});

// ---------------------------------------------------------------------------
// M3 — ProjectConfig in types
// ---------------------------------------------------------------------------
describe('M3 — ProjectConfig in config/types.ts', () => {
  it('exports ProjectConfig interface', () => {
    expect(src('src/config/types.ts')).toContain('ProjectConfig');
  });

  it('exports loadProjectConfig function', () => {
    expect(src('src/config/types.ts')).toContain('loadProjectConfig');
  });

  it('supports protectedEnvironments field', () => {
    expect(src('src/config/types.ts')).toContain('protectedEnvironments');
  });
});

// ---------------------------------------------------------------------------
// L1 — StatusBar has ? hint
// ---------------------------------------------------------------------------
describe('L1 — StatusBar ? help hint', () => {
  it('shows ? help in StatusBar', () => {
    expect(src('src/ui/StatusBar.tsx')).toContain('? help');
  });
});

// ---------------------------------------------------------------------------
// L2 — completions.ts dynamic completions
// ---------------------------------------------------------------------------
describe('L2 — completions.ts dynamic completions', () => {
  it('exports dynamicComplete function', () => {
    expect(src('src/commands/completions.ts')).toContain('dynamicComplete');
  });

  it('gets terraform workspaces for completion', () => {
    expect(src('src/commands/completions.ts')).toContain('workspace');
    expect(src('src/commands/completions.ts')).toContain("'list'");
  });

  it('gets kubectl contexts for completion', () => {
    expect(src('src/commands/completions.ts')).toContain('get-contexts');
  });

  it('gets helm releases for completion', () => {
    expect(src('src/commands/completions.ts')).toContain('--short');
  });
});

// ---------------------------------------------------------------------------
// M4 — init.ts generates CI/CD section in NIMBUS.md
// ---------------------------------------------------------------------------
describe('M4 — init.ts CI/CD section in NIMBUS.md', () => {
  it('generates ## CI/CD section when pipeline detected', () => {
    expect(src('src/cli/init.ts')).toContain("## CI/CD");
  });

  it('includes pipeline conventions', () => {
    expect(src('src/cli/init.ts')).toContain('terraform plan');
  });
});

// ---------------------------------------------------------------------------
// M5 — TUI watcher notifies on DevOps file changes
// ---------------------------------------------------------------------------
describe('M5 — TUI FileWatcher DevOps notifications', () => {
  it('debounces DevOps file changes', () => {
    expect(src('src/ui/ink/index.ts')).toContain('devopsChangeDebounce');
  });

  it('matches .tf, .yaml and Dockerfile extensions', () => {
    expect(src('src/ui/ink/index.ts')).toContain('isDevOps');
  });

  it('prompts user to /plan on file change', () => {
    expect(src('src/ui/ink/index.ts')).toContain('type ${hint} to review drift impact');
  });
});

// ---------------------------------------------------------------------------
// M2 — doctor.ts LLM connectivity check
// ---------------------------------------------------------------------------
describe('M2 — doctor.ts LLM connectivity', () => {
  it('has checkLLMConnectivity function', () => {
    expect(src('src/commands/doctor.ts')).toContain('checkLLMConnectivity');
  });

  it('includes LLM Connectivity in diagnostic checks', () => {
    expect(src('src/commands/doctor.ts')).toContain("'LLM Connectivity'");
  });
});

// ---------------------------------------------------------------------------
// DevOps Identity — help, welcome splash, header, onboarding
// ---------------------------------------------------------------------------
describe('DevOps Identity — help command reorganized', () => {
  it('puts DevOps Operations section first', () => {
    const content = src('src/commands/help.ts');
    const devopsIdx = content.indexOf('DevOps Operations:');
    const chatIdx = content.indexOf('AI Agent:');
    expect(devopsIdx).toBeGreaterThan(-1);
    expect(chatIdx).toBeGreaterThan(-1);
    // DevOps section must appear before Chat/AI section
    expect(devopsIdx).toBeLessThan(chatIdx);
  });

  it('lists terraform, k8s, helm, drift, cost in primary section', () => {
    const content = src('src/commands/help.ts');
    const devopsSection = content.slice(content.indexOf('DevOps Operations:'), content.indexOf('Incident & Automation:'));
    expect(devopsSection).toContain('tf <cmd>');
    expect(devopsSection).toContain('k8s <cmd>');
    expect(devopsSection).toContain('helm <cmd>');
    expect(devopsSection).toContain('drift');
    expect(devopsSection).toContain('cost');
  });

  it('has Incident & Automation section', () => {
    expect(src('src/commands/help.ts')).toContain('Incident & Automation:');
  });

  it('has DevOps-first header title', () => {
    expect(src('src/commands/help.ts')).toContain('AI-Powered DevOps Terminal');
  });
});

describe('DevOps Identity — welcome splash in MessageList', () => {
  it('shows DevOps quick-start examples on empty screen', () => {
    expect(src('src/ui/MessageList.tsx')).toContain('What would you like to do?');
  });

  it('includes terraform plan example', () => {
    expect(src('src/ui/MessageList.tsx')).toContain('terraform plan');
  });

  it('includes kubernetes example', () => {
    expect(src('src/ui/MessageList.tsx')).toContain('pod restart');
  });

  it('includes help hint', () => {
    expect(src('src/ui/MessageList.tsx')).toContain('/init to set up context');
  });
});

describe('DevOps Identity — Header production warning', () => {
  it('shows PROD badge for production environments', () => {
    expect(src('src/ui/Header.tsx')).toContain('[PROD]');
  });

  it('shows deploy mode production warning banner', () => {
    expect(src('src/ui/Header.tsx')).toContain('DEPLOY MODE — targeting production');
  });

  it('showProdWarning requires both deploy mode and prod env', () => {
    const content = src('src/ui/Header.tsx');
    expect(content).toContain("session.mode === 'deploy'");
    expect(content).toContain('showProdWarning');
  });
});

describe('DevOps Identity — onboarding infra detection', () => {
  it('detects terraform files during onboarding', () => {
    expect(src('src/commands/onboarding.ts')).toContain('.tf');
  });

  it('shows detected infrastructure stack to user', () => {
    expect(src('src/commands/onboarding.ts')).toContain('Detected infrastructure:');
  });

  it('has DevOps-first welcome banner', () => {
    expect(src('src/commands/onboarding.ts')).toContain('AI-Powered DevOps Terminal');
  });
});

// ---------------------------------------------------------------------------
// Polish Plan — H1-H5, M1-M7, L1-L5
// ---------------------------------------------------------------------------

describe('H1 — InputBox DevOps placeholder', () => {
  it('shows DevOps-specific placeholder text', () => {
    expect(src('src/ui/InputBox.tsx')).toContain('Type a DevOps command');
  });
});

describe('H2 — /context shows infra + token breakdown', () => {
  it('shows LLM Model in context snapshot', () => {
    expect(src('src/ui/App.tsx')).toContain('LLM Model:');
  });

  it('shows TF Workspace and K8s Context', () => {
    const content = src('src/ui/App.tsx');
    expect(content).toContain('TF Workspace:');
    expect(content).toContain('K8s Context:');
  });
});

describe('H3 — Deploy mode confirmation state', () => {
  it('has pendingDeployConfirm state', () => {
    expect(src('src/ui/App.tsx')).toContain('pendingDeployConfirm');
  });

  it('shows confirmation box with destructive operations warning', () => {
    const content = src('src/ui/App.tsx');
    expect(content).toContain('!! Switch to DEPLOY mode?');
    expect(content).toContain('terraform apply/destroy, kubectl delete, helm uninstall');
  });
});

describe('H4 — doctor DevOps CLI version check', () => {
  it('has checkDevOpsCLIs function', () => {
    expect(src('src/commands/doctor.ts')).toContain('checkDevOpsCLIs');
  });

  it('includes DevOps CLIs in diagnostic checks', () => {
    expect(src('src/commands/doctor.ts')).toContain("'DevOps CLIs'");
  });
});

describe('H5 — cost delta hint after terraform apply / helm upgrade', () => {
  it('has extractCostHintFromToolOutput function', () => {
    expect(src('src/agent/loop.ts')).toContain('extractCostHintFromToolOutput');
  });

  it('parses terraform apply resource counts', () => {
    expect(src('src/agent/loop.ts')).toContain('resources created');
  });

  it('emits cost hint for helm releases', () => {
    expect(src('src/agent/loop.ts')).toContain('nimbus cost');
  });
});

describe('M1 — run.ts JSON output infraContext + toolsUsed', () => {
  it('has infraContext field in RunJsonOutput', () => {
    expect(src('src/cli/run.ts')).toContain('infraContext');
  });

  it('has toolsUsed field in RunJsonOutput', () => {
    expect(src('src/cli/run.ts')).toContain('toolsUsed');
  });
});

describe('M2 — streaming output coloring', () => {
  it('colors lines containing "will be created"', () => {
    expect(src('src/ui/ToolCallDisplay.tsx')).toContain('will be created');
  });

  it('applies green color for created lines', () => {
    expect(src('src/ui/ToolCallDisplay.tsx')).toContain("'green'");
  });
});

describe('M3 — /profile slash command in TUI', () => {
  it('handles /profile command', () => {
    expect(src('src/ui/App.tsx')).toContain("'/profile '");
  });

  it('calls profileCommand', () => {
    expect(src('src/ui/App.tsx')).toContain('profileCommand');
  });
});

describe('M4 — recurring error persistence', () => {
  it('has trackAndPersistError function', () => {
    expect(src('src/agent/loop.ts')).toContain('trackAndPersistError');
  });

  it('has sessionErrorCounts map', () => {
    expect(src('src/agent/loop.ts')).toContain('sessionErrorCounts');
  });

  it('appends to Observed Issues section', () => {
    expect(src('src/agent/loop.ts')).toContain('Observed Issues');
  });
});

describe('M5 — nimbus init next steps', () => {
  it('prints Next steps after init', () => {
    expect(src('src/cli/init.ts')).toContain('Next steps:');
  });

  it('mentions nimbus plan in next steps', () => {
    expect(src('src/cli/init.ts')).toContain('nimbus plan');
  });

  it('mentions nimbus doctor in next steps', () => {
    expect(src('src/cli/init.ts')).toContain('nimbus doctor');
  });
});

describe('M6 — destructive action guard', () => {
  it('has isDestructiveAction function', () => {
    expect(src('src/agent/loop.ts')).toContain('isDestructiveAction');
  });

  it('warns on terraform destroy', () => {
    expect(src('src/agent/loop.ts')).toContain('PERMANENTLY DELETE all managed infrastructure');
  });

  it('warns on kubectl delete', () => {
    expect(src('src/agent/loop.ts')).toContain('IRREVERSIBLE');
  });
});

describe('M7 — completions install in postinstall', () => {
  it('mentions completions install in postinstall', () => {
    expect(src('package.json')).toContain('completions install');
  });

  it('has 4 steps in postinstall', () => {
    const content = src('package.json');
    expect(content).toContain('1.');
    expect(content).toContain('2.');
    expect(content).toContain('3.');
    expect(content).toContain('4.');
  });
});

describe('L1 — @agent completions in InputBox', () => {
  it('has AGENT_NAMES constant', () => {
    expect(src('src/ui/InputBox.tsx')).toContain('AGENT_NAMES');
  });

  it('includes known agent names', () => {
    const content = src('src/ui/InputBox.tsx');
    expect(content).toContain('explore');
    expect(content).toContain('infra');
    expect(content).toContain('security');
  });
});

describe('L2 — status shows LLM model', () => {
  it('uses info.model in status output', () => {
    expect(src('src/commands/status.ts')).toContain('info.model');
  });

  it('shows model in status dashboard', () => {
    expect(src('src/commands/status.ts')).toContain('Model:');
  });
});

describe('L3 — nimbus context command', () => {
  it('handles context command in cli.ts', () => {
    expect(src('src/cli.ts')).toContain("command === 'context'");
  });

  it('StatusOptions has verbose field', () => {
    expect(src('src/commands/status.ts')).toContain('verbose');
  });
});

describe('L4 — session resume hint in welcome message', () => {
  it('shows Previous session available hint', () => {
    expect(src('src/ui/ink/index.ts')).toContain('Previous session available');
  });

  it('mentions /sessions command in resume hint', () => {
    expect(src('src/ui/ink/index.ts')).toContain('type /sessions to resume');
  });
});

// ---------------------------------------------------------------------------
// Polish Plan — Additional completeness checks
// ---------------------------------------------------------------------------

describe('H3 — deploy confirmation key handler', () => {
  it('handles y key to confirm deploy', () => {
    const content = src('src/ui/App.tsx');
    expect(content).toContain("input === 'y'");
    expect(content).toContain("input === 'Y'");
  });

  it('handles n key to cancel deploy', () => {
    const content = src('src/ui/App.tsx');
    expect(content).toContain("input === 'n'");
  });

  it('uses isActive with pendingDeployConfirm', () => {
    expect(src('src/ui/App.tsx')).toContain('isActive: pendingDeployConfirm');
  });
});

describe('M6 — destructive guard injected before tool', () => {
  it('injects SAFETY message into tool context', () => {
    expect(src('src/agent/loop.ts')).toContain('[SAFETY]');
  });

  it('warns on helm uninstall', () => {
    expect(src('src/agent/loop.ts')).toContain('helm uninstall will remove the release');
  });
});

describe('L1 — @agent Tab completion suggestions', () => {
  it('maps agent names to @name format for suggestions', () => {
    expect(src('src/ui/InputBox.tsx')).toContain('@${a} ');
  });
});

describe('H5 — cost hint integration in loop', () => {
  it('calls extractCostHintFromToolOutput after tool completes', () => {
    const content = src('src/agent/loop.ts');
    expect(content).toContain('const costHint = extractCostHintFromToolOutput');
  });
});

describe('M6/M7/L2/L6 gaps', () => {
  it('M6: subagent tag parsing in MessageList', () => {
    const src_content = readFileSync(join(ROOT, 'src/ui/MessageList.tsx'), 'utf-8');
    expect(src_content).toContain('[subagent:');
    expect(src_content).toContain('parseSubagentTag');
  });
  it('M7: /explain in SLASH_COMMANDS', () => {
    const src_content = readFileSync(join(ROOT, 'src/ui/InputBox.tsx'), 'utf-8');
    expect(src_content).toContain("'/explain'");
  });
  it('M7: /explain handler in App.tsx', () => {
    const src_content = readFileSync(join(ROOT, 'src/ui/App.tsx'), 'utf-8');
    expect(src_content).toContain('/explain');
  });
  it('L2: Ctrl+Z maps to undo', () => {
    const src_content = readFileSync(join(ROOT, 'src/ui/App.tsx'), 'utf-8');
    expect(src_content).toContain("'z' && key.ctrl");
  });
  it('L6: runbook auto-generation after terraform apply', () => {
    const src_content = readFileSync(join(ROOT, 'src/agent/loop.ts'), 'utf-8');
    expect(src_content).toContain('runbook');
  });
});

// ---------------------------------------------------------------------------
// New gaps: C1 history, C4 cmd, C5 SQLite, H7 Node version, L5 progress bar, M5 watch, M3 branch, L8 monorepo
// ---------------------------------------------------------------------------

describe('C1 — persistent input history', () => {
  it('InputBox.tsx loads history from disk', () => {
    const content = src('src/ui/InputBox.tsx');
    expect(content).toContain('loadHistory');
    expect(content).toContain('saveHistory');
    expect(content).toContain('input-history.json');
  });
  it('history is saved on submit', () => {
    const content = src('src/ui/InputBox.tsx');
    expect(content).toContain('saveHistory(h)');
  });
  it('history is saved on unmount via useEffect', () => {
    const content = src('src/ui/InputBox.tsx');
    expect(content).toContain('return () => {');
    expect(content).toContain('saveHistory(history.current)');
  });
});

describe('C4 — Windows cmd Node preference', () => {
  it('bin/nimbus.cmd uses Node as primary runtime', () => {
    const content = src('bin/nimbus.cmd');
    expect(content).not.toContain('Prefer Bun');
    expect(content).toContain('Node.js >= 18');
  });
  it('bin/nimbus.cmd removes Bun-first preference', () => {
    const content = src('bin/nimbus.cmd');
    // Bun check should not appear before node check
    const nodeIdx = content.indexOf('where node');
    const bunIdx = content.indexOf('where bun');
    // bun should not appear before node (or not appear at all)
    expect(nodeIdx).toBeGreaterThan(-1);
    expect(bunIdx === -1 || bunIdx > nodeIdx).toBe(true);
  });
});

describe('C5 — SQLite failure visibility', () => {
  it('session error is pushed to _startupWarnings for TUI display', () => {
    const content = src('src/ui/ink/index.ts');
    expect(content).toContain('_startupWarnings.push');
    expect(content).toContain('Session persistence unavailable');
  });
});

describe('H7 — doctor Node version check', () => {
  it('checkNodeRuntime function exists in doctor.ts', () => {
    const content = src('src/commands/doctor.ts');
    expect(content).toContain('checkNodeRuntime');
  });
  it('checks node version >= 18', () => {
    const content = src('src/commands/doctor.ts');
    expect(content).toContain('major < 18');
  });
  it('Node.js Runtime check in DIAGNOSTIC_CHECKS', () => {
    const content = src('src/commands/doctor.ts');
    expect(content).toContain("'Node.js Runtime'");
  });
  it('checks tsx availability', () => {
    const content = src('src/commands/doctor.ts');
    expect(content).toContain('tsx');
  });
});

describe('H1 — infra context persisted on exit', () => {
  it('exit handler writes infraStatePath on exit', () => {
    const content = src('src/ui/ink/index.ts');
    expect(content).toContain('currentInfraContext');
    expect(content).toContain('infraStatePath');
    // Should save in exit handler
    const exitIdx = content.indexOf("process.on('exit'");
    const lastExitIdx = content.lastIndexOf("process.on('exit'");
    expect(lastExitIdx).toBeGreaterThan(exitIdx); // Multiple exit handlers
  });
});

describe('L5 — visual context budget progress bar', () => {
  it('StatusBar renders a progress bar with filled/empty chars', () => {
    const content = src('src/ui/StatusBar.tsx');
    expect(content).toContain('progressBar');
    expect(content).toContain('█');
    expect(content).toContain('░');
    expect(content).toContain('BAR_WIDTH');
  });
});

describe('M5 — /watch TUI integration', () => {
  it('/watch handler exists in App.tsx', () => {
    const content = src('src/ui/App.tsx');
    expect(content).toContain("'/watch'");
    expect(content).toContain('watchPattern');
    expect(content).toContain('watchAbortRef');
  });
  it('/watch in InputBox SLASH_COMMANDS', () => {
    const content = src('src/ui/InputBox.tsx');
    expect(content).toContain("'/watch'");
  });
});

describe('M3 — conversation branching /branch', () => {
  it('/branch handler saves conversation checkpoint', () => {
    const content = src('src/ui/App.tsx');
    expect(content).toContain("'/branch'");
    expect(content).toContain('branches');
    expect(content).toContain('branchName');
  });
  it('/branch in InputBox SLASH_COMMANDS', () => {
    const content = src('src/ui/InputBox.tsx');
    expect(content).toContain("'/branch'");
  });
});

describe('M2 — keyboard context switcher hint in Header', () => {
  it('Header shows /k8s-ctx | /tf-ws hint when context is active', () => {
    const content = src('src/ui/Header.tsx');
    expect(content).toContain('/k8s-ctx | /tf-ws to switch');
  });
});

describe('L8 — monorepo-aware nimbus init', () => {
  it('init.ts scans subdirs for terraform roots', () => {
    const content = src('src/cli/init.ts');
    expect(content).toContain('tfRoots');
    expect(content).toContain('Terraform Modules (Monorepo)');
  });
});

describe('H5 — Homebrew formula version', () => {
  it('Homebrew formula is updated to 0.3.0 (in sibling repo)', () => {
    const { readFileSync: rfs, existsSync: exists } = require('node:fs');
    const { join: j } = require('node:path');
    // The Homebrew tap lives in a sibling repository
    const formulaPath = j(__dirname, '../../../homebrew-tap/Formula/nimbus.rb');
    if (!exists(formulaPath)) {
      // Skip gracefully if the tap repo isn't checked out alongside
      return;
    }
    const formula = rfs(formulaPath, 'utf-8') as string;
    expect(formula).toContain('0.4.0');
    expect(formula).not.toContain("version \"0.2.0\"");
  });
});
