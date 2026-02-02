/**
 * End-to-End Tests for Multi-Service Workflows
 *
 * These tests verify that multiple services work together correctly
 * to complete real-world workflows.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { startServer as startGitService } from '../../../services/git-tools-service/src/server';
import { startServer as startFsService } from '../../../services/fs-tools-service/src/server';
import { startServer as startLlmService } from '../../../services/llm-service/src/server';
import { waitForService, createTestClient, getTestPorts, createTempDir, removeTempDir } from '../../utils/test-helpers';
import { join } from 'node:path';
import { $ } from 'bun';

describe('E2E: Multi-Service Workflows', () => {
  // Service instances
  let gitServer: any;
  let fsServer: any;
  let llmServer: any;

  // Ports and URLs
  const gitPorts = getTestPorts();
  const fsPorts = getTestPorts();
  const llmPorts = getTestPorts();

  const gitUrl = `http://localhost:${gitPorts.http}`;
  const fsUrl = `http://localhost:${fsPorts.http}`;
  const llmUrl = `http://localhost:${llmPorts.http}`;

  // Clients
  let gitClient: ReturnType<typeof createTestClient>;
  let fsClient: ReturnType<typeof createTestClient>;
  let llmClient: ReturnType<typeof createTestClient>;

  // Temp directory
  let tempDir: string;

  beforeAll(async () => {
    // Start all services
    [gitServer, fsServer, llmServer] = await Promise.all([
      startGitService(gitPorts.http),
      startFsService(fsPorts.http),
      startLlmService(llmPorts.http, llmPorts.ws),
    ]);

    // Wait for all services to be ready
    const [gitReady, fsReady, llmReady] = await Promise.all([
      waitForService(gitUrl),
      waitForService(fsUrl),
      waitForService(llmUrl),
    ]);

    if (!gitReady || !fsReady || !llmReady) {
      throw new Error('One or more services failed to start');
    }

    // Create clients
    gitClient = createTestClient(gitUrl);
    fsClient = createTestClient(fsUrl);
    llmClient = createTestClient(llmUrl);
  });

  afterAll(() => {
    gitServer?.stop?.();
    fsServer?.stop?.();
    llmServer?.stop?.();
  });

  beforeEach(async () => {
    tempDir = await createTempDir('e2e-workflow-');
  });

  afterEach(async () => {
    if (tempDir) {
      await removeTempDir(tempDir);
    }
  });

  describe('Workflow: Project Initialization', () => {
    test('creates project structure and initializes git repository', async () => {
      const projectDir = join(tempDir, 'my-project');

      // Step 1: Create project directory
      const mkdirResult = await fsClient.post('/api/fs/mkdir', {
        path: projectDir,
        recursive: true,
      });
      expect(mkdirResult.status).toBe(200);

      // Step 2: Create project files using FS service
      const readmeContent = '# My Project\n\nThis is a test project.\n';
      const packageContent = JSON.stringify({
        name: 'my-project',
        version: '1.0.0',
        description: 'Test project',
      }, null, 2);

      await fsClient.post('/api/fs/write', {
        path: join(projectDir, 'README.md'),
        content: readmeContent,
      });
      await fsClient.post('/api/fs/write', {
        path: join(projectDir, 'package.json'),
        content: packageContent,
      });

      // Step 3: Initialize git repository
      const initResult = await gitClient.post('/api/git/init', {
        path: projectDir,
      });
      expect(initResult.status).toBe(200);

      // Configure git user for commit
      await $`cd ${projectDir} && git config user.email "e2e@test.com"`;
      await $`cd ${projectDir} && git config user.name "E2E Test"`;

      // Step 4: Stage all files
      const addResult = await gitClient.post('/api/git/add', {
        path: projectDir,
        files: '.',
      });
      expect(addResult.status).toBe(200);

      // Step 5: Create initial commit
      const commitResult = await gitClient.post('/api/git/commit', {
        path: projectDir,
        message: 'Initial commit: Project setup',
      });
      expect(commitResult.status).toBe(200);
      expect(commitResult.data.data.hash).toBeDefined();

      // Step 6: Verify project structure using FS service
      const listResult = await fsClient.post('/api/fs/list', {
        directory: projectDir,
      });
      expect(listResult.data.data.files.length).toBeGreaterThanOrEqual(2);

      // Step 7: Verify git status is clean
      const statusResult = await gitClient.get(`/api/git/status?path=${encodeURIComponent(projectDir)}`);
      expect(statusResult.data.data.isClean).toBe(true);
    });
  });

  describe('Workflow: Code Modification and Commit', () => {
    let projectDir: string;

    beforeEach(async () => {
      // Setup: Create a project with initial commit
      projectDir = join(tempDir, 'code-project');
      await fsClient.post('/api/fs/mkdir', { path: projectDir });
      await fsClient.post('/api/fs/write', {
        path: join(projectDir, 'index.ts'),
        content: 'export const version = "1.0.0";\n',
      });
      await gitClient.post('/api/git/init', { path: projectDir });
      await $`cd ${projectDir} && git config user.email "e2e@test.com"`;
      await $`cd ${projectDir} && git config user.name "E2E Test"`;
      await gitClient.post('/api/git/add', { path: projectDir, files: '.' });
      await gitClient.post('/api/git/commit', { path: projectDir, message: 'Initial' });
    });

    test('modifies file, creates branch, and commits', async () => {
      // Step 1: Create feature branch
      const branchResult = await gitClient.post('/api/git/branch', {
        path: projectDir,
        name: 'feature/update-version',
        checkout: true,
      });
      expect(branchResult.status).toBe(200);

      // Step 2: Modify file using FS service
      await fsClient.post('/api/fs/write', {
        path: join(projectDir, 'index.ts'),
        content: 'export const version = "2.0.0";\n',
      });

      // Step 3: Verify modification via git diff
      const diffResult = await gitClient.get(`/api/git/diff?path=${encodeURIComponent(projectDir)}`);
      expect(diffResult.data.data.diff).toContain('2.0.0');

      // Step 4: Stage and commit
      await gitClient.post('/api/git/add', { path: projectDir, files: 'index.ts' });
      const commitResult = await gitClient.post('/api/git/commit', {
        path: projectDir,
        message: 'Update version to 2.0.0',
      });
      expect(commitResult.status).toBe(200);

      // Step 5: Verify commit log
      const logResult = await gitClient.get(`/api/git/log?path=${encodeURIComponent(projectDir)}`);
      expect(logResult.data.data.total).toBeGreaterThanOrEqual(2);
      const latestCommit = logResult.data.data.all[0];
      expect(latestCommit.message).toContain('Update version');

      // Step 6: Verify current branch
      const currentBranch = await gitClient.get(`/api/git/current-branch?path=${encodeURIComponent(projectDir)}`);
      expect(currentBranch.data.data.branch).toBe('feature/update-version');
    });
  });

  describe('Workflow: File Search and Analysis', () => {
    let projectDir: string;

    beforeEach(async () => {
      projectDir = join(tempDir, 'search-project');
      await fsClient.post('/api/fs/mkdir', { path: projectDir });
      await fsClient.post('/api/fs/mkdir', { path: join(projectDir, 'src') });

      // Create multiple files with code
      await fsClient.post('/api/fs/write', {
        path: join(projectDir, 'src/api.ts'),
        content: `
          export function fetchUser(id: string) {
            // TODO: Implement user fetching
            return null;
          }

          export function fetchPosts(userId: string) {
            // TODO: Implement posts fetching
            return [];
          }
        `,
      });

      await fsClient.post('/api/fs/write', {
        path: join(projectDir, 'src/utils.ts'),
        content: `
          export function formatDate(date: Date) {
            return date.toISOString();
          }

          // TODO: Add more utility functions
        `,
      });

      await fsClient.post('/api/fs/write', {
        path: join(projectDir, 'README.md'),
        content: '# Project\n\nTODO: Write documentation\n',
      });
    });

    test('finds all TODO comments across project', async () => {
      // Step 1: Search for TODO comments
      const searchResult = await fsClient.post('/api/fs/search', {
        directory: projectDir,
        pattern: 'TODO',
        includeContext: true,
      });

      expect(searchResult.status).toBe(200);
      expect(searchResult.data.data.results.length).toBeGreaterThanOrEqual(3);

      // Step 2: Get stats on files found
      const uniqueFiles = new Set(
        searchResult.data.data.results.map((r: any) => r.file)
      );
      expect(uniqueFiles.size).toBeGreaterThanOrEqual(2);
    });

    test('lists project structure and gets file details', async () => {
      // Step 1: List all files recursively
      const listResult = await fsClient.post('/api/fs/list', {
        directory: projectDir,
        recursive: true,
        onlyFiles: true,
      });

      expect(listResult.status).toBe(200);
      const files = listResult.data.data.files;
      expect(files.length).toBeGreaterThanOrEqual(3);

      // Step 2: Get stats for each TypeScript file
      const tsFiles = files.filter((f: string) => f.endsWith('.ts'));
      expect(tsFiles.length).toBeGreaterThanOrEqual(2);

      for (const filePath of tsFiles) {
        const statResult = await fsClient.post('/api/fs/stat', { path: filePath });
        expect(statResult.status).toBe(200);
        expect(statResult.data.data.stats.isFile).toBe(true);
        expect(statResult.data.data.stats.size).toBeGreaterThan(0);
      }
    });
  });

  describe('Workflow: Token Estimation for LLM Processing', () => {
    // This test requires OpenAI API key for token counting
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

    test.skipIf(!hasOpenAIKey)('estimates tokens for code files before LLM processing', async () => {
      const projectDir = join(tempDir, 'token-project');
      await fsClient.post('/api/fs/mkdir', { path: projectDir });

      // Create code files
      const codeContent = `
        export class UserService {
          private users: Map<string, User> = new Map();

          async createUser(data: CreateUserInput): Promise<User> {
            const user = {
              id: crypto.randomUUID(),
              ...data,
              createdAt: new Date(),
            };
            this.users.set(user.id, user);
            return user;
          }

          async getUser(id: string): Promise<User | null> {
            return this.users.get(id) ?? null;
          }

          async updateUser(id: string, data: UpdateUserInput): Promise<User | null> {
            const user = this.users.get(id);
            if (!user) return null;
            const updated = { ...user, ...data, updatedAt: new Date() };
            this.users.set(id, updated);
            return updated;
          }
        }
      `;

      await fsClient.post('/api/fs/write', {
        path: join(projectDir, 'user-service.ts'),
        content: codeContent,
      });

      // Step 1: Read file content
      const readResult = await fsClient.post('/api/fs/read', {
        path: join(projectDir, 'user-service.ts'),
      });
      expect(readResult.status).toBe(200);

      // Step 2: Count tokens using LLM service
      const tokenResult = await llmClient.post('/api/llm/tokens/count', {
        text: readResult.data.data.content,
      });

      expect(tokenResult.status).toBe(200);
      expect(tokenResult.data.tokenCount).toBeGreaterThan(50);
      expect(tokenResult.data.textLength).toBe(readResult.data.data.content.length);

      // Step 3: Verify we can estimate cost/context window usage
      const maxContextWindow = 128000; // typical model context
      const usagePercent = (tokenResult.data.tokenCount / maxContextWindow) * 100;
      expect(usagePercent).toBeLessThan(1); // Small file should use <1% of context
    });
  });

  describe('Workflow: Service Health Monitoring', () => {
    test('verifies all services are healthy', async () => {
      // Check health of all services in parallel
      const healthChecks = await Promise.all([
        gitClient.get('/health'),
        fsClient.get('/health'),
        llmClient.get('/health'),
      ]);

      // Verify all services are healthy
      for (const check of healthChecks) {
        expect(check.status).toBe(200);
        expect(check.data.status).toBe('healthy');
      }

      // Verify service names
      const serviceNames = healthChecks.map(h => h.data.service);
      expect(serviceNames).toContain('git-tools-service');
      expect(serviceNames).toContain('fs-tools-service');
      expect(serviceNames).toContain('llm-service');
    });
  });
});
