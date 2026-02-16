/**
 * Rollback K8s & Helm Integration Tests
 *
 * Tests for real K8s and Helm rollback HTTP calls
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import {
  RollbackManager,
  type ExecutionState,
} from '../components/rollback-manager';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('RollbackManager - K8s & Helm HTTP Calls', () => {
  let manager: RollbackManager;
  let tempDir: string;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-http-test-'));
    manager = new RollbackManager(tempDir);
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Kubernetes rollback HTTP calls', () => {
    it('should call k8s-tools-service delete endpoint for each resource', async () => {
      const fetchCalls: { url: string; body: any }[] = [];

      globalThis.fetch = mock(async (url: any, opts: any) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('/api/k8s/delete')) {
          fetchCalls.push({ url: urlStr, body: JSON.parse(opts?.body || '{}') });
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }) as any;

      const state: ExecutionState = {
        executionId: 'k8s-http-test',
        provider: 'kubernetes',
        workDir: '/tmp/k8s-test',
        executedAt: new Date(),
        namespace: 'production',
        deployedResources: ['deployment/web-app', 'service/web-svc'],
      };

      const result = await manager.rollback({ state, dryRun: false });

      expect(result.success).toBe(true);
      expect(result.resourcesAffected).toBe(2);
      expect(fetchCalls.length).toBe(2);
      expect(fetchCalls[0].body.resource).toBe('deployment/web-app');
      expect(fetchCalls[0].body.namespace).toBe('production');
      expect(fetchCalls[1].body.resource).toBe('service/web-svc');
    });

    it('should not make HTTP calls in dry-run mode', async () => {
      const fetchCalls: string[] = [];

      globalThis.fetch = mock(async (url: any) => {
        fetchCalls.push(typeof url === 'string' ? url : url.toString());
        return new Response(JSON.stringify({}), { status: 200 });
      }) as any;

      const state: ExecutionState = {
        executionId: 'k8s-dryrun-test',
        provider: 'kubernetes',
        workDir: '/tmp/k8s-test',
        executedAt: new Date(),
        deployedResources: ['deployment/app'],
      };

      const result = await manager.rollback({ state, dryRun: true });

      expect(result.success).toBe(true);
      expect(result.actions[0].output).toContain('Would delete');
      // No k8s delete calls should be made
      const k8sCalls = fetchCalls.filter(u => u.includes('/api/k8s/delete'));
      expect(k8sCalls.length).toBe(0);
    });

    it('should handle k8s-tools-service unavailability gracefully', async () => {
      globalThis.fetch = mock(async () => {
        throw new Error('ECONNREFUSED');
      }) as any;

      const state: ExecutionState = {
        executionId: 'k8s-unavailable-test',
        provider: 'kubernetes',
        workDir: '/tmp/k8s-test',
        executedAt: new Date(),
        deployedResources: ['deployment/app'],
      };

      const result = await manager.rollback({ state, dryRun: false });

      expect(result.success).toBe(true);
      expect(result.resourcesAffected).toBe(1);
      expect(result.actions[0].success).toBe(false);
      expect(result.actions[0].output).toContain('ECONNREFUSED');
    });
  });

  describe('Helm rollback HTTP calls', () => {
    it('should call helm-tools-service rollback endpoint', async () => {
      const fetchCalls: { url: string; body: any }[] = [];

      globalThis.fetch = mock(async (url: any, opts: any) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('/api/helm/rollback')) {
          fetchCalls.push({ url: urlStr, body: JSON.parse(opts?.body || '{}') });
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }) as any;

      const state: ExecutionState = {
        executionId: 'helm-http-test',
        provider: 'helm',
        workDir: '/tmp/helm-test',
        executedAt: new Date(),
        releaseName: 'my-release',
        namespace: 'production',
        previousRevision: 3,
      };

      const result = await manager.rollback({ state, dryRun: false });

      expect(result.success).toBe(true);
      expect(result.resourcesAffected).toBe(1);
      expect(fetchCalls.length).toBe(1);
      expect(fetchCalls[0].body.name).toBe('my-release');
      expect(fetchCalls[0].body.revision).toBe(3);
      expect(fetchCalls[0].body.namespace).toBe('production');
    });

    it('should not make HTTP calls in dry-run mode', async () => {
      const fetchCalls: string[] = [];

      globalThis.fetch = mock(async (url: any) => {
        fetchCalls.push(typeof url === 'string' ? url : url.toString());
        return new Response(JSON.stringify({}), { status: 200 });
      }) as any;

      const state: ExecutionState = {
        executionId: 'helm-dryrun-test',
        provider: 'helm',
        workDir: '/tmp/helm-test',
        executedAt: new Date(),
        releaseName: 'test-release',
        namespace: 'default',
        previousRevision: 5,
      };

      const result = await manager.rollback({ state, dryRun: true });

      expect(result.success).toBe(true);
      expect(result.actions[0].output).toContain('revision 5');
      const helmCalls = fetchCalls.filter(u => u.includes('/api/helm/rollback'));
      expect(helmCalls.length).toBe(0);
    });

    it('should handle helm-tools-service unavailability gracefully', async () => {
      globalThis.fetch = mock(async () => {
        throw new Error('ECONNREFUSED');
      }) as any;

      const state: ExecutionState = {
        executionId: 'helm-unavailable-test',
        provider: 'helm',
        workDir: '/tmp/helm-test',
        executedAt: new Date(),
        releaseName: 'my-release',
        namespace: 'default',
        previousRevision: 2,
      };

      const result = await manager.rollback({ state, dryRun: false });

      expect(result.success).toBe(true);
      expect(result.actions[0].success).toBe(false);
      expect(result.actions[0].output).toContain('ECONNREFUSED');
    });

    it('should use default revision 0 when previousRevision not set', async () => {
      globalThis.fetch = mock(async (url: any, opts: any) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('/api/helm/rollback')) {
          const body = JSON.parse(opts?.body || '{}');
          expect(body.revision).toBe(0);
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }) as any;

      const state: ExecutionState = {
        executionId: 'helm-default-rev',
        provider: 'helm',
        workDir: '/tmp/helm-test',
        executedAt: new Date(),
        releaseName: 'my-release',
        namespace: 'default',
      };

      const result = await manager.rollback({ state, dryRun: false });

      expect(result.success).toBe(true);
    });
  });
});
