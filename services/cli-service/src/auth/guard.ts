/**
 * Auth Guard - First-Run Detection
 * Detects when authentication is needed and triggers the login wizard
 */

import { authStore } from './store';

/**
 * Check if authentication is required
 * Returns true if ~/.nimbus/auth.json is missing or has no providers configured
 */
export function requiresAuth(): boolean {
  return !authStore.exists();
}

/**
 * Check if authentication is configured
 * Returns true if there are any providers configured
 */
export function isAuthenticated(): boolean {
  return authStore.exists();
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
