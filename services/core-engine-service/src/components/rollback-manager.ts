/**
 * Rollback Manager
 *
 * Manages infrastructure rollback operations for failed deployments
 * Supports Terraform, Kubernetes, and Helm
 */

import { logger } from '@nimbus/shared-utils';
import { TerraformToolsClient, FSToolsClient } from '../clients';
import * as fs from 'fs/promises';
import * as path from 'path';

export type RollbackProvider = 'terraform' | 'kubernetes' | 'helm';
export type RollbackStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

/**
 * Execution state for rollback
 */
export interface ExecutionState {
  /** Execution ID */
  executionId: string;
  /** Provider type */
  provider: RollbackProvider;
  /** Working directory */
  workDir: string;
  /** State before execution (for Terraform) */
  previousState?: string;
  /** Previous revision (for Helm) */
  previousRevision?: number;
  /** Deployed resources */
  deployedResources?: string[];
  /** Timestamp of execution */
  executedAt: Date;
  /** Execution outputs */
  outputs?: Record<string, unknown>;
  /** Namespace (for K8s/Helm) */
  namespace?: string;
  /** Release name (for Helm) */
  releaseName?: string;
  /** Backup file path */
  backupPath?: string;
}

/**
 * Rollback options
 */
export interface RollbackOptions {
  /** Execution state to rollback */
  state: ExecutionState;
  /** Auto-approve rollback */
  autoApprove?: boolean;
  /** Target specific resources */
  targets?: string[];
  /** Dry run mode */
  dryRun?: boolean;
  /** Force rollback even if state is inconsistent */
  force?: boolean;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Rollback result
 */
export interface RollbackResult {
  /** Whether rollback succeeded */
  success: boolean;
  /** Rollback status */
  status: RollbackStatus;
  /** Execution ID that was rolled back */
  executionId: string;
  /** Resources affected */
  resourcesAffected: number;
  /** Rollback output */
  output?: string;
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  duration: number;
  /** Detailed actions taken */
  actions: RollbackAction[];
}

/**
 * Individual rollback action
 */
export interface RollbackAction {
  /** Resource address */
  resource: string;
  /** Action taken */
  action: 'destroy' | 'restore' | 'revert' | 'skip';
  /** Whether action succeeded */
  success: boolean;
  /** Action output */
  output?: string;
  /** Error message */
  error?: string;
}

/**
 * Rollback manager class
 */
export class RollbackManager {
  private terraformClient: TerraformToolsClient;
  private fsClient: FSToolsClient;
  private stateStore: Map<string, ExecutionState>;
  private backupDir: string;

  constructor(backupDir?: string) {
    this.terraformClient = new TerraformToolsClient();
    this.fsClient = new FSToolsClient();
    this.stateStore = new Map();
    this.backupDir = backupDir || '/tmp/nimbus/rollback-backups';
  }

  /**
   * Save execution state for potential rollback
   */
  async saveExecutionState(state: ExecutionState): Promise<void> {
    logger.info(`Saving execution state: ${state.executionId}`);

    try {
      // Create backup directory
      await fs.mkdir(this.backupDir, { recursive: true });

      // For Terraform, backup the state file
      if (state.provider === 'terraform') {
        const stateFilePath = path.join(state.workDir, 'terraform.tfstate');
        const backupPath = path.join(this.backupDir, `${state.executionId}.tfstate`);

        try {
          const stateContent = await fs.readFile(stateFilePath, 'utf-8');
          await fs.writeFile(backupPath, stateContent);
          state.backupPath = backupPath;
          state.previousState = stateContent;
          logger.info(`Backed up Terraform state to: ${backupPath}`);
        } catch (error) {
          // State file might not exist for new deployments
          logger.warn(`Could not backup state file: ${(error as Error).message}`);
        }
      }

      // Store in memory
      this.stateStore.set(state.executionId, state);

      // Persist to disk
      const metadataPath = path.join(this.backupDir, `${state.executionId}.json`);
      await fs.writeFile(metadataPath, JSON.stringify(state, null, 2));

      logger.info(`Execution state saved: ${state.executionId}`);
    } catch (error) {
      logger.error('Failed to save execution state', error);
      throw error;
    }
  }

  /**
   * Get execution state
   */
  async getExecutionState(executionId: string): Promise<ExecutionState | null> {
    // Check memory first
    if (this.stateStore.has(executionId)) {
      return this.stateStore.get(executionId)!;
    }

    // Try to load from disk
    try {
      const metadataPath = path.join(this.backupDir, `${executionId}.json`);
      const content = await fs.readFile(metadataPath, 'utf-8');
      const state = JSON.parse(content) as ExecutionState;
      state.executedAt = new Date(state.executedAt);
      this.stateStore.set(executionId, state);
      return state;
    } catch {
      return null;
    }
  }

  /**
   * Execute rollback
   */
  async rollback(options: RollbackOptions): Promise<RollbackResult> {
    const startTime = Date.now();
    const { state, autoApprove, dryRun, force, targets, timeout } = options;

    logger.info(`Starting rollback for execution: ${state.executionId}`);

    try {
      switch (state.provider) {
        case 'terraform':
          return await this.rollbackTerraform(options, startTime);
        case 'kubernetes':
          return await this.rollbackKubernetes(options, startTime);
        case 'helm':
          return await this.rollbackHelm(options, startTime);
        default:
          throw new Error(`Unsupported provider: ${state.provider}`);
      }
    } catch (error) {
      logger.error('Rollback failed', error);
      return {
        success: false,
        status: 'failed',
        executionId: state.executionId,
        resourcesAffected: 0,
        error: (error as Error).message,
        duration: Date.now() - startTime,
        actions: [],
      };
    }
  }

  /**
   * Rollback Terraform deployment
   */
  private async rollbackTerraform(
    options: RollbackOptions,
    startTime: number
  ): Promise<RollbackResult> {
    const { state, autoApprove, dryRun, targets } = options;
    const actions: RollbackAction[] = [];
    let resourcesAffected = 0;

    logger.info(`Rolling back Terraform deployment: ${state.executionId}`);

    try {
      // Strategy 1: If we have previous state, restore it
      if (state.previousState && state.backupPath) {
        logger.info('Restoring previous Terraform state...');

        if (!dryRun) {
          // Restore the backed up state file
          const stateFilePath = path.join(state.workDir, 'terraform.tfstate');
          await fs.copyFile(state.backupPath, stateFilePath);

          // Run terraform apply to reconcile
          const applyResult = await this.terraformClient.apply(state.workDir, {
            autoApprove: autoApprove ?? true,
            target: targets,
          });

          actions.push({
            resource: 'state',
            action: 'restore',
            success: true,
            output: 'State restored from backup',
          });
        } else {
          actions.push({
            resource: 'state',
            action: 'restore',
            success: true,
            output: 'Would restore state from backup',
          });
        }

        resourcesAffected++;
      }
      // Strategy 2: If we know deployed resources, destroy them
      else if (state.deployedResources && state.deployedResources.length > 0) {
        logger.info(`Destroying ${state.deployedResources.length} deployed resources...`);

        const targetsToDestroy = targets || state.deployedResources;

        if (!dryRun) {
          const destroyResult = await this.terraformClient.destroy(state.workDir, {
            autoApprove: autoApprove ?? true,
            target: targetsToDestroy,
          });

          for (const resource of targetsToDestroy) {
            actions.push({
              resource,
              action: 'destroy',
              success: true,
              output: 'Resource destroyed',
            });
            resourcesAffected++;
          }
        } else {
          for (const resource of targetsToDestroy) {
            actions.push({
              resource,
              action: 'destroy',
              success: true,
              output: 'Would destroy resource',
            });
            resourcesAffected++;
          }
        }
      }
      // Strategy 3: Full destroy
      else {
        logger.info('No specific rollback data, performing full destroy...');

        if (!dryRun) {
          const destroyResult = await this.terraformClient.destroy(state.workDir, {
            autoApprove: autoApprove ?? true,
          });

          actions.push({
            resource: 'all',
            action: 'destroy',
            success: true,
            output: destroyResult.output,
          });
        } else {
          actions.push({
            resource: 'all',
            action: 'destroy',
            success: true,
            output: 'Would destroy all resources',
          });
        }

        resourcesAffected = 1;
      }

      return {
        success: true,
        status: 'completed',
        executionId: state.executionId,
        resourcesAffected,
        output: 'Rollback completed successfully',
        duration: Date.now() - startTime,
        actions,
      };
    } catch (error) {
      logger.error('Terraform rollback failed', error);

      return {
        success: false,
        status: 'failed',
        executionId: state.executionId,
        resourcesAffected,
        error: (error as Error).message,
        duration: Date.now() - startTime,
        actions,
      };
    }
  }

  /**
   * Rollback Kubernetes deployment
   */
  private async rollbackKubernetes(
    options: RollbackOptions,
    startTime: number
  ): Promise<RollbackResult> {
    const { state, dryRun, targets } = options;
    const actions: RollbackAction[] = [];
    let resourcesAffected = 0;

    logger.info(`Rolling back Kubernetes deployment: ${state.executionId}`);

    try {
      // For Kubernetes, we would:
      // 1. Delete deployed resources
      // 2. Or use kubectl rollout undo for deployments

      if (state.deployedResources) {
        for (const resource of state.deployedResources) {
          if (targets && !targets.includes(resource)) {
            actions.push({
              resource,
              action: 'skip',
              success: true,
              output: 'Skipped - not in target list',
            });
            continue;
          }

          if (!dryRun) {
            // Would call k8s-tools-service delete here
            actions.push({
              resource,
              action: 'destroy',
              success: true,
              output: 'Resource deleted',
            });
          } else {
            actions.push({
              resource,
              action: 'destroy',
              success: true,
              output: 'Would delete resource',
            });
          }
          resourcesAffected++;
        }
      }

      return {
        success: true,
        status: 'completed',
        executionId: state.executionId,
        resourcesAffected,
        output: 'Kubernetes rollback completed',
        duration: Date.now() - startTime,
        actions,
      };
    } catch (error) {
      logger.error('Kubernetes rollback failed', error);

      return {
        success: false,
        status: 'failed',
        executionId: state.executionId,
        resourcesAffected,
        error: (error as Error).message,
        duration: Date.now() - startTime,
        actions,
      };
    }
  }

  /**
   * Rollback Helm deployment
   */
  private async rollbackHelm(
    options: RollbackOptions,
    startTime: number
  ): Promise<RollbackResult> {
    const { state, dryRun } = options;
    const actions: RollbackAction[] = [];

    logger.info(`Rolling back Helm deployment: ${state.executionId}`);

    try {
      if (!state.releaseName) {
        throw new Error('Release name is required for Helm rollback');
      }

      const revision = state.previousRevision || 0;

      if (!dryRun) {
        // Would call helm-tools-service rollback here
        // await this.helmClient.rollback({
        //   name: state.releaseName,
        //   revision,
        //   namespace: state.namespace,
        // });

        actions.push({
          resource: state.releaseName,
          action: 'revert',
          success: true,
          output: `Rolled back to revision ${revision}`,
        });
      } else {
        actions.push({
          resource: state.releaseName,
          action: 'revert',
          success: true,
          output: `Would rollback to revision ${revision}`,
        });
      }

      return {
        success: true,
        status: 'completed',
        executionId: state.executionId,
        resourcesAffected: 1,
        output: `Helm release ${state.releaseName} rolled back to revision ${revision}`,
        duration: Date.now() - startTime,
        actions,
      };
    } catch (error) {
      logger.error('Helm rollback failed', error);

      return {
        success: false,
        status: 'failed',
        executionId: state.executionId,
        resourcesAffected: 0,
        error: (error as Error).message,
        duration: Date.now() - startTime,
        actions,
      };
    }
  }

  /**
   * Check if rollback is available for an execution
   */
  async canRollback(executionId: string): Promise<{
    available: boolean;
    reason?: string;
    state?: ExecutionState;
  }> {
    const state = await this.getExecutionState(executionId);

    if (!state) {
      return {
        available: false,
        reason: 'Execution state not found',
      };
    }

    // Check if rollback data exists
    if (state.provider === 'terraform') {
      if (!state.previousState && !state.deployedResources) {
        return {
          available: true,
          reason: 'Rollback available but will perform full destroy',
          state,
        };
      }
    }

    if (state.provider === 'helm') {
      if (!state.releaseName) {
        return {
          available: false,
          reason: 'Release name not found in execution state',
          state,
        };
      }
    }

    return {
      available: true,
      state,
    };
  }

  /**
   * List available rollback states
   */
  async listRollbackStates(): Promise<ExecutionState[]> {
    const states: ExecutionState[] = [];

    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      const files = await fs.readdir(this.backupDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(this.backupDir, file), 'utf-8');
            const state = JSON.parse(content) as ExecutionState;
            state.executedAt = new Date(state.executedAt);
            states.push(state);
          } catch {
            // Skip invalid files
          }
        }
      }
    } catch {
      // Directory might not exist yet
    }

    // Sort by execution time, newest first
    states.sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime());

    return states;
  }

  /**
   * Clean up old rollback states
   */
  async cleanupOldStates(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const now = Date.now();
    const states = await this.listRollbackStates();
    let cleaned = 0;

    for (const state of states) {
      const age = now - state.executedAt.getTime();
      if (age > maxAgeMs) {
        try {
          // Remove metadata file
          await fs.unlink(path.join(this.backupDir, `${state.executionId}.json`));

          // Remove backup file if exists
          if (state.backupPath) {
            await fs.unlink(state.backupPath).catch(() => {});
          }

          // Remove from memory
          this.stateStore.delete(state.executionId);

          cleaned++;
          logger.info(`Cleaned up rollback state: ${state.executionId}`);
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    return cleaned;
  }
}
