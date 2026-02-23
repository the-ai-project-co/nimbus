/**
 * Auth Guard - First-Run Detection
 * Detects when authentication is needed and triggers the login wizard
 */

import { authStore } from './store';

/**
 * Environment variable names for LLM provider API keys
 */
const PROVIDER_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'OPENROUTER_API_KEY',
  'OLLAMA_BASE_URL', // Ollama doesn't need API key, just base URL
];

/**
 * Check if any provider API key is available via environment variables
 */
function hasEnvVarCredentials(): boolean {
  return PROVIDER_ENV_VARS.some((envVar) => !!process.env[envVar]);
}

/**
 * Check if authentication is required
 * Returns true if no providers configured in auth.json AND no env vars set
 */
export function requiresAuth(): boolean {
  // If auth.json has providers, auth is not required
  if (authStore.exists()) {
    return false;
  }

  // If any provider env var is set, auth is not required
  if (hasEnvVarCredentials()) {
    return false;
  }

  return true;
}

/**
 * Check if authentication is configured
 * Returns true if there are any providers configured (auth.json or env vars)
 */
export function isAuthenticated(): boolean {
  return authStore.exists() || hasEnvVarCredentials();
}

/**
 * Get a human-readable auth status message
 */
export function getAuthMessage(): string {
  if (!requiresAuth()) {
    const status = authStore.getStatus();
    const providerCount = status.providers.length;
    const defaultProvider = status.defaultProvider;

    if (status.hasIdentity) {
      return `Authenticated as ${status.identity?.username} with ${providerCount} provider(s). Default: ${defaultProvider}`;
    }

    return `Configured with ${providerCount} provider(s). Default: ${defaultProvider}`;
  }

  return 'Not authenticated. Run `nimbus login` to get started.';
}
