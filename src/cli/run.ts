/**
 * Non-Interactive CLI Mode
 *
 * Runs the Nimbus agent with a prompt from the command line.
 * Outputs results to stdout and exits.
 *
 * Usage:
 *   nimbus run "deploy the staging environment"
 *   nimbus run "fix the failing tests" --auto-approve
 *   echo "analyze this repo" | nimbus run --stdin
 *   nimbus run "estimate costs" --format json --model anthropic/claude-haiku-4-5
 */

import { runAgentLoop } from '../agent/loop';
import { createPermissionState, checkPermission, approveForSession } from '../agent/permissions';
import { defaultToolRegistry } from '../tools/schemas/types';
import { standardTools } from '../tools/schemas/standard';
import { devopsTools } from '../tools/schemas/devops';
import type { AgentMode } from '../agent/system-prompt';
import type { ToolDefinition, ToolResult } from '../tools/schemas/types';
import type { LLMRouter } from '../llm/router';

/** Options parsed from command-line arguments */
export interface RunOptions {
  /** The prompt to execute */
  prompt: string;
  /** Output format */
  format: 'text' | 'json';
  /** Skip permission prompts — auto-approve everything */
  autoApprove: boolean;
  /** Read prompt from stdin */
  stdin: boolean;
  /** Model override */
  model?: string;
  /** Agent mode override */
  mode: AgentMode;
  /** Maximum turns */
  maxTurns: number;
}

/** Result of a non-interactive run */
export interface RunResult {
  /** Whether the run completed successfully */
  success: boolean;
  /** The final output text */
  output: string;
  /** Number of turns taken */
  turns: number;
  /** Token usage */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Cost in USD */
  cost: number;
  /** Whether the run was interrupted */
  interrupted: boolean;
}

/**
 * Parse `nimbus run` CLI arguments.
 */
export function parseRunArgs(args: string[]): RunOptions {
  let prompt = '';
  let format: 'text' | 'json' = 'text';
  let autoApprove = false;
  let stdin = false;
  let model: string | undefined;
  let mode: AgentMode = 'build';
  let maxTurns = 50;

  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--format':
        format = (args[++i] ?? 'text') as 'text' | 'json';
        break;
      case '--json':
        format = 'json';
        break;
      case '--auto-approve':
      case '-y':
        autoApprove = true;
        break;
      case '--stdin':
        stdin = true;
        break;
      case '--model':
        model = args[++i];
        break;
      case '--mode':
        mode = (args[++i] ?? 'build') as AgentMode;
        break;
      case '--max-turns':
        maxTurns = parseInt(args[++i] ?? '50', 10);
        break;
      default:
        if (!arg.startsWith('-')) {
          positional.push(arg);
        }
        break;
    }
  }

  prompt = positional.join(' ');

  return { prompt, format, autoApprove, stdin, model, mode, maxTurns };
}

/**
 * Execute a non-interactive run.
 */
export async function executeRun(
  router: LLMRouter,
  options: RunOptions,
): Promise<RunResult> {
  // Get prompt from stdin if requested
  let prompt = options.prompt;
  if (options.stdin && !prompt) {
    prompt = await readStdin();
  }

  if (!prompt) {
    return {
      success: false,
      output: 'Error: No prompt provided. Usage: nimbus run "your prompt"',
      turns: 0,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      cost: 0,
      interrupted: false,
    };
  }

  // Set up tool registry
  const registry = defaultToolRegistry;
  if (registry.size === 0) {
    // Register all built-in tools
    for (const tool of [...standardTools, ...devopsTools]) {
      try { registry.register(tool); } catch { /* skip duplicates */ }
    }
  }

  // Set up permission state
  const permissionState = createPermissionState();

  // Collect output
  const outputParts: string[] = [];

  // Run the agent loop
  const result = await runAgentLoop(prompt, [], {
    router,
    toolRegistry: registry,
    mode: options.mode,
    maxTurns: options.maxTurns,
    model: options.model,
    cwd: process.cwd(),

    onText: (text) => {
      outputParts.push(text);
      if (options.format === 'text') {
        process.stdout.write(text);
      }
    },

    onToolCallStart: (toolCall) => {
      if (options.format === 'text') {
        process.stderr.write(`\n[Tool: ${toolCall.name}]\n`);
      }
    },

    onToolCallEnd: (toolCall, result) => {
      if (options.format === 'text' && result.isError) {
        process.stderr.write(`[Error: ${result.error}]\n`);
      }
    },

    checkPermission: async (tool, input) => {
      if (options.autoApprove) {
        return 'allow';
      }
      const decision = checkPermission(tool, input, permissionState);
      if (decision === 'ask') {
        // In non-interactive mode without --auto-approve, deny by default
        return 'deny';
      }
      return decision;
    },
  });

  const output = outputParts.join('');

  // Format output
  if (options.format === 'json') {
    const jsonResult = {
      success: !result.interrupted,
      output,
      turns: result.turns,
      usage: result.usage,
      cost: result.totalCost,
      interrupted: result.interrupted,
    };
    console.log(JSON.stringify(jsonResult, null, 2));
  } else if (options.format === 'text') {
    // Text was already streamed above
    console.log(''); // Final newline
  }

  return {
    success: !result.interrupted,
    output,
    turns: result.turns,
    usage: result.usage,
    cost: result.totalCost,
    interrupted: result.interrupted,
  };
}

/**
 * Read all input from stdin.
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  return new Promise((resolve) => {
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8').trim()));

    // If stdin is a TTY (no pipe), resolve immediately
    if (process.stdin.isTTY) {
      resolve('');
    }
  });
}
