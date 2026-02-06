/**
 * GitHub Operations
 *
 * Wrapper around Octokit for GitHub API operations
 */

import { Octokit } from '@octokit/rest';
import { logger } from '@nimbus/shared-utils';
import type {
  PullRequest,
  Issue,
  Repository,
  Branch,
  IssueComment,
  CreatePRParams,
  CreateIssueParams,
  MergeParams,
} from './types';

/**
 * GitHubOperations class provides methods for interacting with GitHub API
 */
export class GitHubOperations {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  // ==========================================
  // Pull Request Operations
  // ==========================================

  /**
   * List pull requests for a repository
   */
  async listPRs(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open',
    perPage = 30
  ): Promise<PullRequest[]> {
    logger.info(`Listing PRs for ${owner}/${repo}`, { state, perPage });

    const { data } = await this.octokit.pulls.list({
      owner,
      repo,
      state,
      per_page: perPage,
    });

    return data as unknown as PullRequest[];
  }

  /**
   * Get a single pull request
   */
  async getPR(owner: string, repo: string, pullNumber: number): Promise<PullRequest> {
    logger.info(`Getting PR #${pullNumber} for ${owner}/${repo}`);

    const { data } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    return data as unknown as PullRequest;
  }

  /**
   * Create a pull request
   */
  async createPR(owner: string, repo: string, params: CreatePRParams): Promise<PullRequest> {
    logger.info(`Creating PR in ${owner}/${repo}`, { title: params.title });

    const { data } = await this.octokit.pulls.create({
      owner,
      repo,
      title: params.title,
      head: params.head,
      base: params.base,
      body: params.body,
      draft: params.draft,
    });

    return data as unknown as PullRequest;
  }

  /**
   * Merge a pull request
   */
  async mergePR(
    owner: string,
    repo: string,
    pullNumber: number,
    params: MergeParams = {}
  ): Promise<{ sha: string; merged: boolean; message: string }> {
    logger.info(`Merging PR #${pullNumber} in ${owner}/${repo}`);

    const { data } = await this.octokit.pulls.merge({
      owner,
      repo,
      pull_number: pullNumber,
      commit_title: params.commit_title,
      commit_message: params.commit_message,
      merge_method: params.merge_method || 'merge',
    });

    return data;
  }

  /**
   * Close a pull request without merging
   */
  async closePR(owner: string, repo: string, pullNumber: number): Promise<PullRequest> {
    logger.info(`Closing PR #${pullNumber} in ${owner}/${repo}`);

    const { data } = await this.octokit.pulls.update({
      owner,
      repo,
      pull_number: pullNumber,
      state: 'closed',
    });

    return data as unknown as PullRequest;
  }

  // ==========================================
  // Issue Operations
  // ==========================================

  /**
   * List issues for a repository
   */
  async listIssues(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open',
    perPage = 30
  ): Promise<Issue[]> {
    logger.info(`Listing issues for ${owner}/${repo}`, { state, perPage });

    const { data } = await this.octokit.issues.listForRepo({
      owner,
      repo,
      state,
      per_page: perPage,
    });

    // Filter out pull requests (issues endpoint returns both)
    const issues = data.filter((item) => !item.pull_request);

    return issues as unknown as Issue[];
  }

  /**
   * Get a single issue
   */
  async getIssue(owner: string, repo: string, issueNumber: number): Promise<Issue> {
    logger.info(`Getting issue #${issueNumber} for ${owner}/${repo}`);

    const { data } = await this.octokit.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });

    return data as unknown as Issue;
  }

  /**
   * Create an issue
   */
  async createIssue(owner: string, repo: string, params: CreateIssueParams): Promise<Issue> {
    logger.info(`Creating issue in ${owner}/${repo}`, { title: params.title });

    const { data } = await this.octokit.issues.create({
      owner,
      repo,
      title: params.title,
      body: params.body,
      labels: params.labels,
      assignees: params.assignees,
    });

    return data as unknown as Issue;
  }

  /**
   * Update an issue
   */
  async updateIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    params: Partial<CreateIssueParams> & { state?: 'open' | 'closed' }
  ): Promise<Issue> {
    logger.info(`Updating issue #${issueNumber} in ${owner}/${repo}`);

    const { data } = await this.octokit.issues.update({
      owner,
      repo,
      issue_number: issueNumber,
      ...params,
    });

    return data as unknown as Issue;
  }

  /**
   * Close an issue
   */
  async closeIssue(owner: string, repo: string, issueNumber: number): Promise<Issue> {
    return this.updateIssue(owner, repo, issueNumber, { state: 'closed' });
  }

  /**
   * Add a comment to an issue or PR
   */
  async addComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string
  ): Promise<IssueComment> {
    logger.info(`Adding comment to #${issueNumber} in ${owner}/${repo}`);

    const { data } = await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });

    return data as unknown as IssueComment;
  }

  /**
   * List comments on an issue or PR
   */
  async listComments(
    owner: string,
    repo: string,
    issueNumber: number,
    perPage = 30
  ): Promise<IssueComment[]> {
    logger.info(`Listing comments for #${issueNumber} in ${owner}/${repo}`);

    const { data } = await this.octokit.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: perPage,
    });

    return data as unknown as IssueComment[];
  }

  // ==========================================
  // Repository Operations
  // ==========================================

  /**
   * Get repository information
   */
  async getRepo(owner: string, repo: string): Promise<Repository> {
    logger.info(`Getting repository ${owner}/${repo}`);

    const { data } = await this.octokit.repos.get({
      owner,
      repo,
    });

    return data as unknown as Repository;
  }

  /**
   * List branches for a repository
   */
  async listBranches(owner: string, repo: string, perPage = 30): Promise<Branch[]> {
    logger.info(`Listing branches for ${owner}/${repo}`);

    const { data } = await this.octokit.repos.listBranches({
      owner,
      repo,
      per_page: perPage,
    });

    return data as unknown as Branch[];
  }

  /**
   * Get a specific branch
   */
  async getBranch(owner: string, repo: string, branch: string): Promise<Branch & { commit: { sha: string } }> {
    logger.info(`Getting branch ${branch} for ${owner}/${repo}`);

    const { data } = await this.octokit.repos.getBranch({
      owner,
      repo,
      branch,
    });

    return data as unknown as Branch & { commit: { sha: string } };
  }

  /**
   * Create a new branch
   */
  async createBranch(
    owner: string,
    repo: string,
    branchName: string,
    sha: string
  ): Promise<{ ref: string; object: { sha: string } }> {
    logger.info(`Creating branch ${branchName} in ${owner}/${repo}`);

    const { data } = await this.octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha,
    });

    return data;
  }

  /**
   * Delete a branch
   */
  async deleteBranch(owner: string, repo: string, branchName: string): Promise<void> {
    logger.info(`Deleting branch ${branchName} in ${owner}/${repo}`);

    await this.octokit.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
    });
  }

  // ==========================================
  // Authentication
  // ==========================================

  /**
   * Validate the token and get authenticated user
   */
  async validateToken(): Promise<{ login: string; name: string | null; email: string | null }> {
    const { data } = await this.octokit.users.getAuthenticated();
    return {
      login: data.login,
      name: data.name,
      email: data.email,
    };
  }
}
