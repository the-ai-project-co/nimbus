/**
 * Auth Bridge - API Key Resolution from ~/.nimbus/auth.json
 *
 * Provides synchronous API key and base URL resolution for LLM provider constructors.
 * Uses fs.readFileSync for constructor compatibility (constructors can't be async).
 * Implements caching to avoid repeated file reads.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Provider name type (must match CLI auth types)
 */
type LLMProviderName = 'anthropic' | 'openai' | 'google' | 'openrouter' | 'ollama';

/**
 * Provider credential from auth file
 */
interface LLMProviderCredential {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

/**
 * Auth file structure (partial - only what we need)
 */
interface AuthFile {
  version: number;
  providers: Partial<Record<LLMProviderName, LLMProviderCredential>>;
}

/**
 * Cache for auth file to avoid repeated reads
 */
let authFileCache: AuthFile | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5000; // 5 second cache TTL

/**
 * Get the path to the auth file
 */
function getAuthFilePath(): string {
  return path.join(os.homedir(), '.nimbus', 'auth.json');
}

/**
 * Load auth file synchronously with caching
 */
function loadAuthFile(): AuthFile | null {
  const now = Date.now();

  // Return cached version if still valid
  if (authFileCache && now - cacheTimestamp < CACHE_TTL_MS) {
    return authFileCache;
  }

  const authPath = getAuthFilePath();

  try {
    if (!fs.existsSync(authPath)) {
      return null;
    }

    const content = fs.readFileSync(authPath, 'utf-8');
    const parsed = JSON.parse(content) as AuthFile;

    // Update cache
    authFileCache = parsed;
    cacheTimestamp = now;

    return parsed;
  } catch {
    // File doesn't exist or is invalid
    return null;
  }
}

/**
 * Get API key for a provider
 *
 * Resolution order:
 * 1. auth.json provider credential
 * 2. Environment variable (fallback)
 *
 * @param providerName - The provider name
 * @returns API key or undefined
 */
export function getProviderApiKey(providerName: LLMProviderName): string | undefined {
  // Try auth.json first
  const authFile = loadAuthFile();
  const credential = authFile?.providers?.[providerName];

  if (credential?.apiKey) {
    return credential.apiKey;
  }

  // Fall back to environment variables
  const envVarMap: Record<LLMProviderName, string | undefined> = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    google: process.env.GOOGLE_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    ollama: undefined, // Ollama doesn't use API keys
  };

  return envVarMap[providerName];
}

/**
 * Get base URL for a provider
 *
 * Resolution order:
 * 1. auth.json provider credential
 * 2. Environment variable (fallback)
 * 3. Default value
 *
 * @param providerName - The provider name
 * @returns Base URL or undefined
 */
export function getProviderBaseUrl(providerName: LLMProviderName): string | undefined {
  // Try auth.json first
  const authFile = loadAuthFile();
  const credential = authFile?.providers?.[providerName];

  if (credential?.baseUrl) {
    return credential.baseUrl;
  }

  // Fall back to environment variables for Ollama
  if (providerName === 'ollama') {
    return process.env.OLLAMA_BASE_URL;
  }

  return undefined;
}

/**
 * Get the configured model for a provider
 *
 * @param providerName - The provider name
 * @returns Model ID or undefined
 */
export function getProviderModel(providerName: LLMProviderName): string | undefined {
  const authFile = loadAuthFile();
  return authFile?.providers?.[providerName]?.model;
}

/**
 * Check if a provider is configured (auth.json or env vars)
 *
 * @param providerName - The provider name
 * @returns true if provider has credentials in auth.json or env vars
 */
export function isProviderConfigured(providerName: LLMProviderName): boolean {
  // Check auth.json first
  const authFile = loadAuthFile();
  const credential = authFile?.providers?.[providerName];

  if (credential) {
    // For Ollama, just needs to exist (no API key required)
    if (providerName === 'ollama') {
      return true;
    }
    // For others, needs an API key in auth.json
    if (credential.apiKey) {
      return true;
    }
  }

  // Fall back to environment variables
  const envVarMap: Record<LLMProviderName, string | undefined> = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    google: process.env.GOOGLE_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    ollama: process.env.OLLAMA_BASE_URL,
  };

  return !!envVarMap[providerName];
}

/**
 * Clear the auth file cache
 * Useful for testing or when auth.json is known to have changed
 */
export function clearAuthCache(): void {
  authFileCache = null;
  cacheTimestamp = 0;
}
