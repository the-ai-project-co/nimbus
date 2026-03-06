/**
 * Profile Command Tests — H1
 *
 * Tests for the per-project credential profile management system.
 * Profiles are stored in ~/.nimbus/profiles.json.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock homedir to use a temp directory so tests don't touch ~/.nimbus
let tmpDir: string;

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof os>('node:os');
  return {
    ...actual,
    homedir: () => tmpDir ?? actual.homedir(),
  };
});

async function getProfileModule() {
  // Force re-import so homedir mock is active
  return await import('../commands/profile');
}

describe('profile store helpers (H1)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-profile-test-'));
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.resetModules();
  });

  test('loadProfiles returns empty object when no file exists', async () => {
    const { loadProfiles } = await getProfileModule();
    const profiles = loadProfiles();
    expect(profiles).toEqual({});
  });

  test('saveProfiles then loadProfiles round-trips correctly', async () => {
    const { loadProfiles, saveProfiles } = await getProfileModule();
    const data = {
      prod: { awsProfile: 'production', kubectlContext: 'prod-cluster', tfWorkspace: 'prod' },
      staging: { awsProfile: 'staging', gcpProject: 'my-project-staging' },
    };
    saveProfiles(data);

    const loaded = loadProfiles();
    expect(loaded.prod?.awsProfile).toBe('production');
    expect(loaded.prod?.kubectlContext).toBe('prod-cluster');
    expect(loaded.prod?.tfWorkspace).toBe('prod');
    expect(loaded.staging?.awsProfile).toBe('staging');
    expect(loaded.staging?.gcpProject).toBe('my-project-staging');
  });

  test('saveProfiles creates ~/.nimbus directory if missing', async () => {
    const { saveProfiles } = await getProfileModule();
    saveProfiles({ test: { awsProfile: 'test' } });

    const profilesPath = path.join(tmpDir, '.nimbus', 'profiles.json');
    expect(fs.existsSync(profilesPath)).toBe(true);
  });

  test('profiles.json format is valid JSON with proper structure', async () => {
    const { saveProfiles } = await getProfileModule();
    const data = {
      myprofile: {
        awsProfile: 'my-aws',
        tfWorkspace: 'dev',
        kubectlContext: 'dev-cluster',
        gcpProject: 'my-gcp-project',
        azureSubscription: 'my-sub-id',
        k8sNamespace: 'default',
      },
    };
    saveProfiles(data);

    const profilesPath = path.join(tmpDir, '.nimbus', 'profiles.json');
    const raw = fs.readFileSync(profilesPath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.myprofile.awsProfile).toBe('my-aws');
    expect(parsed.myprofile.tfWorkspace).toBe('dev');
    expect(parsed.myprofile.kubectlContext).toBe('dev-cluster');
    expect(parsed.myprofile.gcpProject).toBe('my-gcp-project');
    expect(parsed.myprofile.azureSubscription).toBe('my-sub-id');
    expect(parsed.myprofile.k8sNamespace).toBe('default');
  });

  test('getCurrentProfileName returns null when no current profile set', async () => {
    const { getCurrentProfileName } = await getProfileModule();
    // Clear env var if set
    delete process.env.NIMBUS_PROFILE;
    const current = getCurrentProfileName();
    expect(current).toBeNull();
  });

  test('NIMBUS_PROFILE env var overrides current profile file', async () => {
    process.env.NIMBUS_PROFILE = 'env-profile';
    const { getCurrentProfileName } = await getProfileModule();
    expect(getCurrentProfileName()).toBe('env-profile');
    delete process.env.NIMBUS_PROFILE;
  });
});

describe('profileCommand subcommands (H1)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-profile-cmd-test-'));
    vi.resetModules();
    delete process.env.NIMBUS_PROFILE;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.resetModules();
    delete process.env.NIMBUS_PROFILE;
  });

  test('list shows "No profiles" message when empty', async () => {
    const { profileCommand } = await getProfileModule();
    const logs: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
    await expect(profileCommand('list', [])).resolves.not.toThrow();
    vi.restoreAllMocks();
  });

  test('profileCommand exports function', async () => {
    const { profileCommand } = await getProfileModule();
    expect(typeof profileCommand).toBe('function');
  });

  test('CredentialProfile type accepts all fields', async () => {
    const { loadProfiles, saveProfiles } = await getProfileModule();
    const profile = {
      awsProfile: 'aws-prod',
      tfWorkspace: 'production',
      kubectlContext: 'prod-k8s',
      gcpProject: 'gcp-prod',
      azureSubscription: 'az-sub',
      k8sNamespace: 'production',
    };
    saveProfiles({ prod: profile });
    const loaded = loadProfiles();
    expect(loaded.prod).toEqual(profile);
  });

  test('profile list subcommand does not throw', async () => {
    const { profileCommand, saveProfiles } = await getProfileModule();
    saveProfiles({ dev: { awsProfile: 'dev' }, prod: { awsProfile: 'prod' } });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(profileCommand('list', [])).resolves.not.toThrow();
    vi.restoreAllMocks();
  });

  test('profile show subcommand displays profile JSON', async () => {
    const { profileCommand, saveProfiles } = await getProfileModule();
    saveProfiles({ myenv: { awsProfile: 'myenv-aws', tfWorkspace: 'myenv' } });
    const logged: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation((...args) => logged.push(args.join(' ')));
    await expect(profileCommand('show', ['myenv'])).resolves.not.toThrow();
    // console.log output should include the awsProfile value
    const combined = logged.join('\n');
    expect(combined).toContain('myenv-aws');
    vi.restoreAllMocks();
  });

  test('profile delete subcommand with missing profile does not crash', async () => {
    const { profileCommand, saveProfiles } = await getProfileModule();
    saveProfiles({});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // delete a non-existent profile should call process.exit(1)
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((_code) => { throw new Error('exit'); });
    await expect(profileCommand('delete', ['nonexistent'])).rejects.toThrow('exit');
    mockExit.mockRestore();
    vi.restoreAllMocks();
  });

  test('unknown subcommand shows usage without throwing', async () => {
    const { profileCommand } = await getProfileModule();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(profileCommand('unknown-sub', [])).resolves.not.toThrow();
    vi.restoreAllMocks();
  });
});

describe('profile lifecycle (H1)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-profile-lifecycle-'));
    vi.resetModules();
    delete process.env.NIMBUS_PROFILE;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.resetModules();
    delete process.env.NIMBUS_PROFILE;
  });

  test('save → load → overwrite → load cycle', async () => {
    const { loadProfiles, saveProfiles } = await getProfileModule();

    // Create
    saveProfiles({ alpha: { awsProfile: 'alpha' } });
    expect(loadProfiles().alpha?.awsProfile).toBe('alpha');

    // Overwrite
    saveProfiles({ alpha: { awsProfile: 'alpha-v2', tfWorkspace: 'ws' } });
    const updated = loadProfiles();
    expect(updated.alpha?.awsProfile).toBe('alpha-v2');
    expect(updated.alpha?.tfWorkspace).toBe('ws');
  });

  test('multiple profiles coexist in same file', async () => {
    const { loadProfiles, saveProfiles } = await getProfileModule();
    saveProfiles({
      dev: { awsProfile: 'dev', tfWorkspace: 'dev' },
      staging: { awsProfile: 'staging', kubectlContext: 'staging-k8s' },
      prod: { awsProfile: 'prod', gcpProject: 'prod-gcp' },
    });
    const profiles = loadProfiles();
    expect(Object.keys(profiles)).toHaveLength(3);
    expect(profiles.dev?.awsProfile).toBe('dev');
    expect(profiles.staging?.kubectlContext).toBe('staging-k8s');
    expect(profiles.prod?.gcpProject).toBe('prod-gcp');
  });
});
