/**
 * App Lifecycle
 *
 * Handles initialization and shutdown of the embedded Nimbus application.
 * Lazily initializes the SQLite database and the LLM router.
 */

import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Database } from 'bun:sqlite';
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
 * Initialize the Nimbus application.
 *
 * - Ensures the ~/.nimbus directory exists.
 * - Opens (or creates) the local SQLite database via the state module.
 * - Loads config and creates the LLM router instance.
 *
 * This function is lazy: calling it multiple times returns the same context.
 */
export async function initApp(): Promise<AppContext> {
  if (appContext) {
    return appContext;
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
      try { defaultToolRegistry.register(tool); } catch { /* skip duplicates */ }
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

  try {
    appContext.db.close();
  } catch {
    // Database may already be closed; ignore.
  }

  appContext = null;
}
