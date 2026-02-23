/**
 * Tool Schema Tests
 *
 * Validates tool definitions, ToolRegistry, permission tiers, and schema
 * structures for both standard and DevOps tools.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { z } from 'zod';
import {
  ToolRegistry,
  PERMISSION_TIER_ORDER,
  permissionTierIndex,
  zodToJsonSchema,
  type ToolDefinition,
  type PermissionTier,
} from '../tools/schemas/types';
import { standardTools } from '../tools/schemas/standard';
import { devopsTools } from '../tools/schemas/devops';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal valid ToolDefinition for testing. */
function makeTool(name: string, overrides?: Partial<ToolDefinition>): ToolDefinition {
  return {
    name,
    description: `Test tool: ${name}`,
    inputSchema: z.object({}),
    execute: async () => ({ output: 'ok', isError: false }),
    permissionTier: 'auto_allow',
    category: 'standard',
    ...overrides,
  };
}

// ===========================================================================
// ToolRegistry
// ===========================================================================

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  test('register and get a tool', () => {
    const tool = makeTool('alpha');
    registry.register(tool);
    expect(registry.get('alpha')).toBe(tool);
  });

  test('get returns undefined for unknown tool', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  test('getAll returns all registered tools', () => {
    registry.register(makeTool('a'));
    registry.register(makeTool('b'));
    registry.register(makeTool('c'));
    const all = registry.getAll();
    expect(all).toHaveLength(3);
    expect(all.map((t) => t.name)).toEqual(['a', 'b', 'c']);
  });

  test('getByCategory filters correctly', () => {
    registry.register(makeTool('s1', { category: 'standard' }));
    registry.register(makeTool('d1', { category: 'devops' }));
    registry.register(makeTool('s2', { category: 'standard' }));
    expect(registry.getByCategory('standard')).toHaveLength(2);
    expect(registry.getByCategory('devops')).toHaveLength(1);
    expect(registry.getByCategory('mcp')).toHaveLength(0);
  });

  test('getByPermissionTier filters correctly', () => {
    registry.register(makeTool('t1', { permissionTier: 'auto_allow' }));
    registry.register(makeTool('t2', { permissionTier: 'ask_once' }));
    registry.register(makeTool('t3', { permissionTier: 'auto_allow' }));
    expect(registry.getByPermissionTier('auto_allow')).toHaveLength(2);
    expect(registry.getByPermissionTier('ask_once')).toHaveLength(1);
    expect(registry.getByPermissionTier('always_ask')).toHaveLength(0);
  });

  test('getNames returns tool names in insertion order', () => {
    registry.register(makeTool('z'));
    registry.register(makeTool('a'));
    registry.register(makeTool('m'));
    expect(registry.getNames()).toEqual(['z', 'a', 'm']);
  });

  test('unregister removes a tool and returns true', () => {
    registry.register(makeTool('x'));
    expect(registry.unregister('x')).toBe(true);
    expect(registry.get('x')).toBeUndefined();
    expect(registry.size).toBe(0);
  });

  test('unregister returns false for non-existent tool', () => {
    expect(registry.unregister('nope')).toBe(false);
  });

  test('clear removes all tools', () => {
    registry.register(makeTool('a'));
    registry.register(makeTool('b'));
    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.getAll()).toEqual([]);
  });

  test('size reflects the number of registered tools', () => {
    expect(registry.size).toBe(0);
    registry.register(makeTool('one'));
    expect(registry.size).toBe(1);
    registry.register(makeTool('two'));
    expect(registry.size).toBe(2);
  });

  test('throws on duplicate registration', () => {
    registry.register(makeTool('dup'));
    expect(() => registry.register(makeTool('dup'))).toThrow(/already registered/);
  });
});

// ===========================================================================
// PERMISSION_TIER_ORDER & permissionTierIndex
// ===========================================================================

describe('PERMISSION_TIER_ORDER', () => {
  test('is ordered from least to most restrictive', () => {
    expect(PERMISSION_TIER_ORDER).toEqual([
      'auto_allow',
      'ask_once',
      'always_ask',
      'blocked',
    ]);
  });

  test('has exactly 4 tiers', () => {
    expect(PERMISSION_TIER_ORDER).toHaveLength(4);
  });
});

describe('permissionTierIndex', () => {
  test('returns 0 for auto_allow', () => {
    expect(permissionTierIndex('auto_allow')).toBe(0);
  });

  test('returns 1 for ask_once', () => {
    expect(permissionTierIndex('ask_once')).toBe(1);
  });

  test('returns 2 for always_ask', () => {
    expect(permissionTierIndex('always_ask')).toBe(2);
  });

  test('returns 3 for blocked', () => {
    expect(permissionTierIndex('blocked')).toBe(3);
  });

  test('indices are strictly ascending', () => {
    const indices = PERMISSION_TIER_ORDER.map(permissionTierIndex);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });
});

// ===========================================================================
// Standard Tool Schema Validation
// ===========================================================================

describe('Standard tool schemas', () => {
  /** Helper to find a standard tool by name. */
  function findStandard(name: string): ToolDefinition {
    const t = standardTools.find((t) => t.name === name);
    if (!t) throw new Error(`Standard tool '${name}' not found`);
    return t;
  }

  test('read_file: path is required, offset/limit are optional numbers', () => {
    const schema = findStandard('read_file').inputSchema;
    // Valid with just path
    expect(() => schema.parse({ path: '/tmp/f.txt' })).not.toThrow();
    // Valid with offset and limit
    expect(() => schema.parse({ path: '/tmp/f.txt', offset: 5, limit: 10 })).not.toThrow();
    // Missing path -> error
    expect(() => schema.parse({})).toThrow();
  });

  test('edit_file: path, old_string, new_string are all required', () => {
    const schema = findStandard('edit_file').inputSchema;
    expect(() => schema.parse({ path: 'f', old_string: 'a', new_string: 'b' })).not.toThrow();
    expect(() => schema.parse({ path: 'f', old_string: 'a' })).toThrow();
    expect(() => schema.parse({ path: 'f' })).toThrow();
    expect(() => schema.parse({})).toThrow();
  });

  test('multi_edit: edits array structure is validated', () => {
    const schema = findStandard('multi_edit').inputSchema;
    expect(() =>
      schema.parse({
        path: 'f',
        edits: [{ old_string: 'a', new_string: 'b' }],
      }),
    ).not.toThrow();
    // edits missing -> error
    expect(() => schema.parse({ path: 'f' })).toThrow();
    // empty edits array is valid
    expect(() => schema.parse({ path: 'f', edits: [] })).not.toThrow();
  });

  test('write_file: path and content are required', () => {
    const schema = findStandard('write_file').inputSchema;
    expect(() => schema.parse({ path: '/tmp/x', content: 'hello' })).not.toThrow();
    expect(() => schema.parse({ path: '/tmp/x' })).toThrow();
    expect(() => schema.parse({ content: 'hello' })).toThrow();
  });

  test('bash: command is required, timeout defaults to 120000', () => {
    const schema = findStandard('bash').inputSchema;
    const result = schema.parse({ command: 'echo hi' }) as { command: string; timeout: number };
    expect(result.command).toBe('echo hi');
    expect(result.timeout).toBe(120_000);
    expect(() => schema.parse({})).toThrow();
  });

  test('glob: pattern is required', () => {
    const schema = findStandard('glob').inputSchema;
    expect(() => schema.parse({ pattern: '**/*.ts' })).not.toThrow();
    expect(() => schema.parse({})).toThrow();
  });

  test('grep: pattern is required', () => {
    const schema = findStandard('grep').inputSchema;
    expect(() => schema.parse({ pattern: 'TODO' })).not.toThrow();
    expect(() => schema.parse({})).toThrow();
  });

  test('list_dir: path is required', () => {
    const schema = findStandard('list_dir').inputSchema;
    expect(() => schema.parse({ path: '/tmp' })).not.toThrow();
    expect(() => schema.parse({})).toThrow();
  });

  test('webfetch: url is required and must be valid URL', () => {
    const schema = findStandard('webfetch').inputSchema;
    expect(() => schema.parse({ url: 'https://example.com' })).not.toThrow();
    expect(() => schema.parse({ url: 'not-a-url' })).toThrow();
    expect(() => schema.parse({})).toThrow();
  });

  test('todo_read: accepts empty input', () => {
    const schema = findStandard('todo_read').inputSchema;
    expect(() => schema.parse({})).not.toThrow();
  });

  test('todo_write: validates tasks array with subject and status enum', () => {
    const schema = findStandard('todo_write').inputSchema;
    expect(() =>
      schema.parse({
        tasks: [{ subject: 'Fix bug', status: 'pending' }],
      }),
    ).not.toThrow();
    // Invalid status
    expect(() =>
      schema.parse({
        tasks: [{ subject: 'X', status: 'invalid_status' }],
      }),
    ).toThrow();
    // Missing tasks
    expect(() => schema.parse({})).toThrow();
  });
});

// ===========================================================================
// DevOps Tool Schema Validation
// ===========================================================================

describe('DevOps tool schemas', () => {
  /** Helper to find a devops tool by name. */
  function findDevops(name: string): ToolDefinition {
    const t = devopsTools.find((t) => t.name === name);
    if (!t) throw new Error(`DevOps tool '${name}' not found`);
    return t;
  }

  test('terraform: action enum and workdir are required', () => {
    const schema = findDevops('terraform').inputSchema;
    expect(() => schema.parse({ action: 'plan', workdir: '/infra' })).not.toThrow();
    expect(() => schema.parse({ action: 'invalid', workdir: '/infra' })).toThrow();
    expect(() => schema.parse({ action: 'plan' })).toThrow();
  });

  test('kubectl: action enum is validated', () => {
    const schema = findDevops('kubectl').inputSchema;
    expect(() => schema.parse({ action: 'get' })).not.toThrow();
    expect(() => schema.parse({ action: 'invalid_action' })).toThrow();
  });

  test('helm: action enum is validated', () => {
    const schema = findDevops('helm').inputSchema;
    expect(() => schema.parse({ action: 'list' })).not.toThrow();
    expect(() => schema.parse({ action: 'invalid_action' })).toThrow();
  });

  test('cloud_discover: provider enum and resource_type are required', () => {
    const schema = findDevops('cloud_discover').inputSchema;
    expect(() => schema.parse({ provider: 'aws', resource_type: 'ec2' })).not.toThrow();
    expect(() => schema.parse({ provider: 'invalid', resource_type: 'ec2' })).toThrow();
    expect(() => schema.parse({ provider: 'aws' })).toThrow();
  });

  test('cost_estimate: plan_file and workdir are both optional', () => {
    const schema = findDevops('cost_estimate').inputSchema;
    expect(() => schema.parse({})).not.toThrow();
    expect(() => schema.parse({ plan_file: '/plan.tfplan' })).not.toThrow();
    expect(() => schema.parse({ workdir: '/infra' })).not.toThrow();
  });

  test('drift_detect: workdir is required', () => {
    const schema = findDevops('drift_detect').inputSchema;
    expect(() => schema.parse({ workdir: '/infra' })).not.toThrow();
    expect(() => schema.parse({})).toThrow();
  });

  test('deploy_preview: action and workdir are required', () => {
    const schema = findDevops('deploy_preview').inputSchema;
    expect(() => schema.parse({ action: 'terraform apply', workdir: '/infra' })).not.toThrow();
    expect(() => schema.parse({ action: 'terraform apply' })).toThrow();
    expect(() => schema.parse({ workdir: '/infra' })).toThrow();
  });

  test('git: action enum is validated', () => {
    const schema = findDevops('git').inputSchema;
    expect(() => schema.parse({ action: 'status' })).not.toThrow();
    expect(() => schema.parse({ action: 'bad_action' })).toThrow();
  });

  test('task: prompt is required, agent enum is optional', () => {
    const schema = findDevops('task').inputSchema;
    expect(() => schema.parse({ prompt: 'do something' })).not.toThrow();
    expect(() => schema.parse({ prompt: 'x', agent: 'explore' })).not.toThrow();
    expect(() => schema.parse({ prompt: 'x', agent: 'invalid' })).toThrow();
    expect(() => schema.parse({})).toThrow();
  });
});

// ===========================================================================
// Tool Counts and Metadata
// ===========================================================================

describe('Tool counts and metadata', () => {
  test('standardTools has exactly 11 tools', () => {
    expect(standardTools).toHaveLength(11);
  });

  test('devopsTools has exactly 9 tools', () => {
    expect(devopsTools).toHaveLength(9);
  });

  test('all standard tools have category "standard"', () => {
    for (const tool of standardTools) {
      expect(tool.category).toBe('standard');
    }
  });

  test('all devops tools have category "devops"', () => {
    for (const tool of devopsTools) {
      expect(tool.category).toBe('devops');
    }
  });

  test('all tools have valid permissionTier values', () => {
    const validTiers = new Set<string>(PERMISSION_TIER_ORDER);
    for (const tool of [...standardTools, ...devopsTools]) {
      expect(validTiers.has(tool.permissionTier)).toBe(true);
    }
  });

  test('all tools have non-empty name and description', () => {
    for (const tool of [...standardTools, ...devopsTools]) {
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  test('all tool names are unique across standard and devops', () => {
    const allNames = [...standardTools, ...devopsTools].map((t) => t.name);
    const uniqueNames = new Set(allNames);
    expect(uniqueNames.size).toBe(allNames.length);
  });

  test('all tools have an execute function', () => {
    for (const tool of [...standardTools, ...devopsTools]) {
      expect(typeof tool.execute).toBe('function');
    }
  });
});
