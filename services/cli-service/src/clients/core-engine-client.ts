/**
 * Core Engine Client
 *
 * Client for interacting with the Core Engine Service
 */

import type {
  DriftReport,
  DriftRemediationResult,
  DriftProvider,
} from '@nimbus/shared-types';

export interface DriftDetectParams {
  provider: DriftProvider;
  directory: string;
  namespace?: string;
  release?: string;
}

export interface DriftFixParams {
  provider: DriftProvider;
  directory: string;
  dryRun?: boolean;
  namespace?: string;
  release?: string;
}

export interface RollbackParams {
  taskId: string;
  force?: boolean;
}

export interface RollbackResult {
  success: boolean;
  message: string;
  details?: string;
}

export interface ResumeResult {
  success: boolean;
  data?: any;
  error?: string;
}

export class CoreEngineClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.CORE_ENGINE_URL || 'http://localhost:3010';
  }

  /**
   * Detect drift in infrastructure
   */
  async detectDrift(params: DriftDetectParams): Promise<DriftReport> {
    const response = await fetch(`${this.baseUrl}/api/drift/detect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
      throw new Error(error.message || `Failed to detect drift: ${response.status}`);
    }

    const data = await response.json() as { report: DriftReport };
    return data.report;
  }

  /**
   * Create a remediation plan for detected drift
   */
  async createRemediationPlan(params: DriftDetectParams): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/drift/plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
      throw new Error(error.message || `Failed to create remediation plan: ${response.status}`);
    }

    return response.json() as Promise<any>;
  }

  /**
   * Fix detected drift
   */
  async fixDrift(params: DriftFixParams): Promise<DriftRemediationResult> {
    const response = await fetch(`${this.baseUrl}/api/drift/fix`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
      throw new Error(error.message || `Failed to fix drift: ${response.status}`);
    }

    const data = await response.json() as { result: DriftRemediationResult };
    return data.result;
  }

  /**
   * Check if a task can be rolled back
   */
  async canRollback(taskId: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/api/tasks/${taskId}/rollback/check`, {
      method: 'GET',
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json() as { canRollback: boolean };
    return data.canRollback;
  }

  /**
   * Rollback a task
   */
  async rollback(params: RollbackParams): Promise<RollbackResult> {
    const response = await fetch(`${this.baseUrl}/api/tasks/${params.taskId}/rollback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ force: params.force }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
      throw new Error(error.message || `Failed to rollback: ${response.status}`);
    }

    return response.json() as Promise<RollbackResult>;
  }

  /**
   * Resume a task from its last checkpoint
   */
  async resumeTask(taskId: string): Promise<ResumeResult> {
    const response = await fetch(`${this.baseUrl}/api/tasks/${taskId}/resume`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' })) as { error?: string; message?: string };
      return {
        success: false,
        error: error.error || error.message || `Failed to resume task: ${response.status}`,
      };
    }

    const data = await response.json() as { success: boolean; data?: any; error?: string };
    return {
      success: data.success,
      data: data.data,
      error: data.error,
    };
  }

  /**
   * Get compliance report
   */
  async getComplianceReport(params: DriftDetectParams): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/drift/compliance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
      throw new Error(error.message || `Failed to get compliance report: ${response.status}`);
    }

    return response.json() as Promise<any>;
  }

  /**
   * Check if the Core Engine service is available
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
   * Health check (alias for isAvailable)
   */
  async healthCheck(): Promise<boolean> {
    return this.isAvailable();
  }
}
