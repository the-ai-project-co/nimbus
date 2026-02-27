/**
 * Git Tools Client
 *
 * REST client for communicating with the Git Tools Service
 */

import { RestClient, ServiceURLs } from '.';

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
  async status(
    directory?: string
  ): Promise<{ success: boolean; status: GitStatus; error?: string }> {
    const params = new URLSearchParams();
    if (directory) {
      params.set('directory', directory);
    }

    const response = await this.client.get<{ success: boolean; status: GitStatus; error?: string }>(
      `/api/git/status?${params.toString()}`
    );
    if (response.success && response.data) {
      return response.data;
    }
    return {
      success: false,
      status: {
        branch: '',
        ahead: 0,
        behind: 0,
        staged: [],
        modified: [],
        untracked: [],
        deleted: [],
      },
      error: response.error?.message || 'Unknown error',
    };
  }

  /**
   * Stage files
   */
  async add(
    files: string[],
    options?: { directory?: string; all?: boolean }
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>(
      '/api/git/add',
      { files, ...options }
    );
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
    const response = await this.client.post<{
      success: boolean;
      commit: GitCommit;
      error?: string;
    }>('/api/git/commit', { message, ...options });
    if (response.success && response.data) {
      return response.data;
    }
    return {
      success: false,
      commit: { hash: '', shortHash: '', message: '', author: '', date: '' },
      error: response.error?.message || 'Unknown error',
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
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>(
      '/api/git/push',
      options || {}
    );
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
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>(
      '/api/git/pull',
      options || {}
    );
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
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>(
      '/api/git/fetch',
      options || {}
    );
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
    if (options?.directory) {
      params.set('directory', options.directory);
    }
    if (options?.limit) {
      params.set('limit', String(options.limit));
    }
    if (options?.branch) {
      params.set('branch', options.branch);
    }

    const response = await this.client.get<{
      success: boolean;
      commits: GitCommit[];
      error?: string;
    }>(`/api/git/log?${params.toString()}`);
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
    if (options?.directory) {
      params.set('directory', options.directory);
    }
    if (options?.all) {
      params.set('all', 'true');
    }

    const response = await this.client.get<{
      success: boolean;
      branches: GitBranch[];
      error?: string;
    }>(`/api/git/branches?${params.toString()}`);
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
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>(
      '/api/git/checkout',
      { target, ...options }
    );
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
    if (options?.directory) {
      params.set('directory', options.directory);
    }
    if (options?.staged) {
      params.set('staged', 'true');
    }
    if (options?.file) {
      params.set('file', options.file);
    }

    const response = await this.client.get<{ success: boolean; diff: string; error?: string }>(
      `/api/git/diff?${params.toString()}`
    );
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
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>(
      '/api/git/merge',
      { branch, ...options }
    );
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
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>(
      '/api/git/stash',
      { command, ...options }
    );
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
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>(
      '/api/git/clone',
      { url, path: targetPath, ...options }
    );
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Tag operations
   */
  async tagCreate(
    name: string,
    options?: {
      directory?: string;
      message?: string;
      annotated?: boolean;
      force?: boolean;
      commit?: string;
    }
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>(
      '/api/git/tag',
      { name, path: options?.directory, ...options }
    );
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  async tagDelete(
    name: string,
    options?: { directory?: string }
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const params = new URLSearchParams();
    params.set('name', name);
    if (options?.directory) {
      params.set('path', options.directory);
    }

    const response = await this.client.delete<{ success: boolean; output: string; error?: string }>(
      `/api/git/tag?${params.toString()}`
    );
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  async tagList(options?: {
    directory?: string;
    pattern?: string;
  }): Promise<{ success: boolean; tags: string[]; error?: string }> {
    const params = new URLSearchParams();
    if (options?.directory) {
      params.set('path', options.directory);
    }
    if (options?.pattern) {
      params.set('pattern', options.pattern);
    }

    const response = await this.client.get<{
      success: boolean;
      data?: { tags: string[] };
      error?: string;
    }>(`/api/git/tags?${params.toString()}`);
    if (response.success && response.data) {
      const data = response.data as any;
      return { success: true, tags: data?.data?.tags || data?.tags || [] };
    }
    return { success: false, tags: [], error: response.error?.message || 'Unknown error' };
  }

  async tagPush(options?: {
    directory?: string;
    remote?: string;
    tagName?: string;
  }): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>(
      '/api/git/tag/push',
      { path: options?.directory, remote: options?.remote, tagName: options?.tagName }
    );
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  async tagShow(
    name: string,
    options?: { directory?: string }
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const params = new URLSearchParams();
    params.set('name', name);
    if (options?.directory) {
      params.set('path', options.directory);
    }

    const response = await this.client.get<{ success: boolean; output: string; error?: string }>(
      `/api/git/tag/show?${params.toString()}`
    );
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Get remote URL
   */
  async remote(
    remoteName?: string,
    options?: { directory?: string }
  ): Promise<{ success: boolean; remote: string; url: string | null; error?: string }> {
    const params = new URLSearchParams();
    if (options?.directory) {
      params.set('path', options.directory);
    }
    if (remoteName) {
      params.set('name', remoteName);
    }

    const response = await this.client.get<{
      success: boolean;
      remote: string;
      url: string | null;
      error?: string;
    }>(`/api/git/remote?${params.toString()}`);
    if (response.success && response.data) {
      const data = response.data as any;
      return {
        success: true,
        remote: data?.data?.remote || data?.remote || remoteName || 'origin',
        url: data?.data?.url !== undefined ? data.data.url : data?.url,
      };
    }
    return {
      success: false,
      remote: remoteName || 'origin',
      url: null,
      error: response.error?.message || 'Unknown error',
    };
  }

  /**
   * Reset to a commit
   */
  async reset(
    target: string,
    options?: { directory?: string; mode?: 'soft' | 'mixed' | 'hard' }
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>(
      '/api/git/reset',
      { target, path: options?.directory, mode: options?.mode }
    );
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Revert a commit
   */
  async revert(
    commit: string,
    options?: { directory?: string; noCommit?: boolean; noEdit?: boolean }
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>(
      '/api/git/revert',
      { commit, cwd: options?.directory, noCommit: options?.noCommit, noEdit: options?.noEdit }
    );
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Cherry-pick operations
   */
  async cherryPick(
    commit: string,
    options?: { directory?: string; noCommit?: boolean }
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>(
      '/api/git/cherry-pick',
      { commit, path: options?.directory, noCommit: options?.noCommit }
    );
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  async cherryPickAbort(options?: {
    directory?: string;
  }): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>(
      '/api/git/cherry-pick/abort',
      { path: options?.directory }
    );
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  async cherryPickContinue(options?: {
    directory?: string;
  }): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>(
      '/api/git/cherry-pick/continue',
      { path: options?.directory }
    );
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, output: '', error: response.error?.message || 'Unknown error' };
  }

  /**
   * Blame a file
   */
  async blame(
    file: string,
    options?: { directory?: string; lineRange?: string }
  ): Promise<{ success: boolean; blame: string[]; error?: string }> {
    const params = new URLSearchParams();
    params.set('file', file);
    if (options?.directory) {
      params.set('path', options.directory);
    }
    if (options?.lineRange) {
      const parts = options.lineRange.split(',');
      if (parts[0]) {
        params.set('startLine', parts[0].trim());
      }
      if (parts[1]) {
        params.set('endLine', parts[1].trim());
      }
    }

    const response = await this.client.get<{ success: boolean; blame: string[]; error?: string }>(
      `/api/git/blame?${params.toString()}`
    );
    if (response.success && response.data) {
      const data = response.data as any;
      return { success: true, blame: data?.data?.blame || data?.blame || [] };
    }
    return { success: false, blame: [], error: response.error?.message || 'Unknown error' };
  }

  /**
   * Initialize a repository
   */
  async init(options?: {
    directory?: string;
    bare?: boolean;
  }): Promise<{ success: boolean; output: string; error?: string }> {
    const response = await this.client.post<{ success: boolean; output: string; error?: string }>(
      '/api/git/init',
      { path: options?.directory, bare: options?.bare }
    );
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
