/**
 * Chat Command
 *
 * Interactive chat mode with LLM streaming and infrastructure generation
 */

import { startChat, type ChatUIOptions } from '../ui';
import { AuthStore } from '../auth/store';
import { ui } from '../wizard/ui';
import { GeneratorClient, type ConversationResult, type GenerationResult } from '../clients';
import { randomUUID } from 'crypto';

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
  /** Enable infrastructure generation mode */
  generateMode?: boolean;
  /** Persona mode */
  persona?: 'professional' | 'assistant' | 'expert';
  /** Verbosity level */
  verbosity?: 'minimal' | 'normal' | 'detailed';
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

  // Read persona from config if not specified
  if (!options.persona || !options.verbosity) {
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const { homedir } = await import('os');
      const configPath = path.join(homedir(), '.nimbus', 'config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (!options.persona && config?.persona?.mode) {
          options.persona = config.persona.mode;
        }
        if (!options.verbosity && config?.persona?.verbosity) {
          options.verbosity = config.persona.verbosity;
        }
      }
    } catch {
      // Config read failure is non-critical
    }
  }
  const persona = options.persona || 'assistant';
  const verbosity = options.verbosity || 'normal';

  // Non-interactive mode: send single message
  if (options.nonInteractive || options.message) {
    if (!options.message) {
      ui.error('Message is required in non-interactive mode. Use --message or -m.');
      process.exit(1);
    }

    await sendSingleMessage(options.message, options, persona, verbosity);
    return;
  }

  // Interactive mode: start chat UI
  const chatOptions: ChatUIOptions = {
    model: options.model,
    systemPrompt: options.systemPrompt || getPersonaSystemPrompt(persona, verbosity),
    showTokenCount: options.showTokenCount ?? false,
  };

  await startChat(chatOptions);
}

/**
 * Send a single message and display the response (non-interactive mode)
 */
async function sendSingleMessage(
  message: string,
  options: ChatOptions,
  persona: 'professional' | 'assistant' | 'expert',
  verbosity: 'minimal' | 'normal' | 'detailed',
): Promise<void> {
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

  const systemPrompt = options.systemPrompt || getPersonaSystemPrompt(persona, verbosity);
  const messages = [
    { role: 'system' as const, content: systemPrompt },
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
 * Build a persona-aware system prompt for Nimbus chat.
 *
 * @param persona - The persona mode that controls tone and style
 * @param verbosity - The verbosity level that controls response length
 * @returns A complete system prompt string
 */
function getPersonaSystemPrompt(
  persona: 'professional' | 'assistant' | 'expert',
  verbosity: 'minimal' | 'normal' | 'detailed',
): string {
  // Base identity shared across all personas
  const baseIdentity = `You are Nimbus, an AI-powered cloud engineering assistant. You help users with:

- Infrastructure as Code (Terraform, CloudFormation, Pulumi)
- Kubernetes operations and configurations
- Cloud provider operations (AWS, GCP, Azure)
- DevOps best practices and CI/CD pipelines
- Troubleshooting infrastructure issues`;

  // Persona-specific instructions
  const personaInstructions: Record<typeof persona, string> = {
    professional: `Maintain a formal, structured, and enterprise-focused tone at all times. Use bullet points and numbered lists to organize information clearly. Prefer formal language and avoid colloquialisms. Frame recommendations in terms of business impact, compliance, and operational excellence. When proposing changes, present them as structured plans with clear rationale, risk assessment, and rollback considerations.`,
    assistant: `Be friendly and conversational while remaining helpful and accurate. Explain concepts in an approachable way, breaking down complex topics so they are easy to understand. When suggesting infrastructure code, walk through the reasoning behind each decision. If you need more information to provide accurate help, ask clarifying questions. Offer encouragement and context to help users learn as they go.`,
    expert: `Be technical and concise. Assume the user has deep knowledge of cloud infrastructure, networking, and DevOps practices. Skip introductory explanations and get straight to the solution. Include advanced patterns, edge cases, and performance considerations where relevant. Reference specific API versions, provider documentation, and known gotchas. Prefer code-first responses with terse inline comments over lengthy prose.`,
  };

  // Verbosity-level instructions
  const verbosityInstructions: Record<typeof verbosity, string> = {
    minimal: `Keep responses brief and to the point. Omit preamble and unnecessary context. Provide the shortest correct answer, using code blocks or bullet points when possible. Avoid repeating the question or restating what the user already knows.`,
    normal: `Provide balanced responses that include enough context to be useful without being verbose. Include a brief explanation alongside code or commands. Mention important caveats or prerequisites when relevant, but do not over-explain.`,
    detailed: `Provide comprehensive responses with thorough explanations. Include code examples, usage patterns, and alternative approaches. Explain trade-offs, link to relevant best practices, and suggest next steps. Where applicable, show before-and-after comparisons and provide context on why a particular approach is preferred.`,
  };

  return [
    baseIdentity,
    '',
    personaInstructions[persona],
    '',
    verbosityInstructions[verbosity],
  ].join('\n');
}

/**
 * Detect if a message has infrastructure generation intent
 */
function detectGenerationIntent(message: string): boolean {
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
 * Format generation result for display
 */
function formatGenerationResult(result: GenerationResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(ui.bold('Infrastructure Generated Successfully!'));
  lines.push('');

  // Show stack info
  if (result.stack) {
    lines.push(`Provider: ${result.stack.provider.toUpperCase()}`);
    if (result.stack.environment) {
      lines.push(`Environment: ${result.stack.environment}`);
    }
    if (result.stack.region) {
      lines.push(`Region: ${result.stack.region}`);
    }
    lines.push(`Components: ${result.stack.components.join(', ')}`);
    lines.push('');
  }

  // Show generated files
  lines.push(ui.bold('Generated Files:'));
  for (const [filename, content] of Object.entries(result.files)) {
    const lineCount = content.split('\n').length;
    lines.push(`  - ${filename} (${lineCount} lines)`);
  }

  // Show best practices report if available
  if (result.bestPracticesReport) {
    lines.push('');
    const { summary } = result.bestPracticesReport;
    if (summary.total_violations === 0) {
      lines.push(ui.color('Best Practices: All checks passed!', 'green'));
    } else {
      lines.push(`Best Practices: ${summary.total_violations} issues found, ${summary.autofixable_violations} auto-fixed`);
    }
  }

  // Show any errors
  if (result.errors && result.errors.length > 0) {
    lines.push('');
    lines.push(ui.color('Warnings:', 'yellow'));
    for (const error of result.errors) {
      lines.push(`  - ${error}`);
    }
  }

  lines.push('');
  lines.push('Files are ready. Use "nimbus apply terraform" to deploy.');

  return lines.join('\n');
}

/**
 * Handle generation intent by routing to generator service
 */
async function handleGenerationIntent(
  message: string,
  sessionId: string,
  generatorClient: GeneratorClient
): Promise<{ type: 'response' | 'generated'; content: string; result?: GenerationResult }> {
  try {
    // Process the message through the conversational engine
    const convResult = await generatorClient.processConversation(sessionId, message);

    // If we can generate, do it
    if (convResult.canGenerate) {
      ui.info('Generating infrastructure...');
      const result = await generatorClient.generateFromConversation(sessionId, {
        applyBestPractices: true,
        autofix: true,
      });

      return {
        type: 'generated',
        content: formatGenerationResult(result),
        result,
      };
    }

    // Need more information - return the clarifying response
    let response = convResult.message;

    // Add suggested actions if available
    if (convResult.suggestedActions && convResult.suggestedActions.length > 0) {
      response += '\n\nSuggested actions:';
      for (const action of convResult.suggestedActions) {
        response += `\n  - ${action.label}: ${action.description}`;
      }
    }

    return {
      type: 'response',
      content: response,
    };
  } catch (error) {
    // Fall back to regular chat if generator service is unavailable
    throw error;
  }
}

/**
 * Start chat with generation support
 */
export async function startChatWithGeneration(options: ChatOptions = {}): Promise<void> {
  const generatorClient = new GeneratorClient();
  const sessionId = randomUUID();

  // Check if generator service is available
  const generatorAvailable = await generatorClient.isAvailable();

  const persona = options.persona || 'assistant';
  const verbosity = options.verbosity || 'normal';

  const enhancedOptions: ChatUIOptions = {
    model: options.model,
    systemPrompt: options.systemPrompt || getPersonaSystemPrompt(persona, verbosity),
    showTokenCount: options.showTokenCount ?? false,
    welcomeMessage: generatorAvailable
      ? 'Infrastructure generation is enabled. Try "Create a VPC on AWS".'
      : undefined,
  };

  // If generator is available, we'll use enhanced chat
  // For now, fall back to standard chat as the UI integration
  // would require more extensive changes to the ChatUI class
  await startChat(enhancedOptions);
}
