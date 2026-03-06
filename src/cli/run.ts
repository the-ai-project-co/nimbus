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
 *   nimbus run --schema   # print the JSON output schema and exit
 */

import { runAgentLoop } from '../agent/loop';
import { createPermissionState, checkPermission } from '../agent/permissions';
import { defaultToolRegistry } from '../tools/schemas/types';
import { standardTools } from '../tools/schemas/standard';
import { devopsTools } from '../tools/schemas/devops';
import type { AgentMode } from '../agent/system-prompt';
import type { LLMRouter } from '../llm/router';
import { expandFileReferences } from '../agent/expand-files';

/** JSON output schema for `nimbus run --format json` */
export interface RunJsonOutput {
  success: boolean;       // whether the agent completed without error
  output: string;         // final text response from the agent
  cost: number;           // total cost in USD
  turns: number;          // number of LLM turns taken
  toolCalls: Array<{      // all tool calls made during the run
    name: string;
    success: boolean;
    durationMs: number;
  }>;
  errors: string[];       // any error messages encountered
  /** L2: Terraform plan summary extracted from plan output (CI-friendly) */
  planSummary?: {
    toAdd: number;
    toChange: number;
    toDestroy: number;
    raw: string;
  };
  /** M3: Summary of DevOps tools invoked during the run */
  devops_summary?: {
    tools_used: string[];
    tool_call_count: number;
    devops_tool_count: number;
  };
  /** M1: Infrastructure context active during the run */
  infraContext?: {
    terraformWorkspace?: string;
    kubectlContext?: string;
    awsAccount?: string;
  };
  /** M1: Unique DevOps tool names invoked */
  toolsUsed?: string[];
}

/** Options parsed from command-line arguments */
export interface RunOptions {
  /** The prompt to execute */
  prompt: string;
  /** Output format */
  format: 'text' | 'json' | 'table';
  /** Skip permission prompts — auto-approve everything (--non-interactive is an alias) */
  autoApprove: boolean;
  /** Read prompt from stdin */
  stdin: boolean;
  /** Parse stdin as JSON config object { prompt, mode, model, autoApprove, maxTurns } */
  stdinJson: boolean;
  /** Model override */
  model?: string;
  /** Agent mode override */
  mode: AgentMode;
  /** Maximum turns */
  maxTurns: number;
  /** G13: Abort agent loop after this many milliseconds */
  timeout?: number;
  /** G15: Print last tool output as JSON instead of prose */
  rawToolOutput?: boolean;
  /** G23: Print the JSON output schema and exit */
  schema?: boolean;
  /** M1: Dry-run mode — forces plan mode and instructs agent not to mutate anything */
  dryRun?: boolean;
  /** H3: Exit with code 1 on agent failure */
  exitOnError?: boolean;
  /** H3: kubectl context to inject before running */
  context?: string;
  /** H3: Terraform workspace to inject before running */
  workspace?: string;
  /** H3: Kubernetes namespace to inject before running */
  namespace?: string;
  /** H3: Webhook URL to POST result to after completion */
  notify?: string;
  /** H3: Slack webhook URL to POST formatted result to */
  notifySlack?: string;
  /** G16: Maximum cost in USD per session */
  budget?: number;
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
  let format: 'text' | 'json' | 'table' = 'text';
  let autoApprove = false;
  let stdin = false;
  let stdinJson = false;
  let model: string | undefined;
  let mode: AgentMode = 'build';
  let maxTurns = 50;
  let timeout: number | undefined;
  let rawToolOutput = false;
  let schema = false;
  let dryRun = false;
  let exitOnError = true; // C5: default true for CI/CD POSIX convention
  let context: string | undefined;
  let workspace: string | undefined;
  let namespace: string | undefined;
  let notify: string | undefined;
  let notifySlack: string | undefined;
  let budget: number | undefined;

  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--format':
        format = (args[++i] ?? 'text') as 'text' | 'json' | 'table';
        break;
      case '--json':
        format = 'json';
        break;
      case '--auto-approve':
      case '-y':
      case '--non-interactive':
        autoApprove = true;
        break;
      case '--stdin':
        stdin = true;
        break;
      case '--stdin-json':
        stdinJson = true;
        stdin = true; // also read stdin
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
      case '--timeout':
        // G13: timeout in seconds, converted to ms
        timeout = parseInt(args[++i] ?? '0', 10) * 1000;
        break;
      case '--raw-tool-output':
        // G15: print last tool output as JSON
        rawToolOutput = true;
        break;
      case '--schema':
        // G23: print the JSON output schema and exit
        schema = true;
        break;
      case '--json-schema':
        // GAP-16: print the stable JSON output schema and exit
        schema = true;
        break;
      case '--dry-run':
        // M1: dry-run forces plan mode — no mutations allowed
        dryRun = true;
        mode = 'plan';
        break;
      case '--exit-code-on-error':
        // H3: exit with code 1 on failure
        exitOnError = true;
        break;
      case '--no-exit-on-error':
        // C5: legacy scripts can opt out of exit-on-error
        exitOnError = false;
        break;
      case '--context':
        // H3: kubectl context
        context = args[++i];
        break;
      case '--workspace':
        // H3: terraform workspace
        workspace = args[++i];
        break;
      case '--namespace':
      case '-n':
        // H3: kubernetes namespace
        namespace = args[++i];
        break;
      case '--notify':
        // H3: webhook URL
        notify = args[++i];
        break;
      case '--notify-slack':
        // H3: slack webhook
        notifySlack = args[++i];
        break;
      case '--budget':
        // G16: cost budget in USD
        budget = parseFloat(args[++i] ?? '0');
        break;
      default:
        if (!arg.startsWith('-')) {
          positional.push(arg);
        }
        break;
    }
  }

  prompt = positional.join(' ');

  return { prompt, format, autoApprove, stdin, stdinJson, model, mode, maxTurns, timeout, rawToolOutput, schema, dryRun, exitOnError, context, workspace, namespace, notify, notifySlack, budget };
}

/**
 * Execute a non-interactive run.
 */
export async function executeRun(router: LLMRouter, options: RunOptions): Promise<RunResult> {
  // G23 / GAP-16: --schema / --json-schema flag: print the JSON output schema and exit immediately
  if (options.schema) {
    const schema = {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the agent completed without error' },
        output: { type: 'string', description: 'Final text response from the agent' },
        cost: { type: 'number', description: 'Total cost in USD' },
        turns: { type: 'number', description: 'Number of LLM turns taken' },
        toolCalls: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, success: { type: 'boolean' }, durationMs: { type: 'number' } } } },
        errors: { type: 'array', items: { type: 'string' }, description: 'Any error messages encountered' },
      },
      required: ['success', 'output', 'cost', 'turns', 'toolCalls', 'errors'],
    };
    process.stdout.write(JSON.stringify(schema, null, 2) + '\n');
    return {
      success: true,
      output: '',
      turns: 0,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      cost: 0,
      interrupted: false,
    };
  }

  // H3: Inject context/workspace/namespace into environment before agent loop
  if (options.context) process.env.KUBECTL_CONTEXT = options.context;
  if (options.workspace) process.env.TF_WORKSPACE = options.workspace;
  if (options.namespace) process.env.K8S_NAMESPACE = options.namespace;

  // Get prompt from stdin if requested
  let prompt = options.prompt;
  if (options.stdin && !prompt) {
    const stdinContent = await readStdin();

    // L5: --stdin-json support: parse stdin as { prompt, mode, model, autoApprove, maxTurns }
    if (options.stdinJson && stdinContent) {
      try {
        const config = JSON.parse(stdinContent) as Record<string, unknown>;
        if (typeof config.prompt === 'string') prompt = config.prompt;
        if (config.mode === 'plan' || config.mode === 'build' || config.mode === 'deploy') {
          options = { ...options, mode: config.mode };
        }
        if (typeof config.model === 'string') options = { ...options, model: config.model };
        if (typeof config.autoApprove === 'boolean') options = { ...options, autoApprove: config.autoApprove };
        if (typeof config.maxTurns === 'number') options = { ...options, maxTurns: config.maxTurns };
      } catch {
        // If JSON parse fails, treat stdin as raw prompt text
        prompt = stdinContent;
      }
    } else {
      prompt = stdinContent;
    }
  }

  // Expand @file references in the prompt
  prompt = expandFileReferences(prompt, process.cwd());

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
      try {
        registry.register(tool);
      } catch {
        /* skip duplicates */
      }
    }
  }

  // Set up permission state
  const permissionState = createPermissionState();

  // Collect output
  const outputParts: string[] = [];
  const tableRows: Array<{ tool: string; status: string; output: string }> = [];

  // G13: Set up timeout AbortController if --timeout was specified
  let timeoutAbortController: AbortController | undefined;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  if (options.timeout && options.timeout > 0) {
    timeoutAbortController = new AbortController();
    timeoutHandle = setTimeout(() => {
      timeoutAbortController!.abort();
      if (options.format === 'text') {
        process.stderr.write(`\n[Timeout: agent loop aborted after ${options.timeout! / 1000}s]\n`);
      }
    }, options.timeout);
  }

  // G15: Track last tool output for --raw-tool-output
  let lastToolName = '';
  let lastToolOutput = '';

  // G23: Track all tool calls for structured JSON output
  const allToolCalls: Array<{ name: string; input: Record<string, unknown>; output: string; isError: boolean }> = [];

  // H1: Discover infra context for CI/CD pipelines (best-effort, non-blocking)
  let infraContext: import('../cli/init').InfraContext | undefined;
  try {
    const { discoverInfraContext } = await import('../cli/init');
    infraContext = await discoverInfraContext(process.cwd());
  } catch { /* non-critical */ }

  // Run the agent loop
  const result = await runAgentLoop(prompt, [], {
    router,
    toolRegistry: registry,
    mode: options.mode,
    maxTurns: options.maxTurns,
    model: options.model,
    cwd: process.cwd(),
    signal: timeoutAbortController?.signal,
    dryRun: options.dryRun,
    costBudgetUSD: options.budget,
    infraContext,

    onText: text => {
      outputParts.push(text);
      if (options.format === 'text') {
        process.stdout.write(text);
      }
    },

    onToolCallStart: toolCall => {
      if (options.format === 'text') {
        process.stderr.write(`\n[Tool: ${toolCall.name}]\n`);
      }
    },

    onToolCallEnd: (toolCall, result) => {
      if (options.format === 'text' && result.isError) {
        process.stderr.write(`[Error: ${result.error}]\n`);
      }
      if (options.format === 'table') {
        tableRows.push({
          tool: toolCall.name,
          status: result.isError ? 'error' : 'ok',
          output: (result.output ?? result.error ?? '').slice(0, 80),
        });
      }
      // G15: track last tool output
      lastToolName = toolCall.name;
      lastToolOutput = result.isError ? (result.error ?? '') : (result.output ?? '');
      // G23: accumulate all tool calls for structured JSON output
      allToolCalls.push({
        name: toolCall.name,
        input: toolCall.input && typeof toolCall.input === 'object'
          ? (toolCall.input as Record<string, unknown>)
          : {},
        output: result.isError ? (result.error ?? '') : (result.output ?? ''),
        isError: result.isError ?? false,
      });
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

  // G13: Clear the timeout timer if we finished before it fired
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }

  const output = outputParts.join('');

  // G15: --raw-tool-output: print last tool call as JSON to stdout
  if (options.rawToolOutput && lastToolName) {
    console.log(JSON.stringify({ tool: lastToolName, output: lastToolOutput }));
    return {
      success: !result.interrupted,
      output,
      turns: result.turns,
      usage: result.usage,
      cost: result.totalCost,
      interrupted: result.interrupted,
    };
  }

  // Format output
  if (options.format === 'json') {
    // GAP-16 / G23: structured JSON output matching the stable RunJsonOutput schema
    // L2: Extract terraform plan summary from tool outputs for CI-friendly output
    let planSummary: RunJsonOutput['planSummary'];
    const tfPlanCall = allToolCalls.find(tc => tc.name === 'terraform' && tc.output && /Plan:/.test(tc.output));
    if (tfPlanCall?.output) {
      const planLine = tfPlanCall.output.match(/Plan:\s*(\d+)\s*to add,\s*(\d+)\s*to change,\s*(\d+)\s*to destroy/i);
      if (planLine) {
        planSummary = {
          toAdd: parseInt(planLine[1]),
          toChange: parseInt(planLine[2]),
          toDestroy: parseInt(planLine[3]),
          raw: planLine[0],
        };
      }
    }
    const jsonResult: RunJsonOutput = {
      success: !result.interrupted,
      output,
      cost: result.totalCost ?? 0,
      turns: result.turns ?? 0,
      toolCalls: allToolCalls.map(tc => ({
        name: tc.name,
        success: !tc.isError,
        durationMs: 0,
      })),
      errors: allToolCalls.filter(tc => tc.isError).map(tc => tc.output).filter(Boolean),
      ...(planSummary ? { planSummary } : {}),
    };
    // M3: Build devops_summary from tool calls
    const DEVOPS_TOOL_NAMES = new Set([
      'terraform', 'kubectl', 'helm', 'aws', 'gcloud', 'az',
      'docker', 'secrets', 'cicd', 'monitor', 'gitops', 'cloud_action',
      'logs', 'certs', 'mesh', 'cfn', 'k8s_rbac', 'generate_infra',
      'kubectl_context', 'helm_values', 'cost_estimate', 'cloud_discover',
    ]);
    const toolsUsed = [...new Set(allToolCalls.map(tc => tc.name))];
    const devopsToolsUsed = toolsUsed.filter(t => DEVOPS_TOOL_NAMES.has(t));
    if (devopsToolsUsed.length > 0) {
      jsonResult.devops_summary = {
        tools_used: devopsToolsUsed,
        tool_call_count: allToolCalls.length,
        devops_tool_count: allToolCalls.filter(tc => DEVOPS_TOOL_NAMES.has(tc.name)).length,
      };
    }
    // M1: Add infraContext and toolsUsed fields
    jsonResult.toolsUsed = toolsUsed;
    if (infraContext) {
      jsonResult.infraContext = {
        terraformWorkspace: infraContext.terraformWorkspace,
        kubectlContext: infraContext.kubectlContext,
        awsAccount: infraContext.awsAccount,
      };
    }
    console.log(JSON.stringify(jsonResult, null, 2));
  } else if (options.format === 'text') {
    // Text was already streamed above
    console.log(''); // Final newline
  } else if (options.format === 'table') {
    // ASCII table of tool calls
    const COL_TOOL = 30;
    const COL_STATUS = 6;
    const COL_OUTPUT = 80;
    const divider = `${'-'.repeat(COL_TOOL + 2)}+${'-'.repeat(COL_STATUS + 2)}+${'-'.repeat(COL_OUTPUT + 2)}`;
    const pad = (s: string, n: number) => s.slice(0, n).padEnd(n);
    console.log(divider);
    console.log(`| ${pad('Tool', COL_TOOL)} | ${pad('Status', COL_STATUS)} | ${pad('Output', COL_OUTPUT)} |`);
    console.log(divider);
    for (const row of tableRows) {
      console.log(`| ${pad(row.tool, COL_TOOL)} | ${pad(row.status, COL_STATUS)} | ${pad(row.output, COL_OUTPUT)} |`);
    }
    console.log(divider);
    console.log('');
    // Also print final text output
    if (output) process.stdout.write(output + '\n');
  }

  const runResult: RunResult = {
    success: !result.interrupted,
    output,
    turns: result.turns,
    usage: result.usage,
    cost: result.totalCost,
    interrupted: result.interrupted,
  };

  // H3: Fire webhook notifications after run completes
  const duration = Date.now(); // approximate; real duration would need a start time
  const notifyPayload = {
    success: runResult.success,
    output: runResult.output.slice(0, 2000), // truncate for webhook
    cost: runResult.cost,
    duration,
  };

  if (options.notify) {
    try {
      await fetch(options.notify, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifyPayload),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Webhook failure is non-fatal
      process.stderr.write(`[Warning: notification webhook failed]\n`);
    }
  }

  if (options.notifySlack) {
    try {
      const slackPayload = {
        text: runResult.success
          ? `:white_check_mark: *Nimbus run succeeded*\n${runResult.output.slice(0, 500)}`
          : `:x: *Nimbus run failed*\n${runResult.output.slice(0, 500)}`,
        attachments: [
          {
            fields: [
              { title: 'Cost', value: `$${runResult.cost.toFixed(4)}`, short: true },
              { title: 'Turns', value: String(runResult.turns), short: true },
            ],
          },
        ],
      };
      await fetch(options.notifySlack, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackPayload),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      process.stderr.write(`[Warning: Slack notification failed]\n`);
    }
  }

  // H3: Exit with code 1 if the run failed and --exit-code-on-error is set
  if (options.exitOnError && !runResult.success) {
    process.exit(1);
  }

  return runResult;
}

/**
 * Read all input from stdin.
 */
async function readStdin(): Promise<string> {
  // If stdin is a TTY (no pipe), resolve immediately with empty string
  if (process.stdin.isTTY) {
    return '';
  }

  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    // 30-second timeout for stdin reads to prevent hanging
    const timeout = setTimeout(() => {
      process.stdin.removeAllListeners();
      resolve(Buffer.concat(chunks).toString('utf-8').trim());
    }, 30_000);

    process.stdin.on('data', chunk => chunks.push(Buffer.from(chunk)));

    process.stdin.on('end', () => {
      clearTimeout(timeout);
      resolve(Buffer.concat(chunks).toString('utf-8').trim());
    });

    process.stdin.on('error', err => {
      clearTimeout(timeout);
      // On error, use whatever we've collected so far
      if (chunks.length > 0) {
        resolve(Buffer.concat(chunks).toString('utf-8').trim());
      } else {
        reject(err);
      }
    });
  });
}
