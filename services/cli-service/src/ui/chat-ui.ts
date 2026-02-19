/**
 * Chat UI
 *
 * Interactive chat interface for conversing with the LLM
 * with infrastructure generation support
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ui } from '../wizard/ui';
import { LLMClient, GeneratorClient, type ChatMessage, type StreamingChunk, type GenerationResult } from '../clients';
import { StreamingDisplay } from './streaming';
import { AuthStore } from '../auth/store';
import { highlightCodeBlocks } from './ink/Message';

/** Shape returned by the State Service conversations endpoint */
interface StateConversation {
  sessionId: string;
  title?: string;
  updatedAt: string;
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
}

/** Supported export formats for the /export command */
type ExportFormat = 'json' | 'markdown' | 'text';

export type PersonaTone = 'professional' | 'assistant' | 'expert';

export interface ChatUIOptions {
  /** LLM model to use */
  model?: string;
  /** Initial system prompt */
  systemPrompt?: string;
  /** Show token count after responses */
  showTokenCount?: boolean;
  /** Welcome message to display */
  welcomeMessage?: string;
  /** Enable infrastructure generation mode */
  enableGeneration?: boolean;
  /** Active persona tone */
  persona?: PersonaTone;
}

/**
 * ChatUI provides an interactive terminal chat interface
 * with infrastructure generation support
 */
export class ChatUI {
  private options: ChatUIOptions;
  private llmClient: LLMClient;
  private generatorClient: GeneratorClient;
  private history: ChatMessage[] = [];
  private rl: readline.Interface | null = null;
  private isProcessing: boolean = false;
  private generatorAvailable: boolean = false;
  private generatorSessionId: string;
  private verboseOutput: boolean = false;
  private sessionId: string;
  private stateServiceUrl: string;

  constructor(options: ChatUIOptions = {}) {
    this.options = options;
    this.llmClient = new LLMClient();
    this.generatorClient = new GeneratorClient();
    this.generatorSessionId = randomUUID();
    this.sessionId = randomUUID();
    this.stateServiceUrl = process.env.STATE_SERVICE_URL || 'http://localhost:3004';

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
    // Check generator service availability
    this.generatorAvailable = await this.generatorClient.isAvailable();

    // Display header
    this.displayHeader();

    // Check LLM service availability
    const isAvailable = await this.llmClient.isAvailable();
    if (!isAvailable) {
      ui.warning('LLM service is not available. Please ensure the LLM service is running.');
      ui.info('Start the LLM service with: cd services/llm-service && bun run dev');
      ui.newLine();
      return;
    }

    // Create readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // Handle line input
    this.rl.on('line', async (input) => {
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
      ui.bold('Nimbus Chat'),
      ui.dim(`Model: ${modelInfo} (${providerInfo})`),
      '',
      ui.dim('Type your message and press Enter to send.'),
      ui.dim('Commands: /help, /clear, /model, /persona, /verbose, /generate, /load, /export, /exit'),
    ];

    if (this.generatorAvailable) {
      content.push('');
      content.push(ui.color('Infrastructure generation enabled', 'green'));
    }

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
    } else if (this.generatorAvailable) {
      ui.info('Try: "Create a VPC on AWS" or "Generate EKS cluster for production"');
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
        // Also clear generator session
        if (this.generatorAvailable) {
          try {
            await this.generatorClient.clearHistory(this.generatorSessionId);
          } catch {
            // Ignore errors
          }
        }
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

      case 'generate':
        if (this.generatorAvailable) {
          ui.info('Generation mode enabled for next message.');
          ui.info('Describe the infrastructure you want to create.');
        } else {
          ui.warning('Generator service is not available.');
        }
        break;

      case 'save':
        try {
          await this.persistConversation();
          ui.success('Conversation saved to State Service.');
        } catch {
          ui.warning('Failed to save conversation to State Service.');
        }
        break;

      case 'sessions':
      case 'load':
        await this.handleLoadCommand();
        break;

      case 'export':
        await this.handleExportCommand(args);
        break;

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
    ui.print('  /persona <tone> - Set persona (professional, assistant, expert)');
    ui.print('  /verbose        - Toggle verbose output (tokens, model, latency)');
    ui.print('  /history        - Show conversation history');
    ui.print('  /save           - Save conversation to State Service');
    ui.print('  /load           - List and load a saved conversation');
    ui.print('  /sessions       - Alias for /load');
    ui.print('  /export [fmt]   - Export conversation (json, markdown, text)');
    ui.print('  /generate       - Force generation mode for next message');
    ui.print('  /exit           - Exit chat mode');
    ui.newLine();
    if (this.generatorAvailable) {
      ui.section('Infrastructure Generation');
      ui.print('  Say things like:');
      ui.print('  - "Create a VPC on AWS"');
      ui.print('  - "Generate EKS cluster for production"');
      ui.print('  - "Setup a PostgreSQL database"');
      ui.newLine();
    }
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
      const roleLabel = msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Nimbus' : 'System';

      const displayContent = msg.role === 'assistant'
        ? highlightCodeBlocks(msg.content)
        : msg.content;
      ui.print(`  ${ui.color(roleLabel + ':', roleColor)} ${displayContent.substring(0, 100)}${displayContent.length > 100 ? '...' : ''}`);
    }
  }

  private async sendMessage(userMessage: string): Promise<void> {
    this.isProcessing = true;

    // Check if this looks like a generation request
    if (this.generatorAvailable && this.detectGenerationIntent(userMessage)) {
      await this.handleGenerationMessage(userMessage);
      this.isProcessing = false;
      ui.newLine();
      this.displayPrompt();
      return;
    }

    // Add user message to history
    this.history.push({
      role: 'user',
      content: userMessage,
    });

    ui.newLine();

    // Create streaming display
    const display = new StreamingDisplay({
      prefix: 'Nimbus: ',
      prefixColor: 'blue',
      showCursor: true,
    });

    display.start();

    let fullResponse = '';
    let tokenCount = 0;
    const startTime = Date.now();

    try {
      // Stream the response
      const stream = this.llmClient.streamChat(this.history, {
        model: this.options.model,
      });

      for await (const chunk of stream) {
        if (chunk.type === 'content' && chunk.content) {
          display.append(chunk.content);
          fullResponse += chunk.content;
        } else if (chunk.type === 'done') {
          tokenCount = chunk.tokenCount || 0;
        } else if (chunk.type === 'error') {
          display.error(chunk.message || 'Unknown error');
          this.history.pop(); // Remove failed user message
          this.isProcessing = false;
          this.displayPrompt();
          return;
        }
      }

      display.complete();

      // Add assistant response to history
      if (fullResponse) {
        this.history.push({
          role: 'assistant',
          content: fullResponse,
        });
      }

      // Show verbose info (token count, model, latency) when enabled
      if (this.verboseOutput || this.options.showTokenCount) {
        const latencyMs = Date.now() - startTime;
        const parts: string[] = [];
        if (tokenCount > 0) parts.push(`${tokenCount} tokens`);
        if (this.verboseOutput) {
          parts.push(`model: ${this.options.model || 'default'}`);
          parts.push(`${latencyMs}ms`);
        }
        if (parts.length > 0) {
          ui.print(ui.dim(`  (${parts.join(' | ')})`));
        }
      }
    } catch (error: any) {
      display.error(error.message || 'Failed to get response');
      this.history.pop(); // Remove failed user message
    }

    this.isProcessing = false;

    // Fire-and-forget: persist conversation to State Service
    this.persistConversation().catch(() => {});

    ui.newLine();
    this.displayPrompt();
  }

  /**
   * Detect if message has infrastructure generation intent
   */
  private detectGenerationIntent(message: string): boolean {
    const lowerMessage = message.toLowerCase();

    // Keywords that suggest infrastructure generation
    const generateKeywords = [
      'create', 'generate', 'build', 'setup', 'set up', 'deploy', 'provision',
      'make', 'configure', 'spin up', 'launch', 'start', 'initialize', 'init'
    ];

    // Infrastructure components
    const infraKeywords = [
      'vpc', 'network', 'subnet', 'eks', 'kubernetes', 'k8s', 'cluster',
      'rds', 'database', 'db', 's3', 'bucket', 'storage', 'ec2', 'instance',
      'lambda', 'function', 'api gateway', 'load balancer', 'elb', 'alb',
      'infrastructure', 'terraform', 'cloudformation', 'iac'
    ];

    // Cloud providers
    const providerKeywords = ['aws', 'gcp', 'azure', 'google cloud', 'amazon'];

    const hasGenerateKeyword = generateKeywords.some(kw => lowerMessage.includes(kw));
    const hasInfraKeyword = infraKeywords.some(kw => lowerMessage.includes(kw));
    const hasProviderKeyword = providerKeywords.some(kw => lowerMessage.includes(kw));

    // Detect generation intent if we have a generate keyword with infra or provider
    return hasGenerateKeyword && (hasInfraKeyword || hasProviderKeyword);
  }

  /**
   * Handle message with generation intent
   */
  private async handleGenerationMessage(userMessage: string): Promise<void> {
    ui.newLine();

    try {
      // Process through generator service
      const result = await this.generatorClient.processConversation(
        this.generatorSessionId,
        userMessage
      );

      // If we can generate, do it
      if (result.canGenerate) {
        ui.info('Generating infrastructure...');
        ui.newLine();

        const genResult = await this.generatorClient.generateFromConversation(
          this.generatorSessionId,
          { applyBestPractices: true, autofix: true }
        );

        this.displayGenerationResult(genResult);

        // Add to chat history
        this.history.push({ role: 'user', content: userMessage });
        this.history.push({
          role: 'assistant',
          content: `Generated ${Object.keys(genResult.files).length} infrastructure files for ${genResult.stack.components.join(', ')}.`,
        });
      } else {
        // Need more information
        ui.print(ui.color('Nimbus: ', 'blue') + result.message);

        // Show suggested actions if available
        if (result.suggestedActions && result.suggestedActions.length > 0) {
          ui.newLine();
          ui.print(ui.dim('Suggested actions:'));
          for (const action of result.suggestedActions) {
            ui.print(ui.dim(`  - ${action.label}: ${action.description}`));
          }
        }

        // Add to history
        this.history.push({ role: 'user', content: userMessage });
        this.history.push({ role: 'assistant', content: result.message });
      }
    } catch (error: any) {
      ui.warning(`Generation service error: ${error.message}`);
      ui.info('Falling back to regular chat...');

      // Fall back to regular LLM chat
      this.history.push({ role: 'user', content: userMessage });
      await this.sendRegularMessage();
    }
  }

  /**
   * Send message through regular LLM (fallback)
   */
  private async sendRegularMessage(): Promise<void> {
    const display = new StreamingDisplay({
      prefix: 'Nimbus: ',
      prefixColor: 'blue',
      showCursor: true,
    });

    display.start();
    let fullResponse = '';

    try {
      const stream = this.llmClient.streamChat(this.history, {
        model: this.options.model,
      });

      for await (const chunk of stream) {
        if (chunk.type === 'content' && chunk.content) {
          display.append(chunk.content);
          fullResponse += chunk.content;
        } else if (chunk.type === 'error') {
          display.error(chunk.message || 'Unknown error');
          this.history.pop();
          return;
        }
      }

      display.complete();

      if (fullResponse) {
        this.history.push({ role: 'assistant', content: fullResponse });
      }
    } catch (error: any) {
      display.error(error.message || 'Failed to get response');
      this.history.pop();
    }
  }

  /**
   * Display generation result
   */
  private displayGenerationResult(result: GenerationResult): void {
    ui.box({
      content: [
        ui.bold('Infrastructure Generated!'),
        '',
        `Provider: ${result.stack.provider.toUpperCase()}`,
        result.stack.environment ? `Environment: ${result.stack.environment}` : '',
        result.stack.region ? `Region: ${result.stack.region}` : '',
        `Components: ${result.stack.components.join(', ')}`,
      ].filter(Boolean),
      style: 'rounded',
      borderColor: 'green',
      padding: 1,
    });

    ui.newLine();
    ui.section('Generated Files');
    for (const [filename, content] of Object.entries(result.files)) {
      const lineCount = content.split('\n').length;
      ui.print(`  ${ui.color('', 'green')} ${filename} (${lineCount} lines)`);
    }

    if (result.bestPracticesReport) {
      ui.newLine();
      const { summary } = result.bestPracticesReport;
      if (summary.total_violations === 0) {
        ui.success('Best Practices: All checks passed!');
      } else {
        ui.info(`Best Practices: ${summary.total_violations} issues found, ${summary.autofixable_violations} auto-fixed`);
      }
    }

    if (result.errors && result.errors.length > 0) {
      ui.newLine();
      ui.warning('Warnings:');
      for (const error of result.errors) {
        ui.print(`  - ${error}`);
      }
    }

    ui.newLine();
    ui.info('Files are ready. Use "nimbus apply terraform" to deploy.');
  }

  /**
   * Handle the /load (and /sessions alias) command.
   *
   * Fetches saved conversations from the State Service, displays them as
   * a numbered list, and allows the user to select one by number. The
   * selected conversation's messages are loaded into `this.history`.
   */
  private async handleLoadCommand(): Promise<void> {
    let conversations: StateConversation[];

    try {
      const response = await fetch(
        `${this.stateServiceUrl}/api/state/conversations`,
      );

      if (!response.ok) {
        ui.warning('Failed to load sessions from State Service.');
        return;
      }

      const body = (await response.json()) as {
        success?: boolean;
        data?: StateConversation[];
      };

      if (!body.success || !Array.isArray(body.data) || body.data.length === 0) {
        ui.info('No saved conversations found.');
        return;
      }

      conversations = body.data;
    } catch {
      ui.warning('State Service is not available. Ensure it is running on ' + this.stateServiceUrl);
      return;
    }

    // Display numbered list
    ui.newLine();
    ui.section('Saved Conversations');

    for (let i = 0; i < conversations.length; i++) {
      const session = conversations[i];
      const title = session.title || `Session ${session.sessionId.substring(0, 8)}`;
      const msgCount = session.messages?.length ?? 0;
      const date = session.updatedAt
        ? new Date(session.updatedAt).toLocaleString()
        : 'unknown date';
      ui.print(`  ${ui.color(`[${i + 1}]`, 'cyan')} ${title}  ${ui.dim(date)}  (${msgCount} messages)`);
    }

    ui.newLine();
    ui.print('Enter a number to load, or press Enter to cancel:');

    // Wait for user selection via a one-shot line read
    const selection = await this.promptForInput();

    if (!selection) {
      ui.info('Load cancelled.');
      return;
    }

    const index = parseInt(selection, 10) - 1;
    if (isNaN(index) || index < 0 || index >= conversations.length) {
      ui.warning(`Invalid selection: ${selection}. Expected 1-${conversations.length}.`);
      return;
    }

    const chosen = conversations[index];
    const loadedMessages: ChatMessage[] = (chosen.messages ?? []).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Replace current history, preserving any existing system prompt if the
    // loaded conversation does not include one.
    const existingSystem = this.history.find((m) => m.role === 'system');
    const loadedHasSystem = loadedMessages.some((m) => m.role === 'system');

    if (existingSystem && !loadedHasSystem) {
      this.history = [existingSystem, ...loadedMessages];
    } else {
      this.history = loadedMessages;
    }

    this.sessionId = chosen.sessionId;
    const title = chosen.title || `Session ${chosen.sessionId.substring(0, 8)}`;
    ui.success(`Loaded conversation: ${title}`);
  }

  /**
   * Handle the /export command.
   *
   * Exports the current conversation to a file in the requested format.
   * Supported formats: json (default), markdown, text.
   */
  private async handleExportCommand(args: string[]): Promise<void> {
    const userMessages = this.history.filter((m) => m.role !== 'system');

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
          messages: this.history.map((m) => ({
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
          if (msg.role === 'system') continue;
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
          if (msg.role === 'system') continue;
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

  /**
   * Prompt the user for a single line of input.
   *
   * Returns the trimmed input, or an empty string if the user presses
   * Enter without typing anything.
   */
  private promptForInput(): Promise<string> {
    return new Promise<string>((resolve) => {
      if (!this.rl) {
        resolve('');
        return;
      }

      // The readline interface already has a persistent 'line' listener
      // (from `start()`). We set `isProcessing` to true so the persistent
      // listener in `handleInput` early-returns, and register a one-shot
      // listener to capture the user's selection.
      this.isProcessing = true;
      this.rl.once('line', (line: string) => {
        this.isProcessing = false;
        resolve(line.trim());
      });

      process.stdout.write(ui.color('> ', 'cyan'));
    });
  }

  /**
   * Persist the current conversation to the State Service.
   * Fire-and-forget safe: never throws on network errors.
   */
  private async persistConversation(): Promise<void> {
    try {
      await fetch(`${this.stateServiceUrl}/api/state/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          messages: this.history,
          updatedAt: new Date().toISOString(),
        }),
      });
    } catch {
      // Fire-and-forget: swallow all errors silently
      console.warn('[nimbus] Failed to persist conversation to State Service');
    }
  }

  private exit(): void {
    ui.newLine();
    ui.info('Goodbye!');
    ui.newLine();

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
