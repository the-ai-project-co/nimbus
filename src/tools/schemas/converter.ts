/**
 * Batch Conversion Utilities for Provider-Specific Tool Formats
 *
 * This module re-exports the individual converter functions from
 * {@link module:tools/schemas/types} and adds convenience functions for
 * converting arrays of {@link ToolDefinition}s to each supported LLM
 * provider's expected tool format in a single call.
 *
 * The {@link toProviderFormat} function additionally accepts a
 * {@link Provider} discriminator so callers can defer the choice of
 * target format to runtime configuration.
 *
 * @module tools/schemas/converter
 */

import {
  toAnthropicTool,
  toOpenAITool,
  toGoogleTool,
  zodToJsonSchema,
  type ToolDefinition,
  type AnthropicTool,
  type OpenAITool,
  type GoogleTool,
} from './types';

// ---------------------------------------------------------------------------
// Re-exports -- individual converters and provider-specific types
// ---------------------------------------------------------------------------

export { toAnthropicTool, toOpenAITool, toGoogleTool, zodToJsonSchema };
export type { AnthropicTool, OpenAITool, GoogleTool };

// ---------------------------------------------------------------------------
// Provider Discriminator
// ---------------------------------------------------------------------------

/**
 * Union of all LLM provider identifiers that Nimbus supports.
 *
 * | Provider            | Wire format used          |
 * | ------------------- | ------------------------- |
 * | `anthropic`         | Anthropic Messages API    |
 * | `openai`            | OpenAI function-calling   |
 * | `google`            | Google Generative AI      |
 * | `ollama`            | OpenAI-compatible         |
 * | `openrouter`        | OpenAI-compatible         |
 * | `bedrock`           | Anthropic (Claude models) |
 * | `openai-compatible` | OpenAI function-calling   |
 */
export type Provider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'ollama'
  | 'openrouter'
  | 'bedrock'
  | 'openai-compatible';

// ---------------------------------------------------------------------------
// Batch Conversion Functions
// ---------------------------------------------------------------------------

/**
 * Convert an array of tool definitions to Anthropic Messages API format.
 *
 * Each {@link ToolDefinition} is individually converted via
 * {@link toAnthropicTool} and the results are returned as an array.
 *
 * @param tools - The tool definitions to convert.
 * @returns An array of {@link AnthropicTool} objects ready for the API.
 */
export function toAnthropicFormat(tools: ToolDefinition[]): AnthropicTool[] {
  return tools.map(toAnthropicTool);
}

/**
 * Convert an array of tool definitions to OpenAI function-calling format.
 *
 * Each {@link ToolDefinition} is individually converted via
 * {@link toOpenAITool} and the results are returned as an array.
 *
 * @param tools - The tool definitions to convert.
 * @returns An array of {@link OpenAITool} objects ready for the API.
 */
export function toOpenAIFormat(tools: ToolDefinition[]): OpenAITool[] {
  return tools.map(toOpenAITool);
}

/**
 * Convert an array of tool definitions to Google Generative AI format.
 *
 * Unlike Anthropic and OpenAI, Google expects all function declarations
 * to be bundled inside a single tool object with a `functionDeclarations`
 * array. This function delegates to {@link toGoogleTool} which handles
 * that bundling.
 *
 * @param tools - The tool definitions to convert.
 * @returns A single {@link GoogleTool} containing all declarations.
 */
export function toGoogleFormat(tools: ToolDefinition[]): GoogleTool {
  return toGoogleTool(tools);
}

// ---------------------------------------------------------------------------
// Provider-Aware Conversion
// ---------------------------------------------------------------------------

/**
 * Convert an array of tool definitions to the wire format expected by a
 * specific LLM provider.
 *
 * This is the primary entry point for code that determines the target
 * provider at runtime (e.g. from user configuration). The mapping is:
 *
 * - `'anthropic'` and `'bedrock'` produce {@link AnthropicTool}[] (Bedrock
 *   uses Anthropic format for Claude models).
 * - `'openai'`, `'ollama'`, `'openrouter'`, and `'openai-compatible'`
 *   produce {@link OpenAITool}[].
 * - `'google'` produces a single {@link GoogleTool} object.
 *
 * If an unrecognized provider string is passed (possible when new
 * providers are added before this function is updated), the function
 * falls back to OpenAI format as it is the most widely supported.
 *
 * @param tools    - The tool definitions to convert.
 * @param provider - The target LLM provider identifier.
 * @returns The converted tools in the provider-specific format.
 */
export function toProviderFormat(
  tools: ToolDefinition[],
  provider: Provider
): AnthropicTool[] | OpenAITool[] | GoogleTool {
  switch (provider) {
    case 'anthropic':
      return toAnthropicFormat(tools);

    case 'openai':
    case 'ollama':
    case 'openrouter':
    case 'openai-compatible':
      return toOpenAIFormat(tools);

    case 'google':
      return toGoogleFormat(tools);

    case 'bedrock':
      // Bedrock uses Anthropic format for Claude models
      return toAnthropicFormat(tools);

    default: {
      // Exhaustive check: if a new Provider variant is added but not
      // handled above, TypeScript will flag this assignment as an error.
      const _exhaustive: never = provider;
      void _exhaustive;

      // Default to OpenAI format (most widely supported)
      return toOpenAIFormat(tools);
    }
  }
}

// ---------------------------------------------------------------------------
// Utility Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the names of all tool definitions in the given array.
 *
 * Useful for logging, permission checks, or building tool-name allow/deny
 * lists without pulling in the full definition objects.
 *
 * @param tools - The tool definitions to extract names from.
 * @returns An array of tool name strings, preserving input order.
 *
 * @example
 * ```ts
 * const names = getToolNames(registry.getAll());
 * // ['read_file', 'write_file', 'terraform_apply']
 * ```
 */
export function getToolNames(tools: ToolDefinition[]): string[] {
  return tools.map(t => t.name);
}
