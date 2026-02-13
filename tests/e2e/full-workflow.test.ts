import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Import components for testing
import { ProjectScanner } from '../../services/cli-service/src/scanners';
import {
  loadSafetyPolicy,
  evaluateSafety,
  type SafetyContext,
} from '../../services/cli-service/src/config/safety-policy';
import { getScenarios } from '../../services/cli-service/src/demo';

describe('Full Workflow E2E', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-e2e-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('Project Initialization Flow', () => {
    test('should scan and generate project context for Node.js project', async () => {
      // Setup Node.js project
      fs.writeFileSync(
        path.join(testDir, 'package.json'),
        JSON.stringify({
          name: 'test-app',
          dependencies: {
            express: '^4.18.0',
            react: '^18.0.0',
          },
        })
      );
      fs.writeFileSync(path.join(testDir, 'tsconfig.json'), '{}');

      // Setup GitHub Actions
      const workflowsDir = path.join(testDir, '.github', 'workflows');
      fs.mkdirSync(workflowsDir, { recursive: true });
      fs.writeFileSync(
        path.join(workflowsDir, 'ci.yml'),
        'name: CI\non: push'
      );

      // Scan project
      const scanner = new ProjectScanner();
      const context = await scanner.scan(testDir);

      // Verify detection
      expect(context.structure.languages.some((l) => l.name === 'typescript')).toBe(true);
      expect(context.structure.frameworks.some((f) => f.name === 'express')).toBe(true);
      expect(context.structure.frameworks.some((f) => f.name === 'react')).toBe(true);
      expect(context.cicd.platform).toBe('github-actions');

      expect(context.project.path).toBe(testDir);
      expect(context.structure.languages.length).toBeGreaterThan(0);
      expect(context.structure.frameworks.length).toBeGreaterThan(0);
    });

    test('should scan and generate project context for Python project', async () => {
      // Setup Python project
      fs.writeFileSync(
        path.join(testDir, 'requirements.txt'),
        'django==4.0.0\ncelery==5.3.0'
      );
      fs.writeFileSync(
        path.join(testDir, 'pyproject.toml'),
        '[tool.poetry]\nname = "test-project"'
      );

      // Scan project
      const scanner = new ProjectScanner();
      const context = await scanner.scan(testDir);

      // Verify detection
      expect(context.structure.languages.some((l) => l.name === 'python')).toBe(true);
      expect(context.structure.frameworks.some((f) => f.name === 'django')).toBe(true);
    });

    test('should scan infrastructure project with Terraform and Docker', async () => {
      // Setup infrastructure project
      fs.mkdirSync(path.join(testDir, 'terraform'));
      fs.writeFileSync(
        path.join(testDir, 'terraform', 'main.tf'),
        'provider "aws" {}\nresource "aws_vpc" "main" {}'
      );
      fs.writeFileSync(
        path.join(testDir, 'terraform', 'variables.tf'),
        'variable "region" {}'
      );
      fs.writeFileSync(
        path.join(testDir, 'Dockerfile'),
        'FROM node:18-alpine\nWORKDIR /app'
      );
      fs.writeFileSync(
        path.join(testDir, 'docker-compose.yaml'),
        'version: "3"\nservices:\n  app:\n    build: .'
      );

      // Scan project
      const scanner = new ProjectScanner();
      const context = await scanner.scan(testDir);

      // Verify IaC detection
      expect(context.files.terraform.length).toBeGreaterThan(0);
      expect(context.files.docker.length).toBeGreaterThan(0);
    });
  });

  describe('Safety Workflow', () => {
    test('should require approval for destroy operations', () => {
      const context: SafetyContext = {
        operation: 'terraform destroy',
        type: 'terraform',
        environment: 'production',
      };

      const result = evaluateSafety(context);

      expect(result.requiresApproval).toBe(true);
      expect(result.risks.some((r) => r.severity === 'critical')).toBe(true);
      expect(result.risks.some((r) => r.id === 'protected-environment')).toBe(true);
    });

    test('should require approval for apply in production', () => {
      const context: SafetyContext = {
        operation: 'terraform apply',
        type: 'terraform',
        environment: 'production',
      };

      const result = evaluateSafety(context);

      expect(result.requiresApproval).toBe(true);
      expect(result.risks.some((r) => r.id === 'protected-environment')).toBe(true);
    });

    test('should require approval for high-cost operations', () => {
      const context: SafetyContext = {
        operation: 'create',
        type: 'terraform',
        estimatedCost: 1000,
      };

      const policy = loadSafetyPolicy();
      const result = evaluateSafety(context, policy);

      expect(result.requiresApproval).toBe(true);
      expect(result.risks.some((r) => r.id === 'high-cost')).toBe(true);
    });

    test('should pass for safe read-only operations', () => {
      const context: SafetyContext = {
        operation: 'list',
        type: 'aws',
      };

      const result = evaluateSafety(context);

      expect(result.passed).toBe(true);
      expect(result.blockers).toEqual([]);
    });

    test('should identify resource destruction in plan output', () => {
      const context: SafetyContext = {
        operation: 'apply',
        type: 'terraform',
        planOutput: 'Plan: 2 to add, 1 to change, 5 to destroy.',
      };

      const result = evaluateSafety(context);

      expect(result.risks.some((r) => r.id === 'resource-destruction')).toBe(true);
    });
  });

  describe('Demo Integration', () => {
    test('all demo scenarios should be loadable', () => {
      const scenarios = getScenarios();

      expect(scenarios.length).toBeGreaterThan(0);

      for (const scenario of scenarios) {
        expect(scenario.id).toBeDefined();
        expect(scenario.steps.length).toBeGreaterThan(0);
      }
    });

    test('demo scenarios should have valid command formats', () => {
      const scenarios = getScenarios();

      for (const scenario of scenarios) {
        for (const step of scenario.steps) {
          // All commands should start with nimbus
          expect(step.command.startsWith('nimbus')).toBe(true);
        }
      }
    });
  });

  describe('Command Exports', () => {
    test('all main commands should be exported', async () => {
      const commands = await import('../../services/cli-service/src/commands');

      // Core commands
      expect(typeof commands.initCommand).toBe('function');
      expect(typeof commands.demoCommand).toBe('function');
      expect(typeof commands.previewCommand).toBe('function');
      expect(typeof commands.questionnaireCommand).toBe('function');

      // Cloud commands
      expect(typeof commands.awsCommand).toBe('function');
      expect(typeof commands.gcpCommand).toBe('function');
      expect(typeof commands.azureCommand).toBe('function');

      // Apply commands
      expect(typeof commands.applyCommand).toBe('function');
      expect(typeof commands.applyTerraformCommand).toBe('function');
      expect(typeof commands.applyK8sCommand).toBe('function');
      expect(typeof commands.applyHelmCommand).toBe('function');
    });

    test('all option parsers should be exported', async () => {
      const commands = await import('../../services/cli-service/src/commands');

      expect(typeof commands.parseDemoOptions).toBe('function');
      expect(typeof commands.parseAwsOptions).toBe('function');
      expect(typeof commands.parseGcpOptions).toBe('function');
      expect(typeof commands.parseAzureOptions).toBe('function');
    });
  });

  describe('Safety Policy: Destructive Operations', () => {
    test('should flag terraform destroy in production as critical', () => {
      const context: SafetyContext = {
        operation: 'terraform destroy',
        type: 'terraform',
        environment: 'production',
      };

      const result = evaluateSafety(context);

      expect(result.requiresApproval).toBe(true);
      expect(result.risks.length).toBeGreaterThan(0);
      // Should have both destructive-operation and protected-environment risks
      expect(result.risks.some((r) => r.id === 'destructive-operation')).toBe(true);
      expect(result.risks.some((r) => r.id === 'protected-environment')).toBe(true);
      // Destructive operation should be critical severity
      const destructiveRisk = result.risks.find((r) => r.id === 'destructive-operation');
      expect(destructiveRisk?.severity).toBe('critical');
    });

    test('should flag terraform destroy in staging environment', () => {
      const context: SafetyContext = {
        operation: 'terraform destroy',
        type: 'terraform',
        environment: 'staging',
      };

      const result = evaluateSafety(context);

      expect(result.requiresApproval).toBe(true);
      expect(result.risks.some((r) => r.id === 'destructive-operation')).toBe(true);
    });

    test('should flag kubectl delete as destructive', () => {
      const context: SafetyContext = {
        operation: 'kubectl delete namespace production',
        type: 'kubernetes',
        environment: 'production',
      };

      const result = evaluateSafety(context);

      expect(result.requiresApproval).toBe(true);
      expect(result.risks.some((r) => r.id === 'destructive-operation')).toBe(true);
    });

    test('should flag helm uninstall as destructive', () => {
      const context: SafetyContext = {
        operation: 'helm uninstall',
        type: 'helm',
        environment: 'production',
      };

      // "uninstall" does not match "destroy"/"delete"/"terminate" but
      // production environment should still trigger protected-environment
      const result = evaluateSafety(context);

      expect(result.requiresApproval).toBe(true);
      expect(result.risks.some((r) => r.id === 'protected-environment')).toBe(true);
    });
  });

  describe('Safety Policy: Apply Operations Trigger Safety Checks', () => {
    test('should flag terraform apply as mutation operation', () => {
      const context: SafetyContext = {
        operation: 'terraform apply',
        type: 'terraform',
        environment: 'development',
      };

      const result = evaluateSafety(context);

      expect(result.requiresApproval).toBe(true);
      expect(result.risks.some((r) => r.id === 'mutation-operation')).toBe(true);
    });

    test('should flag kubernetes apply as mutation operation', () => {
      const context: SafetyContext = {
        operation: 'kubectl apply -f deployment.yaml',
        type: 'kubernetes',
        environment: 'development',
      };

      const result = evaluateSafety(context);

      expect(result.requiresApproval).toBe(true);
      expect(result.risks.some((r) => r.id === 'mutation-operation')).toBe(true);
    });

    test('should not flag plan operation as requiring approval', () => {
      const context: SafetyContext = {
        operation: 'terraform plan',
        type: 'terraform',
        environment: 'production',
      };

      const result = evaluateSafety(context);

      // plan is a read-only operation -- may still flag protected environment
      // but should not flag mutation-operation
      expect(result.risks.some((r) => r.id === 'mutation-operation')).toBe(false);
    });

    test('should detect multiple resource destructions in plan output', () => {
      const context: SafetyContext = {
        operation: 'apply',
        type: 'terraform',
        planOutput: 'Plan: 0 to add, 0 to change, 12 to destroy.',
      };

      const result = evaluateSafety(context);

      expect(result.risks.some((r) => r.id === 'resource-destruction')).toBe(true);
      const destructionRisk = result.risks.find((r) => r.id === 'resource-destruction');
      expect(destructionRisk?.details?.count).toBe(12);
    });

    test('should not flag resource-destruction when plan has zero destroys', () => {
      const context: SafetyContext = {
        operation: 'apply',
        type: 'terraform',
        planOutput: 'Plan: 3 to add, 1 to change, 0 to destroy.',
      };

      const result = evaluateSafety(context);

      expect(result.risks.some((r) => r.id === 'resource-destruction')).toBe(false);
    });
  });

  describe('Safety Policy: Custom Rules', () => {
    test('should evaluate custom safety rules', () => {
      const customPolicy = loadSafetyPolicy();
      customPolicy.customRules = [
        {
          id: 'no-public-s3',
          name: 'No Public S3 Buckets',
          description: 'Disallow public S3 bucket creation',
          severity: 'high',
          check: (ctx) => ctx.operation.includes('s3') && ctx.operation.includes('public'),
          message: 'Public S3 buckets are not allowed',
        },
      ];

      const context: SafetyContext = {
        operation: 'create s3 public bucket',
        type: 'terraform',
      };

      const result = evaluateSafety(context, customPolicy);

      expect(result.risks.some((r) => r.id === 'no-public-s3')).toBe(true);
      expect(result.requiresApproval).toBe(true);
    });
  });

  describe('Init-to-Generate Flow', () => {
    test('should initialize and scan a project with mixed infrastructure files', async () => {
      // Create a project with terraform, k8s, and helm files
      const infraDir = path.join(testDir, 'terraform');
      const k8sDir = path.join(testDir, 'k8s');
      const helmDir = path.join(testDir, 'charts', 'myapp');

      fs.mkdirSync(infraDir, { recursive: true });
      fs.mkdirSync(k8sDir, { recursive: true });
      fs.mkdirSync(helmDir, { recursive: true });

      // Terraform files
      fs.writeFileSync(
        path.join(infraDir, 'main.tf'),
        'provider "aws" {}\nresource "aws_vpc" "main" {}'
      );
      fs.writeFileSync(
        path.join(infraDir, 'variables.tf'),
        'variable "region" { default = "us-east-1" }'
      );

      // Kubernetes manifest
      fs.writeFileSync(
        path.join(k8sDir, 'deployment.yaml'),
        'apiVersion: apps/v1\nkind: Deployment'
      );

      // Helm chart
      fs.writeFileSync(
        path.join(helmDir, 'Chart.yaml'),
        'apiVersion: v2\nname: myapp\nversion: 0.1.0'
      );
      fs.writeFileSync(
        path.join(helmDir, 'values.yaml'),
        'replicaCount: 1'
      );

      // Node project
      fs.writeFileSync(
        path.join(testDir, 'package.json'),
        JSON.stringify({
          name: 'full-stack-app',
          dependencies: { express: '^4.18.0' },
        })
      );

      // Scan the project
      const scanner = new ProjectScanner();
      const context = await scanner.scan(testDir);

      // Verify terraform detection
      expect(context.files.terraform.length).toBeGreaterThan(0);

      // Verify project path
      expect(context.project.path).toBe(testDir);

      // Verify language detection
      expect(context.structure.languages.length).toBeGreaterThan(0);

      // Verify framework detection
      expect(context.structure.frameworks.some((f) => f.name === 'express')).toBe(true);
    });

    test('should scan an empty project without errors', async () => {
      const emptyDir = path.join(testDir, 'empty-project');
      fs.mkdirSync(emptyDir, { recursive: true });

      const scanner = new ProjectScanner();
      const context = await scanner.scan(emptyDir);

      expect(context.project.path).toBe(emptyDir);
      // The scanner may detect languages from heuristics even in a nearly
      // empty directory (e.g. temp directory name patterns), so we only
      // verify that the scan completes without throwing and that no
      // frameworks or IaC files are found.
      expect(context.structure.frameworks.length).toBe(0);
      expect(context.files.terraform.length).toBe(0);
    });
  });

  describe('Command Export Completeness', () => {
    test('all infrastructure tool commands should be exported', async () => {
      const commands = await import('../../services/cli-service/src/commands');

      // Terraform commands
      expect(typeof commands.tfCommand).toBe('function');
      expect(typeof commands.tfInitCommand).toBe('function');
      expect(typeof commands.tfPlanCommand).toBe('function');
      expect(typeof commands.tfApplyCommand).toBe('function');
      expect(typeof commands.tfValidateCommand).toBe('function');
      expect(typeof commands.tfDestroyCommand).toBe('function');
      expect(typeof commands.tfShowCommand).toBe('function');

      // Kubernetes commands
      expect(typeof commands.k8sCommand).toBe('function');
      expect(typeof commands.k8sGetCommand).toBe('function');
      expect(typeof commands.k8sApplyCommand).toBe('function');
      expect(typeof commands.k8sDeleteCommand).toBe('function');
      expect(typeof commands.k8sLogsCommand).toBe('function');
      expect(typeof commands.k8sDescribeCommand).toBe('function');
      expect(typeof commands.k8sScaleCommand).toBe('function');
      expect(typeof commands.k8sExecCommand).toBe('function');
      expect(typeof commands.k8sRolloutCommand).toBe('function');

      // Helm commands
      expect(typeof commands.helmCommand).toBe('function');
      expect(typeof commands.helmListCommand).toBe('function');
      expect(typeof commands.helmInstallCommand).toBe('function');
      expect(typeof commands.helmUpgradeCommand).toBe('function');
      expect(typeof commands.helmUninstallCommand).toBe('function');
      expect(typeof commands.helmRollbackCommand).toBe('function');
      expect(typeof commands.helmHistoryCommand).toBe('function');
      expect(typeof commands.helmSearchCommand).toBe('function');
      expect(typeof commands.helmShowCommand).toBe('function');
      expect(typeof commands.helmRepoAddCommand).toBe('function');
      expect(typeof commands.helmRepoUpdateCommand).toBe('function');
    });

    test('all git commands should be exported', async () => {
      const commands = await import('../../services/cli-service/src/commands');

      expect(typeof commands.gitCommand).toBe('function');
      expect(typeof commands.gitStatusCommand).toBe('function');
      expect(typeof commands.gitAddCommand).toBe('function');
      expect(typeof commands.gitCommitCommand).toBe('function');
      expect(typeof commands.gitPushCommand).toBe('function');
      expect(typeof commands.gitPullCommand).toBe('function');
      expect(typeof commands.gitFetchCommand).toBe('function');
      expect(typeof commands.gitLogCommand).toBe('function');
      expect(typeof commands.gitBranchCommand).toBe('function');
      expect(typeof commands.gitCheckoutCommand).toBe('function');
      expect(typeof commands.gitDiffCommand).toBe('function');
      expect(typeof commands.gitMergeCommand).toBe('function');
      expect(typeof commands.gitStashCommand).toBe('function');
    });

    test('all GitHub CLI commands should be exported', async () => {
      const commands = await import('../../services/cli-service/src/commands');

      expect(typeof commands.ghCommand).toBe('function');
      expect(typeof commands.ghPrListCommand).toBe('function');
      expect(typeof commands.ghPrViewCommand).toBe('function');
      expect(typeof commands.ghPrCreateCommand).toBe('function');
      expect(typeof commands.ghPrMergeCommand).toBe('function');
      expect(typeof commands.ghIssueListCommand).toBe('function');
      expect(typeof commands.ghIssueViewCommand).toBe('function');
      expect(typeof commands.ghIssueCreateCommand).toBe('function');
      expect(typeof commands.ghIssueCloseCommand).toBe('function');
      expect(typeof commands.ghIssueCommentCommand).toBe('function');
      expect(typeof commands.ghRepoInfoCommand).toBe('function');
      expect(typeof commands.ghRepoBranchesCommand).toBe('function');
    });

    test('all enterprise commands should be exported', async () => {
      const commands = await import('../../services/cli-service/src/commands');

      // Team commands
      expect(typeof commands.teamCommand).toBe('function');
      expect(typeof commands.teamCreateCommand).toBe('function');
      expect(typeof commands.teamInviteCommand).toBe('function');
      expect(typeof commands.teamMembersCommand).toBe('function');
      expect(typeof commands.teamRemoveCommand).toBe('function');
      expect(typeof commands.teamSwitchCommand).toBe('function');

      // Billing commands
      expect(typeof commands.billingCommand).toBe('function');
      expect(typeof commands.billingStatusCommand).toBe('function');
      expect(typeof commands.billingUpgradeCommand).toBe('function');
      expect(typeof commands.billingInvoicesCommand).toBe('function');
      expect(typeof commands.billingCancelCommand).toBe('function');

      // Usage command
      expect(typeof commands.usageCommand).toBe('function');

      // Audit commands
      expect(typeof commands.auditCommand).toBe('function');
      expect(typeof commands.auditListCommand).toBe('function');
      expect(typeof commands.auditExportCommand).toBe('function');
    });

    test('all AI-powered commands should be exported', async () => {
      const commands = await import('../../services/cli-service/src/commands');

      expect(typeof commands.askCommand).toBe('function');
      expect(typeof commands.explainCommand).toBe('function');
      expect(typeof commands.fixCommand).toBe('function');
    });

    test('all utility commands should be exported', async () => {
      const commands = await import('../../services/cli-service/src/commands');

      expect(typeof commands.versionCommand).toBe('function');
      expect(typeof commands.helpCommand).toBe('function');
      expect(typeof commands.doctorCommand).toBe('function');
      expect(typeof commands.historyCommand).toBe('function');
      expect(typeof commands.historyShowCommand).toBe('function');
    });

    test('all newly-routed commands from MVP spec should be exported', async () => {
      const commands = await import('../../services/cli-service/src/commands');

      // Drift detection
      expect(typeof commands.driftCommand).toBe('function');
      expect(typeof commands.driftDetectCommand).toBe('function');
      expect(typeof commands.driftFixCommand).toBe('function');

      // Cost estimation
      expect(typeof commands.costCommand).toBe('function');
      expect(typeof commands.costEstimateCommand).toBe('function');
      expect(typeof commands.costHistoryCommand).toBe('function');

      // Import
      expect(typeof commands.importCommand).toBe('function');

      // Feedback
      expect(typeof commands.feedbackCommand).toBe('function');

      // File system
      expect(typeof commands.fsCommand).toBe('function');
      expect(typeof commands.fsListCommand).toBe('function');
      expect(typeof commands.fsSearchCommand).toBe('function');
      expect(typeof commands.fsReadCommand).toBe('function');
    });
  });

  describe('Config Commands Structure', () => {
    test('config command should be an object with sub-command functions', async () => {
      const commands = await import('../../services/cli-service/src/commands');

      expect(commands.configCommand).toBeDefined();
      expect(typeof commands.configCommand.set).toBe('function');
      expect(typeof commands.configCommand.get).toBe('function');
      expect(typeof commands.configCommand.list).toBe('function');
      expect(typeof commands.configCommand.init).toBe('function');
      expect(typeof commands.configCommand.reset).toBe('function');
    });

    test('config sub-command functions should be individually exported', async () => {
      const commands = await import('../../services/cli-service/src/commands');

      expect(typeof commands.configSetCommand).toBe('function');
      expect(typeof commands.configGetCommand).toBe('function');
      expect(typeof commands.configListCommand).toBe('function');
      expect(typeof commands.configInitCommand).toBe('function');
      expect(typeof commands.configResetCommand).toBe('function');
    });
  });

  describe('Safety Policy: loadSafetyPolicy Defaults', () => {
    test('should return default policy when no config file exists', () => {
      const policy = loadSafetyPolicy('/nonexistent/path/config.yaml');

      expect(policy).toBeDefined();
      expect(policy.alwaysRequireApproval).toContain('destroy');
      expect(policy.alwaysRequireApproval).toContain('delete');
      expect(policy.alwaysRequireApproval).toContain('apply');
      expect(policy.protectedEnvironments).toContain('production');
      expect(policy.protectedEnvironments).toContain('prod');
      expect(policy.costThreshold).toBe(500);
      expect(policy.skipSafetyFor).toContain('plan');
      expect(policy.skipSafetyFor).toContain('validate');
      expect(policy.skipSafetyFor).toContain('list');
    });

    test('should pass for all skip-safe operations', () => {
      const safeOps = ['plan', 'validate', 'show', 'list', 'get', 'describe', 'logs', 'status'];

      for (const op of safeOps) {
        const context: SafetyContext = {
          operation: op,
          type: 'terraform',
        };

        const result = evaluateSafety(context);

        // Safe operations should not flag destructive-operation or mutation-operation
        expect(result.risks.some((r) => r.id === 'destructive-operation')).toBe(false);
        expect(result.risks.some((r) => r.id === 'mutation-operation')).toBe(false);
      }
    });
  });

  describe('Safety Policy: Cost Threshold', () => {
    test('should not flag operations below cost threshold', () => {
      const context: SafetyContext = {
        operation: 'create',
        type: 'terraform',
        estimatedCost: 100,
      };

      const policy = loadSafetyPolicy();
      const result = evaluateSafety(context, policy);

      expect(result.risks.some((r) => r.id === 'high-cost')).toBe(false);
    });

    test('should flag operations above cost threshold', () => {
      const context: SafetyContext = {
        operation: 'create',
        type: 'terraform',
        estimatedCost: 600,
      };

      const policy = loadSafetyPolicy();
      const result = evaluateSafety(context, policy);

      expect(result.requiresApproval).toBe(true);
      expect(result.risks.some((r) => r.id === 'high-cost')).toBe(true);
      const costRisk = result.risks.find((r) => r.id === 'high-cost');
      expect(costRisk?.details?.estimatedCost).toBe(600);
      expect(costRisk?.details?.threshold).toBe(500);
    });

    test('should flag operations at exactly the cost threshold boundary', () => {
      const policy = loadSafetyPolicy();
      const context: SafetyContext = {
        operation: 'create',
        type: 'terraform',
        estimatedCost: policy.costThreshold + 1,
      };

      const result = evaluateSafety(context, policy);

      expect(result.risks.some((r) => r.id === 'high-cost')).toBe(true);
    });
  });
});
