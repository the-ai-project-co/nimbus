import type { ConversationalIntent, IntentEntity, NLUPattern } from './types';
import { logger } from '@nimbus/shared-utils';

/** System prompt for LLM-based intent classification. */
const INTENT_PROMPT =
  "Classify the user's infrastructure intent. Return JSON with fields: " +
  'intent (one of: generate, modify, explain, help), confidence (number 0-1), ' +
  'entities (array of {type: string, value: string} where type is one of: provider, component, environment, region, generation_type). ' +
  'Return ONLY the JSON object, no markdown.';

/** Valid intent types returned by the LLM. */
const VALID_INTENTS = new Set(['generate', 'modify', 'explain', 'help']);

export class IntentParser {
  private patterns: NLUPattern[];

  /** Base URL for the LLM service. */
  private llmServiceUrl = process.env.LLM_SERVICE_URL || 'http://localhost:3002';

  constructor() {
    this.patterns = this.initializePatterns();
  }

  /**
   * Parse user input to extract intent and entities.
   * Attempts LLM-based classification first, falls back to regex/keyword matching.
   */
  async parse(input: string): Promise<ConversationalIntent> {
    try {
      const llmResult = await this.parseWithLLM(input);
      if (llmResult) {
        logger.debug(`Using LLM-classified intent: ${llmResult.type} (confidence: ${llmResult.confidence})`);
        return llmResult;
      }
    } catch (error) {
      logger.debug(`LLM intent parsing failed, falling back to heuristics: ${(error as Error).message}`);
    }

    return this.parseHeuristic(input);
  }

  /**
   * Classify intent using the LLM service.
   */
  private async parseWithLLM(input: string): Promise<ConversationalIntent | null> {
    const response = await fetch(`${this.llmServiceUrl}/api/llm/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: INTENT_PROMPT },
          { role: 'user', content: input },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM service returned status ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('LLM response missing content');
    }

    const parsed: unknown = JSON.parse(content);

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

    // Only use LLM result if confidence is sufficient (>= 0.9 for high-quality results)
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
          type: pattern.intent as any,
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

    // Higher confidence if the match covers more of the input
    const coverage = matchedLength / inputLength;

    // Base confidence on coverage
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

    const words = input.split(/\\s+/);

    // Check for generate intent
    if (generateKeywords.some((kw) => input.includes(kw))) {
      const entities = this.extractKeywordEntities(input);
      return {
        type: 'generate',
        confidence: 0.6,
        entities,
      };
    }

    // Check for modify intent
    if (modifyKeywords.some((kw) => input.includes(kw))) {
      const entities = this.extractKeywordEntities(input);
      return {
        type: 'modify',
        confidence: 0.6,
        entities,
      };
    }

    // Check for explain intent
    if (explainKeywords.some((kw) => input.includes(kw))) {
      const entities = this.extractKeywordEntities(input);
      return {
        type: 'explain',
        confidence: 0.6,
        entities,
      };
    }

    // Check for help intent
    if (helpKeywords.some((kw) => input.includes(kw))) {
      return {
        type: 'help',
        confidence: 0.7,
        entities: [],
      };
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

    // K8s workload type extraction (check before generic components to set generation_type)
    const k8sWorkloads = ['deployment', 'pod', 'service', 'ingress', 'namespace', 'statefulset', 'daemonset', 'cronjob'];
    let foundK8sWorkload = false;
    for (const workload of k8sWorkloads) {
      if (input.includes(workload)) {
        entities.push({
          type: 'component',
          value: workload,
          confidence: 0.8,
        });
        foundK8sWorkload = true;
      }
    }

    if (foundK8sWorkload) {
      entities.push({
        type: 'generation_type',
        value: 'kubernetes',
        confidence: 0.85,
      });
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
      // If helm is found, override generation_type to helm
      const existingGenType = entities.find((e) => e.type === 'generation_type');
      if (existingGenType) {
        existingGenType.value = 'helm';
      } else {
        entities.push({
          type: 'generation_type',
          value: 'helm',
          confidence: 0.85,
        });
      }
    }

    // Component extraction (cloud infrastructure components)
    const components = ['vpc', 'eks', 'kubernetes', 'k8s', 'rds', 'database', 's3', 'storage', 'bucket'];
    for (const component of components) {
      if (input.includes(component)) {
        // Skip if already added as a K8s workload
        if (foundK8sWorkload && (component === 'kubernetes' || component === 'k8s')) {
          continue;
        }

        let normalizedComponent = component;

        // When generation_type is kubernetes or helm, map k8s/kubernetes to 'kubernetes'
        const genTypeEntity = entities.find((e) => e.type === 'generation_type');
        const isK8sGeneration = genTypeEntity && (genTypeEntity.value === 'kubernetes' || genTypeEntity.value === 'helm');

        if (component === 'k8s' || component === 'kubernetes') {
          normalizedComponent = isK8sGeneration ? 'kubernetes' : 'eks';
        }
        if (component === 'database') normalizedComponent = 'rds';
        if (component === 'storage' || component === 'bucket') normalizedComponent = 's3';

        // Avoid duplicate component entries
        if (!entities.some((e) => e.type === 'component' && e.value === normalizedComponent)) {
          entities.push({
            type: 'component',
            value: normalizedComponent,
            confidence: 0.8,
          });
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

        entities.push({
          type: 'environment',
          value: normalizedEnv,
          confidence: 0.85,
        });
        break;
      }
    }

    // Region extraction
    const regionPattern = /\\b(us-east-1|us-west-2|eu-west-1|eu-central-1|ap-southeast-1|ap-northeast-1)\\b/;
    const regionMatch = input.match(regionPattern);
    if (regionMatch) {
      entities.push({
        type: 'region',
        value: regionMatch[0],
        confidence: 0.95,
      });
    }

    return entities;
  }

  /**
   * Initialize NLU patterns
   */
  private initializePatterns(): NLUPattern[] {
    return [
      // Generate Helm chart patterns (check before generic K8s to avoid conflicts)
      {
        pattern: /(?:create|generate|build)\s+(?:a|an)?\s*helm\s+chart/i,
        intent: 'generate',
        entities: [
          {
            type: 'generation_type',
            extractor: () => 'helm',
          },
        ],
      },
      // Generate Kubernetes resource patterns
      {
        pattern: /(?:create|generate|build|deploy)\s+(?:a|an)?\s*(deployment|pod|service|statefulset|daemonset|cronjob|ingress)/i,
        intent: 'generate',
        entities: [
          {
            type: 'component',
            extractor: (match) => match[1].toLowerCase(),
          },
          {
            type: 'generation_type',
            extractor: () => 'kubernetes',
          },
        ],
      },
      // Generate infrastructure patterns
      {
        pattern: /(?:create|generate|build|setup)\\s+(?:a|an)?\\s*(vpc|eks|rds|s3|kubernetes|k8s)(?:\\s+on|\\s+in)?\\s+(aws|gcp|azure)?/i,
        intent: 'generate',
        entities: [
          {
            type: 'component',
            extractor: (match) => {
              const component = match[1].toLowerCase();
              if (component === 'k8s' || component === 'kubernetes') return 'eks';
              return component;
            },
          },
          {
            type: 'provider',
            extractor: (match) => match[2]?.toLowerCase() || 'aws',
          },
        ],
      },
      {
        pattern: /(?:create|generate|build|setup)\\s+(?:a|an)?\\s*(production|staging|development)\\s+environment/i,
        intent: 'generate',
        entities: [
          {
            type: 'environment',
            extractor: (match) => match[1].toLowerCase(),
          },
        ],
      },
      {
        pattern: /(?:i need|i want|can you create)\\s+(?:a|an)?\\s*(vpc|eks|rds|s3)/i,
        intent: 'generate',
        entities: [
          {
            type: 'component',
            extractor: (match) => match[1].toLowerCase(),
          },
        ],
      },
      {
        pattern: /deploy\\s+(?:a|an)?\\s*(.+?)\\s+(?:on|to|in)\\s+(aws|gcp|azure)/i,
        intent: 'generate',
        entities: [
          {
            type: 'component',
            extractor: (match) => match[1].toLowerCase().trim(),
          },
          {
            type: 'provider',
            extractor: (match) => match[2].toLowerCase(),
          },
        ],
      },
      // Modify patterns
      {
        pattern: /(?:change|modify|update|edit)\\s+(?:the|my)?\\s*(vpc|eks|rds|s3)/i,
        intent: 'modify',
        entities: [
          {
            type: 'component',
            extractor: (match) => match[1].toLowerCase(),
          },
        ],
      },
      {
        pattern: /(?:add|enable|disable|remove)\\s+(.+?)\\s+(?:to|from|for|in)\\s+(?:the|my)?\\s*(vpc|eks|rds|s3)/i,
        intent: 'modify',
        entities: [
          {
            type: 'action',
            extractor: (match) => match[1].toLowerCase(),
          },
          {
            type: 'component',
            extractor: (match) => match[2].toLowerCase(),
          },
        ],
      },
      // Explain patterns
      {
        pattern: /(?:what|explain|describe|tell me about)\\s+(?:is|are)?\\s*(?:a|an|the)?\\s*(vpc|eks|rds|s3|terraform|kubernetes|helm|deployment|statefulset|ingress)/i,
        intent: 'explain',
        entities: [
          {
            type: 'topic',
            extractor: (match) => match[1].toLowerCase(),
          },
        ],
      },
      {
        pattern: /(?:why|how)\\s+(?:do|does|should|would)\\s+(?:i|we)?\\s*(.+)/i,
        intent: 'explain',
        entities: [
          {
            type: 'question',
            extractor: (match) => match[1].toLowerCase(),
          },
        ],
      },
      // Help patterns
      {
        pattern: /(?:help|assist|guide|support|how to)/i,
        intent: 'help',
      },
      {
        pattern: /(?:what can you do|what are your capabilities|show me what you can do)/i,
        intent: 'help',
      },
    ];
  }
}
