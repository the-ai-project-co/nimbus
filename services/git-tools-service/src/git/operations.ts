import simpleGit, { SimpleGit, SimpleGitOptions, StatusResult, LogResult, DiffResult } from 'simple-git';
import { logger } from '@nimbus/shared-utils';

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
}
