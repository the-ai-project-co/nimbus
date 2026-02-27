#!/usr/bin/env bun
/**
 * Build Script for Nimbus CLI
 *
 * Compiles the embedded Nimbus CLI into a single binary using `bun build --compile`.
 *
 * Usage:
 *   bun src/build.ts                    # Build for current platform
 *   bun src/build.ts --target linux     # Cross-compile for Linux
 *   bun src/build.ts --target darwin    # Cross-compile for macOS
 *   bun src/build.ts --all             # Build for all platforms
 */

import { $ } from 'bun';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const DIST = path.join(ROOT, 'dist');
const ENTRY = path.join(ROOT, 'src', 'nimbus.ts');

interface BuildTarget {
  name: string;
  bunTarget: string;
  outputName: string;
}

const TARGETS: BuildTarget[] = [
  { name: 'linux-x64', bunTarget: 'bun-linux-x64', outputName: 'nimbus-linux-x64' },
  { name: 'linux-arm64', bunTarget: 'bun-linux-arm64', outputName: 'nimbus-linux-arm64' },
  { name: 'darwin-x64', bunTarget: 'bun-darwin-x64', outputName: 'nimbus-darwin-x64' },
  { name: 'darwin-arm64', bunTarget: 'bun-darwin-arm64', outputName: 'nimbus-darwin-arm64' },
];

// All packages including Ink/React are bundled for the full TUI experience.
// react-devtools-core (optional Ink dep) gets a stub created before build.
const EXTERNALS: string[] = [];

async function build(target?: string) {
  // Ensure dist directory exists
  if (!fs.existsSync(DIST)) {
    fs.mkdirSync(DIST, { recursive: true });
  }

  // Create a stub for react-devtools-core so Ink's optional import resolves
  const stubDir = path.join(ROOT, 'node_modules', 'react-devtools-core');
  const stubCreated = !fs.existsSync(stubDir);
  if (stubCreated) {
    fs.mkdirSync(stubDir, { recursive: true });
    fs.writeFileSync(
      path.join(stubDir, 'package.json'),
      JSON.stringify({
        name: 'react-devtools-core',
        version: '0.0.0',
        main: 'index.js',
      })
    );
    fs.writeFileSync(
      path.join(stubDir, 'index.js'),
      'module.exports = { initialize() {}, connectToDevTools() {} };\n'
    );
  }

  // Stamp build date into version.ts
  const versionPath = path.join(ROOT, 'src', 'version.ts');
  const versionContent = fs.readFileSync(versionPath, 'utf-8');
  const buildDate = new Date().toISOString().split('T')[0];
  const stamped = versionContent.replace('__BUILD_DATE__', buildDate);
  fs.writeFileSync(versionPath, stamped);

  try {
    if (target === '--all' || target === 'all') {
      // Build for all platforms
      console.log('Building for all platforms...\n');
      for (const t of TARGETS) {
        await buildForTarget(t);
      }
    } else if (target) {
      // Build for specific target
      const matched = TARGETS.find(t => t.name === target || t.name.startsWith(target));
      if (!matched) {
        console.error(`Unknown target: ${target}`);
        console.log('Available targets:', TARGETS.map(t => t.name).join(', '));
        process.exit(1);
      }
      await buildForTarget(matched);
    } else {
      // Build for current platform
      console.log('Building for current platform...\n');
      const outfile = path.join(DIST, 'nimbus');
      await $`bun build ${ENTRY} --compile --outfile ${outfile} ${EXTERNALS}`;
      const stats = fs.statSync(outfile);
      console.log(`\nBuild complete: ${outfile} (${formatSize(stats.size)})`);
    }
  } finally {
    // Restore version.ts to template form
    fs.writeFileSync(versionPath, versionContent);

    // Clean up react-devtools-core stub if we created it
    if (stubCreated && fs.existsSync(stubDir)) {
      fs.rmSync(stubDir, { recursive: true });
    }
  }

  if (failedTargets.length > 0) {
    console.error(`\nBuild failed for: ${failedTargets.join(', ')}`);
    process.exit(1);
  }
}

const failedTargets: string[] = [];

async function buildForTarget(target: BuildTarget) {
  console.log(`Building ${target.name}...`);
  const outfile = path.join(DIST, target.outputName);

  try {
    await $`bun build ${ENTRY} --compile --target ${target.bunTarget} --outfile ${outfile} ${EXTERNALS}`;
    const stats = fs.statSync(outfile);
    console.log(`  -> ${outfile} (${formatSize(stats.size)})`);
  } catch (error: any) {
    console.error(`  -> FAILED: ${error.message}`);
    failedTargets.push(target.name);
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Parse CLI args
const args = process.argv.slice(2);
const target = args.find(a => a === '--all' || a === 'all') || args.find(a => !a.startsWith('-'));

build(target);
