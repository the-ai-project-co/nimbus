/**
 * Ink TUI Launcher
 *
 * Bridges the Ink-based App component with the core agent loop.
 * This is the entry point for `nimbus chat --ui=ink` (and the default).
 */

import React from 'react';
import { render } from 'ink';
import {
  App,
  AppErrorBoundary,
  type AppProps,
  type AppImperativeAPI,
  type CompactCommandResult,
  type ContextCommandResult,
  type UndoRedoResult,
  type OnModelsCallback,
  type OnModelChangeCallback,
  type OnModeChangeCallback,
  type SessionSummary,
} from '../App';
import type { UIMessage, UIToolCall } from '../types';
import { getAppContext } from '../../app';
import { runAgentLoop, type AgentLoopResult } from '../../agent/loop';
import { buildSystemPrompt, type AgentMode } from '../../agent/system-prompt';
import { ContextManager } from '../../agent/context-manager';
import { SnapshotManager } from '../../snapshots/manager';
import { defaultToolRegistry, type ToolDefinition } from '../../tools/schemas/types';
import { getTextContent, type LLMMessage } from '../../llm/types';
import { SessionManager } from '../../sessions/manager';
import {
  createPermissionState,
  checkPermission,
  approveForSession,
  approveActionForSession,
  type PermissionSessionState,
} from '../../agent/permissions';
import { FileWatcher } from '../../watcher';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface InkChatOptions {
  /** LLM model to use. */
  model?: string;
  /** Custom system prompt. */
  systemPrompt?: string;
  /** Show token count in status bar. */
  showTokenCount?: boolean;
  /** Initial agent mode. */
  mode?: AgentMode;
  /** Resume a previous session by ID. */
  resumeSessionId?: string;
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

  // Use mutable refs so /model, /mode, and Tab changes propagate to the agent loop
  let currentMode: AgentMode = options.mode ?? 'build';
  let currentModel: string | undefined = options.model;
  const contextManager = new ContextManager({ model: currentModel });
  const snapshotManager = new SnapshotManager({ projectDir: process.cwd() });

  // Concurrent message guard: prevent overlapping agent loop runs
  let isRunning = false;

  // Eagerly load NIMBUS.md for explicit pass-through to the agent loop
  let nimbusInstructions: string | undefined;
  const nimbusMdPaths = [
    join(process.cwd(), 'NIMBUS.md'),
    join(process.cwd(), '.nimbus', 'NIMBUS.md'),
  ];
  for (const p of nimbusMdPaths) {
    if (existsSync(p)) {
      try {
        nimbusInstructions = readFileSync(p, 'utf-8');
        break;
      } catch {
        /* skip */
      }
    }
  }

  // Start filesystem watcher for external change awareness
  const watcher = new FileWatcher(process.cwd());
  watcher.start();

  // Create or resume a session for conversation persistence
  let sessionManager: SessionManager | null = null;
  let sessionId: string | null = null;
  try {
    sessionManager = SessionManager.getInstance();

    if (options.resumeSessionId) {
      // Resume an existing session
      const existing = sessionManager.get(options.resumeSessionId);
      if (existing) {
        sessionId = existing.id;
        sessionManager.resume(existing.id);
      }
    }

    if (!sessionId) {
      // Create a new session
      const session = sessionManager.create({
        name: `chat-${new Date().toISOString().slice(0, 16)}`,
        mode: currentMode,
        model: currentModel,
        cwd: process.cwd(),
      });
      sessionId = session.id;
    }
  } catch (sessionErr) {
    // Session persistence is non-critical — warn so user knows history won't be saved
    process.stderr.write(
      `\x1b[33m  Warning: Session persistence unavailable (${sessionErr instanceof Error ? sessionErr.message : 'unknown error'}). Chat history will not be saved.\x1b[0m\n`
    );
  }

  // Conversation history shared between turns.
  // When resuming, restore saved conversation from the session.
  let history: LLMMessage[] = [];
  if (options.resumeSessionId && sessionManager && sessionId) {
    try {
      const restored = sessionManager.loadConversation(sessionId);
      if (restored.length > 0) {
        history = restored;
      }
    } catch {
      // Restore is non-critical
    }
  }

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
      case 'auto_allow':
        return 'low';
      case 'ask_once':
        return 'medium';
      case 'always_ask':
        return 'high';
      case 'blocked':
        return 'critical';
      default:
        return 'medium';
    }
  }

  /**
   * Prompt the user for permission via the Ink PermissionPrompt component.
   * Uses the imperative API to render the prompt inside the TUI.
   */
  function promptPermission(
    tool: ToolDefinition,
    input: unknown
  ): Promise<'allow' | 'deny' | 'block'> {
    const toolInput = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};

    return new Promise(resolve => {
      if (!api) {
        // Imperative API not yet wired — deny by default
        resolve('deny');
        return;
      }

      api.requestPermission({
        tool: tool.name,
        input: toolInput,
        riskLevel: getRiskLevel(tool),
        onDecide: decision => {
          // Map PermissionPrompt decisions to agent loop decisions
          switch (decision) {
            case 'approve':
              resolve('allow');
              break;
            case 'session': {
              approveForSession(tool, permissionState);
              const action = toolInput.action;
              if (typeof action === 'string') {
                approveActionForSession(tool.name, action, permissionState);
              }
              resolve('allow');
              break;
            }
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
  // Track the timestamp of each turn so watcher can report changes since last turn
  let lastTurnTimestamp = Date.now();

  const onMessage = async (text: string) => {
    // Gap 1: Prevent concurrent agent loop runs (would corrupt history)
    if (isRunning) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        content: 'Please wait — the agent is still processing the previous message.',
        timestamp: new Date(),
      });
      return;
    }
    isRunning = true;
    abortController = new AbortController();

    // Prepend external file change summary if any files changed since last turn
    const changeSummary = watcher.getSummary(lastTurnTimestamp);
    const enrichedText = changeSummary ? `[System: ${changeSummary}]\n\n${text}` : text;
    watcher.clearChanges();
    lastTurnTimestamp = Date.now();

    try {
      const result: AgentLoopResult = await runAgentLoop(enrichedText, history, {
        router: ctx.router,
        toolRegistry: defaultToolRegistry,
        mode: currentMode,
        model: currentModel,
        cwd: process.cwd(),
        nimbusInstructions,
        signal: abortController.signal,
        contextManager,
        snapshotManager,
        onText: chunk => {
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
        onToolCallStart: info => {
          const toolCall: UIToolCall = {
            id: info.id,
            name: info.name,
            input:
              info.input && typeof info.input === 'object'
                ? (info.input as Record<string, unknown>)
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
        onUsage: (usage, costUSD) => {
          // Update the TUI in real-time after each LLM turn
          updateSession({
            tokenCount: usage.totalTokens,
            costUSD,
          });
        },
        onCompact: compactResult => {
          addMessage({
            id: crypto.randomUUID(),
            role: 'system',
            content: `Context auto-compacted: saved ${compactResult.savedTokens.toLocaleString()} tokens.`,
            timestamp: new Date(),
          });
        },
        checkPermission: async (tool, input) => {
          const decision = checkPermission(tool, input, permissionState);
          if (decision === 'allow') {
            return 'allow';
          }
          if (decision === 'block') {
            return 'block';
          }
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
        } catch {
          /* persistence is non-critical */
        }
      }

      // Finalize the streamed assistant message with the complete content.
      // If onText was never called (e.g., the response was only tool calls),
      // add the final assistant message now.
      const lastAssistantMsg = [...result.messages].reverse().find(m => m.role === 'assistant');

      if (lastAssistantMsg) {
        const finalContent = getTextContent(lastAssistantMsg.content);
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
        } catch {
          /* non-critical */
        }
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
      isRunning = false;
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
      mode: currentMode,
      tools: defaultToolRegistry.getAll(),
      cwd: process.cwd(),
    });

    const toolTokens = defaultToolRegistry
      .getAll()
      .reduce((sum, t) => sum + Math.ceil(JSON.stringify(t).length / 4), 0);

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
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        _encode = require('gpt-tokenizer').encode;
      } catch {
        /* fallback */
      }
    }
    if (_encode) {
      try {
        return _encode(text).length;
      } catch {
        /* fallback */
      }
    }
    return Math.ceil(text.length / 4);
  }

  /**
   * Handle /context command.
   */
  const onContext = (): ContextCommandResult | null => {
    const systemPrompt = buildSystemPrompt({
      mode: currentMode,
      tools: defaultToolRegistry.getAll(),
      cwd: process.cwd(),
    });

    const systemTokens = estimateTokens(systemPrompt);
    const messageTokens = history.reduce(
      (sum, m) => sum + estimateTokens(getTextContent(m.content)),
      0
    );
    const toolTokens = defaultToolRegistry
      .getAll()
      .reduce((sum, t) => sum + estimateTokens(JSON.stringify(t)), 0);
    const total = systemTokens + messageTokens + toolTokens;
    // Use the context manager's actual budget (model-aware, not hardcoded)
    const budget = contextManager.getConfig().maxContextTokens;

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

  /**
   * Handle /models command — list all available models across providers.
   */
  const onModels: OnModelsCallback = async () => {
    return ctx.router.getAvailableModels();
  };

  /**
   * Handle /clear command — reset the LLM conversation history.
   */
  const onClear = () => {
    history = [];
  };

  /**
   * Handle /model change — update the model used by the agent loop.
   */
  const onModelChange: OnModelChangeCallback = (model: string) => {
    currentModel = model;
    // Update context manager's budget for the new model
    contextManager.setModel(model);
  };

  /**
   * Handle mode change (Tab or /mode) — update the mode used by the agent loop.
   * Resets permission state to prevent privilege escalation.
   */
  const onModeChange: OnModeChangeCallback = (newMode: AgentMode) => {
    currentMode = newMode;
    // Reset permission state when switching modes (security)
    Object.assign(permissionState, createPermissionState());
  };

  /**
   * Handle /sessions command — list active sessions.
   */
  const onSessions = (): SessionSummary[] => {
    if (!sessionManager) {
      return [];
    }
    try {
      const sessions = sessionManager.list();
      return sessions.map(s => ({
        id: s.id,
        name: s.name ?? `session-${s.id.slice(0, 8)}`,
        model: s.model ?? 'default',
        mode: s.mode ?? 'build',
        updatedAt: s.updatedAt ?? new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  };

  /**
   * Handle /new command — create a new session, reset history.
   */
  const onNewSession = (name?: string): SessionSummary | null => {
    if (!sessionManager) {
      return null;
    }
    try {
      const newSession = sessionManager.create({
        name: name ?? `chat-${new Date().toISOString().slice(0, 16)}`,
        mode: currentMode,
        model: currentModel,
        cwd: process.cwd(),
      });
      // Reset conversation history for the new session
      history = [];
      sessionId = newSession.id;
      return {
        id: newSession.id,
        name: newSession.name ?? name ?? 'new session',
        model: currentModel ?? 'default',
        mode: currentMode,
        updatedAt: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  };

  /**
   * Handle /switch command — switch to a different session.
   */
  const onSwitchSession = (targetId: string): SessionSummary | null => {
    if (!sessionManager) {
      return null;
    }
    try {
      // Find session by ID prefix match
      const sessions = sessionManager.list();
      const target = sessions.find(s => s.id === targetId || s.id.startsWith(targetId));
      if (!target) {
        return null;
      }

      // Save current conversation before switching
      if (sessionId) {
        try {
          sessionManager.saveConversation(sessionId, history);
        } catch {
          /* non-critical */
        }
      }

      // Load the target session's conversation
      sessionId = target.id;
      sessionManager.resume(target.id);
      try {
        const restored = sessionManager.loadConversation(target.id);
        history = restored;
      } catch {
        history = [];
      }

      return {
        id: target.id,
        name: target.name ?? `session-${target.id.slice(0, 8)}`,
        model: target.model ?? 'default',
        mode: target.mode ?? 'build',
        updatedAt: target.updatedAt ?? new Date().toISOString(),
      };
    } catch {
      return null;
    }
  };

  // Convert restored LLM history into UIMessages for the TUI
  const initialMessages: UIMessage[] = history
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      id: crypto.randomUUID(),
      role: m.role as 'user' | 'assistant',
      content: getTextContent(m.content),
      timestamp: new Date(),
    }));

  // Build props for the App component
  const appProps: AppProps = {
    initialSession: {
      model: options.model ?? 'default',
      mode: currentMode,
    },
    initialMessages: initialMessages.length > 0 ? initialMessages : undefined,
    onMessage,
    onAbort,
    onCompact,
    onContext,
    onUndo,
    onRedo,
    onModels,
    onClear,
    onModelChange,
    onModeChange,
    onSessions,
    onNewSession,
    onSwitchSession,
    onReady: imperativeApi => {
      api = imperativeApi;
    },
  };

  // Render the Ink application wrapped in an error boundary
  const { waitUntilExit } = render(
    React.createElement(AppErrorBoundary, null, React.createElement(App, appProps))
  );

  // When the TUI exits, clean up watcher and mark session as completed
  process.on('exit', () => {
    watcher.stop();
    if (sessionManager && sessionId) {
      try {
        sessionManager.complete(sessionId);
      } catch {
        /* ignore */
      }
    }
  });

  // Keep the process alive until the user exits (Ctrl+C twice, or exit())
  await waitUntilExit();
}
