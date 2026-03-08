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
  type OnDiffCallback,
  type OnCostCallback,
  type OnInitCallback,
} from '../App';
import type { FileDiffDecision } from '../FileDiffModal';
import type { UIMessage, UIToolCall, DeployPreviewData } from '../types';
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
import { HookEngine } from '../../hooks/engine';
import { getLSPManager } from '../../lsp/manager';
import { DEVOPS_LANGUAGE_IDS } from '../../lsp/languages';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { InfraContext } from '../../cli/init';
import { setTheme } from '../theme';

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
  /** Pre-loaded initial prompt (sent as first user message automatically). */
  initialPrompt?: string;
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

  // Gap 19: collect any startup warnings so they can be shown as system messages
  let _startupWarnings: string[] = [];
  try {
    const { startupWarnings } = await import('../../app');
    _startupWarnings = startupWarnings;
  } catch { /* non-critical */ }

  // Gap 2: load theme from ~/.nimbus/config.yaml if present
  try {
    const configPath = join(homedir(), '.nimbus', 'config.yaml');
    if (existsSync(configPath)) {
      const configContent = readFileSync(configPath, 'utf-8');
      const themeMatch = configContent.match(/^theme:\s*(\S+)/m);
      if (themeMatch) {
        setTheme(themeMatch[1]);
      }
    }
  } catch { /* non-critical */ }

  // Use mutable refs so /model, /mode, and Tab changes propagate to the agent loop
  let currentMode: AgentMode = options.mode ?? 'build';
  let currentModel: string | undefined = options.model;
  // Gap 7 & 10: live infra context discovered at startup
  let currentInfraContext: InfraContext | undefined;

  // C1: Load prior infra state from ~/.nimbus/infra-state.json before discovery
  const infraStatePath = join(homedir(), '.nimbus', 'infra-state.json');
  let priorInfraState: InfraContext | undefined;
  try {
    if (existsSync(infraStatePath)) {
      const raw = readFileSync(infraStatePath, 'utf-8');
      priorInfraState = JSON.parse(raw) as InfraContext;
    }
  } catch { /* non-critical */ }

  // H6: Load persisted workspace state as baseline (fresh discovery will override below)
  try {
    const { loadWorkspaceState } = await import('../../config/workspace-state');
    const storedWorkspace = loadWorkspaceState(process.cwd());
    if (!currentInfraContext && Object.keys(storedWorkspace).length > 0) {
      currentInfraContext = storedWorkspace as InfraContext;
    }
  } catch { /* non-critical */ }

  const contextManager = new ContextManager({ model: currentModel });
  const snapshotManager = new SnapshotManager({ projectDir: process.cwd() });
  const lspManager = getLSPManager(process.cwd(), { enabledLanguages: DEVOPS_LANGUAGE_IDS });

  // Concurrent message guard: prevent overlapping agent loop runs
  let isRunning = false;

  // Context window warning: warn once per session at 70% usage
  let contextWarningShown = false;

  // Eagerly load NIMBUS.md for explicit pass-through to the agent loop.
  // On the first run (no NIMBUS.md found), auto-run `nimbus init --quiet`
  // to generate one with detected project context.
  let nimbusInstructions: string | undefined;
  const nimbusMdPaths = [
    join(process.cwd(), 'NIMBUS.md'),
    join(process.cwd(), '.nimbus', 'NIMBUS.md'),
  ];

  const foundNimbusMd = nimbusMdPaths.find(p => existsSync(p));
  if (foundNimbusMd) {
    try {
      nimbusInstructions = readFileSync(foundNimbusMd, 'utf-8');
    } catch {
      /* skip */
    }
  } else if (!options.resumeSessionId) {
    // Fresh session with no NIMBUS.md — silently auto-generate one
    try {
      const { runInit } = await import('../../cli/init');
      const result = await runInit({ cwd: process.cwd(), quiet: true });
      // Load the freshly generated NIMBUS.md
      if (result.nimbusmdPath && existsSync(result.nimbusmdPath)) {
        nimbusInstructions = readFileSync(result.nimbusmdPath, 'utf-8');
      }
    } catch {
      /* init failure is non-critical — proceed without project context */
    }
  }

  // G4: If NIMBUS.md is still missing after auto-init attempt, show a prominent banner
  const isNewSessionEarly = !options.resumeSessionId;
  const nimbusMdMissing = !nimbusInstructions;
  // initialMessages array will be populated later; we track the banner flag here
  const showNimbusMdBanner = nimbusMdMissing && isNewSessionEarly;

  // Initialize hook engine with project dir (loads .nimbus/hooks.yaml if present)
  const hookEngine = new HookEngine(process.cwd());

  // Start filesystem watcher for external change awareness
  const watcher = new FileWatcher(process.cwd());
  watcher.start();

  // NIMBUS.md live reload (M10): watch for changes to NIMBUS.md mid-session
  // M5: Also notify on DevOps file changes (debounced 30s per file)
  const devopsChangeDebounce = new Map<string, ReturnType<typeof setTimeout>>();

  watcher.on('change', (changedPath: string) => {
    if (changedPath.endsWith('NIMBUS.md')) {
      try {
        nimbusInstructions = readFileSync(changedPath, 'utf-8');
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          content: '[md] NIMBUS.md reloaded — new instructions active for next turn.',
          timestamp: new Date(),
        });
      } catch {
        /* ignore read errors */
      }
    }

    // M5: Notify on DevOps file changes (debounced 30s per file)
    const filePath = typeof changedPath === 'string' ? changedPath : (changedPath as any)?.path ?? '';
    const isDevOps = /\.(tf|yaml|yml)$|Dockerfile|docker-compose/i.test(filePath);
    if (isDevOps) {
      const existing = devopsChangeDebounce.get(filePath);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        devopsChangeDebounce.delete(filePath);
        const relPath = filePath.replace(process.cwd() + '/', '');
        const hint = relPath.endsWith('.tf') ? '/plan' : relPath.includes('yaml') ? '/plan' : '/init';
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          content: `[~] File changed: ${relPath} — type ${hint} to review drift impact`,
          timestamp: new Date(),
        });
      }, 30000);
      devopsChangeDebounce.set(filePath, timer);
    }
  });

  // C4: Surface LSP unavailability as system messages so the user knows diagnostics are disabled
  lspManager.on('lsp-unavailable', (lang: string, cmd: string) => {
    addMessage({
      id: crypto.randomUUID(),
      role: 'system',
      content: `[LSP] ${lang} server (${cmd}) not found — diagnostics disabled.`,
      timestamp: new Date(),
    });
  });

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
    // C5: Surface SQLite failure prominently in the TUI (not just stderr)
    const errMsg = sessionErr instanceof Error ? sessionErr.message : String(sessionErr);
    const tuiWarning = `Session persistence unavailable: ${errMsg}. Chat history will NOT be saved this session. Fix: npm install better-sqlite3 (or npm install sql.js)`;
    _startupWarnings.push(tuiWarning);
    process.stderr.write(`\x1b[33m  Warning: ${tuiWarning}\x1b[0m\n`);
  }

  // Fix 4: On first ever session, run an extended CLI check and surface missing DevOps
  // tools before they cause cryptic errors mid-task.
  try {
    const allSessions = sessionManager ? sessionManager.list() : [];
    const isFirstEverSession = allSessions.length <= 1 && !options.resumeSessionId;
    if (isFirstEverSession) {
      const { execSync } = await import('node:child_process');
      const devopsCLIs = [
        { name: 'terraform', cmd: 'terraform version' },
        { name: 'kubectl', cmd: 'kubectl version --client' },
        { name: 'helm', cmd: 'helm version' },
        { name: 'docker', cmd: 'docker --version' },
      ];
      const missing: string[] = [];
      for (const cli of devopsCLIs) {
        try {
          execSync(cli.cmd, { timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] });
        } catch {
          missing.push(cli.name);
        }
      }
      if (missing.length > 0) {
        _startupWarnings.push(
          `[doctor] Missing DevOps CLIs: ${missing.join(', ')}. Run \`nimbus doctor\` for install instructions.`
        );
      }
    }
  } catch { /* non-critical — doctor failure must never block startup */ }

  // Gap 7 & 10: discover live infra context at startup (best-effort, non-blocking)
  try {
    const { discoverInfraContext } = await import('../../cli/init');
    currentInfraContext = await discoverInfraContext(process.cwd());

    // C1: Merge with prior state (fresh discovery wins per-field)
    if (priorInfraState) {
      currentInfraContext = { ...priorInfraState, ...currentInfraContext };
    }

    // C1: Persist discovered infra state to ~/.nimbus/infra-state.json
    if (currentInfraContext) {
      try {
        mkdirSync(join(homedir(), '.nimbus'), { recursive: true });
        writeFileSync(infraStatePath, JSON.stringify(currentInfraContext, null, 2), 'utf-8');
      } catch { /* non-critical */ }

      // H6: Also persist workspace state (terraform workspace + kubectl context) per cwd
      try {
        const { mergeWorkspaceState } = await import('../../config/workspace-state');
        mergeWorkspaceState(process.cwd(), currentInfraContext ?? {});
      } catch { /* non-critical */ }
    }

    if (sessionManager && sessionId && currentInfraContext) {
      try {
        sessionManager.setInfraContext(sessionId, currentInfraContext);
      } catch { /* non-critical */ }
    }

    // C4: Set terminal window title with infra context
    try {
      const ctxLabel = [
        currentInfraContext?.terraformWorkspace && `tf:${currentInfraContext.terraformWorkspace}`,
        currentInfraContext?.kubectlContext && `k8s:${currentInfraContext.kubectlContext}`,
      ].filter(Boolean).join(' | ') || 'nimbus';
      process.stdout.write(`\x1b]0;nimbus -- ${ctxLabel}\x07`);
      process.on('exit', () => process.stdout.write('\x1b]0;Terminal\x07'));
    } catch { /* non-critical */ }
  } catch { /* non-critical — infra discovery failure must never block startup */ }

  // C3: Auto-generate NIMBUS.md if infra is detected but no NIMBUS.md exists
  try {
    const nimbusmdPath = join(process.cwd(), 'NIMBUS.md');
    if (currentInfraContext && !existsSync(nimbusmdPath)) {
      const hasTerraform = (currentInfraContext as { terraformWorkspace?: string }).terraformWorkspace !== undefined
        || existsSync(join(process.cwd(), 'main.tf'))
        || existsSync(join(process.cwd(), 'terraform'));
      const hasK8s = (currentInfraContext as { kubectlContext?: string }).kubectlContext !== undefined;
      const hasHelm = ((currentInfraContext as { helmReleases?: string[] }).helmReleases?.length ?? 0) > 0;

      if (hasTerraform || hasK8s || hasHelm) {
        const { generateNimbusMd, detectProject } = await import('../../cli/init');
        const detection = detectProject(process.cwd());
        const mdContent = generateNimbusMd(detection, process.cwd(), currentInfraContext);
        writeFileSync(nimbusmdPath, mdContent, 'utf-8');
        process.stderr.write('\x1b[32m  [nimbus] Auto-generated NIMBUS.md from detected infra\x1b[0m\n');
      }
    }
  } catch { /* non-critical */ }

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

    // Gap 10: On resume, merge stored infra context with freshly discovered live context
    try {
      const storedInfra = sessionManager.getInfraContext(sessionId);
      // Live context (already discovered above) takes precedence for mutable fields
      currentInfraContext = { ...storedInfra, ...currentInfraContext };
    } catch { /* non-critical */ }
  }

  // G2 / C1: Build resume context summary message when resuming with infra context
  // Also show when prior state was loaded (even on a new session) to confirm context continuity
  const hasResumeContext = currentInfraContext && (
    currentInfraContext.kubectlContext || currentInfraContext.terraformWorkspace || currentInfraContext.awsAccount
  );
  const showResumeBanner = (options.resumeSessionId || !!priorInfraState) && hasResumeContext;
  const resumeContextMessage: UIMessage | null = showResumeBanner ? {
    id: crypto.randomUUID(),
    role: 'system' as const,
    content: [
      options.resumeSessionId ? 'Resuming session -' : 'Resuming with:',
      currentInfraContext!.terraformWorkspace ? `tf:${currentInfraContext!.terraformWorkspace}` : null,
      currentInfraContext!.kubectlContext ? `k8s:${currentInfraContext!.kubectlContext}` : null,
      currentInfraContext!.awsAccount ? `aws:${currentInfraContext!.awsAccount}` : null,
    ].filter(Boolean).join(' | '),
    timestamp: new Date(),
  } : null;

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
   * Determines whether a tool call requires a deploy preview confirmation in deploy mode.
   * Covers terraform/kubectl/helm plus destructive bash cloud CLI commands.
   */
  function requiresDeployPreview(toolName: string, toolInput: Record<string, unknown>): boolean {
    if (['terraform', 'kubectl', 'helm'].includes(toolName)) return true;
    if (toolName === 'docker') {
      const action = String(toolInput.action ?? '');
      return ['build', 'push', 'stop', 'compose-up', 'compose-down', 'rm', 'prune'].includes(action);
    }
    if (toolName === 'cloud_action') {
      const action = String(toolInput.action ?? '');
      return ['create', 'delete', 'stop'].includes(action);
    }
    if (toolName === 'cfn') {
      const action = String(toolInput.action ?? '');
      return ['create', 'update', 'delete', 'deploy'].includes(action);
    }
    if (toolName === 'bash') {
      const cmd = String(toolInput.command ?? '');
      return /\b(aws\s+\S+\s+delete|aws\s+ec2\s+terminate|gcloud\s+\S+\s+delete|az\s+\S+\s+delete|kubectl\s+delete)\b/.test(cmd);
    }
    return false;
  }

  /**
   * Show the deploy preview modal and wait for user confirmation.
   * Returns true if the user approves, false if they cancel.
   */
  function promptDeployPreview(tool: string, input: Record<string, unknown>): Promise<boolean> {
    return new Promise(resolve => {
      if (!api) {
        resolve(true); // API not ready — allow by default
        return;
      }

      const action = typeof input.action === 'string' ? input.action : 'apply';
      const changeAction: 'create' | 'modify' | 'destroy' | 'replace' =
        action.includes('destroy') || action.includes('delete') ? 'destroy' : 'modify';

      const preview: DeployPreviewData = {
        tool,
        changes: [
          {
            action: changeAction,
            resourceType: tool,
            resourceName: typeof input.command === 'string' ? input.command : action,
            details: typeof input.args === 'string' ? input.args : undefined,
          },
        ],
      };

      api.requestDeployPreview(preview, decision => {
        resolve(decision === 'approve');
      });
    });
  }

  /**
   * Handle a user message: run the agent loop and stream results back
   * into the TUI.
   */
  // Track the timestamp of each turn so watcher can report changes since last turn
  let lastTurnTimestamp = Date.now();
  // M2: Track user message count for first-message session rename
  let userMessageCount = 0;

  /**
   * GAP-20: Parse the ## Tool Timeouts section from NIMBUS.md.
   * Each line has the format: tool_name: milliseconds
   * Returns a Record<string, number> for passing to runAgentLoop as toolTimeouts.
   */
  function parseToolTimeouts(nimbusMd: string): Record<string, number> {
    const result: Record<string, number> = {};
    const match = nimbusMd.match(/##\s+Tool Timeouts\s*\n([\s\S]*?)(?=##|$)/);
    if (!match) return result;
    for (const line of match[1].split('\n')) {
      const m = line.match(/^\s*([a-z_]+)\s*:\s*(\d+)\s*$/);
      if (m) result[m[1]] = parseInt(m[2], 10);
    }
    return result;
  }

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
    // Track diff request index within this turn for progress display
    let diffRequestIndex = 0;

    // M2: Auto-rename session from first user message (semantic name)
    userMessageCount++;
    if (userMessageCount === 1 && sessionManager && sessionId) {
      try {
        const semanticName = text.slice(0, 40).replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-+|-+$/g, '');
        if (semanticName) sessionManager.rename(sessionId, semanticName);
      } catch { /* non-critical */ }
    }

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
        infraContext: currentInfraContext,
        signal: abortController.signal,
        contextManager,
        snapshotManager,
        lspManager,
        hookEngine,
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
            startTime: info.startTime ?? Date.now(),
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

          // G6: Surface LSP diagnostics as visible TUI system messages
          if (!toolResult.isError && typeof toolResult.output === 'string'
              && toolResult.output.includes('LSP Diagnostics:')) {
            const diagMatch = toolResult.output.match(/LSP Diagnostics:([\s\S]+?)(?:\n\n|$)/);
            if (diagMatch) {
              addMessage({
                id: crypto.randomUUID(),
                role: 'system',
                content: `⚠ LSP: ${diagMatch[1].trim()}`,
                timestamp: new Date(),
              });
            }
          }
        },
        onToolOutputChunk: (toolId: string, chunk: string) => {
          // Gap 1: stream live output into the running tool call's streamingOutput field
          const existing = activeToolCalls.get(toolId);
          if (existing) {
            existing.streamingOutput = (existing.streamingOutput ?? '') + chunk;
            setToolCalls([...activeToolCalls.values()]);
          }
        },
        onUsage: (usage, costUSD) => {
          // Update the TUI in real-time after each LLM turn
          updateSession({
            tokenCount: usage.totalTokens,
            costUSD,
          });

          // Context window warning at 70% (H5)
          // Use 200k as a reasonable default context window size
          const CTX_MAX = 200_000;
          if (!contextWarningShown && usage.totalTokens > 0) {
            const ratio = usage.totalTokens / CTX_MAX;
            if (ratio >= 0.70) {
              contextWarningShown = true;
              addMessage({
                id: crypto.randomUUID(),
                role: 'system',
                content: `⚠ Context window at ${Math.round(ratio * 100)}% — consider /compact [focus] to preserve the most important context before it auto-compacts at 85%.`,
                timestamp: new Date(),
              });
            }
          }

          // Track per-turn cost delta for /cost command
          const turnCost = costUSD - previousTotalCost;
          if (turnCost > 0) {
            currentTurn++;
            turnCostLog.push({
              turn: currentTurn,
              costUSD: turnCost,
              tokens: usage.totalTokens,
            });
            previousTotalCost = costUSD;
          }
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
          const toolInput =
            input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
          // In deploy mode, show a preview confirmation before infra-mutating tools
          if (currentMode === 'deploy' && requiresDeployPreview(tool.name, toolInput)) {
            const approved = await promptDeployPreview(tool.name, toolInput);
            if (!approved) {
              return 'deny';
            }
          }

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
        requestFileDiff: (path: string, toolName: string, diff: string): Promise<FileDiffDecision> =>
          new Promise(resolve => {
            if (!api) {
              resolve('apply');
              return;
            }
            diffRequestIndex++;
            api.requestFileDiff(path, toolName, diff, resolve, diffRequestIndex);
          }),
        // GAP-20: Pass per-tool timeouts parsed from NIMBUS.md
        toolTimeouts: nimbusInstructions ? parseToolTimeouts(nimbusInstructions) : undefined,
      });

      // Clear active tool calls now that the turn is complete
      activeToolCalls.clear();
      setToolCalls([]);

      // Update history with the full conversation from this turn
      history = result.messages;

      // Persist conversation + stats to SQLite atomically
      if (sessionManager && sessionId) {
        try {
          sessionManager.saveConversationAndStats(sessionId, history, {
            tokenCount: result.usage.totalTokens,
            costUSD: result.totalCost,
          });
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

      // (Session stats already persisted atomically above with saveConversationAndStats)
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

  // -------------------------------------------------------------------------
  // A5: Per-turn cost log for /cost command
  // -------------------------------------------------------------------------
  const turnCostLog: Array<{ turn: number; costUSD: number; tokens: number }> = [];
  let previousTotalCost = 0;
  let currentTurn = 0;

  /**
   * Handle /diff command — show unstaged git diff.
   */
  const onDiff: OnDiffCallback = async (): Promise<string> => {
    const { spawnSync } = await import('node:child_process');
    const stat = spawnSync('git', ['diff', '--stat'], { encoding: 'utf-8', cwd: process.cwd() });
    const full = spawnSync('git', ['diff'], { encoding: 'utf-8', cwd: process.cwd() });
    const statOut = stat.stdout?.trim() ?? '';
    const fullOut = full.stdout?.trim() ?? '';
    if (!statOut && !fullOut) return 'No unstaged changes.';
    return [statOut, fullOut].filter(Boolean).join('\n\n');
  };

  /**
   * Handle /cost command — show per-turn cost breakdown.
   */
  const onCost: OnCostCallback = (): string => {
    if (turnCostLog.length === 0) return 'No turns yet.';
    const rows = turnCostLog.map(
      t => `  Turn ${t.turn}   ${t.tokens.toLocaleString()} tokens   $${t.costUSD.toFixed(4)}`
    );
    const total = turnCostLog.reduce((s, t) => s + t.costUSD, 0);
    const totalTok = turnCostLog.reduce((s, t) => s + t.tokens, 0);
    return [
      'Cost breakdown:',
      ...rows,
      `  ${'─'.repeat(40)}`,
      `  Total   ${totalTok.toLocaleString()} tokens   $${total.toFixed(4)}`,
    ].join('\n');
  };

  /**
   * Handle /init command — regenerate NIMBUS.md from inside the TUI.
   */
  const onInit: OnInitCallback = async (): Promise<string> => {
    const { runInit } = await import('../../cli/init');
    const result = await runInit({ cwd: process.cwd(), quiet: false });
    if (result.nimbusmdPath && existsSync(result.nimbusmdPath)) {
      nimbusInstructions = readFileSync(result.nimbusmdPath, 'utf-8');
      return `NIMBUS.md generated at ${result.nimbusmdPath}. Context updated.`;
    }
    return 'Init complete (no NIMBUS.md generated).';
  };

  /**
   * Handle /export [filename] — serialize conversation to a runbook markdown file. G16
   */
  const onExport: import('../App').OnExportCallback = async (filename?: string): Promise<string> => {
    const { join } = await import('node:path');
    const { writeFileSync } = await import('node:fs');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const targetFile = filename ?? join(process.cwd(), `nimbus-session-${timestamp}.md`);

    const lines: string[] = [
      `# Nimbus Session Export`,
      `Session: ${sessionId ?? 'unknown'} | Mode: ${currentMode} | Date: ${new Date().toISOString()}`,
      '',
      '## Conversation',
      '',
    ];

    for (const msg of history) {
      const role = msg.role === 'user' ? '**User**' : '**Agent**';
      const contentStr = Array.isArray(msg.content)
        ? msg.content.map((b: unknown) => (typeof b === 'object' && b !== null && 'text' in b ? (b as {text: string}).text : '')).join('')
        : String(msg.content ?? '');
      lines.push(`${role}: ${contentStr}`);
      lines.push('');
    }

    writeFileSync(targetFile, lines.join('\n'), 'utf-8');
    return targetFile;
  };

  /**
   * Handle /remember <fact> — append fact to NIMBUS.md Agent Memory. G17
   */
  const onRemember: import('../App').OnRememberCallback = async (fact: string): Promise<void> => {
    // Find the NIMBUS.md path in use
    const nimbusMdPath = nimbusMdPaths.find(p => {
      try { return existsSync(p); } catch { return false; }
    }) ?? nimbusMdPaths[0];

    let content = '';
    try {
      if (existsSync(nimbusMdPath)) {
        content = readFileSync(nimbusMdPath, 'utf-8');
      }
    } catch { /* will create new */ }

    const MEMORY_SECTION = '## Agent Memory';
    if (content.includes(MEMORY_SECTION)) {
      // Append to existing section
      content = content.replace(
        new RegExp(`(${MEMORY_SECTION}[\\s\\S]*?)(?=\\n##|$)`),
        `$1\n- ${fact}`
      );
    } else {
      content += `\n${MEMORY_SECTION}\n\n- ${fact}\n`;
    }

    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { dirname } = await import('node:path');
    mkdirSync(dirname(nimbusMdPath), { recursive: true });
    writeFileSync(nimbusMdPath, content, 'utf-8');
    // Reload instructions
    nimbusInstructions = content;
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
      // L9: include token and cost summary
      let totalTokens = 0;
      let totalCost = 0;
      const mapped: SessionSummary[] = sessions.map(s => {
        const tokens = (s as unknown as Record<string, unknown>).tokenCount as number | undefined ?? 0;
        const cost = (s as unknown as Record<string, unknown>).costUSD as number | undefined ?? 0;
        totalTokens += tokens;
        totalCost += cost;
        return {
          id: s.id,
          name: s.name ?? `session-${s.id.slice(0, 8)}`,
          model: s.model ?? 'default',
          mode: (s.mode ?? 'build') as string,
          updatedAt: s.updatedAt ?? new Date().toISOString(),
          tokenCount: tokens,
          costUSD: cost,
        };
      });
      // Append a total row as a synthetic session entry
      if (mapped.length > 0) {
        mapped.push({
          id: '__total__',
          name: `Total (${mapped.length} sessions)`,
          model: '',
          mode: '',
          updatedAt: '',
          tokenCount: totalTokens,
          costUSD: totalCost,
        });
      }
      return mapped;
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
  const restoredMessages: UIMessage[] = history
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      id: crypto.randomUUID(),
      role: m.role as 'user' | 'assistant',
      content: getTextContent(m.content),
      timestamp: new Date(),
    }));

  // Show a welcome message on fresh sessions (no prior history)
  const isNewSession = restoredMessages.length === 0;
  // L4: Check for prior sessions to show resume hint
  let priorSessionCount = 0;
  try {
    if (sessionManager) {
      const allSessions = sessionManager.list();
      priorSessionCount = allSessions.filter(s => s.id !== sessionId).length;
    }
  } catch { /* non-critical */ }
  const welcomeMessage: UIMessage | null = isNewSession
    ? (() => {
        // G10: DevOps-context-aware welcome message
        const infraLines: string[] = [];
        if (currentInfraContext?.kubectlContext) {
          infraLines.push(`  Kubernetes: ${currentInfraContext.kubectlContext}`);
        }
        if (currentInfraContext?.terraformWorkspace) {
          infraLines.push(`  Terraform:  workspace=${currentInfraContext.terraformWorkspace}`);
        }
        if (currentInfraContext?.awsAccount) {
          infraLines.push(`  AWS:        ${currentInfraContext.awsAccount}${currentInfraContext.awsRegion ? ` / ${currentInfraContext.awsRegion}` : ''}`);
        }
        if (currentInfraContext?.gcpProject) {
          infraLines.push(`  GCP:        ${currentInfraContext.gcpProject}`);
        }

        // GAP-17: context-aware suggestions based on detected infrastructure
        const suggestions: string[] = [];
        if (currentInfraContext?.terraformWorkspace) suggestions.push(`"check for drift in workspace ${currentInfraContext.terraformWorkspace}"`);
        if (currentInfraContext?.kubectlContext) suggestions.push(`"show all pods in ${currentInfraContext.kubectlContext}"`);
        if (currentInfraContext?.awsAccount) suggestions.push(`"show AWS costs for this month"`);
        if ((currentInfraContext?.helmReleases?.length ?? 0) > 0) suggestions.push(`"show helm release history for ${currentInfraContext!.helmReleases![0]}"`);

        // H5: Build one-line infra hint for cold start
        const infraHintParts: string[] = [];
        if (currentInfraContext?.terraformWorkspace) infraHintParts.push(`tf:${currentInfraContext.terraformWorkspace}`);
        if (currentInfraContext?.kubectlContext) infraHintParts.push(`k8s:${currentInfraContext.kubectlContext}`);
        if (currentInfraContext?.awsAccount) infraHintParts.push(`aws:${currentInfraContext.awsAccount}`);
        if (currentInfraContext?.gcpProject) infraHintParts.push(`gcp:${currentInfraContext.gcpProject}`);
        if ((currentInfraContext?.helmReleases?.length ?? 0) > 0) infraHintParts.push(`${currentInfraContext!.helmReleases!.length} helm release${currentInfraContext!.helmReleases!.length > 1 ? 's' : ''}`);
        const infraHintLine = infraHintParts.length > 0 ? `Infra detected: ${infraHintParts.join(' | ')}` : '';

        // G24: DevOps-specific quick-start examples
        // M3: When no NIMBUS.md, show concrete DevOps prompt examples to reduce blank-prompt friction
        const noNimbusHints = !nimbusInstructions ? [
          '',
          'Try asking:',
          '  "list my kubernetes pods in the staging namespace"',
          '  "run terraform plan in ./infrastructure"',
          '  "show me the helm releases and their status"',
          '  "check for infrastructure drift"',
        ] : [];
        const content = [
          'Welcome to Nimbus — Your AI DevOps Operator.',
          ...(infraHintLine ? ['', infraHintLine] : []),
          '',
          ...(infraLines.length > 0 ? ['Detected infrastructure:', ...infraLines, ''] : []),
          ...(suggestions.length > 0 ? ['', 'Suggested:', ...suggestions.map(s => `  • ${s}`)] : []),
          ...noNimbusHints,
          '',
          'Mode: PLAN (read-only). Tab → build → deploy to escalate.',
          '',
          'Quick-start examples:',
          '  "Show me all failing pods across all namespaces"',
          '  "What terraform changes are pending in the staging workspace?"',
          '  "Check for infrastructure drift between actual and desired state"',
          '  "Summarize last 24 hours of production incidents in PagerDuty"',
          '',
          '/k8s-ctx — switch cluster   /tf-ws — switch workspace',
          '/help    — all commands     Tab    — cycle modes',
          '',
          nimbusInstructions
            ? 'NIMBUS.md loaded — project context active.'
            : 'Tip: run `nimbus init` to generate a NIMBUS.md with your infra context.',
          // L4: Session resume hint
          ...(priorSessionCount > 0
            ? ['', 'Previous session available — type /sessions to resume or /new to start fresh.']
            : []),
        ].join('\n');

        return {
          id: crypto.randomUUID(),
          role: 'system' as const,
          content,
          timestamp: new Date(),
        };
      })()
    : null;

  // Gap 19: append any startup warnings as a system message
  const startupWarningMessages: UIMessage[] = _startupWarnings.length > 0
    ? [{
        id: crypto.randomUUID(),
        role: 'system' as const,
        content: `Startup warnings:\n${_startupWarnings.map(w => `  ⚠ ${w}`).join('\n')}`,
        timestamp: new Date(),
      }]
    : [];

  // G4: Proactive NIMBUS.md banner when auto-init failed to create one
  const nimbusMdBannerMessage: UIMessage | null = showNimbusMdBanner ? {
    id: crypto.randomUUID(),
    role: 'system' as const,
    content: [
      '**No NIMBUS.md found in this directory.**',
      '',
      'Type `/init` to auto-generate project context — I\'ll detect your Terraform workspaces,',
      'Kubernetes clusters, AWS accounts, and more.',
      '',
      'Or ask me anything directly. I work best with project context loaded.',
    ].join('\n'),
    timestamp: new Date(),
  } : null;

  const initialMessages: UIMessage[] = [
    ...(welcomeMessage ? [welcomeMessage] : []),
    ...(nimbusMdBannerMessage ? [nimbusMdBannerMessage] : []),
    ...(resumeContextMessage ? [resumeContextMessage] : []),
    ...startupWarningMessages,
    ...restoredMessages,
  ];

  // Build props for the App component
  const appProps: AppProps = {
    initialSession: {
      model: options.model ?? 'default',
      mode: currentMode,
      kubectlContext: currentInfraContext?.kubectlContext,
      terraformWorkspace: currentInfraContext?.terraformWorkspace,
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
    onDiff,
    onCost,
    onInit,
    onExport,
    onRemember,
    onSessions,
    onNewSession,
    onSwitchSession,
    onFetchCompletions: async (prefix: string): Promise<string[]> => {
      // H3: Fetch dynamic completions for slash command arguments (cached 30s in InputBox)
      try {
        const { execFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execFileAsync = promisify(execFile);

        if (prefix.startsWith('/k8s-ctx ')) {
          const { stdout } = await execFileAsync('kubectl', ['config', 'get-contexts', '-o', 'name'], { timeout: 5000 });
          return stdout.trim().split('\n').filter(Boolean);
        }
        if (prefix.startsWith('/tf-ws ')) {
          const { stdout } = await execFileAsync('terraform', ['workspace', 'list'], { timeout: 10000, cwd: process.cwd() });
          return stdout.trim().split('\n').map(l => l.replace(/^\*?\s+/, '')).filter(Boolean);
        }
        if (prefix.startsWith('/model ')) {
          const modelsMap = await ctx.router.getAvailableModels();
          return Object.values(modelsMap).flat();
        }
        if (prefix.startsWith('/profile ')) {
          const { listProfiles } = await import('../../config/profiles');
          return listProfiles();
        }
      } catch { /* non-critical */ }
      return [];
    },
    onReady: imperativeApi => {
      api = imperativeApi;
      // GAP-2: Fire background LLM connectivity check after API is ready
      api.setLLMHealth('checking');
      (async () => {
        try {
          const providers = await ctx.router.getAvailableProviders();
          if (providers.length > 0) {
            api!.setLLMHealth('ok');
          } else {
            api!.setLLMHealth('error');
          }
        } catch {
          api!.setLLMHealth('error');
        }
      })();
      // Fix 5: Subscribe to background update check — show badge in StatusBar
      (async () => {
        try {
          const { onUpdate } = await import('../../update-state');
          onUpdate(version => {
            updateSession({ updateAvailable: version });
          });
        } catch { /* non-critical */ }
      })();
    },
  };

  // Render the Ink application wrapped in an error boundary
  const inkInstance = render(
    React.createElement(AppErrorBoundary, null, React.createElement(App, { ...appProps, columns: process.stdout.columns ?? 80 }))
  );
  const { waitUntilExit } = inkInstance;

  // C1: Re-render on terminal resize so Ink layout reflows correctly
  const handleResize = () => {
    try {
      inkInstance.rerender(
        React.createElement(AppErrorBoundary, null, React.createElement(App, { ...appProps, columns: process.stdout.columns ?? 80 }))
      );
    } catch { /* non-critical */ }
  };
  process.stdout.on('resize', handleResize);
  process.on('SIGWINCH', handleResize);

  // Gap 16: Periodic cloud auth status check every 15 minutes
  const authCheckInterval = setInterval(async () => {
    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);
      const expired: string[] = [];

      // Check AWS
      try {
        await execFileAsync('aws', ['sts', 'get-caller-identity'], { timeout: 5000 });
      } catch {
        expired.push('AWS');
      }

      if (expired.length > 0) {
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          content: `Cloud credentials may have expired: ${expired.join(', ')}. Run /auth-refresh to renew.`,
          timestamp: new Date(),
        });
      }
    } catch { /* non-critical */ }
  }, 15 * 60 * 1000);

  // When the TUI exits, clean up watcher, LSP servers, and mark session as completed
  process.on('exit', () => {
    clearInterval(authCheckInterval);
    watcher.stop();
    lspManager.stopAll();
    if (sessionManager && sessionId) {
      try {
        sessionManager.complete(sessionId);
      } catch {
        /* ignore */
      }
    }
    // H1: Persist final infra context on exit so next session starts with it
    if (currentInfraContext) {
      try {
        writeFileSync(infraStatePath, JSON.stringify(currentInfraContext, null, 2), 'utf-8');
      } catch { /* non-critical */ }
    }
  });

  // Keep the process alive until the user exits (Ctrl+C twice, or exit())
  await waitUntilExit();

  // A7: Session saved hint on exit
  if (sessionId && process.stderr.isTTY) {
    process.stderr.write('\n\x1b[2mSession saved. Resume with: nimbus chat --continue\x1b[0m\n');
  }
}
