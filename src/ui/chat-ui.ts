/**
 * Chat UI
 *
 * Interactive readline chat interface with full agentic tool-calling support.
 * Uses runAgentLoop() to give users the same capabilities as the Ink TUI:
 * file editing, bash execution, git operations, etc.
 *
 * This is the fallback UI when Ink TUI is not available (e.g. compiled binary).
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { ui } from '../wizard/ui';
import { AuthStore } from '../auth/store';
import { getAppContext } from '../app';
import type { LLMRouter } from '../llm/router';
import type { LLMMessage } from '../llm/types';
import { runAgentLoop, type AgentLoopResult, type ToolCallInfo } from '../agent/loop';
import { defaultToolRegistry, type ToolResult, type ToolDefinition } from '../tools/schemas/types';
import { SnapshotManager } from '../snapshots/manager';
import { ContextManager } from '../agent/context-manager';
import { SessionManager } from '../sessions/manager';
import {
  createPermissionState,
  checkPermission as checkToolPermission,
  approveForSession,
  approveActionForSession,
  type PermissionSessionState,
} from '../agent/permissions';

/**
 * Simple code block highlighter for terminal display.
 * Wraps fenced code blocks (```...```) with dim formatting.
 */
function highlightCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, match => {
    // Strip the fences and dim the content
    const inner = match.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
    return `\x1b[2m${inner}\x1b[0m`;
  });
}

/** Supported export formats for the /export command */
type ExportFormat = 'json' | 'markdown' | 'text';

export type PersonaTone = 'professional' | 'assistant' | 'expert';

/** Message shape used internally by ChatUI */
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatUIOptions {
  /** LLM model to use */
  model?: string;
  /** Initial system prompt */
  systemPrompt?: string;
  /** Show token count after responses */
  showTokenCount?: boolean;
  /** Welcome message to display */
  welcomeMessage?: string;
  /** Active persona tone */
  persona?: PersonaTone;
  /** Resume a previous session by ID */
  resumeSessionId?: string;
}

/**
 * Summarize tool input for compact terminal display.
 */
function summarizeToolInput(toolName: string, input: unknown): string {
  if (!input || typeof input !== 'object') {
    return '';
  }
  const obj = input as Record<string, unknown>;

  switch (toolName) {
    case 'read_file':
    case 'write_file':
    case 'edit_file':
      return obj.path ? String(obj.path) : '';
    case 'multi_edit':
      return obj.path ? String(obj.path) : '';
    case 'bash':
      return obj.command ? String(obj.command).substring(0, 80) : '';
    case 'glob':
      return obj.pattern ? String(obj.pattern) : '';
    case 'grep':
      return obj.pattern ? `"${String(obj.pattern)}"` : '';
    case 'list_dir':
      return obj.path ? String(obj.path) : '.';
    case 'git':
      return obj.action ? `${obj.action}${obj.args ? ` ${obj.args}` : ''}` : '';
    case 'terraform':
    case 'kubectl':
    case 'helm':
      return obj.action ? String(obj.action) : '';
    default:
      return '';
  }
}

/**
 * ChatUI provides an interactive terminal chat interface
 * with full agentic tool-calling capabilities via runAgentLoop().
 */
export class ChatUI {
  private options: ChatUIOptions;
  private router: LLMRouter;
  private snapshotManager: SnapshotManager;
  private contextManager: ContextManager;
  private sessionManager: SessionManager | null = null;
  private sessionId: string | null = null;
  private history: ChatMessage[] = [];
  /** Conversation history in LLMMessage format for the agent loop. */
  private agentHistory: LLMMessage[] = [];
  private rl: readline.Interface | null = null;
  private isProcessing: boolean = false;
  private verboseOutput: boolean = false;
  private abortController: AbortController = new AbortController();
  private permissionState: PermissionSessionState = createPermissionState();
  private currentMode: 'plan' | 'build' | 'deploy' = 'build';

  constructor(options: ChatUIOptions = {}) {
    this.options = options;

    // Get the in-process LLM router from the app context
    const ctx = getAppContext();
    if (!ctx) {
      throw new Error('App not initialised. Call initApp() before starting chat.');
    }
    this.router = ctx.router;
    this.snapshotManager = new SnapshotManager({ projectDir: process.cwd() });
    this.contextManager = new ContextManager();

    // Create a session for conversation persistence
    try {
      this.sessionManager = SessionManager.getInstance();
      const session = this.sessionManager.create({
        name: `chat-${new Date().toISOString().slice(0, 16)}`,
        mode: this.currentMode,
        model: options.model,
        cwd: process.cwd(),
      });
      this.sessionId = session.id;
    } catch {
      // Session persistence is non-critical
    }

    // Add system prompt to history if provided
    if (options.systemPrompt) {
      this.history.push({
        role: 'system',
        content: options.systemPrompt,
      });
    }
  }

  /**
   * Start the interactive chat session
   */
  async start(): Promise<void> {
    // Display header
    this.displayHeader();

    // Create readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // Handle line input
    this.rl.on('line', async input => {
      await this.handleInput(input.trim());
    });

    // Handle close
    this.rl.on('close', () => {
      this.exit();
    });

    // Display prompt
    this.displayPrompt();
  }

  private displayHeader(): void {
    const authStore = new AuthStore();
    const status = authStore.getStatus();

    // Find the default provider's info
    const defaultProviderInfo = status.providers.find(p => p.name === status.defaultProvider);
    const modelInfo = this.options.model || defaultProviderInfo?.model || 'default';
    const providerInfo = status.defaultProvider || 'unknown';

    const content = [
      ui.bold('Nimbus Agent'),
      ui.dim(`Model: ${modelInfo} (${providerInfo}) | Mode: ${this.currentMode}`),
      '',
      ui.dim('AI agent with full tool access (file edit, bash, git, and more).'),
      ui.dim('Type your message and press Enter. Press Ctrl+C to interrupt.'),
      ui.dim(
        'Commands: /help, /clear, /model, /models, /mode, /persona, /verbose, /history, /undo, /redo, /export, /exit'
      ),
    ];

    ui.box({
      content,
      style: 'rounded',
      borderColor: 'cyan',
      padding: 1,
    });
    ui.newLine();

    // Display welcome message if provided
    if (this.options.welcomeMessage) {
      ui.info(this.options.welcomeMessage);
      ui.newLine();
    }
  }

  private displayPrompt(): void {
    if (this.rl && !this.isProcessing) {
      process.stdout.write(ui.color('You: ', 'green'));
    }
  }

  private async handleInput(input: string): Promise<void> {
    // Block input while processing a response
    if (this.isProcessing) {
      ui.info('Please wait for the current response to finish.');
      return;
    }

    if (!input) {
      this.displayPrompt();
      return;
    }

    // Handle commands
    if (input.startsWith('/')) {
      await this.handleCommand(input);
      return;
    }

    // Process chat message
    await this.sendMessage(input);
  }

  private async handleCommand(input: string): Promise<void> {
    const parts = input.slice(1).split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case 'help':
        this.displayHelp();
        break;

      case 'clear':
        this.clearHistory();
        break;

      case 'model':
        if (args[0]) {
          this.options.model = args[0];
          ui.success(`Model changed to: ${args[0]}`);
        } else {
          ui.info(`Current model: ${this.options.model || 'default'}`);
        }
        break;

      case 'persona':
        this.handlePersonaCommand(args);
        break;

      case 'verbose':
        this.verboseOutput = !this.verboseOutput;
        ui.success(`Verbose output ${this.verboseOutput ? 'enabled' : 'disabled'}`);
        break;

      case 'history':
        this.displayHistory();
        break;

      case 'export':
        await this.handleExportCommand(args);
        break;

      case 'undo': {
        const undoResult = await this.snapshotManager.undo();
        if (undoResult.success) {
          ui.success(undoResult.description);
        } else {
          ui.warning(undoResult.description);
        }
        break;
      }

      case 'redo': {
        const redoResult = await this.snapshotManager.redo();
        if (redoResult.success) {
          ui.success(redoResult.description);
        } else {
          ui.warning(redoResult.description);
        }
        break;
      }

      case 'mode': {
        const validModes = ['plan', 'build', 'deploy'] as const;
        const newMode = args[0]?.toLowerCase() as (typeof validModes)[number];
        if (!newMode) {
          ui.info(`Current mode: ${this.currentMode}`);
          ui.print(ui.dim('  Available: plan, build, deploy'));
        } else if (validModes.includes(newMode)) {
          this.currentMode = newMode;
          // Reset permission state to prevent privilege escalation
          this.permissionState = createPermissionState();
          ui.success(`Mode switched to: ${newMode}`);
        } else {
          ui.warning(`Invalid mode: ${newMode}`);
          ui.print(ui.dim('  Available: plan, build, deploy'));
        }
        break;
      }

      case 'models': {
        try {
          const models = await this.router.getAvailableModels();
          const entries = Object.entries(models);
          if (entries.length === 0) {
            ui.info('No providers configured.');
          } else {
            ui.section('Available Models');
            for (const [provider, modelList] of entries) {
              ui.print(`  ${ui.bold(provider)}:`);
              for (const model of modelList) {
                ui.print(`    - ${model}`);
              }
            }
          }
        } catch {
          ui.warning('Failed to list models.');
        }
        break;
      }

      case 'exit':
      case 'quit':
      case 'q':
        this.exit();
        return;

      default:
        ui.warning(`Unknown command: /${command}`);
        ui.info('Type /help for available commands.');
    }

    ui.newLine();
    this.displayPrompt();
  }

  private handlePersonaCommand(args: string[]): void {
    const validPersonas: PersonaTone[] = ['professional', 'assistant', 'expert'];
    const tone = args[0]?.toLowerCase() as PersonaTone;

    if (!tone) {
      ui.info(`Current persona: ${this.options.persona || 'professional'}`);
      ui.print(ui.dim('  Available: professional, assistant, expert'));
      return;
    }

    if (!validPersonas.includes(tone)) {
      ui.warning(`Invalid persona: ${tone}`);
      ui.print(ui.dim('  Available: professional, assistant, expert'));
      return;
    }

    this.options.persona = tone;

    // Update system prompt in history
    const personaPrompt = this.getPersonaSystemPrompt(tone);
    const existingSystem = this.history.findIndex(m => m.role === 'system');
    if (existingSystem >= 0) {
      this.history[existingSystem].content = personaPrompt;
    } else {
      this.history.unshift({ role: 'system', content: personaPrompt });
    }

    ui.success(`Persona set to: ${tone}`);
  }

  private getPersonaSystemPrompt(tone: PersonaTone): string {
    const baseIdentity = `You are Nimbus, an AI-powered cloud engineering assistant. You help users with:

- Infrastructure as Code (Terraform, CloudFormation, Pulumi)
- Kubernetes operations and configurations
- Cloud provider operations (AWS, GCP, Azure)
- Helm chart management and deployment
- DevOps best practices and CI/CD pipelines
- Troubleshooting infrastructure issues`;

    const personaInstructions: Record<PersonaTone, string> = {
      professional: `Maintain a formal, structured, and enterprise-focused tone at all times. Use bullet points and numbered lists to organize information clearly. Prefer formal language and avoid colloquialisms. Frame recommendations in terms of business impact, compliance, and operational excellence. When proposing changes, present them as structured plans with clear rationale, risk assessment, and rollback considerations.`,
      assistant: `Be friendly and conversational while remaining helpful and accurate. Explain concepts in an approachable way, breaking down complex topics so they are easy to understand. When suggesting infrastructure code, walk through the reasoning behind each decision. If you need more information to provide accurate help, ask clarifying questions. Offer encouragement and context to help users learn as they go.`,
      expert: `Be technical and concise. Assume the user has deep knowledge of cloud infrastructure, networking, and DevOps practices. Skip introductory explanations and get straight to the solution. Include advanced patterns, edge cases, and performance considerations where relevant. Reference specific API versions, provider documentation, and known gotchas. Prefer code-first responses with terse inline comments over lengthy prose.`,
    };

    return [baseIdentity, '', personaInstructions[tone]].join('\n');
  }

  private displayHelp(): void {
    ui.newLine();
    ui.section('Chat Commands');
    ui.print('  /help           - Show this help message');
    ui.print('  /clear          - Clear chat history');
    ui.print('  /model <name>   - Change the LLM model');
    ui.print('  /models         - List all available provider models');
    ui.print('  /mode <mode>    - Switch mode (plan, build, deploy)');
    ui.print('  /persona <tone> - Set persona (professional, assistant, expert)');
    ui.print('  /verbose        - Toggle verbose output (tokens, model, latency)');
    ui.print('  /history        - Show conversation history');
    ui.print('  /undo           - Undo the last file-modifying tool call');
    ui.print('  /redo           - Re-apply a previously undone change');
    ui.print('  /export [fmt]   - Export conversation (json, markdown, text)');
    ui.print('  /exit           - Exit chat mode');
    ui.newLine();
    ui.print(ui.dim('  Press Ctrl+C to exit at any time.'));
  }

  private clearHistory(): void {
    // Keep system prompt if present
    const systemPrompt = this.history.find(m => m.role === 'system');
    this.history = systemPrompt ? [systemPrompt] : [];
    ui.success('Chat history cleared.');
  }

  private displayHistory(): void {
    ui.newLine();
    ui.section('Conversation History');

    if (this.history.length === 0) {
      ui.print(ui.dim('  No messages yet.'));
      return;
    }

    for (const msg of this.history) {
      const roleColor = msg.role === 'user' ? 'green' : msg.role === 'assistant' ? 'blue' : 'gray';
      const roleLabel =
        msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Nimbus' : 'System';

      const displayContent =
        msg.role === 'assistant' ? highlightCodeBlocks(msg.content) : msg.content;
      ui.print(
        `  ${ui.color(`${roleLabel}:`, roleColor)} ${displayContent.substring(0, 100)}${displayContent.length > 100 ? '...' : ''}`
      );
    }
  }

  /**
   * Prompt user for permission via readline. Returns allow/deny/block.
   */
  private promptPermission(
    tool: ToolDefinition,
    input: unknown
  ): Promise<'allow' | 'deny' | 'block'> {
    return new Promise(resolve => {
      const inputSummary =
        input && typeof input === 'object'
          ? Object.entries(input as Record<string, unknown>)
              .slice(0, 3)
              .map(([k, v]) => {
                const s = typeof v === 'string' ? v : JSON.stringify(v);
                return `  ${k}: ${s.length > 60 ? `${s.slice(0, 57)}...` : s}`;
              })
              .join('\n')
          : '';

      ui.newLine();
      process.stdout.write(
        `${ui.color('⚠ Permission required', 'yellow')}: ${ui.bold(tool.name)}\n${
          inputSummary ? `${inputSummary}\n` : ''
        }${ui.dim('[y] Allow  [n] Deny  [a] Allow for session')} `
      );

      const onLine = (line: string) => {
        const answer = line.trim().toLowerCase();
        if (this.rl) {
          this.rl.removeListener('line', onLine);
        }
        if (answer === 'y' || answer === 'yes') {
          resolve('allow');
        } else if (answer === 'a') {
          approveForSession(tool, this.permissionState);
          const action = (input as Record<string, unknown>)?.action;
          if (typeof action === 'string') {
            approveActionForSession(tool.name, action, this.permissionState);
          }
          resolve('allow');
        } else {
          resolve('deny');
        }
      };

      if (this.rl) {
        this.rl.once('line', onLine);
      } else {
        // Fallback: deny if readline not available
        resolve('deny');
      }
    });
  }

  /**
   * Expand @path/to/file references in text with file contents.
   */
  private expandFileReferences(text: string): string {
    const fileRefs = text.match(/@([\w./_-]+)/g);
    if (!fileRefs) {
      return text;
    }

    let expanded = text;
    for (const ref of fileRefs) {
      const filePath = ref.slice(1);
      try {
        const resolved = path.resolve(process.cwd(), filePath);
        const content = fs.readFileSync(resolved, 'utf-8');
        const truncated =
          content.length > 10000
            ? `${content.slice(0, 10000)}\n... (truncated — showing 10,000 of ${content.length.toLocaleString()} chars)`
            : content;
        expanded = expanded.replace(ref, `\n<file path="${filePath}">\n${truncated}\n</file>`);
      } catch {
        // File not found — leave the @reference as-is
      }
    }
    return expanded;
  }

  private async sendMessage(userMessage: string): Promise<void> {
    this.isProcessing = true;
    this.abortController = new AbortController();

    // Expand @file references
    const expandedMessage = this.expandFileReferences(userMessage);

    // Add user message to display history
    this.history.push({
      role: 'user',
      content: expandedMessage,
    });

    ui.newLine();

    // Show a thinking indicator until the first text chunk arrives
    process.stdout.write(ui.dim('  Thinking...'));
    let thinkingCleared = false;
    const clearThinking = () => {
      if (!thinkingCleared) {
        thinkingCleared = true;
        // Clear the "Thinking..." text
        process.stdout.write('\r\x1b[K');
      }
    };

    let fullResponse = '';
    let tokenCount = 0;
    let textStarted = false;
    const startTime = Date.now();

    try {
      // Run the full agentic loop with tool-calling support
      const result: AgentLoopResult = await runAgentLoop(expandedMessage, this.agentHistory, {
        router: this.router,
        toolRegistry: defaultToolRegistry,
        mode: this.currentMode,
        model: this.options.model,
        cwd: process.cwd(),
        signal: this.abortController.signal,
        contextManager: this.contextManager,
        snapshotManager: this.snapshotManager,
        sessionId: this.sessionId || undefined,

        onText: text => {
          clearThinking();
          if (!textStarted) {
            process.stdout.write(ui.color('Nimbus: ', 'blue'));
            textStarted = true;
          }
          process.stdout.write(text);
          fullResponse += text;
        },

        onToolCallStart: (info: ToolCallInfo) => {
          clearThinking();
          // Show tool execution inline as text
          const inputSummary = summarizeToolInput(info.name, info.input);
          process.stdout.write(`\n${ui.dim(`  [Tool: ${info.name}]`)} ${ui.dim(inputSummary)}\n`);
          textStarted = false; // Reset so next text block gets prefix
        },

        onToolCallEnd: (info: ToolCallInfo, result: ToolResult) => {
          if (result.isError) {
            process.stdout.write(`  ${ui.color(`Error: ${result.error}`, 'red')}\n`);
          } else {
            // Show truncated output for non-error results
            const output = result.output.trim();
            if (output) {
              const lines = output.split('\n');
              const preview =
                lines.length > 5
                  ? `${lines.slice(0, 5).join('\n')}\n  ... (${lines.length - 5} more lines)`
                  : output;
              process.stdout.write(`  ${ui.dim(preview)}\n`);
            }
          }
        },

        onCompact: compactResult => {
          ui.info(
            `Context auto-compacted: saved ${compactResult.savedTokens.toLocaleString()} tokens.`
          );
        },

        checkPermission: async (tool, input) => {
          const decision = checkToolPermission(tool, input, this.permissionState);
          if (decision === 'allow') {
            return 'allow';
          }
          if (decision === 'block') {
            return 'block';
          }
          // decision === 'ask': prompt the user inline
          return this.promptPermission(tool, input);
        },
      });

      // Ensure we end the text output
      if (textStarted) {
        process.stdout.write('\n');
      }

      // Update agent history with the full conversation from this turn
      this.agentHistory = result.messages;
      tokenCount = result.usage.totalTokens;

      // Persist conversation to SQLite
      if (this.sessionManager && this.sessionId) {
        try {
          this.sessionManager.saveConversation(this.sessionId, this.agentHistory);
          this.sessionManager.updateSession(this.sessionId, {
            tokenCount: result.usage.totalTokens,
            costUSD: result.totalCost,
          });
        } catch {
          /* persistence is non-critical */
        }
      }

      // Extract the final assistant response for display history
      const lastAssistant = [...result.messages].reverse().find(m => m.role === 'assistant');

      if (lastAssistant) {
        this.history.push({
          role: 'assistant',
          content: (lastAssistant.content as string) ?? fullResponse,
        });
      } else if (fullResponse) {
        this.history.push({
          role: 'assistant',
          content: fullResponse,
        });
      }

      // Show verbose info (token count, model, latency, turns, cost) when enabled
      if (this.verboseOutput || this.options.showTokenCount) {
        const latencyMs = Date.now() - startTime;
        const parts: string[] = [];
        if (tokenCount > 0) {
          parts.push(`${tokenCount} tokens`);
        }
        if (this.verboseOutput) {
          parts.push(`model: ${this.options.model || 'default'}`);
          parts.push(`${latencyMs}ms`);
          parts.push(`${result.turns} turn${result.turns !== 1 ? 's' : ''}`);
          if (result.totalCost > 0) {
            const costStr =
              result.totalCost < 0.01
                ? `$${result.totalCost.toFixed(4)}`
                : `$${result.totalCost.toFixed(2)}`;
            parts.push(`cost: ${costStr}`);
          }
        }
        if (parts.length > 0) {
          ui.print(ui.dim(`  (${parts.join(' | ')})`));
        }
      }

      if (result.interrupted) {
        ui.info('Operation interrupted.');
      }
    } catch (error: any) {
      clearThinking();
      if (textStarted) {
        process.stdout.write('\n');
      }
      ui.error(error.message || 'Failed to get response');
      this.history.pop(); // Remove failed user message
    }

    this.isProcessing = false;

    ui.newLine();
    this.displayPrompt();
  }

  /**
   * Handle the /export command.
   *
   * Exports the current conversation to a file in the requested format.
   * Supported formats: json (default), markdown, text.
   */
  private async handleExportCommand(args: string[]): Promise<void> {
    const userMessages = this.history.filter(m => m.role !== 'system');

    if (userMessages.length === 0) {
      ui.info('Nothing to export. Start a conversation first.');
      return;
    }

    // Parse the requested format (default: json)
    const rawFormat = (args[0] || 'json').toLowerCase();
    const formatAliases: Record<string, ExportFormat> = {
      json: 'json',
      md: 'markdown',
      markdown: 'markdown',
      txt: 'text',
      text: 'text',
    };
    const format: ExportFormat | undefined = formatAliases[rawFormat];

    if (!format) {
      ui.warning(`Unsupported export format: ${rawFormat}`);
      ui.info('Supported formats: json, markdown (md), text (txt)');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extMap: Record<ExportFormat, string> = {
      json: 'json',
      markdown: 'md',
      text: 'txt',
    };
    const ext = extMap[format];
    const filename = `nimbus-chat-export-${timestamp}.${ext}`;
    const filepath = path.resolve(process.cwd(), filename);

    let content: string;

    switch (format) {
      case 'json': {
        const payload = {
          title: `Nimbus Chat Export`,
          messages: this.history.map(m => ({
            role: m.role,
            content: m.content,
          })),
          exportedAt: new Date().toISOString(),
          model: this.options.model || 'default',
        };
        content = JSON.stringify(payload, null, 2);
        break;
      }

      case 'markdown': {
        const lines: string[] = [
          `# Nimbus Chat Export`,
          '',
          `> Exported at ${new Date().toISOString()} | Model: ${this.options.model || 'default'}`,
          '',
        ];
        for (const msg of this.history) {
          if (msg.role === 'system') {
            continue;
          }
          const heading = msg.role === 'user' ? 'User' : 'Assistant';
          lines.push(`## ${heading}`, '', msg.content, '');
        }
        content = lines.join('\n');
        break;
      }

      case 'text': {
        const lines: string[] = [
          `Nimbus Chat Export`,
          `Exported at ${new Date().toISOString()} | Model: ${this.options.model || 'default'}`,
          '---',
          '',
        ];
        for (const msg of this.history) {
          if (msg.role === 'system') {
            continue;
          }
          const label = msg.role === 'user' ? 'You' : 'Nimbus';
          lines.push(`${label}:`, msg.content, '');
        }
        content = lines.join('\n');
        break;
      }
    }

    try {
      fs.writeFileSync(filepath, content, 'utf-8');
      ui.success(`Conversation exported to ${filename}`);
    } catch (err: any) {
      ui.warning(`Failed to write export file: ${err.message}`);
    }
  }

  private exit(): void {
    ui.newLine();
    ui.info('Goodbye!');
    ui.newLine();

    // Mark the session as completed before exiting
    if (this.sessionManager && this.sessionId) {
      try {
        this.sessionManager.complete(this.sessionId);
      } catch {
        /* ignore */
      }
    }

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    process.exit(0);
  }
}

/**
 * Start an interactive chat session
 */
export async function startChat(options: ChatUIOptions = {}): Promise<void> {
  const chatUI = new ChatUI(options);
  await chatUI.start();
}
