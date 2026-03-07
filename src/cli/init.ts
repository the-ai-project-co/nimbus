/**
 * Project Initialization & Auto-Detection
 *
 * Scaffolds a new Nimbus project by detecting the existing project type,
 * infrastructure tooling, cloud providers, and development conventions.
 * Generates a NIMBUS.md file and .nimbus/ configuration directory.
 *
 * Usage:
 *   nimbus init
 *   nimbus init --force       # overwrite existing NIMBUS.md
 *   nimbus init --quiet       # suppress console output
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const _execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Detected language / runtime of the project */
export type ProjectType =
  | 'typescript'
  | 'javascript'
  | 'go'
  | 'python'
  | 'rust'
  | 'java'
  | 'unknown';

/** Infrastructure tool category */
export type InfraType = 'terraform' | 'kubernetes' | 'helm' | 'docker' | 'cicd';

/** Cloud provider identifier */
export type CloudProvider = 'aws' | 'gcp' | 'azure';

/** Complete detection result for a project directory */
export interface ProjectDetection {
  /** Inferred project name (directory basename) */
  projectName: string;
  /** Primary language / runtime */
  projectType: ProjectType;
  /** Infrastructure tools found */
  infraTypes: InfraType[];
  /** Cloud providers detected from config or Terraform */
  cloudProviders: CloudProvider[];
  /** Whether the directory is a git repository */
  hasGit: boolean;
  /** Node.js package manager, if applicable */
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun';
  /** Test framework name, if detected */
  testFramework?: string;
  /** Linter name, if detected */
  linter?: string;
  /** Formatter name, if detected */
  formatter?: string;
}

/** Options accepted by {@link runInit} */
export interface InitOptions {
  /** Working directory (defaults to `process.cwd()`) */
  cwd?: string;
  /** Overwrite an existing NIMBUS.md without prompting */
  force?: boolean;
  /** Suppress all console output */
  quiet?: boolean;
  /**
   * Merge mode (M2): append a ## Local Overrides section to an existing
   * NIMBUS.md and create .nimbus/local.md instead of overwriting the file.
   */
  merge?: boolean;
}

/** Value returned by {@link runInit} on success */
export interface InitResult {
  /** Full detection results */
  detection: ProjectDetection;
  /** Absolute paths of files created during init */
  filesCreated: string[];
  /** Absolute path to the generated NIMBUS.md */
  nimbusmdPath: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a file or directory exists at `filePath`.
 * Swallows all errors and returns `false` on failure.
 */
function exists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/**
 * List immediate children of `dir`, returning an empty array when the
 * directory does not exist or is unreadable.
 */
function listDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * Read a file as UTF-8 text.  Returns an empty string on failure.
 */
function readText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Recursively collect file names matching a predicate.
 * Searches at most `maxDepth` levels deep and stops after `limit` matches.
 */
function findFiles(
  dir: string,
  predicate: (name: string) => boolean,
  maxDepth = 3,
  limit = 50
): string[] {
  const results: string[] = [];

  function walk(current: string, depth: number): void {
    if (depth > maxDepth || results.length >= limit) {
      return;
    }

    for (const entry of listDir(current)) {
      if (results.length >= limit) {
        return;
      }

      // Skip heavy directories that would slow detection
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'vendor') {
        continue;
      }

      const full = path.join(current, entry);

      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          walk(full, depth + 1);
        } else if (predicate(entry)) {
          results.push(full);
        }
      } catch {
        // Permission or broken symlink -- skip
      }
    }
  }

  walk(dir, 0);
  return results;
}

// ---------------------------------------------------------------------------
// Detection functions
// ---------------------------------------------------------------------------

/**
 * Detect the primary project type from marker files in `dir`.
 *
 * Priority order: TypeScript > JavaScript > Go > Python > Rust > Java > unknown
 */
export function detectProjectType(dir: string): ProjectType {
  try {
    if (exists(path.join(dir, 'tsconfig.json'))) {
      return 'typescript';
    }
    if (exists(path.join(dir, 'package.json'))) {
      return 'javascript';
    }
    if (exists(path.join(dir, 'go.mod'))) {
      return 'go';
    }
    if (
      exists(path.join(dir, 'pyproject.toml')) ||
      exists(path.join(dir, 'setup.py')) ||
      exists(path.join(dir, 'requirements.txt'))
    ) {
      return 'python';
    }
    if (exists(path.join(dir, 'Cargo.toml'))) {
      return 'rust';
    }
    if (
      exists(path.join(dir, 'pom.xml')) ||
      exists(path.join(dir, 'build.gradle')) ||
      exists(path.join(dir, 'build.gradle.kts'))
    ) {
      return 'java';
    }
  } catch {
    // Fall through to unknown
  }

  return 'unknown';
}

/**
 * Detect which infrastructure tools are present in `dir`.
 *
 * Scans for Terraform files, Kubernetes manifests, Helm charts,
 * Docker files, and CI/CD configuration.
 */
export function detectInfrastructure(dir: string): InfraType[] {
  const found: Set<InfraType> = new Set();

  try {
    // Terraform -- look for any .tf files
    const tfFiles = findFiles(dir, name => name.endsWith('.tf'), 3, 5);
    if (tfFiles.length > 0) {
      found.add('terraform');
    }

    // Kubernetes -- look for YAML files containing common K8s markers
    const yamlFiles = findFiles(
      dir,
      name => name.endsWith('.yaml') || name.endsWith('.yml'),
      3,
      30
    );
    for (const yamlFile of yamlFiles) {
      const content = readText(yamlFile);
      if (
        content.includes('kind: Deployment') ||
        content.includes('kind: Service') ||
        content.includes('apiVersion:')
      ) {
        found.add('kubernetes');
        break;
      }
    }

    // Helm
    if (findFiles(dir, name => name === 'Chart.yaml', 3, 1).length > 0) {
      found.add('helm');
    }

    // Docker
    const entries = listDir(dir);
    if (
      entries.some(
        e => e === 'Dockerfile' || e === 'docker-compose.yml' || e === 'docker-compose.yaml'
      )
    ) {
      found.add('docker');
    }
    // Also check for a docker/ directory with Dockerfiles
    if (exists(path.join(dir, 'docker'))) {
      const dockerDir = listDir(path.join(dir, 'docker'));
      if (
        dockerDir.some(e => e.startsWith('Dockerfile') || e.endsWith('.yml') || e.endsWith('.yaml'))
      ) {
        found.add('docker');
      }
    }

    // CI/CD
    if (
      exists(path.join(dir, '.github', 'workflows')) ||
      exists(path.join(dir, '.gitlab-ci.yml')) ||
      exists(path.join(dir, 'Jenkinsfile')) ||
      exists(path.join(dir, '.circleci'))
    ) {
      found.add('cicd');
    }
  } catch {
    // Return whatever we collected so far
  }

  return Array.from(found);
}

/**
 * Detect cloud providers referenced in Terraform files or local credentials.
 *
 * Checks both `.tf` file contents and well-known credential locations
 * or environment variables.
 */
export function detectCloudProviders(dir: string): CloudProvider[] {
  const found: Set<CloudProvider> = new Set();

  try {
    // --- Scan Terraform files for provider blocks ---
    const tfFiles = findFiles(dir, name => name.endsWith('.tf'), 3, 20);

    for (const tfFile of tfFiles) {
      const content = readText(tfFile);

      if (content.includes('provider "aws"') || content.includes("provider 'aws'")) {
        found.add('aws');
      }
      if (content.includes('provider "google"') || content.includes("provider 'google'")) {
        found.add('gcp');
      }
      if (content.includes('provider "azurerm"') || content.includes("provider 'azurerm'")) {
        found.add('azure');
      }
    }

    // --- Check environment variables ---
    if (process.env['AWS_ACCESS_KEY_ID'] || process.env['AWS_PROFILE']) {
      found.add('aws');
    }
    if (process.env['GOOGLE_APPLICATION_CREDENTIALS'] || process.env['GCLOUD_PROJECT']) {
      found.add('gcp');
    }
    if (process.env['AZURE_SUBSCRIPTION_ID'] || process.env['ARM_SUBSCRIPTION_ID']) {
      found.add('azure');
    }

    // --- Check local credential files ---
    const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
    if (home) {
      if (
        exists(path.join(home, '.aws', 'credentials')) ||
        exists(path.join(home, '.aws', 'config'))
      ) {
        found.add('aws');
      }
      if (exists(path.join(home, '.config', 'gcloud'))) {
        found.add('gcp');
      }
      if (exists(path.join(home, '.azure'))) {
        found.add('azure');
      }
    }
  } catch {
    // Return whatever we collected
  }

  return Array.from(found);
}

/** Live infrastructure context gathered by querying actual CLI tools */
export interface InfraContext {
  terraformWorkspace?: string;
  terraformBackend?: string;
  kubectlContext?: string;
  kubectlClusters?: string[];
  helmReleases?: string[];
  awsAccount?: string;
  awsRegion?: string;
  /** G13: Named AWS profiles from ~/.aws/config (max 10) */
  awsProfiles?: Array<{ profile: string; account?: string; region?: string }>;
  gcpProject?: string;
  /** G16: Number of Kubernetes namespaces in the current cluster */
  k8sNamespaceCount?: number;
  /** G16: Number of Kubernetes deployments across all namespaces */
  k8sDeploymentCount?: number;
  /** CI/CD pipeline system detected in the project directory (G9). */
  cicdPipeline?: string;
}

/**
 * Discover live infrastructure context by querying CLI tools.
 * All queries are best-effort with short timeouts.
 */
export async function discoverInfraContext(dir: string): Promise<InfraContext> {
  const { execFileSync } = await import('node:child_process');
  const ctx: InfraContext = {};

  // Terraform workspace (only if .terraform exists)
  if (exists(path.join(dir, '.terraform'))) {
    try {
      ctx.terraformWorkspace = execFileSync('terraform', ['workspace', 'show'], {
        cwd: dir, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch { /* ignore */ }
  }

  // kubectl context
  try {
    ctx.kubectlContext = execFileSync('kubectl', ['config', 'current-context'], {
      encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const clustersOut = execFileSync('kubectl', ['config', 'get-clusters'], {
      encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    ctx.kubectlClusters = clustersOut.split('\n').slice(1).map(s => s.trim()).filter(Boolean);
  } catch { /* ignore */ }

  // Helm releases
  try {
    const helmOut = execFileSync('helm', ['list', '-A', '--output=json'], {
      encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const releases = JSON.parse(helmOut || '[]') as Array<{ name: string; namespace: string }>;
    ctx.helmReleases = releases.map(r => `${r.name} (${r.namespace})`);
  } catch { /* ignore */ }

  // AWS account + region
  try {
    const awsIdOut = execFileSync('aws', ['sts', 'get-caller-identity', '--output=json'], {
      encoding: 'utf-8', timeout: 8000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const awsId = JSON.parse(awsIdOut);
    ctx.awsAccount = awsId.Account;
  } catch { /* ignore */ }

  try {
    ctx.awsRegion = execFileSync('aws', ['configure', 'get', 'region'], {
      encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim() || process.env.AWS_DEFAULT_REGION;
  } catch {
    ctx.awsRegion = process.env.AWS_DEFAULT_REGION;
  }

  // G13: Discover all AWS profiles from ~/.aws/config
  try {
    const { readFileSync } = await import('node:fs');
    const { homedir } = await import('node:os');
    const awsConfigPath = path.join(homedir(), '.aws', 'config');
    if (exists(awsConfigPath)) {
      const awsConfig = readFileSync(awsConfigPath, 'utf-8');
      const profiles: Array<{ profile: string; account?: string; region?: string }> = [];
      const profileRegex = /^\[(?:profile\s+)?(\S+)\]/gm;
      let match;
      while ((match = profileRegex.exec(awsConfig)) !== null) {
        const profileName = match[1];
        if (profileName === 'default') continue; // handled separately
        // Extract region from the profile block
        const blockStart = match.index + match[0].length;
        const nextBlock = awsConfig.indexOf('\n[', blockStart);
        const block = awsConfig.slice(blockStart, nextBlock === -1 ? undefined : nextBlock);
        const regionMatch = block.match(/^\s*region\s*=\s*(.+)$/m);
        profiles.push({ profile: profileName, region: regionMatch?.[1]?.trim() });
      }
      if (profiles.length > 0) ctx.awsProfiles = profiles.slice(0, 10); // max 10 profiles
    }
  } catch { /* ignore */ }

  // GCP project
  try {
    const proj = execFileSync('gcloud', ['config', 'get-value', 'project'], {
      encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (proj && proj !== '(unset)') ctx.gcpProject = proj;
  } catch { /* ignore */ }

  // G16: Count K8s namespaces and deployments
  if (ctx.kubectlContext) {
    try {
      const nsOut = execFileSync('kubectl', ['get', 'namespaces', '--no-headers'], {
        encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
      });
      const nsCount = nsOut.trim().split('\n').filter(Boolean).length;
      ctx.k8sNamespaceCount = nsCount;
    } catch { /* ignore */ }
    try {
      const deplOut = execFileSync('kubectl', ['get', 'deployments', '-A', '--no-headers'], {
        encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
      });
      const deplCount = deplOut.trim().split('\n').filter(Boolean).length;
      ctx.k8sDeploymentCount = deplCount;
    } catch { /* ignore */ }
  }

  // CI/CD pipeline detection (G9)
  const cicdFiles: Array<[string, string]> = [
    ['.github/workflows', 'GitHub Actions'],
    ['.gitlab-ci.yml', 'GitLab CI'],
    ['.circleci', 'CircleCI'],
    ['Jenkinsfile', 'Jenkins'],
    ['.buildkite', 'Buildkite'],
    ['azure-pipelines.yml', 'Azure Pipelines'],
  ];
  for (const [file, name] of cicdFiles) {
    if (exists(path.join(dir, file))) {
      ctx.cicdPipeline = name;
      break;
    }
  }

  return ctx;
}

/**
 * Format an InfraContext into a compact single-line summary for injection
 * into agent messages (Gaps 7 & 10).
 */
export function formatInfraContext(ctx: InfraContext): string {
  const parts: string[] = [];
  if (ctx.terraformWorkspace) parts.push(`tf-workspace: ${ctx.terraformWorkspace}`);
  if (ctx.kubectlContext) parts.push(`k8s-context: ${ctx.kubectlContext}`);
  if (ctx.helmReleases && ctx.helmReleases.length > 0) {
    parts.push(`helm-releases: ${ctx.helmReleases.slice(0, 3).join(', ')}${ctx.helmReleases.length > 3 ? ` +${ctx.helmReleases.length - 3} more` : ''}`);
  }
  if (ctx.awsAccount) parts.push(`aws-account: ${ctx.awsAccount}`);
  if (ctx.awsRegion) parts.push(`aws-region: ${ctx.awsRegion}`);
  if (ctx.gcpProject) parts.push(`gcp-project: ${ctx.gcpProject}`);
  if (ctx.cicdPipeline) parts.push(`cicd: ${ctx.cicdPipeline}`);
  return parts.length > 0 ? parts.join(' | ') : 'no infra context detected';
}

/**
 * Detect which Node.js package manager is used in `dir`.
 *
 * Lock-file priority: bun > yarn > pnpm > npm.
 * Returns `undefined` when no lock file is found.
 */
export function detectPackageManager(dir: string): 'npm' | 'yarn' | 'pnpm' | 'bun' | undefined {
  try {
    if (exists(path.join(dir, 'bun.lock')) || exists(path.join(dir, 'bun.lockb'))) {
      return 'bun';
    }
    if (exists(path.join(dir, 'yarn.lock'))) {
      return 'yarn';
    }
    if (exists(path.join(dir, 'pnpm-lock.yaml'))) {
      return 'pnpm';
    }
    if (exists(path.join(dir, 'package-lock.json'))) {
      return 'npm';
    }
  } catch {
    // fall through
  }
  return undefined;
}

/**
 * Detect the test framework from `package.json` dependencies or
 * lock-file presence.
 *
 * Returns the framework name as a human-readable string, or `undefined`
 * if none is detected.
 */
export function detectTestFramework(dir: string): string | undefined {
  try {
    const pkgPath = path.join(dir, 'package.json');
    if (!exists(pkgPath)) {
      return undefined;
    }

    const pkg = JSON.parse(readText(pkgPath)) as Record<string, unknown>;
    const allDeps = {
      ...(pkg['dependencies'] as Record<string, string> | undefined),
      ...(pkg['devDependencies'] as Record<string, string> | undefined),
    };

    if ('vitest' in allDeps) {
      return 'vitest';
    }
    if ('jest' in allDeps) {
      return 'jest';
    }
    if ('mocha' in allDeps) {
      return 'mocha';
    }
    if ('@playwright/test' in allDeps) {
      return 'playwright';
    }

    // Bun ships its own test runner -- detect via lock file
    if (exists(path.join(dir, 'bun.lock')) || exists(path.join(dir, 'bun.lockb'))) {
      return 'bun:test';
    }
  } catch {
    // fall through
  }

  // Non-JS projects
  if (exists(path.join(dir, 'go.mod'))) {
    return 'go test';
  }
  if (exists(path.join(dir, 'Cargo.toml'))) {
    return 'cargo test';
  }
  if (exists(path.join(dir, 'pyproject.toml')) || exists(path.join(dir, 'setup.py'))) {
    const pyproject = readText(path.join(dir, 'pyproject.toml'));
    if (pyproject.includes('pytest')) {
      return 'pytest';
    }
    if (exists(path.join(dir, 'pytest.ini')) || exists(path.join(dir, 'setup.cfg'))) {
      return 'pytest';
    }
    return 'unittest';
  }

  return undefined;
}

/**
 * Detect the linter used in the project.
 *
 * Checks for ESLint, Biome, golangci-lint, Ruff, and Clippy configuration.
 */
export function detectLinter(dir: string): string | undefined {
  try {
    const entries = listDir(dir);

    // ESLint (various config formats)
    if (entries.some(e => e.startsWith('.eslintrc') || e.startsWith('eslint.config'))) {
      return 'eslint';
    }

    // Biome
    if (entries.includes('biome.json') || entries.includes('biome.jsonc')) {
      return 'biome';
    }

    // Go -- golangci-lint
    if (entries.includes('.golangci.yml') || entries.includes('.golangci.yaml')) {
      return 'golangci-lint';
    }

    // Python -- ruff
    if (entries.includes('ruff.toml') || entries.includes('.ruff.toml')) {
      return 'ruff';
    }

    // Check pyproject.toml for ruff or flake8
    if (exists(path.join(dir, 'pyproject.toml'))) {
      const pyproject = readText(path.join(dir, 'pyproject.toml'));
      if (pyproject.includes('[tool.ruff]')) {
        return 'ruff';
      }
      if (pyproject.includes('[tool.flake8]')) {
        return 'flake8';
      }
    }

    // Rust -- clippy is part of the toolchain, detect via Cargo.toml
    if (exists(path.join(dir, 'Cargo.toml'))) {
      return 'clippy';
    }
  } catch {
    // fall through
  }
  return undefined;
}

/**
 * Detect the code formatter used in the project.
 *
 * Checks for Prettier, Biome, gofmt, rustfmt, and Black configuration.
 */
export function detectFormatter(dir: string): string | undefined {
  try {
    const entries = listDir(dir);

    // Prettier
    if (entries.some(e => e.startsWith('.prettierrc') || e.startsWith('prettier.config'))) {
      return 'prettier';
    }

    // Biome doubles as formatter
    if (entries.includes('biome.json') || entries.includes('biome.jsonc')) {
      return 'biome';
    }

    // Go -- gofmt is built-in
    if (exists(path.join(dir, 'go.mod'))) {
      return 'gofmt';
    }

    // Rust -- rustfmt
    if (exists(path.join(dir, 'rustfmt.toml')) || exists(path.join(dir, '.rustfmt.toml'))) {
      return 'rustfmt';
    }
    if (exists(path.join(dir, 'Cargo.toml'))) {
      return 'rustfmt';
    }

    // Python -- black / ruff format
    if (exists(path.join(dir, 'pyproject.toml'))) {
      const pyproject = readText(path.join(dir, 'pyproject.toml'));
      if (pyproject.includes('[tool.black]')) {
        return 'black';
      }
      if (pyproject.includes('[tool.ruff]')) {
        return 'ruff';
      }
    }
  } catch {
    // fall through
  }
  return undefined;
}

/**
 * Run the full project detection pipeline on `dir`.
 *
 * Aggregates results from all individual detection functions into a
 * single {@link ProjectDetection} object.
 */
export function detectProject(dir: string): ProjectDetection {
  const resolvedDir = path.resolve(dir);

  return {
    projectName: path.basename(resolvedDir),
    projectType: detectProjectType(resolvedDir),
    infraTypes: detectInfrastructure(resolvedDir),
    cloudProviders: detectCloudProviders(resolvedDir),
    hasGit: exists(path.join(resolvedDir, '.git')),
    packageManager: detectPackageManager(resolvedDir),
    testFramework: detectTestFramework(resolvedDir),
    linter: detectLinter(resolvedDir),
    formatter: detectFormatter(resolvedDir),
  };
}

// ---------------------------------------------------------------------------
// L4: NIMBUS.md validation
// ---------------------------------------------------------------------------

/**
 * L4: Validate NIMBUS.md content for common issues.
 * Returns an array of warning strings (empty if valid).
 */
export function validateNimbusMd(content: string): string[] {
  const warnings: string[] = [];

  // Check size
  if (content.length > 50 * 1024) {
    warnings.push(`NIMBUS.md is large (${Math.round(content.length / 1024)}KB). Consider splitting into multiple files.`);
  }

  // Check for unclosed code fences
  const fenceMatches = (content.match(/^```/gm) ?? []).length;
  if (fenceMatches % 2 !== 0) {
    warnings.push('NIMBUS.md has an unclosed code fence (``` count is odd).');
  }

  // Check section headers are valid markdown
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#') && !/^#{1,6} \S/.test(line)) {
      warnings.push(`Line ${i + 1}: Invalid heading format: "${line.slice(0, 50)}"`);
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * Produce the contents of a `NIMBUS.md` file from detection results.
 *
 * The generated markdown serves as both human-readable documentation
 * and machine-readable project metadata for the Nimbus agent.
 */
export function generateNimbusMd(detection: ProjectDetection, _dir: string, infraCtx?: InfraContext): string {
  const lines: string[] = [];

  // --- Header ---
  lines.push(`# ${detection.projectName}`);
  lines.push('');
  lines.push('> Auto-generated by `nimbus init`. Edit freely to refine agent behaviour.');
  lines.push('');

  // --- Project Overview ---
  lines.push('## Project Overview');
  lines.push('');
  lines.push(`- **Type:** ${detection.projectType}`);
  if (detection.packageManager) {
    lines.push(`- **Package Manager:** ${detection.packageManager}`);
  }
  if (detection.testFramework) {
    lines.push(`- **Test Framework:** ${detection.testFramework}`);
  }
  if (detection.hasGit) {
    lines.push('- **Version Control:** git');
  }
  lines.push('');

  // --- Infrastructure ---
  if (detection.infraTypes.length > 0 || detection.cloudProviders.length > 0) {
    lines.push('## Infrastructure');
    lines.push('');
    if (detection.infraTypes.length > 0) {
      lines.push(`- **Tools:** ${detection.infraTypes.join(', ')}`);
    }
    if (detection.cloudProviders.length > 0) {
      lines.push(`- **Cloud Providers:** ${detection.cloudProviders.join(', ')}`);
    }
    if (infraCtx) {
      if (infraCtx.terraformWorkspace) {
        lines.push(`- **Terraform Workspace:** ${infraCtx.terraformWorkspace}`);
      }
      if (infraCtx.kubectlContext) {
        lines.push(`- **Kubernetes Context:** ${infraCtx.kubectlContext}`);
      }
      if (infraCtx.kubectlClusters && infraCtx.kubectlClusters.length > 0) {
        lines.push(`- **Kubernetes Clusters:** ${infraCtx.kubectlClusters.join(', ')}`);
      }
      if (infraCtx.helmReleases && infraCtx.helmReleases.length > 0) {
        lines.push(`- **Helm Releases:** ${infraCtx.helmReleases.slice(0, 5).join(', ')}${infraCtx.helmReleases.length > 5 ? ` (+${infraCtx.helmReleases.length - 5} more)` : ''}`);
      }
      if (infraCtx.awsAccount) {
        lines.push(`- **AWS Account:** ${infraCtx.awsAccount}${infraCtx.awsRegion ? ` (${infraCtx.awsRegion})` : ''}`);
      }
      // G13: List named AWS profiles
      if (infraCtx.awsProfiles && infraCtx.awsProfiles.length > 0) {
        lines.push(`- **AWS Profiles:** ${infraCtx.awsProfiles.map(p => p.profile).join(', ')}`);
      }
      if (infraCtx.gcpProject) {
        lines.push(`- **GCP Project:** ${infraCtx.gcpProject}`);
      }
      // G16: K8s namespace and deployment counts
      if (infraCtx.k8sNamespaceCount !== undefined) {
        lines.push(`- **K8s Namespaces:** ${infraCtx.k8sNamespaceCount}`);
      }
      if (infraCtx.k8sDeploymentCount !== undefined) {
        lines.push(`- **K8s Deployments:** ${infraCtx.k8sDeploymentCount}`);
      }
      // G9: CI/CD pipeline
      if (infraCtx.cicdPipeline) {
        lines.push(`- **CI/CD:** ${infraCtx.cicdPipeline}`);
      }
    }
    lines.push('');
  }

  // --- CI/CD (M4) ---
  if (infraCtx?.cicdPipeline) {
    lines.push('## CI/CD');
    lines.push('');
    const pipelineDir: Record<string, string> = {
      'GitHub Actions': '.github/workflows/',
      'GitLab CI': '.gitlab-ci.yml',
      'CircleCI': '.circleci/',
      'Jenkins': 'Jenkinsfile',
    };
    const pipelinePath = pipelineDir[infraCtx.cicdPipeline] ?? '';
    lines.push(`Pipeline: ${infraCtx.cicdPipeline}${pipelinePath ? ` (${pipelinePath})` : ''}`);
    lines.push('Convention: Always run `terraform plan` in CI before apply. Apply only on main branch merge.');
    lines.push('');
  }

  // --- Conventions ---
  if (detection.linter || detection.formatter) {
    lines.push('## Conventions');
    lines.push('');
    if (detection.linter) {
      lines.push(`- **Linter:** ${detection.linter}`);
    }
    if (detection.formatter) {
      lines.push(`- **Formatter:** ${detection.formatter}`);
    }
    lines.push('');
  }

  // --- Environments (GAP-22) ---
  lines.push('## Environments');
  lines.push('');
  lines.push('| Name | Terraform Workspace | Kubernetes Context | Protected |');
  lines.push('|------|--------------------|--------------------|-----------|');
  lines.push('| dev  | dev                |                    | false     |');
  lines.push('| staging | staging        |                    | false     |');
  lines.push('| prod | prod               |                    | true      |');
  lines.push('');

  // --- Safety Rules ---
  lines.push('## Safety Rules');
  lines.push('');
  lines.push('- Protected branches: `main`, `master`');
  lines.push('- Protected Kubernetes namespaces: `production`, `kube-system`');
  lines.push('- Always preview before `terraform apply`');
  lines.push('- Run tests before committing');
  lines.push('- Never store secrets in source control');
  lines.push('');

  // --- Guardrails (G5): DevOps-specific rules when infra is detected ---
  const hasInfra = detection.infraTypes.length > 0 || detection.cloudProviders.length > 0;
  if (hasInfra) {
    lines.push('## Guardrails');
    lines.push('');
    lines.push('- Never run `terraform destroy` without explicit confirmation');
    lines.push('- Protected Kubernetes namespaces: `production`, `kube-system`, `monitoring`');
    lines.push('- Always show terraform plan before apply');
    lines.push('- Confirm target cloud account and region before resource creation');
    lines.push('- Protected environments: any workspace/namespace containing `prod`, `prd`, `production`');
    lines.push('');
  }

  // --- Forbidden placeholder (G5) ---
  lines.push('## Forbidden');
  lines.push('');
  lines.push('<!-- List operations Nimbus must never perform in this project -->');
  lines.push('<!-- Example: - Never destroy the production database -->');
  lines.push('');

  // --- Custom Instructions ---
  lines.push('## Custom Instructions');
  lines.push('');
  lines.push('<!-- Add project-specific instructions for the Nimbus agent here -->');
  lines.push('');

  // --- G18: Runbooks ---
  const runbookDirs = ['docs/runbooks', 'runbooks', '.github/runbooks', '.nimbus/runbooks'];
  const foundRunbooks: string[] = [];
  for (const dir of runbookDirs) {
    const fullPath = path.join(_dir, dir);
    if (fs.existsSync(fullPath)) {
      try {
        const files = fs.readdirSync(fullPath).filter(f => /\.(md|yaml|yml)$/.test(f));
        foundRunbooks.push(...files.map(f => `- ${dir}/${f}`));
      } catch { /* non-critical */ }
    }
  }
  const runbookSection = foundRunbooks.length > 0
    ? foundRunbooks.join('\n') + '\n\nRefer to these runbooks for incident response and operational procedures.'
    : '<!-- Add runbook references, e.g.:\n- docs/runbooks/cert-rotation.md -->';
  lines.push('## Runbooks');
  lines.push('');
  lines.push(runbookSection);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate the contents of `.nimbus/config.yaml`.
 *
 * Produces a valid YAML string without requiring an external YAML library.
 */
function generateConfigYaml(detection: ProjectDetection): string {
  const lines: string[] = [];

  lines.push('# Nimbus project configuration');
  lines.push('# See https://nimbus.dev/docs/config for all options');
  lines.push('');
  lines.push('# Default LLM model for agent interactions');
  lines.push('default_model: anthropic/claude-sonnet-4');
  lines.push('');
  lines.push('# Default agent mode: build | plan | debug | review');
  lines.push('default_mode: build');
  lines.push('');
  lines.push('# Project metadata');
  lines.push('project:');
  lines.push(`  name: ${detection.projectName}`);
  lines.push(`  type: ${detection.projectType}`);
  if (detection.packageManager) {
    lines.push(`  package_manager: ${detection.packageManager}`);
  }
  lines.push('');

  // Permissions
  lines.push('# Permission rules control what the agent can do without asking');
  lines.push('permissions:');
  lines.push('  # File operations');
  lines.push('  file_read: allow');
  lines.push('  file_write: ask');
  lines.push('  file_delete: deny');
  lines.push('');
  lines.push('  # Shell commands');
  lines.push('  shell_read: allow    # non-destructive commands (ls, cat, git status)');
  lines.push('  shell_write: ask     # potentially destructive commands');
  lines.push('');
  lines.push('  # Git operations');
  lines.push('  git_read: allow');
  lines.push('  git_write: ask');
  lines.push('');
  lines.push('  # Infrastructure operations');
  lines.push('  terraform_plan: allow');
  lines.push('  terraform_apply: deny');
  lines.push('  kubectl_read: allow');
  lines.push('  kubectl_write: deny');
  lines.push('');

  // Safety
  lines.push('# Safety settings');
  lines.push('safety:');
  lines.push('  protected_branches:');
  lines.push('    - main');
  lines.push('    - master');
  lines.push('  protected_k8s_namespaces:');
  lines.push('    - production');
  lines.push('    - kube-system');
  lines.push('  require_plan_before_apply: true');
  lines.push('  require_tests_before_commit: true');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main init
// ---------------------------------------------------------------------------

/**
 * Initialize a Nimbus project in the given directory.
 *
 * Creates the `.nimbus/` directory structure and a `NIMBUS.md` file
 * populated with auto-detected project metadata.
 *
 * @param options - Configuration for the init process
 * @returns The detection results and list of created files
 *
 * @example
 * ```ts
 * const result = await runInit({ cwd: '/path/to/project' });
 * console.log(result.detection.projectType); // 'typescript'
 * console.log(result.filesCreated);          // ['.nimbus/config.yaml', ...]
 * ```
 */
export async function runInit(options?: InitOptions): Promise<InitResult> {
  const dir = path.resolve(options?.cwd ?? process.cwd());
  const force = options?.force ?? false;
  const quiet = options?.quiet ?? false;
  const merge = options?.merge ?? false;

  const log = (msg: string): void => {
    if (!quiet) {
      console.log(msg);
    }
  };

  // ---- M2: --merge mode — append Local Overrides section, don't overwrite ----
  const nimbusmdPathEarly = path.join(dir, 'NIMBUS.md');
  if (merge && exists(nimbusmdPathEarly)) {
    const content = fs.readFileSync(nimbusmdPathEarly, 'utf-8');
    const filesCreated: string[] = [];

    if (!content.includes('## Local Overrides')) {
      fs.appendFileSync(nimbusmdPathEarly, '\n\n## Local Overrides\n\n<!-- Personal additions -->\n', 'utf-8');
      log('  Appended ## Local Overrides section to NIMBUS.md');
    } else {
      log('  NIMBUS.md already has a ## Local Overrides section');
    }

    const localMdPath = path.join(dir, '.nimbus', 'local.md');
    if (!exists(localMdPath)) {
      fs.mkdirSync(path.join(dir, '.nimbus'), { recursive: true });
      fs.writeFileSync(localMdPath, '# Local Overrides\n\n<!-- Personal notes and overrides that are not committed -->\n', 'utf-8');
      log('  Created .nimbus/local.md for personal overrides');
      filesCreated.push(localMdPath);
    }

    const detection = detectProject(dir);
    return { detection, filesCreated, nimbusmdPath: nimbusmdPathEarly };
  }

  // ---- Step 1: Detect project characteristics ----
  log('Detecting project...');
  const detection = detectProject(dir);

  log(`  Project type: ${detection.projectType}`);
  if (detection.packageManager) {
    log(`  Package manager: ${detection.packageManager}`);
  }
  if (detection.infraTypes.length > 0) {
    log(`  Infrastructure: ${detection.infraTypes.join(', ')}`);
  }
  if (detection.cloudProviders.length > 0) {
    log(`  Cloud providers: ${detection.cloudProviders.join(', ')}`);
  }
  if (detection.testFramework) {
    log(`  Test framework: ${detection.testFramework}`);
  }

  // ---- Step 2: Check for existing NIMBUS.md and show diff (L8) ----
  const nimbusmdPath = path.join(dir, 'NIMBUS.md');
  if (exists(nimbusmdPath) && !force && !quiet) {
    // Generate the new content first for diffing
    const infraCtxForDiff = await discoverInfraContext(dir).catch(() => undefined);
    const newContent = generateNimbusMd(detection, dir, infraCtxForDiff);
    const existingContent = readText(nimbusmdPath);

    if (newContent === existingContent) {
      log('NIMBUS.md is already up to date.');
      return { detection, filesCreated: [], nimbusmdPath };
    }

    // Show line-level diff
    const oldLines = existingContent.split('\n');
    const newLines = newContent.split('\n');
    const diffLines: string[] = [];
    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let idx = 0; idx < maxLen; idx++) {
      const o = oldLines[idx];
      const n = newLines[idx];
      if (o === undefined) diffLines.push(`+ ${n}`);
      else if (n === undefined) diffLines.push(`- ${o}`);
      else if (o !== n) { diffLines.push(`- ${o}`); diffLines.push(`+ ${n}`); }
    }

    if (diffLines.length > 0) {
      log('\nNIMBUS.md changes:');
      for (const dl of diffLines.slice(0, 50)) {
        if (dl.startsWith('+')) log(`  \x1b[32m${dl}\x1b[0m`);
        else if (dl.startsWith('-')) log(`  \x1b[31m${dl}\x1b[0m`);
        else log(`  ${dl}`);
      }
      if (diffLines.length > 50) log(`  ... and ${diffLines.length - 50} more changes`);
      log('');
      log('Apply these changes? [y/N]');

      // Synchronous readline for non-quiet mode
      const answer = await new Promise<string>(resolve => {
        const { createInterface } = require('readline') as typeof import('readline');
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        rl.question('', (ans: string) => { rl.close(); resolve(ans.trim()); });
      });

      if (answer.toLowerCase() !== 'y') {
        log('Aborted — NIMBUS.md not changed.');
        return { detection, filesCreated: [], nimbusmdPath };
      }

      fs.writeFileSync(nimbusmdPath, newContent, 'utf-8');
      log('  Updated NIMBUS.md');
      return { detection, filesCreated: [nimbusmdPath], nimbusmdPath };
    }
  } else if (exists(nimbusmdPath) && !force) {
    // quiet mode — skip without prompting
    return { detection, filesCreated: [], nimbusmdPath };
  }

  // ---- Step 3: Create .nimbus/ directory structure ----
  const filesCreated: string[] = [];
  const nimbusDirPath = path.join(dir, '.nimbus');
  const hooksDirPath = path.join(nimbusDirPath, 'hooks');
  const agentsDirPath = path.join(nimbusDirPath, 'agents');

  if (!exists(nimbusDirPath)) {
    fs.mkdirSync(nimbusDirPath, { recursive: true });
  }
  if (!exists(hooksDirPath)) {
    fs.mkdirSync(hooksDirPath, { recursive: true });
  }
  if (!exists(agentsDirPath)) {
    fs.mkdirSync(agentsDirPath, { recursive: true });
  }

  // ---- Step 4: Create .nimbus/config.yaml ----
  const configPath = path.join(nimbusDirPath, 'config.yaml');
  if (!exists(configPath) || force) {
    const configContent = generateConfigYaml(detection);
    fs.writeFileSync(configPath, configContent, 'utf-8');
    filesCreated.push(configPath);
    log('  Created .nimbus/config.yaml');
  }

  // ---- Step 5: Create placeholder hook files ----
  const preCommitHookPath = path.join(hooksDirPath, 'pre-commit.ts');
  if (!exists(preCommitHookPath) || force) {
    const preCommitContent = [
      '/**',
      ' * Nimbus pre-commit hook',
      ' *',
      ' * Runs automatically before each commit when enabled.',
      ' * Add custom validation logic here.',
      ' */',
      '',
      'export default async function preCommit(): Promise<void> {',
      '  // Example: ensure tests pass before committing',
      '  // await $`bun test`;',
      '}',
      '',
    ].join('\n');
    fs.writeFileSync(preCommitHookPath, preCommitContent, 'utf-8');
    filesCreated.push(preCommitHookPath);
    log('  Created .nimbus/hooks/pre-commit.ts');
  }

  // ---- Step 6: Create placeholder agent config ----
  const defaultAgentPath = path.join(agentsDirPath, 'default.yaml');
  if (!exists(defaultAgentPath) || force) {
    const agentContent = [
      '# Default agent profile',
      '# Customize the system prompt and tool access for this agent',
      '',
      'name: default',
      'description: General-purpose Nimbus agent',
      '',
      'tools:',
      '  - file_read',
      '  - file_write',
      '  - shell',
      '  - git',
      '',
      'system_prompt: |',
      `  You are working on the ${detection.projectName} project.`,
      `  It is a ${detection.projectType} project.`,
      '  Follow the safety rules in NIMBUS.md.',
      '',
    ].join('\n');
    fs.writeFileSync(defaultAgentPath, agentContent, 'utf-8');
    filesCreated.push(defaultAgentPath);
    log('  Created .nimbus/agents/default.yaml');
  }

  // ---- Step 7: Generate and write NIMBUS.md ----
  // L8: Monorepo detection — scan immediate subdirs for terraform roots
  let monorepoSection = '';
  try {
    const subdirs = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && !['node_modules', '.git'].includes(e.name))
      .map(e => e.name);
    const tfRoots: string[] = [];
    for (const sub of subdirs.slice(0, 20)) {
      const subPath = path.join(dir, sub);
      const hasTf = fs.readdirSync(subPath).some(f => f.endsWith('.tf'));
      if (hasTf) tfRoots.push(sub);
    }
    if (tfRoots.length > 1) {
      monorepoSection = `\n## Terraform Modules (Monorepo)\n\nThis is a monorepo with multiple Terraform roots:\n${tfRoots.map(r => `- \`./${r}/\``).join('\n')}\n\nTo target a specific root, \`cd\` into the directory or specify the path.\n`;
      log(`  Detected ${tfRoots.length} Terraform roots (monorepo)`);
    }
  } catch { /* non-critical */ }

  const nimbusmdContent = generateNimbusMd(detection, dir) + monorepoSection;
  fs.writeFileSync(nimbusmdPath, nimbusmdContent, 'utf-8');
  filesCreated.push(nimbusmdPath);
  log('  Created NIMBUS.md');

  // L4: Validate generated NIMBUS.md and print warnings
  const validationWarnings = validateNimbusMd(nimbusmdContent);
  for (const w of validationWarnings) {
    console.warn(`[nimbus init] Warning: ${w}`);
  }

  // ---- Step 8: Append .nimbus/ to .gitignore if not already present ----
  const gitignorePath = path.join(dir, '.gitignore');
  if (exists(gitignorePath)) {
    const gitignore = readText(gitignorePath);
    if (!gitignore.includes('.nimbus/')) {
      fs.appendFileSync(gitignorePath, '\n# Nimbus local config\n.nimbus/\n', 'utf-8');
      log('  Updated .gitignore');
    }
  }

  log('');
  log('Nimbus project initialized successfully.');
  log('Edit NIMBUS.md to customise agent behaviour.');

  // M5: Print next steps after generating NIMBUS.md
  if (!quiet) {
    log('');
    log('\x1b[36mNext steps:\x1b[0m');
    log('  nimbus plan       Preview infrastructure changes');
    log('  nimbus doctor     Check your DevOps toolchain');
    log('  nimbus status     Live infrastructure health dashboard');
    log('  nimbus            Open the interactive DevOps agent');
  }

  return {
    detection,
    filesCreated,
    nimbusmdPath,
  };
}
