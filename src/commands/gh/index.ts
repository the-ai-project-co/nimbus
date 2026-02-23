/**
 * GitHub CLI Commands
 *
 * CLI commands for interacting with GitHub via the GitHub Tools Service
 */

import { githubClient } from '../../clients/github-client';
import { ui } from '../../wizard/ui';

export interface GhCommandOptions {
  owner?: string;
  repo?: string;
  json?: boolean;
}

/**
 * Parse owner/repo from git remote or arguments
 */
async function getOwnerRepo(options: GhCommandOptions): Promise<{ owner: string; repo: string } | null> {
  if (options.owner && options.repo) {
    return { owner: options.owner, repo: options.repo };
  }

  // Try to get from git remote
  try {
    const proc = Bun.spawn(['git', 'remote', 'get-url', 'origin'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await new Response(proc.stdout).text();
    const match = output.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
  } catch {
    // Ignore git errors
  }

  ui.error('Could not determine repository. Use --owner and --repo options.');
  return null;
}

/**
 * Format a date for display
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ==========================================
// Pull Request Commands
// ==========================================

export interface PrListOptions extends GhCommandOptions {
  state?: 'open' | 'closed' | 'all';
  limit?: number;
}

/**
 * List pull requests
 */
export async function ghPrListCommand(options: PrListOptions = {}): Promise<void> {
  const ownerRepo = await getOwnerRepo(options);
  if (!ownerRepo) return;

  ui.startSpinner({ message: 'Fetching pull requests...' });

  const result = await githubClient.listPRs(ownerRepo.owner, ownerRepo.repo, {
    state: options.state || 'open',
    perPage: options.limit || 10,
  });

  if (!result.success || !result.data) {
    ui.stopSpinnerFail('Failed to fetch pull requests');
    ui.error(result.error || 'Failed to fetch pull requests');
    return;
  }

  ui.stopSpinnerSuccess('Fetched pull requests');

  if (options.json) {
    console.log(JSON.stringify(result.data, null, 2));
    return;
  }

  if (result.data.length === 0) {
    ui.info('No pull requests found');
    return;
  }

  ui.header(`Pull Requests - ${ownerRepo.owner}/${ownerRepo.repo}`);

  ui.table({
    columns: [
      { key: 'number', header: '#' },
      { key: 'title', header: 'Title' },
      { key: 'author', header: 'Author' },
      { key: 'state', header: 'State' },
      { key: 'updated', header: 'Updated' },
    ],
    data: result.data.map((pr) => ({
      number: `#${pr.number}`,
      title: pr.title.substring(0, 50) + (pr.title.length > 50 ? '...' : ''),
      author: pr.user.login,
      state: pr.draft
        ? ui.color('draft', 'gray')
        : pr.state === 'open'
          ? ui.color('open', 'green')
          : ui.color('closed', 'red'),
      updated: formatDate(pr.updated_at),
    })),
  });
}

export interface PrViewOptions extends GhCommandOptions {
  prNumber: number;
}

/**
 * View a single pull request
 */
export async function ghPrViewCommand(options: PrViewOptions): Promise<void> {
  const ownerRepo = await getOwnerRepo(options);
  if (!ownerRepo) return;

  ui.startSpinner({ message: `Fetching PR #${options.prNumber}...` });

  const result = await githubClient.getPR(ownerRepo.owner, ownerRepo.repo, options.prNumber);

  if (!result.success || !result.data) {
    ui.stopSpinnerFail('Failed to fetch pull request');
    ui.error(result.error || 'Failed to fetch pull request');
    return;
  }

  ui.stopSpinnerSuccess('Fetched pull request');

  const pr = result.data;

  if (options.json) {
    console.log(JSON.stringify(pr, null, 2));
    return;
  }

  ui.header(`PR #${pr.number}: ${pr.title}`);
  ui.newLine();

  ui.info(`Author: ${pr.user.login}`);
  ui.info(`State: ${pr.state}${pr.draft ? ' (draft)' : ''}`);
  ui.info(`Branch: ${pr.head.ref} → ${pr.base.ref}`);
  ui.info(`Created: ${formatDate(pr.created_at)}`);
  ui.info(`Updated: ${formatDate(pr.updated_at)}`);

  if (pr.labels.length > 0) {
    ui.info(`Labels: ${pr.labels.map((l) => l.name).join(', ')}`);
  }

  if (pr.body) {
    ui.newLine();
    ui.box({ title: 'Description', content: pr.body });
  }
}

export interface PrCreateOptions extends GhCommandOptions {
  title: string;
  body?: string;
  head?: string;
  base?: string;
  draft?: boolean;
}

/**
 * Create a pull request
 */
export async function ghPrCreateCommand(options: PrCreateOptions): Promise<void> {
  const ownerRepo = await getOwnerRepo(options);
  if (!ownerRepo) return;

  // Get current branch if head not specified
  let head = options.head;
  if (!head) {
    try {
      const proc = Bun.spawn(['git', 'branch', '--show-current'], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      head = (await new Response(proc.stdout).text()).trim();
    } catch {
      ui.error('Could not determine current branch. Use --head option.');
      return;
    }
  }

  ui.startSpinner({ message: 'Creating pull request...' });

  const result = await githubClient.createPR(ownerRepo.owner, ownerRepo.repo, {
    title: options.title,
    head,
    base: options.base || 'main',
    body: options.body,
    draft: options.draft,
  });

  if (!result.success || !result.data) {
    ui.stopSpinnerFail('Failed to create pull request');
    ui.error(result.error || 'Failed to create pull request');
    return;
  }

  ui.stopSpinnerSuccess('Created pull request');
  ui.success(`Created PR #${result.data.number}: ${result.data.title}`);
}

export interface PrMergeOptions extends GhCommandOptions {
  prNumber: number;
  method?: 'merge' | 'squash' | 'rebase';
  commitTitle?: string;
}

/**
 * Merge a pull request
 */
export async function ghPrMergeCommand(options: PrMergeOptions): Promise<void> {
  const ownerRepo = await getOwnerRepo(options);
  if (!ownerRepo) return;

  ui.startSpinner({ message: `Merging PR #${options.prNumber}...` });

  const result = await githubClient.mergePR(ownerRepo.owner, ownerRepo.repo, options.prNumber, {
    mergeMethod: options.method,
    commitTitle: options.commitTitle,
  });

  if (!result.success || !result.data) {
    ui.stopSpinnerFail('Failed to merge pull request');
    ui.error(result.error || 'Failed to merge pull request');
    return;
  }

  ui.stopSpinnerSuccess('Merged pull request');
  ui.success(result.data.message);
}

export interface PrReviewOptions extends GhCommandOptions {
  prNumber: number;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  body?: string;
}

/**
 * Review a pull request
 */
export async function ghPrReviewCommand(options: PrReviewOptions): Promise<void> {
  const ownerRepo = await getOwnerRepo(options);
  if (!ownerRepo) return;

  ui.startSpinner({ message: `Reviewing PR #${options.prNumber}...` });

  const result = await githubClient.createPRReview(
    ownerRepo.owner,
    ownerRepo.repo,
    options.prNumber,
    options.event,
    options.body
  );

  if (!result.success || !result.data) {
    ui.stopSpinnerFail('Failed to review pull request');
    ui.error(result.error || 'Failed to review pull request');
    return;
  }

  ui.stopSpinnerSuccess('Review submitted');
  ui.success(`Review submitted on PR #${options.prNumber}: ${options.event}`);
}

// ==========================================
// Issue Commands
// ==========================================

export interface IssueListOptions extends GhCommandOptions {
  state?: 'open' | 'closed' | 'all';
  limit?: number;
}

/**
 * List issues
 */
export async function ghIssueListCommand(options: IssueListOptions = {}): Promise<void> {
  const ownerRepo = await getOwnerRepo(options);
  if (!ownerRepo) return;

  ui.startSpinner({ message: 'Fetching issues...' });

  const result = await githubClient.listIssues(ownerRepo.owner, ownerRepo.repo, {
    state: options.state || 'open',
    perPage: options.limit || 10,
  });

  if (!result.success || !result.data) {
    ui.stopSpinnerFail('Failed to fetch issues');
    ui.error(result.error || 'Failed to fetch issues');
    return;
  }

  ui.stopSpinnerSuccess('Fetched issues');

  if (options.json) {
    console.log(JSON.stringify(result.data, null, 2));
    return;
  }

  if (result.data.length === 0) {
    ui.info('No issues found');
    return;
  }

  ui.header(`Issues - ${ownerRepo.owner}/${ownerRepo.repo}`);

  ui.table({
    columns: [
      { key: 'number', header: '#' },
      { key: 'title', header: 'Title' },
      { key: 'author', header: 'Author' },
      { key: 'state', header: 'State' },
      { key: 'comments', header: 'Comments' },
      { key: 'updated', header: 'Updated' },
    ],
    data: result.data.map((issue) => ({
      number: `#${issue.number}`,
      title: issue.title.substring(0, 40) + (issue.title.length > 40 ? '...' : ''),
      author: issue.user.login,
      state: issue.state === 'open'
        ? ui.color('open', 'green')
        : ui.color('closed', 'red'),
      comments: String(issue.comments),
      updated: formatDate(issue.updated_at),
    })),
  });
}

export interface IssueViewOptions extends GhCommandOptions {
  issueNumber: number;
}

/**
 * View a single issue
 */
export async function ghIssueViewCommand(options: IssueViewOptions): Promise<void> {
  const ownerRepo = await getOwnerRepo(options);
  if (!ownerRepo) return;

  ui.startSpinner({ message: `Fetching issue #${options.issueNumber}...` });

  const result = await githubClient.getIssue(ownerRepo.owner, ownerRepo.repo, options.issueNumber);

  if (!result.success || !result.data) {
    ui.stopSpinnerFail('Failed to fetch issue');
    ui.error(result.error || 'Failed to fetch issue');
    return;
  }

  ui.stopSpinnerSuccess('Fetched issue');

  const issue = result.data;

  if (options.json) {
    console.log(JSON.stringify(issue, null, 2));
    return;
  }

  ui.header(`Issue #${issue.number}: ${issue.title}`);
  ui.newLine();

  ui.info(`Author: ${issue.user.login}`);
  ui.info(`State: ${issue.state}`);
  ui.info(`Comments: ${issue.comments}`);
  ui.info(`Created: ${formatDate(issue.created_at)}`);
  ui.info(`Updated: ${formatDate(issue.updated_at)}`);

  if (issue.labels.length > 0) {
    ui.info(`Labels: ${issue.labels.map((l) => l.name).join(', ')}`);
  }

  if (issue.body) {
    ui.newLine();
    ui.box({ title: 'Description', content: issue.body });
  }
}

export interface IssueCreateOptions extends GhCommandOptions {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

/**
 * Create an issue
 */
export async function ghIssueCreateCommand(options: IssueCreateOptions): Promise<void> {
  const ownerRepo = await getOwnerRepo(options);
  if (!ownerRepo) return;

  ui.startSpinner({ message: 'Creating issue...' });

  const result = await githubClient.createIssue(ownerRepo.owner, ownerRepo.repo, {
    title: options.title,
    body: options.body,
    labels: options.labels,
    assignees: options.assignees,
  });

  if (!result.success || !result.data) {
    ui.stopSpinnerFail('Failed to create issue');
    ui.error(result.error || 'Failed to create issue');
    return;
  }

  ui.stopSpinnerSuccess('Created issue');
  ui.success(`Created issue #${result.data.number}: ${result.data.title}`);
}

export interface IssueCloseOptions extends GhCommandOptions {
  issueNumber: number;
}

/**
 * Close an issue
 */
export async function ghIssueCloseCommand(options: IssueCloseOptions): Promise<void> {
  const ownerRepo = await getOwnerRepo(options);
  if (!ownerRepo) return;

  ui.startSpinner({ message: `Closing issue #${options.issueNumber}...` });

  const result = await githubClient.closeIssue(ownerRepo.owner, ownerRepo.repo, options.issueNumber);

  if (!result.success || !result.data) {
    ui.stopSpinnerFail('Failed to close issue');
    ui.error(result.error || 'Failed to close issue');
    return;
  }

  ui.stopSpinnerSuccess('Closed issue');
  ui.success(`Closed issue #${options.issueNumber}`);
}

export interface IssueCommentOptions extends GhCommandOptions {
  issueNumber: number;
  body: string;
}

/**
 * Add a comment to an issue
 */
export async function ghIssueCommentCommand(options: IssueCommentOptions): Promise<void> {
  const ownerRepo = await getOwnerRepo(options);
  if (!ownerRepo) return;

  ui.startSpinner({ message: 'Adding comment...' });

  const result = await githubClient.addComment(
    ownerRepo.owner,
    ownerRepo.repo,
    options.issueNumber,
    options.body
  );

  if (!result.success || !result.data) {
    ui.stopSpinnerFail('Failed to add comment');
    ui.error(result.error || 'Failed to add comment');
    return;
  }

  ui.stopSpinnerSuccess('Added comment');
  ui.success('Comment added');
}

// ==========================================
// Repository Commands
// ==========================================

export interface RepoInfoOptions extends GhCommandOptions {}

/**
 * Get repository info
 */
export async function ghRepoInfoCommand(options: RepoInfoOptions = {}): Promise<void> {
  const ownerRepo = await getOwnerRepo(options);
  if (!ownerRepo) return;

  ui.startSpinner({ message: 'Fetching repository info...' });

  const result = await githubClient.getRepo(ownerRepo.owner, ownerRepo.repo);

  if (!result.success || !result.data) {
    ui.stopSpinnerFail('Failed to fetch repository info');
    ui.error(result.error || 'Failed to fetch repository info');
    return;
  }

  ui.stopSpinnerSuccess('Fetched repository info');

  const repo = result.data;

  if (options.json) {
    console.log(JSON.stringify(repo, null, 2));
    return;
  }

  ui.header(repo.full_name);
  ui.newLine();

  if (repo.description) {
    ui.info(repo.description);
    ui.newLine();
  }

  ui.info(`Visibility: ${repo.private ? 'Private' : 'Public'}`);
  ui.info(`Default Branch: ${repo.default_branch}`);
  if (repo.language) {
    ui.info(`Language: ${repo.language}`);
  }
  ui.info(`Stars: ${repo.stargazers_count}`);
  ui.info(`Forks: ${repo.forks_count}`);
  ui.info(`Open Issues: ${repo.open_issues_count}`);
}

export interface RepoBranchesOptions extends GhCommandOptions {
  limit?: number;
}

/**
 * List repository branches
 */
export async function ghRepoBranchesCommand(options: RepoBranchesOptions = {}): Promise<void> {
  const ownerRepo = await getOwnerRepo(options);
  if (!ownerRepo) return;

  ui.startSpinner({ message: 'Fetching branches...' });

  const result = await githubClient.listBranches(ownerRepo.owner, ownerRepo.repo, {
    perPage: options.limit || 20,
  });

  if (!result.success || !result.data) {
    ui.stopSpinnerFail('Failed to fetch branches');
    ui.error(result.error || 'Failed to fetch branches');
    return;
  }

  ui.stopSpinnerSuccess('Fetched branches');

  if (options.json) {
    console.log(JSON.stringify(result.data, null, 2));
    return;
  }

  if (result.data.length === 0) {
    ui.info('No branches found');
    return;
  }

  ui.header(`Branches - ${ownerRepo.owner}/${ownerRepo.repo}`);

  ui.table({
    columns: [
      { key: 'name', header: 'Name' },
      { key: 'sha', header: 'SHA' },
      { key: 'protected', header: 'Protected' },
    ],
    data: result.data.map((branch) => ({
      name: branch.name,
      sha: branch.commit.sha.substring(0, 7),
      protected: branch.protected ? ui.color('yes', 'yellow') : 'no',
    })),
  });
}

// ==========================================
// Main Router
// ==========================================

/**
 * Main gh command router
 */
export async function ghCommand(subcommand: string, args: string[]): Promise<void> {
  // Parse common options
  const options: GhCommandOptions = {};
  let cleanArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--owner' && args[i + 1]) {
      options.owner = args[++i];
    } else if (arg === '--repo' && args[i + 1]) {
      options.repo = args[++i];
    } else if (arg === '--json') {
      options.json = true;
    } else {
      cleanArgs.push(arg);
    }
  }

  // PR commands
  if (subcommand === 'pr') {
    const prSubcommand = cleanArgs[0];

    if (prSubcommand === 'list' || !prSubcommand) {
      const prOptions: PrListOptions = { ...options };
      for (let i = 1; i < cleanArgs.length; i++) {
        if (cleanArgs[i] === '--state' && cleanArgs[i + 1]) {
          prOptions.state = cleanArgs[++i] as 'open' | 'closed' | 'all';
        } else if ((cleanArgs[i] === '--limit' || cleanArgs[i] === '-n') && cleanArgs[i + 1]) {
          prOptions.limit = parseInt(cleanArgs[++i], 10);
        }
      }
      await ghPrListCommand(prOptions);
      return;
    }

    if (prSubcommand === 'view') {
      const prNumber = parseInt(cleanArgs[1], 10);
      if (isNaN(prNumber)) {
        ui.error('Usage: nimbus gh pr view <number>');
        return;
      }
      await ghPrViewCommand({ ...options, prNumber });
      return;
    }

    if (prSubcommand === 'create') {
      const prOptions: PrCreateOptions = { ...options, title: '' };
      for (let i = 1; i < cleanArgs.length; i++) {
        if ((cleanArgs[i] === '--title' || cleanArgs[i] === '-t') && cleanArgs[i + 1]) {
          prOptions.title = cleanArgs[++i];
        } else if ((cleanArgs[i] === '--body' || cleanArgs[i] === '-b') && cleanArgs[i + 1]) {
          prOptions.body = cleanArgs[++i];
        } else if (cleanArgs[i] === '--head' && cleanArgs[i + 1]) {
          prOptions.head = cleanArgs[++i];
        } else if (cleanArgs[i] === '--base' && cleanArgs[i + 1]) {
          prOptions.base = cleanArgs[++i];
        } else if (cleanArgs[i] === '--draft') {
          prOptions.draft = true;
        }
      }
      if (!prOptions.title) {
        ui.error('Usage: nimbus gh pr create --title "PR Title" [--body "Description"] [--draft]');
        return;
      }
      await ghPrCreateCommand(prOptions);
      return;
    }

    if (prSubcommand === 'merge') {
      const prNumber = parseInt(cleanArgs[1], 10);
      if (isNaN(prNumber)) {
        ui.error('Usage: nimbus gh pr merge <number> [--method squash|merge|rebase]');
        return;
      }
      const mergeOptions: PrMergeOptions = { ...options, prNumber };
      for (let i = 2; i < cleanArgs.length; i++) {
        if (cleanArgs[i] === '--method' && cleanArgs[i + 1]) {
          mergeOptions.method = cleanArgs[++i] as 'merge' | 'squash' | 'rebase';
        }
      }
      await ghPrMergeCommand(mergeOptions);
      return;
    }

    if (prSubcommand === 'review') {
      const prNumber = parseInt(cleanArgs[1], 10);
      if (isNaN(prNumber)) {
        ui.error('Usage: nimbus gh pr review <number> --event APPROVE|REQUEST_CHANGES|COMMENT [--body "..."]');
        return;
      }
      const reviewOptions: PrReviewOptions = { ...options, prNumber, event: 'COMMENT' };
      for (let i = 2; i < cleanArgs.length; i++) {
        if (cleanArgs[i] === '--event' && cleanArgs[i + 1]) {
          reviewOptions.event = cleanArgs[++i] as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
        } else if ((cleanArgs[i] === '--body' || cleanArgs[i] === '-b') && cleanArgs[i + 1]) {
          reviewOptions.body = cleanArgs[++i];
        }
      }
      await ghPrReviewCommand(reviewOptions);
      return;
    }

    ui.error(`Unknown pr subcommand: ${prSubcommand}`);
    return;
  }

  // Issue commands
  if (subcommand === 'issue') {
    const issueSubcommand = cleanArgs[0];

    if (issueSubcommand === 'list' || !issueSubcommand) {
      const issueOptions: IssueListOptions = { ...options };
      for (let i = 1; i < cleanArgs.length; i++) {
        if (cleanArgs[i] === '--state' && cleanArgs[i + 1]) {
          issueOptions.state = cleanArgs[++i] as 'open' | 'closed' | 'all';
        } else if ((cleanArgs[i] === '--limit' || cleanArgs[i] === '-n') && cleanArgs[i + 1]) {
          issueOptions.limit = parseInt(cleanArgs[++i], 10);
        }
      }
      await ghIssueListCommand(issueOptions);
      return;
    }

    if (issueSubcommand === 'view') {
      const issueNumber = parseInt(cleanArgs[1], 10);
      if (isNaN(issueNumber)) {
        ui.error('Usage: nimbus gh issue view <number>');
        return;
      }
      await ghIssueViewCommand({ ...options, issueNumber });
      return;
    }

    if (issueSubcommand === 'create') {
      const issueOptions: IssueCreateOptions = { ...options, title: '' };
      for (let i = 1; i < cleanArgs.length; i++) {
        if ((cleanArgs[i] === '--title' || cleanArgs[i] === '-t') && cleanArgs[i + 1]) {
          issueOptions.title = cleanArgs[++i];
        } else if ((cleanArgs[i] === '--body' || cleanArgs[i] === '-b') && cleanArgs[i + 1]) {
          issueOptions.body = cleanArgs[++i];
        } else if (cleanArgs[i] === '--label' && cleanArgs[i + 1]) {
          issueOptions.labels = issueOptions.labels || [];
          issueOptions.labels.push(cleanArgs[++i]);
        } else if (cleanArgs[i] === '--assignee' && cleanArgs[i + 1]) {
          issueOptions.assignees = issueOptions.assignees || [];
          issueOptions.assignees.push(cleanArgs[++i]);
        }
      }
      if (!issueOptions.title) {
        ui.error('Usage: nimbus gh issue create --title "Issue Title" [--body "Description"]');
        return;
      }
      await ghIssueCreateCommand(issueOptions);
      return;
    }

    if (issueSubcommand === 'close') {
      const issueNumber = parseInt(cleanArgs[1], 10);
      if (isNaN(issueNumber)) {
        ui.error('Usage: nimbus gh issue close <number>');
        return;
      }
      await ghIssueCloseCommand({ ...options, issueNumber });
      return;
    }

    if (issueSubcommand === 'comment') {
      const issueNumber = parseInt(cleanArgs[1], 10);
      let body = '';
      for (let i = 2; i < cleanArgs.length; i++) {
        if ((cleanArgs[i] === '--body' || cleanArgs[i] === '-b') && cleanArgs[i + 1]) {
          body = cleanArgs[++i];
        }
      }
      if (isNaN(issueNumber) || !body) {
        ui.error('Usage: nimbus gh issue comment <number> --body "Comment text"');
        return;
      }
      await ghIssueCommentCommand({ ...options, issueNumber, body });
      return;
    }

    ui.error(`Unknown issue subcommand: ${issueSubcommand}`);
    return;
  }

  // Repo commands
  if (subcommand === 'repo') {
    const repoSubcommand = cleanArgs[0];

    if (repoSubcommand === 'info' || !repoSubcommand) {
      await ghRepoInfoCommand(options);
      return;
    }

    if (repoSubcommand === 'branches') {
      const branchOptions: RepoBranchesOptions = { ...options };
      for (let i = 1; i < cleanArgs.length; i++) {
        if ((cleanArgs[i] === '--limit' || cleanArgs[i] === '-n') && cleanArgs[i + 1]) {
          branchOptions.limit = parseInt(cleanArgs[++i], 10);
        }
      }
      await ghRepoBranchesCommand(branchOptions);
      return;
    }

    ui.error(`Unknown repo subcommand: ${repoSubcommand}`);
    return;
  }

  ui.error(`Unknown gh subcommand: ${subcommand}`);
  console.log('');
  console.log('Available subcommands:');
  console.log('  pr list             - List pull requests');
  console.log('  pr view <number>    - View a pull request');
  console.log('  pr create           - Create a pull request');
  console.log('  pr merge <number>   - Merge a pull request');
  console.log('  pr review <number>  - Review a pull request');
  console.log('  issue list          - List issues');
  console.log('  issue view <number> - View an issue');
  console.log('  issue create        - Create an issue');
  console.log('  issue close <number> - Close an issue');
  console.log('  issue comment <n>   - Add a comment');
  console.log('  repo info           - Show repository info');
  console.log('  repo branches       - List branches');
}
