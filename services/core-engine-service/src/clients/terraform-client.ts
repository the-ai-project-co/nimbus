/**
 * Terraform Tools Service Client
 *
 * Client for communicating with the Terraform Tools Service
 */

import { logger } from '@nimbus/shared-utils';

export interface TerraformPlanResult {
  success: boolean;
  output: string;
  changes: {
    to_add: number;
    to_change: number;
    to_destroy: number;
  };
  planFile?: string;
  resourceChanges?: Array<{
    address: string;
    type: string;
    change: 'create' | 'update' | 'delete' | 'no-op';
  }>;
}

export interface TerraformApplyResult {
  success: boolean;
  output: string;
  resourcesCreated: number;
  resourcesUpdated: number;
  resourcesDeleted: number;
  outputs?: Record<string, unknown>;
}

export interface TerraformValidateResult {
  valid: boolean;
  errorCount: number;
  warningCount: number;
  diagnostics: Array<{
    severity: 'error' | 'warning';
    summary: string;
    detail?: string;
  }>;
}

export interface TerraformInitResult {
  success: boolean;
  output: string;
  providersInstalled: string[];
}

export class TerraformToolsClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.TERRAFORM_TOOLS_SERVICE_URL || 'http://localhost:3001';
  }

  /**
   * Check if terraform tools service is available
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
   * Initialize terraform in a directory
   */
  async init(workDir: string, options?: {
    backend?: boolean;
    upgrade?: boolean;
    reconfigure?: boolean;
    backendConfig?: Record<string, string>;
  }): Promise<TerraformInitResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/terraform/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directory: workDir,
          ...options,
        }),
      });

      if (!response.ok) {
        throw new Error(`Terraform init failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; data: any; error?: string };
      if (!data.success) {
        throw new Error(data.error || 'Terraform init failed');
      }

      return {
        success: true,
        output: data.data.output || '',
        providersInstalled: data.data.providersInstalled || [],
      };
    } catch (error) {
      logger.error('Terraform init error', error);
      throw error;
    }
  }

  /**
   * Run terraform plan
   */
  async plan(workDir: string, options?: {
    varFile?: string;
    out?: string;
    destroy?: boolean;
    target?: string[];
    var?: Record<string, string>;
  }): Promise<TerraformPlanResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/terraform/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directory: workDir,
          ...options,
        }),
      });

      if (!response.ok) {
        throw new Error(`Terraform plan failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; data: any; error?: string };
      if (!data.success) {
        throw new Error(data.error || 'Terraform plan failed');
      }

      return {
        success: true,
        output: data.data.output || '',
        changes: data.data.changes || { to_add: 0, to_change: 0, to_destroy: 0 },
        planFile: data.data.planFile,
        resourceChanges: data.data.resourceChanges,
      };
    } catch (error) {
      logger.error('Terraform plan error', error);
      throw error;
    }
  }

  /**
   * Run terraform apply
   */
  async apply(workDir: string, options?: {
    autoApprove?: boolean;
    varFile?: string;
    planFile?: string;
    target?: string[];
    var?: Record<string, string>;
    parallelism?: number;
  }): Promise<TerraformApplyResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/terraform/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directory: workDir,
          ...options,
        }),
      });

      if (!response.ok) {
        throw new Error(`Terraform apply failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; data: any; error?: string };
      if (!data.success) {
        throw new Error(data.error || 'Terraform apply failed');
      }

      return {
        success: true,
        output: data.data.output || '',
        resourcesCreated: data.data.resourcesCreated || 0,
        resourcesUpdated: data.data.resourcesUpdated || 0,
        resourcesDeleted: data.data.resourcesDeleted || 0,
        outputs: data.data.outputs,
      };
    } catch (error) {
      logger.error('Terraform apply error', error);
      throw error;
    }
  }

  /**
   * Run terraform validate
   */
  async validate(workDir: string): Promise<TerraformValidateResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/terraform/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: workDir }),
      });

      if (!response.ok) {
        throw new Error(`Terraform validate failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; data: any; error?: string };
      if (!data.success) {
        throw new Error(data.error || 'Terraform validate failed');
      }

      return {
        valid: data.data.valid ?? true,
        errorCount: data.data.errorCount || 0,
        warningCount: data.data.warningCount || 0,
        diagnostics: data.data.diagnostics || [],
      };
    } catch (error) {
      logger.error('Terraform validate error', error);
      throw error;
    }
  }

  /**
   * Run terraform destroy
   */
  async destroy(workDir: string, options?: {
    autoApprove?: boolean;
    varFile?: string;
    target?: string[];
  }): Promise<TerraformApplyResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/terraform/destroy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directory: workDir,
          ...options,
        }),
      });

      if (!response.ok) {
        throw new Error(`Terraform destroy failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; data: any; error?: string };
      if (!data.success) {
        throw new Error(data.error || 'Terraform destroy failed');
      }

      return {
        success: true,
        output: data.data.output || '',
        resourcesCreated: 0,
        resourcesUpdated: 0,
        resourcesDeleted: data.data.resourcesDeleted || 0,
      };
    } catch (error) {
      logger.error('Terraform destroy error', error);
      throw error;
    }
  }

  /**
   * Get terraform outputs
   */
  async output(workDir: string, name?: string): Promise<Record<string, unknown>> {
    try {
      const params = new URLSearchParams({ directory: workDir });
      if (name) {
        params.append('name', name);
      }

      const response = await fetch(`${this.baseUrl}/api/terraform/output?${params}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Terraform output failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; data: any; error?: string };
      if (!data.success) {
        throw new Error(data.error || 'Terraform output failed');
      }

      return data.data.output || {};
    } catch (error) {
      logger.error('Terraform output error', error);
      throw error;
    }
  }

  /**
   * Refresh terraform state
   */
  async refresh(workDir: string, options?: { varFile?: string }): Promise<{ success: boolean }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/terraform/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directory: workDir,
          ...options,
        }),
      });

      if (!response.ok) {
        throw new Error(`Terraform refresh failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; data: any; error?: string };
      if (!data.success) {
        throw new Error(data.error || 'Terraform refresh failed');
      }

      return { success: true };
    } catch (error) {
      logger.error('Terraform refresh error', error);
      throw error;
    }
  }

  /**
   * Show terraform plan details
   */
  async show(workDir: string, planFile: string): Promise<{ json: any; raw?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/terraform/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directory: workDir,
          planFile,
        }),
      });

      if (!response.ok) {
        throw new Error(`Terraform show failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; data: any; error?: string };
      if (!data.success) {
        throw new Error(data.error || 'Terraform show failed');
      }

      return {
        json: data.data.json || data.data,
        raw: data.data.raw,
      };
    } catch (error) {
      logger.error('Terraform show error', error);
      throw error;
    }
  }

  /**
   * Format terraform files
   */
  async fmt(workDir: string, options?: {
    check?: boolean;
    recursive?: boolean;
  }): Promise<{ success: boolean; formatted: boolean; files?: string[] }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/terraform/fmt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directory: workDir,
          ...options,
        }),
      });

      if (!response.ok) {
        throw new Error(`Terraform fmt failed: ${response.status}`);
      }

      const data = await response.json() as { success: boolean; data: any; error?: string };
      if (!data.success) {
        throw new Error(data.error || 'Terraform fmt failed');
      }

      return {
        success: true,
        formatted: data.data.formatted ?? true,
        files: data.data.files,
      };
    } catch (error) {
      logger.error('Terraform fmt error', error);
      throw error;
    }
  }
}
