/**
 * Init Command
 *
 * Initialize a Nimbus workspace in the current directory
 */

import * as fs from 'fs';
import * as path from 'path';
import { ui } from '../wizard/ui';
import { select, input, confirm } from '../wizard/prompts';

export interface InitOptions {
  /** Non-interactive mode */
  nonInteractive?: boolean;
  /** Force overwrite existing configuration */
  force?: boolean;
  /** Project name */
  name?: string;
  /** Default cloud provider */
  provider?: string;
  /** Output directory */
  output?: string;
}

const NIMBUS_DIR = '.nimbus';
const LOCAL_CONFIG_FILE = 'config.yaml';

/**
 * Detect project type based on existing files
 */
function detectProjectType(): {
  hasTerraform: boolean;
  hasKubernetes: boolean;
  hasDocker: boolean;
  hasGitHub: boolean;
  hasAWS: boolean;
} {
  const cwd = process.cwd();

  return {
    hasTerraform:
      fs.existsSync(path.join(cwd, 'main.tf')) ||
      fs.existsSync(path.join(cwd, 'terraform')) ||
      fs.existsSync(path.join(cwd, 'infrastructure')),
    hasKubernetes:
      fs.existsSync(path.join(cwd, 'k8s')) ||
      fs.existsSync(path.join(cwd, 'kubernetes')) ||
      fs.existsSync(path.join(cwd, 'manifests')) ||
      fs.existsSync(path.join(cwd, 'helm')),
    hasDocker:
      fs.existsSync(path.join(cwd, 'Dockerfile')) ||
      fs.existsSync(path.join(cwd, 'docker-compose.yml')) ||
      fs.existsSync(path.join(cwd, 'docker-compose.yaml')),
    hasGitHub: fs.existsSync(path.join(cwd, '.github')),
    hasAWS:
      fs.existsSync(path.join(cwd, 'serverless.yml')) ||
      fs.existsSync(path.join(cwd, 'template.yaml')) || // SAM
      fs.existsSync(path.join(cwd, 'cdk.json')),
  };
}

/**
 * Get project name from package.json or directory name
 */
function getDefaultProjectName(): string {
  const cwd = process.cwd();

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

  // Fall back to directory name
  return path.basename(cwd);
}

/**
 * Create local Nimbus configuration
 */
function createLocalConfig(options: {
  name: string;
  provider?: string;
  output?: string;
  detected: ReturnType<typeof detectProjectType>;
}): string {
  const lines: string[] = [
    '# Nimbus Workspace Configuration',
    '# This file configures Nimbus for this project.',
    '# Global configuration is stored in ~/.nimbus/config.yaml',
    '',
    'workspace:',
    `  name: ${options.name}`,
  ];

  if (options.provider) {
    lines.push(`  defaultProvider: ${options.provider}`);
  }

  if (options.output) {
    lines.push(`  outputDirectory: ${options.output}`);
  }

  // Add detected project context
  if (options.detected.hasTerraform || options.detected.hasKubernetes || options.detected.hasAWS) {
    lines.push('');
    lines.push('# Detected project context');
    lines.push('context:');

    if (options.detected.hasTerraform) {
      lines.push('  terraform: true');
    }

    if (options.detected.hasKubernetes) {
      lines.push('  kubernetes: true');
    }

    if (options.detected.hasAWS) {
      lines.push('  aws: true');
    }

    if (options.detected.hasDocker) {
      lines.push('  docker: true');
    }

    if (options.detected.hasGitHub) {
      lines.push('  github: true');
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Create .gitignore entry for Nimbus
 */
function createGitignoreEntry(): string {
  return `
# Nimbus
.nimbus/
*.nimbus-session
`;
}

/**
 * Init command handler
 */
export async function initCommand(options: InitOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const nimbusDir = path.join(cwd, NIMBUS_DIR);
  const configPath = path.join(nimbusDir, LOCAL_CONFIG_FILE);

  // Check if already initialized
  if (fs.existsSync(nimbusDir) && !options.force) {
    ui.warning(`Nimbus workspace already exists at: ${nimbusDir}`);

    if (!options.nonInteractive) {
      const reinit = await confirm({
        message: 'Reinitialize this workspace?',
        defaultValue: false,
      });

      if (!reinit) {
        ui.info('Workspace unchanged.');
        return;
      }
    } else {
      ui.info('Use --force to reinitialize.');
      return;
    }
  }

  // Detect project type
  const detected = detectProjectType();
  const defaultName = getDefaultProjectName();

  let projectName = options.name || defaultName;
  let provider = options.provider;
  let outputDir = options.output;

  // Interactive configuration
  if (!options.nonInteractive) {
    ui.newLine();
    ui.header('Initialize Nimbus Workspace', cwd);

    // Show detected project info
    const detectedItems: string[] = [];
    if (detected.hasTerraform) detectedItems.push('Terraform');
    if (detected.hasKubernetes) detectedItems.push('Kubernetes');
    if (detected.hasDocker) detectedItems.push('Docker');
    if (detected.hasGitHub) detectedItems.push('GitHub Actions');
    if (detected.hasAWS) detectedItems.push('AWS (SAM/CDK/Serverless)');

    if (detectedItems.length > 0) {
      ui.info(`Detected: ${detectedItems.join(', ')}`);
      ui.newLine();
    }

    // Project name
    projectName = await input({
      message: 'Project name:',
      defaultValue: defaultName,
    });

    // Cloud provider
    provider = await select({
      message: 'Default cloud provider:',
      options: [
        { label: 'AWS', value: 'aws', description: 'Amazon Web Services' },
        { label: 'GCP', value: 'gcp', description: 'Google Cloud Platform' },
        { label: 'Azure', value: 'azure', description: 'Microsoft Azure' },
        { label: 'None', value: '', description: 'No default provider' },
      ],
    }) as string;

    // Output directory
    const defaultOutput = detected.hasTerraform ? './terraform' : './infrastructure';
    outputDir = await input({
      message: 'Output directory for generated code:',
      defaultValue: defaultOutput,
    });

    // Update .gitignore
    const gitignorePath = path.join(cwd, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      if (!gitignoreContent.includes('.nimbus/')) {
        const updateGitignore = await confirm({
          message: 'Add .nimbus/ to .gitignore?',
          defaultValue: true,
        });

        if (updateGitignore) {
          fs.appendFileSync(gitignorePath, createGitignoreEntry());
          ui.success('Updated .gitignore');
        }
      }
    }
  }

  // Create .nimbus directory
  if (!fs.existsSync(nimbusDir)) {
    fs.mkdirSync(nimbusDir, { recursive: true });
  }

  // Create local config
  const configContent = createLocalConfig({
    name: projectName,
    provider: provider || undefined,
    output: outputDir || undefined,
    detected,
  });

  fs.writeFileSync(configPath, configContent);

  // Create .gitkeep for empty directories
  const gitkeepPath = path.join(nimbusDir, '.gitkeep');
  if (!fs.existsSync(gitkeepPath)) {
    fs.writeFileSync(gitkeepPath, '');
  }

  ui.newLine();
  ui.success(`Nimbus workspace initialized!`);
  ui.newLine();
  ui.print(`  ${ui.dim('Project:')} ${projectName}`);
  ui.print(`  ${ui.dim('Config:')}  ${configPath}`);
  if (provider) {
    ui.print(`  ${ui.dim('Provider:')} ${provider}`);
  }
  if (outputDir) {
    ui.print(`  ${ui.dim('Output:')}  ${outputDir}`);
  }
  ui.newLine();
  ui.print(ui.dim('Next steps:'));
  ui.print(`  ${ui.dim('1.')} Run ${ui.color('nimbus login', 'cyan')} to configure authentication`);
  ui.print(`  ${ui.dim('2.')} Run ${ui.color('nimbus chat', 'cyan')} to start a conversation`);
  ui.print(`  ${ui.dim('3.')} Run ${ui.color('nimbus generate terraform', 'cyan')} to generate infrastructure`);
  ui.newLine();
}
