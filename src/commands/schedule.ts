/**
 * Schedule Command (G13)
 *
 * Manage periodic DevOps automation tasks (drift checks, cert expiry,
 * cost reports) via a local schedule file.
 *
 * Usage:
 *   nimbus schedule list
 *   nimbus schedule add "0 8 * * *" "check for infra drift" [--name daily-drift]
 *   nimbus schedule remove <id-or-name>
 *   nimbus schedule run-now <id-or-name>
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduleEntry {
  id: string;
  name: string;
  cron: string;
  prompt: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const SCHEDULE_FILE = join(homedir(), '.nimbus', 'schedules.json');

function loadSchedules(): ScheduleEntry[] {
  if (!existsSync(SCHEDULE_FILE)) return [];
  try {
    return JSON.parse(readFileSync(SCHEDULE_FILE, 'utf-8')) as ScheduleEntry[];
  } catch {
    return [];
  }
}

function saveSchedules(schedules: ScheduleEntry[]): void {
  mkdirSync(join(homedir(), '.nimbus'), { recursive: true });
  writeFileSync(SCHEDULE_FILE, JSON.stringify(schedules, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Cron validation (5-field: min hour dom month dow)
// ---------------------------------------------------------------------------

function isValidCron(cron: string): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const validPart = /^(\*|\d+(-\d+)?(\/\d+)?)(,(\*|\d+(-\d+)?(\/\d+)?))*$/;
  return parts.every(p => validPart.test(p));
}

/**
 * Estimate next run time in human-readable form (best-effort).
 */
function describeNextRun(cron: string): string {
  const [min, hour, dom, month, dow] = cron.split(/\s+/);
  if (hour === '*' && min === '0') return 'every hour at :00';
  if (dom === '*' && month === '*' && dow === '*') {
    if (hour !== '*' && min !== '*') return `daily at ${hour}:${min.padStart(2, '0')}`;
  }
  if (dow !== '*') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayName = days[parseInt(dow, 10)];
    if (dayName && hour !== '*') return `weekly on ${dayName} at ${hour}:${(min ?? '0').padStart(2, '0')}`;
  }
  return `cron: ${cron}`;
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

function scheduleList(): void {
  const schedules = loadSchedules();
  if (schedules.length === 0) {
    console.log('No schedules configured.');
    console.log('\nAdd one with:');
    console.log('  nimbus schedule add "0 8 * * *" "check for infrastructure drift" --name daily-drift');
    return;
  }

  console.log('Configured schedules:\n');
  for (const s of schedules) {
    console.log(`  ID:     ${s.id}`);
    console.log(`  Name:   ${s.name}`);
    console.log(`  Runs:   ${describeNextRun(s.cron)} (${s.cron})`);
    console.log(`  Prompt: ${s.prompt.slice(0, 80)}${s.prompt.length > 80 ? '...' : ''}`);
    console.log('');
  }
  console.log('To activate, add to crontab (crontab -e):');
  for (const s of schedules) {
    console.log(`  ${s.cron} nimbus schedule run-now ${s.id}`);
  }
}

function scheduleAdd(cron: string, prompt: string, name?: string): void {
  if (!cron || !prompt) {
    console.error('Usage: nimbus schedule add "<cron>" "<prompt>" [--name <name>]');
    process.exit(1);
  }
  if (!isValidCron(cron)) {
    console.error(`Invalid cron expression: "${cron}"`);
    console.error('Expected 5 fields: min hour day-of-month month day-of-week');
    console.error('Example: "0 8 * * *" (daily at 8am)');
    process.exit(1);
  }

  const schedules = loadSchedules();
  const id = randomBytes(4).toString('hex');
  const entryName = name ?? `schedule-${id}`;

  const entry: ScheduleEntry = {
    id,
    name: entryName,
    cron,
    prompt,
    createdAt: new Date().toISOString(),
  };

  schedules.push(entry);
  saveSchedules(schedules);

  console.log(`Schedule added: ${entryName} (ID: ${id})`);
  console.log(`Runs: ${describeNextRun(cron)}`);
  console.log('');
  console.log('To activate, add to crontab (crontab -e):');
  console.log(`  ${cron} nimbus schedule run-now ${id}`);
}

function scheduleRemove(idOrName: string): void {
  const schedules = loadSchedules();
  const idx = schedules.findIndex(s => s.id === idOrName || s.name === idOrName);
  if (idx === -1) {
    console.error(`Schedule not found: ${idOrName}`);
    process.exit(1);
  }
  const removed = schedules.splice(idx, 1)[0];
  saveSchedules(schedules);
  console.log(`Removed schedule: ${removed.name} (${removed.id})`);
}

async function scheduleRunNow(idOrName: string): Promise<void> {
  const schedules = loadSchedules();
  const entry = schedules.find(s => s.id === idOrName || s.name === idOrName);
  if (!entry) {
    console.error(`Schedule not found: ${idOrName}`);
    process.exit(1);
  }

  console.log(`Running schedule: ${entry.name}`);
  console.log(`Prompt: ${entry.prompt}`);
  console.log('');

  const { executeRun, parseRunArgs } = await import('../cli/run');
  const { getAppContext } = await import('../app');

  const ctx = getAppContext();
  if (!ctx) {
    console.error('Error: App not initialised. Make sure credentials are configured.');
    process.exit(1);
  }

  const runOptions = parseRunArgs(['--auto-approve', '--mode', 'build', entry.prompt]);
  await executeRun(ctx.router, runOptions);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function scheduleCommand(subcommand: string, args: string[]): Promise<void> {
  switch (subcommand) {
    case 'list':
    case 'ls':
      scheduleList();
      break;

    case 'add': {
      // nimbus schedule add "<cron>" "<prompt>" [--name <name>]
      const cron = args[0] ?? '';
      const prompt = args[1] ?? '';
      const nameIdx = args.indexOf('--name');
      const name = nameIdx !== -1 ? args[nameIdx + 1] : undefined;
      scheduleAdd(cron, prompt, name);
      break;
    }

    case 'remove':
    case 'rm':
    case 'delete': {
      const idOrName = args[0];
      if (!idOrName) {
        console.error('Usage: nimbus schedule remove <id-or-name>');
        process.exit(1);
      }
      scheduleRemove(idOrName);
      break;
    }

    case 'run-now':
    case 'run': {
      const idOrName = args[0];
      if (!idOrName) {
        console.error('Usage: nimbus schedule run-now <id-or-name>');
        process.exit(1);
      }
      await scheduleRunNow(idOrName);
      break;
    }

    default:
      console.log('Usage: nimbus schedule <list|add|remove|run-now>');
      console.log('');
      console.log('  list                          List configured schedules');
      console.log('  add "<cron>" "<prompt>"       Add a new schedule');
      console.log('  remove <id-or-name>           Remove a schedule');
      console.log('  run-now <id-or-name>          Execute a schedule immediately');
      console.log('');
      console.log('Examples:');
      console.log('  nimbus schedule add "0 8 * * *" "check for infrastructure drift" --name daily-drift');
      console.log('  nimbus schedule add "0 9 * * 1" "generate weekly cost report"');
      console.log('  nimbus schedule list');
      console.log('  nimbus schedule run-now daily-drift');
      break;
  }
}
