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

export interface TerraformFmtResult {
  success: boolean;
  output: string;
  changed?: boolean;
  files?: string[];
  error?: string;
}

export interface TerraformOutputResult {
  success: boolean;
  output: string;
  outputs?: Record<string, { value: unknown; type: string; sensitive?: boolean }>;
  error?: string;
}

export interface TerraformWorkspaceResult {
  success: boolean;
  output: string;
  workspaces?: string[];
  current?: string;
  error?: string;
}

export interface TerraformImportResult {
  success: boolean;
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
   * Format Terraform configuration files
   */
  async fmt(directory: string, options?: {
    check?: boolean;
    recursive?: boolean;
    diff?: boolean;
  }): Promise<TerraformFmtResult> {
    const response = await this.client.post<TerraformFmtResult>('/api/terraform/fmt', { workingDir: directory, ...options });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Manage Terraform workspaces
   */
  workspace = {
    list: async (directory: string): Promise<TerraformWorkspaceResult> => {
      const params = new URLSearchParams();
      params.set('workingDir', directory);
      const response = await this.client.get<TerraformWorkspaceResult>(`/api/terraform/workspace/list?${params.toString()}`);
      if (response.success && response.data) {
        return response.data;
      }
      return { success: false, output: '', error: response.error?.message || 'Unknown error' };
    },

    select: async (name: string, directory: string): Promise<TerraformWorkspaceResult> => {
      const response = await this.client.post<TerraformWorkspaceResult>('/api/terraform/workspace/select', { name, workingDir: directory });
      if (response.success && response.data) {
        return response.data;
      }
      return { success: false, output: '', error: response.error?.message || 'Unknown error' };
    },

    new: async (name: string, directory: string): Promise<TerraformWorkspaceResult> => {
      const response = await this.client.post<TerraformWorkspaceResult>('/api/terraform/workspace/new', { name, workingDir: directory });
      if (response.success && response.data) {
        return response.data;
      }
      return { success: false, output: '', error: response.error?.message || 'Unknown error' };
    },

    delete: async (name: string, directory: string): Promise<TerraformWorkspaceResult> => {
      const response = await this.client.post<TerraformWorkspaceResult>('/api/terraform/workspace/delete', { name, workingDir: directory });
      if (response.success && response.data) {
        return response.data;
      }
      return { success: false, output: '', error: response.error?.message || 'Unknown error' };
    },
  };

  /**
   * Import existing infrastructure into Terraform state
   */
  async import(directory: string, address: string, id: string): Promise<TerraformImportResult> {
    const response = await this.client.post<TerraformImportResult>('/api/terraform/import', { workingDir: directory, address, id });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Show Terraform output values
   */
  async output(directory: string, name?: string): Promise<TerraformOutputResult> {
    const params = new URLSearchParams();
    params.set('workingDir', directory);
    if (name) params.set('name', name);
    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await this.client.get<TerraformOutputResult>(`/api/terraform/output${query}`);
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
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
