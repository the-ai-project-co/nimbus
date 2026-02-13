import type {
  ConversationalContext,
  ConversationalIntent,
  InfrastructureRequirements,
  IntentEntity,
} from './types';
import { logger } from '@nimbus/shared-utils';

export class ContextExtractor {
  /**
   * Extract infrastructure requirements from intent and context
   */
  extractRequirements(
    intent: ConversationalIntent,
    context?: ConversationalContext
  ): Partial<InfrastructureRequirements> {
    const requirements: Partial<InfrastructureRequirements> = {};

    // Extract from current intent entities
    for (const entity of intent.entities) {
      switch (entity.type) {
        case 'provider':
          requirements.provider = entity.value as any;
          break;

        case 'component':
          if (!requirements.components) {
            requirements.components = [];
          }
          if (!requirements.components.includes(entity.value)) {
            requirements.components.push(entity.value);
          }
          break;

        case 'environment':
          requirements.environment = entity.value;
          break;

        case 'region':
          requirements.region = entity.value;
          break;

        case 'generation_type':
          // Store generation_type so downstream consumers can route accordingly
          (requirements as any).generation_type = entity.value;
          break;
      }
    }

    // Merge with existing context if available
    if (context?.infrastructure_stack) {
      requirements.provider = requirements.provider || context.infrastructure_stack.provider as any;
      requirements.environment = requirements.environment || context.infrastructure_stack.environment;
      requirements.region = requirements.region || context.infrastructure_stack.region;

      if (context.infrastructure_stack.components) {
        if (!requirements.components) {
          requirements.components = [];
        }
        for (const component of context.infrastructure_stack.components) {
          if (!requirements.components.includes(component)) {
            requirements.components.push(component);
          }
        }
      }

      // Inherit generation_type from context if not set in current intent
      if (!(requirements as any).generation_type && context.infrastructure_stack.generation_type) {
        (requirements as any).generation_type = context.infrastructure_stack.generation_type;
      }
    }

    logger.debug('Extracted requirements', requirements);

    return requirements;
  }

  /**
   * Update context with new intent and requirements
   */
  updateContext(
    context: ConversationalContext,
    intent: ConversationalIntent,
    userMessage: string
  ): ConversationalContext {
    const requirements = this.extractRequirements(intent, context);

    // Extract generation_type from intent entities
    const genTypeEntity = this.getEntityByType(intent.entities, 'generation_type');
    const generationType = genTypeEntity?.value as 'terraform' | 'kubernetes' | 'helm' | undefined;

    // Update infrastructure stack
    const updatedContext: ConversationalContext = {
      ...context,
      previous_intent: intent,
      infrastructure_stack: {
        ...context.infrastructure_stack,
        provider: requirements.provider,
        components: requirements.components,
        environment: requirements.environment,
        region: requirements.region,
        generation_type: generationType || context.infrastructure_stack?.generation_type,
      },
      conversation_history: [
        ...context.conversation_history,
        {
          role: 'user',
          message: userMessage,
          intent,
          timestamp: new Date(),
        },
      ],
      updated_at: new Date(),
    };

    return updatedContext;
  }

  /**
   * Create new context
   */
  createContext(sessionId: string, userId?: string): ConversationalContext {
    return {
      user_id: userId,
      session_id: sessionId,
      conversation_history: [],
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  /**
   * Extract missing requirements
   */
  getMissingRequirements(requirements: Partial<InfrastructureRequirements>): string[] {
    const missing: string[] = [];
    const generationType = (requirements as any).generation_type;

    // K8s-specific requirements
    if (generationType === 'kubernetes') {
      if (!requirements.components || requirements.components.length === 0) {
        missing.push('workload type (Deployment, StatefulSet, DaemonSet, CronJob, etc.)');
      }
      if (!requirements.k8s_config?.image) {
        missing.push('container image (e.g., nginx:latest, my-app:v1)');
      }
      return missing;
    }

    // Helm-specific requirements
    if (generationType === 'helm') {
      if (!requirements.helm_config?.chartName) {
        missing.push('chart name (e.g., my-app)');
      }
      if (!requirements.helm_config?.image) {
        missing.push('container image (e.g., nginx, my-app)');
      }
      return missing;
    }

    // Terraform / default requirements
    if (!requirements.provider) {
      missing.push('provider (AWS, GCP, or Azure)');
    }

    if (!requirements.components || requirements.components.length === 0) {
      missing.push('components (VPC, EKS, RDS, S3)');
    }

    // Component-specific requirements
    if (requirements.components?.includes('vpc')) {
      if (!requirements.vpc_config?.cidr) {
        missing.push('VPC CIDR block');
      }
    }

    if (requirements.components?.includes('eks')) {
      if (!requirements.eks_config?.version) {
        missing.push('EKS Kubernetes version');
      }
    }

    if (requirements.components?.includes('rds')) {
      if (!requirements.rds_config?.engine) {
        missing.push('RDS database engine');
      }
    }

    return missing;
  }

  /**
   * Get entity by type
   */
  getEntityByType(entities: IntentEntity[], type: string): IntentEntity | undefined {
    return entities.find((e) => e.type === type);
  }

  /**
   * Get all entities by type
   */
  getEntitiesByType(entities: IntentEntity[], type: string): IntentEntity[] {
    return entities.filter((e) => e.type === type);
  }

  /**
   * Check if requirements are complete for generation
   */
  isReadyForGeneration(requirements: Partial<InfrastructureRequirements>): boolean {
    const generationType = (requirements as any).generation_type;

    // K8s generation: need at least a component (workload type)
    if (generationType === 'kubernetes') {
      return !!(requirements.components && requirements.components.length > 0);
    }

    // Helm generation: minimal requirements
    if (generationType === 'helm') {
      return true;
    }

    // Terraform: must have provider and at least one component
    if (!requirements.provider || !requirements.components || requirements.components.length === 0) {
      return false;
    }

    // Check component-specific requirements
    for (const component of requirements.components) {
      switch (component) {
        case 'vpc':
          if (!requirements.vpc_config?.cidr) return false;
          break;
        case 'eks':
          if (!requirements.eks_config?.version) return false;
          break;
        case 'rds':
          if (!requirements.rds_config?.engine) return false;
          break;
      }
    }

    return true;
  }

  /**
   * Enrich requirements with defaults
   */
  enrichWithDefaults(requirements: Partial<InfrastructureRequirements>): InfrastructureRequirements {
    return {
      provider: requirements.provider || 'aws',
      components: requirements.components || [],
      environment: requirements.environment || 'development',
      region: requirements.region || 'us-east-1',
      vpc_config: {
        cidr: requirements.vpc_config?.cidr || '10.0.0.0/16',
        subnet_count: requirements.vpc_config?.subnet_count || 3,
        ...requirements.vpc_config,
      },
      eks_config: {
        version: requirements.eks_config?.version || '1.28',
        node_count: requirements.eks_config?.node_count || 3,
        instance_type: requirements.eks_config?.instance_type || 't3.medium',
        ...requirements.eks_config,
      },
      rds_config: {
        engine: requirements.rds_config?.engine || 'postgres',
        instance_class: requirements.rds_config?.instance_class || 'db.t3.micro',
        storage: requirements.rds_config?.storage || 20,
        ...requirements.rds_config,
      },
      s3_config: {
        versioning: requirements.s3_config?.versioning ?? true,
        encryption: requirements.s3_config?.encryption ?? true,
        ...requirements.s3_config,
      },
      k8s_config: {
        workloadType: requirements.k8s_config?.workloadType || 'deployment',
        replicas: requirements.k8s_config?.replicas || 1,
        serviceType: requirements.k8s_config?.serviceType || 'ClusterIP',
        containerPort: requirements.k8s_config?.containerPort || 80,
        ...requirements.k8s_config,
      },
      helm_config: {
        replicas: requirements.helm_config?.replicas || 1,
        ...requirements.helm_config,
      },
      tags: {
        Environment: requirements.environment || 'development',
        ManagedBy: 'Terraform',
        ...requirements.tags,
      },
    };
  }

  /**
   * Parse structured data from conversation
   */
  parseStructuredData(text: string): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    // CIDR block extraction
    const cidrMatch = text.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2})\b/);
    if (cidrMatch) {
      data.vpc_cidr = cidrMatch[1];
    }

    // Number extraction
    const nodeCountMatch = text.match(/\\b(\\d+)\\s+nodes?\\b/i);
    if (nodeCountMatch) {
      data.node_count = parseInt(nodeCountMatch[1], 10);
    }

    // Instance type extraction
    const instanceTypeMatch = text.match(/\\b([tmcr]\\d[a-z]?\\.\\w+)\\b/i);
    if (instanceTypeMatch) {
      data.instance_type = instanceTypeMatch[1];
    }

    // Storage size extraction
    const storageMatch = text.match(/\\b(\\d+)\\s*(gb|tb)\\b/i);
    if (storageMatch) {
      const size = parseInt(storageMatch[1], 10);
      const unit = storageMatch[2].toLowerCase();
      data.storage = unit === 'tb' ? size * 1024 : size;
    }

    // Database engine extraction
    const engines = ['postgres', 'mysql', 'mariadb', 'oracle', 'sqlserver', 'aurora'];
    for (const engine of engines) {
      if (text.toLowerCase().includes(engine)) {
        data.db_engine = engine;
        break;
      }
    }

    // Version extraction
    const versionMatch = text.match(/version\\s+([\\d.]+)/i);
    if (versionMatch) {
      data.version = versionMatch[1];
    }

    return data;
  }

  /**
   * Analyze conversation sentiment
   */
  analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const positiveWords = ['yes', 'sure', 'ok', 'sounds good', 'perfect', 'great', 'thanks'];
    const negativeWords = ['no', 'nope', 'cancel', 'stop', 'incorrect', 'wrong'];

    const lowerText = text.toLowerCase();

    const positiveCount = positiveWords.filter((word) => lowerText.includes(word)).length;
    const negativeCount = negativeWords.filter((word) => lowerText.includes(word)).length;

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * Get conversation summary
   */
  getConversationSummary(context: ConversationalContext): string {
    const { conversation_history, infrastructure_stack } = context;

    let summary = 'Conversation Summary:\\n\\n';

    if (infrastructure_stack?.provider) {
      summary += `Provider: ${infrastructure_stack.provider.toUpperCase()}\\n`;
    }

    if (infrastructure_stack?.environment) {
      summary += `Environment: ${infrastructure_stack.environment}\\n`;
    }

    if (infrastructure_stack?.region) {
      summary += `Region: ${infrastructure_stack.region}\\n`;
    }

    if (infrastructure_stack?.components && infrastructure_stack.components.length > 0) {
      summary += `Components: ${infrastructure_stack.components.join(', ')}\\n`;
    }

    if (infrastructure_stack?.generation_type) {
      summary += `Generation Type: ${infrastructure_stack.generation_type}\\n`;
    }

    summary += `\\nTotal turns: ${conversation_history.length}\\n`;

    return summary;
  }
}
