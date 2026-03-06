/**
 * App Lifecycle
 *
 * Handles initialization and shutdown of the embedded Nimbus application.
 * Lazily initializes the SQLite database and the LLM router.
 */

import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Database } from './compat/sqlite';
import type { LLMRouter } from './llm/router';

/** The resolved path to ~/.nimbus */
const NIMBUS_DIR = join(homedir(), '.nimbus');

/** Holds the initialized app context, or null if not yet initialized. */
let appContext: AppContext | null = null;

/** The shape returned by initApp(). */
export interface AppContext {
  /** The bun:sqlite Database instance for local state. */
  readonly db: Database;
  /** The LLM router for provider-agnostic completions. */
  readonly router: LLMRouter;
  /** The nimbus home directory path. */
  readonly nimbusDir: string;
}

/**
 * Startup warnings collected during initApp() — surfaced as first system
 * message when the TUI starts (Gap 19).
 */
export let startupWarnings: string[] = [];

/**
 * Initialize the Nimbus application.
 *
 * - Ensures the ~/.nimbus directory exists.
 * - Opens (or creates) the local SQLite database via the state module.
 * - Loads config and creates the LLM router instance.
 * - Runs pre-flight health checks and exits on critical failures (Gap 19).
 *
 * This function is lazy: calling it multiple times returns the same context.
 */
export async function initApp(): Promise<AppContext> {
  if (appContext) {
    return appContext;
  }

  // Gap 19: Pre-flight startup checks (fast, no network calls)
  try {
    const { runStartupChecks } = await import('./commands/doctor');
    const issues = await runStartupChecks();
    if (issues.critical.length > 0) {
      const lines = [
        '\x1b[31m\x1b[1mNimbus cannot start:\x1b[0m',
        ...issues.critical.map(i => `  \x1b[31m✗ ${i}\x1b[0m`),
        '',
        '\x1b[2mRun `nimbus doctor` for detailed diagnosis.\x1b[0m',
      ];
      process.stderr.write(lines.join('\n') + '\n');
      process.exit(1);
    }
    startupWarnings = issues.warnings;
  } catch {
    // Startup checks are non-critical — never let them block startup
  }

  // H2: Warn if no NIMBUS.md found in the current project directory
  try {
    const cwd = process.cwd();
    const nimbusMdPaths = [join(cwd, 'NIMBUS.md'), join(cwd, '.nimbus', 'NIMBUS.md')];
    if (!nimbusMdPaths.some(p => existsSync(p))) {
      startupWarnings.push('No NIMBUS.md found — run /init to set up project context for better results.');
    }
  } catch {
    // Non-critical
  }

  // M3: Load per-project config and surface protected environments as warnings
  try {
    const { loadProjectConfig } = await import('./config/types');
    const projectConfig = loadProjectConfig(process.cwd());
    if (projectConfig?.protectedEnvironments && projectConfig.protectedEnvironments.length > 0) {
      startupWarnings.push(
        `Protected environments: ${projectConfig.protectedEnvironments.join(', ')} — destructive operations require confirmation.`
      );
    }
  } catch {
    // Non-critical
  }

  // Ensure ~/.nimbus directory exists
  if (!existsSync(NIMBUS_DIR)) {
    mkdirSync(NIMBUS_DIR, { recursive: true });
  }

  // Initialize the SQLite database
  const { getDb } = await import('./state/db');
  const db = getDb();

  // Load LLM config and create router
  const { loadLLMConfig } = await import('./llm/config-loader');
  const { LLMRouter: LLMRouterClass } = await import('./llm/router');
  const llmConfig = loadLLMConfig();
  const router = new LLMRouterClass(llmConfig);

  // Register all built-in tools into the global registry
  const { defaultToolRegistry } = await import('./tools/schemas/types');
  if (defaultToolRegistry.size === 0) {
    const { standardTools } = await import('./tools/schemas/standard');
    const { devopsTools } = await import('./tools/schemas/devops');
    for (const tool of [...standardTools, ...devopsTools]) {
      try {
        defaultToolRegistry.register(tool);
      } catch {
        /* skip duplicates */
      }
    }
  }

  // Connect MCP servers and register their tools (non-critical)
  try {
    const { MCPManager } = await import('./mcp/manager');
    const mcpManager = new MCPManager();
    await mcpManager.loadConfig(process.cwd());
    if (mcpManager.serverCount > 0) {
      await mcpManager.connectAll();
      mcpManager.registerTools(defaultToolRegistry);
    }
  } catch (mcpErr) {
    // MCP is non-critical — tools work fine without it, but warn the user
    const msg = mcpErr instanceof Error ? mcpErr.message : String(mcpErr);
    if (process.stderr.isTTY) {
      process.stderr.write(
        `\x1b[33m  Warning: MCP server loading failed: ${msg}. External tools from .mcp.json will not be available.\x1b[0m\n`
      );
    }
  }

  appContext = { db, router, nimbusDir: NIMBUS_DIR };
  return appContext;
}

/**
 * Get the current app context without initializing.
 * Returns null if initApp() has not been called yet.
 */
export function getAppContext(): AppContext | null {
  return appContext;
}

/**
 * Gracefully shut down the Nimbus application.
 *
 * Closes the database connection and clears the cached context so that
 * a subsequent call to initApp() will re-initialize from scratch.
 */
export async function shutdownApp(): Promise<void> {
  if (!appContext) {
    return;
  }

  // Flush any pending debounced SQLite writes before closing the DB
  try {
    const { SessionManager } = await import('./sessions/manager');
    SessionManager.getInstance().flushAll();
  } catch {
    // SessionManager may not have been used — ignore
  }

  try {
    appContext.db.close();
  } catch {
    // Database may already be closed; ignore.
  }

  appContext = null;
}
