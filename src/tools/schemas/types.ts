/**
 * Nimbus Agentic Tool-Use Type System
 *
 * Core type definitions for the agentic tool-use system. Every tool that
 * Nimbus can invoke -- whether a built-in operation, a DevOps command, or
 * an MCP server tool -- is described by a {@link ToolDefinition} and
 * registered in the {@link ToolRegistry}.
 *
 * The permission model follows a four-tier escalation ladder
 * ({@link PermissionTier}) that controls whether a tool invocation requires
 * user confirmation, and the three-category taxonomy ({@link ToolCategory})
 * allows consumers to filter tools by surface area.
 *
 * Provider-specific serialization helpers ({@link AnthropicTool},
 * {@link OpenAITool}, {@link GoogleTool}) let the engine convert a single
 * {@link ToolDefinition} into whatever shape each LLM API expects.
 *
 * @module tools/schemas/types
 */

import type { z } from 'zod';
import type { JSONSchema } from '../../llm/types';

// ---------------------------------------------------------------------------
// Permission Tiers
// ---------------------------------------------------------------------------

/**
 * Four-tier permission model that governs how tool invocations are
 * authorized at runtime.
 *
 * | Tier           | Prompt behavior                              | Example tools                     |
 * | -------------- | -------------------------------------------- | --------------------------------- |
 * | `auto_allow`   | Execute immediately, no user prompt           | `read_file`, `terraform validate` |
 * | `ask_once`     | Ask user once per session, then auto-allow    | `write_file`, non-destructive bash |
 * | `always_ask`   | Always prompt the user before execution       | `terraform apply`, `kubectl delete` |
 * | `blocked`      | Never allow, even if the user tries to force  | `rm -rf /`, `DROP DATABASE`       |
 */
export type PermissionTier = 'auto_allow' | 'ask_once' | 'always_ask' | 'blocked';

/**
 * Ordered list of all permission tiers from least restrictive to most
 * restrictive. Useful for comparison and escalation logic.
 */
export const PERMISSION_TIER_ORDER: readonly PermissionTier[] = [
  'auto_allow',
  'ask_once',
  'always_ask',
  'blocked',
] as const;

/**
 * Return the numeric severity index of a {@link PermissionTier}.
 * Lower values are less restrictive.
 *
 * @param tier - The permission tier to evaluate.
 * @returns An integer from 0 (`auto_allow`) to 3 (`blocked`).
 */
export function permissionTierIndex(tier: PermissionTier): number {
  return PERMISSION_TIER_ORDER.indexOf(tier);
}

// ---------------------------------------------------------------------------
// Backward-compatible alias
// ---------------------------------------------------------------------------

/**
 * Alias kept for backward compatibility with code that references the
 * previous type name. Prefer {@link PermissionTier} in new code.
 *
 * @deprecated Use {@link PermissionTier} instead.
 */
export type PermissionLevel = PermissionTier;

// ---------------------------------------------------------------------------
// Tool Categories
// ---------------------------------------------------------------------------

/**
 * High-level taxonomy that groups tools by their operational surface area.
 *
 * - `standard` -- built-in operations such as file I/O, search, and git.
 * - `devops`   -- infrastructure tools: Terraform, Kubernetes, Helm, cloud CLIs.
 * - `mcp`      -- tools sourced from external MCP (Model Context Protocol) servers.
 */
export type ToolCategory = 'standard' | 'devops' | 'mcp';

// ---------------------------------------------------------------------------
// Tool Result
// ---------------------------------------------------------------------------

/**
 * The value returned by every tool execution. Consumers should check
 * {@link isError} before reading {@link output}.
 */
export interface ToolResult {
  /** The textual output produced by the tool. */
  output: string;

  /**
   * Human-readable error message. Present only when {@link isError} is
   * `true`.
   */
  error?: string;

  /** Whether the execution failed. */
  isError: boolean;
}

// ---------------------------------------------------------------------------
// Tool Definition
// ---------------------------------------------------------------------------

/**
 * Complete description of an executable tool.
 *
 * Each tool carries its own Zod input schema so that the engine can
 * validate arguments before execution, and its own permission tier so
 * that the permission engine can decide whether to prompt the user.
 *
 * @example
 * ```ts
 * const readFileTool: ToolDefinition = {
 *   name: 'read_file',
 *   description: 'Read the contents of a file at the given path.',
 *   inputSchema: z.object({
 *     path: z.string().describe('Absolute or workspace-relative file path'),
 *     encoding: z.enum(['utf-8', 'base64']).default('utf-8'),
 *   }),
 *   execute: async (input) => {
 *     const content = await fs.readFile(input.path, input.encoding);
 *     return { output: content, isError: false };
 *   },
 *   permissionTier: 'auto_allow',
 *   category: 'standard',
 *   isDestructive: false,
 * };
 * ```
 */
export interface ToolDefinition {
  /**
   * Unique snake_case identifier for this tool (e.g. `'read_file'`,
   * `'terraform_apply'`).
   */
  name: string;

  /**
   * Natural-language description surfaced to the LLM so it understands
   * when and how to invoke this tool.
   */
  description: string;

  /**
   * Zod schema that validates and parses the raw input object before it
   * reaches {@link execute}. The schema is also converted to JSON Schema
   * for provider APIs via {@link zodToJsonSchema}.
   */
  inputSchema: z.ZodType<unknown>;

  /**
   * Execute the tool with validated input and return a {@link ToolResult}.
   *
   * Implementations should catch their own errors and return them inside
   * the result rather than throwing, so that the agentic loop can report
   * the failure back to the LLM gracefully.
   *
   * @param input - The validated (parsed) input object.
   * @returns A promise resolving to the tool's output.
   */
  execute: (input: unknown) => Promise<ToolResult>;

  /**
   * Which permission tier this tool belongs to. Determines whether the
   * user is prompted before execution.
   */
  permissionTier: PermissionTier;

  /**
   * High-level category for filtering and display purposes.
   */
  category: ToolCategory;

  /**
   * Whether this tool modifies external state (files, infrastructure,
   * databases, etc.). Defaults to `false` when omitted.
   *
   * Tools marked destructive are surfaced with extra warnings in the CLI
   * and are never auto-approved in CI mode.
   */
  isDestructive?: boolean;
}

// ---------------------------------------------------------------------------
// Helper / Utility Types
// ---------------------------------------------------------------------------

/**
 * Infer the validated input type from a {@link ToolDefinition}'s
 * `inputSchema`.
 *
 * @example
 * ```ts
 * type ReadFileInput = ToolInput<typeof readFileTool>;
 * // { path: string; encoding?: 'utf-8' | 'base64' }
 * ```
 */
export type ToolInput<T extends ToolDefinition> =
  T['inputSchema'] extends z.ZodType<infer U> ? U : never;

// ---------------------------------------------------------------------------
// Provider-Specific Tool Formats
// ---------------------------------------------------------------------------

/**
 * Tool definition formatted for the Anthropic Messages API.
 *
 * Anthropic expects each tool to be an object with `name`, `description`,
 * and an `input_schema` that must have `type: 'object'` at the top level.
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/tool-use
 */
export interface AnthropicTool {
  /** Tool name -- must match `[a-zA-Z0-9_-]+` and be <= 64 chars. */
  name: string;

  /** Description surfaced to the model. */
  description: string;

  /**
   * JSON Schema describing the expected input. Anthropic requires this
   * to have `type: 'object'` at the top level.
   */
  input_schema: JSONSchema & { type: 'object' };
}

/**
 * Tool definition formatted for the OpenAI Chat Completions API
 * (function calling).
 *
 * OpenAI wraps each function in a `{ type: 'function', function: { ... } }`
 * envelope.
 *
 * @see https://platform.openai.com/docs/guides/function-calling
 */
export interface OpenAITool {
  /** Always `'function'` for the function-calling interface. */
  type: 'function';

  /** The function metadata. */
  function: {
    /** Function name. */
    name: string;

    /** Description surfaced to the model. */
    description: string;

    /** JSON Schema for the function parameters. */
    parameters: JSONSchema;
  };
}

/**
 * Tool definition formatted for the Google Generative AI
 * (`@google/generative-ai`) function declarations.
 *
 * Google wraps all function declarations inside a single tool object with
 * a `functionDeclarations` array.
 *
 * @see https://ai.google.dev/gemini-api/docs/function-calling
 */
export interface GoogleTool {
  /** Array of function declarations passed inside a single tool object. */
  functionDeclarations: Array<{
    /** Function name. */
    name: string;

    /** Description surfaced to the model. */
    description: string;

    /**
     * Parameters described as a JSON Schema object. Google expects the
     * top-level `type` to be the string `'OBJECT'`.
     */
    parameters: JSONSchema & { type: 'OBJECT' };
  }>;
}

// ---------------------------------------------------------------------------
// JSON Schema Conversion Utility
// ---------------------------------------------------------------------------

/**
 * Convert a Zod schema into a plain JSON Schema object suitable for
 * provider APIs.
 *
 * This is a lightweight converter that handles the most common Zod types
 * used in tool definitions (objects, strings, numbers, booleans, arrays,
 * enums, optionals, and defaults). For deeply nested or exotic schemas
 * consider using a full-featured library like `zod-to-json-schema`.
 *
 * @param schema - Any Zod schema.
 * @returns A JSON Schema object.
 */
export function zodToJsonSchema(schema: z.ZodType<unknown>): JSONSchema {
  return convertZodNode(schema);
}

/**
 * Internal recursive walker that translates individual Zod nodes into
 * their JSON Schema equivalents.
 *
 * Because this function must work with Zod v3 _and_ v4 (whose generic
 * constraints differ significantly), the runtime casts use `any` to
 * bypass version-specific type parameter requirements. This is safe
 * because every branch is guarded by a runtime type-tag check first.
 */
function convertZodNode(schema: z.ZodType<unknown>): JSONSchema {
  // Cast once to `any` for internal introspection. Every access below is
  // guarded by a runtime type-tag check, so this is safe.
  const s: any = schema;

  // Unwrap ZodOptional / ZodNullable / ZodDefault to reach the inner type.
  if (isZodOptional(schema)) {
    return convertZodNode(s.unwrap());
  }
  if (isZodDefault(schema)) {
    const inner = convertZodNode(s.removeDefault());
    // Zod v3: _def.defaultValue is a function. Zod v4: it is a plain value.
    const raw = s._def?.defaultValue ?? s._zod?.def?.defaultValue;
    const defaultValue = typeof raw === 'function' ? raw() : raw;
    return { ...inner, default: defaultValue };
  }
  if (isZodNullable(schema)) {
    const inner = convertZodNode(s.unwrap());
    return { ...inner, nullable: true };
  }

  // ZodObject
  if (isZodObject(schema)) {
    const shape: Record<string, z.ZodType<unknown>> = s.shape;
    const properties: Record<string, JSONSchema> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const fieldSchema = value as z.ZodType<unknown>;
      properties[key] = convertZodNode(fieldSchema);

      // Attach description from .describe() if present.
      // Zod v3: _def.description.  Zod v4: _zod.def.description.
      const fieldAny = fieldSchema as any;
      const desc: string | undefined =
        fieldAny._def?.description ?? fieldAny._zod?.def?.description;
      if (desc) {
        properties[key].description = desc;
      }

      // A field is required unless it is optional/default-wrapped.
      if (!isZodOptional(fieldSchema) && !isZodDefault(fieldSchema)) {
        required.push(key);
      }
    }

    const result: JSONSchema = { type: 'object', properties };
    if (required.length > 0) {
      result.required = required;
    }

    const objDesc: string | undefined = s._def?.description ?? s._zod?.def?.description;
    if (objDesc) {
      result.description = objDesc;
    }

    return result;
  }

  // ZodString
  if (isZodString(schema)) {
    return { type: 'string' };
  }

  // ZodNumber
  if (isZodNumber(schema)) {
    return { type: 'number' };
  }

  // ZodBoolean
  if (isZodBoolean(schema)) {
    return { type: 'boolean' };
  }

  // ZodEnum
  if (isZodEnum(schema)) {
    // `.options` is available in both Zod v3 and v4.
    const values: unknown[] = s.options;
    return { type: 'string', enum: values };
  }

  // ZodArray
  if (isZodArray(schema)) {
    const itemSchema: z.ZodType<unknown> = s.element;
    return { type: 'array', items: convertZodNode(itemSchema) };
  }

  // ZodLiteral
  if (isZodLiteral(schema)) {
    const value: unknown = s.value;
    return { type: typeof value as string, const: value };
  }

  // ZodUnion (simple enum-like unions of literals)
  if (isZodUnion(schema)) {
    const options: z.ZodType<unknown>[] = s.options;
    return { type: 'object', anyOf: options.map(o => convertZodNode(o)) };
  }

  // ZodRecord
  if (isZodRecord(schema)) {
    // Zod v3: `.valueSchema`.  Zod v4: `._zod.def.valueType`.
    const valueSchema: z.ZodType<unknown> = s.valueSchema ?? s._zod?.def?.valueType;
    if (valueSchema) {
      return { type: 'object', additionalProperties: convertZodNode(valueSchema) };
    }
    return { type: 'object' };
  }

  // Fallback -- treat as opaque object
  return { type: 'object' };
}

// ---------------------------------------------------------------------------
// Zod type-tag guards (work across Zod v3 and v4)
// ---------------------------------------------------------------------------

/**
 * Extract the internal type discriminator from a Zod schema.
 *
 * - Zod v3 stores it at `_def.typeName` (e.g. `'ZodString'`).
 * - Zod v4 stores it at `_zod.def.type` (e.g. `'string'`).
 *
 * We normalize both to the v3-style `'ZodXxx'` name so the guards below
 * can use a single comparison.
 */
function zodTypeName(schema: z.ZodType<unknown>): string {
  const s = schema as any;

  // Zod v3 path
  const v3Name: string | undefined = s._def?.typeName;
  if (v3Name) {
    return v3Name;
  }

  // Zod v4 path: `_zod.def.type` is a lowercase short name like 'string'.
  const v4Type: string | undefined = s._zod?.def?.type;
  if (v4Type) {
    // Capitalize to match Zod v3 convention: 'string' -> 'ZodString'.
    return `Zod${v4Type.charAt(0).toUpperCase()}${v4Type.slice(1)}`;
  }

  return '';
}

function isZodObject(s: z.ZodType<unknown>): boolean {
  return zodTypeName(s) === 'ZodObject';
}
function isZodString(s: z.ZodType<unknown>): boolean {
  return zodTypeName(s) === 'ZodString';
}
function isZodNumber(s: z.ZodType<unknown>): boolean {
  return zodTypeName(s) === 'ZodNumber';
}
function isZodBoolean(s: z.ZodType<unknown>): boolean {
  return zodTypeName(s) === 'ZodBoolean';
}
function isZodEnum(s: z.ZodType<unknown>): boolean {
  return zodTypeName(s) === 'ZodEnum';
}
function isZodArray(s: z.ZodType<unknown>): boolean {
  return zodTypeName(s) === 'ZodArray';
}
function isZodOptional(s: z.ZodType<unknown>): boolean {
  return zodTypeName(s) === 'ZodOptional';
}
function isZodDefault(s: z.ZodType<unknown>): boolean {
  return zodTypeName(s) === 'ZodDefault';
}
function isZodNullable(s: z.ZodType<unknown>): boolean {
  return zodTypeName(s) === 'ZodNullable';
}
function isZodLiteral(s: z.ZodType<unknown>): boolean {
  return zodTypeName(s) === 'ZodLiteral';
}
function isZodUnion(s: z.ZodType<unknown>): boolean {
  return zodTypeName(s) === 'ZodUnion';
}
function isZodRecord(s: z.ZodType<unknown>): boolean {
  return zodTypeName(s) === 'ZodRecord';
}

// ---------------------------------------------------------------------------
// Provider Format Converters
// ---------------------------------------------------------------------------

/**
 * Convert a {@link ToolDefinition} into an {@link AnthropicTool}.
 *
 * @param tool - The tool definition to convert.
 * @returns The tool in Anthropic Messages API format.
 */
export function toAnthropicTool(tool: ToolDefinition): AnthropicTool {
  const jsonSchema = zodToJsonSchema(tool.inputSchema);
  return {
    name: tool.name,
    description: tool.description,
    input_schema: {
      ...jsonSchema,
      type: 'object',
    },
  };
}

/**
 * Convert a {@link ToolDefinition} into an {@link OpenAITool}.
 *
 * @param tool - The tool definition to convert.
 * @returns The tool in OpenAI function-calling format.
 */
export function toOpenAITool(tool: ToolDefinition): OpenAITool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.inputSchema),
    },
  };
}

/**
 * Convert one or more {@link ToolDefinition}s into a single
 * {@link GoogleTool} object (Google expects all declarations inside a
 * single array).
 *
 * @param tools - The tool definitions to convert.
 * @returns The tool in Google Generative AI format.
 */
export function toGoogleTool(tools: readonly ToolDefinition[]): GoogleTool {
  return {
    functionDeclarations: tools.map(tool => {
      const jsonSchema = zodToJsonSchema(tool.inputSchema);
      return {
        name: tool.name,
        description: tool.description,
        parameters: {
          ...jsonSchema,
          type: 'OBJECT' as const,
        },
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Tool Registry
// ---------------------------------------------------------------------------

/**
 * Central, mutable registry that stores all available tool definitions.
 *
 * The registry is intentionally a plain class (not a singleton) so that
 * tests can instantiate isolated instances. Production code should use
 * the shared {@link defaultToolRegistry} export.
 *
 * @example
 * ```ts
 * const registry = new ToolRegistry();
 * registry.register(readFileTool);
 * registry.register(terraformApplyTool);
 *
 * const devopsTools = registry.getByCategory('devops');
 * const anthropicPayload = registry.getAll().map(toAnthropicTool);
 * ```
 */
export class ToolRegistry {
  /** Internal map keyed by tool name. */
  private readonly tools: Map<string, ToolDefinition> = new Map();

  /**
   * Register a tool definition. Throws if a tool with the same name is
   * already registered -- call {@link get} first if you need upsert
   * semantics.
   *
   * @param tool - The tool definition to register.
   * @throws {Error} If a tool with the same {@link ToolDefinition.name}
   *   already exists.
   */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(
        `ToolRegistry: tool '${tool.name}' is already registered. ` +
          `Unregister it first or use a different name.`
      );
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Retrieve a tool definition by name.
   *
   * @param name - The unique tool name.
   * @returns The tool definition, or `undefined` if not found.
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Return every registered tool definition, in insertion order.
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Return all tools that belong to the given {@link ToolCategory}.
   *
   * @param category - The category to filter by.
   * @returns An array of matching tool definitions (may be empty).
   */
  getByCategory(category: ToolCategory): ToolDefinition[] {
    return this.getAll().filter(t => t.category === category);
  }

  /**
   * Return all tools that belong to the given {@link PermissionTier}.
   *
   * @param tier - The permission tier to filter by.
   * @returns An array of matching tool definitions (may be empty).
   */
  getByPermissionTier(tier: PermissionTier): ToolDefinition[] {
    return this.getAll().filter(t => t.permissionTier === tier);
  }

  /**
   * Return the names of all registered tools, in insertion order.
   */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Remove a previously registered tool by name.
   *
   * @param name - The tool name to unregister.
   * @returns `true` if the tool was found and removed, `false` otherwise.
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Remove all registered tools. Primarily useful in tests.
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * The number of currently registered tools.
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Convert all registered tools to the Anthropic Messages API format.
   */
  toAnthropicTools(): AnthropicTool[] {
    return this.getAll().map(toAnthropicTool);
  }

  /**
   * Convert all registered tools to the OpenAI function-calling format.
   */
  toOpenAITools(): OpenAITool[] {
    return this.getAll().map(toOpenAITool);
  }

  /**
   * Convert all registered tools to a single Google Generative AI tool
   * object.
   */
  toGoogleTool(): GoogleTool {
    return toGoogleTool(this.getAll());
  }
}

// ---------------------------------------------------------------------------
// Shared Default Instance
// ---------------------------------------------------------------------------

/**
 * Application-wide tool registry instance. Import this wherever you need
 * to register or look up tools at runtime.
 */
export const defaultToolRegistry = new ToolRegistry();
