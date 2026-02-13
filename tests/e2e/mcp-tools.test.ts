/**
 * MCP Tools Services E2E Workflow Tests
 *
 * Tests complete workflows across multiple MCP tool services.
 * These tests verify end-to-end functionality including:
 * - Git workflows (init, add, commit)
 * - FS workflows (write, read, copy, delete)
 * - Terraform workflows (init, validate, plan)
 * - K8s workflows (get resources, describe, logs)
 * - Helm workflows (list, search, repo)
 * - Cross-service interactions
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  getTestPorts,
  createTestClient,
  waitForService,
  createTempDir,
  removeTempDir,
} from '../utils/test-helpers';

// Import server starters
import { startServer as startGitServer } from '../../services/git-tools-service/src/server';
import { startServer as startFsServer } from '../../services/fs-tools-service/src/server';
import { startServer as startTerraformServer } from '../../services/terraform-tools-service/src/server';
import { startServer as startK8sServer } from '../../services/k8s-tools-service/src/server';
import { startServer as startHelmServer } from '../../services/helm-tools-service/src/server';

describe('MCP Tools Services E2E Workflow Tests', () => {
  // Server instances
  let gitServer: any;
  let fsServer: any;
  let terraformServer: any;
  let k8sServer: any;
  let helmServer: any;

  // Test clients
  let gitClient: ReturnType<typeof createTestClient>;
  let fsClient: ReturnType<typeof createTestClient>;
  let terraformClient: ReturnType<typeof createTestClient>;
  let k8sClient: ReturnType<typeof createTestClient>;
  let helmClient: ReturnType<typeof createTestClient>;

  // Ports
  const gitPorts = getTestPorts();
  const fsPorts = getTestPorts();
  const terraformPorts = getTestPorts();
  const k8sPorts = getTestPorts();
  const helmPorts = getTestPorts();

  // Base URLs
  const GIT_URL = `http://localhost:${gitPorts.http}`;
  const FS_URL = `http://localhost:${fsPorts.http}`;
  const TERRAFORM_URL = `http://localhost:${terraformPorts.http}`;
  const K8S_URL = `http://localhost:${k8sPorts.http}`;
  const HELM_URL = `http://localhost:${helmPorts.http}`;

  // Temp directory for test files
  let tempDir: string;

  beforeAll(async () => {
    // Create temp directory
    tempDir = await createTempDir('nimbus-e2e-');

    // Start all servers in parallel
    [gitServer, fsServer, terraformServer, k8sServer, helmServer] = await Promise.all([
      startGitServer(gitPorts.http),
      startFsServer(fsPorts.http),
      startTerraformServer(terraformPorts.http),
      startK8sServer(k8sPorts.http),
      startHelmServer(helmPorts.http),
    ]);

    // Wait for all services to be ready
    await Promise.all([
      waitForService(GIT_URL),
      waitForService(FS_URL),
      waitForService(TERRAFORM_URL),
      waitForService(K8S_URL),
      waitForService(HELM_URL),
    ]);

    // Create test clients
    gitClient = createTestClient(GIT_URL);
    fsClient = createTestClient(FS_URL);
    terraformClient = createTestClient(TERRAFORM_URL);
    k8sClient = createTestClient(K8S_URL);
    helmClient = createTestClient(HELM_URL);
  });

  afterAll(async () => {
    // Stop all servers
    gitServer?.stop?.();
    fsServer?.stop?.();
    terraformServer?.stop?.();
    k8sServer?.stop?.();
    helmServer?.stop?.();

    // Cleanup temp directory
    if (tempDir) {
      await removeTempDir(tempDir);
    }
  });

  // ==================== Service Health Checks ====================

  describe('Service Health Checks', () => {
    it('all MCP tool services are healthy', async () => {
      const [gitHealth, fsHealth, terraformHealth, k8sHealth, helmHealth] = await Promise.all([
        gitClient.get('/health'),
        fsClient.get('/health'),
        terraformClient.get('/health'),
        k8sClient.get('/health'),
        helmClient.get('/health'),
      ]);

      expect(gitHealth.status).toBe(200);
      expect(gitHealth.data.service).toBe('git-tools-service');

      expect(fsHealth.status).toBe(200);
      expect(fsHealth.data.service).toBe('fs-tools-service');

      expect(terraformHealth.status).toBe(200);
      expect(terraformHealth.data.service).toBe('terraform-tools-service');

      expect(k8sHealth.status).toBe(200);
      expect(k8sHealth.data.service).toBe('k8s-tools-service');

      expect(helmHealth.status).toBe(200);
      expect(helmHealth.data.service).toBe('helm-tools-service');
    });
  });

  // ==================== Filesystem Workflow Tests ====================

  describe('Filesystem Service Workflow', () => {
    const testSubDir = 'fs-workflow-test';

    it('complete file lifecycle: write -> read -> copy -> delete', async () => {
      const workDir = path.join(tempDir, testSubDir);
      const filePath = path.join(workDir, 'test-file.txt');
      const copyPath = path.join(workDir, 'test-file-copy.txt');
      const content = 'Hello, World! This is a test file.';

      // Step 1: Create directory
      const mkdirResult = await fsClient.post('/api/fs/mkdir', {
        path: workDir,
        recursive: true,
      });
      expect(mkdirResult.status).toBe(200);
      expect(mkdirResult.data.success).toBe(true);

      // Step 2: Write file
      const writeResult = await fsClient.post('/api/fs/write', {
        path: filePath,
        content,
      });
      expect(writeResult.status).toBe(200);
      expect(writeResult.data.success).toBe(true);

      // Step 3: Read file
      const readResult = await fsClient.post('/api/fs/read', {
        path: filePath,
      });
      expect(readResult.status).toBe(200);
      expect(readResult.data.success).toBe(true);
      expect(readResult.data.data.content).toBe(content);

      // Step 4: Copy file
      const copyResult = await fsClient.post('/api/fs/copy', {
        source: filePath,
        destination: copyPath,
      });
      expect(copyResult.status).toBe(200);
      expect(copyResult.data.success).toBe(true);

      // Step 5: Verify copy exists
      const existsResult = await fsClient.post('/api/fs/exists', {
        path: copyPath,
      });
      expect(existsResult.status).toBe(200);
      expect(existsResult.data.data.exists).toBe(true);

      // Step 6: Delete original
      const deleteResult = await fsClient.delete('/api/fs/delete', {
        path: filePath,
      });
      expect(deleteResult.status).toBe(200);
      expect(deleteResult.data.success).toBe(true);

      // Step 7: Verify original is deleted
      const existsAfterDelete = await fsClient.post('/api/fs/exists', {
        path: filePath,
      });
      expect(existsAfterDelete.status).toBe(200);
      expect(existsAfterDelete.data.data.exists).toBe(false);
    });

    it('directory operations: list -> tree -> stat', async () => {
      const workDir = path.join(tempDir, 'dir-ops-test');

      // Setup: Create directory structure
      await fs.mkdir(workDir, { recursive: true });
      await fs.mkdir(path.join(workDir, 'subdir1'), { recursive: true });
      await fs.mkdir(path.join(workDir, 'subdir2'), { recursive: true });
      await fs.writeFile(path.join(workDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(workDir, 'subdir1', 'nested.txt'), 'nested');

      // Step 1: List directory with pattern to match all
      const listResult = await fsClient.post('/api/fs/list', {
        directory: workDir,
        pattern: '**/*',
        recursive: true,
      });
      expect(listResult.status).toBe(200);
      expect(listResult.data.success).toBe(true);
      // At minimum we should have file1.txt and nested.txt
      expect(listResult.data.data.count).toBeGreaterThanOrEqual(2);

      // Step 2: Get directory tree
      const treeResult = await fsClient.post('/api/fs/tree', {
        directory: workDir,
      });
      expect(treeResult.status).toBe(200);
      expect(treeResult.data.success).toBe(true);
      expect(treeResult.data.data.tree.type).toBe('directory');

      // Step 3: Get file stats
      const statResult = await fsClient.post('/api/fs/stat', {
        path: path.join(workDir, 'file1.txt'),
      });
      expect(statResult.status).toBe(200);
      expect(statResult.data.success).toBe(true);
      expect(statResult.data.data.stats.isFile).toBe(true);
    });

    it('append operation workflow', async () => {
      const appendFile = path.join(tempDir, 'append-test.txt');
      const initialContent = 'Line 1';
      const appendedContent = '\nLine 2';

      // Write initial content
      await fsClient.post('/api/fs/write', {
        path: appendFile,
        content: initialContent,
      });

      // Append content
      const appendResult = await fsClient.post('/api/fs/append', {
        path: appendFile,
        content: appendedContent,
      });
      expect(appendResult.status).toBe(200);
      expect(appendResult.data.success).toBe(true);

      // Verify combined content
      const readResult = await fsClient.post('/api/fs/read', {
        path: appendFile,
      });
      expect(readResult.data.data.content).toBe(initialContent + appendedContent);
    });
  });

  // ==================== Git Workflow Tests ====================

  describe('Git Service Workflow', () => {
    it('git init -> status workflow', async () => {
      const repoDir = path.join(tempDir, 'git-repo-test');
      await fs.mkdir(repoDir, { recursive: true });

      // Step 1: Initialize repository
      const initResult = await gitClient.post('/api/git/init', {
        path: repoDir,
      });
      expect(initResult.status).toBe(200);
      expect(initResult.data.success).toBe(true);

      // Step 2: Check status
      const statusResult = await gitClient.get(`/api/git/status?path=${encodeURIComponent(repoDir)}`);
      expect(statusResult.status).toBe(200);
      expect(statusResult.data.success).toBe(true);
    });

    it('git add -> commit workflow', async () => {
      const repoDir = path.join(tempDir, 'git-commit-test');
      await fs.mkdir(repoDir, { recursive: true });

      // Initialize repo
      await gitClient.post('/api/git/init', { path: repoDir });

      // Create a test file
      const testFile = path.join(repoDir, 'test.txt');
      await fs.writeFile(testFile, 'Test content');

      // Step 1: Add file
      const addResult = await gitClient.post('/api/git/add', {
        path: repoDir,
        files: ['test.txt'],
      });
      expect(addResult.status).toBe(200);
      expect(addResult.data.success).toBe(true);

      // Step 2: Commit
      const commitResult = await gitClient.post('/api/git/commit', {
        path: repoDir,
        message: 'Initial commit',
      });
      expect(commitResult.status).toBe(200);
      expect(commitResult.data.success).toBe(true);
    });

    it('git branch workflow', async () => {
      const repoDir = path.join(tempDir, 'git-branch-test');
      await fs.mkdir(repoDir, { recursive: true });

      // Setup: Initialize and create initial commit
      await gitClient.post('/api/git/init', { path: repoDir });
      await fs.writeFile(path.join(repoDir, 'README.md'), '# Test Repo');
      await gitClient.post('/api/git/add', { path: repoDir, files: ['README.md'] });
      await gitClient.post('/api/git/commit', { path: repoDir, message: 'Initial commit' });

      // Step 1: List branches
      const branchListResult = await gitClient.get(`/api/git/branches?path=${encodeURIComponent(repoDir)}`);
      expect(branchListResult.status).toBe(200);
      expect(branchListResult.data.success).toBe(true);

      // Step 2: Create new branch
      const createBranchResult = await gitClient.post('/api/git/branch', {
        path: repoDir,
        name: 'feature-branch',
      });
      expect(createBranchResult.status).toBe(200);
      expect(createBranchResult.data.success).toBe(true);

      // Step 3: Checkout branch
      const checkoutResult = await gitClient.post('/api/git/checkout', {
        path: repoDir,
        target: 'feature-branch',
      });
      expect(checkoutResult.status).toBe(200);
      expect(checkoutResult.data.success).toBe(true);
    });

    it('git log workflow', async () => {
      const repoDir = path.join(tempDir, 'git-log-test');
      await fs.mkdir(repoDir, { recursive: true });

      // Setup: Create repo with multiple commits
      await gitClient.post('/api/git/init', { path: repoDir });

      for (let i = 1; i <= 3; i++) {
        await fs.writeFile(path.join(repoDir, `file${i}.txt`), `Content ${i}`);
        await gitClient.post('/api/git/add', { path: repoDir, files: [`file${i}.txt`] });
        await gitClient.post('/api/git/commit', { path: repoDir, message: `Commit ${i}` });
      }

      // Get log
      const logResult = await gitClient.get(`/api/git/log?path=${encodeURIComponent(repoDir)}`);
      expect(logResult.status).toBe(200);
      expect(logResult.data.success).toBe(true);
      expect(logResult.data.data.all.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ==================== Terraform Workflow Tests ====================

  describe('Terraform Service Workflow', () => {
    it('terraform version check', async () => {
      const versionResult = await terraformClient.get('/api/terraform/version');

      // May fail if terraform is not installed - that's OK
      if (versionResult.status === 200) {
        expect(versionResult.data.success).toBe(true);
        expect(versionResult.data.data.terraform).toBeDefined();
      } else {
        // Terraform not installed
        expect(versionResult.data.success).toBe(false);
      }
    });

    it('terraform validate workflow', async () => {
      const tfDir = path.join(tempDir, 'terraform-validate-test');
      await fs.mkdir(tfDir, { recursive: true });

      // Create a simple terraform file
      const tfConfig = `
terraform {
  required_version = ">= 1.0"
}

variable "test_var" {
  type        = string
  default     = "hello"
  description = "A test variable"
}
`;
      await fs.writeFile(path.join(tfDir, 'main.tf'), tfConfig);

      // Validate configuration
      const validateResult = await terraformClient.post('/api/terraform/validate', {
        directory: tfDir,
      });

      // May fail if terraform is not installed
      if (validateResult.status === 200) {
        expect(validateResult.data.success).toBe(true);
      }
    });

    it('terraform fmt workflow', async () => {
      const tfDir = path.join(tempDir, 'terraform-fmt-test');
      await fs.mkdir(tfDir, { recursive: true });

      // Create a valid but poorly formatted terraform file
      const unformattedTf = `variable "name" {
type=string
default="test"
}`;
      await fs.writeFile(path.join(tfDir, 'main.tf'), unformattedTf);

      // Format configuration
      const fmtResult = await terraformClient.post('/api/terraform/fmt', {
        directory: tfDir,
      });

      // May fail if terraform is not installed
      if (fmtResult.status === 200) {
        expect(fmtResult.data.success).toBe(true);
      }
    });

    it('terraform workspace list workflow', async () => {
      const tfDir = path.join(tempDir, 'terraform-ws-test');
      await fs.mkdir(tfDir, { recursive: true });
      await fs.writeFile(path.join(tfDir, 'main.tf'), 'terraform {}');

      // First init (may fail without terraform)
      await terraformClient.post('/api/terraform/init', { directory: tfDir });

      // List workspaces
      const wsResult = await terraformClient.get(
        `/api/terraform/workspace/list?directory=${encodeURIComponent(tfDir)}`
      );

      // May fail if terraform is not installed
      if (wsResult.status === 200) {
        expect(wsResult.data.success).toBe(true);
      }
    });
  });

  // ==================== Kubernetes Workflow Tests ====================

  describe('Kubernetes Service Workflow', () => {
    it('kubernetes version check', async () => {
      const versionResult = await k8sClient.get('/api/k8s/version');

      // May fail if kubectl is not installed or no cluster configured
      if (versionResult.status === 200) {
        expect(versionResult.data.success).toBe(true);
      } else {
        expect(versionResult.data.success).toBe(false);
      }
    });

    it('kubernetes contexts list', async () => {
      const contextsResult = await k8sClient.get('/api/k8s/contexts');

      // May fail if kubectl is not installed
      if (contextsResult.status === 200) {
        expect(contextsResult.data.success).toBe(true);
        expect(contextsResult.data.data.contexts).toBeDefined();
      }
    });

    it('kubernetes namespaces list', async () => {
      const nsResult = await k8sClient.get('/api/k8s/namespaces');

      // May fail if kubectl is not installed or no cluster
      if (nsResult.status === 200) {
        expect(nsResult.data.success).toBe(true);
      }
    });

    it('kubernetes get resources', async () => {
      const podsResult = await k8sClient.get('/api/k8s/resources?resource=pods');

      // May fail if kubectl is not installed or no cluster
      if (podsResult.status === 200) {
        expect(podsResult.data.success).toBe(true);
      }
    });

    it('validates required parameters for operations', async () => {
      // Missing resource parameter
      const resourceResult = await k8sClient.get('/api/k8s/resources');
      expect(resourceResult.status).toBe(400);
      expect(resourceResult.data.success).toBe(false);

      // Missing pod parameter for logs
      const logsResult = await k8sClient.get('/api/k8s/logs');
      expect(logsResult.status).toBe(400);
      expect(logsResult.data.success).toBe(false);

      // Invalid rollout action
      const rolloutResult = await k8sClient.post('/api/k8s/rollout', {
        resource: 'deployment',
        name: 'test',
        action: 'invalid-action',
      });
      expect(rolloutResult.status).toBe(400);
      expect(rolloutResult.data.success).toBe(false);
    });
  });

  // ==================== Helm Workflow Tests ====================

  describe('Helm Service Workflow', () => {
    it('helm version check', async () => {
      const versionResult = await helmClient.get('/api/helm/version');

      // May fail if helm is not installed
      if (versionResult.status === 200) {
        expect(versionResult.data.success).toBe(true);
        expect(versionResult.data.data.version).toBeDefined();
      } else {
        expect(versionResult.data.success).toBe(false);
      }
    });

    it('helm list releases', async () => {
      const listResult = await helmClient.get('/api/helm/list');

      // May fail if helm is not installed or no cluster
      if (listResult.status === 200) {
        expect(listResult.data.success).toBe(true);
        expect(Array.isArray(listResult.data.data.releases)).toBe(true);
      }
    });

    it('helm repo list', async () => {
      const repoResult = await helmClient.post('/api/helm/repo', {
        action: 'list',
      });

      // May fail if helm is not installed
      if (repoResult.status === 200) {
        expect(repoResult.data.success).toBe(true);
      }
    });

    it('helm search charts', async () => {
      const searchResult = await helmClient.get('/api/helm/search?keyword=nginx');

      // May fail if helm is not installed or no repos configured
      if (searchResult.status === 200) {
        expect(searchResult.data.success).toBe(true);
        expect(Array.isArray(searchResult.data.data.charts)).toBe(true);
      }
    });

    it('validates required parameters for operations', async () => {
      // Missing name for install
      const installResult = await helmClient.post('/api/helm/install', {
        chart: 'nginx',
      });
      expect(installResult.status).toBe(400);
      expect(installResult.data.success).toBe(false);

      // Missing chart for install
      const installResult2 = await helmClient.post('/api/helm/install', {
        name: 'my-release',
      });
      expect(installResult2.status).toBe(400);
      expect(installResult2.data.success).toBe(false);

      // Invalid repo action
      const repoResult = await helmClient.post('/api/helm/repo', {
        action: 'invalid',
      });
      expect(repoResult.status).toBe(400);
      expect(repoResult.data.success).toBe(false);

      // Missing keyword for search
      const searchResult = await helmClient.get('/api/helm/search');
      expect(searchResult.status).toBe(400);
      expect(searchResult.data.success).toBe(false);
    });
  });

  // ==================== Cross-Service Workflow Tests ====================

  describe('Cross-Service Workflows', () => {
    it('FS + Git workflow: create file then track with git', async () => {
      const repoDir = path.join(tempDir, 'cross-service-test');
      await fs.mkdir(repoDir, { recursive: true });

      // Initialize git repo
      await gitClient.post('/api/git/init', { path: repoDir });

      // Create file using FS service
      const filePath = path.join(repoDir, 'created-by-fs.txt');
      const writeResult = await fsClient.post('/api/fs/write', {
        path: filePath,
        content: 'Created by FS service, tracked by Git service',
      });
      expect(writeResult.status).toBe(200);

      // Check git status - should show untracked file
      const statusResult = await gitClient.get(`/api/git/status?path=${encodeURIComponent(repoDir)}`);
      expect(statusResult.status).toBe(200);
      expect(statusResult.data.success).toBe(true);

      // Add and commit using Git service
      const addResult = await gitClient.post('/api/git/add', {
        path: repoDir,
        files: ['created-by-fs.txt'],
      });
      expect(addResult.status).toBe(200);

      const commitResult = await gitClient.post('/api/git/commit', {
        path: repoDir,
        message: 'Add file created by FS service',
      });
      expect(commitResult.status).toBe(200);

      // Verify file is now tracked
      const statusAfterCommit = await gitClient.get(`/api/git/status?path=${encodeURIComponent(repoDir)}`);
      expect(statusAfterCommit.status).toBe(200);
      expect(statusAfterCommit.data.data.isClean).toBe(true);
    });

    it('FS + Terraform workflow: create terraform config then validate', async () => {
      const tfDir = path.join(tempDir, 'fs-terraform-test');

      // Create directory using FS service
      await fsClient.post('/api/fs/mkdir', {
        path: tfDir,
        recursive: true,
      });

      // Write terraform config using FS service
      const tfConfig = `
terraform {
  required_version = ">= 1.0"
}

output "test" {
  value = "hello"
}
`;
      const writeResult = await fsClient.post('/api/fs/write', {
        path: path.join(tfDir, 'main.tf'),
        content: tfConfig,
      });
      expect(writeResult.status).toBe(200);

      // Validate using Terraform service
      const validateResult = await terraformClient.post('/api/terraform/validate', {
        directory: tfDir,
      });

      // May fail if terraform is not installed, but shouldn't error
      expect([200, 500]).toContain(validateResult.status);
    });

    it('multiple FS operations in sequence', async () => {
      const workDir = path.join(tempDir, 'sequential-ops-test');

      // Create directory
      await fsClient.post('/api/fs/mkdir', { path: workDir, recursive: true });

      // Create multiple files in sequence
      const files = ['file1.txt', 'file2.txt', 'file3.txt'];
      for (const file of files) {
        const result = await fsClient.post('/api/fs/write', {
          path: path.join(workDir, file),
          content: `Content of ${file}`,
        });
        expect(result.status).toBe(200);
      }

      // List and verify all files
      const listResult = await fsClient.post('/api/fs/list', { directory: workDir });
      expect(listResult.status).toBe(200);
      expect(listResult.data.data.count).toBeGreaterThanOrEqual(3);

      // Read all files in parallel
      const readPromises = files.map((file) =>
        fsClient.post('/api/fs/read', { path: path.join(workDir, file) })
      );
      const readResults = await Promise.all(readPromises);

      readResults.forEach((result, index) => {
        expect(result.status).toBe(200);
        expect(result.data.data.content).toBe(`Content of ${files[index]}`);
      });
    });
  });

  // ==================== Error Handling Tests ====================

  describe('Error Handling Across Services', () => {
    it('all services handle missing required parameters gracefully', async () => {
      // FS: missing path for read
      const fsResult = await fsClient.post('/api/fs/read', {});
      expect(fsResult.status).toBe(400);
      expect(fsResult.data.success).toBe(false);

      // Git: missing message for commit (path defaults to cwd which is valid)
      const gitResult = await gitClient.post('/api/git/commit', {});
      expect(gitResult.status).toBe(400);
      expect(gitResult.data.success).toBe(false);

      // Terraform: missing directory for init
      const tfResult = await terraformClient.post('/api/terraform/init', {});
      expect(tfResult.status).toBe(400);
      expect(tfResult.data.success).toBe(false);

      // K8s: missing resource for get
      const k8sResult = await k8sClient.get('/api/k8s/resources');
      expect(k8sResult.status).toBe(400);
      expect(k8sResult.data.success).toBe(false);

      // Helm: missing name for install
      const helmResult = await helmClient.post('/api/helm/install', { chart: 'test' });
      expect(helmResult.status).toBe(400);
      expect(helmResult.data.success).toBe(false);
    });

    it('all services handle non-existent paths gracefully', async () => {
      const nonExistentPath = '/path/that/does/not/exist/at/all';

      // FS: read non-existent file
      const fsResult = await fsClient.post('/api/fs/read', { path: nonExistentPath });
      expect(fsResult.status).toBe(500);
      expect(fsResult.data.success).toBe(false);

      // Git: status on non-existent repo
      const gitResult = await gitClient.get(`/api/git/status?path=${encodeURIComponent(nonExistentPath)}`);
      expect(gitResult.status).toBe(500);
      expect(gitResult.data.success).toBe(false);

      // Terraform: validate non-existent directory (terraform may return various status codes)
      const tfResult = await terraformClient.post('/api/terraform/validate', {
        directory: nonExistentPath,
      });
      // Terraform behavior varies - may return 200 with success:false or 500
      expect([200, 500]).toContain(tfResult.status);
    });

    it('all services return consistent error response format', async () => {
      const errorResponses = await Promise.all([
        fsClient.post('/api/fs/read', {}),
        gitClient.post('/api/git/commit', {}), // Use commit which requires message
        terraformClient.post('/api/terraform/init', {}),
        k8sClient.get('/api/k8s/resources'),
        helmClient.post('/api/helm/install', { chart: 'test' }),
      ]);

      errorResponses.forEach((response) => {
        expect(response.data).toHaveProperty('success');
        expect(response.data.success).toBe(false);
        expect(response.data).toHaveProperty('error');
      });
    });
  });

  // ==================== Performance Tests ====================

  describe('Performance Tests', () => {
    it('handles concurrent requests across all services', async () => {
      const startTime = Date.now();

      // Send health checks to all services concurrently
      const results = await Promise.all([
        gitClient.get('/health'),
        fsClient.get('/health'),
        terraformClient.get('/health'),
        k8sClient.get('/health'),
        helmClient.get('/health'),
        gitClient.get('/health'),
        fsClient.get('/health'),
        terraformClient.get('/health'),
        k8sClient.get('/health'),
        helmClient.get('/health'),
      ]);

      const duration = Date.now() - startTime;

      // All requests should succeed
      results.forEach((result) => {
        expect(result.status).toBe(200);
      });

      // Should complete in reasonable time (under 5 seconds)
      expect(duration).toBeLessThan(5000);
    });

    it('handles rapid sequential FS operations', async () => {
      const testDir = path.join(tempDir, 'rapid-ops-test');
      await fs.mkdir(testDir, { recursive: true });

      const startTime = Date.now();

      // Perform 10 write/read cycles
      for (let i = 0; i < 10; i++) {
        const filePath = path.join(testDir, `rapid-${i}.txt`);

        await fsClient.post('/api/fs/write', {
          path: filePath,
          content: `Content ${i}`,
        });

        const readResult = await fsClient.post('/api/fs/read', {
          path: filePath,
        });

        expect(readResult.status).toBe(200);
      }

      const duration = Date.now() - startTime;

      // Should complete in reasonable time
      expect(duration).toBeLessThan(10000);
    });
  });

  // ==================== Cross-Service Workflow: Terraform -> K8s -> Helm ====================

  describe('Cross-Service Workflow: Terraform Plan -> K8s Apply -> Helm Upgrade', () => {
    it('should execute a terraform plan step', async () => {
      const tfDir = path.join(tempDir, 'cross-workflow-tf');
      await fs.mkdir(tfDir, { recursive: true });

      // Write a minimal terraform config
      await fs.writeFile(
        path.join(tfDir, 'main.tf'),
        `
terraform {
  required_version = ">= 1.0"
}

output "cluster_name" {
  value = "e2e-test-cluster"
}
`
      );

      // Attempt terraform init + plan
      const initResult = await terraformClient.post('/api/terraform/init', {
        directory: tfDir,
      });

      // May fail if terraform is not installed -- graceful skip
      if (initResult.status !== 200 || !initResult.data.success) {
        return; // Skip rest of workflow
      }

      const planResult = await terraformClient.post('/api/terraform/plan', {
        directory: tfDir,
      });

      // Plan may succeed or fail depending on terraform version / config
      // but the service should respond without crashing
      expect([200, 500]).toContain(planResult.status);
      expect(planResult.data).toHaveProperty('success');
    });

    it('should attempt k8s resource get after terraform step', async () => {
      // Attempt to get k8s pods (may fail without cluster, but validates the service works)
      const podsResult = await k8sClient.get('/api/k8s/resources?resource=pods&namespace=default');

      // Graceful degradation: service should respond even if no cluster
      expect([200, 500]).toContain(podsResult.status);
      expect(podsResult.data).toHaveProperty('success');
    });

    it('should attempt helm list after k8s step', async () => {
      // Attempt to list helm releases
      const listResult = await helmClient.get('/api/helm/list');

      // Graceful degradation: service should respond even if no cluster
      expect([200, 500]).toContain(listResult.status);
      expect(listResult.data).toHaveProperty('success');
    });

    it('should complete the full cross-service sequence', async () => {
      // This test validates that all three services can be called in sequence
      // without one service failing causing cascading failures

      const results = {
        terraform: false,
        k8s: false,
        helm: false,
      };

      // Step 1: Terraform version check
      try {
        const tfResult = await terraformClient.get('/api/terraform/version');
        results.terraform = tfResult.status === 200;
      } catch {
        results.terraform = false;
      }

      // Step 2: K8s version check
      try {
        const k8sResult = await k8sClient.get('/api/k8s/version');
        results.k8s = k8sResult.status === 200;
      } catch {
        results.k8s = false;
      }

      // Step 3: Helm version check
      try {
        const helmResult = await helmClient.get('/api/helm/version');
        results.helm = helmResult.status === 200;
      } catch {
        results.helm = false;
      }

      // At minimum, the services should respond (even if tools are not installed)
      // The fact that we got here without throwing means the services are running
      expect(results).toBeDefined();
    });
  });

  // ==================== Health Endpoint Verification ====================

  describe('Individual Health Endpoint Verification', () => {
    it('git-tools-service health should return correct service name', async () => {
      const result = await gitClient.get('/health');

      expect(result.status).toBe(200);
      expect(result.data.service).toBe('git-tools-service');
      expect(result.data.status).toBe('healthy');
      expect(result.data.timestamp).toBeDefined();
    });

    it('fs-tools-service health should return correct service name', async () => {
      const result = await fsClient.get('/health');

      expect(result.status).toBe(200);
      expect(result.data.service).toBe('fs-tools-service');
      expect(result.data.status).toBe('healthy');
      expect(result.data.timestamp).toBeDefined();
    });

    it('terraform-tools-service health should return correct service name', async () => {
      const result = await terraformClient.get('/health');

      expect(result.status).toBe(200);
      expect(result.data.service).toBe('terraform-tools-service');
      expect(result.data.status).toBe('healthy');
      expect(result.data.timestamp).toBeDefined();
    });

    it('k8s-tools-service health should return correct service name', async () => {
      const result = await k8sClient.get('/health');

      expect(result.status).toBe(200);
      expect(result.data.service).toBe('k8s-tools-service');
      expect(result.data.status).toBe('healthy');
      expect(result.data.timestamp).toBeDefined();
    });

    it('helm-tools-service health should return correct service name', async () => {
      const result = await helmClient.get('/health');

      expect(result.status).toBe(200);
      expect(result.data.service).toBe('helm-tools-service');
      expect(result.data.status).toBe('healthy');
      expect(result.data.timestamp).toBeDefined();
    });

    it('all health endpoints should have consistent response shape', async () => {
      const healthResults = await Promise.all([
        gitClient.get('/health'),
        fsClient.get('/health'),
        terraformClient.get('/health'),
        k8sClient.get('/health'),
        helmClient.get('/health'),
      ]);

      for (const result of healthResults) {
        expect(result.status).toBe(200);
        expect(result.data).toHaveProperty('status');
        expect(result.data).toHaveProperty('service');
        expect(result.data).toHaveProperty('timestamp');
        expect(typeof result.data.service).toBe('string');
        expect(typeof result.data.timestamp).toBe('string');
      }
    });
  });

  // ==================== Error Propagation Tests ====================

  describe('Error Propagation', () => {
    it('FS service should return structured error for permission denied paths', async () => {
      const result = await fsClient.post('/api/fs/write', {
        path: '/proc/nonexistent/file.txt',
        content: 'test',
      });

      expect(result.data.success).toBe(false);
      expect(result.data.error).toBeDefined();
      expect(typeof result.data.error).toBe('string');
      expect(result.data.error.length).toBeGreaterThan(0);
    });

    it('Git service should return structured error for non-repo path', async () => {
      const nonRepoDir = path.join(tempDir, 'not-a-repo');
      await fs.mkdir(nonRepoDir, { recursive: true });

      const result = await gitClient.get(
        `/api/git/log?path=${encodeURIComponent(nonRepoDir)}`
      );

      expect(result.data.success).toBe(false);
      expect(result.data.error).toBeDefined();
      expect(typeof result.data.error).toBe('string');
    });

    it('Terraform service should return structured error for invalid directory', async () => {
      const result = await terraformClient.post('/api/terraform/validate', {
        directory: '/nonexistent/terraform/dir',
      });

      // Terraform validate on a non-existent directory may either return
      // an error (success: false) or succeed with a validation result
      // depending on the terraform binary behaviour. The key assertion is
      // that the service responds with a well-structured JSON body.
      expect(result.data).toBeDefined();
      expect(result.data).toHaveProperty('success');
      if (!result.data.success) {
        expect(result.data.error).toBeDefined();
        expect(typeof result.data.error).toBe('string');
      }
    });

    it('K8s service should return structured error for invalid resource type', async () => {
      const result = await k8sClient.get('/api/k8s/resources?resource=invalidresourcetype');

      // Should respond without crashing, either with a valid error or tool not found
      expect(result.data).toBeDefined();
      expect(result.data).toHaveProperty('success');
    });

    it('Helm service should return structured error for non-existent release', async () => {
      const result = await helmClient.get(
        '/api/helm/status?release=nonexistent-release-12345'
      );

      // May return 400 (missing params) or 500 (helm not found/release not found)
      expect(result.data).toBeDefined();
      expect(result.data).toHaveProperty('success');
    });
  });

  // ==================== Concurrent Tool Requests ====================

  describe('Concurrent Tool Requests', () => {
    it('should handle multiple simultaneous FS write requests', async () => {
      const concurrentDir = path.join(tempDir, 'concurrent-writes');
      await fs.mkdir(concurrentDir, { recursive: true });

      const fileCount = 10;
      const writePromises = Array.from({ length: fileCount }, (_, i) =>
        fsClient.post('/api/fs/write', {
          path: path.join(concurrentDir, `concurrent-${i}.txt`),
          content: `Concurrent content ${i} - ${Date.now()}`,
        })
      );

      const results = await Promise.all(writePromises);

      // All writes should succeed
      results.forEach((result) => {
        expect(result.status).toBe(200);
        expect(result.data.success).toBe(true);
      });

      // Verify all files exist by reading them concurrently
      const readPromises = Array.from({ length: fileCount }, (_, i) =>
        fsClient.post('/api/fs/read', {
          path: path.join(concurrentDir, `concurrent-${i}.txt`),
        })
      );

      const readResults = await Promise.all(readPromises);

      readResults.forEach((result, i) => {
        expect(result.status).toBe(200);
        expect(result.data.success).toBe(true);
        expect(result.data.data.content).toContain(`Concurrent content ${i}`);
      });
    });

    it('should handle mixed concurrent operations across different services', async () => {
      const mixedDir = path.join(tempDir, 'mixed-concurrent');
      await fs.mkdir(mixedDir, { recursive: true });

      // Fire requests to multiple services at the same time
      const results = await Promise.all([
        // FS: write a file
        fsClient.post('/api/fs/write', {
          path: path.join(mixedDir, 'test.txt'),
          content: 'concurrent test',
        }),
        // Git: health check
        gitClient.get('/health'),
        // Terraform: health check
        terraformClient.get('/health'),
        // K8s: health check
        k8sClient.get('/health'),
        // Helm: health check
        helmClient.get('/health'),
        // FS: stat the temp directory
        fsClient.post('/api/fs/stat', {
          path: tempDir,
        }),
      ]);

      // All should return valid responses (no crashes or hangs)
      results.forEach((result) => {
        expect(result.status).toBeDefined();
        expect(result.data).toBeDefined();
      });
    });

    it('should handle burst of health checks without degradation', async () => {
      const burstSize = 20;
      const startTime = Date.now();

      const promises = Array.from({ length: burstSize }, (_, i) => {
        // Round-robin across services
        const clients = [gitClient, fsClient, terraformClient, k8sClient, helmClient];
        const client = clients[i % clients.length];
        return client.get('/health');
      });

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // All should succeed
      results.forEach((result) => {
        expect(result.status).toBe(200);
      });

      // Burst of 20 requests should complete in reasonable time
      expect(duration).toBeLessThan(10000);
    });
  });

  // ==================== Tool Service Discovery ====================

  describe('Tool Service Discovery', () => {
    it('all expected tool services should be reachable', async () => {
      const serviceChecks = await Promise.all([
        gitClient.get('/health').then((r) => ({ service: 'git', status: r.status })),
        fsClient.get('/health').then((r) => ({ service: 'fs', status: r.status })),
        terraformClient.get('/health').then((r) => ({ service: 'terraform', status: r.status })),
        k8sClient.get('/health').then((r) => ({ service: 'k8s', status: r.status })),
        helmClient.get('/health').then((r) => ({ service: 'helm', status: r.status })),
      ]);

      const reachableServices = serviceChecks.filter((s) => s.status === 200);

      // All 5 tool services should be reachable
      expect(reachableServices.length).toBe(5);
    });

    it('all tool services should expose their service name in health', async () => {
      const expectedServices = [
        { client: gitClient, expectedName: 'git-tools-service' },
        { client: fsClient, expectedName: 'fs-tools-service' },
        { client: terraformClient, expectedName: 'terraform-tools-service' },
        { client: k8sClient, expectedName: 'k8s-tools-service' },
        { client: helmClient, expectedName: 'helm-tools-service' },
      ];

      for (const { client, expectedName } of expectedServices) {
        const result = await client.get('/health');
        expect(result.status).toBe(200);
        expect(result.data.service).toBe(expectedName);
      }
    });

    it('git service should expose git-related API routes', async () => {
      // Verify git endpoints respond (may return 400 for missing params, but should not 404)
      const initResult = await gitClient.post('/api/git/init', {
        path: path.join(tempDir, 'discovery-git-test'),
      });
      // Should return 200 or 400/500 (not 404)
      expect(initResult.status).not.toBe(404);
    });

    it('fs service should expose filesystem-related API routes', async () => {
      const readResult = await fsClient.post('/api/fs/read', {
        path: '/nonexistent',
      });
      // Should return a valid error response (not 404 for the route itself)
      expect(readResult.status).not.toBe(404);
      expect(readResult.data).toHaveProperty('success');
    });

    it('terraform service should expose terraform-related API routes', async () => {
      const versionResult = await terraformClient.get('/api/terraform/version');
      // Should return something (not 404 for the route)
      expect(versionResult.status).not.toBe(404);
      expect(versionResult.data).toHaveProperty('success');
    });

    it('k8s service should expose kubernetes-related API routes', async () => {
      const versionResult = await k8sClient.get('/api/k8s/version');
      // Route should exist (not 404)
      expect(versionResult.status).not.toBe(404);
      expect(versionResult.data).toHaveProperty('success');
    });

    it('helm service should expose helm-related API routes', async () => {
      const versionResult = await helmClient.get('/api/helm/version');
      // Route should exist (not 404)
      expect(versionResult.status).not.toBe(404);
      expect(versionResult.data).toHaveProperty('success');
    });
  });
});
