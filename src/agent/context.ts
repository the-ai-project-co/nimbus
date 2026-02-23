/**
 * Context Manager — @file/@folder References
 *
 * Resolves @path references in user messages, injects file content
 * into the conversation context, and manages token budgets.
 *
 * When a user types `@src/server.ts fix the CORS issue`, this module
 * finds and reads `src/server.ts`, injects its content into the
 * conversation context sent to the LLM, and replaces the @mention
 * in the displayed message with a resolved indicator.
 *
 * Token budgets prevent large files or directory trees from consuming
 * the entire context window. Files that exceed the remaining budget
 * are either truncated or skipped, and the caller is informed via the
 * {@link ContextResult.truncated} flag.
 *
 * @module agent/context
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'fast-glob';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

/** A single resolved file or directory reference extracted from a user message. */
export interface FileReference {
  /** Original @mention text as it appeared in the message (e.g. `@src/server.ts`). */
  readonly mention: string;
  /** Resolved absolute path on disk. */
  readonly resolvedPath: string;
  /** Whether the resolved path points to a directory rather than a file. */
  readonly isDirectory: boolean;
  /** File content (for files) or directory listing (for folders). */
  readonly content: string;
  /** Approximate token count of {@link content}. */
  readonly tokenCount: number;
}

/** Options controlling how @references are resolved. */
export interface ContextOptions {
  /** Current working directory used for relative path resolution. Defaults to `process.cwd()`. */
  readonly cwd?: string;
  /**
   * Maximum tokens allowed for all injected context combined.
   * References that would exceed this budget are truncated or skipped.
   * @default 50000
   */
  readonly maxTokens?: number;
}

/** Result returned by {@link resolveReferences}. */
export interface ContextResult {
  /** The user message with @mentions replaced by `[File: ...]` indicators. */
  readonly processedMessage: string;
  /** All successfully resolved file/directory references. */
  readonly references: readonly FileReference[];
  /** Total tokens consumed by all injected references. */
  readonly totalTokens: number;
  /** `true` if one or more references were truncated or dropped due to the token budget. */
  readonly truncated: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve @file and @folder references in a user message.
 *
 * Scans the message for `@path` patterns, resolves each to an absolute
 * path on disk, reads the content, and tracks the token budget. Returns
 * the processed message along with all resolved references.
 *
 * @example
 * ```ts
 * const result = await resolveReferences(
 *   '@src/server.ts fix the CORS issue',
 *   { cwd: '/home/user/project' },
 * );
 * // result.references[0].content contains the file contents
 * // result.processedMessage === '[File: src/server.ts] fix the CORS issue'
 * ```
 *
 * @example
 * ```ts
 * // Directory reference — returns a tree listing
 * const result = await resolveReferences('@src/components/ find all Button components');
 * ```
 *
 * @param message  - The raw user message that may contain @path mentions.
 * @param options  - Resolution options (working directory, token budget).
 * @returns A {@link ContextResult} with the processed message and resolved references.
 */
export async function resolveReferences(
  message: string,
  options?: ContextOptions,
): Promise<ContextResult> {
  const cwd = options?.cwd ?? process.cwd();
  const maxTokens = options?.maxTokens ?? 50_000;

  // Find all @path mentions in the message
  const mentions = extractMentions(message);

  if (mentions.length === 0) {
    return {
      processedMessage: message,
      references: [],
      totalTokens: 0,
      truncated: false,
    };
  }

  const references: FileReference[] = [];
  let totalTokens = 0;
  let truncated = false;
  let processedMessage = message;

  for (const mention of mentions) {
    // Resolve the path
    const resolvedPath = await resolveFilePath(mention.path, cwd);
    if (!resolvedPath) continue;

    // Check if it is a file or directory
    const stat = fs.statSync(resolvedPath);
    const isDirectory = stat.isDirectory();

    let content: string;
    if (isDirectory) {
      content = await buildDirectoryContext(resolvedPath);
    } else {
      content = fs.readFileSync(resolvedPath, 'utf-8');
    }

    const tokenCount = estimateTokens(content);

    // Check token budget
    if (totalTokens + tokenCount > maxTokens) {
      truncated = true;
      // Try to include a truncated version if enough budget remains
      const remainingTokens = maxTokens - totalTokens;
      if (remainingTokens > 500) {
        content = truncateToTokens(content, remainingTokens);
        const truncatedTokens = estimateTokens(content);
        references.push({
          mention: mention.raw,
          resolvedPath,
          isDirectory,
          content,
          tokenCount: truncatedTokens,
        });
        totalTokens += truncatedTokens;
      }
      continue;
    }

    references.push({
      mention: mention.raw,
      resolvedPath,
      isDirectory,
      content,
      tokenCount,
    });
    totalTokens += tokenCount;

    // Replace @mention in message with a human-readable indicator
    processedMessage = processedMessage.replace(
      mention.raw,
      `[File: ${path.relative(cwd, resolvedPath)}]`,
    );
  }

  return { processedMessage, references, totalTokens, truncated };
}

/**
 * Build the context injection string from resolved references.
 *
 * The returned string is appended to the user message before it is sent
 * to the LLM, giving the model visibility into the referenced files.
 *
 * @param references - The resolved references from {@link resolveReferences}.
 * @returns A markdown-formatted string containing the file contents,
 *          or an empty string if there are no references.
 */
export function buildContextInjection(references: readonly FileReference[]): string {
  if (references.length === 0) return '';

  const parts = references.map((ref) => {
    const header = ref.isDirectory
      ? `### Directory: ${ref.resolvedPath}`
      : `### File: ${ref.resolvedPath}`;
    return `${header}\n\n\`\`\`\n${ref.content}\n\`\`\``;
  });

  return `\n\n---\n# Referenced Files\n\n${parts.join('\n\n')}`;
}

/**
 * Fuzzy search for files matching a partial path.
 *
 * Used for autocomplete suggestions and resolving ambiguous references.
 * First attempts an exact match, then falls back to progressively
 * broader glob patterns.
 *
 * @param partial - The partial file/directory name to search for.
 * @param cwd     - The directory to search within. Defaults to `process.cwd()`.
 * @returns Up to 10 absolute paths that match the partial input.
 */
export async function fuzzyFileSearch(
  partial: string,
  cwd?: string,
): Promise<string[]> {
  const searchDir = cwd ?? process.cwd();

  // Try exact match first
  const exactPath = path.resolve(searchDir, partial);
  if (fs.existsSync(exactPath)) {
    return [exactPath];
  }

  // Try progressively broader glob patterns
  const patterns = [
    `**/${partial}`,
    `**/${partial}*`,
    `**/*${partial}*`,
  ];

  const results = new Set<string>();
  for (const pattern of patterns) {
    try {
      const matches = await glob(pattern, {
        cwd: searchDir,
        absolute: true,
        dot: false,
        onlyFiles: false,
      });
      for (const match of matches.slice(0, 10)) {
        results.add(match);
      }
    } catch {
      // Skip invalid patterns silently
    }
    if (results.size >= 10) break;
  }

  return Array.from(results).slice(0, 10);
}

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

/** A raw @mention extracted from a user message. */
interface Mention {
  /** The full @mention text including the `@` prefix (e.g. `@src/server.ts`). */
  readonly raw: string;
  /** The path portion without the leading `@` (e.g. `src/server.ts`). */
  readonly path: string;
  /** Character index where the mention starts in the message. */
  readonly index: number;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Known @mentions that refer to subagent modes, not file paths.
 * These are filtered out during extraction.
 */
const SUBAGENT_MENTIONS = new Set([
  'explore',
  'infra',
  'security',
  'cost',
  'general',
]);

/**
 * Extract @path mentions from a message string.
 *
 * Matches `@` followed by path-like characters (letters, digits,
 * `.`, `/`, `-`, `_`, `*`). Skips known subagent @mentions such as
 * `@explore` and `@security`.
 *
 * @param message - The raw user message.
 * @returns An array of extracted {@link Mention} objects.
 */
function extractMentions(message: string): Mention[] {
  const mentions: Mention[] = [];
  // Match @followed by path-like strings (letters, numbers, ., /, -, _, *)
  const regex = /@([\w./\-*]+(?:\/[\w./\-*]*)*)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(message)) !== null) {
    const pathPart = match[1];
    // Skip subagent mentions that are not file references
    if (SUBAGENT_MENTIONS.has(pathPart)) {
      continue;
    }
    mentions.push({
      raw: match[0],
      path: pathPart,
      index: match.index,
    });
  }

  return mentions;
}

/**
 * Resolve a path reference to an absolute path on disk.
 *
 * Resolution order:
 *   1. If the path is absolute and exists, return it.
 *   2. If the path resolves relative to `cwd` and exists, return it.
 *   3. Attempt a fuzzy search; return the match only if exactly one result is found.
 *   4. Return `null` if no match can be determined.
 *
 * @param filePath - The path extracted from the @mention.
 * @param cwd      - The working directory for relative resolution.
 * @returns The resolved absolute path, or `null` if not found.
 */
async function resolveFilePath(
  filePath: string,
  cwd: string,
): Promise<string | null> {
  // Try absolute path
  if (path.isAbsolute(filePath) && fs.existsSync(filePath)) {
    return filePath;
  }

  // Try relative to cwd
  const resolved = path.resolve(cwd, filePath);
  if (fs.existsSync(resolved)) {
    return resolved;
  }

  // Try fuzzy search — only accept unambiguous single matches
  const matches = await fuzzyFileSearch(filePath, cwd);
  if (matches.length === 1) {
    return matches[0];
  }

  return null;
}

/**
 * Build a context string for a directory reference.
 *
 * Produces a simple listing of the directory's immediate children,
 * labelling each entry as `[DIR]` or `[FILE]`.
 *
 * @param dirPath - Absolute path to the directory.
 * @returns A human-readable directory listing.
 */
async function buildDirectoryContext(dirPath: string): Promise<string> {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const lines: string[] = [`Directory: ${dirPath}\n`];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      lines.push(`  [DIR]  ${entry.name}/`);
    } else {
      lines.push(`  [FILE] ${entry.name}`);
    }
  }

  return lines.join('\n');
}

/**
 * Rough token estimate based on character count.
 *
 * Uses the common heuristic of ~4 characters per token, which is
 * a reasonable average across English text and source code.
 *
 * @param text - The text to estimate.
 * @returns Approximate token count (rounded up).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to approximately the given number of tokens.
 *
 * Appends a `(truncated)` indicator so the LLM knows the content
 * was cut short.
 *
 * @param text      - The text to truncate.
 * @param maxTokens - The target token budget.
 * @returns The truncated text with a trailing indicator.
 */
function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n\n... (truncated)';
}

/**
 * Get a detailed breakdown of how the context window is being used
 * by injected file references.
 *
 * Used by the `/context` TUI command to display a summary of file
 * injection usage alongside the broader context breakdown from the
 * {@link ContextManager}.
 *
 * @param _systemPrompt - The system prompt (reserved for future use).
 * @param references - The resolved file references currently in context.
 * @param totalBudget - The total token budget allocated for file injection.
 * @returns A summary of file reference token usage.
 */
export function getContextBreakdown(
  _systemPrompt: string,
  references: readonly FileReference[],
  totalBudget: number,
): {
  fileCount: number;
  totalFileTokens: number;
  budgetUsed: number;
  budgetPercent: number;
} {
  const totalFileTokens = references.reduce(
    (sum, ref) => sum + ref.tokenCount,
    0,
  );
  const budgetPercent =
    totalBudget > 0
      ? Math.round((totalFileTokens / totalBudget) * 100)
      : 0;
  return {
    fileCount: references.length,
    totalFileTokens,
    budgetUsed: totalFileTokens,
    budgetPercent,
  };
}
