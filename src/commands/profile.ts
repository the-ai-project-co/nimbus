/**
 * Profile Management Command — H1
 *
 * Per-project credential profiles stored in ~/.nimbus/profiles.json.
 * Format: { "prod": { awsProfile, tfWorkspace, kubectlContext, gcpProject } }
 *
 * Usage:
 *   nimbus profile list                — show all profiles (current marked with *)
 *   nimbus profile create <name>       — interactive wizard
 *   nimbus profile set <name>          — switch all context atomically
 *   nimbus profile delete <name>       — removes profile
 *   nimbus profile show [name]         — display profile details
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { ui } from '../wizard/ui';

/** A single credential profile. */
export interface CredentialProfile {
  /** AWS_PROFILE value */
  awsProfile?: string;
  /** Terraform workspace name */
  tfWorkspace?: string;
  /** kubectl context name */
  kubectlContext?: string;
  /** GCP project ID */
  gcpProject?: string;
  /** Azure subscription ID */
  azureSubscription?: string;
  /** K8s namespace */
  k8sNamespace?: string;
}

/** The full profiles store. */
export type ProfileStore = Record<string, CredentialProfile>;

const PROFILES_DIR = path.join(homedir(), '.nimbus');
const PROFILES_PATH = path.join(PROFILES_DIR, 'profiles.json');
const CURRENT_PROFILE_PATH = path.join(PROFILES_DIR, 'current-profile');

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

/** Load the profiles.json file. Returns empty object if it doesn't exist. */
export function loadProfiles(): ProfileStore {
  try {
    if (fs.existsSync(PROFILES_PATH)) {
      const raw = fs.readFileSync(PROFILES_PATH, 'utf-8');
      return JSON.parse(raw) as ProfileStore;
    }
  } catch {
    /* ignore parse errors — treat as empty */
  }
  return {};
}

/** Persist the profiles store to disk. */
export function saveProfiles(profiles: ProfileStore): void {
  if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
  }
  fs.writeFileSync(PROFILES_PATH, JSON.stringify(profiles, null, 2), 'utf-8');
}

/** Get the name of the currently active profile (if any). */
export function getCurrentProfileName(): string | null {
  // Check env var first
  if (process.env.NIMBUS_PROFILE) return process.env.NIMBUS_PROFILE;
  try {
    if (fs.existsSync(CURRENT_PROFILE_PATH)) {
      return fs.readFileSync(CURRENT_PROFILE_PATH, 'utf-8').trim() || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Persist the current profile name to disk. */
function setCurrentProfileName(name: string): void {
  if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
  }
  fs.writeFileSync(CURRENT_PROFILE_PATH, name, 'utf-8');
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

async function listProfiles(): Promise<void> {
  const profiles = loadProfiles();
  const current = getCurrentProfileName();
  const names = Object.keys(profiles);

  if (names.length === 0) {
    ui.info('No profiles configured. Create one with: nimbus profile create <name>');
    return;
  }

  ui.header('Credential Profiles');
  for (const name of names) {
    const profile = profiles[name];
    const marker = name === current ? ui.color('* ', 'green') : '  ';
    ui.print(`${marker}${name}`);
    if (profile.awsProfile) ui.print(`      AWS profile:        ${profile.awsProfile}`);
    if (profile.tfWorkspace) ui.print(`      TF workspace:       ${profile.tfWorkspace}`);
    if (profile.kubectlContext) ui.print(`      kubectl context:    ${profile.kubectlContext}`);
    if (profile.gcpProject) ui.print(`      GCP project:        ${profile.gcpProject}`);
    if (profile.azureSubscription) ui.print(`      Azure subscription: ${profile.azureSubscription}`);
    if (profile.k8sNamespace) ui.print(`      K8s namespace:      ${profile.k8sNamespace}`);
  }
  if (current) {
    ui.newLine();
    ui.dim(`Active profile: ${current}`);
  }
}

async function createProfile(name: string): Promise<void> {
  if (!name) {
    ui.error('Usage: nimbus profile create <name>');
    process.exit(1);
  }

  const profiles = loadProfiles();
  if (profiles[name]) {
    ui.warning(`Profile "${name}" already exists. Use "nimbus profile set ${name}" to activate it.`);
    return;
  }

  const { input: inputPrompt } = await import('../wizard/prompts');

  ui.header(`Create Profile: ${name}`);
  ui.dim('Leave fields empty to skip.');
  ui.newLine();

  const awsProfile = await inputPrompt({ message: 'AWS_PROFILE value', defaultValue: '' });
  const tfWorkspace = await inputPrompt({ message: 'Terraform workspace', defaultValue: '' });
  const kubectlContext = await inputPrompt({ message: 'kubectl context', defaultValue: '' });
  const gcpProject = await inputPrompt({ message: 'GCP project ID', defaultValue: '' });
  const azureSubscription = await inputPrompt({ message: 'Azure subscription ID', defaultValue: '' });
  const k8sNamespace = await inputPrompt({ message: 'Default K8s namespace', defaultValue: '' });

  const profile: CredentialProfile = {};
  if (awsProfile) profile.awsProfile = awsProfile;
  if (tfWorkspace) profile.tfWorkspace = tfWorkspace;
  if (kubectlContext) profile.kubectlContext = kubectlContext;
  if (gcpProject) profile.gcpProject = gcpProject;
  if (azureSubscription) profile.azureSubscription = azureSubscription;
  if (k8sNamespace) profile.k8sNamespace = k8sNamespace;

  profiles[name] = profile;
  saveProfiles(profiles);

  ui.print(`${ui.color('✓', 'green')} Profile "${name}" created.`);
  ui.dim('Activate it with: nimbus profile set ' + name);
}

async function setProfile(name: string): Promise<void> {
  if (!name) {
    ui.error('Usage: nimbus profile set <name>');
    process.exit(1);
  }

  const profiles = loadProfiles();
  const profile = profiles[name];
  if (!profile) {
    ui.error(`Profile "${name}" does not exist. Run "nimbus profile list" to see available profiles.`);
    process.exit(1);
  }

  // Atomically apply all context switches
  const { execFileSync } = await import('node:child_process');

  const errors: string[] = [];

  if (profile.awsProfile) {
    process.env.AWS_PROFILE = profile.awsProfile;
    ui.print(`${ui.color('✓', 'green')} AWS_PROFILE=${profile.awsProfile}`);
  }

  if (profile.gcpProject) {
    process.env.GOOGLE_CLOUD_PROJECT = profile.gcpProject;
    process.env.GCLOUD_PROJECT = profile.gcpProject;
    ui.print(`${ui.color('✓', 'green')} GCP project=${profile.gcpProject}`);
  }

  if (profile.azureSubscription) {
    process.env.AZURE_SUBSCRIPTION_ID = profile.azureSubscription;
    ui.print(`${ui.color('✓', 'green')} Azure subscription=${profile.azureSubscription}`);
  }

  if (profile.k8sNamespace) {
    process.env.K8S_NAMESPACE = profile.k8sNamespace;
    ui.print(`${ui.color('✓', 'green')} K8S_NAMESPACE=${profile.k8sNamespace}`);
  }

  if (profile.kubectlContext) {
    try {
      execFileSync('kubectl', ['config', 'use-context', profile.kubectlContext], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10_000,
      });
      process.env.KUBECTL_CONTEXT = profile.kubectlContext;
      ui.print(`${ui.color('✓', 'green')} kubectl context=${profile.kubectlContext}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`kubectl context switch failed: ${msg}`);
    }
  }

  if (profile.tfWorkspace) {
    try {
      execFileSync('terraform', ['workspace', 'select', profile.tfWorkspace], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30_000,
      });
      process.env.TF_WORKSPACE = profile.tfWorkspace;
      ui.print(`${ui.color('✓', 'green')} TF workspace=${profile.tfWorkspace}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`terraform workspace switch failed: ${msg}`);
    }
  }

  // Persist the active profile name
  setCurrentProfileName(name);

  ui.newLine();
  if (errors.length > 0) {
    for (const err of errors) {
      ui.warning(err);
    }
    ui.warning(`Profile "${name}" partially applied. Some tool switches failed.`);
  } else {
    ui.print(`${ui.color('✓', 'green')} Profile "${name}" activated.`);
  }
}

async function deleteProfile(name: string): Promise<void> {
  if (!name) {
    ui.error('Usage: nimbus profile delete <name>');
    process.exit(1);
  }

  const profiles = loadProfiles();
  if (!profiles[name]) {
    ui.error(`Profile "${name}" does not exist.`);
    process.exit(1);
  }

  const { confirm } = await import('../wizard');
  const ok = await confirm({
    message: `Delete profile "${name}"?`,
    defaultValue: false,
  });

  if (!ok) {
    ui.info('Aborted.');
    return;
  }

  delete profiles[name];
  saveProfiles(profiles);

  // Clear current profile if it was the deleted one
  const current = getCurrentProfileName();
  if (current === name) {
    try {
      fs.unlinkSync(CURRENT_PROFILE_PATH);
    } catch {
      /* ignore */
    }
  }

  ui.print(`${ui.color('✓', 'green')} Profile "${name}" deleted.`);
}

function showProfile(name: string | undefined): void {
  const profiles = loadProfiles();
  const current = getCurrentProfileName();
  const targetName = name ?? current;

  if (!targetName) {
    ui.error('No active profile. Specify a name: nimbus profile show <name>');
    return;
  }

  const profile = profiles[targetName];
  if (!profile) {
    ui.error(`Profile "${targetName}" does not exist.`);
    return;
  }

  ui.header(`Profile: ${targetName}${targetName === current ? ' (active)' : ''}`);
  console.log(JSON.stringify(profile, null, 2));
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

export async function profileCommand(subcommand: string, args: string[]): Promise<void> {
  switch (subcommand) {
    case 'list':
    case 'ls':
      await listProfiles();
      break;
    case 'create':
    case 'add':
      await createProfile(args[0] ?? '');
      break;
    case 'set':
    case 'use':
    case 'switch':
      await setProfile(args[0] ?? '');
      break;
    case 'delete':
    case 'remove':
    case 'rm':
      await deleteProfile(args[0] ?? '');
      break;
    case 'show':
      showProfile(args[0]);
      break;
    default:
      ui.print('Usage: nimbus profile <list|create|set|delete|show> [name]');
      ui.newLine();
      ui.print('  list              - Show all profiles (current marked with *)');
      ui.print('  create <name>     - Create a new profile (interactive wizard)');
      ui.print('  set <name>        - Switch to a profile (sets AWS_PROFILE, kubectl context, TF workspace)');
      ui.print('  delete <name>     - Delete a profile');
      ui.print('  show [name]       - Display profile details');
  }
}

export default profileCommand;
