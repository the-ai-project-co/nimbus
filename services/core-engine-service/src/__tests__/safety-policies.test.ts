import { describe, it, expect } from 'bun:test';
import { SafetyManager } from '../components/safety-manager';

/** Helper to create a minimal AgentTask-like object */
function makeTask(
  env: string,
  requirements: Record<string, unknown> = {},
) {
  return {
    id: 'test-task',
    type: 'generate' as const,
    status: 'pending' as const,
    priority: 'medium' as const,
    user_id: 'test-user',
    created_at: new Date(),
    updated_at: new Date(),
    context: {
      environment: env,
      provider: 'aws' as const,
      components: ['vpc'],
      requirements,
    },
    execution: {},
  };
}

/** Helper to create a minimal AgentPlan-like object */
function makePlan(
  steps: Array<{ action: string; description?: string; parameters?: Record<string, unknown> }>,
) {
  return {
    id: 'test-plan',
    task_id: 'test-task',
    status: 'approved' as const,
    created_at: new Date(),
    updated_at: new Date(),
    steps: steps.map((s, i) => ({
      id: `step-${i}`,
      order: i + 1,
      type: 'deploy' as const,
      action: s.action,
      description: s.description || '',
      parameters: s.parameters || {},
      status: 'pending' as const,
    })),
    dependencies: [],
    risks: [],
    risk_level: 'low' as const,
    requires_approval: false,
  };
}

describe('SafetyManager - no_production_delete_without_backup', () => {
  const manager = new SafetyManager();

  it('should PASS in non-production environment', async () => {
    const task = makeTask('staging');
    const plan = makePlan([
      { action: 'apply_deployment', description: 'destroy all resources' },
    ]);

    const { results } = await manager.runPreExecutionChecks(task as any, plan as any);
    const check = results.find((r) =>
      r.message.includes('Non-production environment') ||
      r.message.includes('non-production') ||
      r.message.includes('not applicable'),
    );

    // In non-production, the policy should pass
    const policyResults = results.filter(
      (r) =>
        r.message.includes('Non-production environment') ||
        r.message.includes('not applicable'),
    );
    expect(policyResults.length).toBeGreaterThanOrEqual(1);
    expect(policyResults.every((r) => r.passed)).toBe(true);
  });

  it('should PASS when no destructive actions in plan', async () => {
    const task = makeTask('production');
    const plan = makePlan([
      { action: 'validate_requirements', description: 'validate' },
    ]);
    // Mark the plan as approved for production safeguard
    (plan as any).requires_approval = true;
    (plan as any).approved_by = 'admin';

    const { results } = await manager.runPreExecutionChecks(task as any, plan as any);
    const policyResult = results.find((r) =>
      r.message.includes('No destructive actions'),
    );

    expect(policyResult).toBeDefined();
    expect(policyResult!.passed).toBe(true);
  });

  it('should FAIL in production with destructive actions and no backup_enabled', async () => {
    const task = makeTask('production', { backup_enabled: false });
    const plan = makePlan([
      { action: 'apply_deployment', description: 'destroy the database' },
    ]);
    (plan as any).requires_approval = true;
    (plan as any).approved_by = 'admin';

    const { results } = await manager.runPreExecutionChecks(task as any, plan as any);
    const policyResult = results.find((r) =>
      r.message.includes('backup_enabled') || r.message.includes('require backup'),
    );

    expect(policyResult).toBeDefined();
    expect(policyResult!.passed).toBe(false);
    expect(policyResult!.can_proceed).toBe(false);
  });

  it('should PASS in production with destructive actions and backup_enabled=true', async () => {
    const task = makeTask('production', { backup_enabled: true });
    const plan = makePlan([
      { action: 'apply_deployment', description: 'destroy old resources' },
    ]);
    (plan as any).requires_approval = true;
    (plan as any).approved_by = 'admin';

    const { results } = await manager.runPreExecutionChecks(task as any, plan as any);
    const policyResult = results.find((r) =>
      r.message.includes('Backup enabled'),
    );

    expect(policyResult).toBeDefined();
    expect(policyResult!.passed).toBe(true);
  });
});

describe('SafetyManager - require_dry_run_first', () => {
  const manager = new SafetyManager();

  it('should PASS when no apply_deployment steps', async () => {
    const task = makeTask('staging');
    const plan = makePlan([
      { action: 'validate_requirements' },
      { action: 'generate_component' },
    ]);

    const { results } = await manager.runPreExecutionChecks(task as any, plan as any);
    const policyResult = results.find((r) =>
      r.message.includes('No apply_deployment'),
    );

    expect(policyResult).toBeDefined();
    expect(policyResult!.passed).toBe(true);
  });

  it('should FAIL when apply_deployment exists but no plan_deployment step', async () => {
    const task = makeTask('staging');
    const plan = makePlan([
      { action: 'validate_requirements' },
      { action: 'apply_deployment' },
    ]);

    const { results } = await manager.runPreExecutionChecks(task as any, plan as any);
    const policyResult = results.find((r) =>
      r.message.includes('without a preceding plan_deployment') ||
      r.message.includes('dry-run') ||
      r.message.includes('--dry-run'),
    );

    expect(policyResult).toBeDefined();
    expect(policyResult!.passed).toBe(false);
    expect(policyResult!.can_proceed).toBe(false);
  });

  it('should PASS when both plan_deployment and apply_deployment exist', async () => {
    const task = makeTask('staging');
    const plan = makePlan([
      { action: 'validate_requirements' },
      { action: 'plan_deployment' },
      { action: 'apply_deployment' },
    ]);

    const { results } = await manager.runPreExecutionChecks(task as any, plan as any);
    const policyResult = results.find((r) =>
      r.message.includes('Dry-run') || r.message.includes('plan_deployment') && r.message.includes('precedes'),
    );

    expect(policyResult).toBeDefined();
    expect(policyResult!.passed).toBe(true);
  });
});
