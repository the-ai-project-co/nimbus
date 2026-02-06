/**
 * Chat UI
 *
 * Interactive chat interface for conversing with the LLM
 */

import * as readline from 'readline';
import { ui } from '../wizard/ui';
import { LLMClient, type ChatMessage, type StreamingChunk } from '../clients';
import { StreamingDisplay } from './streaming';
import { AuthStore } from '../auth/store';

export interface ChatUIOptions {
  /** LLM model to use */
  model?: string;
  /** Initial system prompt */
  systemPrompt?: string;
  /** Show token count after responses */
  showTokenCount?: boolean;
  /** Welcome message to display */
  welcomeMessage?: string;
}

/**
 * ChatUI provides an interactive terminal chat interface
 */
export class ChatUI {
  private options: ChatUIOptions;
  private llmClient: LLMClient;
  private history: ChatMessage[] = [];
  private rl: readline.Interface | null = null;
  private isProcessing: boolean = false;

  constructor(options: ChatUIOptions = {}) {
    this.options = options;
    this.llmClient = new LLMClient();

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

    ui.box({
      content: [
        ui.bold('Nimbus Chat'),
        ui.dim(`Model: ${modelInfo} (${providerInfo})`),
        '',
        ui.dim('Type your message and press Enter to send.'),
        ui.dim('Commands: /help, /clear, /model <name>, /exit'),
      ],
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

      case 'history':
        this.displayHistory();
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

  private displayHelp(): void {
    ui.newLine();
    ui.section('Chat Commands');
    ui.print('  /help           - Show this help message');
    ui.print('  /clear          - Clear chat history');
    ui.print('  /model <name>   - Change the LLM model');
    ui.print('  /history        - Show conversation history');
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
      const roleLabel = msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Nimbus' : 'System';

      ui.print(`  ${ui.color(roleLabel + ':', roleColor)} ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
    }
  }

  private async sendMessage(userMessage: string): Promise<void> {
    this.isProcessing = true;

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

      // Show token count if enabled
      if (this.options.showTokenCount && tokenCount > 0) {
        ui.print(ui.dim(`  (${tokenCount} tokens)`));
      }
    } catch (error: any) {
      display.error(error.message || 'Failed to get response');
      this.history.pop(); // Remove failed user message
    }

    this.isProcessing = false;
    ui.newLine();
    this.displayPrompt();
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
