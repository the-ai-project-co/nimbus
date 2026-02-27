/**
 * Core Agentic Loop
 *
 * Implements the autonomous agent loop:
 * 1. Build context (system prompt + history + tools)
 * 2. Send to LLM with tools enabled
 * 3. Stream text response
 * 4. If tool_use: check permissions → execute → collect results
 * 5. Append messages → loop back to LLM
 * 6. Exit when LLM returns end_turn (no more tool calls)
 *
 * This is the heart of the Nimbus agent. Every user message enters
 * {@link runAgentLoop}, which orchestrates a multi-turn conversation with
 * the LLM, executing tools on its behalf until it signals completion by
 * returning a response with no further tool calls.
 *
 * @module agent/loop
 */

import type { LLMRouter } from '../llm/router';
import type {
  LLMMessage,
  ToolCall,
  ToolCompletionRequest,
  ToolDefinition as LLMToolDefinition,
} from '../llm/types';
import {
  toOpenAITool,
  type ToolDefinition,
  type ToolResult,
  type ToolRegistry,
} from '../tools/schemas/types';
import { buildSystemPrompt, type AgentMode } from './system-prompt';
import type { ContextManager, CompactionResult } from './context-manager';
import { runCompaction } from './compaction-agent';
import type { LSPManager } from '../lsp/manager';
import { SnapshotManager } from '../snapshots/manager';
import { calculateCost } from '../llm/cost-calculator';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

/** Options for running the agent loop. */
export interface AgentLoopOptions {
  /** The LLM router instance. */
  router: LLMRouter;

  /** Tool registry with available tools. */
  toolRegistry: ToolRegistry;

  /** Agent mode (plan/build/deploy). */
  mode: AgentMode;

  /** Maximum number of LLM turns before stopping (default: 50). */
  maxTurns?: number;

  /** Model to use (e.g. `'anthropic/claude-sonnet-4-20250514'`). */
  model?: string;

  /** Current working directory. */
  cwd?: string;

  /** Custom NIMBUS.md content injected into the system prompt. */
  nimbusInstructions?: string;

  /** Callback for streaming text output. */
  onText?: (text: string) => void;

  /** Callback when a tool call starts. */
  onToolCallStart?: (toolCall: ToolCallInfo) => void;

  /** Callback when a tool call completes. */
  onToolCallEnd?: (toolCall: ToolCallInfo, result: ToolResult) => void;

  /**
   * Callback to check permission before tool execution.
   * If omitted, all tools are executed without prompting.
   */
  checkPermission?: (tool: ToolDefinition, input: unknown) => Promise<PermissionDecision>;

  /** AbortSignal for cancellation (Ctrl+C). */
  signal?: AbortSignal;

  /** Session ID for persistence (reserved for future use). */
  sessionId?: string;

  /** Optional context manager for auto-compact. When provided, the loop
   *  checks context usage after each tool-call turn and triggers
   *  compaction if the threshold is exceeded. */
  contextManager?: ContextManager;

  /** Callback fired when auto-compact is triggered. Receives the
   *  compaction result with token savings information. */
  onCompact?: (result: CompactionResult) => void;

  /** Optional LSP manager for post-edit diagnostics. When provided,
   *  the loop queries the language server after file-editing tools
   *  and appends any diagnostics to the tool result so the LLM can
   *  self-correct type errors and other issues. */
  lspManager?: LSPManager;

  /** Optional snapshot manager for auto-capture before file-editing tools.
   *  When provided, a snapshot is captured before each file-modifying tool
   *  call so users can undo/redo changes. */
  snapshotManager?: SnapshotManager;

  /** Callback fired after each LLM turn with accumulated usage and cost.
   *  Allows the TUI to update cost/token display in real-time during
   *  multi-turn agent loops, not just at the end. */
  onUsage?: (usage: AgentLoopUsage, costUSD: number) => void;
}

/** Information about a tool call in progress. */
export interface ToolCallInfo {
  /** Provider-assigned unique ID for this tool call. */
  id: string;

  /** Tool name as it appears in the registry. */
  name: string;

  /** Parsed input arguments. */
  input: unknown;
}

/**
 * Result of a permission check.
 *
 * - `allow` -- proceed with execution.
 * - `deny`  -- skip this invocation and report denial to the LLM.
 * - `block` -- skip and report that the tool is permanently blocked.
 */
export type PermissionDecision = 'allow' | 'deny' | 'block';

/** Aggregate token usage across all LLM turns. */
export interface AgentLoopUsage {
  /** Total prompt (input) tokens consumed. */
  promptTokens: number;

  /** Total completion (output) tokens consumed. */
  completionTokens: number;

  /** Sum of prompt + completion tokens. */
  totalTokens: number;
}

/** Result of running the agent loop. */
export interface AgentLoopResult {
  /** The conversation messages after the loop completes. */
  messages: LLMMessage[];

  /** Number of LLM turns taken. */
  turns: number;

  /** Whether the loop was interrupted via the AbortSignal. */
  interrupted: boolean;

  /** Total token usage across all turns. */
  usage: AgentLoopUsage;

  /** Total estimated cost in USD. */
  totalCost: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default model when none is specified. */
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-20250514';

/** Default max output tokens per LLM call. */
const DEFAULT_MAX_TOKENS = 8192;

/** Default maximum number of agent turns. */
const DEFAULT_MAX_TURNS = 50;

/** Maximum characters of tool output to include in conversation history.
 *  Anything beyond this is truncated to prevent context window overflow. */
const MAX_TOOL_OUTPUT_CHARS = 100_000;

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Run the agentic loop.
 *
 * Takes a user message and existing conversation history, then runs
 * the LLM in a loop until it stops requesting tool calls.
 *
 * The loop terminates when any of the following conditions are met:
 * - The LLM returns a response with no tool calls (natural end).
 * - The maximum number of turns is reached.
 * - The AbortSignal fires (e.g. user presses Ctrl+C).
 * - An unrecoverable LLM API error occurs.
 *
 * @param userMessage - The new user message to process.
 * @param history - Prior conversation messages (may be empty for a fresh session).
 * @param options - Configuration for the loop.
 * @returns The final conversation state, turn count, usage, and cost.
 */
export async function runAgentLoop(
  userMessage: string,
  history: LLMMessage[],
  options: AgentLoopOptions
): Promise<AgentLoopResult> {
  const {
    router,
    toolRegistry,
    mode,
    maxTurns = DEFAULT_MAX_TURNS,
    model,
    cwd,
    nimbusInstructions,
    onText,
    onToolCallStart,
    onToolCallEnd,
    checkPermission,
    signal,
  } = options;

  // -----------------------------------------------------------------------
  // 1. Prepare tools and system prompt
  // -----------------------------------------------------------------------

  const tools = getToolsForMode(toolRegistry.getAll(), mode);

  const systemPrompt = buildSystemPrompt({
    mode,
    tools,
    nimbusInstructions,
    cwd,
  });

  // Convert agentic ToolDefinitions to the LLM-level format expected by
  // the router's routeWithTools() method (OpenAI function-calling shape).
  const llmTools: LLMToolDefinition[] = tools.map(toOpenAITool);

  // -----------------------------------------------------------------------
  // 2. Initialize conversation state
  // -----------------------------------------------------------------------

  const messages: LLMMessage[] = [...history, { role: 'user', content: userMessage }];

  let turns = 0;
  let interrupted = false;
  const totalUsage: AgentLoopUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
  let totalCost = 0;

  // -----------------------------------------------------------------------
  // 3. Main agent loop
  // -----------------------------------------------------------------------

  while (turns < maxTurns) {
    // Check for cancellation before each turn
    if (signal?.aborted) {
      interrupted = true;
      break;
    }

    turns++;

    try {
      // Build the completion request with tool definitions
      const request: ToolCompletionRequest = {
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        model: model ?? DEFAULT_MODEL,
        tools: llmTools,
        maxTokens: DEFAULT_MAX_TOKENS,
      };

      // Stream text tokens incrementally via routeStreamWithTools.
      // Tokens are forwarded to onText as they arrive; tool calls
      // are accumulated from the final chunk.
      let responseContent = '';
      let responseToolCalls: ToolCall[] | undefined;
      let responseUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      for await (const chunk of router.routeStreamWithTools(request)) {
        if (chunk.content) {
          responseContent += chunk.content;
          if (onText) {
            onText(chunk.content);
          }
        }
        if (chunk.toolCallStart && onText) {
          // Show early feedback when the LLM starts composing a tool call
          onText(`\n[Preparing tool: ${chunk.toolCallStart.name}...]\n`);
        }
        if (chunk.toolCalls) {
          responseToolCalls = chunk.toolCalls;
        }
        if (chunk.usage) {
          responseUsage = chunk.usage;
        }
      }

      // Accumulate usage and cost
      totalUsage.promptTokens += responseUsage.promptTokens;
      totalUsage.completionTokens += responseUsage.completionTokens;
      totalUsage.totalTokens += responseUsage.totalTokens;

      // Estimate cost for this turn
      const resolvedModel = model ?? DEFAULT_MODEL;
      const providerName = resolvedModel.includes('/') ? resolvedModel.split('/')[0] : 'anthropic';
      const modelName = resolvedModel.includes('/')
        ? resolvedModel.split('/').slice(1).join('/')
        : resolvedModel;
      const turnCost = calculateCost(
        providerName,
        modelName,
        responseUsage.promptTokens,
        responseUsage.completionTokens
      );
      totalCost += turnCost.costUSD;

      // Notify caller of accumulated usage/cost after each turn
      if (options.onUsage) {
        options.onUsage(totalUsage, totalCost);
      }

      // -----------------------------------------------------------------
      // No tool calls → the LLM is done
      // -----------------------------------------------------------------
      if (!responseToolCalls || responseToolCalls.length === 0) {
        messages.push({
          role: 'assistant',
          content: responseContent,
        });
        break;
      }

      // -----------------------------------------------------------------
      // Tool calls present → execute each one
      // -----------------------------------------------------------------

      // Append the assistant message that contains the tool calls
      messages.push({
        role: 'assistant',
        content: responseContent,
        toolCalls: responseToolCalls,
      });

      // Process tool calls sequentially (order may matter for side effects)
      for (const toolCall of responseToolCalls) {
        // Check for cancellation between tool calls
        if (signal?.aborted) {
          interrupted = true;
          break;
        }

        const result = await executeToolCall(
          toolCall,
          toolRegistry,
          onToolCallStart,
          onToolCallEnd,
          checkPermission,
          options.lspManager,
          options.snapshotManager,
          options.sessionId,
          signal
        );

        // Append each tool result as a separate message so the LLM can
        // match it to the corresponding tool_use block by toolCallId.
        let toolContent = result.isError ? `Error: ${result.error}` : result.output;

        // Truncate excessively large tool outputs to prevent context overflow
        if (toolContent.length > MAX_TOOL_OUTPUT_CHARS) {
          const truncatedLength = toolContent.length;
          toolContent = `${toolContent.slice(0, MAX_TOOL_OUTPUT_CHARS)}\n\n... [Output truncated: ${truncatedLength.toLocaleString()} chars total, showing first ${MAX_TOOL_OUTPUT_CHARS.toLocaleString()}]`;
        }

        messages.push({
          role: 'tool',
          toolCallId: toolCall.id,
          name: toolCall.function.name,
          content: toolContent,
        });
      }

      // If we broke out of the tool-call loop due to cancellation, exit
      // the main loop as well.
      if (interrupted) {
        break;
      }

      // -----------------------------------------------------------------
      // Auto-compact check
      // -----------------------------------------------------------------
      // After tool results are appended, check whether the conversation
      // has grown past the context window threshold. If so, summarize
      // older messages to free up space for future turns.
      if (options.contextManager) {
        const toolTokens = llmTools.reduce(
          (sum, t) => sum + Math.ceil(JSON.stringify(t).length / 4),
          0
        );
        if (options.contextManager.shouldCompact(systemPrompt, messages, toolTokens)) {
          try {
            const compactResult = await runCompaction(messages, options.contextManager, { router });
            // Replace messages with the compacted version
            messages.length = 0;
            messages.push(...compactResult.messages);
            if (options.onCompact) {
              options.onCompact(compactResult.result);
            }
          } catch (compactErr) {
            // Compaction failed — notify user visibly and continue with original messages
            const compactErrMsg =
              compactErr instanceof Error ? compactErr.message : String(compactErr);
            if (onText) {
              onText(
                `\n[Warning: Auto-compaction failed: ${compactErrMsg}. Context may exceed budget on the next turn.]\n`
              );
            }
          }
        }
      }
    } catch (error: unknown) {
      // LLM API error — report to the caller and break
      const msg = error instanceof Error ? error.message : String(error);
      if (onText) {
        onText(`\n[Error: ${msg}]\n`);
      }
      messages.push({
        role: 'assistant',
        content: `I encountered an error: ${msg}`,
      });
      break;
    }
  }

  // -----------------------------------------------------------------------
  // 4. Post-loop bookkeeping
  // -----------------------------------------------------------------------

  if (turns >= maxTurns && !interrupted) {
    if (onText) {
      onText(`\n[Agent reached maximum turns limit (${maxTurns}). Stopping.]\n`);
    }
  }

  return {
    messages,
    turns,
    interrupted,
    usage: totalUsage,
    totalCost,
  };
}

// ---------------------------------------------------------------------------
// Tool Execution
// ---------------------------------------------------------------------------

/** Tools that modify files and should trigger LSP diagnostics. */
const FILE_EDITING_TOOLS = new Set(['edit_file', 'multi_edit', 'write_file']);

/**
 * Extract the file path from a tool call's parsed arguments.
 *
 * File-editing tools all have a `path` parameter that identifies
 * the target file. Returns `null` for non-file tools.
 */
function extractFilePath(toolName: string, input: unknown): string | null {
  if (!FILE_EDITING_TOOLS.has(toolName)) {
    return null;
  }
  if (input && typeof input === 'object' && 'path' in input) {
    return (input as { path: string }).path;
  }
  return null;
}

/**
 * Execute a single tool call.
 *
 * Handles:
 * - Looking up the tool in the registry.
 * - Parsing the JSON arguments string from the LLM response.
 * - Validating input against the Zod schema.
 * - Checking permissions via the caller-supplied callback.
 * - Invoking the tool and returning the result.
 * - Notifying start/end callbacks.
 * - Querying the LSP for diagnostics after file edits.
 *
 * @param toolCall - The raw tool call from the LLM response.
 * @param registry - The tool registry to look up the tool definition.
 * @param onStart - Optional callback fired before execution.
 * @param onEnd - Optional callback fired after execution (or error).
 * @param checkPermission - Optional permission gate.
 * @param lspManager - Optional LSP manager for post-edit diagnostics.
 * @returns The tool result (always succeeds; errors are captured inside the result).
 */
async function executeToolCall(
  toolCall: ToolCall,
  registry: ToolRegistry,
  onStart?: (info: ToolCallInfo) => void,
  onEnd?: (info: ToolCallInfo, result: ToolResult) => void,
  checkPermission?: (tool: ToolDefinition, input: unknown) => Promise<PermissionDecision>,
  lspManager?: LSPManager,
  snapshotManager?: SnapshotManager,
  sessionId?: string,
  signal?: AbortSignal
): Promise<ToolResult> {
  const toolName = toolCall.function.name;

  // Parse the JSON arguments string from the LLM
  let parsedArgs: unknown;
  try {
    parsedArgs = JSON.parse(toolCall.function.arguments);
  } catch {
    const result: ToolResult = {
      output: '',
      error: `Failed to parse tool arguments as JSON for '${toolName}': ${toolCall.function.arguments}`,
      isError: true,
    };
    return result;
  }

  const callInfo: ToolCallInfo = {
    id: toolCall.id,
    name: toolName,
    input: parsedArgs,
  };

  // Look up the tool definition
  const tool = registry.get(toolName);
  if (!tool) {
    const result: ToolResult = {
      output: '',
      error: `Unknown tool: ${toolName}`,
      isError: true,
    };
    if (onEnd) {
      onEnd(callInfo, result);
    }
    return result;
  }

  // Notify start
  if (onStart) {
    onStart(callInfo);
  }

  // Permission check
  if (checkPermission) {
    const decision = await checkPermission(tool, parsedArgs);
    if (decision === 'deny' || decision === 'block') {
      const result: ToolResult = {
        output: '',
        error:
          decision === 'block'
            ? `Tool '${toolName}' is blocked by permission policy.`
            : `User denied permission for tool '${toolName}'.`,
        isError: true,
      };
      if (onEnd) {
        onEnd(callInfo, result);
      }
      return result;
    }
  }

  // Capture snapshot before file-modifying tools for undo/redo support
  if (
    snapshotManager &&
    SnapshotManager.shouldSnapshot(toolName, parsedArgs as Record<string, unknown>)
  ) {
    try {
      await snapshotManager.captureSnapshot({
        sessionId: sessionId || 'default',
        messageId: toolCall.id,
        toolCallId: toolCall.id,
        description: `${toolName}: ${extractFilePath(toolName, parsedArgs) || '(bash command)'}`,
      });
    } catch {
      // Snapshot failure should never block the tool call
    }
  }

  // Validate input against the tool's Zod schema and execute
  let result: ToolResult;
  try {
    const validatedInput = tool.inputSchema.parse(parsedArgs);

    // Thread AbortSignal into bash tool for Ctrl+C child process killing
    if (signal && toolName === 'bash' && validatedInput && typeof validatedInput === 'object') {
      (validatedInput as Record<string, unknown>)._signal = signal;
    }

    result = await tool.execute(validatedInput);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    result = {
      output: '',
      error: `Tool execution failed: ${msg}`,
      isError: true,
    };
  }

  // -----------------------------------------------------------------------
  // LSP diagnostics injection
  // -----------------------------------------------------------------------
  // After a successful file edit, notify the language server and collect
  // any diagnostics (type errors, lint issues). If errors exist they are
  // appended to the tool output so the LLM sees them on its next turn
  // and can self-correct.
  if (lspManager && !result.isError) {
    const filePath = extractFilePath(toolName, parsedArgs);
    if (filePath) {
      try {
        await lspManager.touchFile(filePath);
        const diagnostics = await lspManager.getDiagnostics(filePath);
        if (diagnostics.length > 0) {
          const formatted = lspManager.formatDiagnosticsForAgent(diagnostics);
          if (formatted) {
            result = {
              ...result,
              output: result.output ? `${result.output}\n\n${formatted}` : formatted,
            };
          }
        }
      } catch (lspErr) {
        // LSP errors should never block the agent loop.
        // Append a note to the tool result so the LLM (and user) can see it.
        const lspErrMsg = lspErr instanceof Error ? lspErr.message : String(lspErr);
        result = {
          ...result,
          output: result.output
            ? `${result.output}\n\n[Note: LSP diagnostics unavailable: ${lspErrMsg}]`
            : `[Note: LSP diagnostics unavailable: ${lspErrMsg}]`,
        };
      }
    }
  }

  // Notify end
  if (onEnd) {
    onEnd(callInfo, result);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Mode-Based Tool Filtering
// ---------------------------------------------------------------------------

/**
 * Set of tool names allowed in `plan` mode.
 *
 * Plan mode is strictly read-only: the agent can inspect files, search
 * the codebase, read tasks, estimate costs, and detect drift -- but it
 * cannot write files, run commands, or mutate infrastructure.
 */
const PLAN_MODE_TOOLS = new Set([
  'read_file',
  'glob',
  'grep',
  'list_dir',
  'webfetch',
  'todo_read',
  'todo_write',
  'task',
  'cost_estimate',
  'drift_detect',
  'cloud_discover',
]);

/**
 * Set of tool names blocked in `build` mode.
 *
 * Build mode allows reads and writes (file edits, code generation) but
 * blocks infrastructure-mutating operations that could affect live
 * environments.  The permission engine provides fine-grained control on
 * top of this coarse filter.
 */
const BUILD_MODE_BLOCKED_TOOLS = new Set(['terraform', 'kubectl', 'helm']);

/**
 * Filter tools based on the current agent mode.
 *
 * - **plan**: Only read-only tools + cost/drift analysis.
 * - **build**: All tools except infrastructure mutation commands.
 * - **deploy**: All tools are available.
 *
 * @param allTools - Every tool registered in the system.
 * @param mode - The active agent mode.
 * @returns The subset of tools available in the given mode.
 */
export function getToolsForMode(allTools: ToolDefinition[], mode: AgentMode): ToolDefinition[] {
  switch (mode) {
    case 'plan':
      return allTools.filter(t => PLAN_MODE_TOOLS.has(t.name));

    case 'build':
      return allTools.filter(t => !BUILD_MODE_BLOCKED_TOOLS.has(t.name));

    case 'deploy':
      // All tools available
      return allTools;

    default: {
      // Exhaustive check -- if a new mode is added this becomes a compile
      // error (assuming AgentMode is a union type).
      const _exhaustive: never = mode;
      return allTools;
    }
  }
}
