/**
 * Project Scanners
 *
 * Orchestrates all project scanners to build a complete project context
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type {
  ProjectContext,
  ProjectType,
  ScanOptions,
  AggregateScanResult,
  LanguageInfo,
  FrameworkInfo,
  PackageManagerInfo,
  IaCInfo,
  CICDInfo,
  CloudInfo,
  GitInfo,
} from './types';

import { createLanguageScanner, LanguageScanner } from './language-scanner';
import { createFrameworkScanner, FrameworkScanner } from './framework-scanner';
import { createPackageManagerScanner, PackageManagerScanner } from './package-manager-scanner';
import { createIaCScanner, IaCScanner } from './iac-scanner';
import { createCICDScanner, CICDScanner } from './cicd-scanner';
import { createCloudScanner, CloudScanner } from './cloud-scanner';

// Re-export types
export * from './types';

// Re-export scanners
export {
  LanguageScanner,
  createLanguageScanner,
} from './language-scanner';
export {
  FrameworkScanner,
  createFrameworkScanner,
} from './framework-scanner';
export {
  PackageManagerScanner,
  createPackageManagerScanner,
} from './package-manager-scanner';
export {
  IaCScanner,
  createIaCScanner,
} from './iac-scanner';
export {
  CICDScanner,
  createCICDScanner,
} from './cicd-scanner';
export {
  CloudScanner,
  createCloudScanner,
} from './cloud-scanner';

/**
 * Default scan options
 */
const DEFAULT_SCAN_OPTIONS: ScanOptions = {
  depth: 'standard',
  maxFiles: 1000,
  includeHidden: false,
  instructions: '',
};

/**
 * Project Scanner Orchestrator
 *
 * Coordinates all individual scanners to build a complete project context
 */
export class ProjectScanner {
  private languageScanner: LanguageScanner;
  private frameworkScanner: FrameworkScanner;
  private packageManagerScanner: PackageManagerScanner;
  private iacScanner: IaCScanner;
  private cicdScanner: CICDScanner;
  private cloudScanner: CloudScanner;

  constructor() {
    this.languageScanner = createLanguageScanner();
    this.frameworkScanner = createFrameworkScanner();
    this.packageManagerScanner = createPackageManagerScanner();
    this.iacScanner = createIaCScanner();
    this.cicdScanner = createCICDScanner();
    this.cloudScanner = createCloudScanner();
  }

  /**
   * Scan a project directory and return complete context
   */
  async scan(cwd: string, options: Partial<ScanOptions> = {}): Promise<ProjectContext> {
    const opts = { ...DEFAULT_SCAN_OPTIONS, ...options };

    // Run all scanners in parallel
    const [
      languageResult,
      frameworkResult,
      packageManagerResult,
      iacResult,
      cicdResult,
      cloudResult,
      gitInfo,
    ] = await Promise.all([
      this.languageScanner.scan(cwd),
      this.frameworkScanner.scan(cwd),
      this.packageManagerScanner.scan(cwd),
      this.iacScanner.scan(cwd),
      this.cicdScanner.scan(cwd),
      this.cloudScanner.scan(cwd),
      this.getGitInfo(cwd),
    ]);

    // Extract detailed results
    const languages = languageResult.details.languages as LanguageInfo[];
    const frameworks = frameworkResult.details.frameworks as FrameworkInfo[];
    const packageManagers = packageManagerResult.details.packageManagers as PackageManagerInfo[];
    const iac = iacResult.details.iac as IaCInfo[];
    const cicd = cicdResult.details.cicd as CICDInfo[];
    const cloud = cloudResult.details.cloud as CloudInfo[];

    // Get file lists
    const terraformFiles = await this.iacScanner.getTerraformFiles(cwd);
    const kubernetesFiles = await this.iacScanner.getKubernetesFiles(cwd);
    const dockerFiles = await this.iacScanner.getDockerFiles(cwd);
    const cicdFiles = await this.cicdScanner.getCICDFiles(cwd);

    // Determine project type
    const projectType = this.determineProjectType({
      languages,
      frameworks,
      packageManagers,
      iac,
      cicd,
      cloud,
      git: gitInfo,
      projectType: 'unknown',
    });

    // Get primary CI/CD platform
    const primaryCICD = await this.cicdScanner.getPrimaryCICDPlatform(cwd);

    // Build project context
    const context: ProjectContext = {
      project: {
        name: this.getProjectName(cwd),
        path: cwd,
        detected_at: new Date().toISOString(),
      },
      structure: {
        type: projectType,
        languages: languages.map(l => ({
          name: l.name,
          version: l.version,
          confidence: l.confidence,
          files: l.files,
        })),
        frameworks: frameworks.map(f => ({
          name: f.name,
          version: f.version,
          confidence: f.confidence,
          language: f.language,
        })),
        packageManagers: packageManagers.map(pm => ({
          name: pm.name,
          lockFile: pm.lockFile,
          confidence: pm.confidence,
        })),
      },
      files: {
        terraform: terraformFiles,
        kubernetes: kubernetesFiles,
        docker: dockerFiles,
        cicd: cicdFiles,
      },
      git: gitInfo,
      cicd: {
        platform: primaryCICD,
        workflows: cicdFiles,
      },
      cloud: {
        providers: cloud.map(c => c.provider),
        regions: [...new Set(cloud.flatMap(c => c.regions))],
      },
      instructions: opts.instructions || '',
    };

    return context;
  }

  /**
   * Run a quick scan (config files only)
   */
  async quickScan(cwd: string): Promise<AggregateScanResult> {
    const [
      languageResult,
      frameworkResult,
      packageManagerResult,
      iacResult,
      cicdResult,
      cloudResult,
      gitInfo,
    ] = await Promise.all([
      this.languageScanner.scan(cwd),
      this.frameworkScanner.scan(cwd),
      this.packageManagerScanner.scan(cwd),
      this.iacScanner.scan(cwd),
      this.cicdScanner.scan(cwd),
      this.cloudScanner.scan(cwd),
      this.getGitInfo(cwd),
    ]);

    const result: AggregateScanResult = {
      languages: languageResult.details.languages as LanguageInfo[],
      frameworks: frameworkResult.details.frameworks as FrameworkInfo[],
      packageManagers: packageManagerResult.details.packageManagers as PackageManagerInfo[],
      iac: iacResult.details.iac as IaCInfo[],
      cicd: cicdResult.details.cicd as CICDInfo[],
      cloud: cloudResult.details.cloud as CloudInfo[],
      git: gitInfo,
      projectType: 'unknown',
    };

    result.projectType = this.determineProjectType(result);

    return result;
  }

  /**
   * Get git repository information
   */
  private async getGitInfo(cwd: string): Promise<GitInfo> {
    const gitDir = path.join(cwd, '.git');
    const isRepo = fs.existsSync(gitDir);

    if (!isRepo) {
      return {
        isRepo: false,
        remote: null,
        branch: '',
        hasUncommittedChanges: false,
      };
    }

    let remote: string | null = null;
    let branch = '';
    let hasUncommittedChanges = false;

    try {
      // Get remote URL
      remote = execSync('git remote get-url origin', { cwd, encoding: 'utf-8' }).trim();
    } catch {
      remote = null;
    }

    try {
      // Get current branch
      branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf-8' }).trim();
    } catch {
      branch = 'unknown';
    }

    try {
      // Check for uncommitted changes
      const status = execSync('git status --porcelain', { cwd, encoding: 'utf-8' }).trim();
      hasUncommittedChanges = status.length > 0;
    } catch {
      hasUncommittedChanges = false;
    }

    return {
      isRepo,
      remote,
      branch,
      hasUncommittedChanges,
    };
  }

  /**
   * Get project name from package.json or directory name
   */
  private getProjectName(cwd: string): string {
    // Try package.json
    const packageJsonPath = path.join(cwd, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        if (packageJson.name) {
          return packageJson.name;
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Try pyproject.toml
    const pyprojectPath = path.join(cwd, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      try {
        const content = fs.readFileSync(pyprojectPath, 'utf-8');
        const match = content.match(/name\s*=\s*["']([^"']+)["']/);
        if (match) {
          return match[1];
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Try Cargo.toml
    const cargoPath = path.join(cwd, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      try {
        const content = fs.readFileSync(cargoPath, 'utf-8');
        const match = content.match(/name\s*=\s*["']([^"']+)["']/);
        if (match) {
          return match[1];
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Fall back to directory name
    return path.basename(cwd);
  }

  /**
   * Determine project type based on scan results
   */
  private determineProjectType(result: AggregateScanResult): ProjectType {
    const { languages, frameworks, iac, cloud } = result;

    // Check for monorepo indicators
    const isMonorepo = this.isMonorepo(languages, frameworks);
    if (isMonorepo) {
      return 'monorepo';
    }

    // Check for infrastructure-only project
    if (iac.length > 0 && languages.length === 0) {
      return 'infrastructure';
    }

    // Check for mobile frameworks
    const mobileFrameworks = ['react-native', 'flutter', 'expo'];
    if (frameworks.some(f => mobileFrameworks.includes(f.name))) {
      return 'mobile';
    }

    // Check for CLI indicators
    const cliIndicators = ['commander', 'yargs', 'oclif', 'clap', 'cobra', 'click', 'typer'];
    if (frameworks.some(f => cliIndicators.includes(f.name))) {
      return 'cli';
    }

    // Check for fullstack
    const frontendFrameworks = ['next.js', 'nuxt', 'remix', 'angular', 'vue', 'react', 'svelte', 'astro'];
    const backendFrameworks = ['express', 'fastify', 'nestjs', 'django', 'fastapi', 'flask', 'spring-boot', 'gin', 'actix-web'];

    const hasFrontend = frameworks.some(f => frontendFrameworks.includes(f.name));
    const hasBackend = frameworks.some(f => backendFrameworks.includes(f.name));

    if (hasFrontend && hasBackend) {
      return 'fullstack';
    }

    if (hasFrontend) {
      return 'frontend';
    }

    if (hasBackend) {
      return 'backend';
    }

    // Check for library indicators
    if (this.isLibrary(languages)) {
      return 'library';
    }

    return 'unknown';
  }

  /**
   * Check if project is a monorepo
   */
  private isMonorepo(languages: LanguageInfo[], frameworks: FrameworkInfo[]): boolean {
    // Check for monorepo tools
    const monorepoTools = ['lerna', 'nx', 'turborepo', 'rush', 'pnpm-workspace'];
    // This would need to be detected from package.json or config files
    // For now, check if multiple languages with high confidence
    const highConfidenceLanguages = languages.filter(l => l.confidence === 'high');
    return highConfidenceLanguages.length >= 3;
  }

  /**
   * Check if project is a library
   */
  private isLibrary(languages: LanguageInfo[]): boolean {
    // Libraries typically have specific config files
    // This is a simplified heuristic
    return languages.some(l => l.files.some(f =>
      f.includes('.gemspec') ||
      f.includes('setup.py') ||
      f.includes('Cargo.toml')
    ));
  }
}

/**
 * Generate project.yaml content from project context
 */
export function generateProjectYaml(context: ProjectContext): string {
  const lines: string[] = [];

  // Project section
  lines.push('project:');
  lines.push(`  name: ${context.project.name}`);
  lines.push(`  detected_at: ${context.project.detected_at}`);
  lines.push('');

  // Structure section
  lines.push('structure:');
  lines.push(`  type: ${context.structure.type}`);

  if (context.structure.languages.length > 0) {
    lines.push('  languages:');
    for (const lang of context.structure.languages) {
      if (lang.version) {
        lines.push(`    - name: ${lang.name}`);
        lines.push(`      version: "${lang.version}"`);
      } else {
        lines.push(`    - name: ${lang.name}`);
      }
    }
  }

  if (context.structure.frameworks.length > 0) {
    lines.push('  frameworks:');
    for (const fw of context.structure.frameworks) {
      lines.push(`    - name: ${fw.name}`);
      if (fw.version) {
        lines.push(`      version: "${fw.version}"`);
      }
    }
  }

  if (context.structure.packageManagers.length > 0) {
    lines.push(`  packageManagers: [${context.structure.packageManagers.map(pm => pm.name).join(', ')}]`);
  }

  lines.push('');

  // Files section
  lines.push('files:');
  if (context.files.terraform.length > 0) {
    lines.push(`  terraform: ["${context.files.terraform.slice(0, 10).join('", "')}"]`);
  } else {
    lines.push('  terraform: []');
  }

  if (context.files.kubernetes.length > 0) {
    lines.push(`  kubernetes: ["${context.files.kubernetes.slice(0, 10).join('", "')}"]`);
  } else {
    lines.push('  kubernetes: []');
  }

  if (context.files.docker.length > 0) {
    lines.push(`  docker: ["${context.files.docker.slice(0, 10).join('", "')}"]`);
  } else {
    lines.push('  docker: []');
  }

  if (context.files.cicd.length > 0) {
    lines.push(`  cicd: ["${context.files.cicd.slice(0, 10).join('", "')}"]`);
  } else {
    lines.push('  cicd: []');
  }

  lines.push('');

  // Git section
  lines.push('git:');
  lines.push(`  remote: ${context.git.remote || 'null'}`);
  lines.push(`  branch: ${context.git.branch}`);
  lines.push(`  isRepo: ${context.git.isRepo}`);
  lines.push('');

  // CI/CD section
  lines.push('cicd:');
  lines.push(`  platform: ${context.cicd.platform || 'null'}`);
  if (context.cicd.workflows.length > 0) {
    lines.push(`  workflows: ["${context.cicd.workflows.slice(0, 10).join('", "')}"]`);
  } else {
    lines.push('  workflows: []');
  }

  lines.push('');

  // Cloud section
  lines.push('cloud:');
  if (context.cloud.providers.length > 0) {
    lines.push(`  providers: [${context.cloud.providers.join(', ')}]`);
  } else {
    lines.push('  providers: []');
  }

  if (context.cloud.regions.length > 0) {
    lines.push(`  regions: [${context.cloud.regions.join(', ')}]`);
  } else {
    lines.push('  regions: []');
  }

  // Instructions section (if provided)
  if (context.instructions) {
    lines.push('');
    lines.push('# Custom project instructions');
    lines.push(`instructions: |`);
    for (const line of context.instructions.split('\n')) {
      lines.push(`  ${line}`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Create project scanner instance
 */
export function createProjectScanner(): ProjectScanner {
  return new ProjectScanner();
}
