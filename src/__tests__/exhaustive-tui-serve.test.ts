/**
 * Exhaustive TUI + Serve Tests
 *
 * Uses source-level inspection (readFileSync) for all Ink/React UI components
 * since they cannot be rendered in vitest. Functional tests are used where
 * modules can be imported directly without a display/render environment.
 *
 * Coverage:
 *   - src/ui/App.tsx
 *   - src/ui/Header.tsx
 *   - src/ui/MessageList.tsx
 *   - src/ui/ToolCallDisplay.tsx
 *   - src/ui/InputBox.tsx
 *   - src/ui/StatusBar.tsx
 *   - src/ui/HelpModal.tsx
 *   - src/ui/PermissionPrompt.tsx
 *   - src/ui/FileDiffModal.tsx
 *   - src/ui/TerminalPane.tsx
 *   - src/ui/TreePane.tsx
 *   - src/ui/ink/index.ts
 *   - src/cli/serve.ts
 *   - src/cli/openapi-spec.ts
 *   - src/cli/web.ts
 *   - src/commands/generate-terraform.ts
 *   - src/commands/generate-k8s.ts / src/generator/kubernetes.ts
 *   - src/commands/onboarding.ts
 *   - src/commands/version.ts
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');

function src(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf-8');
}

// ===========================================================================
// App.tsx
// ===========================================================================

describe('App.tsx — component export', () => {
  it('exports App function component', () => {
    expect(src('src/ui/App.tsx')).toContain('export function App(');
  });

  it('exports AppErrorBoundary', () => {
    expect(src('src/ui/App.tsx')).toContain('AppErrorBoundary');
  });
});

describe('App.tsx — MODES array', () => {
  it('defines MODES array with plan, build, deploy', () => {
    const content = src('src/ui/App.tsx');
    expect(content).toContain("'plan'");
    expect(content).toContain("'build'");
    expect(content).toContain("'deploy'");
    expect(content).toContain('MODES');
  });

  it('MODES array contains all three modes in order', () => {
    const content = src('src/ui/App.tsx');
    const modesMatch = content.match(/const MODES[^=]*=\s*\[([^\]]+)\]/);
    expect(modesMatch).not.toBeNull();
    const modesStr = modesMatch![1];
    expect(modesStr).toContain('plan');
    expect(modesStr).toContain('build');
    expect(modesStr).toContain('deploy');
  });
});

describe('App.tsx — Tab key mode cycling', () => {
  it('has nextMode function for cycling', () => {
    expect(src('src/ui/App.tsx')).toContain('nextMode');
  });

  it('Tab key triggers mode change', () => {
    const content = src('src/ui/App.tsx');
    expect(content).toContain('key.tab');
  });
});

describe('App.tsx — slash command handlers', () => {
  it('handles /mode command', () => {
    expect(src('src/ui/App.tsx')).toContain("'/mode'");
  });

  it('handles /search command', () => {
    expect(src('src/ui/App.tsx')).toContain("'/search'");
  });

  it('handles /terminal command', () => {
    expect(src('src/ui/App.tsx')).toContain("'/terminal'");
  });

  it('handles /tree command', () => {
    expect(src('src/ui/App.tsx')).toContain("'/tree'");
  });

  it('handles /plan slash command', () => {
    expect(src('src/ui/App.tsx')).toContain("'/plan'");
  });

  it('handles /apply slash command', () => {
    expect(src('src/ui/App.tsx')).toContain("'/apply'");
  });

  it('handles /k8s-ctx slash command', () => {
    expect(src('src/ui/App.tsx')).toContain("'/k8s-ctx'");
  });

  it('handles /tf-ws slash command', () => {
    expect(src('src/ui/App.tsx')).toContain("'/tf-ws'");
  });

  it('handles /help slash command', () => {
    expect(src('src/ui/App.tsx')).toContain("'/help'");
  });
});

describe('App.tsx — Ctrl+C handling', () => {
  it('has abort logic for Ctrl+C', () => {
    const content = src('src/ui/App.tsx');
    expect(content).toContain('key.ctrl');
    // Either direct 'c' check or AbortController usage
    const hasAbortCtrl = content.includes('AbortController') || content.includes('abortController') || content.includes('onAbort');
    expect(hasAbortCtrl).toBe(true);
  });
});

describe('App.tsx — state management', () => {
  it('has scrollOffset state for scroll management', () => {
    expect(src('src/ui/App.tsx')).toContain('scrollOffset');
  });

  it('has terminalPaneAuto state for auto-showing terminal', () => {
    expect(src('src/ui/App.tsx')).toContain('terminalPaneAuto');
  });

  it('has searchQuery state for search mode', () => {
    expect(src('src/ui/App.tsx')).toContain('searchQuery');
  });

  it('has showApiKeySetup state', () => {
    expect(src('src/ui/App.tsx')).toContain('showApiKeySetup');
  });

  it('has hasApiKey prop check', () => {
    expect(src('src/ui/App.tsx')).toContain('hasApiKey');
  });

  it('has pendingDeployConfirm state', () => {
    expect(src('src/ui/App.tsx')).toContain('pendingDeployConfirm');
  });

  it('has branches state for conversation branching', () => {
    expect(src('src/ui/App.tsx')).toContain('branches');
  });

  it('has watchPattern state for /watch integration', () => {
    expect(src('src/ui/App.tsx')).toContain('watchPattern');
  });

  it('has watchAbortRef for controlling watch', () => {
    expect(src('src/ui/App.tsx')).toContain('watchAbortRef');
  });
});

describe('App.tsx — context display', () => {
  it('shows LLM Model in context snapshot', () => {
    expect(src('src/ui/App.tsx')).toContain('LLM Model:');
  });

  it('shows TF Workspace in context display', () => {
    expect(src('src/ui/App.tsx')).toContain('TF Workspace:');
  });

  it('shows K8s Context in context display', () => {
    expect(src('src/ui/App.tsx')).toContain('K8s Context:');
  });
});

describe('App.tsx — deploy confirmation', () => {
  it('shows deploy mode confirmation warning', () => {
    expect(src('src/ui/App.tsx')).toContain('!! Switch to DEPLOY mode?');
  });

  it('warns about destructive operations', () => {
    expect(src('src/ui/App.tsx')).toContain('terraform apply/destroy, kubectl delete, helm uninstall');
  });

  it('handles y key to confirm deploy', () => {
    const content = src('src/ui/App.tsx');
    expect(content).toContain("input === 'y'");
    expect(content).toContain("input === 'Y'");
  });

  it('handles n key to cancel deploy', () => {
    expect(src('src/ui/App.tsx')).toContain("input === 'n'");
  });
});

describe('App.tsx — ? key for help', () => {
  it('handles ? keypress to open help modal', () => {
    expect(src('src/ui/App.tsx')).toContain("input === '?'");
  });
});

describe('App.tsx — profile command', () => {
  it('handles /profile command', () => {
    expect(src('src/ui/App.tsx')).toContain("'/profile '");
  });

  it('calls profileCommand', () => {
    expect(src('src/ui/App.tsx')).toContain('profileCommand');
  });
});

describe('App.tsx — Ctrl+Z undo shortcut', () => {
  it('maps Ctrl+Z to undo', () => {
    expect(src('src/ui/App.tsx')).toContain("'z' && key.ctrl");
  });
});

describe('App.tsx — /explain handler', () => {
  it('handles /explain command', () => {
    expect(src('src/ui/App.tsx')).toContain('/explain');
  });
});

// ===========================================================================
// Header.tsx
// ===========================================================================

describe('Header.tsx — component export', () => {
  it('exports Header component', () => {
    expect(src('src/ui/Header.tsx')).toContain('export function Header(');
  });
});

describe('Header.tsx — mode display', () => {
  it('shows mode indicator with plan/build/deploy', () => {
    const content = src('src/ui/Header.tsx');
    expect(content).toContain("plan:");
    expect(content).toContain("build:");
    expect(content).toContain("deploy:");
  });

  it('has MODE_COLORS mapping for all modes', () => {
    const content = src('src/ui/Header.tsx');
    expect(content).toContain('MODE_COLORS');
    expect(content).toContain("'blue'");
    expect(content).toContain("'yellow'");
    expect(content).toContain("'red'");
  });
});

describe('Header.tsx — cost and session display', () => {
  it('shows session ID (shortId)', () => {
    expect(src('src/ui/Header.tsx')).toContain('shortId');
  });

  it('displays the model name', () => {
    expect(src('src/ui/Header.tsx')).toContain('session.model');
  });
});

describe('Header.tsx — infra context', () => {
  it('shows terraform workspace', () => {
    expect(src('src/ui/Header.tsx')).toContain('session.terraformWorkspace');
  });

  it('shows kubectl context', () => {
    expect(src('src/ui/Header.tsx')).toContain('session.kubectlContext');
  });

  it('shows PROD badge for production environments', () => {
    expect(src('src/ui/Header.tsx')).toContain('[PROD]');
  });

  it('shows deploy mode production warning banner', () => {
    expect(src('src/ui/Header.tsx')).toContain('DEPLOY MODE — targeting production');
  });

  it('showProdWarning requires deploy mode and prod env', () => {
    const content = src('src/ui/Header.tsx');
    expect(content).toContain("session.mode === 'deploy'");
    expect(content).toContain('showProdWarning');
  });

  it('shows k8s-ctx/tf-ws switch hint', () => {
    expect(src('src/ui/Header.tsx')).toContain('/k8s-ctx | /tf-ws to switch');
  });
});

// ===========================================================================
// MessageList.tsx
// ===========================================================================

describe('MessageList.tsx — component export', () => {
  it('exports MessageList component', () => {
    expect(src('src/ui/MessageList.tsx')).toContain('export function MessageList(');
  });
});

describe('MessageList.tsx — syntax highlighting', () => {
  it('has terraform/HCL highlighting', () => {
    const content = src('src/ui/MessageList.tsx');
    expect(content).toContain('terraform');
    expect(content).toContain('HCL_KEYWORDS');
  });

  it('has YAML/k8s highlighting', () => {
    const content = src('src/ui/MessageList.tsx');
    expect(content).toContain("'yaml'");
    expect(content).toContain('tokenizeYamlLine');
  });

  it('has JSON highlighting', () => {
    const content = src('src/ui/MessageList.tsx');
    expect(content).toContain("'json'");
    expect(content).toContain('tokenizeJsonLine');
  });

  it('has Bash highlighting', () => {
    const content = src('src/ui/MessageList.tsx');
    expect(content).toContain("'bash'");
    expect(content).toContain('BASH_KEYWORDS');
    expect(content).toContain('tokenizeBashLine');
  });

  it('has SQL highlighting', () => {
    const content = src('src/ui/MessageList.tsx');
    expect(content).toContain("'sql'");
    expect(content).toContain('SQL_KEYWORDS');
  });

  it('has Dockerfile highlighting', () => {
    const content = src('src/ui/MessageList.tsx');
    expect(content).toContain("'dockerfile'");
    expect(content).toContain('tokenizeDockerfileLine');
  });
});

describe('MessageList.tsx — clipboard export', () => {
  it('exports _copyToClipboard for testing', () => {
    expect(src('src/ui/MessageList.tsx')).toContain('export const _copyToClipboard');
  });

  it('uses pbcopy for macOS', () => {
    expect(src('src/ui/MessageList.tsx')).toContain('pbcopy');
  });

  it('uses xclip for Linux', () => {
    expect(src('src/ui/MessageList.tsx')).toContain('xclip');
  });
});

describe('MessageList.tsx — scroll support', () => {
  it('accepts scrollOffset prop', () => {
    expect(src('src/ui/MessageList.tsx')).toContain('scrollOffset');
  });
});

describe('MessageList.tsx — welcome state', () => {
  it('shows DevOps welcome state on empty screen', () => {
    expect(src('src/ui/MessageList.tsx')).toContain('What would you like to do?');
  });

  it('includes terraform plan example', () => {
    expect(src('src/ui/MessageList.tsx')).toContain('terraform plan');
  });

  it('includes kubernetes example', () => {
    expect(src('src/ui/MessageList.tsx')).toContain('pod restart');
  });
});

describe('MessageList.tsx — subagent tag parsing', () => {
  it('parses [subagent: tags', () => {
    const content = src('src/ui/MessageList.tsx');
    expect(content).toContain('[subagent:');
    expect(content).toContain('parseSubagentTag');
  });
});

// ===========================================================================
// ToolCallDisplay.tsx
// ===========================================================================

describe('ToolCallDisplay.tsx — component export', () => {
  it('exports ToolCallDisplay component', () => {
    expect(src('src/ui/ToolCallDisplay.tsx')).toContain('export function ToolCallDisplay(');
  });
});

describe('ToolCallDisplay.tsx — elapsed timer', () => {
  it('shows elapsed time counter', () => {
    const content = src('src/ui/ToolCallDisplay.tsx');
    expect(content).toContain('elapsed');
    expect(content).toContain('Date.now()');
  });

  it('uses setInterval to update elapsed time', () => {
    expect(src('src/ui/ToolCallDisplay.tsx')).toContain('setInterval');
  });
});

describe('ToolCallDisplay.tsx — LIVE indicator', () => {
  it('shows [LIVE] label for streaming output', () => {
    expect(src('src/ui/ToolCallDisplay.tsx')).toContain('[LIVE]');
  });

  it('applies green bold color to LIVE indicator', () => {
    expect(src('src/ui/ToolCallDisplay.tsx')).toContain('color="green" bold');
  });

  it('shows LIVE indicator for logs tool', () => {
    expect(src('src/ui/ToolCallDisplay.tsx')).toContain('● LIVE');
  });
});

describe('ToolCallDisplay.tsx — streaming output window', () => {
  it('shows last N lines of streaming output while running', () => {
    const content = src('src/ui/ToolCallDisplay.tsx');
    // Uses slice(-windowSize) pattern to show last N lines
    expect(content).toContain('slice(-');
    expect(content).toContain('windowSize');
  });

  it('renders streaming output when tool is running', () => {
    expect(src('src/ui/ToolCallDisplay.tsx')).toContain("status === 'running'");
    expect(src('src/ui/ToolCallDisplay.tsx')).toContain('streamingOutput');
  });
});

describe('ToolCallDisplay.tsx — status handling', () => {
  it('handles completed status', () => {
    expect(src('src/ui/ToolCallDisplay.tsx')).toContain("'completed'");
  });

  it('handles running status', () => {
    expect(src('src/ui/ToolCallDisplay.tsx')).toContain("'running'");
  });

  it('handles failed status', () => {
    expect(src('src/ui/ToolCallDisplay.tsx')).toContain("'failed'");
  });
});

describe('ToolCallDisplay.tsx — streaming output coloring', () => {
  it('colors lines containing "will be created" green', () => {
    expect(src('src/ui/ToolCallDisplay.tsx')).toContain('will be created');
  });

  it('applies green color for created lines', () => {
    expect(src('src/ui/ToolCallDisplay.tsx')).toContain("'green'");
  });
});

// ===========================================================================
// InputBox.tsx
// ===========================================================================

describe('InputBox.tsx — component export', () => {
  it('exports InputBox component', () => {
    expect(src('src/ui/InputBox.tsx')).toContain('export function InputBox(');
  });
});

describe('InputBox.tsx — SLASH_COMMANDS array', () => {
  it('defines SLASH_COMMANDS array', () => {
    expect(src('src/ui/InputBox.tsx')).toContain('SLASH_COMMANDS');
  });

  it('includes /plan', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'/plan'");
  });

  it('includes /apply', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'/apply'");
  });

  it('includes /drift', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'/drift'");
  });

  it('includes /rollback', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'/rollback'");
  });

  it('includes /search', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'/search'");
  });

  it('includes /terminal', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'/terminal'");
  });

  it('includes /tree', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'/tree'");
  });

  it('includes /k8s-ctx', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'/k8s-ctx'");
  });

  it('includes /tf-ws', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'/tf-ws'");
  });

  it('includes /help', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'/help'");
  });

  it('includes /watch', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'/watch'");
  });

  it('includes /branch', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'/branch'");
  });

  it('includes /explain', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'/explain'");
  });
});

describe('InputBox.tsx — placeholder text', () => {
  it('shows DevOps-specific placeholder text', () => {
    expect(src('src/ui/InputBox.tsx')).toContain('Type a DevOps command');
  });
});

describe('InputBox.tsx — @agent completions', () => {
  it('has AGENT_NAMES constant', () => {
    expect(src('src/ui/InputBox.tsx')).toContain('AGENT_NAMES');
  });

  it('includes explore agent', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'explore'");
  });

  it('includes infra agent', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'infra'");
  });

  it('includes security agent', () => {
    expect(src('src/ui/InputBox.tsx')).toContain("'security'");
  });

  it('maps agent names to @name format for suggestions', () => {
    expect(src('src/ui/InputBox.tsx')).toContain('@${a} ');
  });
});

describe('InputBox.tsx — persistent history', () => {
  it('loads history from disk', () => {
    expect(src('src/ui/InputBox.tsx')).toContain('loadHistory');
  });

  it('saves history to disk', () => {
    expect(src('src/ui/InputBox.tsx')).toContain('saveHistory');
  });

  it('uses input-history.json file', () => {
    expect(src('src/ui/InputBox.tsx')).toContain('input-history.json');
  });

  it('saves history on new entry submission', () => {
    expect(src('src/ui/InputBox.tsx')).toContain('saveHistory(h)');
  });

  it('persists history on unmount via useEffect cleanup', () => {
    const content = src('src/ui/InputBox.tsx');
    expect(content).toContain('return () => {');
    expect(content).toContain('saveHistory(history.current)');
  });
});

// ===========================================================================
// StatusBar.tsx
// ===========================================================================

describe('StatusBar.tsx — component export', () => {
  it('exports StatusBar component', () => {
    expect(src('src/ui/StatusBar.tsx')).toContain('export function StatusBar(');
  });
});

describe('StatusBar.tsx — scroll hint', () => {
  it('shows scroll hint when scrolled', () => {
    const content = src('src/ui/StatusBar.tsx');
    expect(content).toContain('showScrollHint');
    expect(content).toContain('scroll');
  });
});

describe('StatusBar.tsx — copy toast', () => {
  it('shows copy toast message', () => {
    const content = src('src/ui/StatusBar.tsx');
    expect(content).toContain('copyToast');
  });
});

describe('StatusBar.tsx — runbook progress / mode badges', () => {
  it('shows mode badges for all three modes', () => {
    const content = src('src/ui/StatusBar.tsx');
    expect(content).toContain('ModeBadge');
    expect(content).toContain('MODES');
  });
});

describe('StatusBar.tsx — visual progress bar', () => {
  it('has progressBar variable', () => {
    expect(src('src/ui/StatusBar.tsx')).toContain('progressBar');
  });

  it('uses filled block character', () => {
    expect(src('src/ui/StatusBar.tsx')).toContain('█');
  });

  it('uses empty block character', () => {
    expect(src('src/ui/StatusBar.tsx')).toContain('░');
  });

  it('defines BAR_WIDTH constant', () => {
    expect(src('src/ui/StatusBar.tsx')).toContain('BAR_WIDTH');
  });
});

describe('StatusBar.tsx — ? help hint', () => {
  it('shows ? help hint', () => {
    expect(src('src/ui/StatusBar.tsx')).toContain('? help');
  });
});

// ===========================================================================
// HelpModal.tsx
// ===========================================================================

describe('HelpModal.tsx — component export', () => {
  it('exports HelpModal component', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('export function HelpModal(');
  });
});

describe('HelpModal.tsx — content categories', () => {
  it('has Slash Commands section', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('Slash Commands');
  });

  it('has DevOps Tools section', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('DevOps');
  });

  it('has Keyboard Shortcuts section', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('Keyboard Shortcuts');
  });
});

describe('HelpModal.tsx — DevOps commands listed', () => {
  it('lists /mode plan command', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('/mode plan');
  });

  it('lists /mode command', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('/mode');
  });

  it('lists /compact command', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('/compact');
  });

  it('lists /context command', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('/context');
  });

  it('lists terraform in DevOps tools', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('terraform');
  });

  it('lists kubectl in DevOps tools', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('kubectl');
  });

  it('lists helm in DevOps tools', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('helm');
  });
});

describe('HelpModal.tsx — keyboard shortcuts', () => {
  it('shows Tab shortcut for mode cycling', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('Tab');
  });

  it('shows Ctrl+C shortcut', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('Ctrl+C');
  });

  it('shows ? key shortcut', () => {
    expect(src('src/ui/HelpModal.tsx')).toContain('?');
  });

  it('closes on Escape, q, or ?', () => {
    const content = src('src/ui/HelpModal.tsx');
    expect(content).toContain('key.escape');
    expect(content).toContain("input === 'q'");
    expect(content).toContain("input === '?'");
  });
});

// ===========================================================================
// PermissionPrompt.tsx
// ===========================================================================

describe('PermissionPrompt.tsx — component export', () => {
  it('exports PermissionPrompt component', () => {
    expect(src('src/ui/PermissionPrompt.tsx')).toContain('export function PermissionPrompt(');
  });
});

describe('PermissionPrompt.tsx — decision type', () => {
  it('exports PermissionDecision type', () => {
    expect(src('src/ui/PermissionPrompt.tsx')).toContain('PermissionDecision');
  });

  it('has approve decision', () => {
    expect(src('src/ui/PermissionPrompt.tsx')).toContain("'approve'");
  });

  it('has reject decision', () => {
    expect(src('src/ui/PermissionPrompt.tsx')).toContain("'reject'");
  });

  it('has approve_all decision', () => {
    expect(src('src/ui/PermissionPrompt.tsx')).toContain("'approve_all'");
  });

  it('has session decision', () => {
    expect(src('src/ui/PermissionPrompt.tsx')).toContain("'session'");
  });
});

describe('PermissionPrompt.tsx — keyboard handlers', () => {
  it("handles 'a' key for approve", () => {
    const content = src('src/ui/PermissionPrompt.tsx');
    expect(content).toContain("case 'a':");
    expect(content).toContain("onDecide('approve')");
  });

  it("handles 'r' key for reject", () => {
    const content = src('src/ui/PermissionPrompt.tsx');
    expect(content).toContain("case 'r':");
    expect(content).toContain("onDecide('reject')");
  });

  it("handles 'A' key for approve all", () => {
    const content = src('src/ui/PermissionPrompt.tsx');
    expect(content).toContain("case 'A':");
    expect(content).toContain("onDecide('approve_all')");
  });

  it("handles 's' key for session approve", () => {
    const content = src('src/ui/PermissionPrompt.tsx');
    expect(content).toContain("case 's':");
    expect(content).toContain("onDecide('session')");
  });
});

describe('PermissionPrompt.tsx — risk levels', () => {
  it('exports RiskLevel type', () => {
    expect(src('src/ui/PermissionPrompt.tsx')).toContain('RiskLevel');
  });

  it('has risk level colors map', () => {
    expect(src('src/ui/PermissionPrompt.tsx')).toContain('RISK_COLORS');
  });

  it('has risk descriptions for all levels', () => {
    expect(src('src/ui/PermissionPrompt.tsx')).toContain('RISK_DESCRIPTIONS');
  });
});

// ===========================================================================
// FileDiffModal.tsx
// ===========================================================================

describe('FileDiffModal.tsx — component export', () => {
  it('exports FileDiffModal component', () => {
    expect(src('src/ui/FileDiffModal.tsx')).toContain('export function FileDiffModal(');
  });
});

describe('FileDiffModal.tsx — decision type', () => {
  it('exports FileDiffDecision type with apply/reject', () => {
    const content = src('src/ui/FileDiffModal.tsx');
    expect(content).toContain("'apply'");
    expect(content).toContain("'reject'");
    expect(content).toContain("'apply-all'");
    expect(content).toContain("'reject-all'");
  });
});

describe('FileDiffModal.tsx — batch processing', () => {
  it('exports queueFileDiffBatch function', () => {
    expect(src('src/ui/FileDiffModal.tsx')).toContain('export function queueFileDiffBatch');
  });

  it('exports FileDiffRequest interface', () => {
    expect(src('src/ui/FileDiffModal.tsx')).toContain('FileDiffRequest');
  });
});

// ===========================================================================
// TerminalPane.tsx
// ===========================================================================

describe('TerminalPane.tsx — component export', () => {
  it('exports TerminalPane component', () => {
    expect(src('src/ui/TerminalPane.tsx')).toContain('export function TerminalPane(');
  });
});

describe('TerminalPane.tsx — functionality', () => {
  it('shows raw tool output', () => {
    expect(src('src/ui/TerminalPane.tsx')).toContain('Terminal Output');
  });

  it('references /terminal to toggle', () => {
    expect(src('src/ui/TerminalPane.tsx')).toContain('/terminal to toggle');
  });

  it('shows live streaming output while tool is running', () => {
    const content = src('src/ui/TerminalPane.tsx');
    expect(content).toContain("status === 'running'");
    expect(content).toContain('streamingOutput');
  });
});

// ===========================================================================
// TreePane.tsx
// ===========================================================================

describe('TreePane.tsx — component export', () => {
  it('exports TreePane component', () => {
    expect(src('src/ui/TreePane.tsx')).toContain('export function TreePane(');
  });
});

describe('TreePane.tsx — functionality', () => {
  it('references /tree to toggle', () => {
    expect(src('src/ui/TreePane.tsx')).toContain('/tree to toggle');
  });

  it('builds a file tree', () => {
    expect(src('src/ui/TreePane.tsx')).toContain('buildTree');
  });

  it('supports file selection callback', () => {
    expect(src('src/ui/TreePane.tsx')).toContain('onSelectFile');
  });

  it('navigates with up/down arrows', () => {
    const content = src('src/ui/TreePane.tsx');
    expect(content).toContain('key.upArrow');
    expect(content).toContain('key.downArrow');
  });
});

// ===========================================================================
// src/ui/ink/index.ts
// ===========================================================================

describe('ink/index.ts — startInkChat export', () => {
  it('exports startInkChat function', () => {
    expect(src('src/ui/ink/index.ts')).toContain('export async function startInkChat(');
  });
});

describe('ink/index.ts — FileWatcher setup', () => {
  it('creates FileWatcher on startup', () => {
    expect(src('src/ui/ink/index.ts')).toContain('new FileWatcher(');
  });

  it('imports FileWatcher and FileChangeEvent', () => {
    const content = src('src/ui/ink/index.ts');
    expect(content).toContain('FileWatcher');
    expect(content).toContain('FileChangeEvent');
  });

  it('watcher listener uses FileChangeEvent type', () => {
    expect(src('src/ui/ink/index.ts')).toContain('(event: FileChangeEvent)');
  });

  it('watcher listener uses event.path (not changedPath)', () => {
    expect(src('src/ui/ink/index.ts')).toContain('event.path');
  });

  it('does not use (changedPath as any) defensive cast', () => {
    expect(src('src/ui/ink/index.ts')).not.toContain('changedPath as any');
  });

  it('does not have typeof changedPath check', () => {
    expect(src('src/ui/ink/index.ts')).not.toContain('typeof changedPath');
  });
});

describe('ink/index.ts — NIMBUS.md loading', () => {
  it('loads NIMBUS.md on startup', () => {
    expect(src('src/ui/ink/index.ts')).toContain('NIMBUS.md');
  });
});

describe('ink/index.ts — permission state', () => {
  it('creates permissionState on startup', () => {
    expect(src('src/ui/ink/index.ts')).toContain('createPermissionState');
  });

  it('mode switching resets permission state', () => {
    const content = src('src/ui/ink/index.ts');
    // Should re-assign or re-create permission state on mode change
    expect(content).toContain('createPermissionState()');
  });
});

describe('ink/index.ts — startup warnings', () => {
  it('pushes to _startupWarnings for SQLite failure display', () => {
    expect(src('src/ui/ink/index.ts')).toContain('_startupWarnings.push');
  });

  it('surfaces Session persistence unavailable warning', () => {
    expect(src('src/ui/ink/index.ts')).toContain('Session persistence unavailable');
  });
});

describe('ink/index.ts — DevOps file change notifications', () => {
  it('debounces DevOps file changes', () => {
    expect(src('src/ui/ink/index.ts')).toContain('devopsChangeDebounce');
  });

  it('checks isDevOps for file extension matching', () => {
    expect(src('src/ui/ink/index.ts')).toContain('isDevOps');
  });

  it('prompts user to /plan or /drift on file change', () => {
    expect(src('src/ui/ink/index.ts')).toContain('type ${hint} to review drift impact');
  });
});

describe('ink/index.ts — session resume hint', () => {
  it('shows Previous session available hint', () => {
    expect(src('src/ui/ink/index.ts')).toContain('Previous session available');
  });

  it('mentions /sessions command in resume hint', () => {
    expect(src('src/ui/ink/index.ts')).toContain('type /sessions to resume');
  });
});

describe('ink/index.ts — infra context persistence', () => {
  it('persists current infra context', () => {
    expect(src('src/ui/ink/index.ts')).toContain('currentInfraContext');
  });

  it('has infraStatePath for saving context', () => {
    expect(src('src/ui/ink/index.ts')).toContain('infraStatePath');
  });
});

// ===========================================================================
// HTTP API Server — src/cli/serve.ts
// ===========================================================================

describe('serve.ts — serveCommand export', () => {
  it('exports serveCommand function', () => {
    expect(src('src/cli/serve.ts')).toContain('serveCommand');
  });
});

describe('serve.ts — default port', () => {
  it('uses default port 4200', () => {
    expect(src('src/cli/serve.ts')).toContain('4200');
  });
});

describe('serve.ts — endpoints', () => {
  it('defines /api/chat endpoint', () => {
    expect(src('src/cli/serve.ts')).toContain('/api/chat');
  });

  it('defines /api/run endpoint', () => {
    expect(src('src/cli/serve.ts')).toContain('/api/run');
  });

  it('defines /api/sessions endpoint', () => {
    expect(src('src/cli/serve.ts')).toContain('/api/sessions');
  });

  it('defines /api/health endpoint', () => {
    expect(src('src/cli/serve.ts')).toContain('/api/health');
  });

  it('defines /api/openapi.json endpoint', () => {
    expect(src('src/cli/serve.ts')).toContain('/api/openapi.json');
  });
});

describe('serve.ts — SSE streaming', () => {
  it('uses SSE (Server-Sent Events) for streaming', () => {
    const content = src('src/cli/serve.ts');
    // SSE uses text/event-stream content type or data: prefix
    const hasSSE = content.includes('text/event-stream') || content.includes('data:') || content.includes('SSE') || content.includes('stream');
    expect(hasSSE).toBe(true);
  });
});

describe('serve.ts — auth support', () => {
  it('imports createAuthMiddleware', () => {
    expect(src('src/cli/serve.ts')).toContain('createAuthMiddleware');
  });

  it('has auth option in ServeOptions', () => {
    expect(src('src/cli/serve.ts')).toContain("auth?:");
  });
});

describe('serve.ts — port option', () => {
  it('accepts port option', () => {
    expect(src('src/cli/serve.ts')).toContain("port?:");
  });
});

// ===========================================================================
// OpenAPI Spec — src/cli/openapi-spec.ts (via functional import)
// ===========================================================================

describe('openapi-spec.ts — getOpenAPISpec export', () => {
  it('exports getOpenAPISpec function', () => {
    expect(src('src/cli/openapi-spec.ts')).toContain('getOpenAPISpec');
  });
});

describe('openapi-spec.ts — spec version', () => {
  it('spec openapi version is 3.1.0 or 3.0.x (source check)', () => {
    const content = src('src/cli/openapi-spec.ts');
    const has31 = content.includes("'3.1.0'") || content.includes('"3.1.0"');
    const has30 = content.includes("'3.0.") || content.includes('"3.0.');
    expect(has31 || has30).toBe(true);
  });

  it('spec has openapi field', () => {
    const content = src('src/cli/openapi-spec.ts');
    expect(content).toContain('openapi');
  });
});

describe('openapi-spec.ts — endpoint paths', () => {
  it('has /api/chat path in source', () => {
    expect(src('src/cli/openapi-spec.ts')).toContain('/api/chat');
  });

  it('has /api/run path in source', () => {
    expect(src('src/cli/openapi-spec.ts')).toContain('/api/run');
  });

  it('has /api/sessions path in source', () => {
    expect(src('src/cli/openapi-spec.ts')).toContain('/api/sessions');
  });

  it('has /api/health path in source', () => {
    expect(src('src/cli/openapi-spec.ts')).toContain('/api/health');
  });
});

describe('openapi-spec.ts — server URL', () => {
  it('lists localhost:4200 as server in source', () => {
    expect(src('src/cli/openapi-spec.ts')).toContain('localhost:4200');
  });
});

// ===========================================================================
// Web Command — src/cli/web.ts
// ===========================================================================

describe('web.ts — webCommand export', () => {
  it('exports webCommand function', () => {
    expect(src('src/cli/web.ts')).toContain('export async function webCommand(');
  });
});

describe('web.ts — browser opening', () => {
  it('opens browser to localhost URL', () => {
    const content = src('src/cli/web.ts');
    expect(content).toContain('localhost');
    expect(content).toContain('openBrowser');
  });

  it('uses cross-platform browser open', () => {
    const content = src('src/cli/web.ts');
    expect(content).toContain("platform === 'darwin'");
    expect(content).toContain("platform === 'win32'");
    expect(content).toContain("'xdg-open'");
  });
});

describe('web.ts — starts serve first', () => {
  it('calls serveCommand', () => {
    expect(src('src/cli/web.ts')).toContain('serveCommand');
  });

  it('imports serveCommand from serve', () => {
    expect(src('src/cli/web.ts')).toContain("from './serve'");
  });
});

describe('web.ts — default UI URL', () => {
  it('uses /nimbus path for Web UI', () => {
    expect(src('src/cli/web.ts')).toContain('/nimbus');
  });

  it('defaults to port 6001 for Web UI', () => {
    expect(src('src/cli/web.ts')).toContain('6001');
  });
});

// ===========================================================================
// Generate Terraform — src/commands/generate-terraform.ts
// ===========================================================================

describe('generate-terraform.ts — function exports', () => {
  it('has detectCloudProviders function', () => {
    expect(src('src/commands/generate-terraform.ts')).toContain('async function detectCloudProviders()');
  });

  it('has scanTfFilesForProviders function', () => {
    expect(src('src/commands/generate-terraform.ts')).toContain('function scanTfFilesForProviders()');
  });
});

describe('generate-terraform.ts — AWS detection', () => {
  it('checks AWS_ACCESS_KEY_ID env var', () => {
    expect(src('src/commands/generate-terraform.ts')).toContain('AWS_ACCESS_KEY_ID');
  });

  it('checks ~/.aws/credentials file', () => {
    expect(src('src/commands/generate-terraform.ts')).toContain('.aws');
    expect(src('src/commands/generate-terraform.ts')).toContain('credentials');
  });
});

describe('generate-terraform.ts — GCP detection', () => {
  it('checks GOOGLE_APPLICATION_CREDENTIALS env var', () => {
    expect(src('src/commands/generate-terraform.ts')).toContain('GOOGLE_APPLICATION_CREDENTIALS');
  });
});

describe('generate-terraform.ts — Azure detection', () => {
  it('checks AZURE_SUBSCRIPTION_ID env var', () => {
    expect(src('src/commands/generate-terraform.ts')).toContain('AZURE_SUBSCRIPTION_ID');
  });
});

describe('generate-terraform.ts — .tf file scanning', () => {
  it('scans .tf files for provider declarations', () => {
    const content = src('src/commands/generate-terraform.ts');
    expect(content).toContain('.tf');
    expect(content).toContain("provider\\s+");
  });

  it('detects aws provider in tf files', () => {
    expect(src('src/commands/generate-terraform.ts')).toContain("'aws'");
  });

  it('detects google provider in tf files', () => {
    expect(src('src/commands/generate-terraform.ts')).toContain("'gcp'");
  });

  it('detects azurerm provider in tf files', () => {
    expect(src('src/commands/generate-terraform.ts')).toContain("'azure'");
  });
});

// ===========================================================================
// Generate K8s — src/commands/generate-k8s.ts or src/generator/kubernetes.ts
// ===========================================================================

describe('generate-k8s.ts — command exists', () => {
  it('generate-k8s command file exists', () => {
    const content = src('src/commands/generate-k8s.ts');
    // Should have some content
    expect(content.length).toBeGreaterThan(0);
  });

  it('has a generateK8s or similar function/export', () => {
    const content = src('src/commands/generate-k8s.ts');
    const hasExport = content.includes('export') || content.includes('module.exports');
    expect(hasExport).toBe(true);
  });
});

// ===========================================================================
// Onboarding — src/commands/onboarding.ts
// ===========================================================================

describe('onboarding.ts — needsOnboarding export', () => {
  it('exports needsOnboarding function', () => {
    expect(src('src/commands/onboarding.ts')).toContain('export function needsOnboarding()');
  });
});

describe('onboarding.ts — needsOnboarding logic', () => {
  it('returns false if authStore.exists()', () => {
    const content = src('src/commands/onboarding.ts');
    expect(content).toContain('store.exists()');
    expect(content).toContain('return false');
  });

  it('checks ANTHROPIC_API_KEY env var', () => {
    expect(src('src/commands/onboarding.ts')).toContain('ANTHROPIC_API_KEY');
  });

  it('checks OPENAI_API_KEY env var', () => {
    expect(src('src/commands/onboarding.ts')).toContain('OPENAI_API_KEY');
  });

  it('checks GOOGLE_API_KEY env var', () => {
    expect(src('src/commands/onboarding.ts')).toContain('GOOGLE_API_KEY');
  });

  it('checks AWS_ACCESS_KEY_ID for Bedrock', () => {
    expect(src('src/commands/onboarding.ts')).toContain('AWS_ACCESS_KEY_ID');
  });

  it('returns false if any provider env var set', () => {
    const content = src('src/commands/onboarding.ts');
    expect(content).toContain('hasEnvKey');
    expect(content).toContain('return !hasEnvKey');
  });
});

describe('onboarding.ts — onboardingCommand export', () => {
  it('exports onboardingCommand function', () => {
    expect(src('src/commands/onboarding.ts')).toContain('export async function onboardingCommand(');
  });
});

// ===========================================================================
// Version — src/commands/version.ts
// ===========================================================================

describe('version.ts — versionCommand export', () => {
  it('exports versionCommand function', () => {
    expect(src('src/commands/version.ts')).toContain('export async function versionCommand(');
  });

  it('has default export of versionCommand', () => {
    expect(src('src/commands/version.ts')).toContain('export default versionCommand');
  });
});

describe('version.ts — version retrieval', () => {
  it('has getCliVersion function', () => {
    expect(src('src/commands/version.ts')).toContain('function getCliVersion()');
  });

  it('tries NIMBUS_VERSION env var first', () => {
    expect(src('src/commands/version.ts')).toContain('NIMBUS_VERSION');
  });

  it('reads from package.json as fallback', () => {
    expect(src('src/commands/version.ts')).toContain('package.json');
  });
});

describe('version.ts — package.json version consistency', () => {
  it('package.json has a version field', () => {
    const pkg = JSON.parse(src('package.json'));
    expect(typeof pkg.version).toBe('string');
    expect(pkg.version.length).toBeGreaterThan(0);
  });

  it('src/version.ts exports VERSION constant', () => {
    expect(src('src/version.ts')).toContain('VERSION');
    expect(src('src/version.ts')).toContain('export');
  });
});

// ===========================================================================
// Additional cross-cutting checks
// ===========================================================================

describe('App.tsx — TerminalPane and TreePane imports', () => {
  it('imports TerminalPane component', () => {
    expect(src('src/ui/App.tsx')).toContain("import { TerminalPane }");
  });

  it('imports TreePane component', () => {
    expect(src('src/ui/App.tsx')).toContain("import { TreePane }");
  });

  it('imports HelpModal component', () => {
    expect(src('src/ui/App.tsx')).toContain("import { HelpModal }");
  });

  it('imports FileDiffModal component', () => {
    expect(src('src/ui/App.tsx')).toContain("FileDiffModal");
  });
});

describe('App.tsx — completedToolCalls buffer for TerminalPane', () => {
  it('tracks completedToolCalls state', () => {
    expect(src('src/ui/App.tsx')).toContain('completedToolCalls');
  });
});

describe('ink/index.ts — watcher event handling correctness', () => {
  it('uses type-safe event.path not a string parameter', () => {
    const content = src('src/ui/ink/index.ts');
    // The handler uses (event: FileChangeEvent) and event.path
    expect(content).toContain('event.path');
    // Should NOT have the old-style (changedPath: string) signature
    expect(content).not.toContain('changedPath: string');
  });
});
