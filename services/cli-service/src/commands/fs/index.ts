/**
 * File System Commands
 *
 * CLI commands for file system operations via FS Tools Service
 */

import { ToolsClient } from '@nimbus/shared-clients';
import { ui } from '../../wizard/ui';

const toolsClient = new ToolsClient();

export interface FsCommandOptions {
  path?: string;
  recursive?: boolean;
  pattern?: string;
  maxResults?: number;
}

interface FsEntry {
  name: string;
  type: string;
  size?: number;
  path?: string;
}

/**
 * List directory contents
 */
export async function fsListCommand(dirPath: string, options: FsCommandOptions = {}): Promise<void> {
  ui.header('Files List');

  ui.info(`Path: ${dirPath}`);
  if (options.recursive) {
    ui.info('Recursive: yes');
  }

  ui.startSpinner({ message: `Listing ${dirPath}...` });

  try {
    const result = await toolsClient.fs.list(dirPath, {
      recursive: options.recursive,
      pattern: options.pattern,
    });

    if (result.success) {
      const data = result.data as { entries?: FsEntry[] } | undefined;
      const entries = data?.entries || [];
      ui.stopSpinnerSuccess(`Found ${entries.length} entries`);

      if (entries.length > 0) {
        for (const entry of entries) {
          const icon = entry.type === 'directory' ? '📁' : '📄';
          const size = entry.size ? ` (${formatSize(entry.size)})` : '';
          ui.print(`  ${icon} ${entry.name}${size}`);
        }
      } else {
        ui.info('Directory is empty');
      }
    } else {
      ui.stopSpinnerFail('Failed to list directory');
      if (result.error) {
        ui.error(result.error.message);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error listing directory');
    ui.error(error.message);
  }
}

/**
 * Search for files
 */
export async function fsSearchCommand(pattern: string, searchPath: string = '.', options: FsCommandOptions = {}): Promise<void> {
  ui.header('Files Search');

  ui.info(`Pattern: ${pattern}`);
  ui.info(`Path: ${searchPath}`);

  ui.startSpinner({ message: `Searching for ${pattern}...` });

  try {
    const result = await toolsClient.fs.search(pattern, {
      path: searchPath,
      maxResults: options.maxResults,
    });

    if (result.success) {
      const data = result.data as { matches?: any[]; entries?: any[] } | undefined;
      const matches = data?.matches || data?.entries || [];
      ui.stopSpinnerSuccess(`Found ${matches.length} match(es)`);

      if (matches.length > 0) {
        for (const match of matches) {
          const name = typeof match === 'string' ? match : match.path || match.name;
          ui.print(`  ${ui.color('•', 'green')} ${name}`);
        }
      }
    } else {
      ui.stopSpinnerFail('Search failed');
      if (result.error) {
        ui.error(result.error.message);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error searching files');
    ui.error(error.message);
  }
}

/**
 * Read file contents
 */
export async function fsReadCommand(filePath: string, options: FsCommandOptions = {}): Promise<void> {
  ui.header('Files Read');

  ui.info(`File: ${filePath}`);

  ui.startSpinner({ message: `Reading ${filePath}...` });

  try {
    const result = await toolsClient.fs.read(filePath);

    if (result.success) {
      ui.stopSpinnerSuccess('File read successfully');
      const data = result.data as { content?: string } | undefined;
      if (data?.content !== undefined) {
        console.log(data.content);
      }
    } else {
      ui.stopSpinnerFail('Failed to read file');
      if (result.error) {
        ui.error(result.error.message);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error reading file');
    ui.error(error.message);
  }
}

/**
 * Main fs command router
 */
export async function fsCommand(subcommand: string, args: string[]): Promise<void> {
  const options: FsCommandOptions = {};
  const positionalArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-r' || arg === '--recursive') {
      options.recursive = true;
    } else if (arg === '-p' || arg === '--pattern') {
      options.pattern = args[++i];
    } else if (arg === '-n' || arg === '--max-results') {
      options.maxResults = parseInt(args[++i], 10);
    } else if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    }
  }

  switch (subcommand) {
    case 'list':
    case 'ls':
      await fsListCommand(positionalArgs[0] || '.', options);
      break;
    case 'tree':
      options.recursive = true;
      await fsListCommand(positionalArgs[0] || '.', options);
      break;
    case 'search':
    case 'find':
      if (positionalArgs.length < 1) {
        ui.error('Usage: nimbus fs search <pattern> [path]');
        return;
      }
      await fsSearchCommand(positionalArgs[0], positionalArgs[1] || '.', options);
      break;
    case 'read':
    case 'cat':
      if (positionalArgs.length < 1) {
        ui.error('Usage: nimbus fs read <file>');
        return;
      }
      await fsReadCommand(positionalArgs[0], options);
      break;
    default:
      ui.error(`Unknown fs subcommand: ${subcommand}`);
      ui.info('Available commands: list, tree, search, read');
  }
}

/**
 * Format file size in human-readable format
 */
function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}
