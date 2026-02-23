/**
 * Ink TUI Launcher
 *
 * Bridges the Ink-based App component with the core agent loop.
 * This is the entry point for `nimbus chat --ui=ink` (and the default).
 */

import React from 'react';
import { render } from 'ink';
import { App } from '../App';
import type { AppProps, AppImperativeAPI, CompactCommandResult, ContextCommandResult, UndoRedoResult } from '../App';
import type { UIMessage, UIToolCall } from '../types';
import { getAppContext } from '../../app';
import { runAgentLoop } from '../../agent/loop';
import type { AgentLoopResult } from '../../agent/loop';
import { buildSystemPrompt } from '../../agent/system-prompt';
import type { AgentMode } from '../../agent/system-prompt';
import { ContextManager } from '../../agent/context-manager';
import { SnapshotManager } from '../../snapshots/manager';
import { defaultToolRegistry } from '../../tools/schemas/types';
import type { ToolDefinition } from '../../tools/schemas/types';
import type { LLMMessage } from '../../llm/types';
import { SessionManager } from '../../sessions/manager';
import {
  createPermissionState,
  checkPermission,
  approveForSession,
  approveActionForSession,
  type PermissionSessionState,
} from '../../agent/permissions';

export interface InkChatOptions {
  /** LLM model to use. */
  model?: string;
  /** Custom system prompt. */
  systemPrompt?: string;
  /** Show token count in status bar. */
  showTokenCount?: boolean;
  /** Initial agent mode. */
  mode?: AgentMode;
}

/**
 * Launch the Ink-based interactive chat TUI.
 *
 * Renders the React/Ink `App` component and wires it to the core agent
 * loop so that each user message triggers an agentic conversation turn.
 */
export async function startInkChat(options: InkChatOptions = {}): Promise<void> {
  const ctx = getAppContext();
  if (!ctx) {
    throw new Error('App not initialised. Call initApp() before startInkChat().');
  }

  const mode: AgentMode = options.mode ?? 'build';
  const contextManager = new ContextManager();
  const snapshotManager = new SnapshotManager({ projectDir: process.cwd() });

  // Create a session for conversation persistence
  let sessionManager: SessionManager | null = null;
  let sessionId: string | null = null;
  try {
    sessionManager = SessionManager.getInstance();
    const session = sessionManager.create({
      name: `chat-${new Date().toISOString().slice(0, 16)}`,
      mode,
      model: options.model,
      cwd: process.cwd(),
    });
    sessionId = session.id;
  } catch {
    // Session persistence is non-critical
  }

  // Conversation history shared between turns
  let history: LLMMessage[] = [];

  // AbortController for cancellation (Ctrl+C / Escape)
  let abortController = new AbortController();

  // Permission session state (tracks ask-once approvals)
  const permissionState: PermissionSessionState = createPermissionState();

  // Imperative API populated by the App component's onReady callback.
  let api: AppImperativeAPI | undefined;

  // Convenience accessors (safe to call before onReady fires).
  const addMessage = (msg: UIMessage) => api?.addMessage(msg);
  const updateMessage = (id: string, content: string) => api?.updateMessage(id, content);
  const setProcessing = (v: boolean) => api?.setProcessing(v);
  const updateSession = (patch: Record<string, unknown>) =>
    api?.updateSession(patch as Record<string, unknown>);
  const setToolCalls = (calls: UIToolCall[]) => api?.setToolCalls(calls);

  // Track active tool calls for UI updates
  const activeToolCalls: Map<string, UIToolCall> = new Map();

  // Track the in-flight streaming message so we can update it incrementally
  let streamingMessageId: string | null = null;
  let streamingContent = '';

  /**
   * Derive a risk level from the tool's permission tier.
   */
  function getRiskLevel(tool: ToolDefinition): 'low' | 'medium' | 'high' | 'critical' {
    switch (tool.permissionTier) {
      case 'auto_allow': return 'low';
      case 'ask_once': return 'medium';
      case 'always_ask': return 'high';
      case 'blocked': return 'critical';
      default: return 'medium';
    }
  }

  /**
   * Prompt the user for permission via the Ink PermissionPrompt component.
   * Uses the imperative API to render the prompt inside the TUI.
   */
  function promptPermission(tool: ToolDefinition, input: unknown): Promise<'allow' | 'deny' | 'block'> {
    const toolInput = (input && typeof input === 'object')
      ? input as Record<string, unknown>
      : {};

    return new Promise((resolve) => {
      if (!api) {
        // Imperative API not yet wired — deny by default
        resolve('deny');
        return;
      }

      api.requestPermission({
        tool: tool.name,
        input: toolInput,
        riskLevel: getRiskLevel(tool),
        onDecide: (decision) => {
          // Map PermissionPrompt decisions to agent loop decisions
          switch (decision) {
            case 'approve':
              resolve('allow');
              break;
            case 'session':
              approveForSession(tool, permissionState);
              const action = toolInput.action;
              if (typeof action === 'string') {
                approveActionForSession(tool.name, action, permissionState);
              }
              resolve('allow');
              break;
            case 'approve_all':
              approveForSession(tool, permissionState);
              resolve('allow');
              break;
            case 'reject':
            default:
              resolve('deny');
              break;
          }
        },
      });
    });
  }

  /**
   * Handle a user message: run the agent loop and stream results back
   * into the TUI.
   */
  const onMessage = async (text: string) => {
    abortController = new AbortController();

    try {
      const result: AgentLoopResult = await runAgentLoop(text, history, {
        router: ctx.router,
        toolRegistry: defaultToolRegistry,
        mode,
        model: options.model,
        cwd: process.cwd(),
        signal: abortController.signal,
        contextManager,
        onText: (chunk) => {
          // Stream text incrementally into the TUI
          if (!streamingMessageId) {
            streamingMessageId = crypto.randomUUID();
            streamingContent = chunk;
            addMessage({
              id: streamingMessageId,
              role: 'assistant',
              content: streamingContent,
              timestamp: new Date(),
            });
          } else {
            streamingContent += chunk;
            updateMessage(streamingMessageId, streamingContent);
          }
        },
        onToolCallStart: (info) => {
          const toolCall: UIToolCall = {
            id: info.id,
            name: info.name,
            input: (info.input && typeof info.input === 'object')
              ? info.input as Record<string, unknown>
              : {},
            status: 'running',
          };
          activeToolCalls.set(info.id, toolCall);
          setToolCalls([...activeToolCalls.values()]);
        },
        onToolCallEnd: (info, toolResult) => {
          const existing = activeToolCalls.get(info.id);
          if (existing) {
            existing.status = toolResult.isError ? 'failed' : 'completed';
            existing.result = {
              output: toolResult.isError ? (toolResult.error ?? '') : toolResult.output,
              isError: toolResult.isError,
            };
          }
          setToolCalls([...activeToolCalls.values()]);
        },
        onCompact: (compactResult) => {
          addMessage({
            id: crypto.randomUUID(),
            role: 'system',
            content: `Context auto-compacted: saved ${compactResult.savedTokens.toLocaleString()} tokens.`,
            timestamp: new Date(),
          });
        },
        checkPermission: async (tool, input) => {
          const decision = checkPermission(tool, input, permissionState);
          if (decision === 'allow') return 'allow';
          if (decision === 'block') return 'block';
          // decision === 'ask': prompt the user
          return promptPermission(tool, input);
        },
      });

      // Clear active tool calls now that the turn is complete
      activeToolCalls.clear();
      setToolCalls([]);

      // Update history with the full conversation from this turn
      history = result.messages;

      // Persist conversation to SQLite
      if (sessionManager && sessionId) {
        try {
          sessionManager.saveConversation(sessionId, history);
        } catch { /* persistence is non-critical */ }
      }

      // Finalize the streamed assistant message with the complete content.
      // If onText was never called (e.g., the response was only tool calls),
      // add the final assistant message now.
      const lastAssistantMsg = [...result.messages]
        .reverse()
        .find((m) => m.role === 'assistant');

      if (lastAssistantMsg) {
        const finalContent = lastAssistantMsg.content ?? '';
        if (streamingMessageId) {
          // Update the streamed message with the final complete content
          updateMessage(streamingMessageId, finalContent);
        } else {
          // No streaming happened — add the message now
          addMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: finalContent,
            timestamp: new Date(),
          });
        }
      }

      // Reset streaming state for the next turn
      streamingMessageId = null;
      streamingContent = '';

      // Update session stats
      updateSession({
        tokenCount: result.usage.totalTokens,
        costUSD: result.totalCost,
      });

      // Persist session stats to SQLite
      if (sessionManager && sessionId) {
        try {
          sessionManager.updateSession(sessionId, {
            tokenCount: result.usage.totalTokens,
            costUSD: result.totalCost,
          });
        } catch { /* non-critical */ }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        content: `Error: ${msg}`,
        timestamp: new Date(),
      });
      // Reset streaming state on error too
      streamingMessageId = null;
      streamingContent = '';
    } finally {
      setProcessing(false);
    }
  };

  /**
   * Handle abort (Ctrl+C / Escape while processing).
   */
  const onAbort = () => {
    abortController.abort();
  };

  /**
   * Handle /compact command.
   */
  const onCompact = async (focusArea?: string): Promise<CompactCommandResult | null> => {
    const systemPrompt = buildSystemPrompt({
      mode,
      tools: defaultToolRegistry.getAll(),
      cwd: process.cwd(),
    });

    const toolTokens = defaultToolRegistry.getAll().reduce(
      (sum, t) => sum + Math.ceil(JSON.stringify(t).length / 4),
      0,
    );

    if (!contextManager.shouldCompact(systemPrompt, history, toolTokens)) {
      return null;
    }

    const { runCompaction } = await import('../../agent/compaction-agent');
    const result = await runCompaction(history, contextManager, {
      router: ctx.router,
      focusArea,
    });
    history = result.messages;

    return {
      originalTokens: result.result.originalTokens,
      compactedTokens: result.result.compactedTokens,
      savedTokens: result.result.savedTokens,
    };
  };

  /**
   * Estimate token count using gpt-tokenizer (falls back to char/4).
   */
  let _encode: ((text: string) => unknown[]) | null = null;
  let _encodeLoaded = false;
  function estimateTokens(text: string): number {
    if (!_encodeLoaded) {
      _encodeLoaded = true;
      try { _encode = require('gpt-tokenizer').encode; } catch { /* fallback */ }
    }
    if (_encode) {
      try { return _encode(text).length; } catch { /* fallback */ }
    }
    return Math.ceil(text.length / 4);
  }

  /**
   * Handle /context command.
   */
  const onContext = (): ContextCommandResult | null => {
    const systemPrompt = buildSystemPrompt({
      mode,
      tools: defaultToolRegistry.getAll(),
      cwd: process.cwd(),
    });

    const systemTokens = estimateTokens(systemPrompt);
    const messageTokens = history.reduce(
      (sum, m) => sum + estimateTokens(m.content ?? ''),
      0,
    );
    const toolTokens = defaultToolRegistry.getAll().reduce(
      (sum, t) => sum + estimateTokens(JSON.stringify(t)),
      0,
    );
    const total = systemTokens + messageTokens + toolTokens;
    const budget = 200_000;

    return {
      systemPrompt: systemTokens,
      nimbusInstructions: 0,
      messages: messageTokens,
      toolDefinitions: toolTokens,
      total,
      budget,
      usagePercent: Math.round((total / budget) * 100),
    };
  };

  /**
   * Handle /undo command.
   */
  const onUndo = async (): Promise<UndoRedoResult> => {
    return snapshotManager.undo();
  };

  /**
   * Handle /redo command.
   */
  const onRedo = async (): Promise<UndoRedoResult> => {
    return snapshotManager.redo();
  };

  // Build props for the App component
  const appProps: AppProps = {
    initialSession: {
      model: options.model ?? 'default',
      mode,
    },
    onMessage,
    onAbort,
    onCompact,
    onContext,
    onUndo,
    onRedo,
    onReady: (imperativeApi) => {
      api = imperativeApi;
    },
  };

  // Render the Ink application
  const { waitUntilExit } = render(
    React.createElement(App, appProps),
  );

  // When the TUI exits, mark the session as completed
  process.on('exit', () => {
    if (sessionManager && sessionId) {
      try { sessionManager.complete(sessionId); } catch { /* ignore */ }
    }
  });

  // Keep the process alive until the user exits (Ctrl+C twice, or exit())
  await waitUntilExit();
}
