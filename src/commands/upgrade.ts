/**
 * Upgrade Command
 *
 * Checks for the latest Nimbus version and offers to upgrade.
 * Supports npm registry, GitHub Releases binary download, and Homebrew.
 *
 * Detects the installation method and executes the appropriate upgrade
 * command automatically (with user confirmation unless --force is passed).
 */

import { VERSION } from '../version';

/** GitHub repository used for release downloads. */
const GITHUB_REPO = 'the-ai-project-co/nimbus';

/** npm package name (may not be published yet). */
const NPM_PACKAGE = '@astron/nimbus';

/** Homebrew tap name for the formula. */
const HOMEBREW_TAP = 'the-ai-project-co/tap/nimbus';

export interface UpgradeOptions {
  /** Skip confirmation prompt */
  force?: boolean;
  /** Check only, don't actually upgrade */
  check?: boolean;
}

/** Detected installation method for nimbus. */
type InstallMethod = 'homebrew' | 'npm' | 'bun' | 'binary' | 'unknown';

// ---------------------------------------------------------------------------
// ANSI helpers (avoid importing the full wizard/ui for this standalone command)
// ---------------------------------------------------------------------------

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function bold(s: string): string {
  return `${c.bold}${s}${c.reset}`;
}
function green(s: string): string {
  return `${c.green}${s}${c.reset}`;
}
function yellow(s: string): string {
  return `${c.yellow}${s}${c.reset}`;
}
function red(s: string): string {
  return `${c.red}${s}${c.reset}`;
}
function dim(s: string): string {
  return `${c.dim}${s}${c.reset}`;
}
function cyan(s: string): string {
  return `${c.cyan}${s}${c.reset}`;
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

const SPINNER_FRAMES = [
  '\u28CB',
  '\u2819',
  '\u2839',
  '\u2838',
  '\u283C',
  '\u2834',
  '\u2826',
  '\u2827',
  '\u2807',
  '\u280F',
];

interface Spinner {
  update(msg: string): void;
  success(msg: string): void;
  fail(msg: string): void;
}

function startSpinner(message: string): Spinner {
  let frame = 0;
  let currentMsg = message;

  const interval = setInterval(() => {
    const f = cyan(SPINNER_FRAMES[frame % SPINNER_FRAMES.length]);
    process.stderr.write(`\r\x1b[K  ${f} ${currentMsg}`);
    frame++;
  }, 80);

  return {
    update(msg: string) {
      currentMsg = msg;
    },
    success(msg: string) {
      clearInterval(interval);
      process.stderr.write(`\r\x1b[K  ${green('\u2714')} ${msg}\n`);
    },
    fail(msg: string) {
      clearInterval(interval);
      process.stderr.write(`\r\x1b[K  ${red('\u2716')} ${msg}\n`);
    },
  };
}

// ---------------------------------------------------------------------------
// Confirmation prompt
// ---------------------------------------------------------------------------

async function confirmPrompt(message: string, defaultYes = true): Promise<boolean> {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const hint = defaultYes ? '[Y/n]' : '[y/N]';

  return new Promise(resolve => {
    rl.question(`  ${message} ${hint} `, answer => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (!trimmed) {
        resolve(defaultYes);
      } else {
        resolve(trimmed === 'y' || trimmed === 'yes');
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Version fetching
// ---------------------------------------------------------------------------

/**
 * Try fetching the latest version from the npm registry.
 * Returns the version string on success, or `null` when the package is not
 * published or the registry is unreachable.
 */
async function fetchNpmVersion(): Promise<string | null> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${NPM_PACKAGE}/latest`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Try fetching the latest release tag from GitHub Releases.
 * Returns the tag name (e.g. `'v0.3.0'`) on success, or `null` when the
 * API is unreachable or there are no releases.
 */
async function fetchGitHubReleaseVersion(): Promise<string | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { tag_name?: string };
    // Strip leading 'v' from tag name (e.g. 'v0.3.0' -> '0.3.0')
    const tag = data.tag_name ?? null;
    return tag ? tag.replace(/^v/, '') : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Installation method detection
// ---------------------------------------------------------------------------

interface DetectionResult {
  method: InstallMethod;
  /** Human-readable description of what was detected. */
  detail: string;
}

/**
 * Detect how nimbus was installed by probing Homebrew, npm, bun, and the
 * binary path.  Detection commands are given a short timeout so they never
 * block the CLI for too long.
 */
async function detectInstallMethod(): Promise<DetectionResult> {
  const { execSync } = await import('node:child_process');
  const execOpts = {
    encoding: 'utf-8' as const,
    stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
    timeout: 10_000,
  };

  // 1. Homebrew
  try {
    const brewList = execSync('brew list --formula 2>/dev/null', execOpts);
    if (brewList.includes('nimbus')) {
      return { method: 'homebrew', detail: `Homebrew formula (${HOMEBREW_TAP})` };
    }
  } catch {
    /* not homebrew */
  }

  // 2. npm global
  try {
    const npmList = execSync(`npm list -g ${NPM_PACKAGE} 2>/dev/null`, execOpts);
    if (npmList.includes(NPM_PACKAGE)) {
      return { method: 'npm', detail: `npm global package (${NPM_PACKAGE})` };
    }
  } catch {
    /* not npm */
  }

  // 3. bun global
  try {
    const bunList = execSync('bun pm ls -g 2>/dev/null', execOpts);
    if (bunList.includes(NPM_PACKAGE)) {
      return { method: 'bun', detail: `bun global package (${NPM_PACKAGE})` };
    }
  } catch {
    /* not bun */
  }

  // 4. Compiled binary (not running through bun/node)
  const argv0 = process.argv[0] ?? '';
  const isBinary = !argv0.includes('bun') && !argv0.includes('node');
  if (isBinary) {
    return { method: 'binary', detail: `standalone binary (${argv0 || '/usr/local/bin/nimbus'})` };
  }

  return { method: 'unknown', detail: 'could not determine installation method' };
}

// ---------------------------------------------------------------------------
// Upgrade execution helpers
// ---------------------------------------------------------------------------

/**
 * Run a shell command, streaming output to the terminal.
 * Throws on non-zero exit code.
 */
async function runShellCommand(cmd: string, timeoutMs = 120_000): Promise<void> {
  const { execSync } = await import('node:child_process');
  execSync(cmd, { stdio: 'inherit', timeout: timeoutMs });
}

/**
 * Verify the upgrade by checking the installed version.
 * Returns the new version string, or null if verification failed.
 */
async function verifyUpgrade(): Promise<string | null> {
  const { execSync } = await import('node:child_process');
  try {
    const output = execSync('nimbus --version 2>/dev/null', {
      encoding: 'utf-8' as const,
      stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
      timeout: 10_000,
    });
    // Output looks like "nimbus 0.3.0" or just "0.3.0"
    const match = output.trim().match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Execute the upgrade via Homebrew.
 */
async function upgradeViaHomebrew(spinner: Spinner): Promise<void> {
  spinner.update('Updating Homebrew tap...');
  try {
    await runShellCommand(`brew upgrade ${HOMEBREW_TAP} 2>&1`);
  } catch {
    // If the tap formula isn't found, try the short name
    spinner.update('Trying brew upgrade nimbus...');
    await runShellCommand('brew upgrade nimbus 2>&1');
  }
}

/**
 * Execute the upgrade via npm.
 */
async function upgradeViaNpm(spinner: Spinner): Promise<void> {
  spinner.update(`Installing ${NPM_PACKAGE}@latest via npm...`);
  await runShellCommand(`npm install -g ${NPM_PACKAGE}@latest 2>&1`);
}

/**
 * Execute the upgrade via bun.
 */
async function upgradeViaBun(spinner: Spinner): Promise<void> {
  spinner.update(`Installing ${NPM_PACKAGE}@latest via bun...`);
  await runShellCommand(`bun install -g ${NPM_PACKAGE}@latest 2>&1`);
}

/**
 * Execute the upgrade by downloading a compiled binary from GitHub Releases.
 */
async function upgradeViaBinaryDownload(latestVersion: string, spinner: Spinner): Promise<void> {
  const platform =
    process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : null;
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : null;

  if (!platform || !arch) {
    throw new Error(
      `Unsupported platform/architecture: ${process.platform}/${process.arch}. ` +
        `Please download the binary manually from https://github.com/${GITHUB_REPO}/releases/latest`
    );
  }

  const assetName = `nimbus-${platform}-${arch}`;
  const downloadUrl = `https://github.com/${GITHUB_REPO}/releases/download/v${latestVersion}/${assetName}`;
  const binaryPath = process.argv[0] || '/usr/local/bin/nimbus';
  const tmpPath = `${binaryPath}.upgrade-tmp`;

  spinner.update(`Downloading ${assetName} v${latestVersion}...`);

  // Download to a temp file, make executable, then atomically replace
  const cmd = [
    `curl -fsSL "${downloadUrl}" -o "${tmpPath}"`,
    `chmod +x "${tmpPath}"`,
    `mv "${tmpPath}" "${binaryPath}"`,
  ].join(' && ');

  try {
    await runShellCommand(cmd, 120_000);
  } catch (err) {
    // Clean up temp file on failure
    try {
      const fs = await import('node:fs');
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch {
      /* best effort */
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Main upgrade command
// ---------------------------------------------------------------------------

/**
 * Check for and install the latest version of Nimbus.
 */
export async function upgradeCommand(options: UpgradeOptions = {}): Promise<void> {
  console.log(`Current version: ${bold(VERSION)}`);
  console.log('Checking for updates...\n');

  // Try npm registry first, then fall back to GitHub Releases
  let latestVersion = await fetchNpmVersion();
  let source: 'npm' | 'github' | 'none' = latestVersion ? 'npm' : 'none';

  if (!latestVersion) {
    latestVersion = await fetchGitHubReleaseVersion();
    if (latestVersion) {
      source = 'github';
    }
  }

  if (!latestVersion) {
    console.log(
      'No updates available (package not yet published to npm, and no GitHub releases found).'
    );
    console.log(`You are on version ${VERSION}.`);
    return;
  }

  if (latestVersion === VERSION) {
    console.log(green(`You're already on the latest version (${VERSION}).`));
    return;
  }

  // Simple semver comparison to check if remote is actually newer
  const currentParts = VERSION.split('.').map(Number);
  const remoteParts = latestVersion.split('.').map(Number);
  let isNewer = false;
  for (let i = 0; i < 3; i++) {
    if ((remoteParts[i] ?? 0) > (currentParts[i] ?? 0)) {
      isNewer = true;
      break;
    }
    if ((remoteParts[i] ?? 0) < (currentParts[i] ?? 0)) {
      break;
    }
  }

  if (!isNewer) {
    console.log(green(`You're already on the latest version (${VERSION}).`));
    return;
  }

  console.log(
    `${yellow('New version available:')} ${dim(VERSION)} ${dim('->')} ${bold(green(latestVersion))}`
  );
  if (source === 'github') {
    console.log(dim(`  Source: GitHub Releases (https://github.com/${GITHUB_REPO}/releases)`));
  }
  console.log('');

  if (options.check) {
    return;
  }

  // Detect how nimbus was installed
  const detection = await detectInstallMethod();
  console.log(`Detected installation: ${bold(detection.detail)}`);
  console.log('');

  // For unknown install methods, just print manual instructions
  if (detection.method === 'unknown') {
    printManualInstructions(source);
    return;
  }

  // Ask for confirmation unless --force
  if (!options.force) {
    const proceed = await confirmPrompt(`Upgrade nimbus ${VERSION} -> ${latestVersion}?`, true);
    if (!proceed) {
      console.log('\nUpgrade cancelled.');
      return;
    }
    console.log('');
  }

  // Execute the upgrade
  const spinner = startSpinner('Upgrading nimbus...');

  try {
    switch (detection.method) {
      case 'homebrew':
        await upgradeViaHomebrew(spinner);
        break;
      case 'npm':
        await upgradeViaNpm(spinner);
        break;
      case 'bun':
        await upgradeViaBun(spinner);
        break;
      case 'binary':
        if (source !== 'github') {
          spinner.fail('Binary upgrade requires GitHub Releases, but no release was found.');
          printManualInstructions(source);
          return;
        }
        await upgradeViaBinaryDownload(latestVersion, spinner);
        break;
    }

    spinner.success('Upgrade command completed');
  } catch (error: any) {
    const msg = error.message || String(error);
    spinner.fail(`Upgrade failed: ${msg}`);
    console.log('');

    // Provide recovery instructions
    console.log(yellow('You can try upgrading manually:'));
    printUpgradeInstructionForMethod(detection.method, latestVersion, source);
    return;
  }

  // Verify the upgrade succeeded
  console.log('');
  const verifySpinner = startSpinner('Verifying upgrade...');
  const newVersion = await verifyUpgrade();

  if (newVersion && newVersion === latestVersion) {
    verifySpinner.success(`Successfully upgraded to ${bold(green(newVersion))}`);
  } else if (newVersion && newVersion !== VERSION) {
    verifySpinner.success(`Upgraded to ${bold(green(newVersion))}`);
  } else if (detection.method === 'binary') {
    // For binary upgrades, the current process is the old binary so
    // `nimbus --version` will report the new version only on next launch.
    verifySpinner.success(`Binary replaced. Restart nimbus to use ${bold(green(latestVersion))}.`);
  } else {
    verifySpinner.fail('Could not verify the new version. Please run `nimbus --version` to check.');
  }
}

// ---------------------------------------------------------------------------
// Helper: print manual instructions (fallback for unknown install method)
// ---------------------------------------------------------------------------

function printManualInstructions(source: 'npm' | 'github' | 'none'): void {
  console.log('Could not detect installation method. Upgrade manually:');
  console.log('');
  console.log(`  ${dim('# npm')}`);
  console.log(`  npm install -g ${NPM_PACKAGE}@latest`);
  console.log('');
  console.log(`  ${dim('# bun')}`);
  console.log(`  bun install -g ${NPM_PACKAGE}@latest`);
  console.log('');
  console.log(`  ${dim('# Homebrew')}`);
  console.log(`  brew upgrade ${HOMEBREW_TAP}`);

  if (source === 'github') {
    console.log('');
    console.log(`  ${dim('# Binary download')}`);
    console.log(`  https://github.com/${GITHUB_REPO}/releases/latest`);
  }
}

/**
 * Print the specific upgrade instruction for a detected method (used after
 * an automatic upgrade fails).
 */
function printUpgradeInstructionForMethod(
  method: InstallMethod,
  latestVersion: string,
  source: 'npm' | 'github' | 'none'
): void {
  switch (method) {
    case 'homebrew':
      console.log(`  brew upgrade ${HOMEBREW_TAP}`);
      break;
    case 'npm':
      console.log(`  npm install -g ${NPM_PACKAGE}@latest`);
      break;
    case 'bun':
      console.log(`  bun install -g ${NPM_PACKAGE}@latest`);
      break;
    case 'binary': {
      const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
      const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
      const assetName = `nimbus-${platform}-${arch}`;
      const url = `https://github.com/${GITHUB_REPO}/releases/download/v${latestVersion}/${assetName}`;
      console.log(
        `  curl -fsSL "${url}" -o /usr/local/bin/nimbus && chmod +x /usr/local/bin/nimbus`
      );
      break;
    }
    default:
      printManualInstructions(source);
      break;
  }
}
