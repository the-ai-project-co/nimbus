/**
 * Kubernetes Tools Client
 *
 * REST client for communicating with the K8s Tools Service
 */

import { RestClient, ServiceURLs } from '@nimbus/shared-clients';

export interface K8sResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
  };
  [key: string]: any;
}

export interface K8sGetResult {
  success: boolean;
  items: K8sResource[];
  error?: string;
}

export interface K8sApplyResult {
  success: boolean;
  output: string;
  created?: string[];
  configured?: string[];
  error?: string;
}

export interface K8sDeleteResult {
  success: boolean;
  output: string;
  deleted?: string[];
  error?: string;
}

export interface K8sLogsResult {
  success: boolean;
  logs: string;
  error?: string;
}

/**
 * Client for Kubernetes Tools Service
 */
export class K8sClient {
  private client: RestClient;

  constructor(baseUrl?: string) {
    this.client = new RestClient(baseUrl || ServiceURLs.K8S_TOOLS);
  }

  /**
   * Get Kubernetes resources
   */
  async get(
    resource: string,
    options?: {
      namespace?: string;
      name?: string;
      labels?: Record<string, string>;
      output?: 'json' | 'yaml' | 'wide';
    }
  ): Promise<K8sGetResult> {
    const params = new URLSearchParams();
    params.set('resource', resource);
    if (options?.namespace) params.set('namespace', options.namespace);
    if (options?.name) params.set('name', options.name);
    if (options?.output) params.set('output', options.output);
    if (options?.labels) params.set('labels', JSON.stringify(options.labels));

    const response = await this.client.get<K8sGetResult>(`/api/k8s/get?${params.toString()}`);
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, items: [], error: response.error?.message || 'Unknown error' };
  }

  /**
   * Apply Kubernetes manifests
   */
  async apply(
    manifests: string | K8sResource[],
    options?: {
      namespace?: string;
      dryRun?: boolean;
    }
  ): Promise<K8sApplyResult> {
    const response = await this.client.post<K8sApplyResult>('/api/k8s/apply', { manifests, ...options });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Delete Kubernetes resources
   */
  async delete(
    resource: string,
    name: string,
    options?: {
      namespace?: string;
      force?: boolean;
    }
  ): Promise<K8sDeleteResult> {
    const response = await this.client.post<K8sDeleteResult>('/api/k8s/delete', { resource, name, ...options });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Get logs from a pod
   */
  async logs(
    podName: string,
    options?: {
      namespace?: string;
      container?: string;
      tail?: number;
      since?: string;
      follow?: boolean;
    }
  ): Promise<K8sLogsResult> {
    const params = new URLSearchParams();
    params.set('pod', podName);
    if (options?.namespace) params.set('namespace', options.namespace);
    if (options?.container) params.set('container', options.container);
    if (options?.tail) params.set('tail', String(options.tail));
    if (options?.since) params.set('since', options.since);

    const response = await this.client.get<K8sLogsResult>(`/api/k8s/logs?${params.toString()}`);
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, logs: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Describe a Kubernetes resource
   */
  async describe(
    resource: string,
    name: string,
    options?: { namespace?: string }
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const params = new URLSearchParams();
    params.set('resource', resource);
    params.set('name', name);
    if (options?.namespace) params.set('namespace', options.namespace);

    const response = await this.client.get<{ success: boolean; output: string; error?: string }>(`/api/k8s/describe?${params.toString()}`);
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Scale a deployment/replicaset
   */
  async scale(
    resource: string,
    name: string,
    replicas: number,
    options?: { namespace?: string }
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>('/api/k8s/scale', { resource, name, replicas, ...options });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Execute a command in a pod
   */
  async exec(
    pod: string,
    command: string[],
    options?: {
      namespace?: string;
      container?: string;
    }
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>('/api/k8s/exec', { pod, command, ...options });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Manage rollouts
   */
  async rollout(
    resource: string,
    name: string,
    action: string,
    options?: {
      namespace?: string;
      revision?: number;
    }
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>('/api/k8s/rollout', { action, resource, name, ...options });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Get events from a namespace
   */
  async events(
    options?: {
      namespace?: string;
      fieldSelector?: string;
    }
  ): Promise<{ success: boolean; events: Array<Record<string, string>>; error?: string }> {
    const params = new URLSearchParams();
    if (options?.namespace) params.set('namespace', options.namespace);
    if (options?.fieldSelector) params.set('fieldSelector', options.fieldSelector);

    const response = await this.client.get<{ success: boolean; events: Array<Record<string, string>>; error?: string }>(`/api/k8s/events?${params.toString()}`);
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, events: [], error: response.error?.message || 'Unknown error' };
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

export const k8sClient = new K8sClient();
