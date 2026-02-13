/**
 * LLM Providers
 * Export all provider implementations and base types
 */

export * from './base';
export { AnthropicProvider } from './anthropic';
export { OpenAIProvider } from './openai';
export { GoogleProvider } from './google';
export { OllamaProvider } from './ollama';
export { OpenRouterProvider } from './openrouter';

// Auth bridge for credential resolution
export {
  getProviderApiKey,
  getProviderBaseUrl,
  getProviderModel,
  isProviderConfigured,
  clearAuthCache,
} from './auth-bridge';
