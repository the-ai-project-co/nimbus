/**
 * Helm Tools Client
 *
 * REST client for communicating with the Helm Tools Service
 */

import { RestClient, ServiceURLs } from '@nimbus/shared-clients';

export interface HelmRelease {
  name: string;
  namespace: string;
  revision: number;
  status: string;
  chart: string;
  appVersion: string;
  updated: string;
}

export interface HelmChart {
  name: string;
  version: string;
  appVersion: string;
  description: string;
}

export interface HelmInstallResult {
  success: boolean;
  release: HelmRelease;
  output: string;
  error?: string;
}

export interface HelmUpgradeResult {
  success: boolean;
  release: HelmRelease;
  output: string;
  error?: string;
}

/**
 * Client for Helm Tools Service
 */
export class HelmClient {
  private client: RestClient;

  constructor(baseUrl?: string) {
    this.client = new RestClient(baseUrl || ServiceURLs.HELM_TOOLS);
  }

  /**
   * List Helm releases
   */
  async list(options?: {
    namespace?: string;
    allNamespaces?: boolean;
  }): Promise<{ success: boolean; releases: HelmRelease[]; error?: string }> {
    const params = new URLSearchParams();
    if (options?.namespace) params.set('namespace', options.namespace);
    if (options?.allNamespaces) params.set('all-namespaces', 'true');

    const response = await this.client.get<{ success: boolean; releases: HelmRelease[]; error?: string }>(`/api/helm/list?${params.toString()}`);
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, releases: [], error: response.error?.message || 'Unknown error' };
  }

  /**
   * Install a Helm chart
   */
  async install(
    releaseName: string,
    chart: string,
    options?: {
      namespace?: string;
      values?: Record<string, any>;
      valuesFile?: string;
      version?: string;
      wait?: boolean;
      timeout?: string;
      createNamespace?: boolean;
      dryRun?: boolean;
    }
  ): Promise<HelmInstallResult> {
    const response = await this.client.post<HelmInstallResult>('/api/helm/install', {
      releaseName,
      chart,
      ...options,
    });
    if (response.success && response.data) {
      return response.data;
    }
    return {
      success: false,
      release: { name: '', namespace: '', revision: 0, status: '', chart: '', appVersion: '', updated: '' },
      output: '',
      error: response.error?.message || 'Unknown error'
    };
  }

  /**
   * Upgrade a Helm release
   */
  async upgrade(
    releaseName: string,
    chart: string,
    options?: {
      namespace?: string;
      values?: Record<string, any>;
      valuesFile?: string;
      version?: string;
      wait?: boolean;
      timeout?: string;
      install?: boolean;
      dryRun?: boolean;
    }
  ): Promise<HelmUpgradeResult> {
    const response = await this.client.post<HelmUpgradeResult>('/api/helm/upgrade', {
      releaseName,
      chart,
      ...options,
    });
    if (response.success && response.data) {
      return response.data;
    }
    return {
      success: false,
      release: { name: '', namespace: '', revision: 0, status: '', chart: '', appVersion: '', updated: '' },
      output: '',
      error: response.error?.message || 'Unknown error'
    };
  }

  /**
   * Uninstall a Helm release
   */
  async uninstall(
    releaseName: string,
    options?: {
      namespace?: string;
      keepHistory?: boolean;
      dryRun?: boolean;
    }
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>('/api/helm/uninstall', { releaseName, ...options });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Rollback a Helm release
   */
  async rollback(
    releaseName: string,
    revision: number,
    options?: {
      namespace?: string;
      wait?: boolean;
      dryRun?: boolean;
    }
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>('/api/helm/rollback', { releaseName, revision, ...options });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Get release history
   */
  async history(
    releaseName: string,
    options?: { namespace?: string }
  ): Promise<{ success: boolean; history: any[]; error?: string }> {
    const params = new URLSearchParams();
    params.set('release', releaseName);
    if (options?.namespace) params.set('namespace', options.namespace);

    const response = await this.client.get<{ success: boolean; history: any[]; error?: string }>(`/api/helm/history?${params.toString()}`);
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, history: [], error: response.error?.message || 'Unknown error' };
  }

  /**
   * Search for Helm charts
   */
  async search(
    keyword: string,
    options?: { repo?: string }
  ): Promise<{ success: boolean; charts: HelmChart[]; error?: string }> {
    const params = new URLSearchParams();
    params.set('keyword', keyword);
    if (options?.repo) params.set('repo', options.repo);

    const response = await this.client.get<{ success: boolean; charts: HelmChart[]; error?: string }>(`/api/helm/search?${params.toString()}`);
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, charts: [], error: response.error?.message || 'Unknown error' };
  }

  /**
   * Add a Helm repository
   */
  async repoAdd(
    name: string,
    url: string
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>('/api/helm/repo/add', { name, url });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Update Helm repositories
   */
  async repoUpdate(): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>('/api/helm/repo/update', {});
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Show chart information
   */
  async show(
    chart: string,
    options?: {
      subcommand?: 'all' | 'chart' | 'readme' | 'values' | 'crds';
      version?: string;
    }
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const params = new URLSearchParams();
    params.set('chart', chart);
    if (options?.subcommand) params.set('subcommand', options.subcommand);
    if (options?.version) params.set('version', options.version);

    const response = await this.client.get<{ success: boolean; output: string; error?: string }>(`/api/helm/show?${params.toString()}`);
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Show chart values
   */
  async showValues(
    chart: string,
    options?: { version?: string }
  ): Promise<{ success: boolean; values: string; error?: string }> {
    const params = new URLSearchParams();
    params.set('chart', chart);
    if (options?.version) params.set('version', options.version);

    const response = await this.client.get<{ success: boolean; values: string; error?: string }>(`/api/helm/show/values?${params.toString()}`);
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, values: '', error: response.error?.message || 'Unknown error' };
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

export const helmClient = new HelmClient();
