/**
 * AuthStore - Credential Persistence Manager
 * Manages storage and retrieval of authentication credentials at ~/.nimbus/auth.json
 * Credentials are stored as plain JSON with 0600 file permissions (industry standard).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import type {
  AuthFile,
  AuthStatus,
  GitHubIdentity,
  LLMProviderCredential,
  LLMProviderName,
} from './types';

const AUTH_FILE_VERSION = 1;

/** Legacy encryption prefix — used only for one-time migration of old files. */
const ENC_PREFIX = 'enc:';

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

// ---------------------------------------------------------------------------
// Legacy decryption — used ONLY during one-time migration of enc:-prefixed values.
// This function is intentionally kept minimal; it is removed from the hot path.
// ---------------------------------------------------------------------------

const _LEGACY_ALGORITHM = 'aes-256-gcm';
const _LEGACY_KEY_LENGTH = 32;
const _LEGACY_IV_LENGTH = 16;
const _LEGACY_AUTH_TAG_LENGTH = 16;
const _LEGACY_SALT = 'nimbus-auth-v1';

function _legacyDeriveKey(): Buffer {
  const fingerprint = `${os.hostname()}${os.homedir()}${os.userInfo().username}`;
  return crypto.pbkdf2Sync(fingerprint, _LEGACY_SALT, 100000, _LEGACY_KEY_LENGTH, 'sha256');
}

/**
 * Attempt to decrypt a value that was encrypted with the old AES-256-GCM scheme.
 * Returns null if decryption fails (wrong machine, corrupted, etc.).
 */
function _legacyDecrypt(encrypted: string): string | null {
  try {
    const payload = encrypted.slice(ENC_PREFIX.length);
    const combined = Buffer.from(payload, 'base64');

    if (combined.length < _LEGACY_IV_LENGTH + _LEGACY_AUTH_TAG_LENGTH) {
      return null;
    }

    const iv = combined.subarray(0, _LEGACY_IV_LENGTH);
    const authTag = combined.subarray(_LEGACY_IV_LENGTH, _LEGACY_IV_LENGTH + _LEGACY_AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(_LEGACY_IV_LENGTH + _LEGACY_AUTH_TAG_LENGTH);

    const key = _legacyDeriveKey();
    const decipher = crypto.createDecipheriv(_LEGACY_ALGORITHM, key, iv, {
      authTagLength: _LEGACY_AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/**
 * One-time migration: if any sensitive fields in the loaded auth file still carry
 * the old `enc:` prefix, attempt to decrypt them.  On success the plain-text value
 * is kept in memory and will be written back as plain JSON on the next save().
 * On failure the field is cleared and a warning is printed.
 */
function migrateEncryptedFields(authFile: AuthFile): void {
  // Provider API keys
  for (const providerName of Object.keys(authFile.providers) as LLMProviderName[]) {
    const cred = authFile.providers[providerName];
    if (cred?.apiKey?.startsWith(ENC_PREFIX)) {
      const decrypted = _legacyDecrypt(cred.apiKey);
      if (decrypted !== null) {
        cred.apiKey = decrypted;
      } else {
        process.stderr.write(
          `[nimbus] Warning: could not decrypt stored API key for provider "${providerName}". ` +
          'The key has been cleared — please run `nimbus login` to re-enter it.\n'
        );
        delete cred.apiKey;
      }
    }
  }

  // GitHub access token
  if (authFile.identity.github?.accessToken?.startsWith(ENC_PREFIX)) {
    const decrypted = _legacyDecrypt(authFile.identity.github.accessToken);
    if (decrypted !== null) {
      authFile.identity.github.accessToken = decrypted;
    } else {
      process.stderr.write(
        '[nimbus] Warning: could not decrypt stored GitHub access token. ' +
        'The token has been cleared — please run `nimbus connect github` to re-authenticate.\n'
      );
      // Clear the github identity since accessToken is required (not optional in the type)
      delete authFile.identity.github;
    }
  }
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
   * Load auth file from disk, creating if necessary.
   * Stored as plain JSON (industry standard: gh, terraform, AWS CLI all do this).
   * Performs a one-time migration for legacy enc:-prefixed values from older versions.
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

      // One-time migration: decrypt any legacy enc:-prefixed fields and save back as plain text
      const hasLegacyEncryption = Object.values(parsed.providers).some(c => c?.apiKey?.startsWith(ENC_PREFIX))
        || parsed.identity.github?.accessToken?.startsWith(ENC_PREFIX);
      if (hasLegacyEncryption) {
        migrateEncryptedFields(parsed);
        // Persist the decrypted values immediately so migration only runs once
        this.authFile = parsed;
        try {
          this.save(parsed);
        } catch { /* non-critical — in-memory values are still correct */ }
      }

      this.authFile = parsed;
      return this.authFile;
    } catch {
      // If file is corrupted, start fresh
      this.authFile = createEmptyAuthFile();
      return this.authFile;
    }
  }

  /**
   * Save auth file to disk with secure permissions (0600).
   * Credentials are stored as plain JSON — file permissions provide the security boundary.
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
      groq: process.env.GROQ_API_KEY,
      together: process.env.TOGETHER_API_KEY,
      deepseek: process.env.DEEPSEEK_API_KEY,
      fireworks: process.env.FIREWORKS_API_KEY,
      perplexity: process.env.PERPLEXITY_API_KEY,
      ollama: undefined, // Ollama doesn't use API keys
      bedrock: process.env.AWS_ACCESS_KEY_ID, // Bedrock uses AWS IAM credentials
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
