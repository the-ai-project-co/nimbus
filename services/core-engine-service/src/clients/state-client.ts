/**
 * State Service Client
 *
 * Client for communicating with the State Service checkpoint endpoints
 */

import { logger } from '@nimbus/shared-utils';

export interface Checkpoint {
  id: string;
  operationId: string;
  step: number;
  state: Record<string, unknown>;
  createdAt: string;
}

export interface CheckpointSummary {
  id: string;
  step: number;
  createdAt: string;
}

export class StateServiceClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.STATE_SERVICE_URL || 'http://localhost:3011';
  }

  /**
   * Check if the state service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Save a checkpoint for a plan execution
   */
  async saveCheckpoint(
    id: string,
    operationId: string,
    step: number,
    state: Record<string, unknown>
  ): Promise<{ success: boolean; id: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/state/checkpoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, operationId, step, state }),
      });

      if (!response.ok) {
        throw new Error(`Save checkpoint failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; id: string; error?: string };
      if (!data.success) {
        throw new Error(data.error || 'Save checkpoint failed');
      }

      return { success: true, id: data.id };
    } catch (error) {
      logger.error('Save checkpoint error', error);
      throw error;
    }
  }

  /**
   * Get the latest checkpoint for an operation
   */
  async getLatestCheckpoint(operationId: string): Promise<Checkpoint | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/state/checkpoints/latest/${encodeURIComponent(operationId)}`,
        { method: 'GET' }
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Get latest checkpoint failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; checkpoint: Checkpoint; error?: string };
      if (!data.success) {
        return null;
      }

      return data.checkpoint;
    } catch (error) {
      logger.error('Get latest checkpoint error', error);
      return null;
    }
  }

  /**
   * List all checkpoints for an operation
   */
  async listCheckpoints(operationId: string): Promise<CheckpointSummary[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/state/checkpoints/list/${encodeURIComponent(operationId)}`,
        { method: 'GET' }
      );

      if (!response.ok) {
        throw new Error(`List checkpoints failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; checkpoints: CheckpointSummary[]; error?: string };
      if (!data.success) {
        throw new Error(data.error || 'List checkpoints failed');
      }

      return data.checkpoints;
    } catch (error) {
      logger.error('List checkpoints error', error);
      return [];
    }
  }

  /**
   * Get a single checkpoint by ID
   */
  async getCheckpoint(id: string): Promise<Checkpoint | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/state/checkpoints/${encodeURIComponent(id)}`,
        { method: 'GET' }
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Get checkpoint failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; checkpoint: Checkpoint; error?: string };
      if (!data.success) {
        return null;
      }

      return data.checkpoint;
    } catch (error) {
      logger.error('Get checkpoint error', error);
      return null;
    }
  }

  /**
   * Delete all checkpoints for an operation (cleanup after completion)
   */
  async deleteCheckpoints(operationId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/state/checkpoints/${encodeURIComponent(operationId)}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error(`Delete checkpoints failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; error?: string };
      return data.success;
    } catch (error) {
      logger.error('Delete checkpoints error', error);
      return false;
    }
  }
}
