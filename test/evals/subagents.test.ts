/**
 * E2E tests for the Subagent system.
 *
 * Covers subagent creation via factory, type-safe dispatch, tool restrictions,
 * nesting prevention, @agent mention parsing, result metadata, permission
 * inheritance, and per-specialization tool sets (explore, infra, security,
 * cost, general).
 *
 * The LLM router and runAgentLoop are mocked to avoid real API calls while
 * still exercising the subagent configuration, registry wiring, and factory
 * logic end-to-end.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  Subagent,
  createSubagent,
  parseAgentMention,
  type SubagentType,
  type SubagentResult,
  type SubagentConfig,
} from '../../src/agent/subagents/index';

import { createExploreSubagent, exploreConfig } from '../../src/agent/subagents/explore';
import { createInfraSubagent, infraConfig } from '../../src/agent/subagents/infra';
import { createSecuritySubagent, securityConfig } from '../../src/agent/subagents/security';
import { createCostSubagent, costConfig } from '../../src/agent/subagents/cost';
import { createGeneralSubagent, generalConfig } from '../../src/agent/subagents/general';
import { ToolRegistry, type ToolDefinition } from '../../src/tools/schemas/types';

// ---------------------------------------------------------------------------
// Mock runAgentLoop so subagent.run() does not call real LLMs
// ---------------------------------------------------------------------------

vi.mock('../../src/agent/loop', () => ({
  runAgentLoop: vi.fn().mockResolvedValue({
    messages: [
      { role: 'user', content: 'test prompt' },
      { role: 'assistant', content: 'Subagent completed analysis.' },
    ],
    turns: 3,
    usage: { totalTokens: 1500, inputTokens: 1000, outputTokens: 500 },
    interrupted: false,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal fake LLM router for subagent.run(). */
function createFakeRouter(): any {
  return {
    route: vi.fn().mockResolvedValue({ content: 'mock response', usage: {} }),
  };
}

/** Get tool names from a subagent config. */
function getToolNames(config: SubagentConfig): string[] {
  return config.tools.map(t => t.name);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Subagents E2E', () => {
  beforeEach(async () => {
    // Re-set the default mock return value after clearAllMocks
    const { runAgentLoop } = await import('../../src/agent/loop');
    vi.mocked(runAgentLoop).mockResolvedValue({
      messages: [
        { role: 'user', content: 'test prompt' },
        { role: 'assistant', content: 'Subagent completed analysis.' },
      ],
      turns: 3,
      usage: { totalTokens: 1500, inputTokens: 1000, outputTokens: 500 },
      interrupted: false,
    } as any);
  });

  // =======================================================================
  // Factory: createSubagent returns correct type
  // =======================================================================

  // -------------------------------------------------------------------
  // 1. createSubagent('explore') returns correct type
  // -------------------------------------------------------------------
  test('createSubagent("explore") returns a Subagent with explore config', () => {
    const agent = createSubagent('explore');
    expect(agent).toBeInstanceOf(Subagent);
    expect(agent.config.name).toBe('explore');
    expect(agent.config.description).toContain('exploration');
    expect(agent.config.model).toBe('anthropic/claude-haiku-4-5');
    expect(agent.config.maxTurns).toBe(15);
  });

  // -------------------------------------------------------------------
  // 2. createSubagent('infra') returns correct type
  // -------------------------------------------------------------------
  test('createSubagent("infra") returns a Subagent with infra config', () => {
    const agent = createSubagent('infra');
    expect(agent).toBeInstanceOf(Subagent);
    expect(agent.config.name).toBe('infra');
    expect(agent.config.description).toContain('Infrastructure');
    expect(agent.config.model).toBe('anthropic/claude-sonnet-4-20250514');
    expect(agent.config.maxTurns).toBe(20);
  });

  // -------------------------------------------------------------------
  // 3. createSubagent('security') returns correct type
  // -------------------------------------------------------------------
  test('createSubagent("security") returns a Subagent with security config', () => {
    const agent = createSubagent('security');
    expect(agent).toBeInstanceOf(Subagent);
    expect(agent.config.name).toBe('security');
    expect(agent.config.description).toContain('Security');
    expect(agent.config.model).toBe('anthropic/claude-sonnet-4-20250514');
    expect(agent.config.maxTurns).toBe(20);
  });

  // -------------------------------------------------------------------
  // 4. createSubagent('cost') returns correct type
  // -------------------------------------------------------------------
  test('createSubagent("cost") returns a Subagent with cost config', () => {
    const agent = createSubagent('cost');
    expect(agent).toBeInstanceOf(Subagent);
    expect(agent.config.name).toBe('cost');
    expect(agent.config.description).toContain('Cost');
    expect(agent.config.model).toBe('anthropic/claude-haiku-4-5');
    expect(agent.config.maxTurns).toBe(15);
  });

  // -------------------------------------------------------------------
  // 5. createSubagent('general') returns correct type
  // -------------------------------------------------------------------
  test('createSubagent("general") returns a Subagent with general config', () => {
    const agent = createSubagent('general');
    expect(agent).toBeInstanceOf(Subagent);
    expect(agent.config.name).toBe('general');
    expect(agent.config.description).toContain('General');
    expect(agent.config.model).toBe('anthropic/claude-sonnet-4-20250514');
    expect(agent.config.maxTurns).toBe(20);
  });

  // =======================================================================
  // Tool restrictions
  // =======================================================================

  // -------------------------------------------------------------------
  // 6. Subagent has restricted tool set
  // -------------------------------------------------------------------
  test('each subagent has a restricted tool set matching its config', () => {
    const types: SubagentType[] = ['explore', 'infra', 'security', 'cost', 'general'];
    const configs = [exploreConfig, infraConfig, securityConfig, costConfig, generalConfig];

    for (let i = 0; i < types.length; i++) {
      const agent = createSubagent(types[i]);
      const expectedToolNames = configs[i].tools.map(t => t.name);
      const actualToolNames = agent.config.tools.map(t => t.name);
      expect(actualToolNames).toEqual(expectedToolNames);
    }
  });

  // -------------------------------------------------------------------
  // 7. Subagent cannot spawn nested subagents
  // -------------------------------------------------------------------
  test('subagent run() filters out the "task" tool to prevent nesting', async () => {
    const { runAgentLoop } = await import('../../src/agent/loop');

    // Create a config that includes a fake 'task' tool
    const taskTool: ToolDefinition = {
      name: 'task',
      description: 'Spawn a subagent',
      inputSchema: { parse: (x: unknown) => x } as any,
      execute: async () => ({ output: 'spawned', isError: false }),
      permissionTier: 'auto_allow',
      category: 'standard',
    };

    const configWithTask: SubagentConfig = {
      ...exploreConfig,
      tools: [...exploreConfig.tools, taskTool],
    };

    const agent = new Subagent(configWithTask);
    const router = createFakeRouter();

    await agent.run('test', router);

    // runAgentLoop should have been called
    expect(runAgentLoop).toHaveBeenCalledTimes(1);

    // Inspect the toolRegistry passed to runAgentLoop
    const callArgs = (runAgentLoop as any).mock.calls[0];
    const options = callArgs[2];
    const registry: ToolRegistry = options.toolRegistry;

    // The 'task' tool should NOT be in the registry
    expect(registry.get('task')).toBeUndefined();

    // But other tools should be present
    for (const tool of exploreConfig.tools) {
      expect(registry.get(tool.name)).toBeDefined();
    }
  });

  // =======================================================================
  // @agent Mention Parser
  // =======================================================================

  // -------------------------------------------------------------------
  // 8. parseAgentMention('@explore') works
  // -------------------------------------------------------------------
  test('parseAgentMention parses @explore mention', () => {
    const result = parseAgentMention('@explore find all TODO comments');
    expect(result).not.toBeNull();
    expect(result!.agent).toBe('explore');
    expect(result!.prompt).toBe('find all TODO comments');
  });

  // -------------------------------------------------------------------
  // 9. parseAgentMention('@security') works
  // -------------------------------------------------------------------
  test('parseAgentMention parses @security mention', () => {
    const result = parseAgentMention('@security scan for leaked secrets');
    expect(result).not.toBeNull();
    expect(result!.agent).toBe('security');
    expect(result!.prompt).toBe('scan for leaked secrets');
  });

  test('parseAgentMention parses all valid agent types', () => {
    const types: SubagentType[] = ['explore', 'infra', 'security', 'cost', 'general'];
    for (const type of types) {
      const result = parseAgentMention(`@${type} do something`);
      expect(result).not.toBeNull();
      expect(result!.agent).toBe(type);
      expect(result!.prompt).toBe('do something');
    }
  });

  test('parseAgentMention returns null for non-matching input', () => {
    expect(parseAgentMention('normal message')).toBeNull();
    expect(parseAgentMention('@unknown do something')).toBeNull();
    expect(parseAgentMention('@explore')).toBeNull(); // no prompt
    expect(parseAgentMention('')).toBeNull();
  });

  // =======================================================================
  // Result metadata
  // =======================================================================

  // -------------------------------------------------------------------
  // 10. Result includes metadata
  // -------------------------------------------------------------------
  test('subagent run() returns result with output, turns, tokens, and interrupted flag', async () => {
    const agent = createSubagent('explore');
    const router = createFakeRouter();

    const result: SubagentResult = await agent.run('find all config files', router);

    expect(result.output).toBe('Subagent completed analysis.');
    expect(result.turns).toBe(3);
    expect(result.totalTokens).toBe(1500);
    expect(result.interrupted).toBe(false);
  });

  // -------------------------------------------------------------------
  // 11. Inherits permission state (subagent defaults to plan mode)
  // -------------------------------------------------------------------
  test('subagent run() passes plan mode to runAgentLoop', async () => {
    const { runAgentLoop } = await import('../../src/agent/loop');

    const agent = createSubagent('infra');
    const router = createFakeRouter();

    await agent.run('analyze infrastructure', router);

    expect(runAgentLoop).toHaveBeenCalledWith(
      'analyze infrastructure',
      [],
      expect.objectContaining({
        mode: 'plan',
        model: 'anthropic/claude-sonnet-4-20250514',
        maxTurns: 20,
      })
    );
  });

  // =======================================================================
  // Per-specialization tool sets
  // =======================================================================

  // -------------------------------------------------------------------
  // 12. Explore = read-only tools
  // -------------------------------------------------------------------
  test('explore subagent has only read-only tools', () => {
    const toolNames = getToolNames(exploreConfig);

    // Should have read_file, glob, grep, list_dir
    expect(toolNames).toContain('read_file');
    expect(toolNames).toContain('glob');
    expect(toolNames).toContain('grep');
    expect(toolNames).toContain('list_dir');

    // Should NOT have write/exec tools
    expect(toolNames).not.toContain('write_file');
    expect(toolNames).not.toContain('edit_file');
    expect(toolNames).not.toContain('bash');
    expect(toolNames).not.toContain('terraform');
    expect(toolNames).not.toContain('kubectl');
  });

  // -------------------------------------------------------------------
  // 13. Security includes vulnerability scanning tools
  // -------------------------------------------------------------------
  test('security subagent includes search tools for vulnerability scanning', () => {
    const toolNames = getToolNames(securityConfig);

    // Has search/read tools for scanning
    expect(toolNames).toContain('read_file');
    expect(toolNames).toContain('glob');
    expect(toolNames).toContain('grep');
    expect(toolNames).toContain('list_dir');

    // Should NOT have write/infra tools
    expect(toolNames).not.toContain('write_file');
    expect(toolNames).not.toContain('bash');

    // Security config system prompt should mention security patterns
    expect(securityConfig.systemPrompt).toContain('AWS access keys');
    expect(securityConfig.systemPrompt).toContain('SQL injection');
    expect(securityConfig.systemPrompt).toContain('severity');
  });

  // -------------------------------------------------------------------
  // 14. Cost includes estimation tools
  // -------------------------------------------------------------------
  test('cost subagent includes cost_estimate and cloud_discover tools', () => {
    const toolNames = getToolNames(costConfig);

    expect(toolNames).toContain('cost_estimate');
    expect(toolNames).toContain('cloud_discover');
    expect(toolNames).toContain('read_file');
    expect(toolNames).toContain('glob');
    expect(toolNames).toContain('grep');

    // Should NOT have destructive tools
    expect(toolNames).not.toContain('write_file');
    expect(toolNames).not.toContain('bash');
    expect(toolNames).not.toContain('terraform');
  });

  // -------------------------------------------------------------------
  // 15. Errors return wrapped result
  // -------------------------------------------------------------------
  test('subagent run() returns "(no output)" when no assistant message exists', async () => {
    const { runAgentLoop } = await import('../../src/agent/loop');
    (runAgentLoop as any).mockResolvedValueOnce({
      messages: [{ role: 'user', content: 'test' }],
      turns: 1,
      usage: { totalTokens: 100, inputTokens: 80, outputTokens: 20 },
      interrupted: true,
    });

    const agent = createSubagent('explore');
    const router = createFakeRouter();

    const result = await agent.run('test', router);
    expect(result.output).toBe('(no output)');
    expect(result.interrupted).toBe(true);
    expect(result.turns).toBe(1);
    expect(result.totalTokens).toBe(100);
  });

  // =======================================================================
  // Supplementary tests
  // =======================================================================

  test('infra subagent includes cloud_discover, cost_estimate, and drift_detect', () => {
    const toolNames = getToolNames(infraConfig);

    expect(toolNames).toContain('cloud_discover');
    expect(toolNames).toContain('cost_estimate');
    expect(toolNames).toContain('drift_detect');
    expect(toolNames).toContain('read_file');
    expect(toolNames).toContain('glob');
    expect(toolNames).toContain('grep');
    expect(toolNames).toContain('list_dir');
  });

  test('general subagent includes bash and webfetch tools', () => {
    const toolNames = getToolNames(generalConfig);

    expect(toolNames).toContain('bash');
    expect(toolNames).toContain('webfetch');
    expect(toolNames).toContain('read_file');
    expect(toolNames).toContain('glob');
    expect(toolNames).toContain('grep');
    expect(toolNames).toContain('list_dir');

    // General does NOT have infra-specific tools
    expect(toolNames).not.toContain('terraform');
    expect(toolNames).not.toContain('kubectl');
  });

  test('createSubagent throws for unknown type', () => {
    expect(() => createSubagent('unknown' as SubagentType)).toThrow('Unknown subagent type');
  });

  test('each subagent config has a non-empty system prompt', () => {
    const configs = [exploreConfig, infraConfig, securityConfig, costConfig, generalConfig];
    for (const config of configs) {
      expect(config.systemPrompt.length).toBeGreaterThan(50);
      expect(config.systemPrompt).toContain('subagent');
    }
  });

  test('all subagent configs explicitly mention no nesting in system prompt', () => {
    const configs = [exploreConfig, infraConfig, securityConfig, costConfig, generalConfig];
    for (const config of configs) {
      expect(config.systemPrompt.toLowerCase()).toContain('do not spawn further subagents');
    }
  });

  test('each factory function returns a fresh instance', () => {
    const a1 = createExploreSubagent();
    const a2 = createExploreSubagent();
    expect(a1).not.toBe(a2);
    expect(a1.config).toBe(a2.config); // Config is shared (same reference)

    const b1 = createInfraSubagent();
    const b2 = createInfraSubagent();
    expect(b1).not.toBe(b2);

    const c1 = createSecuritySubagent();
    const c2 = createSecuritySubagent();
    expect(c1).not.toBe(c2);

    const d1 = createCostSubagent();
    const d2 = createCostSubagent();
    expect(d1).not.toBe(d2);

    const e1 = createGeneralSubagent();
    const e2 = createGeneralSubagent();
    expect(e1).not.toBe(e2);
  });

  test('parseAgentMention preserves multiline prompts', () => {
    const input = '@explore find all files\nthat contain TODO\nand FIXME';
    const result = parseAgentMention(input);
    expect(result).not.toBeNull();
    expect(result!.agent).toBe('explore');
    expect(result!.prompt).toContain('TODO');
    expect(result!.prompt).toContain('FIXME');
  });

  test('subagent run() passes nimbusInstructions from systemPrompt', async () => {
    const { runAgentLoop } = await import('../../src/agent/loop');

    const agent = createSubagent('security');
    const router = createFakeRouter();

    await agent.run('scan for secrets', router);

    // Use the most recent call (last in the array)
    const calls = (runAgentLoop as any).mock.calls;
    const callArgs = calls[calls.length - 1];
    const options = callArgs[2];
    expect(options.nimbusInstructions).toBe(securityConfig.systemPrompt);
    expect(options.nimbusInstructions).toContain('security auditor');
  });
});
