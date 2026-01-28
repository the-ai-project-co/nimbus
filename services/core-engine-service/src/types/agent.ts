export interface AgentTask {
  id: string;
  type: 'generate' | 'deploy' | 'verify' | 'rollback' | 'analyze';
  status: 'pending' | 'planning' | 'executing' | 'verifying' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  user_id: string;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;

  // Task context
  context: {
    provider: 'aws' | 'gcp' | 'azure';
    environment: string;
    region?: string;
    components: string[];
    requirements?: Record<string, unknown>;
  };

  // Execution tracking
  execution: {
    plan_id?: string;
    execution_id?: string;
    verification_id?: string;
  };

  // Results
  result?: {
    success: boolean;
    outputs?: Record<string, unknown>;
    artifacts?: string[];
    errors?: string[];
  };

  // Metadata
  metadata?: Record<string, unknown>;
}

export interface AgentPlan {
  id: string;
  task_id: string;
  status: 'draft' | 'approved' | 'rejected' | 'executing' | 'completed';
  created_at: Date;
  updated_at: Date;

  // Plan details
  steps: PlanStep[];
  dependencies: PlanDependency[];
  estimated_duration?: number;
  estimated_cost?: number;

  // Risk assessment
  risks: Risk[];
  risk_level: 'low' | 'medium' | 'high' | 'critical';

  // Approval
  requires_approval: boolean;
  approved_by?: string;
  approved_at?: Date;
}

export interface PlanStep {
  id: string;
  order: number;
  type: 'generate' | 'validate' | 'deploy' | 'configure' | 'verify';
  description: string;
  component?: string;
  action: string;
  parameters: Record<string, unknown>;

  // Execution
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  started_at?: Date;
  completed_at?: Date;
  duration?: number;

  // Dependencies
  depends_on?: string[];

  // Rollback
  rollback_action?: string;
  rollback_parameters?: Record<string, unknown>;
}

export interface PlanDependency {
  step_id: string;
  depends_on: string[];
  type: 'sequential' | 'parallel';
}

export interface Risk {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'security' | 'cost' | 'availability' | 'performance' | 'compliance';
  description: string;
  mitigation?: string;
  probability: number; // 0-1
  impact: number; // 0-1
}

export interface ExecutionResult {
  id: string;
  plan_id: string;
  step_id: string;
  status: 'success' | 'failure' | 'partial';
  started_at: Date;
  completed_at: Date;
  duration: number;

  // Outputs
  outputs?: Record<string, unknown>;
  artifacts?: ExecutionArtifact[];
  logs?: ExecutionLog[];

  // Errors
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    stack_trace?: string;
  };
}

export interface ExecutionArtifact {
  id: string;
  type: 'terraform' | 'kubernetes' | 'script' | 'config' | 'documentation';
  name: string;
  path: string;
  size: number;
  checksum: string;
  created_at: Date;
}

export interface ExecutionLog {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
}

export interface VerificationResult {
  id: string;
  execution_id: string;
  status: 'passed' | 'failed' | 'warning';
  started_at: Date;
  completed_at: Date;

  // Checks
  checks: VerificationCheck[];

  // Summary
  summary: {
    total_checks: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

export interface VerificationCheck {
  id: string;
  type: 'security' | 'compliance' | 'functionality' | 'performance' | 'cost';
  name: string;
  description: string;
  status: 'passed' | 'failed' | 'warning' | 'skipped';

  // Details
  expected?: unknown;
  actual?: unknown;
  error?: string;

  // Remediation
  remediation?: string;
}

export interface AgentEvent {
  id: string;
  task_id: string;
  type: 'task_created' | 'plan_generated' | 'plan_approved' | 'execution_started' |
        'step_completed' | 'verification_completed' | 'task_completed' | 'task_failed' | 'task_cancelled';
  timestamp: Date;
  data?: Record<string, unknown>;
  user_id?: string;
}

export interface SafetyCheck {
  id: string;
  type: 'pre_execution' | 'during_execution' | 'post_execution';
  category: 'security' | 'cost' | 'compliance' | 'availability';
  name: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';

  // Check function
  check: (context: Record<string, unknown>) => Promise<SafetyCheckResult>;
}

export interface SafetyCheckResult {
  passed: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details?: Record<string, unknown>;
  can_proceed: boolean;
  requires_approval: boolean;
}
