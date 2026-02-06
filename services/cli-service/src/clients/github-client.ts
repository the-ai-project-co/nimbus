/**
 * GitHub Tools Client
 *
 * REST client for communicating with the GitHub Tools Service
 */

import { RestClient, ServiceURLs } from '@nimbus/shared-clients';
import { authStore } from '../auth/store';

export interface GitHubUser {
  login: string;
  name: string;
  email?: string;
  avatar_url?: string;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  user: GitHubUser;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  created_at: string;
  updated_at: string;
  merged_at?: string;
  mergeable?: boolean;
  draft?: boolean;
  labels: Array<{ name: string; color: string }>;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  user: GitHubUser;
  labels: Array<{ name: string; color: string }>;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  comments: number;
}

export interface GitHubRepository {
  full_name: string;
  name: string;
  owner: { login: string };
  description?: string;
  private: boolean;
  default_branch: string;
  language?: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
}

export interface GitHubBranch {
  name: string;
  commit: { sha: string };
  protected: boolean;
}

export interface CreatePRParams {
  title: string;
  head: string;
  base: string;
  body?: string;
  draft?: boolean;
}

export interface CreateIssueParams {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

/**
 * Client for GitHub Tools Service
 */
export class GitHubClient {
  private client: RestClient;

  constructor(baseUrl?: string) {
    this.client = new RestClient(baseUrl || ServiceURLs.GITHUB_TOOLS);
  }

  /**
   * Get authorization header from stored GitHub identity
   */
  private getAuthHeader(): Record<string, string> {
    const identity = authStore.getIdentity();
    if (identity?.accessToken) {
      return { Authorization: `Bearer ${identity.accessToken}` };
    }
    return {};
  }

  /**
   * Create a REST client with auth headers
   */
  private getAuthClient(): RestClient {
    const authHeaders = this.getAuthHeader();
    return new RestClient(ServiceURLs.GITHUB_TOOLS, {
      headers: authHeaders,
    });
  }

  /**
   * Get authenticated user info
   */
  async getUser(): Promise<{ success: boolean; data?: GitHubUser; error?: string }> {
    const client = this.getAuthClient();
    const response = await client.get<{ success: boolean; data: GitHubUser }>('/api/github/user');
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, error: response.error?.message || 'Unknown error' };
  }

  /**
   * List pull requests
   */
  async listPRs(
    owner: string,
    repo: string,
    options?: { state?: 'open' | 'closed' | 'all'; perPage?: number }
  ): Promise<{ success: boolean; data?: GitHubPullRequest[]; error?: string }> {
    const client = this.getAuthClient();
    const params = new URLSearchParams();
    params.set('owner', owner);
    params.set('repo', repo);
    if (options?.state) params.set('state', options.state);
    if (options?.perPage) params.set('per_page', String(options.perPage));

    const response = await client.get<{ success: boolean; data: GitHubPullRequest[] }>(
      `/api/github/prs?${params.toString()}`
    );
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, error: response.error?.message || 'Unknown error' };
  }

  /**
   * Get a single pull request
   */
  async getPR(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<{ success: boolean; data?: GitHubPullRequest; error?: string }> {
    const client = this.getAuthClient();
    const params = new URLSearchParams();
    params.set('owner', owner);
    params.set('repo', repo);

    const response = await client.get<{ success: boolean; data: GitHubPullRequest }>(
      `/api/github/prs/${prNumber}?${params.toString()}`
    );
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, error: response.error?.message || 'Unknown error' };
  }

  /**
   * Create a pull request
   */
  async createPR(
    owner: string,
    repo: string,
    params: CreatePRParams
  ): Promise<{ success: boolean; data?: GitHubPullRequest; error?: string }> {
    const client = this.getAuthClient();
    const response = await client.post<{ success: boolean; data: GitHubPullRequest }>(
      '/api/github/prs',
      { owner, repo, ...params }
    );
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, error: response.error?.message || 'Unknown error' };
  }

  /**
   * Merge a pull request
   */
  async mergePR(
    owner: string,
    repo: string,
    prNumber: number,
    options?: { mergeMethod?: 'merge' | 'squash' | 'rebase'; commitTitle?: string }
  ): Promise<{ success: boolean; data?: { sha: string; merged: boolean; message: string }; error?: string }> {
    const client = this.getAuthClient();
    const response = await client.post<{
      success: boolean;
      data: { sha: string; merged: boolean; message: string };
    }>(`/api/github/prs/${prNumber}/merge`, { owner, repo, ...options });
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, error: response.error?.message || 'Unknown error' };
  }

  /**
   * List issues
   */
  async listIssues(
    owner: string,
    repo: string,
    options?: { state?: 'open' | 'closed' | 'all'; perPage?: number }
  ): Promise<{ success: boolean; data?: GitHubIssue[]; error?: string }> {
    const client = this.getAuthClient();
    const params = new URLSearchParams();
    params.set('owner', owner);
    params.set('repo', repo);
    if (options?.state) params.set('state', options.state);
    if (options?.perPage) params.set('per_page', String(options.perPage));

    const response = await client.get<{ success: boolean; data: GitHubIssue[] }>(
      `/api/github/issues?${params.toString()}`
    );
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, error: response.error?.message || 'Unknown error' };
  }

  /**
   * Get a single issue
   */
  async getIssue(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<{ success: boolean; data?: GitHubIssue; error?: string }> {
    const client = this.getAuthClient();
    const params = new URLSearchParams();
    params.set('owner', owner);
    params.set('repo', repo);

    const response = await client.get<{ success: boolean; data: GitHubIssue }>(
      `/api/github/issues/${issueNumber}?${params.toString()}`
    );
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, error: response.error?.message || 'Unknown error' };
  }

  /**
   * Create an issue
   */
  async createIssue(
    owner: string,
    repo: string,
    params: CreateIssueParams
  ): Promise<{ success: boolean; data?: GitHubIssue; error?: string }> {
    const client = this.getAuthClient();
    const response = await client.post<{ success: boolean; data: GitHubIssue }>(
      '/api/github/issues',
      { owner, repo, ...params }
    );
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, error: response.error?.message || 'Unknown error' };
  }

  /**
   * Close an issue
   */
  async closeIssue(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<{ success: boolean; data?: GitHubIssue; error?: string }> {
    const client = this.getAuthClient();
    const params = new URLSearchParams();
    params.set('owner', owner);
    params.set('repo', repo);

    const response = await client.put<{ success: boolean; data: GitHubIssue }>(
      `/api/github/issues/${issueNumber}/close?${params.toString()}`,
      {}
    );
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, error: response.error?.message || 'Unknown error' };
  }

  /**
   * Add a comment to an issue or PR
   */
  async addComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string
  ): Promise<{ success: boolean; data?: { id: number; body: string }; error?: string }> {
    const client = this.getAuthClient();
    const response = await client.post<{ success: boolean; data: { id: number; body: string } }>(
      `/api/github/issues/${issueNumber}/comments`,
      { owner, repo, body }
    );
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, error: response.error?.message || 'Unknown error' };
  }

  /**
   * Get repository info
   */
  async getRepo(
    owner: string,
    repo: string
  ): Promise<{ success: boolean; data?: GitHubRepository; error?: string }> {
    const client = this.getAuthClient();
    const params = new URLSearchParams();
    params.set('owner', owner);
    params.set('repo', repo);

    const response = await client.get<{ success: boolean; data: GitHubRepository }>(
      `/api/github/repos?${params.toString()}`
    );
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, error: response.error?.message || 'Unknown error' };
  }

  /**
   * List branches
   */
  async listBranches(
    owner: string,
    repo: string,
    options?: { perPage?: number }
  ): Promise<{ success: boolean; data?: GitHubBranch[]; error?: string }> {
    const client = this.getAuthClient();
    const params = new URLSearchParams();
    params.set('owner', owner);
    params.set('repo', repo);
    if (options?.perPage) params.set('per_page', String(options.perPage));

    const response = await client.get<{ success: boolean; data: GitHubBranch[] }>(
      `/api/github/repos/branches?${params.toString()}`
    );
    if (response.success && response.data) {
      return response.data;
    }
    return { success: false, error: response.error?.message || 'Unknown error' };
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

export const githubClient = new GitHubClient();
