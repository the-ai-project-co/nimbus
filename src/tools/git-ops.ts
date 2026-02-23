/**
 * Git Operations — Embedded tool (stripped HTTP wrappers)
 *
 * Copied from services/git-tools-service/src/git/operations.ts
 * Provides direct git operations for the embedded CLI binary.
 */

import simpleGit, { SimpleGit, SimpleGitOptions, StatusResult, LogResult, DiffResult } from 'simple-git';
import { logger } from '../utils';

export interface GitCloneOptions {
  url: string;
  path: string;
  branch?: string;
  depth?: number;
}

export interface GitCommitOptions {
  message: string;
  amend?: boolean;
  allowEmpty?: boolean;
}

export interface GitPushOptions {
  remote?: string;
  branch?: string;
  force?: boolean;
  setUpstream?: boolean;
}

export interface GitPullOptions {
  remote?: string;
  branch?: string;
  rebase?: boolean;
}

export interface GitBranchOptions {
  name: string;
  checkout?: boolean;
  startPoint?: string;
}

export interface GitMergeOptions {
  branch: string;
  noFf?: boolean;
  squash?: boolean;
  message?: string;
}

export interface GitLogOptions {
  maxCount?: number;
  from?: string;
  to?: string;
  file?: string;
}

export interface GitDiffOptions {
  cached?: boolean;
  nameOnly?: boolean;
  from?: string;
  to?: string;
}

export interface GitStashOptions {
  command: 'push' | 'pop' | 'list' | 'drop' | 'apply' | 'clear';
  message?: string;
  index?: number;
}

export interface CherryPickOptions {
  noCommit?: boolean;
  edit?: boolean;
  signoff?: boolean;
  strategy?: string;
}

export interface RebaseOptions {
  interactive?: boolean;
  onto?: string;
  preserveMerges?: boolean;
  strategy?: string;
  strategyOption?: string;
}

export interface TagOptions {
  message?: string;
  annotated?: boolean;
  force?: boolean;
  commit?: string;
}

export class GitOperations {
  private git: SimpleGit;
  private repoPath: string;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
    const options: Partial<SimpleGitOptions> = {
      baseDir: repoPath,
      binary: 'git',
      maxConcurrentProcesses: 6,
      trimmed: true,
    };
    this.git = simpleGit(options);
  }

  /**
   * Clone a repository
   */
  async clone(options: GitCloneOptions): Promise<{ success: boolean; path: string }> {
    logger.info(`Cloning repository from ${options.url} to ${options.path}`);

    const cloneOptions: string[] = [];
    if (options.branch) {
      cloneOptions.push('--branch', options.branch);
    }
    if (options.depth) {
      cloneOptions.push('--depth', options.depth.toString());
    }

    await simpleGit().clone(options.url, options.path, cloneOptions);

    return { success: true, path: options.path };
  }

  /**
   * Get repository status
   */
  async status(): Promise<StatusResult> {
    logger.info(`Getting git status for ${this.repoPath}`);
    return await this.git.status();
  }

  /**
   * Add files to staging
   */
  async add(files: string | string[] = '.'): Promise<{ success: boolean; files: string[] }> {
    const fileList = Array.isArray(files) ? files : [files];
    logger.info(`Staging files: ${fileList.join(', ')}`);

    await this.git.add(fileList);

    return { success: true, files: fileList };
  }

  /**
   * Commit staged changes
   */
  async commit(options: GitCommitOptions): Promise<{ success: boolean; hash: string; summary: string }> {
    logger.info(`Committing with message: ${options.message}`);

    const commitOptions: string[] = [];
    if (options.amend) {
      commitOptions.push('--amend');
    }
    if (options.allowEmpty) {
      commitOptions.push('--allow-empty');
    }

    const result = await this.git.commit(options.message, undefined, { '--': commitOptions });

    return {
      success: true,
      hash: result.commit,
      summary: result.summary ? `${result.summary.changes} changes, ${result.summary.insertions} insertions, ${result.summary.deletions} deletions` : 'Committed'
    };
  }

  /**
   * Push to remote
   */
  async push(options: GitPushOptions = {}): Promise<{ success: boolean; remote: string; branch: string }> {
    const remote = options.remote || 'origin';
    logger.info(`Pushing to ${remote}${options.branch ? `/${options.branch}` : ''}`);

    const pushOptions: string[] = [];
    if (options.force) {
      pushOptions.push('--force');
    }
    if (options.setUpstream) {
      pushOptions.push('--set-upstream');
    }

    await this.git.push(remote, options.branch, pushOptions);

    return { success: true, remote, branch: options.branch || 'current' };
  }

  /**
   * Pull from remote
   */
  async pull(options: GitPullOptions = {}): Promise<{ success: boolean; summary: string }> {
    const remote = options.remote || 'origin';
    logger.info(`Pulling from ${remote}${options.branch ? `/${options.branch}` : ''}`);

    const pullOptions: Record<string, string | null> = {};
    if (options.rebase) {
      pullOptions['--rebase'] = null;
    }

    const result = await this.git.pull(remote, options.branch, pullOptions);

    return {
      success: true,
      summary: result.summary ? `${result.summary.changes} changes, ${result.summary.insertions} insertions, ${result.summary.deletions} deletions` : 'Already up to date'
    };
  }

  /**
   * Create a new branch
   */
  async createBranch(options: GitBranchOptions): Promise<{ success: boolean; branch: string }> {
    logger.info(`Creating branch: ${options.name}`);

    if (options.checkout) {
      if (options.startPoint) {
        await this.git.checkoutBranch(options.name, options.startPoint);
      } else {
        await this.git.checkoutLocalBranch(options.name);
      }
    } else {
      await this.git.branch([options.name, options.startPoint || 'HEAD']);
    }

    return { success: true, branch: options.name };
  }

  /**
   * List branches
   */
  async listBranches(showRemote: boolean = false): Promise<{ current: string; branches: string[] }> {
    logger.info('Listing branches');

    const result = await this.git.branch(showRemote ? ['-a'] : []);

    return {
      current: result.current,
      branches: result.all
    };
  }

  /**
   * Checkout a branch or commit
   */
  async checkout(target: string, create: boolean = false): Promise<{ success: boolean; target: string }> {
    logger.info(`Checking out: ${target}`);

    if (create) {
      await this.git.checkoutLocalBranch(target);
    } else {
      await this.git.checkout(target);
    }

    return { success: true, target };
  }

  /**
   * Get diff
   */
  async diff(options: GitDiffOptions = {}): Promise<{ diff: string; files: string[] }> {
    logger.info('Getting diff');

    const diffArgs: string[] = [];
    if (options.cached) {
      diffArgs.push('--cached');
    }
    if (options.nameOnly) {
      diffArgs.push('--name-only');
    }
    if (options.from) {
      diffArgs.push(options.from);
    }
    if (options.to) {
      diffArgs.push(options.to);
    }

    const diff = await this.git.diff(diffArgs);
    const files = options.nameOnly ? diff.split('\n').filter(f => f) : [];

    return { diff, files };
  }

  /**
   * Get commit log
   */
  async log(options: GitLogOptions = {}): Promise<LogResult> {
    logger.info('Getting commit log');

    const logOptions: any = {};
    if (options.maxCount) {
      logOptions.maxCount = options.maxCount;
    }
    if (options.from) {
      logOptions.from = options.from;
    }
    if (options.to) {
      logOptions.to = options.to;
    }
    if (options.file) {
      logOptions.file = options.file;
    }

    return await this.git.log(logOptions);
  }

  /**
   * Merge a branch
   */
  async merge(options: GitMergeOptions): Promise<{ success: boolean; result: string }> {
    logger.info(`Merging branch: ${options.branch}`);

    const mergeArgs: string[] = [options.branch];
    if (options.noFf) {
      mergeArgs.unshift('--no-ff');
    }
    if (options.squash) {
      mergeArgs.unshift('--squash');
    }
    if (options.message) {
      mergeArgs.unshift('-m', options.message);
    }

    const result = await this.git.merge(mergeArgs);

    return {
      success: true,
      result: result.result || 'Merged successfully'
    };
  }

  /**
   * Stash operations
   */
  async stash(options: GitStashOptions): Promise<{ success: boolean; result: string }> {
    logger.info(`Stash operation: ${options.command}`);

    let result: string;

    switch (options.command) {
      case 'push':
        const pushArgs = options.message ? ['-m', options.message] : [];
        result = await this.git.stash(['push', ...pushArgs]);
        break;
      case 'pop':
        result = await this.git.stash(['pop', ...(options.index !== undefined ? [options.index.toString()] : [])]);
        break;
      case 'apply':
        result = await this.git.stash(['apply', ...(options.index !== undefined ? [options.index.toString()] : [])]);
        break;
      case 'drop':
        result = await this.git.stash(['drop', ...(options.index !== undefined ? [options.index.toString()] : [])]);
        break;
      case 'list':
        result = await this.git.stash(['list']);
        break;
      case 'clear':
        result = await this.git.stash(['clear']);
        break;
      default:
        throw new Error(`Unknown stash command: ${options.command}`);
    }

    return { success: true, result: result || 'Stash operation completed' };
  }

  /**
   * Get current branch name
   */
  async currentBranch(): Promise<string> {
    const result = await this.git.revparse(['--abbrev-ref', 'HEAD']);
    return result.trim();
  }

  /**
   * Check if repository is clean
   */
  async isClean(): Promise<boolean> {
    const status = await this.status();
    return status.isClean();
  }

  /**
   * Reset to a commit
   */
  async reset(target: string, mode: 'soft' | 'mixed' | 'hard' = 'mixed'): Promise<{ success: boolean }> {
    logger.info(`Resetting to ${target} with mode ${mode}`);
    await this.git.reset([`--${mode}`, target]);
    return { success: true };
  }

  /**
   * Fetch from remote
   */
  async fetch(remote: string = 'origin', prune: boolean = false): Promise<{ success: boolean }> {
    logger.info(`Fetching from ${remote}`);
    if (prune) {
      await this.git.fetch(remote, ['--prune']);
    } else {
      await this.git.fetch(remote);
    }
    return { success: true };
  }

  /**
   * Get remote URL
   */
  async getRemoteUrl(remote: string = 'origin'): Promise<string | null> {
    try {
      const remotes = await this.git.getRemotes(true);
      const targetRemote = remotes.find(r => r.name === remote);
      return targetRemote?.refs?.fetch || null;
    } catch {
      return null;
    }
  }

  /**
   * Check if path is a git repository
   */
  async isRepo(): Promise<boolean> {
    return await this.git.checkIsRepo();
  }

  /**
   * Initialize a new repository
   */
  async init(bare: boolean = false): Promise<{ success: boolean }> {
    logger.info(`Initializing git repository in ${this.repoPath}`);
    await this.git.init(bare);
    return { success: true };
  }

  /**
   * Cherry-pick a commit
   */
  async cherryPick(commit: string, options: CherryPickOptions = {}): Promise<{ success: boolean; result: string }> {
    logger.info(`Cherry-picking commit: ${commit}`);

    const cherryPickArgs: string[] = [commit];

    if (options.noCommit) {
      cherryPickArgs.unshift('--no-commit');
    }

    if (options.edit) {
      cherryPickArgs.unshift('-e');
    }

    if (options.signoff) {
      cherryPickArgs.unshift('-s');
    }

    if (options.strategy) {
      cherryPickArgs.unshift('-X', options.strategy);
    }

    // Use raw to execute cherry-pick
    const result = await this.git.raw(['cherry-pick', ...cherryPickArgs]);

    return {
      success: true,
      result: result || 'Cherry-pick completed successfully',
    };
  }

  /**
   * Rebase onto a target branch
   */
  async rebase(target: string, options: RebaseOptions = {}): Promise<{ success: boolean; result: string }> {
    logger.info(`Rebasing onto: ${target}`);

    const rebaseArgs: string[] = [];

    if (options.interactive) {
      // Note: Interactive rebase requires a terminal, so we skip it in automation
      logger.warn('Interactive rebase not supported in automation mode');
    }

    if (options.onto) {
      rebaseArgs.push('--onto', options.onto);
    }

    if (options.preserveMerges) {
      rebaseArgs.push('--preserve-merges');
    }

    if (options.strategy) {
      rebaseArgs.push('-s', options.strategy);
    }

    if (options.strategyOption) {
      rebaseArgs.push('-X', options.strategyOption);
    }

    rebaseArgs.push(target);

    const result = await this.git.rebase(rebaseArgs);

    return {
      success: true,
      result: result || 'Rebase completed successfully',
    };
  }

  /**
   * Continue a rebase after resolving conflicts
   */
  async rebaseContinue(): Promise<{ success: boolean; result: string }> {
    logger.info('Continuing rebase');
    const result = await this.git.rebase(['--continue']);
    return {
      success: true,
      result: result || 'Rebase continued successfully',
    };
  }

  /**
   * Abort a rebase in progress
   */
  async rebaseAbort(): Promise<{ success: boolean }> {
    logger.info('Aborting rebase');
    await this.git.rebase(['--abort']);
    return { success: true };
  }

  /**
   * Skip a commit during rebase
   */
  async rebaseSkip(): Promise<{ success: boolean; result: string }> {
    logger.info('Skipping commit during rebase');
    const result = await this.git.rebase(['--skip']);
    return {
      success: true,
      result: result || 'Commit skipped',
    };
  }

  /**
   * Create a tag
   */
  async tag(name: string, options: TagOptions = {}): Promise<{ success: boolean; tag: string }> {
    logger.info(`Creating tag: ${name}`);

    const tagArgs: string[] = [];

    if (options.annotated || options.message) {
      tagArgs.push('-a');
    }

    if (options.message) {
      tagArgs.push('-m', options.message);
    }

    if (options.force) {
      tagArgs.push('-f');
    }

    tagArgs.push(name);

    if (options.commit) {
      tagArgs.push(options.commit);
    }

    await this.git.tag(tagArgs);

    return { success: true, tag: name };
  }

  /**
   * Delete a tag
   */
  async deleteTag(name: string, remote?: string): Promise<{ success: boolean }> {
    logger.info(`Deleting tag: ${name}`);

    // Delete locally
    await this.git.tag(['-d', name]);

    // Delete from remote if specified
    if (remote) {
      await this.git.push(remote, `:refs/tags/${name}`);
    }

    return { success: true };
  }

  /**
   * List tags
   */
  async listTags(pattern?: string): Promise<string[]> {
    logger.info('Listing tags');

    const args = pattern ? ['-l', pattern] : [];
    const result = await this.git.tags(args);

    return result.all;
  }

  /**
   * Push tags to remote
   */
  async pushTags(remote: string = 'origin', tagName?: string): Promise<{ success: boolean }> {
    logger.info(`Pushing tags to ${remote}`);

    if (tagName) {
      await this.git.push(remote, 'refs/tags/' + tagName);
    } else {
      await this.git.pushTags(remote);
    }

    return { success: true };
  }

  /**
   * Show information about a tag
   */
  async showTag(name: string): Promise<{ success: boolean; info: string }> {
    logger.info(`Showing tag: ${name}`);

    const result = await this.git.show(['--no-patch', name]);

    return { success: true, info: result };
  }

  /**
   * Check if there are conflicts
   */
  async hasConflicts(): Promise<boolean> {
    const status = await this.status();
    return status.conflicted.length > 0;
  }

  /**
   * Get list of conflicted files
   */
  async getConflicts(): Promise<string[]> {
    const status = await this.status();
    return status.conflicted;
  }

  /**
   * Abort cherry-pick in progress
   */
  async cherryPickAbort(): Promise<{ success: boolean }> {
    logger.info('Aborting cherry-pick');
    await this.git.raw(['cherry-pick', '--abort']);
    return { success: true };
  }

  /**
   * Continue cherry-pick after resolving conflicts
   */
  async cherryPickContinue(): Promise<{ success: boolean; result: string }> {
    logger.info('Continuing cherry-pick');
    const result = await this.git.raw(['cherry-pick', '--continue']);
    return {
      success: true,
      result: result || 'Cherry-pick continued',
    };
  }

  /**
   * Show a specific commit
   */
  async showCommit(commit: string): Promise<string> {
    logger.info(`Showing commit: ${commit}`);
    return await this.git.show([commit]);
  }

  /**
   * Get the short hash for a ref
   */
  async getShortHash(ref: string = 'HEAD'): Promise<string> {
    const result = await this.git.revparse(['--short', ref]);
    return result.trim();
  }

  /**
   * Get the full hash for a ref
   */
  async getFullHash(ref: string = 'HEAD'): Promise<string> {
    const result = await this.git.revparse([ref]);
    return result.trim();
  }

  /**
   * Get the commit count between two refs
   */
  async getCommitCount(from: string, to: string = 'HEAD'): Promise<number> {
    const result = await this.git.raw(['rev-list', '--count', `${from}..${to}`]);
    return parseInt(result.trim(), 10);
  }

  /**
   * Revert a commit
   */
  async revert(commit: string, options: { noCommit?: boolean; noEdit?: boolean } = {}): Promise<{ success: boolean; result: string }> {
    logger.info(`Reverting commit: ${commit}`);

    const revertArgs: string[] = [];

    if (options.noCommit) {
      revertArgs.push('--no-commit');
    }

    if (options.noEdit) {
      revertArgs.push('--no-edit');
    }

    revertArgs.push(commit);

    const result = await this.git.raw(['revert', ...revertArgs]);

    return {
      success: true,
      result: result || 'Revert completed successfully',
    };
  }

  /**
   * Blame a file
   */
  async blame(file: string, options?: { startLine?: number; endLine?: number }): Promise<string> {
    logger.info(`Getting blame for: ${file}`);

    const args = [];
    if (options?.startLine && options?.endLine) {
      args.push(`-L${options.startLine},${options.endLine}`);
    }
    args.push(file);

    return await this.git.raw(['blame', ...args]);
  }
}
