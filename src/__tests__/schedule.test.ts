/**
 * Schedule Command Tests — G13
 *
 * Tests schedule list, add, remove, invalid cron rejection, and
 * crontab activation hint output.
 *
 * File I/O is isolated by mocking node:os.homedir to point to a temp dir.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// We need to control where schedules.json is written.
// Approach: mock node:os homedir to our temp dir, then resetModules
// so the schedule module re-evaluates SCHEDULE_FILE with the new homedir.

let tmpDir: string;

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof os>('node:os');
  return {
    ...actual,
    homedir: () => tmpDir ?? actual.homedir(),
  };
});

async function getScheduleModule() {
  vi.resetModules();
  return await import('../commands/schedule');
}

describe('scheduleCommand list (G13)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-schedule-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('prints "No schedules configured" when schedules.json does not exist', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });

    const { scheduleCommand } = await getScheduleModule();
    await scheduleCommand('list', []);

    const output = logs.join('\n');
    expect(output).toContain('No schedules configured');
  });
});

describe('scheduleCommand add (G13)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-schedule-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('saves a schedule entry when given a valid cron and prompt', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });

    const { scheduleCommand } = await getScheduleModule();
    await scheduleCommand('add', ['0 8 * * *', 'check drift']);

    // Verify the schedule file was written
    const scheduleFile = path.join(tmpDir, '.nimbus', 'schedules.json');
    expect(fs.existsSync(scheduleFile)).toBe(true);

    const data = JSON.parse(fs.readFileSync(scheduleFile, 'utf-8')) as Array<{
      id: string; name: string; cron: string; prompt: string;
    }>;
    expect(data).toHaveLength(1);
    expect(data[0].cron).toBe('0 8 * * *');
    expect(data[0].prompt).toBe('check drift');
  });

  it('prints crontab activation hint after adding a schedule', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });

    const { scheduleCommand } = await getScheduleModule();
    await scheduleCommand('add', ['0 9 * * 1', 'weekly cost report']);

    const output = logs.join('\n');
    expect(output).toContain('crontab');
  });
});

describe('scheduleCommand invalid cron rejection (G13)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-schedule-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('rejects a cron with fewer than 5 fields', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.join(' '));
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    const { scheduleCommand } = await getScheduleModule();

    await expect(scheduleCommand('add', ['* * *', 'bad cron'])).rejects.toThrow('process.exit');

    expect(errors.join('\n')).toContain('Invalid cron expression');
    exitSpy.mockRestore();
  });
});

describe('scheduleCommand remove (G13)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-schedule-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('removes an existing schedule by id', async () => {
    // Seed the schedule file directly
    const nimbusDir = path.join(tmpDir, '.nimbus');
    fs.mkdirSync(nimbusDir, { recursive: true });
    const entry = { id: 'abc123', name: 'my-schedule', cron: '0 8 * * *', prompt: 'drift check', createdAt: new Date().toISOString() };
    fs.writeFileSync(path.join(nimbusDir, 'schedules.json'), JSON.stringify([entry]), 'utf-8');

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });

    const { scheduleCommand } = await getScheduleModule();
    await scheduleCommand('remove', ['abc123']);

    const data = JSON.parse(fs.readFileSync(path.join(nimbusDir, 'schedules.json'), 'utf-8')) as unknown[];
    expect(data).toHaveLength(0);
    expect(logs.join('\n')).toContain('Removed schedule');
  });

  it('shows usage when no id is provided to remove', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.join(' '));
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    const { scheduleCommand } = await getScheduleModule();
    await expect(scheduleCommand('remove', [])).rejects.toThrow('process.exit');

    expect(errors.join('\n')).toContain('Usage');
    exitSpy.mockRestore();
  });
});

describe('scheduleCommand default/unknown subcommand (G13)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-schedule-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('prints usage for unknown subcommand', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });

    const { scheduleCommand } = await getScheduleModule();
    await scheduleCommand('unknown', []);

    expect(logs.join('\n')).toContain('Usage: nimbus schedule');
  });
});
