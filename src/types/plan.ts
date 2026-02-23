/**
 * Agent Plan
 */
export interface Plan {
  id: string;
  intent: string;
  steps: PlanStep[];
  estimatedDuration?: number;
  requiresConfirmation: boolean;
  createdAt: string;
}

export interface PlanStep {
  id: string;
  action: string;
  description: string;
  tool?: string;
  input?: Record<string, unknown>;
  dependsOn?: string[];
  estimatedDuration?: number;
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Plan Execution
 */
export interface PlanExecution {
  planId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  currentStep?: number;
  results: StepResult[];
  startedAt?: string;
  completedAt?: string;
}

export interface StepResult {
  stepId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  output?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}
