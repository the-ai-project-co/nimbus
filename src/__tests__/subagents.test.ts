/**
 * Subagent Tests
 *
 * Validates subagent creation, configuration, tool restrictions, and
 * the @agent mention parser.
 */

import { describe, test, expect } from 'bun:test';
import {
  createSubagent,
  parseAgentMention,
  type SubagentType,
  exploreConfig,
  infraConfig,
  securityConfig,
  costConfig,
  generalConfig,
  Subagent,
} from '../agent/subagents/index';

// ===========================================================================
// createSubagent
// ===========================================================================

describe('createSubagent', () => {
  test('createSubagent("explore") returns Subagent with correct config', () => {
    const agent = createSubagent('explore');
    expect(agent).toBeInstanceOf(Subagent);
    expect(agent.config.name).toBe('explore');
    expect(agent.config.model).toBe('anthropic/claude-haiku-4-5');
    expect(agent.config.maxTurns).toBe(15);
  });

  test('createSubagent("infra") returns Subagent with correct tools', () => {
    const agent = createSubagent('infra');
    expect(agent.config.name).toBe('infra');
    const toolNames = agent.config.tools.map((t) => t.name);
    expect(toolNames).toContain('read_file');
    expect(toolNames).toContain('cloud_discover');
    expect(toolNames).toContain('cost_estimate');
    expect(toolNames).toContain('drift_detect');
  });

  test('createSubagent("security") returns Subagent with security prompt', () => {
    const agent = createSubagent('security');
    expect(agent.config.name).toBe('security');
    expect(agent.config.systemPrompt).toContain('security');
    expect(agent.config.systemPrompt).toContain('CRITICAL');
  });

  test('createSubagent("cost") uses haiku model', () => {
    const agent = createSubagent('cost');
    expect(agent.config.model).toContain('haiku');
  });

  test('createSubagent("general") has bash and webfetch tools', () => {
    const agent = createSubagent('general');
    const toolNames = agent.config.tools.map((t) => t.name);
    expect(toolNames).toContain('bash');
    expect(toolNames).toContain('webfetch');
  });

  test('all subagent types are valid and produce Subagent instances', () => {
    const types: SubagentType[] = ['explore', 'infra', 'security', 'cost', 'general'];
    for (const type of types) {
      const agent = createSubagent(type);
      expect(agent).toBeInstanceOf(Subagent);
      expect(agent.config.name).toBe(type);
    }
  });
});

// ===========================================================================
// parseAgentMention
// ===========================================================================

describe('parseAgentMention', () => {
  test('parses "@explore find TODOs" correctly', () => {
    const result = parseAgentMention('@explore find TODOs');
    expect(result).not.toBeNull();
    expect(result!.agent).toBe('explore');
    expect(result!.prompt).toBe('find TODOs');
  });

  test('parses "@infra check EKS" correctly', () => {
    const result = parseAgentMention('@infra check EKS');
    expect(result).not.toBeNull();
    expect(result!.agent).toBe('infra');
    expect(result!.prompt).toBe('check EKS');
  });

  test('parses "@security scan for secrets" correctly', () => {
    const result = parseAgentMention('@security scan for secrets');
    expect(result).not.toBeNull();
    expect(result!.agent).toBe('security');
    expect(result!.prompt).toBe('scan for secrets');
  });

  test('parses "@cost estimate monthly spend" correctly', () => {
    const result = parseAgentMention('@cost estimate monthly spend');
    expect(result).not.toBeNull();
    expect(result!.agent).toBe('cost');
  });

  test('parses "@general research topic" correctly', () => {
    const result = parseAgentMention('@general research topic');
    expect(result).not.toBeNull();
    expect(result!.agent).toBe('general');
  });

  test('returns null for normal messages', () => {
    expect(parseAgentMention('normal message without @mention')).toBeNull();
    expect(parseAgentMention('fix the bug')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(parseAgentMention('')).toBeNull();
  });

  test('returns null for unknown @agent prefix', () => {
    expect(parseAgentMention('@unknown do something')).toBeNull();
    expect(parseAgentMention('@deploy run it')).toBeNull();
  });

  test('returns null when @agent has no prompt', () => {
    // The regex requires at least one character after the agent name
    expect(parseAgentMention('@explore')).toBeNull();
  });
});

// ===========================================================================
// Subagent Tool Restrictions
// ===========================================================================

describe('Subagent tool restrictions', () => {
  test('all subagent configs exclude the "task" tool (no nesting)', () => {
    const configs = [exploreConfig, infraConfig, securityConfig, costConfig, generalConfig];
    for (const config of configs) {
      const hasTask = config.tools.some((t) => t.name === 'task');
      expect(hasTask).toBe(false);
    }
  });

  test('explore subagent only has read-only tools', () => {
    const toolNames = exploreConfig.tools.map((t) => t.name);
    expect(toolNames).toEqual(['read_file', 'glob', 'grep', 'list_dir']);
    // None of these are destructive
    for (const tool of exploreConfig.tools) {
      expect(tool.isDestructive).toBeFalsy();
    }
  });

  test('security subagent only has read-only tools', () => {
    const toolNames = securityConfig.tools.map((t) => t.name);
    expect(toolNames).toEqual(['read_file', 'glob', 'grep', 'list_dir']);
    for (const tool of securityConfig.tools) {
      expect(tool.isDestructive).toBeFalsy();
    }
  });

  test('infra subagent has cloud discovery tools', () => {
    const toolNames = infraConfig.tools.map((t) => t.name);
    expect(toolNames).toContain('cloud_discover');
    expect(toolNames).toContain('cost_estimate');
    expect(toolNames).toContain('drift_detect');
  });

  test('cost subagent has cost_estimate and cloud_discover', () => {
    const toolNames = costConfig.tools.map((t) => t.name);
    expect(toolNames).toContain('cost_estimate');
    expect(toolNames).toContain('cloud_discover');
    // But should not have destructive tools
    expect(toolNames).not.toContain('terraform');
    expect(toolNames).not.toContain('kubectl');
  });
});
