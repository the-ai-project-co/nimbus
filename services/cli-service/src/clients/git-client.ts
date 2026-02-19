/**
 * Git Tools Client
 *
 * REST client for communicating with the Git Tools Service
 */

import { RestClient, ServiceURLs } from '@nimbus/shared-clients';

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  untracked: string[];
  deleted: string[];
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote?: string;
  tracking?: string;
}

export interface GitRemote {
  name: string;
  url: string;
  type: 'fetch' | 'push';
}

/**
 * Client for Git Tools Service
 */
export class GitClient {
  private client: RestClient;

  constructor(baseUrl?: string) {
    this.client = new RestClient(baseUrl || ServiceURLs.GIT_TOOLS);
  }

  /**
   * Get git status
   */
  async status(directory?: string): Promise<{ success: boolean; status: GitStatus; error?: string }> {
    const params = new URLSearchParams();
    if (directory) params.set('directory', directory);

    const response = await this.client.get<{ success: boolean; status: GitStatus; error?: string }>(`/api/git/status?${params.toString()}`);
    if (response.success && response.data) {
      return response.data;
    }
    return {
      success: false,
      status: { branch: '', ahead: 0, behind: 0, staged: [], modified: [], untracked: [], deleted: [] },
      error: response.error?.message || 'Unknown error'
    };
  }

  /**
   * Stage files
   */
  async add(
    files: string[],
    options?: { directory?: string; all?: boolean }
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>('/api/git/add', { files, ...options });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Create a commit
   */
  async commit(
    message: string,
    options?: {
      directory?: string;
      all?: boolean;
      amend?: boolean;
    }
  ): Promise<{ success: boolean; commit: GitCommit; error?: string }> {
    const response = await this.client.post<{ success: boolean; commit: GitCommit; error?: string }>('/api/git/commit', { message, ...options });
    if (response.success && response.data) {
      return response.data;
    }
    return {
      success: false,
      commit: { hash: '', shortHash: '', message: '', author: '', date: '' },
      error: response.error?.message || 'Unknown error'
    };
  }

  /**
   * Push to remote
   */
  async push(options?: {
    directory?: string;
    remote?: string;
    branch?: string;
    force?: boolean;
    setUpstream?: boolean;
  }): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>('/api/git/push', options || {});
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Pull from remote
   */
  async pull(options?: {
    directory?: string;
    remote?: string;
    branch?: string;
    rebase?: boolean;
  }): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>('/api/git/pull', options || {});
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Fetch from remote
   */
  async fetch(options?: {
    directory?: string;
    remote?: string;
    all?: boolean;
    prune?: boolean;
  }): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>('/api/git/fetch', options || {});
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Get commit log
   */
  async log(options?: {
    directory?: string;
    limit?: number;
    branch?: string;
  }): Promise<{ success: boolean; commits: GitCommit[]; error?: string }> {
    const params = new URLSearchParams();
    if (options?.directory) params.set('directory', options.directory);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.branch) params.set('branch', options.branch);

    const response = await this.client.get<{ success: boolean; commits: GitCommit[]; error?: string }>(`/api/git/log?${params.toString()}`);
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, commits: [], error: response.error?.message || 'Unknown error' };
  }

  /**
   * List branches
   */
  async branches(options?: {
    directory?: string;
    all?: boolean;
  }): Promise<{ success: boolean; branches: GitBranch[]; error?: string }> {
    const params = new URLSearchParams();
    if (options?.directory) params.set('directory', options.directory);
    if (options?.all) params.set('all', 'true');

    const response = await this.client.get<{ success: boolean; branches: GitBranch[]; error?: string }>(`/api/git/branches?${params.toString()}`);
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, branches: [], error: response.error?.message || 'Unknown error' };
  }

  /**
   * Checkout branch or file
   */
  async checkout(
    target: string,
    options?: {
      directory?: string;
      create?: boolean;
    }
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>('/api/git/checkout', { target, ...options });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Get diff
   */
  async diff(options?: {
    directory?: string;
    staged?: boolean;
    file?: string;
  }): Promise<{ success: boolean; diff: string; error?: string }> {
    const params = new URLSearchParams();
    if (options?.directory) params.set('directory', options.directory);
    if (options?.staged) params.set('staged', 'true');
    if (options?.file) params.set('file', options.file);

    const response = await this.client.get<{ success: boolean; diff: string; error?: string }>(`/api/git/diff?${params.toString()}`);
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, diff: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Merge a branch
   */
  async merge(
    branch: string,
    options?: {
      directory?: string;
      noFf?: boolean;
      squash?: boolean;
      message?: string;
    }
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>('/api/git/merge', { branch, ...options });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Stash operations
   */
  async stash(
    command: 'push' | 'pop' | 'list' | 'drop' | 'apply' | 'clear',
    options?: {
      directory?: string;
      message?: string;
      index?: number;
    }
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>('/api/git/stash', { command, ...options });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Clone a repository
   */
  async clone(
    url: string,
    targetPath?: string,
    options?: {
      branch?: string;
      depth?: number;
    }
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>('/api/git/clone', { url, path: targetPath, ...options });
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

export const gitClient = new GitClient();
