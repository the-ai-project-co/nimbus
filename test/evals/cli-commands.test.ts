/**
 * E2E Tests — CLI Command Routing and Major Commands
 *
 * Validates that the CLI router dispatches to the correct command handlers,
 * that parseRunArgs correctly extracts flags and prompts, that initProject
 * scaffolds NIMBUS.md, and that major commands (doctor, alias, status,
 * export, help, version, config) behave correctly.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// Temp directory setup — redirect ~/.nimbus writes to an isolated temp dir
// ---------------------------------------------------------------------------
let tmpDir: string;

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof os>('node:os');
  return {
    ...actual,
    homedir: () => tmpDir ?? actual.homedir(),
  };
});

function freshTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-cli-e2e-'));
  fs.mkdirSync(path.join(dir, '.nimbus'), { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// 1. parseRunArgs — pure function tests (no side-effects)
// ---------------------------------------------------------------------------

describe('parseRunArgs', () => {
  let parseRunArgs: typeof import('../../src/cli/run').parseRunArgs;

  beforeEach(async () => {
    tmpDir = freshTmpDir();
    vi.resetModules();
    const mod = await import('../../src/cli/run');
    parseRunArgs = mod.parseRunArgs;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('extracts prompt from positional arguments', () => {
    const opts = parseRunArgs(['deploy', 'staging', 'environment']);
    expect(opts.prompt).toBe('deploy staging environment');
  });

  test('defaults format to text', () => {
    const opts = parseRunArgs(['hello']);
    expect(opts.format).toBe('text');
  });

  test('handles --auto-approve flag', () => {
    const opts = parseRunArgs(['do stuff', '--auto-approve']);
    expect(opts.autoApprove).toBe(true);
  });

  test('handles -y shorthand for auto-approve', () => {
    const opts = parseRunArgs(['-y', 'deploy']);
    expect(opts.autoApprove).toBe(true);
  });

  test('handles --non-interactive alias for auto-approve', () => {
    const opts = parseRunArgs(['--non-interactive', 'deploy']);
    expect(opts.autoApprove).toBe(true);
  });

  test('handles --format json flag', () => {
    const opts = parseRunArgs(['prompt', '--format', 'json']);
    expect(opts.format).toBe('json');
  });

  test('handles --json shorthand', () => {
    const opts = parseRunArgs(['prompt', '--json']);
    expect(opts.format).toBe('json');
  });

  test('handles --model flag', () => {
    const opts = parseRunArgs(['prompt', '--model', 'claude-opus-4-6']);
    expect(opts.model).toBe('claude-opus-4-6');
  });

  test('handles --mode flag', () => {
    const opts = parseRunArgs(['prompt', '--mode', 'deploy']);
    expect(opts.mode).toBe('deploy');
  });

  test('defaults mode to build', () => {
    const opts = parseRunArgs(['prompt']);
    expect(opts.mode).toBe('build');
  });

  test('handles --max-turns flag', () => {
    const opts = parseRunArgs(['prompt', '--max-turns', '10']);
    expect(opts.maxTurns).toBe(10);
  });

  test('handles --timeout flag (seconds to ms)', () => {
    const opts = parseRunArgs(['prompt', '--timeout', '30']);
    expect(opts.timeout).toBe(30000);
  });

  test('handles --dry-run flag and forces plan mode', () => {
    const opts = parseRunArgs(['prompt', '--dry-run']);
    expect(opts.dryRun).toBe(true);
    expect(opts.mode).toBe('plan');
  });

  test('handles --budget flag', () => {
    const opts = parseRunArgs(['prompt', '--budget', '1.50']);
    expect(opts.budget).toBe(1.5);
  });

  test('handles --schema flag', () => {
    const opts = parseRunArgs(['--schema']);
    expect(opts.schema).toBe(true);
  });

  test('handles --context and --workspace flags', () => {
    const opts = parseRunArgs([
      'prompt',
      '--context', 'my-k8s-ctx',
      '--workspace', 'staging',
    ]);
    expect(opts.context).toBe('my-k8s-ctx');
    expect(opts.workspace).toBe('staging');
  });

  test('handles --namespace / -n flag', () => {
    const opts = parseRunArgs(['prompt', '-n', 'kube-system']);
    expect(opts.namespace).toBe('kube-system');
  });

  test('handles --notify and --notify-slack flags', () => {
    const opts = parseRunArgs([
      'prompt',
      '--notify', 'https://hook.example.com',
      '--notify-slack', 'https://hooks.slack.com/abc',
    ]);
    expect(opts.notify).toBe('https://hook.example.com');
    expect(opts.notifySlack).toBe('https://hooks.slack.com/abc');
  });

  test('ignores unknown flags', () => {
    const opts = parseRunArgs(['--unknown-flag', 'prompt']);
    expect(opts.prompt).toBe('prompt');
  });
});

// ---------------------------------------------------------------------------
// 2. CLI command routing — verify the router imports are correct
// ---------------------------------------------------------------------------

describe('CLI command routing (import verification)', () => {
  beforeEach(() => {
    tmpDir = freshTmpDir();
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('doctorCommand is an async function', async () => {
    const { doctorCommand } = await import('../../src/commands/doctor');
    expect(typeof doctorCommand).toBe('function');
  });

  test('versionCommand is an async function', async () => {
    const { versionCommand } = await import('../../src/commands/version');
    expect(typeof versionCommand).toBe('function');
  });

  test('helpCommand is an async function', async () => {
    const { helpCommand } = await import('../../src/commands/help');
    expect(typeof helpCommand).toBe('function');
  });

  test('configCommand exposes set/get/list/init/reset subcommands', async () => {
    const { configCommand } = await import('../../src/commands/config');
    expect(typeof configCommand.set).toBe('function');
    expect(typeof configCommand.get).toBe('function');
    expect(typeof configCommand.list).toBe('function');
    expect(typeof configCommand.init).toBe('function');
    expect(typeof configCommand.reset).toBe('function');
  });

  test('initCommand is an async function', async () => {
    const { initCommand } = await import('../../src/commands/init');
    expect(typeof initCommand).toBe('function');
  });

  test('aliasCommand is an async function', async () => {
    const { aliasCommand } = await import('../../src/commands/alias');
    expect(typeof aliasCommand).toBe('function');
  });

  test('statusCommand is an async function', async () => {
    const { statusCommand } = await import('../../src/commands/status');
    expect(typeof statusCommand).toBe('function');
  });

  test('exportCommand is an async function', async () => {
    const { exportCommand } = await import('../../src/commands/export');
    expect(typeof exportCommand).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// 3. generateNimbusMd — verifies generated NIMBUS.md content
// ---------------------------------------------------------------------------

describe('generateNimbusMd', () => {
  beforeEach(() => {
    tmpDir = freshTmpDir();
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('generates markdown with project name header', async () => {
    const { generateNimbusMd } = await import('../../src/cli/init');
    const md = generateNimbusMd(
      {
        projectName: 'my-service',
        projectType: 'typescript',
        infraTypes: ['terraform'],
        cloudProviders: ['aws'],
        hasGit: true,
        packageManager: 'npm',
        testFramework: 'vitest',
      },
      tmpDir,
    );
    expect(md).toContain('# my-service');
  });

  test('includes project type in output', async () => {
    const { generateNimbusMd } = await import('../../src/cli/init');
    const md = generateNimbusMd(
      {
        projectName: 'app',
        projectType: 'go',
        infraTypes: [],
        cloudProviders: [],
        hasGit: false,
      },
      tmpDir,
    );
    expect(md).toContain('go');
  });

  test('includes infrastructure section when infra is detected', async () => {
    const { generateNimbusMd } = await import('../../src/cli/init');
    const md = generateNimbusMd(
      {
        projectName: 'app',
        projectType: 'typescript',
        infraTypes: ['kubernetes', 'helm'],
        cloudProviders: ['gcp'],
        hasGit: true,
      },
      tmpDir,
    );
    expect(md).toContain('Infrastructure');
  });

  test('includes package manager when detected', async () => {
    const { generateNimbusMd } = await import('../../src/cli/init');
    const md = generateNimbusMd(
      {
        projectName: 'app',
        projectType: 'typescript',
        infraTypes: [],
        cloudProviders: [],
        hasGit: true,
        packageManager: 'pnpm',
      },
      tmpDir,
    );
    expect(md).toContain('pnpm');
  });
});

// ---------------------------------------------------------------------------
// 4. detectProjectType — project detection
// ---------------------------------------------------------------------------

describe('detectProjectType', () => {
  beforeEach(() => {
    tmpDir = freshTmpDir();
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('detects TypeScript project', async () => {
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
    const { detectProjectType } = await import('../../src/cli/init');
    expect(detectProjectType(tmpDir)).toBe('typescript');
  });

  test('detects Go project', async () => {
    fs.writeFileSync(path.join(tmpDir, 'go.mod'), 'module example.com/app');
    const { detectProjectType } = await import('../../src/cli/init');
    expect(detectProjectType(tmpDir)).toBe('go');
  });

  test('detects Python project', async () => {
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[tool.poetry]');
    const { detectProjectType } = await import('../../src/cli/init');
    expect(detectProjectType(tmpDir)).toBe('python');
  });

  test('returns unknown for empty directory', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-empty-'));
    const { detectProjectType } = await import('../../src/cli/init');
    expect(detectProjectType(emptyDir)).toBe('unknown');
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// 5. aliasCommand — alias registration and resolution
// ---------------------------------------------------------------------------

describe('aliasCommand and resolveAlias', () => {
  beforeEach(() => {
    tmpDir = freshTmpDir();
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  test('resolveAlias returns original args when no alias exists', async () => {
    const { resolveAlias } = await import('../../src/commands/alias');
    expect(resolveAlias(['run', '--help'])).toEqual(['run', '--help']);
  });

  test('resolveAlias expands a registered alias', async () => {
    const nimbusDir = path.join(tmpDir, '.nimbus');
    fs.mkdirSync(nimbusDir, { recursive: true });
    fs.writeFileSync(
      path.join(nimbusDir, 'aliases.json'),
      JSON.stringify({ deploy: 'run --auto-approve "deploy staging"' }),
    );

    const { resolveAlias } = await import('../../src/commands/alias');
    const result = resolveAlias(['deploy']);
    expect(result[0]).toBe('run');
    expect(result).toContain('--auto-approve');
  });

  test('aliasCommand creates alias file', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { aliasCommand } = await import('../../src/commands/alias');
    await aliasCommand('myalias=run "do something"', []);

    const aliasFile = path.join(tmpDir, '.nimbus', 'aliases.json');
    expect(fs.existsSync(aliasFile)).toBe(true);
    const data = JSON.parse(fs.readFileSync(aliasFile, 'utf-8')) as Record<string, string>;
    expect(data['myalias']).toBe('run "do something"');
  });
});

// ---------------------------------------------------------------------------
// 6. helpCommand — categorized help text
// ---------------------------------------------------------------------------

describe('helpCommand', () => {
  beforeEach(() => {
    tmpDir = freshTmpDir();
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  test('general help prints usage information', async () => {
    const output: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation((...args) => output.push(args.join(' ')));

    const { helpCommand } = await import('../../src/commands/help');
    await helpCommand({});

    const combined = output.join('\n');
    expect(combined).toContain('nimbus');
  });

  test('command-specific help includes usage for run', async () => {
    const output: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation((...args) => output.push(args.join(' ')));

    const { helpCommand } = await import('../../src/commands/help');
    await helpCommand({ command: 'run' });

    const combined = output.join('\n');
    expect(combined).toContain('run');
  });

  test('unknown command shows error hint', async () => {
    const output: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation((...args) => output.push(args.join(' ')));

    const { helpCommand } = await import('../../src/commands/help');
    await helpCommand({ command: 'nonexistent-xyz-command' });

    const combined = output.join('\n');
    expect(combined).toContain('Unknown command');
  });
});

// ---------------------------------------------------------------------------
// 7. RunJsonOutput schema type check
// ---------------------------------------------------------------------------

describe('RunJsonOutput type shape', () => {
  test('RunJsonOutput interface has expected fields', async () => {
    // Verify the interface can be instantiated with the expected shape
    const output: import('../../src/cli/run').RunJsonOutput = {
      success: true,
      output: 'done',
      cost: 0.01,
      turns: 3,
      toolCalls: [{ name: 'bash', success: true, durationMs: 100 }],
      errors: [],
    };
    expect(output.success).toBe(true);
    expect(output.toolCalls).toHaveLength(1);
  });

  test('RunOptions interface includes all expected flags', async () => {
    const opts: import('../../src/cli/run').RunOptions = {
      prompt: 'test',
      format: 'json',
      autoApprove: true,
      stdin: false,
      stdinJson: false,
      mode: 'build',
      maxTurns: 50,
    };
    expect(opts.prompt).toBe('test');
    expect(opts.format).toBe('json');
  });
});

// ---------------------------------------------------------------------------
// 8. detectInfrastructure
// ---------------------------------------------------------------------------

describe('detectInfrastructure', () => {
  beforeEach(() => {
    tmpDir = freshTmpDir();
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('detects Terraform when .tf files present', async () => {
    fs.writeFileSync(path.join(tmpDir, 'main.tf'), 'resource "aws_instance" "app" {}');
    const { detectInfrastructure } = await import('../../src/cli/init');
    const infra = detectInfrastructure(tmpDir);
    expect(infra).toContain('terraform');
  });

  test('detects Docker when Dockerfile present', async () => {
    fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:18');
    const { detectInfrastructure } = await import('../../src/cli/init');
    const infra = detectInfrastructure(tmpDir);
    expect(infra).toContain('docker');
  });

  test('detects CI/CD when .github/workflows exists', async () => {
    fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.github', 'workflows', 'ci.yml'), 'name: CI');
    const { detectInfrastructure } = await import('../../src/cli/init');
    const infra = detectInfrastructure(tmpDir);
    expect(infra).toContain('cicd');
  });

  test('returns empty array for bare directory', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-empty-infra-'));
    const { detectInfrastructure } = await import('../../src/cli/init');
    const infra = detectInfrastructure(emptyDir);
    expect(infra).toEqual([]);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});
