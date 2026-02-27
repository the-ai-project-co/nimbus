/**
 * Hooks Configuration
 *
 * Parses and validates `.nimbus/hooks.yaml` configuration files.
 * Provides types and utilities for the Nimbus hooks system that allows
 * users to run custom scripts before/after tool invocations.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Events that can trigger hook execution */
export type HookEvent = 'PreToolUse' | 'PostToolUse' | 'PermissionRequest';

/** All valid hook event names for validation */
const VALID_HOOK_EVENTS: readonly HookEvent[] = [
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
] as const;

/**
 * A single hook definition specifying when and what to run.
 *
 * @example
 * ```yaml
 * - match: "edit_file|write_file"
 *   command: ".nimbus/hooks/pre-edit.sh"
 *   timeout: 30000
 * ```
 */
export interface HookDefinition {
  /** Regex pattern to match tool names (e.g. "edit_file|write_file") */
  match: string;
  /** Shell command or path to script to execute */
  command: string;
  /** Timeout in milliseconds before the hook is killed (default: 30000) */
  timeout?: number;
}

/**
 * Top-level hooks configuration parsed from `.nimbus/hooks.yaml`.
 *
 * @example
 * ```yaml
 * hooks:
 *   PreToolUse:
 *     - match: "edit_file|write_file"
 *       command: ".nimbus/hooks/pre-edit.sh"
 *   PostToolUse:
 *     - match: "edit_file|write_file"
 *       command: ".nimbus/hooks/auto-format.sh"
 *   PermissionRequest:
 *     - match: "*"
 *       command: ".nimbus/hooks/audit-permission.sh"
 * ```
 */
export interface HooksConfig {
  hooks: Record<HookEvent, HookDefinition[]>;
}

/** Default timeout in milliseconds for hook execution */
export const DEFAULT_HOOK_TIMEOUT = 30_000;

// ---------------------------------------------------------------------------
// Minimal YAML Parser
// ---------------------------------------------------------------------------

/**
 * Represents a single line of parsed YAML content with its indentation level.
 */
interface YamlLine {
  indent: number;
  content: string;
}

/**
 * Parse raw YAML text into an array of meaningful lines with indentation info.
 * Strips comments and blank lines.
 *
 * @param text - Raw YAML content
 * @returns Array of parsed lines with indentation levels
 */
function tokenizeYaml(text: string): YamlLine[] {
  const lines: YamlLine[] = [];
  for (const raw of text.split('\n')) {
    // Strip inline comments (but not inside quoted strings)
    const withoutComment = raw.replace(/#.*$/, '');
    const trimmed = withoutComment.trimEnd();
    if (trimmed.length === 0) {
      continue;
    }
    const indent = trimmed.search(/\S/);
    if (indent === -1) {
      continue;
    }
    lines.push({ indent, content: trimmed.trim() });
  }
  return lines;
}

/**
 * Remove surrounding quotes (single or double) from a string value.
 *
 * @param value - Potentially quoted string
 * @returns Unquoted string
 */
function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Coerce a raw YAML string value to the appropriate JS primitive.
 *
 * @param raw - Raw string value from YAML
 * @returns Coerced value (string, number, boolean, or null)
 */
function coerceValue(raw: string): string | number | boolean | null {
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  if (raw === 'null' || raw === '~') {
    return null;
  }

  const unquoted = unquote(raw);
  if (unquoted !== raw) {
    // Was quoted -- keep as string
    return unquoted;
  }

  // Try number coercion
  if (raw !== '' && !isNaN(Number(raw))) {
    return Number(raw);
  }
  return raw;
}

/**
 * Minimal recursive-descent YAML parser.
 *
 * Handles the subset of YAML needed for hooks configuration:
 * - Top-level maps
 * - Arrays of objects (using `- key: value` syntax)
 * - Scalar values (string, number, boolean)
 * - Nested maps
 *
 * This is intentionally NOT a full YAML parser. It covers the structure
 * required by `.nimbus/hooks.yaml` without requiring an external dependency.
 *
 * @param text - Raw YAML content
 * @returns Parsed object
 */
function parseYaml(text: string): Record<string, unknown> {
  const lines = tokenizeYaml(text);
  let pos = 0;

  /**
   * Parse a mapping (object) at the given indentation level.
   */
  function parseMapping(minIndent: number): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    while (pos < lines.length) {
      const line = lines[pos];

      // If the line is at a lower indent, we've left this mapping
      if (line.indent < minIndent) {
        break;
      }

      // Skip lines that are deeper than expected (shouldn't happen in
      // well-formed input, but be defensive)
      if (line.indent > minIndent && !line.content.startsWith('- ')) {
        pos++;
        continue;
      }

      // Array items are handled by the caller (parseArray)
      if (line.content.startsWith('- ')) {
        break;
      }

      const colonIdx = line.content.indexOf(':');
      if (colonIdx === -1) {
        pos++;
        continue;
      }

      const key = line.content.slice(0, colonIdx).trim();
      const rest = line.content.slice(colonIdx + 1).trim();

      pos++;

      if (rest.length > 0) {
        // Inline scalar value: `key: value`
        result[key] = coerceValue(rest);
      } else {
        // Value is on subsequent indented lines -- either a nested map or array
        if (pos < lines.length && lines[pos].indent > minIndent) {
          const childIndent = lines[pos].indent;
          if (lines[pos].content.startsWith('- ')) {
            result[key] = parseArray(childIndent);
          } else {
            result[key] = parseMapping(childIndent);
          }
        } else {
          // Empty value
          result[key] = null;
        }
      }
    }

    return result;
  }

  /**
   * Parse an array at the given indentation level.
   * Each array element starts with `- ` and can contain inline key-value
   * pairs or a nested block mapping.
   */
  function parseArray(minIndent: number): unknown[] {
    const result: unknown[] = [];

    while (pos < lines.length) {
      const line = lines[pos];

      if (line.indent < minIndent) {
        break;
      }

      if (!line.content.startsWith('- ')) {
        break;
      }

      // Strip the leading `- `
      const afterDash = line.content.slice(2).trim();
      pos++;

      if (afterDash.includes(':')) {
        // Inline object start: `- key: value`
        const obj: Record<string, unknown> = {};
        const colonIdx = afterDash.indexOf(':');
        const key = afterDash.slice(0, colonIdx).trim();
        const val = afterDash.slice(colonIdx + 1).trim();
        obj[key] = val.length > 0 ? coerceValue(val) : null;

        // Collect subsequent indented key-value pairs belonging to the same item
        while (pos < lines.length) {
          const next = lines[pos];
          // Must be indented deeper than the `- ` marker and NOT be another array item
          if (next.indent <= minIndent || next.content.startsWith('- ')) {
            break;
          }
          const nextColon = next.content.indexOf(':');
          if (nextColon === -1) {
            pos++;
            continue;
          }
          const nk = next.content.slice(0, nextColon).trim();
          const nv = next.content.slice(nextColon + 1).trim();
          obj[nk] = nv.length > 0 ? coerceValue(nv) : null;
          pos++;
        }

        result.push(obj);
      } else if (afterDash.length > 0) {
        // Scalar array element: `- value`
        result.push(coerceValue(afterDash));
      } else {
        // Block-style object under `- `
        if (pos < lines.length && lines[pos].indent > minIndent) {
          const childIndent = lines[pos].indent;
          result.push(parseMapping(childIndent));
        }
      }
    }

    return result;
  }

  return parseMapping(0);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a single hook definition and return any errors found.
 *
 * Checks:
 * - `match` is a non-empty string that compiles as a valid RegExp
 * - `command` is a non-empty string
 * - `timeout`, if provided, is a positive number
 *
 * @param hook - The hook definition to validate
 * @returns Array of human-readable error strings (empty if valid)
 */
export function validateHookDefinition(hook: HookDefinition): string[] {
  const errors: string[] = [];

  // match
  if (typeof hook.match !== 'string' || hook.match.length === 0) {
    errors.push('hook "match" must be a non-empty string');
  } else {
    try {
      new RegExp(hook.match);
    } catch {
      errors.push(`hook "match" is not a valid regex: "${hook.match}"`);
    }
  }

  // command
  if (typeof hook.command !== 'string' || hook.command.length === 0) {
    errors.push('hook "command" must be a non-empty string');
  }

  // timeout (optional)
  if (hook.timeout !== undefined) {
    if (typeof hook.timeout !== 'number' || hook.timeout <= 0) {
      errors.push('hook "timeout" must be a positive number');
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load and validate a hooks configuration from `<projectDir>/.nimbus/hooks.yaml`.
 *
 * @param projectDir - Absolute or relative path to the project root directory
 * @returns Parsed and validated `HooksConfig`, or `null` if the file does not exist
 * @throws Error if the file exists but contains invalid configuration
 *
 * @example
 * ```ts
 * const config = loadHooksConfig('/path/to/project');
 * if (config) {
 *   console.log(config.hooks.PreToolUse);
 * }
 * ```
 */
export function loadHooksConfig(projectDir: string): HooksConfig | null {
  const configPath = path.join(projectDir, '.nimbus', 'hooks.yaml');

  if (!fs.existsSync(configPath)) {
    return null;
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = parseYaml(raw) as Record<string, unknown>;

  // Validate top-level structure
  if (!parsed.hooks || typeof parsed.hooks !== 'object') {
    throw new Error(`Invalid hooks config at ${configPath}: missing top-level "hooks" key`);
  }

  const hooksRaw = parsed.hooks as Record<string, unknown>;

  // Build the validated config, ensuring all three event types are present
  const config: HooksConfig = {
    hooks: {
      PreToolUse: [],
      PostToolUse: [],
      PermissionRequest: [],
    },
  };

  for (const [eventName, definitions] of Object.entries(hooksRaw)) {
    // Validate event name
    if (!VALID_HOOK_EVENTS.includes(eventName as HookEvent)) {
      throw new Error(
        `Invalid hooks config at ${configPath}: unknown hook event "${eventName}". ` +
          `Valid events: ${VALID_HOOK_EVENTS.join(', ')}`
      );
    }

    const event = eventName as HookEvent;

    if (!Array.isArray(definitions)) {
      throw new Error(
        `Invalid hooks config at ${configPath}: "${eventName}" must be an array of hook definitions`
      );
    }

    for (let i = 0; i < definitions.length; i++) {
      const def = definitions[i] as Record<string, unknown>;

      if (typeof def !== 'object' || def === null) {
        throw new Error(
          `Invalid hooks config at ${configPath}: ${eventName}[${i}] must be an object`
        );
      }

      const hookDef: HookDefinition = {
        match: String(def.match ?? ''),
        command: String(def.command ?? ''),
        timeout:
          def.timeout !== undefined && def.timeout !== null ? Number(def.timeout) : undefined,
      };

      const validationErrors = validateHookDefinition(hookDef);
      if (validationErrors.length > 0) {
        throw new Error(
          `Invalid hooks config at ${configPath}: ${eventName}[${i}]: ${validationErrors.join('; ')}`
        );
      }

      config.hooks[event].push(hookDef);
    }
  }

  return config;
}
