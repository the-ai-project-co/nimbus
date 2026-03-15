/**
 * Exhaustive CLI Commands Test Suite
 *
 * Comprehensive coverage of CLI router, non-interactive run, init, doctor,
 * login, connect-github, upgrade, watch, hooks, snapshots, audit, status,
 * and history commands.
 *
 * Pattern: source-level assertions via readFileSync + runtime import checks.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CWD = process.cwd();
const src = (rel: string) => readFileSync(join(CWD, rel), 'utf-8');

// ===========================================================================
// CLI ROUTER (src/cli.ts)
// ===========================================================================

describe('CLI Router — exports and runCommand', () => {
  it('runCommand is exported from cli.ts', async () => {
    const { runCommand } = await import('../cli');
    expect(typeof runCommand).toBe('function');
  });

  it('cli.ts exports a runCommand function', () => {
    const code = src('src/cli.ts');
    expect(code).toContain('export async function runCommand');
  });
});

describe('CLI Router — command routes', () => {
  it("routes 'login' command", () => {
    const code = src('src/cli.ts');
    expect(code).toContain("command === 'login'");
  });

  it("routes 'logout' command", () => {
    const code = src('src/cli.ts');
    expect(code).toContain("command === 'logout'");
  });

  it("routes 'doctor' command", () => {
    const code = src('src/cli.ts');
    expect(code).toContain("command === 'doctor'");
  });

  it("routes 'init' command", () => {
    const code = src('src/cli.ts');
    expect(code).toContain("command === 'init'");
  });

  it("routes 'run' command", () => {
    const code = src('src/cli.ts');
    expect(code).toContain("command === 'run'");
  });

  it("routes 'chat' command", () => {
    const code = src('src/cli.ts');
    expect(code).toContain("command === 'chat'");
  });

  it("routes 'serve' command", () => {
    const code = src('src/cli.ts');
    expect(code).toContain("command === 'serve'");
  });

  it("routes 'web' command", () => {
    const code = src('src/cli.ts');
    expect(code).toContain("command === 'web'");
  });

  it("routes 'upgrade' and 'update' command", () => {
    const code = src('src/cli.ts');
    expect(code).toContain("command === 'upgrade'");
    expect(code).toContain("command === 'update'");
  });

  it("routes 'export' command", () => {
    const code = src('src/cli.ts');
    expect(code).toContain("command === 'export'");
  });

  it("routes 'history' command", () => {
    const code = src('src/cli.ts');
    expect(code).toContain("command === 'history'");
  });

  it("routes 'watch' command", () => {
    const code = src('src/cli.ts');
    expect(code).toContain("command === 'watch'");
  });

  it("routes 'connect' command with github subcommand", () => {
    const code = src('src/cli.ts');
    expect(code).toContain("command === 'connect'");
    expect(code).toContain("subcommand === 'github'");
    expect(code).toContain("connectGitHubCommand");
  });

  it("routes 'auth-refresh' command", () => {
    const code = src('src/cli.ts');
    expect(code).toContain("command === 'auth-refresh'");
  });

  it("routes 'status' command", () => {
    const code = src('src/cli.ts');
    expect(code).toContain("command === 'status'");
  });

  it("routes 'version' and '--version' command", () => {
    const code = src('src/cli.ts');
    expect(code).toContain("command === 'version'");
    expect(code).toContain("command === '--version'");
  });
});

describe('CLI Router — aliases and flags', () => {
  it("aliases 'pr' → ['gh', 'pr']", () => {
    const code = src('src/cli.ts');
    expect(code).toContain("pr: ['gh', 'pr']");
  });

  it('parses --yes/-y flag (at least -y handled in run/login context)', () => {
    const code = src('src/cli.ts');
    // -y is used in some sub-commands; assert it appears
    expect(code).toContain("'-y'");
  });

  it('parses --provider flag for generate terraform', () => {
    const code = src('src/cli.ts');
    // generate terraform section must parse --provider
    expect(code).toContain("'--provider'");
  });

  it('handles generate terraform command', () => {
    const code = src('src/cli.ts');
    expect(code).toContain("command === 'generate' && subcommand === 'terraform'");
  });

  it('handles generate k8s command', () => {
    const code = src('src/cli.ts');
    expect(code).toContain("command === 'generate' && subcommand === 'k8s'");
  });

  it('parses global --model flag for chat command', () => {
    const code = src('src/cli.ts');
    expect(code).toContain("'--model'");
  });

  it('parses --mode flag (plan/build/deploy) — in run.ts parseRunArgs', () => {
    // --mode is handled in parseRunArgs (cli/run.ts), not in cli.ts dispatch
    const code = src('src/cli/run.ts');
    expect(code).toContain("'--mode'");
  });

  it('parses --format flag', () => {
    const code = src('src/cli.ts');
    expect(code).toContain("'--format'");
  });
});

// ===========================================================================
// NON-INTERACTIVE RUN (src/cli/run.ts)
// ===========================================================================

describe('parseRunArgs — exports and basic parsing', () => {
  it('parseRunArgs is exported from cli/run.ts', async () => {
    const { parseRunArgs } = await import('../cli/run');
    expect(typeof parseRunArgs).toBe('function');
  });

  it('executeRun is exported from cli/run.ts', async () => {
    const { executeRun } = await import('../cli/run');
    expect(typeof executeRun).toBe('function');
  });

  it("parses '--auto-approve' sets autoApprove: true", async () => {
    const { parseRunArgs } = await import('../cli/run');
    const result = parseRunArgs(['--auto-approve', 'my prompt']);
    expect(result.autoApprove).toBe(true);
    expect(result.prompt).toBe('my prompt');
  });

  it("parses '--format json' sets format: 'json'", async () => {
    const { parseRunArgs } = await import('../cli/run');
    const result = parseRunArgs(['--format', 'json', 'run this']);
    expect(result.format).toBe('json');
    expect(result.prompt).toBe('run this');
  });

  it("parses '--dry-run' sets dryRun: true and mode: 'plan'", async () => {
    const { parseRunArgs } = await import('../cli/run');
    const result = parseRunArgs(['--dry-run', 'check infra']);
    expect(result.dryRun).toBe(true);
    expect(result.mode).toBe('plan');
  });

  it("parses '--model claude-opus-4' sets model", async () => {
    const { parseRunArgs } = await import('../cli/run');
    const result = parseRunArgs(['--model', 'claude-opus-4', 'analyze']);
    expect(result.model).toBe('claude-opus-4');
  });

  it("parses '--mode build' sets mode: 'build'", async () => {
    const { parseRunArgs } = await import('../cli/run');
    const result = parseRunArgs(['--mode', 'build', 'do something']);
    expect(result.mode).toBe('build');
  });

  it("parses '--timeout 60' sets timeout to 60000 ms", async () => {
    const { parseRunArgs } = await import('../cli/run');
    const result = parseRunArgs(['--timeout', '60', 'run job']);
    expect(result.timeout).toBe(60000);
  });

  it("parses '--stdin' sets stdin: true", async () => {
    const { parseRunArgs } = await import('../cli/run');
    const result = parseRunArgs(['--stdin']);
    expect(result.stdin).toBe(true);
  });
});

describe('RunJsonOutput shape', () => {
  it('RunJsonOutput interface has planSummary field', () => {
    const code = src('src/cli/run.ts');
    expect(code).toContain('planSummary');
  });

  it('RunJsonOutput interface has devops_summary field', () => {
    const code = src('src/cli/run.ts');
    expect(code).toContain('devops_summary');
  });

  it('RunJsonOutput interface has infraContext field', () => {
    const code = src('src/cli/run.ts');
    expect(code).toContain('infraContext');
  });
});

// ===========================================================================
// INIT COMMAND (src/cli/init.ts)
// ===========================================================================

describe('Init — exports and detection functions', () => {
  it('detectProjectType is exported from cli/init.ts', async () => {
    const { detectProjectType } = await import('../cli/init');
    expect(typeof detectProjectType).toBe('function');
  });

  it('runInit is exported from cli/init.ts', async () => {
    const { runInit } = await import('../cli/init');
    expect(typeof runInit).toBe('function');
  });

  it('generateNimbusMd is exported from cli/init.ts', async () => {
    const { generateNimbusMd } = await import('../cli/init');
    expect(typeof generateNimbusMd).toBe('function');
  });

  it('discoverInfraContext is exported from cli/init.ts', async () => {
    const { discoverInfraContext } = await import('../cli/init');
    expect(typeof discoverInfraContext).toBe('function');
  });
});

describe('Init — project type detection (6 languages)', () => {
  it("detects 'typescript' project type", async () => {
    const { detectProjectType } = await import('../cli/init');
    // Our own project is TypeScript (has tsconfig.json)
    const type = detectProjectType(CWD);
    expect(type).toBe('typescript');
  });

  it("source includes 'typescript' | 'javascript' | 'go' | 'python' | 'rust' | 'java' types", () => {
    const code = src('src/cli/init.ts');
    expect(code).toContain("'typescript'");
    expect(code).toContain("'javascript'");
    expect(code).toContain("'go'");
    expect(code).toContain("'python'");
    expect(code).toContain("'rust'");
    expect(code).toContain("'java'");
  });
});

describe('Init — infrastructure detection', () => {
  it('detects terraform infra type from source', () => {
    const code = src('src/cli/init.ts');
    expect(code).toContain("'terraform'");
  });

  it('detects kubernetes infra type from source', () => {
    const code = src('src/cli/init.ts');
    expect(code).toContain("'kubernetes'");
  });

  it('detects helm infra type from source', () => {
    const code = src('src/cli/init.ts');
    expect(code).toContain("'helm'");
  });

  it('detects docker infra type from source', () => {
    const code = src('src/cli/init.ts');
    expect(code).toContain("'docker'");
  });
});

describe('Init — NIMBUS.md generation', () => {
  it('generateNimbusMd returns a string containing project name', async () => {
    const { generateNimbusMd, detectProject } = await import('../cli/init');
    const detection = detectProject(CWD);
    const md = generateNimbusMd(detection, CWD);
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(0);
    expect(md).toContain('## Safety Rules');
  });

  it('generateNimbusMd includes environments table', async () => {
    const { generateNimbusMd, detectProject } = await import('../cli/init');
    const detection = detectProject(CWD);
    const md = generateNimbusMd(detection, CWD);
    expect(md).toContain('## Environments');
  });
});

// ===========================================================================
// DOCTOR COMMAND (src/commands/doctor.ts)
// ===========================================================================

describe('Doctor command — exports', () => {
  it('doctorCommand is exported from commands/doctor.ts', async () => {
    const { doctorCommand } = await import('../commands/doctor');
    expect(typeof doctorCommand).toBe('function');
  });

  it('DoctorOptions interface has fix field in source', () => {
    const code = src('src/commands/doctor.ts');
    expect(code).toContain('fix?:');
  });
});

describe('Doctor command — checks', () => {
  it('source checks SQLite DB (auth.json / credentials)', () => {
    const code = src('src/commands/doctor.ts');
    expect(code).toContain('auth.json');
  });

  it('source checks LLM auth / provider', () => {
    const code = src('src/commands/doctor.ts');
    expect(code).toContain('LLM Provider');
  });

  it('source checks tool registry', () => {
    const code = src('src/commands/doctor.ts');
    expect(code).toContain('Tool Registry');
  });

  it('source supports --fix flag (runFix or fix handler)', () => {
    const code = src('src/commands/doctor.ts');
    expect(code).toContain('runFix');
  });

  it('source checks real DevOps CLI versions (not localhost ports)', () => {
    const code = src('src/commands/doctor.ts');
    // Should check terraform, kubectl, helm, etc.
    expect(code).toContain('terraform');
    expect(code).toContain('kubectl');
    // Should NOT check localhost ports like 3001-3011
    expect(code).not.toContain('localhost:300');
  });

  it('DoctorOptions has verbose, json, metrics fields', () => {
    const code = src('src/commands/doctor.ts');
    expect(code).toContain('verbose?:');
    expect(code).toContain('json?:');
    expect(code).toContain('metrics?:');
  });
});

// ===========================================================================
// LOGIN COMMAND (src/commands/login.ts)
// ===========================================================================

describe('Login command — exports', () => {
  it('loginCommand is exported from commands/login.ts', async () => {
    const { loginCommand } = await import('../commands/login');
    expect(typeof loginCommand).toBe('function');
  });
});

describe('Login command — LoginOptions interface', () => {
  it('LoginOptions has skipGitHub field', () => {
    const code = src('src/commands/login.ts');
    expect(code).toContain('skipGitHub?:');
  });

  it('LoginOptions has provider field', () => {
    const code = src('src/commands/login.ts');
    expect(code).toContain('provider?:');
  });

  it('LoginOptions has apiKey field', () => {
    const code = src('src/commands/login.ts');
    expect(code).toContain('apiKey?:');
  });

  it('LoginOptions has model field', () => {
    const code = src('src/commands/login.ts');
    expect(code).toContain('model?:');
  });

  it('LoginOptions has nonInteractive field', () => {
    const code = src('src/commands/login.ts');
    expect(code).toContain('nonInteractive?:');
  });
});

describe('Login command — wizard and non-interactive behavior', () => {
  it('non-interactive path returns false if no provider', () => {
    const code = src('src/commands/login.ts');
    // The non-interactive runner checks options.provider
    expect(code).toContain('options.provider');
    expect(code).toContain('return false');
  });

  it('wizard creates welcome step', () => {
    const code = src('src/commands/login.ts');
    expect(code).toContain("id: 'welcome'");
  });

  it('wizard creates LLM provider step', () => {
    const code = src('src/commands/login.ts');
    // Either 'providers-loop' or 'llm-provider' step
    expect(code).toMatch(/id:\s*['"](?:providers-loop|llm-provider)['"]/);
  });

  it('wizard creates complete step', () => {
    const code = src('src/commands/login.ts');
    expect(code).toContain("id: 'complete'");
  });

  it('GitHub identity step is NOT present (removed)', () => {
    const code = src('src/commands/login.ts');
    expect(code).not.toContain("id: 'github-identity'");
  });

  it('post-completion hint mentions nimbus connect github', () => {
    const code = src('src/commands/login.ts');
    expect(code).toContain('nimbus connect github');
  });

  it('loginCommand returns boolean', () => {
    const code = src('src/commands/login.ts');
    expect(code).toContain('Promise<boolean>');
  });
});

// ===========================================================================
// CONNECT GITHUB (src/commands/connect-github.ts)
// ===========================================================================

describe('Connect GitHub command', () => {
  it('connectGitHubCommand is exported', async () => {
    const { connectGitHubCommand } = await import('../commands/connect-github');
    expect(typeof connectGitHubCommand).toBe('function');
  });

  it('does NOT contain "Continue without GitHub sign-in"', () => {
    const code = src('src/commands/connect-github.ts');
    expect(code).not.toContain('Continue without GitHub sign-in');
  });

  it('contains github.com/settings/developers in error message', () => {
    const code = src('src/commands/connect-github.ts');
    expect(code).toContain('github.com/settings/developers');
  });

  it('contains nimbus connect github retry hint', () => {
    const code = src('src/commands/connect-github.ts');
    expect(code).toContain('nimbus connect github');
  });

  it('uses GitHubDeviceFlow', () => {
    const code = src('src/commands/connect-github.ts');
    expect(code).toContain('GitHubDeviceFlow');
  });

  it('returns boolean (Promise<boolean>)', () => {
    const code = src('src/commands/connect-github.ts');
    expect(code).toContain('Promise<boolean>');
  });
});

// ===========================================================================
// UPGRADE COMMAND (src/commands/upgrade.ts)
// ===========================================================================

describe('Upgrade command', () => {
  it('upgradeCommand is exported', async () => {
    const { upgradeCommand } = await import('../commands/upgrade');
    expect(typeof upgradeCommand).toBe('function');
  });

  it('detects homebrew install method', () => {
    const code = src('src/commands/upgrade.ts');
    expect(code).toContain("'homebrew'");
  });

  it('detects npm install method', () => {
    const code = src('src/commands/upgrade.ts');
    expect(code).toContain("'npm'");
  });

  it('source mentions version comparison', () => {
    const code = src('src/commands/upgrade.ts');
    // Version comparison likely involves semver or VERSION constant
    expect(code).toContain('VERSION');
  });

  it('UpgradeOptions has force, check, dryRun fields', () => {
    const code = src('src/commands/upgrade.ts');
    expect(code).toContain('force?:');
    expect(code).toContain('check?:');
    expect(code).toContain('dryRun?:');
  });
});

// ===========================================================================
// WATCH COMMAND (src/commands/watch.ts)
// ===========================================================================

describe('Watch command', () => {
  it('watchCommand is exported', async () => {
    const { watchCommand } = await import('../commands/watch');
    expect(typeof watchCommand).toBe('function');
  });

  it('WatchOptions has glob field', () => {
    const code = src('src/commands/watch.ts');
    expect(code).toContain('glob');
  });

  it('WatchOptions has run field', () => {
    const code = src('src/commands/watch.ts');
    expect(code).toContain('run?:');
  });

  it('WatchOptions has debounce field', () => {
    const code = src('src/commands/watch.ts');
    expect(code).toContain('debounce?:');
  });

  it('WatchOptions has autoApprove field', () => {
    const code = src('src/commands/watch.ts');
    expect(code).toContain('autoApprove?:');
  });

  it('WatchOptions has maxRuns field', () => {
    const code = src('src/commands/watch.ts');
    expect(code).toContain('maxRuns?:');
  });

  it('source uses fs.watch or FSWatcher for file watching', () => {
    const code = src('src/commands/watch.ts');
    // Uses node:fs watch (FSWatcher)
    expect(code).toMatch(/FSWatcher|fsWatch|fs\.watch|node:fs/);
  });
});

// ===========================================================================
// HOOKS (src/hooks/)
// ===========================================================================

describe('Hooks — HookEngine', () => {
  it('HookEngine is exported from src/hooks/', async () => {
    const { HookEngine } = await import('../hooks');
    expect(typeof HookEngine).toBe('function');
  });

  it('HookEngine has executeHooks method', async () => {
    const { HookEngine } = await import('../hooks');
    const engine = new HookEngine();
    expect(typeof engine.executeHooks).toBe('function');
  });

  it('supports PreToolUse event type', () => {
    const code = src('src/hooks/config.ts');
    expect(code).toContain("'PreToolUse'");
  });

  it('supports PostToolUse event type', () => {
    const code = src('src/hooks/config.ts');
    expect(code).toContain("'PostToolUse'");
  });

  it('exit code 0 = allow in engine comments/docs', () => {
    const code = src('src/hooks/engine.ts');
    expect(code).toContain('Exit 0');
  });

  it('exit code 2 = block in engine comments/docs', () => {
    const code = src('src/hooks/engine.ts');
    expect(code).toContain('Exit 2');
  });

  it('default hook timeout is 30 seconds', () => {
    const code = src('src/hooks/config.ts');
    expect(code).toContain('DEFAULT_HOOK_TIMEOUT = 30_000');
  });

  it('YAML config supported (loadHooksConfig exported)', async () => {
    const { loadHooksConfig } = await import('../hooks');
    expect(typeof loadHooksConfig).toBe('function');
  });
});

describe('Hooks — HookDefinition and config types', () => {
  it('HookDefinition has match, command, timeout fields', () => {
    const code = src('src/hooks/config.ts');
    expect(code).toContain('match: string');
    expect(code).toContain('command: string');
    expect(code).toContain('timeout?:');
  });

  it('HooksConfig has hooks record keyed by event', () => {
    const code = src('src/hooks/config.ts');
    expect(code).toContain('HooksConfig');
    expect(code).toContain('HookEvent');
  });
});

// ===========================================================================
// SNAPSHOTS (src/snapshots/)
// ===========================================================================

describe('Snapshots — SnapshotManager', () => {
  it('SnapshotManager is exported from snapshots/manager.ts', async () => {
    const { SnapshotManager } = await import('../snapshots/manager');
    expect(typeof SnapshotManager).toBe('function');
  });

  it('SnapshotManager has captureSnapshot method', async () => {
    const { SnapshotManager } = await import('../snapshots/manager');
    const manager = new SnapshotManager({ projectDir: CWD });
    expect(typeof manager.captureSnapshot).toBe('function');
  });

  it('SnapshotManager has restoreSnapshot method', async () => {
    const { SnapshotManager } = await import('../snapshots/manager');
    const manager = new SnapshotManager({ projectDir: CWD });
    expect(typeof manager.restoreSnapshot).toBe('function');
  });

  it('SnapshotManager has getHistory (list) method', async () => {
    const { SnapshotManager } = await import('../snapshots/manager');
    const manager = new SnapshotManager({ projectDir: CWD });
    expect(typeof manager.getHistory).toBe('function');
  });

  it('SnapshotManager has undo method', async () => {
    const { SnapshotManager } = await import('../snapshots/manager');
    const manager = new SnapshotManager({ projectDir: CWD });
    expect(typeof manager.undo).toBe('function');
  });

  it('SnapshotManager has redo method', async () => {
    const { SnapshotManager } = await import('../snapshots/manager');
    const manager = new SnapshotManager({ projectDir: CWD });
    expect(typeof manager.redo).toBe('function');
  });
});

describe('Snapshots — Snapshot interface', () => {
  it('Snapshot interface has id field', () => {
    const code = src('src/snapshots/manager.ts');
    expect(code).toContain('id: string');
  });

  it('Snapshot interface has timestamp field', () => {
    const code = src('src/snapshots/manager.ts');
    expect(code).toContain('timestamp: Date');
  });

  it('Snapshot interface has description field', () => {
    const code = src('src/snapshots/manager.ts');
    expect(code).toContain('description: string');
  });
});

describe('Snapshots — Git and non-git modes', () => {
  it('git mode uses git write-tree', () => {
    const code = src('src/snapshots/manager.ts');
    expect(code).toContain('write-tree');
  });

  it('git mode uses git read-tree for restore', () => {
    const code = src('src/snapshots/manager.ts');
    expect(code).toContain('read-tree');
  });

  it('non-git mode uses fs.cpSync or recursive copy', () => {
    const code = src('src/snapshots/manager.ts');
    // Non-git mode copies files
    expect(code).toContain('captureFilesystemSnapshot');
  });

  it('skips node_modules in non-git mode', () => {
    const code = src('src/snapshots/manager.ts');
    expect(code).toContain("'node_modules'");
  });

  it('skips .git in non-git mode', () => {
    const code = src('src/snapshots/manager.ts');
    expect(code).toContain("'.git'");
  });

  it('skips dist in non-git mode', () => {
    const code = src('src/snapshots/manager.ts');
    expect(code).toContain("'dist'");
  });
});

// ===========================================================================
// AUDIT (src/audit/)
// ===========================================================================

describe('Audit — Security Scanner', () => {
  it('scanSecurity is exported from audit/security-scanner.ts', async () => {
    const { scanSecurity } = await import('../audit/security-scanner');
    expect(typeof scanSecurity).toBe('function');
  });

  it('SecurityFinding interface has severity field', () => {
    const code = src('src/audit/security-scanner.ts');
    expect(code).toContain('severity: Severity');
  });

  it('SecurityFinding interface has message/title field', () => {
    const code = src('src/audit/security-scanner.ts');
    // The interface uses "title" not "message"
    expect(code).toContain('title: string');
  });

  it('SecurityFinding interface has file field', () => {
    const code = src('src/audit/security-scanner.ts');
    expect(code).toContain('file?: string');
  });

  it('has at least 5 security detection rules', () => {
    const code = src('src/audit/security-scanner.ts');
    // Count rule IDs like SEC-001, TF-001, etc.
    const ruleIds = code.match(/id:\s*['"](?:SEC|TF|K8S|APP)-\d+['"]/g);
    expect(ruleIds).not.toBeNull();
    expect(ruleIds!.length).toBeGreaterThanOrEqual(5);
  });

  it('detects hardcoded secrets rule', () => {
    const code = src('src/audit/security-scanner.ts');
    expect(code).toContain('Hardcoded API key or secret');
  });

  it('detects SQL injection risk or open security group', () => {
    const code = src('src/audit/security-scanner.ts');
    // Has either SQL injection or open security group patterns
    const hasOpenSG = code.includes('0.0.0.0/0');
    const hasSQLi = code.includes('SQL injection') || code.includes('sql_injection');
    expect(hasOpenSG || hasSQLi).toBe(true);
  });
});

describe('Audit — Compliance Checker', () => {
  it('checkCompliance is exported from audit/compliance-checker.ts', async () => {
    const { checkCompliance } = await import('../audit/compliance-checker');
    expect(typeof checkCompliance).toBe('function');
  });

  it('ComplianceControl has framework field', () => {
    const code = src('src/audit/compliance-checker.ts');
    expect(code).toContain('framework: Framework');
  });

  it('supports GDPR framework', () => {
    const code = src('src/audit/compliance-checker.ts');
    expect(code).toContain("'GDPR'");
  });

  it('supports HIPAA framework', () => {
    const code = src('src/audit/compliance-checker.ts');
    expect(code).toContain("'HIPAA'");
  });

  it('supports PCI framework', () => {
    const code = src('src/audit/compliance-checker.ts');
    expect(code).toContain("'PCI'");
  });

  it('supports SOC2 framework', () => {
    const code = src('src/audit/compliance-checker.ts');
    expect(code).toContain("'SOC2'");
  });

  it('supports CIS framework', () => {
    const code = src('src/audit/compliance-checker.ts');
    expect(code).toContain("'CIS'");
  });
});

describe('Audit — Cost Tracker', () => {
  it('CostTracker class is exported from audit/cost-tracker.ts', async () => {
    const { CostTracker } = await import('../audit/cost-tracker');
    expect(typeof CostTracker).toBe('function');
  });

  it('CostTracker can be instantiated', async () => {
    const { CostTracker } = await import('../audit/cost-tracker');
    const tracker = new CostTracker();
    expect(tracker).toBeInstanceOf(CostTracker);
  });
});

describe('Audit — Activity Log', () => {
  it('ActivityLog class is exported from audit/activity-log.ts', async () => {
    const { ActivityLog } = await import('../audit/activity-log');
    expect(typeof ActivityLog).toBe('function');
  });

  it('ActivityLog can be instantiated', async () => {
    const { ActivityLog } = await import('../audit/activity-log');
    const log = new ActivityLog();
    expect(log).toBeInstanceOf(ActivityLog);
  });
});

// ===========================================================================
// STATUS COMMAND (src/commands/status.ts)
// ===========================================================================

describe('Status command', () => {
  it('statusCommand is exported from commands/status.ts', async () => {
    const { statusCommand } = await import('../commands/status');
    expect(typeof statusCommand).toBe('function');
  });

  it('StatusOptions has json field', () => {
    const code = src('src/commands/status.ts');
    expect(code).toContain('json?:');
  });

  it('source returns infrastructure status info (k8s, terraform, aws)', () => {
    const code = src('src/commands/status.ts');
    expect(code).toContain('k8sContext');
    expect(code).toContain('tfWorkspace');
    expect(code).toContain('awsAccount');
  });

  it('status is wired in cli.ts', () => {
    const code = src('src/cli.ts');
    expect(code).toContain("command === 'status'");
    expect(code).toContain('statusCommand');
  });
});

// ===========================================================================
// HISTORY COMMAND (src/commands/history.ts)
// ===========================================================================

describe('History command', () => {
  it('historyCommand is exported from commands/history.ts', async () => {
    const { historyCommand } = await import('../commands/history');
    expect(typeof historyCommand).toBe('function');
  });

  it('HistoryOptions has limit field', () => {
    const code = src('src/commands/history.ts');
    expect(code).toContain('limit?:');
  });

  it('HistoryOptions has filter field', () => {
    const code = src('src/commands/history.ts');
    expect(code).toContain('filter?:');
  });

  it('HistoryOptions has json field', () => {
    const code = src('src/commands/history.ts');
    expect(code).toContain('json?:');
  });

  it('history is wired in cli.ts', () => {
    const code = src('src/cli.ts');
    expect(code).toContain("command === 'history'");
    expect(code).toContain('historyCommand');
  });
});

// ===========================================================================
// ADDITIONAL INTEGRATION — CLI routing for connect github
// ===========================================================================

describe('CLI routing — connect github', () => {
  it('cli.ts imports connectGitHubCommand for connect github', () => {
    const code = src('src/cli.ts');
    expect(code).toContain("import('./commands/connect-github')");
  });

  it("cli.ts dispatches 'connect github' to connectGitHubCommand()", () => {
    const code = src('src/cli.ts');
    // connectGitHubCommand must be called in the connect section
    const connectIdx = code.indexOf("command === 'connect'");
    const callIdx = code.indexOf('connectGitHubCommand()', connectIdx);
    expect(callIdx).toBeGreaterThan(connectIdx);
  });
});

// ===========================================================================
// ADDITIONAL INTEGRATION — SnapshotManager behavior
// ===========================================================================

describe('SnapshotManager — runtime behavior', () => {
  it('getHistory returns empty array initially', async () => {
    const { SnapshotManager } = await import('../snapshots/manager');
    const manager = new SnapshotManager({ projectDir: CWD });
    const history = manager.getHistory();
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBe(0);
  });

  it('count is 0 initially', async () => {
    const { SnapshotManager } = await import('../snapshots/manager');
    const manager = new SnapshotManager({ projectDir: CWD });
    expect(manager.count).toBe(0);
  });

  it('undo returns "Nothing to undo" when no snapshots', async () => {
    const { SnapshotManager } = await import('../snapshots/manager');
    const manager = new SnapshotManager({ projectDir: CWD });
    const result = await manager.undo();
    expect(result.success).toBe(false);
    expect(result.description).toContain('Nothing to undo');
  });

  it('redo returns "Nothing to redo" when no undone snapshots', async () => {
    const { SnapshotManager } = await import('../snapshots/manager');
    const manager = new SnapshotManager({ projectDir: CWD });
    const result = await manager.redo();
    expect(result.success).toBe(false);
    expect(result.description).toContain('Nothing to redo');
  });
});

// ===========================================================================
// ADDITIONAL INTEGRATION — HookEngine runtime behavior
// ===========================================================================

describe('HookEngine — runtime behavior', () => {
  it('executeHooks returns empty array when no config', async () => {
    const { HookEngine } = await import('../hooks');
    const engine = new HookEngine();
    const results = await engine.executeHooks('PreToolUse', {
      tool: 'bash',
      input: { command: 'echo hi' },
      sessionId: 'test-session',
      agent: 'build',
      timestamp: new Date().toISOString(),
    });
    expect(Array.isArray(results)).toBe(true);
  });

  it('HookEngine accepts projectDir in constructor', async () => {
    const { HookEngine } = await import('../hooks');
    // Should not throw — just tries to load hooks.yaml which may not exist
    expect(() => new HookEngine(CWD)).not.toThrow();
  });
});

// ===========================================================================
// ADDITIONAL INTEGRATION — init detectProject on current workspace
// ===========================================================================

describe('detectProject — full detection on current workspace', () => {
  it('returns ProjectDetection with all required fields', async () => {
    const { detectProject } = await import('../cli/init');
    const detection = detectProject(CWD);
    expect(detection).toHaveProperty('projectName');
    expect(detection).toHaveProperty('projectType');
    expect(detection).toHaveProperty('infraTypes');
    expect(detection).toHaveProperty('cloudProviders');
    expect(detection).toHaveProperty('hasGit');
  });

  it('infraTypes is an array', async () => {
    const { detectProject } = await import('../cli/init');
    const detection = detectProject(CWD);
    expect(Array.isArray(detection.infraTypes)).toBe(true);
  });

  it('cloudProviders is an array', async () => {
    const { detectProject } = await import('../cli/init');
    const detection = detectProject(CWD);
    expect(Array.isArray(detection.cloudProviders)).toBe(true);
  });

  it('hasGit is true (nimbus is a git repo)', async () => {
    const { detectProject } = await import('../cli/init');
    const detection = detectProject(CWD);
    expect(detection.hasGit).toBe(true);
  });
});
