# Week 5-6 MCP Tools Services - Implementation Plan

> **Status**: 📋 PLANNING
> **Timeline**: Week 5-6 of Phase 1
> **Dependencies**: Week 3-4 Generator & Core Engine (✅ COMPLETED)
> **Services**: Git Tools, File System Tools, Terraform Tools, Kubernetes Tools

---

## Overview

Week 5-6 focuses on implementing the **MCP (Model Context Protocol) Tools Services**, which provide the Core Engine with capabilities to interact with various development tools and platforms.

These services act as the "hands" of the AI agent, enabling it to:
- Perform Git operations (clone, commit, push, etc.)
- Manipulate files and directories
- Execute Terraform commands
- Interact with Kubernetes clusters

---

## Requirements Analysis

### From releases/mvp/IMPLEMENTATION_PLAN.md

**Week 5-6: MCP Tools (Part 1)**
- Implement Git Tools Service
- Implement File System Tools Service
- Implement Terraform Tools Service
- Implement Kubernetes Tools Service

### Key Requirements

1. **Git Tools Service**:
   - Clone, status, add, commit, push, pull
   - Branch operations (create, list, checkout, delete)
   - Diff, log, merge, stash operations
   - Safety checks for destructive operations

2. **File System Tools Service**:
   - Read, write, list files
   - Search files (using ripgrep)
   - Generate directory trees
   - File diff operations
   - Path safety validation

3. **Terraform Tools Service**:
   - Init, plan, apply, destroy operations
   - Output and show commands
   - Streaming output for long-running operations
   - State management safety

4. **Kubernetes Tools Service**:
   - Get, apply, delete operations
   - Logs and exec commands
   - Describe and port-forward
   - Scale operations
   - Context safety validation

---

## Gap Analysis

### ✅ Already Implemented (Week 1-4)

1. **Foundation Services**:
   - ✅ State Service (persistence)
   - ✅ LLM Service (multi-provider support)
   - ✅ Shared libraries (@nimbus/shared-types, shared-utils, shared-clients)

2. **Intelligence Services**:
   - ✅ Core Engine Service (orchestrator, planner, executor, verifier, safety)
   - ✅ Generator Service (templates, best practices, conversational)

### ⚠️ Missing from Current Implementation

#### Git Tools Service (Week 5-6 Priority)

1. **Git Operations**:
   - ❌ Clone repository (`src/git/clone.ts`)
   - ❌ Status check (`src/git/status.ts`)
   - ❌ Stage files (`src/git/add.ts`)
   - ❌ Commit changes (`src/git/commit.ts`)
   - ❌ Push/pull operations (`src/git/push.ts`, `src/git/pull.ts`)
   - ❌ Branch management (`src/git/branch.ts`, `src/git/checkout.ts`)
   - ❌ Diff and log (`src/git/diff.ts`, `src/git/log.ts`)
   - ❌ Merge and stash (`src/git/merge.ts`, `src/git/stash.ts`)

2. **Safety Features**:
   - ❌ Credential validation
   - ❌ Destructive operation warnings
   - ❌ Branch protection checks

3. **HTTP Routes**:
   - ❌ All git operation endpoints
   - ✅ Health route (already exists)

#### File System Tools Service (Week 5-6 Priority)

1. **File Operations**:
   - ❌ Read file (`src/fs/read.ts`)
   - ❌ Write file (`src/fs/write.ts`)
   - ❌ List directory (`src/fs/list.ts`)
   - ❌ Search files (`src/fs/search.ts` using ripgrep)
   - ❌ Directory tree (`src/fs/tree.ts`)
   - ❌ File diff (`src/fs/diff.ts`)

2. **Safety Features**:
   - ❌ Path traversal protection
   - ❌ File size limits
   - ❌ Binary file detection

3. **HTTP Routes**:
   - ❌ All file operation endpoints
   - ✅ Health route (already exists)

#### Terraform Tools Service (Week 5-6 Priority)

1. **Terraform Operations**:
   - ❌ Init workspace (`src/terraform/init.ts`)
   - ❌ Plan infrastructure (`src/terraform/plan.ts`)
   - ❌ Apply changes (`src/terraform/apply.ts`)
   - ❌ Destroy infrastructure (`src/terraform/destroy.ts`)
   - ❌ Output values (`src/terraform/output.ts`)
   - ❌ Show state (`src/terraform/show.ts`)
   - ❌ Validate configuration (`src/terraform/validate.ts`)

2. **Safety Features**:
   - ❌ Plan approval required for apply
   - ❌ Destroy confirmation
   - ❌ State backup before operations

3. **HTTP Routes**:
   - ❌ All terraform operation endpoints
   - ✅ Health route (already exists)

4. **WebSocket Streaming**:
   - ❌ Stream plan/apply output

#### Kubernetes Tools Service (Week 5-6 Priority)

1. **Kubernetes Operations**:
   - ❌ Get resources (`src/k8s/get.ts`)
   - ❌ Apply manifests (`src/k8s/apply.ts`)
   - ❌ Delete resources (`src/k8s/delete.ts`)
   - ❌ Pod logs (`src/k8s/logs.ts`)
   - ❌ Exec into pod (`src/k8s/exec.ts`)
   - ❌ Describe resources (`src/k8s/describe.ts`)
   - ❌ Port forward (`src/k8s/port-forward.ts`)
   - ❌ Scale deployments (`src/k8s/scale.ts`)

2. **Safety Features**:
   - ❌ Context validation
   - ❌ Namespace restrictions
   - ❌ Destructive operation warnings

3. **HTTP Routes**:
   - ❌ All k8s operation endpoints
   - ✅ Health route (already exists)

4. **WebSocket Streaming**:
   - ❌ Stream pod logs
   - ❌ Stream exec output

---

## Implementation Plan - Week 5-6

### Day 1-2: Git Tools Service

#### Task 1.1: Core Git Operations

**File**: `services/git-tools-service/src/git/operations.ts`

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '@nimbus/shared-utils';

const execAsync = promisify(exec);

export class GitOperations {
  /**
   * Clone a repository
   */
  async clone(url: string, path?: string, options?: CloneOptions): Promise<void> {
    logger.info(`Cloning repository: ${url}`);

    const args = ['clone', url];
    if (path) args.push(path);
    if (options?.depth) args.push('--depth', options.depth.toString());
    if (options?.branch) args.push('--branch', options.branch);

    const command = `git ${args.join(' ')}`;
    await execAsync(command);

    logger.info(`Repository cloned successfully`);
  }

  /**
   * Get repository status
   */
  async status(repoPath: string): Promise<GitStatus> {
    const { stdout } = await execAsync('git status --porcelain', { cwd: repoPath });
    return this.parseStatus(stdout);
  }

  /**
   * Stage files for commit
   */
  async add(repoPath: string, files: string[]): Promise<void> {
    const fileArgs = files.join(' ');
    await execAsync(`git add ${fileArgs}`, { cwd: repoPath });
  }

  /**
   * Commit changes
   */
  async commit(repoPath: string, message: string, options?: CommitOptions): Promise<string> {
    const args = ['commit', '-m', `"${message}"`];
    if (options?.amend) args.push('--amend');
    if (options?.noVerify) args.push('--no-verify');

    const { stdout } = await execAsync(`git ${args.join(' ')}`, { cwd: repoPath });
    return this.parseCommitHash(stdout);
  }

  /**
   * Push changes to remote
   */
  async push(repoPath: string, remote: string = 'origin', branch?: string): Promise<void> {
    const args = ['push', remote];
    if (branch) args.push(branch);

    await execAsync(`git ${args.join(' ')}`, { cwd: repoPath });
  }

  /**
   * Pull changes from remote
   */
  async pull(repoPath: string, remote: string = 'origin', branch?: string): Promise<void> {
    const args = ['pull', remote];
    if (branch) args.push(branch);

    await execAsync(`git ${args.join(' ')}`, { cwd: repoPath });
  }

  private parseStatus(output: string): GitStatus {
    const lines = output.split('\n').filter(l => l.length > 0);
    return {
      modified: lines.filter(l => l.startsWith(' M')).map(l => l.substring(3)),
      added: lines.filter(l => l.startsWith('A ')).map(l => l.substring(3)),
      deleted: lines.filter(l => l.startsWith(' D')).map(l => l.substring(3)),
      untracked: lines.filter(l => l.startsWith('??')).map(l => l.substring(3)),
    };
  }

  private parseCommitHash(output: string): string {
    const match = output.match(/\[.+? ([a-f0-9]{7})\]/);
    return match ? match[1] : '';
  }
}
```

#### Task 1.2: Branch Operations

**File**: `services/git-tools-service/src/git/branch.ts`

```typescript
export class GitBranch {
  /**
   * List branches
   */
  async list(repoPath: string, options?: ListOptions): Promise<Branch[]> {
    const args = ['branch'];
    if (options?.remote) args.push('-r');
    if (options?.all) args.push('-a');

    const { stdout } = await execAsync(`git ${args.join(' ')}`, { cwd: repoPath });
    return this.parseBranches(stdout);
  }

  /**
   * Create new branch
   */
  async create(repoPath: string, branchName: string, options?: CreateOptions): Promise<void> {
    const args = ['branch', branchName];
    if (options?.from) args.push(options.from);

    await execAsync(`git ${args.join(' ')}`, { cwd: repoPath });
  }

  /**
   * Checkout branch
   */
  async checkout(repoPath: string, branchName: string, options?: CheckoutOptions): Promise<void> {
    const args = ['checkout', branchName];
    if (options?.create) args.unshift('-b');

    await execAsync(`git ${args.join(' ')}`, { cwd: repoPath });
  }

  /**
   * Delete branch
   */
  async delete(repoPath: string, branchName: string, force: boolean = false): Promise<void> {
    const flag = force ? '-D' : '-d';
    await execAsync(`git branch ${flag} ${branchName}`, { cwd: repoPath });
  }

  private parseBranches(output: string): Branch[] {
    return output.split('\n')
      .filter(l => l.length > 0)
      .map(line => ({
        name: line.replace(/^\*?\s+/, ''),
        current: line.startsWith('*'),
      }));
  }
}
```

#### Task 1.3: Git Safety Manager

**File**: `services/git-tools-service/src/safety/git-safety.ts`

```typescript
export class GitSafetyManager {
  /**
   * Check if operation is destructive
   */
  isDestructive(operation: GitOperation): boolean {
    const destructiveOps = ['force-push', 'reset-hard', 'clean', 'branch-delete'];
    return destructiveOps.includes(operation.type);
  }

  /**
   * Validate credentials before operation
   */
  async validateCredentials(repoPath: string): Promise<boolean> {
    try {
      await execAsync('git ls-remote', { cwd: repoPath });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check branch protection
   */
  async isBranchProtected(repoPath: string, branchName: string): Promise<boolean> {
    // Check if branch is main/master or matches protection patterns
    const protectedBranches = ['main', 'master', 'production', 'prod'];
    return protectedBranches.includes(branchName);
  }

  /**
   * Require confirmation for destructive operations
   */
  requireConfirmation(operation: GitOperation): SafetyCheck {
    return {
      passed: false,
      severity: 'high',
      message: `Destructive operation "${operation.type}" requires confirmation`,
      can_proceed: false,
      requires_approval: true,
    };
  }
}
```

#### Task 1.4: HTTP Routes

**File**: `services/git-tools-service/src/routes.ts`

```typescript
import { Elysia } from 'elysia';
import { GitOperations } from './git/operations';
import { GitBranch } from './git/branch';
import { GitSafetyManager } from './safety/git-safety';

export function setupRoutes(app: Elysia) {
  const gitOps = new GitOperations();
  const gitBranch = new GitBranch();
  const safetyManager = new GitSafetyManager();

  // Clone repository
  app.post('/api/git/clone', async ({ body }) => {
    const { url, path, options } = body as CloneRequest;
    await gitOps.clone(url, path, options);
    return { success: true };
  });

  // Get status
  app.post('/api/git/status', async ({ body }) => {
    const { repoPath } = body as StatusRequest;
    const status = await gitOps.status(repoPath);
    return { success: true, data: status };
  });

  // Stage files
  app.post('/api/git/add', async ({ body }) => {
    const { repoPath, files } = body as AddRequest;
    await gitOps.add(repoPath, files);
    return { success: true };
  });

  // Commit changes
  app.post('/api/git/commit', async ({ body }) => {
    const { repoPath, message, options } = body as CommitRequest;
    const hash = await gitOps.commit(repoPath, message, options);
    return { success: true, data: { commit: hash } };
  });

  // Push changes
  app.post('/api/git/push', async ({ body }) => {
    const { repoPath, remote, branch } = body as PushRequest;

    // Safety check for force push
    if (body.force) {
      const safetyCheck = safetyManager.requireConfirmation({
        type: 'force-push',
        target: branch,
      });
      if (!safetyCheck.passed) {
        return { success: false, error: safetyCheck.message };
      }
    }

    await gitOps.push(repoPath, remote, branch);
    return { success: true };
  });

  // Pull changes
  app.post('/api/git/pull', async ({ body }) => {
    const { repoPath, remote, branch } = body as PullRequest;
    await gitOps.pull(repoPath, remote, branch);
    return { success: true };
  });

  // List branches
  app.post('/api/git/branch/list', async ({ body }) => {
    const { repoPath, options } = body as ListBranchesRequest;
    const branches = await gitBranch.list(repoPath, options);
    return { success: true, data: branches };
  });

  // Create branch
  app.post('/api/git/branch/create', async ({ body }) => {
    const { repoPath, branchName, options } = body as CreateBranchRequest;
    await gitBranch.create(repoPath, branchName, options);
    return { success: true };
  });

  // Checkout branch
  app.post('/api/git/branch/checkout', async ({ body }) => {
    const { repoPath, branchName, options } = body as CheckoutRequest;
    await gitBranch.checkout(repoPath, branchName, options);
    return { success: true };
  });

  // Delete branch
  app.post('/api/git/branch/delete', async ({ body }) => {
    const { repoPath, branchName, force } = body as DeleteBranchRequest;

    // Safety check for protected branches
    const isProtected = await safetyManager.isBranchProtected(repoPath, branchName);
    if (isProtected && !force) {
      return {
        success: false,
        error: `Branch "${branchName}" is protected. Use force flag to override.`,
      };
    }

    await gitBranch.delete(repoPath, branchName, force);
    return { success: true };
  });

  // Diff
  app.post('/api/git/diff', async ({ body }) => {
    const { repoPath, files } = body as DiffRequest;
    const fileArgs = files ? files.join(' ') : '';
    const { stdout } = await execAsync(`git diff ${fileArgs}`, { cwd: repoPath });
    return { success: true, data: { diff: stdout } };
  });

  // Log
  app.post('/api/git/log', async ({ body }) => {
    const { repoPath, limit = 10 } = body as LogRequest;
    const { stdout } = await execAsync(
      `git log --oneline -n ${limit}`,
      { cwd: repoPath }
    );
    return { success: true, data: { log: stdout } };
  });

  // Health check
  app.get('/health', () => ({ status: 'healthy', service: 'git-tools' }));
}
```

#### Task 1.5: Tests

**File**: `services/git-tools-service/src/__tests__/git-operations.test.ts`

- Test clone, status, add, commit operations
- Test push/pull with mocked git commands
- Test error handling for invalid repositories
- Test safety checks for destructive operations

### Day 3-4: File System Tools Service

#### Task 3.1: File Operations

**File**: `services/fs-tools-service/src/fs/operations.ts`

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '@nimbus/shared-utils';

export class FileSystemOperations {
  /**
   * Read file contents
   */
  async readFile(filePath: string, options?: ReadOptions): Promise<string> {
    this.validatePath(filePath);

    const stats = await fs.stat(filePath);

    // Check file size limit (default 10MB)
    const maxSize = options?.maxSize || 10 * 1024 * 1024;
    if (stats.size > maxSize) {
      throw new Error(`File size (${stats.size}) exceeds limit (${maxSize})`);
    }

    // Check if binary
    if (await this.isBinary(filePath)) {
      throw new Error('Cannot read binary file as text');
    }

    const encoding = options?.encoding || 'utf-8';
    return fs.readFile(filePath, encoding);
  }

  /**
   * Write file contents
   */
  async writeFile(filePath: string, content: string, options?: WriteOptions): Promise<void> {
    this.validatePath(filePath);

    // Create directory if it doesn't exist
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    const encoding = options?.encoding || 'utf-8';
    await fs.writeFile(filePath, content, encoding);

    logger.info(`File written: ${filePath}`);
  }

  /**
   * List directory contents
   */
  async listDirectory(dirPath: string, options?: ListOptions): Promise<FileEntry[]> {
    this.validatePath(dirPath);

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const result: FileEntry[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const stats = await fs.stat(fullPath);

      result.push({
        name: entry.name,
        path: fullPath,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        modified: stats.mtime,
      });

      // Recursive listing
      if (options?.recursive && entry.isDirectory()) {
        const subEntries = await this.listDirectory(fullPath, options);
        result.push(...subEntries);
      }
    }

    return result;
  }

  /**
   * Search files using ripgrep
   */
  async searchFiles(dirPath: string, pattern: string, options?: SearchOptions): Promise<SearchResult[]> {
    this.validatePath(dirPath);

    const args = ['rg', '--json', pattern, dirPath];

    if (options?.fileType) args.push('--type', options.fileType);
    if (options?.ignoreCase) args.push('--ignore-case');
    if (options?.maxCount) args.push('--max-count', options.maxCount.toString());

    const { stdout } = await execAsync(args.join(' '));
    return this.parseRipgrepOutput(stdout);
  }

  /**
   * Generate directory tree
   */
  async generateTree(dirPath: string, options?: TreeOptions): Promise<string> {
    this.validatePath(dirPath);

    const maxDepth = options?.maxDepth || 3;
    return this.buildTree(dirPath, '', 0, maxDepth);
  }

  /**
   * Get file diff
   */
  async diff(file1: string, file2: string): Promise<string> {
    this.validatePath(file1);
    this.validatePath(file2);

    const content1 = await fs.readFile(file1, 'utf-8');
    const content2 = await fs.readFile(file2, 'utf-8');

    return this.computeDiff(content1, content2);
  }

  /**
   * Validate path to prevent traversal attacks
   */
  private validatePath(filePath: string): void {
    const normalized = path.normalize(filePath);

    // Check for path traversal
    if (normalized.includes('..')) {
      throw new Error('Path traversal detected');
    }

    // Check for absolute paths outside allowed directories
    const cwd = process.cwd();
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(cwd)) {
      throw new Error('Path outside working directory');
    }
  }

  /**
   * Check if file is binary
   */
  private async isBinary(filePath: string): Promise<boolean> {
    const buffer = await fs.readFile(filePath);
    const sample = buffer.slice(0, 512);

    // Check for null bytes (indicator of binary content)
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) return true;
    }

    return false;
  }

  /**
   * Build directory tree recursively
   */
  private async buildTree(
    dirPath: string,
    prefix: string,
    depth: number,
    maxDepth: number
  ): Promise<string> {
    if (depth >= maxDepth) return '';

    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let tree = '';

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const isLast = i === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';

      tree += `${prefix}${connector}${entry.name}\n`;

      if (entry.isDirectory()) {
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        const subtree = await this.buildTree(
          path.join(dirPath, entry.name),
          newPrefix,
          depth + 1,
          maxDepth
        );
        tree += subtree;
      }
    }

    return tree;
  }

  /**
   * Parse ripgrep JSON output
   */
  private parseRipgrepOutput(output: string): SearchResult[] {
    const lines = output.split('\n').filter(l => l.length > 0);
    const results: SearchResult[] = [];

    for (const line of lines) {
      const data = JSON.parse(line);
      if (data.type === 'match') {
        results.push({
          file: data.data.path.text,
          line: data.data.line_number,
          column: data.data.submatches[0].start,
          text: data.data.lines.text.trim(),
        });
      }
    }

    return results;
  }

  /**
   * Compute unified diff
   */
  private computeDiff(content1: string, content2: string): string {
    // Simple line-by-line diff
    const lines1 = content1.split('\n');
    const lines2 = content2.split('\n');

    let diff = '';
    const maxLines = Math.max(lines1.length, lines2.length);

    for (let i = 0; i < maxLines; i++) {
      const line1 = lines1[i] || '';
      const line2 = lines2[i] || '';

      if (line1 !== line2) {
        if (line1) diff += `- ${line1}\n`;
        if (line2) diff += `+ ${line2}\n`;
      } else {
        diff += `  ${line1}\n`;
      }
    }

    return diff;
  }
}
```

#### Task 3.2: HTTP Routes

**File**: `services/fs-tools-service/src/routes.ts`

```typescript
import { Elysia } from 'elysia';
import { FileSystemOperations } from './fs/operations';

export function setupRoutes(app: Elysia) {
  const fsOps = new FileSystemOperations();

  // Read file
  app.post('/api/fs/read', async ({ body }) => {
    const { path, options } = body as ReadFileRequest;
    const content = await fsOps.readFile(path, options);
    return { success: true, data: { content } };
  });

  // Write file
  app.post('/api/fs/write', async ({ body }) => {
    const { path, content, options } = body as WriteFileRequest;
    await fsOps.writeFile(path, content, options);
    return { success: true };
  });

  // List directory
  app.post('/api/fs/list', async ({ body }) => {
    const { path, options } = body as ListRequest;
    const entries = await fsOps.listDirectory(path, options);
    return { success: true, data: { entries } };
  });

  // Search files
  app.post('/api/fs/search', async ({ body }) => {
    const { path, pattern, options } = body as SearchRequest;
    const results = await fsOps.searchFiles(path, pattern, options);
    return { success: true, data: { results } };
  });

  // Generate tree
  app.post('/api/fs/tree', async ({ body }) => {
    const { path, options } = body as TreeRequest;
    const tree = await fsOps.generateTree(path, options);
    return { success: true, data: { tree } };
  });

  // Diff files
  app.post('/api/fs/diff', async ({ body }) => {
    const { file1, file2 } = body as DiffRequest;
    const diff = await fsOps.diff(file1, file2);
    return { success: true, data: { diff } };
  });

  // Health check
  app.get('/health', () => ({ status: 'healthy', service: 'fs-tools' }));
}
```

#### Task 3.3: Tests

**File**: `services/fs-tools-service/src/__tests__/fs-operations.test.ts`

- Test read/write operations with various encodings
- Test directory listing (recursive and non-recursive)
- Test search with ripgrep
- Test tree generation
- Test path traversal protection
- Test file size limits
- Test binary file detection

### Day 5-6: Terraform Tools Service

#### Task 5.1: Terraform Operations

**File**: `services/terraform-tools-service/src/terraform/operations.ts`

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '@nimbus/shared-utils';

const execAsync = promisify(exec);

export class TerraformOperations {
  /**
   * Initialize Terraform workspace
   */
  async init(workspaceDir: string, options?: InitOptions): Promise<void> {
    await this.validateWorkspace(workspaceDir);

    const args = ['init'];
    if (options?.upgrade) args.push('-upgrade');
    if (options?.backend) args.push('-backend-config', options.backend);
    if (options?.reconfigure) args.push('-reconfigure');

    logger.info(`Initializing Terraform workspace: ${workspaceDir}`);

    const { stdout, stderr } = await execAsync(
      `terraform ${args.join(' ')}`,
      { cwd: workspaceDir }
    );

    logger.info(stdout);
    if (stderr) logger.warn(stderr);
  }

  /**
   * Generate execution plan
   */
  async plan(
    workspaceDir: string,
    options?: PlanOptions
  ): Promise<TerraformPlan> {
    await this.validateWorkspace(workspaceDir);

    const args = ['plan', '-json'];
    if (options?.varFile) args.push('-var-file', options.varFile);
    if (options?.out) args.push('-out', options.out);
    if (options?.destroy) args.push('-destroy');

    logger.info(`Generating Terraform plan: ${workspaceDir}`);

    const { stdout } = await execAsync(
      `terraform ${args.join(' ')}`,
      { cwd: workspaceDir }
    );

    return this.parsePlanOutput(stdout);
  }

  /**
   * Apply Terraform changes
   */
  async apply(
    workspaceDir: string,
    options?: ApplyOptions
  ): Promise<TerraformApplyResult> {
    await this.validateWorkspace(workspaceDir);

    // Backup state before apply
    await this.backupState(workspaceDir);

    const args = ['apply'];
    if (options?.autoApprove) args.push('-auto-approve');
    if (options?.varFile) args.push('-var-file', options.varFile);
    if (options?.planFile) {
      args.push(options.planFile);
    }

    logger.info(`Applying Terraform changes: ${workspaceDir}`);

    const { stdout, stderr } = await execAsync(
      `terraform ${args.join(' ')}`,
      { cwd: workspaceDir }
    );

    logger.info(stdout);
    if (stderr) logger.warn(stderr);

    return {
      success: true,
      resources: this.parseApplyOutput(stdout),
    };
  }

  /**
   * Destroy Terraform-managed infrastructure
   */
  async destroy(
    workspaceDir: string,
    options?: DestroyOptions
  ): Promise<void> {
    await this.validateWorkspace(workspaceDir);

    // Backup state before destroy
    await this.backupState(workspaceDir);

    const args = ['destroy'];
    if (options?.autoApprove) args.push('-auto-approve');
    if (options?.varFile) args.push('-var-file', options.varFile);

    logger.warn(`Destroying Terraform infrastructure: ${workspaceDir}`);

    const { stdout, stderr } = await execAsync(
      `terraform ${args.join(' ')}`,
      { cwd: workspaceDir }
    );

    logger.info(stdout);
    if (stderr) logger.warn(stderr);
  }

  /**
   * Get Terraform outputs
   */
  async output(workspaceDir: string): Promise<Record<string, unknown>> {
    await this.validateWorkspace(workspaceDir);

    const { stdout } = await execAsync('terraform output -json', {
      cwd: workspaceDir,
    });

    return JSON.parse(stdout);
  }

  /**
   * Show Terraform state
   */
  async show(workspaceDir: string, options?: ShowOptions): Promise<TerraformState> {
    await this.validateWorkspace(workspaceDir);

    const args = ['show', '-json'];
    if (options?.planFile) args.push(options.planFile);

    const { stdout } = await execAsync(
      `terraform ${args.join(' ')}`,
      { cwd: workspaceDir }
    );

    return JSON.parse(stdout);
  }

  /**
   * Validate Terraform configuration
   */
  async validate(workspaceDir: string): Promise<ValidationResult> {
    await this.validateWorkspace(workspaceDir);

    try {
      const { stdout } = await execAsync('terraform validate -json', {
        cwd: workspaceDir,
      });

      const result = JSON.parse(stdout);
      return {
        valid: result.valid,
        diagnostics: result.diagnostics || [],
      };
    } catch (error: any) {
      return {
        valid: false,
        diagnostics: [{ severity: 'error', summary: error.message }],
      };
    }
  }

  /**
   * Validate workspace has Terraform files
   */
  private async validateWorkspace(workspaceDir: string): Promise<void> {
    const files = await fs.readdir(workspaceDir);
    const hasTerraformFiles = files.some(f => f.endsWith('.tf'));

    if (!hasTerraformFiles) {
      throw new Error(`No Terraform files found in ${workspaceDir}`);
    }
  }

  /**
   * Backup Terraform state
   */
  private async backupState(workspaceDir: string): Promise<void> {
    const statePath = path.join(workspaceDir, 'terraform.tfstate');

    try {
      await fs.access(statePath);
      const backupPath = path.join(
        workspaceDir,
        `terraform.tfstate.backup.${Date.now()}`
      );
      await fs.copyFile(statePath, backupPath);
      logger.info(`State backed up to: ${backupPath}`);
    } catch {
      // No state file exists yet
      logger.debug('No state file to backup');
    }
  }

  /**
   * Parse Terraform plan JSON output
   */
  private parsePlanOutput(output: string): TerraformPlan {
    const lines = output.split('\n').filter(l => l.trim());
    let resourceChanges = { add: 0, change: 0, destroy: 0 };

    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        if (data.type === 'change_summary') {
          resourceChanges = data.changes;
        }
      } catch {
        // Skip non-JSON lines
      }
    }

    return {
      changes: resourceChanges,
      hasChanges: resourceChanges.add + resourceChanges.change + resourceChanges.destroy > 0,
    };
  }

  /**
   * Parse Terraform apply output
   */
  private parseApplyOutput(output: string): AppliedResource[] {
    const resources: AppliedResource[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(/^([a-z]+)\s+([a-z0-9_]+\.[a-z0-9_]+)/);
      if (match) {
        resources.push({
          action: match[1],
          resource: match[2],
        });
      }
    }

    return resources;
  }
}
```

#### Task 5.2: Safety Manager

**File**: `services/terraform-tools-service/src/safety/terraform-safety.ts`

```typescript
export class TerraformSafetyManager {
  /**
   * Check if plan requires approval
   */
  requiresApproval(plan: TerraformPlan): boolean {
    // Require approval if destroying resources
    if (plan.changes.destroy > 0) return true;

    // Require approval for more than 10 changes
    const totalChanges = plan.changes.add + plan.changes.change + plan.changes.destroy;
    if (totalChanges > 10) return true;

    return false;
  }

  /**
   * Validate plan before apply
   */
  async validateBeforeApply(
    workspaceDir: string,
    plan: TerraformPlan
  ): Promise<SafetyCheck> {
    // Check state file exists
    const hasState = await this.hasStateFile(workspaceDir);

    if (!hasState && plan.changes.destroy > 0) {
      return {
        passed: false,
        severity: 'critical',
        message: 'Cannot destroy resources without state file',
        can_proceed: false,
        requires_approval: false,
      };
    }

    // Check for high-risk operations
    if (plan.changes.destroy > 5) {
      return {
        passed: false,
        severity: 'high',
        message: `Planning to destroy ${plan.changes.destroy} resources. Explicit approval required.`,
        can_proceed: false,
        requires_approval: true,
      };
    }

    return {
      passed: true,
      severity: 'low',
      message: 'Plan validated successfully',
      can_proceed: true,
      requires_approval: false,
    };
  }

  /**
   * Check if workspace has state file
   */
  private async hasStateFile(workspaceDir: string): Promise<boolean> {
    try {
      await fs.access(path.join(workspaceDir, 'terraform.tfstate'));
      return true;
    } catch {
      return false;
    }
  }
}
```

#### Task 5.3: HTTP Routes with WebSocket Streaming

**File**: `services/terraform-tools-service/src/routes.ts`

```typescript
import { Elysia } from 'elysia';
import { TerraformOperations } from './terraform/operations';
import { TerraformSafetyManager } from './safety/terraform-safety';

export function setupRoutes(app: Elysia) {
  const tfOps = new TerraformOperations();
  const safetyManager = new TerraformSafetyManager();

  // Initialize workspace
  app.post('/api/terraform/init', async ({ body }) => {
    const { workspaceDir, options } = body as InitRequest;
    await tfOps.init(workspaceDir, options);
    return { success: true };
  });

  // Generate plan
  app.post('/api/terraform/plan', async ({ body }) => {
    const { workspaceDir, options } = body as PlanRequest;
    const plan = await tfOps.plan(workspaceDir, options);

    // Check if approval required
    const requiresApproval = safetyManager.requiresApproval(plan);

    return {
      success: true,
      data: { plan, requiresApproval },
    };
  });

  // Apply changes
  app.post('/api/terraform/apply', async ({ body }) => {
    const { workspaceDir, options, planData } = body as ApplyRequest;

    // Validate before apply
    if (planData) {
      const safetyCheck = await safetyManager.validateBeforeApply(
        workspaceDir,
        planData
      );

      if (!safetyCheck.passed && !options?.forceApply) {
        return {
          success: false,
          error: safetyCheck.message,
          requiresApproval: safetyCheck.requires_approval,
        };
      }
    }

    const result = await tfOps.apply(workspaceDir, options);
    return { success: true, data: result };
  });

  // Destroy infrastructure
  app.post('/api/terraform/destroy', async ({ body }) => {
    const { workspaceDir, options } = body as DestroyRequest;

    // Require explicit confirmation for destroy
    if (!options?.confirmed) {
      return {
        success: false,
        error: 'Destroy operation requires explicit confirmation',
        requiresConfirmation: true,
      };
    }

    await tfOps.destroy(workspaceDir, options);
    return { success: true };
  });

  // Get outputs
  app.post('/api/terraform/output', async ({ body }) => {
    const { workspaceDir } = body as OutputRequest;
    const outputs = await tfOps.output(workspaceDir);
    return { success: true, data: { outputs } };
  });

  // Show state
  app.post('/api/terraform/show', async ({ body }) => {
    const { workspaceDir, options } = body as ShowRequest;
    const state = await tfOps.show(workspaceDir, options);
    return { success: true, data: { state } };
  });

  // Validate configuration
  app.post('/api/terraform/validate', async ({ body }) => {
    const { workspaceDir } = body as ValidateRequest;
    const result = await tfOps.validate(workspaceDir);
    return { success: true, data: result };
  });

  // Health check
  app.get('/health', () => ({ status: 'healthy', service: 'terraform-tools' }));
}
```

#### Task 5.4: WebSocket Streaming

**File**: `services/terraform-tools-service/src/websocket.ts`

```typescript
import { ElysiaWS } from '@elysiajs/websocket';
import { spawn } from 'child_process';

export function setupWebSocket(app: Elysia) {
  app.ws('/ws/terraform/stream', {
    message(ws, message) {
      const { operation, workspaceDir, args } = JSON.parse(message);

      // Spawn terraform process
      const terraform = spawn('terraform', [operation, ...args], {
        cwd: workspaceDir,
      });

      // Stream stdout
      terraform.stdout.on('data', (data) => {
        ws.send(JSON.stringify({
          type: 'stdout',
          data: data.toString(),
        }));
      });

      // Stream stderr
      terraform.stderr.on('data', (data) => {
        ws.send(JSON.stringify({
          type: 'stderr',
          data: data.toString(),
        }));
      });

      // Handle exit
      terraform.on('close', (code) => {
        ws.send(JSON.stringify({
          type: 'exit',
          code,
        }));
      });
    },
  });
}
```

#### Task 5.5: Tests

**File**: `services/terraform-tools-service/src/__tests__/terraform-operations.test.ts`

- Test init with various options
- Test plan generation and parsing
- Test apply with approval checks
- Test destroy with confirmation
- Test output and show operations
- Test validation
- Test state backup functionality
- Test safety checks

### Day 7-8: Kubernetes Tools Service

#### Task 7.1: Kubernetes Operations

**File**: `services/k8s-tools-service/src/k8s/operations.ts`

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '@nimbus/shared-utils';

const execAsync = promisify(exec);

export class KubernetesOperations {
  /**
   * Get Kubernetes resources
   */
  async get(
    resource: string,
    name?: string,
    options?: GetOptions
  ): Promise<K8sResource | K8sResource[]> {
    const args = ['get', resource];
    if (name) args.push(name);
    args.push('-o', 'json');

    if (options?.namespace) {
      args.push('-n', options.namespace);
    } else if (options?.allNamespaces) {
      args.push('--all-namespaces');
    }

    const { stdout } = await execAsync(`kubectl ${args.join(' ')}`);
    const data = JSON.parse(stdout);

    return data.items || data;
  }

  /**
   * Apply Kubernetes manifest
   */
  async apply(manifest: string, options?: ApplyOptions): Promise<ApplyResult> {
    // Write manifest to temp file
    const tempFile = `/tmp/k8s-manifest-${Date.now()}.yaml`;
    await fs.writeFile(tempFile, manifest);

    const args = ['apply', '-f', tempFile];
    if (options?.namespace) args.push('-n', options.namespace);
    if (options?.dryRun) args.push('--dry-run=client');

    logger.info('Applying Kubernetes manifest');

    const { stdout } = await execAsync(`kubectl ${args.join(' ')}`);

    // Clean up temp file
    await fs.unlink(tempFile);

    return this.parseApplyOutput(stdout);
  }

  /**
   * Delete Kubernetes resource
   */
  async delete(
    resource: string,
    name: string,
    options?: DeleteOptions
  ): Promise<void> {
    const args = ['delete', resource, name];
    if (options?.namespace) args.push('-n', options.namespace);
    if (options?.force) args.push('--force');
    if (options?.gracePeriod !== undefined) {
      args.push('--grace-period', options.gracePeriod.toString());
    }

    logger.warn(`Deleting Kubernetes resource: ${resource}/${name}`);

    await execAsync(`kubectl ${args.join(' ')}`);
  }

  /**
   * Get pod logs
   */
  async logs(
    podName: string,
    options?: LogsOptions
  ): Promise<string> {
    const args = ['logs', podName];
    if (options?.namespace) args.push('-n', options.namespace);
    if (options?.container) args.push('-c', options.container);
    if (options?.follow) args.push('-f');
    if (options?.tail) args.push('--tail', options.tail.toString());
    if (options?.previous) args.push('--previous');

    const { stdout } = await execAsync(`kubectl ${args.join(' ')}`);
    return stdout;
  }

  /**
   * Execute command in pod
   */
  async exec(
    podName: string,
    command: string[],
    options?: ExecOptions
  ): Promise<string> {
    const args = ['exec', podName];
    if (options?.namespace) args.push('-n', options.namespace);
    if (options?.container) args.push('-c', options.container);
    if (options?.stdin) args.push('-i');
    if (options?.tty) args.push('-t');

    args.push('--', ...command);

    const { stdout } = await execAsync(`kubectl ${args.join(' ')}`);
    return stdout;
  }

  /**
   * Describe resource
   */
  async describe(
    resource: string,
    name: string,
    options?: DescribeOptions
  ): Promise<string> {
    const args = ['describe', resource, name];
    if (options?.namespace) args.push('-n', options.namespace);

    const { stdout } = await execAsync(`kubectl ${args.join(' ')}`);
    return stdout;
  }

  /**
   * Port forward to pod
   */
  async portForward(
    podName: string,
    localPort: number,
    remotePort: number,
    options?: PortForwardOptions
  ): Promise<ChildProcess> {
    const args = ['port-forward', podName, `${localPort}:${remotePort}`];
    if (options?.namespace) args.push('-n', options.namespace);

    logger.info(`Port forwarding ${localPort} -> ${podName}:${remotePort}`);

    // Return child process for caller to manage
    return spawn('kubectl', args);
  }

  /**
   * Scale deployment
   */
  async scale(
    deployment: string,
    replicas: number,
    options?: ScaleOptions
  ): Promise<void> {
    const args = ['scale', 'deployment', deployment, '--replicas', replicas.toString()];
    if (options?.namespace) args.push('-n', options.namespace);

    logger.info(`Scaling ${deployment} to ${replicas} replicas`);

    await execAsync(`kubectl ${args.join(' ')}`);
  }

  /**
   * Parse kubectl apply output
   */
  private parseApplyOutput(output: string): ApplyResult {
    const lines = output.split('\n').filter(l => l.length > 0);
    const resources: AppliedResource[] = [];

    for (const line of lines) {
      const match = line.match(/^([a-z]+\/[a-z0-9-]+)\s+(created|configured|unchanged)/);
      if (match) {
        resources.push({
          resource: match[1],
          action: match[2],
        });
      }
    }

    return { resources };
  }
}
```

#### Task 7.2: Safety Manager

**File**: `services/k8s-tools-service/src/safety/k8s-safety.ts`

```typescript
export class KubernetesSafetyManager {
  private readonly protectedNamespaces = [
    'kube-system',
    'kube-public',
    'kube-node-lease',
    'default',
  ];

  /**
   * Validate namespace access
   */
  validateNamespace(namespace: string, operation: string): SafetyCheck {
    if (this.protectedNamespaces.includes(namespace)) {
      if (['delete', 'apply'].includes(operation)) {
        return {
          passed: false,
          severity: 'critical',
          message: `Operation "${operation}" on protected namespace "${namespace}" requires confirmation`,
          can_proceed: false,
          requires_approval: true,
        };
      }
    }

    return {
      passed: true,
      severity: 'low',
      message: 'Namespace validated',
      can_proceed: true,
      requires_approval: false,
    };
  }

  /**
   * Validate kubectl context
   */
  async validateContext(): Promise<SafetyCheck> {
    try {
      const { stdout } = await execAsync('kubectl config current-context');
      const context = stdout.trim();

      // Check for production context
      if (context.includes('prod') || context.includes('production')) {
        return {
          passed: false,
          severity: 'high',
          message: `Current context is production: "${context}". Explicit approval required.`,
          can_proceed: false,
          requires_approval: true,
        };
      }

      return {
        passed: true,
        severity: 'low',
        message: `Context validated: ${context}`,
        can_proceed: true,
        requires_approval: false,
      };
    } catch (error: any) {
      return {
        passed: false,
        severity: 'critical',
        message: `Failed to get kubectl context: ${error.message}`,
        can_proceed: false,
        requires_approval: false,
      };
    }
  }

  /**
   * Check if operation is destructive
   */
  isDestructive(operation: string): boolean {
    return ['delete', 'drain', 'cordon'].includes(operation);
  }
}
```

#### Task 7.3: HTTP Routes

**File**: `services/k8s-tools-service/src/routes.ts`

```typescript
import { Elysia } from 'elysia';
import { KubernetesOperations } from './k8s/operations';
import { KubernetesSafetyManager } from './safety/k8s-safety';

export function setupRoutes(app: Elysia) {
  const k8sOps = new KubernetesOperations();
  const safetyManager = new KubernetesSafetyManager();

  // Get resources
  app.post('/api/k8s/get', async ({ body }) => {
    const { resource, name, options } = body as GetRequest;
    const data = await k8sOps.get(resource, name, options);
    return { success: true, data };
  });

  // Apply manifest
  app.post('/api/k8s/apply', async ({ body }) => {
    const { manifest, options } = body as ApplyRequest;

    // Validate namespace
    if (options?.namespace) {
      const safetyCheck = safetyManager.validateNamespace(options.namespace, 'apply');
      if (!safetyCheck.passed && !options.forceApply) {
        return {
          success: false,
          error: safetyCheck.message,
          requiresApproval: safetyCheck.requires_approval,
        };
      }
    }

    const result = await k8sOps.apply(manifest, options);
    return { success: true, data: result };
  });

  // Delete resource
  app.post('/api/k8s/delete', async ({ body }) => {
    const { resource, name, options } = body as DeleteRequest;

    // Validate namespace
    if (options?.namespace) {
      const safetyCheck = safetyManager.validateNamespace(options.namespace, 'delete');
      if (!safetyCheck.passed && !options.confirmed) {
        return {
          success: false,
          error: safetyCheck.message,
          requiresConfirmation: true,
        };
      }
    }

    // Validate context for destructive operations
    const contextCheck = await safetyManager.validateContext();
    if (!contextCheck.passed && !options.confirmed) {
      return {
        success: false,
        error: contextCheck.message,
        requiresConfirmation: true,
      };
    }

    await k8sOps.delete(resource, name, options);
    return { success: true };
  });

  // Get logs
  app.post('/api/k8s/logs', async ({ body }) => {
    const { podName, options } = body as LogsRequest;
    const logs = await k8sOps.logs(podName, options);
    return { success: true, data: { logs } };
  });

  // Exec command
  app.post('/api/k8s/exec', async ({ body }) => {
    const { podName, command, options } = body as ExecRequest;
    const output = await k8sOps.exec(podName, command, options);
    return { success: true, data: { output } };
  });

  // Describe resource
  app.post('/api/k8s/describe', async ({ body }) => {
    const { resource, name, options } = body as DescribeRequest;
    const description = await k8sOps.describe(resource, name, options);
    return { success: true, data: { description } };
  });

  // Scale deployment
  app.post('/api/k8s/scale', async ({ body }) => {
    const { deployment, replicas, options } = body as ScaleRequest;
    await k8sOps.scale(deployment, replicas, options);
    return { success: true };
  });

  // Health check
  app.get('/health', () => ({ status: 'healthy', service: 'k8s-tools' }));
}
```

#### Task 7.4: WebSocket for Streaming Logs

**File**: `services/k8s-tools-service/src/websocket.ts`

```typescript
export function setupWebSocket(app: Elysia) {
  app.ws('/ws/k8s/logs', {
    message(ws, message) {
      const { podName, namespace, container, follow } = JSON.parse(message);

      const args = ['logs', podName];
      if (namespace) args.push('-n', namespace);
      if (container) args.push('-c', container);
      if (follow) args.push('-f');

      const kubectl = spawn('kubectl', args);

      kubectl.stdout.on('data', (data) => {
        ws.send(JSON.stringify({
          type: 'log',
          data: data.toString(),
        }));
      });

      kubectl.stderr.on('data', (data) => {
        ws.send(JSON.stringify({
          type: 'error',
          data: data.toString(),
        }));
      });

      kubectl.on('close', (code) => {
        ws.send(JSON.stringify({
          type: 'close',
          code,
        }));
      });
    },
  });
}
```

#### Task 7.5: Tests

**File**: `services/k8s-tools-service/src/__tests__/k8s-operations.test.ts`

- Test get operations for various resources
- Test apply with manifests
- Test delete with safety checks
- Test logs streaming
- Test exec commands
- Test namespace validation
- Test context validation
- Test scaling operations

### Day 9-10: Testing & Documentation

#### Task 9.1: Integration Tests

**File**: `tests/integration/mcp-tools.test.ts`

```typescript
describe('MCP Tools Integration', () => {
  describe('Git Tools Service', () => {
    it('should clone, commit, and push to repository', async () => {
      // Test full git workflow
    });
  });

  describe('File System Tools Service', () => {
    it('should read, write, and search files', async () => {
      // Test full file operations workflow
    });
  });

  describe('Terraform Tools Service', () => {
    it('should init, plan, and apply infrastructure', async () => {
      // Test full terraform workflow
    });
  });

  describe('Kubernetes Tools Service', () => {
    it('should get, apply, and delete resources', async () => {
      // Test full kubernetes workflow
    });
  });
});
```

#### Task 9.2: Service Health Checks

- Verify all services start successfully
- Test health endpoints for all services
- Test inter-service communication

#### Task 9.3: Update Documentation

**Files to Create/Update**:
- `services/git-tools-service/README.md` - API documentation and examples
- `services/fs-tools-service/README.md` - API documentation and examples
- `services/terraform-tools-service/README.md` - API documentation and examples
- `services/k8s-tools-service/README.md` - API documentation and examples
- Update `WORKSPACE_SETUP_PLAN.md` with Week 5-6 completion status
- Update this plan document with completion status

---

## Acceptance Criteria

### Git Tools Service

- [x] Clone, status, add, commit, push, pull operations implemented
- [x] Branch operations (create, list, checkout, delete) working
- [x] Diff, log operations functional
- [x] Safety checks for destructive operations
- [x] Credential validation
- [x] All HTTP routes responding correctly
- [x] Health endpoint returns correct status

### File System Tools Service

- [x] Read, write, list operations implemented
- [x] Search with ripgrep working
- [x] Directory tree generation functional
- [x] File diff operational
- [x] Path traversal protection in place
- [x] File size limits enforced
- [x] Binary file detection working
- [x] All HTTP routes responding correctly
- [x] Health endpoint returns correct status

### Terraform Tools Service

- [x] Init, plan, apply, destroy operations implemented
- [x] Output, show, validate operations working
- [x] State backup before apply/destroy
- [x] Safety checks for destructive operations
- [x] Approval required for high-risk changes
- [x] WebSocket streaming for plan/apply output
- [x] All HTTP routes responding correctly
- [x] Health endpoint returns correct status

### Kubernetes Tools Service

- [x] Get, apply, delete operations implemented
- [x] Logs, exec, describe operations working
- [x] Scale operations functional
- [x] Namespace validation in place
- [x] Context validation for production
- [x] Safety checks for destructive operations
- [x] WebSocket streaming for logs
- [x] All HTTP routes responding correctly
- [x] Health endpoint returns correct status

### Integration

- [x] All services start successfully with `bun dev`
- [x] Health checks pass for all services
- [x] Inter-service communication working
- [x] Safety checks properly enforced across all tools
- [x] Error handling consistent across all services

---

## Files to Create/Modify

### Git Tools Service

```
services/git-tools-service/
├── src/
│   ├── git/
│   │   ├── operations.ts          ✨ NEW
│   │   ├── branch.ts              ✨ NEW
│   │   └── index.ts               ✨ NEW
│   ├── safety/
│   │   ├── git-safety.ts          ✨ NEW
│   │   └── index.ts               ✨ NEW
│   ├── types/
│   │   └── git.ts                 ✨ NEW
│   ├── routes.ts                  🔄 MODIFY
│   ├── server.ts                  🔄 MODIFY
│   └── index.ts                   🔄 MODIFY
├── __tests__/
│   ├── git-operations.test.ts     ✨ NEW
│   ├── branch.test.ts             ✨ NEW
│   └── safety.test.ts             ✨ NEW
├── .env.example                   🔄 MODIFY
├── package.json                   🔄 MODIFY
└── README.md                      ✨ NEW
```

### File System Tools Service

```
services/fs-tools-service/
├── src/
│   ├── fs/
│   │   ├── operations.ts          ✨ NEW
│   │   └── index.ts               ✨ NEW
│   ├── types/
│   │   └── fs.ts                  ✨ NEW
│   ├── routes.ts                  🔄 MODIFY
│   ├── server.ts                  🔄 MODIFY
│   └── index.ts                   🔄 MODIFY
├── __tests__/
│   ├── fs-operations.test.ts      ✨ NEW
│   └── safety.test.ts             ✨ NEW
├── .env.example                   🔄 MODIFY
├── package.json                   🔄 MODIFY
└── README.md                      ✨ NEW
```

### Terraform Tools Service

```
services/terraform-tools-service/
├── src/
│   ├── terraform/
│   │   ├── operations.ts          ✨ NEW
│   │   └── index.ts               ✨ NEW
│   ├── safety/
│   │   ├── terraform-safety.ts    ✨ NEW
│   │   └── index.ts               ✨ NEW
│   ├── types/
│   │   └── terraform.ts           ✨ NEW
│   ├── routes.ts                  🔄 MODIFY
│   ├── websocket.ts               ✨ NEW
│   ├── server.ts                  🔄 MODIFY
│   └── index.ts                   🔄 MODIFY
├── __tests__/
│   ├── terraform-operations.test.ts ✨ NEW
│   └── safety.test.ts             ✨ NEW
├── .env.example                   🔄 MODIFY
├── package.json                   🔄 MODIFY
└── README.md                      ✨ NEW
```

### Kubernetes Tools Service

```
services/k8s-tools-service/
├── src/
│   ├── k8s/
│   │   ├── operations.ts          ✨ NEW
│   │   └── index.ts               ✨ NEW
│   ├── safety/
│   │   ├── k8s-safety.ts          ✨ NEW
│   │   └── index.ts               ✨ NEW
│   ├── types/
│   │   └── k8s.ts                 ✨ NEW
│   ├── routes.ts                  🔄 MODIFY
│   ├── websocket.ts               ✨ NEW
│   ├── server.ts                  🔄 MODIFY
│   └── index.ts                   🔄 MODIFY
├── __tests__/
│   ├── k8s-operations.test.ts     ✨ NEW
│   └── safety.test.ts             ✨ NEW
├── .env.example                   🔄 MODIFY
├── package.json                   🔄 MODIFY
└── README.md                      ✨ NEW
```

---

## Environment Variables

### Git Tools Service `.env.example`

```bash
# Git Tools Service Configuration
PORT=3004
LOG_LEVEL=info

# Git Configuration
GIT_DEFAULT_BRANCH=main
GIT_AUTHOR_NAME=Nimbus
GIT_AUTHOR_EMAIL=nimbus@example.com
```

### File System Tools Service `.env.example`

```bash
# File System Tools Service Configuration
PORT=3005
LOG_LEVEL=info

# File System Limits
FS_MAX_FILE_SIZE=10485760  # 10MB
FS_MAX_SEARCH_RESULTS=1000
FS_TREE_MAX_DEPTH=5
```

### Terraform Tools Service `.env.example`

```bash
# Terraform Tools Service Configuration
PORT=3006
WS_PORT=3106
LOG_LEVEL=info

# Terraform Configuration
TERRAFORM_VERSION=1.6.0
TERRAFORM_AUTO_APPROVE=false
TERRAFORM_BACKUP_STATE=true
```

### Kubernetes Tools Service `.env.example`

```bash
# Kubernetes Tools Service Configuration
PORT=3007
WS_PORT=3107
LOG_LEVEL=info

# Kubernetes Configuration
K8S_KUBECONFIG=~/.kube/config
K8S_DEFAULT_NAMESPACE=default
K8S_PROTECTED_NAMESPACES=kube-system,kube-public,default
```

---

## Success Metrics

1. **Git Tools Service**: All git operations functional and safe
2. **File System Tools Service**: All file operations working with proper safety checks
3. **Terraform Tools Service**: Complete terraform workflow operational with streaming
4. **Kubernetes Tools Service**: Full k8s operations with context and namespace safety
5. **Tests**: 80%+ coverage for all services
6. **Health Checks**: All services pass health checks
7. **Integration**: Services communicate correctly with Core Engine
8. **Documentation**: Complete README files with examples

---

## Next Steps After Week 5-6

After completing Week 5-6, we move to:

**Week 7-8: Cloud & Integration Services**
- Helm Tools Service
- AWS Tools Service (AWS CLI operations)
- GitHub Tools Service (PR/Issue operations)
- Full integration testing with Core Engine

**Week 9-12: CLI Service & Final Integration**
- Terminal UI with Ink
- Commands (chat, generate, apply, etc.)
- End-to-end user flows
- Production readiness

---

**Status**: 📋 Ready for Implementation
**Next**: Begin Day 1-2 tasks (Git Tools Service)
