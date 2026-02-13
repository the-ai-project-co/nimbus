/**
 * Questionnaire Types
 *
 * Type definitions for the questionnaire system
 */

/**
 * Enhanced step condition types for declarative branching
 */
export type StepCondition =
  | { type: 'equals'; questionId: string; value: unknown }
  | { type: 'notEquals'; questionId: string; value: unknown }
  | { type: 'includes'; questionId: string; values: unknown[] }
  | { type: 'excludes'; questionId: string; values: unknown[] }
  | { type: 'contains'; questionId: string; value: unknown } // For arrays
  | { type: 'notContains'; questionId: string; value: unknown }
  | { type: 'greaterThan'; questionId: string; value: number }
  | { type: 'lessThan'; questionId: string; value: number }
  | { type: 'and'; conditions: StepCondition[] }
  | { type: 'or'; conditions: StepCondition[] }
  | { type: 'not'; condition: StepCondition }
  | { type: 'custom'; evaluate: (answers: Record<string, unknown>) => boolean };

/**
 * Questionnaire step definition
 */
export interface QuestionnaireStep {
  id: string;
  title: string;
  description?: string;
  questions: Question[];
  /** Legacy function-based condition (still supported) */
  condition?: (answers: Record<string, unknown>) => boolean;
  /** New declarative condition */
  showWhen?: StepCondition;
}

/**
 * Question definition
 */
export interface Question {
  id: string;
  type: 'select' | 'multiselect' | 'text' | 'number' | 'confirm';
  label: string;
  description?: string;
  placeholder?: string;
  options?: Option[];
  default?: unknown;
  validation?: ValidationRule[];
  /** Simple dependency on another question's value */
  dependsOn?: {
    questionId: string;
    value: unknown;
  };
  /** Enhanced condition using StepCondition */
  showWhen?: StepCondition;
  /** Help text shown below the input */
  helpText?: string;
  /** Whether to mask input (for sensitive values) */
  sensitive?: boolean;
}

/**
 * Option for select/multiselect questions
 */
export interface Option {
  value: string;
  label: string;
  description?: string;
  /** Disable this option */
  disabled?: boolean;
  /** Reason why option is disabled */
  disabledReason?: string;
  /** Icon or emoji to display */
  icon?: string;
}

/**
 * Validation rule for questions
 */
export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'pattern' | 'custom' | 'email' | 'url' | 'cidr' | 'dns';
  value?: unknown;
  message: string;
  validate?: (value: unknown, answers?: Record<string, unknown>) => boolean;
}

/**
 * Questionnaire session state
 */
export interface QuestionnaireSession {
  id: string;
  type: 'terraform' | 'kubernetes' | 'helm';
  currentStepIndex: number;
  answers: Record<string, unknown>;
  completed: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Custom metadata for the session */
  metadata?: Record<string, unknown>;
}

/**
 * Response from questionnaire operations
 */
export interface QuestionnaireResponse {
  session: QuestionnaireSession;
  currentStep?: QuestionnaireStep;
  nextStep?: QuestionnaireStep;
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
  /** Validation errors if any */
  errors?: ValidationError[];
}

/**
 * Answer submission payload
 */
export interface AnswerSubmission {
  sessionId: string;
  questionId: string;
  value: unknown;
}

/**
 * Bulk answer submission
 */
export interface BulkAnswerSubmission {
  sessionId: string;
  answers: Record<string, unknown>;
}

/**
 * Validation error
 */
export interface ValidationError {
  questionId: string;
  message: string;
  rule: string;
}

/**
 * Questionnaire definition (full questionnaire config)
 */
export interface QuestionnaireDefinition {
  id: string;
  name: string;
  description?: string;
  version: string;
  steps: QuestionnaireStep[];
  /** Variables that can be substituted in labels/descriptions */
  variables?: Record<string, string>;
  /** Default values for answers */
  defaults?: Record<string, unknown>;
}

/**
 * Evaluate a step condition against current answers
 */
export function evaluateCondition(
  condition: StepCondition,
  answers: Record<string, unknown>
): boolean {
  switch (condition.type) {
    case 'equals':
      return answers[condition.questionId] === condition.value;

    case 'notEquals':
      return answers[condition.questionId] !== condition.value;

    case 'includes':
      return condition.values.includes(answers[condition.questionId]);

    case 'excludes':
      return !condition.values.includes(answers[condition.questionId]);

    case 'contains': {
      const arr = answers[condition.questionId];
      return Array.isArray(arr) && arr.includes(condition.value);
    }

    case 'notContains': {
      const arr = answers[condition.questionId];
      return !Array.isArray(arr) || !arr.includes(condition.value);
    }

    case 'greaterThan': {
      const val = answers[condition.questionId];
      return typeof val === 'number' && val > condition.value;
    }

    case 'lessThan': {
      const val = answers[condition.questionId];
      return typeof val === 'number' && val < condition.value;
    }

    case 'and':
      return condition.conditions.every(c => evaluateCondition(c, answers));

    case 'or':
      return condition.conditions.some(c => evaluateCondition(c, answers));

    case 'not':
      return !evaluateCondition(condition.condition, answers);

    case 'custom':
      return condition.evaluate(answers);

    default:
      return true;
  }
}

/**
 * Substitute variables in text using {{variable}} syntax
 */
export function substituteVariables(
  text: string,
  answers: Record<string, unknown>,
  variables?: Record<string, string>
): string {
  // First substitute from variables
  let result = text;
  if (variables) {
    result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return variables[key] ?? `{{${key}}}`;
    });
  }

  // Then substitute from answers
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = answers[key];
    return value !== undefined ? String(value) : `{{${key}}}`;
  });

  return result;
}
