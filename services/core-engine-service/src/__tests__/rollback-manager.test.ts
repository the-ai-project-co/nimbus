/**
 * Rollback Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import {
  RollbackManager,
  type ExecutionState,
  type RollbackOptions,
} from '../components/rollback-manager';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('RollbackManager', () => {
  let manager: RollbackManager;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-test-'));
    manager = new RollbackManager(tempDir);
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('saveExecutionState', () => {
    it('should save execution state to a file', async () => {
      const state: ExecutionState = {
        executionId: 'task-123',
        provider: 'terraform',
        workDir: '/tmp/terraform',
        executedAt: new Date(),
      };

      await manager.saveExecutionState(state);

      const stateFile = path.join(tempDir, 'task-123.json');
      expect(fs.existsSync(stateFile)).toBe(true);

      const savedState = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
      expect(savedState.provider).toBe('terraform');
      expect(savedState.workDir).toBe('/tmp/terraform');
      expect(savedState.executionId).toBe('task-123');
    });

    it('should create the state directory if it does not exist', async () => {
      const nestedDir = path.join(tempDir, 'nested', 'states');
      const nestedManager = new RollbackManager(nestedDir);

      await nestedManager.saveExecutionState({
        executionId: 'task-456',
        provider: 'kubernetes',
        workDir: '/tmp/k8s',
        executedAt: new Date(),
      });

      expect(fs.existsSync(nestedDir)).toBe(true);
    });

    it('should save state for all provider types', async () => {
      const providers: Array<'terraform' | 'kubernetes' | 'helm'> = ['terraform', 'kubernetes', 'helm'];

      for (const provider of providers) {
        const state: ExecutionState = {
          executionId: `task-${provider}`,
          provider,
          workDir: `/tmp/${provider}`,
          executedAt: new Date(),
        };

        await manager.saveExecutionState(state);

        const stateFile = path.join(tempDir, `task-${provider}.json`);
        expect(fs.existsSync(stateFile)).toBe(true);

        const saved = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
        expect(saved.provider).toBe(provider);
      }
    });
  });

  describe('getExecutionState', () => {
    it('should retrieve a previously saved state', async () => {
      const state: ExecutionState = {
        executionId: 'task-get-1',
        provider: 'terraform',
        workDir: '/tmp/terraform',
        executedAt: new Date(),
        deployedResources: ['aws_instance.web', 'aws_s3_bucket.data'],
      };

      await manager.saveExecutionState(state);

      const retrieved = await manager.getExecutionState('task-get-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.executionId).toBe('task-get-1');
      expect(retrieved!.provider).toBe('terraform');
      expect(retrieved!.deployedResources).toEqual(['aws_instance.web', 'aws_s3_bucket.data']);
    });

    it('should return null for a nonexistent execution ID', async () => {
      const result = await manager.getExecutionState('nonexistent-id');
      expect(result).toBeNull();
    });

    it('should load state from disk if not in memory', async () => {
      // Write state directly to disk (bypassing in-memory store)
      const stateData: ExecutionState = {
        executionId: 'disk-only-task',
        provider: 'helm',
        workDir: '/tmp/helm',
        executedAt: new Date(),
        releaseName: 'my-release',
        namespace: 'production',
      };

      await fsp.mkdir(tempDir, { recursive: true });
      await fsp.writeFile(
        path.join(tempDir, 'disk-only-task.json'),
        JSON.stringify(stateData)
      );

      // Create a fresh manager that won't have it in memory
      const freshManager = new RollbackManager(tempDir);
      const retrieved = await freshManager.getExecutionState('disk-only-task');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.executionId).toBe('disk-only-task');
      expect(retrieved!.provider).toBe('helm');
      expect(retrieved!.releaseName).toBe('my-release');
    });
  });

  describe('canRollback', () => {
    it('should return available true for existing terraform state', async () => {
      const state: ExecutionState = {
        executionId: 'task-789',
        provider: 'terraform',
        workDir: '/tmp/test',
        executedAt: new Date(),
        deployedResources: ['aws_instance.web'],
      };

      await manager.saveExecutionState(state);

      const result = await manager.canRollback('task-789');
      expect(result.available).toBe(true);
      expect(result.state).toBeDefined();
      expect(result.state!.executionId).toBe('task-789');
    });

    it('should return available false if state does not exist', async () => {
      const result = await manager.canRollback('nonexistent-task');
      expect(result.available).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should return available true with warning for terraform without state backup', async () => {
      const state: ExecutionState = {
        executionId: 'task-no-backup',
        provider: 'terraform',
        workDir: '/tmp/test',
        executedAt: new Date(),
        // No previousState and no deployedResources
      };

      await manager.saveExecutionState(state);

      const result = await manager.canRollback('task-no-backup');
      expect(result.available).toBe(true);
      expect(result.reason).toContain('full destroy');
    });

    it('should return available false for helm without release name', async () => {
      const state: ExecutionState = {
        executionId: 'task-helm-no-release',
        provider: 'helm',
        workDir: '/tmp/helm',
        executedAt: new Date(),
        // No releaseName
      };

      await manager.saveExecutionState(state);

      const result = await manager.canRollback('task-helm-no-release');
      expect(result.available).toBe(false);
      expect(result.reason).toContain('Release name');
    });

    it('should return available true for helm with release name', async () => {
      const state: ExecutionState = {
        executionId: 'task-helm-ok',
        provider: 'helm',
        workDir: '/tmp/helm',
        executedAt: new Date(),
        releaseName: 'my-release',
        namespace: 'default',
      };

      await manager.saveExecutionState(state);

      const result = await manager.canRollback('task-helm-ok');
      expect(result.available).toBe(true);
    });
  });

  describe('rollback', () => {
    it('should perform rollback for terraform with deployed resources', async () => {
      const state: ExecutionState = {
        executionId: 'task-tf-rollback',
        provider: 'terraform',
        workDir: '/tmp/terraform-test',
        executedAt: new Date(),
        deployedResources: ['aws_instance.web', 'aws_s3_bucket.data'],
      };

      await manager.saveExecutionState(state);

      const result = await manager.rollback({
        state,
        dryRun: true,
        autoApprove: true,
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.executionId).toBe('task-tf-rollback');
      expect(result.resourcesAffected).toBe(2);
      expect(result.actions.length).toBe(2);
      expect(result.actions[0].action).toBe('destroy');
      expect(result.actions[0].output).toContain('Would destroy');
    });

    it('should perform rollback for terraform with full destroy fallback', async () => {
      const state: ExecutionState = {
        executionId: 'task-tf-full-destroy',
        provider: 'terraform',
        workDir: '/tmp/terraform-test',
        executedAt: new Date(),
        // No previousState, no deployedResources -> full destroy
      };

      const result = await manager.rollback({
        state,
        dryRun: true,
        autoApprove: true,
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.actions.length).toBe(1);
      expect(result.actions[0].resource).toBe('all');
      expect(result.actions[0].output).toContain('Would destroy all');
    });

    it('should perform rollback for kubernetes with deployed resources', async () => {
      const state: ExecutionState = {
        executionId: 'task-k8s-rollback',
        provider: 'kubernetes',
        workDir: '/tmp/k8s-test',
        executedAt: new Date(),
        namespace: 'production',
        deployedResources: [
          'deployment/web-app',
          'service/web-svc',
          'configmap/app-config',
        ],
      };

      const result = await manager.rollback({
        state,
        dryRun: true,
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.executionId).toBe('task-k8s-rollback');
      expect(result.resourcesAffected).toBe(3);
      expect(result.actions.length).toBe(3);
      result.actions.forEach(action => {
        expect(action.action).toBe('destroy');
        expect(action.output).toContain('Would delete');
      });
    });

    it('should skip kubernetes resources not in target list', async () => {
      const state: ExecutionState = {
        executionId: 'task-k8s-targeted',
        provider: 'kubernetes',
        workDir: '/tmp/k8s-test',
        executedAt: new Date(),
        deployedResources: [
          'deployment/web-app',
          'service/web-svc',
          'configmap/app-config',
        ],
      };

      const result = await manager.rollback({
        state,
        targets: ['deployment/web-app'],
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.resourcesAffected).toBe(1);

      const skipped = result.actions.filter(a => a.action === 'skip');
      expect(skipped.length).toBe(2);

      const destroyed = result.actions.filter(a => a.action === 'destroy');
      expect(destroyed.length).toBe(1);
      expect(destroyed[0].resource).toBe('deployment/web-app');
    });

    it('should perform rollback for helm release', async () => {
      const state: ExecutionState = {
        executionId: 'task-helm-rollback',
        provider: 'helm',
        workDir: '/tmp/helm-test',
        executedAt: new Date(),
        releaseName: 'my-release',
        namespace: 'production',
        previousRevision: 5,
      };

      const result = await manager.rollback({
        state,
        dryRun: true,
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.resourcesAffected).toBe(1);
      expect(result.actions.length).toBe(1);
      expect(result.actions[0].resource).toBe('my-release');
      expect(result.actions[0].action).toBe('revert');
      expect(result.actions[0].output).toContain('revision 5');
      expect(result.output).toContain('my-release');
      expect(result.output).toContain('revision 5');
    });

    it('should fail helm rollback when release name is missing', async () => {
      const state: ExecutionState = {
        executionId: 'task-helm-no-name',
        provider: 'helm',
        workDir: '/tmp/helm-test',
        executedAt: new Date(),
        // No releaseName
      };

      const result = await manager.rollback({ state });

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Release name is required');
    });

    it('should fail for unsupported provider', async () => {
      const state: ExecutionState = {
        executionId: 'task-unsupported',
        provider: 'unsupported' as any,
        workDir: '/tmp/test',
        executedAt: new Date(),
      };

      const result = await manager.rollback({ state });

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Unsupported provider');
    });

    it('should include duration in rollback result', async () => {
      const state: ExecutionState = {
        executionId: 'task-duration',
        provider: 'kubernetes',
        workDir: '/tmp/k8s',
        executedAt: new Date(),
        deployedResources: ['deployment/app'],
      };

      const result = await manager.rollback({ state, dryRun: true });

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });
  });

  describe('listRollbackStates', () => {
    it('should list all saved states', async () => {
      await manager.saveExecutionState({
        executionId: 'task-1',
        provider: 'terraform',
        workDir: '/tmp/1',
        executedAt: new Date(),
      });

      await manager.saveExecutionState({
        executionId: 'task-2',
        provider: 'kubernetes',
        workDir: '/tmp/2',
        executedAt: new Date(),
      });

      const states = await manager.listRollbackStates();

      expect(states).toBeInstanceOf(Array);
      expect(states.length).toBe(2);
      expect(states.some(s => s.executionId === 'task-1')).toBe(true);
      expect(states.some(s => s.executionId === 'task-2')).toBe(true);
    });

    it('should return empty array when no states exist', async () => {
      const states = await manager.listRollbackStates();
      expect(states).toEqual([]);
    });

    it('should sort states by execution time (newest first)', async () => {
      const now = Date.now();

      await manager.saveExecutionState({
        executionId: 'task-old',
        provider: 'terraform',
        workDir: '/tmp/old',
        executedAt: new Date(now - 60000),
      });

      await manager.saveExecutionState({
        executionId: 'task-recent',
        provider: 'terraform',
        workDir: '/tmp/recent',
        executedAt: new Date(now),
      });

      await manager.saveExecutionState({
        executionId: 'task-middle',
        provider: 'terraform',
        workDir: '/tmp/middle',
        executedAt: new Date(now - 30000),
      });

      const states = await manager.listRollbackStates();

      expect(states.length).toBe(3);
      expect(states[0].executionId).toBe('task-recent');
      expect(states[1].executionId).toBe('task-middle');
      expect(states[2].executionId).toBe('task-old');
    });

    it('should list states from different providers', async () => {
      await manager.saveExecutionState({
        executionId: 'task-tf',
        provider: 'terraform',
        workDir: '/tmp/tf',
        executedAt: new Date(),
      });

      await manager.saveExecutionState({
        executionId: 'task-k8s',
        provider: 'kubernetes',
        workDir: '/tmp/k8s',
        executedAt: new Date(),
      });

      await manager.saveExecutionState({
        executionId: 'task-helm',
        provider: 'helm',
        workDir: '/tmp/helm',
        executedAt: new Date(),
        releaseName: 'my-release',
      });

      const states = await manager.listRollbackStates();

      expect(states.length).toBe(3);
      const providers = states.map(s => s.provider);
      expect(providers).toContain('terraform');
      expect(providers).toContain('kubernetes');
      expect(providers).toContain('helm');
    });

    it('should skip invalid JSON files in backup directory', async () => {
      // Save a valid state
      await manager.saveExecutionState({
        executionId: 'task-valid',
        provider: 'terraform',
        workDir: '/tmp/valid',
        executedAt: new Date(),
      });

      // Write an invalid JSON file
      fs.writeFileSync(path.join(tempDir, 'invalid.json'), 'not valid json{{{');

      const states = await manager.listRollbackStates();

      // Should only contain the valid state, skipping the invalid one
      expect(states.length).toBe(1);
      expect(states[0].executionId).toBe('task-valid');
    });
  });

  describe('cleanupOldStates', () => {
    it('should remove state files older than specified max age', async () => {
      const now = Date.now();

      // Create old state via direct file write with old executedAt
      const oldState: ExecutionState = {
        executionId: 'old-task',
        provider: 'terraform',
        workDir: '/tmp/old',
        executedAt: new Date(now - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      };

      await fsp.mkdir(tempDir, { recursive: true });
      await fsp.writeFile(
        path.join(tempDir, 'old-task.json'),
        JSON.stringify(oldState)
      );

      // Create a recent state
      await manager.saveExecutionState({
        executionId: 'new-task',
        provider: 'terraform',
        workDir: '/tmp/new',
        executedAt: new Date(),
      });

      // Cleanup files older than 7 days
      const removed = await manager.cleanupOldStates(7 * 24 * 60 * 60 * 1000);

      expect(removed).toBeGreaterThanOrEqual(1);
      expect(fs.existsSync(path.join(tempDir, 'new-task.json'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'old-task.json'))).toBe(false);
    });

    it('should not remove states within retention window', async () => {
      await manager.saveExecutionState({
        executionId: 'recent-task',
        provider: 'terraform',
        workDir: '/tmp/recent',
        executedAt: new Date(),
      });

      // Cleanup files older than 7 days
      const removed = await manager.cleanupOldStates(7 * 24 * 60 * 60 * 1000);

      expect(removed).toBe(0);
      expect(fs.existsSync(path.join(tempDir, 'recent-task.json'))).toBe(true);
    });

    it('should handle empty backup directory', async () => {
      const removed = await manager.cleanupOldStates(7 * 24 * 60 * 60 * 1000);
      expect(removed).toBe(0);
    });

    it('should remove backup file along with metadata', async () => {
      const now = Date.now();

      // Create old state with a backup path
      const oldState: ExecutionState = {
        executionId: 'old-with-backup',
        provider: 'terraform',
        workDir: '/tmp/old',
        executedAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
        backupPath: path.join(tempDir, 'old-with-backup.tfstate'),
      };

      await fsp.mkdir(tempDir, { recursive: true });
      await fsp.writeFile(
        path.join(tempDir, 'old-with-backup.json'),
        JSON.stringify(oldState)
      );
      await fsp.writeFile(oldState.backupPath!, 'fake terraform state');

      const removed = await manager.cleanupOldStates(7 * 24 * 60 * 60 * 1000);

      expect(removed).toBe(1);
      expect(fs.existsSync(path.join(tempDir, 'old-with-backup.json'))).toBe(false);
      expect(fs.existsSync(oldState.backupPath!)).toBe(false);
    });

    it('should remove from memory store during cleanup', async () => {
      const now = Date.now();

      // Save a state that will be in memory
      const state: ExecutionState = {
        executionId: 'memory-task',
        provider: 'terraform',
        workDir: '/tmp/mem',
        executedAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
      };

      await manager.saveExecutionState(state);

      // Verify it exists in memory
      const before = await manager.getExecutionState('memory-task');
      expect(before).not.toBeNull();

      await manager.cleanupOldStates(7 * 24 * 60 * 60 * 1000);

      // Should be removed from memory too
      const after = await manager.getExecutionState('memory-task');
      expect(after).toBeNull();
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent state saves without conflicts', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        manager.saveExecutionState({
          executionId: `concurrent-task-${i}`,
          provider: 'terraform',
          workDir: `/tmp/concurrent-${i}`,
          executedAt: new Date(),
        })
      );

      await Promise.all(promises);

      const states = await manager.listRollbackStates();
      expect(states.length).toBe(10);
    });

    it('should handle concurrent rollback operations', async () => {
      // Save multiple states
      const stateIds = ['concurrent-rb-1', 'concurrent-rb-2', 'concurrent-rb-3'];

      for (const id of stateIds) {
        await manager.saveExecutionState({
          executionId: id,
          provider: 'kubernetes',
          workDir: `/tmp/${id}`,
          executedAt: new Date(),
          deployedResources: ['deployment/app'],
        });
      }

      // Execute rollbacks concurrently
      const rollbackPromises = stateIds.map(id =>
        manager.rollback({
          state: {
            executionId: id,
            provider: 'kubernetes',
            workDir: `/tmp/${id}`,
            executedAt: new Date(),
            deployedResources: ['deployment/app'],
          },
          dryRun: true,
        })
      );

      const results = await Promise.all(rollbackPromises);

      expect(results.length).toBe(3);
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.status).toBe('completed');
      });
    });

    it('should handle concurrent save and list operations', async () => {
      // Start saving states while listing
      const savePromises = Array.from({ length: 5 }, (_, i) =>
        manager.saveExecutionState({
          executionId: `save-list-${i}`,
          provider: 'terraform',
          workDir: `/tmp/save-list-${i}`,
          executedAt: new Date(),
        })
      );

      // Run saves and list concurrently
      const [, , , , , states] = await Promise.all([
        ...savePromises,
        manager.listRollbackStates(),
      ]);

      // The list might not have all states since saves are concurrent,
      // but it should not throw
      expect(states).toBeInstanceOf(Array);
    });
  });

  describe('rollback with missing state file', () => {
    it('should handle terraform rollback when state backup file is missing', async () => {
      const state: ExecutionState = {
        executionId: 'task-missing-state',
        provider: 'terraform',
        workDir: '/tmp/terraform-missing',
        executedAt: new Date(),
        previousState: '{"version": 4}',
        backupPath: '/tmp/nonexistent/path/backup.tfstate',
      };

      // The rollback should still attempt but may fail gracefully
      // since the backup path does not exist
      const result = await manager.rollback({
        state,
        dryRun: true,
        autoApprove: true,
      });

      // In dry-run mode with previousState set, it should report the restore action
      expect(result).toBeDefined();
      expect(result.actions.length).toBeGreaterThanOrEqual(1);
      expect(result.actions[0].action).toBe('restore');
    });

    it('should handle kubernetes rollback with empty deployed resources', async () => {
      const state: ExecutionState = {
        executionId: 'task-empty-k8s',
        provider: 'kubernetes',
        workDir: '/tmp/k8s-empty',
        executedAt: new Date(),
        deployedResources: [],
      };

      const result = await manager.rollback({ state, dryRun: true });

      expect(result.success).toBe(true);
      expect(result.resourcesAffected).toBe(0);
      expect(result.actions.length).toBe(0);
    });

    it('should handle kubernetes rollback with no deployed resources field', async () => {
      const state: ExecutionState = {
        executionId: 'task-no-resources-k8s',
        provider: 'kubernetes',
        workDir: '/tmp/k8s-none',
        executedAt: new Date(),
        // deployedResources is undefined
      };

      const result = await manager.rollback({ state, dryRun: true });

      expect(result.success).toBe(true);
      expect(result.resourcesAffected).toBe(0);
    });

    it('should handle helm rollback with default revision 0', async () => {
      const state: ExecutionState = {
        executionId: 'task-helm-default-rev',
        provider: 'helm',
        workDir: '/tmp/helm-test',
        executedAt: new Date(),
        releaseName: 'my-release',
        namespace: 'default',
        // No previousRevision -> defaults to 0
      };

      const result = await manager.rollback({ state, dryRun: true });

      expect(result.success).toBe(true);
      expect(result.actions[0].output).toContain('revision 0');
    });
  });
});
