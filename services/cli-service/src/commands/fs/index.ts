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
  maxDepth?: number;
  createDirs?: boolean;
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

interface TreeNode {
  name: string;
  type: string;
  children?: TreeNode[];
}

/**
 * Display directory tree using the dedicated tree endpoint
 */
export async function fsTreeCommand(dirPath: string, options: FsCommandOptions = {}): Promise<void> {
  ui.header('File Tree');

  ui.info(`Path: ${dirPath}`);
  if (options.maxDepth) {
    ui.info(`Max depth: ${options.maxDepth}`);
  }

  ui.startSpinner({ message: `Building tree for ${dirPath}...` });

  try {
    const result = await toolsClient.fs.tree(dirPath, {
      maxDepth: options.maxDepth,
      includeFiles: true,
    });

    if (result.success) {
      const data = result.data as { tree?: TreeNode[]; entries?: TreeNode[] } | undefined;
      const tree = data?.tree || data?.entries || [];
      ui.stopSpinnerSuccess(`Tree for ${dirPath}`);

      function printTree(nodes: TreeNode[], prefix = '') {
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          const isLast = i === nodes.length - 1;
          const connector = isLast ? '└── ' : '├── ';
          const icon = node.type === 'directory' ? '📁' : '📄';
          ui.print(`${prefix}${connector}${icon} ${node.name}`);
          if (node.children && node.children.length > 0) {
            const childPrefix = prefix + (isLast ? '    ' : '│   ');
            printTree(node.children, childPrefix);
          }
        }
      }

      if (tree.length > 0) {
        printTree(tree);
      } else {
        ui.info('Directory is empty');
      }
    } else {
      ui.stopSpinnerFail('Failed to build tree');
      if (result.error) {
        ui.error(result.error.message);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error building tree');
    ui.error(error.message);
  }
}

/**
 * Write content to a file
 */
export async function fsWriteCommand(filePath: string, content: string, options: FsCommandOptions = {}): Promise<void> {
  ui.header('Files Write');

  ui.info(`File: ${filePath}`);

  ui.startSpinner({ message: `Writing to ${filePath}...` });

  try {
    const result = await toolsClient.fs.write(filePath, content, {
      createDirs: options.createDirs,
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`File written successfully: ${filePath}`);
    } else {
      ui.stopSpinnerFail('Failed to write file');
      if (result.error) {
        ui.error(result.error.message);
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error writing file');
    ui.error(error.message);
  }
}

/**
 * Show diff between two files
 */
export async function fsDiffCommand(file1: string, file2: string): Promise<void> {
  ui.header('Files Diff');

  ui.info(`File 1: ${file1}`);
  ui.info(`File 2: ${file2}`);

  ui.startSpinner({ message: 'Computing diff...' });

  try {
    // Read both files and compare via the FS tools service diff endpoint
    const result = await toolsClient.fs.read(file1);
    const result2 = await toolsClient.fs.read(file2);

    if (!result.success) {
      ui.stopSpinnerFail(`Failed to read file: ${file1}`);
      if (result.error) {
        ui.error(result.error.message);
      }
      return;
    }

    if (!result2.success) {
      ui.stopSpinnerFail(`Failed to read file: ${file2}`);
      if (result2.error) {
        ui.error(result2.error.message);
      }
      return;
    }

    const data1 = result.data as { content?: string } | undefined;
    const data2 = result2.data as { content?: string } | undefined;
    const content1 = data1?.content || '';
    const content2 = data2?.content || '';

    if (content1 === content2) {
      ui.stopSpinnerSuccess('Files are identical');
    } else {
      ui.stopSpinnerSuccess('Diff computed');

      // Simple line-by-line diff display
      const lines1 = content1.split('\n');
      const lines2 = content2.split('\n');
      const maxLines = Math.max(lines1.length, lines2.length);

      const diffLines: string[] = [];
      for (let i = 0; i < maxLines; i++) {
        const l1 = lines1[i];
        const l2 = lines2[i];
        if (l1 === undefined) {
          diffLines.push(ui.color(`+ ${l2}`, 'green'));
        } else if (l2 === undefined) {
          diffLines.push(ui.color(`- ${l1}`, 'red'));
        } else if (l1 !== l2) {
          diffLines.push(ui.color(`- ${l1}`, 'red'));
          diffLines.push(ui.color(`+ ${l2}`, 'green'));
        }
      }

      if (diffLines.length > 0) {
        ui.box({ title: 'Diff', content: diffLines.join('\n') });
      }
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error computing diff');
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
    } else if (arg === '--depth') {
      options.maxDepth = parseInt(args[++i], 10);
    } else if (arg === '--create-dirs') {
      options.createDirs = true;
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
      await fsTreeCommand(positionalArgs[0] || '.', options);
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
    case 'write':
      if (positionalArgs.length < 2) {
        ui.error('Usage: nimbus fs write <path> <content>');
        return;
      }
      await fsWriteCommand(positionalArgs[0], positionalArgs.slice(1).join(' '), options);
      break;
    case 'diff':
      if (positionalArgs.length < 2) {
        ui.error('Usage: nimbus fs diff <file1> <file2>');
        return;
      }
      await fsDiffCommand(positionalArgs[0], positionalArgs[1]);
      break;
    default:
      ui.error(`Unknown fs subcommand: ${subcommand}`);
      ui.info('Available commands: list, tree, search, read, write, diff');
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
