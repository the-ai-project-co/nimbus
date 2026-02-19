import { describe, test, expect, mock } from 'bun:test';

mock.module('@nimbus/shared-utils', () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

import { ComputeOperations } from '../../gcp/compute';

describe('GCP ComputeOperations', () => {
  test('should be instantiable with config', () => {
    const ops = new ComputeOperations({ projectId: 'test-project' });
    expect(ops).toBeDefined();
  });

  test('should be instantiable without config', () => {
    const ops = new ComputeOperations();
    expect(ops).toBeDefined();
  });

  test('listInstances should return error when no project set', async () => {
    const orig = process.env.GOOGLE_CLOUD_PROJECT;
    const orig2 = process.env.GCLOUD_PROJECT;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;
    const ops = new ComputeOperations({ projectId: '' });
    const result = await ops.listInstances();
    expect(result.success).toBe(false);
    expect(result.error).toContain('No project');
    if (orig) process.env.GOOGLE_CLOUD_PROJECT = orig;
    if (orig2) process.env.GCLOUD_PROJECT = orig2;
  });

  test('startInstance should return error when no project', async () => {
    const orig = process.env.GOOGLE_CLOUD_PROJECT;
    const orig2 = process.env.GCLOUD_PROJECT;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;
    const ops = new ComputeOperations({ projectId: '' });
    const result = await ops.startInstance('', 'us-central1-a', 'test');
    expect(result.success).toBe(false);
    if (orig) process.env.GOOGLE_CLOUD_PROJECT = orig;
    if (orig2) process.env.GCLOUD_PROJECT = orig2;
  });

  test('stopInstance should return error when no project', async () => {
    const orig = process.env.GOOGLE_CLOUD_PROJECT;
    const orig2 = process.env.GCLOUD_PROJECT;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;
    const ops = new ComputeOperations({ projectId: '' });
    const result = await ops.stopInstance('', 'us-central1-a', 'test');
    expect(result.success).toBe(false);
    if (orig) process.env.GOOGLE_CLOUD_PROJECT = orig;
    if (orig2) process.env.GCLOUD_PROJECT = orig2;
  });

  test('should use GOOGLE_CLOUD_PROJECT env var', () => {
    const orig = process.env.GOOGLE_CLOUD_PROJECT;
    process.env.GOOGLE_CLOUD_PROJECT = 'env-project';
    const ops = new ComputeOperations();
    expect(ops).toBeDefined();
    if (orig) {
      process.env.GOOGLE_CLOUD_PROJECT = orig;
    } else {
      delete process.env.GOOGLE_CLOUD_PROJECT;
    }
  });
});
