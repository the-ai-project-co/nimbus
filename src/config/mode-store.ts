/**
 * Mode persistence per working directory.
 *
 * Saves and loads the agent mode (plan/build/deploy) for each project directory
 * using a JSON file at ~/.nimbus/mode-config.json.
 */

import type { AgentMode } from '../agent/system-prompt';

const MODE_CACHE = new Map<string, AgentMode>();

function getConfigPath(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '/tmp';
  return `${home}/.nimbus/mode-config.json`;
}

function loadConfig(): Record<string, AgentMode> {
  try {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const raw = readFileSync(getConfigPath(), 'utf-8');
    return JSON.parse(raw) as Record<string, AgentMode>;
  } catch {
    return {};
  }
}

function saveConfig(data: Record<string, AgentMode>): void {
  try {
    const { writeFileSync, mkdirSync } = require('node:fs') as typeof import('node:fs');
    const { dirname } = require('node:path') as typeof import('node:path');
    const configPath = getConfigPath();
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // Non-critical — silently ignore
  }
}

/**
 * Load the saved agent mode for the given working directory.
 * Returns null if no mode has been saved for this directory.
 */
export function loadModeForCwd(cwd: string): AgentMode | null {
  if (MODE_CACHE.has(cwd)) return MODE_CACHE.get(cwd) ?? null;
  const config = loadConfig();
  const mode = config[cwd] as AgentMode | undefined;
  if (mode && ['plan', 'build', 'deploy'].includes(mode)) {
    MODE_CACHE.set(cwd, mode);
    return mode;
  }
  return null;
}

/**
 * Save the agent mode for the given working directory.
 */
export function saveModeForCwd(cwd: string, mode: AgentMode): void {
  MODE_CACHE.set(cwd, mode);
  const config = loadConfig();
  config[cwd] = mode;
  saveConfig(config);
}
