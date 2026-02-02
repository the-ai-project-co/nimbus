import type { ConversationalIntent, IntentEntity, NLUPattern } from './types';
import { logger } from '@nimbus/shared-utils';

export class IntentParser {
  private patterns: NLUPattern[];

  constructor() {
    this.patterns = this.initializePatterns();
  }

  /**
   * Parse user input to extract intent and entities
   */
  parse(input: string): ConversationalIntent {
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
    const generateKeywords = ['create', 'generate', 'build', 'setup', 'deploy', 'provision'];
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

    // Component extraction
    const components = ['vpc', 'eks', 'kubernetes', 'k8s', 'rds', 'database', 's3', 'storage', 'bucket'];
    for (const component of components) {
      if (input.includes(component)) {
        let normalizedComponent = component;
        if (component === 'k8s') normalizedComponent = 'eks';
        if (component === 'kubernetes') normalizedComponent = 'eks';
        if (component === 'database') normalizedComponent = 'rds';
        if (component === 'storage' || component === 'bucket') normalizedComponent = 's3';

        entities.push({
          type: 'component',
          value: normalizedComponent,
          confidence: 0.8,
        });
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
        pattern: /(?:what|explain|describe|tell me about)\\s+(?:is|are)?\\s*(?:a|an|the)?\\s*(vpc|eks|rds|s3|terraform|kubernetes)/i,
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
