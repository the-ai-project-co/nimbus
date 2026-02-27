/**
 * Chat Command
 *
 * Interactive chat mode with LLM streaming and infrastructure generation
 */

import { startChat, type ChatUIOptions } from '../ui';
import { AuthStore } from '../auth/store';
import { ui } from '../wizard/ui';
import { historyManager } from '../history';

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
  /** UI mode (defaults to 'ink' for rich TUI, 'readline' for simple) */
  ui?: 'ink' | 'readline';
  /** Resume the most recent chat session */
  continue?: boolean;
}

/**
 * Chat command handler
 *
 * Usage:
 *   nimbus chat                    - Start interactive chat (Ink TUI)
 *   nimbus chat --model gpt-4o     - Use specific model
 *   nimbus chat -m "Hello"         - Send single message (non-interactive)
 *   nimbus chat --ui=readline      - Use simple readline interface (no React/Ink)
 */
export async function chatCommand(options: ChatOptions = {}): Promise<void> {
  // Check for NIMBUS.md and suggest init if missing (non-blocking)
  if (!options.nonInteractive && !options.message) {
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const nimbusPath = path.default.join(process.cwd(), 'NIMBUS.md');
      if (!fs.default.existsSync(nimbusPath)) {
        ui.print(
          ui.dim(
            'Tip: No NIMBUS.md found. Run `nimbus init` to set up project context for better results.'
          )
        );
        ui.newLine();
      }
    } catch {
      // Non-critical, ignore
    }
  }

  // Pre-flight: verify at least one LLM provider is available
  try {
    const { getAppContext } = await import('../app');
    const ctx = getAppContext();
    if (ctx?.router && ctx.router.getAvailableProviders().length === 0) {
      ui.newLine();
      ui.error('No LLM provider configured.');
      ui.newLine();
      ui.print('Set up a provider using one of these methods:');
      ui.print(`  ${ui.bold('nimbus login')}           — interactive setup wizard`);
      ui.print(`  ${ui.bold('export ANTHROPIC_API_KEY=sk-ant-...')}  — environment variable`);
      ui.print(`  ${ui.bold('export OPENAI_API_KEY=sk-...')}         — environment variable`);
      ui.newLine();
      return;
    }
  } catch {
    // Pre-flight is non-critical — let it fail later with a real error
  }

  // Resolve --continue: look up the most recent session ID
  let resumeSessionId: string | undefined;
  if (options.continue) {
    try {
      const { SessionManager } = await import('../sessions/manager');
      const sessionManager = SessionManager.getInstance();
      const recent = sessionManager.list();
      if (recent.length > 0) {
        resumeSessionId = recent[0].id;
      } else {
        ui.print(ui.dim('No previous session found. Starting a new session.'));
        ui.newLine();
      }
    } catch {
      // Session lookup is non-critical — fall through to a fresh session
    }
  }

  // Default to Ink TUI, fall back to readline if unavailable or explicitly requested.
  // If stdin is not a TTY (piped input), skip Ink and use readline mode.
  if (options.ui !== 'readline' && process.stdin.isTTY) {
    try {
      const { startInkChat } = await import('../ui/ink/index');
      await startInkChat({
        model: options.model,
        systemPrompt: options.systemPrompt,
        showTokenCount: options.showTokenCount,
        resumeSessionId,
      });
      return;
    } catch {
      // Ink TUI unavailable (compiled binary without React/Ink) — fall back to readline
      ui.print(
        ui.dim(
          'Using readline mode (same features, simpler UI). For the rich TUI, run: bun src/nimbus.ts'
        )
      );
      ui.newLine();
    }
  } else if (!process.stdin.isTTY && options.ui !== 'readline') {
    // Piped stdin detected — inform user
    ui.print(ui.dim('Non-interactive terminal detected, using readline mode.'));
    ui.newLine();
  }

  const startTime = Date.now();
  const entry = historyManager.addEntry('chat', [], {
    model: options.model,
    persona: options.persona,
  });

  try {
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
        const { configManager } = await import('../config/manager');
        if (!options.persona) {
          const mode = configManager.get('persona.mode');
          if (mode) {
            options.persona = mode;
          }
        }
        if (!options.verbosity) {
          const verbosity = configManager.get('persona.verbosity');
          if (verbosity) {
            options.verbosity = verbosity;
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
      historyManager.completeEntry(entry.id, 'success', Date.now() - startTime);
      return;
    }

    // Interactive mode: start chat UI
    const chatOptions: ChatUIOptions = {
      model: options.model,
      systemPrompt: options.systemPrompt || getPersonaSystemPrompt(persona, verbosity),
      showTokenCount: options.showTokenCount ?? false,
      resumeSessionId,
    };

    await startChat(chatOptions);
    historyManager.completeEntry(entry.id, 'success', Date.now() - startTime);
  } catch (error: any) {
    historyManager.completeEntry(entry.id, 'failure', Date.now() - startTime, {
      error: error.message,
    });

    // Detect auth/API key errors and suggest re-onboarding
    const errMsg = error.message || String(error);
    if (/auth|api.?key|unauthorized|forbidden|401|403|invalid.*key/i.test(errMsg)) {
      ui.newLine();
      ui.error('LLM authentication failed. Your API key may be invalid or expired.');
      ui.newLine();
      ui.print('To reconfigure:');
      ui.print(`  ${ui.bold('nimbus login')}  — re-run the setup wizard`);
      ui.print(`  ${ui.bold('export ANTHROPIC_API_KEY=sk-ant-...')}  — set a new key`);
      ui.newLine();
      return;
    }

    throw error;
  }
}

/**
 * Send a single message and display the response (non-interactive mode)
 *
 * Uses the full agent loop so that tool-calling is available even in
 * non-interactive / single-message mode (`nimbus chat -m "..."`).
 */
async function sendSingleMessage(
  message: string,
  options: ChatOptions,
  _persona: 'professional' | 'assistant' | 'expert',
  _verbosity: 'minimal' | 'normal' | 'detailed'
): Promise<void> {
  const { getAppContext } = await import('../app');
  const { runAgentLoop } = await import('../agent/loop');
  const { defaultToolRegistry } = await import('../tools/schemas/types');

  const ctx = getAppContext();
  if (!ctx) {
    ui.error('App not initialised. Cannot send message.');
    process.exit(1);
  }

  const outputParts: string[] = [];

  try {
    const result = await runAgentLoop(message, [], {
      router: ctx.router,
      toolRegistry: defaultToolRegistry,
      mode: 'build',
      model: options.model,
      cwd: process.cwd(),

      onText: text => {
        process.stdout.write(text);
        outputParts.push(text);
      },

      onToolCallStart: toolCall => {
        process.stderr.write(`\n[Tool: ${toolCall.name}]\n`);
      },

      onToolCallEnd: (_toolCall, toolResult) => {
        if (toolResult.isError) {
          process.stderr.write(`[Error: ${toolResult.error}]\n`);
        }
      },
    });

    // Final newline
    if (outputParts.length > 0) {
      console.log('');
    }

    if (result.interrupted) {
      ui.info('Operation interrupted.');
    }
  } catch (error: any) {
    ui.error(error.message || 'Failed to get response');
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
  verbosity: 'minimal' | 'normal' | 'detailed'
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
