/**
 * Auth Module - Barrel Export
 * Exports all authentication-related functionality
 */

// Types
export type {
  LLMProviderName,
  GitHubIdentity,
  LLMProviderCredential,
  AuthFile,
  AuthIdentity,
  AuthProviders,
  AuthStatus,
  LoginWizardContext,
  ProviderInfo,
  GitHubDeviceCodeResponse,
  GitHubAccessTokenResponse,
  GitHubUserResponse,
  GitHubEmailResponse,
  ProviderValidationResult,
} from './types';

// Store
export { AuthStore, authStore } from './store';

// Providers
export {
  PROVIDER_REGISTRY,
  getProviderInfo,
  getProviderNames,
  getDefaultModel,
  validateProviderApiKey,
} from './providers';

// OAuth
export {
  GitHubDeviceFlow,
  BrowserOAuthServer,
  fetchGitHubUser,
  fetchGitHubEmail,
  completeGitHubAuth,
  exchangeCodeForToken,
} from './oauth';

// Guard
export { requiresAuth, isAuthenticated, getAuthMessage } from './guard';

// SSO Device Flow
export { SSODeviceFlow, validateSSOToken } from './sso';

// Helper to get auth store instance
import { AuthStore as AuthStoreClass, authStore as authStoreInstance } from './store';
export function getAuthStore(): AuthStoreClass {
  return authStoreInstance;
}
