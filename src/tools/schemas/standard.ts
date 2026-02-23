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
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { glob as fastGlob } from 'fast-glob';
import type { ToolDefinition, ToolResult } from './types';

const execAsync = promisify(exec);

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

export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description:
    'Read file contents. Returns the text content of a file at the given path.',
  inputSchema: readFileSchema,
  permissionTier: 'auto_allow',
  category: 'standard',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = readFileSchema.parse(raw);
      const content = await fs.readFile(input.path, 'utf-8');

      if (input.offset !== undefined || input.limit !== undefined) {
        const lines = content.split('\n');
        const start = (input.offset ?? 1) - 1; // convert to 0-based
        const end =
          input.limit !== undefined ? start + input.limit : lines.length;
        return ok(lines.slice(start, end).join('\n'));
      }

      return ok(content);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      return err(`Failed to read file: ${message}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 2. edit_file
// ---------------------------------------------------------------------------

const editFileSchema = z.object({
  path: z.string().describe('Path to the file to edit'),
  old_string: z.string().describe('Exact text to find (first occurrence)'),
  new_string: z.string().describe('Replacement text'),
});

export const editFileTool: ToolDefinition = {
  name: 'edit_file',
  description:
    'Make a precise text replacement in a file. Replaces the first occurrence of old_string with new_string.',
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
          `old_string not found in ${input.path}. Make sure the string matches exactly, including whitespace and indentation.`,
        );
      }

      // Replace only the first occurrence
      const idx = content.indexOf(input.old_string);
      const updated =
        content.slice(0, idx) +
        input.new_string +
        content.slice(idx + input.old_string.length);

      await fs.writeFile(input.path, updated, 'utf-8');
      return ok(`Successfully edited ${input.path}`);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
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
      }),
    )
    .describe('Array of edits to apply sequentially'),
});

export const multiEditTool: ToolDefinition = {
  name: 'multi_edit',
  description:
    'Make multiple text replacements in a single file atomically.',
  inputSchema: multiEditSchema,
  permissionTier: 'ask_once',
  category: 'standard',
  isDestructive: true,

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = multiEditSchema.parse(raw);
      let content = await fs.readFile(input.path, 'utf-8');

      for (let i = 0; i < input.edits.length; i++) {
        const edit = input.edits[i];
        if (!content.includes(edit.old_string)) {
          return err(
            `Edit ${i + 1}: old_string not found in ${input.path}. Aborting — no changes were written.`,
          );
        }
        const idx = content.indexOf(edit.old_string);
        content =
          content.slice(0, idx) +
          edit.new_string +
          content.slice(idx + edit.old_string.length);
      }

      await fs.writeFile(input.path, content, 'utf-8');
      return ok(
        `Successfully applied ${input.edits.length} edit(s) to ${input.path}`,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
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
  description:
    'Create or overwrite a file with the given content.',
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
      const message =
        error instanceof Error ? error.message : String(error);
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
  workdir: z
    .string()
    .optional()
    .describe('Working directory for the command'),
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
      const { stdout, stderr } = await execAsync(input.command, {
        timeout: input.timeout,
        cwd: input.workdir,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
      });
      const combined = [stdout, stderr].filter(Boolean).join('\n');
      return ok(combined || '(no output)');
    } catch (error: unknown) {
      if (
        error !== null &&
        typeof error === 'object' &&
        'stdout' in error
      ) {
        // exec errors still carry partial output
        const execErr = error as {
          stdout?: string;
          stderr?: string;
          message?: string;
        };
        const combined = [execErr.stdout, execErr.stderr]
          .filter(Boolean)
          .join('\n');
        return err(combined || execErr.message || 'Command failed');
      }
      const message =
        error instanceof Error ? error.message : String(error);
      return err(`Command failed: ${message}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 6. glob
// ---------------------------------------------------------------------------

const globSchema = z.object({
  pattern: z.string().describe('Glob pattern to match files (e.g., "**/*.ts")'),
  path: z
    .string()
    .optional()
    .describe('Base directory to search in (defaults to cwd)'),
});

export const globTool: ToolDefinition = {
  name: 'glob',
  description:
    'Find files matching a glob pattern. Returns matching file paths.',
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
      const message =
        error instanceof Error ? error.message : String(error);
      return err(`Glob search failed: ${message}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 7. grep
// ---------------------------------------------------------------------------

const grepSchema = z.object({
  pattern: z.string().describe('Regex pattern to search for'),
  path: z
    .string()
    .optional()
    .describe('Directory or file to search in (defaults to cwd)'),
  include: z
    .string()
    .optional()
    .describe('Glob filter for file types (e.g., "*.ts")'),
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
        const includeFlag = input.include
          ? ` --include=${JSON.stringify(input.include)}`
          : '';
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
      const message =
        error instanceof Error ? error.message : String(error);
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

      const lines = entries.map((entry) => {
        if (entry.isDirectory()) {
          return `[DIR]  ${entry.name}/`;
        }
        return `[FILE] ${entry.name}`;
      });

      return ok(lines.join('\n'));
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      return err(`Failed to list directory: ${message}`);
    }
  },
};

// ---------------------------------------------------------------------------
// 9. webfetch
// ---------------------------------------------------------------------------

const webfetchSchema = z.object({
  url: z.string().url().describe('URL to fetch content from'),
  prompt: z
    .string()
    .optional()
    .describe('Optional prompt describing what information to extract'),
});

/** Maximum characters returned from a fetched page. */
const WEBFETCH_MAX_CHARS = 50_000;

export const webfetchTool: ToolDefinition = {
  name: 'webfetch',
  description:
    'Fetch content from a URL and optionally process it with a prompt.',
  inputSchema: webfetchSchema,
  permissionTier: 'ask_once',
  category: 'standard',

  async execute(raw: unknown): Promise<ToolResult> {
    try {
      const input = webfetchSchema.parse(raw);
      const response = await fetch(input.url);

      if (!response.ok) {
        return err(
          `HTTP ${response.status} ${response.statusText} fetching ${input.url}`,
        );
      }

      let text = await response.text();

      if (text.length > WEBFETCH_MAX_CHARS) {
        text =
          text.slice(0, WEBFETCH_MAX_CHARS) +
          `\n\n... (truncated, ${text.length} total characters)`;
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
              'summarization',
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
      const message =
        error instanceof Error ? error.message : String(error);
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
      const rows = db
        .query('SELECT id, subject, status FROM todos ORDER BY id')
        .all() as Array<{ id: number; subject: string; status: string }>;
      if (rows.length === 0) {
        return ok('No tasks yet.');
      }
      const lines = rows.map((r) => {
        const indicator =
          r.status === 'completed'
            ? '[x]'
            : r.status === 'in_progress'
              ? '[~]'
              : '[ ]';
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
      }),
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
      const insert = db.prepare(
        'INSERT INTO todos (subject, status) VALUES (?, ?)',
      );
      const insertAll = db.transaction(
        (tasks: Array<{ subject: string; status: string }>) => {
          for (const t of tasks) {
            insert.run(t.subject, t.status);
          }
        },
      );
      insertAll(input.tasks);
      const summary = input.tasks.map((t) => {
        const indicator =
          t.status === 'completed'
            ? '[x]'
            : t.status === 'in_progress'
              ? '[~]'
              : '[ ]';
        return `${indicator} ${t.subject}`;
      });
      return ok(
        `Task list updated (${input.tasks.length} task${input.tasks.length === 1 ? '' : 's'}):\n${summary.join('\n')}`,
      );
    } catch (error: unknown) {
      // Fallback to original placeholder behavior on DB failure.
      const message =
        error instanceof Error ? error.message : String(error);
      return err(`Failed to update tasks: ${message}`);
    }
  },
};

// ---------------------------------------------------------------------------
// Aggregate export
// ---------------------------------------------------------------------------

/** All 11 standard tools as an ordered array. */
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
];
