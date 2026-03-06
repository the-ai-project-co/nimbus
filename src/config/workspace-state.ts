/**
 * Workspace state persistence — saves terraform workspace + kubectl context
 * per working directory to ~/.nimbus/workspace-state.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface WorkspaceState {
  terraformWorkspace?: string;
  kubectlContext?: string;
  awsProfile?: string;
  awsRegion?: string;
  gcpProject?: string;
  lastSeen?: string; // ISO timestamp
}

type StateFile = Record<string, WorkspaceState>; // keyed by cwd

const STATE_PATH = join(homedir(), '.nimbus', 'workspace-state.json');

function loadStateFile(): StateFile {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf-8')) as StateFile;
  } catch {
    return {};
  }
}

function saveStateFile(state: StateFile): void {
  try {
    mkdirSync(join(homedir(), '.nimbus'), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch { /* non-critical */ }
}

export function loadWorkspaceState(cwd: string): WorkspaceState {
  const all = loadStateFile();
  return all[cwd] ?? {};
}

export function saveWorkspaceState(cwd: string, state: WorkspaceState): void {
  const all = loadStateFile();
  all[cwd] = { ...all[cwd], ...state, lastSeen: new Date().toISOString() };
  saveStateFile(all);
}

export function mergeWorkspaceState(cwd: string, infra: Partial<WorkspaceState>): WorkspaceState {
  const existing = loadWorkspaceState(cwd);
  const merged = { ...existing, ...infra };
  saveWorkspaceState(cwd, merged);
  return merged;
}
