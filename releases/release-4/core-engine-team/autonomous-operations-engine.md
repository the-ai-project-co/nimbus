# Core Engine Team - Release 4 Specification

> **Team**: Core Engine Team
> **Phase**: Release 4 (Months 10-12)
> **Dependencies**: Kubernetes API, Terraform State, Monitoring APIs

---

## Overview

Release 4 introduces the Autonomous Operations Engine - the core capability that enables self-healing, drift detection, and automated remediation with human-in-the-loop approval workflows.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Autonomous Operations Engine                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Monitor Layer                         │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────────┐  │   │
│  │  │   K8s   │  │Terraform│  │  Cloud  │  │ Metrics   │  │   │
│  │  │ Watcher │  │ Watcher │  │ Watcher │  │ Collector │  │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └───────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Detection Engine                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │   │
│  │  │    Drift    │  │   Health    │  │    Anomaly      │ │   │
│  │  │  Detector   │  │  Analyzer   │  │   Detector      │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Remediation Engine                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │   │
│  │  │   Action    │  │  Approval   │  │   Execution     │ │   │
│  │  │  Planner    │  │  Manager    │  │   Controller    │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Monitor Layer

#### 1.1 Kubernetes Watcher

**File**: `packages/core/src/autonomous/watchers/kubernetes.ts`

```typescript
import { KubeConfig, Watch, CoreV1Api, AppsV1Api } from '@kubernetes/client-node';

interface K8sEvent {
  type: 'ADDED' | 'MODIFIED' | 'DELETED';
  object: K8sObject;
  cluster: string;
  timestamp: Date;
}

interface HealthIssue {
  type: 'pod_crash' | 'node_not_ready' | 'pvc_full' | 'deployment_stuck' | 'hpa_maxed';
  severity: 'critical' | 'warning' | 'info';
  resource: string;
  namespace: string;
  details: Record<string, unknown>;
}

export class KubernetesWatcher {
  private kubeConfig: KubeConfig;
  private watchers: Map<string, Watch> = new Map();
  private eventEmitter: EventEmitter;

  constructor(eventEmitter: EventEmitter) {
    this.kubeConfig = new KubeConfig();
    this.kubeConfig.loadFromDefault();
    this.eventEmitter = eventEmitter;
  }

  async startWatching(cluster: string): Promise<void> {
    const coreApi = this.kubeConfig.makeApiClient(CoreV1Api);
    const appsApi = this.kubeConfig.makeApiClient(AppsV1Api);

    // Watch Pods
    await this.watchResource('/api/v1/pods', cluster, (event) => {
      const issue = this.analyzePodEvent(event);
      if (issue) {
        this.eventEmitter.emit('health_issue', issue);
      }
    });

    // Watch Nodes
    await this.watchResource('/api/v1/nodes', cluster, (event) => {
      const issue = this.analyzeNodeEvent(event);
      if (issue) {
        this.eventEmitter.emit('health_issue', issue);
      }
    });

    // Watch Deployments
    await this.watchResource('/apis/apps/v1/deployments', cluster, (event) => {
      const issue = this.analyzeDeploymentEvent(event);
      if (issue) {
        this.eventEmitter.emit('health_issue', issue);
      }
    });

    // Watch Events (for crash loops, etc.)
    await this.watchResource('/api/v1/events', cluster, (event) => {
      if (this.isCriticalEvent(event)) {
        this.eventEmitter.emit('critical_event', event);
      }
    });
  }

  private analyzePodEvent(event: K8sEvent): HealthIssue | null {
    const pod = event.object as V1Pod;
    const status = pod.status;

    // Check for CrashLoopBackOff
    const containerStatuses = status?.containerStatuses || [];
    for (const cs of containerStatuses) {
      if (cs.state?.waiting?.reason === 'CrashLoopBackOff') {
        return {
          type: 'pod_crash',
          severity: 'critical',
          resource: `${pod.metadata?.namespace}/${pod.metadata?.name}`,
          namespace: pod.metadata?.namespace || 'default',
          details: {
            restartCount: cs.restartCount,
            reason: cs.state?.waiting?.reason,
            message: cs.state?.waiting?.message,
          },
        };
      }

      // Check for OOMKilled
      if (cs.lastState?.terminated?.reason === 'OOMKilled') {
        return {
          type: 'pod_crash',
          severity: 'critical',
          resource: `${pod.metadata?.namespace}/${pod.metadata?.name}`,
          namespace: pod.metadata?.namespace || 'default',
          details: {
            reason: 'OOMKilled',
            exitCode: cs.lastState?.terminated?.exitCode,
          },
        };
      }
    }

    return null;
  }

  private analyzeNodeEvent(event: K8sEvent): HealthIssue | null {
    const node = event.object as V1Node;
    const conditions = node.status?.conditions || [];

    const readyCondition = conditions.find(c => c.type === 'Ready');
    if (readyCondition?.status === 'False' || readyCondition?.status === 'Unknown') {
      return {
        type: 'node_not_ready',
        severity: 'critical',
        resource: node.metadata?.name || '',
        namespace: '',
        details: {
          reason: readyCondition.reason,
          message: readyCondition.message,
          lastTransition: readyCondition.lastTransitionTime,
        },
      };
    }

    return null;
  }
}
```

#### 1.2 Terraform State Watcher

**File**: `packages/core/src/autonomous/watchers/terraform.ts`

```typescript
interface TerraformDrift {
  resource: string;
  attribute: string;
  expected: unknown;
  actual: unknown;
  severity: 'critical' | 'warning' | 'info';
  type: 'modified' | 'deleted' | 'added';
}

export class TerraformWatcher {
  private stateLocations: Map<string, string> = new Map(); // name -> state file/backend
  private eventEmitter: EventEmitter;

  async detectDrift(stateName: string): Promise<TerraformDrift[]> {
    const stateLocation = this.stateLocations.get(stateName);
    if (!stateLocation) {
      throw new Error(`Unknown state: ${stateName}`);
    }

    // Run terraform plan -detailed-exitcode
    const result = await this.runTerraformPlan(stateLocation);

    // Parse plan output
    const drifts = this.parsePlanOutput(result);

    // Classify drift severity
    return drifts.map(drift => ({
      ...drift,
      severity: this.classifyDriftSeverity(drift),
    }));
  }

  private classifyDriftSeverity(drift: TerraformDrift): TerraformDrift['severity'] {
    // Security-related drifts are critical
    if (drift.resource.includes('security_group') ||
        drift.resource.includes('iam') ||
        drift.attribute.includes('public')) {
      return 'critical';
    }

    // Compute changes are warnings
    if (drift.resource.includes('instance') ||
        drift.resource.includes('node')) {
      return 'warning';
    }

    // Everything else is info
    return 'info';
  }

  private async runTerraformPlan(directory: string): Promise<TerraformPlanResult> {
    const process = spawn('terraform', ['plan', '-detailed-exitcode', '-json'], {
      cwd: directory,
    });

    const output: string[] = [];
    for await (const chunk of process.stdout) {
      output.push(chunk.toString());
    }

    const exitCode = await new Promise<number>((resolve) => {
      process.on('exit', resolve);
    });

    return {
      exitCode, // 0 = no changes, 1 = error, 2 = changes
      output: output.join(''),
    };
  }
}
```

---

### 2. Detection Engine

#### 2.1 Drift Detector

**File**: `packages/core/src/autonomous/detection/drift.ts`

```typescript
interface DriftReport {
  id: string;
  timestamp: Date;
  scope: string[];
  drifts: DriftItem[];
  summary: DriftSummary;
}

interface DriftItem {
  id: string;
  source: 'terraform' | 'kubernetes' | 'cloud';
  resource: string;
  type: 'modified' | 'deleted' | 'added' | 'orphaned';
  severity: 'critical' | 'warning' | 'info';
  expected: unknown;
  actual: unknown;
  recommendedAction: 'fix' | 'ignore' | 'update_baseline';
}

export class DriftDetector {
  private terraformWatcher: TerraformWatcher;
  private kubernetesWatcher: KubernetesWatcher;
  private cloudWatcher: CloudWatcher;

  async detectAll(): Promise<DriftReport> {
    const drifts: DriftItem[] = [];

    // Check all Terraform states
    const tfDrifts = await this.terraformWatcher.detectDrift('*');
    drifts.push(...tfDrifts.map(d => this.toUnifiedDrift('terraform', d)));

    // Check Kubernetes resources against GitOps source
    const k8sDrifts = await this.detectK8sDrift();
    drifts.push(...k8sDrifts);

    // Check cloud resources
    const cloudDrifts = await this.detectCloudDrift();
    drifts.push(...cloudDrifts);

    return {
      id: generateId(),
      timestamp: new Date(),
      scope: ['terraform', 'kubernetes', 'cloud'],
      drifts,
      summary: this.summarize(drifts),
    };
  }

  private async detectK8sDrift(): Promise<DriftItem[]> {
    // Compare live cluster state to Git-stored manifests
    const liveResources = await this.kubernetesWatcher.getCurrentState();
    const expectedResources = await this.loadExpectedState(); // From Git

    const drifts: DriftItem[] = [];

    for (const [key, live] of Object.entries(liveResources)) {
      const expected = expectedResources[key];

      if (!expected) {
        // Resource exists in cluster but not in Git
        drifts.push({
          id: generateId(),
          source: 'kubernetes',
          resource: key,
          type: 'orphaned',
          severity: 'warning',
          expected: null,
          actual: live,
          recommendedAction: 'fix',
        });
      } else if (!this.deepEqual(live, expected)) {
        // Resource differs from Git
        drifts.push({
          id: generateId(),
          source: 'kubernetes',
          resource: key,
          type: 'modified',
          severity: this.classifyK8sDrift(key, live, expected),
          expected,
          actual: live,
          recommendedAction: 'fix',
        });
      }
    }

    return drifts;
  }

  private summarize(drifts: DriftItem[]): DriftSummary {
    return {
      total: drifts.length,
      critical: drifts.filter(d => d.severity === 'critical').length,
      warning: drifts.filter(d => d.severity === 'warning').length,
      info: drifts.filter(d => d.severity === 'info').length,
      bySource: {
        terraform: drifts.filter(d => d.source === 'terraform').length,
        kubernetes: drifts.filter(d => d.source === 'kubernetes').length,
        cloud: drifts.filter(d => d.source === 'cloud').length,
      },
    };
  }
}
```

#### 2.2 Health Analyzer

**File**: `packages/core/src/autonomous/detection/health.ts`

```typescript
interface HealthReport {
  timestamp: Date;
  overall: 'healthy' | 'degraded' | 'critical';
  components: ComponentHealth[];
  issues: HealthIssue[];
  recommendations: Recommendation[];
}

interface ComponentHealth {
  name: string;
  type: 'cluster' | 'service' | 'database' | 'cache';
  status: 'healthy' | 'degraded' | 'critical';
  metrics: Record<string, number>;
  issues: HealthIssue[];
}

export class HealthAnalyzer {
  private issueQueue: HealthIssue[] = [];

  async analyze(): Promise<HealthReport> {
    const components: ComponentHealth[] = [];

    // Analyze Kubernetes clusters
    for (const cluster of await this.getClusters()) {
      components.push(await this.analyzeCluster(cluster));
    }

    // Analyze databases
    for (const db of await this.getDatabases()) {
      components.push(await this.analyzeDatabase(db));
    }

    // Determine overall health
    const overall = this.determineOverallHealth(components);

    // Generate recommendations
    const recommendations = this.generateRecommendations(components);

    return {
      timestamp: new Date(),
      overall,
      components,
      issues: this.issueQueue,
      recommendations,
    };
  }

  private async analyzeCluster(cluster: K8sCluster): Promise<ComponentHealth> {
    const issues: HealthIssue[] = [];

    // Check node health
    const nodes = await this.getClusterNodes(cluster);
    const unhealthyNodes = nodes.filter(n => !this.isNodeHealthy(n));
    if (unhealthyNodes.length > 0) {
      issues.push({
        type: 'node_not_ready',
        severity: unhealthyNodes.length > 1 ? 'critical' : 'warning',
        resource: cluster.name,
        namespace: '',
        details: { unhealthyNodes: unhealthyNodes.map(n => n.name) },
      });
    }

    // Check pod health
    const pods = await this.getClusterPods(cluster);
    const crashingPods = pods.filter(p => this.isPodCrashing(p));
    if (crashingPods.length > 0) {
      issues.push({
        type: 'pod_crash',
        severity: crashingPods.length > 5 ? 'critical' : 'warning',
        resource: cluster.name,
        namespace: '',
        details: { crashingPods: crashingPods.map(p => `${p.namespace}/${p.name}`) },
      });
    }

    // Check resource utilization
    const metrics = await this.getClusterMetrics(cluster);

    return {
      name: cluster.name,
      type: 'cluster',
      status: issues.length === 0 ? 'healthy' :
              issues.some(i => i.severity === 'critical') ? 'critical' : 'degraded',
      metrics,
      issues,
    };
  }

  private generateRecommendations(components: ComponentHealth[]): Recommendation[] {
    const recommendations: Recommendation[] = [];

    for (const component of components) {
      // High CPU recommendation
      if (component.metrics.cpuPercent > 80) {
        recommendations.push({
          type: 'scale_up',
          component: component.name,
          reason: `CPU usage at ${component.metrics.cpuPercent}%`,
          action: 'Add more nodes or increase instance size',
        });
      }

      // High memory recommendation
      if (component.metrics.memoryPercent > 85) {
        recommendations.push({
          type: 'scale_up',
          component: component.name,
          reason: `Memory usage at ${component.metrics.memoryPercent}%`,
          action: 'Add more nodes or increase memory limits',
        });
      }
    }

    return recommendations;
  }
}
```

---

### 3. Remediation Engine

#### 3.1 Action Planner

**File**: `packages/core/src/autonomous/remediation/planner.ts`

```typescript
interface RemediationPlan {
  id: string;
  issue: HealthIssue | DriftItem;
  actions: RemediationAction[];
  requiresApproval: boolean;
  estimatedDowntime: number; // seconds
  rollbackPlan: RemediationAction[];
}

interface RemediationAction {
  id: string;
  type: 'k8s' | 'terraform' | 'cloud' | 'notification';
  operation: string;
  parameters: Record<string, unknown>;
  description: string;
  risk: 'low' | 'medium' | 'high';
}

export class ActionPlanner {
  private remediationRules: RemediationRule[];

  constructor() {
    this.remediationRules = this.loadDefaultRules();
  }

  async planRemediation(issue: HealthIssue): Promise<RemediationPlan> {
    const rule = this.findMatchingRule(issue);
    if (!rule) {
      throw new Error(`No remediation rule for issue type: ${issue.type}`);
    }

    const actions = this.buildActions(rule, issue);
    const rollback = this.buildRollbackPlan(actions);

    return {
      id: generateId(),
      issue,
      actions,
      requiresApproval: this.requiresApproval(rule, issue),
      estimatedDowntime: this.estimateDowntime(actions),
      rollbackPlan: rollback,
    };
  }

  private loadDefaultRules(): RemediationRule[] {
    return [
      {
        issueType: 'pod_crash',
        condition: (issue) => issue.details.reason === 'OOMKilled',
        actions: [
          {
            type: 'k8s',
            operation: 'patch_resource_limits',
            parameters: { increaseMemory: '50%' },
          },
          {
            type: 'k8s',
            operation: 'restart_pod',
          },
        ],
        autoApprove: false,
      },
      {
        issueType: 'pod_crash',
        condition: (issue) => issue.details.reason === 'CrashLoopBackOff' && issue.details.restartCount < 10,
        actions: [
          {
            type: 'k8s',
            operation: 'delete_pod',
            description: 'Delete pod to trigger recreation',
          },
        ],
        autoApprove: true,
      },
      {
        issueType: 'node_not_ready',
        condition: () => true,
        actions: [
          {
            type: 'k8s',
            operation: 'cordon_node',
          },
          {
            type: 'k8s',
            operation: 'drain_node',
            parameters: { gracePeriod: 300 },
          },
          {
            type: 'cloud',
            operation: 'terminate_instance',
          },
        ],
        autoApprove: false,
      },
      {
        issueType: 'hpa_maxed',
        condition: () => true,
        actions: [
          {
            type: 'notification',
            operation: 'alert',
            parameters: { channel: 'slack', severity: 'warning' },
          },
        ],
        autoApprove: true,
      },
    ];
  }

  private requiresApproval(rule: RemediationRule, issue: HealthIssue): boolean {
    // Never auto-approve in production without explicit rule
    if (issue.namespace === 'production' && !rule.autoApprove) {
      return true;
    }

    // Always require approval for node operations
    if (issue.type === 'node_not_ready') {
      return true;
    }

    return !rule.autoApprove;
  }
}
```

#### 3.2 Execution Controller

**File**: `packages/core/src/autonomous/remediation/executor.ts`

```typescript
interface ExecutionResult {
  planId: string;
  status: 'success' | 'failed' | 'rolled_back';
  actionsExecuted: ActionResult[];
  duration: number;
  error?: string;
}

interface ActionResult {
  actionId: string;
  status: 'success' | 'failed' | 'skipped';
  output: string;
  duration: number;
}

export class ExecutionController {
  private kubeClient: KubernetesClient;
  private cloudClient: CloudClient;
  private notifier: NotificationService;

  async execute(plan: RemediationPlan, approval?: Approval): Promise<ExecutionResult> {
    if (plan.requiresApproval && !approval) {
      throw new Error('Plan requires approval');
    }

    const results: ActionResult[] = [];
    const startTime = Date.now();

    try {
      for (const action of plan.actions) {
        const result = await this.executeAction(action);
        results.push(result);

        if (result.status === 'failed') {
          // Attempt rollback
          await this.rollback(plan, results);
          return {
            planId: plan.id,
            status: 'rolled_back',
            actionsExecuted: results,
            duration: Date.now() - startTime,
            error: `Action ${action.id} failed: ${result.output}`,
          };
        }
      }

      return {
        planId: plan.id,
        status: 'success',
        actionsExecuted: results,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      await this.rollback(plan, results);
      throw error;
    }
  }

  private async executeAction(action: RemediationAction): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      let output: string;

      switch (action.type) {
        case 'k8s':
          output = await this.executeK8sAction(action);
          break;
        case 'cloud':
          output = await this.executeCloudAction(action);
          break;
        case 'terraform':
          output = await this.executeTerraformAction(action);
          break;
        case 'notification':
          output = await this.executeNotification(action);
          break;
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }

      return {
        actionId: action.id,
        status: 'success',
        output,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        actionId: action.id,
        status: 'failed',
        output: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  private async executeK8sAction(action: RemediationAction): Promise<string> {
    switch (action.operation) {
      case 'delete_pod':
        return this.kubeClient.deletePod(action.parameters.name, action.parameters.namespace);
      case 'cordon_node':
        return this.kubeClient.cordonNode(action.parameters.name);
      case 'drain_node':
        return this.kubeClient.drainNode(action.parameters.name, action.parameters.gracePeriod);
      case 'patch_resource_limits':
        return this.kubeClient.patchResourceLimits(
          action.parameters.name,
          action.parameters.namespace,
          action.parameters.increaseMemory
        );
      default:
        throw new Error(`Unknown K8s operation: ${action.operation}`);
    }
  }

  private async rollback(plan: RemediationPlan, executedResults: ActionResult[]): Promise<void> {
    const successfulActions = executedResults.filter(r => r.status === 'success');

    // Execute rollback in reverse order
    for (const action of [...plan.rollbackPlan].reverse()) {
      const originalAction = plan.actions.find(a => a.id === action.parameters.rollbackFor);
      if (originalAction && successfulActions.some(r => r.actionId === originalAction.id)) {
        await this.executeAction(action);
      }
    }
  }
}
```

---

## User Stories

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-300 | As an SRE, I want auto-healing for common issues | Pods restarted automatically | Sprint 19-20 |
| US-301 | As an SRE, I want to detect infrastructure drift | Drift report accurate | Sprint 19-20 |
| US-302 | As an SRE, I want auto-fix for safe drift | Safe fixes applied | Sprint 19-20 |
| US-303 | As an SRE, I want scheduled drift detection | Cron-based scanning works | Sprint 19-20 |
| US-304 | As an SRE, I want approval workflows | Approvals work correctly | Sprint 19-20 |

---

## Sprint Breakdown

### Sprint 19-20 (Weeks 1-4)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Kubernetes Watcher | 4 days | Real-time monitoring |
| Terraform Watcher | 3 days | Drift detection |
| Health Analyzer | 3 days | Issue classification |
| Action Planner | 4 days | Remediation planning |
| Execution Controller | 4 days | Safe execution |

---

## Acceptance Criteria

- [ ] Pod crashes detected within 30 seconds
- [ ] Node failures trigger alerts immediately
- [ ] Drift detection finds all changes
- [ ] Auto-healing restarts crashed pods
- [ ] Approval required for node operations
- [ ] Rollback works when remediation fails
- [ ] All actions logged for audit

---

*Document Version: 1.0*
*Last Updated: January 2026*
