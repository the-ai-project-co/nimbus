import { logger } from '@nimbus/shared-utils';
import { IntentParser } from './intent-parser';
import { ContextExtractor } from './context-extractor';
import type {
  ConversationalContext,
  ConversationalResponse,
  ConversationalTurn,
  SuggestedAction,
} from './types';

export class ConversationalEngine {
  private intentParser: IntentParser;
  private contextExtractor: ContextExtractor;
  private sessions: Map<string, ConversationalContext>;

  constructor() {
    this.intentParser = new IntentParser();
    this.contextExtractor = new ContextExtractor();
    this.sessions = new Map();

    logger.info('Initialized Conversational Engine');
  }

  /**
   * Process user message and generate response
   */
  processMessage(
    sessionId: string,
    message: string,
    userId?: string
  ): ConversationalResponse {
    // Get or create session
    let context = this.sessions.get(sessionId);
    if (!context) {
      context = this.contextExtractor.createContext(sessionId, userId);
      this.sessions.set(sessionId, context);
      logger.info(`Created new conversational session: ${sessionId}`);
    }

    // Parse intent
    const intent = this.intentParser.parse(message);
    logger.debug(`Parsed intent: ${intent.type} (confidence: ${intent.confidence})`);

    // Update context
    context = this.contextExtractor.updateContext(context, intent, message);
    this.sessions.set(sessionId, context);

    // Generate response based on intent
    const response = this.generateResponse(intent, context, message);

    // Add assistant response to history
    context.conversation_history.push({
      role: 'assistant',
      message: response.message,
      timestamp: new Date(),
    });

    return response;
  }

  /**
   * Generate response based on intent
   */
  private generateResponse(
    intent: any,
    context: ConversationalContext,
    userMessage: string
  ): ConversationalResponse {
    switch (intent.type) {
      case 'generate':
        return this.handleGenerateIntent(intent, context, userMessage);

      case 'modify':
        return this.handleModifyIntent(intent, context);

      case 'explain':
        return this.handleExplainIntent(intent, context);

      case 'help':
        return this.handleHelpIntent(context);

      default:
        return this.handleUnknownIntent(context);
    }
  }

  /**
   * Handle generate infrastructure intent
   */
  private handleGenerateIntent(
    intent: any,
    context: ConversationalContext,
    userMessage: string
  ): ConversationalResponse {
    const requirements = this.contextExtractor.extractRequirements(intent, context);

    // Parse structured data from message
    const structuredData = this.contextExtractor.parseStructuredData(userMessage);
    Object.assign(requirements, structuredData);

    // Check what's missing
    const missing = this.contextExtractor.getMissingRequirements(requirements);

    if (missing.length > 0) {
      // Need more information
      return {
        message: this.buildClarificationMessage(requirements, missing),
        intent,
        needs_clarification: missing,
        extracted_requirements: requirements,
        suggested_actions: this.buildClarificationActions(missing),
        context,
      };
    }

    // Have enough info to proceed
    return {
      message: this.buildReadyMessage(requirements),
      intent,
      extracted_requirements: requirements,
      suggested_actions: [
        {
          type: 'start_questionnaire',
          label: 'Start Questionnaire',
          description: 'Begin guided questionnaire to configure infrastructure',
          payload: { requirements },
        },
        {
          type: 'generate',
          label: 'Generate with Defaults',
          description: 'Generate infrastructure with default settings',
          payload: { requirements },
        },
      ],
      context,
    };
  }

  /**
   * Handle modify intent
   */
  private handleModifyIntent(intent: any, context: ConversationalContext): ConversationalResponse {
    const componentEntity = this.contextExtractor.getEntityByType(intent.entities, 'component');

    if (!componentEntity) {
      return {
        message: "I'd be happy to help you modify your infrastructure. Which component would you like to change? (VPC, EKS, RDS, or S3)",
        intent,
        context,
        suggested_actions: [
          {
            type: 'modify',
            label: 'Modify VPC',
            description: 'Change VPC configuration',
          },
          {
            type: 'modify',
            label: 'Modify EKS',
            description: 'Update EKS cluster settings',
          },
          {
            type: 'modify',
            label: 'Modify RDS',
            description: 'Adjust database configuration',
          },
          {
            type: 'modify',
            label: 'Modify S3',
            description: 'Update S3 bucket settings',
          },
        ],
      };
    }

    return {
      message: `To modify your ${componentEntity.value.toUpperCase()}, please tell me what you'd like to change. For example:\\n\\n` +
        `- "Change the instance type to t3.large"\\n` +
        `- "Add encryption"\\n` +
        `- "Enable multi-AZ"\\n` +
        `- "Update the CIDR to 10.1.0.0/16"`,
      intent,
      context,
    };
  }

  /**
   * Handle explain intent
   */
  private handleExplainIntent(intent: any, context: ConversationalContext): ConversationalResponse {
    const topicEntity = this.contextExtractor.getEntityByType(intent.entities, 'topic');
    const topic = topicEntity?.value || 'infrastructure';

    const explanations: Record<string, string> = {
      vpc: 'A VPC (Virtual Private Cloud) is an isolated network environment in the cloud. It allows you to deploy resources in a private, secure network with control over IP addressing, subnets, route tables, and network gateways.',
      eks: 'EKS (Elastic Kubernetes Service) is a managed Kubernetes service. It runs the Kubernetes control plane for you, handling availability and scalability, while you manage the worker nodes where your containers run.',
      rds: 'RDS (Relational Database Service) is a managed database service that supports multiple database engines (PostgreSQL, MySQL, etc.). It handles backups, patching, and scaling automatically.',
      s3: 'S3 (Simple Storage Service) is object storage for any amount of data. It offers high durability, availability, and scalability with features like versioning, encryption, and lifecycle management.',
      terraform: 'Terraform is an Infrastructure as Code (IaC) tool that allows you to define and provision infrastructure using declarative configuration files. It supports multiple cloud providers and tracks infrastructure state.',
      kubernetes: 'Kubernetes is a container orchestration platform that automates deployment, scaling, and management of containerized applications. It handles service discovery, load balancing, and self-healing.',
    };

    const explanation = explanations[topic.toLowerCase()] ||
      "I can explain VPC, EKS, RDS, S3, Terraform, and Kubernetes. What would you like to know about?";

    return {
      message: explanation,
      intent,
      context,
    };
  }

  /**
   * Handle help intent
   */
  private handleHelpIntent(context: ConversationalContext): ConversationalResponse {
    return {
      message: `I'm Nimbus, your infrastructure generation assistant. I can help you:\\n\\n` +
        `✓ **Generate Infrastructure**: Create VPC, EKS clusters, RDS databases, and S3 buckets\\n` +
        `✓ **Guided Setup**: Walk you through configuration with smart questionnaires\\n` +
        `✓ **Best Practices**: Ensure security, cost optimization, and reliability\\n` +
        `✓ **Multi-Cloud**: Support for AWS, GCP, and Azure\\n\\n` +
        `**Try saying:**\\n` +
        `- "Create a VPC on AWS"\\n` +
        `- "I need a production EKS cluster"\\n` +
        `- "Setup a PostgreSQL database"\\n` +
        `- "Explain what VPC is"`,
      intent: { type: 'help', confidence: 1, entities: [] },
      context,
      suggested_actions: [
        {
          type: 'generate',
          label: 'Generate Infrastructure',
          description: 'Start creating cloud infrastructure',
        },
        {
          type: 'view_best_practices',
          label: 'View Best Practices',
          description: 'Learn about infrastructure best practices',
        },
      ],
    };
  }

  /**
   * Handle unknown intent
   */
  private handleUnknownIntent(context: ConversationalContext): ConversationalResponse {
    return {
      message: "I'm not sure I understand. I can help you generate infrastructure like VPC, EKS, RDS, and S3. " +
        "Try saying something like 'Create a VPC on AWS' or type 'help' to see what I can do.",
      intent: { type: 'unknown', confidence: 0, entities: [] },
      context,
      suggested_actions: [
        {
          type: 'help',
          label: 'Show Help',
          description: 'Learn what I can do',
        },
      ],
    };
  }

  /**
   * Build clarification message
   */
  private buildClarificationMessage(
    requirements: any,
    missing: string[]
  ): string {
    let message = "Great! I can help you with that. ";

    if (requirements.components && requirements.components.length > 0) {
      message += `I see you want to create: ${requirements.components.join(', ')}. `;
    }

    message += `\\n\\nTo proceed, I need a few more details:\\n`;
    missing.forEach((item, index) => {
      message += `${index + 1}. ${item}\\n`;
    });

    message += '\\nYou can provide this information, or I can guide you through a questionnaire.';

    return message;
  }

  /**
   * Build ready message
   */
  private buildReadyMessage(requirements: any): string {
    let message = "Perfect! I have all the information I need:\\n\\n";

    if (requirements.provider) {
      message += `✓ Provider: ${requirements.provider.toUpperCase()}\\n`;
    }
    if (requirements.environment) {
      message += `✓ Environment: ${requirements.environment}\\n`;
    }
    if (requirements.region) {
      message += `✓ Region: ${requirements.region}\\n`;
    }
    if (requirements.components) {
      message += `✓ Components: ${requirements.components.join(', ')}\\n`;
    }

    message += '\\nWould you like to:\\n';
    message += '1. Start a guided questionnaire for detailed configuration\\n';
    message += '2. Generate with recommended defaults';

    return message;
  }

  /**
   * Build clarification actions
   */
  private buildClarificationActions(missing: string[]): SuggestedAction[] {
    return [
      {
        type: 'start_questionnaire',
        label: 'Start Questionnaire',
        description: 'Let me guide you through the setup',
      },
    ];
  }

  /**
   * Get session
   */
  getSession(sessionId: string): ConversationalContext | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Delete session
   */
  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    logger.info(`Deleted conversational session: ${sessionId}`);
  }

  /**
   * Get conversation history
   */
  getHistory(sessionId: string): ConversationalTurn[] {
    const context = this.sessions.get(sessionId);
    return context?.conversation_history || [];
  }

  /**
   * Clear conversation history
   */
  clearHistory(sessionId: string): void {
    const context = this.sessions.get(sessionId);
    if (context) {
      context.conversation_history = [];
      context.previous_intent = undefined;
      context.infrastructure_stack = undefined;
      logger.info(`Cleared history for session: ${sessionId}`);
    }
  }
}
