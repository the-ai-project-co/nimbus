import { describe, test, expect, beforeEach, spyOn } from 'bun:test';
import { HelmOperations } from '../../src/helm/operations';
import type { CommandResult } from '../../src/helm/operations';

/**
 * Unit tests for HelmOperations.
 *
 * The source uses Bun's shell tag ($`...`) inside the private `execute` method,
 * so mocking child_process / util.promisify has no effect. Instead we spy on
 * the private `execute` method to return controlled CommandResult objects,
 * letting us verify public method behaviour without needing a live helm binary.
 */
describe('HelmOperations', () => {
  let helmOps: HelmOperations;
  let executeSpy: ReturnType<typeof spyOn>;

  /** Helper: create a successful CommandResult. */
  function ok(output: string): CommandResult {
    return { success: true, output, exitCode: 0 };
  }

  beforeEach(() => {
    helmOps = new HelmOperations({ namespace: 'default' });
    executeSpy = spyOn(helmOps as any, 'execute').mockResolvedValue(ok('{}'));
  });

  describe('install', () => {
    test('should install chart', async () => {
      executeSpy.mockResolvedValueOnce(
        ok(JSON.stringify({ name: 'my-release', status: 'deployed' })),
      );

      const result = await helmOps.install({
        name: 'my-release',
        chart: 'nginx',
      });

      expect(result.success).toBe(true);
    });

    test('should install with values', async () => {
      executeSpy.mockResolvedValueOnce(
        ok(JSON.stringify({ name: 'my-release' })),
      );

      const result = await helmOps.install({
        name: 'my-release',
        chart: 'nginx',
        set: { replicaCount: '3' },
      });

      expect(result.success).toBe(true);
    });

    test('should install with version', async () => {
      executeSpy.mockResolvedValueOnce(
        ok(JSON.stringify({ name: 'my-release' })),
      );

      const result = await helmOps.install({
        name: 'my-release',
        chart: 'nginx',
        version: '1.0.0',
      });

      expect(result.success).toBe(true);
    });

    test('should install with create namespace', async () => {
      executeSpy.mockResolvedValueOnce(
        ok(JSON.stringify({ name: 'my-release' })),
      );

      const result = await helmOps.install({
        name: 'my-release',
        chart: 'nginx',
        namespace: 'new-ns',
        createNamespace: true,
      });

      expect(result.success).toBe(true);
    });

    test('should dry-run install', async () => {
      executeSpy.mockResolvedValueOnce(
        ok(JSON.stringify({ name: 'my-release' })),
      );

      const result = await helmOps.install({
        name: 'my-release',
        chart: 'nginx',
        dryRun: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('upgrade', () => {
    test('should upgrade release', async () => {
      executeSpy.mockResolvedValueOnce(
        ok(JSON.stringify({ name: 'my-release', status: 'deployed' })),
      );

      const result = await helmOps.upgrade({
        name: 'my-release',
        chart: 'nginx',
      });

      expect(result.success).toBe(true);
    });

    test('should upgrade with install flag', async () => {
      executeSpy.mockResolvedValueOnce(
        ok(JSON.stringify({ name: 'my-release' })),
      );

      const result = await helmOps.upgrade({
        name: 'my-release',
        chart: 'nginx',
        install: true,
      });

      expect(result.success).toBe(true);
    });

    test('should upgrade with reuse values', async () => {
      executeSpy.mockResolvedValueOnce(
        ok(JSON.stringify({ name: 'my-release' })),
      );

      const result = await helmOps.upgrade({
        name: 'my-release',
        chart: 'nginx',
        reuseValues: true,
      });

      expect(result.success).toBe(true);
    });

    test('should atomic upgrade', async () => {
      executeSpy.mockResolvedValueOnce(
        ok(JSON.stringify({ name: 'my-release' })),
      );

      const result = await helmOps.upgrade({
        name: 'my-release',
        chart: 'nginx',
        atomic: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('uninstall', () => {
    test('should uninstall release', async () => {
      executeSpy.mockResolvedValueOnce(
        ok('release "my-release" uninstalled'),
      );

      const result = await helmOps.uninstall({
        name: 'my-release',
      });

      expect(result.success).toBe(true);
    });

    test('should keep history on uninstall', async () => {
      executeSpy.mockResolvedValueOnce(
        ok('release "my-release" uninstalled'),
      );

      const result = await helmOps.uninstall({
        name: 'my-release',
        keepHistory: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('list', () => {
    test('should list releases', async () => {
      executeSpy.mockResolvedValueOnce(
        ok(JSON.stringify([{ name: 'release-1' }, { name: 'release-2' }])),
      );

      const result = await helmOps.list();

      expect(result.success).toBe(true);
    });

    test('should list with filter', async () => {
      executeSpy.mockResolvedValueOnce(
        ok(JSON.stringify([{ name: 'nginx-release' }])),
      );

      const result = await helmOps.list({ filter: 'nginx' });

      expect(result.success).toBe(true);
    });

    test('should list all namespaces', async () => {
      executeSpy.mockResolvedValueOnce(ok(JSON.stringify([])));

      const result = await helmOps.list({ allNamespaces: true });

      expect(result.success).toBe(true);
    });
  });

  describe('rollback', () => {
    test('should rollback release', async () => {
      executeSpy.mockResolvedValueOnce(ok('Rollback was a success'));

      const result = await helmOps.rollback({
        name: 'my-release',
        revision: 1,
      });

      expect(result.success).toBe(true);
    });

    test('should force rollback', async () => {
      executeSpy.mockResolvedValueOnce(ok('Rollback was a success'));

      const result = await helmOps.rollback({
        name: 'my-release',
        revision: 1,
        force: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('getValues', () => {
    test('should get values', async () => {
      executeSpy.mockResolvedValueOnce(ok('replicaCount: 1'));

      const result = await helmOps.getValues({ name: 'my-release' });

      expect(result.success).toBe(true);
    });

    test('should get all values', async () => {
      executeSpy.mockResolvedValueOnce(ok('replicaCount: 1\nimage: nginx'));

      const result = await helmOps.getValues({
        name: 'my-release',
        allValues: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('history', () => {
    test('should get release history', async () => {
      executeSpy.mockResolvedValueOnce(
        ok(JSON.stringify([{ revision: 1 }, { revision: 2 }])),
      );

      const result = await helmOps.history({ name: 'my-release' });

      expect(result.success).toBe(true);
    });
  });

  describe('status', () => {
    test('should get release status', async () => {
      executeSpy.mockResolvedValueOnce(
        ok(JSON.stringify({ name: 'my-release', info: { status: 'deployed' } })),
      );

      const result = await helmOps.status('my-release');

      expect(result.success).toBe(true);
    });
  });

  describe('repo', () => {
    test('should add repo', async () => {
      executeSpy.mockResolvedValueOnce(
        ok('"bitnami" has been added to your repositories'),
      );

      const result = await helmOps.repo({
        action: 'add',
        name: 'bitnami',
        url: 'https://charts.bitnami.com/bitnami',
      });

      expect(result.success).toBe(true);
    });

    test('should remove repo', async () => {
      executeSpy.mockResolvedValueOnce(ok('"bitnami" has been removed'));

      const result = await helmOps.repo({
        action: 'remove',
        name: 'bitnami',
      });

      expect(result.success).toBe(true);
    });

    test('should list repos', async () => {
      executeSpy.mockResolvedValueOnce(
        ok(JSON.stringify([{ name: 'bitnami', url: 'https://charts.bitnami.com/bitnami' }])),
      );

      const result = await helmOps.repo({ action: 'list' });

      expect(result.success).toBe(true);
    });

    test('should update repos', async () => {
      executeSpy.mockResolvedValueOnce(ok('Update Complete'));

      const result = await helmOps.repo({ action: 'update' });

      expect(result.success).toBe(true);
    });
  });

  describe('search', () => {
    test('should search repos', async () => {
      executeSpy.mockResolvedValueOnce(
        ok(JSON.stringify([{ name: 'bitnami/nginx', version: '1.0.0' }])),
      );

      const result = await helmOps.search({ keyword: 'nginx' });

      expect(result.success).toBe(true);
    });

    test('should search with versions', async () => {
      executeSpy.mockResolvedValueOnce(ok(JSON.stringify([])));

      const result = await helmOps.search({
        keyword: 'nginx',
        versions: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('searchHub', () => {
    test('should search helm hub', async () => {
      executeSpy.mockResolvedValueOnce(
        ok(JSON.stringify([{ name: 'artifact-hub/nginx' }])),
      );

      const result = await helmOps.searchHub('nginx');

      expect(result.success).toBe(true);
    });
  });

  describe('show', () => {
    test('should show chart', async () => {
      executeSpy.mockResolvedValueOnce(ok('name: nginx\nversion: 1.0.0'));

      const result = await helmOps.show({
        chart: 'bitnami/nginx',
        subcommand: 'chart',
      });

      expect(result.success).toBe(true);
    });

    test('should show values', async () => {
      executeSpy.mockResolvedValueOnce(ok('replicaCount: 1'));

      const result = await helmOps.show({
        chart: 'bitnami/nginx',
        subcommand: 'values',
      });

      expect(result.success).toBe(true);
    });

    test('should show readme', async () => {
      executeSpy.mockResolvedValueOnce(ok('# NGINX Helm Chart'));

      const result = await helmOps.show({
        chart: 'bitnami/nginx',
        subcommand: 'readme',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('template', () => {
    test('should template chart', async () => {
      executeSpy.mockResolvedValueOnce(
        ok('---\napiVersion: apps/v1\nkind: Deployment'),
      );

      const result = await helmOps.template({
        name: 'my-release',
        chart: 'bitnami/nginx',
      });

      expect(result.success).toBe(true);
    });

    test('should template with values', async () => {
      executeSpy.mockResolvedValueOnce(ok('---\napiVersion: v1'));

      const result = await helmOps.template({
        name: 'my-release',
        chart: 'bitnami/nginx',
        set: { replicaCount: '3' },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('version', () => {
    test('should get helm version', async () => {
      executeSpy.mockResolvedValueOnce(
        ok('version.BuildInfo{Version:"v3.12.0"}'),
      );

      const result = await helmOps.version();

      expect(result.success).toBe(true);
    });
  });
});
