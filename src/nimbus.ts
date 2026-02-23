#!/usr/bin/env bun
/**
 * Nimbus CLI — Main Entry Point
 *
 * Single-process embedded architecture. All modules (LLM, tools, state,
 * enterprise, engine, generator) run in-process — no HTTP services needed.
 *
 * Usage:
 *   bun src/nimbus.ts --version
 *   bun src/nimbus.ts --help
 *   bun src/nimbus.ts chat
 *   bun src/nimbus.ts ask "what is terraform"
 *   bun src/nimbus.ts generate terraform --provider aws
 *   bun src/nimbus.ts tf plan
 */

import { VERSION, BUILD_DATE } from './version';

async function main() {
  const args = process.argv.slice(2);

  // Handle --version and -v before anything else (no init needed)
  if (args[0] === '--version' || args[0] === '-v') {
    console.log(`nimbus ${VERSION}`);
    process.exit(0);
  }

  // Show help when explicitly requested
  if (args[0] === '--help' || args[0] === '-h') {
    args[0] = 'help';
  }

  // Default no-args: launch chat (or onboarding if first run)
  if (args.length === 0) {
    const { needsOnboarding } = await import('./commands/onboarding');
    if (needsOnboarding()) {
      args[0] = 'onboarding';
    } else {
      args[0] = 'chat';
    }
  }

  // Initialize the application (SQLite, LLM router, etc.)
  const { initApp, shutdownApp } = await import('./app');

  // Register shutdown hooks for clean exit
  const cleanup = async () => {
    await shutdownApp();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    // Commands that don't need full initialization
    const noInitCommands = new Set(['help', 'version', 'doctor', 'onboarding']);

    if (!noInitCommands.has(args[0])) {
      await initApp();
    }

    // Import and run CLI command router
    const { runCommand } = await import('./cli');
    await runCommand(args);

    // After onboarding, initialize app and launch chat
    if (args[0] === 'onboarding') {
      await initApp();
      await runCommand(['chat']);
    }
  } catch (error: any) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.error(`Error: Missing module — ${error.message}`);
      console.error('Run "bun install" to install dependencies.');
    } else {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  } finally {
    await shutdownApp();
  }
}

main();
