import { describe, test, expect, beforeEach, spyOn } from 'bun:test';
import { KubernetesOperations } from '../../src/k8s/operations';
import type { CommandResult } from '../../src/k8s/operations';

/**
 * Unit tests for KubernetesOperations.
 *
 * The source uses Bun's shell tag ($`...`) inside the private `execute` method,
 * so mocking child_process / util.promisify has no effect. Instead we spy on
 * the private `execute` method to return controlled CommandResult objects,
 * letting us verify argument-building logic without needing a live cluster.
 */
describe('KubernetesOperations', () => {
  let k8sOps: KubernetesOperations;
  let executeSpy: ReturnType<typeof spyOn>;

  /**
   * Helper: create a successful CommandResult.
   */
  function ok(output: string): CommandResult {
    return { success: true, output, exitCode: 0 };
  }

  beforeEach(() => {
    k8sOps = new KubernetesOperations({ namespace: 'default' });

    // Spy on the private execute method so no real kubectl calls are made.
    executeSpy = spyOn(k8sOps as any, 'execute').mockResolvedValue(ok('{}'));
  });

  describe('get', () => {
    test('should get resources', async () => {
      executeSpy.mockResolvedValueOnce(
        ok(JSON.stringify({ items: [{ metadata: { name: 'pod-1' } }] })),
      );

      const result = await k8sOps.get({ resource: 'pods' });

      expect(result.success).toBe(true);
      expect(executeSpy).toHaveBeenCalled();
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('get');
      expect(args).toContain('pods');
    });

    test('should get specific resource by name', async () => {
      executeSpy.mockResolvedValueOnce(
        ok(JSON.stringify({ metadata: { name: 'my-pod' } })),
      );

      const result = await k8sOps.get({ resource: 'pod', name: 'my-pod' });

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('pod');
      expect(args).toContain('my-pod');
    });

    test('should get resources with selector', async () => {
      executeSpy.mockResolvedValueOnce(ok(JSON.stringify({ items: [] })));

      const result = await k8sOps.get({
        resource: 'pods',
        selector: 'app=nginx',
      });

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('-l');
      expect(args).toContain('app=nginx');
    });

    test('should get resources across all namespaces', async () => {
      executeSpy.mockResolvedValueOnce(ok(JSON.stringify({ items: [] })));

      const result = await k8sOps.get({
        resource: 'pods',
        allNamespaces: true,
      });

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('--all-namespaces');
    });
  });

  describe('apply', () => {
    test('should apply manifest', async () => {
      const manifest = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
`;
      // apply() has its own shell logic; spy on the whole method for this section
      const applySpy = spyOn(k8sOps, 'apply').mockResolvedValueOnce(
        ok('deployment.apps/nginx created'),
      );

      const result = await k8sOps.apply({ manifest });

      expect(result.success).toBe(true);
      expect(result.output).toContain('nginx created');
      applySpy.mockRestore();
    });

    test('should apply with dry-run', async () => {
      const applySpy = spyOn(k8sOps, 'apply').mockResolvedValueOnce(
        ok('deployment.apps/nginx created (dry run)'),
      );

      const result = await k8sOps.apply({
        manifest: 'apiVersion: v1',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      applySpy.mockRestore();
    });

    test('should apply with server-side', async () => {
      const applySpy = spyOn(k8sOps, 'apply').mockResolvedValueOnce(
        ok('deployment.apps/nginx configured'),
      );

      const result = await k8sOps.apply({
        manifest: 'apiVersion: v1',
        serverSide: true,
      });

      expect(result.success).toBe(true);
      applySpy.mockRestore();
    });
  });

  describe('delete', () => {
    test('should delete resource by name', async () => {
      executeSpy.mockResolvedValueOnce(ok('pod "my-pod" deleted'));

      const result = await k8sOps.delete({
        resource: 'pod',
        name: 'my-pod',
      });

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('delete');
      expect(args).toContain('pod');
      expect(args).toContain('my-pod');
    });

    test('should delete resources by selector', async () => {
      executeSpy.mockResolvedValueOnce(ok('pod "pod-1" deleted\npod "pod-2" deleted'));

      const result = await k8sOps.delete({
        resource: 'pods',
        selector: 'app=nginx',
      });

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('-l');
      expect(args).toContain('app=nginx');
    });

    test('should force delete', async () => {
      executeSpy.mockResolvedValueOnce(ok('pod "stuck-pod" force deleted'));

      const result = await k8sOps.delete({
        resource: 'pod',
        name: 'stuck-pod',
        force: true,
        gracePeriod: 0,
      });

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('--force');
      expect(args).toContain('--grace-period');
      expect(args).toContain('0');
    });
  });

  describe('logs', () => {
    test('should get pod logs', async () => {
      executeSpy.mockResolvedValueOnce(ok('Log line 1\nLog line 2'));

      const result = await k8sOps.logs({ pod: 'my-pod' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Log line');
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('logs');
      expect(args).toContain('my-pod');
    });

    test('should get logs with tail', async () => {
      executeSpy.mockResolvedValueOnce(ok('Last 10 lines'));

      const result = await k8sOps.logs({
        pod: 'my-pod',
        tail: 10,
      });

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('--tail');
      expect(args).toContain('10');
    });

    test('should get previous container logs', async () => {
      executeSpy.mockResolvedValueOnce(ok('Previous container logs'));

      const result = await k8sOps.logs({
        pod: 'my-pod',
        previous: true,
      });

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('--previous');
    });

    test('should get specific container logs', async () => {
      executeSpy.mockResolvedValueOnce(ok('Container logs'));

      const result = await k8sOps.logs({
        pod: 'my-pod',
        container: 'sidecar',
      });

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('-c');
      expect(args).toContain('sidecar');
    });
  });

  describe('exec', () => {
    test('should exec command in pod', async () => {
      executeSpy.mockResolvedValueOnce(ok('command output'));

      const result = await k8sOps.exec({
        pod: 'my-pod',
        command: ['ls', '-la'],
      });

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('exec');
      expect(args).toContain('my-pod');
      expect(args).toContain('--');
      expect(args).toContain('ls');
      expect(args).toContain('-la');
    });

    test('should exec in specific container', async () => {
      executeSpy.mockResolvedValueOnce(ok('output'));

      const result = await k8sOps.exec({
        pod: 'my-pod',
        container: 'main',
        command: ['echo', 'hello'],
      });

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('-c');
      expect(args).toContain('main');
    });
  });

  describe('describe', () => {
    test('should describe resource', async () => {
      executeSpy.mockResolvedValueOnce(ok('Name: my-pod\nNamespace: default'));

      const result = await k8sOps.describe({
        resource: 'pod',
        name: 'my-pod',
      });

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('describe');
      expect(args).toContain('pod');
      expect(args).toContain('my-pod');
    });

    test('should describe resources by selector', async () => {
      executeSpy.mockResolvedValueOnce(ok('Multiple resources described'));

      const result = await k8sOps.describe({
        resource: 'pods',
        selector: 'app=nginx',
      });

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('-l');
      expect(args).toContain('app=nginx');
    });
  });

  describe('scale', () => {
    test('should scale deployment', async () => {
      executeSpy.mockResolvedValueOnce(ok('deployment.apps/nginx scaled'));

      const result = await k8sOps.scale({
        resource: 'deployment',
        name: 'nginx',
        replicas: 3,
      });

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('scale');
      expect(args).toContain('deployment/nginx');
      expect(args).toContain('--replicas');
      expect(args).toContain('3');
    });

    test('should scale to zero', async () => {
      executeSpy.mockResolvedValueOnce(ok('deployment.apps/nginx scaled'));

      const result = await k8sOps.scale({
        resource: 'deployment',
        name: 'nginx',
        replicas: 0,
      });

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('0');
    });
  });

  describe('rollout', () => {
    test('should get rollout status', async () => {
      executeSpy.mockResolvedValueOnce(ok('deployment "nginx" successfully rolled out'));

      const result = await k8sOps.rollout({
        resource: 'deployment',
        name: 'nginx',
        action: 'status',
      });

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('rollout');
      expect(args).toContain('status');
      expect(args).toContain('deployment/nginx');
    });

    test('should restart deployment', async () => {
      executeSpy.mockResolvedValueOnce(ok('deployment.apps/nginx restarted'));

      const result = await k8sOps.rollout({
        resource: 'deployment',
        name: 'nginx',
        action: 'restart',
      });

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('restart');
    });

    test('should undo rollout', async () => {
      executeSpy.mockResolvedValueOnce(ok('deployment.apps/nginx rolled back'));

      const result = await k8sOps.rollout({
        resource: 'deployment',
        name: 'nginx',
        action: 'undo',
      });

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('undo');
    });

    test('should get rollout history', async () => {
      executeSpy.mockResolvedValueOnce(
        ok('REVISION  CHANGE-CAUSE\n1         Initial\n2         Update'),
      );

      const result = await k8sOps.rollout({
        resource: 'deployment',
        name: 'nginx',
        action: 'history',
      });

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('history');
    });
  });

  describe('clusterInfo', () => {
    test('should get cluster info', async () => {
      executeSpy.mockResolvedValueOnce(ok('Kubernetes control plane is running'));

      const result = await k8sOps.clusterInfo();

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('cluster-info');
    });
  });

  describe('getContexts', () => {
    test('should list contexts', async () => {
      executeSpy.mockResolvedValueOnce(ok('context-1\ncontext-2'));

      const result = await k8sOps.getContexts();

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('get-contexts');
    });
  });

  describe('currentContext', () => {
    test('should get current context', async () => {
      executeSpy.mockResolvedValueOnce(ok('my-cluster'));

      const result = await k8sOps.currentContext();

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('current-context');
    });
  });

  describe('useContext', () => {
    test('should switch context', async () => {
      executeSpy.mockResolvedValueOnce(ok('Switched to context "my-cluster"'));

      const result = await k8sOps.useContext('my-cluster');

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('use-context');
      expect(args).toContain('my-cluster');
    });
  });

  describe('getNamespaces', () => {
    test('should list namespaces', async () => {
      executeSpy.mockResolvedValueOnce(
        ok(JSON.stringify({ items: [{ metadata: { name: 'default' } }] })),
      );

      const result = await k8sOps.getNamespaces();

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('namespaces');
    });
  });

  describe('createNamespace', () => {
    test('should create namespace', async () => {
      executeSpy.mockResolvedValueOnce(ok('namespace/my-namespace created'));

      const result = await k8sOps.createNamespace('my-namespace');

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('create');
      expect(args).toContain('namespace');
      expect(args).toContain('my-namespace');
    });
  });

  describe('deleteNamespace', () => {
    test('should delete namespace', async () => {
      executeSpy.mockResolvedValueOnce(ok('namespace "my-namespace" deleted'));

      const result = await k8sOps.deleteNamespace('my-namespace');

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('delete');
      expect(args).toContain('namespace');
      expect(args).toContain('my-namespace');
    });
  });

  describe('getEvents', () => {
    test('should get events', async () => {
      executeSpy.mockResolvedValueOnce(ok(JSON.stringify({ items: [] })));

      const result = await k8sOps.getEvents();

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('events');
    });

    test('should get events for namespace', async () => {
      executeSpy.mockResolvedValueOnce(ok(JSON.stringify({ items: [] })));

      const result = await k8sOps.getEvents('default');

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('-n');
      expect(args).toContain('default');
    });
  });

  describe('topPods', () => {
    test('should get pod metrics', async () => {
      executeSpy.mockResolvedValueOnce(ok('NAME  CPU  MEMORY'));

      const result = await k8sOps.topPods();

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('top');
      expect(args).toContain('pods');
    });
  });

  describe('topNodes', () => {
    test('should get node metrics', async () => {
      executeSpy.mockResolvedValueOnce(ok('NAME  CPU  MEMORY'));

      const result = await k8sOps.topNodes();

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('top');
      expect(args).toContain('nodes');
    });
  });

  describe('version', () => {
    test('should get kubernetes version', async () => {
      executeSpy.mockResolvedValueOnce(
        ok(JSON.stringify({ clientVersion: { major: '1', minor: '28' } })),
      );

      const result = await k8sOps.version();

      expect(result.success).toBe(true);
      const args: string[] = executeSpy.mock.calls[0][0];
      expect(args).toContain('version');
    });
  });
});
