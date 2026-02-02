import type { Question, ValidationRule, ValidationError } from './types';

export class QuestionnaireValidator {
  /**
   * Validate an answer against question validation rules
   */
  validate(question: Question, value: unknown): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!question.validation || question.validation.length === 0) {
      return errors;
    }

    for (const rule of question.validation) {
      const error = this.validateRule(question, value, rule);
      if (error) {
        errors.push(error);
      }
    }

    return errors;
  }

  /**
   * Validate all answers in a session
   */
  validateAll(questions: Question[], answers: Record<string, unknown>): Record<string, ValidationError[]> {
    const allErrors: Record<string, ValidationError[]> = {};

    for (const question of questions) {
      const value = answers[question.id];
      const errors = this.validate(question, value);

      if (errors.length > 0) {
        allErrors[question.id] = errors;
      }
    }

    return allErrors;
  }

  /**
   * Validate a single rule
   */
  private validateRule(question: Question, value: unknown, rule: ValidationRule): ValidationError | null {
    switch (rule.type) {
      case 'required':
        return this.validateRequired(question, value, rule);

      case 'min':
        return this.validateMin(question, value, rule);

      case 'max':
        return this.validateMax(question, value, rule);

      case 'pattern':
        return this.validatePattern(question, value, rule);

      case 'custom':
        return this.validateCustom(question, value, rule);

      default:
        return null;
    }
  }

  /**
   * Validate required field
   */
  private validateRequired(question: Question, value: unknown, rule: ValidationRule): ValidationError | null {
    const isEmpty = value === undefined ||
                    value === null ||
                    value === '' ||
                    (Array.isArray(value) && value.length === 0);

    if (isEmpty) {
      return {
        questionId: question.id,
        message: rule.message,
        rule: 'required',
      };
    }

    return null;
  }

  /**
   * Validate minimum value (for numbers) or length (for strings/arrays)
   */
  private validateMin(question: Question, value: unknown, rule: ValidationRule): ValidationError | null {
    const minValue = rule.value as number;

    if (value === undefined || value === null) {
      return null; // Let required rule handle this
    }

    if (typeof value === 'number') {
      if (value < minValue) {
        return {
          questionId: question.id,
          message: rule.message,
          rule: 'min',
        };
      }
    } else if (typeof value === 'string') {
      if (value.length < minValue) {
        return {
          questionId: question.id,
          message: rule.message,
          rule: 'min',
        };
      }
    } else if (Array.isArray(value)) {
      if (value.length < minValue) {
        return {
          questionId: question.id,
          message: rule.message,
          rule: 'min',
        };
      }
    }

    return null;
  }

  /**
   * Validate maximum value (for numbers) or length (for strings/arrays)
   */
  private validateMax(question: Question, value: unknown, rule: ValidationRule): ValidationError | null {
    const maxValue = rule.value as number;

    if (value === undefined || value === null) {
      return null; // Let required rule handle this
    }

    if (typeof value === 'number') {
      if (value > maxValue) {
        return {
          questionId: question.id,
          message: rule.message,
          rule: 'max',
        };
      }
    } else if (typeof value === 'string') {
      if (value.length > maxValue) {
        return {
          questionId: question.id,
          message: rule.message,
          rule: 'max',
        };
      }
    } else if (Array.isArray(value)) {
      if (value.length > maxValue) {
        return {
          questionId: question.id,
          message: rule.message,
          rule: 'max',
        };
      }
    }

    return null;
  }

  /**
   * Validate pattern (regex)
   */
  private validatePattern(question: Question, value: unknown, rule: ValidationRule): ValidationError | null {
    if (value === undefined || value === null || value === '') {
      return null; // Let required rule handle this
    }

    const pattern = rule.value as RegExp;
    const strValue = String(value);

    if (!pattern.test(strValue)) {
      return {
        questionId: question.id,
        message: rule.message,
        rule: 'pattern',
      };
    }

    return null;
  }

  /**
   * Validate custom rule
   */
  private validateCustom(question: Question, value: unknown, rule: ValidationRule): ValidationError | null {
    if (!rule.validate) {
      return null;
    }

    const isValid = rule.validate(value);

    if (!isValid) {
      return {
        questionId: question.id,
        message: rule.message,
        rule: 'custom',
      };
    }

    return null;
  }

  /**
   * Check if a question should be shown based on dependencies
   */
  shouldShowQuestion(question: Question, answers: Record<string, unknown>): boolean {
    if (!question.dependsOn) {
      return true;
    }

    const { questionId, value: dependentValue } = question.dependsOn;
    const actualValue = answers[questionId];

    // Special case: '*' means any value
    if (dependentValue === '*') {
      return actualValue !== undefined && actualValue !== null && actualValue !== '';
    }

    return actualValue === dependentValue;
  }

  /**
   * Filter questions based on dependencies
   */
  filterVisibleQuestions(questions: Question[], answers: Record<string, unknown>): Question[] {
    return questions.filter(q => this.shouldShowQuestion(q, answers));
  }
}
