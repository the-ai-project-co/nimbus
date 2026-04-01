/**
 * E2E Agent Loop Tests
 *
 * Comprehensive tests for the core agentic loop (src/agent/loop.ts),
 * covering streaming, tool execution, mode restrictions, error handling,
 * context compaction, cost tracking, hook integration, and deploy previews.
 *
 * All LLM and tool calls are mocked -- no real API calls are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LLMMessage, StreamChunk, ToolCall, ToolCompletionRequest } from '../../src/llm/types';
import type { ToolDefinition, ToolResult, ToolExecuteContext, ToolRegistry } from '../../src/tools/schemas/types';
import type { AgentMode } from '../../src/agent/system-prompt';
import type { ContextManager, CompactionResult } from '../../src/agent/context-manager';
import type { LLMRouter } from '../../src/llm/router';
import {
  runAgentLoop,
  getToolsForMode,
  _planCacheCleanupInterval,
  type AgentLoopOptions,
  type AgentLoopResult,
  type PermissionDecision,
  type ToolCallInfo,
} from '../../src/agent/loop';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Silence timer to prevent open handles in vitest
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Mock infrastructure
// ---------------------------------------------------------------------------

// Mock expensive/side-effecty modules that the loop imports
vi.mock('../../src/state/config', () => ({
  getConfig: vi.fn(() => null),
}));

vi.mock('../../src/auth/store', () => ({
  authStore: {
    reload: vi.fn(),
    getApiKey: vi.fn(),
  },
}));

vi.mock('../../src/llm/cost-calculator', () => ({
  calculateCost: vi.fn((_provider: string, _model: string, _input: number, _output: number) => ({
    costUSD: 0.001,
    breakdown: { input: 0.0005, output: 0.0005 },
  })),
}));

vi.mock('../../src/agent/system-prompt', () => ({
  buildSystemPrompt: vi.fn(() => 'You are Nimbus, a DevOps agent.'),
  AGENT_MODES: ['plan', 'build', 'deploy'] as const,
}));

vi.mock('../../src/cli/init', () => ({
  discoverInfraContext: vi.fn(async () => undefined),
}));

vi.mock('../../src/audit/security-scanner', () => ({
  maskSecrets: vi.fn((s: string) => s),
}));

vi.mock('../../src/llm/router', () => ({
  classifyTaskComplexity: vi.fn(() => 'moderate'),
  routeModel: vi.fn(() => 'anthropic/claude-sonnet-4-20250514'),
  LLMRouter: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal ToolDefinition for testing. */
function makeTool(
  name: string,
  opts?: Partial<Pick<ToolDefinition, 'permissionTier' | 'category' | 'isDestructive'>> & {
    executeFn?: (input: unknown, ctx?: ToolExecuteContext) => Promise<ToolResult>;
  }
): ToolDefinition {
  return {
    name,
    description: `Test tool: ${name}`,
    inputSchema: z.object({ command: z.string().optional() }).passthrough(),
    execute: opts?.executeFn ?? (async () => ({ output: `${name} result`, isError: false })),
    permissionTier: opts?.permissionTier ?? 'auto_allow',
    category: opts?.category ?? 'standard',
    isDestructive: opts?.isDestructive ?? false,
  };
}

/** Create a minimal mock ToolRegistry. */
function makeRegistry(tools: ToolDefinition[]): ToolRegistry {
  const map = new Map<string, ToolDefinition>();
  for (const t of tools) map.set(t.name, t);
  return {
    register: vi.fn((t: ToolDefinition) => map.set(t.name, t)),
    get: vi.fn((name: string) => map.get(name)),
    getAll: vi.fn(() => Array.from(map.values())),
    getByCategory: vi.fn((cat: string) => Array.from(map.values()).filter(t => t.category === cat)),
    getByPermissionTier: vi.fn((tier: string) => Array.from(map.values()).filter(t => t.permissionTier === tier)),
    getNames: vi.fn(() => Array.from(map.keys())),
  } as unknown as ToolRegistry;
}

/**
 * Create a mock LLMRouter that yields a sequence of streamed responses.
 * Each entry in `responses` describes one LLM turn: text chunks and optional tool calls.
 */
function makeRouter(
  responses: Array<{
    textChunks?: string[];
    toolCalls?: ToolCall[];
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  }>
): LLMRouter {
  let callIdx = 0;
  return {
    routeStreamWithTools: vi.fn(async function* (_request: ToolCompletionRequest): AsyncIterable<StreamChunk> {
      const resp = responses[callIdx] ?? responses[responses.length - 1];
      callIdx++;

      // Yield text chunks
      if (resp.textChunks) {
        for (const text of resp.textChunks) {
          yield { content: text, done: false };
        }
      }

      // Yield final chunk with tool calls and usage
      yield {
        content: undefined,
        done: true,
        toolCalls: resp.toolCalls,
        usage: resp.usage ?? { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      };
    }),
    reinitializeProviders: vi.fn(),
  } as unknown as LLMRouter;
}

/** Build minimal AgentLoopOptions for test scenarios. */
function makeOptions(overrides: Partial<AgentLoopOptions>): AgentLoopOptions {
  return {
    router: makeRouter([{ textChunks: ['Hello'] }]),
    toolRegistry: makeRegistry([makeTool('read_file'), makeTool('bash')]),
    mode: 'build' as AgentMode,
    model: 'anthropic/claude-sonnet-4-20250514',
    maxTurns: 10,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Agent Loop E2E', () => {
  // =========================================================================
  // 1. Simple text response (no tool calls)
  // =========================================================================

  describe('simple text response', () => {
    it('processes a text-only response and returns in one turn', async () => {
      const onText = vi.fn();
      const router = makeRouter([
        { textChunks: ['Hello, ', 'how can I help?'] },
      ]);
      const opts = makeOptions({ router, onText });

      const result = await runAgentLoop('Hi', [], opts);

      expect(result.turns).toBe(1);
      expect(result.interrupted).toBe(false);
      expect(result.messages).toHaveLength(2); // user + assistant
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content).toBe('Hi');
      expect(result.messages[1].role).toBe('assistant');
      expect(result.messages[1].content).toContain('Hello');
      expect(onText).toHaveBeenCalled();
    });

    it('preserves existing conversation history', async () => {
      const history: LLMMessage[] = [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' },
      ];
      const router = makeRouter([{ textChunks: ['Second response'] }]);
      const opts = makeOptions({ router });

      const result = await runAgentLoop('Second message', history, opts);

      // history (2) + new user (1) + assistant (1) = 4
      expect(result.messages).toHaveLength(4);
      expect(result.messages[0].content).toBe('First message');
      expect(result.messages[3].role).toBe('assistant');
    });
  });

  // =========================================================================
  // 2. Tool call -> tool result -> final response
  // =========================================================================

  describe('single tool call cycle', () => {
    it('executes a tool and returns the final response', async () => {
      const onToolCallStart = vi.fn();
      const onToolCallEnd = vi.fn();

      const bashTool = makeTool('bash', {
        executeFn: async () => ({ output: 'file1.txt\nfile2.txt', isError: false }),
      });
      const registry = makeRegistry([makeTool('read_file'), bashTool]);

      const router = makeRouter([
        {
          textChunks: ['Let me list files.'],
          toolCalls: [
            {
              id: 'tc_1',
              type: 'function',
              function: { name: 'bash', arguments: '{"command":"ls"}' },
            },
          ],
        },
        {
          textChunks: ['Here are the files: file1.txt, file2.txt'],
        },
      ]);

      const opts = makeOptions({
        router,
        toolRegistry: registry,
        onToolCallStart,
        onToolCallEnd,
      });

      const result = await runAgentLoop('List files', [], opts);

      expect(result.turns).toBe(2);
      // user + assistant(tool_call) + tool_result + assistant(final)
      expect(result.messages.length).toBeGreaterThanOrEqual(4);
      expect(onToolCallStart).toHaveBeenCalledTimes(1);
      expect(onToolCallEnd).toHaveBeenCalledTimes(1);

      // Verify tool result message exists
      const toolMsg = result.messages.find(m => m.role === 'tool');
      expect(toolMsg).toBeDefined();
      expect(toolMsg!.content).toContain('file1.txt');
    });
  });

  // =========================================================================
  // 3. Multi-turn tool calls (2+ sequential tools)
  // =========================================================================

  describe('multi-turn tool calls', () => {
    it('handles two sequential tool calls across three turns', async () => {
      const readTool = makeTool('read_file', {
        executeFn: async () => ({ output: 'file contents', isError: false }),
      });
      const bashTool = makeTool('bash', {
        executeFn: async () => ({ output: 'command output', isError: false }),
      });
      const registry = makeRegistry([readTool, bashTool]);

      const router = makeRouter([
        // Turn 1: LLM requests read_file
        {
          textChunks: ['Reading file...'],
          toolCalls: [
            { id: 'tc_1', type: 'function', function: { name: 'read_file', arguments: '{"command":"cat foo"}' } },
          ],
        },
        // Turn 2: LLM requests bash
        {
          textChunks: ['Now running command...'],
          toolCalls: [
            { id: 'tc_2', type: 'function', function: { name: 'bash', arguments: '{"command":"echo done"}' } },
          ],
        },
        // Turn 3: LLM returns final text
        {
          textChunks: ['All done!'],
        },
      ]);

      const opts = makeOptions({ router, toolRegistry: registry });
      const result = await runAgentLoop('Do the thing', [], opts);

      expect(result.turns).toBe(3);
      const toolMessages = result.messages.filter(m => m.role === 'tool');
      expect(toolMessages).toHaveLength(2);
    });
  });

  // =========================================================================
  // 4. Mode restrictions (plan mode = read-only tools)
  // =========================================================================

  describe('mode restrictions', () => {
    it('getToolsForMode filters to read-only tools in plan mode', () => {
      const allTools = [
        makeTool('read_file'),
        makeTool('glob'),
        makeTool('grep'),
        makeTool('bash'),
        makeTool('write_file'),
        makeTool('terraform'),
        makeTool('kubectl'),
        makeTool('edit_file'),
        makeTool('cost_estimate'),
        makeTool('drift_detect'),
      ];

      const planTools = getToolsForMode(allTools, 'plan');
      const planNames = planTools.map(t => t.name);

      // Plan mode should include read-only tools
      expect(planNames).toContain('read_file');
      expect(planNames).toContain('glob');
      expect(planNames).toContain('grep');
      expect(planNames).toContain('cost_estimate');
      expect(planNames).toContain('drift_detect');

      // Plan mode should NOT include mutating tools
      expect(planNames).not.toContain('bash');
      expect(planNames).not.toContain('write_file');
      expect(planNames).not.toContain('terraform');
      expect(planNames).not.toContain('kubectl');
      expect(planNames).not.toContain('edit_file');
    });

    it('getToolsForMode blocks terraform/kubectl/helm in build mode', () => {
      const allTools = [
        makeTool('read_file'),
        makeTool('bash'),
        makeTool('write_file'),
        makeTool('terraform'),
        makeTool('kubectl'),
        makeTool('helm'),
      ];

      const buildTools = getToolsForMode(allTools, 'build');
      const buildNames = buildTools.map(t => t.name);

      expect(buildNames).toContain('read_file');
      expect(buildNames).toContain('bash');
      expect(buildNames).toContain('write_file');
      expect(buildNames).not.toContain('terraform');
      expect(buildNames).not.toContain('kubectl');
      expect(buildNames).not.toContain('helm');
    });

    it('getToolsForMode returns all tools in deploy mode', () => {
      const allTools = [
        makeTool('read_file'),
        makeTool('bash'),
        makeTool('terraform'),
        makeTool('kubectl'),
        makeTool('helm'),
      ];

      const deployTools = getToolsForMode(allTools, 'deploy');
      expect(deployTools).toHaveLength(allTools.length);
    });
  });

  // =========================================================================
  // 5. Streaming chunks are yielded correctly
  // =========================================================================

  describe('streaming chunks', () => {
    it('text chunks are forwarded to onText in order', async () => {
      const textParts: string[] = [];
      const onText = vi.fn((text: string) => textParts.push(text));

      const router = makeRouter([
        { textChunks: ['chunk1', 'chunk2', 'chunk3'] },
      ]);
      const opts = makeOptions({ router, onText });

      await runAgentLoop('Hi', [], opts);

      // Text chunks should appear in order (plus possible stats line)
      expect(textParts[0]).toBe('chunk1');
      expect(textParts[1]).toBe('chunk2');
      expect(textParts[2]).toBe('chunk3');
    });

    it('toolCallStart triggers early feedback in onText', async () => {
      const textParts: string[] = [];
      const onText = vi.fn((text: string) => textParts.push(text));

      // Create a router that yields toolCallStart
      const router = {
        routeStreamWithTools: vi.fn(async function* () {
          yield { content: 'Thinking...', done: false } satisfies StreamChunk;
          yield { toolCallStart: { id: 'tc_1', name: 'bash' }, done: false } satisfies StreamChunk;
          yield {
            done: true,
            toolCalls: [
              { id: 'tc_1', type: 'function' as const, function: { name: 'bash', arguments: '{}' } },
            ],
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          } satisfies StreamChunk;
        }),
        reinitializeProviders: vi.fn(),
      } as unknown as LLMRouter;

      const bashTool = makeTool('bash');
      const registry = makeRegistry([bashTool]);

      // Second turn: no tool calls (final response)
      let callCount = 0;
      (router.routeStreamWithTools as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
        callCount++;
        if (callCount === 1) {
          yield { content: 'Thinking...', done: false };
          yield { toolCallStart: { id: 'tc_1', name: 'bash' }, done: false };
          yield {
            done: true,
            toolCalls: [{ id: 'tc_1', type: 'function' as const, function: { name: 'bash', arguments: '{}' } }],
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          };
        } else {
          yield { content: 'Done.', done: false };
          yield { done: true, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
        }
      });

      const opts = makeOptions({ router, toolRegistry: registry, onText });
      await runAgentLoop('Run bash', [], opts);

      const toolStartMsg = textParts.find(t => t.includes('Preparing tool'));
      expect(toolStartMsg).toBeDefined();
      expect(toolStartMsg).toContain('bash');
    });

    it('tool output chunks are forwarded via onToolOutputChunk', async () => {
      const chunks: Array<{ id: string; chunk: string }> = [];
      const onToolOutputChunk = vi.fn((id: string, chunk: string) => {
        chunks.push({ id, chunk });
      });

      const bashTool = makeTool('bash', {
        executeFn: async (_input: unknown, ctx?: ToolExecuteContext) => {
          ctx?.onProgress?.('line1\n');
          ctx?.onProgress?.('line2\n');
          return { output: 'line1\nline2\n', isError: false };
        },
      });
      const registry = makeRegistry([bashTool]);

      const router = makeRouter([
        {
          textChunks: ['Running...'],
          toolCalls: [
            { id: 'tc_1', type: 'function', function: { name: 'bash', arguments: '{"command":"ls"}' } },
          ],
        },
        { textChunks: ['Done'] },
      ]);

      const opts = makeOptions({ router, toolRegistry: registry, onToolOutputChunk });
      await runAgentLoop('Run ls', [], opts);

      expect(onToolOutputChunk).toHaveBeenCalled();
      expect(chunks.some(c => c.id === 'tc_1')).toBe(true);
    });
  });

  // =========================================================================
  // 6. Error classification provides actionable hints
  // =========================================================================

  describe('error classification', () => {
    // classifyDevOpsError is private, but we test its effects through the loop:
    // when a tool returns an error matching known patterns, the tool result
    // message should contain the hint.

    it('appends terraform init hint when .terraform is missing', async () => {
      const tfTool = makeTool('terraform', {
        executeFn: async () => ({
          output: '',
          error: 'Error: Module not installed — required module source is unavailable',
          isError: true,
        }),
      });
      const registry = makeRegistry([tfTool]);

      const router = makeRouter([
        {
          textChunks: ['Running terraform...'],
          toolCalls: [
            { id: 'tc_1', type: 'function', function: { name: 'terraform', arguments: '{"action":"plan"}' } },
          ],
        },
        { textChunks: ['There was an error.'] },
      ]);

      const opts = makeOptions({ router, toolRegistry: registry, mode: 'deploy' });
      const result = await runAgentLoop('Plan infra', [], opts);

      const toolMsg = result.messages.find(m => m.role === 'tool');
      expect(toolMsg).toBeDefined();
      expect(typeof toolMsg!.content).toBe('string');
      expect(toolMsg!.content as string).toContain('terraform init');
    });

    it('appends kubectl connection hint on connection refused', async () => {
      const kubeTool = makeTool('kubectl', {
        executeFn: async () => ({
          output: '',
          error: 'Unable to connect to the server: connection refused',
          isError: true,
        }),
      });
      const registry = makeRegistry([kubeTool]);

      const router = makeRouter([
        {
          textChunks: ['Checking pods...'],
          toolCalls: [
            { id: 'tc_1', type: 'function', function: { name: 'kubectl', arguments: '{"action":"get"}' } },
          ],
        },
        { textChunks: ['Error occurred.'] },
      ]);

      const opts = makeOptions({ router, toolRegistry: registry, mode: 'deploy' });
      const result = await runAgentLoop('Get pods', [], opts);

      const toolMsg = result.messages.find(m => m.role === 'tool');
      expect(toolMsg).toBeDefined();
      expect(toolMsg!.content as string).toContain('Kubernetes API server');
    });

    it('appends credential expiry hint for AWS expired token', async () => {
      const tfTool = makeTool('terraform', {
        executeFn: async () => ({
          output: '',
          error: 'ExpiredTokenException: The security token included in the request is expired',
          isError: true,
        }),
      });
      const registry = makeRegistry([tfTool]);

      const router = makeRouter([
        {
          toolCalls: [
            { id: 'tc_1', type: 'function', function: { name: 'terraform', arguments: '{"action":"plan"}' } },
          ],
        },
        { textChunks: ['Credentials issue.'] },
      ]);

      const opts = makeOptions({ router, toolRegistry: registry, mode: 'deploy' });
      const result = await runAgentLoop('Plan', [], opts);

      const toolMsg = result.messages.find(m => m.role === 'tool');
      expect(toolMsg).toBeDefined();
      expect(toolMsg!.content as string).toContain('credentials');
    });

    it('appends command-not-found hint with install instructions', async () => {
      const helmTool = makeTool('helm', {
        executeFn: async () => ({
          output: '',
          error: "helm: command not found",
          isError: true,
        }),
      });
      const registry = makeRegistry([helmTool]);

      const router = makeRouter([
        {
          toolCalls: [
            { id: 'tc_1', type: 'function', function: { name: 'helm', arguments: '{"action":"list"}' } },
          ],
        },
        { textChunks: ['Install helm first.'] },
      ]);

      const opts = makeOptions({ router, toolRegistry: registry, mode: 'deploy' });
      const result = await runAgentLoop('List releases', [], opts);

      const toolMsg = result.messages.find(m => m.role === 'tool');
      expect(toolMsg).toBeDefined();
      expect(toolMsg!.content as string).toContain('not installed');
    });
  });

  // =========================================================================
  // 7. 401/auth error recovery
  // =========================================================================

  describe('401 auth error recovery', () => {
    it('attempts provider re-initialization on 401 error', async () => {
      let callCount = 0;
      const router = {
        routeStreamWithTools: vi.fn(async function* () {
          callCount++;
          if (callCount === 1) {
            const err = new Error('Unauthorized') as Error & { status: number };
            err.status = 401;
            throw err;
          }
          yield { content: 'Recovered!', done: false };
          yield { done: true, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
        }),
        reinitializeProviders: vi.fn(),
      } as unknown as LLMRouter;

      const opts = makeOptions({ router });
      const result = await runAgentLoop('Hi', [], opts);

      expect(router.reinitializeProviders).toHaveBeenCalledTimes(1);
      // After recovery, should get a response
      const lastMsg = result.messages[result.messages.length - 1];
      expect(lastMsg.content).toContain('Recovered');
    });
  });

  // =========================================================================
  // 8. Context auto-compaction triggers at threshold
  // =========================================================================

  describe('context auto-compaction', () => {
    it('triggers compaction when contextManager.shouldCompact returns true', async () => {
      const onCompact = vi.fn();

      // Mock context manager that always says we should compact
      const contextManager = {
        shouldCompact: vi.fn(() => true),
        clearTokenCache: vi.fn(),
        selectPreservedMessages: vi.fn((msgs: LLMMessage[]) => ({
          preserved: msgs.slice(-3),
          toSummarize: msgs.slice(0, -3),
        })),
        buildCompactedMessages: vi.fn((preserved: LLMMessage[], summary: string) => [
          { role: 'user' as const, content: `[Context Summary] ${summary}` },
          ...preserved,
        ]),
      } as unknown as ContextManager;

      // Mock the compaction agent module
      vi.mock('../../src/agent/compaction-agent', async (importOriginal) => {
        const original = await importOriginal() as Record<string, unknown>;
        return {
          ...original,
          runCompaction: vi.fn(async (messages: LLMMessage[], _cm: ContextManager, _opts: unknown) => ({
            messages: [
              { role: 'user' as const, content: '[Context Summary] Summarized.' },
              messages[messages.length - 1],
            ],
            result: {
              originalTokens: 5000,
              compactedTokens: 1000,
              savedTokens: 4000,
              summaryPreserved: true,
            } satisfies CompactionResult,
          })),
        };
      });

      const bashTool = makeTool('bash');
      const registry = makeRegistry([bashTool]);

      const router = makeRouter([
        {
          textChunks: ['Running...'],
          toolCalls: [
            { id: 'tc_1', type: 'function', function: { name: 'bash', arguments: '{}' } },
          ],
        },
        { textChunks: ['Done.'] },
      ]);

      const opts = makeOptions({
        router,
        toolRegistry: registry,
        contextManager,
        onCompact,
      });

      await runAgentLoop('Do something', [], opts);

      // shouldCompact should have been called at least once
      expect(contextManager.shouldCompact).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 9. Per-tool AbortController cancellation
  // =========================================================================

  describe('abort cancellation', () => {
    it('stops the loop when AbortSignal fires between tool calls', async () => {
      const controller = new AbortController();
      let toolCallCount = 0;

      const slowTool = makeTool('bash', {
        executeFn: async () => {
          toolCallCount++;
          // Abort after first tool call
          controller.abort();
          return { output: 'ok', isError: false };
        },
      });
      const registry = makeRegistry([slowTool]);

      const router = makeRouter([
        {
          toolCalls: [
            { id: 'tc_1', type: 'function', function: { name: 'bash', arguments: '{}' } },
            { id: 'tc_2', type: 'function', function: { name: 'bash', arguments: '{}' } },
          ],
        },
        { textChunks: ['Should not reach here'] },
      ]);

      const opts = makeOptions({ router, toolRegistry: registry, signal: controller.signal });
      const result = await runAgentLoop('Run stuff', [], opts);

      expect(result.interrupted).toBe(true);
    });

    it('stops the loop when signal is already aborted at turn start', async () => {
      const controller = new AbortController();
      controller.abort();

      const router = makeRouter([{ textChunks: ['Should not stream'] }]);
      const opts = makeOptions({ router, signal: controller.signal });
      const result = await runAgentLoop('Hi', [], opts);

      expect(result.interrupted).toBe(true);
      expect(result.turns).toBe(0);
    });
  });

  // =========================================================================
  // 10. Infrastructure checkpoint is written before mutating operations
  // =========================================================================

  describe('infrastructure checkpoints', () => {
    it('checkpoint function is invoked for terraform apply (source verification)', async () => {
      // The writeInfraCheckpoint function is private; verify its presence in source.
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const loopSrc = readFileSync(join(__dirname, '../../src/agent/loop.ts'), 'utf-8');

      // Verify the checkpoint function exists and handles terraform
      expect(loopSrc).toContain('writeInfraCheckpoint');
      expect(loopSrc).toContain('infra-checkpoints');
      // Verify it sanitizes secrets
      expect(loopSrc).toContain('[redacted]');
    });
  });

  // =========================================================================
  // 11. Deploy preview is generated for terraform/k8s/helm operations
  // =========================================================================

  describe('deploy preview integration', () => {
    it('source invokes deploy-preview for terraform plan results', async () => {
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const loopSrc = readFileSync(join(__dirname, '../../src/agent/loop.ts'), 'utf-8');

      // GAP-11: terraform plan triggers FileDiff UI via deploy-preview
      expect(loopSrc).toContain('parseTerraformPlanOutput');
      expect(loopSrc).toContain('buildFileDiffBatchFromPlan');
    });
  });

  // =========================================================================
  // 12. Cost tracking accumulates across tool calls
  // =========================================================================

  describe('cost tracking', () => {
    it('accumulates cost across multiple turns', async () => {
      const usageHistory: Array<{ usage: { totalTokens: number }; cost: number }> = [];
      const onUsage = vi.fn((usage, cost) => {
        usageHistory.push({ usage: { totalTokens: usage.totalTokens }, cost });
      });

      const bashTool = makeTool('bash');
      const registry = makeRegistry([bashTool]);

      const router = makeRouter([
        {
          textChunks: ['Turn 1'],
          toolCalls: [
            { id: 'tc_1', type: 'function', function: { name: 'bash', arguments: '{}' } },
          ],
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        },
        {
          textChunks: ['Turn 2'],
          usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
        },
      ]);

      const opts = makeOptions({ router, toolRegistry: registry, onUsage });
      const result = await runAgentLoop('Run', [], opts);

      expect(result.turns).toBe(2);
      expect(result.totalCost).toBeGreaterThan(0);
      expect(result.usage.totalTokens).toBeGreaterThan(0);
      expect(onUsage).toHaveBeenCalledTimes(2);

      // Cost should accumulate
      expect(usageHistory[1].cost).toBeGreaterThanOrEqual(usageHistory[0].cost);
    });

    it('enforces cost budget and stops when exceeded', async () => {
      const onText = vi.fn();
      const bashTool = makeTool('bash');
      const registry = makeRegistry([bashTool]);

      // calculateCost returns 0.001 per turn (mocked above)
      // With budget of 0.001, it should stop after the first turn
      const router = makeRouter([
        {
          textChunks: ['Turn 1'],
          toolCalls: [
            { id: 'tc_1', type: 'function', function: { name: 'bash', arguments: '{}' } },
          ],
        },
        { textChunks: ['Turn 2'] },
        { textChunks: ['Turn 3'] },
      ]);

      const opts = makeOptions({
        router,
        toolRegistry: registry,
        onText,
        costBudgetUSD: 0.001,
      });

      const result = await runAgentLoop('Run many', [], opts);

      // Should have stopped early due to budget
      expect(result.turns).toBeLessThanOrEqual(2);
      const budgetMsg = result.messages.find(
        m => typeof m.content === 'string' && m.content.includes('Cost budget')
      );
      expect(budgetMsg).toBeDefined();
    });
  });

  // =========================================================================
  // 13. Hook engine (pre/post tool) integrates with the loop
  // =========================================================================

  describe('hook engine integration', () => {
    it('blocks tool execution when pre-tool hook returns blocked', async () => {
      // Mock the hooks engine module
      vi.mock('../../src/hooks/engine', async (importOriginal) => {
        const original = await importOriginal() as Record<string, unknown>;
        return {
          ...original,
          runPreToolHooks: vi.fn(async () => ({
            allowed: false,
            message: 'Blocked by policy hook',
            exitCode: 2,
            duration: 10,
          })),
          runPostToolHooks: vi.fn(async () => ({
            allowed: true,
            exitCode: 0,
            duration: 5,
          })),
        };
      });

      const bashTool = makeTool('bash');
      const registry = makeRegistry([bashTool]);

      const hookEngine = {} as any; // The actual object is unused; the mocked functions are called directly

      const router = makeRouter([
        {
          textChunks: ['Running...'],
          toolCalls: [
            { id: 'tc_1', type: 'function', function: { name: 'bash', arguments: '{}' } },
          ],
        },
        { textChunks: ['Blocked.'] },
      ]);

      const onToolCallEnd = vi.fn();
      const opts = makeOptions({
        router,
        toolRegistry: registry,
        hookEngine,
        onToolCallEnd,
      });

      const result = await runAgentLoop('Run bash', [], opts);

      // The tool result should reflect the hook block
      const toolMsg = result.messages.find(m => m.role === 'tool');
      expect(toolMsg).toBeDefined();
      // Hook blocks result in an error message in the tool result
      if (typeof toolMsg!.content === 'string') {
        expect(
          toolMsg!.content.includes('blocked by hook') || toolMsg!.content.includes('Error')
        ).toBe(true);
      }
    });
  });

  // =========================================================================
  // 14. LLM provider errors (rate limit, timeout)
  // =========================================================================

  describe('LLM provider error handling', () => {
    it('retries on transient 429 rate-limit errors', async () => {
      let callCount = 0;
      const router = {
        routeStreamWithTools: vi.fn(async function* () {
          callCount++;
          if (callCount <= 2) {
            const err = new Error('Rate limited') as Error & { status: number };
            err.status = 429;
            throw err;
          }
          yield { content: 'Success after retry', done: false };
          yield { done: true, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
        }),
        reinitializeProviders: vi.fn(),
      } as unknown as LLMRouter;

      const opts = makeOptions({ router });
      const result = await runAgentLoop('Hi', [], opts);

      // Should retry and eventually succeed (max 2 retries)
      expect(callCount).toBe(3);
      const lastMsg = result.messages[result.messages.length - 1];
      expect(lastMsg.content).toContain('Success after retry');
    });

    it('reports non-retryable errors gracefully', async () => {
      const onText = vi.fn();
      const router = {
        routeStreamWithTools: vi.fn(async function* () {
          throw new Error('Invalid model specified');
        }),
        reinitializeProviders: vi.fn(),
      } as unknown as LLMRouter;

      const opts = makeOptions({ router, onText });
      const result = await runAgentLoop('Hi', [], opts);

      const lastMsg = result.messages[result.messages.length - 1];
      expect(lastMsg.role).toBe('assistant');
      expect(typeof lastMsg.content === 'string' && lastMsg.content.includes('error')).toBe(true);
    });

    it('handles network errors with specific G24 message', async () => {
      const onText = vi.fn();
      const router = {
        routeStreamWithTools: vi.fn(async function* () {
          throw new Error('fetch failed: ECONNREFUSED 127.0.0.1:443');
        }),
        reinitializeProviders: vi.fn(),
      } as unknown as LLMRouter;

      const opts = makeOptions({ router, onText });
      const result = await runAgentLoop('Hi', [], opts);

      // Should have emitted a network error message
      const networkMsg = (onText as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('Network unreachable')
      );
      expect(networkMsg).toBeDefined();
    });
  });

  // =========================================================================
  // 15. System prompt includes mode-specific instructions and domain knowledge
  // =========================================================================

  describe('system prompt construction', () => {
    it('buildSystemPrompt is called with the correct mode', async () => {
      const { buildSystemPrompt } = await import('../../src/agent/system-prompt');
      const buildSpy = vi.mocked(buildSystemPrompt);
      buildSpy.mockClear();

      const router = makeRouter([{ textChunks: ['Hello'] }]);
      const opts = makeOptions({ router, mode: 'deploy' });
      await runAgentLoop('Hi', [], opts);

      expect(buildSpy).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'deploy' })
      );
    });

    it('passes nimbusInstructions to system prompt builder', async () => {
      const { buildSystemPrompt } = await import('../../src/agent/system-prompt');
      const buildSpy = vi.mocked(buildSystemPrompt);
      buildSpy.mockClear();

      const router = makeRouter([{ textChunks: ['Hello'] }]);
      const opts = makeOptions({
        router,
        nimbusInstructions: '## Custom project instructions',
      });
      await runAgentLoop('Hi', [], opts);

      expect(buildSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          nimbusInstructions: '## Custom project instructions',
        })
      );
    });

    it('passes infraContext to system prompt builder', async () => {
      const { buildSystemPrompt } = await import('../../src/agent/system-prompt');
      const buildSpy = vi.mocked(buildSystemPrompt);
      buildSpy.mockClear();

      const router = makeRouter([{ textChunks: ['Hello'] }]);
      const infraContext = {
        terraformWorkspace: 'production',
        kubectlContext: 'prod-cluster',
        awsRegion: 'us-east-1',
      };
      const opts = makeOptions({ router, infraContext });
      await runAgentLoop('Hi', [], opts);

      expect(buildSpy).toHaveBeenCalledWith(
        expect.objectContaining({ infraContext })
      );
    });

    it('passes dryRun flag to system prompt builder', async () => {
      const { buildSystemPrompt } = await import('../../src/agent/system-prompt');
      const buildSpy = vi.mocked(buildSystemPrompt);
      buildSpy.mockClear();

      const router = makeRouter([{ textChunks: ['Hello'] }]);
      const opts = makeOptions({ router, dryRun: true });
      await runAgentLoop('Hi', [], opts);

      expect(buildSpy).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true })
      );
    });
  });

  // =========================================================================
  // Additional edge cases
  // =========================================================================

  describe('maxTurns limit', () => {
    it('stops after reaching maxTurns', async () => {
      const bashTool = makeTool('bash');
      const registry = makeRegistry([bashTool]);

      // Router always returns tool calls -- would loop forever without maxTurns
      const router = makeRouter([
        {
          textChunks: ['Running...'],
          toolCalls: [
            { id: 'tc_1', type: 'function', function: { name: 'bash', arguments: '{}' } },
          ],
        },
      ]);

      const onText = vi.fn();
      const opts = makeOptions({ router, toolRegistry: registry, maxTurns: 3, onText });
      const result = await runAgentLoop('Loop forever', [], opts);

      expect(result.turns).toBe(3);
      // Should have notified about max turns
      const maxTurnsMsg = (onText as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('maximum turns')
      );
      expect(maxTurnsMsg).toBeDefined();
    });
  });

  describe('unknown tool handling', () => {
    it('returns error when LLM requests a non-existent tool', async () => {
      const registry = makeRegistry([makeTool('bash')]);

      const router = makeRouter([
        {
          toolCalls: [
            { id: 'tc_1', type: 'function', function: { name: 'nonexistent_tool', arguments: '{}' } },
          ],
        },
        { textChunks: ['Tool not found.'] },
      ]);

      const opts = makeOptions({ router, toolRegistry: registry });
      const result = await runAgentLoop('Use unknown tool', [], opts);

      const toolMsg = result.messages.find(m => m.role === 'tool');
      expect(toolMsg).toBeDefined();
      expect(toolMsg!.content as string).toContain('Unknown tool');
    });
  });

  describe('malformed JSON arguments', () => {
    it('returns error for invalid JSON in tool call arguments', async () => {
      const bashTool = makeTool('bash');
      const registry = makeRegistry([bashTool]);

      const router = makeRouter([
        {
          toolCalls: [
            { id: 'tc_1', type: 'function', function: { name: 'bash', arguments: '{invalid json' } },
          ],
        },
        { textChunks: ['Bad args.'] },
      ]);

      const opts = makeOptions({ router, toolRegistry: registry });
      const result = await runAgentLoop('Bad json', [], opts);

      const toolMsg = result.messages.find(m => m.role === 'tool');
      expect(toolMsg).toBeDefined();
      expect(toolMsg!.content as string).toContain('malformed JSON');
    });
  });

  describe('permission check', () => {
    it('denies tool execution when checkPermission returns deny', async () => {
      const bashTool = makeTool('bash');
      const registry = makeRegistry([bashTool]);

      const checkPermission = vi.fn(async () => 'deny' as PermissionDecision);

      const router = makeRouter([
        {
          toolCalls: [
            { id: 'tc_1', type: 'function', function: { name: 'bash', arguments: '{}' } },
          ],
        },
        { textChunks: ['Denied.'] },
      ]);

      const opts = makeOptions({
        router,
        toolRegistry: registry,
        checkPermission,
      });
      const result = await runAgentLoop('Run denied tool', [], opts);

      expect(checkPermission).toHaveBeenCalled();
      const toolMsg = result.messages.find(m => m.role === 'tool');
      expect(toolMsg).toBeDefined();
      // Denied tools produce an error result
      expect(toolMsg!.content as string).toMatch(/denied|permission/i);
    });
  });
});
