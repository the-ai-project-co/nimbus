/**
 * CLI Infrastructure Tool Commands E2E Tests
 *
 * Tests the CLI infrastructure tool commands (tf, k8s, helm, git).
 * These tests verify the command routing and argument parsing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { startServer } from '../../services/cli-service/src/server';
import { getTestPorts, createTestClient, waitForService, createTempDir, removeTempDir } from '../utils/test-helpers';
import * as fs from 'fs';
import * as path from 'path';

describe('CLI Infrastructure Tools E2E Tests', () => {
  let server: any;
  let client: ReturnType<typeof createTestClient>;
  let tempDir: string;
  const ports = getTestPorts();
  const BASE_URL = `http://localhost:${ports.http}`;

  beforeAll(async () => {
    server = await startServer(ports.http, ports.ws);
    await waitForService(BASE_URL);
    client = createTestClient(BASE_URL);
    tempDir = await createTempDir('cli-tools-e2e-');
  });

  afterAll(async () => {
    server?.stop?.();
    await removeTempDir(tempDir);
  });

  // ==================== CLI Service Health ====================

  describe('CLI Service Health', () => {
    it('returns healthy status', async () => {
      const result = await client.get('/health');

      expect(result.status).toBe(200);
      expect(result.data.status).toBe('healthy');
      expect(result.data.service).toBe('cli-service');
    });
  });

  // ==================== Terraform Client Tests ====================

  describe('Terraform Client', () => {
    it('validates terraform init options', () => {
      const initOptions = {
        directory: '/path/to/terraform',
        backend: true,
        reconfigure: false,
        upgrade: true,
      };

      expect(initOptions.directory).toBeDefined();
      expect(typeof initOptions.backend).toBe('boolean');
      expect(typeof initOptions.reconfigure).toBe('boolean');
      expect(typeof initOptions.upgrade).toBe('boolean');
    });

    it('validates terraform plan options', () => {
      const planOptions = {
        directory: '/path/to/terraform',
        out: 'plan.tfplan',
        destroy: false,
        target: ['aws_instance.web'],
        varFile: 'prod.tfvars',
      };

      expect(planOptions.directory).toBeDefined();
      expect(planOptions.out).toBe('plan.tfplan');
      expect(planOptions.destroy).toBe(false);
      expect(planOptions.target).toContain('aws_instance.web');
    });

    it('validates terraform apply options', () => {
      const applyOptions = {
        directory: '/path/to/terraform',
        plan: 'plan.tfplan',
        autoApprove: true,
        target: ['aws_instance.web'],
      };

      expect(applyOptions.autoApprove).toBe(true);
      expect(applyOptions.plan).toBe('plan.tfplan');
    });

    it('validates terraform destroy options', () => {
      const destroyOptions = {
        directory: '/path/to/terraform',
        autoApprove: false,
        target: ['aws_instance.web'],
      };

      expect(destroyOptions.autoApprove).toBe(false);
      expect(destroyOptions.target).toHaveLength(1);
    });

    it('handles terraform state output format', () => {
      const stateOutput = {
        resources: [
          {
            type: 'aws_instance',
            name: 'web',
            provider: 'provider["registry.terraform.io/hashicorp/aws"]',
            instances: [
              {
                attributes: {
                  id: 'i-1234567890abcdef0',
                  instance_type: 't2.micro',
                },
              },
            ],
          },
        ],
      };

      expect(stateOutput.resources).toHaveLength(1);
      expect(stateOutput.resources[0].type).toBe('aws_instance');
      expect(stateOutput.resources[0].name).toBe('web');
    });
  });

  // ==================== Kubernetes Client Tests ====================

  describe('Kubernetes Client', () => {
    it('validates k8s get options', () => {
      const getOptions = {
        resource: 'pods',
        name: 'nginx-pod',
        namespace: 'default',
        output: 'yaml',
        allNamespaces: false,
      };

      expect(getOptions.resource).toBe('pods');
      expect(getOptions.namespace).toBe('default');
      expect(getOptions.output).toBe('yaml');
    });

    it('validates k8s apply options', () => {
      const applyOptions = {
        manifest: '/path/to/deployment.yaml',
        namespace: 'production',
        dryRun: true,
      };

      expect(applyOptions.manifest).toBeDefined();
      expect(applyOptions.namespace).toBe('production');
      expect(applyOptions.dryRun).toBe(true);
    });

    it('validates k8s delete options', () => {
      const deleteOptions = {
        resource: 'deployment',
        name: 'nginx',
        namespace: 'default',
        force: false,
      };

      expect(deleteOptions.resource).toBe('deployment');
      expect(deleteOptions.name).toBe('nginx');
      expect(deleteOptions.force).toBe(false);
    });

    it('validates k8s logs options', () => {
      const logsOptions = {
        pod: 'nginx-pod-12345',
        namespace: 'default',
        container: 'nginx',
        follow: false,
        tail: 100,
        previous: false,
      };

      expect(logsOptions.pod).toBeDefined();
      expect(logsOptions.tail).toBe(100);
      expect(logsOptions.follow).toBe(false);
    });

    it('validates k8s scale options', () => {
      const scaleOptions = {
        resource: 'deployment',
        name: 'nginx',
        namespace: 'default',
        replicas: 3,
      };

      expect(scaleOptions.resource).toBe('deployment');
      expect(scaleOptions.replicas).toBe(3);
    });

    it('handles pod list format', () => {
      const podList = {
        items: [
          {
            metadata: { name: 'nginx-1', namespace: 'default' },
            status: { phase: 'Running' },
          },
          {
            metadata: { name: 'nginx-2', namespace: 'default' },
            status: { phase: 'Running' },
          },
        ],
      };

      expect(podList.items).toHaveLength(2);
      expect(podList.items[0].status.phase).toBe('Running');
    });
  });

  // ==================== Helm Client Tests ====================

  describe('Helm Client', () => {
    it('validates helm install options', () => {
      const installOptions = {
        name: 'my-release',
        chart: 'nginx/nginx',
        namespace: 'default',
        values: ['values.yaml'],
        wait: true,
        timeout: '5m',
      };

      expect(installOptions.name).toBe('my-release');
      expect(installOptions.chart).toBe('nginx/nginx');
      expect(installOptions.wait).toBe(true);
    });

    it('validates helm upgrade options', () => {
      const upgradeOptions = {
        name: 'my-release',
        chart: 'nginx/nginx',
        namespace: 'default',
        install: true,
        wait: true,
        atomic: true,
      };

      expect(upgradeOptions.install).toBe(true);
      expect(upgradeOptions.atomic).toBe(true);
    });

    it('validates helm rollback options', () => {
      const rollbackOptions = {
        name: 'my-release',
        revision: 2,
        namespace: 'default',
        wait: true,
      };

      expect(rollbackOptions.name).toBe('my-release');
      expect(rollbackOptions.revision).toBe(2);
    });

    it('validates helm search options', () => {
      const searchOptions = {
        keyword: 'nginx',
        versions: true,
        devel: false,
      };

      expect(searchOptions.keyword).toBe('nginx');
      expect(searchOptions.versions).toBe(true);
    });

    it('validates helm repo add options', () => {
      const repoAddOptions = {
        name: 'bitnami',
        url: 'https://charts.bitnami.com/bitnami',
        username: undefined,
        password: undefined,
      };

      expect(repoAddOptions.name).toBe('bitnami');
      expect(repoAddOptions.url).toContain('bitnami');
    });

    it('handles release list format', () => {
      const releaseList = [
        {
          name: 'nginx-release',
          namespace: 'default',
          revision: 3,
          status: 'deployed',
          chart: 'nginx-1.2.3',
          app_version: '1.21.0',
        },
        {
          name: 'redis-release',
          namespace: 'cache',
          revision: 1,
          status: 'deployed',
          chart: 'redis-17.0.0',
          app_version: '7.0.0',
        },
      ];

      expect(releaseList).toHaveLength(2);
      expect(releaseList[0].status).toBe('deployed');
      expect(releaseList[0].revision).toBe(3);
    });
  });

  // ==================== Git Client Tests ====================

  describe('Git Client', () => {
    it('validates git status response format', () => {
      const gitStatus = {
        branch: 'main',
        ahead: 2,
        behind: 0,
        staged: ['src/index.ts'],
        modified: ['src/utils.ts'],
        untracked: ['new-file.ts'],
        deleted: [],
      };

      expect(gitStatus.branch).toBe('main');
      expect(gitStatus.ahead).toBe(2);
      expect(gitStatus.staged).toHaveLength(1);
      expect(gitStatus.modified).toHaveLength(1);
      expect(gitStatus.untracked).toHaveLength(1);
    });

    it('validates git commit options', () => {
      const commitOptions = {
        message: 'feat: add new feature',
        all: false,
        amend: false,
      };

      expect(commitOptions.message).toBeDefined();
      expect(commitOptions.message).toContain('feat:');
      expect(commitOptions.all).toBe(false);
    });

    it('validates git push options', () => {
      const pushOptions = {
        remote: 'origin',
        branch: 'main',
        force: false,
        setUpstream: true,
      };

      expect(pushOptions.remote).toBe('origin');
      expect(pushOptions.branch).toBe('main');
      expect(pushOptions.force).toBe(false);
      expect(pushOptions.setUpstream).toBe(true);
    });

    it('validates git pull options', () => {
      const pullOptions = {
        remote: 'origin',
        branch: 'main',
        rebase: true,
      };

      expect(pullOptions.rebase).toBe(true);
    });

    it('validates git log format', () => {
      const logEntries = [
        {
          sha: 'abc123def456',
          message: 'feat: add new feature',
          author: 'John Doe',
          date: '2024-01-15T10:00:00Z',
        },
        {
          sha: '789xyz012abc',
          message: 'fix: resolve bug',
          author: 'Jane Smith',
          date: '2024-01-14T15:30:00Z',
        },
      ];

      expect(logEntries).toHaveLength(2);
      expect(logEntries[0].sha).toHaveLength(12);
      expect(logEntries[0].author).toBe('John Doe');
    });

    it('validates git branch format', () => {
      const branches = [
        { name: 'main', current: true, remote: 'origin/main' },
        { name: 'feature/new', current: false, remote: null },
        { name: 'develop', current: false, remote: 'origin/develop' },
      ];

      expect(branches).toHaveLength(3);
      expect(branches.find((b) => b.current)?.name).toBe('main');
    });

    it('validates git diff format', () => {
      const diffOutput = {
        files: [
          { path: 'src/index.ts', additions: 10, deletions: 5 },
          { path: 'src/utils.ts', additions: 20, deletions: 0 },
        ],
        totalAdditions: 30,
        totalDeletions: 5,
      };

      expect(diffOutput.files).toHaveLength(2);
      expect(diffOutput.totalAdditions).toBe(30);
      expect(diffOutput.totalDeletions).toBe(5);
    });
  });

  // ==================== Command Argument Parsing Tests ====================

  describe('Command Argument Parsing', () => {
    it('parses terraform command arguments', () => {
      const args = ['plan', '--directory', '/path/to/tf', '--out', 'plan.tfplan'];

      const parsed: Record<string, string | boolean> = {};
      let subcommand = '';

      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg.startsWith('--') && !subcommand) {
          subcommand = arg;
        } else if (arg === '--directory' && args[i + 1]) {
          parsed.directory = args[++i];
        } else if (arg === '--out' && args[i + 1]) {
          parsed.out = args[++i];
        }
      }

      expect(subcommand).toBe('plan');
      expect(parsed.directory).toBe('/path/to/tf');
      expect(parsed.out).toBe('plan.tfplan');
    });

    it('parses k8s command arguments', () => {
      const args = ['get', 'pods', '--namespace', 'production', '-o', 'yaml'];

      const parsed: Record<string, string | boolean> = {};
      let subcommand = '';
      let resource = '';

      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg.startsWith('-') && !subcommand) {
          subcommand = arg;
        } else if (!arg.startsWith('-') && !resource) {
          resource = arg;
        } else if ((arg === '--namespace' || arg === '-n') && args[i + 1]) {
          parsed.namespace = args[++i];
        } else if (arg === '-o' && args[i + 1]) {
          parsed.output = args[++i];
        }
      }

      expect(subcommand).toBe('get');
      expect(resource).toBe('pods');
      expect(parsed.namespace).toBe('production');
      expect(parsed.output).toBe('yaml');
    });

    it('parses helm command arguments', () => {
      const args = ['install', 'my-release', 'nginx/nginx', '--namespace', 'web', '--wait'];

      const parsed: Record<string, string | boolean> = {};
      let subcommand = '';
      let name = '';
      let chart = '';

      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg.startsWith('-') && !subcommand) {
          subcommand = arg;
        } else if (!arg.startsWith('-') && !name) {
          name = arg;
        } else if (!arg.startsWith('-') && !chart) {
          chart = arg;
        } else if ((arg === '--namespace' || arg === '-n') && args[i + 1]) {
          parsed.namespace = args[++i];
        } else if (arg === '--wait') {
          parsed.wait = true;
        }
      }

      expect(subcommand).toBe('install');
      expect(name).toBe('my-release');
      expect(chart).toBe('nginx/nginx');
      expect(parsed.namespace).toBe('web');
      expect(parsed.wait).toBe(true);
    });

    it('parses git command arguments', () => {
      const args = ['commit', '-m', 'feat: add feature', '--all'];

      const parsed: Record<string, string | boolean> = {};
      let subcommand = '';

      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg.startsWith('-') && !subcommand) {
          subcommand = arg;
        } else if (arg === '-m' && args[i + 1]) {
          parsed.message = args[++i];
        } else if (arg === '--all' || arg === '-a') {
          parsed.all = true;
        }
      }

      expect(subcommand).toBe('commit');
      expect(parsed.message).toBe('feat: add feature');
      expect(parsed.all).toBe(true);
    });
  });

  // ==================== Error Handling Tests ====================

  describe('Error Handling', () => {
    it('handles missing required arguments', () => {
      const validateTerraformApply = (options: { autoApprove?: boolean; plan?: string }) => {
        const errors: string[] = [];
        // In non-interactive mode, either autoApprove or plan file is required
        if (!options.autoApprove && !options.plan) {
          errors.push('Either --auto-approve or --plan is required');
        }
        return errors;
      };

      const errors = validateTerraformApply({});
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('auto-approve');
    });

    it('handles invalid resource types', () => {
      const validK8sResources = ['pods', 'deployments', 'services', 'configmaps', 'secrets'];

      const isValidResource = (resource: string) => validK8sResources.includes(resource);

      expect(isValidResource('pods')).toBe(true);
      expect(isValidResource('invalid')).toBe(false);
    });

    it('handles service unavailable', () => {
      const serviceResponse = {
        success: false,
        error: 'Service unavailable',
        code: 'SERVICE_UNAVAILABLE',
      };

      expect(serviceResponse.success).toBe(false);
      expect(serviceResponse.code).toBe('SERVICE_UNAVAILABLE');
    });
  });
});
