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
import { Box, useInput, useApp } from 'ink';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  AgentMode,
  UIMessage,
  UIToolCall,
  SessionInfo,
  DeployPreviewData,
} from './types';
import type { PermissionDecision, RiskLevel } from './PermissionPrompt';
import type { DeployDecision } from './DeployPreview';
import { Header } from './Header';
import { MessageList } from './MessageList';
import { ToolCallDisplay } from './ToolCallDisplay';
import { InputBox } from './InputBox';
import { StatusBar } from './StatusBar';
import { PermissionPrompt } from './PermissionPrompt';
import { DeployPreview } from './DeployPreview';

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
  /** Called once after mount, passing imperative handles for driving TUI state. */
  onReady?: (api: AppImperativeAPI) => void;
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
export function App({ initialSession, onMessage, onAbort, onCompact, onContext, onUndo, onRedo, onReady }: AppProps) {
  const { exit } = useApp();

  /* -- State ------------------------------------------------------------- */

  const [session, setSession] = useState(
    createDefaultSession(initialSession) as SessionInfo,
  );

  const [messages, setMessages] = useState([] as UIMessage[]);

  const [activeToolCalls, setActiveToolCalls] = useState([] as UIToolCall[]);

  const [permissionRequest, setPermissionRequest] = useState(
    null as PermissionRequest | null,
  );

  const [deployPreview, setDeployPreview] = useState(
    null as DeployPreviewData | null,
  );

  const [isProcessing, setIsProcessing] = useState(false as boolean);

  /* -- Expose imperative API to external orchestrator -------------------- */

  const onReadyCalled = useRef(false);

  useEffect(() => {
    if (onReady && !onReadyCalled.current) {
      onReadyCalled.current = true;
      onReady({
        addMessage: (msg: UIMessage) => setMessages((prev) => [...prev, msg]),
        updateMessage: (id: string, content: string) =>
          setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, content } : m)),
          ),
        updateSession: (patch: Partial<SessionInfo>) =>
          setSession((prev) => ({ ...prev, ...patch })),
        setToolCalls: setActiveToolCalls,
        requestPermission: (req: PermissionRequest) => setPermissionRequest(req),
        showDeployPreview: (preview: DeployPreviewData) => setDeployPreview(preview),
        setProcessing: setIsProcessing,
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
        const focusArea = trimmed.length > '/compact'.length
          ? trimmed.slice('/compact '.length).trim()
          : undefined;

        const systemMsg: UIMessage = {
          id: crypto.randomUUID(),
          role: 'system',
          content: focusArea
            ? `Compacting context (focus: ${focusArea})...`
            : 'Compacting context...',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, systemMsg]);

        if (onCompact) {
          setIsProcessing(true);
          onCompact(focusArea).then((result) => {
            const resultMsg: UIMessage = {
              id: crypto.randomUUID(),
              role: 'system',
              content: result
                ? `Context compacted! Saved ${result.savedTokens.toLocaleString()} tokens (${result.originalTokens.toLocaleString()} → ${result.compactedTokens.toLocaleString()}).`
                : 'Compaction skipped — not enough context to compact.',
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, resultMsg]);
            setIsProcessing(false);
          }).catch(() => {
            const errMsg: UIMessage = {
              id: crypto.randomUUID(),
              role: 'system',
              content: 'Compaction failed. The conversation continues unchanged.',
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, errMsg]);
            setIsProcessing(false);
          });
        } else {
          const noHandler: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: 'Compaction is not available in this session.',
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, noHandler]);
        }
        return;
      }

      // /undo — revert the last file-modifying tool call
      if (trimmed === '/undo') {
        if (onUndo) {
          setIsProcessing(true);
          onUndo().then((result) => {
            const msg: UIMessage = {
              id: crypto.randomUUID(),
              role: 'system',
              content: result.success
                ? `Undo successful: ${result.description}`
                : `Undo failed: ${result.description}`,
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, msg]);
            setIsProcessing(false);
          }).catch(() => {
            const msg: UIMessage = {
              id: crypto.randomUUID(),
              role: 'system',
              content: 'Undo failed unexpectedly.',
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, msg]);
            setIsProcessing(false);
          });
        } else {
          const msg: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: 'Undo is not available in this session.',
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, msg]);
        }
        return;
      }

      // /redo — re-apply a previously undone change
      if (trimmed === '/redo') {
        if (onRedo) {
          setIsProcessing(true);
          onRedo().then((result) => {
            const msg: UIMessage = {
              id: crypto.randomUUID(),
              role: 'system',
              content: result.success
                ? `Redo successful: ${result.description}`
                : `Redo failed: ${result.description}`,
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, msg]);
            setIsProcessing(false);
          }).catch(() => {
            const msg: UIMessage = {
              id: crypto.randomUUID(),
              role: 'system',
              content: 'Redo failed unexpectedly.',
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, msg]);
            setIsProcessing(false);
          });
        } else {
          const msg: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: 'Redo is not available in this session.',
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, msg]);
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
          setMessages((prev) => [...prev, msg]);
        } else {
          const msg: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: 'Context tracking is not available in this session.',
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, msg]);
        }
        return;
      }

      // -----------------------------------------------------------------
      // Normal message — expand @file references, then send to agent
      // -----------------------------------------------------------------

      // Expand @path/to/file references: replace with file contents inline
      let expandedText = trimmed;
      const fileRefs = trimmed.match(/@([\w./_-]+)/g);
      if (fileRefs) {
        for (const ref of fileRefs) {
          const filePath = ref.slice(1); // remove leading @
          try {
            const resolved = resolve(process.cwd(), filePath);
            const content = readFileSync(resolved, 'utf-8');
            const truncated = content.length > 10000
              ? content.slice(0, 10000) + '\n... (truncated)'
              : content;
            expandedText = expandedText.replace(
              ref,
              `\n<file path="${filePath}">\n${truncated}\n</file>`,
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
      setMessages((prev) => [...prev, userMsg]);
      setIsProcessing(true);

      if (onMessage) {
        onMessage(expandedText); // Send expanded text to the agent
      }
    },
    [onMessage, onCompact, onContext, onUndo, onRedo],
  );

  /** Handle abort from InputBox (Escape key). */
  const handleAbort = useCallback(() => {
    setIsProcessing(false);
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
    [permissionRequest],
  );

  /** Handle deploy preview decisions. */
  const handleDeployDecision = useCallback(
    (_decision: DeployDecision) => {
      // The parent orchestrator handles the actual decision; we just
      // close the overlay here.
      setDeployPreview(null);
    },
    [],
  );

  /* -- Global keyboard shortcuts ----------------------------------------- */

  useInput(
    (input, key) => {
      // Tab: cycle modes (only when not in a modal)
      if (key.tab && !permissionRequest && !deployPreview) {
        setSession((prev) => ({ ...prev, mode: nextMode(prev.mode) }));
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
    { isActive: !permissionRequest && !deployPreview },
  );

  /* -- Derived state ----------------------------------------------------- */

  // Collect tool calls from the last assistant message (if any) plus any
  // currently active tool calls being streamed in.
  const visibleToolCalls: UIToolCall[] = (() => {
    if (activeToolCalls.length > 0) return activeToolCalls;
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
      {deployPreview && (
        <DeployPreview preview={deployPreview} onDecide={handleDeployDecision} />
      )}

      {/* Input area */}
      <InputBox
        onSubmit={handleSubmit}
        onAbort={handleAbort}
        disabled={isProcessing || !!permissionRequest || !!deployPreview}
        placeholder={isProcessing ? 'Agent is thinking...' : undefined}
      />

      {/* Bottom: Status bar */}
      <StatusBar session={session} />
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
