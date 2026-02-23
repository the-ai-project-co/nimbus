/**
 * Tool Converter Tests
 *
 * Validates the Zod-to-JSON-Schema converter and the provider-specific
 * format converters (Anthropic, OpenAI, Google).
 */

import { describe, test, expect } from 'bun:test';
import { z } from 'zod';
import {
  zodToJsonSchema,
  toAnthropicTool,
  toOpenAITool,
  toGoogleTool,
} from '../tools/schemas/types';
import {
  toAnthropicFormat,
  toOpenAIFormat,
  toGoogleFormat,
  toProviderFormat,
} from '../tools/schemas/converter';
import type { ToolDefinition } from '../tools/schemas/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal ToolDefinition for conversion tests. */
function makeTool(name: string, schema: z.ZodType<unknown>): ToolDefinition {
  return {
    name,
    description: `Description of ${name}`,
    inputSchema: schema,
    execute: async () => ({ output: 'ok', isError: false }),
    permissionTier: 'auto_allow',
    category: 'standard',
  };
}

// ===========================================================================
// zodToJsonSchema — Primitive Types
// ===========================================================================

describe('zodToJsonSchema', () => {
  test('converts z.string() to { type: "string" }', () => {
    const result = zodToJsonSchema(z.string());
    expect(result).toEqual({ type: 'string' });
  });

  test('converts z.number() to { type: "number" }', () => {
    const result = zodToJsonSchema(z.number());
    expect(result).toEqual({ type: 'number' });
  });

  test('converts z.boolean() to { type: "boolean" }', () => {
    const result = zodToJsonSchema(z.boolean());
    expect(result).toEqual({ type: 'boolean' });
  });

  test('converts z.object({ name: z.string() }) with required', () => {
    const result = zodToJsonSchema(z.object({ name: z.string() }));
    expect(result.type).toBe('object');
    expect(result.properties).toBeDefined();
    expect((result.properties as Record<string, unknown>).name).toEqual({ type: 'string' });
    expect(result.required).toEqual(['name']);
  });

  test('handles optional fields (not in required array)', () => {
    const result = zodToJsonSchema(
      z.object({
        required_field: z.string(),
        optional_field: z.string().optional(),
      }),
    );
    expect(result.required).toEqual(['required_field']);
    expect((result.properties as Record<string, unknown>).optional_field).toBeDefined();
  });

  test('handles z.enum(["a", "b"]) as { type: "string", enum: ["a", "b"] }', () => {
    const result = zodToJsonSchema(z.enum(['a', 'b']));
    expect(result.type).toBe('string');
    expect(result.enum).toEqual(['a', 'b']);
  });

  test('handles z.array(z.string()) as { type: "array", items: { type: "string" } }', () => {
    const result = zodToJsonSchema(z.array(z.string()));
    expect(result.type).toBe('array');
    expect(result.items).toEqual({ type: 'string' });
  });

  test('handles nested objects', () => {
    const result = zodToJsonSchema(
      z.object({
        inner: z.object({
          value: z.number(),
        }),
      }),
    );
    expect(result.type).toBe('object');
    const inner = (result.properties as Record<string, any>).inner;
    expect(inner.type).toBe('object');
    expect(inner.properties.value).toEqual({ type: 'number' });
  });

  test('handles z.number().optional().default() with default value', () => {
    const result = zodToJsonSchema(z.number().optional().default(42));
    expect(result.type).toBe('number');
    expect(result.default).toBe(42);
  });
});

// ===========================================================================
// toAnthropicTool
// ===========================================================================

describe('toAnthropicTool', () => {
  test('produces correct format with input_schema.type = "object"', () => {
    const tool = makeTool('test_tool', z.object({ x: z.string() }));
    const result = toAnthropicTool(tool);

    expect(result.name).toBe('test_tool');
    expect(result.description).toBe('Description of test_tool');
    expect(result.input_schema).toBeDefined();
    expect(result.input_schema.type).toBe('object');
    expect(result.input_schema.properties).toBeDefined();
  });
});

// ===========================================================================
// toOpenAITool
// ===========================================================================

describe('toOpenAITool', () => {
  test('produces correct format with type = "function"', () => {
    const tool = makeTool('test_tool', z.object({ y: z.number() }));
    const result = toOpenAITool(tool);

    expect(result.type).toBe('function');
    expect(result.function.name).toBe('test_tool');
    expect(result.function.description).toBe('Description of test_tool');
    expect(result.function.parameters).toBeDefined();
    expect(result.function.parameters.type).toBe('object');
  });
});

// ===========================================================================
// toGoogleTool
// ===========================================================================

describe('toGoogleTool', () => {
  test('produces correct format with functionDeclarations', () => {
    const tool1 = makeTool('tool_a', z.object({ a: z.string() }));
    const tool2 = makeTool('tool_b', z.object({ b: z.number() }));
    const result = toGoogleTool([tool1, tool2]);

    expect(result.functionDeclarations).toBeDefined();
    expect(result.functionDeclarations).toHaveLength(2);
    expect(result.functionDeclarations[0].name).toBe('tool_a');
    expect(result.functionDeclarations[1].name).toBe('tool_b');
    expect(result.functionDeclarations[0].parameters.type).toBe('OBJECT');
  });
});

// ===========================================================================
// Batch Conversion Functions
// ===========================================================================

describe('toAnthropicFormat', () => {
  test('converts array of tools to Anthropic format', () => {
    const tools = [
      makeTool('a', z.object({})),
      makeTool('b', z.object({})),
    ];
    const result = toAnthropicFormat(tools);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('a');
    expect(result[1].name).toBe('b');
    expect(result[0].input_schema.type).toBe('object');
  });
});

describe('toOpenAIFormat', () => {
  test('converts array of tools to OpenAI format', () => {
    const tools = [
      makeTool('a', z.object({})),
      makeTool('b', z.object({})),
    ];
    const result = toOpenAIFormat(tools);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('function');
    expect(result[1].function.name).toBe('b');
  });
});

describe('toGoogleFormat', () => {
  test('produces single tool object with all declarations', () => {
    const tools = [
      makeTool('x', z.object({})),
      makeTool('y', z.object({})),
      makeTool('z', z.object({})),
    ];
    const result = toGoogleFormat(tools);
    expect(result.functionDeclarations).toHaveLength(3);
    expect(result.functionDeclarations.map((d) => d.name)).toEqual(['x', 'y', 'z']);
  });
});

// ===========================================================================
// toProviderFormat
// ===========================================================================

describe('toProviderFormat', () => {
  const tools = [makeTool('t', z.object({ a: z.string() }))];

  test('dispatches to Anthropic for "anthropic"', () => {
    const result = toProviderFormat(tools, 'anthropic');
    expect(Array.isArray(result)).toBe(true);
    const arr = result as any[];
    expect(arr[0].input_schema).toBeDefined();
  });

  test('dispatches to OpenAI for "openai"', () => {
    const result = toProviderFormat(tools, 'openai');
    expect(Array.isArray(result)).toBe(true);
    const arr = result as any[];
    expect(arr[0].type).toBe('function');
  });

  test('dispatches to Google for "google"', () => {
    const result = toProviderFormat(tools, 'google');
    expect(Array.isArray(result)).toBe(false);
    expect((result as any).functionDeclarations).toBeDefined();
  });

  test('dispatches to OpenAI for "ollama"', () => {
    const result = toProviderFormat(tools, 'ollama');
    expect(Array.isArray(result)).toBe(true);
    const arr = result as any[];
    expect(arr[0].type).toBe('function');
  });

  test('dispatches to OpenAI for "openrouter"', () => {
    const result = toProviderFormat(tools, 'openrouter');
    expect(Array.isArray(result)).toBe(true);
    const arr = result as any[];
    expect(arr[0].type).toBe('function');
  });

  test('dispatches to Anthropic for "bedrock"', () => {
    const result = toProviderFormat(tools, 'bedrock');
    expect(Array.isArray(result)).toBe(true);
    const arr = result as any[];
    expect(arr[0].input_schema).toBeDefined();
  });

  test('dispatches to OpenAI for "openai-compatible"', () => {
    const result = toProviderFormat(tools, 'openai-compatible');
    expect(Array.isArray(result)).toBe(true);
    const arr = result as any[];
    expect(arr[0].type).toBe('function');
  });
});
