/**
 * Terraform Tools Client
 *
 * REST client for communicating with the Terraform Tools Service
 */

import { RestClient, ServiceURLs } from '.';

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

export interface TerraformStateResult {
  success: boolean;
  output: string;
  resources?: string[];
  error?: string;
}

export interface TerraformTaintResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface TerraformGraphResult {
  success: boolean;
  output: string;
  dot?: string;
  error?: string;
}

export interface TerraformForceUnlockResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface TerraformRefreshResult {
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
   * Manage Terraform state
   */
  state = {
    list: async (directory: string): Promise<TerraformStateResult> => {
      const params = new URLSearchParams();
      params.set('workingDir', directory);
      const response = await this.client.get<TerraformStateResult>(`/api/terraform/state/list?${params.toString()}`);
      if (response.success && response.data) {
        return response.data;
      }
      return { success: false, output: '', error: response.error?.message || 'Unknown error' };
    },

    show: async (address: string, directory: string): Promise<TerraformStateResult> => {
      const params = new URLSearchParams();
      params.set('address', address);
      params.set('workingDir', directory);
      const response = await this.client.get<TerraformStateResult>(`/api/terraform/state/show?${params.toString()}`);
      if (response.success && response.data) {
        return response.data;
      }
      return { success: false, output: '', error: response.error?.message || 'Unknown error' };
    },

    mv: async (directory: string, source: string, destination: string): Promise<TerraformStateResult> => {
      const response = await this.client.post<TerraformStateResult>('/api/terraform/state/mv', { directory, source, destination });
      if (response.success && response.data) {
        return response.data;
      }
      return { success: false, output: '', error: response.error?.message || 'Unknown error' };
    },

    pull: async (directory: string): Promise<TerraformStateResult> => {
      const params = new URLSearchParams();
      params.set('directory', directory);
      const response = await this.client.get<TerraformStateResult>(`/api/terraform/state/pull?${params.toString()}`);
      if (response.success && response.data) {
        return response.data;
      }
      return { success: false, output: '', error: response.error?.message || 'Unknown error' };
    },

    push: async (directory: string, options?: { stateFile?: string; force?: boolean }): Promise<TerraformStateResult> => {
      const response = await this.client.post<TerraformStateResult>('/api/terraform/state/push', { directory, ...options });
      if (response.success && response.data) {
        return response.data;
      }
      return { success: false, output: '', error: response.error?.message || 'Unknown error' };
    },
  };

  /**
   * Taint a resource, marking it for recreation on next apply
   */
  async taint(directory: string, address: string): Promise<TerraformTaintResult> {
    const response = await this.client.post<TerraformTaintResult>('/api/terraform/taint', { directory, address });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Untaint a resource, removing the taint mark
   */
  async untaint(directory: string, address: string): Promise<TerraformTaintResult> {
    const response = await this.client.post<TerraformTaintResult>('/api/terraform/untaint', { directory, address });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Generate a resource dependency graph in DOT format
   */
  async graph(directory: string, options?: { type?: 'plan' | 'apply' }): Promise<TerraformGraphResult> {
    const params = new URLSearchParams();
    params.set('directory', directory);
    if (options?.type) params.set('type', options.type);
    const response = await this.client.get<TerraformGraphResult>(`/api/terraform/graph?${params.toString()}`);
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Force unlock a locked state
   */
  async forceUnlock(directory: string, lockId: string): Promise<TerraformForceUnlockResult> {
    const response = await this.client.post<TerraformForceUnlockResult>('/api/terraform/force-unlock', { directory, lockId });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Refresh Terraform state against real infrastructure
   */
  async refresh(directory: string, options?: { varFile?: string }): Promise<TerraformRefreshResult> {
    const response = await this.client.post<TerraformRefreshResult>('/api/terraform/refresh', { directory, ...options });
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
