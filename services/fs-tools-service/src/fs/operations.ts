import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { glob } from 'fast-glob';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '@nimbus/shared-utils';

const execAsync = promisify(exec);

/**
 * Sensitive file patterns that should be blocked from access
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  /\.env(\.|$)/i,              // .env, .env.local, .env.production
  /credentials/i,              // AWS credentials, any credentials file
  /\.pem$/i,                   // PEM certificates
  /\.key$/i,                   // Private keys
  /id_rsa/i,                   // SSH keys
  /id_ed25519/i,               // SSH keys (Ed25519)
  /id_ecdsa/i,                 // SSH keys (ECDSA)
  /\.ssh[/\\]/i,               // Anything inside .ssh directory
  /\/etc\/shadow$/,            // Unix shadow passwords
  /\/etc\/passwd$/,            // Unix passwords
  /\.aws[/\\]credentials/i,   // AWS credentials file specifically
  /\.kube[/\\]config/i,       // Kubeconfig with cluster secrets
];

export interface FileStats {
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  createdAt: Date;
  modifiedAt: Date;
  accessedAt: Date;
  permissions: string;
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: TreeNode[];
}

export interface SearchResult {
  file: string;
  line: number;
  column: number;
  match: string;
  context?: string;
}

export interface ListOptions {
  pattern?: string;
  recursive?: boolean;
  includeHidden?: boolean;
  onlyFiles?: boolean;
  onlyDirectories?: boolean;
}

export interface TreeOptions {
  maxDepth?: number;
  includeHidden?: boolean;
  includeFiles?: boolean;
}

export interface SearchOptions {
  pattern: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  maxResults?: number;
  includeContext?: boolean;
  filePattern?: string;
}

export class FileSystemOperations {
  private basePath: string;

  constructor(basePath: string = process.cwd()) {
    this.basePath = basePath;
  }

  /**
   * Check if a resolved path points to a sensitive file
   */
  private assertNotSensitive(resolvedPath: string): void {
    if (process.env.ALLOW_SENSITIVE_FILES === 'true') {
      return;
    }

    const normalized = path.resolve(resolvedPath);
    const basename = path.basename(normalized);

    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(basename) || pattern.test(normalized)) {
        throw new Error(
          `Access denied: reading sensitive file '${basename}' is blocked for security`
        );
      }
    }
  }

  /**
   * Resolve path relative to base path
   */
  private resolvePath(filePath: string): string {
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.basePath, filePath);

    this.assertNotSensitive(resolved);
    return resolved;
  }

  /**
   * Read file content
   */
  async readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    const resolvedPath = this.resolvePath(filePath);
    logger.info(`Reading file: ${resolvedPath}`);

    const content = await fs.readFile(resolvedPath, encoding);
    return content;
  }

  /**
   * Read file as binary
   */
  async readFileBuffer(filePath: string): Promise<Buffer> {
    const resolvedPath = this.resolvePath(filePath);
    logger.info(`Reading file as buffer: ${resolvedPath}`);

    return await fs.readFile(resolvedPath);
  }

  /**
   * Write content to file
   */
  async writeFile(filePath: string, content: string | Buffer, options?: { createDirs?: boolean }): Promise<{ success: boolean; path: string }> {
    const resolvedPath = this.resolvePath(filePath);
    logger.info(`Writing file: ${resolvedPath}`);

    if (options?.createDirs) {
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    }

    await fs.writeFile(resolvedPath, content, 'utf-8');

    return { success: true, path: resolvedPath };
  }

  /**
   * Append content to file
   */
  async appendFile(filePath: string, content: string): Promise<{ success: boolean; path: string }> {
    const resolvedPath = this.resolvePath(filePath);
    logger.info(`Appending to file: ${resolvedPath}`);

    await fs.appendFile(resolvedPath, content, 'utf-8');

    return { success: true, path: resolvedPath };
  }

  /**
   * List files and directories
   */
  async list(directory: string, options: ListOptions = {}): Promise<string[]> {
    const resolvedPath = this.resolvePath(directory);
    logger.info(`Listing directory: ${resolvedPath}`);

    const pattern = options.pattern || '*';
    const fullPattern = options.recursive
      ? path.join(resolvedPath, '**', pattern)
      : path.join(resolvedPath, pattern);

    const entries = await glob(fullPattern, {
      dot: options.includeHidden,
      onlyFiles: options.onlyFiles,
      onlyDirectories: options.onlyDirectories,
      absolute: true,
    });

    return entries;
  }

  /**
   * Search for content in files using ripgrep (if available) or built-in search
   */
  async search(directory: string, options: SearchOptions): Promise<SearchResult[]> {
    const resolvedPath = this.resolvePath(directory);
    logger.info(`Searching in ${resolvedPath} for pattern: ${options.pattern}`);

    // Try ripgrep first for performance
    try {
      return await this.searchWithRipgrep(resolvedPath, options);
    } catch {
      // Fall back to built-in search
      return await this.searchBuiltin(resolvedPath, options);
    }
  }

  private async searchWithRipgrep(directory: string, options: SearchOptions): Promise<SearchResult[]> {
    const args: string[] = ['--json', '--line-number', '--column'];

    if (!options.caseSensitive) {
      args.push('-i');
    }

    if (options.wholeWord) {
      args.push('-w');
    }

    if (options.maxResults) {
      args.push('-m', options.maxResults.toString());
    }

    if (options.filePattern) {
      args.push('-g', options.filePattern);
    }

    const command = `rg ${args.join(' ')} "${options.pattern}" "${directory}"`;

    const { stdout } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });

    const results: SearchResult[] = [];
    const lines = stdout.trim().split('\n').filter(line => line);

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'match') {
          results.push({
            file: parsed.data.path.text,
            line: parsed.data.line_number,
            column: parsed.data.submatches[0]?.start || 0,
            match: parsed.data.lines.text.trim(),
            context: options.includeContext ? parsed.data.lines.text : undefined,
          });
        }
      } catch {
        // Skip malformed lines
      }
    }

    return results;
  }

  private async searchBuiltin(directory: string, options: SearchOptions): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const pattern = options.caseSensitive
      ? new RegExp(options.pattern, 'g')
      : new RegExp(options.pattern, 'gi');

    const files = await this.list(directory, {
      recursive: true,
      onlyFiles: true,
      pattern: options.filePattern || '*',
    });

    for (const file of files) {
      try {
        const content = await this.readFile(file);
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          let match;

          while ((match = pattern.exec(line)) !== null) {
            results.push({
              file,
              line: i + 1,
              column: match.index,
              match: line.trim(),
              context: options.includeContext ? line : undefined,
            });

            if (options.maxResults && results.length >= options.maxResults) {
              return results;
            }
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return results;
  }

  /**
   * Generate directory tree
   */
  async tree(directory: string, options: TreeOptions = {}): Promise<TreeNode> {
    const resolvedPath = this.resolvePath(directory);
    logger.info(`Generating tree for: ${resolvedPath}`);

    const maxDepth = options.maxDepth ?? 5;

    const buildTree = async (dir: string, depth: number): Promise<TreeNode> => {
      const stats = await fs.stat(dir);
      const name = path.basename(dir);

      const node: TreeNode = {
        name,
        path: dir,
        type: stats.isDirectory() ? 'directory' : 'file',
        size: stats.isFile() ? stats.size : undefined,
      };

      if (stats.isDirectory() && depth < maxDepth) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        node.children = [];

        for (const entry of entries) {
          // Skip hidden files if not requested
          if (!options.includeHidden && entry.name.startsWith('.')) {
            continue;
          }

          // Skip files if not requested
          if (!options.includeFiles && entry.isFile()) {
            continue;
          }

          const entryPath = path.join(dir, entry.name);
          const childNode = await buildTree(entryPath, depth + 1);
          node.children.push(childNode);
        }

        // Sort: directories first, then alphabetically
        node.children.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
      }

      return node;
    };

    return await buildTree(resolvedPath, 0);
  }

  /**
   * Get file diff using system diff command
   */
  async diff(file1: string, file2: string, options?: { unified?: number; ignoreWhitespace?: boolean }): Promise<string> {
    const path1 = this.resolvePath(file1);
    const path2 = this.resolvePath(file2);
    logger.info(`Diffing ${path1} and ${path2}`);

    const args: string[] = [];

    if (options?.unified !== undefined) {
      args.push(`-U${options.unified}`);
    } else {
      args.push('-u'); // Default unified format
    }

    if (options?.ignoreWhitespace) {
      args.push('-w');
    }

    try {
      const { stdout } = await execAsync(`diff ${args.join(' ')} "${path1}" "${path2}"`);
      return stdout;
    } catch (error: any) {
      // diff returns exit code 1 when files are different
      if (error.stdout) {
        return error.stdout;
      }
      throw error;
    }
  }

  /**
   * Copy file or directory
   */
  async copy(source: string, destination: string, options?: { recursive?: boolean; overwrite?: boolean }): Promise<{ success: boolean; source: string; destination: string }> {
    const srcPath = this.resolvePath(source);
    const destPath = this.resolvePath(destination);
    logger.info(`Copying ${srcPath} to ${destPath}`);

    const srcStats = await fs.stat(srcPath);

    if (srcStats.isDirectory()) {
      if (!options?.recursive) {
        throw new Error('Cannot copy directory without recursive option');
      }
      await this.copyDir(srcPath, destPath, options?.overwrite);
    } else {
      await fs.mkdir(path.dirname(destPath), { recursive: true });

      if (!options?.overwrite) {
        try {
          await fs.access(destPath);
          throw new Error(`Destination file already exists: ${destPath}`);
        } catch (e: any) {
          if (e.code !== 'ENOENT') {
            throw e;
          }
        }
      }

      await fs.copyFile(srcPath, destPath);
    }

    return { success: true, source: srcPath, destination: destPath };
  }

  private async copyDir(src: string, dest: string, overwrite?: boolean): Promise<void> {
    await fs.mkdir(dest, { recursive: true });

    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDir(srcPath, destPath, overwrite);
      } else {
        if (!overwrite) {
          try {
            await fs.access(destPath);
            continue; // Skip existing files
          } catch {
            // File doesn't exist, proceed with copy
          }
        }
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Move/rename file or directory
   */
  async move(source: string, destination: string): Promise<{ success: boolean; source: string; destination: string }> {
    const srcPath = this.resolvePath(source);
    const destPath = this.resolvePath(destination);
    logger.info(`Moving ${srcPath} to ${destPath}`);

    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.rename(srcPath, destPath);

    return { success: true, source: srcPath, destination: destPath };
  }

  /**
   * Delete file or directory
   */
  async delete(filePath: string, options?: { recursive?: boolean; force?: boolean }): Promise<{ success: boolean; path: string }> {
    const resolvedPath = this.resolvePath(filePath);
    logger.info(`Deleting: ${resolvedPath}`);

    const stats = await fs.stat(resolvedPath);

    if (stats.isDirectory()) {
      if (!options?.recursive) {
        throw new Error('Cannot delete directory without recursive option');
      }
      await fs.rm(resolvedPath, { recursive: true, force: options?.force });
    } else {
      await fs.unlink(resolvedPath);
    }

    return { success: true, path: resolvedPath };
  }

  /**
   * Create directory
   */
  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<{ success: boolean; path: string }> {
    const resolvedPath = this.resolvePath(dirPath);
    logger.info(`Creating directory: ${resolvedPath}`);

    await fs.mkdir(resolvedPath, { recursive: options?.recursive ?? true });

    return { success: true, path: resolvedPath };
  }

  /**
   * Check if file or directory exists
   */
  async exists(filePath: string): Promise<boolean> {
    const resolvedPath = this.resolvePath(filePath);

    try {
      await fs.access(resolvedPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file stats
   */
  async stat(filePath: string): Promise<FileStats> {
    const resolvedPath = this.resolvePath(filePath);
    logger.info(`Getting stats for: ${resolvedPath}`);

    const stats = await fs.stat(resolvedPath);
    const lstat = await fs.lstat(resolvedPath);

    return {
      size: stats.size,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      isSymbolicLink: lstat.isSymbolicLink(),
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
      accessedAt: stats.atime,
      permissions: (stats.mode & 0o777).toString(8),
    };
  }

  /**
   * Read directory entries
   */
  async readDir(dirPath: string): Promise<Array<{ name: string; type: 'file' | 'directory' | 'symlink' }>> {
    const resolvedPath = this.resolvePath(dirPath);
    logger.info(`Reading directory: ${resolvedPath}`);

    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });

    return entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file',
    }));
  }

  /**
   * Watch for file changes
   */
  watch(filePath: string, callback: (event: string, filename: string | null) => void): () => void {
    const resolvedPath = this.resolvePath(filePath);
    logger.info(`Watching: ${resolvedPath}`);

    const watcher = fsSync.watch(resolvedPath, { recursive: true }, (event: string, filename: string | null) => {
      callback(event, filename);
    });

    // Return a cleanup function
    return () => {
      watcher.close();
    };
  }
}
