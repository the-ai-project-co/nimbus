#!/usr/bin/env node
/**
 * Nimbus CLI — cross-platform ESM launcher.
 *
 * This is the `bin` entry used by npm on all platforms (including Windows).
 * It locates the package root (following symlinks so npm global installs work),
 * then spawns Node.js with the tsx ESM loader to execute the TypeScript source.
 *
 * Why .mjs instead of a shell script?
 *   On Windows, npm's cmd-shim cannot wrap a POSIX sh script. A Node.js ESM
 *   bin entry (#!/usr/bin/env node + .mjs) works on all platforms.
 */

import { spawnSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// L1: Enable ANSI color support on Windows terminals (Windows 10+ supports VT100).
// FORCE_COLOR=1 is the standard signal for chalk/ink/supports-color to emit ANSI codes.
// This must run before any child process is spawned so the env var is inherited.
if (process.platform === 'win32') {
  process.env.FORCE_COLOR ??= '1';
}

// Resolve the true package root, following symlinks (npm global installs symlink on POSIX).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = resolve(__dirname, '..');
const ENTRY = join(PKG_ROOT, 'src', 'nimbus.ts');

const passArgs = process.argv.slice(2);

function run(nodeArgs) {
  const result = spawnSync(process.execPath, [...nodeArgs, ENTRY, ...passArgs], {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? (result.error ? 1 : 0));
}

// 0. Pre-compiled dist (fastest — no tsx overhead)
const DIST_ENTRY = join(PKG_ROOT, 'dist', 'src', 'nimbus.js');
if (existsSync(DIST_ENTRY)) {
  const result = spawnSync(process.execPath, [DIST_ENTRY, ...passArgs], {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? (result.error ? 1 : 0));
}

// 1. tsx ESM loader bundled with this package (most reliable)
const TSX_BUNDLED = join(PKG_ROOT, 'node_modules', 'tsx', 'dist', 'esm', 'index.mjs');
if (existsSync(TSX_BUNDLED)) {
  run(['--loader', TSX_BUNDLED]);
}

// 2. tsx ESM loader from global npm
try {
  const globalRoot = execSync('npm root -g', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const TSX_GLOBAL = join(globalRoot, 'tsx', 'dist', 'esm', 'index.mjs');
  if (existsSync(TSX_GLOBAL)) {
    run(['--loader', TSX_GLOBAL]);
  }
} catch {
  // npm root -g failed — continue
}

// 3. Last resort: node --import tsx (Node >= 18.19, tsx must be available)
run(['--import', 'tsx']);
