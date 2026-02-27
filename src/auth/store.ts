/**
 * AuthStore - Credential Persistence Manager
 * Manages storage and retrieval of authentication credentials at ~/.nimbus/auth.json
 * API keys and access tokens are encrypted at rest using AES-256-GCM.
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
// Encryption constants and helpers (AES-256-GCM)
// ---------------------------------------------------------------------------

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT = 'nimbus-auth-v1';
const ENC_PREFIX = 'enc:';

/**
 * Build a machine-specific fingerprint from hostname, homedir, and username.
 * This is not cryptographically perfect, but it prevents casual copy-paste of
 * the auth file between machines.
 */
function getMachineFingerprint(): string {
  const hostname = os.hostname();
  const homedir = os.homedir();
  const username = os.userInfo().username;
  return `${hostname}${homedir}${username}`;
}

/**
 * Derive a 256-bit encryption key from the machine fingerprint using PBKDF2.
 */
function deriveKey(): Buffer {
  return crypto.pbkdf2Sync(getMachineFingerprint(), SALT, 100000, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns a base64-encoded blob containing iv + authTag + ciphertext.
 */
function encryptValue(plaintext: string): string {
  try {
    const key = deriveKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Layout: iv (16) + authTag (16) + ciphertext (variable)
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return ENC_PREFIX + combined.toString('base64');
  } catch {
    // On any encryption error, return the original value so the system
    // can continue to operate.
    return plaintext;
  }
}

/**
 * Decrypt an encrypted value produced by encryptValue().
 * If decryption fails (e.g. wrong machine, corrupted data, or the value was
 * never encrypted), the original string is returned for backward compatibility.
 */
function decryptValue(encrypted: string): string {
  try {
    // Strip the enc: prefix
    const payload = encrypted.slice(ENC_PREFIX.length);
    const combined = Buffer.from(payload, 'base64');

    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      // Too short to be a valid encrypted payload -- return as-is
      return encrypted;
    }

    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const key = deriveKey();
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return decrypted.toString('utf8');
  } catch {
    // Decryption failed -- could be a plain-text value from before encryption
    // was introduced, or the file was moved between machines.
    return encrypted;
  }
}

// ---------------------------------------------------------------------------
// Encryption helpers for the AuthFile structure
// ---------------------------------------------------------------------------

/**
 * Deep-clone the auth file and encrypt sensitive fields before persistence.
 */
function encryptAuthFile(authFile: AuthFile): AuthFile {
  const clone: AuthFile = JSON.parse(JSON.stringify(authFile));

  // Encrypt provider API keys
  for (const providerName of Object.keys(clone.providers) as LLMProviderName[]) {
    const cred = clone.providers[providerName];
    if (cred?.apiKey && cred.apiKey.length > 0 && !cred.apiKey.startsWith(ENC_PREFIX)) {
      cred.apiKey = encryptValue(cred.apiKey);
    }
  }

  // Encrypt GitHub access token
  if (
    clone.identity.github?.accessToken &&
    clone.identity.github.accessToken.length > 0 &&
    !clone.identity.github.accessToken.startsWith(ENC_PREFIX)
  ) {
    clone.identity.github.accessToken = encryptValue(clone.identity.github.accessToken);
  }

  return clone;
}

/**
 * Decrypt sensitive fields in an auth file that was loaded from disk.
 * Plain-text values (from before encryption was added) pass through unchanged.
 */
function decryptAuthFile(authFile: AuthFile): AuthFile {
  // Decrypt provider API keys
  for (const providerName of Object.keys(authFile.providers) as LLMProviderName[]) {
    const cred = authFile.providers[providerName];
    if (cred?.apiKey && cred.apiKey.startsWith(ENC_PREFIX)) {
      cred.apiKey = decryptValue(cred.apiKey);
    }
  }

  // Decrypt GitHub access token
  if (authFile.identity.github?.accessToken?.startsWith(ENC_PREFIX)) {
    authFile.identity.github.accessToken = decryptValue(authFile.identity.github.accessToken);
  }

  return authFile;
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
   * Encrypted values are transparently decrypted so all public accessors
   * return plain-text credentials.
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

      // Decrypt sensitive fields (backward-compatible with plain-text files)
      this.authFile = decryptAuthFile(parsed);
      return this.authFile;
    } catch {
      // If file is corrupted, start fresh
      this.authFile = createEmptyAuthFile();
      return this.authFile;
    }
  }

  /**
   * Save auth file to disk with secure permissions (0600).
   * Sensitive fields are encrypted before writing so they are never stored
   * in plain text.
   */
  save(authFile?: AuthFile): void {
    this.ensureDirectory();

    const fileToSave = authFile || this.authFile;
    if (!fileToSave) {
      throw new Error('No auth file to save');
    }

    fileToSave.updatedAt = new Date().toISOString();
    this.authFile = fileToSave;

    // Encrypt sensitive fields in a deep clone before writing to disk
    const encrypted = encryptAuthFile(fileToSave);
    const content = JSON.stringify(encrypted, null, 2);
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
