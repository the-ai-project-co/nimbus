/**
 * Provider Registry
 * Auto-detects the provider from a model string
 */

/**
 * Map of known provider prefixes used in "provider/model" format
 */
const PROVIDER_MAP: Record<string, string> = {
  'anthropic': 'anthropic',
  'openai': 'openai',
  'google': 'google',
  'meta-llama': 'openrouter',
  'mistralai': 'openrouter',
  'groq': 'groq',
  'together': 'together',
  'deepseek': 'deepseek',
  'fireworks': 'fireworks',
  'perplexity': 'perplexity',
};

/**
 * Detect the provider for a given model string.
 *
 * Detection strategy:
 * 1. Explicit provider prefix (e.g., "groq/llama-3.1-70b") -- split on "/" and look up prefix
 * 2. Model name pattern matching (e.g., "claude-*" -> anthropic, "gpt-*" -> openai)
 * 3. Default to "anthropic" if no pattern matches
 *
 * @param model - Model identifier, optionally prefixed with "provider/"
 * @returns Detected provider name
 */
export function detectProvider(model: string): string {
  // Explicit provider prefix (e.g., "groq/llama-3.1-70b")
  if (model.includes('/')) {
    const prefix = model.split('/')[0].toLowerCase();
    return PROVIDER_MAP[prefix] || 'openrouter';
  }

  // Model name pattern matching
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gpt')) return 'openai';
  if (model.startsWith('gemini')) return 'google';
  if (model.startsWith('llama') || model.startsWith('mistral') || model.startsWith('codellama') || model.startsWith('phi')) return 'ollama';
  if (model.startsWith('deepseek')) return 'deepseek';

  return 'anthropic'; // default
}
