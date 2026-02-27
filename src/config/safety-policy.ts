/**
 * Safety Policy Configuration
 *
 * Defines safety policies for infrastructure operations
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Risk severity levels
 */
export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Risk definition
 */
export interface Risk {
  id: string;
  severity: RiskSeverity;
  message: string;
  details?: Record<string, unknown>;
  canProceed: boolean;
  requiresApproval: boolean;
}

/**
 * Safety check result
 */
export interface SafetyCheckResult {
  passed: boolean;
  risks: Risk[];
  blockers: Risk[];
  requiresApproval: boolean;
  estimatedCost?: number;
  affectedResources?: string[];
}

/**
 * Safety policy configuration
 */
export interface SafetyPolicy {
  /** Operations that always require approval */
  alwaysRequireApproval: string[];
  /** Protected environments that require extra caution */
  protectedEnvironments: string[];
  /** Cost threshold that triggers approval ($) */
  costThreshold: number;
  /** Operations to skip safety checks for */
  skipSafetyFor: string[];
  /** Custom rules */
  customRules?: SafetyRule[];
}

/**
 * Custom safety rule
 */
export interface SafetyRule {
  id: string;
  name: string;
  description: string;
  severity: RiskSeverity;
  check: (context: SafetyContext) => boolean;
  message: string;
}

/**
 * Context for safety checks
 */
export interface SafetyContext {
  operation: string;
  type: 'terraform' | 'kubernetes' | 'helm' | 'aws' | 'gcp' | 'azure';
  environment?: string;
  resources?: string[];
  estimatedCost?: number;
  planOutput?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Default safety policy
 */
export const defaultSafetyPolicy: SafetyPolicy = {
  alwaysRequireApproval: ['destroy', 'delete', 'terminate', 'update', 'apply', 'create'],
  protectedEnvironments: ['production', 'prod', 'prd', 'live', 'main', 'master'],
  costThreshold: 500,
  skipSafetyFor: ['plan', 'validate', 'show', 'list', 'get', 'describe', 'logs', 'status'],
  customRules: [],
};

/**
 * Load safety policy from config file or use defaults
 */
export function loadSafetyPolicy(configPath?: string): SafetyPolicy {
  // Try to load from workspace config
  const nimbusDir = path.join(process.cwd(), '.nimbus');
  const configFile = configPath || path.join(nimbusDir, 'config.yaml');

  if (fs.existsSync(configFile)) {
    try {
      const content = fs.readFileSync(configFile, 'utf-8');
      const policy = parseSafetyConfig(content);
      if (policy) {
        return { ...defaultSafetyPolicy, ...policy };
      }
    } catch {
      // Use defaults
    }
  }

  return defaultSafetyPolicy;
}

/**
 * Parse safety config from YAML content
 */
function parseSafetyConfig(content: string): Partial<SafetyPolicy> | null {
  // Simple YAML parsing for safety section
  const safetyMatch = content.match(/safety:\s*\n((?:[ \t]+.+\n?)*)/);
  if (!safetyMatch) {
    return null;
  }

  const safetySection = safetyMatch[1];
  const policy: Partial<SafetyPolicy> = {};

  // Parse requireApproval
  const approvalMatch = safetySection.match(/requireApproval:\s*(true|false)/);
  if (approvalMatch) {
    if (approvalMatch[1] === 'false') {
      policy.alwaysRequireApproval = [];
    }
  }

  // Parse protectedEnvironments
  const envMatch = safetySection.match(/protectedEnvironments:\s*\[([^\]]+)\]/);
  if (envMatch) {
    policy.protectedEnvironments = envMatch[1].split(',').map(s => s.trim().replace(/['"]/g, ''));
  }

  // Parse costThreshold
  const costMatch = safetySection.match(/costThreshold:\s*(\d+)/);
  if (costMatch) {
    policy.costThreshold = parseInt(costMatch[1], 10);
  }

  return policy;
}

/**
 * Check if an operation requires safety checks
 */
export function requiresSafetyCheck(
  operation: string,
  policy: SafetyPolicy = defaultSafetyPolicy
): boolean {
  const normalizedOp = operation.toLowerCase();
  return !policy.skipSafetyFor.some(skip => normalizedOp.includes(skip.toLowerCase()));
}

/**
 * Check if an operation requires approval
 */
export function requiresApproval(
  operation: string,
  context: SafetyContext,
  policy: SafetyPolicy = defaultSafetyPolicy
): boolean {
  const normalizedOp = operation.toLowerCase();

  // Check if operation is in always require list
  if (policy.alwaysRequireApproval.some(op => normalizedOp.includes(op.toLowerCase()))) {
    return true;
  }

  // Check if environment is protected
  if (context.environment) {
    const normalizedEnv = context.environment.toLowerCase();
    if (policy.protectedEnvironments.some(env => normalizedEnv.includes(env.toLowerCase()))) {
      return true;
    }
  }

  // Check cost threshold
  if (context.estimatedCost && context.estimatedCost > policy.costThreshold) {
    return true;
  }

  return false;
}

/**
 * Evaluate safety for an operation
 */
export function evaluateSafety(
  context: SafetyContext,
  policy: SafetyPolicy = defaultSafetyPolicy
): SafetyCheckResult {
  const risks: Risk[] = [];
  const blockers: Risk[] = [];
  let requiresApprovalFlag = false;

  // Check for destroy/delete operations
  if (['destroy', 'delete', 'terminate'].some(op => context.operation.toLowerCase().includes(op))) {
    const risk: Risk = {
      id: 'destructive-operation',
      severity: 'critical',
      message: `Destructive operation: ${context.operation}`,
      canProceed: true,
      requiresApproval: true,
    };
    risks.push(risk);
    requiresApprovalFlag = true;
  }

  // Check for protected environment
  if (context.environment) {
    const normalizedEnv = context.environment.toLowerCase();
    if (policy.protectedEnvironments.some(env => normalizedEnv.includes(env.toLowerCase()))) {
      const risk: Risk = {
        id: 'protected-environment',
        severity: 'high',
        message: `Operating on protected environment: ${context.environment}`,
        canProceed: true,
        requiresApproval: true,
      };
      risks.push(risk);
      requiresApprovalFlag = true;
    }
  }

  // Check cost threshold
  if (context.estimatedCost && context.estimatedCost > policy.costThreshold) {
    const risk: Risk = {
      id: 'high-cost',
      severity: 'high',
      message: `Estimated cost $${context.estimatedCost} exceeds threshold $${policy.costThreshold}`,
      details: {
        estimatedCost: context.estimatedCost,
        threshold: policy.costThreshold,
      },
      canProceed: true,
      requiresApproval: true,
    };
    risks.push(risk);
    requiresApprovalFlag = true;
  }

  // Check for mutations in apply
  if (context.operation.toLowerCase().includes('apply')) {
    const risk: Risk = {
      id: 'mutation-operation',
      severity: 'medium',
      message: 'This operation will modify infrastructure',
      canProceed: true,
      requiresApproval: true,
    };
    risks.push(risk);
    requiresApprovalFlag = true;
  }

  // Check custom rules
  if (policy.customRules) {
    for (const rule of policy.customRules) {
      try {
        if (rule.check(context)) {
          const risk: Risk = {
            id: rule.id,
            severity: rule.severity,
            message: rule.message,
            canProceed: rule.severity !== 'critical',
            requiresApproval: rule.severity === 'critical' || rule.severity === 'high',
          };

          if (!risk.canProceed) {
            blockers.push(risk);
          } else {
            risks.push(risk);
            if (risk.requiresApproval) {
              requiresApprovalFlag = true;
            }
          }
        }
      } catch {
        // Skip rule on error
      }
    }
  }

  // Analyze plan output for resource changes
  if (context.planOutput) {
    const changes = analyzePlanOutput(context.planOutput);
    if (changes.destroy > 0) {
      const risk: Risk = {
        id: 'resource-destruction',
        severity: 'high',
        message: `${changes.destroy} resources will be destroyed`,
        details: { count: changes.destroy },
        canProceed: true,
        requiresApproval: true,
      };
      risks.push(risk);
      requiresApprovalFlag = true;
    }
  }

  return {
    passed: blockers.length === 0,
    risks,
    blockers,
    requiresApproval: requiresApprovalFlag,
    estimatedCost: context.estimatedCost,
    affectedResources: context.resources,
  };
}

/**
 * Analyze Terraform plan output for changes
 */
function analyzePlanOutput(output: string): { add: number; change: number; destroy: number } {
  const addMatch = output.match(/(\d+) to add/);
  const changeMatch = output.match(/(\d+) to change/);
  const destroyMatch = output.match(/(\d+) to destroy/);

  return {
    add: addMatch ? parseInt(addMatch[1], 10) : 0,
    change: changeMatch ? parseInt(changeMatch[1], 10) : 0,
    destroy: destroyMatch ? parseInt(destroyMatch[1], 10) : 0,
  };
}

/**
 * Format risks for display
 */
export function formatRisks(risks: Risk[]): string[] {
  return risks.map(risk => {
    const icon = getSeverityIcon(risk.severity);
    return `${icon} [${risk.severity.toUpperCase()}] ${risk.message}`;
  });
}

/**
 * Get icon for severity level
 */
function getSeverityIcon(severity: RiskSeverity): string {
  switch (severity) {
    case 'critical':
      return '🔴';
    case 'high':
      return '🟠';
    case 'medium':
      return '🟡';
    case 'low':
      return '🔵';
    default:
      return '⚪';
  }
}
