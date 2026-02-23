/**
 * Intent Parser (Embedded)
 *
 * Parses natural language user input to extract infrastructure intent and entities.
 * Uses the embedded LLM router directly instead of HTTP calls to llm-service.
 *
 * Refactored from: services/generator-service/src/conversational/intent-parser.ts
 */

import { logger } from '../utils';
import type { LLMRouter } from '../llm/router';

// ==========================================
// Types (inlined from conversational/types.ts)
// ==========================================

export interface ConversationalIntent {
  type: 'generate' | 'modify' | 'explain' | 'help' | 'unknown';
  confidence: number;
  entities: IntentEntity[];
  context?: Record<string, unknown>;
}

export interface IntentEntity {
  type: string; // 'provider', 'component', 'environment', 'region', 'generation_type', etc.
  value: string;
  confidence: number;
  position?: { start: number; end: number };
}

export interface NLUPattern {
  pattern: RegExp;
  intent: string;
  entities?: Array<{
    type: string;
    extractor: (match: RegExpMatchArray) => string;
  }>;
}

// ==========================================
// Constants
// ==========================================

/** System prompt for LLM-based intent classification. */
const INTENT_PROMPT =
  "Classify the user's infrastructure intent. Return JSON with fields: " +
  'intent (one of: generate, modify, explain, help), confidence (number 0-1), ' +
  'entities (array of {type: string, value: string} where type is one of: provider, component, environment, region, generation_type). ' +
  'Return ONLY the JSON object, no markdown.';

/** Valid intent types returned by the LLM. */
const VALID_INTENTS = new Set(['generate', 'modify', 'explain', 'help']);

// ==========================================
// IntentParser Class
// ==========================================

export class IntentParser {
  private patterns: NLUPattern[];
  private router: LLMRouter | null;

  constructor(router?: LLMRouter) {
    this.patterns = this.initializePatterns();
    this.router = router || null;
  }

  /**
   * Set or update the LLM router (for lazy initialization)
   */
  setRouter(router: LLMRouter): void {
    this.router = router;
  }

  /**
   * Parse user input to extract intent and entities.
   * Attempts LLM-based classification first, falls back to regex/keyword matching.
   */
  async parse(input: string): Promise<ConversationalIntent> {
    if (this.router) {
      try {
        const llmResult = await this.parseWithLLM(input);
        if (llmResult) {
          logger.debug(`Using LLM-classified intent: ${llmResult.type} (confidence: ${llmResult.confidence})`);
          return llmResult;
        }
      } catch (error) {
        logger.debug(`LLM intent parsing failed, falling back to heuristics: ${(error as Error).message}`);
      }
    }

    return this.parseHeuristic(input);
  }

  /**
   * Classify intent using the embedded LLM router (replaces HTTP fetch to llm-service).
   */
  private async parseWithLLM(input: string): Promise<ConversationalIntent | null> {
    if (!this.router) {
      return null;
    }

    // Use a timeout via AbortController-like approach
    const timeoutMs = 3_000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('LLM intent classification timed out')), timeoutMs)
    );

    const routePromise = this.router.route({
      messages: [
        { role: 'system', content: INTENT_PROMPT },
        { role: 'user', content: input },
      ],
      maxTokens: 512,
      temperature: 0.1,
    });

    const response = await Promise.race([routePromise, timeoutPromise]);

    const content = response.content;
    if (!content) {
      throw new Error('LLM response missing content');
    }

    // Strip markdown code fences if present
    const jsonStr = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    const parsed: unknown = JSON.parse(jsonStr);

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('LLM response is not an object');
    }

    const obj = parsed as Record<string, unknown>;

    // Validate required fields
    if (typeof obj.intent !== 'string' || typeof obj.confidence !== 'number') {
      throw new Error('LLM response missing required fields');
    }

    // Map intent to type, defaulting to 'unknown' for unrecognized intents
    const intentType: ConversationalIntent['type'] = VALID_INTENTS.has(obj.intent)
      ? (obj.intent as ConversationalIntent['type'])
      : 'unknown';

    // Only use LLM result if confidence is sufficient
    const confidence = Math.min(obj.confidence, 1);

    // Parse entities
    const entities: IntentEntity[] = [];
    if (Array.isArray(obj.entities)) {
      for (const entity of obj.entities) {
        if (
          typeof entity === 'object' &&
          entity !== null &&
          typeof entity.type === 'string' &&
          typeof entity.value === 'string'
        ) {
          entities.push({
            type: entity.type,
            value: entity.value,
            confidence: 0.9,
          });
        }
      }
    }

    return {
      type: intentType,
      confidence,
      entities,
    };
  }

  /**
   * Parse user input using regex patterns and keyword matching (fallback).
   */
  private parseHeuristic(input: string): ConversationalIntent {
    const normalizedInput = input.toLowerCase().trim();

    // Try to match patterns
    for (const pattern of this.patterns) {
      const match = normalizedInput.match(pattern.pattern);
      if (match) {
        const entities = this.extractEntities(match, pattern);
        return {
          type: pattern.intent as ConversationalIntent['type'],
          confidence: this.calculateConfidence(match, normalizedInput),
          entities,
        };
      }
    }

    // No pattern matched - try keyword-based matching
    const keywordIntent = this.matchByKeywords(normalizedInput);
    if (keywordIntent) {
      return keywordIntent;
    }

    // Unknown intent
    return {
      type: 'unknown',
      confidence: 0,
      entities: [],
    };
  }

  /**
   * Extract entities from regex match
   */
  private extractEntities(match: RegExpMatchArray, pattern: NLUPattern): IntentEntity[] {
    const entities: IntentEntity[] = [];

    if (!pattern.entities) return entities;

    for (const entityConfig of pattern.entities) {
      try {
        const value = entityConfig.extractor(match);
        if (value) {
          entities.push({
            type: entityConfig.type,
            value,
            confidence: 0.9,
          });
        }
      } catch (error) {
        logger.error('Error extracting entity', error);
      }
    }

    return entities;
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(match: RegExpMatchArray, input: string): number {
    const matchedLength = match[0].length;
    const inputLength = input.length;
    const coverage = matchedLength / inputLength;
    return Math.min(0.9, 0.5 + coverage * 0.4);
  }

  /**
   * Match intent by keywords when patterns don't match
   */
  private matchByKeywords(input: string): ConversationalIntent | null {
    const generateKeywords = [
      'create', 'generate', 'build', 'setup', 'deploy', 'provision',
      'deployment', 'pod', 'statefulset', 'daemonset', 'cronjob', 'ingress',
      'helm', 'chart', 'manifest',
    ];
    const modifyKeywords = ['change', 'modify', 'update', 'edit', 'adjust', 'alter'];
    const explainKeywords = ['explain', 'what', 'why', 'how', 'tell me about', 'describe'];
    const helpKeywords = ['help', 'assist', 'guide', 'support'];

    if (generateKeywords.some((kw) => input.includes(kw))) {
      return { type: 'generate', confidence: 0.6, entities: this.extractKeywordEntities(input) };
    }

    if (modifyKeywords.some((kw) => input.includes(kw))) {
      return { type: 'modify', confidence: 0.6, entities: this.extractKeywordEntities(input) };
    }

    if (explainKeywords.some((kw) => input.includes(kw))) {
      return { type: 'explain', confidence: 0.6, entities: this.extractKeywordEntities(input) };
    }

    if (helpKeywords.some((kw) => input.includes(kw))) {
      return { type: 'help', confidence: 0.7, entities: [] };
    }

    return null;
  }

  /**
   * Extract entities using keyword matching
   */
  private extractKeywordEntities(input: string): IntentEntity[] {
    const entities: IntentEntity[] = [];

    // Provider extraction
    const providers = ['aws', 'gcp', 'google cloud', 'azure'];
    for (const provider of providers) {
      if (input.includes(provider)) {
        entities.push({
          type: 'provider',
          value: provider === 'google cloud' ? 'gcp' : provider,
          confidence: 0.9,
        });
        break;
      }
    }

    // K8s workload type extraction
    const k8sWorkloads = ['deployment', 'pod', 'service', 'ingress', 'namespace', 'statefulset', 'daemonset', 'cronjob'];
    let foundK8sWorkload = false;
    for (const workload of k8sWorkloads) {
      if (input.includes(workload)) {
        entities.push({ type: 'component', value: workload, confidence: 0.8 });
        foundK8sWorkload = true;
      }
    }

    if (foundK8sWorkload) {
      entities.push({ type: 'generation_type', value: 'kubernetes', confidence: 0.85 });
    }

    // Helm keyword extraction
    const helmKeywords = ['helm chart', 'helm', 'chart', 'values.yaml'];
    let foundHelm = false;
    for (const keyword of helmKeywords) {
      if (input.includes(keyword)) {
        foundHelm = true;
        break;
      }
    }

    if (foundHelm) {
      const existingGenType = entities.find((e) => e.type === 'generation_type');
      if (existingGenType) {
        existingGenType.value = 'helm';
      } else {
        entities.push({ type: 'generation_type', value: 'helm', confidence: 0.85 });
      }
    }

    // Component extraction (cloud infrastructure)
    const components = ['vpc', 'eks', 'kubernetes', 'k8s', 'rds', 'database', 's3', 'storage', 'bucket'];
    for (const component of components) {
      if (input.includes(component)) {
        if (foundK8sWorkload && (component === 'kubernetes' || component === 'k8s')) continue;

        let normalizedComponent = component;
        const genTypeEntity = entities.find((e) => e.type === 'generation_type');
        const isK8sGeneration = genTypeEntity && (genTypeEntity.value === 'kubernetes' || genTypeEntity.value === 'helm');

        if (component === 'k8s' || component === 'kubernetes') {
          normalizedComponent = isK8sGeneration ? 'kubernetes' : 'eks';
        }
        if (component === 'database') normalizedComponent = 'rds';
        if (component === 'storage' || component === 'bucket') normalizedComponent = 's3';

        if (!entities.some((e) => e.type === 'component' && e.value === normalizedComponent)) {
          entities.push({ type: 'component', value: normalizedComponent, confidence: 0.8 });
        }
      }
    }

    // Environment extraction
    const environments = ['production', 'staging', 'development', 'dev', 'prod', 'test'];
    for (const env of environments) {
      if (input.includes(env)) {
        let normalizedEnv = env;
        if (env === 'dev') normalizedEnv = 'development';
        if (env === 'prod') normalizedEnv = 'production';
        entities.push({ type: 'environment', value: normalizedEnv, confidence: 0.85 });
        break;
      }
    }

    // Region extraction
    const regionPattern = /\b(us-east-1|us-west-2|eu-west-1|eu-central-1|ap-southeast-1|ap-northeast-1)\b/;
    const regionMatch = input.match(regionPattern);
    if (regionMatch) {
      entities.push({ type: 'region', value: regionMatch[0], confidence: 0.95 });
    }

    return entities;
  }

  /**
   * Initialize NLU patterns
   */
  private initializePatterns(): NLUPattern[] {
    return [
      // Generate Helm chart patterns
      {
        pattern: /(?:create|generate|build)\s+(?:a|an)?\s*helm\s+chart/i,
        intent: 'generate',
        entities: [{ type: 'generation_type', extractor: () => 'helm' }],
      },
      // Generate Kubernetes resource patterns
      {
        pattern: /(?:create|generate|build|deploy)\s+(?:a|an)?\s*(deployment|pod|service|statefulset|daemonset|cronjob|ingress)/i,
        intent: 'generate',
        entities: [
          { type: 'component', extractor: (match) => match[1].toLowerCase() },
          { type: 'generation_type', extractor: () => 'kubernetes' },
        ],
      },
      // Generate infrastructure patterns
      {
        pattern: /(?:create|generate|build|setup)\s+(?:a|an)?\s*(vpc|eks|rds|s3|kubernetes|k8s)(?:\s+on|\s+in)?\s+(aws|gcp|azure)?/i,
        intent: 'generate',
        entities: [
          {
            type: 'component',
            extractor: (match) => {
              const c = match[1].toLowerCase();
              return c === 'k8s' || c === 'kubernetes' ? 'eks' : c;
            },
          },
          { type: 'provider', extractor: (match) => match[2]?.toLowerCase() || 'aws' },
        ],
      },
      {
        pattern: /(?:create|generate|build|setup)\s+(?:a|an)?\s*(production|staging|development)\s+environment/i,
        intent: 'generate',
        entities: [{ type: 'environment', extractor: (match) => match[1].toLowerCase() }],
      },
      {
        pattern: /(?:i need|i want|can you create)\s+(?:a|an)?\s*(vpc|eks|rds|s3)/i,
        intent: 'generate',
        entities: [{ type: 'component', extractor: (match) => match[1].toLowerCase() }],
      },
      {
        pattern: /deploy\s+(?:a|an)?\s*(.+?)\s+(?:on|to|in)\s+(aws|gcp|azure)/i,
        intent: 'generate',
        entities: [
          { type: 'component', extractor: (match) => match[1].toLowerCase().trim() },
          { type: 'provider', extractor: (match) => match[2].toLowerCase() },
        ],
      },
      // Modify patterns
      {
        pattern: /(?:change|modify|update|edit)\s+(?:the|my)?\s*(vpc|eks|rds|s3)/i,
        intent: 'modify',
        entities: [{ type: 'component', extractor: (match) => match[1].toLowerCase() }],
      },
      {
        pattern: /(?:add|enable|disable|remove)\s+(.+?)\s+(?:to|from|for|in)\s+(?:the|my)?\s*(vpc|eks|rds|s3)/i,
        intent: 'modify',
        entities: [
          { type: 'action', extractor: (match) => match[1].toLowerCase() },
          { type: 'component', extractor: (match) => match[2].toLowerCase() },
        ],
      },
      // Explain patterns
      {
        pattern: /(?:what|explain|describe|tell me about)\s+(?:is|are)?\s*(?:a|an|the)?\s*(vpc|eks|rds|s3|terraform|kubernetes|helm|deployment|statefulset|ingress)/i,
        intent: 'explain',
        entities: [{ type: 'topic', extractor: (match) => match[1].toLowerCase() }],
      },
      {
        pattern: /(?:why|how)\s+(?:do|does|should|would)\s+(?:i|we)?\s*(.+)/i,
        intent: 'explain',
        entities: [{ type: 'question', extractor: (match) => match[1].toLowerCase() }],
      },
      // Help patterns
      { pattern: /(?:help|assist|guide|support|how to)/i, intent: 'help' },
      { pattern: /(?:what can you do|what are your capabilities|show me what you can do)/i, intent: 'help' },
    ];
  }
}
