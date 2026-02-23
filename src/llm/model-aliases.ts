/**
 * Model alias resolution
 * Maps short names to full model identifiers
 */

const MODEL_ALIASES: Record<string, string> = {
  // Anthropic shortcuts
  'sonnet': 'claude-sonnet-4-20250514',
  'haiku': 'claude-haiku-4-20250514',
  'opus': 'claude-opus-4-20250514',
  'claude': 'claude-sonnet-4-20250514',

  // OpenAI shortcuts
  'gpt4': 'gpt-4o',
  'gpt4o': 'gpt-4o',
  'gpt4mini': 'gpt-4o-mini',
  '4o': 'gpt-4o',
  '4o-mini': 'gpt-4o-mini',

  // Google shortcuts
  'gemini': 'gemini-2.0-flash-exp',
  'gemini-flash': 'gemini-2.0-flash-exp',
  'gemini-pro': 'gemini-1.5-pro',

  // Local shortcuts
  'llama': 'llama3.2',
  'mistral': 'mistral',
  'codellama': 'codellama',
};

/**
 * Resolve a model alias to its full model identifier.
 * Returns the original string if no alias match is found.
 *
 * @param modelOrAlias - Short alias or full model identifier
 * @returns Resolved full model identifier
 */
export function resolveModelAlias(modelOrAlias: string): string {
  return MODEL_ALIASES[modelOrAlias.toLowerCase()] || modelOrAlias;
}

/**
 * Get a copy of all registered model aliases.
 *
 * @returns Record mapping alias names to full model identifiers
 */
export function getAliases(): Record<string, string> {
  return { ...MODEL_ALIASES };
}
