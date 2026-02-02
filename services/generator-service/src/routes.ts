import type { Elysia } from 'elysia';
import { QuestionnaireEngine } from './questionnaire';
import { TemplateLoader, TemplateRenderer } from './templates';
import { BestPracticesEngine } from './best-practices';
import { ConversationalEngine } from './conversational';
import { logger } from '@nimbus/shared-utils';

// Initialize engines
const questionnaireEngine = new QuestionnaireEngine();
const templateLoader = new TemplateLoader();
const templateRenderer = new TemplateRenderer();
const bestPracticesEngine = new BestPracticesEngine();
const conversationalEngine = new ConversationalEngine();

// Initialize template loader
await templateLoader.initialize();

/**
 * Setup Generator Service routes
 */
export function setupRoutes(app: Elysia) {
  // Health check
  app.get('/health', () => ({
    status: 'healthy',
    service: 'generator-service',
    timestamp: new Date().toISOString(),
  }));

  // ===== Questionnaire Routes =====

  // Start a new questionnaire session
  app.post('/api/questionnaire/start', ({ body }) => {
    const typedBody = body as { type: 'terraform' | 'kubernetes' };
    try {
      const response = questionnaireEngine.startSession(typedBody.type);
      return {
        success: true,
        data: response,
      };
    } catch (error) {
      logger.error('Error starting questionnaire', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Submit an answer
  app.post('/api/questionnaire/answer', ({ body }) => {
    const typedBody = body as {
      sessionId: string;
      questionId: string;
      value: unknown;
    };

    try {
      const response = questionnaireEngine.submitAnswer(typedBody);
      return {
        success: true,
        data: response,
      };
    } catch (error) {
      logger.error('Error submitting answer', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Get questionnaire session state
  app.get('/api/questionnaire/session/:sessionId', ({ params }: { params: { sessionId: string } }) => {
    try {
      const response = questionnaireEngine.getSessionState(params.sessionId);
      return {
        success: true,
        data: response,
      };
    } catch (error) {
      logger.error('Error getting session state', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Delete questionnaire session
  app.delete('/api/questionnaire/session/:sessionId', ({ params }: { params: { sessionId: string } }) => {
    try {
      questionnaireEngine.deleteSession(params.sessionId);
      return {
        success: true,
        message: 'Session deleted successfully',
      };
    } catch (error) {
      logger.error('Error deleting session', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // ===== Template Routes =====

  // List all templates
  app.get('/api/templates', () => {
    try {
      const templates = templateLoader.listTemplates();
      return {
        success: true,
        data: templates,
      };
    } catch (error) {
      logger.error('Error listing templates', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // List templates by type
  app.get('/api/templates/type/:type', ({ params }) => {
    const typedParams = params as { type: 'terraform' | 'kubernetes' };
    try {
      const templates = templateLoader.listByType(typedParams.type);
      return {
        success: true,
        data: templates,
      };
    } catch (error) {
      logger.error('Error listing templates by type', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // List templates by provider
  app.get(
    '/api/templates/provider/:provider',
    ({ params }) => {
      const typedParams = params as { provider: 'aws' | 'gcp' | 'azure' | 'generic' };
      try {
        const templates = templateLoader.listByProvider(typedParams.provider);
        return {
          success: true,
          data: templates,
        };
      } catch (error) {
        logger.error('Error listing templates by provider', error);
        return {
          success: false,
          error: (error as Error).message,
        };
      }
    }
  );

  // Get template metadata
  app.get('/api/templates/:templateId', ({ params }: { params: { templateId: string } }) => {
    try {
      const metadata = templateLoader.getMetadata(params.templateId);
      if (!metadata) {
        return {
          success: false,
          error: 'Template not found',
        };
      }
      return {
        success: true,
        data: metadata,
      };
    } catch (error) {
      logger.error('Error getting template metadata', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Render a template
  app.post('/api/templates/render', ({ body }) => {
    const typedBody = body as {
      templateId: string;
      variables: Record<string, unknown>;
      options?: { strict?: boolean };
    };

    try {
      const template = templateLoader.loadTemplate(typedBody.templateId);
      const rendered = templateRenderer.render(template, typedBody.variables, typedBody.options);

      return {
        success: true,
        data: {
          template_id: typedBody.templateId,
          rendered_content: rendered,
        },
      };
    } catch (error) {
      logger.error('Error rendering template', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Validate template syntax
  app.post('/api/templates/validate', ({ body }) => {
    const typedBody = body as { template: string };
    try {
      const result = templateRenderer.validateTemplate(typedBody.template);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      logger.error('Error validating template', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Extract variables from template
  app.post('/api/templates/extract-variables', ({ body }) => {
    const typedBody = body as { template: string };
    try {
      const variables = templateRenderer.extractVariables(typedBody.template);
      return {
        success: true,
        data: { variables },
      };
    } catch (error) {
      logger.error('Error extracting variables', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // ===== Best Practices Routes =====

  // Analyze best practices for a component
  app.post('/api/best-practices/analyze', ({ body }) => {
    const typedBody = body as {
      component: string;
      config: Record<string, unknown>;
      options?: {
        categories?: Array<'security' | 'tagging' | 'cost' | 'reliability' | 'performance'>;
        severities?: Array<'critical' | 'high' | 'medium' | 'low' | 'info'>;
      };
    };

    try {
      const report = bestPracticesEngine.analyze(typedBody.component, typedBody.config, typedBody.options);

      return {
        success: true,
        data: report,
      };
    } catch (error) {
      logger.error('Error analyzing best practices', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Analyze multiple components
  app.post('/api/best-practices/analyze-all', ({ body }) => {
    const typedBody = body as {
      configs: Array<{ component: string; config: Record<string, unknown> }>;
      options?: {
        categories?: Array<'security' | 'tagging' | 'cost' | 'reliability' | 'performance'>;
        severities?: Array<'critical' | 'high' | 'medium' | 'low' | 'info'>;
      };
    };

    try {
      const report = bestPracticesEngine.analyzeAll(typedBody.configs, typedBody.options);

      return {
        success: true,
        data: report,
      };
    } catch (error) {
      logger.error('Error analyzing best practices', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Apply autofixes
  app.post('/api/best-practices/autofix', ({ body }) => {
    const typedBody = body as {
      component: string;
      config: Record<string, unknown>;
      options?: {
        categories?: Array<'security' | 'tagging' | 'cost' | 'reliability' | 'performance'>;
        severities?: Array<'critical' | 'high' | 'medium' | 'low' | 'info'>;
        ruleIds?: string[];
      };
    };

    try {
      const result = bestPracticesEngine.autofix(typedBody.component, typedBody.config, typedBody.options);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      logger.error('Error applying autofixes', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Get rules by category
  app.get(
    '/api/best-practices/rules/:category',
    ({ params }) => {
      const typedParams = params as { category: 'security' | 'tagging' | 'cost' | 'reliability' | 'performance' };
      try {
        const rules = bestPracticesEngine.getRulesByCategory(typedParams.category);
        return {
          success: true,
          data: rules,
        };
      } catch (error) {
        logger.error('Error getting rules by category', error);
        return {
          success: false,
          error: (error as Error).message,
        };
      }
    }
  );

  // List all rules
  app.get('/api/best-practices/rules', () => {
    try {
      const rules = bestPracticesEngine.listRules();
      return {
        success: true,
        data: rules,
      };
    } catch (error) {
      logger.error('Error listing rules', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Get report as markdown
  app.post('/api/best-practices/report/markdown', ({ body }) => {
    const typedBody = body as {
      component: string;
      config: Record<string, unknown>;
    };

    try {
      const report = bestPracticesEngine.analyze(typedBody.component, typedBody.config);
      const markdown = bestPracticesEngine.formatReportAsMarkdown(report);

      return {
        success: true,
        data: {
          markdown,
          report,
        },
      };
    } catch (error) {
      logger.error('Error generating markdown report', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // ===== Conversational Routes =====

  // Process conversational message
  app.post('/api/conversational/message', ({ body }) => {
    const typedBody = body as {
      sessionId: string;
      message: string;
      userId?: string;
    };

    try {
      const response = conversationalEngine.processMessage(
        typedBody.sessionId,
        typedBody.message,
        typedBody.userId
      );

      return {
        success: true,
        data: response,
      };
    } catch (error) {
      logger.error('Error processing conversational message', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Get conversation history
  app.get('/api/conversational/history/:sessionId', ({ params }: { params: { sessionId: string } }) => {
    try {
      const history = conversationalEngine.getHistory(params.sessionId);
      return {
        success: true,
        data: history,
      };
    } catch (error) {
      logger.error('Error getting conversation history', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Get session context
  app.get('/api/conversational/session/:sessionId', ({ params }: { params: { sessionId: string } }) => {
    try {
      const session = conversationalEngine.getSession(params.sessionId);
      if (!session) {
        return {
          success: false,
          error: 'Session not found',
        };
      }
      return {
        success: true,
        data: session,
      };
    } catch (error) {
      logger.error('Error getting session', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Clear conversation history
  app.post('/api/conversational/clear/:sessionId', ({ params }: { params: { sessionId: string } }) => {
    try {
      conversationalEngine.clearHistory(params.sessionId);
      return {
        success: true,
        message: 'Conversation history cleared',
      };
    } catch (error) {
      logger.error('Error clearing conversation history', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Delete conversational session
  app.delete('/api/conversational/session/:sessionId', ({ params }: { params: { sessionId: string } }) => {
    try {
      conversationalEngine.deleteSession(params.sessionId);
      return {
        success: true,
        message: 'Session deleted successfully',
      };
    } catch (error) {
      logger.error('Error deleting session', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // ===== Generation Routes =====

  // Generate infrastructure from questionnaire
  app.post('/api/generate/from-questionnaire', ({ body }) => {
    const typedBody = body as {
      sessionId: string;
      applyBestPractices?: boolean;
      autofix?: boolean;
    };

    try {
      // Get questionnaire session
      const session = questionnaireEngine.getSession(typedBody.sessionId);
      if (!session) {
        return {
          success: false,
          error: 'Session not found',
        };
      }

      if (!session.completed) {
        return {
          success: false,
          error: 'Questionnaire not completed',
        };
      }

      // Validate all answers
      const validationErrors = questionnaireEngine.validateAllAnswers(typedBody.sessionId);
      if (Object.keys(validationErrors).length > 0) {
        return {
          success: false,
          error: 'Validation errors',
          validation_errors: validationErrors,
        };
      }

      // Apply best practices if requested
      let config = session.answers;
      let bestPracticesReport = null;

      if (typedBody.applyBestPractices) {
        // Analyze best practices
        const components = session.answers.selected_components as string[] || [];
        const analysisConfigs = components.map((component) => ({
          component,
          config: session.answers,
        }));

        bestPracticesReport = bestPracticesEngine.analyzeAll(analysisConfigs);

        // Apply autofixes if requested
        if (typedBody.autofix && bestPracticesReport.summary.autofixable_violations > 0) {
          for (const component of components) {
            const autofixResult = bestPracticesEngine.autofix(component, config as any);
            config = autofixResult.fixed_config;
          }
        }
      }

      // Find and render templates
      const components = session.answers.selected_components as string[] || [];
      const provider = session.answers.selected_provider as string || 'aws';
      const generatedFiles: Record<string, string> = {};

      for (const component of components) {
        const template = templateLoader.findTemplate(session.type, provider, component);
        if (template) {
          const content = templateLoader.loadTemplate(template.id);
          const rendered = templateRenderer.render(content, config);
          generatedFiles[`${component}.tf`] = rendered;
        }
      }

      return {
        success: true,
        data: {
          generated_files: generatedFiles,
          configuration: config,
          best_practices_report: bestPracticesReport,
        },
      };
    } catch (error) {
      logger.error('Error generating from questionnaire', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Generate infrastructure from conversational session
  app.post('/api/generate/from-conversation', ({ body }) => {
    const typedBody = body as {
      sessionId: string;
      applyBestPractices?: boolean;
      autofix?: boolean;
    };

    try {
      // Get conversational session
      const session = conversationalEngine.getSession(typedBody.sessionId);
      if (!session) {
        return {
          success: false,
          error: 'Session not found',
        };
      }

      // Extract requirements from conversation
      const requirements = session.infrastructure_stack;
      if (!requirements || !requirements.components || requirements.components.length === 0) {
        return {
          success: false,
          error: 'Insufficient information to generate infrastructure',
        };
      }

      // TODO: Convert requirements to template variables
      // For now, return placeholder
      return {
        success: true,
        data: {
          message: 'Generation from conversation session',
          requirements,
        },
      };
    } catch (error) {
      logger.error('Error generating from conversation', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  return app;
}
