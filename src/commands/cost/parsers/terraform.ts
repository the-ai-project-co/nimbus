/**
 * Terraform HCL Parser
 *
 * A simplified HCL parser that extracts resource blocks and their attributes
 * from .tf files. Handles the most common HCL patterns including nested blocks,
 * string/number/boolean attributes, and single-line comments.
 *
 * This is intentionally not a full HCL grammar parser -- it covers the patterns
 * found in the vast majority of real-world Terraform configurations.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TerraformResource } from './types';

export { TerraformResource };

export class TerraformParser {
  /**
   * Parse all .tf files in a directory (non-recursive for safety).
   * Skips files that cannot be read and continues with the rest.
   */
  async parseDirectory(directory: string): Promise<TerraformResource[]> {
    const entries = fs.readdirSync(directory);
    const tfFiles = entries.filter(f => f.endsWith('.tf'));
    const resources: TerraformResource[] = [];

    for (const file of tfFiles) {
      try {
        const content = fs.readFileSync(path.join(directory, file), 'utf-8');
        resources.push(...this.parseHCL(content));
      } catch {
        // Skip files that cannot be read (permissions, encoding, etc.)
      }
    }

    return resources;
  }

  /**
   * Parse HCL content and extract all resource blocks.
   *
   * Strategy:
   *  1. Strip comments (# and //)
   *  2. Find top-level `resource "type" "name"` declarations
   *  3. Extract the balanced brace block body
   *  4. Parse attributes (including nested blocks) from the body
   */
  parseHCL(content: string): TerraformResource[] {
    const resources: TerraformResource[] = [];

    // Strip single-line comments but preserve newlines for line-based matching
    const stripped = this.stripComments(content);

    // We use a manual scan to find resource blocks because regex alone
    // cannot reliably match balanced braces with arbitrary nesting depth.
    const resourceKeyword = 'resource';
    let pos = 0;

    while (pos < stripped.length) {
      // Find next occurrence of the word "resource" at a word boundary
      const idx = stripped.indexOf(resourceKeyword, pos);
      if (idx === -1) break;

      // Make sure it is a standalone keyword (not part of another word)
      const before = idx > 0 ? stripped[idx - 1] : '\n';
      const after = stripped[idx + resourceKeyword.length];
      if (/\w/.test(before) || (after !== undefined && /[^\s"]/.test(after))) {
        pos = idx + resourceKeyword.length;
        continue;
      }

      // Parse: resource "type" "name" {
      const afterKeyword = stripped.substring(idx + resourceKeyword.length);
      const headerMatch = afterKeyword.match(/^\s+"([^"]+)"\s+"([^"]+)"\s*\{/);
      if (!headerMatch) {
        pos = idx + resourceKeyword.length;
        continue;
      }

      const type = headerMatch[1];
      const name = headerMatch[2];

      // Find the balanced closing brace
      const braceStart = idx + resourceKeyword.length + headerMatch[0].indexOf('{');
      const body = this.extractBlock(stripped, braceStart);
      if (body === null) {
        pos = idx + resourceKeyword.length;
        continue;
      }

      const attributes = this.parseAttributes(body);
      const provider = this.detectProvider(type);

      resources.push({ type, name, provider, attributes });

      // Advance past the block we just parsed
      pos = braceStart + body.length + 2; // +2 for the opening and closing braces
    }

    return resources;
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Strip single-line comments (# and //) and multi-line comments.
   * Preserves newlines so that line-based attribute parsing still works.
   */
  private stripComments(content: string): string {
    let result = '';
    let i = 0;
    let inString = false;

    while (i < content.length) {
      // Handle string literals -- don't strip inside them
      if (content[i] === '"' && (i === 0 || content[i - 1] !== '\\')) {
        inString = !inString;
        result += content[i];
        i++;
        continue;
      }

      if (inString) {
        result += content[i];
        i++;
        continue;
      }

      // Multi-line comment /* ... */
      if (content[i] === '/' && content[i + 1] === '*') {
        const end = content.indexOf('*/', i + 2);
        if (end === -1) break;
        // Preserve newlines
        const chunk = content.substring(i, end + 2);
        result += chunk.replace(/[^\n]/g, ' ');
        i = end + 2;
        continue;
      }

      // Single-line comments: # or //
      if (content[i] === '#' || (content[i] === '/' && content[i + 1] === '/')) {
        const nl = content.indexOf('\n', i);
        if (nl === -1) break;
        result += ' '.repeat(nl - i) + '\n';
        i = nl + 1;
        continue;
      }

      result += content[i];
      i++;
    }

    return result;
  }

  /**
   * Extract the content between balanced braces starting at `start`.
   * `start` must point to the opening '{'.
   * Returns the inner content (without the outer braces), or null on failure.
   */
  private extractBlock(content: string, start: number): string | null {
    if (content[start] !== '{') return null;
    let depth = 0;
    let inString = false;

    for (let i = start; i < content.length; i++) {
      const ch = content[i];
      if (ch === '"' && (i === 0 || content[i - 1] !== '\\')) {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          return content.substring(start + 1, i);
        }
      }
    }

    return null;
  }

  /**
   * Parse attributes from an HCL block body.
   * Handles:
   *  - string:  key = "value"
   *  - number:  key = 123 or key = 1.5
   *  - boolean: key = true / false
   *  - nested blocks: block_label { ... } -- flattened with prefix
   */
  parseAttributes(body: string): Record<string, any> {
    const attrs: Record<string, any> = {};

    // Match simple key = "value" patterns
    const stringAttrRegex = /^\s*(\w[\w.-]*)\s*=\s*"([^"]*)"$/gm;
    let match: RegExpExecArray | null;
    while ((match = stringAttrRegex.exec(body)) !== null) {
      attrs[match[1]] = match[2];
    }

    // Match numeric assignments: key = 123  (or 1.5)
    const numAttrRegex = /^\s*(\w[\w.-]*)\s*=\s*(\d+(?:\.\d+)?)\s*$/gm;
    while ((match = numAttrRegex.exec(body)) !== null) {
      attrs[match[1]] = parseFloat(match[2]);
    }

    // Match boolean assignments: key = true / false
    const boolAttrRegex = /^\s*(\w[\w.-]*)\s*=\s*(true|false)\s*$/gm;
    while ((match = boolAttrRegex.exec(body)) !== null) {
      attrs[match[1]] = match[2] === 'true';
    }

    // Parse nested blocks and flatten with prefix
    // e.g. root_block_device { volume_size = 50 } => root_block_device.volume_size = 50
    const nestedBlockRegex = /(\w[\w.-]*)\s*\{/g;
    let nestedMatch: RegExpExecArray | null;
    while ((nestedMatch = nestedBlockRegex.exec(body)) !== null) {
      const blockName = nestedMatch[1];
      // Skip if this looks like an assignment (key = {) -- that is a map literal
      const beforeBrace = body.substring(0, nestedMatch.index + blockName.length);
      if (/=\s*$/.test(beforeBrace.substring(Math.max(0, beforeBrace.length - 10)))) {
        continue;
      }
      const innerBody = this.extractBlock(body, nestedMatch.index + blockName.length + body.substring(nestedMatch.index + blockName.length).indexOf('{'));
      if (innerBody) {
        const innerAttrs = this.parseAttributes(innerBody);
        for (const [k, v] of Object.entries(innerAttrs)) {
          attrs[`${blockName}.${k}`] = v;
        }
      }
    }

    return attrs;
  }

  /**
   * Detect the cloud provider from the Terraform resource type prefix.
   */
  private detectProvider(type: string): 'aws' | 'gcp' | 'azure' | 'unknown' {
    if (type.startsWith('aws_')) return 'aws';
    if (type.startsWith('google_')) return 'gcp';
    if (type.startsWith('azurerm_')) return 'azure';
    return 'unknown';
  }
}
