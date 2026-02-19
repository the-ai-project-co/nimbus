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

  /**
   * Create a review on a pull request
   */
  async createPRReview(
    owner: string,
    repo: string,
    pullNumber: number,
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
    body?: string
  ): Promise<PRReview> {
    logger.info(`Creating review on PR #${pullNumber} in ${owner}/${repo}`, { event });

    const params: any = {
      owner,
      repo,
      pull_number: pullNumber,
      event,
    };

    if (body) {
      params.body = body;
    }

    const { data } = await this.octokit.pulls.createReview(params);

    return data as unknown as PRReview;
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

  // ==========================================
  // GitHub Actions Operations
  // ==========================================

  /**
   * List workflow runs for a repository
   */
  async listWorkflowRuns(
    owner: string,
    repo: string,
    options?: WorkflowRunOptions
  ): Promise<WorkflowRun[]> {
    logger.info(`Listing workflow runs for ${owner}/${repo}`);

    const params: any = {
      owner,
      repo,
      per_page: options?.perPage || 30,
    };

    if (options?.workflowId) {
      params.workflow_id = options.workflowId;
    }
    if (options?.branch) {
      params.branch = options.branch;
    }
    if (options?.event) {
      params.event = options.event;
    }
    if (options?.status) {
      params.status = options.status;
    }

    const { data } = await this.octokit.actions.listWorkflowRunsForRepo(params);

    return data.workflow_runs as unknown as WorkflowRun[];
  }

  /**
   * Get a specific workflow run
   */
  async getWorkflowRun(owner: string, repo: string, runId: number): Promise<WorkflowRun> {
    logger.info(`Getting workflow run ${runId} for ${owner}/${repo}`);

    const { data } = await this.octokit.actions.getWorkflowRun({
      owner,
      repo,
      run_id: runId,
    });

    return data as unknown as WorkflowRun;
  }

  /**
   * Trigger a workflow dispatch event
   */
  async triggerWorkflow(
    owner: string,
    repo: string,
    workflowId: string | number,
    ref: string,
    inputs?: Record<string, string>
  ): Promise<void> {
    logger.info(`Triggering workflow ${workflowId} for ${owner}/${repo}`);

    await this.octokit.actions.createWorkflowDispatch({
      owner,
      repo,
      workflow_id: workflowId,
      ref,
      inputs,
    });
  }

  /**
   * List workflows for a repository
   */
  async listWorkflows(owner: string, repo: string, perPage = 30): Promise<Workflow[]> {
    logger.info(`Listing workflows for ${owner}/${repo}`);

    const { data } = await this.octokit.actions.listRepoWorkflows({
      owner,
      repo,
      per_page: perPage,
    });

    return data.workflows as unknown as Workflow[];
  }

  /**
   * Cancel a workflow run
   */
  async cancelWorkflowRun(owner: string, repo: string, runId: number): Promise<void> {
    logger.info(`Cancelling workflow run ${runId} for ${owner}/${repo}`);

    await this.octokit.actions.cancelWorkflowRun({
      owner,
      repo,
      run_id: runId,
    });
  }

  /**
   * Re-run a workflow
   */
  async rerunWorkflow(owner: string, repo: string, runId: number): Promise<void> {
    logger.info(`Re-running workflow ${runId} for ${owner}/${repo}`);

    await this.octokit.actions.reRunWorkflow({
      owner,
      repo,
      run_id: runId,
    });
  }

  /**
   * Get workflow run logs
   */
  async getWorkflowRunLogs(owner: string, repo: string, runId: number): Promise<string> {
    logger.info(`Getting logs for workflow run ${runId}`);

    const { url } = await this.octokit.actions.downloadWorkflowRunLogs({
      owner,
      repo,
      run_id: runId,
    });

    return url;
  }

  // ==========================================
  // Release Operations
  // ==========================================

  /**
   * Create a release
   */
  async createRelease(
    owner: string,
    repo: string,
    options: ReleaseOptions
  ): Promise<Release> {
    logger.info(`Creating release ${options.tagName} for ${owner}/${repo}`);

    const { data } = await this.octokit.repos.createRelease({
      owner,
      repo,
      tag_name: options.tagName,
      target_commitish: options.targetCommitish,
      name: options.name,
      body: options.body,
      draft: options.draft,
      prerelease: options.prerelease,
      generate_release_notes: options.generateReleaseNotes,
    });

    return data as unknown as Release;
  }

  /**
   * List releases
   */
  async listReleases(owner: string, repo: string, perPage = 30): Promise<Release[]> {
    logger.info(`Listing releases for ${owner}/${repo}`);

    const { data } = await this.octokit.repos.listReleases({
      owner,
      repo,
      per_page: perPage,
    });

    return data as unknown as Release[];
  }

  /**
   * Get a release by tag
   */
  async getReleaseByTag(owner: string, repo: string, tag: string): Promise<Release> {
    logger.info(`Getting release by tag ${tag} for ${owner}/${repo}`);

    const { data } = await this.octokit.repos.getReleaseByTag({
      owner,
      repo,
      tag,
    });

    return data as unknown as Release;
  }

  /**
   * Get the latest release
   */
  async getLatestRelease(owner: string, repo: string): Promise<Release> {
    logger.info(`Getting latest release for ${owner}/${repo}`);

    const { data } = await this.octokit.repos.getLatestRelease({
      owner,
      repo,
    });

    return data as unknown as Release;
  }

  /**
   * Update a release
   */
  async updateRelease(
    owner: string,
    repo: string,
    releaseId: number,
    options: Partial<ReleaseOptions>
  ): Promise<Release> {
    logger.info(`Updating release ${releaseId} for ${owner}/${repo}`);

    const { data } = await this.octokit.repos.updateRelease({
      owner,
      repo,
      release_id: releaseId,
      tag_name: options.tagName,
      target_commitish: options.targetCommitish,
      name: options.name,
      body: options.body,
      draft: options.draft,
      prerelease: options.prerelease,
    });

    return data as unknown as Release;
  }

  /**
   * Delete a release
   */
  async deleteRelease(owner: string, repo: string, releaseId: number): Promise<void> {
    logger.info(`Deleting release ${releaseId} for ${owner}/${repo}`);

    await this.octokit.repos.deleteRelease({
      owner,
      repo,
      release_id: releaseId,
    });
  }

  /**
   * Generate release notes
   */
  async generateReleaseNotes(
    owner: string,
    repo: string,
    tagName: string,
    options?: { previousTagName?: string; targetCommitish?: string }
  ): Promise<{ name: string; body: string }> {
    logger.info(`Generating release notes for ${tagName}`);

    const { data } = await this.octokit.repos.generateReleaseNotes({
      owner,
      repo,
      tag_name: tagName,
      previous_tag_name: options?.previousTagName,
      target_commitish: options?.targetCommitish,
    });

    return {
      name: data.name,
      body: data.body,
    };
  }
}

// ==========================================
// Additional Types
// ==========================================

export interface WorkflowRunOptions {
  workflowId?: string | number;
  branch?: string;
  event?: string;
  status?: 'queued' | 'in_progress' | 'completed' | 'waiting';
  perPage?: number;
}

export interface WorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  head_sha: string;
  status: string;
  conclusion: string | null;
  workflow_id: number;
  url: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_number: number;
  event: string;
}

export interface Workflow {
  id: number;
  name: string;
  path: string;
  state: string;
  url: string;
  html_url: string;
  badge_url: string;
  created_at: string;
  updated_at: string;
}

export interface ReleaseOptions {
  tagName: string;
  targetCommitish?: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  generateReleaseNotes?: boolean;
}

export interface Release {
  id: number;
  tag_name: string;
  target_commitish: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string;
  html_url: string;
  assets: ReleaseAsset[];
}

export interface ReleaseAsset {
  id: number;
  name: string;
  content_type: string;
  size: number;
  download_count: number;
  browser_download_url: string;
}

export interface PRReview {
  id: number;
  node_id: string;
  user: { login: string; id: number };
  body: string;
  state: string;
  html_url: string;
  submitted_at: string;
}
