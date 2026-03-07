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

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import Spinner from 'ink-spinner';
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
import { FileDiffModal, type FileDiffDecision, type FileDiffRequest } from './FileDiffModal';
import { HelpModal } from './HelpModal';
import { TerminalPane } from './TerminalPane';
import { TreePane } from './TreePane';

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
  /** Token count for this session (L9). */
  tokenCount?: number;
  /** Cost in USD for this session (L9). */
  costUSD?: number;
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

/** Callback invoked when the user types /diff. Returns git diff output. */
export type OnDiffCallback = () => Promise<string>;

/** Callback invoked when the user types /cost. Returns per-turn cost table. */
export type OnCostCallback = () => string;

/** Callback invoked when the user types /init inside the TUI. */
export type OnInitCallback = () => Promise<string>;

/** Callback invoked when the user types /export [filename]. Returns the output file path. G16 */
export type OnExportCallback = (filename?: string) => Promise<string>;

/** Callback invoked when the user types /remember <fact>. G17 */
export type OnRememberCallback = (fact: string) => Promise<void>;

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
  /** Handler for /diff command. Returns git diff output or "No unstaged changes." */
  onDiff?: OnDiffCallback;
  /** Handler for /cost command. Returns per-turn cost breakdown string. */
  onCost?: OnCostCallback;
  /** Handler for /init command. Regenerates NIMBUS.md from inside the TUI. */
  onInit?: OnInitCallback;
  /** Handler for /export [filename] command. Serializes conversation to runbook. G16 */
  onExport?: OnExportCallback;
  /** Handler for /remember <fact> command. Appends fact to NIMBUS.md Agent Memory. G17 */
  onRemember?: OnRememberCallback;
  /** Called once after mount, passing imperative handles for driving TUI state. */
  onReady?: (api: AppImperativeAPI) => void;
  /** Messages to pre-populate the message list (e.g., from a resumed session). */
  initialMessages?: UIMessage[];
  /** Initial mode loaded from per-project mode store (H3). */
  initialMode?: AgentMode;
  /** Whether an API key is already configured (C3). */
  hasApiKey?: boolean;
  /** H3: Fetch dynamic completions for slash command arguments. */
  onFetchCompletions?: (prefix: string) => Promise<string[]>;
  /** C1: Terminal column width for dynamic separator/layout sizing. */
  columns?: number;
  /**
   * C1: Called when the user presses Ctrl+C while a tool is actively running.
   * Cancels just the current tool without aborting the whole session.
   * When not provided, Ctrl+C during processing aborts the full session as before.
   */
  onCancelCurrentTool?: () => void;
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
 * Production environment detection helper (G7)
 * -------------------------------------------------------------------------*/

/**
 * Returns true when the session's terraform workspace or kubectl context
 * matches a production naming convention (prod, production, live).
 */
function isProdEnvironment(session: SessionInfo): boolean {
  const prodPattern = /prod|production|live/i;
  if (session.terraformWorkspace && prodPattern.test(session.terraformWorkspace)) {
    return true;
  }
  if (session.kubectlContext && prodPattern.test(session.kubectlContext)) {
    return true;
  }
  return false;
}

/* ---------------------------------------------------------------------------
 * Default session factory
 * -------------------------------------------------------------------------*/

function createDefaultSession(overrides?: Partial<SessionInfo>): SessionInfo {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    model: overrides?.model ?? 'default',
    mode: overrides?.mode ?? 'build',
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
  onDiff,
  onCost,
  onInit,
  onExport,
  onRemember,
  onReady,
  initialMessages,
  initialMode,
  hasApiKey = true,
  onFetchCompletions,
  columns = 80,
  onCancelCurrentTool,
}: AppProps) {
  const { exit } = useApp();

  /* -- State ------------------------------------------------------------- */

  const [session, setSession] = useState(createDefaultSession({ ...initialSession, mode: initialMode ?? initialSession?.mode ?? 'build' }) as SessionInfo);

  const [messages, setMessages] = useState((initialMessages ?? []) as UIMessage[]);

  const [activeToolCalls, setActiveToolCalls] = useState([] as UIToolCall[]);

  const [permissionRequest, setPermissionRequest] = useState(null as PermissionRequest | null);

  const [deployPreview, setDeployPreview] = useState(
    null as (DeployPreviewData & { onDecide?: (d: DeployDecision) => void }) | null
  );

  const [fileDiffRequest, setFileDiffRequest] = useState(null as FileDiffRequest | null);

  const [showHelp, setShowHelp] = useState(false as boolean);
  const [showTerminalPane, setShowTerminalPane] = useState(false as boolean);
  /** M3: Auto-show terminal pane when long-running DevOps tools start. */
  const [terminalPaneAuto, setTerminalPaneAuto] = useState(false as boolean);
  const [showTreePane, setShowTreePane] = useState(false as boolean);

  const [isProcessing, setIsProcessing] = useState(false as boolean);
  const [abortPending, setAbortPending] = useState(false as boolean);
  const [processingStartTime, setProcessingStartTime] = useState(null as number | null);
  const [inputLineCount, setInputLineCount] = useState(1);
  /** GAP-7: pending context selection — holds available contexts while user picks */
  const [pendingContextSelect, setPendingContextSelect] = useState(null as string[] | null);
  /** GAP-8: pending workspace selection — holds available workspaces while user picks */
  const [pendingWorkspaceSelect, setPendingWorkspaceSelect] = useState(null as string[] | null);
  // Tracks whether the current agent turn has produced any visible output (text or tool calls).
  // Reset to false when a new turn starts, set to true on first content/tool.
  const [currentTurnHasOutput, setCurrentTurnHasOutput] = useState(false as boolean);
  // Rolling buffer of all completed tool calls for TerminalPane (M1)
  const [completedToolCalls, setCompletedToolCalls] = useState([] as UIToolCall[]);
  /** GAP-21: Pre-fill text for InputBox (injected by TreePane file selection). */
  const [inputPrefill, setInputPrefill] = useState(undefined as string | undefined);

  /** C3: Show API key setup banner when no API key is configured. */
  const [showApiKeySetup, setShowApiKeySetup] = useState(!hasApiKey);

  /** C1: Number of messages scrolled back from the bottom (0 = pinned to bottom). */
  const [scrollOffset, setScrollOffset] = useState(0);
  /** C1: When true, new messages auto-scroll to the bottom. */
  const [scrollLocked, setScrollLocked] = useState(true);
  /** C1: Ref to scrollLocked for use inside imperative callbacks (closures). */
  const scrollLockedRef = useRef(true);

  /** H1: Toast message shown after copying a code block to clipboard. */
  const [copyToast, setCopyToast] = useState('');

  /** H5: Toast shown briefly after Tab mode cycle. */
  const [modeToast, setModeToast] = useState<string | null>(null);

  /** H3: When true, show deploy mode confirmation box before switching. */
  const [pendingDeployConfirm, setPendingDeployConfirm] = useState(false as boolean);

  /** M1: Current search query for conversation filtering. */
  const [searchQuery, setSearchQuery] = useState('');
  /** M1: Whether search mode is active. */
  const [searchMode, setSearchMode] = useState(false);
  /** M5: Watch mode active — shows watched pattern in StatusBar. */
  const [watchPattern, setWatchPattern] = useState<string | null>(null);
  const watchAbortRef = useRef<AbortController | null>(null);

  /* -- Expose imperative API to external orchestrator -------------------- */

  const onReadyCalled = useRef(false);

  useEffect(() => {
    if (onReady && !onReadyCalled.current) {
      onReadyCalled.current = true;
      onReady({
        addMessage: (msg: UIMessage) => {
          setMessages(prev => [...prev, msg]);
          // C1: Keep pinned to bottom when scroll is locked
          if (scrollLockedRef.current) setScrollOffset(0);
        },
        updateMessage: (id: string, content: string) => {
          if (content) setCurrentTurnHasOutput(true);
          setMessages(prev => prev.map(m => (m.id === id ? { ...m, content } : m)));
        },
        updateSession: (patch: Partial<SessionInfo>) => setSession(prev => ({ ...prev, ...patch })),
        setToolCalls: (toolCalls: UIToolCall[]) => {
          if (toolCalls.length > 0) setCurrentTurnHasOutput(true);
          setActiveToolCalls(toolCalls);
          // M3: Auto-show terminal pane when long-running DevOps tools start
          const LONG_RUNNING_TOOL_PATTERNS = [
            'terraform', 'helm', 'kubectl', 'docker', 'cicd', 'gitops', 'drift_detect', 'cfn',
          ];
          const hasRunning = toolCalls.some(tc => tc.status === 'running');
          const hasLongRunning = toolCalls.some(
            tc =>
              tc.status === 'running' &&
              LONG_RUNNING_TOOL_PATTERNS.some(n => tc.name.toLowerCase().includes(n))
          );
          if (hasLongRunning) {
            setTerminalPaneAuto(true);
          } else if (
            !hasRunning &&
            toolCalls.length > 0 &&
            toolCalls.every(tc => tc.status === 'completed' || tc.status === 'failed')
          ) {
            // All tools done — auto-hide after 2 seconds
            setTimeout(() => setTerminalPaneAuto(false), 2000);
          }
          // Accumulate completed/failed tool calls for TerminalPane (M1)
          const done = toolCalls.filter(tc => tc.status === 'completed' || tc.status === 'failed');
          if (done.length > 0) {
            setCompletedToolCalls(prev => [...prev, ...done].slice(-100));
          }
        },
        requestPermission: (req: PermissionRequest) => setPermissionRequest(req),
        showDeployPreview: (preview: DeployPreviewData) => setDeployPreview(preview),
        requestDeployPreview: (preview: DeployPreviewData, onDecide: (d: DeployDecision) => void) =>
          setDeployPreview({ ...preview, onDecide }),
        requestFileDiff: (
          path: string,
          toolName: string,
          diff: string,
          onDecide: (d: FileDiffDecision) => void,
          currentIndex?: number
        ) => setFileDiffRequest({ filePath: path, toolName, diff, onDecide, currentIndex }),
        setProcessing: (v: boolean) => {
          setIsProcessing(v);
          setProcessingStartTime(v ? Date.now() : null);
        },
        setLLMHealth: (health: 'checking' | 'ok' | 'error') => {
          setSession(prev => ({ ...prev, llmHealth: health }));
        },
      });
    }
  }, [onReady]);

  /* -- C3: Auto-dismiss API key setup banner after 8 seconds ------------ */

  useEffect(() => {
    if (showApiKeySetup) {
      const timer = setTimeout(() => setShowApiKeySetup(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [showApiKeySetup]);

  /* -- C1: Keep scrollLockedRef in sync with scrollLocked state ---------- */

  useEffect(() => {
    scrollLockedRef.current = scrollLocked;
  }, [scrollLocked]);

  /* -- Callbacks --------------------------------------------------------- */

  /** Handle user message submission from the InputBox. */
  const handleSubmit = useCallback(
    (text: string) => {
      // C3: Dismiss the API key setup banner on first message submission
      setShowApiKeySetup(false);

      const trimmed = text.trim();

      // -----------------------------------------------------------------
      // GAP-7/GAP-8: Handle pending picker selections (kubectl context / tf workspace)
      // -----------------------------------------------------------------

      if (pendingContextSelect) {
        setPendingContextSelect(null);
        const idx = parseInt(trimmed, 10);
        const chosen = (!isNaN(idx) && idx >= 1 && idx <= pendingContextSelect.length)
          ? pendingContextSelect[idx - 1]
          : pendingContextSelect.find(c => c === trimmed);
        if (chosen) {
          try {
            const { execSync } = require('node:child_process') as typeof import('node:child_process');
            execSync(`kubectl config use-context ${chosen}`, { encoding: 'utf-8', timeout: 5000 });
            setSession(prev => ({ ...prev, kubectlContext: chosen }));
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: `[OK] Switched kubectl context to: ${chosen}`, timestamp: new Date() }]);
          } catch (e) {
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: `Failed: ${e instanceof Error ? e.message : String(e)}`, timestamp: new Date() }]);
          }
        } else {
          setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: `Context not found: "${trimmed}". Type /k8s-ctx to try again.`, timestamp: new Date() }]);
        }
        return;
      }

      if (pendingWorkspaceSelect) {
        setPendingWorkspaceSelect(null);
        const idx = parseInt(trimmed, 10);
        const chosen = (!isNaN(idx) && idx >= 1 && idx <= pendingWorkspaceSelect.length)
          ? pendingWorkspaceSelect[idx - 1]
          : pendingWorkspaceSelect.find(w => w === trimmed);
        if (chosen) {
          try {
            const { execSync } = require('node:child_process') as typeof import('node:child_process');
            execSync(`terraform workspace select ${chosen}`, { encoding: 'utf-8', timeout: 10000, cwd: process.cwd() });
            setSession(prev => ({ ...prev, terraformWorkspace: chosen }));
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: `[OK] Switched Terraform workspace to: ${chosen}`, timestamp: new Date() }]);
          } catch (e) {
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: `Failed: ${e instanceof Error ? e.message : String(e)}`, timestamp: new Date() }]);
          }
        } else {
          setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: `Workspace not found: "${trimmed}". Type /tf-ws to try again.`, timestamp: new Date() }]);
        }
        return;
      }

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

      // /branch [name] — save conversation checkpoint (M3)
      if (trimmed === '/branch' || trimmed.startsWith('/branch ')) {
        const branchName = trimmed.length > '/branch'.length
          ? trimmed.slice('/branch '.length).trim()
          : `branch-${Date.now()}`;
        void (async () => {
          try {
            const { join } = require('node:path') as typeof import('node:path');
            const { homedir } = require('node:os') as typeof import('node:os');
            const { mkdirSync, writeFileSync } = require('node:fs') as typeof import('node:fs');
            const branchDir = join(homedir(), '.nimbus', 'branches');
            mkdirSync(branchDir, { recursive: true });
            const branchPath = join(branchDir, `${branchName}.json`);
            const snapshot = {
              name: branchName,
              savedAt: new Date().toISOString(),
              messages: messages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp })),
              session: { mode: session.mode, model: session.model },
            };
            writeFileSync(branchPath, JSON.stringify(snapshot, null, 2), 'utf-8');
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: `Conversation checkpoint saved: "${branchName}" (${messages.length} messages)`, timestamp: new Date() }]);
          } catch (e) {
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: `Branch save failed: ${e instanceof Error ? e.message : String(e)}`, timestamp: new Date() }]);
          }
        })();
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

      // /help — show dismissable help modal overlay (does not pollute chat history)
      if (trimmed === '/help') {
        setShowHelp(true);
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
          // Gap 6: show authenticated providers for discovery
          let providerInfo = '';
          try {
            const { listAuthenticatedProviders } = require('../llm/router') as typeof import('../llm/router');
            const providers = listAuthenticatedProviders();
            if (providers.length > 0) {
              providerInfo = `\nAuthenticated providers: ${providers.join(', ')}\nUsage: /model <provider>/<model>  (e.g. /model anthropic/claude-sonnet-4-20250514)`;
            }
          } catch { /* non-critical */ }
          const msg: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: `Current model: ${session.model}${providerInfo || '\n\nUsage: /model <name>  (e.g. /model sonnet, /model gpt4o, /model gemini)'}`,
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
            // H3: Deploy mode requires confirmation before switching
            if (newMode === 'deploy') {
              setPendingDeployConfirm(true);
              return;
            }
            setSession(prev => ({ ...prev, mode: newMode as AgentMode }));
            if (onModeChange) {
              onModeChange(newMode as AgentMode);
            }
            // H3: Persist the new mode for this working directory
            try {
              const { saveModeForCwd } = require('../config/mode-store') as typeof import('../config/mode-store');
              saveModeForCwd(process.cwd(), newMode as AgentMode);
            } catch { /* non-critical */ }
            const msg: UIMessage = {
              id: crypto.randomUUID(),
              role: 'system',
              content: `Mode switched to: ${newMode}`,
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, msg]);
            // G7: Warn when switching to deploy mode in a production environment
            if (newMode === 'deploy' && isProdEnvironment(session)) {
              const ctx = [
                session.terraformWorkspace && `tf:${session.terraformWorkspace}`,
                session.kubectlContext && `k8s:${session.kubectlContext}`,
              ].filter(Boolean).join(', ');
              const warnMsg: UIMessage = {
                id: crypto.randomUUID(),
                role: 'system' as const,
                content: `[!!] Production environment detected (${ctx}). Switched to DEPLOY mode — all operations will target production.`,
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, warnMsg]);
            }
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
                  const isActive = model === session.model;
                  lines.push(`    ${isActive ? '[OK]' : '   '} ${model}`);
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
                'Context Snapshot:',
                `  LLM Model:        ${session.model ?? 'default'}`,
                `  Mode:             ${session.mode}`,
                `  TF Workspace:     ${session.terraformWorkspace ?? '(none)'}`,
                `  K8s Context:      ${session.kubectlContext ?? '(none)'}`,
                '',
                'Context Budget:',
                `  System prompt:    ${breakdown.systemPrompt.toLocaleString()} tokens`,
                `  NIMBUS.md:        ${breakdown.nimbusInstructions.toLocaleString()} tokens`,
                `  Messages:         ${breakdown.messages.toLocaleString()} tokens`,
                `  Tool definitions: ${breakdown.toolDefinitions.toLocaleString()} tokens`,
                `  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
                `  Total:            ${breakdown.total.toLocaleString()} / ${breakdown.budget.toLocaleString()} (${breakdown.usagePercent}%)`,
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

      // /diff — show git diff of unstaged changes
      if (trimmed === '/diff') {
        if (onDiff) {
          setIsProcessing(true);
          setProcessingStartTime(Date.now());
          onDiff()
            .then(diff => {
              const msg: UIMessage = {
                id: crypto.randomUUID(),
                role: 'system',
                content: diff,
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
                content: 'Failed to get git diff.',
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
            content: 'Diff is not available in this session.',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, msg]);
        }
        return;
      }

      // /cost — show per-turn cost breakdown
      if (trimmed === '/cost') {
        const content = onCost ? onCost() : 'Cost tracking unavailable.';
        const msg: UIMessage = {
          id: crypto.randomUUID(),
          role: 'system',
          content,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, msg]);
        return;
      }

      // /init — regenerate NIMBUS.md from inside the TUI
      if (trimmed === '/init') {
        if (onInit) {
          setIsProcessing(true);
          setProcessingStartTime(Date.now());
          onInit()
            .then(result => {
              const msg: UIMessage = {
                id: crypto.randomUUID(),
                role: 'system',
                content: result,
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, msg]);
              setIsProcessing(false);
              setProcessingStartTime(null);
            })
            .catch((err: Error) => {
              const msg: UIMessage = {
                id: crypto.randomUUID(),
                role: 'system',
                content: `Init failed: ${err.message}`,
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
            content: 'Init is not available in this session.',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, msg]);
        }
        return;
      }

      // /export [filename] — serialize conversation to a runbook markdown file (G16)
      if (trimmed.startsWith('/export')) {
        const exportArg = trimmed.slice('/export'.length).trim() || undefined;
        if (onExport) {
          setIsProcessing(true);
          setProcessingStartTime(Date.now());
          onExport(exportArg)
            .then(filePath => {
              const msg: UIMessage = {
                id: crypto.randomUUID(),
                role: 'system',
                content: `Session exported to: ${filePath}`,
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, msg]);
              setIsProcessing(false);
              setProcessingStartTime(null);
            })
            .catch((err: Error) => {
              const msg: UIMessage = {
                id: crypto.randomUUID(),
                role: 'system',
                content: `Export failed: ${err.message}`,
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, msg]);
              setIsProcessing(false);
              setProcessingStartTime(null);
            });
        } else {
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'system' as const,
            content: 'Export is not available in this session.',
            timestamp: new Date(),
          }]);
        }
        return;
      }

      // /remember <fact> — append fact to NIMBUS.md Agent Memory (G17)
      if (trimmed.startsWith('/remember ')) {
        const fact = trimmed.slice('/remember '.length).trim();
        if (fact && onRemember) {
          onRemember(fact)
            .then(() => {
              setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                role: 'system' as const,
                content: `Remembered: "${fact}" — saved to NIMBUS.md Agent Memory.`,
                timestamp: new Date(),
              }]);
            })
            .catch((err: Error) => {
              setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                role: 'system' as const,
                content: `Remember failed: ${err.message}`,
                timestamp: new Date(),
              }]);
            });
        } else if (!fact) {
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'system' as const,
            content: 'Usage: /remember <fact to remember>',
            timestamp: new Date(),
          }]);
        }
        return;
      }

      // /search [query] — filter conversation messages (M1)
      if (trimmed === '/search' || trimmed.startsWith('/search ')) {
        const query = trimmed.length > '/search'.length ? trimmed.slice('/search '.length).trim() : '';
        if (query) {
          setSearchQuery(query);
          setSearchMode(true);
          const count = messages.filter(m => m.content.toLowerCase().includes(query.toLowerCase())).length;
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'system' as const,
            content: `Search: "${query}" — ${count} match${count !== 1 ? 'es' : ''}`,
            timestamp: new Date(),
          }]);
        } else {
          setSearchQuery('');
          setSearchMode(false);
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'system' as const,
            content: 'Search cleared. Showing all messages.',
            timestamp: new Date(),
          }]);
        }
        return;
      }

      // /watch [pattern] — watch files and run agent on change (M5)
      // L3: Default pattern is DevOps files; devopsOnly: true when no custom arg given
      if (trimmed === '/watch' || trimmed.startsWith('/watch ')) {
        const arg = trimmed.length > '/watch'.length ? trimmed.slice('/watch '.length).trim() : '';
        const devopsDefaultGlob = '**/*.{tf,yaml,yml,Dockerfile,helmfile.yaml}';
        const pattern = arg || devopsDefaultGlob;
        const devopsOnly: boolean = !arg; // devopsOnly: true when using default pattern
        const sysMsg = (content: string) => setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content, timestamp: new Date() }]);
        if (!arg) {
          // Stop watch if active, otherwise start with DevOps default
          if (watchPattern) {
            watchAbortRef.current?.abort();
            watchAbortRef.current = null;
            setWatchPattern(null);
            sysMsg('Watch stopped.');
            return;
          }
          // Fall through to start watching with default DevOps pattern
        }
        // Start watching
        watchAbortRef.current?.abort();
        const ac = new AbortController();
        watchAbortRef.current = ac;
        setWatchPattern(pattern);
        sysMsg(`Watching: ${pattern}${devopsOnly ? ' (DevOps files)' : ''} — changes will trigger agent analysis.`);
        setShowTerminalPane(true);
        void (async () => {
          try {
            const { FileWatcher } = require('../watcher') as typeof import('../watcher');
            type WatcherInstance = { start(): void; stop(): void; on(e: string, cb: (f: string) => void): void; getSummary(since?: number, devopsOnly?: boolean): string };
            const watcher = new (FileWatcher as unknown as new(cwd: string) => WatcherInstance)(process.cwd());
            watcher.start();
            watcher.on('change', (filePath: string) => {
              if (ac.signal.aborted) return;
              // L3: When devopsOnly, filter to DevOps file extensions
              if (devopsOnly) {
                const devopsExts = ['.tf', '.yaml', '.yml', 'Dockerfile', 'helmfile.yaml'];
                const isDevops = devopsExts.some(ext => filePath.endsWith(ext) || filePath.includes(ext));
                if (!isDevops) return;
              } else {
                const ext = pattern.replace('**/', '').replace(/\*/g, '');
                if (ext && !filePath.includes(ext)) return;
              }
              const _summary = watcher.getSummary(undefined, true);
              const prompt = `File changed: ${filePath}. Analyze the change and report any issues or drift.`;
              sysMsg(`[watch] Change detected: ${filePath}`);
              if (!isProcessing) handleSubmit(prompt);
            });
            ac.signal.addEventListener('abort', () => watcher.stop());
          } catch { sysMsg('Watch: could not start file watcher.'); }
        })();
        return;
      }

      // /plan — show a terraform plan via the agent
      if (trimmed === '/plan') {
        const userMsg: UIMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: '/plan',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMsg]);
        setIsProcessing(true);
        setCurrentTurnHasOutput(false);
        setProcessingStartTime(Date.now());
        if (onMessage) {
          onMessage(
            'Show a terraform plan for the current directory. Use plan mode — read-only analysis only.'
          );
        }
        return;
      }

      // /apply — apply infrastructure changes via the agent
      if (trimmed === '/apply') {
        const userMsg: UIMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: '/apply',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMsg]);
        setIsProcessing(true);
        setCurrentTurnHasOutput(false);
        setProcessingStartTime(Date.now());
        if (onMessage) {
          onMessage(
            'Apply the infrastructure changes. Show a deploy preview first, then apply after confirmation.'
          );
        }
        return;
      }

      // /k8s-ctx — interactive kubectl context picker (GAP-7)
      if (trimmed === '/k8s-ctx' || trimmed.startsWith('/k8s-ctx ')) {
        const arg = trimmed.length > '/k8s-ctx'.length ? trimmed.slice('/k8s-ctx '.length).trim() : '';
        if (arg) {
          // Direct switch with name provided
          try {
            const { execSync } = require('node:child_process') as typeof import('node:child_process');
            execSync(`kubectl config use-context ${arg}`, { encoding: 'utf-8', timeout: 5000 });
            setSession(prev => ({ ...prev, kubectlContext: arg }));
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: `[OK] Switched kubectl context to: ${arg}`, timestamp: new Date() }]);
          } catch (e) {
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: `Failed to switch context: ${e instanceof Error ? e.message : String(e)}`, timestamp: new Date() }]);
          }
          return;
        }
        // No arg — show numbered picker
        try {
          const { execSync } = require('node:child_process') as typeof import('node:child_process');
          const ctxOutput = execSync('kubectl config get-contexts -o name 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
          const contexts = ctxOutput.trim().split('\n').filter(Boolean);
          if (contexts.length === 0) {
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: 'No kubectl contexts found. Check your kubeconfig.', timestamp: new Date() }]);
            return;
          }
          setPendingContextSelect(contexts);
          const lines = ['Available kubectl contexts:', ...contexts.map((c, i) => `  ${i + 1}. ${c}`), '', 'Type a number or context name to switch:'];
          setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: lines.join('\n'), timestamp: new Date() }]);
        } catch {
          // Fallback to agent
          setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user' as const, content: '/k8s-ctx', timestamp: new Date() }]);
          setIsProcessing(true); setCurrentTurnHasOutput(false); setProcessingStartTime(Date.now());
          if (onMessage) onMessage('List all available Kubernetes contexts and show the current one.');
        }
        return;
      }

      // M3: /profile <name> — switch credential profile in the TUI
      if (trimmed.startsWith('/profile ')) {
        const profileName = trimmed.slice('/profile '.length).trim();
        if (profileName) {
          void (async () => {
            try {
              const { profileCommand } = require('../commands/profile') as typeof import('../commands/profile');
              await profileCommand('set', [profileName]);
              // Update session with new infra context after profile switch
              const { discoverInfraContext } = require('../cli/init') as typeof import('../cli/init');
              const ctx = await discoverInfraContext(process.cwd()).catch(() => undefined);
              if (ctx) {
                setSession(prev => ({
                  ...prev,
                  terraformWorkspace: ctx.terraformWorkspace ?? prev.terraformWorkspace,
                  kubectlContext: ctx.kubectlContext ?? prev.kubectlContext,
                }));
              }
              setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: `Profile "${profileName}" activated.`, timestamp: new Date() }]);
            } catch (e) {
              setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: `Failed to activate profile "${profileName}": ${e instanceof Error ? e.message : String(e)}`, timestamp: new Date() }]);
            }
          })();
        } else {
          setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: 'Usage: /profile <name>', timestamp: new Date() }]);
        }
        return;
      }

      // /tf-ws — interactive Terraform workspace picker (GAP-8)
      if (trimmed === '/tf-ws' || trimmed.startsWith('/tf-ws ')) {
        const arg = trimmed.length > '/tf-ws'.length ? trimmed.slice('/tf-ws '.length).trim() : '';
        if (arg) {
          // Direct switch with name provided
          try {
            const { execSync } = require('node:child_process') as typeof import('node:child_process');
            execSync(`terraform workspace select ${arg}`, { encoding: 'utf-8', timeout: 10000, cwd: process.cwd() });
            setSession(prev => ({ ...prev, terraformWorkspace: arg }));
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: `[OK] Switched Terraform workspace to: ${arg}`, timestamp: new Date() }]);
          } catch (e) {
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: `Failed to switch workspace: ${e instanceof Error ? e.message : String(e)}`, timestamp: new Date() }]);
          }
          return;
        }
        // No arg — show numbered picker
        try {
          const { execSync } = require('node:child_process') as typeof import('node:child_process');
          const wsOutput = execSync('terraform workspace list 2>/dev/null', { encoding: 'utf-8', timeout: 10000, cwd: process.cwd() });
          const workspaces = wsOutput.trim().split('\n').map((w: string) => w.replace(/^\*\s*/, '').trim()).filter(Boolean);
          if (workspaces.length === 0) {
            setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: 'No Terraform workspaces found. Run terraform workspace list manually.', timestamp: new Date() }]);
            return;
          }
          setPendingWorkspaceSelect(workspaces);
          const lines = ['Available Terraform workspaces:', ...workspaces.map((w: string, i: number) => `  ${i + 1}. ${w}`), '', 'Type a number or workspace name to switch:'];
          setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: lines.join('\n'), timestamp: new Date() }]);
        } catch {
          // Fallback to agent
          setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user' as const, content: '/tf-ws', timestamp: new Date() }]);
          setIsProcessing(true); setCurrentTurnHasOutput(false); setProcessingStartTime(Date.now());
          if (onMessage) onMessage('List all Terraform workspaces and show the current one.');
        }
        return;
      }

      // /workspace <name> — select terraform workspace (M2)
      if (trimmed.startsWith('/workspace ')) {
        const wsName = trimmed.slice('/workspace '.length).trim();
        if (!wsName) {
          const sysMsg: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: 'Usage: /workspace <name>',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, sysMsg]);
          return;
        }
        const userMsg: UIMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: `/workspace ${wsName}`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMsg]);
        setIsProcessing(true);
        setCurrentTurnHasOutput(false);
        setProcessingStartTime(Date.now());
        if (onMessage) {
          onMessage(`Switch to Terraform workspace "${wsName}" using the terraform workspace-select action, then confirm the switch was successful.`);
        }
        return;
      }

      // /profile <name> — set AWS_PROFILE (M2)
      if (trimmed.startsWith('/profile ')) {
        const profileName = trimmed.slice('/profile '.length).trim();
        if (!profileName) {
          const sysMsg: UIMessage = {
            id: crypto.randomUUID(),
            role: 'system',
            content: 'Usage: /profile <name>',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, sysMsg]);
          return;
        }
        process.env.AWS_PROFILE = profileName;
        const sysMsg: UIMessage = {
          id: crypto.randomUUID(),
          role: 'system',
          content: `AWS_PROFILE set to "${profileName}". Subsequent AWS operations will use this profile.`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, sysMsg]);
        return;
      }

      // /terminal — toggle the terminal output pane (M1)
      if (trimmed === '/terminal') {
        setShowTerminalPane(prev => !prev);
        return;
      }

      // /tree — toggle the file tree sidebar (L1)
      if (trimmed === '/tree') {
        setShowTreePane(prev => !prev);
        return;
      }

      // /theme [dark|light] — switch the TUI color theme (Gap 2)
      if (trimmed === '/theme' || trimmed.startsWith('/theme ')) {
        const themeName = trimmed.length > '/theme'.length ? trimmed.slice('/theme '.length).trim() : undefined;
        if (themeName) {
          try {
            const { setTheme, listThemes } = require('./theme') as typeof import('./theme');
            const available = listThemes();
            if (available.includes(themeName)) {
              setTheme(themeName);
              const msg: UIMessage = { id: crypto.randomUUID(), role: 'system', content: `Theme switched to: ${themeName}`, timestamp: new Date() };
              setMessages(prev => [...prev, msg]);
            } else {
              const msg: UIMessage = { id: crypto.randomUUID(), role: 'system', content: `Unknown theme "${themeName}". Available: ${available.join(', ')}`, timestamp: new Date() };
              setMessages(prev => [...prev, msg]);
            }
          } catch {
            const msg: UIMessage = { id: crypto.randomUUID(), role: 'system', content: 'Theme switching unavailable.', timestamp: new Date() };
            setMessages(prev => [...prev, msg]);
          }
        } else {
          const msg: UIMessage = { id: crypto.randomUUID(), role: 'system', content: 'Usage: /theme <dark|light>', timestamp: new Date() };
          setMessages(prev => [...prev, msg]);
        }
        return;
      }

      // /tools [name] — list tool schemas or show a specific tool (Gap 15)
      if (trimmed === '/tools' || trimmed.startsWith('/tools ')) {
        const toolName = trimmed.length > '/tools'.length ? trimmed.slice('/tools '.length).trim() : undefined;
        try {
          const { defaultToolRegistry } = require('../tools/schemas/types') as typeof import('../tools/schemas/types');
          if (toolName) {
            const tool = defaultToolRegistry.get(toolName);
            if (tool) {
              const schema = JSON.stringify(tool.inputSchema._def ?? { type: 'object' }, null, 2);
              const msg: UIMessage = { id: crypto.randomUUID(), role: 'system', content: `**${tool.name}** (${tool.permissionTier}): ${tool.description}\n\`\`\`json\n${schema.slice(0, 2000)}\n\`\`\``, timestamp: new Date() };
              setMessages(prev => [...prev, msg]);
            } else {
              const msg: UIMessage = { id: crypto.randomUUID(), role: 'system', content: `Tool not found: ${toolName}`, timestamp: new Date() };
              setMessages(prev => [...prev, msg]);
            }
          } else {
            const list = defaultToolRegistry.getAll()
              .map((t: { name: string; permissionTier: string; description: string }) => `- **${t.name}** (${t.permissionTier}): ${t.description.slice(0, 60)}`)
              .join('\n');
            const msg: UIMessage = { id: crypto.randomUUID(), role: 'system', content: `Available tools:\n${list}`, timestamp: new Date() };
            setMessages(prev => [...prev, msg]);
          }
        } catch {
          const msg: UIMessage = { id: crypto.randomUUID(), role: 'system', content: 'Tool registry unavailable.', timestamp: new Date() };
          setMessages(prev => [...prev, msg]);
        }
        return;
      }

      // /rollback [resource] — inject a rollback prompt (Gap 14)
      if (trimmed === '/rollback' || trimmed.startsWith('/rollback ')) {
        const resource = trimmed.length > '/rollback'.length ? trimmed.slice('/rollback '.length).trim() : 'last-deployment';
        const userMsg: UIMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setIsProcessing(true);
        setCurrentTurnHasOutput(false);
        setProcessingStartTime(Date.now());
        if (onMessage) {
          onMessage(`Please safely rollback ${resource}. Detect the infra type (terraform/kubectl/helm) from context and use the safest rollback method. Show what you're doing before executing.`);
        }
        return;
      }

      // /drift — scan all terraform workspaces for drift (Gap 17)
      if (trimmed === '/drift') {
        const userMsg: UIMessage = { id: crypto.randomUUID(), role: 'user', content: '/drift', timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setIsProcessing(true);
        setCurrentTurnHasOutput(false);
        setProcessingStartTime(Date.now());
        if (onMessage) {
          onMessage('Run drift_detect for all terraform workspaces in this project and summarize findings in a table with columns: Workspace, Status, Drifted Resources.');
        }
        return;
      }

      // /auth-refresh — refresh cloud credentials (Gap 16)
      if (trimmed === '/auth-refresh') {
        const userMsg: UIMessage = { id: crypto.randomUUID(), role: 'user', content: '/auth-refresh', timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setIsProcessing(true);
        setCurrentTurnHasOutput(false);
        setProcessingStartTime(Date.now());
        if (onMessage) {
          onMessage('Check and refresh cloud credentials for AWS, GCP, and Azure. Show the current auth status for each provider and guide me through renewing any expired credentials.');
        }
        return;
      }

      // /export [filename] — export session as Markdown runbook (Gap 4)
      if (trimmed === '/export' || trimmed.startsWith('/export ')) {
        const filename = trimmed.length > '/export'.length
          ? trimmed.slice('/export '.length).trim()
          : `nimbus-runbook-${Date.now()}.md`;
        try {
          const { formatSessionAsRunbook } = require('../sharing/viewer') as typeof import('../sharing/viewer');
          const fs = require('node:fs') as typeof import('node:fs');
          const runbookMessages = messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content, timestamp: m.timestamp }));
          const content = formatSessionAsRunbook(runbookMessages, { model: session.model, mode: session.mode, costUSD: session.costUSD, tokenCount: session.tokenCount });
          fs.writeFileSync(filename, content, 'utf-8');
          const msg: UIMessage = { id: crypto.randomUUID(), role: 'system', content: `Session exported to ${filename}`, timestamp: new Date() };
          setMessages(prev => [...prev, msg]);
        } catch (err) {
          const msg: UIMessage = { id: crypto.randomUUID(), role: 'system', content: `Export failed: ${err instanceof Error ? err.message : String(err)}`, timestamp: new Date() };
          setMessages(prev => [...prev, msg]);
        }
        return;
      }

      // /alias [list|create|remove] — manage command aliases from TUI (G23)
      if (trimmed === '/alias' || trimmed.startsWith('/alias ')) {
        const subArgs = trimmed.length > '/alias'.length
          ? trimmed.slice('/alias '.length).trim().split(/\s+/).filter(Boolean)
          : ['list'];
        setIsProcessing(true);
        import('../commands/alias').then(({ aliasCommand }) => {
          return aliasCommand(subArgs[0] ?? 'list', subArgs.slice(1));
        }).then(output => {
          const msg: UIMessage = { id: crypto.randomUUID(), role: 'system', content: String(output ?? '(no output)'), timestamp: new Date() };
          setMessages(prev => [...prev, msg]);
          setIsProcessing(false);
        }).catch(err => {
          const msg: UIMessage = { id: crypto.randomUUID(), role: 'system', content: `alias error: ${err instanceof Error ? err.message : String(err)}`, timestamp: new Date() };
          setMessages(prev => [...prev, msg]);
          setIsProcessing(false);
        });
        return;
      }


      // M7: /explain [topic] — explain a DevOps resource or concept via agent
      if (trimmed.startsWith('/explain ') || trimmed === '/explain') {
        const topic = trimmed.length > '/explain '.length
          ? trimmed.slice('/explain '.length).trim()
          : 'the current infrastructure context';
        const explainPrompt = `Please explain ${topic} in the context of DevOps/infrastructure. Include: what it does, common use cases, and relevant commands or patterns.`;
        const userMsg: UIMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: trimmed,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMsg]);
        setIsProcessing(true);
        setCurrentTurnHasOutput(false);
        setProcessingStartTime(Date.now());
        if (onMessage) {
          onMessage(explainPrompt);
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
            // GAP-6: 100KB cap (up from 10KB)
            const truncated =
              content.length > 100_000
                ? `${content.slice(0, 100_000)}\n... (truncated — showing 100,000 of ${content.length.toLocaleString()} chars)`
                : content;
            const ext = filePath.split('.').pop() ?? '';
            expandedText = expandedText.replace(
              ref,
              `\n\`\`\`${ext}\n// File: ${filePath}\n${truncated}\n\`\`\``
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
      setInputPrefill(undefined); // GAP-21: clear prefill after submit
      setIsProcessing(true);
      setCurrentTurnHasOutput(false);
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
      onDiff,
      onCost,
      onInit,
      session.id,
      session.model,
      session.mode,
      pendingContextSelect,
      pendingWorkspaceSelect,
      messages,
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
  const handleDeployDecision = useCallback((decision: DeployDecision) => {
    if (deployPreview?.onDecide) {
      deployPreview.onDecide(decision);
    }
    setDeployPreview(null);
  }, [deployPreview]);

  /** Handle file diff modal decisions. */
  const handleFileDiffDecision = useCallback(
    (decision: FileDiffDecision) => {
      if (fileDiffRequest) {
        fileDiffRequest.onDecide(decision);
      }
      setFileDiffRequest(null);
    },
    [fileDiffRequest]
  );

  /* -- Global keyboard shortcuts ----------------------------------------- */

  useInput(
    (input, key) => {
      // Tab: cycle modes (only when not in a modal and not typing a slash command)
      // When input starts with '/', Tab is handled by InputBox for autocomplete
      if (key.tab && !permissionRequest && !deployPreview && !fileDiffRequest) {
        // G7: Compute newMode from current session state (available in closure)
        // so we can inject a warning message when switching to deploy on prod.
        const newMode = nextMode(session.mode);
        // H3: Deploy mode requires confirmation before switching
        if (newMode === 'deploy') {
          setPendingDeployConfirm(true);
          return;
        }
        setSession(prev => {
          // Propagate mode change to the agent loop so it actually takes effect
          if (onModeChange) {
            onModeChange(newMode);
          }
          return { ...prev, mode: newMode };
        });
        // H5: Show 2-second mode toast
        setModeToast(`→ ${newMode.toUpperCase()} mode`);
        setTimeout(() => setModeToast(null), 2000);
        // H3: Persist the Tab-cycled mode for this working directory
        try {
          const { saveModeForCwd } = require('../config/mode-store') as typeof import('../config/mode-store');
          saveModeForCwd(process.cwd(), newMode);
        } catch { /* non-critical */ }
        return;
      }

      // Ctrl+C: cancel current tool, interrupt, or exit
      if (input === 'c' && key.ctrl) {
        if (isProcessing && onCancelCurrentTool) {
          // C1: A tool is running and we have a per-tool cancel hook — cancel just the tool.
          // The agent loop continues after the tool returns a synthetic cancelled result.
          onCancelCurrentTool();
          setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: '[!!] Cancelling current tool... (Ctrl+C again to abort the session)', timestamp: new Date() }]);
          setAbortPending(true);
          setTimeout(() => setAbortPending(false), 3000);
        } else if (isProcessing) {
          handleAbort();
          setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: '[!!] Cancelling current operation... (Ctrl+C again to force exit)', timestamp: new Date() }]);
          setAbortPending(true);
          setTimeout(() => setAbortPending(false), 3000);
        } else if (abortPending) {
          exit();
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
        } else if (fileDiffRequest) {
          handleFileDiffDecision('reject');
        } else if (isProcessing) {
          handleAbort();
        }
      }
    },
    // Disable the global handler when modals are active so their own
    // useInput handlers take priority.
    { isActive: !permissionRequest && !deployPreview && !fileDiffRequest }
  );

  /* -- C1: Scroll input handler ------------------------------------------ */

  useInput(
    (input, key) => {
      // Arrow up / k — scroll back one message
      if (key.upArrow || input === 'k') {
        setScrollOffset(prev => prev + 1);
        setScrollLocked(false);
        return;
      }
      // Arrow down / j — scroll forward one message
      if (key.downArrow || input === 'j') {
        setScrollOffset(prev => {
          const next = Math.max(0, prev - 1);
          if (next === 0) setScrollLocked(true);
          return next;
        });
        return;
      }
      // Page up / b — scroll back 10 messages
      if (key.pageUp || input === 'b') {
        setScrollOffset(prev => prev + 10);
        setScrollLocked(false);
        return;
      }
      // Page down / f / space — scroll forward 10
      if (key.pageDown || input === 'f' || input === ' ') {
        setScrollOffset(prev => {
          const next = Math.max(0, prev - 10);
          if (next === 0) setScrollLocked(true);
          return next;
        });
        return;
      }
      // G / End — jump to bottom
      if (input === 'G') {
        setScrollOffset(0);
        setScrollLocked(true);
        return;
      }
      // L2: Ctrl+Z — undo last file-modifying operation (same as /undo command)
      if (input === 'z' && key.ctrl) {
        if (onUndo) {
          setIsProcessing(true);
          onUndo()
            .then(result => {
              setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                role: 'system' as const,
                content: result.success
                  ? `Undo: ${result.description ?? 'snapshot restored'}`
                  : 'Nothing to undo.',
                timestamp: new Date(),
              }]);
              setIsProcessing(false);
            })
            .catch(() => {
              setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                role: 'system' as const,
                content: 'Nothing to undo.',
                timestamp: new Date(),
              }]);
              setIsProcessing(false);
            });
        } else {
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'system' as const,
            content: 'Nothing to undo.',
            timestamp: new Date(),
          }]);
        }
        return;
      }
    },
    { isActive: !isProcessing && !permissionRequest && !deployPreview && !fileDiffRequest && !showHelp }
  );

  /* -- H3: Deploy mode confirmation input handler ----------------------- */

  useInput(
    (input, key) => {
      if (!pendingDeployConfirm) return;
      if (input === 'y' || input === 'Y') {
        setPendingDeployConfirm(false);
        setSession(prev => ({ ...prev, mode: 'deploy' }));
        if (onModeChange) onModeChange('deploy');
        try {
          const { saveModeForCwd } = require('../config/mode-store') as typeof import('../config/mode-store');
          saveModeForCwd(process.cwd(), 'deploy');
        } catch { /* non-critical */ }
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: 'Mode switched to: deploy', timestamp: new Date() }]);
        setModeToast('→ DEPLOY mode');
        setTimeout(() => setModeToast(null), 2000);
      } else if (input === 'n' || input === 'N' || key.escape) {
        setPendingDeployConfirm(false);
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system' as const, content: 'Deploy mode cancelled.', timestamp: new Date() }]);
      }
    },
    { isActive: pendingDeployConfirm }
  );

  /* -- H5: ? key opens HelpModal ---------------------------------------- */

  useInput(
    (input) => {
      if (input === '?' && !isProcessing && !showHelp) {
        setShowHelp(true);
      }
    },
    { isActive: !permissionRequest && !deployPreview && !fileDiffRequest && !showHelp }
  );

  /* -- Derived state ----------------------------------------------------- */

  // M1: Compute search result count for the StatusBar
  const searchResultCount = useMemo(
    () => searchQuery ? messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase())).length : 0,
    [messages, searchQuery]
  );

  // Collect tool calls from the last assistant message (if any) plus any
  // currently active tool calls being streamed in.
  // useMemo avoids the O(n) backwards scan on every React render.
  const visibleToolCalls: UIToolCall[] = useMemo(() => {
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
  }, [activeToolCalls, messages]);

  /* -- Render ------------------------------------------------------------ */

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* C3: API key setup banner — shown when no API key is configured */}
      {showApiKeySetup && (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1} marginBottom={1}>
          <Text bold color="yellow">Welcome to Nimbus! No API key configured.</Text>
          <Text dimColor>Set ANTHROPIC_API_KEY environment variable, or run: nimbus login</Text>
          <Text dimColor>Press Enter to continue without API key (limited functionality)</Text>
          <Text dimColor>This banner will dismiss in 8 seconds or on your first message.</Text>
        </Box>
      )}

      {/* Top: Header */}
      <Header session={session} />

      {/* Middle: message list + optional side panes (M1, L1) */}
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" flexGrow={1}>
          <MessageList
            messages={messages}
            mode={session.mode}
            scrollOffset={scrollOffset}
            searchQuery={searchQuery || undefined}
            columns={columns}
          />
        </Box>
        {(showTerminalPane || terminalPaneAuto) && (
          <TerminalPane toolCalls={completedToolCalls} maxLines={20} />
        )}
        {showTreePane && (
          <TreePane
            cwd={process.cwd()}
            onSelectFile={fp => {
              // GAP-21: inject @filepath directly into InputBox via prefill state
              const cwd = process.cwd();
              const rel = fp.startsWith(cwd + '/') ? fp.slice(cwd.length + 1) : fp;
              setInputPrefill(`@${rel} `);
            }}
          />
        )}
      </Box>

      {/* Thinking spinner — shown between message submit and first LLM token/tool */}
      {isProcessing && !currentTurnHasOutput && (
        <Box paddingX={1} paddingY={0}>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text color="cyan" dimColor>
            {' '}Thinking...
          </Text>
        </Box>
      )}

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

      {/* H3: Deploy mode confirmation modal */}
      {pendingDeployConfirm && (
        <Box flexDirection="column" borderStyle="double" borderColor="red" paddingX={2} paddingY={1}>
          <Text bold color="red">!! Switch to DEPLOY mode?</Text>
          <Text> </Text>
          <Text>DEPLOY mode enables destructive operations:</Text>
          <Text dimColor>  terraform apply/destroy, kubectl delete, helm uninstall</Text>
          <Text> </Text>
          <Text>Press <Text bold color="green">y</Text> to confirm  |  <Text bold color="red">n</Text> or Esc to cancel</Text>
        </Box>
      )}

      {/* Modal: Deploy preview */}
      {deployPreview && <DeployPreview preview={deployPreview} onDecide={handleDeployDecision} />}

      {/* Modal: File diff approval */}
      {fileDiffRequest && (
        <FileDiffModal
          request={{
            ...fileDiffRequest,
            onDecide: handleFileDiffDecision,
          }}
        />
      )}

      {/* Modal: Help overlay */}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      {/* Input area */}
      <InputBox
        onSubmit={handleSubmit}
        onAbort={handleAbort}
        disabled={isProcessing || !!permissionRequest || !!deployPreview || !!fileDiffRequest || showHelp}
        placeholder={isProcessing ? 'Agent is thinking...' : undefined}
        mode={session.mode}
        onLineCountChange={setInputLineCount}
        prefill={inputPrefill}
        onFetchCompletions={onFetchCompletions}
      />

      {/* Bottom: Status bar */}
      <StatusBar
        session={session}
        isProcessing={isProcessing}
        processingStartTime={processingStartTime}
        inputLineCount={inputLineCount}
        showScrollHint={!scrollLocked}
        copyToast={copyToast}
        modeToast={modeToast ?? undefined}
        searchQuery={searchQuery || undefined}
        searchResultCount={searchQuery ? searchResultCount : undefined}
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
  requestDeployPreview: (preview: DeployPreviewData, onDecide: (d: DeployDecision) => void) => void;
  requestFileDiff: (path: string, toolName: string, diff: string, onDecide: (d: FileDiffDecision) => void, index?: number) => void;
  setProcessing: (value: boolean) => void;
  /** GAP-2: Update LLM connectivity health indicator in the Header. */
  setLLMHealth: (health: 'checking' | 'ok' | 'error') => void;
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
