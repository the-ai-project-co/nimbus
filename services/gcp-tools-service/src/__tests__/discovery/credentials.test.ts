import { describe, test, expect, mock } from 'bun:test';

mock.module('@nimbus/shared-utils', () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

import { CredentialManager } from '../../discovery/credentials';

describe('GCP CredentialManager', () => {
  test('should be instantiable without config', () => {
    const manager = new CredentialManager();
    expect(manager).toBeDefined();
  });

  test('should be instantiable with config', () => {
    const manager = new CredentialManager({
      projectId: 'test-project',
    });
    expect(manager).toBeDefined();
  });

  test('should return invalid when no project is set', async () => {
    const orig = process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;
    const manager = new CredentialManager({ projectId: '' });
    const result = await manager.validateCredentials();
    expect(result.valid).toBe(false);
    expect(result.error).toContain('No project');
    if (orig) process.env.GOOGLE_CLOUD_PROJECT = orig;
  });

  test('should use project from config', async () => {
    const manager = new CredentialManager({ projectId: 'my-project' });
    // Will fail because no real creds, but shouldn't fail with "no project"
    const result = await manager.validateCredentials();
    expect(result).toBeDefined();
    expect(typeof result.valid).toBe('boolean');
    // Either returns valid:false with a real error (not "no project"), or valid:true in a GCP env
    if (!result.valid) {
      expect(result.error).not.toContain('No project');
    }
  });
});
