/**
 * Chat Command
 *
 * Interactive chat mode with LLM streaming
 */

import { startChat, type ChatUIOptions } from '../ui';
import { AuthStore } from '../auth/store';
import { ui } from '../wizard/ui';

export interface ChatOptions {
  /** LLM model to use */
  model?: string;
  /** Initial system prompt */
  systemPrompt?: string;
  /** Show token count after responses */
  showTokenCount?: boolean;
  /** Non-interactive mode (for API usage) */
  nonInteractive?: boolean;
  /** Single message to send (non-interactive) */
  message?: string;
}

/**
 * Chat command handler
 *
 * Usage:
 *   nimbus chat                    - Start interactive chat
 *   nimbus chat --model gpt-4o     - Use specific model
 *   nimbus chat -m "Hello"         - Send single message (non-interactive)
 */
export async function chatCommand(options: ChatOptions = {}): Promise<void> {
  // Get default model from auth store if not specified
  if (!options.model) {
    const authStore = new AuthStore();
    const status = authStore.getStatus();
    // Find the default provider's model
    const defaultProviderInfo = status.providers.find(p => p.name === status.defaultProvider);
    options.model = defaultProviderInfo?.model;
  }

  // Non-interactive mode: send single message
  if (options.nonInteractive || options.message) {
    if (!options.message) {
      ui.error('Message is required in non-interactive mode. Use --message or -m.');
      process.exit(1);
    }

    await sendSingleMessage(options.message, options);
    return;
  }

  // Interactive mode: start chat UI
  const chatOptions: ChatUIOptions = {
    model: options.model,
    systemPrompt: options.systemPrompt || getDefaultSystemPrompt(),
    showTokenCount: options.showTokenCount ?? false,
  };

  await startChat(chatOptions);
}

/**
 * Send a single message and display the response (non-interactive mode)
 */
async function sendSingleMessage(message: string, options: ChatOptions): Promise<void> {
  const { LLMClient } = await import('../clients');
  const { StreamingDisplay } = await import('../ui');

  const llmClient = new LLMClient();

  // Check availability
  const isAvailable = await llmClient.isAvailable();
  if (!isAvailable) {
    ui.error('LLM service is not available.');
    process.exit(1);
  }

  const display = new StreamingDisplay({
    prefix: '',
    showCursor: false,
  });

  const messages = [
    ...(options.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
    { role: 'user' as const, content: message },
  ];

  display.start();

  try {
    const stream = llmClient.streamChat(messages, { model: options.model });

    for await (const chunk of stream) {
      if (chunk.type === 'content' && chunk.content) {
        display.append(chunk.content);
      } else if (chunk.type === 'error') {
        display.error(chunk.message || 'Unknown error');
        process.exit(1);
      }
    }

    display.complete();
  } catch (error: any) {
    display.error(error.message || 'Failed to get response');
    process.exit(1);
  }
}

/**
 * Default system prompt for Nimbus chat
 */
function getDefaultSystemPrompt(): string {
  return `You are Nimbus, an AI-powered cloud engineering assistant. You help users with:

- Infrastructure as Code (Terraform, CloudFormation, Pulumi)
- Kubernetes operations and configurations
- Cloud provider operations (AWS, GCP, Azure)
- DevOps best practices and CI/CD pipelines
- Troubleshooting infrastructure issues

Be concise but thorough. When suggesting infrastructure code, follow best practices for security, scalability, and maintainability. Always explain what changes you're proposing and why.

If you need more information to provide accurate help, ask clarifying questions.`;
}
