export interface QuestionnaireStep {
  id: string;
  title: string;
  description?: string;
  questions: Question[];
  condition?: (answers: Record<string, unknown>) => boolean;
}

export interface Question {
  id: string;
  type: 'select' | 'multiselect' | 'text' | 'number' | 'confirm';
  label: string;
  description?: string;
  options?: Option[];
  default?: unknown;
  validation?: ValidationRule[];
  dependsOn?: {
    questionId: string;
    value: unknown;
  };
}

export interface Option {
  value: string;
  label: string;
  description?: string;
}

export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'pattern' | 'custom';
  value?: unknown;
  message: string;
  validate?: (value: unknown) => boolean;
}

export interface QuestionnaireSession {
  id: string;
  type: 'terraform' | 'kubernetes';
  currentStepIndex: number;
  answers: Record<string, unknown>;
  completed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuestionnaireResponse {
  session: QuestionnaireSession;
  currentStep?: QuestionnaireStep;
  nextStep?: QuestionnaireStep;
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
}

export interface AnswerSubmission {
  sessionId: string;
  questionId: string;
  value: unknown;
}

export interface ValidationError {
  questionId: string;
  message: string;
  rule: string;
}
