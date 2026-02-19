#!/usr/bin/env node

/**
 * Nimbus CLI Launcher
 *
 * This is a thin Node.js-compatible launcher that delegates to the Bun-built
 * bundle.  Nimbus uses Bun-specific APIs (bun:sqlite, Bun.serve) so the main
 * bundle requires the Bun runtime.  When npm installs the package the shebang
 * on this file ensures it is invoked with Node, which then spawns `bun` to
 * execute the real entry point.
 *
 * If Bun is already the runtime (e.g. `bunx @nimbus-cli/nimbus`), we skip the
 * re-spawn and load the bundle directly.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const bundlePath = join(__dirname, "..", "dist", "index.js");

// Detect if we are already running inside Bun
const isRunningInBun =
  typeof globalThis.Bun !== "undefined" ||
  process.versions?.bun !== undefined;

if (isRunningInBun) {
  // Already in Bun -- dynamically import the bundle directly
  await import(bundlePath);
} else {
  // Running in Node -- delegate to Bun
  try {
    execFileSync("bun", [bundlePath, ...process.argv.slice(2)], {
      stdio: "inherit",
      env: process.env,
    });
  } catch (error) {
    if (error?.status !== undefined) {
      // bun ran but the command exited with a non-zero code; propagate it
      process.exit(error.status);
    }

    // bun is not installed or not on PATH
    console.error("");
    console.error(
      "Error: Nimbus requires the Bun runtime (https://bun.sh)."
    );
    console.error("");
    console.error("Install Bun with one of the following methods:");
    console.error("");
    console.error("  curl -fsSL https://bun.sh/install | bash");
    console.error("  npm install -g bun");
    console.error("  brew install oven-sh/bun/bun");
    console.error("");
    console.error(
      "After installing Bun, run your command again."
    );
    console.error("");
    process.exit(1);
  }
}
