# MCP Tools Team - Git & File System Tools Specification

> **Team**: MCP Tools Team
> **Phase**: MVP (Months 1-3)
> **Dependencies**: Core Engine
> **Priority**: CRITICAL

---

## Overview

This specification covers the Git operations and File System tools that are essential for Nimbus to function as a complete cloud engineering CLI. These tools enable Nimbus to read/write code files, manage Git repositories, and perform basic GitHub operations.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Git & File System Tool Layer                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │    Git      │  │ File System │  │     GitHub Basic        │ │
│  │   Tools     │  │    Tools    │  │       (MVP)             │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                   Safety Layer                             │ │
│  │  - Path validation                                         │ │
│  │  - Destructive operation warnings                          │ │
│  │  - Credential protection                                   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 1: File System Tools

### 1.1 file_read

**File**: `packages/mcp-tools/src/filesystem/read.ts`

```typescript
import { z } from 'zod';

const inputSchema = z.object({
  path: z.string().describe('Absolute or relative file path'),
  encoding: z.enum(['utf-8', 'base64', 'binary']).optional().default('utf-8'),
  startLine: z.number().optional().describe('Start reading from line number'),
  endLine: z.number().optional().describe('End reading at line number'),
});

export const fileRead: MCPTool = {
  name: 'file_read',
  description: 'Read contents of a file',
  inputSchema,
  handler: async (input) => {
    const absolutePath = path.resolve(input.path);

    // Security: Prevent reading sensitive files
    if (isSensitivePath(absolutePath)) {
      return {
        success: false,
        output: '',
        error: 'Cannot read sensitive files (credentials, keys, etc.)',
      };
    }

    try {
      let content = await fs.readFile(absolutePath, input.encoding);

      // Handle line range if specified
      if (input.startLine || input.endLine) {
        const lines = content.split('\n');
        const start = (input.startLine || 1) - 1;
        const end = input.endLine || lines.length;
        content = lines.slice(start, end).join('\n');
      }

      return {
        success: true,
        output: content,
        metadata: {
          path: absolutePath,
          size: Buffer.byteLength(content, 'utf-8'),
          lines: content.split('\n').length,
        },
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to read file: ${error.message}`,
      };
    }
  },
};

function isSensitivePath(filePath: string): boolean {
  const sensitivePatterns = [
    /\.env$/,
    /credentials/i,
    /\.pem$/,
    /\.key$/,
    /id_rsa/,
    /id_ed25519/,
    /\.ssh/,
  ];
  return sensitivePatterns.some(pattern => pattern.test(filePath));
}
```

### 1.2 file_write

**File**: `packages/mcp-tools/src/filesystem/write.ts`

```typescript
const inputSchema = z.object({
  path: z.string().describe('File path to write'),
  content: z.string().describe('Content to write'),
  createDirectories: z.boolean().optional().default(true),
  overwrite: z.boolean().optional().default(false),
  append: z.boolean().optional().default(false),
});

export const fileWrite: MCPTool = {
  name: 'file_write',
  description: 'Write content to a file',
  inputSchema,
  handler: async (input) => {
    const absolutePath = path.resolve(input.path);

    // Check if file exists and overwrite is false
    const exists = await fs.access(absolutePath).then(() => true).catch(() => false);
    if (exists && !input.overwrite && !input.append) {
      return {
        success: false,
        output: '',
        error: 'File exists. Use overwrite: true or append: true',
      };
    }

    // Create directories if needed
    if (input.createDirectories) {
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    }

    // Write or append
    if (input.append) {
      await fs.appendFile(absolutePath, input.content);
    } else {
      await fs.writeFile(absolutePath, input.content);
    }

    return {
      success: true,
      output: `File written: ${absolutePath}`,
      metadata: {
        path: absolutePath,
        size: Buffer.byteLength(input.content, 'utf-8'),
        action: input.append ? 'appended' : 'written',
      },
    };
  },
};
```

### 1.3 file_list

**File**: `packages/mcp-tools/src/filesystem/list.ts`

```typescript
const inputSchema = z.object({
  path: z.string().describe('Directory path'),
  recursive: z.boolean().optional().default(false),
  pattern: z.string().optional().describe('Glob pattern to filter'),
  showHidden: z.boolean().optional().default(false),
  includeStats: z.boolean().optional().default(false),
});

export const fileList: MCPTool = {
  name: 'file_list',
  description: 'List files in a directory',
  inputSchema,
  handler: async (input) => {
    const absolutePath = path.resolve(input.path);

    const entries = await listDirectory(absolutePath, {
      recursive: input.recursive,
      pattern: input.pattern,
      showHidden: input.showHidden,
    });

    if (input.includeStats) {
      for (const entry of entries) {
        const stats = await fs.stat(entry.path);
        entry.size = stats.size;
        entry.modified = stats.mtime;
        entry.isDirectory = stats.isDirectory();
      }
    }

    return {
      success: true,
      output: formatFileList(entries),
      metadata: {
        path: absolutePath,
        count: entries.length,
        entries,
      },
    };
  },
};
```

### 1.4 file_search

**File**: `packages/mcp-tools/src/filesystem/search.ts`

```typescript
const inputSchema = z.object({
  path: z.string().describe('Directory to search'),
  pattern: z.string().describe('Search pattern (regex or string)'),
  filePattern: z.string().optional().describe('File glob pattern'),
  caseSensitive: z.boolean().optional().default(false),
  maxResults: z.number().optional().default(100),
  contextLines: z.number().optional().default(2),
});

export const fileSearch: MCPTool = {
  name: 'file_search',
  description: 'Search for patterns in files (like grep)',
  inputSchema,
  handler: async (input) => {
    const results = await searchInFiles(input.path, {
      pattern: input.pattern,
      filePattern: input.filePattern,
      caseSensitive: input.caseSensitive,
      maxResults: input.maxResults,
      contextLines: input.contextLines,
    });

    return {
      success: true,
      output: formatSearchResults(results),
      metadata: {
        matchCount: results.length,
        filesSearched: results.map(r => r.file).filter((v, i, a) => a.indexOf(v) === i).length,
        results,
      },
    };
  },
};
```

### 1.5 file_tree

**File**: `packages/mcp-tools/src/filesystem/tree.ts`

```typescript
const inputSchema = z.object({
  path: z.string().describe('Root directory'),
  depth: z.number().optional().default(3),
  showHidden: z.boolean().optional().default(false),
  showFiles: z.boolean().optional().default(true),
  pattern: z.string().optional().describe('Include only matching files'),
});

export const fileTree: MCPTool = {
  name: 'file_tree',
  description: 'Display directory tree structure',
  inputSchema,
  handler: async (input) => {
    const tree = await buildTree(input.path, {
      depth: input.depth,
      showHidden: input.showHidden,
      showFiles: input.showFiles,
      pattern: input.pattern,
    });

    const output = formatTree(tree);

    return {
      success: true,
      output,
      metadata: {
        root: input.path,
        directories: countDirectories(tree),
        files: countFiles(tree),
      },
    };
  },
};

// Example output:
// my-project/
// ├── src/
// │   ├── index.ts
// │   ├── commands/
// │   │   ├── chat.ts
// │   │   └── generate.ts
// │   └── utils/
// │       └── helpers.ts
// ├── package.json
// └── tsconfig.json
```

### 1.6 file_diff

**File**: `packages/mcp-tools/src/filesystem/diff.ts`

```typescript
const inputSchema = z.object({
  file1: z.string().describe('First file path'),
  file2: z.string().describe('Second file path'),
  context: z.number().optional().default(3),
  ignoreWhitespace: z.boolean().optional().default(false),
});

export const fileDiff: MCPTool = {
  name: 'file_diff',
  description: 'Compare two files and show differences',
  inputSchema,
  handler: async (input) => {
    const content1 = await fs.readFile(input.file1, 'utf-8');
    const content2 = await fs.readFile(input.file2, 'utf-8');

    const diff = createUnifiedDiff(content1, content2, {
      context: input.context,
      ignoreWhitespace: input.ignoreWhitespace,
      file1Label: input.file1,
      file2Label: input.file2,
    });

    return {
      success: true,
      output: diff,
      metadata: {
        file1: input.file1,
        file2: input.file2,
        additions: countAdditions(diff),
        deletions: countDeletions(diff),
        hasDifferences: diff.length > 0,
      },
    };
  },
};
```

---

## Part 2: Git Tools

### 2.1 git_clone

**File**: `packages/mcp-tools/src/git/clone.ts`

```typescript
const inputSchema = z.object({
  url: z.string().describe('Repository URL'),
  path: z.string().optional().describe('Local directory path'),
  branch: z.string().optional().describe('Branch to clone'),
  depth: z.number().optional().describe('Shallow clone depth'),
  recursive: z.boolean().optional().default(true),
});

export const gitClone: MCPTool = {
  name: 'git_clone',
  description: 'Clone a Git repository',
  inputSchema,
  handler: async (input) => {
    const args = ['clone', input.url];

    if (input.path) {
      args.push(input.path);
    }

    if (input.branch) {
      args.push('--branch', input.branch);
    }

    if (input.depth) {
      args.push('--depth', String(input.depth));
    }

    if (input.recursive) {
      args.push('--recursive');
    }

    const result = await runCommand('git', args);

    return {
      success: result.exitCode === 0,
      output: result.stdout || `Cloned ${input.url}`,
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        url: input.url,
        localPath: input.path || path.basename(input.url, '.git'),
        branch: input.branch,
      },
    };
  },
};
```

### 2.2 git_status

**File**: `packages/mcp-tools/src/git/status.ts`

```typescript
const inputSchema = z.object({
  path: z.string().optional().describe('Repository path'),
  short: z.boolean().optional().default(false),
});

export const gitStatus: MCPTool = {
  name: 'git_status',
  description: 'Show working tree status',
  inputSchema,
  handler: async (input) => {
    const args = ['status'];

    if (input.short) {
      args.push('--short');
    }

    args.push('--porcelain=v2', '--branch');

    const result = await runCommand('git', args, input.path);

    if (result.exitCode !== 0) {
      return { success: false, output: '', error: result.stderr };
    }

    const status = parseGitStatus(result.stdout);

    return {
      success: true,
      output: input.short ? result.stdout : formatGitStatus(status),
      metadata: {
        branch: status.branch,
        ahead: status.ahead,
        behind: status.behind,
        staged: status.staged.length,
        modified: status.modified.length,
        untracked: status.untracked.length,
        conflicts: status.conflicts.length,
      },
    };
  },
};

interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: FileChange[];
  modified: FileChange[];
  untracked: string[];
  conflicts: string[];
}

function parseGitStatus(output: string): GitStatus {
  // Parse porcelain v2 format
  const lines = output.split('\n');
  const status: GitStatus = {
    branch: '',
    ahead: 0,
    behind: 0,
    staged: [],
    modified: [],
    untracked: [],
    conflicts: [],
  };

  for (const line of lines) {
    if (line.startsWith('# branch.head')) {
      status.branch = line.split(' ')[2];
    } else if (line.startsWith('# branch.ab')) {
      const match = line.match(/\+(\d+) -(\d+)/);
      if (match) {
        status.ahead = parseInt(match[1]);
        status.behind = parseInt(match[2]);
      }
    } else if (line.startsWith('1') || line.startsWith('2')) {
      const parts = line.split(' ');
      const xy = parts[1];
      const filePath = parts[parts.length - 1];

      if (xy[0] !== '.') {
        status.staged.push({ path: filePath, status: xy[0] });
      }
      if (xy[1] !== '.') {
        status.modified.push({ path: filePath, status: xy[1] });
      }
    } else if (line.startsWith('?')) {
      status.untracked.push(line.substring(2));
    } else if (line.startsWith('u')) {
      status.conflicts.push(line.split(' ').pop()!);
    }
  }

  return status;
}
```

### 2.3 git_add

**File**: `packages/mcp-tools/src/git/add.ts`

```typescript
const inputSchema = z.object({
  files: z.array(z.string()).describe('Files to stage'),
  all: z.boolean().optional().describe('Stage all changes'),
  path: z.string().optional().describe('Repository path'),
});

export const gitAdd: MCPTool = {
  name: 'git_add',
  description: 'Stage files for commit',
  inputSchema,
  handler: async (input) => {
    const args = ['add'];

    if (input.all) {
      args.push('-A');
    } else {
      args.push(...input.files);
    }

    const result = await runCommand('git', args, input.path);

    return {
      success: result.exitCode === 0,
      output: result.exitCode === 0 ? 'Files staged successfully' : '',
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        files: input.all ? ['all'] : input.files,
      },
    };
  },
};
```

### 2.4 git_commit

**File**: `packages/mcp-tools/src/git/commit.ts`

```typescript
const inputSchema = z.object({
  message: z.string().describe('Commit message'),
  body: z.string().optional().describe('Extended commit message'),
  amend: z.boolean().optional().default(false),
  path: z.string().optional(),
});

export const gitCommit: MCPTool = {
  name: 'git_commit',
  description: 'Create a commit',
  inputSchema,
  handler: async (input) => {
    const args = ['commit'];

    if (input.amend) {
      args.push('--amend');
    }

    // Build commit message
    let fullMessage = input.message;
    if (input.body) {
      fullMessage += '\n\n' + input.body;
    }

    args.push('-m', fullMessage);

    const result = await runCommand('git', args, input.path);

    if (result.exitCode !== 0) {
      return { success: false, output: '', error: result.stderr };
    }

    // Extract commit hash
    const commitHash = extractCommitHash(result.stdout);

    return {
      success: true,
      output: result.stdout,
      metadata: {
        commitHash,
        message: input.message,
        amend: input.amend,
      },
    };
  },
};
```

### 2.5 git_push

**File**: `packages/mcp-tools/src/git/push.ts`

```typescript
const inputSchema = z.object({
  remote: z.string().optional().default('origin'),
  branch: z.string().optional(),
  setUpstream: z.boolean().optional().default(false),
  force: z.boolean().optional().default(false),
  forceWithLease: z.boolean().optional().default(false),
  tags: z.boolean().optional().default(false),
  path: z.string().optional(),
});

export const gitPush: MCPTool = {
  name: 'git_push',
  description: 'Push commits to remote repository',
  inputSchema,
  handler: async (input) => {
    const args = ['push'];

    if (input.setUpstream) {
      args.push('-u');
    }

    if (input.forceWithLease) {
      args.push('--force-with-lease');
    } else if (input.force) {
      // Warning: Force push is dangerous
      args.push('--force');
    }

    if (input.tags) {
      args.push('--tags');
    }

    args.push(input.remote);

    if (input.branch) {
      args.push(input.branch);
    }

    const result = await runCommand('git', args, input.path);

    return {
      success: result.exitCode === 0,
      output: result.stdout || result.stderr,
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        remote: input.remote,
        branch: input.branch,
        forced: input.force || input.forceWithLease,
      },
    };
  },
};
```

### 2.6 git_pull

**File**: `packages/mcp-tools/src/git/pull.ts`

```typescript
const inputSchema = z.object({
  remote: z.string().optional().default('origin'),
  branch: z.string().optional(),
  rebase: z.boolean().optional().default(false),
  path: z.string().optional(),
});

export const gitPull: MCPTool = {
  name: 'git_pull',
  description: 'Pull changes from remote repository',
  inputSchema,
  handler: async (input) => {
    const args = ['pull'];

    if (input.rebase) {
      args.push('--rebase');
    }

    args.push(input.remote);

    if (input.branch) {
      args.push(input.branch);
    }

    const result = await runCommand('git', args, input.path);

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        remote: input.remote,
        branch: input.branch,
        rebased: input.rebase,
      },
    };
  },
};
```

### 2.7 git_branch

**File**: `packages/mcp-tools/src/git/branch.ts`

```typescript
const inputSchema = z.object({
  action: z.enum(['list', 'create', 'delete', 'rename']),
  name: z.string().optional().describe('Branch name'),
  newName: z.string().optional().describe('New name for rename'),
  remote: z.boolean().optional().describe('Include remote branches'),
  force: z.boolean().optional().default(false),
  path: z.string().optional(),
});

export const gitBranch: MCPTool = {
  name: 'git_branch',
  description: 'Manage Git branches',
  inputSchema,
  handler: async (input) => {
    const args = ['branch'];

    switch (input.action) {
      case 'list':
        if (input.remote) {
          args.push('-a');
        }
        args.push('-v');
        break;

      case 'create':
        if (!input.name) {
          return { success: false, output: '', error: 'Branch name required' };
        }
        args.push(input.name);
        break;

      case 'delete':
        if (!input.name) {
          return { success: false, output: '', error: 'Branch name required' };
        }
        args.push(input.force ? '-D' : '-d', input.name);
        break;

      case 'rename':
        if (!input.name || !input.newName) {
          return { success: false, output: '', error: 'Both old and new names required' };
        }
        args.push('-m', input.name, input.newName);
        break;
    }

    const result = await runCommand('git', args, input.path);

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        action: input.action,
        branch: input.name,
      },
    };
  },
};
```

### 2.8 git_checkout

**File**: `packages/mcp-tools/src/git/checkout.ts`

```typescript
const inputSchema = z.object({
  target: z.string().describe('Branch, tag, or commit to checkout'),
  create: z.boolean().optional().describe('Create new branch'),
  files: z.array(z.string()).optional().describe('Specific files to checkout'),
  path: z.string().optional(),
});

export const gitCheckout: MCPTool = {
  name: 'git_checkout',
  description: 'Switch branches or restore files',
  inputSchema,
  handler: async (input) => {
    const args = ['checkout'];

    if (input.create) {
      args.push('-b');
    }

    args.push(input.target);

    if (input.files && input.files.length > 0) {
      args.push('--', ...input.files);
    }

    const result = await runCommand('git', args, input.path);

    return {
      success: result.exitCode === 0,
      output: result.stdout || `Switched to ${input.target}`,
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        target: input.target,
        created: input.create,
        files: input.files,
      },
    };
  },
};
```

### 2.9 git_diff

**File**: `packages/mcp-tools/src/git/diff.ts`

```typescript
const inputSchema = z.object({
  staged: z.boolean().optional().describe('Show staged changes'),
  commit1: z.string().optional().describe('First commit'),
  commit2: z.string().optional().describe('Second commit'),
  files: z.array(z.string()).optional().describe('Specific files'),
  stat: z.boolean().optional().describe('Show diffstat only'),
  path: z.string().optional(),
});

export const gitDiff: MCPTool = {
  name: 'git_diff',
  description: 'Show changes between commits, working tree, etc.',
  inputSchema,
  handler: async (input) => {
    const args = ['diff'];

    if (input.staged) {
      args.push('--staged');
    }

    if (input.stat) {
      args.push('--stat');
    }

    if (input.commit1) {
      args.push(input.commit1);
      if (input.commit2) {
        args.push(input.commit2);
      }
    }

    if (input.files && input.files.length > 0) {
      args.push('--', ...input.files);
    }

    const result = await runCommand('git', args, input.path);

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        staged: input.staged,
        hasChanges: result.stdout.length > 0,
      },
    };
  },
};
```

### 2.10 git_log

**File**: `packages/mcp-tools/src/git/log.ts`

```typescript
const inputSchema = z.object({
  count: z.number().optional().default(10),
  oneline: z.boolean().optional().default(false),
  author: z.string().optional(),
  since: z.string().optional().describe('Date (e.g., "2 weeks ago")'),
  until: z.string().optional(),
  grep: z.string().optional().describe('Search commit messages'),
  path: z.string().optional(),
});

export const gitLog: MCPTool = {
  name: 'git_log',
  description: 'Show commit history',
  inputSchema,
  handler: async (input) => {
    const args = ['log', `-${input.count}`];

    if (input.oneline) {
      args.push('--oneline');
    } else {
      args.push('--format=%H|%an|%ae|%ad|%s', '--date=iso');
    }

    if (input.author) {
      args.push('--author', input.author);
    }

    if (input.since) {
      args.push('--since', input.since);
    }

    if (input.until) {
      args.push('--until', input.until);
    }

    if (input.grep) {
      args.push('--grep', input.grep);
    }

    const result = await runCommand('git', args, input.path);

    if (result.exitCode !== 0) {
      return { success: false, output: '', error: result.stderr };
    }

    const commits = input.oneline
      ? result.stdout
      : parseGitLog(result.stdout);

    return {
      success: true,
      output: input.oneline ? result.stdout : formatCommits(commits),
      metadata: {
        commitCount: Array.isArray(commits) ? commits.length : undefined,
        commits: Array.isArray(commits) ? commits : undefined,
      },
    };
  },
};
```

### 2.11 git_merge

**File**: `packages/mcp-tools/src/git/merge.ts`

```typescript
const inputSchema = z.object({
  branch: z.string().describe('Branch to merge'),
  noFf: z.boolean().optional().describe('No fast-forward'),
  squash: z.boolean().optional().describe('Squash commits'),
  message: z.string().optional().describe('Merge commit message'),
  abort: z.boolean().optional().describe('Abort current merge'),
  path: z.string().optional(),
});

export const gitMerge: MCPTool = {
  name: 'git_merge',
  description: 'Merge branches',
  inputSchema,
  handler: async (input) => {
    const args = ['merge'];

    if (input.abort) {
      args.push('--abort');
    } else {
      if (input.noFf) {
        args.push('--no-ff');
      }

      if (input.squash) {
        args.push('--squash');
      }

      if (input.message) {
        args.push('-m', input.message);
      }

      args.push(input.branch);
    }

    const result = await runCommand('git', args, input.path);

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        branch: input.branch,
        aborted: input.abort,
        squashed: input.squash,
      },
    };
  },
};
```

### 2.12 git_stash

**File**: `packages/mcp-tools/src/git/stash.ts`

```typescript
const inputSchema = z.object({
  action: z.enum(['push', 'pop', 'list', 'apply', 'drop', 'clear']),
  message: z.string().optional().describe('Stash message'),
  index: z.number().optional().describe('Stash index'),
  includeUntracked: z.boolean().optional().default(false),
  path: z.string().optional(),
});

export const gitStash: MCPTool = {
  name: 'git_stash',
  description: 'Stash changes',
  inputSchema,
  handler: async (input) => {
    const args = ['stash'];

    switch (input.action) {
      case 'push':
        args.push('push');
        if (input.message) {
          args.push('-m', input.message);
        }
        if (input.includeUntracked) {
          args.push('-u');
        }
        break;

      case 'pop':
        args.push('pop');
        if (input.index !== undefined) {
          args.push(`stash@{${input.index}}`);
        }
        break;

      case 'apply':
        args.push('apply');
        if (input.index !== undefined) {
          args.push(`stash@{${input.index}}`);
        }
        break;

      case 'drop':
        args.push('drop');
        if (input.index !== undefined) {
          args.push(`stash@{${input.index}}`);
        }
        break;

      case 'list':
        args.push('list');
        break;

      case 'clear':
        args.push('clear');
        break;
    }

    const result = await runCommand('git', args, input.path);

    return {
      success: result.exitCode === 0,
      output: result.stdout || 'Stash operation completed',
      error: result.exitCode !== 0 ? result.stderr : undefined,
      metadata: {
        action: input.action,
      },
    };
  },
};
```

---

## Part 3: Basic GitHub Tools (MVP)

### 3.1 github_pr_list

**File**: `packages/mcp-tools/src/github/pr-list.ts`

```typescript
const inputSchema = z.object({
  repo: z.string().optional().describe('Repository (owner/repo)'),
  state: z.enum(['open', 'closed', 'all']).optional().default('open'),
  author: z.string().optional(),
  assignee: z.string().optional(),
  label: z.string().optional(),
  limit: z.number().optional().default(30),
});

export const githubPRList: MCPTool = {
  name: 'github_pr_list',
  description: 'List pull requests',
  inputSchema,
  handler: async (input) => {
    const args = ['pr', 'list', '--json',
      'number,title,state,author,createdAt,updatedAt,labels,reviewDecision,isDraft'];

    if (input.repo) {
      args.push('--repo', input.repo);
    }

    args.push('--state', input.state);

    if (input.author) {
      args.push('--author', input.author);
    }

    if (input.assignee) {
      args.push('--assignee', input.assignee);
    }

    if (input.label) {
      args.push('--label', input.label);
    }

    args.push('--limit', String(input.limit));

    const result = await runCommand('gh', args);

    if (result.exitCode !== 0) {
      return { success: false, output: '', error: result.stderr };
    }

    const prs = JSON.parse(result.stdout);

    return {
      success: true,
      output: formatPRList(prs),
      metadata: {
        count: prs.length,
        prs,
      },
    };
  },
};
```

### 3.2 github_pr_create

**File**: `packages/mcp-tools/src/github/pr-create.ts`

```typescript
const inputSchema = z.object({
  title: z.string().describe('PR title'),
  body: z.string().optional().describe('PR description'),
  base: z.string().optional().default('main'),
  head: z.string().optional().describe('Source branch'),
  draft: z.boolean().optional().default(false),
  reviewers: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
  repo: z.string().optional(),
});

export const githubPRCreate: MCPTool = {
  name: 'github_pr_create',
  description: 'Create a pull request',
  inputSchema,
  handler: async (input) => {
    const args = ['pr', 'create', '--title', input.title];

    if (input.body) {
      args.push('--body', input.body);
    }

    args.push('--base', input.base);

    if (input.head) {
      args.push('--head', input.head);
    }

    if (input.draft) {
      args.push('--draft');
    }

    if (input.reviewers && input.reviewers.length > 0) {
      args.push('--reviewer', input.reviewers.join(','));
    }

    if (input.labels && input.labels.length > 0) {
      args.push('--label', input.labels.join(','));
    }

    if (input.repo) {
      args.push('--repo', input.repo);
    }

    const result = await runCommand('gh', args);

    if (result.exitCode !== 0) {
      return { success: false, output: '', error: result.stderr };
    }

    // Extract PR URL from output
    const prUrl = result.stdout.trim();

    return {
      success: true,
      output: `Created PR: ${prUrl}`,
      metadata: {
        url: prUrl,
        title: input.title,
        base: input.base,
        draft: input.draft,
      },
    };
  },
};
```

### 3.3 github_issue_list

**File**: `packages/mcp-tools/src/github/issue-list.ts`

```typescript
const inputSchema = z.object({
  repo: z.string().optional(),
  state: z.enum(['open', 'closed', 'all']).optional().default('open'),
  assignee: z.string().optional(),
  label: z.string().optional(),
  author: z.string().optional(),
  limit: z.number().optional().default(30),
});

export const githubIssueList: MCPTool = {
  name: 'github_issue_list',
  description: 'List repository issues',
  inputSchema,
  handler: async (input) => {
    const args = ['issue', 'list', '--json',
      'number,title,state,author,createdAt,labels,assignees'];

    if (input.repo) {
      args.push('--repo', input.repo);
    }

    args.push('--state', input.state);

    if (input.assignee) {
      args.push('--assignee', input.assignee);
    }

    if (input.label) {
      args.push('--label', input.label);
    }

    if (input.author) {
      args.push('--author', input.author);
    }

    args.push('--limit', String(input.limit));

    const result = await runCommand('gh', args);

    if (result.exitCode !== 0) {
      return { success: false, output: '', error: result.stderr };
    }

    const issues = JSON.parse(result.stdout);

    return {
      success: true,
      output: formatIssueList(issues),
      metadata: {
        count: issues.length,
        issues,
      },
    };
  },
};
```

### 3.4 github_issue_create

**File**: `packages/mcp-tools/src/github/issue-create.ts`

```typescript
const inputSchema = z.object({
  title: z.string().describe('Issue title'),
  body: z.string().optional().describe('Issue description'),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
  repo: z.string().optional(),
});

export const githubIssueCreate: MCPTool = {
  name: 'github_issue_create',
  description: 'Create a GitHub issue',
  inputSchema,
  handler: async (input) => {
    const args = ['issue', 'create', '--title', input.title];

    if (input.body) {
      args.push('--body', input.body);
    }

    if (input.labels && input.labels.length > 0) {
      args.push('--label', input.labels.join(','));
    }

    if (input.assignees && input.assignees.length > 0) {
      args.push('--assignee', input.assignees.join(','));
    }

    if (input.repo) {
      args.push('--repo', input.repo);
    }

    const result = await runCommand('gh', args);

    if (result.exitCode !== 0) {
      return { success: false, output: '', error: result.stderr };
    }

    const issueUrl = result.stdout.trim();

    return {
      success: true,
      output: `Created issue: ${issueUrl}`,
      metadata: {
        url: issueUrl,
        title: input.title,
      },
    };
  },
};
```

---

## Project Structure

```
packages/mcp-tools/src/
├── filesystem/
│   ├── read.ts
│   ├── write.ts
│   ├── list.ts
│   ├── search.ts
│   ├── tree.ts
│   ├── diff.ts
│   └── index.ts
├── git/
│   ├── clone.ts
│   ├── status.ts
│   ├── add.ts
│   ├── commit.ts
│   ├── push.ts
│   ├── pull.ts
│   ├── branch.ts
│   ├── checkout.ts
│   ├── diff.ts
│   ├── log.ts
│   ├── merge.ts
│   ├── stash.ts
│   ├── fetch.ts
│   ├── remote.ts
│   └── index.ts
├── github/
│   ├── pr-list.ts
│   ├── pr-create.ts
│   ├── issue-list.ts
│   ├── issue-create.ts
│   └── index.ts
└── index.ts
```

---

## User Stories

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-070 | As a user, I want to read files | File contents returned correctly | Sprint 3-4 |
| US-071 | As a user, I want to write files | Files created/updated correctly | Sprint 3-4 |
| US-072 | As a user, I want to search files | Pattern matches returned | Sprint 3-4 |
| US-073 | As a user, I want to see directory tree | Tree structure displayed | Sprint 3-4 |
| US-074 | As a user, I want to clone repositories | Repository cloned locally | Sprint 3-4 |
| US-075 | As a user, I want to commit changes | Commits created correctly | Sprint 3-4 |
| US-076 | As a user, I want to push/pull changes | Sync with remote works | Sprint 5-6 |
| US-077 | As a user, I want to manage branches | Branch operations work | Sprint 5-6 |
| US-078 | As a user, I want to list PRs | PR list returned | Sprint 5-6 |
| US-079 | As a user, I want to create PRs | PRs created via gh CLI | Sprint 5-6 |
| US-080 | As a user, I want to list issues | Issue list returned | Sprint 5-6 |
| US-081 | As a user, I want to create issues | Issues created via gh CLI | Sprint 5-6 |

---

## Sprint Breakdown

### Sprint 3-4 (Weeks 5-8)

| Task | Effort | Deliverable |
|------|--------|-------------|
| File read/write tools | 3 days | file_read, file_write |
| File list/search/tree | 4 days | file_list, file_search, file_tree |
| File diff tool | 2 days | file_diff |
| Git clone/status | 2 days | git_clone, git_status |
| Git add/commit | 2 days | git_add, git_commit |

### Sprint 5-6 (Weeks 9-12)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Git push/pull | 2 days | git_push, git_pull |
| Git branch/checkout | 3 days | git_branch, git_checkout |
| Git diff/log/merge | 3 days | git_diff, git_log, git_merge |
| Git stash/fetch/remote | 2 days | git_stash, git_fetch |
| GitHub PR tools | 3 days | github_pr_list, github_pr_create |
| GitHub Issue tools | 2 days | github_issue_list, github_issue_create |

---

## Acceptance Criteria

- [ ] All file system tools work correctly
- [ ] Sensitive file protection in place
- [ ] All Git commands execute correctly
- [ ] Git status parsing accurate
- [ ] GitHub PR list/create via gh CLI
- [ ] GitHub Issue list/create via gh CLI
- [ ] All tools have proper error handling
- [ ] All tools return structured metadata

---

*Document Version: 1.0*
*Last Updated: January 2026*
