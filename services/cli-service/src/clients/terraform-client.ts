/**
 * Terraform Tools Client
 *
 * REST client for communicating with the Terraform Tools Service
 */

import { RestClient, ServiceURLs } from '@nimbus/shared-clients';

export interface TerraformInitResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface TerraformPlanResult {
  success: boolean;
  output: string;
  hasChanges: boolean;
  planFile?: string;
  error?: string;
}

export interface TerraformApplyResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface TerraformValidateResult {
  valid: boolean;
  output: string;
  error?: string;
}

/**
 * Client for Terraform Tools Service
 */
export class TerraformClient {
  private client: RestClient;

  constructor(baseUrl?: string) {
    this.client = new RestClient(baseUrl || ServiceURLs.TERRAFORM_TOOLS);
  }

  /**
   * Initialize a Terraform working directory
   */
  async init(directory: string): Promise<TerraformInitResult> {
    const response = await this.client.post<TerraformInitResult>('/api/terraform/init', { directory });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Generate a Terraform execution plan
   */
  async plan(directory: string, options?: {
    varFile?: string;
    vars?: Record<string, string>;
    out?: string;
  }): Promise<TerraformPlanResult> {
    const response = await this.client.post<TerraformPlanResult>('/api/terraform/plan', { directory, ...options });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', hasChanges: false, error: response.error?.message || 'Unknown error' };
  }

  /**
   * Apply Terraform changes
   */
  async apply(directory: string, options?: {
    planFile?: string;
    autoApprove?: boolean;
    varFile?: string;
    vars?: Record<string, string>;
  }): Promise<TerraformApplyResult> {
    const response = await this.client.post<TerraformApplyResult>('/api/terraform/apply', { directory, ...options });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Validate Terraform configuration
   */
  async validate(directory: string): Promise<TerraformValidateResult> {
    const response = await this.client.post<TerraformValidateResult>('/api/terraform/validate', { directory });
    if (response.success && response.data) {
      return response.data;
    }
    return { valid: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Destroy Terraform-managed infrastructure
   */
  async destroy(directory: string, options?: {
    autoApprove?: boolean;
    varFile?: string;
  }): Promise<TerraformApplyResult> {
    const response = await this.client.post<TerraformApplyResult>('/api/terraform/destroy', { directory, ...options });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Show Terraform state
   */
  async show(directory: string): Promise<{ success: boolean; output: string }> {
    const response = await this.client.post<{ success: boolean; output: string }>('/api/terraform/show', { directory });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '' };
  }

  /**
   * Check if service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.client.get<{ status: string }>('/health');
      return response.success && response.data?.status === 'healthy';
    } catch {
      return false;
    }
  }
}

export const terraformClient = new TerraformClient();
