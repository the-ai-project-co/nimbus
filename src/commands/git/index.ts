/**
 * Git Commands
 *
 * CLI commands for Git operations
 */

import { gitClient } from '../../clients';
import { ui } from '../../wizard/ui';
import { historyManager } from '../../history';

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
  // tag options
  message?: string;
  annotated?: boolean;
  tagName?: string;
  // reset options
  soft?: boolean;
  mixed?: boolean;
  hard?: boolean;
  // revert options
  noCommit?: boolean;
  noEdit?: boolean;
  // cherry-pick options
  // blame options
  lineRange?: string;
  // init options
  bare?: boolean;
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
 * Clone a repository
 */
export async function gitCloneCommand(
  url: string,
  targetPath?: string,
  options: GitCommandOptions = {}
): Promise<void> {
  ui.header('Git Clone');

  ui.info(`URL: ${url}`);
  if (targetPath) {
    ui.info(`Path: ${targetPath}`);
  }
  if (options.branch) {
    ui.info(`Branch: ${options.branch}`);
  }
  if (options.limit) {
    ui.info(`Depth: ${options.limit}`);
  }

  ui.startSpinner({ message: `Cloning ${url}...` });

  try {
    const available = await gitClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Git Tools Service not available');
      ui.error('Please ensure the Git Tools Service is running.');
      return;
    }

    const result = await gitClient.clone(url, targetPath, {
      branch: options.branch,
      depth: options.limit,
    });

    if (result.success) {
      ui.stopSpinnerSuccess('Repository cloned');
      if (result.output) {
        ui.info(result.output);
      }
    } else {
      ui.stopSpinnerFail('Failed to clone repository');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error cloning repository');
    ui.error(error.message);
  }
}

/**
 * Tag operations
 */
export async function gitTagCommand(
  tagAction: 'list' | 'create' | 'delete' | 'push' | 'show',
  options: GitCommandOptions & { tagArg?: string } = {}
): Promise<void> {
  ui.header(`Git Tag ${tagAction}`);

  ui.startSpinner({ message: `Running tag ${tagAction}...` });

  try {
    const available = await gitClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Git Tools Service not available');
      ui.error('Please ensure the Git Tools Service is running.');
      return;
    }

    if (tagAction === 'list') {
      const result = await gitClient.tagList({ directory: options.directory });
      if (result.success) {
        ui.stopSpinnerSuccess(`Found ${result.tags.length} tag(s)`);
        if (result.tags.length > 0) {
          result.tags.forEach((tag) => ui.info(`  ${tag}`));
        } else {
          ui.info('No tags found');
        }
      } else {
        ui.stopSpinnerFail('Failed to list tags');
        if (result.error) {
          ui.error(result.error);
        }
      }
    } else if (tagAction === 'create') {
      if (!options.tagArg) {
        ui.stopSpinnerFail('Tag name required');
        ui.error('Usage: nimbus git tag create <name> [--message <msg>]');
        return;
      }
      const result = await gitClient.tagCreate(options.tagArg, {
        directory: options.directory,
        message: options.message,
        annotated: options.annotated || !!options.message,
        force: options.force,
      });
      if (result.success) {
        ui.stopSpinnerSuccess(`Tag '${options.tagArg}' created`);
        if (result.output) {
          ui.info(result.output);
        }
      } else {
        ui.stopSpinnerFail(`Failed to create tag '${options.tagArg}'`);
        if (result.error) {
          ui.error(result.error);
        }
      }
    } else if (tagAction === 'delete') {
      if (!options.tagArg) {
        ui.stopSpinnerFail('Tag name required');
        ui.error('Usage: nimbus git tag delete <name>');
        return;
      }
      const result = await gitClient.tagDelete(options.tagArg, { directory: options.directory });
      if (result.success) {
        ui.stopSpinnerSuccess(`Tag '${options.tagArg}' deleted`);
      } else {
        ui.stopSpinnerFail(`Failed to delete tag '${options.tagArg}'`);
        if (result.error) {
          ui.error(result.error);
        }
      }
    } else if (tagAction === 'push') {
      const result = await gitClient.tagPush({
        directory: options.directory,
        remote: options.remote,
        tagName: options.tagArg,
      });
      if (result.success) {
        ui.stopSpinnerSuccess('Tags pushed');
        if (result.output) {
          ui.info(result.output);
        }
      } else {
        ui.stopSpinnerFail('Failed to push tags');
        if (result.error) {
          ui.error(result.error);
        }
      }
    } else if (tagAction === 'show') {
      if (!options.tagArg) {
        ui.stopSpinnerFail('Tag name required');
        ui.error('Usage: nimbus git tag show <name>');
        return;
      }
      const result = await gitClient.tagShow(options.tagArg, { directory: options.directory });
      if (result.success) {
        ui.stopSpinnerSuccess(`Tag info for '${options.tagArg}'`);
        if (result.output) {
          console.log(result.output);
        }
      } else {
        ui.stopSpinnerFail(`Failed to show tag '${options.tagArg}'`);
        if (result.error) {
          ui.error(result.error);
        }
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail(`Error during tag ${tagAction}`);
    ui.error(error.message);
  }
}

/**
 * Show remote URL
 */
export async function gitRemoteCommand(
  remoteName?: string,
  options: GitCommandOptions = {}
): Promise<void> {
  ui.header('Git Remote');

  const name = remoteName || 'origin';
  ui.info(`Remote: ${name}`);

  ui.startSpinner({ message: 'Fetching remote URL...' });

  try {
    const available = await gitClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Git Tools Service not available');
      ui.error('Please ensure the Git Tools Service is running.');
      return;
    }

    const result = await gitClient.remote(name, { directory: options.directory });

    if (result.success) {
      ui.stopSpinnerSuccess(`Remote '${result.remote}'`);
      if (result.url) {
        ui.info(`URL: ${result.url}`);
      } else {
        ui.warning('No URL found for this remote');
      }
    } else {
      ui.stopSpinnerFail('Failed to get remote URL');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error fetching remote URL');
    ui.error(error.message);
  }
}

/**
 * Reset to a commit
 */
export async function gitResetCommand(
  target: string,
  options: GitCommandOptions = {}
): Promise<void> {
  ui.header('Git Reset');

  let mode: 'soft' | 'mixed' | 'hard' = 'mixed';
  if (options.soft) {
    mode = 'soft';
  } else if (options.hard) {
    mode = 'hard';
  }

  ui.info(`Target: ${target}`);
  ui.info(`Mode: ${mode}`);

  if (mode === 'hard') {
    ui.warning('WARNING: --hard reset will discard all uncommitted changes. This cannot be undone.');
  }

  ui.startSpinner({ message: `Resetting to ${target} (${mode})...` });

  try {
    const available = await gitClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Git Tools Service not available');
      ui.error('Please ensure the Git Tools Service is running.');
      return;
    }

    const result = await gitClient.reset(target, { directory: options.directory, mode });

    if (result.success) {
      ui.stopSpinnerSuccess(`Reset to ${target} (${mode}) complete`);
      if (result.output) {
        ui.info(result.output);
      }
    } else {
      ui.stopSpinnerFail(`Failed to reset to ${target}`);
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail(`Error resetting to ${target}`);
    ui.error(error.message);
  }
}

/**
 * Revert a commit
 */
export async function gitRevertCommand(
  commit: string,
  options: GitCommandOptions = {}
): Promise<void> {
  ui.header('Git Revert');

  ui.info(`Reverting commit: ${commit}`);
  if (options.noCommit) {
    ui.info('--no-commit: staging revert without creating a commit');
  }
  if (options.noEdit) {
    ui.info('--no-edit: using default revert commit message');
  }

  ui.startSpinner({ message: `Reverting ${commit}...` });

  try {
    const available = await gitClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Git Tools Service not available');
      ui.error('Please ensure the Git Tools Service is running.');
      return;
    }

    const result = await gitClient.revert(commit, {
      directory: options.directory,
      noCommit: options.noCommit,
      noEdit: options.noEdit,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Reverted commit ${commit}`);
      if (result.output) {
        ui.info(result.output);
      }
    } else {
      ui.stopSpinnerFail(`Failed to revert ${commit}`);
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail(`Error reverting ${commit}`);
    ui.error(error.message);
  }
}

/**
 * Cherry-pick operations
 */
export async function gitCherryPickCommand(
  cherryPickAction: 'pick' | 'abort' | 'continue',
  options: GitCommandOptions & { commit?: string } = {}
): Promise<void> {
  ui.header(`Git Cherry-Pick ${cherryPickAction}`);

  ui.startSpinner({ message: `Running cherry-pick ${cherryPickAction}...` });

  try {
    const available = await gitClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Git Tools Service not available');
      ui.error('Please ensure the Git Tools Service is running.');
      return;
    }

    if (cherryPickAction === 'pick') {
      if (!options.commit) {
        ui.stopSpinnerFail('Commit hash required');
        ui.error('Usage: nimbus git cherry-pick <commit-hash>');
        return;
      }
      const result = await gitClient.cherryPick(options.commit, {
        directory: options.directory,
        noCommit: options.noCommit,
      });
      if (result.success) {
        ui.stopSpinnerSuccess(`Cherry-picked ${options.commit}`);
        if (result.output) {
          ui.info(result.output);
        }
      } else {
        ui.stopSpinnerFail(`Failed to cherry-pick ${options.commit}`);
        if (result.error) {
          ui.error(result.error);
        }
      }
    } else if (cherryPickAction === 'abort') {
      const result = await gitClient.cherryPickAbort({ directory: options.directory });
      if (result.success) {
        ui.stopSpinnerSuccess('Cherry-pick aborted');
      } else {
        ui.stopSpinnerFail('Failed to abort cherry-pick');
        if (result.error) {
          ui.error(result.error);
        }
      }
    } else if (cherryPickAction === 'continue') {
      const result = await gitClient.cherryPickContinue({ directory: options.directory });
      if (result.success) {
        ui.stopSpinnerSuccess('Cherry-pick continued');
        if (result.output) {
          ui.info(result.output);
        }
      } else {
        ui.stopSpinnerFail('Failed to continue cherry-pick');
        if (result.error) {
          ui.error(result.error);
        }
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail(`Error during cherry-pick ${cherryPickAction}`);
    ui.error(error.message);
  }
}

/**
 * Show blame for a file
 */
export async function gitBlameCommand(
  file: string,
  options: GitCommandOptions = {}
): Promise<void> {
  ui.header('Git Blame');

  ui.info(`File: ${file}`);
  if (options.lineRange) {
    ui.info(`Line range: ${options.lineRange}`);
  }

  ui.startSpinner({ message: `Getting blame for ${file}...` });

  try {
    const available = await gitClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Git Tools Service not available');
      ui.error('Please ensure the Git Tools Service is running.');
      return;
    }

    const result = await gitClient.blame(file, {
      directory: options.directory,
      lineRange: options.lineRange,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Blame retrieved for ${file}`);
      if (result.blame.length > 0) {
        result.blame.forEach((line) => console.log(line));
      } else {
        ui.info('No blame data returned');
      }
    } else {
      ui.stopSpinnerFail(`Failed to get blame for ${file}`);
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail(`Error getting blame for ${file}`);
    ui.error(error.message);
  }
}

/**
 * Initialize a repository
 */
export async function gitInitCommand(options: GitCommandOptions = {}): Promise<void> {
  ui.header('Git Init');

  if (options.directory) {
    ui.info(`Directory: ${options.directory}`);
  }
  if (options.bare) {
    ui.info('Creating bare repository');
  }

  ui.startSpinner({ message: 'Initializing repository...' });

  try {
    const available = await gitClient.isAvailable();
    if (!available) {
      ui.stopSpinnerFail('Git Tools Service not available');
      ui.error('Please ensure the Git Tools Service is running.');
      return;
    }

    const result = await gitClient.init({ directory: options.directory, bare: options.bare });

    if (result.success) {
      ui.stopSpinnerSuccess('Repository initialized');
      if (result.output) {
        ui.info(result.output);
      }
    } else {
      ui.stopSpinnerFail('Failed to initialize repository');
      if (result.error) {
        ui.error(result.error);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error initializing repository');
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
      options.message = args[++i];
      positionalArgs.push(options.message);
    } else if (arg === '--soft') {
      options.soft = true;
    } else if (arg === '--mixed') {
      options.mixed = true;
    } else if (arg === '--hard') {
      options.hard = true;
    } else if (arg === '--no-commit') {
      options.noCommit = true;
    } else if (arg === '--no-edit') {
      options.noEdit = true;
    } else if (arg === '--annotated') {
      options.annotated = true;
    } else if (arg === '--bare') {
      options.bare = true;
    } else if (arg === '--line-range') {
      options.lineRange = args[++i];
    } else if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    }
  }

  const startTime = Date.now();
  const entry = historyManager.addEntry('git', [subcommand, ...args]);

  try {
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
      case 'clone':
        if (positionalArgs.length < 1) {
          ui.error('Usage: nimbus git clone <url> [path] [--branch <branch>] [--limit <depth>]');
          return;
        }
        await gitCloneCommand(positionalArgs[0], positionalArgs[1], options);
        break;
      case 'stash': {
        const validStashActions = ['push', 'pop', 'list', 'drop', 'apply', 'clear'];
        const stashAction = (positionalArgs[0] || 'push') as 'push' | 'pop' | 'list' | 'drop' | 'apply' | 'clear';
        if (!validStashActions.includes(stashAction)) {
          ui.error(`Unknown stash action: ${stashAction}`);
          ui.info('Actions: push, pop, list, drop, apply, clear');
          return;
        }
        await gitStashCommand(stashAction, {
          ...options,
          message: options.message,
        });
        break;
      }
      case 'tag': {
        const validTagActions = ['list', 'create', 'delete', 'push', 'show'];
        const tagAction = (positionalArgs[0] || 'list') as 'list' | 'create' | 'delete' | 'push' | 'show';
        if (!validTagActions.includes(tagAction)) {
          ui.error(`Unknown tag action: ${tagAction}`);
          ui.info('Actions: list (default), create, delete, push, show');
          return;
        }
        // The second positional arg is the tag name (for create/delete/push/show)
        const tagArg = positionalArgs[1];
        await gitTagCommand(tagAction, { ...options, tagArg });
        break;
      }
      case 'remote': {
        const remoteName = positionalArgs[0];
        await gitRemoteCommand(remoteName, options);
        break;
      }
      case 'reset': {
        if (positionalArgs.length < 1) {
          ui.error('Usage: nimbus git reset <commit-ref> [--soft | --mixed | --hard]');
          return;
        }
        await gitResetCommand(positionalArgs[0], options);
        break;
      }
      case 'revert': {
        if (positionalArgs.length < 1) {
          ui.error('Usage: nimbus git revert <commit-hash> [--no-commit] [--no-edit]');
          return;
        }
        await gitRevertCommand(positionalArgs[0], options);
        break;
      }
      case 'cherry-pick': {
        // Determine action: if first positional arg is 'abort' or 'continue', use it as action
        let cherryPickAction: 'pick' | 'abort' | 'continue' = 'pick';
        let cherryPickCommit: string | undefined;
        if (positionalArgs[0] === 'abort') {
          cherryPickAction = 'abort';
        } else if (positionalArgs[0] === 'continue') {
          cherryPickAction = 'continue';
        } else {
          cherryPickAction = 'pick';
          cherryPickCommit = positionalArgs[0];
          if (!cherryPickCommit) {
            ui.error('Usage: nimbus git cherry-pick <commit-hash> [--no-commit]');
            ui.info('Also: nimbus git cherry-pick abort | continue');
            return;
          }
        }
        await gitCherryPickCommand(cherryPickAction, { ...options, commit: cherryPickCommit });
        break;
      }
      case 'blame': {
        if (positionalArgs.length < 1) {
          ui.error('Usage: nimbus git blame <file> [--line-range <start,end>]');
          return;
        }
        await gitBlameCommand(positionalArgs[0], options);
        break;
      }
      case 'init': {
        // optional directory as positional arg
        if (positionalArgs[0]) {
          options.directory = positionalArgs[0];
        }
        await gitInitCommand(options);
        break;
      }
      default:
        ui.error(`Unknown git subcommand: ${subcommand}`);
        ui.info('Available commands: status, add, commit, push, pull, fetch, log, branch, checkout, diff, merge, clone, stash, tag, remote, reset, revert, cherry-pick, blame, init');
    }

    historyManager.completeEntry(entry.id, 'success', Date.now() - startTime);
  } catch (error: any) {
    historyManager.completeEntry(entry.id, 'failure', Date.now() - startTime, { error: error.message });
    throw error;
  }
}
