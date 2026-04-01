/**
 * E2E Context Compaction Tests
 *
 * Tests for the context manager (src/agent/context-manager.ts) and
 * compaction agent (src/agent/compaction-agent.ts).
 *
 * Covers: token tracking, auto-compact threshold, infra context preservation,
 * cheapest model usage, extractive fallback, long output truncation,
 * token estimation, context breakdown, per-model window sizes, compaction
 * result structure, configurable thresholds, multiple compactions, and
 * critical message preservation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ContextManager,
  estimateTokens,
  estimateMessageTokens,
  getModelContextWindow,
  type ContextBreakdown,
  type CompactionResult,
} from '../../src/agent/context-manager';
import { runCompaction, type CompactionOptions } from '../../src/agent/compaction-agent';
import type { LLMMessage } from '../../src/llm/types';

// ---------------------------------------------------------------------------
// Mock config DB access (called during ContextManager construction)
// ---------------------------------------------------------------------------

vi.mock('../../src/state/config', () => ({
  getConfig: vi.fn(() => null),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(role: LLMMessage['role'], content: string, toolCalls?: LLMMessage['toolCalls']): LLMMessage {
  return { role, content, toolCalls };
}

function makeConversation(count: number): LLMMessage[] {
  const messages: LLMMessage[] = [];
  for (let i = 0; i < count; i++) {
    if (i % 2 === 0) {
      messages.push(makeMessage('user', `User message ${i}: ${'x'.repeat(100)}`));
    } else {
      messages.push(makeMessage('assistant', `Assistant response ${i}: ${'y'.repeat(200)}`));
    }
  }
  return messages;
}

// ---------------------------------------------------------------------------
// 1. ContextManager tracks token count
// ---------------------------------------------------------------------------

describe('ContextManager — token tracking', () => {
  it('should calculate total token usage from system prompt and messages', () => {
    const cm = new ContextManager({ maxContextTokens: 100_000 });
    const systemPrompt = 'You are a helpful assistant.';
    const messages: LLMMessage[] = [
      makeMessage('user', 'Hello, what is Terraform?'),
      makeMessage('assistant', 'Terraform is an infrastructure as code tool by HashiCorp.'),
    ];

    const usage = cm.calculateUsage(systemPrompt, messages, 500);

    expect(usage.total).toBeGreaterThan(0);
    expect(usage.systemPrompt).toBeGreaterThan(0);
    expect(usage.messages).toBeGreaterThan(0);
    expect(usage.toolDefinitions).toBe(500);
    expect(usage.budget).toBe(100_000);
  });
});

// ---------------------------------------------------------------------------
// 2. Auto-compact triggers at 85% threshold
// ---------------------------------------------------------------------------

describe('Auto-compact threshold', () => {
  it('should trigger compaction at 85% usage', () => {
    const cm = new ContextManager({ maxContextTokens: 1000, autoCompactThreshold: 0.85 });

    // 850/1000 = 85% -- should trigger
    // We need messages with enough tokens. estimateTokens uses text.length/4
    // So for ~850 tokens we need ~3400 chars
    const bigMessage = 'x'.repeat(3400);
    const messages: LLMMessage[] = [makeMessage('user', bigMessage)];

    const shouldCompact = cm.shouldCompact('', messages, 0);
    expect(shouldCompact).toBe(true);
  });

  it('should not trigger compaction below threshold', () => {
    const cm = new ContextManager({ maxContextTokens: 10000, autoCompactThreshold: 0.85 });
    const messages: LLMMessage[] = [makeMessage('user', 'Short message')];

    const shouldCompact = cm.shouldCompact('System prompt', messages, 100);
    expect(shouldCompact).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Compaction preserves infra context
// ---------------------------------------------------------------------------

describe('Compaction — infra context preservation', () => {
  it('should include infra context in compaction summary', async () => {
    const cm = new ContextManager({ maxContextTokens: 100_000, preserveRecentMessages: 2 });
    const messages = makeConversation(10);

    const mockRouter = {
      route: vi.fn(async () => ({
        content: 'Summary of the conversation',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'haiku',
        finishReason: 'stop' as const,
      })),
    };

    const options: CompactionOptions = {
      router: mockRouter as any,
      infraContext: {
        terraformWorkspace: 'staging',
        kubectlContext: 'staging-cluster',
        awsRegion: 'us-east-1',
      },
    };

    const result = await runCompaction(messages, cm, options);

    // The infra context should appear in the compacted messages
    const summaryMsg = result.messages.find(
      m => typeof m.content === 'string' && m.content.includes('[Context Summary]')
    );
    expect(summaryMsg).toBeDefined();
    expect(summaryMsg!.content as string).toContain('Terraform workspace: staging');
    expect(summaryMsg!.content as string).toContain('kubectl context: staging-cluster');
    expect(summaryMsg!.content as string).toContain('AWS region: us-east-1');
  });
});

// ---------------------------------------------------------------------------
// 4. Compaction uses cheapest model (haiku)
// ---------------------------------------------------------------------------

describe('Compaction — model selection', () => {
  it('should default to haiku model for compaction', async () => {
    const cm = new ContextManager({ maxContextTokens: 100_000, preserveRecentMessages: 2 });
    const messages = makeConversation(8);

    const mockRouter = {
      route: vi.fn(async () => ({
        content: 'Conversation summary',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'haiku',
        finishReason: 'stop' as const,
      })),
    };

    await runCompaction(messages, cm, { router: mockRouter as any });

    expect(mockRouter.route).toHaveBeenCalledTimes(1);
    const callArgs = mockRouter.route.mock.calls[0][0];
    expect(callArgs.model).toBe('haiku');
  });

  it('should allow overriding the compaction model', async () => {
    const cm = new ContextManager({ maxContextTokens: 100_000, preserveRecentMessages: 2 });
    const messages = makeConversation(8);

    const mockRouter = {
      route: vi.fn(async () => ({
        content: 'Summary',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'gpt-4o-mini',
        finishReason: 'stop' as const,
      })),
    };

    await runCompaction(messages, cm, {
      router: mockRouter as any,
      model: 'gpt-4o-mini',
    });

    const callArgs = mockRouter.route.mock.calls[0][0];
    expect(callArgs.model).toBe('gpt-4o-mini');
  });
});

// ---------------------------------------------------------------------------
// 5. Extractive fallback when LLM fails
// ---------------------------------------------------------------------------

describe('Compaction — extractive fallback', () => {
  it('should produce a fallback summary when LLM call fails', async () => {
    const cm = new ContextManager({ maxContextTokens: 100_000, preserveRecentMessages: 2 });
    const messages = makeConversation(8);

    const mockRouter = {
      route: vi.fn(async () => {
        throw new Error('LLM API unavailable');
      }),
    };

    const result = await runCompaction(messages, cm, { router: mockRouter as any });

    // Should still produce compacted messages
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.result.savedTokens).toBeGreaterThanOrEqual(0);

    // The fallback summary should contain extractive content
    const summaryMsg = result.messages.find(
      m => typeof m.content === 'string' && m.content.includes('[Context Summary]')
    );
    expect(summaryMsg).toBeDefined();
    expect(summaryMsg!.content as string).toContain('auto-generated');
  });
});

// ---------------------------------------------------------------------------
// 6. Long tool outputs truncated
// ---------------------------------------------------------------------------

describe('Long tool output truncation', () => {
  it('should estimate tokens for very long content', () => {
    const longContent = 'x'.repeat(100_000);
    const tokens = estimateTokens(longContent);
    expect(tokens).toBe(25_000); // 100000 / 4
  });

  it('should handle messages with extremely long tool outputs', () => {
    const cm = new ContextManager({ maxContextTokens: 200_000 });
    const longOutput = 'terraform plan output line\n'.repeat(5000);
    const messages: LLMMessage[] = [
      makeMessage('user', 'Run terraform plan'),
      makeMessage('tool', longOutput),
    ];

    const usage = cm.calculateUsage('System prompt', messages, 0);
    expect(usage.messages).toBeGreaterThan(0);
    expect(usage.total).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Token estimation for different message types
// ---------------------------------------------------------------------------

describe('Token estimation', () => {
  it('should estimate ~1 token per 4 characters', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('12345678')).toBe(2);
    expect(estimateTokens('')).toBe(0);
  });

  it('should round up for partial tokens', () => {
    expect(estimateTokens('abc')).toBe(1); // 3/4 = 0.75, ceil = 1
    expect(estimateTokens('abcde')).toBe(2); // 5/4 = 1.25, ceil = 2
  });

  it('should estimate message tokens including role overhead', () => {
    const msg = makeMessage('user', 'Hello world');
    const tokens = estimateMessageTokens(msg);
    // "Hello world" = 11 chars / 4 = 3 tokens + 4 overhead = 7
    expect(tokens).toBe(7);
  });

  it('should include tool call tokens in estimation', () => {
    const msg = makeMessage('assistant', 'Running terraform plan', [
      {
        id: 'tc-1',
        type: 'function',
        function: { name: 'terraform', arguments: '{"action":"plan"}' },
      },
    ]);

    const tokens = estimateMessageTokens(msg);
    const baseTokens = estimateMessageTokens(makeMessage('assistant', 'Running terraform plan'));
    expect(tokens).toBeGreaterThan(baseTokens);
  });
});

// ---------------------------------------------------------------------------
// 8. Context breakdown reporting
// ---------------------------------------------------------------------------

describe('Context breakdown', () => {
  it('should report all breakdown categories', () => {
    const cm = new ContextManager({ maxContextTokens: 200_000 });
    const systemPrompt = 'You are Nimbus, a DevOps agent.\n\n# NIMBUS.md\nProject: test-app\n## Infrastructure\nAWS us-east-1';
    const messages: LLMMessage[] = [
      makeMessage('user', 'Help me deploy'),
      makeMessage('assistant', 'I will help you deploy the application.'),
    ];

    const breakdown = cm.calculateUsage(systemPrompt, messages, 1000);

    expect(breakdown.systemPrompt).toBeGreaterThan(0);
    expect(breakdown.nimbusInstructions).toBeGreaterThan(0);
    expect(breakdown.messages).toBeGreaterThan(0);
    expect(breakdown.toolDefinitions).toBe(1000);
    expect(breakdown.total).toBe(
      breakdown.systemPrompt + breakdown.nimbusInstructions + breakdown.messages + breakdown.toolDefinitions
    );
    expect(breakdown.budget).toBe(200_000);
    expect(breakdown.usagePercent).toBeLessThan(100);
  });

  it('should separate NIMBUS.md instructions from base system prompt', () => {
    const cm = new ContextManager({ maxContextTokens: 200_000 });

    const systemPromptWithNimbus = 'Base system prompt.\n\n# NIMBUS.md\nProject instructions here.';
    const systemPromptWithoutNimbus = 'Base system prompt only.';

    const withNimbus = cm.calculateUsage(systemPromptWithNimbus, [], 0);
    const withoutNimbus = cm.calculateUsage(systemPromptWithoutNimbus, [], 0);

    expect(withNimbus.nimbusInstructions).toBeGreaterThan(0);
    expect(withoutNimbus.nimbusInstructions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Per-model context window sizes
// ---------------------------------------------------------------------------

describe('Per-model context window sizes', () => {
  it('should return correct window for Claude models', () => {
    expect(getModelContextWindow('claude-sonnet-4-20250514')).toBe(200_000);
    expect(getModelContextWindow('claude-3-5-sonnet-20241022')).toBe(200_000);
    expect(getModelContextWindow('claude-3-haiku-20240307')).toBe(200_000);
  });

  it('should return correct window for OpenAI models', () => {
    expect(getModelContextWindow('gpt-4o')).toBe(128_000);
    expect(getModelContextWindow('gpt-4')).toBe(8_192);
    expect(getModelContextWindow('gpt-3.5-turbo')).toBe(16_385);
  });

  it('should return correct window for Google models', () => {
    expect(getModelContextWindow('gemini-1.5-pro')).toBe(2_097_152);
    expect(getModelContextWindow('gemini-1.5-flash')).toBe(1_048_576);
  });

  it('should return null for unknown models', () => {
    expect(getModelContextWindow('unknown-model-xyz')).toBeNull();
  });

  it('should use prefix matching for versioned models', () => {
    // "gpt-4o-2024-08-06" should match "gpt-4o" prefix
    expect(getModelContextWindow('gpt-4o-2024-08-06')).toBe(128_000);
  });
});

// ---------------------------------------------------------------------------
// 10. Compaction result has summary + preserved messages
// ---------------------------------------------------------------------------

describe('Compaction result structure', () => {
  it('should return compacted messages with a summary block', async () => {
    const cm = new ContextManager({ maxContextTokens: 100_000, preserveRecentMessages: 2 });
    const messages = makeConversation(10);

    const mockRouter = {
      route: vi.fn(async () => ({
        content: 'The user discussed Terraform deployment. Key decisions: use staging workspace.',
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
        model: 'haiku',
        finishReason: 'stop' as const,
      })),
    };

    const result = await runCompaction(messages, cm, { router: mockRouter as any });

    expect(result.result.originalTokens).toBeGreaterThan(0);
    expect(result.result.compactedTokens).toBeGreaterThan(0);
    expect(result.result.savedTokens).toBeGreaterThanOrEqual(0);
    expect(result.result.summaryPreserved).toBe(true);

    // Should have fewer messages than original
    expect(result.messages.length).toBeLessThan(messages.length);

    // Should contain a summary marker
    const hasSummary = result.messages.some(
      m => typeof m.content === 'string' && m.content.includes('[Context Summary]')
    );
    expect(hasSummary).toBe(true);
  });

  it('should return unchanged messages when nothing to summarize', async () => {
    const cm = new ContextManager({ maxContextTokens: 100_000, preserveRecentMessages: 10 });
    const messages = makeConversation(4); // fewer than preserveRecentMessages + 1

    const mockRouter = { route: vi.fn() };
    const result = await runCompaction(messages, cm, { router: mockRouter as any });

    // No summarization needed -- router should not be called
    expect(mockRouter.route).not.toHaveBeenCalled();
    expect(result.messages).toEqual(messages);
    expect(result.result.savedTokens).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 11. Token count for system prompt
// ---------------------------------------------------------------------------

describe('Token count — system prompt', () => {
  it('should estimate tokens for a typical system prompt', () => {
    const systemPrompt = `You are Nimbus, an AI-powered DevOps engineering agent.
You help users with infrastructure as code, cloud operations, and Kubernetes.
Always follow best practices and warn about destructive operations.`;

    const tokens = estimateTokens(systemPrompt);
    expect(tokens).toBeGreaterThan(30);
    expect(tokens).toBeLessThan(200);
  });
});

// ---------------------------------------------------------------------------
// 12. Token count for tool definitions
// ---------------------------------------------------------------------------

describe('Token count — tool definitions', () => {
  it('should estimate tokens for serialized tool schemas', () => {
    const toolSchemaJson = JSON.stringify([
      { name: 'read_file', description: 'Read file contents', parameters: { type: 'object', properties: { path: { type: 'string' } } } },
      { name: 'bash', description: 'Execute a bash command', parameters: { type: 'object', properties: { command: { type: 'string' } } } },
    ]);

    const tokens = estimateTokens(toolSchemaJson);
    expect(tokens).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 13. Threshold is configurable
// ---------------------------------------------------------------------------

describe('Configurable threshold', () => {
  it('should respect custom threshold value', () => {
    const cm = new ContextManager({ maxContextTokens: 1000, autoCompactThreshold: 0.50 });

    // 500/1000 = 50% -- should trigger at 0.50 threshold
    const messages: LLMMessage[] = [makeMessage('user', 'x'.repeat(2000))]; // ~500 tokens
    const shouldCompact = cm.shouldCompact('', messages, 0);
    expect(shouldCompact).toBe(true);
  });

  it('should not compact at low threshold with little content', () => {
    const cm = new ContextManager({ maxContextTokens: 100_000, autoCompactThreshold: 0.95 });
    const messages: LLMMessage[] = [makeMessage('user', 'Hello')];
    const shouldCompact = cm.shouldCompact('Short prompt', messages, 100);
    expect(shouldCompact).toBe(false);
  });

  it('should expose config via getConfig()', () => {
    const cm = new ContextManager({
      maxContextTokens: 50_000,
      autoCompactThreshold: 0.70,
      preserveRecentMessages: 10,
    });

    const config = cm.getConfig();
    expect(config.maxContextTokens).toBe(50_000);
    expect(config.autoCompactThreshold).toBe(0.70);
    expect(config.preserveRecentMessages).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 14. Multiple compactions in a session
// ---------------------------------------------------------------------------

describe('Multiple compactions', () => {
  it('should handle successive compaction rounds', async () => {
    const cm = new ContextManager({ maxContextTokens: 100_000, preserveRecentMessages: 2 });

    const mockRouter = {
      route: vi.fn(async () => ({
        content: 'Round summary',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'haiku',
        finishReason: 'stop' as const,
      })),
    };

    // First round
    let messages = makeConversation(10);
    let result = await runCompaction(messages, cm, { router: mockRouter as any });
    expect(result.messages.length).toBeLessThan(messages.length);

    // Add more messages to the compacted conversation
    const moreMessages: LLMMessage[] = [
      ...result.messages,
      makeMessage('user', 'Now deploy to production'),
      makeMessage('assistant', 'I will help you deploy to production.'),
      makeMessage('user', 'What resources will change?'),
      makeMessage('assistant', 'Let me run terraform plan to check.'),
      makeMessage('user', 'Proceed with apply'),
      makeMessage('assistant', 'Running terraform apply...'),
    ];

    // Second round
    result = await runCompaction(moreMessages, cm, { router: mockRouter as any });
    expect(result.messages.length).toBeLessThan(moreMessages.length);
    expect(mockRouter.route).toHaveBeenCalledTimes(2);
  });

  it('should preserve summary blocks from previous compactions', () => {
    const cm = new ContextManager({ maxContextTokens: 100_000, preserveRecentMessages: 3 });

    const messages: LLMMessage[] = [
      makeMessage('user', 'Initial question'),
      makeMessage('user', '[Context Summary] Previous conversation summary here.'),
      makeMessage('user', 'Follow-up question 1'),
      makeMessage('assistant', 'Response 1'),
      makeMessage('user', 'Follow-up question 2'),
      makeMessage('assistant', 'Response 2'),
      makeMessage('user', 'Follow-up question 3'),
      makeMessage('assistant', 'Response 3'),
    ];

    const { preserved, toSummarize } = cm.selectPreservedMessages(messages);

    // The summary block should be preserved
    const summaryPreserved = preserved.some(
      m => typeof m.content === 'string' && m.content.includes('[Context Summary]')
    );
    expect(summaryPreserved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 15. Compaction doesn't lose critical messages
// ---------------------------------------------------------------------------

describe('Critical message preservation', () => {
  it('should always preserve the first message', () => {
    const cm = new ContextManager({ maxContextTokens: 100_000, preserveRecentMessages: 2 });
    const messages = makeConversation(10);

    const { preserved } = cm.selectPreservedMessages(messages);
    expect(preserved[0]).toBe(messages[0]);
  });

  it('should always preserve recent messages', () => {
    const cm = new ContextManager({ maxContextTokens: 100_000, preserveRecentMessages: 3 });
    const messages = makeConversation(10);

    const { preserved } = cm.selectPreservedMessages(messages);

    // Last 3 messages should be preserved
    const lastThree = messages.slice(-3);
    for (const msg of lastThree) {
      expect(preserved).toContain(msg);
    }
  });

  it('should preserve terraform plan output messages', () => {
    const cm = new ContextManager({ maxContextTokens: 100_000, preserveRecentMessages: 2 });

    const messages: LLMMessage[] = [
      makeMessage('user', 'Run plan'),
      makeMessage('assistant', 'Running terraform plan...'),
      makeMessage('tool', 'Plan: 3 to add, 1 to change, 0 to destroy.\n# aws_instance.web will be created'),
      makeMessage('assistant', 'The plan shows 3 resources will be created.'),
      makeMessage('user', 'What about costs?'),
      makeMessage('assistant', 'Let me check the cost estimation.'),
      makeMessage('user', 'Apply it'),
      makeMessage('assistant', 'Applying terraform changes...'),
    ];

    const { preserved, toSummarize } = cm.selectPreservedMessages(messages);

    // The terraform plan tool message should be preserved
    const planPreserved = preserved.some(
      m => typeof m.content === 'string' && m.content.includes('will be created')
    );
    expect(planPreserved).toBe(true);
  });

  it('should preserve tool messages near the recent window', () => {
    const cm = new ContextManager({ maxContextTokens: 100_000, preserveRecentMessages: 3 });

    const messages: LLMMessage[] = [
      makeMessage('user', 'First question'),
      makeMessage('assistant', 'First answer'),
      makeMessage('user', 'Second question'),
      makeMessage('assistant', 'Second answer'),
      makeMessage('user', 'Run a command'),
      makeMessage('tool', 'Command output here'),  // near recent window
      makeMessage('assistant', 'The command succeeded.'),
      makeMessage('user', 'Thanks!'),
      makeMessage('assistant', 'You are welcome!'),
    ];

    const { preserved } = cm.selectPreservedMessages(messages);

    // Tool message at index 5 should be within 2 positions of the recent window
    // Recent window starts at index 6 (9 - 3), so index 5 = 6 - 1 is within range
    const toolPreserved = preserved.some(
      m => typeof m.content === 'string' && m.content.includes('Command output here')
    );
    expect(toolPreserved).toBe(true);
  });

  it('should build compacted messages with summary in correct position', () => {
    const cm = new ContextManager({ maxContextTokens: 100_000 });

    const preserved: LLMMessage[] = [
      makeMessage('user', 'Initial context'),
      makeMessage('user', 'Recent question'),
      makeMessage('assistant', 'Recent answer'),
    ];

    const result = cm.buildCompactedMessages(preserved, 'This is the conversation summary.');

    // First message preserved, then summary, then remaining preserved
    expect(result).toHaveLength(4);
    expect(result[0].content).toBe('Initial context');
    expect((result[1].content as string)).toContain('[Context Summary]');
    expect((result[1].content as string)).toContain('This is the conversation summary.');
    expect(result[2].content).toBe('Recent question');
    expect(result[3].content).toBe('Recent answer');
  });

  it('should update max context tokens via setModel', () => {
    const cm = new ContextManager({ maxContextTokens: 200_000 });

    const updated = cm.setModel('gpt-4');
    expect(updated).toBe(true);
    expect(cm.getConfig().maxContextTokens).toBe(8_192);
  });

  it('should not change tokens for unknown model', () => {
    const cm = new ContextManager({ maxContextTokens: 200_000 });

    const updated = cm.setModel('completely-unknown-model');
    expect(updated).toBe(false);
    expect(cm.getConfig().maxContextTokens).toBe(200_000);
  });
});
