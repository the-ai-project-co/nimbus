/**
 * Authentication Types
 * Type definitions for the Nimbus CLI authentication system
 */

/**
 * LLM Provider identifiers
 */
export type LLMProviderName = 'anthropic' | 'openai' | 'google' | 'openrouter' | 'ollama';

/**
 * GitHub identity information from OAuth
 */
export interface GitHubIdentity {
  username: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  accessToken: string;
  authenticatedAt: string;
}

/**
 * LLM Provider credential configuration
 */
export interface LLMProviderCredential {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  validatedAt?: string;
  isDefault?: boolean;
}

/**
 * Identity section of auth file
 */
export interface AuthIdentity {
  github?: GitHubIdentity;
}

/**
 * Providers section of auth file - map of provider name to credential
 */
export type AuthProviders = Partial<Record<LLMProviderName, LLMProviderCredential>>;

/**
 * Complete auth file schema stored at ~/.nimbus/auth.json
 */
export interface AuthFile {
  version: number;
  identity: AuthIdentity;
  providers: AuthProviders;
  defaultProvider?: LLMProviderName;
  createdAt: string;
  updatedAt: string;
}

/**
 * Auth status summary for display
 */
export interface AuthStatus {
  hasIdentity: boolean;
  hasProviders: boolean;
  isConfigured: boolean;
  identity?: {
    provider: 'github';
    username: string;
    name: string | null;
    authenticatedAt: string;
  };
  providers: Array<{
    name: LLMProviderName;
    model: string;
    isDefault: boolean;
    validatedAt?: string;
  }>;
  defaultProvider?: LLMProviderName;
}

/**
 * Login wizard context - accumulated state through wizard steps
 */
export interface LoginWizardContext {
  // GitHub identity step
  skipGitHub?: boolean;
  githubIdentity?: GitHubIdentity;

  // Provider configuration step (can have multiple)
  configuredProviders: Array<{
    name: LLMProviderName;
    apiKey?: string;
    baseUrl?: string;
    model: string;
  }>;

  // Default provider step
  defaultProvider?: LLMProviderName;

  // Completion state
  completed?: boolean;
  cancelled?: boolean;
}

/**
 * Provider metadata for registry
 */
export interface ProviderInfo {
  name: LLMProviderName;
  displayName: string;
  description: string;
  envVarName?: string;
  apiKeyUrl?: string;
  models: Array<{
    id: string;
    name: string;
    isDefault?: boolean;
  }>;
  requiresApiKey: boolean;
  supportsBaseUrl?: boolean;
  defaultBaseUrl?: string;
}

/**
 * GitHub OAuth device flow response
 */
export interface GitHubDeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

/**
 * GitHub OAuth access token response
 */
export interface GitHubAccessTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

/**
 * GitHub user profile response
 */
export interface GitHubUserResponse {
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

/**
 * GitHub user email response
 */
export interface GitHubEmailResponse {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

/**
 * Provider validation result
 */
export interface ProviderValidationResult {
  valid: boolean;
  error?: string;
  models?: string[];
}
