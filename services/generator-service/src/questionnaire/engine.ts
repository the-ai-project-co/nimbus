import { logger } from '@nimbus/shared-utils';
import type {
  QuestionnaireStep,
  QuestionnaireSession,
  QuestionnaireResponse,
  AnswerSubmission,
  ValidationError,
  Question
} from './types';
import { QuestionnaireValidator } from './validator';
import { terraformQuestionnaire } from './terraform';

export class QuestionnaireEngine {
  private sessions: Map<string, QuestionnaireSession>;
  private validator: QuestionnaireValidator;

  constructor() {
    this.sessions = new Map();
    this.validator = new QuestionnaireValidator();
  }

  /**
   * Start a new questionnaire session
   */
  startSession(type: 'terraform' | 'kubernetes'): QuestionnaireResponse {
    const sessionId = this.generateSessionId();

    const session: QuestionnaireSession = {
      id: sessionId,
      type,
      currentStepIndex: 0,
      answers: {},
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(sessionId, session);

    const steps = this.getSteps(type);
    const currentStep = this.getCurrentVisibleStep(session, steps);

    logger.info(`Started questionnaire session ${sessionId} of type ${type}`);

    return this.buildResponse(session, steps, currentStep);
  }

  /**
   * Submit an answer and get next step
   */
  submitAnswer(submission: AnswerSubmission): QuestionnaireResponse {
    const { sessionId, questionId, value } = submission;

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const steps = this.getSteps(session.type);
    const currentStep = steps[session.currentStepIndex];

    if (!currentStep) {
      throw new Error('Invalid session state: no current step');
    }

    // Find the question
    const question = currentStep.questions.find(q => q.id === questionId);
    if (!question) {
      throw new Error(`Question not found: ${questionId}`);
    }

    // Validate the answer
    const validationErrors = this.validator.validate(question, value);
    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${validationErrors.map(e => e.message).join(', ')}`);
    }

    // Store the answer
    session.answers[questionId] = value;
    session.updatedAt = new Date();

    // Check if all questions in current step are answered
    const allAnswered = this.areAllQuestionsAnswered(currentStep, session.answers);

    if (allAnswered) {
      // Move to next step
      session.currentStepIndex++;

      // Skip steps that don't match conditions
      const nextStep = this.getCurrentVisibleStep(session, steps);

      if (!nextStep) {
        // No more steps, mark as completed
        session.completed = true;
        logger.info(`Questionnaire session ${sessionId} completed`);
      }
    }

    const currentVisibleStep = this.getCurrentVisibleStep(session, steps);

    return this.buildResponse(session, steps, currentVisibleStep);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): QuestionnaireSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get current questionnaire state
   */
  getSessionState(sessionId: string): QuestionnaireResponse {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const steps = this.getSteps(session.type);
    const currentStep = this.getCurrentVisibleStep(session, steps);

    return this.buildResponse(session, steps, currentStep);
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    logger.info(`Deleted questionnaire session ${sessionId}`);
  }

  /**
   * Get steps for questionnaire type
   */
  private getSteps(type: 'terraform' | 'kubernetes'): QuestionnaireStep[] {
    switch (type) {
      case 'terraform':
        return terraformQuestionnaire;
      case 'kubernetes':
        // TODO: Implement kubernetes questionnaire
        return [];
      default:
        throw new Error(`Unknown questionnaire type: ${type}`);
    }
  }

  /**
   * Get current visible step (accounting for conditions)
   */
  private getCurrentVisibleStep(session: QuestionnaireSession, steps: QuestionnaireStep[]): QuestionnaireStep | undefined {
    for (let i = session.currentStepIndex; i < steps.length; i++) {
      const step = steps[i];

      if (this.shouldShowStep(step, session.answers)) {
        // Update current step index if we skipped steps
        if (i !== session.currentStepIndex) {
          session.currentStepIndex = i;
        }
        return step;
      }
    }

    return undefined; // All steps completed
  }

  /**
   * Check if a step should be shown based on condition
   */
  private shouldShowStep(step: QuestionnaireStep, answers: Record<string, unknown>): boolean {
    if (!step.condition) {
      return true;
    }

    try {
      return step.condition(answers);
    } catch (error) {
      logger.error(`Error evaluating step condition for ${step.id}`, error);
      return false;
    }
  }

  /**
   * Check if all required questions in a step are answered
   */
  private areAllQuestionsAnswered(step: QuestionnaireStep, answers: Record<string, unknown>): boolean {
    // Filter questions based on dependencies
    const visibleQuestions = this.validator.filterVisibleQuestions(step.questions, answers);

    // Check if all visible questions with required validation are answered
    for (const question of visibleQuestions) {
      const hasRequiredRule = question.validation?.some(rule => rule.type === 'required');

      if (hasRequiredRule) {
        const answer = answers[question.id];
        const isEmpty = answer === undefined ||
                       answer === null ||
                       answer === '' ||
                       (Array.isArray(answer) && answer.length === 0);

        if (isEmpty) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Calculate total visible steps
   */
  private getTotalVisibleSteps(session: QuestionnaireSession, steps: QuestionnaireStep[]): number {
    return steps.filter(step => this.shouldShowStep(step, session.answers)).length;
  }

  /**
   * Calculate current visible step number
   */
  private getCurrentVisibleStepNumber(session: QuestionnaireSession, steps: QuestionnaireStep[]): number {
    let count = 0;
    for (let i = 0; i < session.currentStepIndex; i++) {
      if (this.shouldShowStep(steps[i], session.answers)) {
        count++;
      }
    }
    return count + 1; // +1 for current step
  }

  /**
   * Build questionnaire response
   */
  private buildResponse(
    session: QuestionnaireSession,
    steps: QuestionnaireStep[],
    currentStep: QuestionnaireStep | undefined
  ): QuestionnaireResponse {
    const totalSteps = this.getTotalVisibleSteps(session, steps);
    const currentStepNumber = session.completed ? totalSteps : this.getCurrentVisibleStepNumber(session, steps);

    // If there's a current step, filter questions based on dependencies
    let filteredCurrentStep: QuestionnaireStep | undefined = undefined;
    if (currentStep) {
      const visibleQuestions = this.validator.filterVisibleQuestions(currentStep.questions, session.answers);
      filteredCurrentStep = {
        ...currentStep,
        questions: visibleQuestions,
      };
    }

    // Get next step (if any)
    let nextStep: QuestionnaireStep | undefined = undefined;
    if (!session.completed && currentStep) {
      for (let i = session.currentStepIndex + 1; i < steps.length; i++) {
        if (this.shouldShowStep(steps[i], session.answers)) {
          nextStep = steps[i];
          break;
        }
      }
    }

    return {
      session,
      currentStep: filteredCurrentStep,
      nextStep,
      progress: {
        current: currentStepNumber,
        total: totalSteps,
        percentage: totalSteps > 0 ? Math.round((currentStepNumber / totalSteps) * 100) : 0,
      },
    };
  }

  /**
   * Generate unique session ID using cryptographically secure random values
   */
  private generateSessionId(): string {
    // Use crypto.randomUUID() for cryptographically secure random ID
    // Format: qst_<timestamp>_<secure-random>
    const randomBytes = crypto.getRandomValues(new Uint8Array(6));
    const randomStr = Array.from(randomBytes)
      .map(b => b.toString(36).padStart(2, '0'))
      .join('')
      .substring(0, 9);
    return `qst_${Date.now()}_${randomStr}`;
  }

  /**
   * Validate all answers before generating
   */
  validateAllAnswers(sessionId: string): Record<string, ValidationError[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const steps = this.getSteps(session.type);
    const allQuestions: Question[] = [];

    // Collect all visible questions from all visible steps
    for (const step of steps) {
      if (this.shouldShowStep(step, session.answers)) {
        const visibleQuestions = this.validator.filterVisibleQuestions(step.questions, session.answers);
        allQuestions.push(...visibleQuestions);
      }
    }

    return this.validator.validateAll(allQuestions, session.answers);
  }
}
