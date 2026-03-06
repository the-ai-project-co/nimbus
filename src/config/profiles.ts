/**
 * Multi-account profile management.
 *
 * Profiles are stored at ~/.nimbus/profiles/<name>.json and merged into
 * the app config at startup when --profile <name> is passed.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface ConfigProfile {
  name: string;
  /** Anthropic API key for this profile */
  anthropicApiKey?: string;
  /** AWS profile name (maps to AWS_PROFILE env var) */
  awsProfile?: string;
  /** AWS region override */
  awsRegion?: string;
  /** GCP project ID */
  gcpProject?: string;
  /** Azure subscription ID */
  azureSubscription?: string;
  /** Default agent mode for this profile */
  defaultMode?: string;
}

function getProfilesDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '/tmp';
  return join(home, '.nimbus', 'profiles');
}

export function loadProfile(name: string): ConfigProfile | null {
  const profilePath = join(getProfilesDir(), `${name}.json`);
  if (!existsSync(profilePath)) return null;
  try {
    const raw = readFileSync(profilePath, 'utf-8');
    return { name, ...JSON.parse(raw) } as ConfigProfile;
  } catch {
    return null;
  }
}

export function saveProfile(profile: ConfigProfile): void {
  const profilesDir = getProfilesDir();
  mkdirSync(profilesDir, { recursive: true });
  const { name, ...rest } = profile;
  writeFileSync(join(profilesDir, `${name}.json`), JSON.stringify(rest, null, 2), 'utf-8');
}

export function listProfiles(): string[] {
  const profilesDir = getProfilesDir();
  if (!existsSync(profilesDir)) return [];
  try {
    return readdirSync(profilesDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.slice(0, -5));
  } catch {
    return [];
  }
}

/**
 * Apply a profile to the current process environment.
 * This mutates process.env so all subsequent operations pick up the profile.
 */
export function applyProfile(profile: ConfigProfile): void {
  if (profile.anthropicApiKey) {
    process.env.ANTHROPIC_API_KEY = profile.anthropicApiKey;
  }
  if (profile.awsProfile) {
    process.env.AWS_PROFILE = profile.awsProfile;
  }
  if (profile.awsRegion) {
    process.env.AWS_DEFAULT_REGION = profile.awsRegion;
    process.env.AWS_REGION = profile.awsRegion;
  }
  if (profile.gcpProject) {
    process.env.GCLOUD_PROJECT = profile.gcpProject;
    process.env.GOOGLE_CLOUD_PROJECT = profile.gcpProject;
  }
  if (profile.azureSubscription) {
    process.env.AZURE_SUBSCRIPTION_ID = profile.azureSubscription;
  }
}
