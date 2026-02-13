/**
 * Generator Service Client
 *
 * CLI client for communicating with the Generator Service
 * for conversational IaC generation
 */

export interface ConversationResult {
  message: string;
  intent: {
    type: 'generate' | 'modify' | 'explain' | 'help' | 'unknown';
    confidence: number;
  };
  canGenerate: boolean;
  nextQuestion?: string;
  extractedRequirements?: {
    provider?: string;
    components?: string[];
    environment?: string;
    region?: string;
  };
  needsClarification?: string[];
  suggestedActions?: Array<{
    type: string;
    label: string;
    description: string;
  }>;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GenerationResult {
  success: boolean;
  files: Record<string, string>;
  configuration: Record<string, unknown>;
  stack: {
    provider: string;
    components: string[];
    environment?: string;
    region?: string;
  };
  bestPracticesReport?: {
    summary: {
      total_violations: number;
      autofixable_violations: number;
    };
  };
  errors?: string[];
}

export interface QuestionnaireResponse {
  sessionId: string;
  currentQuestion?: {
    id: string;
    text: string;
    type: string;
    options?: string[];
  };
  completed: boolean;
  progress: number;
}

export class GeneratorClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.GENERATOR_SERVICE_URL || 'http://localhost:3003';
  }

  /**
   * Check if the generator service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Process a conversational message
   * Sends user message to the generator service and gets response with intent detection
   */
  async processConversation(
    sessionId: string,
    message: string,
    userId?: string
  ): Promise<ConversationResult> {
    const response = await fetch(`${this.baseUrl}/api/conversational/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message, userId }),
    });

    if (!response.ok) {
      throw new Error(`Generator service error: ${response.status}`);
    }

    const data = await response.json() as { success: boolean; data: any; error?: string };
    if (!data.success) {
      throw new Error(data.error || 'Failed to process conversation');
    }

    const result = data.data;

    // Determine if we can generate (have enough information)
    const canGenerate =
      result.intent?.type === 'generate' &&
      (!result.needs_clarification || result.needs_clarification.length === 0) &&
      result.extracted_requirements?.components?.length > 0;

    return {
      message: result.message,
      intent: result.intent,
      canGenerate,
      nextQuestion: result.needs_clarification?.[0],
      extractedRequirements: result.extracted_requirements,
      needsClarification: result.needs_clarification,
      suggestedActions: result.suggested_actions,
    };
  }

  /**
   * Generate infrastructure from a conversation session
   */
  async generateFromConversation(
    sessionId: string,
    options?: { applyBestPractices?: boolean; autofix?: boolean }
  ): Promise<GenerationResult> {
    const response = await fetch(`${this.baseUrl}/api/generate/from-conversation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        applyBestPractices: options?.applyBestPractices ?? true,
        autofix: options?.autofix ?? true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Generator service error: ${response.status}`);
    }

    const data = await response.json() as { success: boolean; data: any; error?: string };
    if (!data.success) {
      throw new Error(data.error || 'Failed to generate infrastructure');
    }

    return {
      success: true,
      files: data.data.generated_files,
      configuration: data.data.configuration,
      stack: data.data.stack,
      bestPracticesReport: data.data.best_practices_report,
      errors: data.data.errors,
    };
  }

  /**
   * Get conversation session state
   */
  async getSession(sessionId: string): Promise<{
    sessionId: string;
    infrastructureStack?: {
      provider?: string;
      components?: string[];
      environment?: string;
      region?: string;
    };
    conversationHistory: Array<{
      role: 'user' | 'assistant';
      message: string;
      timestamp: string;
    }>;
  } | null> {
    const response = await fetch(`${this.baseUrl}/api/conversational/session/${sessionId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Generator service error: ${response.status}`);
    }

    const data = await response.json() as { success: boolean; data: any; error?: string };
    if (!data.success) {
      return null;
    }

    return {
      sessionId: data.data.session_id,
      infrastructureStack: data.data.infrastructure_stack,
      conversationHistory: data.data.conversation_history || [],
    };
  }

  /**
   * Clear conversation history but keep session
   */
  async clearHistory(sessionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/conversational/clear/${sessionId}`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Generator service error: ${response.status}`);
    }
  }

  /**
   * Delete a conversation session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/conversational/session/${sessionId}`, {
      method: 'DELETE',
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Generator service error: ${response.status}`);
    }
  }

  /**
   * Start a questionnaire session
   */
  async startQuestionnaire(type: 'terraform' | 'kubernetes'): Promise<QuestionnaireResponse> {
    const response = await fetch(`${this.baseUrl}/api/questionnaire/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    });

    if (!response.ok) {
      throw new Error(`Generator service error: ${response.status}`);
    }

    const data = await response.json() as { success: boolean; data: any; error?: string };
    if (!data.success) {
      throw new Error(data.error || 'Failed to start questionnaire');
    }

    return data.data;
  }

  /**
   * Submit questionnaire answer
   */
  async submitQuestionnaireAnswer(
    sessionId: string,
    questionId: string,
    value: unknown
  ): Promise<QuestionnaireResponse> {
    const response = await fetch(`${this.baseUrl}/api/questionnaire/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, questionId, value }),
    });

    if (!response.ok) {
      throw new Error(`Generator service error: ${response.status}`);
    }

    const data = await response.json() as { success: boolean; data: any; error?: string };
    if (!data.success) {
      throw new Error(data.error || 'Failed to submit answer');
    }

    return data.data;
  }

  /**
   * Generate from completed questionnaire
   */
  async generateFromQuestionnaire(
    sessionId: string,
    options?: { applyBestPractices?: boolean; autofix?: boolean }
  ): Promise<GenerationResult> {
    const response = await fetch(`${this.baseUrl}/api/generate/from-questionnaire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        applyBestPractices: options?.applyBestPractices ?? true,
        autofix: options?.autofix ?? true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Generator service error: ${response.status}`);
    }

    const data = await response.json() as { success: boolean; data: any; error?: string };
    if (!data.success) {
      throw new Error(data.error || 'Failed to generate from questionnaire');
    }

    return {
      success: true,
      files: data.data.generated_files,
      configuration: data.data.configuration,
      stack: {
        provider: data.data.configuration?.selected_provider || 'aws',
        components: data.data.configuration?.selected_components || [],
      },
      bestPracticesReport: data.data.best_practices_report,
    };
  }

  /**
   * List available templates
   */
  async listTemplates(type?: 'terraform' | 'kubernetes'): Promise<Array<{
    id: string;
    name: string;
    type: string;
    provider: string;
    component: string;
  }>> {
    const url = type
      ? `${this.baseUrl}/api/templates/type/${type}`
      : `${this.baseUrl}/api/templates`;

    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`Generator service error: ${response.status}`);
    }

    const data = await response.json() as { success: boolean; data: any; error?: string };
    if (!data.success) {
      throw new Error(data.error || 'Failed to list templates');
    }

    return data.data;
  }
}

// Singleton instance
export const generatorClient = new GeneratorClient();
