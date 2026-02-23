/**
 * Language Server Configurations
 *
 * Defines the LSP binary names, install commands, and file associations
 * for each supported language.
 */

export interface LanguageConfig {
  /** Language identifier (e.g. 'typescript'). */
  id: string;
  /** Display name. */
  name: string;
  /** File extensions that trigger this language server. */
  extensions: string[];
  /** Command to start the LSP binary. */
  command: string;
  /** Arguments to pass to the LSP binary. */
  args: string[];
  /** Install command hint if binary not found. */
  installHint: string;
  /** Initialization options passed to the LSP server. */
  initializationOptions?: Record<string, unknown>;
  /** Idle timeout in ms before shutting down the server (default: 5 min). */
  idleTimeout?: number;
}

/** Supported language server configurations. */
export const LANGUAGE_CONFIGS: LanguageConfig[] = [
  {
    id: 'typescript',
    name: 'TypeScript',
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    command: 'typescript-language-server',
    args: ['--stdio'],
    installHint: 'npm install -g typescript-language-server typescript',
    initializationOptions: {
      preferences: {
        includeInlayParameterNameHints: 'none',
      },
    },
  },
  {
    id: 'go',
    name: 'Go',
    extensions: ['.go'],
    command: 'gopls',
    args: ['serve'],
    installHint: 'go install golang.org/x/tools/gopls@latest',
  },
  {
    id: 'python',
    name: 'Python',
    extensions: ['.py', '.pyi'],
    command: 'pylsp',
    args: [],
    installHint: 'pip install python-lsp-server',
  },
  {
    id: 'terraform',
    name: 'Terraform/HCL',
    extensions: ['.tf', '.tfvars', '.hcl'],
    command: 'terraform-ls',
    args: ['serve'],
    installHint: 'brew install hashicorp/tap/terraform-ls',
  },
  {
    id: 'yaml',
    name: 'YAML',
    extensions: ['.yaml', '.yml'],
    command: 'yaml-language-server',
    args: ['--stdio'],
    installHint: 'npm install -g yaml-language-server',
  },
  {
    id: 'docker',
    name: 'Docker',
    extensions: ['Dockerfile', '.dockerfile'],
    command: 'docker-langserver',
    args: ['--stdio'],
    installHint: 'npm install -g dockerfile-language-server-nodejs',
  },
];

/**
 * Find the language config for a given file path.
 * Returns undefined if no matching language server is configured.
 */
export function getLanguageForFile(filePath: string): LanguageConfig | undefined {
  const lowerPath = filePath.toLowerCase();
  const baseName = filePath.split('/').pop() ?? '';

  for (const config of LANGUAGE_CONFIGS) {
    for (const ext of config.extensions) {
      if (ext.startsWith('.')) {
        if (lowerPath.endsWith(ext)) return config;
      } else {
        // Match exact filename (e.g., Dockerfile)
        if (baseName === ext || baseName.toLowerCase() === ext.toLowerCase()) return config;
      }
    }
  }

  return undefined;
}

/**
 * Get the priority order of language configs.
 * TypeScript > Go > Python > HCL > YAML > Docker
 */
export function getLanguagePriority(): LanguageConfig[] {
  return [...LANGUAGE_CONFIGS];
}
