/**
 * Alias Command — L2
 *
 * Create, list, and remove command aliases stored in ~/.nimbus/aliases.json.
 *
 * Usage:
 *   nimbus alias deploy=run --auto-approve "deploy staging"
 *   nimbus alias list
 *   nimbus alias remove deploy
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ui } from '../wizard/ui';

const ALIASES_FILE = path.join(os.homedir(), '.nimbus', 'aliases.json');

function loadAliases(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(ALIASES_FILE, 'utf-8')) as Record<string, string>;
  } catch {
    return {};
  }
}

function saveAliases(aliases: Record<string, string>): void {
  const dir = path.dirname(ALIASES_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ALIASES_FILE, JSON.stringify(aliases, null, 2), 'utf-8');
}

/**
 * Resolve the first arg as an alias if one exists.
 * Returns the original args unchanged if no alias matches.
 */
export function resolveAlias(args: string[]): string[] {
  if (!args.length) return args;
  const aliases = loadAliases();
  const expanded = aliases[args[0]];
  if (!expanded) return args;
  // Split the alias value on spaces and prepend to remaining args
  return [...expanded.split(' '), ...args.slice(1)];
}

/**
 * Alias command handler.
 */
export async function aliasCommand(subcommand: string, args: string[]): Promise<void> {
  const aliases = loadAliases();

  if (subcommand === 'list' || (!subcommand && args.length === 0)) {
    ui.header('Command Aliases');
    const entries = Object.entries(aliases);
    if (entries.length === 0) {
      ui.info('No aliases defined. Create one: nimbus alias <name>=<command>');
      return;
    }
    for (const [name, cmd] of entries) {
      ui.print(`  ${ui.color(name, 'green')} = ${cmd}`);
    }
    return;
  }

  if (subcommand === 'remove' || subcommand === 'rm') {
    const name = args[0];
    if (!name) {
      ui.error('Usage: nimbus alias remove <name>');
      process.exit(1);
    }
    if (!(name in aliases)) {
      ui.warning(`Alias "${name}" not found`);
      return;
    }
    delete aliases[name];
    saveAliases(aliases);
    ui.success(`Removed alias: ${name}`);
    return;
  }

  // Create alias: subcommand is "<name>=<rest>" or subcommand is the name and args hold the expansion
  const raw = subcommand + (args.length ? ' ' + args.join(' ') : '');
  const eqIdx = raw.indexOf('=');
  if (eqIdx === -1) {
    ui.error('Usage: nimbus alias <name>=<command>  or  nimbus alias list  or  nimbus alias remove <name>');
    process.exit(1);
  }

  const name = raw.slice(0, eqIdx).trim();
  const cmd = raw.slice(eqIdx + 1).trim();

  if (!name || !cmd) {
    ui.error('Alias name and command must not be empty');
    process.exit(1);
  }

  aliases[name] = cmd;
  saveAliases(aliases);
  ui.success(`Alias set: ${ui.color(name, 'green')} = ${cmd}`);
}
