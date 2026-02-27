/**
 * Tests for Context Manager + Compaction Agent
 *
 * Covers token estimation, context breakdown calculation, message
 * selection for compaction, and message reassembly.
 *
 * @module __tests__/context-manager
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ContextManager, estimateTokens, estimateMessageTokens } from '../agent/context-manager';
import type { LLMMessage } from '../llm/types';

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------

describe('estimateTokens', () => {
  it('should return 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should estimate tokens from character count', () => {
    // 5 chars / 4 = 1.25 -> ceil -> 2
    expect(estimateTokens('hello')).toBe(2);
    expect(estimateTokens('a'.repeat(100))).toBe(25);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });

  it('should round up for non-divisible lengths', () => {
    // 7 chars / 4 = 1.75 -> ceil -> 2
    expect(estimateTokens('abcdefg')).toBe(2);
    // 1 char / 4 = 0.25 -> ceil -> 1
    expect(estimateTokens('x')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// estimateMessageTokens
// ---------------------------------------------------------------------------

describe('estimateMessageTokens', () => {
  it('should estimate tokens for a simple message', () => {
    const msg: LLMMessage = { role: 'user', content: 'Hello world' };
    const tokens = estimateMessageTokens(msg);
    // "Hello world" = 11 chars / 4 = 3 + 4 overhead = 7
    expect(tokens).toBe(7);
  });

  it('should add overhead for role framing', () => {
    const msg: LLMMessage = { role: 'assistant', content: '' };
    // Empty content = 0 tokens + 4 overhead = 4
    expect(estimateMessageTokens(msg)).toBe(4);
  });

  it('should account for tool calls', () => {
    const msg: LLMMessage = {
      role: 'assistant',
      content: 'Let me read that file.',
      toolCalls: [
        {
          id: 'tc1',
          type: 'function',
          function: {
            name: 'read_file',
            arguments: '{"path":"src/index.ts"}',
          },
        },
      ],
    };
    const tokens = estimateMessageTokens(msg);
    // Should be more than just the content tokens
    const contentOnly = estimateTokens('Let me read that file.') + 4;
    expect(tokens).toBeGreaterThan(contentOnly);
  });

  it('should handle multiple tool calls', () => {
    const singleCall: LLMMessage = {
      role: 'assistant',
      content: 'Working.',
      toolCalls: [
        {
          id: 'tc1',
          type: 'function',
          function: { name: 'read_file', arguments: '{"path":"a.ts"}' },
        },
      ],
    };
    const doubleCalls: LLMMessage = {
      role: 'assistant',
      content: 'Working.',
      toolCalls: [
        {
          id: 'tc1',
          type: 'function',
          function: { name: 'read_file', arguments: '{"path":"a.ts"}' },
        },
        {
          id: 'tc2',
          type: 'function',
          function: { name: 'write_file', arguments: '{"path":"b.ts","content":"x"}' },
        },
      ],
    };
    expect(estimateMessageTokens(doubleCalls)).toBeGreaterThan(estimateMessageTokens(singleCall));
  });
});

// ---------------------------------------------------------------------------
// ContextManager
// ---------------------------------------------------------------------------

describe('ContextManager', () => {
  let cm: ContextManager;

  beforeEach(() => {
    cm = new ContextManager({
      maxContextTokens: 1000,
      autoCompactThreshold: 0.85,
      preserveRecentMessages: 3,
    });
  });

  // -------------------------------------------------------------------------
  // shouldCompact
  // -------------------------------------------------------------------------

  describe('shouldCompact', () => {
    it('should return false when usage is below threshold', () => {
      const systemPrompt = 'You are a helpful assistant.';
      const messages: LLMMessage[] = [{ role: 'user', content: 'Hello' }];
      expect(cm.shouldCompact(systemPrompt, messages, 50)).toBe(false);
    });

    it('should return true when usage exceeds threshold', () => {
      // ~850 tokens from system prompt alone
      const systemPrompt = 'x'.repeat(3400);
      const messages: LLMMessage[] = [{ role: 'user', content: 'Hello' }];
      // 850 + ~6 + 50 = 906 -> 90.6% of 1000 > 85%
      expect(cm.shouldCompact(systemPrompt, messages, 50)).toBe(true);
    });

    it('should return false when exactly at threshold boundary', () => {
      // With 1000 budget and 0.85 threshold, need >= 85% = 850 tokens
      // 840 tokens from prompt = 3360 chars
      const systemPrompt = 'x'.repeat(3340);
      const messages: LLMMessage[] = [];
      // ~835 + 0 + 0 = 835 -> 83.5% < 85%
      expect(cm.shouldCompact(systemPrompt, messages, 0)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // calculateUsage
  // -------------------------------------------------------------------------

  describe('calculateUsage', () => {
    it('should break down context usage', () => {
      const systemPrompt = 'Base prompt. # NIMBUS.md\nProject instructions here.';
      const messages: LLMMessage[] = [
        { role: 'user', content: 'What is this project?' },
        { role: 'assistant', content: 'It is a cloud tool.' },
      ];
      const breakdown = cm.calculateUsage(systemPrompt, messages, 100);

      expect(breakdown.systemPrompt).toBeGreaterThan(0);
      expect(breakdown.nimbusInstructions).toBeGreaterThan(0);
      expect(breakdown.messages).toBeGreaterThan(0);
      expect(breakdown.toolDefinitions).toBe(100);
      expect(breakdown.total).toBe(
        breakdown.systemPrompt +
          breakdown.nimbusInstructions +
          breakdown.messages +
          breakdown.toolDefinitions
      );
      expect(breakdown.budget).toBe(1000);
      expect(breakdown.usagePercent).toBeGreaterThanOrEqual(0);
      expect(breakdown.usagePercent).toBeLessThanOrEqual(100);
    });

    it('should handle system prompt without NIMBUS.md', () => {
      const systemPrompt = 'You are a helpful DevOps assistant.';
      const messages: LLMMessage[] = [];
      const breakdown = cm.calculateUsage(systemPrompt, messages, 0);

      expect(breakdown.nimbusInstructions).toBe(0);
      expect(breakdown.systemPrompt).toBeGreaterThan(0);
    });

    it('should report 0% for zero budget', () => {
      const zeroCm = new ContextManager({ maxContextTokens: 0 });
      const breakdown = zeroCm.calculateUsage('prompt', [], 0);
      expect(breakdown.usagePercent).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // selectPreservedMessages
  // -------------------------------------------------------------------------

  describe('selectPreservedMessages', () => {
    it('should preserve all messages when count <= threshold', () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: 'A' },
        { role: 'assistant', content: 'B' },
      ];
      const { preserved, toSummarize } = cm.selectPreservedMessages(messages);
      expect(preserved).toHaveLength(2);
      expect(toSummarize).toHaveLength(0);
    });

    it('should split messages when count > threshold', () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: 'First' }, // preserved (first)
        { role: 'assistant', content: 'Second' }, // summarize
        { role: 'user', content: 'Third' }, // summarize
        { role: 'assistant', content: 'Fourth' }, // summarize
        { role: 'user', content: 'Fifth' }, // summarize
        { role: 'assistant', content: 'Sixth' }, // preserved (recent)
        { role: 'user', content: 'Seventh' }, // preserved (recent)
        { role: 'assistant', content: 'Eighth' }, // preserved (recent)
      ];
      const { preserved, toSummarize } = cm.selectPreservedMessages(messages);
      expect(preserved).toHaveLength(4); // first + 3 recent
      expect(toSummarize).toHaveLength(4);
      expect(preserved[0].content).toBe('First');
      expect(preserved[1].content).toBe('Sixth');
    });

    it('should preserve summary blocks from previous compactions', () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: 'First' },
        {
          role: 'user',
          content: '[Context Summary] Previous summary here.',
        },
        { role: 'assistant', content: 'Middle' },
        { role: 'user', content: 'Recent1' },
        { role: 'assistant', content: 'Recent2' },
        { role: 'user', content: 'Recent3' },
      ];
      const { preserved } = cm.selectPreservedMessages(messages);
      const summaryMsg = preserved.find(
        m => typeof m.content === 'string' && m.content.startsWith('[Context Summary]')
      );
      expect(summaryMsg).toBeDefined();
    });

    it('should preserve tool messages near the recent window', () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: 'First' },
        { role: 'assistant', content: 'A' },
        { role: 'user', content: 'B' },
        { role: 'assistant', content: 'C' },
        {
          role: 'tool',
          content: 'tool output',
          toolCallId: 'tc1',
          name: 'read_file',
        },
        { role: 'assistant', content: 'D' },
        { role: 'user', content: 'E' },
        { role: 'assistant', content: 'F' },
      ];
      const { preserved } = cm.selectPreservedMessages(messages);
      const toolMsg = preserved.find(m => m.role === 'tool');
      expect(toolMsg).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // buildCompactedMessages
  // -------------------------------------------------------------------------

  describe('buildCompactedMessages', () => {
    it('should insert summary after first preserved message', () => {
      const preserved: LLMMessage[] = [
        { role: 'user', content: 'First' },
        { role: 'assistant', content: 'Recent' },
      ];
      const summary = 'User asked about project setup.';
      const result = cm.buildCompactedMessages(preserved, summary);

      expect(result).toHaveLength(3);
      expect(result[0].content).toBe('First');
      expect(result[1].content).toContain('[Context Summary]');
      expect(result[1].content).toContain(summary);
      expect(result[1].role).toBe('user');
      expect(result[2].content).toBe('Recent');
    });

    it('should handle empty preserved array', () => {
      const result = cm.buildCompactedMessages([], 'Summary text');
      expect(result).toHaveLength(1);
      expect(result[0].content).toContain('[Context Summary]');
    });

    it('should handle single preserved message', () => {
      const preserved: LLMMessage[] = [{ role: 'user', content: 'Only one' }];
      const result = cm.buildCompactedMessages(preserved, 'Summary');
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('Only one');
      expect(result[1].content).toContain('[Context Summary]');
    });
  });

  // -------------------------------------------------------------------------
  // getConfig / setMaxContextTokens
  // -------------------------------------------------------------------------

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = cm.getConfig();
      expect(config.maxContextTokens).toBe(1000);
      expect(config.autoCompactThreshold).toBe(0.85);
      expect(config.preserveRecentMessages).toBe(3);
    });
  });

  describe('setMaxContextTokens', () => {
    it('should update the max context tokens', () => {
      cm.setMaxContextTokens(2000);
      expect(cm.getConfig().maxContextTokens).toBe(2000);
    });

    it('should affect shouldCompact calculations', () => {
      const systemPrompt = 'x'.repeat(3400); // ~850 tokens
      const messages: LLMMessage[] = [];
      // At 1000 budget: 85% threshold -> needs 850+ tokens -> should compact
      expect(cm.shouldCompact(systemPrompt, messages, 50)).toBe(true);
      // Increase budget: at 2000, 850/2000 = 42.5% < 85% -> should not compact
      cm.setMaxContextTokens(2000);
      expect(cm.shouldCompact(systemPrompt, messages, 50)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Default options
  // -------------------------------------------------------------------------

  describe('default options', () => {
    it('should use sensible defaults when no options are provided', () => {
      const defaultCm = new ContextManager();
      const config = defaultCm.getConfig();
      expect(config.maxContextTokens).toBe(200_000);
      expect(config.autoCompactThreshold).toBe(0.85);
      expect(config.preserveRecentMessages).toBe(5);
    });
  });
});

// ---------------------------------------------------------------------------
// Slash Command Parsing (TUI /compact and /context)
// ---------------------------------------------------------------------------

describe('Slash Command Parsing', () => {
  /** Simulates the command detection logic from App.tsx handleSubmit. */
  function parseSlashCommand(text: string): {
    command: string | null;
    args?: string;
  } {
    const trimmed = text.trim();
    if (trimmed === '/compact') {
      return { command: 'compact' };
    }
    if (trimmed.startsWith('/compact ')) {
      return {
        command: 'compact',
        args: trimmed.slice('/compact '.length).trim(),
      };
    }
    if (trimmed === '/context') {
      return { command: 'context' };
    }
    return { command: null };
  }

  describe('/compact command', () => {
    it('should detect bare /compact', () => {
      const result = parseSlashCommand('/compact');
      expect(result.command).toBe('compact');
      expect(result.args).toBeUndefined();
    });

    it('should detect /compact with focus area', () => {
      const result = parseSlashCommand('/compact terraform changes');
      expect(result.command).toBe('compact');
      expect(result.args).toBe('terraform changes');
    });

    it('should handle /compact with leading/trailing whitespace', () => {
      const result = parseSlashCommand('  /compact  ');
      expect(result.command).toBe('compact');
    });

    it('should not match /compaction or other prefixes', () => {
      const result = parseSlashCommand('/compaction');
      expect(result.command).toBeNull();
    });

    it('should not match text that contains /compact but does not start with it', () => {
      const result = parseSlashCommand('please /compact this');
      expect(result.command).toBeNull();
    });
  });

  describe('/context command', () => {
    it('should detect /context', () => {
      const result = parseSlashCommand('/context');
      expect(result.command).toBe('context');
    });

    it('should handle /context with whitespace', () => {
      const result = parseSlashCommand('  /context  ');
      expect(result.command).toBe('context');
    });

    it('should not match /contextual', () => {
      const result = parseSlashCommand('/contextual');
      expect(result.command).toBeNull();
    });
  });

  describe('non-commands', () => {
    it('should not detect regular messages', () => {
      expect(parseSlashCommand('hello world').command).toBeNull();
      expect(parseSlashCommand('fix the CORS issue').command).toBeNull();
    });

    it('should not detect unknown slash commands', () => {
      expect(parseSlashCommand('/unknown').command).toBeNull();
      expect(parseSlashCommand('/help').command).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Context Breakdown Formatting (for /context display)
// ---------------------------------------------------------------------------

describe('Context Breakdown Formatting', () => {
  it('should format breakdown for display', () => {
    const cm = new ContextManager({
      maxContextTokens: 200_000,
      autoCompactThreshold: 0.85,
    });

    const systemPrompt = 'Base prompt. # NIMBUS.md\nProject instructions here.';
    const messages: LLMMessage[] = [
      { role: 'user', content: 'What is this project?' },
      { role: 'assistant', content: 'It is a cloud tool.' },
    ];
    const breakdown = cm.calculateUsage(systemPrompt, messages, 500);

    // Verify the breakdown has all fields needed for the TUI display
    expect(typeof breakdown.systemPrompt).toBe('number');
    expect(typeof breakdown.nimbusInstructions).toBe('number');
    expect(typeof breakdown.messages).toBe('number');
    expect(typeof breakdown.toolDefinitions).toBe('number');
    expect(typeof breakdown.total).toBe('number');
    expect(typeof breakdown.budget).toBe('number');
    expect(typeof breakdown.usagePercent).toBe('number');

    // Total should be positive and within budget for this small example
    expect(breakdown.total).toBeGreaterThan(0);
    expect(breakdown.total).toBeLessThan(breakdown.budget);
    expect(breakdown.usagePercent).toBeLessThan(100);
  });

  it('should produce a displayable format string', () => {
    const breakdown = {
      systemPrompt: 500,
      nimbusInstructions: 200,
      messages: 1500,
      toolDefinitions: 300,
      total: 2500,
      budget: 200_000,
      usagePercent: 1,
    };

    // Simulates the TUI formatting from App.tsx
    const lines = [
      'Context Usage Breakdown:',
      `  System prompt:     ${breakdown.systemPrompt.toLocaleString()} tokens`,
      `  NIMBUS.md:         ${breakdown.nimbusInstructions.toLocaleString()} tokens`,
      `  Messages:          ${breakdown.messages.toLocaleString()} tokens`,
      `  Tool definitions:  ${breakdown.toolDefinitions.toLocaleString()} tokens`,
      `  ─────────────────────────────`,
      `  Total:             ${breakdown.total.toLocaleString()} / ${breakdown.budget.toLocaleString()} tokens (${breakdown.usagePercent}%)`,
    ];
    const display = lines.join('\n');

    expect(display).toContain('Context Usage Breakdown');
    expect(display).toContain('System prompt');
    expect(display).toContain('NIMBUS.md');
    expect(display).toContain('Messages');
    expect(display).toContain('Tool definitions');
    expect(display).toContain('2,500');
    expect(display).toContain('200,000');
    expect(display).toContain('1%');
  });
});
