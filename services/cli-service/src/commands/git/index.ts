/**
 * Git Commands
 *
 * CLI commands for Git operations
 */

import { gitClient } from '../../clients';
import { ui } from '../../wizard/ui';

export interface GitCommandOptions {
  directory?: string;
  all?: boolean;
  amend?: boolean;
  remote?: string;
  branch?: string;
  force?: boolean;
  setUpstream?: boolean;
  rebase?: boolean;
  prune?: boolean;
  limit?: number;
  staged?: boolean;
  file?: string;
  create?: boolean;
}

/**
 * Show git status
 */
export async function gitStatusCommand(options: GitCommandOptions = {}): Promise<void> {
  ui.header('Git Status');

  ui.startSpinner({ message: 'Getting git status...' });

  try {
    const available = await gitClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Git Tools Service not available');
      ui.error('Please ensure the Git Tools Service is running.');
      return;
    }

    const result = await gitClient.status(options.directory);

    if (result.success) {
      ui.stopSpinnerSuccess(`On branch ${result.status.branch}`);

      if (result.status.ahead > 0 || result.status.behind > 0) {
        ui.info(
          `Your branch is ${result.status.ahead} commit(s) ahead, ${result.status.behind} commit(s) behind`
        );
      }

      if (result.status.staged.length > 0) {
        ui.success('Changes to be committed:');
        result.status.staged.forEach((f) => ui.info(`  ${f}`));
      }

      if (result.status.modified.length > 0) {
        ui.warning('Changes not staged for commit:');
        result.status.modified.forEach((f) => ui.info(`  modified: ${f}`));
      }

      if (result.status.untracked.length > 0) {
        ui.info('Untracked files:');
        result.status.untracked.forEach((f) => ui.info(`  ${f}`));
      }

      if (result.status.deleted.length > 0) {
        ui.error('Deleted files:');
        result.status.deleted.forEach((f) => ui.info(`  deleted: ${f}`));
      }

      if (
        result.status.staged.length === 0 &&
        result.status.modified.length === 0 &&
        result.status.untracked.length === 0 &&
        result.status.deleted.length === 0
      ) {
        ui.success('Working tree clean');
      }
    } else {
      ui.stopSpinnerFail('Failed to get status');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error getting git status');
    ui.error(error.message);
  }
}

/**
 * Stage files
 */
export async function gitAddCommand(
  files: string[],
  options: GitCommandOptions = {}
): Promise<void> {
  ui.header('Git Add');

  if (options.all) {
    ui.info('Staging all changes');
  } else {
    ui.info(`Staging: ${files.join(', ')}`);
  }

  ui.startSpinner({ message: 'Staging files...' });

  try {
    const available = await gitClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Git Tools Service not available');
      ui.error('Please ensure the Git Tools Service is running.');
      return;
    }

    const result = await gitClient.add(files, {
      directory: options.directory,
      all: options.all,
    });

    if (result.success) {
      ui.stopSpinnerSuccess('Files staged');
      if (result.output) {
        ui.info(result.output);
      }
    } else {
      ui.stopSpinnerFail('Failed to stage files');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error staging files');
    ui.error(error.message);
  }
}

/**
 * Create a commit
 */
export async function gitCommitCommand(
  message: string,
  options: GitCommandOptions = {}
): Promise<void> {
  ui.header('Git Commit');

  if (options.amend) {
    ui.info('Amending previous commit');
  }
  if (options.all) {
    ui.info('Committing all changes');
  }

  ui.startSpinner({ message: 'Creating commit...' });

  try {
    const available = await gitClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Git Tools Service not available');
      ui.error('Please ensure the Git Tools Service is running.');
      return;
    }

    const result = await gitClient.commit(message, {
      directory: options.directory,
      all: options.all,
      amend: options.amend,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Committed ${result.commit.shortHash}`);
      ui.info(`Author: ${result.commit.author}`);
      ui.info(`Message: ${result.commit.message}`);
    } else {
      ui.stopSpinnerFail('Failed to create commit');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error creating commit');
    ui.error(error.message);
  }
}

/**
 * Push to remote
 */
export async function gitPushCommand(options: GitCommandOptions = {}): Promise<void> {
  ui.header('Git Push');

  const remote = options.remote || 'origin';
  ui.info(`Remote: ${remote}`);
  if (options.branch) {
    ui.info(`Branch: ${options.branch}`);
  }
  if (options.force) {
    ui.warning('Force push enabled');
  }
  if (options.setUpstream) {
    ui.info('Setting upstream');
  }

  ui.startSpinner({ message: 'Pushing to remote...' });

  try {
    const available = await gitClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Git Tools Service not available');
      ui.error('Please ensure the Git Tools Service is running.');
      return;
    }

    const result = await gitClient.push({
      directory: options.directory,
      remote: options.remote,
      branch: options.branch,
      force: options.force,
      setUpstream: options.setUpstream,
    });

    if (result.success) {
      ui.stopSpinnerSuccess('Pushed to remote');
      if (result.output) {
        ui.info(result.output);
      }
    } else {
      ui.stopSpinnerFail('Failed to push');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error pushing to remote');
    ui.error(error.message);
  }
}

/**
 * Pull from remote
 */
export async function gitPullCommand(options: GitCommandOptions = {}): Promise<void> {
  ui.header('Git Pull');

  const remote = options.remote || 'origin';
  ui.info(`Remote: ${remote}`);
  if (options.branch) {
    ui.info(`Branch: ${options.branch}`);
  }
  if (options.rebase) {
    ui.info('Rebasing enabled');
  }

  ui.startSpinner({ message: 'Pulling from remote...' });

  try {
    const available = await gitClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Git Tools Service not available');
      ui.error('Please ensure the Git Tools Service is running.');
      return;
    }

    const result = await gitClient.pull({
      directory: options.directory,
      remote: options.remote,
      branch: options.branch,
      rebase: options.rebase,
    });

    if (result.success) {
      ui.stopSpinnerSuccess('Pulled from remote');
      if (result.output) {
        ui.info(result.output);
      }
    } else {
      ui.stopSpinnerFail('Failed to pull');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error pulling from remote');
    ui.error(error.message);
  }
}

/**
 * Fetch from remote
 */
export async function gitFetchCommand(options: GitCommandOptions = {}): Promise<void> {
  ui.header('Git Fetch');

  if (options.all) {
    ui.info('Fetching from all remotes');
  } else {
    const remote = options.remote || 'origin';
    ui.info(`Remote: ${remote}`);
  }
  if (options.prune) {
    ui.info('Pruning remote-tracking branches');
  }

  ui.startSpinner({ message: 'Fetching from remote...' });

  try {
    const available = await gitClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Git Tools Service not available');
      ui.error('Please ensure the Git Tools Service is running.');
      return;
    }

    const result = await gitClient.fetch({
      directory: options.directory,
      remote: options.remote,
      all: options.all,
      prune: options.prune,
    });

    if (result.success) {
      ui.stopSpinnerSuccess('Fetched from remote');
      if (result.output) {
        ui.info(result.output);
      }
    } else {
      ui.stopSpinnerFail('Failed to fetch');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error fetching from remote');
    ui.error(error.message);
  }
}

/**
 * Show commit log
 */
export async function gitLogCommand(options: GitCommandOptions = {}): Promise<void> {
  ui.header('Git Log');

  const limit = options.limit || 10;

  ui.startSpinner({ message: 'Fetching commit log...' });

  try {
    const available = await gitClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Git Tools Service not available');
      ui.error('Please ensure the Git Tools Service is running.');
      return;
    }

    const result = await gitClient.log({
      directory: options.directory,
      limit,
      branch: options.branch,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Found ${result.commits.length} commits`);

      if (result.commits.length > 0) {
        ui.table({
          columns: [
            { key: 'hash', header: 'Hash' },
            { key: 'author', header: 'Author' },
            { key: 'date', header: 'Date' },
            { key: 'message', header: 'Message' },
          ],
          data: result.commits.map((commit) => ({
            hash: commit.shortHash,
            author: commit.author,
            date: commit.date,
            message: commit.message.substring(0, 50) + (commit.message.length > 50 ? '...' : ''),
          })),
        });
      }
    } else {
      ui.stopSpinnerFail('Failed to get log');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error getting git log');
    ui.error(error.message);
  }
}

/**
 * List branches
 */
export async function gitBranchCommand(options: GitCommandOptions = {}): Promise<void> {
  ui.header('Git Branches');

  ui.startSpinner({ message: 'Fetching branches...' });

  try {
    const available = await gitClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Git Tools Service not available');
      ui.error('Please ensure the Git Tools Service is running.');
      return;
    }

    const result = await gitClient.branches({
      directory: options.directory,
      all: options.all,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Found ${result.branches.length} branches`);

      if (result.branches.length > 0) {
        result.branches.forEach((branch) => {
          const prefix = branch.current ? '* ' : '  ';
          const tracking = branch.tracking ? ` -> ${branch.tracking}` : '';
          ui.info(`${prefix}${branch.name}${tracking}`);
        });
      }
    } else {
      ui.stopSpinnerFail('Failed to list branches');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error listing branches');
    ui.error(error.message);
  }
}

/**
 * Checkout branch or file
 */
export async function gitCheckoutCommand(
  target: string,
  options: GitCommandOptions = {}
): Promise<void> {
  ui.header('Git Checkout');

  ui.info(`Target: ${target}`);
  if (options.create) {
    ui.info('Creating new branch');
  }

  ui.startSpinner({ message: `Checking out ${target}...` });

  try {
    const available = await gitClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Git Tools Service not available');
      ui.error('Please ensure the Git Tools Service is running.');
      return;
    }

    const result = await gitClient.checkout(target, {
      directory: options.directory,
      create: options.create,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Checked out ${target}`);
      if (result.output) {
        ui.info(result.output);
      }
    } else {
      ui.stopSpinnerFail(`Failed to checkout ${target}`);
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail(`Error checking out ${target}`);
    ui.error(error.message);
  }
}

/**
 * Show diff
 */
export async function gitDiffCommand(options: GitCommandOptions = {}): Promise<void> {
  ui.header('Git Diff');

  if (options.staged) {
    ui.info('Showing staged changes');
  }
  if (options.file) {
    ui.info(`File: ${options.file}`);
  }

  ui.startSpinner({ message: 'Getting diff...' });

  try {
    const available = await gitClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Git Tools Service not available');
      ui.error('Please ensure the Git Tools Service is running.');
      return;
    }

    const result = await gitClient.diff({
      directory: options.directory,
      staged: options.staged,
      file: options.file,
    });

    if (result.success) {
      ui.stopSpinnerSuccess('Diff retrieved');
      if (result.diff) {
        // Display diff as raw text - sideBySideDiff requires original/modified strings
        console.log(result.diff);
      } else {
        ui.info('No changes');
      }
    } else {
      ui.stopSpinnerFail('Failed to get diff');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error getting diff');
    ui.error(error.message);
  }
}

/**
 * Merge a branch
 */
export async function gitMergeCommand(
  branch: string,
  options: GitCommandOptions = {}
): Promise<void> {
  ui.header('Git Merge');

  ui.info(`Merging branch: ${branch}`);

  ui.startSpinner({ message: `Merging ${branch}...` });

  try {
    const available = await gitClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Git Tools Service not available');
      ui.error('Please ensure the Git Tools Service is running.');
      return;
    }

    const result = await gitClient.merge(branch, {
      directory: options.directory,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Merged ${branch}`);
      if (result.output) {
        ui.info(result.output);
      }
    } else {
      ui.stopSpinnerFail(`Failed to merge ${branch}`);
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail(`Error merging ${branch}`);
    ui.error(error.message);
  }
}

/**
 * Stash operations
 */
export async function gitStashCommand(
  stashAction: 'push' | 'pop' | 'list' | 'drop' | 'apply' | 'clear',
  options: GitCommandOptions & { message?: string; index?: number } = {}
): Promise<void> {
  ui.header(`Git Stash ${stashAction}`);

  if (options.message) {
    ui.info(`Message: ${options.message}`);
  }

  ui.startSpinner({ message: `Running stash ${stashAction}...` });

  try {
    const available = await gitClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Git Tools Service not available');
      ui.error('Please ensure the Git Tools Service is running.');
      return;
    }

    const result = await gitClient.stash(stashAction, {
      directory: options.directory,
      message: options.message,
      index: options.index,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Stash ${stashAction} complete`);
      if (result.output) {
        console.log(result.output);
      }
    } else {
      ui.stopSpinnerFail(`Stash ${stashAction} failed`);
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail(`Error during stash ${stashAction}`);
    ui.error(error.message);
  }
}

/**
 * Main git command router
 */
export async function gitCommand(subcommand: string, args: string[]): Promise<void> {
  const options: GitCommandOptions = {};

  // Extract positional args and options
  const positionalArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-d' || arg === '--directory') {
      options.directory = args[++i];
    } else if (arg === '-a' || arg === '--all') {
      options.all = true;
    } else if (arg === '--amend') {
      options.amend = true;
    } else if (arg === '-r' || arg === '--remote') {
      options.remote = args[++i];
    } else if (arg === '-b' || arg === '--branch') {
      options.branch = args[++i];
    } else if (arg === '-f' || arg === '--force') {
      options.force = true;
    } else if (arg === '-u' || arg === '--set-upstream') {
      options.setUpstream = true;
    } else if (arg === '--rebase') {
      options.rebase = true;
    } else if (arg === '-p' || arg === '--prune') {
      options.prune = true;
    } else if (arg === '-n' || arg === '--limit') {
      options.limit = parseInt(args[++i], 10);
    } else if (arg === '-s' || arg === '--staged') {
      options.staged = true;
    } else if (arg === '--file') {
      options.file = args[++i];
    } else if (arg === '-c' || arg === '--create') {
      options.create = true;
    } else if (arg === '-m' || arg === '--message') {
      positionalArgs.push(args[++i]);
    } else if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    }
  }

  switch (subcommand) {
    case 'status':
      await gitStatusCommand(options);
      break;
    case 'add':
      if (positionalArgs.length < 1 && !options.all) {
        ui.error('Usage: nimbus git add <files...> or nimbus git add -a');
        return;
      }
      await gitAddCommand(positionalArgs, options);
      break;
    case 'commit':
      if (positionalArgs.length < 1) {
        ui.error('Usage: nimbus git commit -m "message"');
        return;
      }
      await gitCommitCommand(positionalArgs[0], options);
      break;
    case 'push':
      await gitPushCommand(options);
      break;
    case 'pull':
      await gitPullCommand(options);
      break;
    case 'fetch':
      await gitFetchCommand(options);
      break;
    case 'log':
      await gitLogCommand(options);
      break;
    case 'branch':
      await gitBranchCommand(options);
      break;
    case 'checkout':
      if (positionalArgs.length < 1) {
        ui.error('Usage: nimbus git checkout <branch-or-file>');
        return;
      }
      await gitCheckoutCommand(positionalArgs[0], options);
      break;
    case 'diff':
      await gitDiffCommand(options);
      break;
    case 'merge':
      if (positionalArgs.length < 1) {
        ui.error('Usage: nimbus git merge <branch>');
        return;
      }
      await gitMergeCommand(positionalArgs[0], options);
      break;
    case 'stash': {
      const validStashActions = ['push', 'pop', 'list', 'drop', 'apply', 'clear'];
      const stashAction = (positionalArgs[0] || 'push') as 'push' | 'pop' | 'list' | 'drop' | 'apply' | 'clear';
      if (!validStashActions.includes(stashAction)) {
        ui.error(`Unknown stash action: ${stashAction}`);
        ui.info('Actions: push, pop, list, drop, apply, clear');
        return;
      }
      // Extract stash message from -m flag (already captured in positionalArgs if using -m)
      const stashMessage = positionalArgs[1];
      await gitStashCommand(stashAction, {
        ...options,
        message: stashMessage,
      });
      break;
    }
    default:
      ui.error(`Unknown git subcommand: ${subcommand}`);
      ui.info('Available commands: status, add, commit, push, pull, fetch, log, branch, checkout, diff, merge, stash');
  }
}
