/**
 * Standard Tool Definitions
 *
 * Defines the 11 standard coding tools available to the Nimbus agentic loop.
 * Each tool wraps existing filesystem operations (src/tools/file-ops.ts) or
 * uses child_process for shell commands.
 *
 * Tools:
 *   read_file, edit_file, multi_edit, write_file, bash,
 *   glob, grep, list_dir, webfetch, todo_read, todo_write
 */

import { z } from 'zod';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn, exec } from 'node:child_process';
import { promisify } from 'node:util';
import { glob as fastGlob } from 'fast-glob';
import type { ToolDefinition, ToolResult } from './types';

const execAsync = promisify(exec);

/**
 * Execute a shell command using spawn with process group management.
 * On timeout, kills the entire process group to avoid orphaned children.
 */
function spawnAsync(
  command: string,
  options: { timeout?: number; cwd?: string; maxBuffer?: number; signal?: AbortSignal }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const maxBuffer = options.maxBuffer ?? 10 * 1024 * 1024;
    const child = spawn('sh', ['-c', command], {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Create a new process group so we can kill the whole tree
      detached: true,
    });

    let stdout = '';
    let stderr = '';
    let killed = false;
    let stdoutOverflow = false;
    let stderrOverflow = false;

    // Kill process group helper
    const killProcessGroup = () => {
      killed = true;
      try {
        if (child.pid) {
          process.kill(-child.pid, 'SIGTERM');
          setTimeout(() => {
            try {
              if (child.pid) {
                process.kill(-child.pid, 'SIGKILL');
              }
            } catch {
              /* already dead */
            }
          }, 2000);
        }
      } catch {
        /* Process already exited */
      }
    };

    // Wire AbortSignal (Ctrl+C) to kill the child process group
    if (options.signal) {
      if (options.signal.aborted) {
        killProcessGroup();
      } else {
        options.signal.addEventListener('abort', killProcessGroup, { once: true });
      }
    }

    child.stdout?.on('data', (data: Buffer) => {
      if (stdout.length + data.length > maxBuffer) {
        stdoutOverflow = true;
        return;
      }
      stdout += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      if (stderr.length + data.length > maxBuffer) {
        stderrOverflow = true;
        return;
      }
      stderr += data.toString();
    });

    const timer = options.timeout
      ? setTimeout(() => {
          killProcessGroup();
        }, options.timeout)
      : null;

    child.on('close', code => {
      if (timer) {
        clearTimeout(timer);
      }
      // Clean up abort listener
      if (options.signal) {
        options.signal.removeEventListener('abort', killProcessGroup);
      }

      if (killed) {
        const err = new Error(
          options.signal?.aborted
            ? 'Command aborted by user'
            : `Command timed out after ${options.timeout}ms`
        ) as Error & { stdout: string; stderr: string };
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
        return;
      }

      if (stdoutOverflow || stderrOverflow) {
        stdout += '\n[Output truncated: exceeded buffer limit]';
      }

      if (code !== 0) {
        const err = new Error(`Command exited with code ${code}`) as Error & {
          stdout: string;
          stderr: string;
          code: number;
        };
        err.stdout = stdout;
        err.stderr = stderr;
        err.code = code!;
        reject(err);
        return;
      }

      resolve({ stdout, stderr });
    });

    child.on('error', error => {
      if (timer) {
        clearTimeout(timer);
      }
      reject(error);
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a successful ToolResult. */
function ok(output: string): ToolResult {
  return { output, isError: false };
}

/** Build an error ToolResult. */
function err(message: string): ToolResult {
  return { output: '', error: message, isError: true };
}

// ---------------------------------------------------------------------------
// 1. read_file
// ---------------------------------------------------------------------------

const readFileSchema = z.object({
  path: z.string().describe('Absolute or relative path to the file to read'),
  offset: z.number().optional().describe('1-based line number to start reading from'),
  limit: z.number().optional().describe('Maximum number of lines to return'),
});

/** Patterns for sensitive files that should be blocked from read_file. */
const SENSITIVE_FILE_PATTERNS = [
  /\.env($|\.)/i, // .env, .env.local, .env.production, etc.
  /credentials\.json$/i, // GCP credentials
  /\.aws\/credentials$/i, // AWS credentials
  /\.ssh\/(id_|known_hosts|config)/i, // SSH keys and config
  /\.gnupg\//i, // GPG keys
  /\.netrc$/i, // Network credentials
  /secret[s]?\.ya?ml$/i, // Kubernetes secrets
  /\.pem$/i, // SSL certificates
  /\.key$/i, // Private keys
  /\.p12$/i, // PKCS#12 certificates
  /\.keystore$/i, // Java keystores
  /\/\.git\/config$/i, // Git config (may contain tokens)
  /token[s]?\.json$/i, // OAuth tokens
];

function isSensitivePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return SENSITIVE_FILE_PATTERNS.some(pattern => pattern.test(normalized));
}

export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: 'Read file contents. Returns the text content of a file at the given path.',
  inputSchema: readFileSchema,
  permissionTier: 'auto_allow',
  category: 'standard',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = readFileSchema.parse(raw);
      const resolved = path.resolve(input.path);

      // Block reading of sensitive files (credentials, keys, secrets)
      if (isSensitivePath(resolved)) {
        return err(
          `Blocked: ${path.basename(resolved)} appears to be a sensitive file (credentials, secrets, or keys). ` +
            `Reading it could expose secrets in the conversation history.`
        );
      }

      // Detect image files — return base64-encoded data for multimodal LLM support
      const ext = path.extname(resolved).toLowerCase();
      const imageExts = new Set([
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.bmp',
        '.webp',
        '.svg',
        '.ico',
        '.tiff',
        '.tif',
      ]);
      // Subset that LLMs can actually process as vision input
      const MULTIMODAL_EXTS: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
      };

      if (imageExts.has(ext)) {
        try {
          const stats = await fs.stat(resolved);
          const sizeStr =
            stats.size < 1024
              ? `${stats.size} B`
              : stats.size < 1024 * 1024
                ? `${(stats.size / 1024).toFixed(1)} KB`
                : `${(stats.size / (1024 * 1024)).toFixed(1)} MB`;

          const mediaType = MULTIMODAL_EXTS[ext];
          // If the image is a supported multimodal format and under 20MB, include base64
          if (mediaType && stats.size < 20 * 1024 * 1024) {
            const buffer = await fs.readFile(resolved);
            const base64 = buffer.toString('base64');
            return ok(
              `[Image file: ${path.basename(resolved)}]\nType: ${ext.slice(1).toUpperCase()}\nSize: ${sizeStr}\nPath: ${resolved}\n\n` +
                `<image_data media_type="${mediaType}" encoding="base64">${base64}</image_data>`
            );
          }

          return ok(
            `[Image file: ${path.basename(resolved)}]\nType: ${ext.slice(1).toUpperCase()}\nSize: ${sizeStr}\nPath: ${resolved}\n\nNote: Image content cannot be displayed in text mode. Use an image viewer or IDE to see the contents.`
          );
        } catch {
          return ok(
            `[Image file: ${path.basename(resolved)}]\nPath: ${resolved}\n\nNote: Image content cannot be displayed in text mode.`
          );
        }
      }

      // Detect Jupyter notebooks
      if (ext === '.ipynb') {
        try {
          const nbRaw = await fs.readFile(resolved, 'utf-8');
          const notebook = JSON.parse(nbRaw) as {
            cells?: Array<{ cell_type: string; source: string[]; outputs?: any[] }>;
          };

          if (!notebook.cells || !Array.isArray(notebook.cells)) {
            return ok(nbRaw); // Malformed notebook, return raw JSON
          }

          const parts: string[] = [`# Jupyter Notebook: ${path.basename(resolved)}\n`];

          for (let i = 0; i < notebook.cells.length; i++) {
            const cell = notebook.cells[i];
            const source = Array.isArray(cell.source)
              ? cell.source.join('')
              : String(cell.source || '');

            if (cell.cell_type === 'markdown') {
              parts.push(`## Cell ${i + 1} [Markdown]\n${source}\n`);
            } else if (cell.cell_type === 'code') {
              parts.push(`## Cell ${i + 1} [Code]\n\`\`\`python\n${source}\n\`\`\`\n`);

              // Show outputs
              if (cell.outputs && Array.isArray(cell.outputs)) {
                for (const output of cell.outputs) {
                  if (output.text) {
                    const text = Array.isArray(output.text)
                      ? output.text.join('')
                      : String(output.text);
                    parts.push(`Output:\n\`\`\`\n${text}\n\`\`\`\n`);
                  } else if (output.data?.['text/plain']) {
                    const text = Array.isArray(output.data['text/plain'])
                      ? output.data['text/plain'].join('')
                      : String(output.data['text/plain']);
                    parts.push(`Output:\n\`\`\`\n${text}\n\`\`\`\n`);
                  } else if (output.data?.['image/png'] || output.data?.['image/jpeg']) {
                    parts.push(`Output: [Image output — cannot display in text mode]\n`);
                  }
                }
              }
            } else if (cell.cell_type === 'raw') {
              parts.push(`## Cell ${i + 1} [Raw]\n${source}\n`);
            }
          }

          return ok(parts.join('\n'));
        } catch {
          // If notebook parsing fails, fall through to normal file read
        }
      }

      const content = await fs.readFile(resolved, 'utf-8');

      if (input.offset !== undefined || input.limit !== undefined) {
        const lines = content.split('\n');
        const start = (input.offset ?? 1) - 1; // convert to 0-based
        const end = input.limit !== undefined ? start + input.limit : lines.length;
        return ok(lines.slice(start, end).join('\n'));
      }

      return ok(content);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return err(`Failed to read file: ${message}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 2. edit_file
// ---------------------------------------------------------------------------

const editFileSchema = z.object({
  path: z.string().describe('Path to the file to edit'),
  old_string: z.string().describe('Exact text to find'),
  new_string: z.string().describe('Replacement text'),
  replace_all: z
    .boolean()
    .optional()
    .default(false)
    .describe('Replace all occurrences instead of just the first'),
});

export const editFileTool: ToolDefinition = {
  name: 'edit_file',
  description:
    'Make a precise text replacement in a file. By default replaces the first occurrence of old_string with new_string. Set replace_all to true to replace every occurrence.',
  inputSchema: editFileSchema,
  permissionTier: 'ask_once',
  category: 'standard',
  isDestructive: true,

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = editFileSchema.parse(raw);
      const content = await fs.readFile(input.path, 'utf-8');

      if (!content.includes(input.old_string)) {
        return err(
          `old_string not found in ${input.path}. Make sure the string matches exactly, including whitespace and indentation.`
        );
      }

      let updated: string;
      if (input.replace_all) {
        // Count occurrences for the success message
        let count = 0;
        let searchPos = 0;
        for (;;) {
          const idx = content.indexOf(input.old_string, searchPos);
          if (idx === -1) {
            break;
          }
          count++;
          searchPos = idx + input.old_string.length;
        }
        updated = content.replaceAll(input.old_string, input.new_string);
        await fs.writeFile(input.path, updated, 'utf-8');
        return ok(
          `Successfully replaced ${count} occurrence${count !== 1 ? 's' : ''} in ${input.path}`
        );
      }

      // Replace only the first occurrence
      const idx = content.indexOf(input.old_string);
      updated =
        content.slice(0, idx) + input.new_string + content.slice(idx + input.old_string.length);

      await fs.writeFile(input.path, updated, 'utf-8');
      return ok(`Successfully edited ${input.path}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return err(`Failed to edit file: ${message}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 3. multi_edit
// ---------------------------------------------------------------------------

const multiEditSchema = z.object({
  path: z.string().describe('Path to the file to edit'),
  edits: z
    .array(
      z.object({
        old_string: z.string().describe('Exact text to find'),
        new_string: z.string().describe('Replacement text'),
      })
    )
    .describe('Array of edits to apply sequentially'),
});

export const multiEditTool: ToolDefinition = {
  name: 'multi_edit',
  description: 'Make multiple text replacements in a single file atomically.',
  inputSchema: multiEditSchema,
  permissionTier: 'ask_once',
  category: 'standard',
  isDestructive: true,

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = multiEditSchema.parse(raw);
      const content = await fs.readFile(input.path, 'utf-8');

      // Pre-compute all edit positions on the original content to detect
      // overlap issues and enable bottom-up application.
      const positioned: Array<{
        index: number;
        editIndex: number;
        old_string: string;
        new_string: string;
      }> = [];
      const usedPositions = new Set<number>();
      for (let i = 0; i < input.edits.length; i++) {
        const edit = input.edits[i];
        // Search for the next occurrence that hasn't already been claimed
        let searchFrom = 0;
        let idx = -1;
        for (;;) {
          idx = content.indexOf(edit.old_string, searchFrom);
          if (idx === -1) {
            break;
          }
          if (!usedPositions.has(idx)) {
            break;
          }
          searchFrom = idx + 1;
        }
        if (idx === -1) {
          return err(
            `Edit ${i + 1}: old_string not found in ${input.path}. Aborting — no changes were written.`
          );
        }
        usedPositions.add(idx);
        positioned.push({
          index: idx,
          editIndex: i,
          old_string: edit.old_string,
          new_string: edit.new_string,
        });
      }

      // Sort by position descending (bottom-up) so earlier edits don't
      // shift the positions of later ones.
      positioned.sort((a, b) => b.index - a.index);

      let result = content;
      for (const edit of positioned) {
        result =
          result.slice(0, edit.index) +
          edit.new_string +
          result.slice(edit.index + edit.old_string.length);
      }

      await fs.writeFile(input.path, result, 'utf-8');
      return ok(`Successfully applied ${input.edits.length} edit(s) to ${input.path}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return err(`Failed to apply multi-edit: ${message}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 4. write_file
// ---------------------------------------------------------------------------

const writeFileSchema = z.object({
  path: z.string().describe('Path to the file to create or overwrite'),
  content: z.string().describe('Full file content to write'),
});

export const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description: 'Create or overwrite a file with the given content.',
  inputSchema: writeFileSchema,
  permissionTier: 'ask_once',
  category: 'standard',
  isDestructive: true,

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = writeFileSchema.parse(raw);
      await fs.mkdir(path.dirname(input.path), { recursive: true });
      await fs.writeFile(input.path, input.content, 'utf-8');
      return ok(`Successfully wrote ${input.path}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return err(`Failed to write file: ${message}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 5. bash
// ---------------------------------------------------------------------------

const bashSchema = z.object({
  command: z.string().describe('Shell command to execute'),
  timeout: z
    .number()
    .optional()
    .default(120_000)
    .describe('Timeout in milliseconds (default: 120000)'),
  workdir: z.string().optional().describe('Working directory for the command'),
});

export const bashTool: ToolDefinition = {
  name: 'bash',
  description:
    'Execute a shell command and return its output. Use for running tests, installing packages, or other terminal operations.',
  inputSchema: bashSchema,
  permissionTier: 'ask_once',
  category: 'standard',
  isDestructive: true,

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = bashSchema.parse(raw);
      const signal = (raw as Record<string, unknown> | null)?._signal as AbortSignal | undefined;
      const { stdout, stderr } = await spawnAsync(input.command, {
        timeout: input.timeout,
        cwd: input.workdir,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
        signal,
      });
      const combined = [stdout, stderr].filter(Boolean).join('\n');
      return ok(combined || '(no output)');
    } catch (error: unknown) {
      if (error !== null && typeof error === 'object' && 'stdout' in error) {
        // Process errors still carry partial output
        const execErr = error as {
          stdout?: string;
          stderr?: string;
          message?: string;
        };
        const combined = [execErr.stdout, execErr.stderr].filter(Boolean).join('\n');
        return err(combined || execErr.message || 'Command failed');
      }
      const message = error instanceof Error ? error.message : String(error);
      return err(`Command failed: ${message}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 6. glob
// ---------------------------------------------------------------------------

const globSchema = z.object({
  pattern: z.string().describe('Glob pattern to match files (e.g., "**/*.ts")'),
  path: z.string().optional().describe('Base directory to search in (defaults to cwd)'),
});

export const globTool: ToolDefinition = {
  name: 'glob',
  description: 'Find files matching a glob pattern. Returns matching file paths.',
  inputSchema: globSchema,
  permissionTier: 'auto_allow',
  category: 'standard',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = globSchema.parse(raw);
      const matches = await fastGlob(input.pattern, {
        cwd: input.path ?? process.cwd(),
        absolute: true,
        dot: false,
      });
      if (matches.length === 0) {
        return ok('No files matched the pattern.');
      }
      return ok(matches.join('\n'));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return err(`Glob search failed: ${message}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 7. grep
// ---------------------------------------------------------------------------

const grepSchema = z.object({
  pattern: z.string().describe('Regex pattern to search for'),
  path: z.string().optional().describe('Directory or file to search in (defaults to cwd)'),
  include: z.string().optional().describe('Glob filter for file types (e.g., "*.ts")'),
});

export const grepTool: ToolDefinition = {
  name: 'grep',
  description:
    'Search file contents using a regex pattern. Returns matching lines with file paths and line numbers.',
  inputSchema: grepSchema,
  permissionTier: 'auto_allow',
  category: 'standard',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = grepSchema.parse(raw);
      const searchPath = input.path ?? process.cwd();

      // Try ripgrep first (faster, respects .gitignore), fall back to grep
      let command: string;
      try {
        await execAsync('rg --version', { timeout: 2000 });
        const globFlag = input.include ? ` --glob ${JSON.stringify(input.include)}` : '';
        command = `rg -n${globFlag} ${JSON.stringify(input.pattern)} ${JSON.stringify(searchPath)}`;
      } catch {
        const includeFlag = input.include ? ` --include=${JSON.stringify(input.include)}` : '';
        command = `grep -rn${includeFlag} ${JSON.stringify(input.pattern)} ${JSON.stringify(searchPath)}`;
      }

      const { stdout } = await execAsync(command, {
        maxBuffer: 10 * 1024 * 1024,
      });
      return ok(stdout || 'No matches found.');
    } catch (error: unknown) {
      if (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code: number }).code === 1
      ) {
        // grep/rg exit code 1 = no matches (not a real error)
        return ok('No matches found.');
      }
      const message = error instanceof Error ? error.message : String(error);
      return err(`Grep failed: ${message}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 8. list_dir
// ---------------------------------------------------------------------------

const listDirSchema = z.object({
  path: z.string().describe('Absolute or relative path to the directory'),
});

export const listDirTool: ToolDefinition = {
  name: 'list_dir',
  description:
    'List the contents of a directory. Returns file and directory names with type indicators.',
  inputSchema: listDirSchema,
  permissionTier: 'auto_allow',
  category: 'standard',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = listDirSchema.parse(raw);
      const entries = await fs.readdir(input.path, {
        withFileTypes: true,
      });

      if (entries.length === 0) {
        return ok('(empty directory)');
      }

      const lines = entries.map(entry => {
        if (entry.isDirectory()) {
          return `[DIR]  ${entry.name}/`;
        }
        return `[FILE] ${entry.name}`;
      });

      return ok(lines.join('\n'));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return err(`Failed to list directory: ${message}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 9. webfetch
// ---------------------------------------------------------------------------

const webfetchSchema = z.object({
  url: z.string().url().describe('URL to fetch content from'),
  prompt: z.string().optional().describe('Optional prompt describing what information to extract'),
});

/** Maximum characters returned from a fetched page. */
const WEBFETCH_MAX_CHARS = 50_000;

export const webfetchTool: ToolDefinition = {
  name: 'webfetch',
  description: 'Fetch content from a URL and optionally process it with a prompt.',
  inputSchema: webfetchSchema,
  permissionTier: 'ask_once',
  category: 'standard',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = webfetchSchema.parse(raw);
      const response = await fetch(input.url);

      if (!response.ok) {
        return err(`HTTP ${response.status} ${response.statusText} fetching ${input.url}`);
      }

      let text = await response.text();

      if (text.length > WEBFETCH_MAX_CHARS) {
        text = `${text.slice(
          0,
          WEBFETCH_MAX_CHARS
        )}\n\n... (truncated, ${text.length} total characters)`;
      }

      if (input.prompt) {
        // Attempt to process the fetched content through a fast LLM model.
        // Falls back to returning raw text if the router is unavailable or
        // the LLM call fails for any reason.
        try {
          const { getAppContext } = await import('../../app');
          const ctx = getAppContext();
          if (ctx?.router) {
            const stream = ctx.router.routeStream(
              {
                messages: [
                  {
                    role: 'system' as const,
                    content:
                      'You are a content extraction assistant. The user will provide web page content and a question or instruction. Extract the requested information concisely from the content. Do not add information that is not present in the content.',
                  },
                  {
                    role: 'user' as const,
                    content: `${input.prompt}\n\n---\n\nWeb page content from ${input.url}:\n\n${text}`,
                  },
                ],
                model: 'haiku',
                maxTokens: 4096,
              },
              'summarization'
            );

            let result = '';
            for await (const chunk of stream) {
              if (chunk.content) {
                result += chunk.content;
              }
            }

            if (result.length > 0) {
              return ok(result);
            }
          }
        } catch {
          // LLM processing failed — fall through to raw text response.
        }

        return ok(`[Prompt: ${input.prompt}]\n\n${text}`);
      }

      return ok(text);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return err(`Fetch failed: ${message}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 10. todo_read
// ---------------------------------------------------------------------------

const todoReadSchema = z.object({}).describe('No input required');

export const todoReadTool: ToolDefinition = {
  name: 'todo_read',
  description: "Read the current session's task list.",
  inputSchema: todoReadSchema,
  permissionTier: 'auto_allow',
  category: 'standard',

  async execute(_raw: unknown): Promise<ToolResult> {
    try {
      const { getDb } = await import('../../state/db');
      const db = getDb();
      db.exec(`
        CREATE TABLE IF NOT EXISTS todos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          subject TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      const rows = db.query('SELECT id, subject, status FROM todos ORDER BY id').all() as Array<{
        id: number;
        subject: string;
        status: string;
      }>;
      if (rows.length === 0) {
        return ok('No tasks yet.');
      }
      const lines = rows.map(r => {
        const indicator =
          r.status === 'completed' ? '[x]' : r.status === 'in_progress' ? '[~]' : '[ ]';
        return `${r.id}. ${indicator} ${r.subject}`;
      });
      return ok(lines.join('\n'));
    } catch (error: unknown) {
      // Fallback to original placeholder behavior on DB failure.
      return ok('No tasks yet.');
    }
  },
};

// ---------------------------------------------------------------------------
// 11. todo_write
// ---------------------------------------------------------------------------

const todoWriteSchema = z.object({
  tasks: z
    .array(
      z.object({
        subject: z.string().describe('Brief task title'),
        status: z
          .enum(['pending', 'in_progress', 'completed'])
          .describe('Current status of the task'),
      })
    )
    .describe('Array of tasks to write to the session'),
});

export const todoWriteTool: ToolDefinition = {
  name: 'todo_write',
  description: "Update the session's task list.",
  inputSchema: todoWriteSchema,
  permissionTier: 'auto_allow',
  category: 'standard',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = todoWriteSchema.parse(raw);
      const { getDb } = await import('../../state/db');
      const db = getDb();
      db.exec(`
        CREATE TABLE IF NOT EXISTS todos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          subject TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      // Replace strategy: clear existing rows and insert the new set.
      db.exec('DELETE FROM todos');
      const insert = db.prepare('INSERT INTO todos (subject, status) VALUES (?, ?)');
      const insertAll = db.transaction((tasks: Array<{ subject: string; status: string }>) => {
        for (const t of tasks) {
          insert.run(t.subject, t.status);
        }
      });
      insertAll(input.tasks);
      const summary = input.tasks.map(t => {
        const indicator =
          t.status === 'completed' ? '[x]' : t.status === 'in_progress' ? '[~]' : '[ ]';
        return `${indicator} ${t.subject}`;
      });
      return ok(
        `Task list updated (${input.tasks.length} task${input.tasks.length === 1 ? '' : 's'}):\n${summary.join('\n')}`
      );
    } catch (error: unknown) {
      // Fallback to original placeholder behavior on DB failure.
      const message = error instanceof Error ? error.message : String(error);
      return err(`Failed to update tasks: ${message}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 12. web_search — Multi-engine search helpers
// ---------------------------------------------------------------------------

/**
 * Search using the Brave Search API. Returns formatted markdown results
 * or null if the request fails (allowing fallback to DuckDuckGo).
 */
async function searchBrave(
  query: string,
  maxResults: number,
  apiKey: string
): Promise<string | null> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodedQuery}&count=${maxResults}`,
      {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as any;
    const results: string[] = [];

    // Featured snippet
    if (data.mixed?.main?.[0]?.type === 'faq') {
      const faq = data.mixed.main[0];
      if (faq.results?.[0]?.answer) {
        results.push(`## Featured Answer\n${faq.results[0].answer}\n`);
      }
    }

    // Web results
    if (data.web?.results) {
      results.push('## Results');
      for (const r of data.web.results.slice(0, maxResults)) {
        results.push(`### ${r.title}\n${r.description || ''}\nURL: ${r.url}\n`);
      }
    }

    // Knowledge graph
    if (data.infobox?.results?.[0]) {
      const info = data.infobox.results[0];
      results.push(`## ${info.title || 'Info'}\n${info.description || ''}`);
    }

    return results.length > 0 ? results.join('\n') : null;
  } catch {
    return null;
  }
}

/**
 * Search using DuckDuckGo Instant Answer API. Returns formatted markdown
 * results. This is the fallback engine that requires no API key.
 */
async function searchDuckDuckGo(query: string, maxResults: number): Promise<string> {
  const encodedQuery = encodeURIComponent(query);

  // Try the Instant Answer API first for direct answers
  const iaResponse = await fetch(
    `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`
  );

  const results: string[] = [];

  if (iaResponse.ok) {
    const data = (await iaResponse.json()) as any;

    // Abstract (direct answer)
    if (data.Abstract) {
      results.push(`## Direct Answer\n${data.Abstract}\nSource: ${data.AbstractURL}\n`);
    }

    // Definition
    if (data.Definition) {
      results.push(`## Definition\n${data.Definition}\nSource: ${data.DefinitionURL}\n`);
    }

    // Answer (calculations, conversions, etc.)
    if (data.Answer) {
      results.push(`## Answer\n${data.Answer}\n`);
    }

    // Related topics
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      const topics = data.RelatedTopics.filter((t: any) => t.Text && t.FirstURL).slice(
        0,
        maxResults
      );

      if (topics.length > 0) {
        results.push('## Results');
        for (const topic of topics) {
          results.push(`- ${topic.Text}\n  URL: ${topic.FirstURL}`);
        }
      }
    }

    // Infobox
    if (data.Infobox?.content?.length > 0) {
      results.push('## Info');
      for (const item of data.Infobox.content.slice(0, 5)) {
        if (item.label && item.value) {
          results.push(`- ${item.label}: ${item.value}`);
        }
      }
    }

    // Redirect (if DDG suggests a better page)
    if (data.Redirect) {
      results.push(`\nSuggested page: ${data.Redirect}`);
    }
  }

  // If Instant Answer API returned nothing, try the HTML lite endpoint
  if (results.length === 0) {
    try {
      const htmlResponse = await fetch(`https://html.duckduckgo.com/html/?q=${encodedQuery}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Nimbus-CLI/1.0)' },
      });
      if (htmlResponse.ok) {
        const html = await htmlResponse.text();
        // Parse result snippets from the lite HTML page
        const resultPattern =
          /<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([^<]*)<\/a>/g;
        let match: RegExpExecArray | null;
        let count = 0;
        results.push('## Results');
        while ((match = resultPattern.exec(html)) !== null && count < maxResults) {
          const url = match[1].startsWith('//') ? `https:${match[1]}` : match[1];
          const title = match[2]
            .replace(/&#x27;/g, "'")
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"');
          const snippet = match[3]
            .replace(/<\/?b>/g, '**')
            .replace(/&#x27;/g, "'")
            .replace(/&amp;/g, '&');
          results.push(`### ${title}\n${snippet}\nURL: ${url}\n`);
          count++;
        }
      }
    } catch {
      // HTML fallback failed — fall through to "no results" message
    }
  }

  if (results.length === 0) {
    return `No results found for: "${query}". Try rephrasing the query or using more specific terms.\n\nTip: Set BRAVE_SEARCH_API_KEY env var for significantly better web search results.`;
  }

  return results.join('\n');
}

// ---------------------------------------------------------------------------
// 12. web_search
// ---------------------------------------------------------------------------

const webSearchSchema = z.object({
  query: z.string().describe('The search query string'),
  maxResults: z
    .number()
    .optional()
    .default(5)
    .describe('Maximum number of results to return (default: 5)'),
  engine: z
    .enum(['auto', 'duckduckgo', 'brave'])
    .optional()
    .default('auto')
    .describe('Search engine to use (default: auto)'),
});

export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description:
    'Search the web using a query string. Returns titles, URLs, and snippets. ' +
    'Supports Brave Search (set BRAVE_SEARCH_API_KEY) and DuckDuckGo. ' +
    'Useful for finding documentation, looking up error messages, or researching technologies.',
  inputSchema: webSearchSchema,
  permissionTier: 'ask_once',
  category: 'standard',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = webSearchSchema.parse(raw);

      // Try Brave Search API first if key is available, then DuckDuckGo as fallback
      const braveKey = process.env.BRAVE_SEARCH_API_KEY;

      if ((input.engine === 'brave' || input.engine === 'auto') && braveKey) {
        const result = await searchBrave(input.query, input.maxResults, braveKey);
        if (result) {
          return ok(result);
        }
        if (input.engine === 'brave') {
          return err('Brave Search failed and no fallback allowed');
        }
      }

      // DuckDuckGo HTML search (better results than Instant Answer API)
      const result = await searchDuckDuckGo(input.query, input.maxResults);
      return ok(result);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(`Web search failed: ${msg}`);
    }
  },
};

// ---------------------------------------------------------------------------
// Aggregate export
// ---------------------------------------------------------------------------

/** All 12 standard tools as an ordered array. */
export const standardTools: ToolDefinition[] = [
  readFileTool,
  editFileTool,
  multiEditTool,
  writeFileTool,
  bashTool,
  globTool,
  grepTool,
  listDirTool,
  webfetchTool,
  todoReadTool,
  todoWriteTool,
  webSearchTool,
];
