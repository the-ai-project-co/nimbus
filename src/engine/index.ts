/**
 * Engine — barrel exports
 *
 * Re-exports all classes, interfaces, and key types from every engine module.
 * Consumers can import from '@nimbus/engine' (or 'src/engine') without
 * needing to know which sub-module a symbol lives in.
 */

// ==========================================
// Planner
// ==========================================
export { Planner } from './planner';
export type { AgentTask, AgentPlan, PlanStep, PlanDependency, Risk } from './planner';

// ==========================================
// Orchestrator (also re-exports shared types)
// ==========================================
export { AgentOrchestrator } from './orchestrator';
export type {
  ExecutionResult,
  ExecutionArtifact,
  ExecutionLog,
  VerificationResult,
  VerificationCheck,
  AgentEvent,
} from './orchestrator';

// ==========================================
// Executor
// ==========================================
export { Executor } from './executor';

// ==========================================
// Verifier
// ==========================================
export { Verifier } from './verifier';

// ==========================================
// Safety Manager
// ==========================================
export { SafetyManager } from './safety';
export type { SafetyCheck, SafetyCheckResult } from './safety';

// ==========================================
// Drift Detector
// ==========================================
export { DriftDetector } from './drift-detector';
export type {
  DriftDetectionOptions,
  DriftReport,
  DriftSummary,
  ResourceDrift,
  DriftItem,
  DriftType,
  DriftSeverity,
  DriftProvider,
} from './drift-detector';

// ==========================================
// Cost Estimator
// ==========================================
export { CostEstimator } from './cost-estimator';
export type {
  CostEstimationInput,
  CostEstimate,
  ComponentCostBreakdown,
  KnownComponent,
  EnvironmentTier,
  CloudProvider,
} from './cost-estimator';

// ==========================================
// Diagram Generator
// ==========================================
export { DiagramGenerator } from './diagram-generator';
export type { DiagramComponent, DiagramConnection, DiagramOptions } from './diagram-generator';
