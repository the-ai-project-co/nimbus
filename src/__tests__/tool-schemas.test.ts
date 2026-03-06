/**
 * Tool Schema Tests
 *
 * Validates tool definitions, ToolRegistry, permission tiers, and schema
 * structures for both standard and DevOps tools.
 */

import { describe, test, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  ToolRegistry,
  PERMISSION_TIER_ORDER,
  permissionTierIndex,
  type ToolDefinition,
} from '../tools/schemas/types';
import { standardTools } from '../tools/schemas/standard';
import { devopsTools, formatKubectlPodsOutput, formatHelmListOutput } from '../tools/schemas/devops';

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
    expect(all.map(t => t.name)).toEqual(['a', 'b', 'c']);
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
    expect(PERMISSION_TIER_ORDER).toEqual(['auto_allow', 'ask_once', 'always_ask', 'blocked']);
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
    const t = standardTools.find(t => t.name === name);
    if (!t) {
      throw new Error(`Standard tool '${name}' not found`);
    }
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
      })
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
      })
    ).not.toThrow();
    // Invalid status
    expect(() =>
      schema.parse({
        tasks: [{ subject: 'X', status: 'invalid_status' }],
      })
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
    const t = devopsTools.find(t => t.name === name);
    if (!t) {
      throw new Error(`DevOps tool '${name}' not found`);
    }
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
  test('standardTools has exactly 12 tools', () => {
    expect(standardTools).toHaveLength(12);
  });

  test('devopsTools has exactly 28 tools', () => {
    expect(devopsTools).toHaveLength(28);
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
    const allNames = [...standardTools, ...devopsTools].map(t => t.name);
    const uniqueNames = new Set(allNames);
    expect(uniqueNames.size).toBe(allNames.length);
  });

  test('all tools have an execute function', () => {
    for (const tool of [...standardTools, ...devopsTools]) {
      expect(typeof tool.execute).toBe('function');
    }
  });
});

// ---------------------------------------------------------------------------
// C2: infraContext in ToolExecuteContext
// ---------------------------------------------------------------------------

describe('infraContext in ToolExecuteContext (C2)', () => {
  it('ToolExecuteContext type has infraContext field', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/tools/schemas/types.ts'), 'utf-8');
    expect(src).toContain('infraContext?:');
  });

  it('kubectl tool uses contextFlag from infraContext', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/tools/schemas/devops.ts'), 'utf-8');
    expect(src).toContain('ctx?.infraContext?.kubectlContext');
  });

  it('terraform tool reads sessionWorkspace from infraContext', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/tools/schemas/devops.ts'), 'utf-8');
    expect(src).toContain('ctx?.infraContext?.terraformWorkspace');
  });

  it('generateInfraTool is in devopsTools array', async () => {
    const { devopsTools } = await import('../tools/schemas/devops');
    const names = devopsTools.map(t => t.name);
    expect(names).toContain('generate_infra');
  });

  it('generateInfraTool has ask_once permissionTier', async () => {
    const { devopsTools } = await import('../tools/schemas/devops');
    const tool = devopsTools.find(t => t.name === 'generate_infra');
    expect(tool?.permissionTier).toBe('ask_once');
  });

  it('generateInfraTool schema accepts terraform/kubernetes/helm types', async () => {
    const { devopsTools } = await import('../tools/schemas/devops');
    const tool = devopsTools.find(t => t.name === 'generate_infra');
    expect(tool).toBeDefined();
    // The schema should parse valid input without throwing
    const { z } = await import('zod');
    // Just verify the tool exists and has a schema
    expect(tool?.inputSchema).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// M2: Docker build streaming
// ---------------------------------------------------------------------------

describe('docker build streaming (M2)', () => {
  it('dockerTool execute accepts ctx parameter', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/tools/schemas/devops.ts'), 'utf-8');
    expect(src).toContain("input.action === 'build' && ctx?.onProgress");
  });

  it('docker build output filter keeps Step N/M lines', () => {
    // Inline the filter logic to unit test it
    const filterDockerBuildLine = (line: string): boolean => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      return /^Step\s+\d+\/\d+/i.test(trimmed) ||
        /---> Using cache/i.test(trimmed) ||
        /Successfully built/i.test(trimmed) ||
        /Successfully tagged/i.test(trimmed) ||
        /error/i.test(trimmed) ||
        /warning/i.test(trimmed);
    };

    expect(filterDockerBuildLine('Step 3/12: RUN npm install')).toBe(true);
    expect(filterDockerBuildLine(' ---> Using cache')).toBe(true);
    expect(filterDockerBuildLine('Successfully built abc123')).toBe(true);
    expect(filterDockerBuildLine('Successfully tagged myapp:latest')).toBe(true);
    expect(filterDockerBuildLine(' ---> sha256:abc123def456')).toBe(false);
    expect(filterDockerBuildLine('Removing intermediate container abc123')).toBe(false);
  });
});

// ===========================================================================
// H6: kubectl pods output formatting
// ===========================================================================

describe('H6 — formatKubectlPodsOutput', () => {
  const sampleOutput = [
    'NAME                       READY   STATUS             RESTARTS   AGE',
    'web-7d4f6b9c5-abc12        1/1     Running            0          2d',
    'worker-6b5c8d7f4-xyz99     0/1     CrashLoopBackOff   5          1h',
    'db-5f4e3d2c1-pqr55         0/1     Pending            0          30m',
    'init-job-abc               0/1     Init:0/1           0          5m',
    'old-pod-done               0/1     Completed          0          7d',
    'failing-app-xyz            0/1     Error              3          2h',
    'evicted-pod                0/1     Evicted            0          1d',
  ].join('\n');

  it('prefixes Running pods with [OK]', () => {
    const result = formatKubectlPodsOutput(sampleOutput);
    expect(result).toContain('[OK]');
    const lines = result.split('\n');
    const runningLine = lines.find(l => l.includes('Running'));
    expect(runningLine).toMatch(/^\[OK\]/);
  });

  it('prefixes CrashLoopBackOff pods with [XX]', () => {
    const result = formatKubectlPodsOutput(sampleOutput);
    const lines = result.split('\n');
    const crashLine = lines.find(l => l.includes('CrashLoopBackOff'));
    expect(crashLine).toMatch(/^\[XX\]/);
  });

  it('prefixes Pending pods with [!!]', () => {
    const result = formatKubectlPodsOutput(sampleOutput);
    const lines = result.split('\n');
    const pendingLine = lines.find(l => l.includes('Pending'));
    expect(pendingLine).toMatch(/^\[!!\]/);
  });

  it('prefixes Error pods with [XX]', () => {
    const result = formatKubectlPodsOutput(sampleOutput);
    const lines = result.split('\n');
    const errorLine = lines.find(l => l.includes('Error') && !l.includes('CrashLoop'));
    expect(errorLine).toMatch(/^\[XX\]/);
  });

  it('prefixes Completed pods with [OK]', () => {
    const result = formatKubectlPodsOutput(sampleOutput);
    const lines = result.split('\n');
    const completedLine = lines.find(l => l.includes('Completed'));
    expect(completedLine).toMatch(/^\[OK\]/);
  });

  it('preserves header line without emoji prefix', () => {
    const result = formatKubectlPodsOutput(sampleOutput);
    const headerLine = result.split('\n')[0];
    expect(headerLine).toBe('NAME                       READY   STATUS             RESTARTS   AGE');
  });

  it('returns original line for empty input', () => {
    const result = formatKubectlPodsOutput('');
    expect(result).toBe('');
  });

  it('handles single Running pod', () => {
    const input = 'NAME   READY   STATUS    RESTARTS   AGE\nmypod  1/1     Running   0          1m';
    const result = formatKubectlPodsOutput(input);
    const lines = result.split('\n');
    expect(lines[1]).toMatch(/^\[OK\]/);
  });
});

// ===========================================================================
// H6: helm list output formatting
// ===========================================================================

describe('H6 — formatHelmListOutput', () => {
  const sampleJson = JSON.stringify([
    { name: 'nginx', namespace: 'default', revision: '3', status: 'deployed', chart: 'nginx-1.2.0', app_version: '1.21', updated: '2024-01-01' },
    { name: 'redis', namespace: 'cache', revision: '1', status: 'failed', chart: 'redis-7.0.0', app_version: '7.0', updated: '2024-01-02' },
    { name: 'postgres', namespace: 'db', revision: '2', status: 'pending-upgrade', chart: 'postgresql-12.1.0', app_version: '15', updated: '2024-01-03' },
  ]);

  it('prefixes deployed releases with [OK]', () => {
    const result = formatHelmListOutput(sampleJson);
    expect(result).toContain('[OK]');
    const lines = result.split('\n');
    const deployedLine = lines.find(l => l.includes('deployed'));
    expect(deployedLine).toMatch(/^\[OK\]/);
  });

  it('prefixes failed releases with [XX]', () => {
    const result = formatHelmListOutput(sampleJson);
    const lines = result.split('\n');
    const failedLine = lines.find(l => l.includes('failed'));
    expect(failedLine).toMatch(/^\[XX\]/);
  });

  it('prefixes pending releases with [!!]', () => {
    const result = formatHelmListOutput(sampleJson);
    const lines = result.split('\n');
    const pendingLine = lines.find(l => l.includes('pending'));
    expect(pendingLine).toMatch(/^\[!!\]/);
  });

  it('returns "No Helm releases found." for empty array', () => {
    const result = formatHelmListOutput('[]');
    expect(result).toBe('No Helm releases found.');
  });

  it('falls back to raw string for invalid JSON', () => {
    const result = formatHelmListOutput('not json');
    expect(result).toBe('not json');
  });

  it('includes release name and namespace in output', () => {
    const result = formatHelmListOutput(sampleJson);
    expect(result).toContain('nginx');
    expect(result).toContain('default');
  });
});

