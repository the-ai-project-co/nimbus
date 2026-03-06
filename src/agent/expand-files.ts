/**
 * Shared @file reference expansion utility.
 *
 * Replaces @path/to/file references in a prompt with the file contents
 * wrapped in <file> tags. Files larger than 10KB are truncated.
 *
 * Security: blocks path traversal (../../etc/passwd) and sensitive file patterns.
 *
 * Special tokens (G22):
 *   @workspace — concatenates all .tf files in cwd (up to 50KB)
 *   @cluster   — instructs the agent to use the kubectl tool (async call not possible here)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Sensitive file patterns that should never be expanded. */
const SENSITIVE_FILE_RE = /(\.env|\.pem|\.key|\.p12|\.pfx|id_rsa|id_ed25519|credentials|\.netrc)$/i;

/**
 * Expand @file references in a prompt string.
 * Replaces @path/to/file with the file contents wrapped in <file> tags.
 * Files larger than 10KB are truncated.
 *
 * Security: blocks path traversal outside the project root and sensitive
 * file patterns (.env, .pem, .key, credentials, etc.).
 */
export function expandFileReferences(text: string, cwd: string = process.cwd()): string {
  const fileRefs = text.match(/@([\w./_-]+)/g);
  if (!fileRefs) return text;

  let expanded = text;

  // G22: Handle @workspace special token — concatenate all .tf files
  if (expanded.includes('@workspace')) {
    try {
      const tfFiles = fs.readdirSync(cwd).filter(f => f.endsWith('.tf'));
      if (tfFiles.length > 0) {
        const parts: string[] = [];
        let totalSize = 0;
        const MAX_SIZE = 50_000;
        for (const file of tfFiles) {
          if (totalSize >= MAX_SIZE) { parts.push('... [truncated — 50KB limit reached]'); break; }
          try {
            const content = fs.readFileSync(path.join(cwd, file), 'utf-8');
            parts.push(`\n<file path="${file}">\n${content.slice(0, Math.min(content.length, MAX_SIZE - totalSize))}\n</file>`);
            totalSize += content.length;
          } catch { /* skip unreadable files */ }
        }
        expanded = expanded.replace('@workspace', parts.join('\n'));
      } else {
        expanded = expanded.replace('@workspace', '[No .tf files found in current directory]');
      }
    } catch {
      expanded = expanded.replace('@workspace', '[Error reading workspace files]');
    }
  }

  // G22: Handle @cluster special token — kubectl get all
  // @cluster requires an async kubectl call — guide agent to use the kubectl tool instead
  if (expanded.includes('@cluster')) {
    expanded = expanded.replace(
      '@cluster',
      '[Use the kubectl tool with action=get and args="all -A" to retrieve cluster resources]'
    );
  }

  for (const ref of fileRefs) {
    // Skip special tokens already handled above
    if (ref === '@workspace' || ref === '@cluster') {
      continue;
    }

    const filePath = ref.slice(1);
    try {
      const resolved = path.resolve(cwd, filePath);

      // Security: block path traversal outside project root
      const rel = path.relative(cwd, resolved);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        expanded = expanded.replace(
          ref,
          `[File blocked: path "${filePath}" is outside the project directory]`
        );
        continue;
      }

      // Security: block sensitive file patterns
      if (SENSITIVE_FILE_RE.test(resolved)) {
        expanded = expanded.replace(
          ref,
          `[File blocked: "${filePath}" matches sensitive file pattern]`
        );
        continue;
      }

      const content = fs.readFileSync(resolved, 'utf-8');
      const truncated =
        content.length > 10_000
          ? `${content.slice(0, 10_000)}\n... (truncated — showing 10,000 of ${content.length.toLocaleString()} chars)`
          : content;
      expanded = expanded.replace(ref, `\n<file path="${filePath}">\n${truncated}\n</file>`);
    } catch {
      // File not found — leave the @reference as-is
    }
  }
  return expanded;
}
