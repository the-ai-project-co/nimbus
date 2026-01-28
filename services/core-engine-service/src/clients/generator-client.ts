import { logger } from '@nimbus/shared-utils';

export class GeneratorServiceClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.GENERATOR_SERVICE_URL || 'http://localhost:3003';
  }

  /**
   * Start a questionnaire session
   */
  async startQuestionnaire(type: 'terraform' | 'kubernetes'): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/api/questionnaire/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as { data: any };
      return data.data;
    } catch (error) {
      logger.error('Error starting questionnaire', error);
      throw error;
    }
  }

  /**
   * Submit questionnaire answer
   */
  async submitAnswer(sessionId: string, questionId: string, value: unknown): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/api/questionnaire/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, questionId, value }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as { data: any };
      return data.data;
    } catch (error) {
      logger.error('Error submitting answer', error);
      throw error;
    }
  }

  /**
   * Generate infrastructure from questionnaire
   */
  async generateFromQuestionnaire(
    sessionId: string,
    options?: { applyBestPractices?: boolean; autofix?: boolean }
  ): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate/from-questionnaire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, ...options }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as { data: any };
      return data.data;
    } catch (error) {
      logger.error('Error generating from questionnaire', error);
      throw error;
    }
  }

  /**
   * Analyze best practices
   */
  async analyzeBestPractices(
    component: string,
    config: Record<string, unknown>
  ): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/api/best-practices/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ component, config }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as { data: any };
      return data.data;
    } catch (error) {
      logger.error('Error analyzing best practices', error);
      throw error;
    }
  }

  /**
   * Apply autofixes
   */
  async applyAutofixes(
    component: string,
    config: Record<string, unknown>,
    options?: { ruleIds?: string[] }
  ): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/api/best-practices/autofix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ component, config, options }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as { data: any };
      return data.data;
    } catch (error) {
      logger.error('Error applying autofixes', error);
      throw error;
    }
  }

  /**
   * Render template
   */
  async renderTemplate(
    templateId: string,
    variables: Record<string, unknown>
  ): Promise<{ template_id: string; rendered_content: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/templates/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, variables }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as { data: any };
      return data.data;
    } catch (error) {
      logger.error('Error rendering template', error);
      throw error;
    }
  }

  /**
   * Process conversational message
   */
  async processConversationalMessage(
    sessionId: string,
    message: string,
    userId?: string
  ): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message, userId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as { data: any };
      return data.data;
    } catch (error) {
      logger.error('Error processing conversational message', error);
      throw error;
    }
  }
}
