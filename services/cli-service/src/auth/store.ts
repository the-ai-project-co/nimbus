/**
 * AuthStore - Credential Persistence Manager
 * Manages storage and retrieval of authentication credentials at ~/.nimbus/auth.json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  AuthFile,
  AuthStatus,
  GitHubIdentity,
  LLMProviderCredential,
  LLMProviderName,
} from './types';

const AUTH_FILE_VERSION = 1;

/**
 * Default empty auth file structure
 */
function createEmptyAuthFile(): AuthFile {
  const now = new Date().toISOString();
  return {
    version: AUTH_FILE_VERSION,
    identity: {},
    providers: {},
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * AuthStore class for credential persistence
 * Pattern follows state-service/src/config/manager.ts
 */
export class AuthStore {
  private authPath: string;
  private authFile: AuthFile | null = null;

  constructor(authPath?: string) {
    this.authPath = authPath || path.join(os.homedir(), '.nimbus', 'auth.json');
  }

  /**
   * Get the path to the auth file
   */
  getAuthPath(): string {
    return this.authPath;
  }

  /**
   * Ensure the auth directory exists
   */
  private ensureDirectory(): void {
    const dir = path.dirname(this.authPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Load auth file from disk, creating if necessary
   */
  load(): AuthFile {
    if (this.authFile) {
      return this.authFile;
    }

    this.ensureDirectory();

    if (!fs.existsSync(this.authPath)) {
      this.authFile = createEmptyAuthFile();
      return this.authFile;
    }

    try {
      const content = fs.readFileSync(this.authPath, 'utf-8');
      const parsed = JSON.parse(content) as AuthFile;

      // Validate version and migrate if needed
      if (parsed.version !== AUTH_FILE_VERSION) {
        // Future: handle migrations
        parsed.version = AUTH_FILE_VERSION;
      }

      // Ensure required fields exist
      parsed.identity = parsed.identity || {};
      parsed.providers = parsed.providers || {};

      this.authFile = parsed;
      return this.authFile;
    } catch {
      // If file is corrupted, start fresh
      this.authFile = createEmptyAuthFile();
      return this.authFile;
    }
  }

  /**
   * Save auth file to disk with secure permissions (0600)
   */
  save(authFile?: AuthFile): void {
    this.ensureDirectory();

    const fileToSave = authFile || this.authFile;
    if (!fileToSave) {
      throw new Error('No auth file to save');
    }

    fileToSave.updatedAt = new Date().toISOString();
    this.authFile = fileToSave;

    const content = JSON.stringify(fileToSave, null, 2);
    fs.writeFileSync(this.authPath, content, { mode: 0o600 });

    // Ensure permissions are set correctly even if file already existed
    fs.chmodSync(this.authPath, 0o600);
  }

  /**
   * Check if auth.json exists and has valid credentials
   */
  exists(): boolean {
    if (!fs.existsSync(this.authPath)) {
      return false;
    }

    try {
      const authFile = this.load();
      // Consider it exists if there are any providers configured
      return Object.keys(authFile.providers).length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get authentication status summary
   */
  getStatus(): AuthStatus {
    const authFile = this.load();

    const hasIdentity = !!authFile.identity.github;
    const providerEntries = Object.entries(authFile.providers) as Array<
      [LLMProviderName, LLMProviderCredential]
    >;
    const hasProviders = providerEntries.length > 0;

    const providers = providerEntries.map(([name, cred]) => ({
      name,
      model: cred.model,
      isDefault: authFile.defaultProvider === name,
      validatedAt: cred.validatedAt,
    }));

    return {
      hasIdentity,
      hasProviders,
      isConfigured: hasProviders,
      identity: hasIdentity
        ? {
            provider: 'github' as const,
            username: authFile.identity.github!.username,
            name: authFile.identity.github!.name,
            authenticatedAt: authFile.identity.github!.authenticatedAt,
          }
        : undefined,
      providers,
      defaultProvider: authFile.defaultProvider,
    };
  }

  /**
   * Set GitHub identity
   */
  setIdentity(identity: GitHubIdentity): void {
    const authFile = this.load();
    authFile.identity.github = identity;
    this.save(authFile);
  }

  /**
   * Clear GitHub identity
   */
  clearIdentity(): void {
    const authFile = this.load();
    delete authFile.identity.github;
    this.save(authFile);
  }

  /**
   * Get GitHub identity
   */
  getIdentity(): GitHubIdentity | undefined {
    const authFile = this.load();
    return authFile.identity.github;
  }

  /**
   * Set LLM provider credentials
   */
  setProvider(name: LLMProviderName, credential: LLMProviderCredential): void {
    const authFile = this.load();
    authFile.providers[name] = credential;

    // If this is the first provider or marked as default, set as default
    if (credential.isDefault || Object.keys(authFile.providers).length === 1) {
      authFile.defaultProvider = name;
    }

    this.save(authFile);
  }

  /**
   * Remove LLM provider credentials
   */
  removeProvider(name: LLMProviderName): void {
    const authFile = this.load();
    delete authFile.providers[name];

    // If removed provider was default, set new default
    if (authFile.defaultProvider === name) {
      const remaining = Object.keys(authFile.providers) as LLMProviderName[];
      authFile.defaultProvider = remaining.length > 0 ? remaining[0] : undefined;
    }

    this.save(authFile);
  }

  /**
   * Get LLM provider credentials
   */
  getProvider(name: LLMProviderName): LLMProviderCredential | undefined {
    const authFile = this.load();
    return authFile.providers[name];
  }

  /**
   * Get all configured providers
   */
  getProviders(): AuthFile['providers'] {
    const authFile = this.load();
    return authFile.providers;
  }

  /**
   * Get API key for a provider
   * Checks auth.json first, then falls back to environment variable
   */
  getApiKey(name: LLMProviderName): string | undefined {
    const provider = this.getProvider(name);
    if (provider?.apiKey) {
      return provider.apiKey;
    }

    // Environment variable fallback
    const envVarMap: Record<LLMProviderName, string | undefined> = {
      anthropic: process.env.ANTHROPIC_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      google: process.env.GOOGLE_API_KEY,
      openrouter: process.env.OPENROUTER_API_KEY,
      ollama: undefined, // Ollama doesn't use API keys
    };

    return envVarMap[name];
  }

  /**
   * Get base URL for a provider (primarily for Ollama)
   */
  getBaseUrl(name: LLMProviderName): string | undefined {
    const provider = this.getProvider(name);
    if (provider?.baseUrl) {
      return provider.baseUrl;
    }

    // Environment variable fallback
    if (name === 'ollama') {
      return process.env.OLLAMA_BASE_URL;
    }

    return undefined;
  }

  /**
   * Set the default LLM provider
   */
  setDefaultProvider(name: LLMProviderName): void {
    const authFile = this.load();

    if (!authFile.providers[name]) {
      throw new Error(`Provider ${name} is not configured`);
    }

    authFile.defaultProvider = name;
    this.save(authFile);
  }

  /**
   * Get the default LLM provider
   */
  getDefaultProvider(): LLMProviderName | undefined {
    const authFile = this.load();
    return authFile.defaultProvider;
  }

  /**
   * Clear all credentials (logout)
   */
  clear(): void {
    this.authFile = null;

    if (fs.existsSync(this.authPath)) {
      fs.unlinkSync(this.authPath);
    }
  }

  /**
   * Mask an API key for display (e.g., "sk-ant-...xyz4")
   */
  static maskApiKey(key: string | undefined): string {
    if (!key) {
      return '(not set)';
    }

    if (key.length <= 8) {
      return '****';
    }

    const prefix = key.slice(0, 7);
    const suffix = key.slice(-4);
    return `${prefix}...${suffix}`;
  }

  /**
   * Reload auth file from disk (discard cached version)
   */
  reload(): AuthFile {
    this.authFile = null;
    return this.load();
  }
}

/**
 * Singleton instance for global access
 */
export const authStore = new AuthStore();
