/**
 * App Component
 *
 * Root Ink component that composes the entire Nimbus TUI. It manages the
 * top-level application state and wires child components together:
 *
 *   Header        (top)
 *   MessageList   (middle, flexGrow)
 *   ToolCallDisplay  (inline when a tool is active)
 *   PermissionPrompt (modal overlay when permission is needed)
 *   DeployPreview    (modal overlay when deploy confirmation is needed)
 *   InputBox      (above status bar)
 *   StatusBar     (bottom)
 *
 * Keyboard shortcuts (via useInput):
 *   Tab      - cycle through modes (plan -> build -> deploy -> plan)
 *   Ctrl+C   - interrupt current operation or exit
 *   Escape   - cancel current operation
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AgentMode, UIMessage, UIToolCall, SessionInfo, DeployPreviewData } from './types';
import { Header } from './Header';
import { MessageList } from './MessageList';
import { ToolCallDisplay } from './ToolCallDisplay';
import { InputBox } from './InputBox';
import { StatusBar } from './StatusBar';
import { PermissionPrompt, type PermissionDecision, type RiskLevel } from './PermissionPrompt';
import { DeployPreview, type DeployDecision } from './DeployPreview';

/* ---------------------------------------------------------------------------
 * Internal types
 * -------------------------------------------------------------------------*/

/** A pending permission request that needs user approval. */
interface PermissionRequest {
  tool: string;
  input: Record<string, unknown>;
  riskLevel: RiskLevel;
  onDecide: (decision: PermissionDecision) => void;
}

/** Callback invoked when the user submits a message. */
export type OnMessageCallback = (text: string) => void;

/** Callback invoked when the user presses Escape or Ctrl+C during processing. */
export type OnAbortCallback = () => void;

/** Result returned by the /compact command handler. */
export interface CompactCommandResult {
  originalTokens: number;
  compactedTokens: number;
  savedTokens: number;
}

/** Breakdown returned by the /context command handler. */
export interface ContextCommandResult {
  systemPrompt: number;
  nimbusInstructions: number;
  messages: number;
  toolDefinitions: number;
  total: number;
  budget: number;
  usagePercent: number;
}

/** Callback invoked when the user types /compact [focus]. */
export type OnCompactCallback = (focusArea?: string) => Promise<CompactCommandResult | null>;

/** Callback invoked when the user types /context. */
export type OnContextCallback = () => ContextCommandResult | null;

/** Result returned by the /undo or /redo command handlers. */
export interface UndoRedoResult {
  success: boolean;
  description: string;
}

/** Callback invoked when the user types /undo. */
export type OnUndoCallback = () => Promise<UndoRedoResult>;

/** Callback invoked when the user types /redo. */
export type OnRedoCallback = () => Promise<UndoRedoResult>;

/** A brief session summary for /sessions listing. */
export interface SessionSummary {
  id: string;
  name: string;
  model: string;
  mode: string;
  updatedAt: string;
}

/** Callback invoked when the user types /sessions. */
export type OnSessionsCallback = () => SessionSummary[];

/** Callback invoked when the user types /new [name]. */
export type OnNewSessionCallback = (name?: string) => SessionSummary | null;

/** Callback invoked when the user types /switch <id>. */
export type OnSwitchSessionCallback = (sessionId: string) => SessionSummary | null;

/** Callback invoked when the user types /models. Returns provider→model[] map. */
export type OnModelsCallback = () => Promise<Record<string, string[]>>;

/** Callback invoked when the user types /clear. Clears LLM conversation history. */
export type OnClearCallback = () => void;

/** Callback invoked when the user changes the model via /model. */
export type OnModelChangeCallback = (model: string) => void;

/** Callback invoked when the user changes the mode via /mode or Tab. */
export type OnModeChangeCallback = (mode: AgentMode) => void;

/* ---------------------------------------------------------------------------
 * Props
 * -------------------------------------------------------------------------*/

/** Props accepted by the App component. */
export interface AppProps {
  /** Initial session metadata. */
  initialSession?: Partial<SessionInfo>;
  /** External handler invoked when the user submits a message. */
  onMessage?: OnMessageCallback;
  /** External handler invoked when the user aborts. */
  onAbort?: OnAbortCallback;
  /** Handler for /compact command. Returns token savings or null on failure. */
  onCompact?: OnCompactCallback;
  /** Handler for /context command. Returns context breakdown or null. */
  onContext?: OnContextCallback;
  /** Handler for /undo command. Reverts the last file-modifying tool call. */
  onUndo?: OnUndoCallback;
  /** Handler for /redo command. Re-applies a previously undone change. */
  onRedo?: OnRedoCallback;
  /** Handler for /sessions command. Lists active sessions. */
  onSessions?: OnSessionsCallback;
  /** Handler for /new command. Creates a new session. */
  onNewSession?: OnNewSessionCallback;
  /** Handler for /switch command. Switches to a different session. */
  onSwitchSession?: OnSwitchSessionCallback;
  /** Handler for /models command. Lists all available provider models. */
  onModels?: OnModelsCallback;
  /** Handler for /clear command. Resets the LLM conversation history. */
  onClear?: OnClearCallback;
  /** Handler for /model command. Propagates model change to the agent loop. */
  onModelChange?: OnModelChangeCallback;
  /** Handler for mode changes (Tab or /mode). Propagates to the agent loop. */
  onModeChange?: OnModeChangeCallback;
  /** Called once after mount, passing imperative handles for driving TUI state. */
  onReady?: (api: AppImperativeAPI) => void;
  /** Messages to pre-populate the message list (e.g., from a resumed session). */
  initialMessages?: UIMessage[];
}

/* ---------------------------------------------------------------------------
 * Mode rotation helper
 * -------------------------------------------------------------------------*/

const MODES: AgentMode[] = ['plan', 'build', 'deploy'];

function nextMode(current: AgentMode): AgentMode {
  const idx = MODES.indexOf(current);
  return MODES[(idx + 1) % MODES.length];
}

/* ---------------------------------------------------------------------------
 * Default session factory
 * -------------------------------------------------------------------------*/

function createDefaultSession(overrides?: Partial<SessionInfo>): SessionInfo {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    model: overrides?.model ?? 'default',
    mode: overrides?.mode ?? 'plan',
    tokenCount: overrides?.tokenCount ?? 0,
    maxTokens: overrides?.maxTokens ?? 200_000,
    costUSD: overrides?.costUSD ?? 0,
    snapshotCount: overrides?.snapshotCount ?? 0,
  };
}

/* ---------------------------------------------------------------------------
 * App component
 * -------------------------------------------------------------------------*/

/**
 * App is the root Ink component. It maintains the full UI state and delegates
 * rendering to focused child components. External orchestration logic can
 * interact with the TUI by passing `onMessage` and `onAbort` callbacks, or
 * by manipulating state through the imperative handles exposed on this
 * component (see the exported hooks below).
 */
export function App({
  initialSession,
  onMessage,
  onAbort,
  onCompact,
  onContext,
  onUndo,
  onRedo,
  onSessions,
  onNewSession,
  onSwitchSession,
  onModels,
  onClear,
  onModelChange,
  onModeChange,
  onReady,
  initialMessages,
}: AppProps) {
  const { exit } = useApp();

  /* -- State ------------------------------------------------------------- */

  const [session, setSession] = useState(createDefaultSession(initialSession) as SessionInfo);

  const [messages, setMessages] = useState((initialMessages ?? []) as UIMessage[]);

  const [activeToolCalls, setActiveToolCalls] = useState([] as UIToolCall[]);

  const [permissionRequest, setPermissionRequest] = useState(null as PermissionRequest | null);

  const [deployPreview, setDeployPreview] = useState(null as DeployPreviewData | null);

  const [isProcessing, setIsProcessing] = useState(false as boolean);
  const [processingStartTime, setProcessingStartTime] = useState(null as number | null);

  /* -- Expose imperative API to external orchestrator -------------------- */

  const onReadyCalled = useRef(false);

  useEffect(() => {
    if (onReady && !onReadyCalled.current) {
      onReadyCalled.current = true;
      onReady({
        addMessage: (msg: UIMessage) => setMessages(prev => [...prev, msg]),
        updateMessage: (id: string, content: string) =>
          setMessages(prev => prev.map(m => (m.id === id ? { ...m, content } : m))),
        updateSession: (patch: Partial<SessionInfo>) => setSession(prev => ({ ...prev, ...patch })),
        setToolCalls: setActiveToolCalls,
        requestPermission: (req: PermissionRequest) => setPermissionRequest(req),
        showDeployPreview: (preview: DeployPreviewData) => setDeployPreview(preview),
        setProcessing: (v: boolean) => {
          setIsProcessing(v);
          setProcessingStartTime(v ? Date.now() : null);
        },
      });
    }
  }, [onReady]);

  /* -- Callbacks --------------------------------------------------------- */

  /** Handle user message submission from the InputBox. */
  const handleSubmit = useCallback(
    (text: string) => {
      const trimmed = text.trim();

      // -----------------------------------------------------------------
      // Slash command handling
      // -----------------------------------------------------------------

      // /compact [focus area] — manually trigger context compaction
      if (trimmed === '/compact' || trimmed.startsWith('/compact ')) {
        const focusArea =
          trimmed.length > '/compact'.length ? trimmed.slice('/compact '.length).trim() : undefined;

        const systemMsg: UIMessage = {
          id: crypto.randomUUID(),
          role: 'system',
          content: focusArea
            ? `Compacting context (focus: ${focusArea})...`
            : 'Compacting context...',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, systemMsg]);

        if (onCompact) {
          setIsProcessing(true);
          onCompact(focusArea)
            .then(result => {
              const resultMsg: UIMessage = {
                id: crypto.randomUUID(),
                role: 'system',
                content: result
                  ? `Context compacted! Saved ${result.savedTokens.toLocaleString()} tokens (${result.originalTokens.toLocaleString()} → ${result.compactedTokens.toLocaleString()}).`
                  : 'Compaction skipped — not enough context to compact.',
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, resultMsg]);
              setIsProcessing(false);
            })
            .catch(() => {
              const errMsg: UIMessage = {
                id: crypto.randomUUID(),
                role: 'system',
                content: 'Compaction failed. The conversation continues unchanged.',
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, errMsg]);
              setIsProcessing(false);
            });
        } else {
          const noHandler: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: 'Compaction is not available in this session.',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, noHandler]);
        }
        return;
      }

      // /undo — revert the last file-modifying tool call
      if (trimmed === '/undo') {
        if (onUndo) {
          const pendingMsg: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: 'Reverting last change...',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, pendingMsg]);
          setIsProcessing(true);
          onUndo()
            .then(result => {
              const msg: UIMessage = {
                id: crypto.randomUUID(),
                role: 'system',
                content: result.success
                  ? `Undo successful: ${result.description}`
                  : `Undo failed: ${result.description}`,
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, msg]);
              setIsProcessing(false);
            })
            .catch(() => {
              const msg: UIMessage = {
                id: crypto.randomUUID(),
                role: 'system',
                content: 'Undo failed unexpectedly.',
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, msg]);
              setIsProcessing(false);
            });
        } else {
          const msg: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: 'Undo is not available in this session.',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, msg]);
        }
        return;
      }

      // /redo — re-apply a previously undone change
      if (trimmed === '/redo') {
        if (onRedo) {
          const pendingMsg: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: 'Re-applying change...',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, pendingMsg]);
          setIsProcessing(true);
          onRedo()
            .then(result => {
              const msg: UIMessage = {
                id: crypto.randomUUID(),
                role: 'system',
                content: result.success
                  ? `Redo successful: ${result.description}`
                  : `Redo failed: ${result.description}`,
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, msg]);
              setIsProcessing(false);
            })
            .catch(() => {
              const msg: UIMessage = {
                id: crypto.randomUUID(),
                role: 'system',
                content: 'Redo failed unexpectedly.',
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, msg]);
              setIsProcessing(false);
            });
        } else {
          const msg: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: 'Redo is not available in this session.',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, msg]);
        }
        return;
      }

      // /help — show available slash commands
      if (trimmed === '/help') {
        const helpContent = [
          'Available commands:',
          '  /help              — Show this help message',
          '  /clear             — Clear conversation history',
          '  /compact [focus]   — Compress context to free tokens',
          '  /context           — Show context window usage',
          '  /model [name]      — Show or switch the active model',
          '  /models            — List all available provider models',
          '  /undo              — Revert the last file change',
          '  /redo              — Re-apply a reverted change',
          '  /sessions          — List active sessions',
          '  /new [name]        — Create a new session',
          '  /switch <id>       — Switch to a different session',
          '',
          'Keyboard shortcuts:',
          '  Tab                — Cycle mode (plan → build → deploy)',
          '  Ctrl+R             — Search input history',
          '  Ctrl+C             — Interrupt or exit',
          '  Escape             — Cancel current operation',
          '',
          'Prefix a path with @ to include file contents (e.g. @src/main.ts)',
        ].join('\n');

        const msg: UIMessage = {
          id: crypto.randomUUID(),
          role: 'system',
          content: helpContent,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, msg]);
        return;
      }

      // /clear — clear conversation history (both UI and LLM context)
      if (trimmed === '/clear') {
        setMessages([]);
        if (onClear) {
          onClear();
        }
        const msg: UIMessage = {
          id: crypto.randomUUID(),
          role: 'system',
          content: 'Conversation cleared.',
          timestamp: new Date(),
        };
        setMessages([msg]);
        return;
      }

      // /model [name] — show or switch the active model
      if (trimmed === '/model' || trimmed.startsWith('/model ')) {
        const newModel =
          trimmed.length > '/model'.length ? trimmed.slice('/model '.length).trim() : undefined;

        if (newModel) {
          setSession(prev => ({ ...prev, model: newModel }));
          // Propagate the model change to the agent loop
          if (onModelChange) {
            onModelChange(newModel);
          }
          const msg: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: `Model switched to: ${newModel}`,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, msg]);
        } else {
          const msg: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: `Current model: ${session.model}\n\nUsage: /model <name>  (e.g. /model sonnet, /model gpt4o, /model gemini)`,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, msg]);
        }
        return;
      }

      // /mode [plan|build|deploy] — show or switch agent mode
      if (trimmed === '/mode' || trimmed.startsWith('/mode ')) {
        const newMode =
          trimmed.length > '/mode'.length
            ? trimmed.slice('/mode '.length).trim().toLowerCase()
            : undefined;

        if (newMode) {
          const validModes: AgentMode[] = ['plan', 'build', 'deploy'];
          if (validModes.includes(newMode as AgentMode)) {
            setSession(prev => ({ ...prev, mode: newMode as AgentMode }));
            if (onModeChange) {
              onModeChange(newMode as AgentMode);
            }
            const msg: UIMessage = {
              id: crypto.randomUUID(),
              role: 'system',
              content: `Mode switched to: ${newMode}`,
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, msg]);
          } else {
            const msg: UIMessage = {
              id: crypto.randomUUID(),
              role: 'system',
              content: `Invalid mode: "${newMode}". Valid modes: plan, build, deploy`,
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, msg]);
          }
        } else {
          const msg: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: `Current mode: ${session.mode}\n\nUsage: /mode <plan|build|deploy>`,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, msg]);
        }
        return;
      }

      // /sessions — list active sessions
      if (trimmed === '/sessions') {
        if (onSessions) {
          const sessions = onSessions();
          const content =
            sessions.length > 0
              ? [
                  'Active sessions:',
                  ...sessions.map(
                    s =>
                      `  ${s.id === session.id ? '* ' : '  '}${s.id.slice(0, 8)}  ${s.name}  (${s.model}, ${s.mode})  ${s.updatedAt}`
                  ),
                ].join('\n')
              : 'No sessions found.';
          const msg: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, msg]);
        } else {
          const msg: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: 'Session management is not available.',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, msg]);
        }
        return;
      }

      // /new [name] — create a new session
      if (trimmed === '/new' || trimmed.startsWith('/new ')) {
        const name =
          trimmed.length > '/new'.length ? trimmed.slice('/new '.length).trim() : undefined;
        if (onNewSession) {
          const newSession = onNewSession(name);
          if (newSession) {
            setMessages([]);
            setSession(prev => ({
              ...prev,
              id: newSession.id,
              model: newSession.model,
              mode: newSession.mode as AgentMode,
            }));
            const msg: UIMessage = {
              id: crypto.randomUUID(),
              role: 'system',
              content: `New session created: ${newSession.name}`,
              timestamp: new Date(),
            };
            setMessages([msg]);
          } else {
            const msg: UIMessage = {
              id: crypto.randomUUID(),
              role: 'system',
              content: 'Failed to create new session.',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, msg]);
          }
        } else {
          const msg: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: 'Session management is not available.',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, msg]);
        }
        return;
      }

      // /switch <id> — switch to a different session
      if (trimmed.startsWith('/switch ')) {
        const targetId = trimmed.slice('/switch '.length).trim();
        if (onSwitchSession) {
          const switched = onSwitchSession(targetId);
          if (switched) {
            setMessages([]);
            setSession(prev => ({
              ...prev,
              id: switched.id,
              model: switched.model,
              mode: switched.mode as AgentMode,
            }));
            const msg: UIMessage = {
              id: crypto.randomUUID(),
              role: 'system',
              content: `Switched to session: ${switched.name}`,
              timestamp: new Date(),
            };
            setMessages([msg]);
          } else {
            const msg: UIMessage = {
              id: crypto.randomUUID(),
              role: 'system',
              content: `Session not found: ${targetId}`,
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, msg]);
          }
        } else {
          const msg: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: 'Session management is not available.',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, msg]);
        }
        return;
      }

      // /models — list available models from all providers
      if (trimmed === '/models') {
        if (onModels) {
          setIsProcessing(true);
          setProcessingStartTime(Date.now());
          onModels()
            .then(modelsMap => {
              const lines: string[] = ['Available models:'];
              for (const [provider, modelList] of Object.entries(modelsMap)) {
                lines.push(`\n  ${provider}:`);
                for (const model of modelList) {
                  lines.push(`    - ${model}`);
                }
              }
              if (lines.length === 1) {
                lines.push('  (no providers configured)');
              }
              const msg: UIMessage = {
                id: crypto.randomUUID(),
                role: 'system',
                content: lines.join('\n'),
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, msg]);
              setIsProcessing(false);
              setProcessingStartTime(null);
            })
            .catch(() => {
              const msg: UIMessage = {
                id: crypto.randomUUID(),
                role: 'system',
                content: 'Failed to list models.',
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, msg]);
              setIsProcessing(false);
              setProcessingStartTime(null);
            });
        } else {
          const msg: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: 'Model listing is not available in this session.',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, msg]);
        }
        return;
      }

      // /context — show context window usage breakdown
      if (trimmed === '/context') {
        if (onContext) {
          const breakdown = onContext();
          const content = breakdown
            ? [
                'Context Usage Breakdown:',
                `  System prompt:     ${breakdown.systemPrompt.toLocaleString()} tokens`,
                `  NIMBUS.md:         ${breakdown.nimbusInstructions.toLocaleString()} tokens`,
                `  Messages:          ${breakdown.messages.toLocaleString()} tokens`,
                `  Tool definitions:  ${breakdown.toolDefinitions.toLocaleString()} tokens`,
                `  ─────────────────────────────`,
                `  Total:             ${breakdown.total.toLocaleString()} / ${breakdown.budget.toLocaleString()} tokens (${breakdown.usagePercent}%)`,
              ].join('\n')
            : 'Context information is not available.';

          const msg: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, msg]);
        } else {
          const msg: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: 'Context tracking is not available in this session.',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, msg]);
        }
        return;
      }

      // -----------------------------------------------------------------
      // Normal message — expand @file references, then send to agent
      // -----------------------------------------------------------------

      // Expand @path/to/file references: replace with file contents inline
      let expandedText = trimmed;
      const fileRefs = trimmed.match(/@"([^"]+)"|@([\w./_~-]+)/g);
      if (fileRefs) {
        for (const ref of fileRefs) {
          // Handle both @"path with spaces" and @simple/path
          const filePath = ref.startsWith('@"') ? ref.slice(2, -1) : ref.slice(1);
          try {
            const resolved = resolve(process.cwd(), filePath);
            const content = readFileSync(resolved, 'utf-8');
            const truncated =
              content.length > 10000
                ? `${content.slice(0, 10000)}\n... (truncated — showing 10,000 of ${content.length.toLocaleString()} chars)`
                : content;
            expandedText = expandedText.replace(
              ref,
              `\n<file path="${filePath}">\n${truncated}\n</file>`
            );
          } catch {
            // File not found — leave the @reference as-is
          }
        }
      }

      // Append user message to the conversation
      const userMsg: UIMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed, // Show original text in the UI
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMsg]);
      setIsProcessing(true);
      setProcessingStartTime(Date.now());

      if (onMessage) {
        onMessage(expandedText); // Send expanded text to the agent
      }
    },
    [
      onMessage,
      onCompact,
      onContext,
      onUndo,
      onRedo,
      onSessions,
      onNewSession,
      onSwitchSession,
      onModels,
      onClear,
      onModelChange,
      onModeChange,
      session.id,
      session.model,
      session.mode,
    ]
  );

  /** Handle abort from InputBox (Escape key). */
  const handleAbort = useCallback(() => {
    setIsProcessing(false);
    setProcessingStartTime(null);
    if (onAbort) {
      onAbort();
    }
  }, [onAbort]);

  /** Handle permission prompt decisions. */
  const handlePermission = useCallback(
    (decision: PermissionDecision) => {
      if (permissionRequest) {
        permissionRequest.onDecide(decision);
      }
      setPermissionRequest(null);
    },
    [permissionRequest]
  );

  /** Handle deploy preview decisions. */
  const handleDeployDecision = useCallback((_decision: DeployDecision) => {
    // The parent orchestrator handles the actual decision; we just
    // close the overlay here.
    setDeployPreview(null);
  }, []);

  /* -- Global keyboard shortcuts ----------------------------------------- */

  useInput(
    (input, key) => {
      // Tab: cycle modes (only when not in a modal and not typing a slash command)
      // When input starts with '/', Tab is handled by InputBox for autocomplete
      if (key.tab && !permissionRequest && !deployPreview) {
        setSession(prev => {
          const newMode = nextMode(prev.mode);
          // Propagate mode change to the agent loop so it actually takes effect
          if (onModeChange) {
            onModeChange(newMode);
          }
          return { ...prev, mode: newMode };
        });
        return;
      }

      // Ctrl+C: interrupt or exit
      if (input === 'c' && key.ctrl) {
        if (isProcessing) {
          handleAbort();
        } else {
          exit();
        }
        return;
      }

      // Escape: cancel current operation
      if (key.escape) {
        if (permissionRequest) {
          handlePermission('reject');
        } else if (deployPreview) {
          handleDeployDecision('reject');
        } else if (isProcessing) {
          handleAbort();
        }
      }
    },
    // Disable the global handler when the permission or deploy prompt is
    // active so their own useInput handlers take priority.
    { isActive: !permissionRequest && !deployPreview }
  );

  /* -- Derived state ----------------------------------------------------- */

  // Collect tool calls from the last assistant message (if any) plus any
  // currently active tool calls being streamed in.
  const visibleToolCalls: UIToolCall[] = (() => {
    if (activeToolCalls.length > 0) {
      return activeToolCalls;
    }
    // Fall back to the tool calls from the most recent assistant message
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        return msg.toolCalls;
      }
    }
    return [];
  })();

  /* -- Render ------------------------------------------------------------ */

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Top: Header */}
      <Header session={session} />

      {/* Middle: scrollable message list (grows to fill space) */}
      <Box flexDirection="column" flexGrow={1}>
        <MessageList messages={messages} mode={session.mode} />
      </Box>

      {/* Inline tool call display (when tools are active) */}
      {visibleToolCalls.length > 0 && (
        <ToolCallDisplay toolCalls={visibleToolCalls} expanded={isProcessing} />
      )}

      {/* Modal: Permission prompt */}
      {permissionRequest && (
        <PermissionPrompt
          toolName={permissionRequest.tool}
          toolInput={permissionRequest.input}
          riskLevel={permissionRequest.riskLevel}
          onDecide={handlePermission}
        />
      )}

      {/* Modal: Deploy preview */}
      {deployPreview && <DeployPreview preview={deployPreview} onDecide={handleDeployDecision} />}

      {/* Input area */}
      <InputBox
        onSubmit={handleSubmit}
        onAbort={handleAbort}
        disabled={isProcessing || !!permissionRequest || !!deployPreview}
        placeholder={isProcessing ? 'Agent is thinking...' : undefined}
      />

      {/* Bottom: Status bar */}
      <StatusBar
        session={session}
        isProcessing={isProcessing}
        processingStartTime={processingStartTime}
      />
    </Box>
  );
}

/* ---------------------------------------------------------------------------
 * Imperative API types (for external orchestrators)
 * -------------------------------------------------------------------------*/

/**
 * Functions that an external orchestrator can use to drive the TUI state.
 * These map directly to the React state setters inside App. The parent
 * component can pass these via a ref or context if needed.
 */
export interface AppImperativeAPI {
  addMessage: (msg: UIMessage) => void;
  updateMessage: (id: string, content: string) => void;
  updateSession: (patch: Partial<SessionInfo>) => void;
  setToolCalls: (calls: UIToolCall[]) => void;
  requestPermission: (req: PermissionRequest) => void;
  showDeployPreview: (preview: DeployPreviewData) => void;
  setProcessing: (value: boolean) => void;
}

/* ---------------------------------------------------------------------------
 * Error Boundary
 * -------------------------------------------------------------------------*/

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches uncaught React render errors and displays a recovery message
 * instead of crashing the entire TUI.
 */
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || 'Unknown error';
      return (
        <Box flexDirection="column" padding={1}>
          <Text color="red" bold>
            Nimbus TUI encountered an error:
          </Text>
          <Text color="red">{msg}</Text>
          <Text dimColor>
            {'\n'}The interactive UI has crashed. You can:
            {'\n'} 1. Restart nimbus
            {'\n'} 2. Use readline mode: nimbus chat --ui=readline
          </Text>
        </Box>
      );
    }

    return this.props.children;
  }
}
